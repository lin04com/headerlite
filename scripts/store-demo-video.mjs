// 录制 CWS 审核用演示视频（~30s）：规则注入 → UI 添加 → 拖拽 → 总开关
// 产物：docs/store-assets/demo.mp4
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const OUT = path.resolve(__dirname, '../docs/store-assets');
const VIDEO_TMP = '/tmp/mh-video-raw';
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const PROFILE_DIR = '/tmp/mh-demo-video';
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'demo.webm'), { force: true });
const log = (...a) => console.log(...a);

// 本地 echo：反射请求头为 JSON
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ headers: req.headers, url: req.url }, null, 2));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ECHO = `http://127.0.0.1:${server.address().port}`;

const state = {
  version: 1,
  profiles: [{
    id: 'demo', title: '联调环境',
    requestHeaders: [
      { id: 'r1', enabled: true, op: 'set', name: 'X-Token', value: 'dev-123', urlFilter: '', comment: '' },
    ],
    responseHeaders: [], redirects: [],
  }],
  activeProfileId: 'demo', globalEnabled: true,
};

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  slowMo: 150,
  recordVideo: { dir: VIDEO_TMP, size: { width: 1280, height: 800 } },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run', '--no-default-browser-check'],
});

let extId = '';
for (let i = 0; i < 30 && !extId; i++) {
  const sw = ctx.serviceWorkers()[0];
  if (sw && sw.url()) extId = new URL(sw.url()).host;
  if (!extId) await new Promise((r) => setTimeout(r, 300));
}

const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${extId}/src/options/index.html`);
await ext.waitForLoadState('domcontentloaded');
await ext.evaluate(async (s) => { await chrome.storage.local.set({ state: JSON.stringify(s) }); }, state);
await ext.waitForTimeout(1200);

// 场景 1：请求头注入生效（echo 反射）
const web = await ctx.newPage();
await web.goto(`${ECHO}/headers`);
await web.waitForTimeout(2600);

// 场景 2：UI 添加一条新 header
await ext.bringToFront();
await ext.getByRole('button', { name: '添加一行' }).first().click();
const newRow = ext.locator('tbody tr').last();
await newRow.locator('input[placeholder="Header 名"]').fill('X-Env');
await newRow.locator('input[placeholder="值"]').first().fill('staging');
await ext.waitForTimeout(1800); // 防抖落盘 + DNR 重建

// 场景 3：新请求带上新头
await web.bringToFront();
await web.goto(`${ECHO}/headers?v=2`);
await web.waitForTimeout(2600);

// 场景 4：拖拽调整行序（优先级）
await ext.bringToFront();
await ext.locator('tbody tr .drag-handle').first().dragTo(ext.locator('tbody tr').nth(1));
await ext.waitForTimeout(1500);

// 场景 5：总开关关闭 → 头消失
await ext.locator('.switch').click();
await ext.waitForTimeout(1500);
await web.bringToFront();
await web.goto(`${ECHO}/headers?v=3`);
await web.waitForTimeout(2600);

// 收尾：恢复开启
await ext.bringToFront();
await ext.locator('.switch').click();
await ext.waitForTimeout(800);

const video = web.video(); // 任一 page 的 video 对象都能拿到该 context 的录制路径
const savedPath = await video.path();
await ctx.close();

const finalPath = path.join(OUT, 'demo.webm');
fs.copyFileSync(savedPath, finalPath);
fs.rmSync(path.dirname(savedPath), { recursive: true, force: true });
const kb = Math.round(fs.statSync(finalPath).size / 1024);
log('视频已保存:', finalPath, `(${kb} KB)`);
server.close();
process.exit(0);
