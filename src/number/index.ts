import { runtimeGlobals } from "../internal/runtime";

const byteUnits = ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
const binaryByteUnits = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];

/** {@link formatBytes} 的格式化选项。 */
export interface FormatBytesOptions {
	/** 计量基数。`1000` 生成 SI 单位，`1024` 生成 IEC 单位；默认 `1024`。 */
	base?: 1000 | 1024;
	/** 小数位数，范围 0 至 20；默认 `2`。 */
	decimals?: number;
	/** `Intl.NumberFormat` 使用的语言；默认固定为 `en-US` 以保证输出稳定。 */
	locale?: string | readonly string[];
}

/**
 * 拒绝 NaN，同时允许具体 API 自行决定是否接受 Infinity。
 *
 * @param value - 待校验数值。
 * @param name - 用于错误消息的参数名称。
 * @throws `RangeError` 当值为 NaN。
 */
const assertNotNaN = (value: number, name: string): void => {
	if (Number.isNaN(value)) throw new RangeError(`\`${name}\` 不能是 NaN。`);
};

/**
 * 校验有限数值。
 *
 * @param value - 待校验数值。
 * @param name - 用于错误消息的参数名称。
 * @throws `RangeError` 当值为 NaN 或无穷大。
 */
const assertFinite = (value: number, name: string): void => {
	if (!Number.isFinite(value)) throw new RangeError(`\`${name}\` 必须是有限数。`);
};

/**
 * 使用科学计数法移动十进制位。
 *
 * @remarks 该方式用于 `roundTo`，可减少直接乘除十次幂造成的额外二进制舍入误差。
 * @param value - 原始数值。
 * @param exponent - 十进制移动位数；正数向右移动。
 * @returns 移动后的数值。
 */
const shiftDecimal = (value: number, exponent: number): number => {
	if (Object.is(value, -0)) return -0;
	const [coefficient = "0", currentExponent = "0"] = value.toString().split("e");
	return Number(`${coefficient}e${Number(currentExponent) + exponent}`);
};

/**
 * 把数字限制在闭区间内。
 *
 * @param value - 需要限制的数字。
 * @param minimum - 闭区间下界。
 * @param maximum - 闭区间上界。
 * @returns `minimum <= result <= maximum` 的值。
 * @throws `RangeError` 当参数为 `NaN` 或下界大于上界。
 */
export function clamp(value: number, minimum: number, maximum: number): number {
	assertNotNaN(value, "value");
	assertNotNaN(minimum, "minimum");
	assertNotNaN(maximum, "maximum");
	if (minimum > maximum) throw new RangeError("`minimum` 不能大于 `maximum`。");
	return Math.min(Math.max(value, minimum), maximum);
}

/**
 * 判断数字是否位于指定区间。
 *
 * @param value - 待检查数字。
 * @param minimum - 包含的下界。
 * @param maximum - 上界。
 * @param includeMaximum - 是否包含上界；默认使用半开区间 `[minimum, maximum)`。
 * @returns 数字满足区间边界时返回 `true`。
 * @throws `RangeError` 当参数为 `NaN` 或下界大于上界。
 */
export function inRange(value: number, minimum: number, maximum: number, includeMaximum = false): boolean {
	assertNotNaN(value, "value");
	assertNotNaN(minimum, "minimum");
	assertNotNaN(maximum, "maximum");
	if (minimum > maximum) throw new RangeError("`minimum` 不能大于 `maximum`。");
	return value >= minimum && (includeMaximum ? value <= maximum : value < maximum);
}

/**
 * 按十进制位数四舍五入。
 *
 * @remarks IEEE-754 浮点数仍可能存在不可表示误差；财务金额应使用十进制定点方案。
 * @param value - 有限数字。
 * @param digits - 小数位数；负数表示十位、百位等，范围 -15 至 15。
 * @returns 按 `Math.round` 语义舍入后的数字。
 * @throws `RangeError` 当值非有限或位数超出范围。
 */
export function roundTo(value: number, digits = 0): number {
	assertFinite(value, "value");
	if (!Number.isSafeInteger(digits) || digits < -15 || digits > 15) {
		throw new RangeError("`digits` 必须是 -15 到 15 之间的安全整数。");
	}
	const shifted = shiftDecimal(value, digits);
	// 对已经没有可表示小数的大数，乘以 10^digits 可能溢出；此时舍入不会改变值。
	if (!Number.isFinite(shifted)) return value;
	return shiftDecimal(Math.round(shifted), -digits);
}

/**
 * 对有限数字求和。
 *
 * @param values - 不会被修改的数字数组。
 * @returns 算术和；空数组返回 `0`。
 * @throws `RangeError` 当任一值非有限或累计结果溢出。
 */
export function sum(values: readonly number[]): number {
	let total = 0;
	let compensation = 0;
	values.forEach((value) => {
		assertFinite(value, "value");
		// Kahan 补偿保存上一次浮点加法丢失的低位，减少大量小数累计误差。
		const adjusted = value - compensation;
		const next = total + adjusted;
		if (!Number.isFinite(next)) throw new RangeError("总和超出有限数范围。");
		compensation = next - total - adjusted;
		total = next;
	});
	return total;
}

/**
 * 计算有限数字的算术平均值。
 *
 * @param values - 不会被修改的数字数组。
 * @returns 空数组或只有稀疏空位的数组返回 `undefined`；空位不参与分母。
 * @throws `RangeError` 当任一值非有限。
 */
export function average(values: readonly number[]): number | undefined {
	let count = 0;
	let mean = 0;
	values.forEach((value) => {
		assertFinite(value, "value");
		count += 1;
		// 加权增量形式避免先求和导致 MAX_VALUE + MAX_VALUE 溢出。
		mean = mean * ((count - 1) / count) + value / count;
	});
	return count === 0 ? undefined : mean;
}

/**
 * 在两个数字间做线性插值。
 *
 * @remarks `amount` 不限制在 0 至 1；区间外的值会执行线性外推。
 * @param start - `amount = 0` 时的起点。
 * @param end - `amount = 1` 时的终点。
 * @param amount - 插值或外推比例。
 * @returns 线性计算结果。
 * @throws `RangeError` 当任一参数非有限或结果超出有限数字范围。
 */
export function lerp(start: number, end: number, amount: number): number {
	assertFinite(start, "start");
	assertFinite(end, "end");
	assertFinite(amount, "amount");
	const result = start * (1 - amount) + end * amount;
	if (!Number.isFinite(result)) throw new RangeError("插值结果超出有限数范围。");
	return result;
}

/**
 * 将非负字节数格式化为 SI 或 IEC 单位。
 *
 * @param bytes - 非负有限字节数。
 * @param options - 基数、小数位和语言选项。
 * @returns 例如 `1.5 KiB`。
 * @throws `RangeError` 当字节数为负或非有限、基数不是 1000/1024、小数位非法，或 Locale 无效。
 */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
	assertFinite(bytes, "bytes");
	if (bytes < 0) throw new RangeError("`bytes` 不能为负数。");
	const requestedBase: unknown = options.base ?? 1024;
	if (requestedBase !== 1000 && requestedBase !== 1024) throw new RangeError("`base` 必须是 1000 或 1024。");
	const base = requestedBase;
	const decimals = options.decimals ?? 2;
	if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 20) {
		throw new RangeError("`decimals` 必须是 0 到 20 之间的安全整数。");
	}
	if (bytes === 0) return "0 B";

	const units = base === 1024 ? binaryByteUnits : byteUnits;
	// 小于 1 的合法字节数仍使用 B，不能产生负下标并回退到最大单位。
	const exponent = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1));
	const value = bytes / base ** exponent;
	const formatted = new Intl.NumberFormat(options.locale ?? "en-US", {
		maximumFractionDigits: decimals,
		minimumFractionDigits: 0,
		useGrouping: false,
	}).format(value);
	return `${formatted} ${units[exponent] ?? units.at(-1)}`;
}

/**
 * 在半开区间内生成随机整数。
 *
 * @remarks 优先使用 Web Crypto；平台缺少安全随机能力时回退到 `Math.random()`。
 * @param minimum - 包含的安全整数下界。
 * @param maximumExclusive - 不包含的安全整数上界；区间宽度最大为 2^32。
 * @returns 位于 `[minimum, maximumExclusive)` 的随机整数。
 * @throws 参数非法时抛出 `RangeError`。
 */
export function randomInt(minimum: number, maximumExclusive: number): number {
	if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximumExclusive)) {
		throw new RangeError("`minimum` 和 `maximumExclusive` 必须是安全整数。");
	}
	const range = maximumExclusive - minimum;
	const uint32Range = 0x1_0000_0000;
	if (range <= 0 || range > uint32Range) {
		throw new RangeError("区间不能为空且宽度不能超过 2^32。");
	}
	const crypto = runtimeGlobals.crypto;
	const getRandomValues = crypto?.getRandomValues?.bind(crypto);

	// 只接受可以被区间宽度整除的最大 2^32 前缀，消除取模偏差。
	const limit = Math.floor(uint32Range / range) * range;
	const values = new Uint32Array(1);
	let sample: number;
	do {
		if (getRandomValues !== undefined) getRandomValues(values);
		else values[0] = Math.floor(Math.random() * uint32Range);
		sample = values[0] ?? uint32Range;
	} while (sample >= limit);
	return minimum + (sample % range);
}
