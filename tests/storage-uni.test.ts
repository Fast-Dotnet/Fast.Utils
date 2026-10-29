import { describe, it } from "node:test";
import { Local, Session, configureStorage } from "../src/storage/index";
import { expect, vi } from "./test-helpers";

const values = new Map<string, unknown>();
const uni = {
	getStorageInfoSync: () => ({ keys: [...values.keys()] }),
	getStorageSync: (key: string) => values.get(key) ?? "",
	removeStorageSync: (key: string) => {
		values.delete(key);
	},
	setStorageSync: (key: string, value: string) => {
		values.set(key, value);
	},
};

vi.stubGlobal("uni", uni);
configureStorage({ prefix: "uni-test:" });

describe("configured uni-app storage", () => {
	it("automatically uses the global uni-app storage object", () => {
		Local.set("theme", "dark");
		expect(Local.get("theme")).toBe("dark");
		expect(values.has("uni-test:theme")).toBe(true);
	});

	it("round trips encoded data and preserves uni-app storage when prefix generation fails", (context) => {
		const value = { label: "Fast 工具库", count: 52 };
		Local.set("encoded", value, { crypto: true });
		expect(Local.get("encoded", { crypto: true })).toEqual(value);
		const stored = values.get("uni-test:encoded");
		vi.stubGlobal("crypto", undefined);
		context.mock.method(Math, "random", () => 1 / 0x1_0000_0000);
		const nativeFloor = Math.floor;
		context.mock.method(Math, "floor", (input: number) => (input === 1 / 52 ? Number.NaN : nativeFloor(input)));
		try {
			expect(() => Local.set("encoded", "replacement", { crypto: true })).toThrow({
				name: "TypeError",
				cause: { message: "Unable to generate a valid random prefix." },
			});
			expect(values.get("uni-test:encoded")).toBe(stored);
			expect(Local.get("encoded", { crypto: true })).toEqual(value);
		} finally {
			vi.unstubAllGlobals();
			vi.stubGlobal("uni", uni);
		}
	});

	it("keeps clear prefix-scoped and rejects unsupported Session", () => {
		values.set("other:key", "keep");
		Local.set("owned", 1);
		Local.clear();
		expect(values.get("other:key")).toBe("keep");
		expect(() => Session.get("key")).toThrow("Session is not supported in uni-app");
	});
});
