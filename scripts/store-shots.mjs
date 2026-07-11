// 生成 Chrome Web Store 截图（1280×800 逻辑分辨率，DSF=2 高清）
// 用法：node scripts/store-shots.mjs （依赖 dist/ 已构建）
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const OUT = path.resolve(__dirname, '../docs/store-assets');
fs.mkdirSync(OUT, { recursive: true });
const PROFILE_DIR = '/tmp/mh-store-shots';
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
const log = (...a) => console.log(...a);

// 演示数据（值均为明显假数据，避免审核观感问题）
const state = {
  version: 1,
  profiles: [
    {
      id: 'demo', title: '联调环境',
      requestHeaders: [
        { id: 'r1', enabled: true, op: 'set', name: 'X-Demo-Token', value: 'dev-token-123', urlFilter: '', comment: '调试令牌' },
        { id: 'r2', enabled: true, op: 'set', name: 'Authorization', value: 'Bearer dev-jwt-abc', urlFilter: '||api.example.com^', comment: '' },
        { id: 'r3', enabled: true, op: 'set', name: 'X-WS-Token', value: 'ws-secret-1', urlFilter: '|ws://api.example.com', comment: '仅 WebSocket' },
        { id: 'r4', enabled: true, op: 'remove', name: 'X-Deprecated', value: '', urlFilter: '', comment: '' },
      ],
      responseHeaders: [
        { id: 's1', enabled: true, op: 'set', name: 'Cache-Control', value: 'no-store', urlFilter: '||api.example.com^', comment: '联调禁缓存' },
      ],
      redirects: [
        { id: 'd1', enabled: true, fromType: 'urlFilter', from: '||api.example.com/v1/', to: 'http://127.0.0.1:3000/v1/', comment: '转发到本地' },
      ],
    },
    { id: 'demo2', title: '压测环境', requestHeaders: [], responseHeaders: [], redirects: [] },
  ],
  activeProfileId: 'demo',
  globalEnabled: true,
};

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run', '--no-default-browser-check'],
});

let extId = '';
for (let i = 0; i < 30 && !extId; i++) {
  const sw = ctx.serviceWorkers()[0];
  if (sw && sw.url()) extId = new URL(sw.url()).host;
  if (!extId) await new Promise((r) => setTimeout(r, 300));
}
log('extension id:', extId);

const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${extId}/src/options/index.html`);
await opts.waitForLoadState('domcontentloaded');
await opts.evaluate(async (s) => { await chrome.storage.local.set({ state: JSON.stringify(s) }); }, state);
await opts.waitForTimeout(1500);

// 1) options 全景
await opts.screenshot({ path: path.join(OUT, 'screenshot-1-options.png') });
log('shot 1: options 全景');

// 2) 重命名内联编辑态
await opts.getByRole('button', { name: '重命名' }).click();
await opts.waitForTimeout(300);
await opts.screenshot({ path: path.join(OUT, 'screenshot-2-rename.png') });
log('shot 2: 内联重命名');
await opts.keyboard.press('Escape');

// 3) popup 居中展示（body 固定 560px 需覆盖；短值数据避免窄列截断观感）
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 1280, height: 800 });
await popup.goto(`chrome-extension://${extId}/src/popup/index.html`);
await popup.waitForLoadState('domcontentloaded');
const compactState = {
  ...state,
  profiles: [
    {
      id: 'demo', title: '联调环境',
      requestHeaders: [
        { id: 'r1', enabled: true, op: 'set', name: 'X-Token', value: 'dev-123', urlFilter: '', comment: '' },
        { id: 'r2', enabled: true, op: 'set', name: 'X-Api-Key', value: 'key-abc', urlFilter: '||api.com^', comment: '' },
        { id: 'r3', enabled: true, op: 'remove', name: 'Cookie', value: '', urlFilter: '', comment: '' },
      ],
      responseHeaders: [
        { id: 's1', enabled: true, op: 'set', name: 'Cache-Control', value: 'no-store', urlFilter: '', comment: '' },
      ],
      redirects: [],
    },
  ],
};
await popup.evaluate(async (s) => { await chrome.storage.local.set({ state: JSON.stringify(s) }); }, compactState);
await popup.waitForTimeout(800);
await popup.addStyleTag({ content: `
  html, body { width: 100% !important; }
  body { margin: 0; background: #e8ecf1; display: flex; justify-content: center; align-items: flex-start; padding-top: 56px; }
  body > .app { width: 560px; box-shadow: 0 8px 32px rgba(0,0,0,.18); border-radius: 8px; overflow: hidden; }
` });
await popup.waitForTimeout(400);
await popup.screenshot({ path: path.join(OUT, 'screenshot-3-popup.png') });
log('shot 3: popup');
await ctx.close();

// 降采样至 CWS 标准尺寸（2x 超采样降回，更锐；CWS 要求恰好 1280×800）
const { execSync } = await import('node:child_process');
execSync('sips -z 800 1280 screenshot-1-options.png screenshot-2-rename.png screenshot-3-popup.png', { cwd: OUT });
log('已降采样至 1280x800');
process.exit(0);
