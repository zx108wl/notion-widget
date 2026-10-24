# 项目框架文档

本文维护 Notion Widget 主项目：工作台、嵌入页、共享核心、构建流程、后端服务与部署。开发具体插件请使用 [插件开发文档](plugin-development.md)。

## 1. 架构与职责

项目由两个完全隔离的前端入口、一套共享核心、一个 Node API 和 Nginx 组成。工作台使用 React 与 Ant Design；嵌入页保持零框架，只加载目标插件自己的代码。

| 路径 | 职责 |
| --- | --- |
| `index.html` | 工作台入口 |
| `widget.html` | 嵌入页入口，内联骨架屏 |
| `src/workbench/` | React 工作台：组件库、预览、配置表单、令牌签发、设置页 |
| `src/widget-entry/` | 嵌入页启动：解析 URL、校验参数、加载插件、响应参数消息 |
| `src/core/schema/` | 配置、字段、控件、图标、服务端声明的 Zod schema 与运行时工具 |
| `src/core/validation/` | 工作台与嵌入页共用的参数校验、URL 解析 |
| `src/core/loader.ts` | 清单、配置、模块与样式加载及缓存 |
| `src/core/runtime/` | 插件实例生命周期：render、update、销毁、过期结果清理 |
| `src/core/registry.ts` | 扫描 `widgets/` 的插件注册表（仅 Node 侧） |
| `src/styles/` | 工作台与嵌入页基础样式 |
| `widgets/` | 插件源码；含 `config.json` 的目录即一个插件 |
| `scripts/build.ts` | 构建工作台、嵌入页、每个插件、图标、自定义控件与服务端产物 |
| `scripts/verify-build.ts` | 校验清单、配置、入口、资源、`render` 导出与路由声明 |
| `vite.config.ts` | 双入口构建、开发清单中间件、`/widget/` 回退、API 代理 |
| `server/start.js` | 启动引导：解析或生成主密钥后加载服务 |
| `server/index.js` | 健康检查、认证与管理路由、插件分发、优雅退出 |
| `server/auth/` | 用户、密码、会话、令牌、凭据加密、调用统计 |
| `server/plugin-*.js` | 插件服务端加载、鉴权与路由分发 |
| `server/db/schema.js` | SQLite 建表与版本迁移 |
| `deploy/nginx.conf` | 静态资源、缓存、安全头、反向代理与真实 IP 还原 |
| `Dockerfile.web / Dockerfile.api` | 前端与后端镜像 |
| `compose.yaml` | 服务编排、端口与持久化卷 |
| `.github/workflows/deploy.yml` | CI 校验与服务器部署 |

## 2. 加载与数据流

1. 工作台请求 `/widgets/manifest.json`，拿到所有插件的元信息、配置地址与构建后的入口。清单由 Vite 中间件在开发模式按请求生成，生产由构建脚本写入。
2. 选择插件后加载 `/widgets/{id}/config.json`，按 `fields` 渲染表单。配置与模块在页面内缓存。
3. 输入值先本地校验；校验通过后生成嵌入 URL，经 250ms 防抖通过同源 `postMessage` 更新预览，不重新加载 iframe。
4. 嵌入页解析查询参数并严格校验。参数错误时直接显示错误页，不加载插件资源。合法时加载清单、配置、JS 与 CSS，再调用 `render`。
5. 同源预览复用父页面的清单；外部嵌入自行加载。跨域时 iframe 不读取父页面数据。

插件实例协议：

```ts
render(root, config, { signal, authToken }) =>
  void | (() => void) | { update?(next, options), destroy?() }
```

- `config` 的值全部是字符串。
- `theme`、`width`、`height` 由宿主写在 `documentElement` 上，插件不处理这三个字段的宿主语义。
- 存在 `update` 时原地更新；否则销毁旧实例后重新 `render`。
- 所有请求、定时器与监听器都应绑定 `signal` 并在 `destroy` 中清理。
- 嵌入令牌从 URL fragment `#t=` 读取，通过 `authToken` 交给插件；宿主不把它发给服务端。

## 3. 构建与产物

```text
dist/
  index.html                    工作台
  widget.html                   嵌入页
  assets/                       两个入口的 JS/CSS
  widgets/
    manifest.json               插件清单
    {id}/
      config.json               发布配置（不含 server 声明）
      index-[hash].js           渲染入口
      style-[hash].css
      controls-[hash].js        自定义设置控件（按需）
      controls-[hash].css
      chunks/                   前端异步分块
      assets/                   前端静态资源与发布后的图标
      server.js                 服务端模块（仅声明了 server 的插件）
      server-chunks/            服务端异步分块
```

- `npm run build` 先构建工作台与嵌入页，再逐个插件构建，最后写清单。
- 源码 `entry.js` / `entry.css` 在发布配置中改写为带哈希的相对路径；清单里是站点根路径 URL。
- `server` 声明只保留在源 `config.json`，发布配置会删除它。服务端产物固定为 `server.js`，由 API 进程加载，Nginx 对 `server.js` 与 `server-chunks/` 返回 404。
- 本地图标由构建器复制为 `assets/icon-[hash].svg`（或对应扩展名）并写入发布配置；未通过 JS/CSS 引用的静态文件不会自动复制。
- `defaultSize` 只影响工作台首次预览的视口，不写入嵌入 URL，也不影响 Notion 中的实际尺寸。
- `npm run build:server` 只编译服务端模块，供 api 镜像构建阶段使用。

`npm run check` 会执行类型检查、单元测试、全部构建与产物校验。校验要求每个插件至少有一个 CSS 产物、导出 `render`、`width`/`height` 字段合法且默认值为空、服务端声明的路由不冲突。

## 4. 服务端设计

### 认证与账号

- 首个管理员在 `users` 表为空时创建，用户名默认 `admin`。未配置 `ADMIN_PASSWORD` 时自动生成密码，写入日志与密钥卷内的 `initial-admin-password`。
- 自动生成的密码带 `must_change_password` 标记：改密前仅允许 `/api/auth/me`、`/api/auth/password`、`/api/auth/logout`，其它接口与插件会话调用返回 403。
- 会话是服务端可撤销会话，不是 JWT。Cookie 名 `wn_session`，数据库只保存 token 的 SHA-256；生产环境加 `Secure`。
- 登录、改名等敏感操作按来源 IP 限流；改名冲突由 `users.username` 唯一约束兜底。

### 第三方密钥

- 按 `provider + slot` 存储，UPSERT 即轮换，AES-256-GCM 加密，每条独立 IV，AAD 绑定 `provider|slot`。
- 主密钥由 `WIDGET_DB_KEY` 或独立卷 `widget-key:/key/master.key` 提供；首次启动自动生成，缺失或长度错误拒绝启动，不做明文降级。
- 密钥只在服务端解密。插件必须先在 `config.json` 的 `server.credentials` 中声明才能读取。

### 访问令牌

- 令牌绑定插件与配置参数，明文只在签发时返回一次，数据库只存 `secret_hash`。
- 令牌通过 URL fragment `#t=` 传入嵌入页，插件以 `Authorization: Bearer` 调用接口。fragment 不进服务端日志与 Referer。
- 声明为必选的密钥在签发时必须授权且不可取消；可选密钥按勾选组合形成最小权限。
- 支持令牌级 IP 黑名单、调用监控、按 IP 聚合的使用记录与保留期配置。

### 插件接口

- 插件在 `config.json` 的 `server.expose` 中逐条声明接口，运行时只挂载已声明的 key；未声明的一律 404。
- 路由 key 形如 `GET /api/xxx`，只允许静态路径。`/api/auth/`、`/api/admin/` 与 `GET /api/health` 为保留路由。
- `server.auth` 可为 `"none"` 或 `"token"`。`"token"` 时带 Bearer 只认令牌，无效立即 401；不带 Bearer 时接受管理员会话（工作台预览）。
- 实现为导出 `routes` 对象的模块，与前端产物互不 import。开发模式直接运行 `.ts`，生产加载 SSR 编译后的 `server.js`。

### 数据库

- 使用 `node:sqlite`，STRICT 表、WAL 日志，`PRAGMA user_version` 做幂等迁移。
- 数据库路径由 `WIDGET_DB_PATH` 指定，容器内固定为 `/data/widget.db`。
- 当前版本为 v8：v7 清理令牌遗留列，v8 增加 `users.must_change_password`。
- SQLite 文件库决定只能运行一个 api 实例，不要配置多副本。

## 5. 本地开发

```bash
npm install
npm run dev
```

- 工作台：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000/api/health`
- Vite 将 `/api` 代理到本地 API；`/widget/{id}` 回退到 `widget.html`。
- 开发清单每次请求重新扫描 `widgets/`：新增插件目录后刷新页面即可出现。新增服务端模块时，`tsx watch` 可能看不到新目录，重启一次 API。
- `.env` 可选。需要固定主密钥、管理员密码或端口时，从 `.env.example` 复制。

常用命令：

```bash
npm run dev          # API + Vite
npm run dev:api      # 仅 API，tsx watch
npm run dev:web      # 仅 Vite
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run check        # 类型 + 测试 + 构建 + 产物校验
npm run preview      # 预览 dist，需另行启动 API
```

## 6. 部署

### 1Panel

1. 将项目上传或克隆到服务器。
2. `.env` 可选：不配置时主密钥与管理员初始密码在首次启动时自动生成；需要覆盖默认值再从 `.env.example` 创建。
3. 在 1Panel 的「容器 → 编排」中使用 `compose.yaml` 启动。
4. `docker compose logs api` 查看自动生成的初始密码（账号 `admin`），首次登录必须修改。
5. 创建反向代理网站，目标地址 `http://127.0.0.1:18080`。
6. 配置域名、HTTPS 与自动续签证书。
7. 把 `https://widget.example.com` 通过 Notion `/embed` 加入页面。

容器不向公网暴露 API 端口；对外只经 1Panel OpenResty 的 80/443。`WEB_PORT` 可改，但反向代理目标端口必须同步。

### 真实客户端 IP

`deploy/openresty-location.conf` 粘贴到 1Panel 站点的 `server` 块：用 `$remote_addr` 覆写 `X-Real-IP` 与 `X-Forwarded-For`，并下发 HSTS。容器内 Nginx 只信任本机与私网来源，用 `real_ip_recursive` 还原 `$remote_addr` 后再覆写同名头给 API。API 只读 `X-Real-IP`，客户端自带的伪造头不会被采信；登录限流、IP 黑名单与调用记录都依赖该地址。

### 安全响应头

- 工作台 `/`、`/index.html`：`X-Frame-Options: SAMEORIGIN`，CSP `frame-ancestors 'none'`。
- `/widget.html` 与 `/widget/`：不设置上面两项，保证 Notion iframe 可加载；统一带 `Referrer-Policy: no-referrer`。
- 静态资源与接口带 `X-Content-Type-Options: nosniff`；HSTS 由终止 TLS 的外层下发。
- Nginx 的 `add_header` 不继承：location 自己声明响应头时必须重复所需项。

### 数据备份与恢复

数据库在命名卷 `widget-data`；主密钥在独立命名卷 `widget-key` 的 `/key/master.key`（`.env` 配置了 `WIDGET_DB_KEY` 时优先）。两个卷必须分开备份：只有库没有主密钥，第三方密钥全部无法解密。

先做一致性快照再拷出：

```bash
docker compose exec api node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync('/data/widget.db').exec(\"VACUUM INTO '/data/snapshot.db'\")"
docker compose cp api:/data/snapshot.db ./widget-$(date +%F).db
docker compose exec api rm /data/snapshot.db
```

`WIDGET_DB_KEY` / `widget-key` 卷另存到密码管理器或离线介质，不要和数据库放在同一台机器、同一个备份包里。

恢复：`docker compose stop api` 后用备份覆盖卷内 `/data/widget.db`，删除残留的 `widget.db-wal` / `widget.db-shm`，再 `docker compose start api`。恢复流程先在测试环境演练一次。

### 主密钥轮换与密码重置

```bash
# 轮换主密钥：事务内重新加密全部第三方密钥，随后重启 api
docker compose exec api node server/cli.js rotate-key
docker compose restart api

# 重置管理员密码（不带 --password 时自动生成并只打印一次）
docker compose exec api node server/cli.js set-password --user admin
```

轮换必须通过 `rotate-key`：直接改环境变量会导致已有密文全部解不开。命令会把新密钥打印一次，来自密钥文件时还会自动替换文件。

### 升级提示：IP 语义变化

从只信任 `X-Real-IP` 的版本开始，调用记录里的 IP 才是真实来源。升级前记录的 IP 可能来自可伪造的 `X-Forwarded-For`，旧黑名单建议在「访问令牌 → 查看」中核对后重新添加。

## 7. GitHub 推送部署

`.github/workflows/deploy.yml` 在 `main` 更新或手动触发时执行：

1. `npm ci` 与 `npm run check`。
2. 用真实 Nginx 镜像校验 `deploy/nginx.conf`。
3. `rsync` 同步代码，排除 `.env`、`.git`、`node_modules`、`dist`。
4. 在服务器执行 `docker compose up -d --build --remove-orphans`。

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 配置：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 服务器 IP 或 SSH 域名 |
| `DEPLOY_USER` | 专用部署用户名 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_PATH` | 服务器项目绝对路径 |
| `DEPLOY_SSH_KEY` | 专用部署私钥全文 |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan` 获取的主机指纹 |

服务器上的 `.env` 不会被上传或删除。部署用户需要 `DEPLOY_PATH` 写权限，并能运行 Docker Compose。

## 8. 维护约定

- 工作台逻辑归 `src/workbench/`，嵌入与插件共享逻辑归 `src/core/`。`src/core` 不得引入 React，保证嵌入页零框架。
- 新增插件只创建 `widgets/{id}/` 并放 `config.json`；不要新增任何全局注册表。`getWidgets()`、构建、校验与 API 加载器都会自动扫描。
- 修改配置协议时同步更新 Zod schema、运行时工具、表单、构建校验与插件开发文档。
- 修改产物结构时同步更新开发清单、生产清单、加载器、校验脚本与 Nginx 缓存规则。
- 新增服务端能力优先做成插件服务端模块；只有账号、会话、密钥托管与令牌这类核心能力才进入 `server/`。
- 插件接口必须显式声明；核心保留前缀不得被插件占用。
- 不要手改 `dist/`。生产发布是整包替换，数据库与密钥在命名卷中不受影响。

### 缓存

- `index.html`、`widget.html`、`/widget/`、清单和插件 `config.json`：`no-cache`。
- 工作台资源、插件 JS/CSS、图标与静态资源：一年 `immutable`（文件名带哈希）。
- 发布后刷新工作台即可拿到新清单；嵌入页刷新即可加载新入口。
