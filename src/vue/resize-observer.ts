import { onScopeDispose, toValue, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";

/** `useResizeObserver` 接受的元素或响应式元素 */
export type ResizeObserverTarget = MaybeRefOrGetter<Element | null | undefined>;

/**
 * 监听元素尺寸变化，并随响应式目标切换和 Vue 作用域销毁自动断开。
 *
 * @param target - 原生元素、Ref 或 Getter
 * @param callback - 原生 ResizeObserver 回调
 * @param options - 原生元素观察选项
 * @returns 可提前断开观察的停止函数；运行时不支持 ResizeObserver 时为空操作。
 */
export function useResizeObserver(target: ResizeObserverTarget, callback: ResizeObserverCallback, options?: ResizeObserverOptions): () => void {
	const stop = watch(
		() => toValue(target),
		(currentTarget, _previousTarget, onCleanup) => {
			if (currentTarget === null || currentTarget === undefined || typeof ResizeObserver === "undefined") return;
			const observer = new ResizeObserver(callback);
			observer.observe(currentTarget, options);
			onCleanup(() => {
				observer.disconnect();
			});
		},
		{ flush: "sync", immediate: true }
	);
	onScopeDispose(stop, true);
	return stop;
}
