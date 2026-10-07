import { computed } from "vue";
import type { ComputedRef, PropType } from "vue";

/**
 * 为 Vue 运行时 Props 构造器附加泛型类型。
 *
 * @remarks 该函数只帮助 TypeScript 建模，不验证运行时值与 `Value` 一致；调用方仍应
 * 传入 Vue 支持的构造器或构造器数组。
 * @param runtimeType - Vue 支持的运行时构造器或构造器数组
 * @returns 同一引用，仅在类型层收窄为 `PropType<Value>`。
 */
export function definePropType<Value>(runtimeType: unknown): PropType<Value> {
	return runtimeType as PropType<Value>;
}

/**
 * 构建需要透传给子组件的响应式 Props。
 *
 * @param props - Vue `setup` 接收的只读响应式 Props 对象
 * @param rawProps - 子组件的运行时 Props 配置
 * @param ignoredProps - 不需要透传的 Props 名称
 * @returns 只包含 `rawProps` 声明键且随 Props 更新的 ComputedRef。
 */
export function useProps<Props extends object, RawProps extends object, IgnoredProp extends keyof RawProps = never>(
	props: Props,
	rawProps: RawProps,
	ignoredProps: readonly IgnoredProp[] = []
): ComputedRef<Omit<Pick<Props, Extract<keyof Props, keyof RawProps>>, Extract<IgnoredProp, keyof Props>>> {
	const ignored = new Set<PropertyKey>(ignoredProps);
	type Result = Omit<Pick<Props, Extract<keyof Props, keyof RawProps>>, Extract<IgnoredProp, keyof Props>>;
	return computed<Result>(() => {
		const result = {} as Result;
		for (const key of Reflect.ownKeys(rawProps)) {
			if (ignored.has(key) || !Object.prototype.hasOwnProperty.call(props, key)) continue;
			Object.defineProperty(result, key, { configurable: true, enumerable: true, value: Reflect.get(props, key), writable: true });
		}
		return result;
	});
}
