/** 可识别的主要 JavaScript 运行环境 */
export type RuntimeKind = "browser" | "node" | "unknown" | "worker";

/**
 * 延迟读取当前 User-Agent。
 *
 * @returns Navigator 不存在或字段类型异常时返回空字符串。
 */
const currentUserAgent = (): string => {
	const userAgent: unknown = typeof navigator === "undefined" ? undefined : navigator.userAgent;
	return typeof userAgent === "string" ? userAgent : "";
};
/**
 * 延迟读取当前设备报告的最大触点数。
 *
 * @returns Navigator 不存在或字段类型异常时返回 `0`。
 */
const currentTouchPoints = (): number => {
	const maxTouchPoints: unknown = typeof navigator === "undefined" ? undefined : navigator.maxTouchPoints;
	return typeof maxTouchPoints === "number" ? maxTouchPoints : 0;
};

/**
 * 判断当前运行时是否具有浏览器 `window` 与 `document`。
 *
 * @returns 两项能力均存在时返回 `true`；不读取 DOM 内容。
 */
export function isBrowser(): boolean {
	return typeof window !== "undefined" && window.document !== undefined;
}

/**
 * 判断当前运行时是否像 Web Worker 且不是 Window。
 *
 * @remarks 经典、模块、Shared 与 Service Worker 全局通常都暴露 `importScripts`；模块
 * Worker 中调用它可能抛错，本检测只检查能力存在，不会执行。
 * @returns 具有 `importScripts` 且不是浏览器 Window 时返回 `true`。
 */
export function isWebWorker(): boolean {
	return !isBrowser() && typeof importScripts === "function";
}

/**
 * 判断当前运行时是否暴露 Node.js 版本标记。
 *
 * @returns `process.versions.node` 为字符串时返回 `true`。
 */
export function isNode(): boolean {
	if ((typeof process !== "object" && typeof process !== "function") || process === null) return false;
	if ((typeof process.versions !== "object" && typeof process.versions !== "function") || process.versions === null) return false;
	return typeof process.versions.node === "string";
}

/**
 * 判断当前运行时是否暴露 uni-app 的 `uni` 运行时对象。
 *
 * @returns `uni` 标识符存在时返回 `true`；不调用任何平台 API。
 */
export function isUniApp(): boolean {
	return typeof uni !== "undefined";
}

/**
 * 判断当前运行时是否具备本库完整加密 API 所需的 Web Crypto 能力。
 *
 * @remarks 普通随机数、随机字符串和 UUID 在缺少 Web Crypto 时可以回退到 `Math.random()`，但本函数
 * 仍会返回 `false`，因为摘要、PBKDF2、AES-GCM、RSA 与 ECC 需要完整的 Web Crypto 能力。
 * @returns 同时提供本库 Web Crypto 功能所需方法时返回 `true`。
 */
export function hasWebCrypto(): boolean {
	return (
		typeof crypto !== "undefined" &&
		typeof crypto?.getRandomValues === "function" &&
		typeof crypto.subtle?.decrypt === "function" &&
		typeof crypto.subtle.deriveBits === "function" &&
		typeof crypto.subtle.deriveKey === "function" &&
		typeof crypto.subtle.digest === "function" &&
		typeof crypto.subtle.encrypt === "function" &&
		typeof crypto.subtle.exportKey === "function" &&
		typeof crypto.subtle.generateKey === "function" &&
		typeof crypto.subtle.importKey === "function" &&
		typeof crypto.subtle.sign === "function" &&
		typeof crypto.subtle.verify === "function"
	);
}

/**
 * 返回当前主要运行环境。
 *
 * @remarks 在使用 DOM 模拟器的 Node.js 进程中优先报告 `browser`，因为可观察能力比宿主进程名称更有用。
 * @returns `browser`、`worker`、`node` 或无法识别时的 `unknown`。
 */
export function detectRuntime(): RuntimeKind {
	if (isBrowser()) return "browser";
	if (isWebWorker()) return "worker";
	if (isNode()) return "node";
	return "unknown";
}

/**
 * 基于 User-Agent 启发式判断手机设备。
 *
 * @param userAgent - 默认读取当前 `navigator.userAgent`；平台对象不存在时使用空字符串。
 * @remarks User-Agent 可以被伪造，不得用于鉴权、安全策略或永久功能分流。
 * @returns 命中手机特征时返回 `true`。
 */
export function isMobileUserAgent(userAgent: string = currentUserAgent()): boolean {
	return /Mobile|iPhone|Android.*Mobile|Windows Phone/iu.test(userAgent);
}

/**
 * 基于 User-Agent 与触点数量启发式判断平板设备。
 *
 * @param userAgent - 默认读取当前 User-Agent。
 * @param maxTouchPoints - 用于识别桌面 User-Agent 模式下的 iPadOS，默认读取当前触点数。
 * @returns 命中平板特征时返回 `true`。
 */
export function isTabletUserAgent(userAgent: string = currentUserAgent(), maxTouchPoints: number = currentTouchPoints()): boolean {
	return /iPad|Android(?!.*Mobile)|Tablet/iu.test(userAgent) || (/Macintosh/iu.test(userAgent) && maxTouchPoints > 1);
}
