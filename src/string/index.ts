const defaultRandomAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const defaultStringLocale = "en-US";
const maximumRandomStringLength = 1_000_000;
const maximumRandomValuesPerBatch = 16_384;
const uint32Range = 0x1_0000_0000;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** 查询字符串解析结果；重复键保留为数组，不存在的键读取为 `undefined`。 */
export type ParsedQueryParameters = Record<string, string | string[] | undefined>;

/** 大小写与字素分割可接受的显式语言；省略时大小写转换使用标准 Unicode 规则，字素分割固定使用 `en-US`。 */
export type StringLocale = string | readonly string[] | undefined;

/** 使用 Web Crypto 填充随机值，能力缺失时回退到 `Math.random()`。 */
const fillRandomValues = (values: Uint8Array<ArrayBuffer> | Uint32Array<ArrayBuffer>): void => {
	if (typeof crypto !== "undefined" && typeof crypto?.getRandomValues === "function") {
		crypto.getRandomValues(values);
		return;
	}
	const range = values.BYTES_PER_ELEMENT === Uint8Array.BYTES_PER_ELEMENT ? 0x100 : uint32Range;
	for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * range);
};

/**
 * 从随机字节创建 UUID v4。
 *
 * @param bytes - 长度至少为 16 的随机字节；Version 与 Variant 位会被原地修改。
 * @returns 小写、带连字符的 RFC 4122 UUID v4
 */
const createUuidV4FromBytes = (bytes: Uint8Array): string => {
	bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
	bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * 按用户可见字素切分文本。
 *
 * @param value - 待切分字符串
 * @param locale - Segmenter 使用的显式语言；省略时使用固定默认值。
 * @returns 保留组合 Emoji、变音符号和连接序列的字素数组
 * @throws `Error` 当平台缺少 `Intl.Segmenter`。
 */
const splitGraphemes = (value: string, locale: StringLocale): string[] => {
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
		throw new Error("The current runtime does not support Intl.Segmenter.");
	}
	const segmenter = new Intl.Segmenter(locale ?? defaultStringLocale, { granularity: "grapheme" });
	return Array.from(segmenter.segment(value), ({ segment }) => segment);
};

/**
 * 重复执行 URI 组件解码，直到值稳定或达到深度上限。
 *
 * @param value - 不包含 URI 路径语义的编码组件
 * @param maxDepth - 最大解码次数，默认 `10`
 * @returns 解码稳定或达到上限后的组件文本
 * @throws `URIError` 当任一层包含非法百分号序列；深度非法时抛出 `RangeError`。
 */
export function decodeURIComponentRepeatedly(value: string, maxDepth = 10): string {
	if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new RangeError("`maxDepth` must be a nonnegative safe integer.");
	let decoded = value;
	for (let index = 0; index < maxDepth; index += 1) {
		const next = decodeURIComponent(decoded);
		if (next === decoded) break;
		decoded = next;
	}
	return decoded;
}

/**
 * 解析带 `://` 的绝对 URL、`?query` 或纯查询字符串。
 *
 * @remarks 纯查询字符串值中的未编码 `?` 会作为值内容保留；片段标识及其后内容被忽略。
 * @param input - 完整 URL、带前导问号或不带前导问号的查询文本
 * @returns 重复键对应字符串数组，空值保留为空字符串。
 * @throws `URIError` 当键或值包含非法百分号编码或无效的 UTF-8 字节序列。
 */
export function parseQueryString(input: string): ParsedQueryParameters {
	const fragmentStart = input.indexOf("#");
	const withoutFragment = fragmentStart < 0 ? input : input.slice(0, fragmentStart);
	const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:\/\//iu.test(withoutFragment);
	const queryStart = withoutFragment.indexOf("?");
	if (isAbsoluteUrl && queryStart < 0) return {};
	const query = isAbsoluteUrl ? withoutFragment.slice(queryStart + 1) : withoutFragment.replace(/^\?/u, "");
	const result: ParsedQueryParameters = {};
	for (const entry of query.replace(/^\?/u, "").replace(/\+/gu, " ").split("&")) {
		if (entry === "") continue;
		const separator = entry.indexOf("=");
		const key = decodeURIComponent(separator < 0 ? entry : entry.slice(0, separator));
		const value = decodeURIComponent(separator < 0 ? "" : entry.slice(separator + 1));
		const existing = Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined;
		if (existing === undefined) {
			// defineProperty 让 `__proto__` 成为普通自有键，不触发 Object.prototype Setter。
			Object.defineProperty(result, key, { configurable: true, enumerable: true, value, writable: true });
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			Object.defineProperty(result, key, { configurable: true, enumerable: true, value: [existing, value], writable: true });
		}
	}
	return result;
}

/**
 * 判断文本是否为任意合法 JSON 值，包括标量与 `null`。
 *
 * @param value - 待解析文本；纯空白不视为 JSON。
 * @returns `JSON.parse` 能完整解析时返回 `true`。
 */
export function isValidJson(value: string): boolean {
	if (value.trim().length === 0) return false;
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * 按大小写边界、连字符、下划线与空白切分单词。
 *
 * @example `XMLHttp_request` 返回 `["XML", "Http", "request"]`。
 * @param value - 待拆分文本
 * @returns 删除空项、保持输入顺序的单词数组
 */
export function splitWords(value: string): string[] {
	return value
		.trim()
		.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
		.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
		.split(/[\s_-]+/u)
		.filter((part) => part.length > 0);
}

/**
 * 将首个 Unicode 码点转为大写。
 *
 * @param value - 输入文本；空字符串保持为空。
 * @param locale - 显式语言；省略时使用标准 Unicode 大小写规则。
 * @returns 首个 Unicode 码点转换后的文本
 */
export function upperFirst(value: string, locale?: StringLocale): string {
	const characters = Array.from(value);
	const first = characters.shift();
	return first === undefined ? "" : (locale === undefined ? first.toUpperCase() : first.toLocaleUpperCase(locale)) + characters.join("");
}

/**
 * 将首个 Unicode 码点转为小写。
 *
 * @param value - 输入文本；空字符串保持为空。
 * @param locale - 显式语言；省略时使用标准 Unicode 大小写规则。
 * @returns 首个 Unicode 码点转换后的文本
 */
export function lowerFirst(value: string, locale?: StringLocale): string {
	const characters = Array.from(value);
	const first = characters.shift();
	return first === undefined ? "" : (locale === undefined ? first.toLowerCase() : first.toLocaleLowerCase(locale)) + characters.join("");
}

/**
 * 将文本转换为 camelCase。
 *
 * @param value - 由大小写、连字符、下划线或空白分隔的文本
 * @param locale - 大小写转换使用的语言；省略时使用标准 Unicode 大小写规则。
 * @returns camelCase 文本
 */
export function camelCase(value: string, locale?: StringLocale): string {
	return splitWords(value)
		.map((part, index) => {
			const normalized = locale === undefined ? part.toLowerCase() : part.toLocaleLowerCase(locale);
			return index === 0 ? normalized : upperFirst(normalized, locale);
		})
		.join("");
}

/**
 * 将文本转换为 PascalCase。
 *
 * @param value - 参数语义与 {@link camelCase} 一致。
 * @param locale - 大小写转换使用的显式语言
 * @returns PascalCase 文本
 */
export function pascalCase(value: string, locale?: StringLocale): string {
	return upperFirst(camelCase(value, locale), locale);
}

/**
 * 将文本转换为 kebab-case。
 *
 * @param value - 参数语义与 {@link camelCase} 一致。
 * @param locale - 大小写转换使用的显式语言
 * @returns kebab-case 文本
 */
export function kebabCase(value: string, locale?: StringLocale): string {
	return splitWords(value)
		.map((part) => (locale === undefined ? part.toLowerCase() : part.toLocaleLowerCase(locale)))
		.join("-");
}

/**
 * 按 Unicode 字素簇截断文本，避免拆开 emoji、组合音标或代理对。
 *
 * @param value - 输入文本
 * @param maxLength - 保留的最大字素簇数量
 * @param suffix - 被截断时追加的文本，默认单字符省略号 `…`；不计入上限。
 * @param locale - 字素分割语言，默认固定为 `en-US`
 * @returns 未超限时返回原字符串，否则返回截断内容与后缀。
 * @throws `RangeError` 当 `maxLength` 不是非负安全整数或 Locale 无效；缺少
 * `Intl.Segmenter` 时抛出 `Error`。
 */
export function truncateGraphemes(value: string, maxLength: number, suffix = "…", locale?: StringLocale): string {
	if (!Number.isSafeInteger(maxLength) || maxLength < 0) throw new RangeError("`maxLength` must be a nonnegative safe integer.");
	const segments = splitGraphemes(value, locale);
	return segments.length > maxLength ? segments.slice(0, maxLength).join("") + suffix : value;
}

/**
 * 把文本复制到系统剪贴板。
 *
 * @remarks uni-app 使用 `setClipboardData`；浏览器优先使用 Clipboard API，并在该 API 不可用时
 * 回退到 `document.execCommand("copy")`。平台拒绝访问剪贴板时不会静默忽略错误。
 * @param value - 要复制的文本
 * @returns 复制完成后兑现的 Promise
 * @throws `Error` 当运行时没有可用的剪贴板能力或复制失败。
 */
export async function copy(value: string): Promise<void> {
	if (typeof uni !== "undefined") {
		if (uni === null || typeof uni.setClipboardData !== "function") {
			throw new TypeError("The global uni object does not provide `setClipboardData`.");
		}
		await new Promise<void>((resolve, reject) => {
			uni.setClipboardData({
				data: value,
				fail: (error: unknown) => {
					reject(error instanceof Error ? error : new Error("Failed to copy text to the clipboard.", { cause: error }));
				},
				success: resolve,
			});
		});
		return;
	}

	if (
		typeof isSecureContext !== "undefined" &&
		isSecureContext &&
		typeof navigator !== "undefined" &&
		typeof navigator.clipboard?.writeText === "function"
	) {
		await navigator.clipboard.writeText(value);
		return;
	}

	if (typeof document === "undefined" || document === null) {
		throw new Error("The current runtime does not support clipboard access.");
	}
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- 兼容不支持 Clipboard API 的旧 WebView。
	if (typeof document.createElement !== "function" || document.body == null || typeof document.execCommand !== "function") {
		throw new Error("The current runtime does not support clipboard access.");
	}
	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.style.left = "-999999px";
	textarea.style.opacity = "0";
	textarea.style.position = "fixed";
	textarea.style.top = "-999999px";
	document.body.appendChild(textarea);
	let copied: boolean;
	try {
		textarea.focus();
		textarea.select();
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- 兼容不支持 Clipboard API 的旧 WebView。
		copied = document.execCommand("copy");
	} finally {
		textarea.remove();
	}
	if (!copied) throw new Error("Failed to copy text to the clipboard.");
}

/**
 * 生成随机字符串。
 *
 * @remarks 优先使用 Web Crypto；平台缺少安全随机能力时回退到 `Math.random()`。
 * @param length - 字符数量，必须是 0 至 1,000,000 的安全整数。
 * @param alphabet - 不得为空、包含重复字符或超过 2^32 个 Unicode 码点。
 * @returns 由 `alphabet` 中 Unicode 码点组成的随机文本
 * @throws `RangeError` 当长度或字母表非法。
 */
export function randomString(length: number, alphabet: string = defaultRandomAlphabet): string {
	if (!Number.isSafeInteger(length) || length < 0 || length > maximumRandomStringLength) {
		throw new RangeError(`\`length\` must be a safe integer between 0 and ${maximumRandomStringLength}.`);
	}
	const characters = Array.from(alphabet);
	if (characters.length === 0) throw new RangeError("`alphabet` must not be empty.");
	if (new Set(characters).size !== characters.length) throw new RangeError("`alphabet` must not contain duplicate characters.");
	if (characters.length > 0x1_0000_0000) throw new RangeError("`alphabet` must not contain more than 2^32 characters.");
	if (length === 0) return "";

	// 丢弃不能平均映射到字母表的尾部区间，避免 `%` 造成前部字符概率偏高。
	const acceptanceLimit = Math.floor(uint32Range / characters.length) * characters.length;
	const result: string[] = [];
	while (result.length < length) {
		const remaining = length - result.length;
		// 分批填充可控制临时内存，并避开 Web Crypto 单次随机数组大小限制。
		const samples = new Uint32Array(Math.min(remaining, maximumRandomValuesPerBatch));
		fillRandomValues(samples);
		for (const sample of samples) {
			if (sample >= acceptanceLimit) continue;
			const character = characters[sample % characters.length];
			if (character === undefined) continue;
			result.push(character);
			if (result.length === length) break;
		}
	}
	return result.join("");
}

/**
 * 生成 RFC 4122 version 4 UUID。
 *
 * @remarks 优先使用 Web Crypto；平台缺少安全随机能力时回退到 `Math.random()`。
 * 该 UUID 适合普通唯一标识，不应作为安全令牌或秘密。
 * @returns 小写、带连字符的 UUID v4
 */
export function generateUuidV4(): string {
	if (typeof crypto !== "undefined" && typeof crypto?.randomUUID === "function") return crypto.randomUUID();
	const bytes = new Uint8Array(16);
	fillRandomValues(bytes);
	return createUuidV4FromBytes(bytes);
}

/**
 * 判断字符串是否为 RFC 4122 version 4 UUID。
 *
 * @param value - 待验证文本；十六进制字母大小写均可。
 * @returns 版本位与 Variant 位均正确时返回 `true`。
 */
export function isUuidV4(value: string): boolean {
	return uuidV4Pattern.test(value);
}

/**
 * 转义 HTML 文本上下文中的五个特殊字符。
 *
 * @remarks 这不是 HTML 清洗器，不能让不可信文本安全进入 URL、CSS、脚本或属性名上下文。
 * @param value - 将作为 HTML 文本节点内容的字符串
 * @returns 转义 `&`、`<`、`>`、双引号与单引号后的文本
 */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

/**
 * 把连续 Unicode 空白折叠为单个空格并删除两端空白。
 *
 * @param value - 输入文本
 * @returns 规范化后的文本；全空白输入返回空字符串。
 */
export function normalizeWhitespace(value: string): string {
	return value.trim().replace(/\s+/gu, " ");
}
