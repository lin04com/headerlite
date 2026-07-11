/**
 * useAppState hook 测试
 * 覆盖 UI 编辑 → 防抖 → 落盘链路（回归背景：ref 同步 effect 曾被无声删除，
 * 导致所有 UI 编辑不生效，且无任何测试报警）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppState } from "../src/hooks/useAppState";
import { STORAGE_KEY } from "../src/storage/storage";
import type { AppState } from "../src/model/types";
// chrome.storage mock（含 onChanged 监听注册表，可手动触发外部写入）
const memory: Record<string, unknown> = {};
const changedListeners: Array<(changes: unknown, area: string) => void> = [];

// 测试替身：全局 chrome API 的最小实现（unknown 双重转换是测试边界的标准做法）
const chromeMock = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memory[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(memory, obj);
      },
    },
    onChanged: {
      addListener: (cb: (changes: unknown, area: string) => void) => changedListeners.push(cb),
      removeListener: (cb: (changes: unknown, area: string) => void) => {
        const i = changedListeners.indexOf(cb);
        if (i >= 0) changedListeners.splice(i, 1);
      },
    },
  },
} as unknown as typeof chrome;

Object.assign(globalThis, { chrome: chromeMock });

/** 模拟外部（另一窗口/SW）写入 state 并广播 onChanged */
function externalWrite(state: AppState) {
  const old = memory[STORAGE_KEY];
  memory[STORAGE_KEY] = JSON.stringify(state);
  for (const cb of changedListeners) {
    cb({ [STORAGE_KEY]: { oldValue: old, newValue: memory[STORAGE_KEY] } }, "local");
  }
}

function seedState(): AppState {
  const state: AppState = {
    version: 1,
    profiles: [
      {
        id: "p1",
        title: "t",
        requestHeaders: [
          { id: "h1", enabled: true, op: "set", name: "X-Test", value: "v0", urlFilter: "", comment: "" },
        ],
        responseHeaders: [],
        redirects: [],
      },
    ],
    activeProfileId: "p1",
    globalEnabled: true,
  };
  memory[STORAGE_KEY] = JSON.stringify(state);
  return state;
}

const setSpy = vi.spyOn(chromeMock.storage.local, "set");

describe("useAppState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(memory).forEach((k) => delete memory[k]);
    changedListeners.length = 0;
    setSpy.mockClear();
    seedState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UI 编辑经 300ms 防抖后落盘（回归：ref 同步 effect 丢失会让此处静默失败）", async () => {
    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    expect(result.current.ready).toBe(true);
    act(() => {
      result.current.updateActiveProfile((p) => ({
        ...p,
        requestHeaders: p.requestHeaders.map((r) => (r.id === "h1" ? { ...r, value: "v1" } : r)),
      }));
    });
    // 防抖窗口内未落盘
    expect(JSON.parse(memory[STORAGE_KEY] as string).profiles[0].requestHeaders[0].value).toBe("v0");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(JSON.parse(memory[STORAGE_KEY] as string).profiles[0].requestHeaders[0].value).toBe("v1");
  });

  it("防抖窗口内的多次编辑合并为一次写、终值为最后一次", async () => {
    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    act(() => {
      result.current.updateActiveProfile((p) => ({
        ...p,
        requestHeaders: p.requestHeaders.map((r) => (r.id === "h1" ? { ...r, value: "a" } : r)),
      }));
    });
    act(() => {
      result.current.updateActiveProfile((p) => ({
        ...p,
        requestHeaders: p.requestHeaders.map((r) => (r.id === "h1" ? { ...r, value: "b" } : r)),
      }));
    });

    const writesBefore = setSpy.mock.calls.filter((c) => STORAGE_KEY in (c[0] as object)).length;
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    const writesAfter = setSpy.mock.calls.filter((c) => STORAGE_KEY in (c[0] as object)).length;

    expect(writesAfter - writesBefore).toBe(1);
    expect(JSON.parse(memory[STORAGE_KEY] as string).profiles[0].requestHeaders[0].value).toBe("b");
  });

  it("pagehide 时未防抖完成的编辑被立即落盘（popup 关闭不触发 React unmount）", async () => {
    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    act(() => {
      result.current.updateActiveProfile((p) => ({
        ...p,
        requestHeaders: p.requestHeaders.map((r) => (r.id === "h1" ? { ...r, value: "flushed" } : r)),
      }));
    });

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(JSON.parse(memory[STORAGE_KEY] as string).profiles[0].requestHeaders[0].value).toBe("flushed");
  });

  it("外部写入回灌前先落盘本地未写编辑，编辑不被覆盖", async () => {
    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    act(() => {
      result.current.updateActiveProfile((p) => ({
        ...p,
        requestHeaders: p.requestHeaders.map((r) => (r.id === "h1" ? { ...r, value: "mine" } : r)),
      }));
    });

    // 防抖未到期时外部写入（如右键菜单切换总开关）触发 onChanged
    const external = JSON.parse(memory[STORAGE_KEY] as string) as AppState;
    external.globalEnabled = false;
    await act(async () => {
      externalWrite(external);
    });

    const stored = JSON.parse(memory[STORAGE_KEY] as string);
    expect(stored.profiles[0].requestHeaders[0].value).toBe("mine");
    expect(stored.globalEnabled).toBe(false);
  });
});
