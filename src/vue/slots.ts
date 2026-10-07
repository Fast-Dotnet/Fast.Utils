import type { SlotsType, VNode } from "vue";

/** Slot 名到 Props 类型的内部声明映射 */
type RawSlots = Record<string, unknown>;
/** 根据 Slot Props 是否为 never 生成无参数或有参数的 Slot 签名 */
type VueSlot<Properties> = [Properties] extends [never] ? () => VNode[] : (properties: Properties) => VNode[];

/** 把 Slot 名称与作用域参数映射为 Vue 3 Slot 函数 */
export type TypedSlots<Slots extends RawSlots> = {
	[Name in keyof Slots]: VueSlot<Slots[Name]>;
};

/** Vue 3 `slots` 选项接受的运行时声明与官方静态类型标记 */
export type TypedSlotsDeclaration<Slots extends RawSlots> = SlotsType<Partial<TypedSlots<Slots>>>;

/**
 * 为 Options API 的 `slots` 选项创建带作用域参数的类型声明。
 *
 * @returns 运行时 `Object` 构造器，并携带仅供 TypeScript 使用的 Slot 类型标记。
 */
export function makeSlots<Slots extends RawSlots>(): TypedSlotsDeclaration<Slots> {
	return Object as TypedSlotsDeclaration<Slots>;
}
