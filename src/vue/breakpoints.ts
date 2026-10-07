import { computed, getCurrentScope, onScopeDispose, readonly, shallowRef } from "vue";
import { useEventListener } from "./event-listener";
import type { ComputedRef, ShallowRef } from "vue";

/** 断点名称与最小视口宽度的映射 */
export type Breakpoints<Key extends string = string> = Readonly<Record<Key, number>>;

/** `useBreakpoints` 返回的断点状态。 */
export type UseBreakpointsReturn<Key extends string> = Readonly<Record<Key, Readonly<ShallowRef<boolean>>>> & {
	/** 返回当前命中的最大断点名称。 */
	active: () => ComputedRef<Key | "">;
};

/**
 * 使用原生 Media Query 创建响应式最小宽度断点。
 *
 * @param breakpoints - 断点名称与非负像素宽度的映射
 * @returns 每个断点的只读状态和当前最大命中断点
 * @throws `Error` 当浏览器环境中不存在可用于自动清理的 Vue 响应式作用域。
 * @throws `TypeError` 当断点使用保留名称 `active`。
 * @throws `RangeError` 当断点宽度不是非负有限数值。
 */
export function useBreakpoints<Key extends string>(breakpoints: Breakpoints<Key>): UseBreakpointsReturn<Key> {
	const entries = Object.entries(breakpoints) as [Key, number][];
	entries.sort((left, right) => left[1] - right[1]);
	for (const [name, minimumWidth] of entries) {
		if (name === "active") throw new TypeError("The breakpoint name must not be the reserved name `active`.");
		if (!Number.isFinite(minimumWidth) || minimumWidth < 0) throw new RangeError(`Breakpoint "${name}" must be a nonnegative finite number.`);
	}
	const states = Object.create(null) as Record<Key, Readonly<ShallowRef<boolean>>>;
	if (typeof window !== "undefined" && getCurrentScope() === undefined) {
		throw new Error("`useBreakpoints` must be called within a Vue reactive scope.");
	}
	for (const [name, minimumWidth] of entries) {
		const state = shallowRef(false);
		if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
			const mediaQuery = window.matchMedia(`(min-width: ${minimumWidth}px)`);
			const update = () => {
				state.value = mediaQuery.matches;
			};
			update();
			if (typeof mediaQuery.addEventListener === "function") {
				useEventListener(mediaQuery, "change", update);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- 兼容旧 WebView 的 MediaQueryList
				mediaQuery.addListener(update);
				onScopeDispose(() => {
					// eslint-disable-next-line @typescript-eslint/no-deprecated -- 与旧式监听配对清理
					mediaQuery.removeListener(update);
				});
			}
		}
		states[name] = readonly(state);
	}
	const active = computed<Key | "">(() => {
		let current: Key | "" = "";
		for (const [name] of entries) {
			if (states[name].value) current = name;
		}
		return current;
	});
	return Object.assign(states, { active: () => active });
}
