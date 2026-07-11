# HeaderLite — Chrome Web Store 上架材料

> 生成日期：2026-09-12 · 版本 0.2.0 · 提交包：`submission/headerlite-0.2.0.zip`

## 1. 基本信息

| 字段 | 值 |
|---|---|
| 名称（中文） | HeaderLite — 请求头修改工具 |
| 名称（英文） | HeaderLite — Modify HTTP Headers |
| 类别 | 开发者工具（Developer Tools） |
| 语言 | 中文（简体） |
| 一句话简介（≤132 字符） | 修改 HTTP/WebSocket 请求头、响应头与重定向 URL：多配置管理、拖拽定优先级、快捷键开关，全部本地存储。 |

## 2. 详细描述（可直接粘贴）

### 中文

```
HeaderLite 是一个轻量的请求头修改工具，面向前后端联调、接口调试与测试场景。

核心功能
• 修改请求头（set / add / remove），覆盖 http/https 与 ws/wss WebSocket 握手
• 修改响应头
• URL 重定向：支持通配匹配与正则（捕获组 $1 反向引用）
• 每条规则可单独启用、可设 URL 过滤（留空匹配全部）
• 行序即优先级：同一 header 多条规则时后行覆盖前行，拖拽手柄即可调整
• 多配置（Profile）管理：切换 / 重命名 / 删除，右键菜单快速切换
• Alt+Shift+M 全局快捷键切换总开关（可在 chrome://extensions/shortcuts 改键）
• 配置导入导出 JSON，多窗口自动同步

隐私
所有规则与配置仅保存在浏览器本地（chrome.storage.local），不联网、不上报、
不收集任何数据。扩展内容完全静态，无任何远程代码。

English: HeaderLite modifies HTTP/WebSocket request & response headers and
redirect URLs for debugging. Rules are stored locally only; no analytics,
no network calls, no remote code. Alt+Shift+M toggles all rules. Row order
defines precedence — drag to reorder. Multiple profiles with import/export.
```

## 3. 权限说明（提审表单"justification"栏）

```
declarativeNetRequest + host_permissions(<all_urls>)：
本扩展的唯一功能是按用户显式配置的规则修改请求/响应头与重定向 URL。
header 修改必须针对目标站点逐条生效，无法预知用户要调试哪个站点，
因此需要宽宿主权限。扩展不含任何自动触发的行为——所有规则由用户在
界面中手动创建并启用，关闭总开关后立即全部失效。

declarativeNetRequestFeedback 未申请。
storage：保存用户规则配置（纯本地）。
contextMenus：右键菜单快速切换配置与总开关。
```

## 4. 隐私实践（Privacy 页签）

- 收集用户数据：**否**（"I do not collect or use user data" — 单选选此项）
- 说明：无 analytics、无遥测、无账号体系；header 值（可能含 token）仅存 chrome.storage.local，永不上传。

## 5. 审核应对

- `占位数据截图均为假值`（dev-token-123 等），无真实凭据
- 可能被要求功能演示视频：建议录 30–60s——打开 popup → 添加 X-Demo 头 → 刷新 httpbin.org/headers 看到注入 → 拖拽改行序 → Alt+Shift+M 关闭后头消失
- 人工审核周期通常数天到数周（宽宿主权限类）

## 6. 待办清单（人工步骤）

- [ ] 注册开发者账号（$5 一次性）：https://chrome.google.com/webstore/devconsole
- [ ] 新建 item → 上传 `submission/headerlite-0.2.0.zip`
- [ ] 商店素材：上传 `docs/store-assets/screenshot-{1,2,3}.png`（1280×800）
- [ ] 粘贴第 2/3/4 节文案，类别选 Developer Tools
- [ ] 提审前在自有 Chrome 上完整走一遍 README 手动验证清单

## 7. 截图说明

| 文件 | 内容 |
|---|---|
| screenshot-1-options.png | 设置页全景：三组规则表格 + 演示配置（含 WS 过滤示例） |
| screenshot-2-rename.png | 配置内联重命名编辑态 |
| screenshot-3-popup.png | 弹窗主界面（演示短值数据） |

重新生成截图：`node scripts/store-shots.mjs`（依赖 dist/ 已构建）

## 8. 英文完整版文案（如需发英文 locale）

```
Name: HeaderLite — Modify HTTP Headers
Summary: Modify HTTP/WebSocket request & response headers and redirect URLs.
Multiple profiles, drag-to-reorder precedence, Alt+Shift+M master toggle.
100% local, zero data collection.

Description:
HeaderLite is a lightweight header modifier for debugging and API testing.

• Modify request headers (set / add / remove) on http/https and WebSocket
  (ws/wss) handshakes
• Modify response headers
• URL redirects: wildcard or regex matching with $1 back-references
• Per-rule toggle and URL filter (empty = match all)
• Row order defines precedence — later rows override earlier ones; drag the
  grip to reorder
• Multiple profiles with inline rename, context-menu switching, JSON
  import/export, multi-window sync
• Alt+Shift+M global shortcut toggles all rules

Privacy: everything stays in chrome.storage.local. No analytics, no network
calls, no remote code, no accounts.
```

## 9. 素材清单

| 文件 | 用途 |
|---|---|
| `submission/headerlite-0.2.0.zip` | 上传包（manifest 在根） |
| `docs/store-assets/screenshot-{1,2,3}-*.png` | 商店截图 1280×800 |
| `docs/store-assets/promo-1400x560.png` | 宣传主图（Marquee） |
| `docs/store-assets/promo-440x280.png` | 宣传小图（Small promo tile） |
| `docs/store-assets/demo.webm` | 功能演示视频（审核索要时上传/转 YouTube） |
| `docs/privacy-policy.md` | 隐私政策（可托管后填入表单 URL） |

重新生成：截图 `node scripts/store-shots.mjs`；宣传图 `node scripts/promo-tiles.mjs`；视频 `node scripts/store-demo-video.mjs`
