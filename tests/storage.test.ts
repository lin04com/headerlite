/**
 * storage 模块测试
 * 覆盖：loadState, saveState, patchState, validateImportedProfile, parseProfileFromJson, exportProfileToJson, 工厂函数
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY,
  CORRUPT_BACKUP_KEY,
  DEFAULT_STATE,
  loadState,
  saveState,
  patchState,
  validateImportedProfile,
  dedupeImportedProfiles,
  exportProfileToJson,
  parseProfileFromJson,
  parseProfilesFromJson,
  createHeaderRow,
  createRedirectRow,
  createProfile,
  profileExportFilename,
} from "../src/storage/storage";
import type { AppState, Profile } from "../src/model/types";

// Mock chrome.storage.local
const memory: Record<string, unknown> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memory[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(memory, obj);
      },
    },
  },
};

describe("storage", () => {
  beforeEach(() => {
    // 每个测试前清空 memory
    Object.keys(memory).forEach((key) => delete memory[key]);
  });

  describe("loadState", () => {
    it("首次加载（storage 为空）应返回 DEFAULT_STATE 并写回", async () => {
      const state = await loadState();

      expect(state).toEqual(DEFAULT_STATE);
      expect(memory[STORAGE_KEY]).toBeDefined();
      expect(JSON.parse(memory[STORAGE_KEY] as string)).toEqual(DEFAULT_STATE);
    });

    it("已存在数据时正确解析", async () => {
      const testState: AppState = {
        version: 1,
        profiles: [
          {
            id: "test",
            title: "测试配置",
            requestHeaders: [],
            responseHeaders: [],
            redirects: [],
          },
        ],
        activeProfileId: "test",
        globalEnabled: false,
      };
      await saveState(testState);

      const loaded = await loadState();
      expect(loaded).toEqual(testState);
    });

    it("解析失败时回退到 DEFAULT_STATE，写回前先备份原始数据", async () => {
      memory[STORAGE_KEY] = "invalid json {{{";

      const state = await loadState();
      expect(state).toEqual(DEFAULT_STATE);
      expect(JSON.parse(memory[STORAGE_KEY] as string)).toEqual(DEFAULT_STATE);
      expect(memory[CORRUPT_BACKUP_KEY]).toBe("invalid json {{{");
    });

    it("结构不完整时回退到 DEFAULT_STATE 并备份原始数据", async () => {
      const corrupt = JSON.stringify({ version: 1 }); // 缺少 profiles
      memory[STORAGE_KEY] = corrupt;

      const state = await loadState();
      expect(state).toEqual(DEFAULT_STATE);
      expect(memory[CORRUPT_BACKUP_KEY]).toBe(corrupt);
    });

    it("activeProfileId 类型错误时回退到 DEFAULT_STATE", async () => {
      memory[STORAGE_KEY] = JSON.stringify({
        version: 1,
        profiles: [],
        activeProfileId: 123,
        globalEnabled: true,
      });

      const state = await loadState();
      expect(state).toEqual(DEFAULT_STATE);
    });

    it("globalEnabled 缺失时回退到 DEFAULT_STATE", async () => {
      memory[STORAGE_KEY] = JSON.stringify({
        version: 1,
        profiles: [],
        activeProfileId: null,
      });

      const state = await loadState();
      expect(state).toEqual(DEFAULT_STATE);
    });

    it("activeProfileId 为 null 时合法", async () => {
      const validState = {
        version: 1,
        profiles: [],
        activeProfileId: null,
        globalEnabled: false,
      };
      memory[STORAGE_KEY] = JSON.stringify(validState);

      const state = await loadState();
      expect(state.activeProfileId).toBeNull();
      expect(state.globalEnabled).toBe(false);
    });
  });

  describe("saveState", () => {
    it("正确保存状态", async () => {
      const testState: AppState = {
        version: 1,
        profiles: DEFAULT_STATE.profiles,
        activeProfileId: "default",
        globalEnabled: true,
      };

      await saveState(testState);
      expect(memory[STORAGE_KEY]).toBeDefined();

      const parsed = JSON.parse(memory[STORAGE_KEY] as string);
      expect(parsed).toEqual(testState);
    });

    it("saveState + loadState 往返一致", async () => {
      const original: AppState = {
        version: 1,
        profiles: [
          {
            id: "p1",
            title: "Profile 1",
            requestHeaders: [
              {
                id: "h1",
                enabled: true,
                op: "set",
                name: "X-Test",
                value: "hello",
                urlFilter: "",
                comment: "",
              },
            ],
            responseHeaders: [],
            redirects: [],
          },
        ],
        activeProfileId: "p1",
        globalEnabled: false,
      };

      await saveState(original);
      const loaded = await loadState();

      expect(loaded).toEqual(original);
    });
  });

  describe("patchState", () => {
    it("读-改-写：正确更新字段并保留其他字段", async () => {
      await saveState(DEFAULT_STATE);

      const updated = await patchState((s) => ({
        ...s,
        globalEnabled: !s.globalEnabled,
      }));

      expect(updated.globalEnabled).toBe(false);
      expect(updated.profiles).toEqual(DEFAULT_STATE.profiles);
      expect(updated.activeProfileId).toEqual(DEFAULT_STATE.activeProfileId);
    });

    it("patchState 结果被正确保存", async () => {
      await saveState(DEFAULT_STATE);

      await patchState((s) => ({
        ...s,
        activeProfileId: null,
      }));

      const reloaded = await loadState();
      expect(reloaded.activeProfileId).toBeNull();
    });

    it("并发 patchState 串行执行，不丢更新", async () => {
      await saveState(DEFAULT_STATE);

      // 用计数器模拟并发：每个 updater 递增 version
      const updates = await Promise.all([
        patchState((s) => ({ ...s, version: s.version + 1 })),
        patchState((s) => ({ ...s, version: s.version + 1 })),
        patchState((s) => ({ ...s, version: s.version + 1 })),
      ]);

      // 最后一次返回的 state 应反映全部三次递增
      expect(updates[2].version).toBe(DEFAULT_STATE.version + 3);

      // 落盘的最终值也应一致
      const final = await loadState();
      expect(final.version).toBe(DEFAULT_STATE.version + 3);
    });
  });

  describe("validateImportedProfile", () => {
    const validProfile: Profile = {
      id: "test-id",
      title: "测试配置",
      requestHeaders: [
        {
          id: "h1",
          enabled: true,
          op: "set",
          name: "X-Test",
          value: "value",
          urlFilter: "*://example.com/*",
          comment: "备注",
        },
      ],
      responseHeaders: [],
      redirects: [
        {
          id: "r1",
          enabled: true,
          fromType: "urlFilter",
          from: "*://old.com/*",
          to: "https://new.com/$1",
          comment: "",
        },
      ],
    };

    it("合法 profile 通过校验并剥离多余字段", () => {
      const withExtra = {
        ...validProfile,
        extraField: "should be removed",
        nested: { foo: "bar" },
      };

      const result = validateImportedProfile(withExtra);
      expect(result).toEqual(validProfile);
      expect((result as any).extraField).toBeUndefined();
    });

    it("非对象类型抛错", () => {
      expect(() => validateImportedProfile(null)).toThrow("INVALID_PROFILE");
      expect(() => validateImportedProfile("string")).toThrow("INVALID_PROFILE");
      expect(() => validateImportedProfile(123)).toThrow("INVALID_PROFILE");
    });

    it("缺少必填字段抛错", () => {
      const { id, ...missingId } = validProfile;
      expect(() => validateImportedProfile(missingId)).toThrow("INVALID_PROFILE");

      const { title, ...missingTitle } = validProfile;
      expect(() => validateImportedProfile(missingTitle)).toThrow("INVALID_PROFILE");

      const { requestHeaders, ...missingReq } = validProfile;
      expect(() => validateImportedProfile(missingReq)).toThrow("INVALID_PROFILE");
    });

    it("字段类型错误抛错", () => {
      expect(() => validateImportedProfile({ ...validProfile, id: 123 })).toThrow(
        "INVALID_PROFILE"
      );
      expect(() => validateImportedProfile({ ...validProfile, title: null })).toThrow(
        "INVALID_PROFILE"
      );
      expect(() =>
        validateImportedProfile({ ...validProfile, requestHeaders: "not array" })
      ).toThrow("INVALID_PROFILE");
    });

    it("HeaderRow 字段不合法抛错", () => {
      const invalidHeader = {
        ...validProfile,
        requestHeaders: [
          {
            id: "h1",
            enabled: "not boolean",
            op: "set",
            name: "",
            value: "",
            urlFilter: "",
            comment: "",
          },
        ],
      };
      expect(() => validateImportedProfile(invalidHeader)).toThrow("INVALID_PROFILE");
    });

    it("HeaderOp 不在合法集合抛错", () => {
      const invalidOp = {
        ...validProfile,
        requestHeaders: [{ ...validProfile.requestHeaders[0]!, op: "invalid" as any }],
      };
      expect(() => validateImportedProfile(invalidOp)).toThrow("INVALID_PROFILE");
    });

    it("RedirectRow 字段不合法抛错", () => {
      const invalidRedirect = {
        ...validProfile,
        redirects: [
          { id: "r1", enabled: true, fromType: "invalid" as any, from: "", to: "", comment: "" },
        ],
      };
      expect(() => validateImportedProfile(invalidRedirect)).toThrow("INVALID_PROFILE");
    });
  });

  describe("parseProfileFromJson", () => {
    const validProfile: Profile = {
      id: "test-id",
      title: "测试配置",
      requestHeaders: [],
      responseHeaders: [],
      redirects: [],
    };

    it("合法 JSON 字符串通过解析", () => {
      const json = JSON.stringify(validProfile);
      const result = parseProfileFromJson(json);
      expect(result).toEqual(validProfile);
    });

    it("非法 JSON 字符串抛 INVALID_PROFILE", () => {
      expect(() => parseProfileFromJson("not json {{{")).toThrow("INVALID_PROFILE");
      expect(() => parseProfileFromJson("")).toThrow("INVALID_PROFILE");
    });

    it("结构不合法的 JSON 抛 INVALID_PROFILE", () => {
      const invalidJson = JSON.stringify({ id: 123 }); // 缺少 title
      expect(() => parseProfileFromJson(invalidJson)).toThrow("INVALID_PROFILE");
    });
  });

  describe("parseProfilesFromJson", () => {
    const profile = (id: string): Profile => ({
      id,
      title: "t",
      requestHeaders: [],
      responseHeaders: [],
      redirects: [],
    });

    it("单个对象 → 长度 1 的数组", () => {
      const arr = parseProfilesFromJson(JSON.stringify(profile("a")));
      expect(arr).toHaveLength(1);
      expect(arr[0].id).toBe("a");
    });

    it("数组 → 多个 profile", () => {
      const arr = parseProfilesFromJson(JSON.stringify([profile("a"), profile("b"), profile("c")]));
      expect(arr).toHaveLength(3);
      expect(arr.map((p) => p.id)).toEqual(["a", "b", "c"]);
    });

    it("数组内重复 id 自动去重", () => {
      const arr = parseProfilesFromJson(JSON.stringify([profile("a"), profile("a"), profile("b")]));
      expect(arr).toHaveLength(3);
      expect(new Set(arr.map((p) => p.id)).size).toBe(3);
    });

    it("数组中任一元素非法 → 抛 INVALID_PROFILE（原子导入）", () => {
      const bad = [{ ...profile("a"), id: 123 }, profile("b")];
      expect(() => parseProfilesFromJson(JSON.stringify(bad))).toThrow("INVALID_PROFILE");
    });

    it("非法 JSON → 抛 INVALID_PROFILE", () => {
      expect(() => parseProfilesFromJson("not json")).toThrow("INVALID_PROFILE");
    });
  });

  describe("dedupeImportedProfiles", () => {
    const profileFactory = (id: string): Profile => ({
      id,
      title: "t",
      requestHeaders: [],
      responseHeaders: [],
      redirects: [],
    });

    it("对已有 id 冲突生成新 id", () => {
      const result = dedupeImportedProfiles(
        [profileFactory("a"), profileFactory("a"), profileFactory("b")],
        ["a"],
      );
      expect(result).toHaveLength(3);
      expect(new Set(result.map((p) => p.id)).size).toBe(3);
      expect(result[0].id).not.toBe("a");
    });
  });

  describe("exportProfileToJson", () => {
    it("输出可被 parseProfileFromJson 还原", () => {
      const profile: Profile = {
        id: "test",
        title: "测试",
        requestHeaders: [
          {
            id: "h1",
            enabled: true,
            op: "add",
            name: "X-Custom",
            value: "custom-value",
            urlFilter: "",
            comment: "",
          },
        ],
        responseHeaders: [],
        redirects: [],
      };

      const json = exportProfileToJson(profile);
      const restored = parseProfileFromJson(json);

      expect(restored).toEqual(profile);
    });

    it("输出格式化的 JSON（包含缩进）", () => {
      const profile: Profile = {
        id: "test",
        title: "测试",
        requestHeaders: [],
        responseHeaders: [],
        redirects: [],
      };

      const json = exportProfileToJson(profile);
      expect(json).toContain('{\n  "id":');
    });
  });

  describe("profileExportFilename", () => {
    it("基于标题生成文件名，保留中英文与常见安全字符", () => {
      expect(profileExportFilename("测试环境")).toBe("headerlite-测试环境.json");
      expect(profileExportFilename("Prod_v2")).toBe("headerlite-Prod_v2.json");
    });

    it("非法字符替换为连字符，空标题回退通用名", () => {
      expect(profileExportFilename("a/b:c*?")).toBe("headerlite-a-b-c-.json");
      expect(profileExportFilename("   ")).toBe("headerlite-profile.json");
      expect(profileExportFilename("环境 配置")).toBe("headerlite-环境-配置.json");
    });
  });

  describe("工厂函数", () => {
    describe("createHeaderRow", () => {
      it("生成结构正确的 HeaderRow", () => {
        const row = createHeaderRow();

        expect(row).toMatchObject({
          enabled: true,
          op: "set",
          name: "",
          value: "",
          urlFilter: "",
          comment: "",
        });
        expect(typeof row.id).toBe("string");
        expect(row.id).not.toBe("");
      });

      it("id 每次生成不同", () => {
        const row1 = createHeaderRow();
        const row2 = createHeaderRow();
        expect(row1.id).not.toBe(row2.id);
      });

      it("可自定义 op", () => {
        const row = createHeaderRow("remove");
        expect(row.op).toBe("remove");
      });
    });

    describe("createRedirectRow", () => {
      it("生成结构正确的 RedirectRow", () => {
        const row = createRedirectRow();

        expect(row).toMatchObject({
          enabled: true,
          fromType: "urlFilter",
          from: "",
          to: "",
          comment: "",
        });
        expect(typeof row.id).toBe("string");
        expect(row.id).not.toBe("");
      });

      it("可自定义 fromType", () => {
        const row = createRedirectRow("regex");
        expect(row.fromType).toBe("regex");
      });
    });

    describe("createProfile", () => {
      it("生成结构正确的 Profile", () => {
        const profile = createProfile("新配置");

        expect(profile).toMatchObject({
          title: "新配置",
          requestHeaders: [],
          responseHeaders: [],
          redirects: [],
        });
        expect(typeof profile.id).toBe("string");
        expect(profile.id).not.toBe("");
      });

      it("id 每次生成不同", () => {
        const p1 = createProfile("a");
        const p2 = createProfile("b");
        expect(p1.id).not.toBe(p2.id);
      });
    });
  });
});
