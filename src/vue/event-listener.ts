import { onScopeDispose, toValue, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";

/** `useEventListener` 接受的原生事件目标或响应式事件目标 */
export type EventTargetSource = MaybeRefOrGetter<EventTarget | null | undefined>;

/**
 * 注册原生事件监听器，并在目标变化或 Vue 作用域销毁时自动移除。
 *
 * @param target - 原生事件目标、Ref 或 Getter
 * @param event - 原生事件名称
 * @param listener - 事件回调
 * @param options - 原生事件监听选项
 * @returns 可提前移除监听器的停止函数
 */
export function useEventListener<EventType extends Event = Event>(
	target: EventTargetSource,
	event: string,
	listener: (event: EventType) => void,
	options?: boolean | AddEventListenerOptions
): () => void {
	const eventListener = listener as EventListener;
	const stop = watch(
		() => toValue(target),
		(currentTarget, _previousTarget, onCleanup) => {
			if (currentTarget === null || currentTarget === undefined) return;
			currentTarget.addEventListener(event, eventListener, options);
			onCleanup(() => {
				currentTarget.removeEventListener(event, eventListener, options);
			});
		},
		{ flush: "sync", immediate: true }
	);
	onScopeDispose(stop, true);
	return stop;
}
