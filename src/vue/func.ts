/** 可同步或异步返回结果的函数。 */
export type AwaitableFunction<Arguments extends readonly unknown[], Result> = (...arguments_: Arguments) => Result | PromiseLike<Result>;

/**
 * 统一执行同步或异步函数，异常保持原样向调用方传播。
 *
 * @param function_ - 可选的待执行函数
 * @param arguments_ - 原样传入函数的参数
 * @returns 函数结果；未传函数时返回 `undefined`。
 */
export async function callOptionalFunction<Arguments extends readonly unknown[], Result>(
	function_: AwaitableFunction<Arguments, Result> | null | undefined,
	...arguments_: Arguments
): Promise<Awaited<Result> | undefined> {
	if (function_ === null || function_ === undefined) return undefined;
	return Promise.resolve(function_(...arguments_));
}
