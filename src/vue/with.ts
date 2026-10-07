/**
 * 保留传入值并显式指定其 TypeScript 类型。
 *
 * @remarks 未传值时运行时结果为 `undefined`，仅适合为 reactive 对象的初始字段提供类型。
 * @param data - 可选的原始值
 * @returns 传入值本身；省略时返回类型化的 `undefined`。
 */
export function withDefineType<Value>(data?: Value): Value {
	return data as Value;
}
