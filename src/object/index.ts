/** URL 查询参数支持的单值类型。 */
export type QueryPrimitive = bigint | boolean | number | string | null | undefined;

/** URL 查询参数值；数组使用重复键表示。 */
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[];

/**
 * 判断 Query Value 是否为重复参数数组。
 *
 * @param value - 单值或数组形式的 Query Value。
 * @returns 是只读原始值数组时返回 `true`。
 */
const isQueryPrimitiveArray = (value: QueryValue): value is readonly QueryPrimitive[] => Array.isArray(value);

/** {@link toQueryString} 的序列化选项。 */
export interface QueryStringOptions {
	/** 返回非空结果时是否添加 `?`；默认 `false`。 */
	prefixQuestionMark?: boolean;
	/** 是否按键的 UTF-16 码元顺序稳定排序；默认保留对象枚举顺序。 */
	sort?: boolean;
	/** 空格编码方式；默认遵循表单编码并输出 `+`。 */
	space?: "percent" | "plus";
}

/**
 * 安全写入结果对象的自有可枚举属性。
 *
 * @remarks 使用 `defineProperty` 避免 `__proto__` 触发 Setter，并统一创建可写、可配置的自有可枚举数据属性。
 * @param target - 要写入的结果对象。
 * @param key - 自有属性键。
 * @param value - 属性值。
 */
const defineEnumerableProperty = (target: object, key: PropertyKey, value: unknown): void => {
	Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true });
};

const typedArrayTags = new Set([
	"[object BigInt64Array]",
	"[object BigUint64Array]",
	"[object Float32Array]",
	"[object Float64Array]",
	"[object Int8Array]",
	"[object Int16Array]",
	"[object Int32Array]",
	"[object Uint8Array]",
	"[object Uint8ClampedArray]",
	"[object Uint16Array]",
	"[object Uint32Array]",
]);

/** 使用源值的构造器创建同类空实例。 */
const createUsingConstructor = (value: object, arguments_: readonly unknown[]): object => {
	const constructor: unknown = Reflect.get(value, "constructor");
	return typeof constructor === "function" ? (Reflect.construct(constructor, arguments_) as object) : {};
};

/** 复制 ArrayBufferLike 的当前字节，不与源值共享底层内存。 */
const cloneArrayBuffer = (value: ArrayBufferLike): ArrayBufferLike => {
	const result = createUsingConstructor(value, [value.byteLength]) as ArrayBufferLike;
	new Uint8Array(result).set(new Uint8Array(value));
	return result;
};

/** 递归复制值，并记录已复制对象以还原循环引用和共享引用。 */
const cloneDeepValue = (value: unknown, clones: WeakMap<object, object>, isRoot: boolean): unknown => {
	if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;

	const source = value;
	const existing = clones.get(source);
	if (existing !== undefined) return existing;
	if (typeof source === "function" && !isRoot) return source;

	const tag = Object.prototype.toString.call(source);
	let result: object;
	let pendingBuffer: { source: ArrayBufferLike; result: ArrayBufferLike } | undefined;
	// 先登记底层缓冲区，视图登记后再复制其附加属性，避免缓冲区与视图相互引用时重复构造。
	const getBufferClone = (buffer: ArrayBufferLike): ArrayBufferLike => {
		const existingBuffer = clones.get(buffer);
		if (existingBuffer !== undefined) return existingBuffer as ArrayBufferLike;
		const clonedBuffer = cloneArrayBuffer(buffer);
		clones.set(buffer, clonedBuffer);
		pendingBuffer = { source: buffer, result: clonedBuffer };
		return clonedBuffer;
	};
	if (Array.isArray(source)) {
		// 只复制实际存在的自有可枚举键，保留空洞、附加字符串属性和 Symbol 属性。
		result = createUsingConstructor(source, [source.length]);
	} else if (typeof source === "function") {
		result = {};
	} else {
		switch (tag) {
			case "[object Arguments]":
				result = {};
				break;
			case "[object ArrayBuffer]":
			case "[object SharedArrayBuffer]":
				result = cloneArrayBuffer(source as ArrayBufferLike);
				break;
			case "[object Boolean]":
				result = createUsingConstructor(source, [(source as { valueOf: () => boolean }).valueOf()]);
				break;
			case "[object DataView]": {
				const view = source as DataView;
				result = createUsingConstructor(source, [getBufferClone(view.buffer), view.byteOffset, view.byteLength]);
				break;
			}
			case "[object Date]":
				result = createUsingConstructor(source, [(source as Date).getTime()]);
				break;
			case "[object Map]":
			case "[object Set]":
				result = createUsingConstructor(source, []);
				break;
			case "[object Number]":
				result = createUsingConstructor(source, [(source as { valueOf: () => number }).valueOf()]);
				break;
			case "[object Object]": {
				const prototype = Object.getPrototypeOf(source) as object | null;
				result = Object.create(prototype) as object;
				break;
			}
			case "[object RegExp]": {
				const expression = source as RegExp;
				const clonedExpression = new RegExp(expression.source, expression.flags);
				clonedExpression.lastIndex = expression.lastIndex;
				result = clonedExpression;
				break;
			}
			case "[object String]":
				result = createUsingConstructor(source, [(source as { valueOf: () => string }).valueOf()]);
				break;
			case "[object Symbol]":
				result = Object((source as { valueOf: () => symbol }).valueOf()) as object;
				break;
			default: {
				if (!typedArrayTags.has(tag)) return isRoot ? {} : source;
				const view = source as ArrayBufferView & { readonly length: number };
				result = createUsingConstructor(source, [getBufferClone(view.buffer), view.byteOffset, view.length]);
			}
		}
	}

	clones.set(source, result);
	if (pendingBuffer !== undefined) {
		copyCloneProperties(pendingBuffer.source, pendingBuffer.result, clones);
	}
	if (tag === "[object Map]") {
		for (const [key, item] of source as Map<unknown, unknown>) {
			(result as Map<unknown, unknown>).set(key, cloneDeepValue(item, clones, false));
		}
	} else if (tag === "[object Set]") {
		for (const item of source as Set<unknown>) {
			(result as Set<unknown>).add(cloneDeepValue(item, clones, false));
		}
	}

	copyCloneProperties(source, result, clones);
	return result;
};

/** 复制自有可枚举属性，不触发结果原型上的 setter。 */
function copyCloneProperties(source: object, result: object, clones: WeakMap<object, object>): void {
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		const descriptor = Object.getOwnPropertyDescriptor(result, key);
		// String 包装对象的字符索引由构造器建立，不能重新定义。
		if (descriptor?.configurable === false && descriptor.writable === false) continue;
		defineEnumerableProperty(result, key, cloneDeepValue(Reflect.get(source, key), clones, false));
	}
}

/** 深度比较过程中用于识别循环引用的双向对象映射。 */
interface EqualityState {
	readonly leftObjects: WeakMap<object, object>;
	readonly rightObjects: WeakMap<object, object>;
}

/** 判断两个值是否满足 SameValueZero 相等。 */
const sameValueZero = (left: unknown, right: unknown): boolean =>
	left === right || (typeof left === "number" && typeof right === "number" && Number.isNaN(left) && Number.isNaN(right));

/** 返回对象的自有可枚举字符串与 Symbol 键。 */
const getEnumerableOwnKeys = (value: object): PropertyKey[] =>
	Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));

/** 在一次递归分支内记录对象对应关系。 */
const compareTrackedPair = (left: object, right: object, state: EqualityState, compare: () => boolean): boolean => {
	const existingRight = state.leftObjects.get(left);
	const existingLeft = state.rightObjects.get(right);
	if (existingRight !== undefined || existingLeft !== undefined) return existingRight === right && existingLeft === left;
	state.leftObjects.set(left, right);
	state.rightObjects.set(right, left);
	try {
		return compare();
	} finally {
		state.leftObjects.delete(left);
		state.rightObjects.delete(right);
	}
};

/** 按字节比较两个 ArrayBufferLike。 */
const equalArrayBuffers = (left: ArrayBufferLike, right: ArrayBufferLike): boolean => {
	if (left.byteLength !== right.byteLength) return false;
	const leftBytes = new Uint8Array(left);
	const rightBytes = new Uint8Array(right);
	for (let index = 0; index < leftBytes.length; index += 1) {
		if (leftBytes[index] !== rightBytes[index]) return false;
	}
	return true;
};

/** 按顺序比较数组或 TypedArray 的元素。 */
const equalIndexedValues = (
	left: { readonly [index: number]: unknown; readonly length: number },
	right: { readonly [index: number]: unknown; readonly length: number },
	state: EqualityState
): boolean => {
	if (left.length !== right.length) return false;
	return compareTrackedPair(left, right, state, () => {
		for (let index = 0; index < left.length; index += 1) {
			if (!isEqualValue(left[index], right[index], state)) return false;
		}
		return true;
	});
};

/** 无序比较 Map 条目或 Set 元素。 */
const equalUnorderedValues = (left: readonly unknown[], right: readonly unknown[], state: EqualityState): boolean => {
	if (left.length !== right.length) return false;
	const matchedIndexes = new Set<number>();
	for (const leftValue of left) {
		let matchedIndex = -1;
		for (let index = 0; index < right.length; index += 1) {
			if (matchedIndexes.has(index) || !isEqualValue(leftValue, right[index], state)) continue;
			matchedIndex = index;
			break;
		}
		if (matchedIndex < 0) return false;
		matchedIndexes.add(matchedIndex);
	}
	return true;
};

/** 比较普通对象或 Arguments 的自有可枚举属性与构造器。 */
const equalObjects = (left: object, right: object, state: EqualityState): boolean => {
	const leftKeys = getEnumerableOwnKeys(left);
	const rightKeys = getEnumerableOwnKeys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const key of leftKeys) {
		if (!Object.hasOwn(right, key)) return false;
	}

	return compareTrackedPair(left, right, state, () => {
		let compareConstructors = true;
		for (const key of leftKeys) {
			if (!isEqualValue(Reflect.get(left, key), Reflect.get(right, key), state)) return false;
			if (key === "constructor") compareConstructors = false;
		}
		if (!compareConstructors) return true;
		const leftConstructor: unknown = Reflect.get(left, "constructor");
		const rightConstructor: unknown = Reflect.get(right, "constructor");
		if (leftConstructor === rightConstructor || !("constructor" in left && "constructor" in right)) return true;
		return (
			typeof leftConstructor === "function" &&
			typeof rightConstructor === "function" &&
			leftConstructor instanceof leftConstructor &&
			rightConstructor instanceof rightConstructor
		);
	});
};

/** 递归比较两个值。 */
function isEqualValue(left: unknown, right: unknown, state: EqualityState): boolean {
	if (sameValueZero(left, right)) return true;
	if (left === null || left === undefined || right === null || right === undefined) return false;

	const leftTag = Object.prototype.toString.call(left);
	const rightTag = Object.prototype.toString.call(right);
	const normalizedLeftTag = leftTag === "[object Arguments]" ? "[object Object]" : leftTag;
	const normalizedRightTag = rightTag === "[object Arguments]" ? "[object Object]" : rightTag;
	if (normalizedLeftTag !== normalizedRightTag) return false;

	switch (normalizedLeftTag) {
		case "[object Boolean]":
		case "[object Date]":
		case "[object Number]":
			return sameValueZero(Number(left), Number(right));
		case "[object Error]":
			return (left as Error).name === (right as Error).name && (left as Error).message === (right as Error).message;
		case "[object RegExp]":
			return RegExp.prototype.toString.call(left) === RegExp.prototype.toString.call(right);
		case "[object String]":
			return String.prototype.valueOf.call(left) === String.prototype.valueOf.call(right);
		case "[object Symbol]":
			return Symbol.prototype.valueOf.call(left) === Symbol.prototype.valueOf.call(right);
	}

	if (typeof left !== "object" || typeof right !== "object") return false;
	if (Array.isArray(left) && Array.isArray(right)) return equalIndexedValues(left, right, state);
	if (normalizedLeftTag === "[object ArrayBuffer]" || normalizedLeftTag === "[object SharedArrayBuffer]") {
		return equalArrayBuffers(left as ArrayBufferLike, right as ArrayBufferLike);
	}
	if (normalizedLeftTag === "[object DataView]") {
		const leftView = left as DataView;
		const rightView = right as DataView;
		return (
			leftView.byteLength === rightView.byteLength &&
			leftView.byteOffset === rightView.byteOffset &&
			equalArrayBuffers(leftView.buffer, rightView.buffer)
		);
	}
	if (typedArrayTags.has(normalizedLeftTag)) {
		return equalIndexedValues(
			left as ArrayBufferView & { readonly [index: number]: unknown; readonly length: number },
			right as ArrayBufferView & { readonly [index: number]: unknown; readonly length: number },
			state
		);
	}
	if (normalizedLeftTag === "[object Map]") {
		return compareTrackedPair(left, right, state, () =>
			equalUnorderedValues([...(left as Map<unknown, unknown>)], [...(right as Map<unknown, unknown>)], state)
		);
	}
	if (normalizedLeftTag === "[object Set]") {
		return compareTrackedPair(left, right, state, () => equalUnorderedValues([...(left as Set<unknown>)], [...(right as Set<unknown>)], state));
	}
	if (normalizedLeftTag === "[object Object]") return equalObjects(left, right, state);
	return false;
}

/**
 * 判断值是否是普通对象。
 *
 * @param value - 任意待检查值。
 * @returns 原型为 `Object.prototype` 或 `null` 时返回 `true`。
 */
export function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value) as object | null;
	return prototype === null || prototype === Object.prototype;
}

/**
 * 安全判断对象是否拥有自己的属性。
 *
 * @remarks 不调用可能被对象覆盖的 `hasOwnProperty`。
 * @param value - 待检查对象。
 * @param key - 字符串、数字或 Symbol 属性键。
 * @returns 属性为对象自有属性时返回 `true`，并收窄键类型。
 */
export function hasOwn<ObjectType extends object, Key extends PropertyKey>(value: ObjectType, key: Key): key is Key & keyof ObjectType {
	return Object.hasOwn(value, key);
}

/**
 * 递归创建值的深层副本。
 *
 * @remarks 支持循环引用、共享引用、Symbol 键、对象原型、ArrayBuffer、DataView、Date、Map、RegExp、Set 和 TypedArray。
 * Map 的键保持原引用，函数及其他不可克隆值在嵌套位置保持原引用；只复制自有可枚举属性。
 * @param value - 需要深复制的任意值。
 * @returns 与输入类型一致且不共享可克隆嵌套值的新值；原始类型直接返回自身。
 */
export function cloneDeep<Value>(value: Value): Value {
	return cloneDeepValue(value, new WeakMap(), true) as Value;
}

/**
 * 深度比较两个值是否等价。
 *
 * @remarks 原始值使用 SameValueZero 语义；支持循环引用、数组、对象、ArrayBuffer、DataView、Date、Error、Map、RegExp、Set、Symbol 和 TypedArray。
 * 对象只比较自有可枚举字符串与 Symbol 属性，函数及其他不支持的宿主对象仅在引用相同时相等。
 * @param left - 第一待比较值。
 * @param right - 第二待比较值。
 * @returns 两个值深度等价时返回 `true`。
 */
export function isEqual(left: unknown, right: unknown): boolean {
	return isEqualValue(left, right, { leftObjects: new WeakMap(), rightObjects: new WeakMap() });
}

/**
 * 从对象中选择指定自有可枚举属性。
 *
 * @remarks 固定键元组保留精确返回类型；动态数组中可能被选择或排除的键在返回类型中保持可选。
 * @param source - 不会被修改的源对象。
 * @param keys - 需要保留的键；不存在的键被忽略。
 * @returns 新对象，保持 `keys` 的遍历顺序。
 */
export function pick<Source extends object, const Keys extends readonly (keyof Source)[]>(
	source: Source,
	keys: Keys
): number extends Keys["length"] ? Partial<Pick<Source, Keys[number]>> : Pick<Source, Keys[number]>;
export function pick<Source extends object>(source: Source, keys: readonly PropertyKey[]): Partial<Source>;
export function pick<Source extends object>(source: Source, keys: readonly PropertyKey[]): Partial<Source> {
	const result: Partial<Source> = {};
	for (const key of keys) {
		if (Object.prototype.propertyIsEnumerable.call(source, key)) defineEnumerableProperty(result, key, Reflect.get(source, key));
	}
	return result;
}

/**
 * 浅复制对象并删除指定属性。
 *
 * @remarks 固定键元组保留精确返回类型；动态数组中可能被选择或排除的键在返回类型中保持可选。
 * @param source - 不会被修改的源对象。
 * @param keys - 需要排除的键。
 * @returns 包含其余自有可枚举字符串与 Symbol 属性的新对象。
 */
export function omit<Source extends object, const Keys extends readonly (keyof Source)[]>(
	source: Source,
	keys: Keys
): number extends Keys["length"] ? Omit<Source, Keys[number]> & Partial<Pick<Source, Keys[number]>> : Omit<Source, Keys[number]>;
export function omit<Source extends object>(source: Source, keys: readonly PropertyKey[]): Partial<Source>;
export function omit<Source extends object>(source: Source, keys: readonly PropertyKey[]): Partial<Source> {
	const result = { ...source };
	for (const key of keys) Reflect.deleteProperty(result, key);
	return result;
}

/**
 * 按条件排除对象的自有可枚举属性。
 *
 * @param source - 不会被修改的源对象。
 * @param predicate - 接收属性值、键和源对象；返回真值时排除该属性。
 * @returns 由未匹配属性组成的新对象。
 */
export function omitBy<Source extends object>(
	source: Source,
	predicate: (value: Source[keyof Source], key: keyof Source, source: Source) => unknown
): Partial<Source> {
	const result: Partial<Source> = {};
	for (const key of getEnumerableOwnKeys(source) as (keyof Source)[]) {
		if (!predicate(source[key], key, source)) defineEnumerableProperty(result, key, source[key]);
	}
	return result;
}

/**
 * 按条件选择对象的自有可枚举属性。
 *
 * @param source - 不会被修改的源对象。
 * @param predicate - 接收属性值、键和源对象；返回真值时保留该属性。
 * @returns 由匹配属性组成的新对象。
 */
export function pickBy<Source extends object>(
	source: Source,
	predicate: (value: Source[keyof Source], key: keyof Source, source: Source) => unknown
): Partial<Source> {
	const result: Partial<Source> = {};
	for (const key of getEnumerableOwnKeys(source) as (keyof Source)[]) {
		if (predicate(source[key], key, source)) defineEnumerableProperty(result, key, source[key]);
	}
	return result;
}

/**
 * 映射对象的自有可枚举属性值。
 *
 * @param source - 不会被修改的源对象。
 * @param mapper - 接收值、键和源对象的映射函数。
 * @returns 保留原键的新对象。
 */
export function mapValues<Source extends object, Result>(
	source: Source,
	mapper: (value: Source[keyof Source], key: keyof Source, source: Source) => Result
): { [Key in keyof Source]: Result } {
	const result = {} as { [Key in keyof Source]: Result };
	for (const key of Reflect.ownKeys(source) as (keyof Source)[]) {
		if (Object.prototype.propertyIsEnumerable.call(source, key)) defineEnumerableProperty(result, key, mapper(source[key], key, source));
	}
	return result;
}

/**
 * 对自有可枚举属性执行 SameValue 浅比较。
 *
 * @remarks 嵌套对象只比较引用；`NaN` 相等，`0` 与 `-0` 不相等。
 * @param left - 第一对象。
 * @param right - 第二对象。
 * @returns 自有可枚举键集合与对应值均满足 SameValue 时返回 `true`。
 */
export function shallowEqual(left: object, right: object): boolean {
	if (Object.is(left, right)) return true;
	const leftKeys = Reflect.ownKeys(left).filter((key) => Object.prototype.propertyIsEnumerable.call(left, key));
	const rightKeys = Reflect.ownKeys(right).filter((key) => Object.prototype.propertyIsEnumerable.call(right, key));
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => Object.hasOwn(right, key) && Object.is(Reflect.get(left, key), Reflect.get(right, key)));
}

/**
 * 把 Query 原始值规范化为文本。
 *
 * @param value - 已排除空值的字符串、数字、布尔值或 BigInt。
 * @returns 与 URLSearchParams 兼容的文本值。
 * @throws `RangeError` 当数字不是有限值。
 */
const serializeQueryValue = (value: Exclude<QueryPrimitive, null | undefined>): string => {
	if (typeof value === "number" && !Number.isFinite(value)) {
		throw new RangeError("查询参数中的数字必须是有限数。");
	}
	return String(value);
};

/**
 * 将对象序列化为标准 URL 查询字符串。
 *
 * @remarks `null` 与 `undefined` 被跳过；数组使用重复键；返回值不会修改输入。
 * @param value - 查询参数对象。
 * @param options - 排序、空格和问号前缀选项。
 * @returns URL 编码后的查询字符串；没有参数时始终返回空字符串。
 * @throws `RangeError` 当参数包含 `NaN` 或无穷数字。
 */
export function toQueryString(value: Readonly<Record<string, QueryValue>>, options: QueryStringOptions = {}): string {
	const entries = Object.entries(value);
	if (options.sort) entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	const parameters = new URLSearchParams();
	for (const [key, rawValue] of entries) {
		const values = isQueryPrimitiveArray(rawValue) ? rawValue : [rawValue];
		for (const item of values) {
			if (item !== null && item !== undefined) parameters.append(key, serializeQueryValue(item));
		}
	}
	let result = parameters.toString();
	if (options.space === "percent") result = result.replace(/\+/gu, "%20");
	return result && options.prefixQuestionMark ? `?${result}` : result;
}
