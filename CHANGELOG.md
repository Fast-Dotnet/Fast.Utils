# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases should follow [Semantic Versioning](https://semver.org/).

## [2.1.10] - 2026-09-27

### Added

- Add `useTransition` for reactive numeric transitions with configurable duration and easing, continuous retargeting, scope cleanup, and immediate fallback when animation frames are unavailable.

## [2.1.9] - 2026-09-22

### Fixed

- Preserve shared ArrayBuffer/view relationships, sparse array holes and enumerable extra/Symbol properties in cloneDeep.
- Distinguish known key tuples from dynamic key arrays in pick/omit return types; reject synchronous once reentry without invoking the callback twice.
- Keep browser-source globals separate from Node tooling and update consumer type/regression coverage.
- Keep the byte unit for nonnegative fractional inputs to `formatBytes`.

### Documentation and Tooling

- Correct localized Fast.Docs links and retain minimal README examples.
- Align public-contract comments and agent guidance.
- Keep ESLint and Prettier skill-file ignores separate and add regression checks.

## [2.1.8] - 2026-09-14

### Fixed

- Resolved uni-app injected `uni` and App-Plus `plus` identifiers at call time, with `globalThis` property fallbacks, so supported runtime APIs remain detectable when the host does not expose them as global object properties.

## [2.1.7] - 2026-09-14

### Changed

- Bundled CryptoJS into the ESM package output to avoid CommonJS subpath resolution failures in strict ESM and uni-app toolchains while preserving module-level tree-shaking.

## [2.1.6] - 2026-09-13

### Added

- Added lightweight Vue 3 composables for native event listeners, window size, ResizeObserver, element size, current time, and minimum-width breakpoints.
- Added automatic Vue scope cleanup, manual stop handles where applicable, SSR-safe initial state, runtime validation, and public type coverage for the new composables.

## [2.1.5] - 2026-09-12

### Added

- Added the dependency-free `cloneDeep` object utility with Lodash-compatible recursive cloning, circular-reference tracking, built-in object support, and preserved Map keys.
- Added `isEqual`, `pickBy`, `omitBy`, `symmetricDifference`, and `once` with public type contracts and runtime coverage.

### Changed

- Expanded the applicable JavaScript, TypeScript, import, RegExp, JSON, Markdown, sorting, and Prettier rules from Fast.ESLint.Config 2.1.8 directly in the repository's single `eslint.config.mjs`.
- Removed obsolete rule suppressions while preserving synchronous validation, Promise identity, public generic signatures, storage behavior, and Vue installation contracts.

## [2.1.4] - 2026-09-11

### Changed

- Removed broad repository-specific ESLint rule overrides and resolved all resulting errors and warnings with focused source and test updates.
- Centralized optional host capabilities behind a typed internal runtime view while keeping standard property and method calls, synchronous Promise argument validation, shared throttle Promise identity, public generic types, and the legacy clipboard fallback.

## [2.1.3] - 2026-08-30

### Changed

- Changed chainable `.parseJson<T = any>()` to return the original string when decoded Crypto/Base64 text is not valid JSON instead of throwing a syntax error.
- Kept Storage codecs strict so malformed persisted JSON continues to fail explicitly rather than using the text fallback.

## [2.1.2] - 2026-08-30

### Added

- Added per-operation Storage `crypto` overrides for `Local` and `Session` reads and writes without mutating global configuration.
- Added chainable `.parseJson<T = any>()` access to primitive string results from Base64 and Crypto text decoding APIs.
- Added `configureLogger` for the default Logger and allowed Logger severity methods to emit data without a message string.

### Changed

- Replaced Logger's `info` method and level with `log`; `logger.log()` now maps directly to `sink.log()` and `console.log()`, and the default minimum level is now `debug`.
- Changed the default type parameter of `StorageArea.get` from `unknown` to `string`; runtime codec results remain unchanged and may still be objects or other JSON values.
- Refined `decodeBase64`, `decodeBase64Url`, `decodeLatin1Base64`, `decodeSecureBase64`, `AESDecrypt`, `AESDecryptAuthenticated`, `AESDecryptWithPassword`, and `RSADecryptOAEP` results to the primitive-string `DecodedText` type. The first text decode installs a non-enumerable `String.prototype.parseJson`; an existing foreign implementation causes an explicit conflict error instead of being overwritten.

## [2.1.1] - 2026-08-26

### Changed

- Localized built-in validation, platform-capability, storage, cryptography, clipboard, and Vue integration error messages to Chinese while preserving their native error types and causes.
- Narrowed the `useProps` return type so keys passed through `ignoredProps` are excluded from the inferred computed result.
- Synchronized the self-contained ESLint Flat Config with the applicable Fast.ESLint.Config source rules and comments, refreshed compatible development dependencies, and documented the VS Code recommendations.

## [2.1.0] - 2026-08-23

### Added

- Restored the V1 `copy` text clipboard API for browsers and uni-app.

### Changed

- Added `randomInt` and `randomString` as the random APIs.
- Standardized every random generation entry to prefer Web Crypto and fall back to `Math.random()` when unavailable.
- Accessed standard runtime capabilities directly through `globalThis` instead of maintaining asserted global-object views.

### Removed

- Removed `secureRandomInt` and `secureRandomString`; use `randomInt` and `randomString` instead.

## [2.0.3] - 2026-08-11

### Changed

- Established `FAST-AES-256-GCM-V1` as the initial cross-language password-based AES payload.

## [2.0.2] - 2026-08-09

### Changed

- Added prioritized import path groups for the uni-app, Vue, Element Plus, Fast Element Plus, Fast China, and Lodash ecosystems while keeping type-only imports in the dedicated type group.
- Changed import group spacing to a compact no-blank-line style and normalized the repository imports to the new policy.

## [2.0.1] - 2026-08-09

### Added

- Expanded the cryptography API with digest, HMAC, PBKDF2, HKDF, authenticated AES, RSA, ECDSA, and ECDH compatibility helpers and synchronized bilingual API documentation.
- Added a separately minified `dist/index.global.min.js` browser build of the root entry, selected by the `unpkg` and `jsdelivr` package fields.

### Changed

- Standardized the Fast package keywords and publish allowlist while excluding `src` from the npm archive.
- Kept the package-manager ESM build unminified, kept Vue external in both builds, and removed declaration maps that referenced unpublished source files.
- Made Vue a required peer dependency while keeping it external to the package-manager build.
- Dropped Vue 2.7 compatibility and made Vue 3.3+ the sole supported framework range.
- Aligned the Crypto API exactly with Fast.NET `CryptoUtil`, removed transitional aliases and wrappers, and matched .NET digest casing.
- Consolidated the ESM and minified IIFE builds into one `tsdown.config.ts` configuration array.
- Restored zero-configuration `Local` and `Session` access with the legacy `fast__` prefix and a compatibility `crypto` option for the former Base64-obfuscation behavior.
- Focused package tests on public entries, executable CDN output, self-contained runtime source maps, and the final npm archive instead of fixed dependency versions and size thresholds.

## [2.0.0] - 2026-08-03

### Added

- Named utilities for arrays, asynchronous control flow, Base64, colors, cryptography, dates, DOM styles, environment detection, identity, logging, numbers, objects, storage, and strings.
- Promise-aware cancellation, timeout, retry, bounded concurrency, debounce, and throttle primitives.
- Strict Base64/Base64URL, secure random generation, authenticated password encryption, RSA-OAEP, ECDSA, ECDH, and protocol-compatibility hash/AES functions.
- Browser and automatically detected uni-app Storage with TTL, codecs, namespace isolation, and cleanup.
- Optional Vue 2.7/3 entry with Composition API, typed emits/props/slots, render, and install helpers.
- Pure ESM ES2022 publishing with exact public subpaths, one root package, and one root `dist/` directory.
- Runtime, type-consumer, package-contract, Source Map, Tree Shaking, package-size, Publint, and CI validation.

### Security

- Added authenticated ciphertext validation, bounded crypto parameters and payloads, unbiased Web Crypto randomness, prototype-safe query/object transforms, and namespace-scoped Storage cleanup.

[2.1.10]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.9...v2.1.10
[2.1.9]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.8...v2.1.9
[2.1.8]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.7...v2.1.8
[2.1.7]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.6...v2.1.7
[2.1.6]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.5...v2.1.6
[2.1.5]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.4...v2.1.5
[2.1.4]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.3...v2.1.4
[2.1.3]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.2...v2.1.3
[2.1.2]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.1...v2.1.2
[2.1.1]: https://gitee.com/FastDotnet/fast.utils/compare/v2.1.0...v2.1.1
[2.1.0]: https://gitee.com/FastDotnet/fast.utils/compare/v2.0.3...v2.1.0
[2.0.3]: https://gitee.com/FastDotnet/fast.utils/compare/v2.0.2...v2.0.3
[2.0.2]: https://gitee.com/FastDotnet/fast.utils/compare/v2.0.1...v2.0.2
[2.0.1]: https://gitee.com/FastDotnet/fast.utils/compare/v2.0.0...v2.0.1
[2.0.0]: https://gitee.com/FastDotnet/fast.utils/releases/tag/v2.0.0
