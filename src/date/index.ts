/** 可转换为日期的输入；数字始终按 Unix 毫秒时间戳处理。 */
export type DateInput = Date | number | string;

/** {@link formatRelativeTime} 的语言与基准时间选项 */
export interface RelativeTimeOptions {
	/** 显式语言交给 Intl.RelativeTimeFormat；省略时内部输出简体中文。 */
	locale?: string | readonly string[];
	/** 比较基准，默认当前时间 */
	now?: DateInput;
	/** 是否允许“昨天”“明天”等文本；默认 `auto`。 */
	numeric?: Intl.RelativeTimeFormatNumeric;
	/** 输出长度；默认 `long` */
	style?: Intl.RelativeTimeFormatStyle;
}

/**
 * 校验日期算术移动量。
 *
 * @param amount - 待校验的日、月或年移动量
 * @throws `RangeError` 当值不是安全整数。
 */
const assertIntegerAmount = (amount: number): void => {
	if (!Number.isSafeInteger(amount)) throw new RangeError("`amount` must be a safe integer.");
};

/**
 * 转换并克隆有效日期。
 *
 * @remarks 数字不进行秒/毫秒猜测；字符串遵循运行时 `Date` 解析规则，跨平台代码应传带显式时区的完整 ISO 8601。
 * @param value - Date、Unix 毫秒时间戳或运行时可解析字符串
 * @returns 与输入不共享可变状态的新 Date
 * @throws 输入无效时抛出 `TypeError`。
 */
export function toDate(value: DateInput): Date {
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new TypeError("The value is not a valid date.");
	}
	return date;
}

/**
 * 判断输入能否转换为有效日期。
 *
 * @param value - 任意待检查值
 * @returns 仅 Date、数字或字符串且时间戳有限时返回 `true`。
 */
export function isValidDate(value: unknown): value is DateInput {
	if (!(value instanceof Date || typeof value === "number" || typeof value === "string")) return false;
	return Number.isFinite(new Date(value).getTime());
}

/**
 * 返回输入日期所在本地时区日期的 `00:00:00.000`，不修改输入。
 *
 * @param value - 有效日期输入
 * @returns 新建的本地日开始时间
 * @throws 输入无效时抛出 `TypeError`。
 */
export function startOfDay(value: DateInput): Date {
	const date = toDate(value);
	date.setHours(0, 0, 0, 0);
	return toDate(date);
}

/**
 * 返回输入日期所在本地时区日期的 `23:59:59.999`，不修改输入。
 *
 * @param value - 有效日期输入
 * @returns 新建的本地日结束时间
 * @throws 输入无效时抛出 `TypeError`。
 */
export function endOfDay(value: DateInput): Date {
	const date = toDate(value);
	date.setHours(23, 59, 59, 999);
	return toDate(date);
}

/**
 * 按本地日历增加整数天，不修改输入。
 *
 * @param value - 基准日期
 * @param amount - 可为负数的安全整数日数
 * @returns 本地日历运算后的新 Date；夏令时变化可能使实际毫秒差不等于 24 小时。
 * @throws 日期无效时抛出 `TypeError`；数量或结果非法时抛出 `RangeError`。
 */
export function addDays(value: DateInput, amount: number): Date {
	assertIntegerAmount(amount);
	const date = toDate(value);
	date.setDate(date.getDate() + amount);
	return toDate(date);
}

/**
 * 按本地日历增加整数月，并把不存在的日期夹到目标月末。
 *
 * @example 1 月 31 日增加一个月会落在 2 月最后一天。
 * @param value - 基准日期
 * @param amount - 可为负数的安全整数月数
 * @returns 月份运算后的新 Date
 * @throws 日期无效时抛出 `TypeError`；数量或结果非法时抛出 `RangeError`。
 */
export function addMonths(value: DateInput, amount: number): Date {
	assertIntegerAmount(amount);
	const date = toDate(value);
	const originalDay = date.getDate();
	date.setDate(1);
	date.setMonth(date.getMonth() + amount);
	const targetMonthEnd = new Date(date.getTime());
	// 避免 `new Date(year, ...)` 把 0 至 99 年解释为 1900 至 1999 年。
	targetMonthEnd.setMonth(targetMonthEnd.getMonth() + 1, 0);
	const lastDay = targetMonthEnd.getDate();
	date.setDate(Math.min(originalDay, lastDay));
	return toDate(date);
}

/**
 * 按本地日历增加整数年，并沿用 {@link addMonths} 的月末夹取规则。
 *
 * @param value - 基准日期
 * @param amount - 可为负数的安全整数年数
 * @returns 年份运算后的新 Date
 * @throws 日期无效时抛出 `TypeError`；数量或结果非法时抛出 `RangeError`。
 */
export function addYears(value: DateInput, amount: number): Date {
	assertIntegerAmount(amount);
	return addMonths(value, amount * 12);
}

/**
 * 判断两个输入是否属于同一本地日历日。
 *
 * @param left - 第一日期
 * @param right - 第二日期
 * @returns 本地年、月、日均相同时返回 `true`。
 * @throws 任一输入无效时抛出 `TypeError`。
 */
export function isSameDay(left: DateInput, right: DateInput): boolean {
	const first = toDate(left);
	const second = toDate(right);
	return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

/**
 * 判断时间是否晚于基准时间。
 *
 * @param value - 待比较时间
 * @param now - 比较基准，默认调用时的当前时刻
 * @returns `value` 严格晚于基准时返回 `true`。
 * @throws 任一输入无效时抛出 `TypeError`。
 */
export function isFuture(value: DateInput, now: DateInput = Date.now()): boolean {
	return toDate(value).getTime() > toDate(now).getTime();
}

/**
 * 返回指定基准所在本地日历日的完整闭区间。
 *
 * @param value - 日期基准，默认调用时当前日期
 * @returns 新建的本地日开始和结束时间二元组
 * @throws 输入无效时抛出 `TypeError`。
 */
export function getLocalDayBounds(value: DateInput = Date.now()): [start: Date, end: Date] {
	return [startOfDay(value), endOfDay(value)];
}

/**
 * 判断日期是否位于包含首尾的时间区间。
 *
 * @param value - 待检查日期
 * @param start - 包含的起点
 * @param end - 包含的终点
 * @returns 时间戳位于闭区间内时返回 `true`。
 * @throws 无效日期抛出 `TypeError`；首尾反向时抛出 `RangeError`。
 */
export function isWithinInterval(value: DateInput, start: DateInput, end: DateInput): boolean {
	const timestamp = toDate(value).getTime();
	const startTimestamp = toDate(start).getTime();
	const endTimestamp = toDate(end).getTime();
	if (startTimestamp > endTimestamp) throw new RangeError("`start` must not be later than `end`.");
	return timestamp >= startTimestamp && timestamp <= endTimestamp;
}

/**
 * 生成人类可读相对时间；默认中文使用内部实现，显式语言使用 Intl.RelativeTimeFormat。
 *
 * @remarks 秒、分钟、小时、天、周、月和年按固定时长阈值选择；这适合展示，不适合计费或日历运算。
 * @param value - 目标时间
 * @param options - 语言、样式与比较基准
 * @returns 相对时间文本
 * @throws 日期无效时抛出 `TypeError`；Locale 或 Intl 选项非法时抛出 `RangeError`。
 * 显式指定语言且缺少 Intl.RelativeTimeFormat 时抛出 `Error`。
 */
export function formatRelativeTime(value: DateInput, options: RelativeTimeOptions = {}): string {
	const differenceSeconds = (toDate(value).getTime() - toDate(options.now ?? Date.now()).getTime()) / 1000;
	const absolute = Math.abs(differenceSeconds);
	let divisor: number;
	let unit: Intl.RelativeTimeFormatUnit;
	if (absolute < 60) {
		divisor = 1;
		unit = "second";
	} else if (absolute < 3_600) {
		divisor = 60;
		unit = "minute";
	} else if (absolute < 86_400) {
		divisor = 3_600;
		unit = "hour";
	} else if (absolute < 604_800) {
		divisor = 86_400;
		unit = "day";
	} else if (absolute < 2_629_800) {
		divisor = 604_800;
		unit = "week";
	} else if (absolute < 31_557_600) {
		divisor = 2_629_800;
		unit = "month";
	} else {
		divisor = 31_557_600;
		unit = "year";
	}
	const amount = Math.round(differenceSeconds / divisor);
	if (options.locale === undefined) {
		const numeric = options.numeric ?? "auto";
		const style = options.style ?? "long";
		if (numeric !== "auto" && numeric !== "always") throw new RangeError("Relative time numeric must be auto or always.");
		if (style !== "long" && style !== "short" && style !== "narrow") throw new RangeError("Relative time style must be long, short, or narrow.");
		if (numeric === "auto") {
			if (unit === "second" && amount === 0) return "现在";
			if (unit === "day") {
				if (amount === -2) return "前天";
				if (amount === -1) return "昨天";
				if (amount === 1) return "明天";
				if (amount === 2) return "后天";
			}
			if (amount === -1 || amount === 1) {
				if (unit === "week") return amount < 0 ? "上周" : "下周";
				if (unit === "month") return amount < 0 ? "上个月" : "下个月";
				if (unit === "year") return amount < 0 ? "去年" : "明年";
			}
		}
		const labels = { second: style === "long" ? "秒钟" : "秒", minute: "分钟", hour: "小时", day: "天", week: "周", month: "个月", year: "年" };
		const count = String(Math.abs(amount)).replace(/\B(?=(?:\d{3})+(?!\d))/gu, ",");
		return count + labels[unit] + (amount < 0 || Object.is(amount, -0) ? "前" : "后");
	}
	if (typeof Intl === "undefined" || typeof Intl.RelativeTimeFormat !== "function") {
		throw new Error("The current runtime does not support Intl.RelativeTimeFormat.");
	}
	const formatter = new Intl.RelativeTimeFormat(options.locale ?? "zh-CN", {
		numeric: options.numeric ?? "auto",
		style: options.style ?? "long",
	});
	return formatter.format(amount, unit);
}

/** 日期选择器单日期快捷项 */
export interface DateShortcut {
	/** 面向中文日期选择器的显示文本；调用方可直接用于菜单标签。 */
	text: string;
	/**
	 * 计算快捷项对应日期。
	 * @returns 每次调用时基于当前本地时间创建的新 `Date`，调用方可安全修改。
	 */
	value: () => Date;
}

/** 日期选择器范围快捷项 */
export interface DateRangeShortcut {
	/** 面向中文日期范围选择器的显示文本；调用方可直接用于菜单标签。 */
	text: string;
	/**
	 * 计算快捷项对应的本地日期范围。
	 * @returns 每次调用时创建的新元组；起点为 `00:00:00.000`，终点为 `23:59:59.999`。
	 */
	value: () => [start: Date, end: Date];
}

/** 历史快捷项允许移动的本地日历单位 */
type CalendarUnit = "day" | "month" | "year";

/**
 * 移动本地日历字段。
 *
 * @remarks 直接使用 Date Setter，以保留历史快捷项在月底和闰年的溢出语义。
 * @param date - 会被原地修改的日期
 * @param amount - 对目标字段增加的整数
 * @param unit - 要移动的日历字段
 */
const shiftCalendarFieldInPlace = (date: Date, amount: number, unit: CalendarUnit): void => {
	switch (unit) {
		case "day":
			date.setDate(date.getDate() + amount);
			break;
		case "month":
			date.setMonth(date.getMonth() + amount);
			break;
		case "year":
			date.setFullYear(date.getFullYear() + amount);
			break;
	}
};

/**
 * 创建动态单日期快捷项。
 *
 * @param text - 日期选择器显示文本
 * @param amount - 相对当前时间的移动量
 * @param unit - 移动使用的日历单位
 * @returns 每次执行 `value` 都重新读取当前时间的快捷项。
 */
const createDateShortcut = (text: string, amount: number, unit: CalendarUnit): DateShortcut => ({
	text,
	value: () => {
		const date = new Date();
		shiftCalendarFieldInPlace(date, amount, unit);
		date.setHours(0, 0, 0, 0);
		return date;
	},
});

/**
 * 创建动态日期范围快捷项。
 *
 * @param text - 日期选择器显示文本
 * @param amount - 范围边界相对当前时间的移动量
 * @param unit - 移动使用的日历单位
 * @param towardFuture - `true` 移动结束边界，`false` 移动开始边界。
 * @returns 每次求值都覆盖完整本地日边界的范围快捷项。
 */
const createRangeShortcut = (text: string, amount: number, unit: CalendarUnit, towardFuture: boolean): DateRangeShortcut => ({
	text,
	value: (): [Date, Date] => {
		const start = new Date();
		const end = new Date();
		shiftCalendarFieldInPlace(towardFuture ? end : start, towardFuture ? amount : -amount, unit);
		start.setHours(0, 0, 0, 0);
		end.setHours(23, 59, 59, 999);
		return [start, end];
	},
});

/**
 * 把日期转换为固定中文相对时间文本。
 *
 * @remarks 10 位以内数字按 Unix 秒处理，其余数字按毫秒处理；月份与年份按本地日历月差计算。
 * @param value - Date、时间戳、可解析字符串或空值
 * @returns 例如“3分钟前”“半年后”；非法或空输入返回空字符串。
 */
export function formatChineseRelativeTime(value: Date | number | string | null | undefined): string {
	if (value === null || value === undefined) return "";
	let timestamp: number;
	if (typeof value === "string") timestamp = new Date(value).getTime();
	else if (typeof value === "number") timestamp = value.toString().length <= 10 ? value * 1000 : value;
	else timestamp = value.getTime();
	if (!Number.isFinite(timestamp)) return "";

	const minute = 60_000;
	const hour = minute * 60;
	const day = hour * 24;
	const currentTimestamp = Date.now();
	const difference = currentTimestamp - timestamp;
	const minuteDifference = Math.abs(difference) / minute;
	const hourDifference = Math.abs(difference) / hour;
	const dayDifference = Math.abs(difference) / day;
	const currentDate = new Date(currentTimestamp);
	const targetDate = new Date(timestamp);
	const monthDifference = (currentDate.getFullYear() - targetDate.getFullYear()) * 12 + currentDate.getMonth() - targetDate.getMonth();
	const suffix = difference < 0 ? "后" : "前";
	if (Math.abs(monthDifference) >= 12) return `${Math.floor(Math.abs(monthDifference) / 12)}年${suffix}`;
	if (Math.abs(monthDifference) >= 6) return `半年${suffix}`;
	if (Math.abs(monthDifference) >= 1) return `${Math.abs(monthDifference)}月${suffix}`;
	if (dayDifference >= 15) return `半月${suffix}`;
	if (dayDifference >= 7) return `${Math.floor(dayDifference / 7)}周${suffix}`;
	if (dayDifference >= 1) return `${Math.floor(dayDifference)}天${suffix}`;
	if (hourDifference >= 1) return `${Math.floor(hourDifference)}小时${suffix}`;
	if (minuteDifference >= 1) return `${Math.floor(minuteDifference)}分钟${suffix}`;
	return "刚刚";
}

/**
 * 创建从今天到前后一个月日期的完整本地日范围。
 *
 * @param towardFuture - `true` 返回今天至一个月后，默认返回一个月前至今天。
 * @returns 每次调用新建的本地日首尾边界。
 */
export function createOneMonthRangeFromToday(towardFuture = false): [start: Date, end: Date] {
	const start = new Date();
	const end = new Date();
	shiftCalendarFieldInPlace(towardFuture ? end : start, towardFuture ? 1 : -1, "month");
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	return [start, end];
}

/**
 * 判断日期是否晚于调用时的当前时刻。
 *
 * @param time - 待比较日期
 * @returns 时间戳严格晚于 `Date.now()` 时返回 `true`。
 */
export function isDateAfterNow(time: Date): boolean {
	return time.getTime() > Date.now();
}

/**
 * 根据浏览器本地小时返回固定中文问候语。
 *
 * @returns 与当前时段对应的中文欢迎文本
 */
export function getLocalTimeGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 5) return "夜深了，注意身体哦！";
	if (hour < 9) return "早上好！欢迎回来！";
	if (hour < 12) return "上午好！欢迎回来！";
	if (hour < 14) return "中午好！欢迎回来！";
	if (hour < 18) return "下午好！欢迎回来！";
	if (hour < 24) return "晚上好！欢迎回来！";
	return "您好！欢迎回来！";
}

/**
 * 创建面向过去或未来的常用完整日期范围快捷项。
 *
 * @param towardFuture - `true` 创建未来范围，默认创建历史范围。
 * @returns 每次求值都会重新读取当前时间的范围快捷项。
 */
export function createDateRangeShortcuts(towardFuture = false): DateRangeShortcut[] {
	return towardFuture
		? [
				createRangeShortcut("后1天", 1, "day", true),
				createRangeShortcut("后3天", 3, "day", true),
				createRangeShortcut("后1周", 7, "day", true),
				createRangeShortcut("后1月", 1, "month", true),
				createRangeShortcut("后3月", 3, "month", true),
				createRangeShortcut("后6月", 6, "month", true),
				createRangeShortcut("后1年", 1, "year", true),
			]
		: [
				createRangeShortcut("近1天", 1, "day", false),
				createRangeShortcut("近3天", 3, "day", false),
				createRangeShortcut("近1周", 7, "day", false),
				createRangeShortcut("近1月", 1, "month", false),
				createRangeShortcut("近3月", 3, "month", false),
				createRangeShortcut("近6月", 6, "month", false),
				createRangeShortcut("近1年", 1, "year", false),
			];
}

/**
 * 创建面向过去或未来的常用单日期快捷项。
 *
 * @param towardFuture - `true` 创建未来日期，默认创建历史日期。
 * @returns 每次求值都会重新读取当前时间的单日期快捷项。
 */
export function createDateShortcuts(towardFuture = false): DateShortcut[] {
	return towardFuture
		? [
				createDateShortcut("今天", 0, "day"),
				createDateShortcut("明天", 1, "day"),
				createDateShortcut("一周后", 7, "day"),
				createDateShortcut("一月后", 1, "month"),
				createDateShortcut("一年后", 1, "year"),
			]
		: [
				createDateShortcut("今天", 0, "day"),
				createDateShortcut("昨天", -1, "day"),
				createDateShortcut("一周前", -7, "day"),
				createDateShortcut("一月前", -1, "month"),
				createDateShortcut("一年前", -1, "year"),
			];
}

/**
 * 返回今天的本地零点。
 *
 * @returns 新建的 `00:00:00.000` Date
 */
export function getStartOfToday(): Date {
	return startOfDay(new Date());
}
