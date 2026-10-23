import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountPanel } from "../src/workbench/components/AccountPanel.js";
import { SettingsPage } from "../src/workbench/components/SettingsPage.js";

// 工作台组件测试：用 renderToStaticMarkup 做零额外依赖的渲染断言，
// 覆盖「页面结构/文案/默认值」这类最容易在重构中被改坏的契约。
// 交互行为由 tests/http.test.ts 在服务端侧覆盖，这里不重复造 DOM 环境。
describe("工作台渲染", () => {
  it("账户面板渲染账号名与密码表单，账号名预填当前账号", () => {
    const html = renderToStaticMarkup(
      <AccountPanel username="admin" onUsernameChange={() => {}} />,
    );
    assert.match(html, /账号名/);
    assert.match(html, /value="admin"/);
    assert.match(html, /保存账号名/);
    assert.match(html, /修改密码/);
    assert.match(html, /保存新密码/);
  });

  it("设置页默认展示账户选项卡，四个入口都在", () => {
    const html = renderToStaticMarkup(
      <SettingsPage username="admin" onUsernameChange={() => {}} onBack={() => {}} />,
    );
    assert.match(html, /返回工作台/);
    for (const label of ["账户", "访问令牌", "第三方密钥", "调用记录"]) {
      assert.match(html, new RegExp(label));
    }
  });
});
