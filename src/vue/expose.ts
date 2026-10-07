/**
 * 同时暴露组件实例能力并返回同一个对象，便于 `setup` 返回状态供 Vue Devtools 查看。
 *
 * @param expose - `setup` 上下文提供的 expose 函数
 * @param exposed - 需要暴露的状态和方法
 * @returns 原始 exposed 对象
 */
export function useExpose<Exposed extends object>(expose: (exposed?: Exposed) => void, exposed: Exposed): Exposed {
	expose(exposed);
	return exposed;
}
