/** 0 至 255 范围的 RGB 颜色 */
export interface RgbColor {
	/** 蓝色通道；必须是闭区间 `[0, 255]` 内的有限数，格式化时舍入到整数。 */
	blue: number;
	/** 绿色通道；必须是闭区间 `[0, 255]` 内的有限数，格式化时舍入到整数。 */
	green: number;
	/** 红色通道；必须是闭区间 `[0, 255]` 内的有限数，格式化时舍入到整数。 */
	red: number;
}

/** 带 0 至 1 Alpha 通道的 RGB 颜色 */
export interface RgbaColor extends RgbColor {
	/** 不透明度；必须是闭区间 `[0, 1]` 内的有限数，`0` 完全透明，`1` 完全不透明。 */
	alpha: number;
}

/**
 * 校验 RGB 颜色通道。
 *
 * @param value - 待校验通道值
 * @param channel - 用于错误消息的通道名称
 * @throws `RangeError` 当值非有限或超出 0 至 255。
 */
const assertRgbChannel = (value: number, channel: string): void => {
	if (!Number.isFinite(value) || value < 0 || value > 255) {
		throw new RangeError(`\`${channel}\` must be a finite number between 0 and 255.`);
	}
};

/**
 * 校验透明度通道。
 *
 * @param value - 待校验 Alpha 值
 * @throws `RangeError` 当值非有限或超出闭区间 `[0, 1]`。
 */
const assertAlpha = (value: number): void => {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError("`alpha` must be a finite number between 0 and 1.");
	}
};

/**
 * 规范化十六进制颜色文本。
 *
 * @param value - 可带 `#` 的 3、4、6 或 8 位颜色文本
 * @returns 不带 `#` 的 6 或 8 位文本
 * @throws `TypeError` 当长度或字符不符合十六进制颜色格式。
 */
const normalizeHexColor = (value: string): string => {
	const normalized = value.startsWith("#") ? value.slice(1) : value;
	if (![3, 4, 6, 8].includes(normalized.length) || !/^[\dA-F]+$/iu.test(normalized)) {
		throw new TypeError("A hex color must contain 3, 4, 6, or 8 hexadecimal digits.");
	}
	return normalized.length <= 4 ? Array.from(normalized, (character) => `${character}${character}`).join("") : normalized;
};

/**
 * 格式化单个颜色通道。
 *
 * @param value - 已校验的 0 至 255 通道值
 * @returns 舍入后的两位小写十六进制文本
 */
const formatHexChannel = (value: number): string => Math.round(value).toString(16).padStart(2, "0");

/**
 * 解析可带可不带 `#` 的 `rgb`、`rgba`、`rrggbb` 或 `rrggbbaa`。
 *
 * @param value - 十六进制颜色文本
 * @returns 标准化的 RGBA 对象；省略 Alpha 时为 1。
 * @throws 输入非法时抛出 `TypeError`。
 */
export function parseHexColor(value: string): RgbaColor {
	const normalized = normalizeHexColor(value);
	return {
		red: Number.parseInt(normalized.slice(0, 2), 16),
		green: Number.parseInt(normalized.slice(2, 4), 16),
		blue: Number.parseInt(normalized.slice(4, 6), 16),
		alpha: normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1,
	};
}

/**
 * 把 RGB 或 RGBA 对象格式化为小写十六进制颜色。
 *
 * @param color - 颜色通道；RGB 会四舍五入到最近整数。
 * @param includeAlpha - 是否输出 Alpha；默认只在传入 Alpha 且小于 1 时输出。
 * @returns 小写 `#rrggbb` 或 `#rrggbbaa` 文本
 * @throws 通道或 Alpha 非法时抛出 `RangeError`。
 */
export function formatHexColor(color: RgbColor | RgbaColor, includeAlpha: boolean = "alpha" in color && color.alpha < 1): string {
	assertRgbChannel(color.red, "red");
	assertRgbChannel(color.green, "green");
	assertRgbChannel(color.blue, "blue");
	const alpha = "alpha" in color ? color.alpha : 1;
	assertAlpha(alpha);
	const rgb = `${formatHexChannel(color.red)}${formatHexChannel(color.green)}${formatHexChannel(color.blue)}`;
	return `#${rgb}${includeAlpha ? formatHexChannel(alpha * 255) : ""}`;
}

/**
 * 线性混合两种十六进制颜色，包括 Alpha 通道。
 *
 * @param first - `amount = 0` 时的颜色
 * @param second - `amount = 1` 时的颜色
 * @param amount - 0 至 1 的混合比例
 * @returns 小写十六进制颜色；任一输入含透明度时保留 Alpha。
 * @throws 颜色非法时抛出 `TypeError`；比例非法时抛出 `RangeError`。
 */
export function mixHexColors(first: string, second: string, amount: number): string {
	if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
		throw new RangeError("`amount` must be a finite number between 0 and 1.");
	}
	const left = parseHexColor(first);
	const right = parseHexColor(second);
	/**
	 * 在单个 RGBA 通道上执行与外层相同权重的线性混合。
	 *
	 * @param start - 第一个颜色的通道值
	 * @param end - 第二个颜色的通道值
	 * @returns 按外层 `amount` 线性混合后的通道值
	 */
	const mix = (start: number, end: number) => start + (end - start) * amount;
	return formatHexColor(
		{
			red: mix(left.red, right.red),
			green: mix(left.green, right.green),
			blue: mix(left.blue, right.blue),
			alpha: mix(left.alpha, right.alpha),
		},
		left.alpha < 1 || right.alpha < 1
	);
}

/**
 * 按比例向黑色混合。
 *
 * @param color - 合法十六进制颜色
 * @param amount - 0 至 1 的混合比例
 * @returns 混入黑色后的十六进制颜色；参数与异常语义见 {@link mixHexColors}。
 */
export function mixHexColorWithBlack(color: string, amount: number): string {
	return mixHexColors(color, "#000000", amount);
}

/**
 * 按比例向白色混合。
 *
 * @param color - 合法十六进制颜色
 * @param amount - 0 至 1 的混合比例
 * @returns 混入白色后的十六进制颜色；参数与异常语义见 {@link mixHexColors}。
 */
export function mixHexColorWithWhite(color: string, amount: number): string {
	return mixHexColors(color, "#ffffff", amount);
}

/**
 * 按 WCAG sRGB 转换曲线线性化颜色通道。
 *
 * @param channel - 已校验的 0 至 255 通道值
 * @returns 0 至 1 的线性光值
 */
const linearizeSrgbChannel = (channel: number): number => {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/**
 * 计算 WCAG sRGB 相对亮度。
 *
 * @remarks Alpha 通道不会参与计算；半透明颜色应先与实际背景混合。
 * @param color - 合法十六进制颜色
 * @returns 0 至 1 的相对亮度
 * @throws 输入非法时抛出 `TypeError`。
 */
export function relativeLuminance(color: string): number {
	const { red, green, blue } = parseHexColor(color);
	return 0.2126 * linearizeSrgbChannel(red) + 0.7152 * linearizeSrgbChannel(green) + 0.0722 * linearizeSrgbChannel(blue);
}

/**
 * 计算两种不透明颜色的 WCAG 对比度，范围 1 至 21。
 *
 * @remarks 返回比值本身，不代表特定字号或 WCAG 等级必然通过。
 * @param first - 第一种十六进制颜色
 * @param second - 第二种十六进制颜色
 * @returns 较亮颜色与较暗颜色的对比度
 * @throws 输入非法时抛出 `TypeError`。
 */
export function contrastRatio(first: string, second: string): number {
	const firstLuminance = relativeLuminance(first);
	const secondLuminance = relativeLuminance(second);
	const lighter = Math.max(firstLuminance, secondLuminance);
	const darker = Math.min(firstLuminance, secondLuminance);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 从两个候选颜色中选择与背景对比度更高的一项。
 *
 * @param background - 实际不透明背景色
 * @param first - 第一候选，默认黑色
 * @param second - 第二候选，默认白色
 * @returns 对比度较高的原始候选字符串；相同时返回 `first`。
 * @throws 任一颜色非法时抛出 `TypeError`。
 */
export function pickHigherContrastColor(background: string, first = "#000000", second = "#ffffff"): string {
	return contrastRatio(background, first) >= contrastRatio(background, second) ? first : second;
}
