# HeaderLite

修改 HTTP/WebSocket 请求头、响应头与重定向 URL 的 Chrome MV3 扩展（开发者调试工具），多 Profile 管理，导入导出。请求头/响应头规则同样作用于 `ws://` / `wss://` 的 WebSocket 握手请求（URL 过滤填 `|ws://host` 可仅限 WS）。规则行可拖拽排序（行序即优先级，后行覆盖前行），`Alt+Shift+M` 快捷键切换总开关（可在 chrome://extensions/shortcuts 改键）。

## 开发

```bash
npm install
npm run dev      # Vite dev（开发调试）
npm run build    # 产物输出到 dist/
npm run typecheck
npm test         # 单元测试（ruleBuilder + storage + useAppState + 表格排序，74 用例）
npm run e2e      # 自动化端到端：加载 dist 到 Chromium，验证改头/响应头/重定向/WebSocket 握手头/UI 改值/拖拽排序
```

## 加载到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`，开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `dist/` 目录

## 手动验证清单

1. 加请求头 `X-Foo: bar` → 访问 `https://httpbin.org/headers`，响应 JSON 里应出现 `X-Foo`
2. 加响应头 → DevTools → Network 对应请求的 Response Headers 出现该头
3. 重定向（urlFilter 或 regex）→ 访问源 URL 跳到目标
4. 切换 Profile → DNR 规则随之切换（可在 `chrome://extensions` → 扩展详情 → 或 Network 观察）
5. 导出 JSON → 导入 JSON → 内容一致
6. 总开关 off → 所有规则立即失效
7. WebSocket：加请求头后，页面建立 `ws://` / `wss://` 连接 → DevTools → Network → WS 请求的 Request Headers 出现该头（URL 过滤填 `|ws://host` 或 `|wss://host` 可仅限 WS）
8. 拖拽排序：同 header 两行不同值 → 拖动行序 → 生效值为最后一行的值
9. 快捷键：`Alt+Shift+M` → 总开关切换（chrome://extensions/shortcuts 可改键）

## 架构

- `src/model/types.ts` 共享类型契约
- `src/dnr/ruleBuilder.ts` 纯函数：Profile → DNR Rule
- `src/popup/` `src/options/` React UI
- 数据流：UI → storage.local → onChanged → background 重建 DNR → 生效
- 规则按行序应用：DNR priority 随行递增，后行覆盖前行（同 header 多行时以最后一行为准）
- 单测覆盖 ruleBuilder/storage/useAppState/ProfileSelector（77 用例）；Profile 命名走内联输入（window.prompt 会致 popup 失焦关闭）

