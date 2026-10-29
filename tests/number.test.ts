import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { formatBytes, randomInt } from "../src/number/index";
import { vi } from "./test-helpers";

afterEach(() => {
	vi.unstubAllGlobals();
});

test("randomInt retains exact half-open bounds for both random sources", (context) => {
	const uint32Range = 0x1_0000_0000;
	let sample = 0;
	context.mock.method(Math, "random", () => sample / uint32Range);
	const ranges = [...Array.from({ length: 256 }, (_, index) => index + 1), 0x7fff_ffff, 0x8000_0000, 0x8000_0001, uint32Range - 1, uint32Range];
	for (const useCrypto of [true, false]) {
		vi.stubGlobal("crypto", useCrypto ? { getRandomValues: (values: Uint32Array) => values.fill(sample) } : undefined);
		for (const range of ranges) {
			const limit = Number((BigInt(uint32Range) / BigInt(range)) * BigInt(range));
			for (const minimum of [0, -range, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - range]) {
				for (sample of [0, 1, range - 1, range, limit - 1]) {
					if (sample >= limit) continue;
					const actual = randomInt(minimum, minimum + range);
					assert.equal(actual, minimum + Number(BigInt(sample) % BigInt(range)));
					assert.ok(Number.isSafeInteger(actual) && actual >= minimum && actual < minimum + range);
				}
			}
		}
	}
});

test("randomInt rejects the incomplete sample interval before mapping either random source", (context) => {
	const samples = [0xffff_ffd0, 0xffff_ffff, 0xffff_ffcf];
	for (const useCrypto of [true, false]) {
		let calls = 0;
		const nextSample = () => {
			const sample = samples[calls];
			assert.ok(sample !== undefined, "Rejection sampling must accept the third sample");
			calls += 1;
			return sample;
		};
		vi.stubGlobal("crypto", useCrypto ? { getRandomValues: (values: Uint32Array) => values.fill(nextSample()) } : undefined);
		context.mock.method(Math, "random", () => nextSample() / 0x1_0000_0000);
		assert.equal(randomInt(-26, 26), 25);
		assert.equal(calls, 3);
		context.mock.restoreAll();
	}
});

test("randomInt rejects invalid bounds before requesting randomness", () => {
	const getRandomValues = vi.fn();
	vi.stubGlobal("crypto", { getRandomValues });
	for (const [minimum, maximum] of [
		[0, 0],
		[1, 0],
		[0.5, 1],
		[0, 1.5],
		[Number.NaN, 1],
		[0, Number.POSITIVE_INFINITY],
		[Number.MIN_SAFE_INTEGER - 1, 0],
		[0, Number.MAX_SAFE_INTEGER + 1],
		[0, 0x1_0000_0001],
	] as const) {
		assert.throws(() => randomInt(minimum, maximum), RangeError);
	}
	assert.equal(getRandomValues.mock.calls.length, 0);
});

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
