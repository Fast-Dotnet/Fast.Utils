import assert from "node:assert/strict";
import test from "node:test";
import { once } from "../src/function/index";
import { cloneDeep, omit, pick } from "../src/object/index";

test("cloneDeep preserves buffer sharing, offsets and cycles without sharing source memory", () => {
	const buffer = new ArrayBuffer(16);
	const bytes = new Uint8Array(buffer, 4, 4);
	const view = new DataView(buffer, 4, 4);
	Reflect.set(buffer, "view", view);
	const source = { bytes, buffer, view };
	const copy = cloneDeep(source);
	assert.notEqual(copy.buffer, buffer);
	assert.equal(copy.bytes.buffer, copy.buffer);
	assert.equal(copy.view.buffer, copy.buffer);
	assert.equal(Reflect.get(copy.buffer, "view"), copy.view);
	assert.equal(copy.bytes.byteOffset, 4);
	copy.bytes[0] = 42;
	assert.equal(copy.view.getUint8(0), 42);
	assert.equal(bytes[0], 0);
});

test("cloneDeep preserves sparse arrays, own metadata, symbols and cycles", () => {
	const marker = Symbol("metadata");
	const source = new Array<unknown>(3);
	source[2] = { label: "value" };
	Reflect.set(source, "self", source);
	Reflect.set(source, marker, { count: 1 });
	const copy = cloneDeep(source);
	assert.equal(copy.length, 3);
	assert.equal(0 in copy, false);
	assert.equal(1 in copy, false);
	assert.equal(Reflect.get(copy, "self"), copy);
	assert.deepEqual(Reflect.get(copy, marker), { count: 1 });
	assert.notEqual(Reflect.get(copy, marker), Reflect.get(source, marker));
	assert.notEqual(copy[2], source[2]);
});

test("cloneDeep keeps boxed primitive properties and does not invoke prototype setters", () => {
	const source = Object("ab") as object;
	Reflect.set(source, "extra", { ok: true });
	const copy = cloneDeep(source);
	assert.equal(String.prototype.valueOf.call(copy), "ab");
	assert.notEqual(Reflect.get(copy, "extra"), Reflect.get(source, "extra"));
	let setters = 0;
	const prototype = {
		set key(_value: unknown) {
			setters += 1;
		},
	};
	const input = Object.create(prototype) as object;
	Object.defineProperty(input, "key", { enumerable: true, value: 1 });
	assert.equal(Reflect.get(cloneDeep(input), "key"), 1);
	assert.equal(setters, 0);
});

test("dynamic pick and omit preserve runtime selection", () => {
	const keys: ("a" | "b")[] = ["a"];
	assert.deepEqual(pick({ a: 1, b: 2 }, keys), { a: 1 });
	assert.deepEqual(omit({ a: 1, b: 2 }, keys), { b: 2 });
});

test("once rejects synchronous reentry and caches the first escaped error", () => {
	let executions = 0;
	const wrapped: () => number = once(() => {
		executions += 1;
		return wrapped();
	});
	let first: unknown;
	try {
		wrapped();
	} catch (error) {
		first = error;
	}
	assert.ok(first instanceof Error);
	assert.throws(wrapped, (error: unknown) => error === first);
	assert.equal(executions, 1);
});

test("once allows callback to handle reentry and preserves Promise identity", async () => {
	let executions = 0;
	const wrapped: () => number = once(() => {
		executions += 1;
		assert.throws(wrapped, /同步重入/u);
		return 42;
	});
	assert.equal(wrapped(), 42);
	assert.equal(wrapped(), 42);
	assert.equal(executions, 1);
	const result = Promise.resolve(42);
	const asyncOnce = once(() => result);
	assert.equal(asyncOnce(), result);
	assert.equal(asyncOnce(), result);
	assert.equal(await result, 42);
});
