# 项目框架文档

本文用于维护 Notion Widget 主项目、工作台、构建流程、后端和部署。开发具体插件时使用 [插件开发文档](plugin-development.md)，该文档可直接作为 AI 开发任务输入。

## 1. 架构与职责

项目采用原生 JavaScript ES 模块、Vite、Express、Nginx 和 Docker Compose。插件在独立 iframe 页面运行，工作台通过配置 JSON 生成表单和嵌入 URL。

| 路径 | 职责 |
| --- | --- |
| `index.html` | 工作台及嵌入页面的统一 HTML 入口 |
| `src/main.js` | 路由识别、目录展示、参数表单、URL 生成和动态加载 |
| `src/style.css` | 工作台布局及嵌入页面容器尺寸 |
| `src/widgets-registry.js` | 受信任插件 ID 注册表 |
| `src/controls/` | 公共控件动态注册、创建、回退和清理 |
| `src/control-policy.js` | 控件类型兼容与配置规则 |
| `src/config-validation.js` | 工作台及嵌入页共用的值校验与 URL 解析 |
| `src/async-cache.js / src/request-cache.js` | 模块请求合并、配置缓存及订阅取消 |
| `src/widget-runtime.js` | 插件渲染、更新、过期结果清理和销毁 |
| `scripts/widget-control-assets.js` | 每个插件的设置控件独立构建与入口改写 |
| `tests/config-controls.test.js` | 参数校验、缓存取消与生命周期回归测试 |
| `src/widget-config.js` | 配置校验、动态默认值和元信息提取 |
| `widgets/{id}/` | 插件源码和配置，具体约定由插件开发文档维护 |
| `vite.config.js` | 开发清单、开发/预览服务和 API 代理 |
| `scripts/build.js` | 构建工作台，逐个构建插件，生成发布配置与清单 |
| `scripts/widget-icon-assets.js` | 发布配置引用的本地图标，生成内容哈希 |
| `tests/widget-icons.test.js` | 图标协议、发布资源与渲染回退的回归验证 |
| `scripts/verify-build.js` | 验证产物、配置与清单一致性 |
| `server/index.js` | 同源 API、服务端环境变量与第三方请求 |
| `deploy/nginx.conf` | 静态资源、页面回退、API 反向代理与缓存 |
| `Dockerfile.web / Dockerfile.api` | 前端和后端容器镜像 |
| `compose.yaml` | 服务编排及端口映射 |
| `.github/workflows/deploy.yml` | CI 检查与服务器部署 |

## 2. 加载与配置数据流

1. 启动页面先请求 `/widgets/manifest.json`，取得插件 ID、名称、图标、简介、版本和资源入口。
2. 选择插件后读取并缓存配置，根据字段去重动态加载公共控件或插件自定义设置控件，创建表单实例。
3. 原始编辑值保存于工作台状态；校验通过后生成 URL，经 250ms 防抖更新预览。已有 iframe 通过同源消息更新参数，不重新导航。
4. 嵌入页先解析并严格校验 URL；错误页指出值、原因及建议，不加载插件 JS/CSS。合法参数才加载代码并调用 render。
5. 同源预览 iframe 复用父工作台的清单与原始配置，避免重复请求；外部嵌入页自行读取清单与配置。

开发清单由 Vite 中间件读取注册表与源码配置动态生成，开发 CSS 由 JS 导入注入。生产清单由构建脚本写入。页面内缓存清单、配置和模块，修改配置后需要刷新页面。

## 3. 构建与发布接口

```text
dist/
  index.html
  assets/                         工作台 JS/CSS
  widgets/
    manifest.json
    {id}/
      config.json
      index-[hash].js
      style-[hash].css
      controls-[hash].js          自定义设置控件
      controls-[hash].css         按需生成的控件样式
      chunks/                     按需生成
      assets/                     未内联的静态资源
```

构建先生成工作台，再按注册表分别打包插件。发布配置的 `entry` 使用相对于配置 URL 的产物路径；清单使用站点根路径开头的 URL。额外分块和资源也归属插件目录。静态资源处理被代码或 CSS 引用的文件，以及配置 icon 中引用的本地图标；目前没有复制整个静态目录的能力。本地图标由 scripts/widget-icon-assets.js 发布为带内容哈希的资源，开发与生产清单中的 icon.src 均解析为站点根路径。

清单结构示意：

```json
{
  "clock": {
    "id": "clock",
    "name": "日期时钟",
    "icon": { "type": "image", "src": "/widgets/clock/assets/icon-示例哈希.svg" },
    "summary": "时间、日期与时区",
    "description": "插件功能说明",
    "version": "0.1.0",
    "config": "/widgets/clock/config.json",
    "js": "/widgets/clock/index-示例哈希.js",
    "css": ["/widgets/clock/style-示例哈希.css"]
  }
}
```

上述哈希仅为示意，实际路径以构建产物为准。发布时同步部署整个 dist，保证清单、配置和资源属于同一次构建。当前使用站点根路径，不支持直接双击 HTML 或无需改造就部署到任意子路径。

### 请求粒度与生命周期

公共设置组件使用动态 import 按 input / slider / select / radio / switch 拆分，文本、数字、颜色和日期共用 input；共享依赖由 Vite 提取。入口只包含注册和加载器，不包含具体控件实现。模块 Promise 合并并发请求并保留成功缓存，失败加载清除缓存。

插件自定义设置控件按插件聚合成单独 controls-[hash].js（及所需 CSS），仅用于设置，不并入插件渲染入口。iframe 参数更新不重新请求静态模块，相同配置消息不重复渲染。

切换插件时 abort 选择作用域、销毁控件实例、卸载旧 iframe，保留配置、代码模块与参数草稿。配置请求按消费者计数，最后一个消费者退出时取消未完成请求，避免旧请求影响新选择。动态 import 无法直接取消，但过期结果不挂载；实例挂载阶段的监听器和请求使用独立 signal。JS 模块只缓存代码，实例生命周期由宿主管理。插件异步 render/update 和销毁由 widget-runtime.js 管理。

### 外部工作台接入

独立工作台可先读取 `/widgets/manifest.json`，再加载目标插件配置生成表单。若直接取得单个发布配置，按配置 URL 解析入口：

```js
const configUrl = new URL("/widgets/hello/config.json", window.location.origin);
const definition = await (await fetch(configUrl)).json();
const scriptUrl = new URL(definition.entry.js, configUrl).href;
const styleUrls = definition.entry.css.map(value => new URL(value, configUrl).href);
```

需要自行加载 CSS、导入 JS，以及按本文约定解析默认值和参数后调用 `render`。该项目目前没有单独发布工作台 SDK。


## 4. 框架维护约定

- 工作台专用逻辑归属 `src`；插件业务归属 `widgets/{id}`，不把插件参数硬编码进工作台。
- 修改配置协议时同步维护配置校验、参数解析、表单、构建验证和插件开发文档。
- 修改输出结构时同步维护开发清单、生产清单、资源加载、验证脚本和静态服务规则。
- 后端运行独立于 Vite；开发与预览通过代理访问 API，生产通过 Nginx 访问 api 容器。
- 目前没有插件安装服务、权限系统、服务端参数持久化服务或独立 SDK，新增这些能力应作为框架变更实现。

### 当前缓存行为

Nginx 为 index.html、清单和各插件 config.json 设置 no-cache，以允许重验证。带哈希的工作台、控件和插件资源使用一年 immutable 缓存。页面内复用配置和模块；生产发布后需刷新工作台获取新清单和配置。

## 5. 本地运行与部署

以下步骤均在项目根目录执行。

## 本地开发

需要 Node.js 22：

```bash
cp .env.example .env
npm install
npm run dev
```

- 前端：http://127.0.0.1:5173
- API：http://127.0.0.1:3000/api/health

Vite 会把 `/api` 请求转发到本地 API。

## 组件路由

访问根页面可浏览、预览和配置现有组件，配置结果会生成可直接放进 Notion `/embed` 的 URL：

```text
https://widget.example.com/widget/{widget_id}?参数=值
```

所有组件都支持 `width` 和 `height` 参数（单位为像素），例如
`/widget/clock?width=520&height=300`。`width` 和 `height` 均默认为空，此时自动铺满 Notion 的嵌入可视区域；填写尺寸后则使用固定宽高。组件中心的实时预览框只模拟可视区域，拖动其右下角不会修改组件宽高或生成的 URL。

当前内置组件：

| widget_id | 组件 |
| --- | --- |
| `clock` | 日期时钟 |
| `status` | API 服务状态 |

日期时钟支持通过 `latitude` 和 `longitude` 参数直接设置天气坐标，例如
`/widget/clock?latitude=30.2741&longitude=120.1551`。天气数据由后端代理 Open-Meteo 获取并缓存，前端不会暴露服务密钥。

组件目录维护在 `src/widgets-registry.js`，每个组件的配置、逻辑和样式位于独立的 `widgets/{widget_id}/`。构建脚本逐个编译组件，生成带内容哈希的 JS/CSS 与 `dist/widgets/manifest.json`；路由命中后才加载清单中的对应产物。

插件开发、参数协议和完整示例见 [插件开发文档](plugin-development.md)。

## 本地检查

```bash
npm run check
```

## 1Panel 部署

1. 将项目上传或克隆到服务器。
2. 从 `.env.example` 创建 `.env`，只在服务器中填写密钥。
3. 在 1Panel 的“容器 → 编排”中使用 `compose.yaml` 启动。
4. 创建反向代理网站，目标地址填写 `http://127.0.0.1:18080`。
5. 为网站配置域名、HTTPS 和自动续签证书。
6. 把最终的 `https://widget.example.com` 通过 `/embed` 加入 Notion。

容器不会向公网暴露 API 端口；对外只通过 1Panel OpenResty 的 80/443 访问。

`WEB_PORT` 可以在服务器 `.env` 中修改；默认是 `18080`。修改后，1Panel 反向代理的目标端口也必须保持一致。

## GitHub 推送部署

`.github/workflows/deploy.yml` 会在 `main` 分支更新后检查构建、同步代码，并在服务器执行 `docker compose up -d --build`。

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 中配置：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 服务器 IP 或 SSH 域名 |
| `DEPLOY_USER` | 专用部署用户名 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_PATH` | 服务器项目绝对路径 |
| `DEPLOY_SSH_KEY` | 专用部署私钥全文 |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan` 获取的服务器主机指纹 |

服务器上的 `.env` 不会被上传或删除。部署用户需要拥有 `DEPLOY_PATH` 的写权限，并获准运行 Docker Compose。

