import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes } from "../src/number/index";

test("formatBytes retains the byte unit for nonnegative fractional inputs", () => {
	assert.equal(formatBytes(0), "0 B");
	assert.equal(formatBytes(0.5), "0.5 B");
	assert.equal(formatBytes(0.125, { decimals: 3, base: 1000 }), "0.125 B");
	assert.equal(formatBytes(Number.MIN_VALUE), "0 B");
	assert.equal(formatBytes(1), "1 B");
	assert.equal(formatBytes(1024), "1 KiB");
	assert.equal(formatBytes(1000, { base: 1000 }), "1 kB");
	assert.throws(() => formatBytes(-0.5), RangeError);
});
