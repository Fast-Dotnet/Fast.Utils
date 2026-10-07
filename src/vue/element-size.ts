import { readonly, shallowRef } from "vue";
import { useResizeObserver } from "./resize-observer";
import type { ShallowRef } from "vue";
import type { ResizeObserverTarget } from "./resize-observer";

/** 元素的二维尺寸 */
export interface ElementSize {
	readonly width: number;
	readonly height: number;
}

/** `useElementSize` 返回的响应式尺寸和停止函数。 */
export interface UseElementSizeReturn {
	readonly width: Readonly<ShallowRef<number>>;
	readonly height: Readonly<ShallowRef<number>>;
	readonly stop: () => void;
}

/**
 * 响应式读取元素 Content Rect 尺寸。
 *
 * @param target - 原生元素、Ref 或 Getter
 * @param initialSize - 收到首次观察结果前的尺寸，默认均为 `0`
 * @param options - 原生元素观察选项
 * @returns 只读宽度、高度和手动停止函数
 */
export function useElementSize(
	target: ResizeObserverTarget,
	initialSize: ElementSize = { height: 0, width: 0 },
	options?: ResizeObserverOptions
): UseElementSizeReturn {
	const width = shallowRef(initialSize.width);
	const height = shallowRef(initialSize.height);
	const stop = useResizeObserver(
		target,
		(entries) => {
			const entry = entries[0];
			if (entry === undefined) return;
			width.value = entry.contentRect.width;
			height.value = entry.contentRect.height;
		},
		options
	);
	return { height: readonly(height), stop, width: readonly(width) };
}
