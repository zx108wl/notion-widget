# Notion Widget

面向 Notion Embed 的轻量组件项目，使用 Vite 前端、Express API、Nginx 与 Docker Compose。

## 文档

- [项目框架文档](docs/project-framework.md)：整体架构、工作台加载、构建接口、后端及部署维护。
- [插件开发文档](docs/plugin-development.md)：供开发者或 AI 直接开发插件，包含执行步骤、完整示例、配置协议、资源引用和验收标准。

## 本地启动

需要 Node.js 22 或更高版本。首次从 `.env.example` 创建 `.env`，然后运行：

```bash
npm install
npm run dev
```

工作台：`http://127.0.0.1:5173`；API：`http://127.0.0.1:3000/api/health`。

```bash
npm run check
```

## 用 AI 开发插件

将具体插件需求与 `docs/plugin-development.md` 交给 AI，并提供当前项目代码。例如：

```text
读取 docs/plugin-development.md，在当前项目开发 daily-note 插件。
功能：显示可配置的标题和正文，支持主题、强调色及自适应宽高。
按文档完成实现、注册与验证，并给出预览地址。
```
