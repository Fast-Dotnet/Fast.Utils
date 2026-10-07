/** 统一同步返回值与 PromiseLike 返回值的内部回调签名 */
type AsyncCallback<Arguments extends unknown[], Result> = (...arguments_: Arguments) => Result | PromiseLike<Result>;

/** 记录同一防抖批次中每个调用方独立的 Promise 结算函数 */
interface PromiseWaiter<Result> {
	/**
	 * 使用批次失败原因拒绝当前调用方。
	 * @param reason - `cancel` 提供的原因或共享回调抛出的原始错误。
	 */
	reject: (reason?: unknown) => void;
	/**
	 * 使用共享回调结果完成当前调用方，并采用传入 PromiseLike 的最终状态。
	 * @param value - 当前防抖批次唯一一次回调执行产生的共享结果。
	 */
	resolve: (value: Result | PromiseLike<Result>) => void;
}

// 浏览器和 Node.js 的计时器普遍以有符号 32 位整数保存延迟；更大的值可能被
// 静默截断为约 1 ms，因此公共 API 在进入平台计时器前统一拒绝它。
const maximumTimerDelay = 2_147_483_647;

/** 可接收取消信号的通用选项 */
export interface AbortOptions {
	/** 已取消时立即失败；运行期间取消时停止等待并拒绝 Promise。 */
	signal?: AbortSignal;
}

/** {@link withTimeout} 的行为选项 */
export interface TimeoutOptions extends AbortOptions {
	/** 超时时使用的开发者消息 */
	message?: string;
}

/** 每次重试操作接收的上下文 */
export interface RetryContext {
	/** 从 1 开始的当前尝试次数 */
	attempt: number;
	/** 调用方提供的取消信号 */
	signal?: AbortSignal;
}

/** {@link retry} 的策略选项 */
export interface RetryOptions extends AbortOptions {
	/** 最大尝试次数，包含首次调用；默认 `3`。 */
	attempts?: number;
	/** 首次重试前的等待毫秒数，最大 2,147,483,647；默认 `200`。 */
	delayMs?: number;
	/** 每次失败后的退避倍数，必须不小于 1；默认 `2`。 */
	factor?: number;
	/** 单次等待上限，最大 2,147,483,647；默认 `30_000` 毫秒。 */
	maxDelayMs?: number;
	/**
	 * 决定当前失败后是否继续下一次尝试；默认重试所有尚未到达上限的错误。
	 * @param error - 当前操作抛出或拒绝的原始值
	 * @param context - 当前尝试次数和调用方取消信号
	 * @returns `false` 时立即原样抛出当前错误；支持同步值或 PromiseLike。
	 */
	shouldRetry?: (error: unknown, context: RetryContext) => boolean | PromiseLike<boolean>;
}

/** {@link mapConcurrent} 的执行选项 */
export interface ConcurrentMapOptions {
	/** 已取消时停止调度新任务；已经开始的映射器需要自行响应同一信号。 */
	signal?: AbortSignal;
}

/** Promise 感知的防抖函数 */
export interface DebouncedFunction<Arguments extends unknown[], Result> {
	/**
	 * 调度一次调用；同一等待窗口内的调用共享最后一组参数对应的结果。
	 * @param arguments_ - 传给原始回调的参数；后续调用会覆盖尚未执行批次保存的参数。
	 * @returns 当前批次的独立 Promise，最终与共享回调结果保持相同状态。
	 */
	(...arguments_: Arguments): Promise<Result>;
	/**
	 * 取消尚未执行的批次，并拒绝该批次的所有 Promise。
	 * @param reason - 可选拒绝原因；省略时使用内部取消错误。
	 */
	cancel: (reason?: unknown) => void;
	/**
	 * 立即执行待处理批次，不创建第二次回调执行。
	 * @returns 待处理批次的共享执行 Promise；没有批次时返回 `undefined`。
	 */
	flush: () => Promise<Result> | undefined;
	/** @returns 当前存在尚未开始的批次时返回 `true`；正在执行但没有等待批次时返回 `false`。 */
	pending: () => boolean;
}

/** Promise 感知的前缘节流函数 */
export interface ThrottledFunction<Arguments extends unknown[], Result> {
	/**
	 * 在空闲时立即调用原始回调；执行期和冷却期内的调用共享首次调用的 Promise。
	 * @param arguments_ - 仅窗口内首次调用的参数会传给原始回调。
	 * @returns 当前执行窗口共享的 Promise
	 */
	(...arguments_: Arguments): Promise<Result>;
	/** 提前结束冷却期；已经开始的操作不会被取消，结束前仍禁止并发重入。 */
	cancel: () => void;
	/** @returns 原始回调正在执行或计时器仍处于冷却期时返回 `true`。 */
	pending: () => boolean;
}

/**
 * 创建符合 Web Platform 约定的取消错误。
 *
 * @param signal - 已进入取消状态的信号；其 `reason` 会保存在错误的 `cause` 中。
 * @returns 名称为 `AbortError` 的新错误实例
 */
const createAbortError = (signal: AbortSignal): Error => {
	const error = new Error("The operation was aborted.", { cause: signal.reason });
	error.name = "AbortError";
	return error;
};

/**
 * 在启动异步工作前同步拒绝已经取消的信号。
 *
 * @param signal - 可选取消信号；省略或尚未取消时不执行操作。
 * @throws `Error` 当信号已经取消，错误名称为 `AbortError`。
 */
const throwIfAborted = (signal: AbortSignal | undefined): void => {
	if (signal?.aborted) throw createAbortError(signal);
};

/**
 * 校验宿主计时器可以稳定表示的延迟。
 *
 * @param milliseconds - 待校验的毫秒数
 * @param name - 用于错误消息的参数名称
 * @returns 原始延迟值，便于调用方在校验后直接使用。
 * @throws `RangeError` 当值非有限、为负数或超过 32 位计时器上限。
 */
const assertDelay = (milliseconds: number, name = "milliseconds"): number => {
	if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > maximumTimerDelay) {
		throw new RangeError(`\`${name}\` must be a finite number between 0 and ${maximumTimerDelay}.`);
	}
	return milliseconds;
};

/**
 * 等待指定时间，并支持 `AbortSignal`。
 *
 * @param milliseconds - 0 至 2,147,483,647 的有限毫秒数
 * @param options - 可选取消信号
 * @returns 到期后完成的 Promise
 * @throws 参数非法时同步抛出 `RangeError`；信号已取消时同步抛出 `AbortError`。运行期间取消则拒绝返回的 Promise。
 */
export function sleep(milliseconds: number, options: AbortOptions = {}): Promise<void> {
	const delay = assertDelay(milliseconds);
	const signal = options.signal;
	throwIfAborted(signal);

	return new Promise<void>((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout>;
		/** 取消计时器并使用标准取消错误拒绝等待。 */
		function onAbort() {
			if (signal === undefined) return;
			clearTimeout(timer);
			reject(createAbortError(signal));
		}
		timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, delay);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * 为 Promise 增加等待上限。
 *
 * @remarks 超时或取消只停止等待，不能自动取消底层操作；需要真正取消时应同时把
 * 同一个 `AbortSignal` 传给底层 API。
 * @param promise - 需要等待的 Promise 或 PromiseLike。
 * @param timeoutMs - 0 至 2,147,483,647 的有限等待时间
 * @param options - 取消信号与自定义消息
 * @returns 底层 Promise 的结果
 * @throws 等待时间非法或信号已取消时同步抛错；运行期间的超时、取消及源 Promise 失败通过返回的 Promise 拒绝。
 */
export function withTimeout<Result>(promise: PromiseLike<Result>, timeoutMs: number, options: TimeoutOptions = {}): Promise<Result> {
	const delay = assertDelay(timeoutMs, "timeoutMs");
	const signal = options.signal;
	throwIfAborted(signal);

	return new Promise<Result>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;
		/** 清理竞争结束后不再需要的计时器和监听器。 */
		function cleanup() {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		}
		/**
		 * 只允许 Promise、超时和取消三个竞争来源中的首个结果生效。
		 *
		 * @param action - 首个完成来源的结算动作
		 */
		function settle(action: () => void) {
			if (settled) return;
			settled = true;
			cleanup();
			action();
		}
		/** 使用调用方取消原因结束当前等待。 */
		function onAbort() {
			if (signal === undefined) return;
			settle(() => {
				reject(createAbortError(signal));
			});
		}
		timer = setTimeout(() => {
			settle(() => {
				reject(new Error(options.message ?? `The operation timed out after ${delay} milliseconds.`));
			});
		}, delay);

		signal?.addEventListener("abort", onAbort, { once: true });
		Promise.resolve(promise).then(
			(value) => {
				settle(() => {
					resolve(value);
				});
			},
			(error: unknown) => {
				settle(() => {
					reject(error);
				});
			}
		);
	});
}

/**
 * 使用有上限的指数退避重试操作。
 *
 * @typeParam Result - 操作结果类型
 * @param operation - 每次尝试都会调用的函数；`attempt` 从 1 开始。
 * @param options - 尝试次数、退避和取消策略
 * @returns 首次成功结果
 * @throws 最后一次操作错误、`shouldRetry` 错误或名称为 `AbortError` 的取消错误；策略参数非法时抛出 `RangeError`。
 */
export async function retry<Result>(
	operation: (context: RetryContext) => Result | PromiseLike<Result>,
	options: RetryOptions = {}
): Promise<Awaited<Result>> {
	const attempts = options.attempts ?? 3;
	const initialDelay = assertDelay(options.delayMs ?? 200, "delayMs");
	const maximumDelay = assertDelay(options.maxDelayMs ?? 30_000, "maxDelayMs");
	const factor = options.factor ?? 2;
	if (!Number.isSafeInteger(attempts) || attempts <= 0) throw new RangeError("`attempts` must be a positive safe integer.");
	if (!Number.isFinite(factor) || factor < 1) throw new RangeError("`factor` must be a finite number greater than or equal to 1.");

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		throwIfAborted(options.signal);
		const context: RetryContext = options.signal === undefined ? { attempt } : { attempt, signal: options.signal };
		try {
			return await operation(context);
		} catch (error) {
			if (attempt === attempts || (options.shouldRetry !== undefined && !(await options.shouldRetry(error, context)))) throw error;
			// `0 * Infinity` is `NaN`; a zero initial delay must remain zero even when
			// a very large factor overflows during a later attempt.
			const delay = initialDelay === 0 ? 0 : Math.min(initialDelay * factor ** (attempt - 1), maximumDelay);
			await sleep(delay, options.signal === undefined ? {} : { signal: options.signal });
		}
	}

	throw new Error("Retry attempts ended without a result.");
}

/**
 * 以固定并发度映射数组，并保持结果顺序。
 *
 * @remarks 任一映射失败后不会再调度新项目，但已经开始的映射无法自动取消；映射器
 * 应使用传入的 `signal` 取消底层工作。
 * @param items - 不会被修改的输入数组
 * @param concurrency - 同时运行的最大任务数，必须为正安全整数。
 * @param mapper - 接收项目、索引和取消信号的映射函数
 * @param options - 可选取消信号
 * @returns 与输入长度和顺序一致的结果数组；稀疏空位保持为空位且不会调用映射器。
 * @throws `RangeError` 当 `concurrency` 不是正安全整数；取消时抛出名称为 `AbortError` 的 `Error`。
 */
export async function mapConcurrent<Item, Result>(
	items: readonly Item[],
	concurrency: number,
	mapper: (item: Item, index: number, signal: AbortSignal | undefined) => Result | PromiseLike<Result>,
	options: ConcurrentMapOptions = {}
): Promise<Awaited<Result>[]> {
	if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
		throw new RangeError("`concurrency` must be a positive safe integer.");
	}
	throwIfAborted(options.signal);

	const results = new Array<Awaited<Result>>(items.length);
	let nextIndex = 0;
	let failed = false;
	/**
	 * 从共享游标持续领取映射任务。
	 *
	 * @remarks JavaScript 单线程执行保证“读取索引并递增”不会被另一个 Worker 插入，因此每个索引只会领取一次。
	 * @returns 当前 Worker 没有剩余任务时完成。
	 * @throws 原样传播取消错误或 Mapper 错误，并阻止其他 Worker 领取新任务。
	 */
	const worker = async () => {
		while (!failed) {
			throwIfAborted(options.signal);
			const index = nextIndex;
			if (index >= items.length) return;
			nextIndex += 1;
			if (!(index in items)) continue;
			try {
				results[index] = await mapper(items[index] as Item, index, options.signal);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};

	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, worker));
	return results;
}

/**
 * 创建 Promise 感知的防抖函数。
 *
 * @remarks 同一窗口内的所有调用都会等待最后一组参数对应的执行结果；回调错误会原样
 * 拒绝该批次的全部调用，不会留下永久 pending 的 Promise。
 * @param callback - 同步或异步回调
 * @param delayMs - 0 至 2,147,483,647 的有限等待时间，默认 300 毫秒。
 * @returns 具有取消、立即执行和状态方法的防抖函数
 * @throws `RangeError` 当延迟不在平台计时器支持范围内。
 */
export function debounce<Arguments extends unknown[], Result>(
	callback: AsyncCallback<Arguments, Result>,
	delayMs = 300
): DebouncedFunction<Arguments, Awaited<Result>> {
	const delay = assertDelay(delayMs, "delayMs");
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latestArguments: Arguments | undefined;
	let waiters: PromiseWaiter<Awaited<Result>>[] = [];

	/**
	 * 执行并结算当前防抖批次。
	 *
	 * @returns 最后一组参数对应的回调结果
	 * @throws 没有待处理批次时抛出 `Error`；回调错误会原样传播给批次中的全部调用方。
	 */
	const execute = async (): Promise<Awaited<Result>> => {
		const arguments_ = latestArguments;
		if (arguments_ === undefined) {
			throw new Error("There is no pending debounced invocation.");
		}
		latestArguments = undefined;
		timer = undefined;
		const currentWaiters = waiters;
		waiters = [];
		try {
			const result = await callback(...arguments_);
			currentWaiters.forEach((waiter) => {
				waiter.resolve(result);
			});
			return result;
		} catch (error) {
			currentWaiters.forEach((waiter) => {
				waiter.reject(error);
			});
			throw error;
		}
	};

	/**
	 * 更新批次参数并返回当前调用方专属的等待 Promise。
	 *
	 * @param arguments_ - 本次调用参数；同批次中只有最后一组参数会执行。
	 * @returns 与当前批次共享结果、但可独立结算的 Promise
	 */
	const debounced = (...arguments_: Arguments) => {
		latestArguments = arguments_;
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(() => {
			execute().catch(() => undefined);
		}, delay);
		return new Promise<Awaited<Result>>((resolve, reject) => {
			waiters.push({ reject, resolve });
		});
	};

	debounced.cancel = (reason?: unknown) => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		latestArguments = undefined;
		const error = reason ?? new Error("The debounced invocation was cancelled.");
		waiters.forEach((waiter) => {
			waiter.reject(error);
		});
		waiters = [];
	};
	debounced.flush = () => {
		if (timer === undefined) return undefined;
		clearTimeout(timer);
		return execute();
	};
	debounced.pending = () => timer !== undefined;
	return debounced;
}

/**
 * 创建 Promise 感知的前缘节流函数。
 *
 * @remarks 窗口内的调用共享首次调用结果。若回调执行时间超过窗口，后续调用仍会等待
 * 当前回调，避免异步操作重入；该函数不安排尾缘调用。
 * @param callback - 同步或异步回调
 * @param delayMs - 0 至 2,147,483,647 的有限冷却时间，默认 300 毫秒。
 * @returns 具有取消和状态方法的前缘节流函数
 * @throws `RangeError` 当延迟不在平台计时器支持范围内。
 */
export function throttle<Arguments extends unknown[], Result>(
	callback: AsyncCallback<Arguments, Result>,
	delayMs = 300
): ThrottledFunction<Arguments, Awaited<Result>> {
	const delay = assertDelay(delayMs, "delayMs");
	let timer: ReturnType<typeof setTimeout> | undefined;
	let current: Promise<Awaited<Result>> | undefined;
	let cooling = false;
	let settled = false;

	/**
	 * 尝试释放当前节流窗口。
	 *
	 * @remarks 只有回调和冷却计时器都结束后才清空共享 Promise，避免长回调发生重入。
	 */
	const release = () => {
		if (!cooling && settled) current = undefined;
	};
	/**
	 * 执行前缘调用或复用当前窗口的共享 Promise。
	 *
	 * @param arguments_ - 仅新窗口首个调用会使用的参数。
	 * @returns 当前窗口首次调用的 Promise
	 */
	const throttled = (...arguments_: Arguments) => {
		if (current !== undefined) return current;
		cooling = true;
		settled = false;
		let invocation: Promise<Awaited<Result>>;
		try {
			invocation = Promise.resolve(callback(...arguments_));
		} catch (error) {
			invocation = Promise.reject(error);
		}
		current = invocation;
		invocation.then(
			() => {
				settled = true;
				release();
			},
			() => {
				settled = true;
				release();
			}
		);
		timer = setTimeout(() => {
			timer = undefined;
			cooling = false;
			release();
		}, delay);
		return invocation;
	};

	throttled.cancel = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		cooling = false;
		release();
	};
	throttled.pending = () => current !== undefined;
	return throttled;
}
