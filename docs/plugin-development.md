# 插件开发文档

本文对应当前 Notion Widget 框架。插件包含配置 JSON、JavaScript 渲染入口、CSS 和可选静态资源。工作台根据 JSON 生成配置表单，生成 `/widget/{id}?参数=值` 嵌入地址，组件在 iframe 中运行。

## AI 开发执行约定

本文是插件开发任务的独立输入。AI 在获得具体插件需求和本项目代码后，可按本文完成实现，无需先阅读项目框架文档。文中的路径和命令均相对于项目根目录。

### 开始前确认

从用户需求中确定插件 ID、名称、功能、交互、可配置项和数据来源。检查目标插件是否已存在；修改现有插件时保留 ID 和已有参数兼容性。缺失的非关键细节可采用合理默认值并在交付时说明；涉及外部 API、凭据或无法推断的核心行为时，先确认依赖，不虚构接口。

### 修改范围

- 通常只新增或修改 `widgets/{id}/`，以及 `src/widgets-registry.js` 的插件 ID 注册。
- 配置参数必须定义在 `config.json` 中，由工作台动态生成表单；不在工作台代码里硬编码插件专用字段。
- 复用现有公共工具和样式。只有具体需求涉及框架能力或后端接口时，才调整共享文件、加载器、构建脚本或服务端。
- 不创建独立插件工程，不更换技术栈；当前插件运行在现有项目内。
- 不手改 `dist/`、清单产物或带哈希文件名；通过构建生成。

### 必须完成的步骤

1. 读取目标插件（如存在）、`src/widgets-registry.js` 和 `src/widget-config.js`，确认当前协议与本文一致；如代码已变更，指出差异并以当前代码为准。
2. 在 `widgets/{id}/` 实现完整配置、JS、CSS 和需要的静态资源。
3. 注册新 ID，保留其他插件；确保所有用户可调参数都进入配置定义。
4. 处理自适应尺寸、主题、输入异常和异步失败；不要仅交付占位内容或未实现的 TODO。
5. 运行 `npm run check`，检查工作台表单、生成 URL 和嵌入页。涉及 API 时验证成功与失败状态。
6. 交付修改文件、可访问的预览地址、支持参数、验证结果及未解决依赖。未执行的验证应明确标注，不宣称通过。

### 任务输入示例

```text
请读取 docs/plugin-development.md，按其中协议在当前项目开发插件。
插件 ID：daily-note
名称：每日一句
功能：显示标题和一段自定义文字。
可配置项：标题、正文、主题、强调色、宽度和高度。
静态资源：无。
数据来源：配置参数，不调用外部 API。
请完成实现、注册和验证，并给出预览地址。
```

## 1. 插件目录与宿主约定

```text
widgets/
  shared.js               escapeHtml 工具
  shared.css              通用卡片和主题样式
  {id}/
    config.json           插件描述、资源入口和参数定义
    index.js              导出 render(root, config)
    style.css             从 JS 导入
    assets/               可选静态资源
src/
  widgets-registry.js     新增插件只需登记 ID
  widget-config.js        配置协议校验，可读取核对
```

宿主根据 JSON 生成配置表单，将 URL 参数解析为字符串对象后调用 `render(root, config)`。插件必须登记 ID；当前不会自动扫描目录，也不提供上传 ZIP 即安装的能力。

## 2. 快速创建一个插件

以下示例创建 `hello` 插件，可复制后运行。

### 2.1 创建目录和配置

创建 `widgets/hello/config.json`：

```json
{
  "schemaVersion": 1,
  "id": "hello",
  "name": "问候卡片",
  "icon": "👋",
  "summary": "自定义问候语",
  "description": "展示标题和问候语，支持主题、强调色和自适应尺寸。",
  "version": "0.1.0",
  "entry": {
    "js": "./index.js",
    "css": ["./style.css"]
  },
  "fields": [
    { "key": "title", "label": "标题", "type": "text", "default": "你好", "placeholder": "填写标题" },
    { "key": "message", "label": "问候语", "type": "text", "default": "愿你今天有个好心情" },
    { "key": "width", "label": "宽度（px，留空自适应）", "type": "number", "default": "", "min": 280, "max": 1200, "step": 1 },
    { "key": "height", "label": "高度（px，留空自适应）", "type": "number", "default": "", "min": 160, "max": 1000, "step": 1 },
    {
      "key": "theme", "label": "主题", "type": "select", "default": "auto",
      "options": [
        { "value": "auto", "label": "跟随系统" },
        { "value": "light", "label": "浅色" },
        { "value": "dark", "label": "深色" }
      ]
    },
    { "key": "accent", "label": "强调色", "type": "color", "default": "#6c5ce7" }
  ]
}
```

### 2.2 编写渲染入口

创建 `widgets/hello/index.js`：

```js
import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

export function render(root, config) {
  root.innerHTML = `
    <section class="embed-card hello-card">
      <p class="embed-label">${escapeHtml(config.title)}</p>
      <h1 class="hello-message">${escapeHtml(config.message)}</h1>
    </section>
  `;
  root.querySelector(".hello-card").style.setProperty("--accent", config.accent);
}
```

创建 `widgets/hello/style.css`：

```css
.hello-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hello-card .hello-message {
  margin: 0;
  color: var(--accent);
  font-size: clamp(24px, 6vw, 40px);
  overflow-wrap: anywhere;
}
```

必须在 JS 中导入样式。只把文件路径写入 `entry.css` 不会让构建器打包 CSS。

### 2.3 注册插件

在 `src/widgets-registry.js` 的 ID 数组末尾添加 `hello`：

```js
export const widgets = Object.fromEntries(
  ["clock", "countdown", "status", "hello"].map(id => [id, { id }]),
);
```

目录名、注册 ID 和配置的 `id` 必须一致。建议使用小写字母、数字、连字符，例如 `hello`、`daily-note`。名称、版本等元信息只维护在配置 JSON 中。

### 2.4 启动与检查

需要 Node.js 22 或更高版本。首次使用时，在项目根目录运行：

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

已有 `.env` 时跳过复制命令，以保留本地配置。

打开 `http://127.0.0.1:5173/?widget=hello`，调整参数并检查 iframe 预览。也可直接访问：

```text
http://127.0.0.1:5173/widget/hello?title=欢迎&theme=dark
```

开发模式的清单由 Vite 动态生成。添加插件 ID 后若列表未更新，重启 `npm run dev`。

## 3. config.json 顶层字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 必须为 `1`，表示配置协议版本 |
| `id` | string | 与注册 ID、目录名一致 |
| `name` | string | 工作台显示名称，不能为空 |
| `icon` | string / object | 文本、Emoji、文本对象或图片对象，见图标配置 |
| `summary` | string | 插件列表中的短简介，不能为空 |
| `description` | string | 配置面板中的功能说明，不能为空 |
| `version` | string | 插件版本，建议使用 `0.1.0`；不会自动递增 |
| `entry.js` | string | 相对于配置文件的 JS 入口，必须以 `./` 开头并以 `.js` 结尾 |
| `entry.css` | string[] | CSS 相对路径数组；实际发布路径由构建结果生成 |
| `fields` | array | 按显示顺序排列的参数定义 |

入口路径不接受绝对地址、`../`、查询参数或路径中的空格，建议使用英文文件名。`entry.css` 必须是数组；当前 `npm run check` 要求插件实际生成至少一个独立 CSS 文件。

配置文件是公开资源，不应包含服务端 Token、密码或私钥。

### 图标配置

兼容已有文本或 Emoji 字符串，也支持显式文本对象：

```json
"icon": "👋"
```

```json
"icon": { "type": "text", "value": "◷" }
```

本地 PNG、JPG/JPEG、GIF、WebP、AVIF、SVG 或 ICO：

```json
"icon": { "type": "image", "src": "./assets/icon.svg", "alt": "日期时钟", "fallback": "◷" }
```

远程图片只接受 HTTP(S) 完整 URL：

```json
"icon": { "type": "image", "src": "https://example.com/icon.png", "fallback": "👋" }
```

上面的片段是 `config.json` 内的属性，不是独立 JSON 文档。图片对象的 `alt` 和 `fallback` 是可选字符串；alt 默认空字符串，图片失败时显示 fallback，未配置或为空时显示 ◷。文本对象的 value 必须为非空字符串。图标库名称和内联 SVG/HTML 不在当前协议内。

本地 src 相对于 config.json，须以 ./ 开头，不允许 ../、绝对路径、空格或查询参数。文件必须存在。构建器自动将图标发布为 `assets/icon-[hash].扩展名`，并更新发布配置与清单；该图标无需代码引用，也不会内联。远程图片由浏览器加载，构建时不下载、不复制；HTTPS 页面建议使用 HTTPS 图片地址。

开发清单与生产清单均将本地 src 解析为站点根路径，单份发布配置仍保留相对路径。外部工作台应按配置 URL 解析本地图标路径。图片按 24×24 区域等比显示；SVG 通过 img 加载，不将内容插入 DOM。

## 4. 参数字段规范

### 4.1 通用属性

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | 唯一参数名，格式为 `[a-zA-Z][a-zA-Z0-9_]*` |
| `label` | string | 是 | 表单显示名称 |
| `type` | string | 是 | 下表中的六种类型之一 |
| `default` | string | 是 | 默认值；数字和开关也使用字符串 |
| `options` | array | select 必填 | `{ "value": "值", "label": "名称" }` 数组 |
| `min` / `max` | number | 否 | 数值上下限，不能写成字符串 |
| `step` | number | 否 | 大于零的输入步长 |
| `required` | boolean | 否 | 设置原生控件的必填属性 |
| `placeholder` | string | 否 | 输入框占位文字 |
| `description` | string | 否 | 显示为控件的 `title` 提示 |
| `defaultValue` | object | 否 | 日期字段的动态默认值，见下文 |

同一配置中 `key` 不能重复。字段顺序就是工作台表单顺序。未定义在 `fields` 中的 URL 参数不会传入 `render`。

当前 `required`、`step` 属于控件约束；工作台在输入事件中更新预览，没有提交前校验流程，URL 解析也不会按 `step` 对齐。插件如有更严格的业务要求，应在渲染时校验。

### 4.2 支持的类型与 URL 解析行为

| 类型 | 默认值示例 | 工作台控件 | 嵌入页处理 |
| --- | --- | --- | --- |
| `text` | `"你好"` | 单行文本框 | URL 值最多保留 120 个字符 |
| `number` | `"30"` 或 `""` | 数字输入框 | 非有限数值回退默认值；按 min/max 限制范围；结果仍是字符串 |
| `select` | `"auto"` | 单选下拉框 | 值不在 options 中则回退默认值 |
| `checkbox` | `"1"` / `"0"` | 开关 | URL 中只有 `1` 表示开启，其余值表示关闭 |
| `color` | `"#6c5ce7"` | 颜色选择器 | 仅接受六位十六进制颜色，不合法时回退默认值 |
| `datetime-local` | `"2026-10-17T12:30"` | 本地日期时间输入框 | 当前仅截断长度，不校验日期合法性；插件需自行处理 |

`select` 的选项值和名称必须是字符串，选项值不能重复，默认值必须匹配其中一个选项。`checkbox` 不使用布尔值作为默认值。

### 4.3 公共参数

推荐所有插件保留以下字段，直接复制已有插件配置即可：

| key | 作用 | 推荐默认值 |
| --- | --- | --- |
| `width` | 固定宽度，像素 | `""`，min 280 / max 1200 |
| `height` | 固定高度，像素 | `""`，min 160 / max 1000 |
| `theme` | auto / light / dark | `"auto"` |
| `accent` | 强调色 | `"#6c5ce7"` |

`npm run check` 要求 `width`、`height` 为 number，有 min/max，默认值为空字符串。默认空宽高表示适配 iframe 可视区域；拖动工作台预览框只改变预览区域，不会改写插件尺寸。

加载器设置根元素的 `data-theme` 和 `--widget-width` / `--widget-height`。导入 `shared.css` 后，`.embed-card` 支持浅色、深色和跟随系统主题；强调色需要插件自己设置 `--accent`。

### 4.4 动态默认日期

```json
{
  "key": "target",
  "label": "目标时间",
  "type": "datetime-local",
  "default": "",
  "defaultValue": { "kind": "relative-date", "days": 7 }
}
```

当前只支持 `relative-date`，仅用于 `datetime-local`。`days` 为有限数值，绝对值不超过 36500，建议使用整数。默认日期按浏览器本地时间加日历天数，秒和毫秒归零；不会执行 JSON 中的函数或脚本。

动态默认值在页面加载配置时计算，页面内缓存。等于默认值的参数不会写入生成的 URL，因此未显式指定目标日期的倒计时，在重新打开页面时会再次以当时日期计算。需要固定日期时，应选定与默认值不同的日期，或明确在 URL 中传入 `target`。

## 5. JavaScript 接口与生命周期

```js
export function render(root, config) {
  // root：插件专属挂载元素，当前是 #app。
  // config：根据 fields 和 URL 解析后的参数对象。
}
```

参数值均为字符串，按业务需要转换：

```js
const intervalMs = Number(config.refresh) * 1000;
const showSeconds = config.seconds === "1";
const target = new Date(config.target);
if (!Number.isFinite(target.getTime())) {
  root.textContent = "请选择有效的目标时间";
  return;
}
```

模块只导出 `render` 即可，不需要导出 `fields`。避免在模块顶层访问 `document`、创建定时器或发起请求：构建检查会在 Node.js 中导入产物，顶层依赖浏览器对象会导致验证失败。DOM 操作放入 `render`，查询尽量限定在 `root` 内。

当前加载器直接调用 `render`，不等待它返回的 Promise，也不处理返回的销毁函数。异步操作需要自行捕获错误；没有 `mount/update/unmount` 钩子。工作台修改参数会重新加载预览 iframe，而不是向同一个实例发送更新。

使用用户输入时，优先赋给 `textContent`；拼接 HTML 时使用 `escapeHtml`。定时器和监听器可在 `pagehide` 中清理：

```js
const timer = setInterval(update, 1000);
window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
```

## 6. 静态资源

插件可以包含图片、SVG、字体、音频及数据文件。推荐目录：

```text
widgets/hello/
  config.json
  index.js
  style.css
  assets/
    background.png
    font.woff2
    notice.mp3
    data.json
```

JS 中静态导入图片或音频会得到构建后的 URL：

```js
import backgroundUrl from "./assets/background.png";
import audioUrl from "./assets/notice.mp3";
import data from "./assets/data.json";

// 在 render 内使用：
const image = document.createElement("img");
image.src = backgroundUrl;
image.alt = "背景图";
root.append(image);
```

JSON 普通导入是数据对象；希望获得可 fetch 的资源 URL，可使用：

```js
import dataUrl from "./assets/data.json?url";
// 在 render 内：const response = await fetch(dataUrl);
```

CSS 中引用：

```css
.hello-card {
  background-image: url("./assets/background.png");
}

@font-face {
  font-family: "HelloFont";
  src: url("./assets/font.woff2") format("woff2");
}
```

构建规则：

- 被 JS 或 CSS 静态引用的资源会参与构建，通常输出到插件的 `assets/`，文件名带哈希；小资源可能内联为 data URL。
- 未被引用的文件不会因为放入 `assets/` 就自动复制到 dist。当前没有整目录复制、保留原文件名的配置能力。
- 不要硬编码 `/widgets/hello/assets/background.png`，发布后的文件名可能带哈希；使用 import 得到的 URL 或 CSS 相对引用。
- 动态拼接的资源路径不会自动遍历目录。资源列表可用明确的静态导入建立映射。
- `entry.css` 只描述样式入口，不是静态文件列表；当前没有 `entry.assets` 或 `staticDir` 字段。
- 本地图标可以仅通过顶层 `icon` 引用，不必在 JS 中 import；构建器会单独发布图标。

## 7. API 请求

插件通过同源 `/api/*` 调用项目后端。开发模式由 Vite 代理到 `http://127.0.0.1:3000`，生产环境由 Nginx 转发。

```js
// 在 render 内调用，插件需自行呈现加载和失败状态。
async function loadStatus() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    root.textContent = JSON.stringify(data);
  } catch {
    root.textContent = "暂时无法获取数据";
  }
}
loadStatus();
```

新增后端能力需要在 `server/index.js` 中实现相应接口。JSON 配置不会自动创建 API。服务密钥由服务端 `.env` 读取，不放到插件配置或前端 `VITE_*` 环境变量中。

## 8. 构建产物与发布

```powershell
npm run check
```

该命令先验证图标协议、资源发布和渲染回退，再检查后端语法，构建工作台与每个插件，并验证配置、元信息、资源路径、JS 的 `render` 导出、尺寸字段及 CSS 产物。

只构建可执行 `npm run build`，本地检查发布产物可执行 `npm run preview`，访问 `http://127.0.0.1:4173`。涉及 API 的插件还需要运行后端，例如在另一个终端执行 `npm run dev:api`。

```text
dist/
  index.html
  assets/                         工作台资源
  widgets/
    manifest.json                 插件目录清单
    hello/
      config.json                 发布配置
      index-[hash].js
      style-[hash].css
      chunks/                     按需生成的 JS 分块
      assets/                     未内联的静态资源
```

源码配置的入口指向 `./index.js`、`./style.css`。构建会把发布配置的 `entry.js/css` 自动替换为实际带哈希的相对路径，并生成清单中的绝对 URL。不要手动编辑 dist 文件；下次构建会重建输出。

交付插件源码、注册改动和验证结果。项目部署及工作台接入由项目框架文档维护，不需要为每个插件重复实现。

## 9. 常见问题

| 现象 | 检查位置 |
| --- | --- |
| 插件没有出现在列表 | ID 是否注册、配置 id 是否一致，开发服务是否已重启 |
| 配置加载失败 | JSON 语法、schemaVersion、必填元信息、字段默认值、入口路径 |
| 选项修改后仍未更新 | 页面内缓存了清单和配置，刷新页面；生产环境重新构建并部署 |
| 有配置但样式未打包 | JS 是否 import 了 CSS；entry.css 本身不会引入样式 |
| 图片、字体返回 404 | 是否通过 import / CSS url 引用，是否硬编码了未带哈希文件名 |
| 定时器或请求出错却没有显示加载错误 | 异步回调需插件自行捕获；加载器只处理加载阶段和同步渲染错误 |
| 数字字段在插件中计算异常 | config 值是字符串，应先 Number 转换 |
| 倒计时目标时间无效 | datetime-local 的 URL 值需要插件自行校验 |
| Node 构建检查提示 document 未定义 | 把顶层 DOM 操作移到 render 内 |
| API 请求失败 | 后端是否启动，路径是否为 /api，服务端环境变量是否正确 |

## 10. 开发完成检查

1. 目录名、注册 ID 和 config.id 一致，元信息完整。
2. 六种字段类型和默认值符合规范，保留自适应宽高。
3. render 在 root 内渲染，正确处理字符串参数和异步失败。
4. CSS 从 JS 导入，静态资源通过可构建的引用加载。
5. 工作台选项、生成 URL、iframe 预览、深浅主题和不同尺寸表现正常。
6. `npm run check` 通过，再用发布产物预览验证。
