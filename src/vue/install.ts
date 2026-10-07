import type { App } from "vue";

/** Vue 组件对象、函数组件或指令对象可接受的最小结构类型 */
export type VueInstallValue = object | ((...arguments_: never[]) => unknown);

/** 为 Vue 组件或指令附加供 Vue 3 `app.use()` 调用的安装能力 */
export type Installable<Value> = Value & {
	/**
	 * 把当前组件或指令安装到 Vue 3 App。
	 * @param app - Vue 3 App 实例
	 */
	install: (app: App) => void;
};

/** TSX 组件安装类型；与 {@link Installable} 保持同一运行时契约。 */
export type TSXWithInstall<Value> = Installable<Value>;

/** 组件、指令注册所需的 Vue 3 App 能力 */
interface VueAppRegistrationTarget {
	/**
	 * 读取或注册全局组件。
	 *
	 * @param name - 全局组件名
	 * @param component - 注册时传入的组件；省略时读取现有组件。
	 * @returns Vue App 返回的现有组件、注册结果或 App 自身。
	 */
	component: (name: string, component?: unknown) => unknown;
	/**
	 * 读取或注册全局指令。
	 *
	 * @param name - 不带 `v-` 的全局指令名
	 * @param directive - 注册时传入的指令；省略时读取现有指令。
	 * @returns Vue App 返回的现有指令、注册结果或 App 自身。
	 */
	directive: (name: string, directive?: unknown) => unknown;
}

/**
 * 校验 Vue 3 插件安装目标。
 *
 * @param value - Vue 3 App 实例
 * @returns 只包含组件和指令注册能力的 App
 * @throws `TypeError` 当目标不是对象或缺少 `component`、`directive` 方法。
 */
const assertApp = (value: unknown): VueAppRegistrationTarget => {
	if (typeof value !== "object" || value === null) {
		throw new TypeError("Installing a Vue plugin requires a Vue 3 App instance.");
	}
	const app = value as Partial<VueAppRegistrationTarget>;
	if (typeof app.component !== "function" || typeof app.directive !== "function") {
		throw new TypeError("Installing a Vue plugin requires `component()` and `directive()` registration methods.");
	}
	return app as VueAppRegistrationTarget;
};

/**
 * 提取组件的全局注册名称。
 *
 * @param component - 待注册组件
 * @returns 经过校验的显式名称
 * @throws `TypeError` 当组件没有非空字符串名称，或名称包含空白。
 */
const getComponentName = (component: VueInstallValue): string => {
	const name = (component as { name?: unknown }).name;
	if (typeof name !== "string" || name.length === 0 || /\s/u.test(name)) {
		throw new TypeError("An installable Vue component must expose a nonempty name without whitespace.");
	}
	return name;
};

/**
 * 预检单个组件注册。
 *
 * @remarks 先读取同名组件并完成冲突判断，再返回延迟执行动作；调用方可以在所有组件预检通过后统一提交。
 * @param app - 已校验的 Vue 3 App 注册目标
 * @param component - 待注册组件
 * @returns 已校验的组件引用、名称和目标中是否已经存在同一引用。
 * @throws `Error` 当同名位置已由其他组件占用。
 */
const prepareComponentRegistration = (app: VueAppRegistrationTarget, component: VueInstallValue) => {
	const name = getComponentName(component);
	const existing = app.component(name);
	if (existing !== undefined && existing !== component) {
		throw new Error(`The Vue component name "${name}" is already registered to another component.`);
	}
	return { component, name, registered: existing === component };
};

/**
 * 为主组件附加 Vue 3 `app.use()` 安装能力。
 *
 * @remarks 函数会直接为 `main` 定义附属组件属性和 `install`。所有组件名称、附属属性
 * 冲突会在修改 `main` 前完成校验；安装到 App 时也会先预检全部全局名称，再统一注册。
 * @param main - 具有非空 `name` 的组件
 * @param extras - 同时注册并以可枚举属性挂到主组件的附属组件映射
 * @returns 原始 `main` 引用，并附加类型化的 `install` 与 `extras` 属性。
 * @throws `TypeError` 当组件缺少合法名称、已有 `install`、附属键或名称发生冲突。
 * @throws `Error` 当 App 中同名位置已经注册其他组件。
 */
export function withInstall<Main extends VueInstallValue, Extras extends Record<string, VueInstallValue> = Record<never, never>>(
	main: Main,
	extras?: Extras
): Installable<Main> & Extras {
	const componentNames = new Set([getComponentName(main)]);
	if ("install" in Object(main)) throw new TypeError("The Vue component already defines an `install` property.");
	const extraEntries = Object.entries(extras ?? {});
	if (extras !== undefined && Object.getOwnPropertySymbols(extras).some((key) => Object.prototype.propertyIsEnumerable.call(extras, key))) {
		throw new TypeError("Vue component extras must use string property names.");
	}
	for (const [key, component] of extraEntries) {
		const componentName = getComponentName(component);
		if (componentNames.has(componentName)) throw new TypeError(`The Vue component name "${componentName}" is registered more than once.`);
		componentNames.add(componentName);
		if (key === "install" || key in Object(main)) {
			throw new TypeError(`The Vue component extra "${key}" would overwrite a property on the main component.`);
		}
	}
	const installable = main as Installable<Main> & Extras;
	for (const [key, component] of extraEntries) {
		Object.defineProperty(installable, key, { configurable: true, enumerable: true, value: component, writable: true });
	}
	installable.install = (value: App) => {
		const app = assertApp(value);
		// 先完成全部冲突检查，再统一注册，避免安装到一半留下部分全局组件。
		const registrations = [main, ...extraEntries.map(([, component]) => component)].map((component) =>
			prepareComponentRegistration(app, component)
		);
		for (const registration of registrations) {
			if (!registration.registered) app.component(registration.name, registration.component);
		}
	};
	return installable;
}

/**
 * 为不需要单独注册的附属组件附加空安装函数。
 *
 * @remarks 适用于只能作为主组件附属属性使用、但仍需满足 Vue Plugin 类型的组件。
 * 函数直接修改并返回传入组件，不会向 Vue 3 App 注册内容。
 * @param component - 尚未定义或继承 `install` 属性的组件
 * @returns 原组件引用及无副作用的 `install` 方法
 * @throws `TypeError` 当组件自身或原型链已经存在 `install`。
 */
export function withNoopInstall<Value extends VueInstallValue>(component: Value): TSXWithInstall<Value> {
	if ("install" in Object(component)) throw new TypeError("The Vue component already defines an `install` property.");
	const installable = component as TSXWithInstall<Value>;
	installable.install = () => undefined;
	return installable;
}

/**
 * 为 Vue 3 指令附加插件安装能力。
 *
 * @remarks 函数直接修改并返回指令。安装时重复注册同一引用保持幂等，不会覆盖同名的
 * 其他指令。名称只传给 `directive()`，不得包含 `v-` 前缀。
 * @param directive - 尚未定义或继承 `install` 属性的 Vue 指令对象
 * @param name - 非空、无空白且不以 `v-` 开头的全局指令名
 * @returns 原指令引用及 Vue Plugin `install` 方法。
 * @throws `TypeError` 当名称非法、指令已有 `install`，或安装目标无效。
 * @throws `Error` 当 App 中同名位置已经注册其他指令。
 */
export function withInstallDirective<Value extends VueInstallValue>(directive: Value, name: string): Installable<Value> {
	if (name.length === 0 || /\s/u.test(name) || name.startsWith("v-")) {
		throw new TypeError("An installable Vue directive name must not contain whitespace or the `v-` prefix.");
	}
	if ("install" in Object(directive)) throw new TypeError("The Vue directive already defines an `install` property.");
	const installable = directive as Installable<Value>;
	installable.install = (value: App) => {
		const app = assertApp(value);
		const existing = app.directive(name);
		if (existing !== undefined && existing !== directive) {
			throw new Error(`The Vue directive name "${name}" is already registered to another directive.`);
		}
		if (existing !== directive) app.directive(name, directive);
	};
	return installable;
}
