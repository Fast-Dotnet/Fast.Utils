/** 函数首次调用前的内部状态 */
interface PendingOnceState {
	readonly status: "pending";
}

/** 函数成功返回后的内部状态。 */
interface ReturnedOnceState<Result> {
	readonly status: "returned";
	readonly value: Result;
}

/** 函数同步抛错后的内部状态 */
interface ThrewOnceState {
	readonly error: unknown;
	readonly status: "threw";
}

/** 首次调用尚未返回的内部状态 */
interface RunningOnceState {
	readonly status: "running";
}

type OnceState<Result> = PendingOnceState | RunningOnceState | ReturnedOnceState<Result> | ThrewOnceState;

/**
 * 创建最多执行一次并缓存首次结果的函数。
 *
 * @remarks 首次成功返回后，后续调用返回同一结果；Promise 会保持引用不变。首次同步抛错时缓存错误，后续调用重新抛出同一错误。
 * 包装函数使用首次调用时的参数和 `this`，之后传入的参数不会再次执行原函数。
 * 首次调用尚未返回时同步重入会抛出 `Error`，不会重复执行原函数；该错误如向外传播，会作为首次错误缓存。
 * @param callback - 只允许执行一次的函数
 * @returns 保持原参数与返回类型的包装函数
 * @throws `TypeError` 当 `callback` 不是函数。
 */
export function once<This, Arguments extends unknown[], Result>(
	callback: (this: This, ...arguments_: Arguments) => Result
): (this: This, ...arguments_: Arguments) => Result {
	if (typeof callback !== "function") throw new TypeError("`callback` must be a function.");
	let state: OnceState<Result> = { status: "pending" };
	return function (this: This, ...arguments_: Arguments): Result {
		switch (state.status) {
			case "returned":
				return state.value;
			case "threw":
				throw state.error;
			case "running":
				throw new Error("The `once` callback has not returned and cannot be reentered synchronously.");
			case "pending":
				state = { status: "running" };
				try {
					const value = callback.apply(this, arguments_);
					state = { status: "returned", value };
					return value;
				} catch (error) {
					state = { error, status: "threw" };
					throw error;
				}
		}
	};
}
