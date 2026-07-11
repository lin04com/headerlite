/**
 * DNR 规则构建器
 * 职责：把 Profile 数据模型转换为 chrome.declarativeNetRequest.Rule 数组
 * 纯函数，无浏览器 API 调用，可独立测试
 */

import type { Profile, HeaderRow, RedirectRow } from '../model/types';

/** DNR Rule 类型直接用 @types/chrome 提供的全局类型 */
type DnrRule = chrome.declarativeNetRequest.Rule;

/** ruleId 起始值，采用扁平递增方案保证唯一性 */
const RULE_ID_BASE = 10000;

/**
 * 合法 header 名（RFC 7230 token）。非法名会被 DNR schema 校验拒绝，
 * 导致整批 updateDynamicRules 失败、跌入逐条降级路径，故在构建期预校验。
 */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * 规则匹配的资源类型 —— DNR 的 modifyHeaders / redirect 规则要求 condition 必须显式
 * 指定 resourceTypes，否则规则不会匹配任何请求（实测：省略时整条规则不生效）。
 * 这里覆盖常见的 web 请求类型，使规则作用于导航与各类子资源。
 */
const RESOURCE_TYPES: `${chrome.declarativeNetRequest.ResourceType}`[] = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'xmlhttprequest',
  'media',
  'other',
];

/**
 * Header 规则的匹配类型：在 RESOURCE_TYPES 基础上追加 websocket，
 * 使 set/add/remove 同样作用于 ws:// 与 wss:// 的握手请求。
 * 重定向规则维持 RESOURCE_TYPES（重定向 WebSocket 握手无意义）。
 */
const HEADER_RESOURCE_TYPES: `${chrome.declarativeNetRequest.ResourceType}`[] = [
  ...RESOURCE_TYPES,
  'websocket',
];

/**
 * 把激活的 profile 转成 DNR 动态规则集。
 *
 * @param activeProfile - 当前激活的 Profile，null 表示无激活
 * @param globalEnabled - 总开关状态，false 时返回空数组
 * @returns 用于 chrome.declarativeNetRequest.updateDynamicRules 的 addRules 数组
 *
 * 规则构建逻辑：
 * - globalEnabled === false 或 activeProfile === null → 返回 []
 * - 跳过 enabled === false 的行
 * - 跳过 header.name 为空的行；跳过 header.name 非法的行（RFC 7230 token 预校验，防整批 DNR 更新失败）
 * - priority = ruleId 随行序递增：DNR 同 priority 同 header 修改顺序歧义，行序即优先级（后行覆盖前行）
 * - 跳过 redirect.from 或 redirect.to 为空的行（to 为空会生成非法 redirect.url，导致整批 updateDynamicRules 失败）
 * - regex 类型(fromType==='regex')的 redirect：用 new RegExp(from) 预校验，编译失败则跳过该行并 console.warn，不抛异常
 * - ruleId 扁平递增：从 RULE_ID_BASE 起，按顺序递增（同一时刻只有一个激活 profile，所以只需保证本次生成的规则内唯一）
 */
export function buildRules(activeProfile: Profile | null, globalEnabled: boolean): DnrRule[] {
  // 全局开关关闭或无激活 profile，返回空规则集
  if (!globalEnabled || activeProfile === null) {
    return [];
  }

  const rules: DnrRule[] = [];
  let nextId = RULE_ID_BASE;

  // 处理请求头规则（header 名预校验：非法 token 会被 DNR 整批拒绝）
  for (const row of activeProfile.requestHeaders) {
    if (!row.enabled || !row.name.trim()) {
      continue;
    }
    if (!HEADER_NAME_RE.test(row.name.trim())) {
      console.warn(`[HeaderLite] 无效的 header 名，跳过规则: ${row.name}`);
      continue;
    }
    rules.push(buildHeaderRule(row, 'request', nextId++));
  }

  // 处理响应头规则（同上预校验）
  for (const row of activeProfile.responseHeaders) {
    if (!row.enabled || !row.name.trim()) {
      continue;
    }
    if (!HEADER_NAME_RE.test(row.name.trim())) {
      console.warn(`[HeaderLite] 无效的 header 名，跳过规则: ${row.name}`);
      continue;
    }
    rules.push(buildHeaderRule(row, 'response', nextId++));
  }

  // 处理重定向规则
  for (const row of activeProfile.redirects) {
    if (!row.enabled || !row.from.trim() || !row.to.trim()) {
      continue;
    }

    // regex 类型需要预校验，编译失败则跳过
    if (row.fromType === 'regex') {
      try {
        new RegExp(row.from);
      } catch (e) {
        console.warn(`[HeaderLite] 无效的正则表达式，跳过规则: ${row.from}`);
        continue;
      }
    }

    rules.push(buildRedirectRule(row, nextId++));
  }

  return rules;
}

/**
 * 构建单个请求头或响应头规则
 */
function buildHeaderRule(row: HeaderRow, kind: 'request' | 'response', id: number): DnrRule {
  // op 映射：'set' → 'set', 'add' → 'append', 'remove' → 'remove'
  // 使用 as const 确保字面量类型与 @types/chrome 兼容
  const operationMap = {
    set: 'set',
    add: 'append',
    remove: 'remove',
  } as const;

  const operation = operationMap[row.op] as chrome.declarativeNetRequest.HeaderOperation;

  // DNR 的 remove 操作不带 value 字段
  const headerAction =
    row.op === 'remove'
      ? { header: row.name, operation }
      : { header: row.name, operation, value: row.value };

  const condition = row.urlFilter.trim()
    ? { urlFilter: row.urlFilter, resourceTypes: HEADER_RESOURCE_TYPES }
    : { resourceTypes: HEADER_RESOURCE_TYPES };

  const rule: DnrRule = {
    id,
    // priority 随行序递增：DNR 同 priority 的同 header 修改顺序歧义（官方文档），
    // 行序即优先级——后行覆盖前行，与 UI 直觉一致
    priority: id,
    action: {
      type: 'modifyHeaders',
      // 根据类型选择 requestHeaders 或 responseHeaders
      ...(kind === 'request'
        ? { requestHeaders: [headerAction] }
        : { responseHeaders: [headerAction] }),
    },
    condition,
  };

  return rule;
}

/**
 * 构建单个重定向规则
 */
function buildRedirectRule(row: RedirectRow, id: number): DnrRule {
  const rule: DnrRule = {
    id,
    // 行序优先级（与 header 规则一致；redirect 与 modifyHeaders 不冲突，仅保持统一）
    priority: id,
    action: {
      type: 'redirect',
      // 根据 fromType 选择 redirect 字段
      redirect:
        row.fromType === 'urlFilter'
          ? { url: row.to }
          : { regexSubstitution: row.to },
    },
    condition: {
      resourceTypes: RESOURCE_TYPES,
      ...(row.fromType === 'urlFilter' ? { urlFilter: row.from } : { regexFilter: row.from }),
    },
  };

  return rule;
}
