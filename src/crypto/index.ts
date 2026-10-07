import AES from "crypto-js/aes";
import CryptoCore from "crypto-js/core";
import Hex from "crypto-js/enc-hex";
import Utf8 from "crypto-js/enc-utf8";
import MD5 from "crypto-js/md5";
import ECB from "crypto-js/mode-ecb";
import "crypto-js/pad-ansix923";
import Iso10126 from "crypto-js/pad-iso10126";
import NoPadding from "crypto-js/pad-nopadding";
import Pkcs7 from "crypto-js/pad-pkcs7";
import ZeroPadding from "crypto-js/pad-zeropadding";
import SHA1 from "crypto-js/sha1";
import { decodeBase64Bytes, decodeBase64UrlBytes, encodeBase64Bytes, encodeBase64UrlBytes } from "../base64/index";
import { type DecodedText, createDecodedText, decodeUtf8, encodeUtf8 } from "../internal/text";

/** PBKDF2 默认迭代次数。 */
const defaultPbkdf2Iterations = 600_000;

/** PBKDF2 允许的最小迭代次数。 */
const minimumPbkdf2Iterations = 100_000;

/** PBKDF2 允许的最大迭代次数，用于限制异常输入造成的计算资源消耗。 */
const maximumPbkdf2Iterations = 5_000_000;

/** 密码允许的最大 UTF-8 字节数。 */
const maximumPasswordBytes = 1024;

/** 密码加密接口允许的最大明文字节数。 */
const maximumPlaintextBytes = 8 * 1024 * 1024;

/** 密码解密接口允许的最大协议载荷字符数。 */
const maximumPayloadLength = 16 * 1024 * 1024;

/** 密码加密载荷的协议与算法版本前缀。 */
const encryptedPayloadPrefix = "FAST-AES-256-GCM-V1";

/** PBKDF2 密码哈希的协议与算法版本前缀。 */
const passwordHashPrefix = "FAST-PBKDF2-SHA256-V1";

/** 直接 AES-GCM 密钥加密载荷的协议版本。 */
const authenticatedAesPayloadVersion = 1;

/** AES 分组密码模式；与 .NET `CipherMode.CBC` 和 `CipherMode.ECB` 对应。 */
export type AesCipherMode = "CBC" | "ECB";

/** AES 填充模式；与 .NET `PaddingMode` 中可由 CryptoJS 互操作的成员对应。 */
export type AesPaddingMode = "None" | "PKCS7" | "Zeros" | "ANSIX923" | "ISO10126";

/** 校验 JavaScript 调用方传入的 AES 分组模式。 */
const assertAesCipherMode: (value: unknown) => asserts value is AesCipherMode = (value) => {
	if (value !== "CBC" && value !== "ECB") throw new RangeError("`cipherMode` must be `CBC` or `ECB`.");
};

/** Web Crypto 导出的 PEM 公私钥对 */
export interface PemKeyPair {
	/** 未加密的 PKCS#8 PEM 私钥，包含标准 `PRIVATE KEY` 头尾和 64 字符换行。 */
	privateKey: string;
	/** SubjectPublicKeyInfo PEM 公钥，包含标准 `PUBLIC KEY` 头尾和 64 字符换行。 */
	publicKey: string;
}

/** 本模块支持的 Web Crypto 椭圆曲线。 */
export type EcNamedCurve = "P-256" | "P-384" | "P-521";

/**
 * 检查当前操作所需的 Web Crypto 能力。
 *
 * @param methods - 当前操作需要的 SubtleCrypto 方法
 * @throws `Error` 当当前操作需要的 SubtleCrypto 方法缺失。
 */
const assertWebCrypto = (...methods: (keyof SubtleCrypto)[]): void => {
	if (typeof crypto === "undefined" || methods.some((method) => typeof crypto.subtle?.[method] !== "function")) {
		throw new Error("The current runtime does not support Web Crypto SubtleCrypto.");
	}
};

/**
 * 把 Uint8Array 复制为独立的完整 ArrayBuffer。
 *
 * @remarks 不能直接返回 `bytes.buffer`，因为输入可能只是更大 Buffer 的切片。
 * @param bytes - 源字节视图
 * @returns 长度与视图完全一致、偏移为零的新 ArrayBuffer
 */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
};

/** 本模块导出的 PKCS#8 与 SPKI PEM 标签。 */
const pemLabels = {
	private: "PRIVATE KEY",
	public: "PUBLIC KEY",
} as const;

/**
 * 把 DER 内容封装为 PEM。
 *
 * @param label - PEM Begin/End 标签，不包含分隔线。
 * @param value - DER 二进制内容
 * @returns 每行最多 64 个 Base64 字符的 PEM 文本
 */
const toPem = (label: string, value: ArrayBuffer): string => {
	const encoded = encodeBase64Bytes(new Uint8Array(value));
	const lines = encoded.match(/.{1,64}/gu)?.join("\n") ?? "";
	return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
};

/**
 * 校验 PEM 标签并还原 DER。
 *
 * @param value - PEM 文本
 * @param label - 当前算法预期的标签
 * @returns 独立的 DER ArrayBuffer
 * @throws `TypeError` 当 Begin/End 标签不匹配或 Base64 内容非法。
 */
const fromPem = (value: string, label: string): ArrayBuffer => {
	const header = `-----BEGIN ${label}-----`;
	const footer = `-----END ${label}-----`;
	const trimmed = value.trim();
	if (!trimmed.startsWith(header) || !trimmed.endsWith(footer)) throw new TypeError(`Expected a PEM value with the ${label} label.`);
	const encoded = trimmed.slice(header.length, -footer.length).replace(/\s+/gu, "");
	return toArrayBuffer(decodeBase64Bytes(encoded));
};

/**
 * 导出 Web Crypto 密钥对。
 *
 * @param keyPair - 可导出的公私钥对
 * @returns PKCS#8 私钥和 SPKI 公钥组成的 PEM 对象
 * @throws `Error` 当平台拒绝导出或密钥格式不兼容。
 */
const exportKeyPair = async (keyPair: CryptoKeyPair): Promise<PemKeyPair> => {
	assertWebCrypto("exportKey");
	const [privateKey, publicKey] = await Promise.all([
		crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
		crypto.subtle.exportKey("spki", keyPair.publicKey),
	]);
	return {
		privateKey: toPem(pemLabels.private, privateKey),
		publicKey: toPem(pemLabels.public, publicKey),
	};
};

/**
 * 缩小 Web Crypto `generateKey` 的联合返回值。
 *
 * @param value - 平台返回的单密钥或密钥对
 * @returns 同时具有公钥和私钥的密钥对
 * @throws `Error` 当平台没有按请求生成密钥对。
 */
const assertKeyPair = (value: CryptoKey | CryptoKeyPair): CryptoKeyPair => {
	if ("privateKey" in value && "publicKey" in value) return value;
	throw new Error("The current runtime did not generate a key pair.");
};

/**
 * 校验并编码密码。
 *
 * @param password - 用户提供的密码文本
 * @returns UTF-8 密码字节
 * @throws `TypeError` 当密码为空。
 * @throws `RangeError` 当 UTF-8 长度超过 1,024 字节。
 */
const encodeValidatedPassword = (password: string): Uint8Array => {
	const bytes = encodeUtf8(password);
	if (bytes.length === 0) throw new TypeError("The encryption password must not be empty.");
	if (bytes.length > maximumPasswordBytes) {
		throw new RangeError(`The UTF-8 password must not exceed ${maximumPasswordBytes} bytes.`);
	}
	return bytes;
};

/**
 * 校验 PBKDF2 迭代次数。
 *
 * @param iterations - 待使用的迭代次数
 * @returns 校验后的原始整数
 * @throws `RangeError` 当值不是 100,000 至 5,000,000 的安全整数。
 */
const validateIterations = (iterations: number): number => {
	if (!Number.isSafeInteger(iterations) || iterations < minimumPbkdf2Iterations || iterations > maximumPbkdf2Iterations) {
		throw new RangeError(`\`iterations\` must be a safe integer between ${minimumPbkdf2Iterations} and ${maximumPbkdf2Iterations}.`);
	}
	return iterations;
};

/** 把字节格式化为小写十六进制。 */
const toLowerHex = (value: Uint8Array): string => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** 把字节格式化为大写十六进制。 */
const toUpperHex = (value: Uint8Array): string => toLowerHex(value).toUpperCase();

/**
 * 使用指定的 Web Crypto HMAC 算法计算原始认证标签。
 *
 * @param value - 要认证的 UTF-8 文本或原始字节
 * @param key - 非空的 UTF-8 文本密钥或原始密钥字节
 * @param hash - HMAC 使用的 SHA-2 摘要算法
 * @returns 算法规定长度的原始认证标签
 * @throws `TypeError` 当密钥为空。
 * @throws `Error` 当运行时缺少所需 Web Crypto 能力。
 */
const computeHmacBytes = async (value: string, key: string, hash: "SHA-256" | "SHA-384" | "SHA-512"): Promise<Uint8Array> => {
	const keyBytes = encodeUtf8(key);
	if (keyBytes.length === 0) throw new TypeError("The HMAC key must not be empty.");

	assertWebCrypto("importKey", "sign");
	const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { hash, name: "HMAC" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(encodeUtf8(value)));
	return new Uint8Array(signature);
};

/**
 * 生成随机字节。
 *
 * @remarks 优先使用 Web Crypto；平台缺少安全随机能力时回退到 `Math.random()`。
 * @param length - 0 至 65,536 的安全整数
 * @returns 新建的 `Uint8Array`
 * @throws 参数非法时抛出 `RangeError`。
 */
export function GenerateRandomBytes(length: number): Uint8Array {
	if (!Number.isSafeInteger(length) || length < 0 || length > 65_536) {
		throw new RangeError("`length` must be a safe integer between 0 and 65,536.");
	}
	const bytes = new Uint8Array(length);
	if (typeof crypto !== "undefined" && typeof crypto?.getRandomValues === "function") return crypto.getRandomValues(bytes);
	for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 0x100);
	return bytes;
}

/**
 * 以不提前退出的方式比较两个字节数组。
 *
 * @remarks JavaScript 引擎不保证严格常量时间；该函数只避免显式短路，不能替代服务端
 * 密码学库提供的 timing-safe primitive。长度是否相同仍属于可观察信息。
 * @param left - 第一字节序列
 * @param right - 第二字节序列
 * @returns 长度和每个字节均相同时返回 `true`。
 */
export function FixedTimeEquals(left: Uint8Array, right: Uint8Array): boolean {
	const length = Math.max(left.length, right.length);
	let difference = left.length === right.length ? 0 : 1;
	// 不按长度或首个差异提前退出；缺失位置按零参与累计差异。
	for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	return difference === 0;
}

/**
 * 计算 MD5 摘要并返回小写十六进制文本。
 *
 * @remarks MD5 仅用于非安全的普通校验，不得用于密码、签名或抗碰撞场景。
 * @param value - UTF-8 文本
 * @returns 32 字符小写十六进制摘要
 */
export function MD5Encrypt(value: string): string {
	return MD5(value).toString(Hex);
}

/**
 * 计算 SHA-1 摘要并返回大写十六进制文本。
 *
 * @remarks SHA-1 仅用于非安全的普通校验，不得用于密码、签名或抗碰撞场景。
 * @param value - UTF-8 文本
 * @returns 40 字符大写十六进制摘要
 */
export function SHA1Encrypt(value: string): string {
	return SHA1(value).toString(Hex).toUpperCase();
}

/**
 * 计算 SHA-256 摘要。
 *
 * @remarks SHA-256 是快速摘要，不适合直接存储或校验密码。
 * @param value - UTF-8 字符串或原始字节
 * @returns 32 字节摘要
 * @throws 缺少 Web Crypto 时抛出 `Error`。
 */
export async function SHA256Bytes(value: string): Promise<Uint8Array> {
	assertWebCrypto("digest");
	const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(encodeUtf8(value)));
	return new Uint8Array(digest);
}

/**
 * 计算 SHA-256 并格式化为十六进制。
 *
 * @param value - UTF-8 字符串或原始字节
 * @returns 64 字符大写十六进制文本
 * @throws 缺少 Web Crypto 时抛出 `Error`。
 */
export async function SHA256Encrypt(value: string): Promise<string> {
	return toUpperHex(await SHA256Bytes(value));
}

/**
 * 计算 SHA-384 摘要。
 *
 * @param value - UTF-8 文本或原始字节
 * @returns 48 字节摘要
 */
export async function SHA384Bytes(value: string): Promise<Uint8Array> {
	assertWebCrypto("digest");
	const digest = await crypto.subtle.digest("SHA-384", toArrayBuffer(encodeUtf8(value)));
	return new Uint8Array(digest);
}

/**
 * 计算 SHA-384 并格式化为十六进制文本。
 *
 * @param value - UTF-8 文本或原始字节
 * @returns 96 个大写十六进制字符组成的摘要
 */
export async function SHA384Encrypt(value: string): Promise<string> {
	return toUpperHex(await SHA384Bytes(value));
}

/**
 * 计算 SHA-512 摘要。
 *
 * @param value - UTF-8 文本或原始字节
 * @returns 64 字节摘要
 */
export async function SHA512Bytes(value: string): Promise<Uint8Array> {
	assertWebCrypto("digest");
	const digest = await crypto.subtle.digest("SHA-512", toArrayBuffer(encodeUtf8(value)));
	return new Uint8Array(digest);
}

/**
 * 计算 SHA-512 并格式化为十六进制文本。
 *
 * @param value - UTF-8 文本或原始字节
 * @returns 128 个大写十六进制字符组成的摘要
 */
export async function SHA512Encrypt(value: string): Promise<string> {
	return toUpperHex(await SHA512Bytes(value));
}

/**
 * 使用 HMAC-SHA-256 认证文本，并返回十六进制标签。
 *
 * @param value - 要认证的 UTF-8 文本或原始字节
 * @param key - 非空的 UTF-8 文本密钥或原始密钥字节
 * @returns 64 个小写十六进制字符组成的认证标签
 */
export async function HMACSHA256Encrypt(value: string, key: string): Promise<string> {
	return toLowerHex(await computeHmacBytes(value, key, "SHA-256"));
}

/**
 * 使用 HMAC-SHA-384 认证文本或字节，并返回十六进制标签。
 *
 * @param value - 要认证的 UTF-8 文本或原始字节
 * @param key - 非空的 UTF-8 文本密钥或原始密钥字节
 * @returns 96 个小写十六进制字符组成的认证标签
 */
export async function HMACSHA384Encrypt(value: string, key: string): Promise<string> {
	return toLowerHex(await computeHmacBytes(value, key, "SHA-384"));
}

/**
 * 使用 HMAC-SHA-512 认证文本或字节，并返回十六进制标签。
 *
 * @param value - 要认证的 UTF-8 文本或原始字节
 * @param key - 非空的 UTF-8 文本密钥或原始密钥字节
 * @returns 128 个小写十六进制字符组成的认证标签
 */
export async function HMACSHA512Encrypt(value: string, key: string): Promise<string> {
	return toLowerHex(await computeHmacBytes(value, key, "SHA-512"));
}

/**
 * 使用 PBKDF2-HMAC-SHA-256 从密码派生密钥。
 *
 * @param password - 1 至 1,024 UTF-8 字节的密码
 * @param salt - 至少 8 字节的盐
 * @param iterations - 迭代次数，范围为 100,000 至 5,000,000。
 * @param outputLength - 输出长度，范围为 1 至 1,024 字节
 * @returns 指定长度的派生密钥
 * @throws 参数超过协议边界时抛出 `TypeError` 或 `RangeError`。
 */
export async function PBKDF2SHA256(password: string, salt: Uint8Array, iterations = defaultPbkdf2Iterations, outputLength = 32): Promise<Uint8Array> {
	const passwordBytes = encodeValidatedPassword(password);
	if (salt.length < 8) throw new RangeError("The PBKDF2 salt must contain at least 8 bytes; at least 16 bytes are recommended.");
	if (!Number.isSafeInteger(outputLength) || outputLength < 1 || outputLength > 1024) {
		throw new RangeError("`outputLength` must be a safe integer between 1 and 1,024.");
	}

	// 密码作为不可导出的 PBKDF2 原始材料导入，派生结果只通过 deriveBits 返回。
	assertWebCrypto("importKey", "deriveBits");
	const material = await crypto.subtle.importKey("raw", toArrayBuffer(passwordBytes), "PBKDF2", false, ["deriveBits"]);
	const derived = await crypto.subtle.deriveBits(
		{ hash: "SHA-256", iterations: validateIterations(iterations), name: "PBKDF2", salt: toArrayBuffer(salt) },
		material,
		outputLength * 8
	);
	return new Uint8Array(derived);
}

/**
 * 生成可持久化的随机盐 PBKDF2-HMAC-SHA-256 密码哈希。
 *
 * @param password - 1 至 1,024 UTF-8 字节的密码
 * @param iterations - 迭代次数，范围为 100,000 至 5,000,000。
 * @returns 包含版本、迭代次数、16 字节随机盐和 32 字节派生密钥的自描述字符串。
 */
export async function HashPasswordPBKDF2SHA256(password: string, iterations = defaultPbkdf2Iterations): Promise<string> {
	// 每个密码独立生成盐，避免相同密码产生相同持久化结果并提高预计算攻击成本。
	const salt = GenerateRandomBytes(16);
	const derivedKey = await PBKDF2SHA256(password, salt, iterations);
	return [passwordHashPrefix, String(iterations), encodeBase64UrlBytes(salt), encodeBase64UrlBytes(derivedKey)].join(":");
}

/**
 * 验证 {@link HashPasswordPBKDF2SHA256} 生成的密码哈希。
 *
 * @param password - 要验证的密码
 * @param passwordHash - 自描述的 PBKDF2-HMAC-SHA-256 密码哈希。
 * @returns 格式有效且密码匹配时返回 `true`；格式无效或密码错误时返回 `false`。
 */
export async function VerifyPasswordPBKDF2SHA256(password: string, passwordHash: string): Promise<boolean> {
	try {
		// 先验证协议版本和字段边界，再执行高成本 PBKDF2，避免无效输入消耗不受控资源。
		const parts = passwordHash.split(":");
		if (parts.length !== 4 || parts[0] !== passwordHashPrefix) return false;
		const iterations = validateIterations(Number(parts[1]));
		const salt = decodeBase64UrlBytes(parts[2] ?? "");
		const expected = decodeBase64UrlBytes(parts[3] ?? "");
		if (salt.length !== 16 || expected.length !== 32) return false;
		const actual = await PBKDF2SHA256(password, salt, iterations, expected.length);
		return FixedTimeEquals(actual, expected);
	} catch {
		return false;
	}
}

/**
 * 使用 RFC 5869 HKDF-SHA-256 派生上下文隔离的密钥材料。
 *
 * @param inputKeyMaterial - 输入密钥材料，例如 ECDH 原始共享秘密。
 * @param salt - 可选盐；空值按 RFC 5869 的零盐语义处理。
 * @param info - 应用、协议和密钥用途上下文
 * @param outputLength - 输出长度，范围为 1 至 8,160 字节
 * @returns 与 `salt` 和 `info` 绑定的派生密钥
 */
export async function HKDFSHA256(
	inputKeyMaterial: Uint8Array,
	salt: Uint8Array = new Uint8Array(),
	info: Uint8Array = new Uint8Array(),
	outputLength = 32
): Promise<Uint8Array> {
	if (!Number.isSafeInteger(outputLength) || outputLength < 1 || outputLength > 255 * 32) {
		throw new RangeError("`outputLength` must be a safe integer between 1 and 8,160.");
	}

	// Web Crypto 的 HKDF 实现内部完成 RFC 5869 Extract 和 Expand，并且不会导出中间 PRK。
	assertWebCrypto("importKey", "deriveBits");
	const material = await crypto.subtle.importKey("raw", toArrayBuffer(inputKeyMaterial), "HKDF", false, ["deriveBits"]);
	const derived = await crypto.subtle.deriveBits(
		{ hash: "SHA-256", info: toArrayBuffer(info), name: "HKDF", salt: toArrayBuffer(salt) },
		material,
		outputLength * 8
	);
	return new Uint8Array(derived);
}

/**
 * 使用 AES-256 对 UTF-8 文本进行分组加密。
 *
 * @remarks 密钥和 IV 分别补字符 `f` 或截断到 32、16 个 UTF-16 Code Unit，与 .NET
 * `AESEncrypt` 保持一致。CBC/ECB 不提供完整性认证，密文可能被篡改。
 * @param dataStr - 要加密的 UTF-8 文本；空白文本返回 `null`。
 * @param key - 非空白的密钥文本
 * @param vector - 非空白的初始化向量文本；ECB 模式仍要求传入该参数以对齐 .NET 签名。
 * @param cipherMode - AES 分组模式，默认 `CBC`
 * @param paddingMode - AES 填充模式，默认 `PKCS7`
 * @returns Base64 密文；输入、密钥或 IV 为空白时返回 `null`。
 * @throws 模式或填充不受支持时抛出 `RangeError`。
 */
export function AESEncrypt(
	dataStr: string,
	key: string,
	vector: string,
	cipherMode: AesCipherMode = "CBC",
	paddingMode: AesPaddingMode = "PKCS7"
): string | null {
	if (dataStr.trim().length === 0 || key.trim().length === 0 || vector.trim().length === 0) return null;
	assertAesCipherMode(cipherMode);

	let padding = Pkcs7;
	switch (paddingMode) {
		case "None":
			padding = NoPadding;
			break;
		case "PKCS7":
			break;
		case "Zeros":
			padding = ZeroPadding;
			break;
		case "ANSIX923":
			// crypto-js 4.2.0 的 pad-ansix923 默认导出名称拼写错误，使用其注册到核心对象的实现。
			padding = CryptoCore.pad.AnsiX923;
			break;
		case "ISO10126":
			padding = Iso10126;
			break;
		default:
			throw new RangeError("Unsupported `paddingMode`.");
	}
	if (paddingMode === "None" && encodeUtf8(dataStr).length % 16 !== 0) {
		throw new RangeError("AES plaintext length must be a multiple of 16 bytes when `paddingMode` is `None`.");
	}

	// 按 .NET 入口的字符规则处理密钥和 IV，再由 CryptoJS 统一按 UTF-8 编码。
	const keyBytes = Utf8.parse(key.padEnd(32, "f").slice(0, 32));
	const vectorBytes = Utf8.parse(vector.padEnd(16, "f").slice(0, 16));
	return AES.encrypt(dataStr, keyBytes, cipherMode === "CBC" ? { iv: vectorBytes, padding } : { iv: vectorBytes, mode: ECB, padding }).toString();
}

/**
 * 使用 AES-256 解密 Base64 分组密文。
 *
 * @remarks 参数归一化规则与 {@link AESEncrypt} 以及 .NET `AESDecrypt` 相同。
 * @param dataStr - Base64 密文；空白文本返回 `null`。
 * @param key - 加密时使用的密钥文本
 * @param vector - 加密时使用的初始化向量文本
 * @param cipherMode - AES 分组模式，默认 `CBC`
 * @param paddingMode - AES 填充模式，默认 `PKCS7`
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 UTF-8 字符串；输入、密钥或 IV 为空白时返回 `null`。
 * @throws 模式、填充、Base64、密钥或密文无效时抛出错误。
 */
export function AESDecrypt(
	dataStr: string,
	key: string,
	vector: string,
	cipherMode: AesCipherMode = "CBC",
	paddingMode: AesPaddingMode = "PKCS7"
): DecodedText | null {
	if (dataStr.trim().length === 0 || key.trim().length === 0 || vector.trim().length === 0) return null;
	assertAesCipherMode(cipherMode);

	let padding = Pkcs7;
	switch (paddingMode) {
		case "None":
			padding = NoPadding;
			break;
		case "PKCS7":
			break;
		case "Zeros":
			// .NET 的 Zeros 解密不会移除尾部零字节，因此使用 NoPadding 保留完整明文块。
			padding = NoPadding;
			break;
		case "ANSIX923":
			// crypto-js 4.2.0 的 pad-ansix923 默认导出名称拼写错误，使用其注册到核心对象的实现。
			padding = CryptoCore.pad.AnsiX923;
			break;
		case "ISO10126":
			padding = Iso10126;
			break;
		default:
			throw new RangeError("Unsupported `paddingMode`.");
	}
	const ciphertextBytes = decodeBase64Bytes(dataStr);
	if (ciphertextBytes.length === 0 || ciphertextBytes.length % 16 !== 0) {
		throw new RangeError("AES ciphertext must contain at least one complete 16-byte block.");
	}

	// 解密必须重复使用加密端相同的字符补齐和截断规则。
	const keyBytes = Utf8.parse(key.padEnd(32, "f").slice(0, 32));
	const vectorBytes = Utf8.parse(vector.padEnd(16, "f").slice(0, 16));
	return createDecodedText(
		AES.decrypt(dataStr, keyBytes, cipherMode === "CBC" ? { iv: vectorBytes, padding } : { iv: vectorBytes, mode: ECB, padding }).toString(Utf8)
	);
}

/**
 * 使用 SHA-256 归一化文本密钥，再以 AES-256-GCM 认证加密 UTF-8 文本。
 *
 * @remarks 输出与 .NET `AESEncryptAuthenticated` 的 v1 Base64 二进制载荷完全一致。
 * @param plaintext - 要加密的 UTF-8 文本
 * @param key - 非空的 UTF-8 文本密钥；内部归一化为 32 字节 SHA-256 摘要。
 * @returns Base64 编码的 v1 AES-GCM 认证载荷
 * @throws 密钥为空或运行时缺少 Web Crypto 时抛出错误。
 */
export async function AESEncryptAuthenticated(plaintext: string, key: string): Promise<string> {
	if (key.trim().length === 0) throw new TypeError("The encryption key must not be empty.");
	assertWebCrypto("importKey", "encrypt");
	const keyBytes = await SHA256Bytes(key);
	const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "AES-GCM" }, false, ["encrypt"]);
	// 96 位随机 nonce 是 GCM 的标准高效长度；每次加密都生成新值，避免同一密钥下重复。
	const nonce = GenerateRandomBytes(12);
	const encrypted = new Uint8Array(
		await crypto.subtle.encrypt({ iv: toArrayBuffer(nonce), name: "AES-GCM", tagLength: 128 }, cryptoKey, toArrayBuffer(encodeUtf8(plaintext)))
	);
	const ciphertextLength = encrypted.length - 16;
	// .NET v1 协议字段顺序固定为 version || nonce || tag || ciphertext。
	const payload = new Uint8Array(1 + nonce.length + 16 + ciphertextLength);
	payload[0] = authenticatedAesPayloadVersion;
	payload.set(nonce, 1);
	payload.set(encrypted.subarray(ciphertextLength), 1 + nonce.length);
	payload.set(encrypted.subarray(0, ciphertextLength), 1 + nonce.length + 16);
	return encodeBase64Bytes(payload);
}

/**
 * 解密并认证 .NET `AESEncryptAuthenticated` 或 {@link AESEncryptAuthenticated} 生成的载荷。
 *
 * @param payload - Base64 编码的 v1 AES-GCM 二进制载荷。
 * @param key - 加密时使用的非空 UTF-8 文本密钥
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 UTF-8 字符串。
 * @throws 载荷格式无效、密钥错误或认证失败时抛出错误。
 */
export async function AESDecryptAuthenticated(payload: string, key: string): Promise<DecodedText> {
	if (key.trim().length === 0) throw new TypeError("The encryption key must not be empty.");
	const decoded = decodeBase64Bytes(payload);
	if (decoded.length < 29 || decoded[0] !== authenticatedAesPayloadVersion) {
		throw new TypeError("Unsupported AES-GCM payload format or version.");
	}

	const nonce = decoded.subarray(1, 13);
	const tag = decoded.subarray(13, 29);
	const ciphertext = decoded.subarray(29);
	// Web Crypto 接收 ciphertext || tag，因此把 .NET v1 的独立字段恢复为 Web Crypto 输入顺序。
	const ciphertextAndTag = new Uint8Array(ciphertext.length + tag.length);
	ciphertextAndTag.set(ciphertext);
	ciphertextAndTag.set(tag, ciphertext.length);
	assertWebCrypto("importKey", "decrypt");
	const keyBytes = await SHA256Bytes(key);
	const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "AES-GCM" }, false, ["decrypt"]);
	const plaintext = await crypto.subtle.decrypt(
		{ iv: toArrayBuffer(nonce), name: "AES-GCM", tagLength: 128 },
		cryptoKey,
		toArrayBuffer(ciphertextAndTag)
	);
	return createDecodedText(decodeUtf8(plaintext));
}

/**
 * 使用 PBKDF2-HMAC-SHA-256 派生密钥，再以 AES-256-GCM 认证加密 UTF-8 文本。
 *
 * @remarks 每次调用生成独立 16 字节盐与 12 字节 IV。输出是与 .NET `AESEncryptWithPassword`
 * 一致的 v1 自描述载荷，不应由业务代码手动拆分或修改。密码加密不替代密钥管理。
 * @param plaintext - 原始文本，不进行 JSON 推断；UTF-8 编码后最大 8 MiB。
 * @param password - 1 至 1024 UTF-8 字节的秘密口令
 * @param iterations - PBKDF2 工作因子，默认 600,000
 * @returns 认证密文字符串；相同输入每次产生不同结果。
 * @throws 口令非法时抛出 `TypeError` 或 `RangeError`；明文过大时抛出 `RangeError`；
 * 运行时缺少 Web Crypto 时抛出 `Error`。
 */
export async function AESEncryptWithPassword(plaintext: string, password: string, iterations = defaultPbkdf2Iterations): Promise<string> {
	const passwordBytes = encodeValidatedPassword(password);
	const plaintextBytes = encodeUtf8(plaintext);
	if (plaintextBytes.length > maximumPlaintextBytes) {
		throw new RangeError(`The UTF-8 plaintext must not exceed ${maximumPlaintextBytes} bytes.`);
	}
	const validatedIterations = validateIterations(iterations);
	assertWebCrypto("importKey", "deriveKey", "encrypt");
	const salt = GenerateRandomBytes(16);
	const iv = GenerateRandomBytes(12);
	const material = await crypto.subtle.importKey("raw", toArrayBuffer(passwordBytes), "PBKDF2", false, ["deriveKey"]);
	// AES-GCM 密钥只允许加密，且不允许从 Web Crypto 导出。
	const key = await crypto.subtle.deriveKey(
		{ hash: "SHA-256", iterations: validatedIterations, name: "PBKDF2", salt: toArrayBuffer(salt) },
		material,
		{ length: 256, name: "AES-GCM" },
		false,
		["encrypt"]
	);
	// Prefix 同时作为明文版本字段和 AAD，攻击者无法在不破坏认证标签的情况下替换协议版本。
	const ciphertext = await crypto.subtle.encrypt(
		{ additionalData: toArrayBuffer(encodeUtf8(encryptedPayloadPrefix)), iv: toArrayBuffer(iv), name: "AES-GCM", tagLength: 128 },
		key,
		plaintextBytes
	);
	// 字段顺序属于持久化协议：版本、KDF 成本、盐、IV、带 GCM Tag 的密文。
	return [
		encryptedPayloadPrefix,
		String(validatedIterations),
		encodeBase64UrlBytes(salt),
		encodeBase64UrlBytes(iv),
		encodeBase64UrlBytes(new Uint8Array(ciphertext)),
	].join(":");
}

/**
 * 解密 {@link AESEncryptWithPassword} 生成的 v1 认证载荷。
 *
 * @param payload - 未修改的 v1 载荷，最大约 16 MiB 文本
 * @param password - 加密时使用的口令
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 UTF-8 字符串。
 * @throws 格式或字段非法时抛出 `TypeError`，载荷过大时抛出 `RangeError`，认证或密码
 * 失败及缺少平台能力时抛出 `Error`。
 */
export async function AESDecryptWithPassword(payload: string, password: string): Promise<DecodedText> {
	const passwordBytes = encodeValidatedPassword(password);
	if (payload.length > maximumPayloadLength) {
		throw new RangeError("The encrypted payload exceeds the supported size.");
	}
	// 先验证固定字段数和版本，再对高成本 KDF 与解密进行任何工作。
	const parts = payload.split(":");
	if (parts.length !== 5 || parts[0] !== encryptedPayloadPrefix) {
		throw new TypeError("Unsupported encrypted payload format.");
	}

	let iterations: number;
	let salt: Uint8Array;
	let iv: Uint8Array;
	let ciphertext: Uint8Array;
	try {
		iterations = validateIterations(Number(parts[1]));
		salt = decodeBase64UrlBytes(parts[2] ?? "");
		iv = decodeBase64UrlBytes(parts[3] ?? "");
		ciphertext = decodeBase64UrlBytes(parts[4] ?? "");
		if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
			throw new TypeError("The encrypted payload contains invalid field lengths.");
		}
	} catch (cause) {
		throw new TypeError("The encrypted payload contains invalid fields.", { cause });
	}

	assertWebCrypto("importKey", "deriveKey", "decrypt");
	try {
		const material = await crypto.subtle.importKey("raw", toArrayBuffer(passwordBytes), "PBKDF2", false, ["deriveKey"]);
		// 解密密钥不允许导出，也不能被误用于加密。
		const key = await crypto.subtle.deriveKey(
			{ hash: "SHA-256", iterations, name: "PBKDF2", salt: toArrayBuffer(salt) },
			material,
			{ length: 256, name: "AES-GCM" },
			false,
			["decrypt"]
		);
		const plaintext = await crypto.subtle.decrypt(
			{ additionalData: toArrayBuffer(encodeUtf8(encryptedPayloadPrefix)), iv: toArrayBuffer(iv), name: "AES-GCM", tagLength: 128 },
			key,
			toArrayBuffer(ciphertext)
		);
		return createDecodedText(decodeUtf8(plaintext));
	} catch (cause) {
		throw new Error("Unable to authenticate or decrypt the payload.", { cause });
	}
}

/**
 * 生成可供 RSA-OAEP/SHA-256 与 RSA-PSS/SHA-256 共用的 PEM 密钥对。
 *
 * @param modulusLength - RSA 模数位数，默认 2,048；必须是不小于 2,048 的 256 倍数。
 * @returns 未加密 PKCS#8 私钥和 SubjectPublicKeyInfo 公钥组成的 PEM 密钥对。
 * @throws 模数小于 2,048 或不是 256 的倍数时抛出 `RangeError`。
 */
export async function GenerateRSAKeyPair(modulusLength = 2048): Promise<PemKeyPair> {
	if (!Number.isSafeInteger(modulusLength) || modulusLength < 2048 || modulusLength % 256 !== 0) {
		throw new RangeError("`modulusLength` must be a safe integer of at least 2048 divisible by 256.");
	}
	assertWebCrypto("generateKey", "exportKey");
	const keyPair = assertKeyPair(
		await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength,
				name: "RSA-OAEP",
				publicExponent: Uint8Array.of(1, 0, 1),
			},
			true,
			["decrypt", "encrypt"]
		)
	);
	return exportKeyPair(keyPair);
}

/**
 * 使用 RSA-OAEP/SHA-256 公钥加密 UTF-8 文本。
 *
 * @param plaintext - 要加密的 UTF-8 文本；长度必须满足 RSA-OAEP 模数限制。
 * @param publicKeyPem - SubjectPublicKeyInfo PEM 公钥。
 * @returns Base64 编码的 RSA 密文
 * @throws 公钥格式无效或明文超过 RSA-OAEP 容量时抛出错误。
 */
export async function RSAEncryptOAEP(plaintext: string, publicKeyPem: string): Promise<string> {
	assertWebCrypto("importKey", "encrypt");
	const key = await crypto.subtle.importKey("spki", fromPem(publicKeyPem, pemLabels.public), { hash: "SHA-256", name: "RSA-OAEP" }, false, [
		"encrypt",
	]);
	const ciphertext = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, toArrayBuffer(encodeUtf8(plaintext)));
	return encodeBase64Bytes(new Uint8Array(ciphertext));
}

/**
 * 使用 RSA-OAEP/SHA-256 私钥解密 Base64 密文。
 *
 * @param ciphertext - Base64 编码的 RSA 密文
 * @param privateKeyPem - 未加密的 PKCS#8 PEM 私钥
 * @returns 可直接使用或显式调用 `.parseJson<Value>()` 的原始 UTF-8 字符串。
 * @throws 私钥、Base64 或密文无效时抛出错误。
 */
export async function RSADecryptOAEP(ciphertext: string, privateKeyPem: string): Promise<DecodedText> {
	assertWebCrypto("importKey", "decrypt");
	const key = await crypto.subtle.importKey("pkcs8", fromPem(privateKeyPem, pemLabels.private), { hash: "SHA-256", name: "RSA-OAEP" }, false, [
		"decrypt",
	]);
	const plaintext = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, toArrayBuffer(decodeBase64Bytes(ciphertext)));
	return createDecodedText(decodeUtf8(plaintext));
}

/**
 * 使用 RSA-PSS/SHA-256 私钥签名文本或字节。
 *
 * @param value - 要签名的 UTF-8 文本或原始字节
 * @param privateKeyPem - 未加密的 PKCS#8 PEM 私钥
 * @returns Base64 编码的 RSA-PSS 签名；盐长度固定为 32 字节。
 * @throws 私钥格式无效或签名失败时抛出错误。
 */
export async function RSASignPSS(value: string, privateKeyPem: string): Promise<string> {
	assertWebCrypto("importKey", "sign");
	const key = await crypto.subtle.importKey("pkcs8", fromPem(privateKeyPem, pemLabels.private), { hash: "SHA-256", name: "RSA-PSS" }, false, [
		"sign",
	]);
	// PSS 盐长度固定为 SHA-256 摘要长度，与 .NET RSASignaturePadding.Pss 的默认行为一致。
	const signature = await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key, toArrayBuffer(encodeUtf8(value)));
	return encodeBase64Bytes(new Uint8Array(signature));
}

/**
 * 使用 RSA-PSS/SHA-256 公钥验证 Base64 签名。
 *
 * @param value - 签名时使用的 UTF-8 文本或原始字节
 * @param signature - Base64 编码的 RSA-PSS 签名
 * @param publicKeyPem - SubjectPublicKeyInfo PEM 公钥。
 * @returns 签名与内容、公钥匹配时返回 `true`。
 * @throws 公钥或 Base64 格式无效时抛出错误。
 */
export async function RSAVerifyPSS(value: string, signature: string, publicKeyPem: string): Promise<boolean> {
	assertWebCrypto("importKey", "verify");
	const key = await crypto.subtle.importKey("spki", fromPem(publicKeyPem, pemLabels.public), { hash: "SHA-256", name: "RSA-PSS" }, false, [
		"verify",
	]);
	// 验证端必须使用与签名端相同的 32 字节 PSS 盐长度。
	return crypto.subtle.verify(
		{ name: "RSA-PSS", saltLength: 32 },
		key,
		toArrayBuffer(decodeBase64Bytes(signature)),
		toArrayBuffer(encodeUtf8(value))
	);
}

/**
 * 生成 ECDSA PEM 签名密钥对。
 *
 * @param namedCurve - NIST 曲线：P-256、P-384 或 P-521。
 * @returns 未加密 PKCS#8 私钥和 SubjectPublicKeyInfo 公钥组成的 PEM 密钥对。
 */
export async function GenerateECDSAKeyPair(namedCurve: EcNamedCurve = "P-256"): Promise<PemKeyPair> {
	assertWebCrypto("generateKey", "exportKey");
	const keyPair = assertKeyPair(await crypto.subtle.generateKey({ name: "ECDSA", namedCurve }, true, ["sign", "verify"]));
	return exportKeyPair(keyPair);
}

/**
 * 使用 ECDSA 私钥签名文本或字节。
 *
 * @remarks Web Crypto 返回 IEEE P1363 固定字段拼接格式，与 .NET 实现一致。
 * @param value - 要签名的 UTF-8 文本或原始字节
 * @param privateKeyPem - 未加密的 EC PKCS#8 PEM 私钥
 * @param namedCurve - 私钥使用的 NIST 曲线
 * @returns Base64 编码的 IEEE P1363 ECDSA 签名。
 */
export async function ECDSASign(value: string, privateKeyPem: string, namedCurve: EcNamedCurve = "P-256"): Promise<string> {
	assertWebCrypto("importKey", "sign");
	const key = await crypto.subtle.importKey("pkcs8", fromPem(privateKeyPem, pemLabels.private), { name: "ECDSA", namedCurve }, false, ["sign"]);
	// NIST 曲线强度分别对应 SHA-256、SHA-384 和 SHA-512；映射只在签名入口使用，因此直接保留在调用点。
	const hash = namedCurve === "P-256" ? "SHA-256" : namedCurve === "P-384" ? "SHA-384" : "SHA-512";
	const signature = await crypto.subtle.sign({ hash, name: "ECDSA" }, key, toArrayBuffer(encodeUtf8(value)));
	return encodeBase64Bytes(new Uint8Array(signature));
}

/**
 * 使用 ECDSA 公钥验证 Base64 签名。
 *
 * @param value - 签名时使用的 UTF-8 文本或原始字节
 * @param signature - Base64 编码的 IEEE P1363 ECDSA 签名。
 * @param publicKeyPem - EC SubjectPublicKeyInfo PEM 公钥。
 * @param namedCurve - 公钥使用的 NIST 曲线
 * @returns 签名与内容、公钥和曲线匹配时返回 `true`。
 */
export async function ECDSAVerify(value: string, signature: string, publicKeyPem: string, namedCurve: EcNamedCurve = "P-256"): Promise<boolean> {
	assertWebCrypto("importKey", "verify");
	const key = await crypto.subtle.importKey("spki", fromPem(publicKeyPem, pemLabels.public), { name: "ECDSA", namedCurve }, false, ["verify"]);
	// 与签名入口保持相同的曲线/摘要映射，避免允许调用方组合不匹配的安全强度。
	const hash = namedCurve === "P-256" ? "SHA-256" : namedCurve === "P-384" ? "SHA-384" : "SHA-512";
	return crypto.subtle.verify({ hash, name: "ECDSA" }, key, toArrayBuffer(decodeBase64Bytes(signature)), toArrayBuffer(encodeUtf8(value)));
}

/**
 * 生成 ECDH PEM 密钥协商密钥对。
 *
 * @param namedCurve - NIST 曲线：P-256、P-384 或 P-521。
 * @returns 未加密 PKCS#8 私钥和 SubjectPublicKeyInfo 公钥组成的 PEM 密钥对。
 */
export async function GenerateECDHKeyPair(namedCurve: EcNamedCurve = "P-256"): Promise<PemKeyPair> {
	assertWebCrypto("generateKey", "exportKey");
	const keyPair = assertKeyPair(await crypto.subtle.generateKey({ name: "ECDH", namedCurve }, true, ["deriveBits"]));
	return exportKeyPair(keyPair);
}

/**
 * 使用本方 ECDH 私钥与对方 ECDH 公钥派生共享秘密。
 *
 * @remarks 返回值仍需经过合适的 KDF 后才能作为对称密钥，不应直接长期存储。
 * @param privateKeyPem - 本方未加密的 EC PKCS#8 PEM 私钥
 * @param publicKeyPem - 对方的 EC SubjectPublicKeyInfo PEM 公钥。
 * @param namedCurve - 双方密钥使用的 NIST 曲线
 * @returns 曲线字段长度的原始 ECDH 共享秘密
 */
export async function DeriveECDHSecret(privateKeyPem: string, publicKeyPem: string, namedCurve: EcNamedCurve = "P-256"): Promise<Uint8Array> {
	assertWebCrypto("importKey", "deriveBits");
	const [privateKey, publicKey] = await Promise.all([
		crypto.subtle.importKey("pkcs8", fromPem(privateKeyPem, pemLabels.private), { name: "ECDH", namedCurve }, false, ["deriveBits"]),
		crypto.subtle.importKey("spki", fromPem(publicKeyPem, pemLabels.public), { name: "ECDH", namedCurve }, false, []),
	]);
	// P-521 字段需要按完整字节对齐，因此导出 66 字节（528 位），其余曲线直接使用字段位数。
	const bitLength = namedCurve === "P-256" ? 256 : namedCurve === "P-384" ? 384 : 528;
	const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, bitLength);
	return new Uint8Array(secret);
}

/**
 * 使用 ECDH 后以 SHA-256 派生共享密钥。
 *
 * @remarks 相比直接使用原始共享秘密，此入口与 .NET `DeriveECDHKeySHA256` 一致并固定输出 32 字节。
 * @param privateKeyPem - 本方未加密的 EC PKCS#8 PEM 私钥
 * @param publicKeyPem - 对方的 EC SubjectPublicKeyInfo PEM 公钥。
 * @param namedCurve - 双方密钥使用的 NIST 曲线
 * @returns 32 字节共享密钥
 */
export async function DeriveECDHKeySHA256(privateKeyPem: string, publicKeyPem: string, namedCurve: EcNamedCurve = "P-256"): Promise<Uint8Array> {
	const secret = await DeriveECDHSecret(privateKeyPem, publicKeyPem, namedCurve);
	assertWebCrypto("digest");
	const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(secret));
	return new Uint8Array(digest);
}
