/**
 * useAppState - React hook 封装应用状态操作
 *
 * 职责：
 * - 从 storage 加载初始状态
 * - 监听 chrome.storage.onChanged 保持多窗口同步
 * - 提供状态更新方法（通过 patchState）
 * - 处理导入导出逻辑
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { AppState, Profile } from "../model/types";
import {
  STORAGE_KEY,
  loadState,
  patchState as storagePatchState,
  parseProfilesFromJson,
  exportProfileToJson,
  createProfile,
  dedupeImportedProfiles,
  profileExportFilename,
} from "../storage/storage";

/** 最小初始状态，避免首屏 null（loadState 会很快覆盖） */
const INITIAL_STATE: AppState = {
  version: 1,
  profiles: [],
  activeProfileId: null,
  globalEnabled: false,
};

const DEBOUNCE_MS = 300;

export function useAppState() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [ready, setReady] = useState(false);
  const isMountedRef = useRef(false);
  const activeProfileIdRef = useRef<string | null>(null);
  const pendingPatchRef = useRef<((profile: Profile) => Profile) | null>(null);
  const pendingProfileIdRef = useRef<string | null>(null);
  // DOM setTimeout 句柄（popup/options 均为浏览器环境）
  const pendingTimerRef = useRef<number | undefined>(undefined);

  const flushProfilePatch = useCallback(async () => {
    if (!pendingPatchRef.current || !pendingProfileIdRef.current) return;

    const activeProfileId = pendingProfileIdRef.current;
    const patch = pendingPatchRef.current;

    pendingPatchRef.current = null;
    pendingProfileIdRef.current = null;

    window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = undefined;

    const updated = await storagePatchState((s) => ({
      ...s,
      profiles: s.profiles.map((p) => (p.id === activeProfileId ? patch(p) : p)),
    }));

    if (isMountedRef.current) {
      setState(updated);
    }
  }, []);

  // 初次加载状态
  useEffect(() => {
    isMountedRef.current = true;
    // popup/options 关闭是页面销毁，不会触发 React unmount；
    // 防抖窗口（300ms）内未落盘的编辑须在 pagehide 时补写
    const flushOnHide = () => {
      void flushProfilePatch();
    };
    window.addEventListener("pagehide", flushOnHide);

    loadState()
      .then((loaded) => {
        if (isMountedRef.current) {
          setState(loaded);
          setReady(true);
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setState(INITIAL_STATE);
          setReady(true);
        }
      });

    return () => {
      window.removeEventListener("pagehide", flushOnHide);
      isMountedRef.current = false;
      window.clearTimeout(pendingTimerRef.current);
      void flushProfilePatch();
    };
  }, [flushProfilePatch]);

  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      // 外部写入（另一窗口/右键菜单）回灌前，先把防抖窗口内未落盘的本地编辑写出去，
      // 否则 loadState 回来的旧数据会覆盖掉正在进行的编辑
      void (async () => {
        if (pendingPatchRef.current) {
          await flushProfilePatch();
        }
        try {
          const loaded = await loadState();
          if (isMountedRef.current) {
            setState(loaded);
          }
        } catch {
          if (isMountedRef.current) {
            setState(INITIAL_STATE);
          }
        }
      })();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [flushProfilePatch]);


  // ref 与渲染状态同步：updateActiveProfile/flushProfilePatch 读 ref 拿当前激活 id
  useEffect(() => {
    activeProfileIdRef.current = state.activeProfileId;
  }, [state.activeProfileId]);
  // 计算当前激活的 profile
  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? null;

  // 切换激活 profile
  const setActiveProfile = useCallback(async (id: string) => {
    const updated = await storagePatchState((s) => ({ ...s, activeProfileId: id }));
    setState(updated);
  }, []);

  // 切换总开关
  const toggleGlobal = useCallback(async () => {
    const updated = await storagePatchState((s) => ({ ...s, globalEnabled: !s.globalEnabled }));
    setState(updated);
  }, []);

  // 更新当前激活 profile（立即更新本地 state，延迟持久化）
  const updateActiveProfile = useCallback((updater: (p: Profile) => Profile) => {
    const activeProfileId = activeProfileIdRef.current;
    if (!activeProfileId) return;

    setState((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === activeProfileId ? updater(p) : p)),
    }));

    const currentPatch = pendingPatchRef.current;
    pendingPatchRef.current = currentPatch ? (p) => updater(currentPatch(p)) : updater;
    pendingProfileIdRef.current = activeProfileId;

    window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = window.setTimeout(() => {
      void flushProfilePatch();
    }, DEBOUNCE_MS);
  }, [flushProfilePatch]);

  // 新建 profile
  const addProfile = useCallback(async (title: string) => {
    const p = createProfile(title);
    const updated = await storagePatchState((s) => ({
      ...s,
      profiles: [...s.profiles, p],
      activeProfileId: p.id,
    }));
    setState(updated);
  }, []);

  // 删除 profile
  const deleteProfile = useCallback(async (id: string) => {
    const updated = await storagePatchState((s) => {
      const filtered = s.profiles.filter((p) => p.id !== id);
      const newActiveId = s.activeProfileId === id ? (filtered[0]?.id ?? null) : s.activeProfileId;
      return { ...s, profiles: filtered, activeProfileId: newActiveId };
    });
    setState(updated);
  }, []);

  // 重命名 profile
  const renameProfile = useCallback(async (id: string, title: string) => {
    const updated = await storagePatchState((s) => ({
      ...s,
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, title } : p)),
    }));
    setState(updated);
  }, []);

  // 导出当前激活 profile
  const exportActiveProfile = useCallback(() => {
    if (!activeProfile) return;
    const json = exportProfileToJson(activeProfile);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = profileExportFilename(activeProfile.title);
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProfile]);

  // 导入 profile（从文件，支持单个对象或数组）
  const importProfile = useCallback(async (file: File): Promise<number> => {
    const text = await file.text();
    const incoming = parseProfilesFromJson(text);
    let importedCount = 0;

    const updated = await storagePatchState((s) => {
      const nextIncoming = dedupeImportedProfiles(
        incoming,
        s.profiles.map((profile) => profile.id),
      );
      importedCount = nextIncoming.length;
      return {
        ...s,
        profiles: [...s.profiles, ...nextIncoming],
        activeProfileId: nextIncoming[0]?.id ?? s.activeProfileId,
      };
    });

    setState(updated);
    return importedCount;
  }, []);

  return {
    state,
    activeProfile,
    ready,
    setActiveProfile,
    toggleGlobal,
    updateActiveProfile,
    addProfile,
    deleteProfile,
    renameProfile,
    exportActiveProfile,
    importProfile,
  };
}
