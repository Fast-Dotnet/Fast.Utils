import { afterEach, describe, it } from "node:test";
import { decodeSecureBase64, encodeSecureBase64 } from "../src/base64/index";
import {
	AESDecrypt,
	AESDecryptAuthenticated,
	AESDecryptWithPassword,
	AESEncrypt,
	AESEncryptAuthenticated,
	AESEncryptWithPassword,
	DeriveECDHSecret,
	ECDSASign,
	ECDSAVerify,
	FixedTimeEquals,
	GenerateECDHKeyPair,
	GenerateECDSAKeyPair,
	GenerateRSAKeyPair,
	GenerateRandomBytes,
	HKDFSHA256,
	HMACSHA256Encrypt,
	HashPasswordPBKDF2SHA256,
	MD5Encrypt,
	PBKDF2SHA256,
	RSADecryptOAEP,
	RSAEncryptOAEP,
	RSASignPSS,
	RSAVerifyPSS,
	SHA1Encrypt,
	SHA256Encrypt,
	SHA384Encrypt,
	SHA512Encrypt,
	VerifyPasswordPBKDF2SHA256,
} from "../src/crypto/index";
import { configureInstallationIdentity, getOrCreateInstallationId, installationIdentity } from "../src/identity/index";
import { Local, Session, base64StorageCodec, configureStorage, isStorageConfigured } from "../src/storage/index";
import { isUuidV4 } from "../src/string/index";
import { expect, vi } from "./test-helpers";

afterEach(() => {
	vi.unstubAllGlobals();
});

class MemoryStorage {
	readonly #values = new Map<string, string>();

	get length() {
		return this.#values.size;
	}

	getItem(key: string) {
		return this.#values.get(key) ?? null;
	}

	key(index: number) {
		return [...this.#values.keys()][index] ?? null;
	}

	removeItem(key: string) {
		this.#values.delete(key);
	}

	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}
}

let storageNow = 1_000;
const storageClock = () => storageNow;
configureStorage({ crypto: true, now: storageClock, prefix: "test:" });

const useBrowserStorage = () => {
	const local = new MemoryStorage();
	const session = new MemoryStorage();
	vi.stubGlobal("localStorage", local);
	vi.stubGlobal("sessionStorage", session);
	return { local, session };
};

describe("configured browser storage", () => {
	it("configures once and exposes stable Local and Session package exports", () => {
		const { local, session } = useBrowserStorage();
		expect(isStorageConfigured()).toBe(true);
		configureStorage({ crypto: true, now: storageClock, prefix: "test:" });
		expect(() => {
			configureStorage({ now: storageClock, prefix: "other:" });
		}).toThrow(Error);
		expect(() => {
			configureStorage({ codec: base64StorageCodec, crypto: true });
		}).toThrow(TypeError);

		Local.set("user", { id: 1 });
		Local.set("plain-user", { id: 2 }, { crypto: false });
		Session.set("route", "/home");
		expect(Local.get("user")).toEqual({ id: 1 });
		expect(Local.get("plain-user", { crypto: false })).toEqual({ id: 2 });
		expect(() => Local.get("plain-user")).toThrow(TypeError);
		expect(() => Local.get("plain-user", { crypto: "yes" as never })).toThrow(TypeError);
		expect(Session.get("route")).toBe("/home");
		expect(local.getItem("test:user")).toContain('"version":3');
		expect(local.getItem("test:user")).not.toContain("id");
		expect(local.getItem("test:plain-user")).toContain("id");
		expect(session.getItem("test:route")).toContain('"version":3');
		expect(() => {
			Local.set("invalid", 1, { crypto: "yes" as never });
		}).toThrow(TypeError);
	});

	it("supports TTL, scoped removal, pruning, and namespace-only clearing", () => {
		const { local } = useBrowserStorage();
		storageNow = 1_000;
		local.setItem("unrelated", "keep");
		Local.set("short", 1, { ttlMs: 5 });
		Local.set("group:first", 2);
		Local.set("group:second", 3);
		storageNow = 1_006;
		expect(Local.get("short")).toBeUndefined();
		Local.removeByPrefix("group:");
		expect(Local.keys()).toEqual([]);
		Local.set("expired", 1, { ttlMs: 1 });
		storageNow = 1_008;
		expect(Local.pruneExpired()).toBe(1);
		Local.clear();
		expect(local.getItem("unrelated")).toBe("keep");
	});

	it("rejects malformed data and supports the documented Base64 codec", () => {
		const { local } = useBrowserStorage();
		local.setItem("test:broken", '{"version":99}');
		expect(() => Local.get("broken")).toThrow(TypeError);
		expect(() => {
			Local.removeByPrefix("");
		}).toThrow(TypeError);
		const encoded = base64StorageCodec.encode({ value: "Fast" });
		expect(decodeSecureBase64(encoded)).toBe('{"value":"Fast"}');
		expect(base64StorageCodec.decode(encoded)).toEqual({ value: "Fast" });
		expect(() => base64StorageCodec.decode(encodeSecureBase64("not json"))).toThrow(SyntaxError);
	});
});

describe("installation identity", () => {
	it("uses configured Local storage and a shared browser identity state", () => {
		useBrowserStorage();
		configureInstallationIdentity({ cacheKey: "account:installation-id" });
		expect(installationIdentity.cacheKey).toBe("account:installation-id");
		installationIdentity.deviceId = "";
		const installationId = "123e4567-e89b-42d3-a456-426614174000";
		expect(getOrCreateInstallationId(installationId)).toBe(installationId);
		expect(installationIdentity.deviceId).toBe(installationId);
		installationIdentity.deviceId = "";
		expect(getOrCreateInstallationId()).toBe(installationId);
		installationIdentity.clear();
		expect(installationIdentity.deviceId).toBe("");
		expect(Local.get(installationIdentity.cacheKey)).toBeUndefined();
	});

	it("rejects malformed persisted identities", () => {
		useBrowserStorage();
		configureInstallationIdentity({ cacheKey: "account:installation-id" });
		installationIdentity.deviceId = "";
		Local.set(installationIdentity.cacheKey, "not-a-uuid");
		expect(() => installationIdentity.read()).toThrow(TypeError);
		expect(() => {
			configureInstallationIdentity({ cacheKey: "another-installation-id" });
		}).toThrow(Error);
	});

	it("creates an installation identity when Web Crypto is unavailable", () => {
		useBrowserStorage();
		configureInstallationIdentity({ cacheKey: "account:installation-id" });
		installationIdentity.clear();
		vi.stubGlobal("crypto", undefined);
		const installationId = getOrCreateInstallationId();
		expect(isUuidV4(installationId)).toBe(true);
		expect(Local.get(installationIdentity.cacheKey)).toBe(installationId);
	});
});

describe("partial Web Crypto implementations", () => {
	it("uses digest without requiring unrelated cryptographic methods", async () => {
		const subtle = crypto.subtle;
		vi.stubGlobal("crypto", { subtle: { digest: subtle.digest.bind(subtle) } });
		expect(await SHA256Encrypt("abc")).toBe("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD");
		await expect(HMACSHA256Encrypt("abc", "key")).rejects.toThrow("does not support Web Crypto SubtleCrypto");
	});

	it("uses HMAC with only key import and signing", async () => {
		const expected = await HMACSHA256Encrypt("abc", "key");
		const subtle = crypto.subtle;
		vi.stubGlobal("crypto", { subtle: { importKey: subtle.importKey.bind(subtle), sign: subtle.sign.bind(subtle) } });
		expect(await HMACSHA256Encrypt("abc", "key")).toBe(expected);
		await expect(SHA256Encrypt("abc")).rejects.toThrow("does not support Web Crypto SubtleCrypto");
	});
});

describe("Web Crypto utilities", () => {
	it("falls back for random bytes when Web Crypto is unavailable", () => {
		vi.stubGlobal("crypto", undefined);
		expect(GenerateRandomBytes(16).length).toBe(16);
	});

	it("matches the Fast.NET CryptoUtil runtime surface", async () => {
		const cryptoApi = await import("../src/crypto/index");
		expect(Object.keys(cryptoApi).sort()).toEqual(
			[
				"AESDecrypt",
				"AESDecryptAuthenticated",
				"AESDecryptWithPassword",
				"AESEncrypt",
				"AESEncryptAuthenticated",
				"AESEncryptWithPassword",
				"DeriveECDHKeySHA256",
				"DeriveECDHSecret",
				"ECDSASign",
				"ECDSAVerify",
				"FixedTimeEquals",
				"GenerateECDHKeyPair",
				"GenerateECDSAKeyPair",
				"GenerateRSAKeyPair",
				"GenerateRandomBytes",
				"HKDFSHA256",
				"HMACSHA256Encrypt",
				"HMACSHA384Encrypt",
				"HMACSHA512Encrypt",
				"HashPasswordPBKDF2SHA256",
				"MD5Encrypt",
				"PBKDF2SHA256",
				"RSADecryptOAEP",
				"RSAEncryptOAEP",
				"RSASignPSS",
				"RSAVerifyPSS",
				"SHA1Encrypt",
				"SHA256Bytes",
				"SHA256Encrypt",
				"SHA384Bytes",
				"SHA384Encrypt",
				"SHA512Bytes",
				"SHA512Encrypt",
				"VerifyPasswordPBKDF2SHA256",
			].sort()
		);
	});

	it("supports hashes and AES-CBC/AES-ECB with the .NET-aligned API", () => {
		expect(MD5Encrypt("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
		expect(SHA1Encrypt("abc")).toBe("A9993E364706816ABA3E25717850C26C9CD0D89D");

		const key = "fast-secret";
		const vector = "fast-vector";
		const cbc = AESEncrypt("中文 AES-CBC", key, vector);
		const ecb = AESEncrypt("中文 AES-ECB", key, vector, "ECB");
		expect(AESDecrypt(cbc ?? "", key, vector)).toBe("中文 AES-CBC");
		expect(AESDecrypt(ecb ?? "", key, vector, "ECB")).toBe("中文 AES-ECB");

		const unpadded = AESEncrypt("1234567890abcdef", key, vector, "CBC", "None");
		expect(AESDecrypt(unpadded ?? "", key, vector, "CBC", "None")).toBe("1234567890abcdef");
		expect(() => AESEncrypt("short block", key, vector, "CBC", "None")).toThrow(RangeError);

		for (const padding of ["ANSIX923", "ISO10126"] as const) {
			const ciphertext = AESEncrypt(`AES ${padding}`, key, vector, "CBC", padding);
			expect(AESDecrypt(ciphertext ?? "", key, vector, "CBC", padding)).toBe(`AES ${padding}`);
		}

		const zeroPadded = AESEncrypt("zeros", key, vector, "CBC", "Zeros");
		expect(AESDecrypt(zeroPadded ?? "", key, vector, "CBC", "Zeros")).toBe(`zeros${"\0".repeat(11)}`);
	});

	it("computes SHA-256 and generates random bytes", async () => {
		expect(await SHA256Encrypt("abc")).toBe("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD");
		expect(await SHA384Encrypt("abc")).toBe("CB00753F45A35E8BB5A03D699AC65007272C32AB0EDED1631A8B605A43FF5BED8086072BA1E7CC2358BAECA134C825A7");
		expect(await SHA512Encrypt("abc")).toBe(
			"DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA20A9EEEE64B55D39A2192992A274FC1A836BA3C23A3FEEBBD454D4423643CE80E2A9AC94FA54CA49F"
		);
		expect(GenerateRandomBytes(32)).toHaveLength(32);
		expect(FixedTimeEquals(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
		expect(FixedTimeEquals(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
	});

	it("keeps random generation available when only SubtleCrypto is missing", async () => {
		vi.stubGlobal("crypto", {
			getRandomValues: <Value extends ArrayBufferView>(value: Value) => value,
		});
		expect(GenerateRandomBytes(2)).toEqual(Uint8Array.of(0, 0));
		await expect(SHA256Encrypt("value")).rejects.toThrow("does not support Web Crypto SubtleCrypto");
	});

	it("authenticates AES-GCM text with direct keys and passwords", async () => {
		const authenticated = await AESEncryptAuthenticated("authenticated text", "application key");
		expect(await AESDecryptAuthenticated(authenticated, "application key")).toBe("authenticated text");

		const payload = await AESEncryptWithPassword('{"looks":"json"}', "correct horse battery staple", 100_000);
		expect(payload.startsWith("FAST-AES-256-GCM-V1:")).toBe(true);
		expect((await AESDecryptWithPassword(payload, "correct horse battery staple")).parseJson<{ looks: string }>()).toEqual({
			looks: "json",
		});
		await expect(AESDecryptWithPassword(payload, "wrong password")).rejects.toThrow("Unable to authenticate or decrypt the payload");
	});

	it("uses the shared UTF-8 fallback for Web Crypto text", async () => {
		vi.stubGlobal("TextEncoder", undefined);
		vi.stubGlobal("TextDecoder", undefined);
		const text = "中文 🚀";
		const authenticated = await AESEncryptAuthenticated(text, "application key");
		expect(await AESDecryptAuthenticated(authenticated, "application key")).toBe(text);
		const payload = await AESEncryptWithPassword(text, "password", 100_000);
		expect(await AESDecryptWithPassword(payload, "password")).toBe(text);
	});

	it("rejects unsupported and tampered payloads", async () => {
		await expect(AESDecryptWithPassword("unsupported", "password")).rejects.toThrow(TypeError);
		await expect(AESDecryptWithPassword("FAST-AES-256-GCM-V1:1:AA:AA:AA", "password")).rejects.toThrow(TypeError);
		const payload = await AESEncryptWithPassword("secret", "correct horse battery staple", 100_000);
		const mutationIndex = payload.length - 2;
		const replacement = payload[mutationIndex] === "A" ? "B" : "A";
		const tampered = `${payload.slice(0, mutationIndex)}${replacement}${payload.slice(mutationIndex + 1)}`;
		await expect(AESDecryptWithPassword(tampered, "correct horse battery staple")).rejects.toThrow(
			"Unable to authenticate or decrypt the payload"
		);
	});

	it("rejects plaintext that could violate the bounded payload contract", async () => {
		const oversized = "a".repeat(8 * 1024 * 1024 + 1);
		await expect(AESEncryptWithPassword(oversized, "password", 100_000)).rejects.toThrow(RangeError);
	});

	it("derives keys and verifies password hashes", async () => {
		expect(await HMACSHA256Encrypt("abc", "key")).toBe("9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab");
		expect(await PBKDF2SHA256("password", new TextEncoder().encode("12345678"), 100_000, 24)).toHaveLength(24);
		expect(
			await HKDFSHA256(
				new TextEncoder().encode("input key material"),
				new TextEncoder().encode("12345678"),
				new TextEncoder().encode("fast-utils"),
				24
			)
		).toHaveLength(24);

		const passwordHash = await HashPasswordPBKDF2SHA256("correct horse battery staple", 100_000);
		expect(await VerifyPasswordPBKDF2SHA256("correct horse battery staple", passwordHash)).toBe(true);
		expect(await VerifyPasswordPBKDF2SHA256("wrong password", passwordHash)).toBe(false);
	});

	it("round-trips RSA-OAEP text and verifies RSA-PSS signatures with one key pair", async () => {
		const keyPair = await GenerateRSAKeyPair();
		const ciphertext = await RSAEncryptOAEP("Fast RSA", keyPair.publicKey);
		expect(await RSADecryptOAEP(ciphertext, keyPair.privateKey)).toBe("Fast RSA");
		const signature = await RSASignPSS("Fast RSA", keyPair.privateKey);
		expect(await RSAVerifyPSS("Fast RSA", signature, keyPair.publicKey)).toBe(true);
		expect(await RSAVerifyPSS("tampered", signature, keyPair.publicKey)).toBe(false);
	});

	it("signs with ECDSA and derives matching ECDH secrets", async () => {
		const signingKeys = await GenerateECDSAKeyPair();
		const signature = await ECDSASign("Fast ECC", signingKeys.privateKey);
		expect(await ECDSAVerify("Fast ECC", signature, signingKeys.publicKey)).toBe(true);
		expect(await ECDSAVerify("tampered", signature, signingKeys.publicKey)).toBe(false);

		const alice = await GenerateECDHKeyPair();
		const bob = await GenerateECDHKeyPair();
		const aliceSecret = await DeriveECDHSecret(alice.privateKey, bob.publicKey);
		const bobSecret = await DeriveECDHSecret(bob.privateKey, alice.publicKey);
		expect(aliceSecret).toEqual(bobSecret);
	});
});
