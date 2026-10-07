import { Local } from "../storage/index";
import { generateUuidV4, isUuidV4 } from "../string/index";

const defaultInstallationIdentityStorageKey = "identity:installation-id";

/** {@link configureInstallationIdentity} 接收的安装标识配置 */
export interface InstallationIdentityConfiguration {
	/**
	 * `Local` 中使用的业务键，默认 `identity:installation-id`。
	 *
	 * @remarks 必须是无外围空白的非空字符串，并在首次访问 Identity API 前配置；物理键仍会叠加 Storage 全局前缀。
	 */
	cacheKey?: string;
}

/** 浏览器或 uni-app 当前安装实例标识 */
export interface InstallationIdentity {
	/**
	 * `Local` 中使用的业务键。
	 *
	 * @remarks 首次读取会锁定默认配置；之后不能再切换为其他业务键。
	 */
	readonly cacheKey: string;
	/**
	 * 当前内存中的安装标识；尚未取得标识或调用 {@link InstallationIdentity.clear clear} 后为空字符串。
	 *
	 * @remarks 直接赋值只改变内存，不会校验或持久化；通常应调用 {@link InstallationIdentity.getOrCreate getOrCreate}。
	 */
	deviceId: string;
	/**
	 * 删除当前 `cacheKey` 对应的持久化标识，并把 `deviceId` 重置为空字符串。
	 *
	 * @throws `Error` 当当前平台存储不可用。
	 */
	clear: () => void;
	/**
	 * 按“显式参数、当前内存、持久化值、随机生成值”的优先级取得安装标识。
	 *
	 * @param installationId - 可选 UUID v4；传入时覆盖内存值和当前持久化值。
	 * @returns 已校验并同时写入 `deviceId` 与 `Local` 的 UUID v4。
	 * @throws `TypeError` 当显式参数、内存值或持久化值不是 UUID v4。
	 * @throws `Error` 当当前平台存储不可用。
	 */
	getOrCreate: (installationId?: string) => string;
	/**
	 * 读取并校验当前 `cacheKey` 对应的持久化标识。
	 *
	 * @remarks 该方法不修改 `deviceId`，只负责读取；过期记录由 Storage 视为缺失。
	 * @returns 已持久化的 UUID v4；键缺失或过期时返回 `undefined`。
	 * @throws `TypeError` 当持久化值不是字符串或不是 UUID v4。
	 * @throws `Error` 当当前平台存储不可用。
	 */
	read: () => string | undefined;
}

/**
 * 校验安装标识格式。
 *
 * @param value - 外部传入或从 Storage 读取的候选值
 * @throws `TypeError` 当值不是 RFC 4122 UUID v4。
 */
const assertInstallationId = (value: string): void => {
	if (!isUuidV4(value)) throw new TypeError("The installation identity must be an RFC 4122 UUID v4.");
};

let activeStorageKey: string | undefined;

/**
 * 取得已经锁定的安装标识业务键。
 *
 * @remarks 首次读取会锁定默认值，防止标识已经写入后再切换键而产生两个安装标识。
 * @returns 应用于后续全部 Identity 操作的业务键
 */
const getInstallationIdentityStorageKey = (): string => {
	activeStorageKey ??= defaultInstallationIdentityStorageKey;
	return activeStorageKey;
};

/**
 * 在应用入口配置安装标识使用的 Storage 业务键。
 *
 * @remarks 必须在首次读取 `installationIdentity.cacheKey` 或调用其他安装标识 API 前执行。相同配置
 * 可以幂等重复调用；切换到不同键会抛错，避免同一页面产生分裂状态。
 * @param options - 安装标识配置；省略 `cacheKey` 时使用 `identity:installation-id`。
 * @throws `TypeError` 当 `cacheKey` 不是非空字符串或包含外围空白。
 * @throws `Error` 当安装标识已经使用另一个业务键初始化。
 */
export function configureInstallationIdentity(options: InstallationIdentityConfiguration = {}): void {
	const cacheKey = options.cacheKey ?? defaultInstallationIdentityStorageKey;
	if (typeof cacheKey !== "string" || cacheKey.length === 0 || cacheKey.trim() !== cacheKey) {
		throw new TypeError("The installation identity `cacheKey` must be a nonempty string without surrounding whitespace.");
	}
	if (activeStorageKey === undefined) {
		activeStorageKey = cacheKey;
		return;
	}
	if (activeStorageKey !== cacheKey) throw new Error("The installation identity is already configured with a different `cacheKey`.");
}

/**
 * 全局安装标识状态。
 *
 * @remarks Storage 未显式配置时会使用其默认值。生成 UUID 时优先使用 Web Crypto，能力缺失时
 * 回退到 `Math.random()`。该值不是硬件标识、认证凭证或安全边界。
 */
export const installationIdentity: InstallationIdentity = {
	get cacheKey(): string {
		return getInstallationIdentityStorageKey();
	},
	deviceId: "",
	clear(): void {
		Local.remove(installationIdentity.cacheKey);
		installationIdentity.deviceId = "";
	},
	getOrCreate(installationId?: string): string {
		const candidate =
			installationId ??
			(installationIdentity.deviceId.length > 0 ? installationIdentity.deviceId : installationIdentity.read()) ??
			generateUuidV4();
		assertInstallationId(candidate);
		Local.set(installationIdentity.cacheKey, candidate);
		installationIdentity.deviceId = candidate;
		return candidate;
	},
	read(): string | undefined {
		const stored = Local.get(installationIdentity.cacheKey);
		if (stored === undefined) return undefined;
		if (typeof stored !== "string") throw new TypeError("The stored installation identity is corrupted.");
		assertInstallationId(stored);
		return stored;
	},
};

/**
 * 返回已有安装标识，否则创建并持久化一个 UUID v4。
 *
 * @param installationId - 可选的显式安装标识；传入时会校验并覆盖当前持久化值。
 * @returns 显式值、内存值、持久化值或新生成值中的最终安装标识
 * @throws `TypeError` 当显式值或持久化值不是 UUID v4。
 * @throws `Error` 当当前平台存储不可用。
 */
export function getOrCreateInstallationId(installationId?: string): string {
	return installationIdentity.getOrCreate(installationId);
}
