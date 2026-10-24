# 插件开发文档

本文对应当前 Notion Widget 框架，可直接作为 AI 开发任务的输入。插件是一个独立目录：`config.json` 描述元信息与参数，前端入口导出 `render`，可选的服务端入口导出 `routes`。工作台根据配置生成表单和嵌入 URL，嵌入页只加载该插件的资源。

## AI 开发执行约定

### 开始前确认

从需求中确定插件 ID、名称、功能、可配置项、是否需要服务端接口与第三方密钥。ID 使用小写字母、数字与连字符，目录名、`config.json` 的 `id` 必须一致。修改已有插件时保留 ID 与已有参数含义。

缺少非关键细节时采用合理默认值并在交付时说明；涉及外部 API、凭据或无法推断的核心行为时先确认依赖，不虚构接口。

### 修改范围

- 只新增或修改 `widgets/{id}/`。**不需要修改任何注册表**，框架自动扫描含 `config.json` 的目录。
- 所有用户可调参数必须定义在 `config.json` 的 `fields` 中，不在工作台代码里硬编码插件字段。
- 服务端依赖必须是根 `package.json` 已声明的包或 Node 内置模块；不为单个插件新增私有依赖树。
- 只有需求涉及框架能力时才修改 `src/core/`、`scripts/` 或 `server/`，并说明原因。
- 不手改 `dist/`、清单或带哈希文件名。

### 必须完成

1. 通读目标目录（如已存在）与本文；协议不一致时以当前代码为准并指出差异。
2. 实现配置、前端入口、样式、可选的服务端模块与静态资源。
3. 覆盖主题、自适应尺寸、参数异常、异步失败与销毁清理。
4. 运行 `npm run check`；涉及接口时启动 API 验证成功、未授权与失败路径。
5. 交付修改文件、预览地址、配置项、验证结果与未解决依赖。未执行的验证要明确标注，不能宣称通过。

### 任务输入示例

```text
读取 docs/plugin-development.md，按当前协议开发插件。
插件 ID：daily-note
名称：每日一句
功能：显示标题和一段自定义文字，参数变化时原地更新。
可配置项：标题、正文、主题、强调色、宽高。
服务端：不需要。
数据来源：仅配置参数。
请完成实现与验证，并给出预览地址。
```

## 1. 目录与自动发现

```text
widgets/
  shared.css              插件共享卡片与主题样式
  shared.ts               escapeHtml 等小工具
  {id}/
    config.json            必需：元信息、fields、入口，可选 server / defaultSize
    index.ts               前端入口，导出 render
    style.css              由 JS 导入
    icon.svg               本地图标
    server.ts              可选：服务端路由
    components/            可选：自定义设置控件等
    assets/                可选：图片、字体、数据文件
```

`src/core/registry.ts`、开发清单中间件、构建脚本与 `server/plugin-loader.js` 都按同一规则扫描：**目录内存在 `config.json` 即视为插件**。新增目录后：

- 开发模式刷新工作台即可出现，无需重启 Vite；
- 新增服务端模块时，`tsx watch` 可能看不到新目录，需要重启 `npm run dev:api`；
- 生产必须重新构建并部署，`dist/widgets/manifest.json` 才会包含新插件。

## 2. 快速开始：纯前端插件

创建 `widgets/hello/`。

### 2.1 config.json

```json
{
  "schemaVersion": 1,
  "id": "hello",
  "name": "问候卡片",
  "icon": {
    "type": "image",
    "src": "./icon.svg",
    "alt": "问候卡片",
    "fallback": "H"
  },
  "summary": "自定义问候语",
  "description": "展示标题和问候语，支持主题、强调色和自适应尺寸。",
  "version": "0.1.0",
  "entry": {
    "js": "./index.ts",
    "css": ["./style.css"]
  },
  "defaultSize": { "width": 420, "height": 210 },
  "fields": [
    { "key": "title", "label": "标题", "type": "text", "default": "你好", "maxLength": 40 },
    { "key": "message", "label": "问候语", "type": "text", "default": "愿你今天有个好心情" },
    {
      "key": "width", "label": "组件宽度（px，留空自适应）", "type": "number",
      "default": "", "min": 280, "max": 1200, "step": 1
    },
    {
      "key": "height", "label": "组件高度（px，留空自适应）", "type": "number",
      "default": "", "min": 160, "max": 1000, "step": 1
    },
    {
      "key": "theme", "label": "组件主题", "type": "select", "default": "auto",
      "options": [
        { "value": "auto", "label": "跟随系统" },
        { "value": "light", "label": "浅色" },
        { "value": "dark", "label": "深色" }
      ],
      "control": { "type": "radio" }
    },
    { "key": "accent", "label": "强调色", "type": "color", "default": "#6c5ce7" }
  ]
}
```

### 2.2 前端入口

```ts
import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

interface HelloConfig {
  title: string;
  message: string;
  width: string;
  height: string;
  theme: string;
  accent: string;
}

export function render(root: HTMLElement, config: HelloConfig) {
  root.innerHTML = `
    <section class="embed-card hello-card" style="--accent:${config.accent}">
      <p class="embed-label">${escapeHtml(config.title)}</p>
      <h1 class="hello-message">${escapeHtml(config.message)}</h1>
    </section>
  `;

  const card = root.querySelector<HTMLElement>(".hello-card")!;
  let current = { ...config };

  return {
    update(next: HelloConfig) {
      if (next.accent !== current.accent) card.style.setProperty("--accent", next.accent);
      if (next.title !== current.title) {
        root.querySelector(".embed-label")!.textContent = next.title;
      }
      if (next.message !== current.message) {
        root.querySelector(".hello-message")!.textContent = next.message;
      }
      current = { ...next };
    },
    destroy() {
      root.replaceChildren();
    }
  };
}
```

`widgets/hello/style.css`：

```css
.hello-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hello-message {
  margin: 0;
  color: var(--accent);
  font-size: clamp(24px, 6vw, 40px);
  overflow-wrap: anywhere;
}
```

CSS 必须从 JS 导入；只在 `entry.css` 写路径不会让构建器打包样式。

### 2.3 运行

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:5173/?widget=hello
http://127.0.0.1:5173/widget/hello?message=欢迎&theme=dark
```

## 3. config.json 参考

### 3.1 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | number | 是 | 固定为 `1` |
| `id` | string | 是 | 必须与目录名一致 |
| `name` | string | 是 | 工作台显示名称 |
| `icon` | object | 是 | 图片图标对象 |
| `summary` | string | 是 | 列表中的短简介 |
| `description` | string | 是 | 配置区上方的功能说明 |
| `version` | string | 是 | 插件版本，建议语义化，不会自动递增 |
| `entry.js` | string | 是 | 前端入口，`./` 开头的 `.js/.ts/.tsx` |
| `entry.css` | string[] | 是 | `./` 开头的 CSS 路径；可写多份，但实际打包结果由 JS import 决定 |
| `server` | object | 否 | 服务端模块声明，见第 6 节 |
| `defaultSize` | object | 否 | 工作台首次预览视口，`width`/`height` 为正整数 |
| `fields` | array | 是 | 参数定义，顺序即表单顺序 |

路径规则：必须以 `./` 开头，不允许 `../`、绝对路径、空段、`.`、`..`、查询参数或空格。建议全部使用英文文件名。

发布配置会删除 `server` 字段；前端与嵌入页看不到服务端声明。

### 3.2 图标

```json
"icon": {
  "type": "image",
  "src": "./icon.svg",
  "alt": "日期时钟",
  "fallback": "◷"
}
```

- 本地图片相对 `config.json`，支持 png/jpg/jpeg/gif/webp/avif/svg/ico。构建时复制为 `assets/icon-[hash].扩展名` 并改写发布配置与清单。
- 远程图片只接受 `http(s)` URL，构建时不下载。
- 统一用 `<img>` 渲染，按 24×24 区域等比显示；`alt` 默认空，加载失败显示 `fallback`，未配置时显示 `◷`。
- 不再支持文本、Emoji 或内联 SVG 作为图标类型。

### 3.3 字段通用属性

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | `[a-zA-Z][a-zA-Z0-9_]*`，同一配置内唯一 |
| `label` | string | 是 | 表单名称 |
| `type` | string | 是 | `text` / `number` / `select` / `checkbox` / `color` / `datetime-local` |
| `default` | string | 是 | 一律字符串，包括数字与开关 |
| `description` | string | 否 | 字段说明 |
| `placeholder` | string | 否 | 占位文字 |
| `required` | boolean | 否 | 必填校验 |
| `control` | object | 否 | 编辑控件，见 3.5 |

各类型的额外属性：

| 类型 | 额外属性 | 规则 |
| --- | --- | --- |
| `text` | `minLength`、`maxLength`、`pattern`、`patternMessage` | 长度与正则只作用于 text；正则需完整匹配，不需要写 `^`/`$` |
| `number` | `min`、`max`、`step` | 数值型；`default` 为空字符串表示允许留空；默认值必须合法且符合步长 |
| `select` | `options` | `[{ value, label }]`，value 不重复，`default` 必须属于 options |
| `checkbox` | 无 | `default` 只能是 `"0"` 或 `"1"` |
| `color` | 无 | `default` 必须是 `#rrggbb` |
| `datetime-local` | `defaultValue` | 可选 `{ "kind": "relative-date", "days": 7 }`，仅按本地日历日偏移 |

`width` 与 `height` 是框架校验的硬性要求：两项都必须是 `number` 类型、带 `min`/`max`、默认值为空字符串，以保证嵌入页默认自适应。`theme` 与 `accent` 是推荐字段，不强制。

参数值协议：所有值都是字符串；checkbox 用 `"1"`/`"0"`。嵌入页先校验再加载插件资源，任何非法参数都显示错误页，不会截断、夹取或悄悄替换为默认值。默认值只用于缺失的 URL 参数。

### 3.4 动态默认日期

```json
{
  "key": "target",
  "label": "目标时间",
  "type": "datetime-local",
  "default": "",
  "defaultValue": { "kind": "relative-date", "days": 7 }
}
```

`defaultValue` 在配置加载时按浏览器当前时间计算；`days` 绝对值不超过 36500。工作台生成 URL 时总会写入该字段的当前值，避免复制后日期漂移。业务上不可为空时同时设置 `required: true`。

### 3.5 编辑控件 control

`type` 决定值语义，`control.type` 决定编辑形式。未指定时：select 用下拉框，checkbox 用开关，其余用输入框。

| control.type | 兼容字段类型 | 说明 |
| --- | --- | --- |
| `input` | text / number / color / datetime-local | 默认输入框 |
| `slider` | number | 需要有限且不相等的 `min`/`max`；可选 `showInput`、`unit` |
| `select` | select | 下拉框 |
| `radio` | select | 单选按钮组 |
| `switch` | checkbox | 开关 |
| `custom` | 任意字段类型 | 插件提供的 React 组件 |

滑块示例：

```json
{
  "key": "refresh", "label": "刷新间隔", "type": "number", "default": "30",
  "min": 5, "max": 300, "step": 5,
  "control": { "type": "slider", "showInput": true, "unit": "秒" }
}
```

`control` 是严格对象，只允许 `type`、`unit`、`showInput`、`entry`、`css`、`export`、`props`，不能把字段级约束重复放进来。

#### 自定义控件

自定义控件只在工作台使用，不会进入嵌入页。它必须是 **默认导出的 React 组件**：

```json
{
  "key": "title", "label": "标题", "type": "text", "default": "你好",
  "control": { "type": "custom", "entry": "./components/TitleInput.tsx", "css": ["./components/title.css"] }
}
```

```tsx
import type { ControlProps } from "../../../src/workbench/components/controls/types.js";

export default function TitleInput({ field, value, onChange }: ControlProps) {
  return (
    <input
      value={value}
      maxLength={"maxLength" in field ? field.maxLength : undefined}
      onChange={(event) => onChange(event.target.value)}
      aria-label={field.label}
    />
  );
}
```

- 入参：`field`、`value`、`onChange(nextValue: string)`，另有 `widgetBase`。
- `onChange` 接收原始字符串，校验由宿主统一执行；不要自己夹取或改写值。
- 可用 antd 组件与 React hooks，但不要在控件里保存全局状态。
- 构建时同一插件的自定义控件聚合为 `controls-[hash].js`，样式聚合为 `controls-[hash].css`；渲染入口不会包含这些代码。
- 加载失败或未导出默认组件时，工作台在该字段位置显示错误提示，不会回退到默认控件；此时刷新页面修复资源路径后重试。

## 4. 前端运行时协议

```ts
import type { WidgetRenderOptions } from "../../src/core/runtime/index.js";

export function render(
  root: HTMLElement,
  config: Record<string, string>,
  options: WidgetRenderOptions
) {
  // 在这里创建 DOM、发起请求、启动定时器
  return {
    update(nextConfig, updateOptions) { /* 原地更新 */ },
    destroy() { /* 清理 */ }
  };
}
```

- `root` 是插件容器（当前为 `#app`），只操作其中的节点。
- `config` 是校验后的字符串对象，按业务转换：`Number(config.refresh)`、`config.seconds === "1"`。
- `options.signal` 表示实例存活期；请求、监听器与定时器都应绑定它。
- `options.authToken` 是嵌入令牌，来自 `#t=`；没有令牌时为 `undefined`。
- 返回值可以是 `void`、清理函数，或 `{ update?, destroy? }`。

### 更新与销毁

- 返回对象带 `update` 时，参数变化会原地更新，不重建 DOM、不重新拉数据。
- 没有 `update` 时，宿主销毁旧实例并重新 `render`。
- `update` 应只改受影响的部分，并跳过与上一次相同的值。
- `destroy` 必须清理未绑定 `signal` 的定时器、订阅与事件。
- 异步请求应使用“代次守卫”或检查 `signal.aborted`，丢弃过期响应。

### 主题与尺寸

宿主在 `documentElement` 上设置：

```text
data-theme = auto | light | dark
--widget-width  = 固定宽度或 auto
--widget-height = 固定高度或 auto
body.auto-height 存在表示未设置固定高度
```

插件无需处理这三个参数本身。导入 `../shared.css` 可使用 `.embed-card`、`.embed-label` 等共享样式；`auto` 主题由 CSS 根据系统偏好解析。`width`/`height` 只控制外层容器，插件内部应使用相对单位与 `clamp()` 适配。

### 异步与错误

```ts
export async function render(root, config, { signal }) {
  root.textContent = "加载中…";
  try {
    const response = await fetch("/api/example", { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (signal.aborted) return;
    root.textContent = data.text;
  } catch (error) {
    if (signal.aborted) return;
    root.textContent = "暂时无法获取数据";
  }
}
```

- `render` 抛错时宿主显示“组件加载失败”。
- render 之后由定时器或独立请求产生的错误，插件要自行捕获并展示。
- 不要把 DOM 操作、定时器或请求放在模块顶层：构建校验会在 Node 中导入产物，顶层访问浏览器对象会导致失败。
- 拼接 HTML 时对用户输入使用 `escapeHtml`；能用 `textContent` 就不拼 HTML。

## 5. 静态资源

```ts
import backgroundUrl from "./assets/background.png";
import audioUrl from "./assets/notice.mp3";
import data from "./assets/data.json";
import dataUrl from "./assets/data.json?url";
```

- JS 或 CSS 静态引用的资源会参与构建，输出到插件的 `assets/`，文件名带哈希；小文件可能内联。
- 没有被引用的文件不会因为放在 `assets/` 就自动复制。
- 不要硬编码 `/widgets/{id}/assets/background.png`，使用 import 得到的 URL 或 CSS 相对引用。
- 本地图标由 `icon.src` 单独发布，不必在 JS 中 import。
- 服务端模块禁止 import CSS 或产生非 JS 资源。

## 6. 服务端模块

插件可以声明自己的 API 路由。前端与服务端产物完全独立：前端构建只看 `entry`，服务端构建只看 `server.entry`，两者互不 import。

### 6.1 config.json 声明

```json
{
  "server": {
    "entry": "./server.ts",
    "expose": ["GET /api/secret_demo/secret"],
    "auth": "token",
    "credentials": [
      {
        "ref": "secretDemo.default",
        "label": "演示密钥",
        "description": "在设置 → 第三方密钥中填入任意字符串。",
        "placeholder": "例如 demo-3f9a2c",
        "required": true
      }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `entry` | `./` 开头的 `.js/.ts` 服务端入口 |
| `expose` | 接口白名单，至少一条；只有这里的 key 会被挂载 |
| `auth` | `"none"` 或 `"token"`；缺省按 `"none"` |
| `credentials` | 可读取的第三方密钥；字符串或对象数组 |

`credentials` 条目：`ref` 必须是 `provider.slot` 形式，`label` 必填，`description`/`placeholder` 可选，`required` 缺省为 `true`。声明了凭据的插件必须同时设置 `auth: "token"`。

### 6.2 路由模块

```ts
import type { WidgetRouteHandler } from "../../src/core/server/plugin-server.js";

const handlers: Record<string, WidgetRouteHandler> = {
  "GET /api/secret_demo/secret": (_request, response, ctx) => {
    response.set("Cache-Control", "no-store");
    try {
      const value = ctx.credential("secretDemo.default");
      return response.json({ configured: true, value, length: Array.from(value).length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("未配置凭据")) {
        return response.json({ configured: false });
      }
      return response.status(403).json({ error: message });
    }
  }
};

export const routes = handlers;
```

- 必须导出 `routes` 对象，key 与 `expose` 完全一致，值为处理函数。
- 处理函数签名：`(request, response, ctx)`，可返回 Promise。
- `response` 提供 `status(code)`、`json(body)`、`set(field, value)`，与 Express 结构兼容。
- `request` 提供 `method`、`path`、`query`、`params`、`headers`。
- `ctx.credential(ref)` 只允许读取已声明的凭据；未声明会直接抛错，不会返回空值。

### 6.3 路由规则

- key 形如 `GET /api/xxx`，方法支持 GET/POST/PUT/PATCH/DELETE。
- 路径只允许静态段，不能带参数、通配、查询、结尾斜杠或 `..`。
- key 在所有插件间必须唯一。
- 保留路由：`GET /api/health`；保留前缀：`/api/auth/`、`/api/admin/`。
- 未在 `expose` 中声明的 handler 会被忽略；声明与实现不一致会导致整个插件加载失败。
- 路由精确匹配，`/api/weather` 不会误匹配 `/api/weatherXYZ`。

### 6.4 鉴权

`auth: "none"`：接口公开。

`auth: "token"`：

- 带 `Authorization: Bearer <token>` 时只认令牌。无效、已注销、IP 被禁用或未授权所需凭据会返回 401/403。
- 不带 Bearer 时接受管理员会话 Cookie，用于工作台同源预览。
- 嵌入页必须使用带 `#t=` 的地址；插件从 `options.authToken` 取令牌并自行加请求头。

```ts
const headers = options.authToken
  ? { Authorization: `Bearer ${options.authToken}` }
  : {};
await fetch("/api/secret_demo/secret", { headers, cache: "no-store" });
```

令牌通过「工作台 → 签发令牌」生成，绑定当前插件、当前参数与勾选的密钥。明文只显示一次。令牌调用会写入调用记录；工作台会话预览不计数。

### 6.5 第三方密钥

- 在「设置 → 第三方密钥」中按 `provider.slot` 配置，服务端加密存储。
- 建议 `ref` 的 provider 使用插件 ID 的驼峰形式（如 `weatherApi`），slot 使用 `default` 或业务名。
- 读取时优先匹配 `provider.<widgetId>`，没有则使用声明的 slot。同一 provider 可被多个插件共享。
- 未配置是正常业务状态：接口可返回 `200 + { configured: false }`，让组件展示配置引导。
- 明文不要写日志、不要放缓存；接口加 `Cache-Control: no-store`。
- 令牌只能读取签发时勾选的凭据；未勾选会返回“未授权该凭据”。

### 6.6 编译与运行

- 开发模式由 `npm run dev:api` 通过 `tsx` 直接加载 `server.entry`，修改后自动重启。
- 生产由 `npm run build` 单独 SSR 编译为 `dist/widgets/{id}/server.js`，API 启动时加载。
- 只允许 import Node 内置模块或根 `package.json` 的 `dependencies`；其他依赖会在构建时报错。
- 服务端模块不能 import CSS 或产出图片等非 JS 资源。
- 修改服务端代码后必须重新构建并重启 API；`server.js` 与 `server-chunks/` 由 Nginx 返回 404，不会公开下载。

## 7. 构建、预览与校验

```bash
npm run check     # 类型检查 + 单元测试 + 全量构建 + 产物校验
npm run build     # 只构建
npm run preview   # 预览 dist，另开终端运行 npm run dev:api
```

`npm run check` 会验证：

- 目录名与 `config.id` 一致，必填元信息完整。
- `width` / `height` 为 number、有 min/max、默认值为空。
- 每个插件导出 `render`，并生成至少一个独立 CSS 产物。
- 清单、发布配置、入口、图标与静态资源一致。
- 服务端入口存在、导出 `routes`、覆盖所有 `expose`，路由不冲突且不占用保留前缀。

预览地址：

```text
http://127.0.0.1:5173/?widget={id}
http://127.0.0.1:5173/widget/{id}?参数=值
```

发布只修改源码并由构建生成产物，不要手改 `dist/`。

## 8. 常见问题

| 现象 | 检查 |
| --- | --- |
| 工作台列表没有新插件 | 目录内是否有 `config.json`；id 是否与目录名一致；是否需要重启 API |
| 配置加载失败 | JSON 语法、`schemaVersion`、必填字段、路径是否以 `./` 开头 |
| 修改配置后页面没变 | 页面缓存了清单/配置，刷新；生产需重新构建部署 |
| 样式没生效 | JS 是否 import 了 CSS |
| 图片或字体 404 | 是否通过 import / CSS `url()` 引用；不要硬编码哈希文件名 |
| 构建报 `document is not defined` | 把顶层 DOM 操作移进 `render` |
| 参数类型异常 | 所有 config 值都是字符串，先 `Number()` 或比较 `"1"` |
| 参数错误页 | 按页面提示修正 URL；未知参数与重复参数都会报错 |
| 嵌入页显示缺少令牌 | 插件是否 `auth: "token"`；是否复制了带 `#t=` 的完整链接 |
| 接口 401 | 无 Bearer 且无管理员会话；检查嵌入令牌 |
| 接口 403 | IP 被禁用、令牌未授权该凭据，或账号尚未完成首次改密 |
| 服务端改动没生效 | 生产需重新构建并重启 API；开发确认 `tsx` 是否监听到目录 |
| 服务端模块加载失败 | `expose` 与 `routes` 是否一致；是否 import 了未声明依赖 |

## 9. 完成检查

1. 目录名、`config.id` 一致，`summary`、`description`、`version`、图标完整。
2. `fields` 类型与默认值合法，保留自适应 `width`/`height`，推荐保留 `theme`/`accent`。
3. `render` 只在 `root` 内操作；参数按字符串转换；异步失败有可见反馈。
4. 返回值实现 `update` / `destroy`，定时器、请求与监听器随 `signal` 清理。
5. CSS 从 JS 导入；静态资源通过 import 或 CSS 相对路径引用。
6. 工作台表单、URL、iframe 预览、浅色/深色、宽高与参数热更新均正常。
7. 服务端接口若存在：`expose` 完整、`auth` 正确、凭据只在声明后读取、令牌路径验证通过。
8. `npm run check` 通过，并用 `npm run preview` 验证生产产物。
