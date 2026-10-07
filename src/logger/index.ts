/** 日志严重级别，按从低到高排列 */
export type LogLevel = "debug" | "log" | "warn" | "error";

/** 日志输出目标需要实现的最小控制台接口 */
export interface LoggerSink {
	/**
	 * 接收通过级别过滤后的调试参数。
	 * @param data - 已格式化的品牌、作用域、消息以及保持原始类型的附加值
	 */
	debug: (...data: unknown[]) => void;
	/**
	 * 接收通过级别过滤后的普通日志参数；对应 Logger 的 `log` 级别。
	 * @param data - 已格式化的品牌、作用域、消息以及保持原始类型的附加值
	 */
	log: (...data: unknown[]) => void;
	/**
	 * 接收通过级别过滤后的警告参数。
	 * @param data - 已格式化的品牌、作用域、消息以及保持原始类型的附加值
	 */
	warn: (...data: unknown[]) => void;
	/**
	 * 接收通过级别过滤后的错误参数。
	 * @param data - 已格式化的品牌、作用域、消息以及保持原始类型的附加值
	 */
	error: (...data: unknown[]) => void;
}

/** {@link createLogger} 的不可变配置 */
export interface LoggerOptions {
	/** 最低输出级别，默认 `debug`；低于该优先级的消息不会传给 Sink。 */
	level?: LogLevel;
	/** 日志品牌前缀，默认 `Fast`；必须是无外围空白的非空字符串。 */
	prefix?: string;
	/** 可注入输出目标，默认当前运行时的 `console`；Logger 不会修改该对象。 */
	sink?: LoggerSink;
	/** uni-app App-Plus/HBuilderX 中把附加参数逐条转成单行文本输出，默认 `false`；其他平台忽略。 */
	uniAppPlusSplit?: boolean;
}

/** 配置隔离的轻量日志器 */
export interface Logger {
	/**
	 * 输出指定作用域的调试信息或数据。
	 * @param scope - 模块、组件或业务来源名称
	 * @param content - 可选的消息与附加值；非字符串值保持原始类型。
	 * @throws `TypeError` 或 `RangeError` 当作用域不是无外围空白的非空字符串。
	 */
	debug: (scope: string, ...content: unknown[]) => void;
	/**
	 * 输出指定作用域的普通信息或数据。
	 * @param scope - 模块、组件或业务来源名称
	 * @param content - 可选的消息与附加值；非字符串值保持原始类型。
	 * @throws `TypeError` 或 `RangeError` 当作用域不是无外围空白的非空字符串。
	 */
	log: (scope: string, ...content: unknown[]) => void;
	/**
	 * 输出指定作用域的警告信息或数据。
	 * @param scope - 模块、组件或业务来源名称
	 * @param content - 可选的消息与附加值；非字符串值保持原始类型。
	 * @throws `TypeError` 或 `RangeError` 当作用域不是无外围空白的非空字符串。
	 */
	warn: (scope: string, ...content: unknown[]) => void;
	/**
	 * 输出指定作用域的错误信息或数据。
	 * @param scope - 模块、组件或业务来源名称
	 * @param content - 可选的消息与附加值；非字符串值保持原始类型。
	 * @throws `TypeError` 或 `RangeError` 当作用域不是无外围空白的非空字符串。
	 */
	error: (scope: string, ...content: unknown[]) => void;
}

const levelPriority: Readonly<Record<LogLevel, number>> = {
	debug: 10,
	log: 20,
	warn: 30,
	error: 40,
};

/**
 * 判断未知值是否为受支持日志级别。
 *
 * @param value - 待检查配置值
 * @returns 值是 `debug`、`log`、`warn` 或 `error` 时返回 `true`。
 */
const isLogLevel = (value: unknown): value is LogLevel => typeof value === "string" && Object.prototype.hasOwnProperty.call(levelPriority, value);

/**
 * 检测 uni-app App-Plus 日志环境。
 *
 * @returns 全局 `uni` 与 `plus` 同时存在时返回 `true`。
 */
const isUniAppPlus = (): boolean => {
	return typeof uni !== "undefined" && typeof plus !== "undefined";
};

/**
 * 把日志附加值转换为适合 HBuilderX 单行输出的文本。
 *
 * @remarks 循环引用会替换为 `[Circular]`，BigInt 保留 `n` 后缀，Error 优先输出堆栈。
 * @param value - 任意日志附加值
 * @returns 不会因 JSON 序列化失败而中断日志调用的文本。
 */
const formatSplitValue = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (typeof value === "bigint") return `${value.toString()}n`;
	if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
	const visited = new WeakSet();
	try {
		const serialized = JSON.stringify(
			value,
			(_key, item: unknown) => {
				if (typeof item === "bigint") return `${item.toString()}n`;
				if (typeof item !== "object" || item === null) return item;
				if (visited.has(item)) return "[Circular]";
				visited.add(item);
				return item;
			},
			2
		);
		return typeof serialized === "string" ? serialized : String(value);
	} catch {
		return String(value);
	}
};

const defaultConsoleSink: LoggerSink = {
	debug: (...data) => {
		// eslint-disable-next-line no-console -- 默认日志输出器需要直接调用控制台
		if (typeof console.debug === "function") console.debug(...data);
		// eslint-disable-next-line no-console -- 默认日志输出器需要直接调用控制台
		else console.log(...data);
	},
	log: (...data) => {
		// eslint-disable-next-line no-console -- 默认日志输出器需要直接调用控制台
		console.log(...data);
	},
	warn: (...data) => {
		console.warn(...data);
	},
	error: (...data) => {
		console.error(...data);
	},
};

/**
 * 创建独立日志器。
 *
 * @remarks 本库其他模块不会自动记录、吞掉或转换异常。日志内容可能进入持久化平台，
 * 调用方不得传入密码、令牌、密钥或完整个人数据。
 * @param options - 级别、前缀、输出目标和 uni-app App-Plus 拆分选项
 * @returns 不会修改全局控制台或其他日志器配置的新实例。
 * @throws `RangeError` 当级别未知，或前缀、作用域不是有效的非空字符串。
 */
export function createLogger(options: LoggerOptions = {}): Logger {
	const level: unknown = options.level ?? "debug";
	const prefix: unknown = options.prefix ?? "Fast";
	const sink = options.sink ?? defaultConsoleSink;
	if (!isLogLevel(level)) throw new RangeError(`Unknown log level: ${String(level)}.`);
	if (typeof prefix !== "string" || prefix.length === 0) {
		throw new RangeError("The log prefix must be a nonempty string.");
	}
	const uniAppPlusSplit = options.uniAppPlusSplit ?? false;

	/**
	 * 应用级别过滤、标题格式和平台输出策略。
	 *
	 * @param messageLevel - 本条消息的严重级别
	 * @param scope - 模块、组件或业务来源名称
	 * @param content - 可选的消息与保持原始类型的附加值
	 * @throws `RangeError` 当作用域不是非空字符串或包含外围空白。
	 */
	const write = (messageLevel: LogLevel, scope: string, content: readonly unknown[]) => {
		if (typeof scope !== "string") throw new TypeError("The log scope must be a string.");
		if (scope.length === 0 || scope.trim() !== scope) {
			throw new RangeError("The log scope must be a nonempty string without surrounding whitespace.");
		}
		if (levelPriority[messageLevel] < levelPriority[level]) return;
		const heading = `[${prefix}:${scope}]`;
		const sinkMethod = messageLevel;
		if (uniAppPlusSplit && isUniAppPlus()) {
			const [first, ...remaining] = content;
			if (typeof first === "string") {
				sink[sinkMethod](`${heading} ${first}`);
				for (const item of remaining) sink[sinkMethod](formatSplitValue(item));
			} else {
				sink[sinkMethod](heading);
				for (const item of content) sink[sinkMethod](formatSplitValue(item));
			}
			return;
		}
		sink[sinkMethod](heading, ...content);
	};

	return {
		debug: (scope, ...content) => {
			write("debug", scope, content);
		},
		log: (scope, ...content) => {
			write("log", scope, content);
		},
		warn: (scope, ...content) => {
			write("warn", scope, content);
		},
		error: (scope, ...content) => {
			write("error", scope, content);
		},
	};
}

let activeDefaultLogger = createLogger();

/**
 * 替换默认 {@link logger} 的完整配置。
 *
 * @remarks 已创建的独立 Logger 不受影响；默认 Logger 对象引用保持稳定，并立即转发到新配置。
 * 省略选项会恢复 `createLogger()` 的全部默认值。
 * @param options - 默认 Logger 使用的级别、前缀、输出目标和 uni-app App-Plus 拆分选项。
 */
export function configureLogger(options: LoggerOptions = {}): void {
	activeDefaultLogger = createLogger(options);
}

/** 默认使用 `Fast` 前缀和 `debug` 级别、可通过 {@link configureLogger} 配置的便捷日志器。 */
export const logger: Logger = {
	debug: (scope, ...content) => {
		activeDefaultLogger.debug(scope, ...content);
	},
	log: (scope, ...content) => {
		activeDefaultLogger.log(scope, ...content);
	},
	warn: (scope, ...content) => {
		activeDefaultLogger.warn(scope, ...content);
	},
	error: (scope, ...content) => {
		activeDefaultLogger.error(scope, ...content);
	},
};
