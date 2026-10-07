/** 可序列化为内联 CSS 的单个值 */
export type StyleValue = number | string | null | undefined;

/** camelCase、kebab-case 或 CSS 自定义属性组成的只读样式对象 */
export type StyleObject = Readonly<Record<string, StyleValue>>;

/** 字符串、样式对象、嵌套数组或空值 */
export type StyleInput = string | StyleObject | readonly StyleInput[] | null | undefined;

/**
 * 判断 StyleInput 是否为递归样式数组。
 *
 * @param value - 待缩小的样式输入
 * @returns 是只读样式数组时返回 `true`。
 */
const isStyleArray = (value: StyleInput): value is readonly StyleInput[] => Array.isArray(value);

/**
 * 判断文本是否可按十进制数值追加 CSS 单位。
 *
 * @param value - 已去除外围空白的文本
 * @returns 有限十进制数值返回 `true`；二、八、十六进制前缀返回 `false`。
 */
const isNumericString = (value: string): boolean => {
	if (value.length === 0 || !Number.isFinite(Number(value))) return false;
	const unsigned = value.startsWith("+") || value.startsWith("-") ? value.slice(1) : value;
	return !/^0[box]/iu.test(unsigned);
};

/**
 * 把 JavaScript 样式属性名转换为 CSS 属性名。
 *
 * @param key - camelCase、kebab-case 或 CSS 自定义属性名。
 * @returns kebab-case 属性名；`--` 自定义属性保持原样。
 */
const toCssPropertyName = (key: string): string => {
	if (key.startsWith("--")) return key;
	const normalized = key.startsWith("ms") ? `-${key}` : key;
	return normalized.replace(/([A-Z])/gu, "-$1").toLowerCase();
};

/**
 * 为数值或纯数字字符串添加 CSS 单位。
 *
 * @param value - 数字、数字字符串或已有单位的 CSS 值；空值返回空字符串。
 * @param unit - 非零数字使用的单位，默认 `px`
 * @returns 零统一返回 `"0"`；非数字字符串保持原样。
 * @throws `RangeError` 当数字非有限或单位为空。
 */
export function addCssUnit(value?: string | number | null, unit = "px"): string {
	if (value === null || value === undefined || value === "") return "";
	if (unit.length === 0) throw new RangeError("`unit` must not be empty.");
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new RangeError("`value` must be a finite number.");
		return value === 0 ? "0" : `${value}${unit}`;
	}
	const trimmed = value.trim();
	if (!isNumericString(trimmed)) return value;
	return Number(trimmed) === 0 ? "0" : `${trimmed}${unit}`;
}

/**
 * 将样式字符串、对象或嵌套数组序列化为内联 CSS。
 *
 * @remarks 本函数只负责结构转换，不是 CSS 安全清洗器。不可信值必须由调用方按照
 * 实际渲染上下文验证，尤其不能允许用户控制属性名、`url()` 或自定义属性内容。
 * 数字不会自动附加单位；需要长度单位时应先调用 {@link addCssUnit}。
 * @param styles - 可嵌套样式输入；后出现的声明由 CSS 层叠规则覆盖先前声明。
 * @returns 以分号结束、以空格分隔的 CSS 声明字符串
 * @throws `RangeError` 当对象中包含 `NaN` 或无穷数字。
 */
export function serializeStyle(styles: StyleInput): string {
	if (styles === null || styles === undefined || styles === "") return "";
	if (isStyleArray(styles)) {
		return styles
			.map((item) => serializeStyle(item))
			.filter((item) => item.length > 0)
			.join(" ");
	}
	if (typeof styles === "string") {
		const value = styles.trim();
		return value.length === 0 ? "" : value.endsWith(";") ? value : `${value};`;
	}

	return Object.entries(styles)
		.filter(([, value]) => value !== null && value !== undefined && value !== "")
		.map(([key, value]) => {
			if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError(`Style property "${key}" must be a finite number.`);
			return `${toCssPropertyName(key)}:${String(value)};`;
		})
		.join(" ");
}
