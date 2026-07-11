# HeaderLite 隐私政策 / Privacy Policy

> 生效日期：2026-09-12 · 适用：HeaderLite Chrome 扩展（v0.2.0）

## 中文

HeaderLite 不收集、不传输、不出售任何用户数据。

- **不收集**：扩展没有账号体系、没有统计/遥测 SDK、不记录浏览行为。你配置的规则（header 名与值、重定向规则、Profile 标题）仅保存在浏览器本地的 `chrome.storage.local` 中，可用 Chrome 的"清除扩展数据"随时删除。
- **不传输**：扩展不连接任何服务器。代码完全静态打包，无远程脚本。规则由 Chrome 内置的 declarativeNetRequest API 直接在浏览器内生效。
- **权限用途**：请求"读取和更改所有网站数据"权限仅为了让你配置的 header/重定向规则能在目标网站生效；扩展不含任何自动触发的行为，所有规则均由你手动创建，关闭总开关后立即全部失效。

如对隐私有疑问，可通过商店页面上的开发者邮箱联系。

## English

HeaderLite does not collect, transmit, or sell any user data.

- **No collection**: no accounts, no analytics or telemetry, no browsing-history logging. Your configured rules (header names/values, redirects, profile titles) are stored only in the browser's local `chrome.storage.local` and can be removed at any time.
- **No transmission**: the extension makes no network requests of its own and contains no remote code. Rules are enforced locally by Chrome's declarativeNetRequest API.
- **Permission use**: the "read and change your data on all websites" permission exists solely so the rules you write can apply to the sites you target. Nothing runs automatically; every rule is created manually and stops immediately when the master toggle is off.
