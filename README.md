# Notion Widget

自托管的 Notion 小组件平台：在网页工作台里选择组件、调整参数，生成一条可直接粘贴进 Notion `/embed` 的地址；嵌入页零框架运行，只加载该组件自己的 JS/CSS。

## 能力

- **双入口隔离**：`index.html` 是 React + Ant Design 工作台，`widget.html` 是零框架嵌入页，两份 bundle 完全独立。
- **目录即插件**：`widgets/{id}/` 放一个 `config.json` 就自动出现在工作台，无需改任何注册表。
- **配置驱动**：`config.json` 的 `fields` 同时驱动工作台表单、URL 参数校验和嵌入页渲染。
- **主题与尺寸**：支持 light / dark / auto、固定宽高与自适应，工作台预览与 Notion 内表现一致。
- **可选服务端模块**：插件可声明自己的 API 路由，独立编译，按白名单挂载。
- **密钥托管**：第三方密钥加密存储，令牌按需授权，嵌入链接用 URL fragment 携带令牌。
- **可运维**：SQLite 持久化、账号与会话、调用监控、IP 黑名单、Docker Compose 与 GitHub Actions 部署。

## 架构

| 层 | 技术 | 职责 |
| --- | --- | --- |
| 工作台 | React 18 + Ant Design 5 + Vite | 组件库、实时预览、配置表单、令牌签发、设置页 |
| 嵌入页 | 原生 ES 模块 | 解析 URL、校验参数、加载并运行单个插件 |
| 共享核心 | TypeScript（浏览器零框架可用的子集） | 配置 schema、校验、加载器、运行时、缓存 |
| API | Node.js 22 + Express 5 | 登录会话、密钥与令牌管理、插件路由分发 |
| 存储 | `node:sqlite` | 用户、会话、令牌、加密密钥、调用记录 |
| 部署 | Nginx + Docker Compose | 静态资源、反向代理、安全响应头 |

## 本地启动

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

- 工作台：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000/api/health`

首次启动会自动生成主密钥（`data/master.key`）和管理员账号 `admin`。初始密码打印在 API 日志中，同时写入 `data/initial-admin-password`；首次登录必须修改密码。`.env` 是可选的，需要固定配置时从 `.env.example` 复制。

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 同时启动 API 与 Vite 开发服务器 |
| `npm run check` | 类型检查、单元测试、构建全部插件并校验产物 |
| `npm run build` | 只构建生产产物到 `dist/` |
| `npm run preview` | 预览构建产物（`http://127.0.0.1:4173`） |

## 使用流程

1. 登录工作台，左侧选择组件，中间实时预览。
2. 右侧「配置面板」修改参数，只有校验通过才会更新预览与嵌入地址。
3. 无服务端接口的组件，直接复制预览区的嵌入 URL。
4. 插件接口需要令牌时（`server.auth: "token"`），在「签发令牌」选项卡签发，复制带 `#t=` 的完整链接。
5. 在 Notion 中执行 `/embed`，粘贴地址。
6. 「设置」页管理账号、访问令牌、第三方密钥和调用记录。

嵌入地址形如：

```text
https://widget.example.com/widget/clock?timezone=Asia/Tokyo&theme=dark
https://widget.example.com/widget/secret_demo#t=w_xxx.明文令牌
```

令牌放在 fragment 中，不会进入服务端日志或 Referer。

## 插件开发

新增插件只需要创建目录：

```text
widgets/{id}/
  config.json     元信息、字段、入口，可选 server / defaultSize
  index.ts        导出 render(root, config, options)
  style.css       由 JS 导入
  icon.svg        本地图标，构建时自动发布
  server.ts       可选，服务端路由模块
```

实现后运行 `npm run check`，刷新工作台即可看到。协议、表单控件、服务端模块、令牌与密钥的完整说明见 [插件开发文档](docs/plugin-development.md)。

用 AI 开发插件时，可直接把文档和需求一起交给它：

```text
读取 docs/plugin-development.md，在当前项目开发 daily-note 插件。
功能：显示可配置的标题与正文，支持主题、强调色和自适应宽高。
按文档完成实现与验证，并给出预览地址。
```

## 文档

- [项目框架文档](docs/project-framework.md)：架构、数据流、构建产物、服务端、部署与维护。
- [插件开发文档](docs/plugin-development.md)：目录约定、配置协议、运行时生命周期、服务端接口与验收清单。

## 部署

生产使用 `compose.yaml`（Nginx + API），由 1Panel 反向代理对外提供 HTTPS。`.env` 可选，主密钥与初始管理员密码在首次启动时自动生成。备份时 `widget-data` 与 `widget-key` 两个卷必须分开存放。

推送到 `main` 会触发 `.github/workflows/deploy.yml`：先执行 `npm run check` 与 Nginx 配置校验，再同步代码并重建容器。详细步骤、安全头、真实 IP 与恢复流程见 [项目框架文档](docs/project-framework.md)。
