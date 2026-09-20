<p align="left">
	<strong>简体中文</strong> | <a href="./README.md">English</a>
</p>

<p align="center">
	<img src="./Fast.png" alt="logo" width="160" />
</p>

# @fast-china/utils

**[使用文档](http://docs.fastdotnet.cn/utils/) · [官方网站](http://fastdotnet.com)**

面向现代浏览器、WebView、Vue 3 与 uni-app 的 TypeScript 前端工具库。

[![npm 版本](https://img.shields.io/npm/v/@fast-china/utils?color=orange)](https://www.npmjs.com/package/@fast-china/utils) [![node](https://img.shields.io/badge/node-%5E22.18%20%7C%7C%20%5E24.18-brightgreen)](https://nodejs.org/) [![Vue](https://img.shields.io/badge/vue-%5E3.5.11-42b883)](https://vuejs.org/) [![开源协议](https://img.shields.io/npm/l/@fast-china/utils)](./LICENSE)

## 特性

- 提供完整类型、无副作用实现和统一具名导出入口，便于 Tree Shaking。
- 明确支持浏览器、WebView、Vue 3 与 uni-app，导入阶段不访问平台全局对象。
- 为 Storage、安装标识、编码、随机数与密码学能力划定清晰的安全边界。
- 使用 TypeScript 6 严格检查、ESLint、运行时测试、消费者类型测试、包契约与 Publint 共同验证。

## 安装

```bash
pnpm add @fast-china/utils
```

### CDN

`unpkg` 和 `jsdelivr` 字段都指向压缩后的浏览器文件 `dist/index.global.min.js`，全局变量为 `FastUtils`。

## Storage

`Local` 和 `Session` 无需配置即可使用。默认前缀为 `fast__`，值使用 JSON 编码，未指定 TTL 时永久有效：

```ts
import { Local, Session } from "@fast-china/utils";

Local.set("user", { id: 1 }, { ttlMs: 30 * 60 * 1000 });
const user = Local.get<{ id: number }>("user");

Local.set("private-user", { id: 2 }, { crypto: true });
const privateUser = Local.get<{ id: number }>("private-user", { crypto: true });

Session.set("redirect", "/home");
const redirect = Session.get("redirect"); // string | undefined
```

`get<Value = string>()` 未传泛型时默认返回 `string | undefined`，因此字符串场景可以直接调用。Storage Codec 仍会在运行时执行 JSON 反序列化；若存储的是对象、数组或其他非字符串值，建议显式传入对应泛型以获得准确类型。

只有需要覆盖默认值时，才需在首次 Storage 操作前调用 `configureStorage`。兼容旧版的 `crypto` 选项只执行可逆 Base64 混淆，不是加密，不能保护敏感数据：

```ts
import { configureStorage } from "@fast-china/utils";

configureStorage({
	prefix: "my-app:",
	crypto: true,
});
```

激活后的全局配置不可变；相同配置重复调用保持幂等，不同配置会抛错。`set/get` 的 `crypto` 选项只覆盖单次操作，读写同一条目时必须保持一致，不会改变全局配置。自定义 `codec` 与全局 `crypto` 不能同时使用。uni-app 中 `Local` 会自动解析运行时注入的 `uni` 对象并使用其同步 Storage API；由于没有等价的 sessionStorage，`Session` 会明确抛错。`clear()` 只清理当前前缀。

## Base64

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## 复制文本

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## 安装实例标识

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## Logger

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## Crypto

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## Vue 3

[完整配置与示例](http://docs.fastdotnet.cn/utils/guide)

## 模块

`@fast-china/utils` 是唯一公开入口，全部 API 都通过具名导出提供。源码模块仍会在 `dist/` 中独立保留，便于现代打包器移除未使用代码，但这些内部文件不是公开子路径。

历史聚合对象不再公开，继续支持的能力通过具名函数提供，便于自动导入与 Tree Shaking；当前大版本并未保留每一个旧版便捷方法。

`object` 模块提供不依赖第三方库的深复制、深度比较和按条件筛选属性能力。数组工具支持 SameValueZero 对称差集，`once` 则会保留第一次调用的返回值、Promise 引用或同步错误。

## 运行时契约

- 包管理器入口为纯 ESM；CDN 入口为单独压缩的 IIFE。
- 面向 ES2022 现代浏览器与 WebView。
- Vue 3.5.11 及以上版本通过必须安装的 Peer Dependency 接入。
- 调用时检测运行时注入的 `uni` 和 App-Plus `plus`，并兼容对应全局属性。
- 导入阶段不访问 `window`、Storage 或 `uni`；不支持的调用明确失败。
- 不注入 Web Crypto、URL、Intl、TextEncoder 等 Polyfill。

## 文档

- [API 文档](http://docs.fastdotnet.cn/utils/api)
- [运行时契约](http://docs.fastdotnet.cn/utils/runtime-contract)
- [开发与发布](./docs/DEVELOPMENT_RELEASE.zh-CN.md)
- [安全策略](./SECURITY.md)
- [贡献指南](./CONTRIBUTING.md)
- [更新日志](./CHANGELOG.md)

## 开发

开发工具链要求 Node.js `^22.18.0 || ^24.18.0` 与 pnpm `^11.0.0`。

```bash
pnpm install --frozen-lockfile
pnpm check
```

修改源码时可使用 `pnpm dev` 启动长期运行的 tsdown 监听构建。

## 许可证

[Apache-2.0](./LICENSE)
