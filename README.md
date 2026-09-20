<p align="left">
	<a href="./README.zh.md">简体中文</a> | <strong>English</strong>
</p>

<p align="center">
	<img src="./Fast.png" alt="logo" width="160" />
</p>

# @fast-china/utils

**[Documentation](http://docs.fastdotnet.cn/utils/) · [Official website](http://fastdotnet.com)**

Browser-first TypeScript utilities for modern browsers, WebViews, Vue 3, and uni-app.

[![npm version](https://img.shields.io/npm/v/@fast-china/utils?color=orange)](https://www.npmjs.com/package/@fast-china/utils) [![node](https://img.shields.io/badge/node-%5E22.18%20%7C%7C%20%5E24.18-brightgreen)](https://nodejs.org/) [![vue](https://img.shields.io/badge/vue-%5E3.5.11-42b883)](https://vuejs.org/) [![license](https://img.shields.io/npm/l/@fast-china/utils)](./LICENSE)

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

The `unpkg` and `jsdelivr` fields select the minified `dist/index.global.min.js` browser file, which exposes the `FastUtils` global.

## Storage

`Local` and `Session` work without configuration. The default prefix is `fast__`, values use JSON, and entries do not expire unless a TTL is supplied:

```ts
import { Local, Session } from "@fast-china/utils";

Local.set("user", { id: 1 }, { ttlMs: 30 * 60 * 1000 });
const user = Local.get<{ id: number }>("user");

Local.set("private-user", { id: 2 }, { crypto: true });
const privateUser = Local.get<{ id: number }>("private-user", { crypto: true });

Session.set("redirect", "/home");
const redirect = Session.get("redirect"); // string | undefined
```

`get<Value = string>()` returns `string | undefined` when its generic is omitted, so string values require no type argument. Storage codecs still deserialize JSON at runtime; pass an explicit generic for an accurate type when the stored value is an object, array, or another non-string value.

Call `configureStorage` before the first Storage operation only when overriding defaults. The legacy-compatible `crypto` option applies reversible Base64 obfuscation; it is not encryption and must not protect secrets:

```ts
import { configureStorage } from "@fast-china/utils";

configureStorage({
	prefix: "my-app:",
	crypto: true,
});
```

The active global configuration is immutable. Repeating the same configuration is idempotent; a conflicting configuration throws. The `crypto` option on `set/get` overrides only that operation and must match when writing and reading the same entry; it does not mutate global configuration. A custom `codec` may be supplied instead of global `crypto`. In uni-app, `Local` automatically resolves the runtime-injected `uni` object and uses its synchronous Storage API; `Session` throws because uni-app has no sessionStorage equivalent. `clear()` removes only keys inside the active prefix.

## Base64

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Copy text

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Identity

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Logger

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Crypto

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Vue 3

[Full configuration and examples](http://docs.fastdotnet.cn/utils/guide.en)

## Modules

`@fast-china/utils` is the only public entry and exposes every API as a named export. Source modules remain separate in `dist/` so modern bundlers can remove unused exports; those internal files are not public package subpaths.

Historical aggregate objects are not public. Supported behavior is exposed through named functions, improving auto-imports and Tree Shaking; this major version does not preserve every former convenience method.

The `object` module includes dependency-free deep cloning and equality plus predicate-based property selection. Array utilities include a SameValueZero symmetric difference, while `once` preserves the first return value, Promise identity, or synchronous error.

## Runtime contract

- The package-manager entry is pure ESM; the CDN entry is a separately minified IIFE.
- ES2022 modern browsers and WebViews.
- Vue 3.5.11 or newer through a required peer dependency.
- uni-app through call-time detection of runtime-injected `uni` and App-Plus `plus`, with global-property fallbacks.
- No import-time access to `window`, Storage, or `uni`; unsupported calls fail explicitly.
- Web Crypto, URL, Intl, TextEncoder, and related platform capabilities are not polyfilled.

## Documentation

- [API reference](http://docs.fastdotnet.cn/utils/api.en)
- [Runtime contract](http://docs.fastdotnet.cn/utils/runtime-contract)
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

## License

[Apache-2.0](./LICENSE)
