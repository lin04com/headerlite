/**
 * DNR 规则构建器测试
 * 覆盖所有核心功能与边界情况
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRules } from '../src/dnr/ruleBuilder';
import type { Profile, HeaderRow, RedirectRow } from '../src/model/types';

// 辅助函数：创建一个测试用的 HeaderRow
function createHeaderRow(overrides?: Partial<HeaderRow>): HeaderRow {
  return {
    id: 'header-1',
    enabled: true,
    op: 'set',
    name: 'X-Test',
    value: 'test-value',
    urlFilter: '',
    comment: '',
    ...overrides,
  };
}

// 辅助函数：创建一个测试用的 RedirectRow
function createRedirectRow(overrides?: Partial<RedirectRow>): RedirectRow {
  return {
    id: 'redirect-1',
    enabled: true,
    fromType: 'urlFilter',
    from: 'https://example.com/*',
    to: 'https://redirected.com/',
    comment: '',
    ...overrides,
  };
}

// 辅助函数：创建一个测试用的 Profile
function createProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: 'profile-1',
    title: 'Test Profile',
    requestHeaders: [],
    responseHeaders: [],
    redirects: [],
    ...overrides,
  };
}

describe('ruleBuilder', () => {
  beforeEach(() => {
    // 清空 console.warn 的 mock
    vi.restoreAllMocks();
  });

  describe('buildRules - 基础过滤逻辑', () => {
    it('globalEnabled=false 时返回空数组', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow()],
      });

      const rules = buildRules(profile, false);

      expect(rules).toEqual([]);
    });

    it('activeProfile=null 时返回空数组', () => {
      const rules = buildRules(null, true);

      expect(rules).toEqual([]);
    });

    it('enabled=false 的行被跳过', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ enabled: true, name: 'X-Enabled' }),
          createHeaderRow({ enabled: false, name: 'X-Disabled' }),
          createHeaderRow({ enabled: true, name: 'X-Enabled-2' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(2);
      expect(rules[0].action.requestHeaders?.[0].header).toBe('X-Enabled');
      expect(rules[1].action.requestHeaders?.[0].header).toBe('X-Enabled-2');
    });

    it('name 为空的 header 行被跳过', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ name: 'X-Valid' }),
          createHeaderRow({ name: '' }),
          createHeaderRow({ name: '   ' }), // 空白视同空
          createHeaderRow({ name: 'X-Valid-2' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(2);
      expect(rules[0].action.requestHeaders?.[0].header).toBe('X-Valid');
      expect(rules[1].action.requestHeaders?.[0].header).toBe('X-Valid-2');
    });

    // 回归测试：非法 header 名会被 DNR schema 整批拒绝，须构建期跳过
    it('header 名非法（含空格/中文）的行被跳过并告警', () => {
      const warnSpy = vi.spyOn(console, 'warn');
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ name: 'X-Valid' }),
          createHeaderRow({ name: 'Bad Header' }), // 空格
          createHeaderRow({ name: 'X-头部' }), // 非 token 字符
          createHeaderRow({ name: 'X-Valid-2' }),
        ],
        responseHeaders: [createHeaderRow({ name: 'Bad:Res' })], // 冒号非法
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(2);
      expect(rules[0].action.requestHeaders?.[0].header).toBe('X-Valid');
      expect(rules[1].action.requestHeaders?.[0].header).toBe('X-Valid-2');
      expect(rules.every((r) => r.action.responseHeaders === undefined)).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    // 回归测试：DNR 同 priority 同 header 顺序歧义（官方文档），行序须映射为递增 priority
    it('priority 随行序递增，后行优先级更高（后行覆盖前行）', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ name: 'X-A', value: 'first' }),
          createHeaderRow({ name: 'X-B', value: 'second' }),
        ],
        responseHeaders: [createHeaderRow({ name: 'X-C' })],
        redirects: [createRedirectRow({ from: 'a', to: 'https://b.com/' })],
      });

      const rules = buildRules(profile, true);

      expect(rules.map((r) => r.priority)).toEqual([10000, 10001, 10002, 10003]);
      for (const rule of rules) {
        expect(rule.priority).toBe(rule.id);
      }
    });

    it('from 为空的 redirect 行被跳过', () => {
      const profile = createProfile({
        redirects: [
          createRedirectRow({ from: 'https://example.com/*' }),
          createRedirectRow({ from: '' }),
          createRedirectRow({ from: '   ' }), // 空白视同空
          createRedirectRow({ from: 'https://example.com/2/*' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(2);
    });
  });

  describe('buildRules - Header 操作映射', () => {
    it('set 操作映射到 DNR operation=set，且包含 value', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ op: 'set', name: 'X-Custom', value: 'custom-value' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      const rule = rules[0];
      expect(rule.action.type).toBe('modifyHeaders');
      expect(rule.action.requestHeaders).toHaveLength(1);
      expect(rule.action.requestHeaders?.[0]).toEqual({
        header: 'X-Custom',
        operation: 'set',
        value: 'custom-value',
      });
    });

    it('add 操作映射到 DNR operation=append，且包含 value', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ op: 'add', name: 'X-Add', value: 'added-value' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].action.requestHeaders?.[0].operation).toBe('append');
      expect(rules[0].action.requestHeaders?.[0].value).toBe('added-value');
    });

    it('remove 操作映射到 DNR operation=remove，且不带 value', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ op: 'remove', name: 'X-Remove', value: 'ignored' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      const headerAction = rules[0].action.requestHeaders?.[0];
      expect(headerAction?.operation).toBe('remove');
      expect(headerAction?.value).toBeUndefined();
      expect(headerAction).toEqual({ header: 'X-Remove', operation: 'remove' });
    });
  });

  describe('buildRules - 请求头/响应头规则', () => {
    it('正确生成请求头规则', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-Request', value: 'req-val' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].action.type).toBe('modifyHeaders');
      expect(rules[0].action.requestHeaders).toBeDefined();
      expect(rules[0].action.responseHeaders).toBeUndefined();
    });

    it('正确生成响应头规则', () => {
      const profile = createProfile({
        responseHeaders: [createHeaderRow({ name: 'X-Response', value: 'res-val' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].action.type).toBe('modifyHeaders');
      expect(rules[0].action.responseHeaders).toBeDefined();
      expect(rules[0].action.requestHeaders).toBeUndefined();
    });

    it('同时生成请求头和响应头规则', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-Req' })],
        responseHeaders: [createHeaderRow({ name: 'X-Res' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(2);
      expect(rules[0].action.requestHeaders).toBeDefined();
      expect(rules[1].action.responseHeaders).toBeDefined();
    });
  });

  describe('buildRules - websocket 资源类型', () => {
    // 回归测试：ws/wss 握手请求的资源类型是 websocket，resourceTypes 缺失时规则不生效
    it('请求头/响应头规则的 resourceTypes 包含 websocket', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-WS' })],
        responseHeaders: [createHeaderRow({ name: 'X-WS-Res' })],
      });

      const rules = buildRules(profile, true);

      expect(rules[0].condition.resourceTypes).toContain('websocket');
      expect(rules[1].condition.resourceTypes).toContain('websocket');
    });

    it('重定向规则不包含 websocket（维持原行为）', () => {
      const profile = createProfile({
        redirects: [createRedirectRow()],
      });

      const rules = buildRules(profile, true);

      expect(rules[0].condition.resourceTypes).not.toContain('websocket');
    });
  });

  describe('buildRules - 重定向规则', () => {
    it('fromType=urlFilter 时生成 urlFilter + redirect.url', () => {
      const profile = createProfile({
        redirects: [
          createRedirectRow({
            fromType: 'urlFilter',
            from: 'https://example.com/*',
            to: 'https://target.com/',
          }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      const rule = rules[0];
      expect(rule.action.type).toBe('redirect');
      expect(rule.action.redirect).toEqual({ url: 'https://target.com/' });
      expect(rule.condition).toEqual(
        expect.objectContaining({ urlFilter: 'https://example.com/*' }),
      );
      // modifyHeaders/redirect 规则必须带 resourceTypes，否则 DNR 不会匹配
      expect(rule.condition.resourceTypes?.length).toBeGreaterThan(0);
    });

    it('fromType=regex 时生成 regexFilter + regexSubstitution', () => {
      const profile = createProfile({
        redirects: [
          createRedirectRow({
            fromType: 'regex',
            from: 'https://example\\.com/(.*)',
            to: 'https://target.com/$1',
          }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      const rule = rules[0];
      expect(rule.action.type).toBe('redirect');
      expect(rule.action.redirect).toEqual({ regexSubstitution: 'https://target.com/$1' });
      expect(rule.condition).toEqual(
        expect.objectContaining({ regexFilter: 'https://example\\.com/(.*)' }),
      );
      expect(rule.condition.resourceTypes?.length).toBeGreaterThan(0);
    });

    it('非法 regex 的行被跳过，不抛异常', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      const profile = createProfile({
        redirects: [
          createRedirectRow({ fromType: 'regex', from: '[invalid(', to: 'https://target.com/' }),
          createRedirectRow({
            fromType: 'regex',
            from: 'https://valid\\.com',
            to: 'https://target.com/',
          }),
        ],
      });

      const rules = buildRules(profile, true);

      // 应该只生成一条有效规则
      expect(rules).toHaveLength(1);
      expect(rules[0].condition.regexFilter).toBe('https://valid\\.com');

      // 应该有警告日志
      expect(warnSpy).toHaveBeenCalledWith(
        '[HeaderLite] 无效的正则表达式，跳过规则: [invalid(',
      );
    });

    // 回归测试：to 为空会生成非法 redirect.url，使整批 updateDynamicRules 失败
    it('from 非空但 to 为空的行被跳过', () => {
      const profile = createProfile({
        redirects: [
          createRedirectRow({ from: 'https://a.com/*', to: '' }),
          createRedirectRow({ from: 'https://a.com/*', to: 'https://b.com/' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].action.redirect).toEqual({ url: 'https://b.com/' });
    });
  });

  describe('buildRules - ruleId 唯一性', () => {
    it('所有规则的 ruleId 互不相同，从 10000 起递增', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ name: 'X-1' }),
          createHeaderRow({ name: 'X-2' }),
        ],
        responseHeaders: [createHeaderRow({ name: 'X-3' })],
        redirects: [
          createRedirectRow({ from: 'https://a.com/*' }),
          createRedirectRow({ from: 'https://b.com/*' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(5);

      const ids = rules.map((r) => r.id);
      expect(ids).toEqual([10000, 10001, 10002, 10003, 10004]);

      // 验证唯一性
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe('buildRules - urlFilter 条件', () => {
    it('urlFilter 非空时进入 condition.urlFilter', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-Test', urlFilter: '||example.com^' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].condition).toEqual(expect.objectContaining({ urlFilter: '||example.com^' }));
      expect(rules[0].condition.urlFilter).toBe('||example.com^');
    });

    it('urlFilter 为空时只保留 resourceTypes（匹配所有 URL）', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-Test', urlFilter: '' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].condition.urlFilter).toBeUndefined();
      expect(rules[0].condition.resourceTypes?.length).toBeGreaterThan(0);
    });

    it('urlFilter 为空白字符时视为空，匹配所有', () => {
      const profile = createProfile({
        requestHeaders: [createHeaderRow({ name: 'X-Test', urlFilter: '   ' })],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(1);
      expect(rules[0].condition.urlFilter).toBeUndefined();
      expect(rules[0].condition.resourceTypes?.length).toBeGreaterThan(0);
    });

    // 回归测试：DNR 的 modifyHeaders/redirect 必须带 resourceTypes，否则不匹配（曾导致 e2e 全失败）
    it('所有生成的规则 condition 都带非空 resourceTypes', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ name: 'X-1' }),
          createHeaderRow({ name: 'X-2', urlFilter: '||a.com^' }),
        ],
        responseHeaders: [createHeaderRow({ name: 'X-3' })],
        redirects: [
          createRedirectRow({ from: 'https://a.com/*' }),
          createRedirectRow({ fromType: 'regex', from: '^http://old\\.' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(5);
      for (const rule of rules) {
        expect(rule.condition.resourceTypes?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildRules - 完整场景', () => {
    it('混合规则生成正确顺序和结构', () => {
      const profile = createProfile({
        requestHeaders: [
          createHeaderRow({ id: 'h1', name: 'X-Req-1', op: 'set', value: 'v1' }),
          createHeaderRow({ id: 'h2', name: 'X-Req-2', op: 'remove' }),
        ],
        responseHeaders: [createHeaderRow({ id: 'h3', name: 'X-Res-1', op: 'add', value: 'v3' })],
        redirects: [
          createRedirectRow({ id: 'r1', fromType: 'urlFilter', from: 'https://a.com/*', to: 'https://b.com/' }),
          createRedirectRow({ id: 'r2', fromType: 'regex', from: '^http://old\\.', to: 'https://new.com/' }),
        ],
      });

      const rules = buildRules(profile, true);

      expect(rules).toHaveLength(5);

      // 验证请求头 set 规则
      expect(rules[0].id).toBe(10000);
      expect(rules[0].action.requestHeaders?.[0]).toEqual({
        header: 'X-Req-1',
        operation: 'set',
        value: 'v1',
      });

      // 验证请求头 remove 规则（无 value）
      expect(rules[1].id).toBe(10001);
      expect(rules[1].action.requestHeaders?.[0]).toEqual({
        header: 'X-Req-2',
        operation: 'remove',
      });

      // 验证响应头 add 规则
      expect(rules[2].id).toBe(10002);
      expect(rules[2].action.responseHeaders?.[0].operation).toBe('append');

      // 验证重定向规则
      expect(rules[3].id).toBe(10003);
      expect(rules[3].action.type).toBe('redirect');
    });
  });
});
