[简体中文](./README.zh.md) | **English**

<p align="center">
	<img src="./Fast.png" width="128" alt="Fast.Utils Logo" />
</p>

<h1 align="center">Fast.Utils</h1>

<p align="center">
	<a href="https://www.npmjs.com/package/@fast-china/utils"><img src="https://img.shields.io/npm/v/@fast-china/utils?logo=npm" alt="npm version" /></a>
	<a href="https://www.npmjs.com/package/@fast-china/utils"><img src="https://img.shields.io/npm/dm/@fast-china/utils" alt="npm downloads" /></a>
	<a href="./LICENSE"><img src="https://img.shields.io/npm/l/@fast-china/utils" alt="License" /></a>
</p>

A TypeScript utility SDK for modern browsers, WebViews, Vue 3 and uni-app.

**[Documentation](http://docs.fastdotnet.cn/en-US/frontend/utils/) · [Official website](http://fastdotnet.com)**

## Highlights

- Typed, side-effect-free utilities with one named-export entry for effective Tree Shaking.
- Browser, WebView, Vue 3, and uni-app contracts without import-time platform access.
- Explicit security boundaries for storage, identity, encoding, random generation, and cryptography.
- TypeScript 6 strict checks, ESLint, runtime tests, consumer type tests, package validation, and Publint.

## Install

```bash
pnpm add @fast-china/utils
```

### CDN

The jsDelivr entry uses the minified `dist/index.global.min.js` browser file, which exposes the `FastUtils` global.

| Resource                                     | jsDelivr                                                                            | unpkg                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `vue@3.5.11/dist/vue.global.prod.js`         | [jsDelivr](https://cdn.jsdelivr.net/npm/vue@3.5.11/dist/vue.global.prod.js)         | [unpkg](https://unpkg.com/vue@3.5.11/dist/vue.global.prod.js)         |
| `@fast-china/utils/dist/index.global.min.js` | [jsDelivr](https://cdn.jsdelivr.net/npm/@fast-china/utils/dist/index.global.min.js) | [unpkg](https://unpkg.com/@fast-china/utils/dist/index.global.min.js) |

## Quick start

The default namespace is `fast__`; store and retrieve business data with an optional TTL:

```ts
import { Local } from "@fast-china/utils";

Local.set("profile", { name: "Fast" }, { ttlMs: 30 * 60 * 1000 });
const profile = Local.get<{ name: string }>("profile");
console.log(profile?.name);
```

Without a TTL, entries do not expire. Configure a custom namespace or codec before the first storage operation. The legacy `crypto` option is Base64 obfuscation, not encryption. uni-app supports `Local`, not `Session`.

## Common usage

Import utilities by name from the package root:

```ts
import { encodeBase64, formatBytes, sleep } from "@fast-china/utils";

const encoded = encodeBase64("Fast");
const size = formatBytes(1536);
await sleep(100);
console.log(encoded, size);
```

Parameter validation or a pre-aborted signal may throw synchronously; cancellation during the wait rejects the returned Promise.

## Modules

`@fast-china/utils` is the only public entry and exposes every API as a named export. Source modules remain separate in `dist/` so modern bundlers can remove unused exports; those internal files are not public package subpaths.

The `object` module includes dependency-free deep cloning and equality plus predicate-based property selection. Array utilities include a SameValueZero symmetric difference, while `once` preserves the first return value, Promise identity, or synchronous error.

SDK-generated error messages are in English. Branch on error types or names rather than matching message text; caller and platform errors are propagated unchanged.

## Runtime contract

- The package-manager entry is pure ESM; the CDN entry is a separately minified IIFE.
- ESM and IIFE output targets ES2022 syntax; platform API availability is checked separately.
- Vue 3.5.11 or newer through a required peer dependency.
- uni-app through guarded, direct `uni.xxx` calls; App-Plus detection checks `typeof plus` directly.
- No import-time access to `window`, Storage, or `uni`; unsupported calls fail explicitly.
- Web Crypto, URL, Intl, TextEncoder, and related platform capabilities are not polyfilled.
- Text operations always use an internal UTF-8 implementation without TextEncoder / TextDecoder or global changes; invalid UTF-8 throws TypeError.

## Documentation

- [API reference](http://docs.fastdotnet.cn/en-US/frontend/utils/api/)
- [Runtime contract](http://docs.fastdotnet.cn/en-US/frontend/utils/runtime-contract)
- [Development and release guide (Chinese)](./docs/DEVELOPMENT_RELEASE.zh-CN.md)
- [Security policy](./SECURITY.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## Development

Development requires Node.js `^22.18.0 || ^24.18.0` and pnpm `^11.0.0`.

```bash
pnpm install --frozen-lockfile
pnpm check
```

Use `pnpm dev` for a long-running tsdown watch build while editing source files.

## Copyright, license and use

Copyright © 2018-Now 小方. This project uses [Apache License 2.0](./LICENSE). Use, modification, distribution and commercial use are permitted subject to its terms.

When redistributing, provide the license, mark modified files and preserve applicable copyright, attribution and supplied NOTICE information as required. This summary does not replace the license or impose additional UI attribution.

Users are responsible for the legal compliance and authorization of their own modifications, deployment, data processing and operations. This reminder is not an additional license condition.

Except as required by applicable law or agreed in writing, the software is provided on an "AS IS" basis. Sections 7 and 8 govern warranty disclaimers and liability limits. Providing the project does not endorse downstream activities or assume users' contractual commitments. This statement does not exclude liability that cannot lawfully be excluded.
