/**
 * 持久化数据层 - 封装 chrome.storage.local 读写与状态管理
 * 职责：状态存储、导入导出、工厂函数、schema 校验
 */

import type {
  AppState,
  Profile,
  HeaderRow,
  RedirectRow,
  HeaderOp,
  RedirectFromType,
} from "../model/types";
import { STATE_SCHEMA_VERSION } from "../model/types";

export const STORAGE_KEY = "state";

/** state 损坏时，重置前把原始数据备份到该 key，避免静默清空全部配置 */
export const CORRUPT_BACKUP_KEY = "state.corrupt.bak";

/** 默认状态：含一个名为"默认配置"的 profile（id 固定为 'default'），已激活，总开关开。 
 *  预置中性示例配置：不包含敏感/真实字段。 */
export const DEFAULT_STATE: AppState = {
  version: STATE_SCHEMA_VERSION,
  profiles: [
    {
      id: "default",
      title: "默认配置",
      requestHeaders: [],
      responseHeaders: [],
      redirects: [],
    },
  ],
  activeProfileId: "default",
  globalEnabled: true,
};

/**
 * 结构校验：检查顶层字段类型是否完整（不深查 profile 内部行，那是 import 的职责）。
 * load 读的是自身 saveState 写入的数据，只需防 storage 层面的整体损坏。
 */
function isValidAppStateShape(raw: unknown): raw is AppState {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.version === "number" &&
    Array.isArray(obj.profiles) &&
    (typeof obj.activeProfileId === "string" || obj.activeProfileId === null) &&
    typeof obj.globalEnabled === "boolean"
  );
}

/**
 * 读 storage.local[STORAGE_KEY]；不存在/解析失败/结构损坏 → 返回 DEFAULT_STATE 并写回
 */
export async function loadState(): Promise<AppState> {
  const { [STORAGE_KEY]: raw } = await chrome.storage.local.get(STORAGE_KEY);

  if (!raw) {
    await saveState(DEFAULT_STATE);
    return DEFAULT_STATE;
  }

  try {
    const parsed = JSON.parse(raw as string);
    if (isValidAppStateShape(parsed)) {
      return parsed;
    }
  } catch {
    // JSON 解析失败，回退默认
  }

  // 备份损坏的原始数据再重置，用户配置可人工找回
  await chrome.storage.local.set({ [CORRUPT_BACKUP_KEY]: raw });
  await saveState(DEFAULT_STATE);
  return DEFAULT_STATE;
}

/**
 * 整体写入
 */
export async function saveState(state: AppState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(state) });
}

/**
 * 读-改-写原子封装。读出当前 state，应用 updater 得到新 state，写回，返回新 state。
 * UI 所有状态变更统一走这里，保证不丢字段。
 *
 * 通过 promise 链串行化，避免多次并发调用读到同一基线导致后写覆盖先写。
 */
let patchChain: Promise<unknown> = Promise.resolve();
export async function patchState(updater: (s: AppState) => AppState): Promise<AppState> {
  const run = patchChain.then(async () => {
    const current = await loadState();
    const next = updater(current);
    await saveState(next);
    return next;
  });
  // 失败不阻断后续调用：吞掉错误但保持链不断
  patchChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * 校验导入的 profile 对象是否符合 schema；不合法抛 Error('INVALID_PROFILE')
 * 宽松处理多余字段（忽略）
 */
export function validateImportedProfile(raw: unknown): Profile {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("INVALID_PROFILE");
  }

  const obj = raw as Record<string, unknown>;

  // 校验必填字段类型
  if (typeof obj.id !== "string") {
    throw new Error("INVALID_PROFILE");
  }
  if (typeof obj.title !== "string") {
    throw new Error("INVALID_PROFILE");
  }
  if (!Array.isArray(obj.requestHeaders)) {
    throw new Error("INVALID_PROFILE");
  }
  if (!Array.isArray(obj.responseHeaders)) {
    throw new Error("INVALID_PROFILE");
  }
  if (!Array.isArray(obj.redirects)) {
    throw new Error("INVALID_PROFILE");
  }

  // 校验数组元素类型
  const validHeaderOps = new Set<HeaderOp>(["set", "add", "remove"]);
  const validRedirectFromTypes = new Set<RedirectFromType>(["urlFilter", "regex"]);

  for (const row of obj.requestHeaders as unknown[]) {
    if (!validateHeaderRow(row, validHeaderOps)) {
      throw new Error("INVALID_PROFILE");
    }
  }

  for (const row of obj.responseHeaders as unknown[]) {
    if (!validateHeaderRow(row, validHeaderOps)) {
      throw new Error("INVALID_PROFILE");
    }
  }

  for (const row of obj.redirects as unknown[]) {
    if (!validateRedirectRow(row, validRedirectFromTypes)) {
      throw new Error("INVALID_PROFILE");
    }
  }

  // 剥离多余字段，只保留白名单字段
  return {
    id: obj.id as string,
    title: obj.title as string,
    requestHeaders: obj.requestHeaders as HeaderRow[],
    responseHeaders: obj.responseHeaders as HeaderRow[],
    redirects: obj.redirects as RedirectRow[],
  };
}

/**
 * 按既有 ID 集合去重入参 profile 的 id；冲突则生成新 uuid，避免导入后覆盖/混淆
 */
export function dedupeImportedProfiles(
  incomingProfiles: Profile[],
  reservedIds: Iterable<string> = [],
): Profile[] {
  const usedIds = new Set(reservedIds);

  return incomingProfiles.map((profile) => {
    if (!usedIds.has(profile.id)) {
      usedIds.add(profile.id);
      return profile;
    }

    const deduped: Profile = { ...profile };

    do {
      deduped.id = crypto.randomUUID();
    } while (usedIds.has(deduped.id));

    usedIds.add(deduped.id);
    return deduped;
  });
}

/**
 * 校验单个 HeaderRow 是否符合 schema
 */
function validateHeaderRow(raw: unknown, validOps: Set<HeaderOp>): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string") return false;
  if (typeof obj.enabled !== "boolean") return false;
  if (typeof obj.op !== "string" || !validOps.has(obj.op as HeaderOp)) return false;
  if (typeof obj.name !== "string") return false;
  if (typeof obj.value !== "string") return false;
  if (typeof obj.urlFilter !== "string") return false;
  if (typeof obj.comment !== "string") return false;

  return true;
}

/**
 * 校验单个 RedirectRow 是否符合 schema
 */
function validateRedirectRow(raw: unknown, validFromTypes: Set<RedirectFromType>): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string") return false;
  if (typeof obj.enabled !== "boolean") return false;
  if (typeof obj.fromType !== "string" || !validFromTypes.has(obj.fromType as RedirectFromType))
    return false;
  if (typeof obj.from !== "string") return false;
  if (typeof obj.to !== "string") return false;
  if (typeof obj.comment !== "string") return false;

  return true;
}

/**
 * 导出文件名：基于 profile 标题生成，保留中英文/数字/下划线/连字符，
 * 其余字符替换为 '-'；标题为空时回退通用名，避免多次导出同名互相覆盖
 */
export function profileExportFilename(title: string): string {
  const safe = title.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-");
  return safe ? `headerlite-${safe}.json` : "headerlite-profile.json";
}

/**
 * 导出 profile 为格式化 JSON 字符串
 */
export function exportProfileToJson(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * 解析 JSON 字符串为 profile，内部调 validate；失败抛 Error('INVALID_PROFILE')
 */
export function parseProfileFromJson(json: string): Profile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("INVALID_PROFILE");
  }

  return validateImportedProfile(parsed);
}

/**
 * 解析 JSON 字符串为 profile 数组，兼容单个对象和数组两种格式：
 * - `{...}`  → [profile]
 * - `[{...},{...}]` → [profile, profile]
 * 任一元素校验失败则整体抛 Error('INVALID_PROFILE')（原子导入，不全则不导入）。
 */
export function parseProfilesFromJson(json: string): Profile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("INVALID_PROFILE");
  }
  if (Array.isArray(parsed)) {
    return dedupeImportedProfiles(parsed.map((item) => validateImportedProfile(item)));
  }
  return dedupeImportedProfiles([validateImportedProfile(parsed)]);
}

/**
 * 工厂函数：创建 HeaderRow
 */
export function createHeaderRow(op?: HeaderOp): HeaderRow {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    op: op ?? "set",
    name: "",
    value: "",
    urlFilter: "",
    comment: "",
  };
}

/**
 * 工厂函数：创建 RedirectRow
 */
export function createRedirectRow(fromType?: RedirectFromType): RedirectRow {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    fromType: fromType ?? "urlFilter",
    from: "",
    to: "",
    comment: "",
  };
}

/**
 * 工厂函数：创建 Profile
 */
export function createProfile(title: string): Profile {
  return {
    id: crypto.randomUUID(),
    title,
    requestHeaders: [],
    responseHeaders: [],
    redirects: [],
  };
}
