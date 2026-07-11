/**
 * HeaderLite - Service Worker 入口
 *
 * 职责：当 storage 里的 state 变化时，全量重建 DNR 动态规则
 * - SW 启动时同步一次规则
 * - 监听 storage.onChanged → 触发规则同步
 * - 注册右键菜单
 */

import { loadState, patchState, STORAGE_KEY } from "../storage/storage";
import { buildRules } from "../dnr/ruleBuilder";
import { setupContextMenu, handleMenuClick } from "./menu";

/**
 * 全量重建 DNR 动态规则（幂等操作）
 *
 * 流程：
 * 1. 从 storage 读取当前 state
 * 2. 用 activeProfile 和 globalEnabled 构建新规则
 * 3. 移除所有旧规则，添加新规则
 * 4. 整批失败时降级为逐条添加（跳过坏规则）
 */
async function syncRules(): Promise<void> {
  const state = await loadState();
  const active = state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
  const newRules = buildRules(active, state.globalEnabled);

  // 读当前所有动态规则的 id
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: newRules,
    });
  } catch (e) {
    // 整批失败时，降级：清空后逐条添加，跳过坏规则并 log
    console.warn("[HeaderLite] bulk updateDynamicRules failed, trying per-rule:", e);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
    } catch {}
    for (const rule of newRules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
      } catch (err) {
        console.warn("[HeaderLite] skipped invalid rule", rule.id, err);
      }
    }
  }
}

// === Service Worker 生命周期 ===

// 串行化 syncRules：onInstalled / onChanged / SW 启动可能并发触发，
// 若同时 updateDynamicRules 会因 ruleId 冲突报 "does not have a unique ID"。
let syncChain: Promise<void> = Promise.resolve();
function scheduleSync(): void {
  syncChain = syncChain
    .then(syncRules)
    .catch((e) => console.warn("[HeaderLite] syncRules failed:", e));
}

// SW 启动时同步一次规则（避免 SW 被唤醒后规则丢失）
scheduleSync();

// 扩展安装/更新时：设置右键菜单 + 同步规则
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  scheduleSync();
});

// 监听 storage 变化：state 变化时同步规则 + 刷新右键菜单
// （菜单的 profile radio 列表必须跟随 profile 增删/重命名更新，否则选不到新 profile）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && STORAGE_KEY in changes) {
    scheduleSync();
    setupContextMenu().catch((e) => console.warn("[HeaderLite] setupContextMenu failed:", e));
  }
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab).catch((e) => console.warn("[HeaderLite] menu click failed:", e));
});

// 键盘快捷键：切换总开关（storage.onChanged 会级联触发规则同步与菜单刷新）
chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-global") return;
  patchState((s) => ({ ...s, globalEnabled: !s.globalEnabled })).catch((e) =>
    console.warn("[HeaderLite] toggle-global failed:", e),
  );
});
