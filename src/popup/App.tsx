/**
 * App - Popup 主应用组件
 *
 * 布局：深色顶栏(品牌+总开关) / 工具栏(profile 选择) / 规则列表 / 底部导入导出
 */

import { useState, useRef, useEffect } from "react";
import { useAppState } from "../hooks/useAppState";
import { GlobalToggle } from "../components/GlobalToggle";
import { ProfileSelector } from "../components/ProfileSelector";
import { HeaderTable } from "../components/HeaderTable";
import { RedirectTable } from "../components/RedirectTable";
import { t } from "../i18n";

const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
);

export function App() {
  const {
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
  } = useAppState();

  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [colPrefs, setColPrefs] = useState({ urlFilter: true, comment: true });
  const toastTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 列显隐偏好：读取 + 监听 storage 变化（popup 与 options 同开时保持同步）
  useEffect(() => {
    const applyPrefs = (prefs: { urlFilter?: boolean; comment?: boolean } | undefined) => {
      if (prefs) {
        setColPrefs({ urlFilter: prefs.urlFilter ?? true, comment: prefs.comment ?? true });
      }
    };

    chrome.storage.local.get("uiPrefs", (r) =>
      applyPrefs(r.uiPrefs as { urlFilter?: boolean; comment?: boolean } | undefined),
    );

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes.uiPrefs) {
        applyPrefs(changes.uiPrefs.newValue as { urlFilter?: boolean; comment?: boolean } | undefined);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const toggleCol = (key: keyof typeof colPrefs) => {
    const next = { ...colPrefs, [key]: !colPrefs[key] };
    setColPrefs(next);
    chrome.storage.local.set({ uiPrefs: next });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = await importProfile(file);
      showToast(n > 1 ? `${t.importSuccess} (${n})` : t.importSuccess);
    } catch {
      showToast(t.importError);
    }
    e.target.value = "";
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  if (!ready) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <LockIcon />
          {t.appName}
        </div>
        <GlobalToggle enabled={state.globalEnabled} onToggle={toggleGlobal} />
      </header>

      <ProfileSelector
        profiles={state.profiles}
        activeId={state.activeProfileId}
        onSelect={setActiveProfile}
        onNew={(title) => addProfile(title)}
        onRename={(id, title) => renameProfile(id, title)}
        onDelete={() => {
          if (state.activeProfileId) deleteProfile(state.activeProfileId);
        }}
      />

      <div className="rule-list">
        <div className="col-toggle">
          <span className="col-toggle-label">{t.showColumns}</span>
          <button
            type="button"
            className={"chip" + (colPrefs.urlFilter ? " chip-on" : "")}
            onClick={() => toggleCol("urlFilter")}
          >
            {t.urlFilterLabel}
          </button>
          <button
            type="button"
            className={"chip" + (colPrefs.comment ? " chip-on" : "")}
            onClick={() => toggleCol("comment")}
          >
            {t.comment}
          </button>
        </div>
        {activeProfile ? (
          <>
            <HeaderTable
              title={t.requestHeaders}
              rows={activeProfile.requestHeaders}
              onChange={(rows) => updateActiveProfile((p) => ({ ...p, requestHeaders: rows }))}
              showUrlFilter={colPrefs.urlFilter}
              showComment={colPrefs.comment}
            />
            <HeaderTable
              title={t.responseHeaders}
              rows={activeProfile.responseHeaders}
              onChange={(rows) => updateActiveProfile((p) => ({ ...p, responseHeaders: rows }))}
              showUrlFilter={colPrefs.urlFilter}
              showComment={colPrefs.comment}
            />
            <RedirectTable
              rows={activeProfile.redirects}
              onChange={(rows) => updateActiveProfile((p) => ({ ...p, redirects: rows }))}
              showComment={colPrefs.comment}
            />
          </>
        ) : (
          <p className="empty-state">{t.noProfile}</p>
        )}
      </div>

      <footer className="app-footer">
        <button type="button" onClick={triggerFileInput} className="btn-secondary">
          {t.importJson}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImport}
        />
        <button type="button" onClick={exportActiveProfile} className="btn-secondary">
          {t.exportJson}
        </button>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
