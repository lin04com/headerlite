/**
 * RedirectTable - Redirect 规则表格组件
 *
 * 显示一组重定向规则，每行可编辑：
 * - enabled checkbox
 * - fromType select (urlFilter/regex)
 * - from input
 * - to input
 * - comment input
 * - 删除按钮
 */

import { t } from "../i18n";
import type { RedirectRow } from "../model/types";
import { createRedirectRow } from "../storage/storage";
import { useRowReorder } from "../hooks/useRowReorder";

interface Props {
  rows: RedirectRow[];
  onChange: (rows: RedirectRow[]) => void;
  showComment?: boolean;
}

export function RedirectTable({ rows, onChange, showComment = true }: Props) {
  const handleAdd = () => {
    onChange([...rows, createRedirectRow()]);
  };

  const handleDelete = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  const handleUpdate = (id: string, field: keyof RedirectRow, value: unknown) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const { rowProps, handleProps, isDragging, isDropTarget } = useRowReorder(
    rows,
    onChange,
    (r) => r.id,
  );

  return (
    <section className="rule-section">
      <h3>{t.redirects}</h3>
      {rows.length === 0 ? (
        <p className="empty-hint">（无规则）</p>
      ) : (
        <table className="rule-table">
          <thead>
            <tr>
              <th className="col-drag"></th>
              <th className="col-enable">{t.enable}</th>
              <th className="col-type">{t.fromType}</th>
              <th className="col-from">{t.from}</th>
              <th className="col-to">{t.to}</th>
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
                  <span className="drag-handle" title="拖拽排序（行序即优先级）" {...handleProps}>
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
                    value={row.fromType}
                    onChange={(e) => handleUpdate(row.id, "fromType", e.target.value)}
                  >
                    <option value="urlFilter">{t.urlFilterLabel}</option>
                    <option value="regex">{t.regex}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={row.from}
                    onChange={(e) => handleUpdate(row.id, "from", e.target.value)}
                    placeholder="匹配模式"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.to}
                    onChange={(e) => handleUpdate(row.id, "to", e.target.value)}
                    placeholder="目标 URL"
                  />
                </td>
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
