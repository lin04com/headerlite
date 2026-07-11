/**
 * 行拖拽排序测试（HeaderTable / RedirectTable 共用 useRowReorder）
 * 契约：把手按下后行可拖；dragStart → dragOver → drop 后 onChange 收到重排数组
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HeaderTable } from "../src/components/HeaderTable";
import { RedirectTable } from "../src/components/RedirectTable";
import type { HeaderRow, RedirectRow } from "../src/model/types";

const headerRow = (id: string, name: string): HeaderRow => ({
  id,
  enabled: true,
  op: "set",
  name,
  value: "v",
  urlFilter: "",
  comment: "",
});

const redirectRow = (id: string, from: string): RedirectRow => ({
  id,
  enabled: true,
  fromType: "urlFilter",
  from,
  to: "https://t.com/",
  comment: "",
});

/** 模拟一次拖拽：按下手柄 → 起点 dragStart → 目标 dragOver+drop */
function dragRow(container: HTMLElement, fromIndex: number, toIndex: number) {
  const rows = container.querySelectorAll("tbody tr");
  fireEvent.mouseDown(rows[fromIndex].querySelector(".drag-handle") as Element);
  fireEvent.dragStart(rows[fromIndex]);
  fireEvent.dragOver(rows[toIndex]);
  fireEvent.drop(rows[toIndex]);
  fireEvent.mouseUp(rows[fromIndex].querySelector(".drag-handle") as Element);
}

describe("行拖拽排序", () => {
  it("HeaderTable：第 1 行拖到第 3 行位置，onChange 收到重排数组", () => {
    const onChange = vi.fn();
    const rows = [headerRow("a", "X-A"), headerRow("b", "X-B"), headerRow("c", "X-C")];
    const { container } = render(<HeaderTable title="t" rows={rows} onChange={onChange} />);

    dragRow(container, 0, 2);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as HeaderRow[]).map((r) => r.name)).toEqual([
      "X-B",
      "X-C",
      "X-A",
    ]);
  });

  it("RedirectTable：最后一行拖到首位，onChange 收到重排数组", () => {
    const onChange = vi.fn();
    const rows = [redirectRow("a", "from-a"), redirectRow("b", "from-b")];
    const { container } = render(<RedirectTable rows={rows} onChange={onChange} />);

    dragRow(container, 1, 0);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as RedirectRow[]).map((r) => r.from)).toEqual([
      "from-b",
      "from-a",
    ]);
  });

  it("未按住手柄时行不可拖拽（draggable=false），文本输入不受干扰", () => {
    const onChange = vi.fn();
    const rows = [headerRow("a", "X-A"), headerRow("b", "X-B")];
    const { container } = render(<HeaderTable title="t" rows={rows} onChange={onChange} />);

    const tr = container.querySelectorAll("tbody tr")[0] as HTMLElement;
    expect(tr.getAttribute("draggable")).toBe("false");
    expect(tr.draggable).toBe(false);
  });
});
