import { computed, getCurrentScope, readonly, shallowRef, toValue, watch } from "vue";
import { runtimeGlobals } from "../internal/runtime";
import type { MaybeRefOrGetter, ShallowRef } from "vue";

/** 数值过渡选项 */
export interface UseTransitionOptions {
	/** 过渡时长，单位为毫秒；必须是非负有限数。默认 `300`。 */
	duration?: number;
	/** 将 `[0, 1]` 的进度映射为有限插值系数，默认线性；允许超出区间以实现回弹。 */
	transition?: (progress: number) => number;
}

/**
 * 将响应式数值的变化平滑过渡为只读数值。
 *
 * @param source - 有限数值、Ref 或 getter；初值直接显示，不执行入场动画。
 * @param options - 创建时读取的时长与缓动选项
 * @returns 只读数值 Ref；SSR 或缺少动画帧 API 时直接跟随输入。
 * @remarks 浏览器动画必须在 Vue 响应式作用域内创建，停止作用域时自动取消。
 * 新目标从当前显示值继续过渡，首个动画帧开始计时，完成时精确落到目标值。
 * `duration: 0` 直接同步目标。选项不响应后续修改；仅支持单个数值。
 * @throws `Error` 当支持动画帧的环境中不存在 Vue 响应式作用域。
 * @throws `RangeError` 当输入或时长非法；后续非法输入由 Vue watcher 报错，非法缓动结果在动画帧中抛错。
 */
export function useTransition(source: MaybeRefOrGetter<number>, options: UseTransitionOptions = {}): Readonly<ShallowRef<number>> {
	const { duration = 300, transition = (progress: number) => progress } = options;
	if (!Number.isFinite(duration) || duration < 0) throw new RangeError("`duration` 必须是非负有限数。");
	const readSource = () => {
		const value = toValue(source);
		if (!Number.isFinite(value)) throw new RangeError("`source` 必须是有限数值。");
		return value;
	};
	const output = shallowRef(readSource());
	const window = runtimeGlobals.window;
	if (window === undefined || typeof window.requestAnimationFrame !== "function" || typeof window.cancelAnimationFrame !== "function") {
		return computed(readSource);
	}
	if (getCurrentScope() === undefined) throw new Error("`useTransition` 必须在 Vue 响应式作用域内调用。");
	watch(
		readSource,
		(target, _previous, onCleanup) => {
			let frame: number | undefined;
			let active = true;
			onCleanup(() => {
				active = false;
				if (frame !== undefined) window.cancelAnimationFrame(frame);
			});
			if (duration === 0 || output.value === target) {
				output.value = target;
				return;
			}
			const from = output.value;
			let startedAt: number | undefined;
			const tick = (timestamp: number) => {
				frame = undefined;
				if (!active) return;
				startedAt ??= timestamp;
				const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
				const weight = progress === 1 ? 1 : transition(progress);
				const value = progress === 1 ? target : from * (1 - weight) + target * weight;
				if (!Number.isFinite(weight) || !Number.isFinite(value)) throw new RangeError("缓动结果必须是有限数值。");
				if (!active) return;
				output.value = value;
				if (active && progress < 1) frame = window.requestAnimationFrame(tick);
			};
			frame = window.requestAnimationFrame(tick);
		},
		{ flush: "sync" }
	);
	return readonly(output);
}
