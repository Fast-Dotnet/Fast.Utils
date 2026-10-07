import { describe, it } from "node:test";
import { debounce, mapConcurrent, retry, sleep, throttle, withTimeout } from "../src/async/index";
import { expect, vi } from "./test-helpers";

describe("cancellation and timeout", () => {
	it("rejects timer values that runtimes would silently clamp", () => {
		expect(() => {
			sleep(2_147_483_648);
		}).toThrow(RangeError);
		expect(() => {
			withTimeout(Promise.resolve(), 2_147_483_648);
		}).toThrow(RangeError);
		expect(() => debounce(() => undefined, 2_147_483_648)).toThrow(RangeError);
		expect(() => throttle(() => undefined, 2_147_483_648)).toThrow(RangeError);
	});

	it("cancels sleep with a standard AbortError", async () => {
		const controller = new AbortController();
		const pending = sleep(1_000, { signal: controller.signal });
		controller.abort("test cancellation");
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});

	it("enforces a timeout without claiming to cancel the source Promise", async () => {
		const pending = withTimeout(
			new Promise<string>(() => {
				return;
			}),
			5
		);
		await expect(pending).rejects.toThrow("timed out after 5 milliseconds");
	});
});

describe("retry and bounded concurrency", () => {
	it("retries with one-based attempt context and returns the first success", async () => {
		const attempts: number[] = [];
		const value = await retry(
			({ attempt }) => {
				attempts.push(attempt);
				if (attempt < 3) throw new Error("temporary");
				return "done";
			},
			{ attempts: 4, delayMs: 0 }
		);
		expect(value).toBe("done");
		expect(attempts).toEqual([1, 2, 3]);
	});

	it("keeps an explicit zero delay stable when exponential scaling overflows", async () => {
		let attempts = 0;
		const value = await retry(
			() => {
				attempts += 1;
				if (attempts < 4) throw new Error("temporary");
				return "done";
			},
			{ attempts: 4, delayMs: 0, factor: Number.MAX_VALUE }
		);
		expect(value).toBe("done");
	});

	it("lets shouldRetry stop permanent failures", async () => {
		const operation = vi.fn(() => {
			throw new Error("permanent");
		});
		await expect(retry(operation, { attempts: 3, shouldRetry: () => false })).rejects.toThrow("permanent");
		expect(operation).toHaveBeenCalledOnce();
	});

	it("preserves order and never exceeds the requested concurrency", async () => {
		let active = 0;
		let maximumActive = 0;
		const result = await mapConcurrent([30, 5, 10, 1], 2, async (delay, index) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await sleep(delay);
			active -= 1;
			return index;
		});
		expect(result).toEqual([0, 1, 2, 3]);
		expect(maximumActive).toBe(2);
	});

	it("preserves sparse holes without passing undefined to the mapper", async () => {
		const input = new Array<number>(3);
		input[0] = 1;
		input[2] = 3;
		const mapper = vi.fn((value: number) => value * 2);
		const result = await mapConcurrent(input, 2, mapper);

		expect(result).toHaveLength(3);
		expect(result[0]).toBe(2);
		expect(result[2]).toBe(6);
		expect(1 in result).toBe(false);
		expect(mapper).toHaveBeenCalledTimes(2);
	});
});

describe("debounce and throttle", () => {
	it("settles every debounced call with the last arguments", async () => {
		const callback = vi.fn((value: number) => value * 2);
		const debounced = debounce(callback, 5);
		const first = debounced(1);
		const second = debounced(3);
		expect(debounced.pending()).toBe(true);
		await expect(first).resolves.toBe(6);
		await expect(second).resolves.toBe(6);
		expect(callback).toHaveBeenCalledOnce();
	});

	it("flushes and cancels pending debounce batches", async () => {
		const debounced = debounce((value: string) => value.toUpperCase(), 5);
		const flushed = debounced("fast");
		await expect(debounced.flush()).resolves.toBe("FAST");
		await expect(flushed).resolves.toBe("FAST");

		const cancelled = debounced("cancel");
		debounced.cancel();
		await expect(cancelled).rejects.toThrow("The debounced invocation was cancelled");
	});

	it("shares a leading Promise and prevents overlap after the cooldown", async () => {
		let resolveOperation: ((value: number) => void) | undefined;
		const callback = vi.fn(async (value: number) =>
			new Promise<number>((resolve) => {
				resolveOperation = resolve;
			}).then(() => value)
		);
		const throttled = throttle(callback, 5);
		const first = throttled(1);
		await sleep(10);
		const second = throttled(2);
		expect(callback).toHaveBeenCalledOnce();
		expect(second).toBe(first);
		resolveOperation?.(0);
		await expect(first).resolves.toBe(1);
		await expect(second).resolves.toBe(1);
		const third = throttled(3);
		resolveOperation?.(0);
		await expect(third).resolves.toBe(3);
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it("turns synchronous throttle failures into rejected Promises", async () => {
		const failure = new Error("synchronous failure");
		const throttled = throttle(() => {
			throw failure;
		}, 0);
		const pending = throttled();
		expect(pending).toBeInstanceOf(Promise);
		await expect(pending).rejects.toBe(failure);
	});
});
