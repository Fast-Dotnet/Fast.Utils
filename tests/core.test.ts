import { afterEach, describe, it } from "node:test";
import {
	addCssUnit,
	addDays,
	addMonths,
	addYears,
	allEqualBy,
	average,
	camelCase,
	chunk,
	clamp,
	cloneDeep,
	contrastRatio,
	copy,
	createDateRangeShortcuts,
	createDateShortcuts,
	createOneMonthRangeFromToday,
	decodeBase64,
	decodeBase64Bytes,
	decodeBase64Url,
	decodeLatin1Base64,
	decodeSecureBase64,
	decodeURIComponentRepeatedly,
	detectRuntime,
	difference,
	encodeBase64,
	encodeBase64Bytes,
	encodeBase64Url,
	encodeBase64UrlBytes,
	encodeLatin1Base64,
	encodeSecureBase64,
	endOfDay,
	escapeHtml,
	formatBytes,
	formatChineseRelativeTime,
	formatHexColor,
	formatRelativeTime,
	generateUuidV4,
	getLocalDayBounds,
	getLocalTimeGreeting,
	getStartOfToday,
	groupBy,
	hasDuplicatesBy,
	hasOwn,
	hasWebCrypto,
	inRange,
	intersection,
	isDateAfterNow,
	isEqual,
	isFuture,
	isMobileUserAgent,
	isPlainObject,
	isSameDay,
	isTabletUserAgent,
	isUniApp,
	isUuidV4,
	isValidDate,
	isValidJson,
	isWithinInterval,
	kebabCase,
	lerp,
	lowerFirst,
	mapValues,
	mixHexColorWithBlack,
	mixHexColorWithWhite,
	normalizeWhitespace,
	omit,
	omitBy,
	once,
	parseHexColor,
	parseQueryString,
	partition,
	pascalCase,
	pick,
	pickBy,
	pickHigherContrastColor,
	randomInt,
	randomString,
	relativeLuminance,
	removeNullishValues,
	roundTo,
	serializeStyle,
	shallowEqual,
	splitWords,
	startOfDay,
	sum,
	symmetricDifference,
	toDate,
	toQueryString,
	truncateGraphemes,
	unique,
	uniqueBy,
	upperFirst,
} from "../src/index";
import { configureLogger, createLogger, logger as defaultLogger } from "../src/logger/index";
import { expect, vi } from "./test-helpers";

const legacyBase64Dictionary = [
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
];

/** 复现旧版默认前缀和字典插入流程，作为持久化兼容格式基准。 */
const encodeLegacySecureBase64 = (value: string) => {
	const source = Buffer.from(encodeURIComponent(value), "latin1").toString("base64");
	let result = source;
	for (const item of legacyBase64Dictionary) {
		if (item.index >= source.length) continue;
		const character = source[item.randomIndex];
		if (character === undefined) throw new Error("Invalid legacy Base64 fixture.");
		result = result.slice(0, item.index) + character + result.slice(item.index);
	}
	return `BBBBBB${result}`;
};

/** 使用旧版删除顺序解码，确认修复后的边界载荷仍可被已有消费者读取。 */
const decodeLegacySecureBase64 = (value: string) => {
	const source = value.slice(6);
	let result = source;
	for (const item of [...legacyBase64Dictionary].reverse()) {
		if (item.index < source.length) result = result.slice(0, item.index) + result.slice(item.index + 1);
	}
	return decodeURIComponent(Buffer.from(result, "base64").toString("latin1"));
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("array utilities", () => {
	it("chunks, removes nullish values, and deduplicates without mutating input", () => {
		const input = [1, 2, 2, 3];
		expect(chunk(input, 3)).toEqual([[1, 2, 2], [3]]);
		expect(removeNullishValues([0, null, false, undefined, ""])).toEqual([0, false, ""]);
		expect(unique(input)).toEqual([1, 2, 3]);
		expect(input).toEqual([1, 2, 2, 3]);
		expect(() => chunk(input, 0)).toThrow(RangeError);
	});

	it("supports keyed uniqueness, grouping, and partitioning", () => {
		const values = [
			{ group: "a", id: 1 },
			{ group: "a", id: 1 },
			{ group: "b", id: 2 },
		];
		expect(uniqueBy(values, (item) => item.id)).toEqual([values[0], values[2]]);
		expect([...groupBy(values, (item) => item.group)]).toEqual([
			["a", [values[0], values[1]]],
			["b", [values[2]]],
		]);
		expect(partition(values, (item) => item.group === "a")).toEqual([[values[0], values[1]], [values[2]]]);
		expect(hasDuplicatesBy(values, (item) => item.id)).toBe(true);
		expect(allEqualBy(values.slice(0, 2), (item) => item.id)).toBe(true);
	});

	it("computes distinct set operations with SameValueZero semantics", () => {
		expect(difference([1, 1, 2, Number.NaN], [2])).toEqual([1, Number.NaN]);
		expect(intersection([3, 2, 2, 1], [2, 3])).toEqual([3, 2]);
		expect(symmetricDifference([1, 2, 2, Number.NaN], [2, 3, Number.NaN])).toEqual([1, 3]);
		expect(allEqualBy([{ value: Number.NaN }, { value: Number.NaN }], (item) => item.value)).toBe(true);
	});

	it("ignores sparse holes without treating them as explicit undefined values", () => {
		const sparse: (number | undefined)[] = [];
		sparse[2] = 1;
		expect(unique(sparse)).toEqual([1]);
		expect(difference([undefined, 1], sparse)).toEqual([undefined]);
		const selector = vi.fn((value: number | undefined) => value);
		expect(allEqualBy(sparse, selector)).toBe(true);
		expect(selector).toHaveBeenCalledOnce();
		expect(selector).toHaveBeenCalledWith(1, 2);
	});
});

describe("function utilities", () => {
	it("invokes a function once and preserves its first outcome", async () => {
		const callback = vi.fn((value: number) => ({ value }));
		const initialize = once(callback);
		const first = initialize(1);
		expect(initialize(2)).toBe(first);
		expect(first).toEqual({ value: 1 });
		expect(callback).toHaveBeenCalledOnce();

		const context = {
			prefix: "Fast",
			format: once(function (this: { prefix: string }, suffix: string) {
				return `${this.prefix}${suffix}`;
			}),
		};
		expect(context.format("!")).toBe("Fast!");
		context.prefix = "Changed";
		expect(context.format("?")).toBe("Fast!");

		const promise = Promise.resolve("ready");
		const load = once(() => promise);
		expect(load()).toBe(promise);
		expect(load()).toBe(promise);
		await expect(load()).resolves.toBe("ready");

		const failure = new Error("failed");
		let attempts = 0;
		const fail = once((): string => {
			attempts += 1;
			throw failure;
		});
		expect(() => fail()).toThrow(failure);
		expect(() => fail()).toThrow(failure);
		expect(attempts).toBe(1);
		expect(() => once(undefined as never)).toThrow(TypeError);
	});
});

describe("Base64 utilities", () => {
	it("round-trips UTF-8, Base64URL, and arbitrary bytes", () => {
		const text = "Fast 工具库 🚀".repeat(8);
		const decodedText = decodeBase64(encodeBase64(text));
		expect(decodedText).toBe(text);
		expect(typeof decodedText).toBe("string");
		expect(decodedText.toString()).toBe(text);
		expect(decodedText.valueOf()).toBe(text);
		expect(Object.getOwnPropertyDescriptor(String.prototype, "parseJson")?.enumerable).toBe(false);
		expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
		expect(decodeBase64(encodeBase64('{"id":1}')).parseJson<{ id: number }>()).toEqual({ id: 1 });
		expect(decodeBase64(encodeBase64("not json")).parseJson()).toBe("not json");
		const bytes = Uint8Array.of(0, 1, 2, 127, 128, 254, 255);
		expect(decodeBase64Bytes(encodeBase64Bytes(bytes))).toEqual(bytes);
	});

	it("rejects malformed encodings, non-canonical tail bits, and invalid UTF-8", () => {
		expect(() => decodeBase64Bytes("abcde")).toThrow(TypeError);
		expect(() => decodeBase64Bytes("YR==")).toThrow(TypeError);
		expect(() => decodeBase64("/w==")).toThrow(TypeError);
	});

	it("preserves native decoding error causes", () => {
		let failure: unknown;
		try {
			decodeBase64("/w==");
		} catch (error) {
			failure = error;
		}
		expect(failure instanceof TypeError).toBe(true);
		if (!(failure instanceof TypeError)) throw new Error("Expected decoding failure");
		expect(failure.cause instanceof TypeError).toBe(true);
		expect(Object.getOwnPropertyDescriptor(failure, "cause")?.enumerable).toBe(false);
	});

	it("round-trips text without platform Encoding APIs", () => {
		const textSamples = ["", "text", "中文 🚀\u0000", "\u007f\u0080\u07ff\u0800\uffff\u{10000}\u{10ffff}", "Fast工具".repeat(10_000)];
		const nativeEncodings = textSamples.map((text) => Buffer.from(text, "utf8").toString("base64"));
		vi.stubGlobal("TextEncoder", undefined);
		vi.stubGlobal("TextDecoder", undefined);
		for (const [index, text] of textSamples.entries()) {
			expect(encodeBase64(text)).toBe(nativeEncodings[index]);
			expect(decodeBase64(encodeBase64(text))).toBe(text);
			expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
			expect(decodeSecureBase64(encodeSecureBase64(text))).toBe(text);
		}
		expect(decodeBase64(encodeBase64("\ud800x\udfff"))).toBe("\ufffdx\ufffd");
		expect(decodeBase64(encodeBase64("\ufeff\ufefftext"))).toBe("\ufefftext");
		expect(decodeBase64(encodeBase64('{"id":1}')).parseJson<{ id: number }>()).toEqual({ id: 1 });
	});

	it("supports platforms missing just one Encoding API", () => {
		const text = "中文 🚀";
		const encoded = encodeBase64(text);
		vi.stubGlobal("TextEncoder", undefined);
		expect(encodeBase64(text)).toBe(encoded);
		expect(decodeBase64(encoded)).toBe(text);
		vi.unstubAllGlobals();
		vi.stubGlobal("TextDecoder", undefined);
		expect(decodeBase64(encodeBase64(text))).toBe(text);
	});

	it("rejects invalid UTF-8 with and without the native decoder", () => {
		const invalid = [
			[0x80],
			[0xc0, 0x80],
			[0xc2],
			[0xe2, 0x28, 0xa1],
			[0xe0, 0x80, 0x80],
			[0xed, 0xa0, 0x80],
			[0xf0, 0x80, 0x80, 0x80],
			[0xf4, 0x90, 0x80, 0x80],
			[0xf5, 0x80, 0x80, 0x80],
		];
		for (const decoder of [TextDecoder, undefined]) {
			vi.stubGlobal("TextDecoder", decoder);
			for (const bytes of invalid) {
				expect(() => decodeBase64(encodeBase64Bytes(Uint8Array.from(bytes)))).toThrow(TypeError);
				expect(() => decodeBase64Url(encodeBase64UrlBytes(Uint8Array.from(bytes)))).toThrow(TypeError);
			}
		}
	});

	it("preserves the dictionary-compatible SecureBase64 format", () => {
		vi.stubGlobal("crypto", {
			getRandomValues: (values: Uint32Array) => {
				values.fill(1);
				return values;
			},
		});
		const text = "Fast 工具库";
		for (const length of [1, 5, 12, 40, 80, 160, 260]) {
			const legacyText = "Fast工具".repeat(length);
			const legacy = encodeLegacySecureBase64(legacyText);
			expect(encodeSecureBase64(legacyText)).toBe(legacy);
			expect(decodeSecureBase64(legacy)).toBe(legacyText);
		}
		const historicalGapText = "Fast工具".repeat(4);
		const historicalGapValue = encodeSecureBase64(historicalGapText);
		expect(decodeSecureBase64(historicalGapValue)).toBe(historicalGapText);
		expect(decodeLegacySecureBase64(historicalGapValue)).toBe(historicalGapText);
		expect(decodeSecureBase64(encodeSecureBase64(text, 0), 0)).toBe(text);
		expect(decodeLatin1Base64(encodeLatin1Base64("Fast"))).toBe("Fast");
	});

	it("falls back to Math.random when SecureBase64 generates its random prefix", () => {
		vi.stubGlobal("crypto", undefined);
		const encoded = encodeSecureBase64("Fast");
		expect(decodeSecureBase64(encoded)).toBe("Fast");
	});
});

describe("number utilities", () => {
	it("formats defaults without Intl while retaining explicit locale requirements", () => {
		vi.stubGlobal("Intl", undefined);
		expect(formatBytes(1536)).toBe("1.5 KiB");
		expect(() => formatBytes(1024, { locale: "de" })).toThrow("The current runtime does not support Intl.NumberFormat.");
		expect(formatRelativeTime(86_400_000, { now: 0 })).toBe("明天");
		expect(formatRelativeTime(-120_000, { now: 0 })).toBe("2分钟前");
		expect(() => formatRelativeTime(0, { now: 0, locale: "en" })).toThrow("The current runtime does not support Intl.RelativeTimeFormat.");
	});
	it("handles ranges, rounding, interpolation, and aggregates", () => {
		expect(clamp(9, 0, 5)).toBe(5);
		expect(inRange(5, 0, 5)).toBe(false);
		expect(inRange(5, 0, 5, true)).toBe(true);
		expect(roundTo(1.005, 2)).toBe(1.01);
		expect(Object.is(roundTo(-0.1), -0)).toBe(true);
		expect(roundTo(Number.MAX_VALUE, 2)).toBe(Number.MAX_VALUE);
		expect(lerp(10, 20, 0.25)).toBe(12.5);
		expect(lerp(-Number.MAX_VALUE, Number.MAX_VALUE, 0.5)).toBe(0);
		expect(sum([1, 2, 3])).toBe(6);
		expect(() => sum([Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(RangeError);
		expect(average([2, 4])).toBe(3);
		expect(average([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(Number.MAX_VALUE);
		const sparseValues = new Array<number>(3);
		sparseValues[0] = 2;
		sparseValues[2] = 4;
		expect(average(sparseValues)).toBe(3);
		expect(average([])).toBeUndefined();
		expect(average(new Array<number>(2))).toBeUndefined();
	});

	it("formats byte units and generates bounded random integers", () => {
		expect(formatBytes(1536)).toBe("1.5 KiB");
		expect(formatBytes(1500, { base: 1000, decimals: 0 })).toBe("2 kB");
		expect(() => formatBytes(1, { base: 10 as never })).toThrow(RangeError);
		for (let index = 0; index < 32; index += 1) expect(randomInt(-5, 5)).toBeGreaterThanOrEqual(-5);
		expect(() => randomInt(1, 1)).toThrow(RangeError);
	});
});

describe("object and query utilities", () => {
	it("checks own properties without Object.hasOwn", () => {
		const nativeHasOwn = Object.hasOwn;
		Object.defineProperty(Object, "hasOwn", { configurable: true, value: undefined, writable: true });
		try {
			const symbol = Symbol("own");
			const value = Object.create(null) as Record<PropertyKey, unknown>;
			value["hasOwnProperty"] = () => false;
			value[symbol] = undefined;
			expect(hasOwn(value, symbol)).toBe(true);
			expect(hasOwn(value, "toString")).toBe(false);
			expect(isEqual({ key: 1 }, { key: 1 })).toBe(true);
			expect(shallowEqual({ key: 1 }, { key: 1 })).toBe(true);
		} finally {
			Object.defineProperty(Object, "hasOwn", { configurable: true, value: nativeHasOwn, writable: true });
		}
	});

	it("preserves valid form queries without URLSearchParams or Encoding APIs", () => {
		const queries = [
			"a=1&a=2&&flag&=x&empty=",
			"q=中文+🚀&plus=%2B&equals=a=b",
			"q=%EF%BB%BFx&__proto__=own&constructor=own",
			"q=🚀&x=%00",
			"??q=1",
		];
		const expected = queries.map((query) => {
			const parameters = new URLSearchParams(query.replace(/^\?/u, ""));
			return Object.fromEntries(
				[...new Set(parameters.keys())].map((key) => {
					const values = parameters.getAll(key);
					return [key, values.length === 1 ? values[0] : values];
				})
			);
		});
		const values = { text: "中文 🚀 + !'()~*", empty: "", list: [1, 2], absent: null };
		const native = new URLSearchParams();
		for (const [key, value] of Object.entries(values)) {
			for (const item of Array.isArray(value) ? value : [value]) {
				if (item !== null) native.append(key, String(item));
			}
		}
		const nativeEncoded = native.toString();
		vi.stubGlobal("URLSearchParams", undefined);
		vi.stubGlobal("TextEncoder", undefined);
		vi.stubGlobal("TextDecoder", undefined);
		for (const [index, query] of queries.entries()) expect(parseQueryString(query)).toEqual(expected[index]);
		expect(toQueryString(values)).toBe(nativeEncoded);
	});
	it("uses native URI errors for malformed queries and lone surrogate encoding", () => {
		for (const encoded of ["%", "%GG", "%A", "%FF", "%E0%80%80", "%E2%82", "%ED%A0%80"]) {
			expect(() => parseQueryString(`q=${encoded}`)).toThrow(URIError);
			expect(() => parseQueryString(`${encoded}=value`)).toThrow(URIError);
		}
		expect(() => toQueryString({ q: "\ud800" })).toThrow(URIError);
		expect(() => toQueryString({ ["\udfff"]: "value" })).toThrow(URIError);
		expect(parseQueryString("q=\ud800")).toEqual({ q: "\ud800" });
		expect(parseQueryString("a+b=x+y&plus=%2B&space=%20")).toEqual({ "a b": "x y", plus: "+", space: " " });
		expect(toQueryString({ q: "+ %20 !'()~*" })).toBe("q=%2B+%2520+%21%27%28%29%7E*");
		expect(toQueryString({ q: "+ " }, { space: "percent" })).toBe("q=%2B%20");
	});
	it("recognizes plain objects and safely manipulates own keys", () => {
		const source = { count: 2, label: "fast" };
		expect(isPlainObject(source)).toBe(true);
		expect(isPlainObject(new Date())).toBe(false);
		expect(hasOwn(source, "count")).toBe(true);
		expect(pick(source, ["label"])).toEqual({ label: "fast" });
		expect(omit(source, ["count"])).toEqual({ label: "fast" });
		expect(pickBy(source, (value) => typeof value === "number")).toEqual({ count: 2 });
		expect(omitBy(source, (value) => typeof value === "number")).toEqual({ label: "fast" });
		expect(mapValues(source, (value) => String(value))).toEqual({ count: "2", label: "fast" });
		const unusual = Object.defineProperty({} as Record<"__proto__", { safe: boolean }>, "__proto__", {
			enumerable: true,
			value: { safe: true },
		});
		const picked = pick(unusual, ["__proto__"]);
		expect(Object.hasOwn(picked, "__proto__")).toBe(true);
		expect(Object.getPrototypeOf(picked)).toBe(Object.prototype);
		expect(mapValues(unusual, (value) => value)).toEqual(picked);
	});

	it("deeply clones Lodash-compatible values and preserves graph relationships", () => {
		const symbolKey = Symbol("metadata");
		const shared = { count: 1 };
		const mapKey = { id: 1 };
		const callback = () => "same reference";
		const source: {
			array: { count: number }[];
			callback: () => string;
			date: Date;
			map: Map<object, { count: number }>;
			pattern: RegExp;
			self?: unknown;
			set: Set<{ count: number }>;
			typedArray: Uint16Array;
			[symbolKey]: { count: number };
		} = {
			array: [shared],
			callback,
			date: new Date("2024-01-01T00:00:00.000Z"),
			map: new Map([[mapKey, shared]]),
			pattern: /fast/giu,
			set: new Set([shared]),
			typedArray: new Uint16Array([1, 2]),
			[symbolKey]: shared,
		};
		source.pattern.lastIndex = 2;
		source.self = source;

		const cloned = cloneDeep(source);
		expect(cloned).not.toBe(source);
		expect(cloned.self).toBe(cloned);
		expect(cloned.array[0]).not.toBe(shared);
		expect(cloned.array[0]).toBe(cloned[symbolKey]);
		expect(cloned.map.keys().next().value).toBe(mapKey);
		expect(cloned.map.get(mapKey)).toBe(cloned.array[0]);
		expect(cloned.set.values().next().value).toBe(cloned.array[0]);
		expect(cloned.callback).toBe(callback);
		expect(cloned.date).not.toBe(source.date);
		expect(cloned.date.getTime()).toBe(source.date.getTime());
		expect(cloned.pattern).not.toBe(source.pattern);
		expect(cloned.pattern.source).toBe(source.pattern.source);
		expect(cloned.pattern.flags).toBe(source.pattern.flags);
		expect(cloned.pattern.lastIndex).toBe(2);
		expect(cloned.typedArray).not.toBe(source.typedArray);
		expect(cloned.typedArray.buffer).not.toBe(source.typedArray.buffer);
		expect([...cloned.typedArray]).toEqual([1, 2]);

		const sharedView = new Uint8Array(new SharedArrayBuffer(2));
		sharedView.set([3, 4]);
		const clonedSharedView = cloneDeep(sharedView);
		expect(clonedSharedView.buffer).toBeInstanceOf(SharedArrayBuffer);
		expect(clonedSharedView.buffer).not.toBe(sharedView.buffer);
		expect([...clonedSharedView]).toEqual([3, 4]);
	});

	it("deeply compares supported values, unordered collections, and cycles", () => {
		const leftTypedArray = new Float32Array([1, Number.NaN]);
		const rightTypedArray = new Float32Array([1, Number.NaN]);
		const left: Record<string, unknown> = {
			array: [{ id: 1 }],
			buffer: Uint8Array.of(1, 2).buffer,
			date: new Date("2024-01-01T00:00:00.000Z"),
			error: new TypeError("failed"),
			map: new Map([[{ id: 1 }, { value: "fast" }]]),
			pattern: /fast/giu,
			set: new Set([{ id: 1 }, 2]),
			typedArray: leftTypedArray,
		};
		const right: Record<string, unknown> = {
			array: [{ id: 1 }],
			buffer: Uint8Array.of(1, 2).buffer,
			date: new Date("2024-01-01T00:00:00.000Z"),
			error: new TypeError("failed"),
			map: new Map([[{ id: 1 }, { value: "fast" }]]),
			pattern: /fast/giu,
			set: new Set([2, { id: 1 }]),
			typedArray: rightTypedArray,
		};
		left["self"] = left;
		right["self"] = right;

		expect(isEqual(left, right)).toBe(true);
		expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
		expect(isEqual(0, -0)).toBe(true);
		expect(
			isEqual(
				() => undefined,
				() => undefined
			)
		).toBe(false);

		rightTypedArray[0] = 2;
		expect(isEqual(left, right)).toBe(false);
	});

	it("performs SameValue shallow comparison", () => {
		expect(shallowEqual({ value: Number.NaN }, { value: Number.NaN })).toBe(true);
		expect(shallowEqual({ value: 0 }, { value: -0 })).toBe(false);
		expect(shallowEqual({ nested: {} }, { nested: {} })).toBe(false);
	});

	it("serializes repeated query keys and configurable spaces", () => {
		expect(toQueryString({ active: true, empty: null, id: [2, 1], q: "fast utils" }, { sort: true })).toBe("active=true&id=2&id=1&q=fast+utils");
		expect(toQueryString({ q: "fast utils" }, { prefixQuestionMark: true, space: "percent" })).toBe("?q=fast%20utils");
		expect(() => toQueryString({ value: Number.NaN })).toThrow(RangeError);
	});

	it("uses the DOM serializer as the single style entry", () => {
		expect(serializeStyle([{ fontSize: "14px" }, "display:block"])).toBe("font-size:14px; display:block;");
	});
});

describe("string utilities", () => {
	it("parses URL queries and repeatedly decodes components", () => {
		expect(parseQueryString("https://example.test/?a=1&empty=&a=2#hash")).toEqual({ a: ["1", "2"], empty: "" });
		expect(parseQueryString("https://example.test/path")).toEqual({});
		expect(parseQueryString("https://example.test/#fragment?ignored=true")).toEqual({});
		expect(parseQueryString("redirect=https://example.test/path?tab=one&enabled=true")).toEqual({
			enabled: "true",
			redirect: "https://example.test/path?tab=one",
		});
		const unusual = parseQueryString("__proto__=safe&constructor=plain");
		expect(unusual["__proto__"]).toBe("safe");
		expect(unusual.constructor).toBe("plain");
		expect(Object.getPrototypeOf(unusual)).toBe(Object.prototype);
		expect(decodeURIComponentRepeatedly("%2520")).toBe(" ");
	});

	it("handles JSON, word boundaries, casing, and whitespace", () => {
		expect(isValidJson("null")).toBe(true);
		expect(isValidJson('{"a":}')).toBe(false);
		expect(splitWords("XMLHttp_request-value")).toEqual(["XML", "Http", "request", "value"]);
		expect(camelCase("XMLHttp_request-value")).toBe("xmlHttpRequestValue");
		expect(pascalCase("fast-utils")).toBe("FastUtils");
		expect(kebabCase("FastUtils SDK")).toBe("fast-utils-sdk");
		expect(normalizeWhitespace("  Fast\n\tUtils  ")).toBe("Fast Utils");
		expect(upperFirst("istanbul")).toBe("Istanbul");
		expect(upperFirst("istanbul", "tr")).toBe("İstanbul");
		expect(lowerFirst("Istanbul")).toBe("istanbul");
		expect(lowerFirst("Istanbul", "tr")).toBe("ıstanbul");
		expect(camelCase("I VALUE", "tr")).toBe("ıValue");
		expect(kebabCase("I VALUE", "tr")).toBe("ı-value");
	});

	it("truncates graphemes and escapes HTML text context", () => {
		expect(truncateGraphemes("A👨‍👩‍👧‍👦B", 2)).toBe("A👨‍👩‍👧‍👦…");
		expect(escapeHtml('<a title="x">Tom & Jerry\'s</a>')).toBe("&lt;a title=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
		vi.stubGlobal("Intl", { Segmenter: undefined });
		expect(() => truncateGraphemes("text", 2)).toThrow(Error);
	});

	it("copies text through uni-app, Clipboard API, and the browser fallback", async () => {
		const setClipboardData = vi.fn((options: { data: string; success: () => void }) => {
			options.success();
		});
		vi.stubGlobal("uni", { setClipboardData });
		await copy("uni text");
		expect(setClipboardData.mock.calls[0]?.[0].data).toBe("uni text");

		vi.unstubAllGlobals();
		const writeText = vi.fn((_value: string) => Promise.resolve());
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		vi.stubGlobal("isSecureContext", true);
		await copy("browser text");
		expect(writeText).toHaveBeenCalledWith("browser text");

		vi.unstubAllGlobals();
		const textarea = { focus: vi.fn(), remove: vi.fn(), select: vi.fn(), style: {}, value: "" };
		const appendChild = vi.fn();
		const execCommand = vi.fn((_command: string) => true);
		vi.stubGlobal("navigator", {});
		vi.stubGlobal("isSecureContext", false);
		vi.stubGlobal("document", { body: { appendChild }, createElement: vi.fn(() => textarea), execCommand });
		await copy("fallback text");
		expect(textarea.value).toBe("fallback text");
		expect(execCommand).toHaveBeenCalledWith("copy");
		expect(textarea.remove).toHaveBeenCalledOnce();
	});

	it("creates random strings and UUID v4 identifiers", () => {
		expect(randomString(24, "abc")).toMatch(/^[abc]{24}$/u);
		const id = generateUuidV4();
		expect(isUuidV4(id)).toBe(true);
		expect(() => randomString(4, "aa")).toThrow(RangeError);
		expect(() => randomString(1_000_001)).toThrow(RangeError);
	});

	it("uses the Math.random fallback for every random entry", () => {
		vi.stubGlobal("crypto", undefined);
		for (let index = 0; index < 32; index += 1) expect(randomInt(-5, 5)).toBeGreaterThanOrEqual(-5);
		expect(randomString(24, "abc")).toMatch(/^[abc]{24}$/u);
		expect(isUuidV4(generateUuidV4())).toBe(true);
	});
});

describe("date utilities", () => {
	it("clones valid dates and rejects unsupported or invalid inputs", () => {
		const source = new Date("2024-02-29T12:34:56.789Z");
		const clone = toDate(source);
		expect(clone).not.toBe(source);
		expect(clone.getTime()).toBe(source.getTime());
		expect(isValidDate(source)).toBe(true);
		expect(isValidDate("2024-02-29T00:00:00.000Z")).toBe(true);
		expect(isValidDate({})).toBe(false);
		expect(() => toDate("not-a-date")).toThrow(TypeError);
	});

	it("uses local calendar boundaries and clamps month ends", () => {
		const leapDay = addMonths(new Date(2024, 0, 31, 12), 1);
		expect([leapDay.getMonth(), leapDay.getDate(), leapDay.getHours()]).toEqual([1, 29, 12]);
		const ancientLeapDay = addMonths(new Date("0000-01-31T12:00:00.000Z"), 1);
		expect([ancientLeapDay.getFullYear(), ancientLeapDay.getMonth(), ancientLeapDay.getDate()]).toEqual([0, 1, 29]);
		expect(addDays(new Date(2024, 0, 1), 1).getDate()).toBe(2);
		expect(addYears(new Date(2024, 1, 29), 1).getDate()).toBe(28);
		expect(isSameDay("2024-01-01T01:00:00", "2024-01-01T22:00:00")).toBe(true);
		const [start, end] = getLocalDayBounds(new Date(2024, 0, 1, 12));
		expect([start.getHours(), end.getHours(), end.getMilliseconds()]).toEqual([0, 23, 999]);
		expect(startOfDay(new Date(2024, 0, 1, 12)).getHours()).toBe(0);
		expect(endOfDay(new Date(2024, 0, 1, 12)).getHours()).toBe(23);
		expect(() => addDays(new Date(), 1.5)).toThrow(RangeError);
		expect(() => addYears(new Date(), Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
	});

	it("compares explicit baselines and inclusive intervals", () => {
		const start = new Date("2024-01-01T00:00:00.000Z");
		const end = new Date("2024-01-02T00:00:00.000Z");
		expect(isFuture(end, start)).toBe(true);
		expect(isFuture(start, start)).toBe(false);
		expect(isWithinInterval(start, start, end)).toBe(true);
		expect(isWithinInterval(end, start, end)).toBe(true);
		expect(isWithinInterval("2024-01-03T00:00:00.000Z", start, end)).toBe(false);
		expect(() => isWithinInterval(start, end, start)).toThrow(RangeError);
	});

	it("matches Chinese relative-time output across thresholds, styles, and negative zero", () => {
		const units = [
			["second", 1_000, [0, 1, 2, 30, 59]],
			["minute", 60_000, [1, 2, 59]],
			["hour", 3_600_000, [1, 2, 23]],
			["day", 86_400_000, [1, 2, 6]],
			["week", 604_800_000, [1, 2, 4]],
			["month", 2_629_800_000, [1, 2, 11]],
			["year", 31_557_600_000, [1, 2, 1000]],
		] as const;
		for (const numeric of ["auto", "always"] as const) {
			for (const style of ["long", "short", "narrow"] as const) {
				const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric, style });
				for (const [unit, milliseconds, amounts] of units) {
					for (const count of amounts) {
						for (const sign of [-1, 1]) {
							const difference = count * sign * milliseconds;
							const rounded = Math.round(new Date(difference).getTime() / milliseconds);
							expect(formatRelativeTime(difference, { now: 0, numeric, style })).toBe(formatter.format(rounded, unit));
						}
					}
				}
				expect(formatRelativeTime(-1, { now: 0, numeric, style })).toBe(formatter.format(-0, "second"));
			}
		}
		expect(() => formatRelativeTime(0, { now: 0, numeric: "invalid" as never })).toThrow(RangeError);
		expect(() => formatRelativeTime(0, { now: 0, style: "invalid" as never })).toThrow(RangeError);
	});

	it("retains locale-specific relative-time formatting", () => {
		for (const locale of ["en", "de", "ar", "ja", "zh-TW"]) {
			expect(formatRelativeTime(-86_400_000, { now: 0, locale })).toBe(
				new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day")
			);
		}
	});

	it("formats every supported relative-time unit against an explicit baseline", () => {
		const now = new Date("2024-01-02T00:00:00Z");
		expect(formatRelativeTime(new Date("2024-01-01T00:00:00Z"), { locale: "en", now, numeric: "always" })).toBe("1 day ago");
		const formatFuture = (milliseconds: number) => formatRelativeTime(now.getTime() + milliseconds, { locale: "en", now, numeric: "always" });
		expect(formatFuture(30_000)).toBe("in 30 seconds");
		expect(formatFuture(120_000)).toBe("in 2 minutes");
		expect(formatFuture(7_200_000)).toBe("in 2 hours");
		expect(formatFuture(14 * 86_400_000)).toBe("in 2 weeks");
		expect(formatFuture(60 * 86_400_000)).toBe("in 2 months");
		expect(formatFuture(2 * 365.25 * 86_400_000)).toBe("in 2 years");
	});

	it("rejects calendar arithmetic that exceeds the Date range", () => {
		expect(() => addDays(new Date(0), Number.MAX_SAFE_INTEGER)).toThrow(TypeError);
	});

	it("keeps the seven historical date capabilities as named functions", () => {
		expect(typeof getLocalTimeGreeting()).toBe("string");
		expect(formatChineseRelativeTime(undefined)).toBe("");
		expect(getStartOfToday().getMilliseconds()).toBe(0);
		const [start, end] = createOneMonthRangeFromToday();
		expect(start.getMilliseconds()).toBe(0);
		expect(end.getMilliseconds()).toBe(999);
		expect(createDateShortcuts().map(({ text }) => text)).toEqual(["今天", "昨天", "一周前", "一月前", "一年前"]);
		expect(createDateRangeShortcuts(true).map(({ text }) => text)).toEqual(["后1天", "后3天", "后1周", "后1月", "后3月", "后6月", "后1年"]);
		expect(isDateAfterNow(new Date(Date.now() + 60_000))).toBe(true);
	});
});

describe("color, style, environment, and logger utilities", () => {
	it("parses alpha colors, mixes colors, and computes contrast", () => {
		expect(parseHexColor("#0f08")).toEqual({ alpha: 136 / 255, blue: 0, green: 255, red: 0 });
		expect(formatHexColor({ blue: 0, green: 0, red: 255 })).toBe("#ff0000");
		expect(mixHexColorWithBlack("#ffffff", 1)).toBe("#000000");
		expect(mixHexColorWithWhite("#000000", 1)).toBe("#ffffff");
		expect(relativeLuminance("#000000")).toBe(0);
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
		expect(pickHigherContrastColor("#ffffff")).toBe("#000000");
	});

	it("serializes CSS without losing zero values", () => {
		expect(addCssUnit(0)).toBe("0");
		expect(addCssUnit("1.5", "rem")).toBe("1.5rem");
		expect(addCssUnit("0x10")).toBe("0x10");
		expect(serializeStyle([{ fontSize: "14px", msTransition: "all 1s" }, { color: undefined }, "display:block"])).toBe(
			"font-size:14px; -ms-transition:all 1s; display:block;"
		);
		expect(() => serializeStyle({ opacity: Number.NaN })).toThrow(RangeError);
	});

	it("detects explicit user agents without relying on method binding", () => {
		expect(isMobileUserAgent("Mozilla/5.0 iPhone Mobile")).toBe(true);
		expect(isTabletUserAgent("Mozilla/5.0 Macintosh", 5)).toBe(true);
		expect(detectRuntime()).toBe("node");
		expect(hasWebCrypto()).toBe(true);
		vi.stubGlobal("crypto", { getRandomValues: vi.fn(), subtle: null });
		expect(hasWebCrypto()).toBe(false);
		vi.unstubAllGlobals();
		vi.stubGlobal("importScripts", vi.fn());
		expect(detectRuntime()).toBe("worker");
		vi.unstubAllGlobals();
		vi.stubGlobal("window", { document: {} });
		expect(detectRuntime()).toBe("browser");
	});

	it("detects uni-app after its runtime object is injected", () => {
		expect(isUniApp()).toBe(false);
		vi.stubGlobal("uni", {});
		expect(isUniApp()).toBe(true);
		vi.unstubAllGlobals();
		expect(isUniApp()).toBe(false);
	});

	it("creates isolated scoped loggers with severity filtering", () => {
		const sink = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
		const customLogger = createLogger({ level: "warn", prefix: "Test", sink });
		customLogger.log("storage", "ignored");
		customLogger.warn("storage", "expired", { key: "a" });
		customLogger.error("storage", { code: 500 });
		expect(sink.log).not.toHaveBeenCalled();
		expect(sink.warn).toHaveBeenCalledWith("[Test:storage]", "expired", { key: "a" });
		expect(sink.error).toHaveBeenCalledWith("[Test:storage]", { code: 500 });
		expect(() => createLogger({ level: "trace" as never, sink })).toThrow(RangeError);
		expect(() => createLogger({ level: "info" as never, sink })).toThrow(RangeError);
		expect(() => createLogger({ prefix: 1 as never, sink })).toThrow(RangeError);
		expect(() => {
			customLogger.warn("", "invalid");
		}).toThrow(RangeError);
	});

	it("configures the stable default logger and accepts data without a message", () => {
		vi.stubGlobal("uni", {});
		vi.stubGlobal("plus", {});
		const sink = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
		const loggerReference = defaultLogger;
		try {
			configureLogger({ prefix: "App", sink, uniAppPlusSplit: true });
			const apiResponse = { code: 200, data: { id: 1 } };
			loggerReference.log("Launch", apiResponse);
			defaultLogger.debug("Launch");
			expect(sink.log).toHaveBeenNthCalledWith(1, "[App:Launch]");
			expect(sink.log).toHaveBeenNthCalledWith(2, '{\n  "code": 200,\n  "data": {\n    "id": 1\n  }\n}');
			expect(sink.debug).toHaveBeenCalledWith("[App:Launch]");
		} finally {
			configureLogger();
			vi.unstubAllGlobals();
		}
	});

	it("splits uni-app App-Plus data into HBuilderX-friendly lines", () => {
		vi.stubGlobal("uni", {});
		vi.stubGlobal("plus", {});
		const sink = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
		const circular: { self?: unknown } = {};
		circular.self = circular;
		const logger = createLogger({ level: "debug", sink, uniAppPlusSplit: true });
		const error = new Error("failed");
		logger.log("network", "request", { id: 1 }, 2n, circular);
		logger.debug("network", "debug", { id: 2 });
		logger.warn("network", "warn", { id: 3 });
		logger.error("network", "error", error);
		expect(sink.log).toHaveBeenCalledTimes(4);
		expect(sink.log).toHaveBeenNthCalledWith(1, "[Fast:network] request");
		expect(sink.log).toHaveBeenNthCalledWith(2, '{\n  "id": 1\n}');
		expect(sink.log).toHaveBeenNthCalledWith(3, "2n");
		expect(sink.log).toHaveBeenNthCalledWith(4, '{\n  "self": "[Circular]"\n}');
		expect(sink.debug).toHaveBeenNthCalledWith(1, "[Fast:network] debug");
		expect(sink.debug).toHaveBeenNthCalledWith(2, '{\n  "id": 2\n}');
		expect(sink.warn).toHaveBeenNthCalledWith(1, "[Fast:network] warn");
		expect(sink.warn).toHaveBeenNthCalledWith(2, '{\n  "id": 3\n}');
		expect(sink.error).toHaveBeenNthCalledWith(1, "[Fast:network] error");
		expect(sink.error).toHaveBeenNthCalledWith(2, error.stack ?? "Error: failed");
	});
});
