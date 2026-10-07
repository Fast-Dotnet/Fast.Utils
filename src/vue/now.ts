import { getCurrentScope, onScopeDispose, readonly, shallowRef } from "vue";
import type { ShallowRef } from "vue";

/**
 * 按固定间隔提供响应式当前时间。
 *
 * @param intervalMilliseconds - 更新时间间隔，默认 `1000` 毫秒
 * @returns 当前 Date 的只读 ShallowRef；SSR 环境只返回调用时的时间。
 * @throws `Error` 当浏览器或 uni-app 环境中不存在可用于自动清理的 Vue 响应式作用域。
 * @throws `RangeError` 当间隔不是平台计时器支持的非负有限整数。
 */
export function useNow(intervalMilliseconds = 1000): Readonly<ShallowRef<Date>> {
	if (!Number.isInteger(intervalMilliseconds) || intervalMilliseconds < 0 || intervalMilliseconds > 2_147_483_647) {
		throw new RangeError("`intervalMilliseconds` must be an integer between 0 and 2,147,483,647.");
	}
	const now = shallowRef(new Date());
	if (typeof window !== "undefined" || typeof uni !== "undefined") {
		if (getCurrentScope() === undefined) throw new Error("`useNow` must be called within a Vue reactive scope.");
		const timer = setInterval(() => {
			now.value = new Date();
		}, intervalMilliseconds);
		onScopeDispose(() => {
			clearInterval(timer);
		});
	}
	return readonly(now);
}
