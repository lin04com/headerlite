/**
 * HeaderTable - Header 规则表格组件
 *
 * 显示一组 Header 规则（请求头或响应头），每行可编辑：
 * - enabled checkbox
 * - op select (set/add/remove)
 * - name input
 * - value input
 * - urlFilter input
 * - comment input
 * - 删除按钮
 */

import { t } from "../i18n";
import type { HeaderRow } from "../model/types";
import { createHeaderRow } from "../storage/storage";
import { useRowReorder } from "../hooks/useRowReorder";

export function HeaderTable({
  title,
  rows,
  onChange,
  showUrlFilter = true,
  showComment = true,
}: {
  title: string;
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
  showUrlFilter?: boolean;
  showComment?: boolean;
}) {
  const handleAdd = () => {
    onChange([...rows, createHeaderRow()]);
  };

  const handleDelete = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  const handleUpdate = (id: string, field: keyof HeaderRow, value: unknown) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const { rowProps, handleProps, isDragging, isDropTarget } = useRowReorder(
    rows,
    onChange,
    (r) => r.id,
  );

  return (
    <section className="rule-section">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-hint">（无规则）</p>
      ) : (
        <table className="rule-table">
          <thead>
            <tr>
              <th className="col-drag"></th>
              <th className="col-enable">{t.enable}</th>
              <th className="col-op">{t.op}</th>
              <th className="col-name">{t.headerName}</th>
              <th className="col-value">{t.headerValue}</th>
              {showUrlFilter && <th className="col-url">{t.urlFilterLabel}</th>}
              {showComment && <th className="col-comment">{t.comment}</th>}
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                {...rowProps(index)}
                className={
                  isDragging(index) ? "row-dragging" : isDropTarget(index) ? "row-drop-target" : ""
                }
              >
                <td className="col-drag">
                  <span className="drag-handle" title="拖拽排序（行序即优先级，后行覆盖前行）" {...handleProps}>
                    ⠿
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => handleUpdate(row.id, "enabled", e.target.checked)}
                  />
                </td>
                <td>
                  <select
                    value={row.op}
                    onChange={(e) => handleUpdate(row.id, "op", e.target.value)}
                  >
                    <option value="set">set</option>
                    <option value="add">add</option>
                    <option value="remove">remove</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => handleUpdate(row.id, "name", e.target.value)}
                    placeholder="Header 名"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => handleUpdate(row.id, "value", e.target.value)}
                    placeholder="值"
                    disabled={row.op === "remove"}
                  />
                </td>
                {showUrlFilter && (
                  <td>
                    <input
                      type="text"
                      value={row.urlFilter}
                      onChange={(e) => handleUpdate(row.id, "urlFilter", e.target.value)}
                      placeholder="||example.com/ 或 |ws://host"
                    />
                  </td>
                )}
                {showComment && (
                  <td>
                    <input
                      type="text"
                      value={row.comment}
                      onChange={(e) => handleUpdate(row.id, "comment", e.target.value)}
                      placeholder="备注"
                    />
                  </td>
                )}
                <td>
                  <button
                    type="button"
                    onClick={() => handleDelete(row.id)}
                    className="btn-icon btn-delete"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={handleAdd} className="btn-add">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        {t.addRow}
      </button>
    </section>
  );
}
