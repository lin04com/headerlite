/**
 * useRowReorder - 表格行拖拽排序
 *
 * 行序即 DNR 优先级（后行覆盖前行），排序是控制规则优先级的手段。
 * 仅按住拖拽手柄时行可拖（draggable），避免与行内文本输入的鼠标操作冲突。
 * 返回绑定到 <tr> 的事件与手柄 props，供 HeaderTable / RedirectTable 复用。
 */

import { useState, useCallback } from "react";

export interface RowReorderBindings {
  /** 绑定到 tr：当前行是否处于拖拽态（用于高亮/禁用输入干扰） */
  isDragging: (index: number) => boolean;
  /** 绑定到 tr：当前行是否为放置目标 */
  isDropTarget: (index: number) => boolean;
  /** 绑定到 tr 的 drag 事件集合 */
  rowProps: (index: number) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent<HTMLTableRowElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => void;
    onDrop: (e: React.DragEvent<HTMLTableRowElement>) => void;
    onDragEnd: () => void;
  };
  /** 绑定到拖拽手柄 span 的 props（按住时才允许拖动） */
  handleProps: {
    onMouseDown: () => void;
    onMouseUp: () => void;
  };
}

export function useRowReorder<T>(
  rows: T[],
  onChange: (rows: T[]) => void,
  getId: (row: T) => string,
): RowReorderBindings {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [handleHeld, setHandleHeld] = useState(false);

  const moveRow = useCallback(
    (fromKey: string, toKey: string) => {
      const from = rows.findIndex((r) => getId(r) === fromKey);
      const to = rows.findIndex((r) => getId(r) === toKey);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    },
    [rows, onChange, getId],
  );

  const rowProps = useCallback(
    (index: number) => {
      const key = getId(rows[index]);
      return {
        draggable: handleHeld,
        onDragStart: (e: React.DragEvent<HTMLTableRowElement>) => {
          setDragKey(key);
          // dataTransfer 在 jsdom 测试环境中可能不存在
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
          }
        },
        onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => {
          e.preventDefault(); // 允许放置
          if (dragKey !== null && dragKey !== key) setOverKey(key);
        },
        onDrop: (e: React.DragEvent<HTMLTableRowElement>) => {
          e.preventDefault();
          if (dragKey !== null) moveRow(dragKey, key);
          setDragKey(null);
          setOverKey(null);
          setHandleHeld(false);
        },
        onDragEnd: () => {
          setDragKey(null);
          setOverKey(null);
          setHandleHeld(false);
        },
      };
    },
    [rows, getId, handleHeld, dragKey, moveRow],
  );

  const isDragging = useCallback((index: number) => dragKey === getId(rows[index]), [dragKey, rows, getId]);
  const isDropTarget = useCallback(
    (index: number) => overKey === getId(rows[index]) && dragKey !== null && overKey !== dragKey,
    [overKey, dragKey, rows, getId],
  );

  const handleProps = {
    onMouseDown: () => setHandleHeld(true),
    onMouseUp: () => setHandleHeld(false),
  };

  return { isDragging, isDropTarget, rowProps, handleProps };
}
