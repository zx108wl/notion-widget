# Notion Widget

一个面向 Notion Embed 的轻量组件模板：Vite 前端、Express API、Nginx 静态资源服务和 Docker Compose 生产部署。

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

## Notion API

在服务器 `.env` 中填写：

```dotenv
NOTION_TOKEN=ntn_xxx
NOTION_PAGE_ID=xxx
NOTION_VERSION=2025-09-03
```

前端只访问 `/api/*`。不要在 `src`、HTML、Git 仓库或 Vite 的 `VITE_*` 环境变量中保存 Notion Token。
