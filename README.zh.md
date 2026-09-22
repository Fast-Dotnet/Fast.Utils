**简体中文** | [English](./README.md)

<p align="center">
	<img src="./Fast.png" width="128" alt="Fast.Utils Logo" />
</p>

<h1 align="center">Fast.Utils</h1>

<p align="center">
	<a href="https://www.npmjs.com/package/@fast-china/utils"><img src="https://img.shields.io/npm/v/@fast-china/utils?logo=npm" alt="npm version" /></a>
	<a href="https://www.npmjs.com/package/@fast-china/utils"><img src="https://img.shields.io/npm/dm/@fast-china/utils" alt="npm downloads" /></a>
	<a href="./LICENSE"><img src="https://img.shields.io/npm/l/@fast-china/utils" alt="License" /></a>
</p>

面向现代浏览器、WebView、Vue 3 与 uni-app 的 TypeScript 工具 SDK。

**[使用文档](http://docs.fastdotnet.cn/zh-CN/frontend/utils/) · [官方网站](http://fastdotnet.com)**

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

jsDelivr 入口为压缩后的浏览器文件 `dist/index.global.min.js`，全局变量为 `FastUtils`。

| 资源                                         | jsDelivr                                                                            | unpkg                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `vue@3.5.11/dist/vue.global.prod.js`         | [jsDelivr](https://cdn.jsdelivr.net/npm/vue@3.5.11/dist/vue.global.prod.js)         | [unpkg](https://unpkg.com/vue@3.5.11/dist/vue.global.prod.js)         |
| `@fast-china/utils/dist/index.global.min.js` | [jsDelivr](https://cdn.jsdelivr.net/npm/@fast-china/utils/dist/index.global.min.js) | [unpkg](https://unpkg.com/@fast-china/utils/dist/index.global.min.js) |

## 快速开始

默认命名空间为 `fast__`，可直接存取带过期时间的业务数据：

```ts
import { Local } from "@fast-china/utils";

Local.set("profile", { name: "Fast" }, { ttlMs: 30 * 60 * 1000 });
const profile = Local.get<{ name: string }>("profile");
console.log(profile?.name);
```

省略 TTL 时永久有效。自定义命名空间或 Codec 必须在首次存储操作之前配置；`crypto` 仅为 Base64 混淆，不是加密。uni-app 使用 `Local`，不支持 `Session`。

## 常见用法

普通工具从包根具名导入：

```ts
import { encodeBase64, formatBytes, sleep } from "@fast-china/utils";

const encoded = encodeBase64("Fast");
const size = formatBytes(1536);
await sleep(100);
console.log(encoded, size);
```

同步参数校验和已取消信号可能在调用时抛错；等待期间的取消通过 Promise 拒绝，不将二者混为一谈。

## 模块

`@fast-china/utils` 是唯一公开入口，全部 API 都通过具名导出提供。源码模块仍会在 `dist/` 中独立保留，便于现代打包器移除未使用代码，但这些内部文件不是公开子路径。

`object` 模块提供不依赖第三方库的深复制、深度比较和按条件筛选属性能力。数组工具支持 SameValueZero 对称差集，`once` 则会保留第一次调用的返回值、Promise 引用或同步错误。

## 运行时契约

- 包管理器入口为纯 ESM；CDN 入口为单独压缩的 IIFE。
- 面向 ES2022 现代浏览器与 WebView。
- Vue 3.5.11 及以上版本通过必须安装的 Peer Dependency 接入。
- 调用时检测运行时注入的 `uni` 和 App-Plus `plus`，并兼容对应全局属性。
- 导入阶段不访问 `window`、Storage 或 `uni`；不支持的调用明确失败。
- 不注入 Web Crypto、URL、Intl、TextEncoder 等 Polyfill。

## 文档

- [API 文档](http://docs.fastdotnet.cn/zh-CN/frontend/utils/api/)
- [运行时契约](http://docs.fastdotnet.cn/zh-CN/frontend/utils/runtime-contract)
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

## 版权、许可证与使用声明

版权所有 © 2018-Now 小方。本项目依据 [Apache License 2.0](./LICENSE) 开源；在遵守许可证的前提下，可以使用、修改和分发本软件，包括商业使用。

再分发时，应按许可证要求提供许可证副本、对修改的文件作出显著说明，并保留适用的版权和归属声明；包含需要保留的 NOTICE 信息时一并处理。本说明不替代正式许可证，也不额外要求在产品界面展示作者或项目标识。

使用者应就自身使用、二次开发、部署、数据处理及运营活动遵守适用法律和第三方合法权益，自行取得依法需要的授权。上述内容为合规提醒，不构成附加许可条件。

除适用法律另有规定或另有书面约定外，本软件按“原样”提供；保证排除与责任限制以许可证第 7、8 条为准。提供本项目不代表原作者为使用者的二次开发和运营活动背书，也不当然承担其对第三方作出的合同承诺。本说明不排除依法不得排除的责任。
