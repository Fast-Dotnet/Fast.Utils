import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import * as Vue from "vue";
import { Rolldown } from "tsdown";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(workspaceRoot, "dist");
const packageJsonPath = path.join(workspaceRoot, "package.json");
const publicExportKeys = ["."];

/** 读取根 package.json，并拒绝数组、null 等非清单对象。 */
const readPackageManifest = () => {
	const value = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("package.json must contain an object.");
	return value;
};

/** 把包内相对路径解析到仓库根目录，并阻止测试意外访问工作区之外。 */
const resolveWorkspacePath = (relativePath) => {
	const absolutePath = path.resolve(workspaceRoot, ...relativePath.split("/"));
	if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
		throw new Error(`Path escapes the workspace: ${relativePath}`);
	}
	return absolutePath;
};

const consumerPath = path.join(workspaceRoot, "__package-consumer__.mjs");

const run = (command, arguments_) => {
	const result = spawnSync(command, arguments_, { cwd: workspaceRoot, encoding: "utf8" });
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${command} (${result.signal ?? result.status})`);
	return result.stdout;
};

const collectFiles = (directory) => {
	const result = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...collectFiles(absolutePath));
		else if (entry.isFile()) result.push(absolutePath);
	}
	return result;
};

const verifyBuildArtifacts = () => {
	if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) throw new Error("tsdown did not create dist/.");
	const manifest = readPackageManifest();
	const exportsMap = manifest["exports"];
	assert.ok(exportsMap !== null && typeof exportsMap === "object" && !Array.isArray(exportsMap));
	assert.deepEqual(Object.keys(exportsMap), publicExportKeys, "package.json must expose only the root entry.");

	const sourceRoot = path.join(workspaceRoot, "src");
	const sourceModulePaths = collectFiles(sourceRoot)
		.filter((filePath) => filePath.endsWith(".ts"))
		.map((filePath) => path.relative(sourceRoot, filePath).replaceAll(path.sep, "/").replace(/\.ts$/u, ""))
		.sort();
	const files = collectFiles(distRoot);
	const artifacts = files.map((filePath) => path.relative(workspaceRoot, filePath).replaceAll(path.sep, "/")).sort();
	assert.ok(artifacts.includes("dist/index.mjs"), "root JavaScript entry is missing.");
	assert.ok(artifacts.includes("dist/index.d.mts"), "root declaration entry is missing.");
	assert.ok(artifacts.includes("dist/index.global.min.js"), "minified CDN entry is missing.");
	for (const artifact of artifacts) {
		if (/^dist\/index\.global\.min\.js(?:\.map)?$/u.test(artifact)) continue;
		assert.match(artifact, /\.(?:d\.mts|mjs|mjs\.map)$/u, `unexpected build artifact: ${artifact}`);
		const sourcePath = artifact.replace(/^dist\//u, "").replace(/\.(?:d\.mts|mjs)(?:\.map)?$/u, "");
		assert.ok(sourceModulePaths.includes(sourcePath), `stale build artifact has no source module: ${artifact}`);
	}
};

const verifyRelativeImports = () => {
	const importPattern = /(?:\bfrom\s*["']|\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)["']/gu;
	for (const absolutePath of collectFiles(distRoot)) {
		if (!/\.(?:d\.mts|mjs)$/u.test(absolutePath)) continue;
		const source = fs.readFileSync(absolutePath, "utf8");
		for (const match of source.matchAll(importPattern)) {
			const specifier = match[1];
			if (specifier === undefined) continue;
			const dependency = path.resolve(path.dirname(absolutePath), specifier);
			if (!dependency.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(dependency) || !fs.statSync(dependency).isFile()) {
				throw new Error(`${path.relative(workspaceRoot, absolutePath)} imports missing file ${specifier}.`);
			}
		}
	}
};

/** 验证运行时 Source Map 内嵌完整源码，不依赖未发布的 src 目录。 */
const verifySourceMaps = () => {
	for (const absolutePath of collectFiles(distRoot)) {
		if (!absolutePath.endsWith(".map")) continue;
		assert.ok(!absolutePath.endsWith(".d.mts.map"), `unexpected declaration map: ${path.relative(workspaceRoot, absolutePath)}`);
		const sourceMap = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
		assert.ok(sourceMap !== null && typeof sourceMap === "object" && !Array.isArray(sourceMap));
		const record = sourceMap;
		assert.ok(Array.isArray(record.sources) && record.sources.length > 0, `${path.relative(workspaceRoot, absolutePath)} has no sources.`);
		assert.equal(record.sources.length, record.sourcesContent?.length, path.relative(workspaceRoot, absolutePath));
		assert.ok(record.sourcesContent.every((source) => typeof source === "string" && source.length > 0));
	}
};

/** 验证 ESM 加密模块已内联 CryptoJS，不再把 CommonJS 子路径交给消费项目解析。 */
const verifyBundledCrypto = () => {
	const source = fs.readFileSync(path.join(distRoot, "crypto", "index.mjs"), "utf8");
	assert.match(source, /CryptoJS/u, "crypto-js implementation is missing from the ESM crypto module.");
	assert.doesNotMatch(source, /["']crypto-js(?:\/|["'])/u, "ESM artifacts must not retain crypto-js package imports.");
};

if (fs.existsSync(consumerPath)) throw new Error(`Refusing to overwrite existing fixture: ${consumerPath}`);

try {
	verifyBuildArtifacts();
	verifyRelativeImports();
	verifySourceMaps();
	verifyBundledCrypto();
	assert.throws(
		() => vm.runInNewContext(fs.readFileSync(path.join(distRoot, "index.global.min.js"), "utf8"), { TextDecoder, TextEncoder }),
		/Vue is not defined/u
	);
	const cdnContext = { TextDecoder, TextEncoder, Vue };
	vm.runInNewContext(fs.readFileSync(path.join(distRoot, "index.global.min.js"), "utf8"), cdnContext);
	assert.deepEqual(
		Array.from(cdnContext.FastUtils.chunk([1, 2, 3], 2), (value) => Array.from(value)),
		[[1, 2], [3]]
	);
	assert.equal(typeof cdnContext.FastUtils.useEmits, "function");
	assert.equal(vm.runInNewContext('FastUtils.decodeBase64(FastUtils.encodeBase64("{\\"id\\":1}")).parseJson().id', cdnContext), 1);
	assert.equal(vm.runInNewContext('FastUtils.decodeBase64(FastUtils.encodeBase64("plain")).parseJson()', cdnContext), "plain");
	// 模拟 uni 编译器注入的词法标识符，确保 API 调用不依赖 globalThis 属性或 Encoding API。
	const appContext = vm.createContext({ Vue });
	vm.runInContext(
		`Object.hasOwn = undefined;
		String.prototype.at = undefined;
		Array.prototype.at = undefined;
		globalThis.URLSearchParams = undefined;
		globalThis.Intl = undefined;
		const values = new Map();
		const uni = {
			getStorageInfoSync: () => ({ keys: [...values.keys()] }),
			getStorageSync: key => values.get(key) ?? "",
			removeStorageSync: key => values.delete(key),
			setStorageSync: (key, value) => values.set(key, value),
			setClipboardData(options) { this.copied = options.data; options.success(); }
		};
		const plus = {};
		const window = { document: {} };`,
		appContext
	);
	vm.runInContext(fs.readFileSync(path.join(distRoot, "index.global.min.js"), "utf8"), appContext);
	assert.equal(vm.runInContext("globalThis.uni", appContext), undefined);
	assert.equal(vm.runInContext("globalThis.window", appContext), undefined);
	assert.equal(vm.runInContext("globalThis.plus", appContext), undefined);
	assert.equal(
		vm.runInContext(
			`(() => {
			const lines = [];
			const logger = FastUtils.createLogger({ uniAppPlusSplit: true, sink: {
				debug() {}, warn() {}, error() {}, log(...data) { lines.push(data); }
			} });
			logger.log("App", "ready", { id: 1 });
			return lines.length === 2 && lines[0].length === 1 && lines[1][0] === '{\\n  "id": 1\\n}';
		})()`,
			appContext
		),
		true
	);
	assert.equal(vm.runInContext("FastUtils.isUniApp() && FastUtils.isBrowser()", appContext), true);
	assert.equal(vm.runInContext("FastUtils.formatBytes(1536)", appContext), "1.5 KiB");
	assert.equal(vm.runInContext("FastUtils.formatRelativeTime(86400000, { now: 0 })", appContext), "明天");
	assert.equal(vm.runInContext('FastUtils.decodeBase64(FastUtils.encodeBase64("中文 🚀"))', appContext), "中文 🚀");
	await vm.runInContext('FastUtils.copy("Fast clipboard")', appContext);
	assert.equal(vm.runInContext("uni.copied", appContext), "Fast clipboard");
	vm.runInContext('FastUtils.Local.set("text", "中文 🚀", { crypto: true })', appContext);
	assert.equal(vm.runInContext('FastUtils.Local.get("text", { crypto: true })', appContext), "中文 🚀");
	assert.equal(vm.runInContext('FastUtils.hasOwn(Object.create(null, { key: { value: 1 } }), "key")', appContext), true);
	assert.equal(
		vm.runInContext('FastUtils.decodeSecureBase64(FastUtils.encodeSecureBase64("Fast工具".repeat(4)))', appContext),
		"Fast工具".repeat(4)
	);
	assert.equal(vm.runInContext('FastUtils.toQueryString({ q: "中文 +" })', appContext), "q=%E4%B8%AD%E6%96%87+%2B");
	assert.equal(vm.runInContext('FastUtils.parseQueryString("q=%E4%B8%AD%E6%96%87+%2B").q', appContext), "中文 +");
	const legacyContext = vm.createContext({ Vue });
	vm.runInContext("delete globalThis.globalThis;", legacyContext);
	vm.runInContext(fs.readFileSync(path.join(distRoot, "index.global.min.js"), "utf8"), legacyContext);
	assert.equal(vm.runInContext('FastUtils.decodeBase64(FastUtils.encodeBase64("中文 🚀"))', legacyContext), "中文 🚀");
	fs.writeFileSync(
		consumerPath,
		[
			'import { chunk, decodeBase64, encodeBase64, Local, Session, toQueryString } from "@fast-china/utils";',
			'import { useEmits } from "@fast-china/utils";',
			'if (JSON.stringify(chunk([1, 2, 3], 2)) !== "[[1,2],[3]]") throw new Error("Root array export failed.");',
			'if (decodeBase64(encodeBase64("Fast 工具库")) !== "Fast 工具库") throw new Error("Base64 round trip failed.");',
			'if (JSON.stringify(decodeBase64(encodeBase64("{\\"id\\":1}")).parseJson()) !== "{\\"id\\":1}") throw new Error("Base64 JSON parsing failed.");',
			'if (decodeBase64(encodeBase64("plain")).parseJson() !== "plain") throw new Error("Base64 JSON fallback failed.");',
			'if (toQueryString({ id: [1, 2] }) !== "id=1&id=2") throw new Error("Query serialization failed.");',
			"class MemoryStorage { /** @type {Map<string, string>} */ #values = new Map(); get length() { return this.#values.size; } clear() { this.#values.clear(); } getItem(/** @type {string} */ key) { return this.#values.get(key) ?? null; } key(/** @type {number} */ index) { return [...this.#values.keys()][index] ?? null; } removeItem(/** @type {string} */ key) { this.#values.delete(key); } setItem(/** @type {string} */ key, /** @type {string} */ value) { this.#values.set(key, String(value)); } }",
			"globalThis.localStorage = new MemoryStorage(); globalThis.sessionStorage = new MemoryStorage();",
			'Local.set("local", 1); Local.set("text", "value"); Local.set("private", { id: 1 }, { crypto: true }); Session.set("session", 2);',
			'if (JSON.stringify(Local.get("local")) !== "1" || Local.get("text") !== "value" || JSON.stringify(Local.get("private", { crypto: true })) !== "{\\"id\\":1}" || JSON.stringify(Session.get("session")) !== "2") throw new Error("Storage facade failed.");',
			'if (globalThis.localStorage.getItem("fast__local") === null) throw new Error("Default Storage prefix failed.");',
			'const handlers = useEmits({ clear: null }, (eventName, ..._arguments) => { if (eventName !== "clear") throw new Error("Vue emit mapping failed."); });',
			"handlers.value.onClear?.();",
		].join("\n"),
		"utf8"
	);

	const typeScriptPath = path.join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
	run(process.execPath, [
		typeScriptPath,
		// TypeScript 6 no longer silently ignores a nearby tsconfig when explicit files are supplied.
		"--ignoreConfig",
		"--allowJs",
		"--checkJs",
		"--module",
		"NodeNext",
		"--moduleResolution",
		"NodeNext",
		"--target",
		"ES2022",
		"--strict",
		"--noEmit",
		"--skipLibCheck",
		"false",
		consumerPath,
	]);
	run(process.execPath, [consumerPath]);
	run(process.execPath, [
		"--input-type=module",
		"--eval",
		'delete globalThis.crypto; delete globalThis.Intl; delete globalThis.TextEncoder; delete globalThis.TextDecoder; const utils = await import("@fast-china/utils"); if ("secureRandomInt" in utils || "secureRandomString" in utils) throw new Error("Removed random APIs are still exported."); if (utils.randomInt(0, 10) < 0 || !/^[A-Z]{8}$/u.test(utils.randomString(8, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")) || !utils.isUuidV4(utils.generateUuidV4()) || utils.GenerateRandomBytes(8).length !== 8) throw new Error("Math.random fallback failed.");',
	]);

	fs.writeFileSync(consumerPath, 'import { chunk } from "@fast-china/utils"; console.log(chunk([1, 2, 3], 2));\n', "utf8");
	const bundle = await Rolldown.rolldown({ input: consumerPath, treeshake: true });
	const generated = await bundle.generate({ format: "esm" });
	await bundle.close();
	const code = generated.output
		.filter((item) => item.type === "chunk")
		.map((item) => item.code)
		.join("\n");
	assert.ok(Buffer.byteLength(code) < 4_000, "A chunk-only consumer unexpectedly exceeded 4 KiB before minification.");
	assert.doesNotMatch(code, /AES-GCM|PBKDF2|createLogger|from\s*["']vue["']/u, "Unrelated crypto, logging, or Vue code leaked into the bundle.");

	const manifest = readPackageManifest();
	assert.ok(manifest["keywords"].includes("fast"));
	assert.ok(manifest["keywords"].includes("fast-china"));
	assert.ok(manifest["files"].includes("dist"));
	assert.ok(!manifest["files"].includes("src"));
	assert.equal(typeof manifest["peerDependencies"]?.["vue"], "string", "Vue must be declared as a peer dependency.");
	assert.equal(manifest["dependencies"]?.["crypto-js"], undefined, "Bundled crypto-js must not remain a runtime dependency.");
	assert.equal(typeof manifest["devDependencies"]?.["crypto-js"], "string", "The build must declare crypto-js as a development dependency.");
	assert.match(manifest["peerDependencies"]["vue"], /^\^3\./u, "Vue must use the supported Vue 3 peer range.");
	assert.doesNotMatch(manifest["peerDependencies"]["vue"], /2\.7/u, "Vue 2 must not be declared as supported.");
	assert.notEqual(manifest["peerDependenciesMeta"]?.["vue"]?.["optional"], true, "Vue must not be an optional peer dependency.");
	assert.equal(manifest["unpkg"], "./dist/index.global.min.js");
	assert.equal(manifest["jsdelivr"], manifest["unpkg"]);
	const exportsMap = manifest["exports"];
	assert.ok(exportsMap !== null && typeof exportsMap === "object");
	for (const value of Object.values(exportsMap)) {
		if (typeof value === "string") {
			assert.ok(fs.existsSync(resolveWorkspacePath(value.slice(2))));
			continue;
		}
		assert.ok(value !== null && typeof value === "object");
		for (const target of Object.values(value)) {
			assert.equal(typeof target, "string");
			assert.ok(fs.existsSync(resolveWorkspacePath(target.slice(2))));
		}
	}

	const npmArguments = ["pack", "--dry-run", "--ignore-scripts", "--json"];
	const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
	const npmCommand = process.platform === "win32" ? process.execPath : "npm";
	const npmCommandArguments = process.platform === "win32" ? [npmCliPath, ...npmArguments] : npmArguments;
	if (process.platform === "win32" && !fs.existsSync(npmCliPath)) throw new Error(`npm CLI was not found next to Node.js: ${npmCliPath}`);
	const npmResult = spawnSync(npmCommand, npmCommandArguments, {
		cwd: workspaceRoot,
		encoding: "utf8",
		env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), "fast-utils-npm-cache") },
	});
	if (npmResult.error !== undefined) throw npmResult.error;
	if (npmResult.status !== 0) {
		throw new Error(npmResult.stderr || npmResult.stdout || `npm pack --dry-run failed (${npmResult.signal ?? npmResult.status}).`);
	}
	const packReport = JSON.parse(npmResult.stdout);
	assert.ok(Array.isArray(packReport) && packReport.length === 1);
	const report = packReport[0];
	const packedFiles = report.files?.map((file) => file.path ?? "") ?? [];
	assert.ok(packedFiles.includes("dist/index.mjs"));
	assert.ok(packedFiles.includes("dist/index.d.mts"));
	assert.ok(packedFiles.includes("dist/index.global.min.js"));
	assert.ok(packedFiles.includes("dist/index.global.min.js.map"));
	assert.ok(packedFiles.includes("THIRD_PARTY_LICENSES.md"));
	assert.ok(packedFiles.every((file) => !/^(?:@fast-china|tests)\//u.test(file)));
	assert.ok(
		packedFiles.every((file) => !file.startsWith("src/")),
		"src must not be published."
	);
	assert.ok(packedFiles.includes("Fast.png"));
} finally {
	if (fs.existsSync(consumerPath)) fs.unlinkSync(consumerPath);
}
