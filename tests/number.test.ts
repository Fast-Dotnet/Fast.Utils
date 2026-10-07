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

test("formatBytes rounds decimal ties and scientific notation like the default number format", () => {
	const samples = [
		Number.MIN_VALUE,
		0.000001005,
		0.125,
		1.005,
		1.015,
		9.995,
		99.999,
		999.995,
		1000,
		1023.999,
		1024,
		1536,
		1e24,
		1e100,
		Number.MAX_VALUE,
	];
	for (const base of [1000, 1024] as const) {
		for (const decimals of [0, 1, 2, 3, 10, 20]) {
			const units =
				base === 1024 ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"] : ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
			const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, useGrouping: false });
			for (const bytes of samples) {
				const exponent = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1));
				assert.equal(formatBytes(bytes, { base, decimals }), `${formatter.format(bytes / base ** exponent)} ${units[exponent]}`);
			}
		}
	}
});

test("formatBytes retains arbitrary explicit locales", () => {
	for (const locale of ["en", "de", "ar", "ja", "zh-TW"]) {
		assert.equal(
			formatBytes(1536, { locale }),
			`${new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(1.5)} KiB`
		);
	}
	assert.throws(() => formatBytes(1, { locale: "invalid_locale" }), RangeError);
});
