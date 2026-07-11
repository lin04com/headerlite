/**
 * ProfileSelector 组件测试
 * 契约：内联命名（替代 window.prompt，popup 场景不可用）与两段式删除（替代 confirm）
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ProfileSelector } from "../src/components/ProfileSelector";

const profiles = [
  { id: "a", title: "配置A" },
  { id: "b", title: "配置B" },
];

function setup(overrides?: Partial<Parameters<typeof ProfileSelector>[0]>) {
  const handlers = {
    profiles,
    activeId: "a",
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { handlers, ...render(<ProfileSelector {...handlers} />) };
}

describe("ProfileSelector 内联命名", () => {
  it("新建：点按钮 → 输入名 + Enter → onNew(去空白名)，工具栏复位", () => {
    const { handlers, getByRole, getByDisplayValue, queryByDisplayValue } = setup();

    fireEvent.click(getByRole("button", { name: "新建配置" }));
    const input = getByDisplayValue("") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  新配置  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handlers.onNew).toHaveBeenCalledWith("新配置");
    expect(handlers.onNew).toHaveBeenCalledTimes(1);
    expect(queryByDisplayValue("  新配置  ")).toBeNull(); // 已退出编辑态
  });

  it("新建：空名提交不回调", () => {
    const { handlers, getByRole, container } = setup();

    fireEvent.click(getByRole("button", { name: "新建配置" }));
    const input = container.querySelector(".profile-title-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handlers.onNew).not.toHaveBeenCalled();
  });

  it("重命名：预填当前名，改写 + 确定按钮 → onRename(activeId, 新名)", () => {
    const { handlers, getByRole, getByDisplayValue } = setup();

    fireEvent.click(getByRole("button", { name: "重命名" }));
    const input = getByDisplayValue("配置A");
    fireEvent.change(input, { target: { value: "改名后" } });
    fireEvent.click(getByRole("button", { name: "确定" }));

    expect(handlers.onRename).toHaveBeenCalledWith("a", "改名后");
  });

  it("Escape 取消编辑，不回调", () => {
    const { handlers, getByRole, getByDisplayValue } = setup();

    fireEvent.click(getByRole("button", { name: "重命名" }));
    fireEvent.keyDown(getByDisplayValue("配置A"), { key: "Escape" });

    expect(handlers.onRename).not.toHaveBeenCalled();
  });
});

describe("ProfileSelector 两段式删除", () => {
  it("第一次点删除进入确认态且不回调；再点确认才回调", () => {
    const { handlers, getByRole } = setup();

    fireEvent.click(getByRole("button", { name: "删除" }));
    expect(handlers.onDelete).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: "确认删除" }));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it("仅剩 1 个 profile 时删除按钮禁用", () => {
    const { getByRole } = setup({ profiles: [{ id: "a", title: "唯一" }] });
    expect((getByRole("button", { name: "删除" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
