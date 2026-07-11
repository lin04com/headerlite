/**
 * ProfileSelector - Profile 选择器组件
 *
 * 新建/重命名用工具栏内联输入：window.prompt 会使扩展 popup 失焦自动关闭，
 * 在 popup 面板里基本不可用（confirm 同理），故删除改为两段式确认按钮。
 */

import { useState, useEffect, useRef } from "react";
import { t } from "../i18n";

interface Props {
  profiles: { id: string; title: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (title: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: () => void;
}

export function ProfileSelector({ profiles, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  // editing: null = 浏览态；'new' = 新建命名；'rename' = 重命名
  const [editing, setEditing] = useState<"new" | "rename" | null>(null);
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 两段式删除：3 秒未确认自动复位
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  // 进入命名态时聚焦并全选，便于直接覆盖
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startNew = () => {
    setEditing("new");
    setTitle("");
  };

  const startRename = () => {
    const current = profiles.find((p) => p.id === activeId);
    if (!current) return;
    setEditing("rename");
    setTitle(current.title);
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (editing === "new") {
      onNew(trimmed);
    } else if (editing === "rename" && activeId) {
      onRename(activeId, trimmed);
    }
    setEditing(null);
  };

  const canDelete = profiles.length > 1;

  return (
    <div className="toolbar">
      {editing === null ? (
        <select
          value={activeId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="profile-select"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="profile-title-input"
          value={title}
          placeholder="配置名"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setEditing(null);
          }}
        />
      )}

      {editing === null ? (
        <>
          <button type="button" onClick={startNew} className="btn-secondary">
            {t.newProfile}
          </button>
          <button
            type="button"
            onClick={startRename}
            className="btn-secondary"
            disabled={!activeId}
          >
            {t.rename}
          </button>
          <button
            type="button"
            className={"btn-secondary btn-danger" + (confirmDelete ? " btn-confirm-delete" : "")}
            disabled={!activeId || !canDelete}
            onClick={() => {
              if (confirmDelete) {
                setConfirmDelete(false);
                onDelete();
              } else {
                setConfirmDelete(true);
              }
            }}
          >
            {confirmDelete ? t.confirmDeleteProfile : t.deleteProfile}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={submit} className="btn-secondary">
            {t.ok}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
            {t.cancel}
          </button>
        </>
      )}
    </div>
  );
}
