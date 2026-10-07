import { getCurrentInstance } from "vue";
import type { VNode } from "vue";

/** `useRender` 需要写入的 Vue 3 内部组件实例字段 */
interface MutableVueComponentInstance {
	render?: () => VNode;
}

/**
 * 在当前 Vue 3 组件实例上安装 TSX 渲染函数。
 * @remarks `setup` 仍可返回状态对象，因此状态能够显示在 Vue Devtools 中。
 * @param render - 当前组件的渲染函数
 * @throws 不在组件 `setup` 调用栈中使用时抛出 `Error`。
 */
export function useRender(render: () => VNode): void {
	const instance = getCurrentInstance();
	if (instance === null) throw new Error("`useRender` must be called inside `setup`.");
	(instance as MutableVueComponentInstance).render = render;
}
