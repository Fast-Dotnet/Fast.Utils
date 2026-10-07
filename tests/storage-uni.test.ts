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

	it("keeps clear prefix-scoped and rejects unsupported Session", () => {
		values.set("other:key", "keep");
		Local.set("owned", 1);
		Local.clear();
		expect(values.get("other:key")).toBe("keep");
		expect(() => Session.get("key")).toThrow("Session is not supported in uni-app");
	});
});
