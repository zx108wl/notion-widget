// 注册受信任的插件 ID；名称、图标和参数统一维护在各插件 config.json 中。
export const widgets = Object.fromEntries(["clock", "countdown", "status"].map(id => [id, { id }]));
