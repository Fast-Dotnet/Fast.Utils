import { type DecodedText, createDecodedText, decodeUtf8 as decodeUtf8Strict, encodeUtf8 } from "../internal/text";
import { randomInt } from "../number/index";

export type { DecodedText } from "../internal/text";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 内部共享解码器支持的两种字符表规则。 */
type Base64Variant = "standard" | "url";

/**
 * 创建统一的 Base64 输入错误。
 *
 * @param variant - 当前解析的标准 Base64 或 Base64URL 变体。
 * @returns 带有具体变体名称的 `TypeError`
 */
const invalidBase64 = (variant: Base64Variant): TypeError => {
	return new TypeError(`The value is not valid ${variant === "url" ? "Base64URL" : "Base64"}.`);
};

/**
 * 校验并规范化 Base64 文本。
 *
 * @remarks 标准 Base64 允许 ASCII 空白，Base64URL 不允许；两者最终都会转换为标准字符表和完整填充。
 * @param value - 原始编码文本
 * @param variant - 需要应用的字符表与空白规则
 * @returns 使用标准字符表且长度为 4 倍数的文本。
 * @throws `TypeError` 当字符、填充位置或编码长度非法。
 */
const normalizeBase64 = (value: string, variant: Base64Variant): string => {
	const withoutWhitespace = variant === "standard" ? value.replace(/[\t\n\f\r ]+/gu, "") : value;
	const pattern = variant === "url" ? /^[\w-]*={0,2}$/u : /^[A-Za-z\d+/]*={0,2}$/u;
	if (!pattern.test(withoutWhitespace) || withoutWhitespace.length % 4 === 1) throw invalidBase64(variant);
	if (withoutWhitespace.includes("=") && withoutWhitespace.length % 4 !== 0) throw invalidBase64(variant);

	const standard = (variant === "url" ? withoutWhitespace.replace(/-/gu, "+").replace(/_/gu, "/") : withoutWhitespace).replace(/=+$/u, "");
	return standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
};

/**
 * 使用固定字符表编码任意字节。
 *
 * @param bytes - 不会被修改的源字节
 * @returns 带标准 `=` 填充的 Base64 文本
 */
const encodeBytes = (bytes: Uint8Array): string => {
	let result = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const first = bytes[index] ?? 0;
		const second = bytes[index + 1];
		const third = bytes[index + 2];
		const bitmap = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
		result += alphabet[(bitmap >> 18) & 63] ?? "";
		result += alphabet[(bitmap >> 12) & 63] ?? "";
		result += second === undefined ? "=" : (alphabet[(bitmap >> 6) & 63] ?? "");
		result += third === undefined ? "=" : (alphabet[bitmap & 63] ?? "");
	}
	return result;
};

/**
 * 把 Base64 或 Base64URL 文本解码为字节。
 *
 * @remarks 最后一组未使用位必须为零，以拒绝同一字节序列的非规范编码。
 * @param value - 待解码文本
 * @param variant - 输入使用的编码变体
 * @returns 新建的字节数组
 * @throws `TypeError` 当输入格式或尾部位非法。
 */
const decodeBytes = (value: string, variant: Base64Variant): Uint8Array => {
	const normalized = normalizeBase64(value, variant);
	if (normalized.length === 0) return new Uint8Array();

	const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
	const result = new Uint8Array((normalized.length / 4) * 3 - padding);
	let outputIndex = 0;

	for (let index = 0; index < normalized.length; index += 4) {
		const first = alphabet.indexOf(normalized[index] ?? "");
		const second = alphabet.indexOf(normalized[index + 1] ?? "");
		const thirdCharacter = normalized[index + 2] ?? "=";
		const fourthCharacter = normalized[index + 3] ?? "=";
		const third = thirdCharacter === "=" ? 0 : alphabet.indexOf(thirdCharacter);
		const fourth = fourthCharacter === "=" ? 0 : alphabet.indexOf(fourthCharacter);
		if (first < 0 || second < 0 || third < 0 || fourth < 0) throw invalidBase64(variant);

		const isLast = index + 4 === normalized.length;
		// 填充字符对应的未使用低位必须为零，否则不同文本可以解码为同一字节序列。
		if (isLast && ((padding === 2 && (second & 15) !== 0) || (padding === 1 && (third & 3) !== 0))) {
			throw invalidBase64(variant);
		}

		const bitmap = (first << 18) | (second << 12) | (third << 6) | fourth;
		if (outputIndex < result.length) result[outputIndex++] = (bitmap >> 16) & 255;
		if (outputIndex < result.length) result[outputIndex++] = (bitmap >> 8) & 255;
		if (outputIndex < result.length) result[outputIndex++] = bitmap & 255;
	}
	return result;
};

/** 统一 UTF-8 解码错误，并保留底层原因。 */
const decodeUtf8 = (bytes: Uint8Array): string => {
	try {
		return decodeUtf8Strict(bytes);
	} catch (cause) {
		throw new TypeError("The decoded bytes are not valid UTF-8.", { cause });
	}
};

/**
 * 将任意字节编码为标准 Base64。
 *
 * @param bytes - 不会被修改的字节序列
 * @returns 带标准 `=` 填充的 Base64 文本
 */
export function encodeBase64Bytes(bytes: Uint8Array): string {
	return encodeBytes(bytes);
}

/**
 * 解码标准 Base64。
 *
 * @remarks 允许省略填充和包含 ASCII 空白，但拒绝非规范尾部位。
 * @param value - Base64 文本
 * @returns 新建的字节数组
 * @throws 输入非法时抛出 `TypeError`。
 */
export function decodeBase64Bytes(value: string): Uint8Array {
	return decodeBytes(value, "standard");
}

/**
 * 将 UTF-8 文本编码为标准 Base64。
 *
 * @param value - 任意 Unicode 字符串
 * @returns 带标准填充的 Base64 文本
 * @remarks 使用内部 UTF-8 编码，不依赖平台 Encoding API。
 */
export function encodeBase64(value: string): string {
	return encodeBytes(encodeUtf8(value));
}

/**
 * 将标准 Base64 解码为 UTF-8 文本。
 *
 * @param value - Base64 文本
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 Unicode 字符串。
 * @throws Base64 或 UTF-8 非法时抛出 `TypeError`。
 */
export function decodeBase64(value: string): DecodedText {
	return createDecodedText(decodeUtf8(decodeBase64Bytes(value)));
}

/**
 * 将任意字节编码为无填充 Base64URL。
 *
 * @param bytes - 不会被修改的字节序列
 * @returns 仅使用 URL 安全字母表的文本
 */
export function encodeBase64UrlBytes(bytes: Uint8Array): string {
	return encodeBytes(bytes).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/**
 * 解码 Base64URL 字节。
 *
 * @remarks 接受带填充和无填充形式，不接受空白或标准 Base64 的 `+`、`/`。
 * @param value - Base64URL 文本
 * @returns 新建的字节数组
 * @throws 输入非法时抛出 `TypeError`。
 */
export function decodeBase64UrlBytes(value: string): Uint8Array {
	return decodeBytes(value, "url");
}

/**
 * 将 UTF-8 文本编码为无填充 Base64URL。
 *
 * @param value - 任意 Unicode 字符串
 * @returns 仅使用 URL 安全字母表的文本
 * @remarks 使用内部 UTF-8 编码，不依赖平台 Encoding API。
 */
export function encodeBase64Url(value: string): string {
	return encodeBase64UrlBytes(encodeUtf8(value));
}

/**
 * 将 Base64URL 解码为 UTF-8 文本。
 *
 * @param value - 带填充或无填充的 Base64URL 文本
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 Unicode 字符串。
 * @throws Base64URL 或 UTF-8 非法时抛出 `TypeError`。
 */
export function decodeBase64Url(value: string): DecodedText {
	return createDecodedText(decodeUtf8(decodeBase64UrlBytes(value)));
}

/**
 * 把 Latin-1 文本编码为标准 Base64。
 *
 * @param value - 每个 UTF-16 码元都必须位于 0–255 的文本。
 * @returns 带标准填充的 Base64 文本
 * @throws `TypeError` 当文本包含 Latin-1 范围外的码元。
 */
export function encodeLatin1Base64(value: string): string {
	const bytes = new Uint8Array(value.length);
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code > 255) throw new TypeError("The input string contains characters outside the Latin-1 range.");
		bytes[index] = code;
	}
	return encodeBase64Bytes(bytes);
}

/**
 * 把标准 Base64 解码为 Latin-1 文本。
 *
 * @param value - 标准 Base64 文本；允许 ASCII 空白和省略尾部填充。
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的 Latin-1 原始字符串。
 * @throws `TypeError` 当 Base64 格式或尾部位非法。
 */
export function decodeLatin1Base64(value: string): DecodedText {
	const bytes = decodeBase64Bytes(value);
	let result = "";
	for (const byte of bytes) result += String.fromCharCode(byte);
	return createDecodedText(result);
}

const randomPrefixAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const defaultRandomPrefixLength = 6;

/** SecureBase64 兼容格式中一组不可变的字符插入位置 */
interface Base64PasswordDictionaryEntry {
	/** 原始载荷中的固定字符索引；超出短载荷长度时忽略当前条目。 */
	index: number;
	/** 从原始载荷复制字符的固定索引；数值属于持久化协议，不能重新计算。 */
	randomIndex: number;
}

/** 固定 SecureBase64 字典；索引、顺序与映射属于持久化格式，禁止修改。 */
const base64PasswordDictionary: readonly Readonly<Base64PasswordDictionaryEntry>[] = Object.freeze([
	{ index: 977, randomIndex: 188 },
	{ index: 926, randomIndex: 201 },
	{ index: 851, randomIndex: 225 },
	{ index: 700, randomIndex: 255 },
	{ index: 600, randomIndex: 268 },
	{ index: 500, randomIndex: 277 },
	{ index: 400, randomIndex: 288 },
	{ index: 330, randomIndex: 327 },
	{ index: 300, randomIndex: 180 },
	{ index: 200, randomIndex: 178 },
	{ index: 100, randomIndex: 124 },
	{ index: 98, randomIndex: 95 },
	{ index: 92, randomIndex: 90 },
	{ index: 91, randomIndex: 87 },
	{ index: 88, randomIndex: 84 },
	{ index: 82, randomIndex: 79 },
	{ index: 78, randomIndex: 71 },
	{ index: 72, randomIndex: 69 },
	{ index: 68, randomIndex: 66 },
	{ index: 59, randomIndex: 55 },
	{ index: 48, randomIndex: 43 },
	{ index: 42, randomIndex: 37 },
	{ index: 36, randomIndex: 30 },
	{ index: 33, randomIndex: 27 },
	{ index: 24, randomIndex: 20 },
	{ index: 23, randomIndex: 18 },
	{ index: 21, randomIndex: 16 },
	{ index: 17, randomIndex: 14 },
	{ index: 13, randomIndex: 9 },
	{ index: 7, randomIndex: 4 },
	{ index: 5, randomIndex: 3 },
	{ index: 2, randomIndex: 1 },
]);

/**
 * 校验 SecureBase64 兼容格式的前缀长度。
 *
 * @param length - 待校验的前缀字符数
 * @throws `RangeError` 当长度不是非负安全整数。
 */
const assertPrefixLength = (length: number): void => {
	if (!Number.isSafeInteger(length) || length < 0) throw new RangeError("`prefixStrLength` must be a nonnegative safe integer.");
};

/**
 * 生成 SecureBase64 兼容格式使用的随机前缀。
 *
 * @remarks 优先使用 Web Crypto，能力缺失时回退到 `Math.random()`。前缀只用于降低相同明文
 * 产生相同载荷的概率，本身不构成加密，也不得承担安全用途。
 * @param length - 需要生成的字符数，调用前必须完成校验。
 * @returns 由历史字母表组成的文本
 */
const createRandomPrefix = (length: number): string => {
	let result = "";
	for (let index = 0; index < length; index += 1) {
		result += randomPrefixAlphabet[randomInt(0, randomPrefixAlphabet.length)] ?? "";
	}
	return result;
};

/**
 * 按固定字典向 Base64 文本插入冗余字符。
 *
 * @remarks 字典按高索引到低索引排列，确保插入不会改变尚未处理的位置。
 * @param base64Value - 尚未插入兼容字典字符的 Base64 文本
 * @returns 与旧持久化格式兼容的 SecureBase64 载荷
 */
const insertDictionaryCharacters = (base64Value: string): string => {
	let result = base64Value;
	for (const item of base64PasswordDictionary) {
		if (item.index >= base64Value.length) continue;
		// 旧字典的 index=100 项会在 101–124 字符载荷中越界；退回末字符可保持单字符插入协议，旧解码器仍能移除。
		const character = base64Value[item.randomIndex] ?? base64Value[base64Value.length - 1] ?? "";
		result = result.slice(0, item.index) + character + result.slice(item.index);
	}
	return result;
};

/**
 * 移除历史字典插入的冗余字符。
 *
 * @param base64Value - 已移除随机前缀的 SecureBase64 载荷
 * @returns 可交给标准 Base64 解码器的文本
 */
const removeDictionaryCharacters = (base64Value: string): string => {
	let result = base64Value;
	for (let index = base64PasswordDictionary.length - 1; index >= 0; index -= 1) {
		const item = base64PasswordDictionary[index];
		if (item !== undefined && item.index < base64Value.length) result = result.slice(0, item.index) + result.slice(item.index + 1);
	}
	return result;
};

/**
 * 使用固定字典和随机前缀编码文本。
 *
 * @remarks 给定相同的 6 字符前缀时，默认输出与旧有效载荷逐字符兼容。旧字典在 101–124 字符载荷中引用越界；这里复制末字符作为单字符回退，
 * 使旧删除字典流程仍能解码。传入 `0` 会同时关闭随机前缀与字典插入。
 * 该格式只是可逆编码，不提供加密、完整性或身份认证。
 * @param value - 任意可由 `encodeURIComponent` 处理的 Unicode 文本
 * @param prefixLength - 随机字母前缀长度；默认 `6`
 * @returns 带随机前缀和兼容字典字符的 Base64 文本；空输入返回空字符串。
 * @throws `RangeError` 当前缀长度不是非负安全整数；输入包含孤立代理项时保留平台错误。
 */
export function encodeSecureBase64(value: string, prefixLength: number = defaultRandomPrefixLength): string {
	if (value.length === 0) return "";
	assertPrefixLength(prefixLength);
	const prefix = createRandomPrefix(prefixLength);
	let encoded = encodeLatin1Base64(encodeURIComponent(value));
	if (prefixLength !== 0) encoded = insertDictionaryCharacters(encoded);
	return prefix + encoded;
}

/**
 * 解码 {@link encodeSecureBase64} 生成的 SecureBase64 兼容格式。
 *
 * @param value - SecureBase64 文本；必须使用与编码时相同的前缀长度。
 * @param prefixLength - 需要移除的前缀长度；默认 `6`，传入 `0` 时不移除字典字符。
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 Unicode 字符串；空输入返回空字符串。
 * @throws `RangeError` 当前缀长度不是非负安全整数；载荷、Base64 或 URI 编码非法时抛出 `TypeError` 或 `URIError`。
 */
export function decodeSecureBase64(value: string, prefixLength: number = defaultRandomPrefixLength): DecodedText {
	if (value.length === 0) return createDecodedText("");
	assertPrefixLength(prefixLength);
	if (prefixLength > value.length) throw new TypeError("The Base64 value is shorter than the configured prefix.");
	let encoded = value.slice(prefixLength);
	if (prefixLength !== 0) encoded = removeDictionaryCharacters(encoded);
	return createDecodedText(decodeURIComponent(decodeLatin1Base64(encoded)));
}
