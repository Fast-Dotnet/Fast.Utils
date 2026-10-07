import { decodeSecureBase64, encodeSecureBase64 } from "../base64/index";

/** Storage 业务值编码器 */
export interface StorageCodec {
	/**
	 * 把已编码文本恢复为业务值。
	 * @param value - 由同一 Codec 的 `encode` 生成并持久化的文本
	 * @returns 解码后的业务值
	 * @throws 当文本损坏、格式不受支持或无法反序列化时应抛出错误。
	 */
	decode: (value: string) => unknown;
	/**
	 * 把业务值编码为可持久化字符串。
	 * @param value - 调用方传入的业务值
	 * @returns 可由同一 Codec 的 `decode` 无损恢复的文本
	 * @throws 当值不受支持或无法序列化时应抛出错误。
	 */
	encode: (value: unknown) => string;
}

/** 程序入口调用 {@link configureStorage} 时使用的全局配置。 */
export interface StorageConfiguration {
	/** 自定义值编码器；默认使用严格 JSON Codec，同一应用生命周期内必须保持同一引用。 */
	codec?: StorageCodec;
	/** 启用 Base64 可逆混淆；不提供加密、完整性或认证，不能与 `codec` 同时使用。 */
	crypto?: boolean;
	/** 返回 Unix 毫秒时间戳的时钟；默认使用 `Date.now`，主要用于 TTL 测试与受控时间源。 */
	now?: () => number;
	/** 所有物理键使用的非空命名空间前缀，默认 `fast__`。 */
	prefix?: string;
}

/** 单次 Storage 读取配置 */
export interface StorageReadOptions {
	/**
	 * 仅覆盖本次读取使用的 Codec；`true` 使用 Base64 混淆，`false` 使用 JSON，省略时使用全局配置。
	 * 必须与写入该条目时使用的单次设置一致。
	 */
	crypto?: boolean;
}

/** 单次 Storage 写入配置 */
export interface StorageWriteOptions extends StorageReadOptions {
	/** 从写入时刻开始的有效毫秒数；必须是大于 0 的有限数，省略时永久有效。 */
	ttlMs?: number;
}

/** `Local` 与 `Session` 的统一操作接口 */
export interface StorageArea {
	/** 当前全局 Storage 配置的物理键前缀；首次读取会激活默认配置。 */
	readonly prefix: string;
	/**
	 * 删除当前命名空间内的全部键，不影响同一后端中的其他应用键。
	 * @throws `Error` 当当前平台后端不可用。
	 */
	clear: () => void;
	/**
	 * 获取并解码业务值；已过期记录会在读取时删除。
	 * @param key - 不含全局前缀的非空业务键
	 * @param options - 可选的单次 Base64 混淆开关；必须与写入时一致。
	 * @returns 解码后的值；未传泛型时静态类型默认为 `string`，键缺失或过期时返回 `undefined`。
	 * @throws 当键非法、包络损坏、Codec 解码失败或后端不可用时抛出错误。
	 */
	get: <Value = string>(key: string, options?: StorageReadOptions) => Value | undefined;
	/**
	 * 判断业务键是否具有有效且未过期的包络；不解码业务值。
	 * @param key - 不含全局前缀的非空业务键
	 * @returns 键存在且包络有效时返回 `true`。
	 */
	has: (key: string) => boolean;
	/**
	 * 返回当前命名空间内的业务键快照。
	 * @returns 已移除全局前缀并按字典序排列的新数组；不会自动清理过期项。
	 */
	keys: () => string[];
	/**
	 * 扫描当前命名空间并删除全部过期记录。
	 * @returns 本次实际删除的记录数量
	 * @throws 当发现损坏包络或后端不可用时抛出错误。
	 */
	pruneExpired: () => number;
	/**
	 * 删除单个业务键；键不存在时保持幂等。
	 * @param key - 不含全局前缀的非空业务键
	 */
	remove: (key: string) => void;
	/**
	 * 删除业务键以指定文本开头的全部条目，范围仍受全局命名空间限制。
	 * @param keyPrefix - 不含全局前缀的非空业务键前缀
	 */
	removeByPrefix: (keyPrefix: string) => void;
	/**
	 * 编码并写入业务值，可附加惰性清理的 TTL。
	 * @param key - 不含全局前缀的非空业务键
	 * @param value - 必须受当前 Codec 支持的业务值
	 * @param options - 可选的单次写入 TTL 与 Base64 混淆开关
	 * @throws 当键、TTL、业务值或后端写入无效时抛出错误。
	 */
	set: <Value>(key: string, value: Value, options?: StorageWriteOptions) => void;
}

/** 浏览器 Storage 与 uni-app Storage 适配后的最小内部协议 */
interface StorageBackend {
	/** 读取物理键原始值；缺失约定由上层统一规范为 `undefined`。 */
	getItem: (key: string) => unknown;
	/** 枚举后端可见的全部物理键；返回值必须是不会随枚举过程变化的快照。 */
	keys: () => readonly string[];
	/** 删除单个物理键；实现必须允许重复删除。 */
	removeItem: (key: string) => void;
	/** 写入已经序列化的包络文本；配额和平台错误保持原样传播。 */
	setItem: (key: string, value: string) => void;
}

/** 物理存储中的版本化包络；业务值始终先经 Codec 转为文本。 */
interface StoredEnvelope {
	/** Codec 编码后的业务文本；只有在包络结构校验通过后才能交给 Codec。 */
	data: string;
	/** Unix 毫秒绝对过期时间戳；`null` 表示永久有效。 */
	expiresAt: number | null;
	/** 当前持久化协议版本；读取其他版本必须明确失败，不能猜测迁移。 */
	version: 3;
}

/** 首次配置后冻结使用的解析结果和两个稳定门面。 */
interface ActiveStorageConfiguration {
	/** 首次配置后锁定的业务值 Codec 引用。 */
	codec: StorageCodec;
	/** 已绑定 Local 后端、命名空间、Codec 与时钟的实际 Area。 */
	local: StorageArea;
	/** 首次配置后锁定的 TTL 时钟引用。 */
	now: () => number;
	/** 所有 Area 共享的物理键命名空间前缀。 */
	prefix: string;
	/** 仅浏览器模式存在的 Session Area；uni-app 模式必须保持缺失。 */
	session?: StorageArea;
}

/**
 * 读取并校验当前运行时的全局 uni-app 同步 Storage。
 *
 * @returns 检测到可用的 uni-app 同步 Storage 时返回 `true`。
 * @throws `TypeError` 当全局 `uni` 存在但缺少本库需要的同步 Storage 方法。
 */
const hasGlobalUniStorage = (): boolean => {
	if (typeof uni === "undefined") return false;
	if (
		uni === null ||
		typeof uni.getStorageSync !== "function" ||
		typeof uni.getStorageInfoSync !== "function" ||
		typeof uni.removeStorageSync !== "function" ||
		typeof uni.setStorageSync !== "function"
	) {
		throw new TypeError("The global uni object does not provide synchronous Storage APIs.");
	}
	return true;
};

/** 默认 JSON Codec；显式拒绝会被 JSON.stringify 静默丢弃的顶层值。 */
const jsonCodec: StorageCodec = {
	decode: (value) => JSON.parse(value) as unknown,
	encode: (value) => {
		const encoded = JSON.stringify(value);
		if (typeof encoded !== "string") throw new TypeError("The storage value cannot be serialized as JSON.");
		return encoded;
	},
};

/** Base64 混淆 Codec；只隐藏明文外观，不提供加密、完整性或认证。 */
export const base64StorageCodec: StorageCodec = {
	decode: (value) => JSON.parse(decodeSecureBase64(value)) as unknown,
	encode: (value) => {
		const encoded = JSON.stringify(value);
		if (typeof encoded !== "string") throw new TypeError("The storage value cannot be serialized as JSON.");
		return encodeSecureBase64(encoded);
	},
};

/** 页面级唯一配置；只允许幂等重复配置，避免模块加载顺序改变行为。 */
let activeConfiguration: ActiveStorageConfiguration | undefined;

/**
 * 判断未知值是否为非数组对象记录。
 *
 * @param value - JSON.parse 返回的未知值
 * @returns 值为非空、非数组对象时返回 `true`。
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 校验 Storage 业务键。
 *
 * @param key - 不含全局 Prefix 的业务键或业务键前缀
 * @throws `TypeError` 当值不是非空字符串。
 */
const assertKey = (key: string): void => {
	if (typeof key !== "string" || key.length === 0) throw new TypeError("Storage keys must be nonempty strings.");
};

/**
 * 创建浏览器 Storage 后端。
 *
 * @remarks 平台对象在调用阶段读取，因此导入模块不会访问浏览器全局对象。
 * @param kind - 选择 `localStorage` 或 `sessionStorage`。
 * @returns 统一的内部同步后端
 * @throws `Error` 当所选 Storage 在当前环境不可用。
 */
const createWebStorageBackend = (kind: "local" | "session"): StorageBackend => {
	const storage =
		kind === "local"
			? typeof localStorage === "undefined"
				? undefined
				: localStorage
			: typeof sessionStorage === "undefined"
				? undefined
				: sessionStorage;
	if (storage === undefined) throw new Error(`The current runtime does not support ${kind}Storage.`);
	return {
		getItem: (key) => storage.getItem(key),
		keys: () => {
			const keys: string[] = [];
			for (let index = 0; index < storage.length; index += 1) {
				const key = storage.key(index);
				if (key !== null) keys.push(key);
			}
			return keys;
		},
		removeItem: (key) => {
			storage.removeItem(key);
		},
		setItem: (key, value) => {
			storage.setItem(key, value);
		},
	};
};

/**
 * 把 uni-app 同步 Storage 适配为内部后端。
 *
 * @remarks uni-app 以空字符串同时表示“键缺失”和“真实空值”，因此空字符串需要结合键清单消除歧义。
 * @returns 统一的内部同步后端
 */
const createUniStorageBackend = (): StorageBackend => ({
	getItem: (key) => {
		const value: unknown = uni.getStorageSync(key);
		if (value !== "") return value;
		return uni.getStorageInfoSync().keys.includes(key) ? value : undefined;
	},
	keys: () => [...uni.getStorageInfoSync().keys],
	removeItem: (key) => {
		uni.removeStorageSync(key);
	},
	setItem: (key, value) => {
		uni.setStorageSync(key, value);
	},
});

/**
 * 解析并校验版本化 Storage 包络。
 *
 * @param rawValue - 后端返回的原始值
 * @param key - 用于错误定位的完整物理键
 * @returns 当前 v3 包络
 * @throws `TypeError` 当原始值不是字符串、JSON 损坏、版本不支持或字段类型非法。
 */
const parseStoredEnvelope = (rawValue: unknown, key: string): StoredEnvelope => {
	if (typeof rawValue !== "string") throw new TypeError(`Storage entry "${key}" is not a string.`);
	try {
		const parsed = JSON.parse(rawValue) as unknown;
		if (
			!isRecord(parsed) ||
			parsed["version"] !== 3 ||
			typeof parsed["data"] !== "string" ||
			!(parsed["expiresAt"] === null || (typeof parsed["expiresAt"] === "number" && Number.isFinite(parsed["expiresAt"])))
		) {
			throw new TypeError("Unsupported storage envelope.");
		}
		return { data: parsed["data"], expiresAt: parsed["expiresAt"], version: 3 };
	} catch (cause) {
		throw new TypeError(`Storage entry "${key}" is corrupted or unsupported.`, { cause });
	}
};

/**
 * 创建绑定命名空间、Codec 与时钟的 Storage Area。
 *
 * @param backendFactory - 每次操作时解析平台后端的工厂，保证导入安全并反映平台可用性。
 * @param prefix - 已校验的全局物理键前缀
 * @param codec - 业务值与包络文本之间的 Codec
 * @param now - TTL 计算使用的可注入时钟
 * @returns 完整的命名空间 Storage 操作集合
 */
const createStorageArea = (backendFactory: () => StorageBackend, prefix: string, codec: StorageCodec, now: () => number): StorageArea => {
	/**
	 * 拼接物理键。
	 *
	 * @param key - 已校验业务键
	 * @returns 带当前命名空间前缀的物理键
	 */
	const toStorageKey = (key: string) => `${prefix}${key}`;
	/**
	 * 解析本次读写实际使用的 Codec。
	 *
	 * @param crypto - 单次 Base64 混淆开关；省略时沿用 Area 全局 Codec。
	 * @returns 本次操作使用的全局、JSON 或 Base64 Codec
	 * @throws `TypeError` 当 JavaScript 调用方传入非布尔值。
	 */
	const resolveOperationCodec = (crypto: boolean | undefined) => {
		if (crypto === undefined) return codec;
		if (typeof crypto !== "boolean") throw new TypeError("The per-operation Storage `crypto` option must be a boolean.");
		return crypto ? base64StorageCodec : jsonCodec;
	};
	/**
	 * 枚举当前命名空间中的业务键。
	 *
	 * @param backend - 本次操作使用的后端
	 * @returns 已移除物理前缀、去重并排序的业务键
	 * @throws `TypeError` 当后端返回非字符串键。
	 */
	const listBusinessKeys = (backend: StorageBackend) => {
		const keys = backend.keys();
		if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) {
			throw new TypeError("Keys returned by the Storage backend must be strings.");
		}
		return [...new Set(keys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)))].sort();
	};
	/**
	 * 读取并处理单个包络。
	 *
	 * @param backend - 本次操作使用的后端
	 * @param key - 业务键
	 * @returns 未过期包络；键缺失或已经过期时返回 `undefined`。
	 * @throws `TypeError` 当键或包络非法。
	 * @throws `RangeError` 当注入时钟返回非有限时间戳。
	 */
	const readStoredEnvelope = (backend: StorageBackend, key: string): StoredEnvelope | undefined => {
		assertKey(key);
		const storageKey = toStorageKey(key);
		const rawValue = backend.getItem(storageKey);
		if (rawValue === null || rawValue === undefined) return undefined;
		const envelope = parseStoredEnvelope(rawValue, storageKey);
		if (envelope.expiresAt === null) return envelope;
		const timestamp = now();
		if (!Number.isFinite(timestamp)) throw new RangeError("The Storage clock must return a finite timestamp.");
		if (timestamp < envelope.expiresAt) return envelope;
		// 过期项在读取时立即删除，后续 has/keys/pruneExpired 观察到一致状态。
		backend.removeItem(storageKey);
		return undefined;
	};

	return {
		prefix,
		clear() {
			const backend = backendFactory();
			for (const key of listBusinessKeys(backend)) backend.removeItem(toStorageKey(key));
		},
		get<Value>(key: string, options: StorageReadOptions = {}): Value | undefined {
			const envelope = readStoredEnvelope(backendFactory(), key);
			if (envelope === undefined) return undefined;
			try {
				return resolveOperationCodec(options.crypto).decode(envelope.data) as Value;
			} catch (cause) {
				throw new TypeError(`Unable to decode Storage entry "${toStorageKey(key)}".`, { cause });
			}
		},
		has: (key) => readStoredEnvelope(backendFactory(), key) !== undefined,
		keys: () => listBusinessKeys(backendFactory()),
		pruneExpired() {
			const backend = backendFactory();
			let removed = 0;
			for (const key of listBusinessKeys(backend)) {
				// read 同时处理删除；先读取一次用于区分“原本缺失”和“本轮因过期删除”。
				const before = backend.getItem(toStorageKey(key));
				if (before !== null && before !== undefined && readStoredEnvelope(backend, key) === undefined) removed += 1;
			}
			return removed;
		},
		remove(key: string) {
			assertKey(key);
			backendFactory().removeItem(toStorageKey(key));
		},
		removeByPrefix(keyPrefix: string) {
			assertKey(keyPrefix);
			const backend = backendFactory();
			for (const key of listBusinessKeys(backend)) if (key.startsWith(keyPrefix)) backend.removeItem(toStorageKey(key));
		},
		set<Value>(key: string, value: Value, options: StorageWriteOptions = {}) {
			assertKey(key);
			if (value === undefined) throw new TypeError("Cannot store top-level `undefined`; remove the key instead.");
			let expiresAt: number | null = null;
			if (options.ttlMs !== undefined) {
				if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new RangeError("`ttlMs` must be a finite number greater than 0.");
				const timestamp = now();
				if (!Number.isFinite(timestamp) || !Number.isFinite(timestamp + options.ttlMs)) {
					throw new RangeError("The Storage expiration time exceeds the supported timestamp range.");
				}
				expiresAt = timestamp + options.ttlMs;
			}
			let data: string;
			try {
				data = resolveOperationCodec(options.crypto).encode(value);
				if (typeof data !== "string") throw new TypeError("The Storage codec must return a string.");
			} catch (cause) {
				throw new TypeError("Unable to encode the storage value.", { cause });
			}
			backendFactory().setItem(toStorageKey(key), JSON.stringify({ data, expiresAt, version: 3 } satisfies StoredEnvelope));
		},
	};
};

/**
 * 获取已激活的全局 Storage 配置。
 *
 * @returns 显式配置或首次 Storage 操作创建的默认配置
 */
const requireStorageConfiguration = (): ActiveStorageConfiguration => {
	if (activeConfiguration === undefined) configureStorage();
	if (activeConfiguration === undefined) throw new Error("Unable to initialize the Storage configuration.");
	return activeConfiguration;
};

/**
 * 创建稳定的公开 Storage 门面。
 *
 * @param select - 从激活配置选择 Local 或 Session 的函数
 * @param name - 用于不可用错误的公开门面名称
 * @returns 可安全导入、并在首次调用时解析默认或显式配置的稳定对象。
 */
const createStorageAreaProxy = (select: (configuration: ActiveStorageConfiguration) => StorageArea | undefined, name: string): StorageArea => {
	/**
	 * 解析当前实际 Area。
	 *
	 * @returns 配置中的 Local 或 Session Area
	 * @throws `Error` 当 uni-app 模式请求 Session。
	 */
	const getArea = () => {
		const area = select(requireStorageConfiguration());
		if (area === undefined) throw new Error(`${name} is not supported in uni-app.`);
		return area;
	};
	return {
		get prefix() {
			return getArea().prefix;
		},
		clear: () => {
			getArea().clear();
		},
		get: <Value>(key: string, options?: StorageReadOptions): Value | undefined => getArea().get<Value>(key, options),
		has: (key) => getArea().has(key),
		keys: () => getArea().keys(),
		pruneExpired: () => getArea().pruneExpired(),
		remove: (key) => {
			getArea().remove(key);
		},
		removeByPrefix: (keyPrefix) => {
			getArea().removeByPrefix(keyPrefix);
		},
		set: <Value>(key: string, value: Value, options?: StorageWriteOptions) => {
			getArea().set(key, value, options);
		},
	};
};

/** 浏览器 localStorage 或自动检测的 uni-app Storage 全局业务入口。 */
export const Local: StorageArea = createStorageAreaProxy((configuration) => configuration.local, "Local");

/** 浏览器 sessionStorage 的全局业务入口；uni-app 不提供会话存储。 */
export const Session: StorageArea = createStorageAreaProxy((configuration) => configuration.session, "Session");

/**
 * 在首次 Storage 操作前可选配置 `Local` 与 `Session`。
 *
 * @remarks 不调用时在首次操作上使用 `fast__`、JSON Codec 与 `Date.now`。首次激活后只允许以完全相同的值和引用重复调用。若检测到
 * 全局 `uni`，则自动使用其同步 Storage 且只启用 `Local`，否则使用浏览器 `localStorage` 与 `sessionStorage`。
 * `crypto: true` 仅执行可逆 Base64 混淆，不能保护敏感数据。
 * @param options - 可选的全局键前缀、Codec、Base64 混淆选项与时钟。
 * @throws 配置非法、重复配置冲突或目标平台 Storage 不可用时抛出错误。
 */
export function configureStorage(options: StorageConfiguration = {}): void {
	const prefix = options.prefix ?? "fast__";
	if (typeof prefix !== "string" || prefix.length === 0) {
		throw new TypeError("The Storage prefix must be a nonempty string.");
	}
	if (options.codec !== undefined && options.crypto === true) {
		throw new TypeError("Storage codec and crypto options cannot be used together.");
	}
	const codec = options.codec ?? (options.crypto === true ? base64StorageCodec : jsonCodec);
	const now = options.now ?? Date.now;
	if (activeConfiguration !== undefined) {
		// 相同配置允许多个入口模块幂等调用；任何引用或值变化都视为冲突。
		if (activeConfiguration.prefix === prefix && activeConfiguration.codec === codec && activeConfiguration.now === now) {
			return;
		}
		throw new Error("Storage is already configured with different options.");
	}
	const usesUniStorage = hasGlobalUniStorage();
	const localBackend = usesUniStorage ? () => createUniStorageBackend() : () => createWebStorageBackend("local");
	const local = createStorageArea(localBackend, prefix, codec, now);
	const configuration: ActiveStorageConfiguration = { codec, local, now, prefix };
	if (!usesUniStorage) {
		configuration.session = createStorageArea(() => createWebStorageBackend("session"), prefix, codec, now);
	}
	activeConfiguration = configuration;
}

/** 返回 Storage 是否已经显式配置，或由首次 Storage 操作激活默认配置。 */
export function isStorageConfigured(): boolean {
	return activeConfiguration !== undefined;
}
