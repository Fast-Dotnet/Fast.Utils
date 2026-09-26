import { describe, it } from "node:test";
import { createApp, createRenderer, defineComponent, effectScope, h, reactive, shallowRef } from "vue";
import { useBreakpoints } from "../src/vue/breakpoints";
import { useElementSize } from "../src/vue/element-size";
import { useEmits } from "../src/vue/emits";
import { useEventListener } from "../src/vue/event-listener";
import { useExpose } from "../src/vue/expose";
import { callOptionalFunction } from "../src/vue/func";
import { withInstall, withInstallDirective, withNoopInstall } from "../src/vue/install";
import { useNow } from "../src/vue/now";
import { definePropType, useProps } from "../src/vue/props";
import { useRender } from "../src/vue/render";
import { useResizeObserver } from "../src/vue/resize-observer";
import { makeSlots } from "../src/vue/slots";
import { useTransition } from "../src/vue/transition";
import { useWindowSize } from "../src/vue/window-size";
import { withDefineType } from "../src/vue/with";
import { expect, vi } from "./test-helpers";

describe("Vue event and props helpers", () => {
	it("maps event tuple types to real Vue handler names", () => {
		const emits = { clear: null, "update:modelValue": (_value: string) => true };
		const emit = vi.fn((_eventName: string, ..._arguments_: unknown[]) => undefined);
		const handlers = useEmits(emits, emit).value;
		handlers["onUpdate:modelValue"]?.("value");
		handlers.onClear?.();
		expect(emit).toHaveBeenNthCalledWith(1, "update:modelValue", "value");
		expect(emit).toHaveBeenNthCalledWith(2, "clear");
	});

	it("accepts the emitter provided by Vue setup", () => {
		const emits = { clear: null, "update:modelValue": (_value: string) => true };
		const component = defineComponent({
			emits,
			setup(_props, { emit }) {
				return { handlers: useEmits(emits, emit) };
			},
		});
		expect(component).toBeDefined();
	});

	it("keeps selected props reactive and typed", () => {
		const props = reactive({ id: 1, label: "first" });
		const selected = useProps(props, { id: Number, label: String }, ["label"]);
		expect(selected.value).toEqual({ id: 1 });
		props.id = 2;
		expect(selected.value).toEqual({ id: 2 });
	});

	it("returns Vue-compatible prop and slot runtime declarations", () => {
		expect(definePropType<string>(String)).toBe(String);
		expect(makeSlots<{ default: never; item: { id: number } }>()).toBe(Object);
	});

	it("keeps setup state visible when TSX rendering is installed separately", () => {
		type HostNode = Record<string, unknown>;
		const renderer = createRenderer<HostNode, HostNode>({
			createComment: (text) => ({ text }),
			createElement: (type) => ({ type }),
			createText: (text) => ({ text }),
			insert: () => undefined,
			nextSibling: () => null,
			parentNode: () => null,
			patchProp: () => undefined,
			remove: () => undefined,
			setElementText: (element, text) => {
				element["text"] = text;
			},
			setText: (node, text) => {
				node["text"] = text;
			},
		});
		const component = defineComponent({
			setup(_props, { expose }) {
				const state = reactive({ count: 1 });
				useRender(() => h("div", String(state.count)));
				return useExpose(expose, { state });
			},
		});
		const proxy = renderer.createApp(component).mount({});
		expect((proxy as unknown as { state: { count: number } }).state.count).toBe(1);
		expect(() => {
			useRender(() => h("div"));
		}).toThrow(Error);
	});

	it("preserves type helpers and executes sync or async functions", async () => {
		const value = { id: 1 };
		expect(withDefineType(value)).toBe(value);
		expect(withDefineType<{ id: number }>()).toBeUndefined();
		await expect(callOptionalFunction((amount: number) => amount + 1, 1)).resolves.toBe(2);
		await expect(callOptionalFunction(async (amount: number) => Promise.resolve(amount + 2), 1)).resolves.toBe(3);
		await expect(callOptionalFunction(undefined)).resolves.toBe(undefined);
	});
});

describe("Vue browser composables", () => {
	it("validates automatic cleanup scopes and public numeric inputs", () => {
		vi.stubGlobal("window", new EventTarget());
		try {
			expect(() => useWindowSize()).toThrow(Error);
			expect(() => useNow()).toThrow(Error);
			expect(() => useBreakpoints({ mobile: 0 })).toThrow(Error);
			expect(() => useNow(-1)).toThrow(RangeError);
			expect(() => useBreakpoints({ desktop: -1 })).toThrow(RangeError);
			expect(() => useBreakpoints({ active: 0 })).toThrow(TypeError);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("moves event listeners with reactive targets and supports manual cleanup", () => {
		const first = new EventTarget();
		const second = new EventTarget();
		const target = shallowRef<EventTarget | null>(first);
		const listener = vi.fn((_event: Event) => undefined);
		const scope = effectScope();
		let stop: () => void = () => undefined;
		scope.run(() => {
			stop = useEventListener(target, "change", listener);
		});
		first.dispatchEvent(new Event("change"));
		target.value = second;
		first.dispatchEvent(new Event("change"));
		second.dispatchEvent(new Event("change"));
		stop();
		second.dispatchEvent(new Event("change"));
		expect(listener).toHaveBeenCalledTimes(2);
		scope.stop();
	});

	it("tracks window size and removes its listener with the scope", () => {
		const windowTarget = new EventTarget() as EventTarget & { innerHeight: number; innerWidth: number };
		windowTarget.innerWidth = 1280;
		windowTarget.innerHeight = 720;
		vi.stubGlobal("window", windowTarget);
		try {
			const scope = effectScope();
			const size = scope.run(() => useWindowSize());
			expect(size?.width.value).toBe(1280);
			expect(size?.height.value).toBe(720);
			windowTarget.innerWidth = 1440;
			windowTarget.innerHeight = 900;
			windowTarget.dispatchEvent(new Event("resize"));
			expect(size?.width.value).toBe(1440);
			expect(size?.height.value).toBe(900);
			scope.stop();
			windowTarget.innerWidth = 1920;
			windowTarget.dispatchEvent(new Event("resize"));
			expect(size?.width.value).toBe(1440);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("observes element size and disconnects when stopped", () => {
		let observerCallback: ResizeObserverCallback | undefined;
		const observe = vi.fn((_target: Element, _options?: ResizeObserverOptions) => undefined);
		const disconnect = vi.fn(() => undefined);
		class TestResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				observerCallback = callback;
			}
			observe = observe;
			disconnect = disconnect;
		}
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		try {
			const element = {} as Element;
			const scope = effectScope();
			const size = scope.run(() => useElementSize(element, { height: 20, width: 10 }));
			expect(size?.width.value).toBe(10);
			expect(size?.height.value).toBe(20);
			expect(observe).toHaveBeenCalledWith(element, undefined);
			observerCallback?.([{ contentRect: { height: 80, width: 160 } } as ResizeObserverEntry], {} as ResizeObserver);
			expect(size?.width.value).toBe(160);
			expect(size?.height.value).toBe(80);
			size?.stop();
			expect(disconnect).toHaveBeenCalledOnce();
			scope.stop();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("exposes the native ResizeObserver callback and stop handle", () => {
		const observe = vi.fn((_target: Element, _options?: ResizeObserverOptions) => undefined);
		const disconnect = vi.fn(() => undefined);
		class TestResizeObserver {
			constructor(readonly callback: ResizeObserverCallback) {}
			observe = observe;
			disconnect = disconnect;
		}
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		try {
			const target = {} as Element;
			const stop = useResizeObserver(target, () => undefined, { box: "border-box" });
			expect(observe).toHaveBeenCalledWith(target, { box: "border-box" });
			stop();
			expect(disconnect).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("updates the current time on its interval and clears the timer", () => {
		let tick: () => void = () => undefined;
		const timer = { id: 1 };
		const setInterval = vi.fn((callback: () => void, milliseconds?: number) => {
			tick = callback;
			expect(milliseconds).toBe(1000);
			return timer;
		});
		const clearInterval = vi.fn((_timer: unknown) => undefined);
		vi.stubGlobal("window", {});
		vi.stubGlobal("setInterval", setInterval);
		vi.stubGlobal("clearInterval", clearInterval);
		try {
			const scope = effectScope();
			const now = scope.run(() => useNow());
			const initial = now?.value;
			tick();
			expect(now?.value).not.toBe(initial);
			scope.stop();
			expect(clearInterval).toHaveBeenCalledWith(timer);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("tracks native media queries and resolves the largest active breakpoint", () => {
		class TestMediaQueryList extends EventTarget {
			constructor(public matches: boolean) {
				super();
			}
		}
		let viewportWidth = 800;
		const queries: TestMediaQueryList[] = [];
		const windowTarget = Object.assign(new EventTarget(), {
			matchMedia(query: string) {
				const minimumWidth = Number(/\d+/u.exec(query)?.[0]);
				const result = new TestMediaQueryList(viewportWidth >= minimumWidth);
				queries.push(result);
				return result;
			},
		});
		vi.stubGlobal("window", windowTarget);
		try {
			const scope = effectScope();
			const breakpoints = scope.run(() => useBreakpoints({ desktop: 1280, mobile: 0, tablet: 640 }));
			expect(breakpoints?.mobile.value).toBe(true);
			expect(breakpoints?.tablet.value).toBe(true);
			expect(breakpoints?.desktop.value).toBe(false);
			expect(breakpoints?.active().value).toBe("tablet");
			viewportWidth = 1440;
			for (const [index, minimumWidth] of [0, 640, 1280].entries()) {
				const query = queries[index];
				if (query === undefined) continue;
				query.matches = viewportWidth >= minimumWidth;
				query.dispatchEvent(new Event("change"));
			}
			expect(breakpoints?.active().value).toBe("desktop");
			scope.stop();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("Vue numeric transitions", () => {
	it("follows refs and getters without animation APIs and validates inputs", () => {
		const source = shallowRef(2);
		const output = useTransition(() => source.value * 2);
		expect(output.value).toBe(4);
		source.value = 5;
		expect(output.value).toBe(10);
		expect(useTransition(3).value).toBe(3);
		for (const invalid of [NaN, Infinity, -Infinity]) {
			expect(() => useTransition(invalid)).toThrow(RangeError);
		}
		for (const duration of [-1, NaN, Infinity]) {
			expect(() => useTransition(0, { duration })).toThrow(RangeError);
		}
		vi.stubGlobal("window", {});
		try {
			expect(useTransition(source).value).toBe(5);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("interpolates, retargets, finishes exactly, and cancels with its scope", () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextId = 0;
		const requestAnimationFrame = (callback: FrameRequestCallback) => {
			const id = ++nextId;
			frames.set(id, callback);
			return id;
		};
		const cancelAnimationFrame = (id: number) => {
			frames.delete(id);
		};
		const advance = (time: number) => {
			const pending = [...frames.values()];
			frames.clear();
			for (const callback of pending) callback(time);
		};
		vi.stubGlobal("window", { cancelAnimationFrame, requestAnimationFrame });
		const scope = effectScope();
		try {
			expect(() => useTransition(0)).toThrow(Error);
			const source = shallowRef(0);
			const output = scope.run(() => useTransition(source, { duration: 100 }));
			expect(output?.value).toBe(0);
			expect(frames.size).toBe(0);
			source.value = 100;
			advance(0);
			advance(50);
			expect(output?.value).toBe(50);
			source.value = -50;
			expect(frames.size).toBe(1);
			advance(60);
			advance(110);
			expect(output?.value).toBe(0);
			advance(160);
			expect(output?.value).toBe(-50);
			expect(frames.size).toBe(0);
			source.value = 100;
			scope.stop();
			expect(frames.size).toBe(0);
			source.value = 200;
			advance(500);
			expect(output?.value).toBe(-50);

			const immediateScope = effectScope();
			const immediate = immediateScope.run(() => useTransition(source, { duration: 0 }));
			source.value = 250;
			expect(immediate?.value).toBe(250);
			expect(frames.size).toBe(0);
			immediateScope.stop();
		} finally {
			scope.stop();
			vi.unstubAllGlobals();
		}
	});

	it("uses custom easing and stops scheduling when easing fails", () => {
		let callback: FrameRequestCallback | undefined;
		vi.stubGlobal("window", {
			cancelAnimationFrame: () => {
				callback = undefined;
			},
			requestAnimationFrame: (next: FrameRequestCallback) => {
				callback = next;
				return 1;
			},
		});
		const scope = effectScope();
		try {
			const source = shallowRef(0);
			const output = scope.run(() => useTransition(source, { transition: (progress) => progress ** 2 }));
			source.value = 100;
			callback?.(0);
			callback?.(150);
			expect(output?.value).toBe(25);
			callback?.(300);
			expect(output?.value).toBe(100);
			scope.stop();
			const invalidScope = effectScope();
			try {
				invalidScope.run(() => useTransition(source, { transition: () => NaN }));
				source.value = 200;
				const pending = callback;
				callback = undefined;
				expect(() => pending?.(0)).toThrow(RangeError);
				expect(callback).toBeUndefined();
			} finally {
				invalidScope.stop();
			}
		} finally {
			scope.stop();
			vi.unstubAllGlobals();
		}
	});
});

describe("Vue install helpers", () => {
	it("registers main and extra named components", () => {
		const main = { name: "FastMain", render: () => null };
		const extra = { name: "FastExtra", render: () => null };
		const installable = withInstall(main, { Extra: extra });
		const app = createApp({ render: () => null });
		app.use(installable);
		expect(app.component("FastMain")).toBe(main);
		expect(app.component("FastExtra")).toBe(extra);
		expect(installable.Extra).toBe(extra);
	});

	it("supports no-op installation for attached components", () => {
		const component = { name: "FastAttached", render: () => null };
		const installable = withNoopInstall(component);
		const app = createApp({ render: () => null });
		app.use(installable);
		expect(app.component("FastAttached")).toBeUndefined();
		expect(() => withNoopInstall(installable)).toThrow(TypeError);
	});

	it("does not silently overwrite components already owned by an app", () => {
		const existing = { name: "FastMain", render: () => null };
		const incoming = withInstall({ name: "FastMain", render: () => null });
		const app = createApp({ render: () => null });
		app.component("FastMain", existing);

		expect(() => app.use(incoming)).toThrow(Error);
		expect(app.component("FastMain")).toBe(existing);
	});

	it("preflights every app registration before changing the app", () => {
		const main = { name: "FastMain", render: () => null };
		const extra = { name: "FastExtra", render: () => null };
		const existing = { name: "FastExtra", render: () => null };
		const installable = withInstall(main, { Extra: extra });
		const app = createApp({ render: () => null });
		app.component("FastExtra", existing);

		expect(() => app.use(installable)).toThrow(Error);
		expect(app.component("FastMain")).toBeUndefined();
		expect(app.component("FastExtra")).toBe(existing);
	});

	it("registers directives and validates public names", () => {
		const directive = { mounted: vi.fn() };
		const installable = withInstallDirective(directive, "focus");
		const app = createApp({ render: () => null });
		app.use(installable);
		expect(app.directive("focus")).toBe(directive);
		expect(() => withInstallDirective(directive, "")).toThrow(TypeError);
		expect(() => withInstallDirective(directive, "   ")).toThrow(TypeError);
		expect(() => withInstallDirective({ mounted: vi.fn() }, " focus ")).toThrow(TypeError);
		expect(() => withInstallDirective({ mounted: vi.fn() }, "v-focus")).toThrow(TypeError);
		expect(() => withInstallDirective(installable, "focus-again")).toThrow(TypeError);
		const inheritedInstall = Object.create({ install: vi.fn() }) as { mounted: () => void };
		inheritedInstall.mounted = vi.fn();
		expect(() => withInstallDirective(inheritedInstall, "inherited")).toThrow(TypeError);

		const conflictingApp = createApp({ render: () => null });
		const existing = { mounted: vi.fn() };
		conflictingApp.directive("focus", existing);
		expect(() => conflictingApp.use(installable)).toThrow(Error);
		expect(conflictingApp.directive("focus")).toBe(existing);
	});

	it("validates every component and extra key before mutating the main component", () => {
		const main = { name: "FastMain", render: () => null };
		const extra = { name: "FastExtra", render: () => null };
		expect(() => withInstall(main, { install: extra })).toThrow(TypeError);
		expect(Object.hasOwn(main, "install")).toBe(false);
		const existingInstall = vi.fn();
		const alreadyInstallable = { install: existingInstall, name: "FastInstalled", render: () => null };
		expect(() => withInstall(alreadyInstallable)).toThrow(TypeError);
		expect(alreadyInstallable.install).toBe(existingInstall);
		expect(() => withInstall({ name: " ", render: () => null })).toThrow(TypeError);
		expect(() => withInstall({ name: " FastMain ", render: () => null })).toThrow(TypeError);
		expect(() => withInstall({ name: "Fast Main", render: () => null })).toThrow(TypeError);
		expect(() => withInstall(main, { constructor: extra })).toThrow(TypeError);
		expect(() => withInstall(main, { Duplicate: { name: "FastMain", render: () => null } })).toThrow(TypeError);
	});

	it("rejects duplicate or colliding event handler names", () => {
		const emits = { "save-item": null, saveItem: null };
		const emit = (_eventName: "save-item" | "saveItem") => undefined;
		expect(() => useEmits(emits, emit).value).toThrow(TypeError);
	});
});
