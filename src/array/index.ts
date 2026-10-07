/** 从数组项中提取可比较键的函数 */
export type KeySelector<Item, Key> = (item: Item, index: number) => Key;

/**
 * 将只读数组按固定大小分组。
 *
 * @typeParam Item - 数组项类型
 * @param items - 不会被修改的输入数组
 * @param size - 每组最多包含的项目数，必须是正安全整数。
 * @returns 新建的二维数组；最后一组可能小于 `size`。
 * @throws `RangeError` 当 `size` 不是正安全整数。
 */
export function chunk<Item>(items: readonly Item[], size: number): Item[][] {
	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new RangeError("`size` must be a positive safe integer.");
	}

	const result: Item[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

/**
 * 删除数组中的 `null` 与 `undefined`，保留 `false`、`0` 和空字符串。
 *
 * @param items - 可包含空值的只读数组
 * @returns 保持原顺序的新数组
 */
export function removeNullishValues<Item>(items: readonly (Item | null | undefined)[]): Item[] {
	return items.filter((item): item is Item => item !== null && item !== undefined);
}

/**
 * 使用 JavaScript `Set` 的 SameValueZero 语义去重。
 *
 * @param items - 不会被修改的输入数组
 * @returns 保留每个值首次出现顺序的新数组；稀疏数组空位被忽略。
 */
export function unique<Item>(items: readonly Item[]): Item[] {
	const result: Item[] = [];
	const seen = new Set<Item>();
	for (let index = 0; index < items.length; index += 1) {
		if (!(index in items)) continue;
		const item = items[index] as Item;
		if (seen.has(item)) continue;
		seen.add(item);
		result.push(item);
	}
	return result;
}

/**
 * 按选择器返回的键去重。
 *
 * @param items - 不会被修改的输入数组
 * @param selectKey - 接收项目与索引并返回去重键的函数
 * @returns 保留每个键首次出现项目的新数组；稀疏数组空位被忽略。
 */
export function uniqueBy<Item, Key>(items: readonly Item[], selectKey: KeySelector<Item, Key>): Item[] {
	const seen = new Set<Key>();
	const result: Item[] = [];
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (item === undefined && !(index in items)) continue;
		const key = selectKey(item as Item, index);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(item as Item);
	}
	return result;
}

/**
 * 按选择器结果分组。
 *
 * @param items - 不会被修改的输入数组
 * @param selectKey - 返回任意 `Map` 键的函数
 * @returns 按键首次出现顺序排列的 `Map`；每个分组保持输入顺序，稀疏空位被忽略。
 */
export function groupBy<Item, Key>(items: readonly Item[], selectKey: KeySelector<Item, Key>): Map<Key, Item[]> {
	const groups = new Map<Key, Item[]>();
	items.forEach((item, index) => {
		const key = selectKey(item, index);
		const group = groups.get(key);
		if (group === undefined) groups.set(key, [item]);
		else group.push(item);
	});
	return groups;
}

/**
 * 按谓词把数组拆分为匹配项和非匹配项。
 *
 * @param items - 不会被修改的输入数组
 * @param predicate - 接收项目与索引的判断函数
 * @returns 二元组：第一项匹配谓词，第二项不匹配；两组都保持原顺序并忽略稀疏空位。
 */
export function partition<Item>(items: readonly Item[], predicate: (item: Item, index: number) => boolean): [matched: Item[], unmatched: Item[]] {
	const matched: Item[] = [];
	const unmatched: Item[] = [];
	items.forEach((item, index) => (predicate(item, index) ? matched : unmatched).push(item));
	return [matched, unmatched];
}

/**
 * 返回只出现在左侧数组中的不同值。
 *
 * @param left - 主输入数组
 * @param right - 需要排除的值
 * @returns 保留左侧首次出现顺序的去重结果；两侧稀疏空位都被忽略。
 */
export function difference<Item>(left: readonly Item[], right: readonly Item[]): Item[] {
	const excluded = new Set(unique(right));
	return unique(left).filter((item) => !excluded.has(item));
}

/**
 * 返回两个数组共有的不同值。
 *
 * @param left - 决定结果顺序的数组
 * @param right - 用于成员判断的数组
 * @returns 保留左侧首次出现顺序的去重结果；两侧稀疏空位都被忽略。
 */
export function intersection<Item>(left: readonly Item[], right: readonly Item[]): Item[] {
	const included = new Set(unique(right));
	return unique(left).filter((item) => included.has(item));
}

/**
 * 返回只存在于其中一个数组的不同值。
 *
 * @param left - 决定左侧结果顺序的数组
 * @param right - 决定右侧结果顺序的数组
 * @returns 先按左侧、再按右侧首次出现顺序排列的对称差集；使用 SameValueZero 比较并忽略稀疏空位。
 */
export function symmetricDifference<Item>(left: readonly Item[], right: readonly Item[]): Item[] {
	const leftValues = unique(left);
	const rightValues = unique(right);
	const leftSet = new Set(leftValues);
	const rightSet = new Set(rightValues);
	return [...leftValues.filter((item) => !rightSet.has(item)), ...rightValues.filter((item) => !leftSet.has(item))];
}

/**
 * 判断选择器产生的键是否重复。
 *
 * @param items - 不会被修改的输入数组
 * @param selectKey - 返回比较键的函数；键使用 SameValueZero 语义比较。
 * @returns 存在至少一个重复键时返回 `true`。
 */
export function hasDuplicatesBy<Item, Key>(items: readonly Item[], selectKey: KeySelector<Item, Key>): boolean {
	const seen = new Set<Key>();
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (item === undefined && !(index in items)) continue;
		const key = selectKey(item as Item, index);
		if (seen.has(key)) return true;
		seen.add(key);
	}
	return false;
}

/**
 * 判断所有项目是否具有相同的选择器结果。
 *
 * @remarks 空数组、只有稀疏空位的数组和单项数组按数学惯例返回 `true`；空位不会调用选择器。
 * @param items - 不会被修改的输入数组
 * @param selectKey - 返回比较键的函数
 * @returns 所有键都满足 SameValueZero 相等时返回 `true`。
 */
export function allEqualBy<Item, Key>(items: readonly Item[], selectKey: KeySelector<Item, Key>): boolean {
	let first: Key | undefined;
	let hasFirst = false;
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (item === undefined && !(index in items)) continue;
		const current = selectKey(item as Item, index);
		if (!hasFirst) {
			first = current;
			hasFirst = true;
			continue;
		}
		if (!(first === current || (Number.isNaN(first) && Number.isNaN(current)))) return false;
	}
	return true;
}
