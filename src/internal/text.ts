/**
 * 使用内部实现解码 UTF-8，不依赖平台 Encoding API。
 *
 * @param input - 不会被修改的字节或 ArrayBuffer
 * @param options - 默认严格拒绝非法 UTF-8 并移除开头的 BOM；`fatal: false` 替换非法序列，`ignoreBOM: true` 保留 BOM。
 * @returns 解码文本
 * @throws `TypeError` 当严格模式的输入包含非法 UTF-8。
 */
export const decodeUtf8 = (input: Uint8Array | ArrayBuffer, options: { fatal?: boolean; ignoreBOM?: boolean } = {}): string => {
	const { fatal = true, ignoreBOM = false } = options;
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let result = "";
	for (let index = 0; index < bytes.length;) {
		const start = index;
		const first = bytes[index++] ?? 0;
		let codePoint = first;
		let remaining = 0;
		let lower = 0x80;
		let upper = 0xbf;
		if (first >= 0xc2 && first <= 0xdf) {
			codePoint = first & 0x1f;
			remaining = 1;
		} else if (first >= 0xe0 && first <= 0xef) {
			codePoint = first & 0x0f;
			remaining = 2;
			if (first === 0xe0) lower = 0xa0;
			if (first === 0xed) upper = 0x9f;
		} else if (first >= 0xf0 && first <= 0xf4) {
			codePoint = first & 0x07;
			remaining = 3;
			if (first === 0xf0) lower = 0x90;
			if (first === 0xf4) upper = 0x8f;
		} else if (first > 0x7f) {
			if (fatal) throw new TypeError("The input is not valid UTF-8.");
			result += "\ufffd";
			continue;
		}
		let valid = true;
		for (let continuation = 0; continuation < remaining; continuation += 1) {
			const byte = bytes[index];
			if (byte === undefined || byte < lower || byte > upper) {
				valid = false;
				break;
			}
			index += 1;
			codePoint = (codePoint << 6) | (byte & 0x3f);
			lower = 0x80;
			upper = 0xbf;
		}
		if (!valid) {
			if (fatal) throw new TypeError("The input is not valid UTF-8.");
			// 非法续字节留给下一轮处理，保持 WHATWG 的替换字符数量。
			result += "\ufffd";
		} else if (ignoreBOM || start !== 0 || codePoint !== 0xfeff) {
			result += String.fromCodePoint(codePoint);
		}
	}
	return result;
};

/**
 * 使用内部实现编码 UTF-8，不依赖平台 Encoding API。
 *
 * @param value - 待编码文本；孤立的 UTF-16 代理项按 TextEncoder 语义替换为 U+FFFD。
 * @returns 使用独立 ArrayBuffer 的 UTF-8 字节数组
 */
export const encodeUtf8 = (value: string): Uint8Array<ArrayBuffer> => {
	const bytes: number[] = [];
	for (const character of value) {
		let codePoint = character.codePointAt(0) ?? 0;
		if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;
		if (codePoint <= 0x7f) bytes.push(codePoint);
		else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
		else if (codePoint <= 0xffff) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
		else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
	}
	return Uint8Array.from(bytes);
};

/** 解码或解密后的字符串扩展 */
interface DecodedTextExtension {
	/**
	 * 显式把原始文本解析为 JSON 值。
	 *
	 * @remarks 泛型只描述调用方期望的类型，不验证实际 JSON 结构；不可信数据仍需执行运行时校验。
	 * @returns `JSON.parse` 生成的对象、数组、标量或 `null`；文本不是合法 JSON 时返回原始字符串。
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保留已发布的默认 any 与调用方指定返回类型。
	parseJson: <Value = any>() => Value;
}

/** 可直接作为原始字符串使用，并支持显式 JSON 解析的解码或解密结果。 */
export type DecodedText = string & DecodedTextExtension;

const parseJsonMarker = Symbol.for("@fast-china/utils/parse-json");

/** 把当前字符串解析为 JSON 值。 */
const parseJson = function <Value = ReturnType<typeof JSON.parse>>(this: string): Value {
	const text = this.valueOf();
	try {
		return JSON.parse(text) as Value;
	} catch {
		return text as Value;
	}
};

Object.defineProperty(parseJson, parseJsonMarker, { value: true });

/** 按需安装不可枚举的字符串 JSON 解析扩展。 */
const ensureParseJsonExtension = (): void => {
	const descriptor = Object.getOwnPropertyDescriptor(String.prototype, "parseJson");
	if (descriptor !== undefined) {
		if (typeof descriptor.value === "function" && Reflect.get(descriptor.value, parseJsonMarker) === true) return;
		throw new TypeError("String.prototype.parseJson is already defined by another implementation.");
	}

	try {
		Object.defineProperty(String.prototype, "parseJson", {
			configurable: true,
			enumerable: false,
			value: parseJson,
			writable: true,
		});
	} catch (cause) {
		throw new TypeError("The current runtime does not allow installing String.prototype.parseJson.", { cause });
	}
};

/**
 * 创建可链式解析 JSON 的原始字符串。
 *
 * @param text - 解码或解密后的原始文本
 * @returns 可直接作为字符串使用或显式调用 `.parseJson<Value>()` 的结果。
 */
export const createDecodedText = (text: string): DecodedText => {
	ensureParseJsonExtension();
	return text as DecodedText;
};
