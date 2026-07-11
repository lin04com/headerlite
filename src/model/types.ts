// 核心数据模型 —— 全模块共享契约，主控维护，worker 不得改动

/** Header 操作类型，对应 DNR modifyHeaders 的 operation */
export type HeaderOp = 'set' | 'add' | 'remove';

/** 一行 Header 规则（请求头或响应头通用） */
export interface HeaderRow {
  id: string;
  enabled: boolean;
  op: HeaderOp;
  /** Header 名，如 "X-Test" */
  name: string;
  /** Header 值；op='remove' 时可空 */
  value: string;
  /** DNR urlFilter，空串表示匹配所有请求 */
  urlFilter: string;
  /** 备注 */
  comment: string;
}

/** 重定向匹配方式 */
export type RedirectFromType = 'urlFilter' | 'regex';

/** 一行重定向规则 */
export interface RedirectRow {
  id: string;
  enabled: boolean;
  fromType: RedirectFromType;
  /** urlFilter 或 regex 字符串 */
  from: string;
  /** 目标 URL；regex 模式下支持 $1/$2 反向引用 */
  to: string;
  comment: string;
}

/** 一个配置：一组请求头/响应头/重定向规则 */
export interface Profile {
  id: string;
  title: string;
  requestHeaders: HeaderRow[];
  responseHeaders: HeaderRow[];
  redirects: RedirectRow[];
}

/** 全局状态 schema */
export interface AppState {
  /** schema 版本，用于后续迁移 */
  version: number;
  profiles: Profile[];
  /** 当前激活的 profile id；null 表示无激活 */
  activeProfileId: string | null;
  /** 总开关；false 时所有规则不生效 */
  globalEnabled: boolean;
}

export const STATE_SCHEMA_VERSION = 1;
