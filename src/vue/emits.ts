import { computed } from "vue";
import type { ComputedRef } from "vue";

/** Vue Emits 对象中允许的校验器形状 */
type EmitValidator = ((...arguments_: never[]) => unknown) | null;
/** 事件名到可选参数校验器的内部映射 */
type EmitsOptions = Record<string, EmitValidator>;
/** 从校验器中提取事件参数；无校验器时保留未知参数。 */
type EventArguments<Validator> = Validator extends (...arguments_: infer Arguments) => unknown ? Arguments : unknown[];
/** 在类型层递归把 kebab-case 事件名转换为 PascalCase */
type PascalEventName<Value extends string> = Value extends `${infer Head}-${infer Tail}`
	? `${Capitalize<Head>}${PascalEventName<Tail>}`
	: Capitalize<Value>;

/** 把事件配置映射为 Vue `onXxx` 属性 */
export type EmitHandlers<Emits extends EmitsOptions> = {
	[Name in keyof Emits as Name extends string ? `on${PascalEventName<Name>}` : never]: (...arguments_: EventArguments<Emits[Name]>) => void;
};

/**
 * 把事件名转换为 Vue Handler Prop 名称。
 *
 * @param eventName - Emits 对象中的原始事件名，可使用 kebab-case。
 * @returns `onPascalCase` 形式的属性名
 * @throws `TypeError` 当事件名包含空片段或无法生成有效 Handler 名称。
 */
const toHandlerName = (eventName: string): string => {
	return `on${eventName
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("")}`;
};

/**
 * 构建响应式 Vue 事件处理器。
 *
 * @param emits - Vue emits 配置对象
 * @param emit - `setup` 上下文提供的 emit 函数
 * @param ignoredEvents - 不需要向子组件透传的事件名
 * @returns 随配置重新计算的事件处理器对象
 */
export function useEmits<Emits extends EmitsOptions>(
	emits: Emits,
	emit: (...arguments_: never[]) => unknown,
	ignoredEvents: readonly (keyof Emits)[] = []
): ComputedRef<Partial<EmitHandlers<Emits>>> {
	const ignored = new Set<PropertyKey>(ignoredEvents);
	const emitEvent = emit as (eventName: string, ...arguments_: unknown[]) => void;
	return computed<Partial<EmitHandlers<Emits>>>(() => {
		const handlers = {} as Partial<EmitHandlers<Emits>>;
		const handlerNames = new Set<string>();
		for (const eventName of Object.keys(emits)) {
			if (ignored.has(eventName)) continue;
			if (eventName.length === 0 || /\s/u.test(eventName)) throw new TypeError(`Invalid Vue event name: "${eventName}".`);
			const handlerName = toHandlerName(eventName);
			if (handlerNames.has(handlerName)) {
				throw new TypeError(`Multiple Vue events map to the same handler property: "${handlerName}".`);
			}
			handlerNames.add(handlerName);
			Object.defineProperty(handlers, handlerName, {
				enumerable: true,
				value: (...arguments_: unknown[]) => {
					emitEvent(eventName, ...arguments_);
				},
				writable: true,
			});
		}
		return handlers;
	});
}
