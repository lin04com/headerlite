/**
 * HeaderLite - 右键菜单管理
 *
 * 职责：
 * - setupContextMenu(): 创建总开关 checkbox + Profile radio 列表
 * - handleMenuClick(): 处理菜单点击，更新 state
 */

import { loadState, patchState } from "../storage/storage";

// chrome 类型是全局的，不需要导入

/**
 * 设置右键菜单（总开关 + Profile 列表）
 *
 * 菜单结构：
 * - checkbox: 总开关
 * - separator
 * - radio: 每个 Profile
 *
 * 通过 menuChain 串行化，避免 onInstalled / onChanged 并发触发导致重复创建。
 */
let menuChain: Promise<void> = Promise.resolve();

export function setupContextMenu(): Promise<void> {
  menuChain = menuChain.then(doSetupContextMenu).catch((e) => {
    console.warn("[HeaderLite] setupContextMenu failed:", e);
  });
  return menuChain;
}

async function doSetupContextMenu(): Promise<void> {
  // 先清空现有菜单，避免重复创建
  await chrome.contextMenus.removeAll();

  const state = await loadState();

  // 总开关 checkbox
  chrome.contextMenus.create({
    id: "toggle-global",
    type: "checkbox",
    checked: state.globalEnabled,
    title: "HeaderLite: 总开关",
    contexts: ["all"],
  });

  // 分隔线
  chrome.contextMenus.create({
    id: "separator",
    type: "separator",
    contexts: ["all"],
  });

  // 每个 Profile 创建一个 radio 项
  for (const profile of state.profiles) {
    chrome.contextMenus.create({
      id: `profile-${profile.id}`,
      type: "radio",
      checked: profile.id === state.activeProfileId,
      title: profile.title,
      contexts: ["all"],
    });
  }
}

/**
 * 处理右键菜单点击
 *
 * @param info - 菜单点击信息
 * @param _tab - 当前标签页（未使用，保留以匹配 API）
 */
export async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  _tab: chrome.tabs.Tab | undefined
): Promise<void> {
  const itemId = info.menuItemId;

  // 处理总开关切换
  if (itemId === "toggle-global") {
    // info.checked 在 checkbox 点击时反映新状态
    const newEnabled = info.checked ?? true; // 兜底 true（理论上不会触发）
    await patchState((s) => ({ ...s, globalEnabled: newEnabled }));
    return;
  }

  // 处理 Profile 切换
  if (typeof itemId === "string" && itemId.startsWith("profile-")) {
    const profileId = itemId.slice("profile-".length);
    await patchState((s) => ({ ...s, activeProfileId: profileId }));
    return;
  }
}
