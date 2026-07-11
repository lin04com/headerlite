// E2E：加载 HeaderLite 扩展，验证请求头注入、响应头注入、重定向三类核心能力。
// 用本地 echo server 反射请求头，避免依赖时好时坏的 httpbin。
// 扩展必须 headed 模式（Chromium 旧 headless 不支持 --load-extension）。
import { chromium } from 'playwright';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PROFILE_DIR = '/tmp/mh-e2e-profile';
fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
const log = (...a) => console.log(...a);

// 本地 echo server：反射请求头为 JSON（Chrome 会把 JSON 渲染进 <pre>）
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ headers: req.headers, url: req.url }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const ECHO = `http://127.0.0.1:${PORT}`;

// WebSocket echo：完成 RFC6455 握手后，把握手请求头以文本帧回传（用于断言 DNR 对 ws:// 注入的请求头）
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const payload = Buffer.from(JSON.stringify({ headers: req.headers }));
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; // FIN + text
    header[1] = 126; // 16 位扩展长度，服务端帧不掩码
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127; // 64 位扩展长度
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
  setTimeout(() => socket.destroy(), 2000);
});
log('echo server:', ECHO);

const state = {
  version: 1,
  profiles: [{
    id: 'p1',
    title: 'e2e',
    requestHeaders: [
      { id: 'h1', enabled: true, op: 'set', name: 'X-E2E-Req', value: 'injected', urlFilter: '', comment: '' },
      { id: 'h2', enabled: true, op: 'set', name: 'X-E2E-2nd', value: 'second', urlFilter: '', comment: '' },
    ],
    responseHeaders: [],
    redirects: [
      { id: 'r1', enabled: true, fromType: 'urlFilter', from: 'e2e-redirect-from',
        to: `${ECHO}/anything/e2e-redirect-to`, comment: '' },
    ],
  }],
  activeProfileId: 'p1',
  globalEnabled: true,
};

const errors = [];

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`,
      '--no-first-run', '--no-default-browser-check'],
  });
  ctx.on('weberror', (e) => errors.push('weberror: ' + e.error().message));
  ctx.on('serviceworker', (sw) => {
    sw.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') log('[SW]', m.type(), m.text()); });
  });

  let extId = '';
  for (let i = 0; i < 30 && !extId; i++) {
    const sw = ctx.serviceWorkers()[0];
    if (sw && sw.url()) extId = new URL(sw.url()).host;
    if (!extId) await new Promise((r) => setTimeout(r, 300));
  }
  log('extension id:', extId);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // 注入 state（saveState 存的是 JSON 字符串）
  await page.goto(`chrome-extension://${extId}/src/options/index.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async (s) => { await chrome.storage.local.set({ state: JSON.stringify(s) }); }, state);
  log('seeded storage.state');
  await page.waitForTimeout(1500);

  const rules = await page.evaluate(async () => chrome.declarativeNetRequest.getDynamicRules());
  log('DNR 动态规则数:', rules.length, '| ids:', rules.map((r) => r.id).join(','));

  const testPage = await ctx.newPage();

  // 1. 请求头：导航到 echo/headers，body 里应见 X-E2E-Req
  await testPage.goto(`${ECHO}/headers`);
  const reqBody = (await testPage.locator('pre').textContent()) || '';
  const reqOk = /X-E2E-Req/i.test(reqBody);
  log('请求头 X-E2E-Req 注入:', reqOk ? 'PASS' : 'FAIL');

  // 2. 响应头：加裸 content-type 规则，从 testPage fetch 读（不触发下载）
  await page.evaluate(async () => {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: 88888, priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: [{ header: 'content-type', operation: 'set', value: 'application/x-dnr-resp-test' }] },
        condition: { resourceTypes: ['main_frame', 'xmlhttprequest'] },
      }],
    });
  });
  const ct = await testPage.evaluate(async (echo) => {
    const r = await fetch(`${echo}/headers`, { cache: 'no-store' });
    return r.headers.get('content-type');
  }, ECHO);
  const respOk = !!ct && ct.includes('x-dnr-resp-test');
  log('渲染层读到的 content-type:', ct);
  log('响应头修改:', respOk ? 'PASS' : 'FAIL');
  await page.evaluate(async () => {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [88888] });
  });

  // 3. 重定向
  await testPage.goto(`${ECHO}/anything/e2e-redirect-from`);
  const finalUrl = testPage.url();
  const redirOk = finalUrl.includes('e2e-redirect-to');
  log('重定向最终 URL:', finalUrl);
  log('重定向:', redirOk ? 'PASS' : 'FAIL');

  // 4. WebSocket：从页面发起 ws:// 连接，握手请求头里应见 X-E2E-Req（resourceTypes 含 websocket）
  const wsBody = await testPage.evaluate(
    (wsUrl) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => reject(new Error('ws message timeout')), 5000);
        ws.onmessage = (e) => {
          clearTimeout(timer);
          resolve(String(e.data));
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('ws error'));
        };
      }),
    `ws://127.0.0.1:${PORT}/ws-echo`,
  );
  const wsOk = /X-E2E-Req/i.test(wsBody);
  log('WebSocket 握手头 X-E2E-Req 注入:', wsOk ? 'PASS' : 'FAIL');
  // 5. UI 改值：在扩展页（options 载同款 App）编辑请求头值 → 300ms 防抖落盘 → DNR 重建 → 新请求生效
  // 回归背景：useAppState 曾因 ref 同步 effect 丢失导致所有 UI 编辑不生效，存储直灌的测试覆盖不到
  await page.locator('input[placeholder="值"]').first().fill('updated-value');
  await page.waitForTimeout(1500);
  const ruleVal = await page.evaluate(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.find((r) => r.id === 10000)?.action.requestHeaders?.[0]?.value;
  });
  await testPage.goto(`${ECHO}/headers?v=update`);
  const updBody = (await testPage.locator('pre').textContent()) || '';
  const updOk = ruleVal === 'updated-value' && /updated-value/i.test(updBody) && !/injected/i.test(updBody);
  log('UI 改值 → 规则重建 → 请求生效:', updOk ? 'PASS' : 'FAIL', `(规则值=${JSON.stringify(ruleVal)})`);

  // 6. 行拖拽：首行拖到次行下 → 行序变化 → DNR priority 重排（行序即优先级）
  const prioOf = (rulesArr) => Object.fromEntries(
    rulesArr.map((r) => [r.action.requestHeaders?.[0]?.header, r.priority]),
  );
  const before = prioOf(await page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()));
  const firstHandle = page.locator('tbody tr').first().locator('.drag-handle');
  const secondRow = page.locator('tbody tr').nth(1);
  await firstHandle.dragTo(secondRow);
  await page.waitForTimeout(1500);
  const after = prioOf(await page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()));
  const dragOk = before['X-E2E-Req'] < before['X-E2E-2nd'] && after['X-E2E-Req'] > after['X-E2E-2nd'];
  log('拖拽排序 → 行序即优先级:', dragOk ? 'PASS' : 'FAIL',
    `(before=${JSON.stringify(before)} after=${JSON.stringify(after)})`);

  log('\n--- 运行期错误 ---');
  log(errors.length ? errors.join('\n') : '(无)');

  log('\n=== E2E RESULT ===');
  log('request-header :', reqOk ? 'PASS' : 'FAIL');
  log('response-header:', respOk ? 'PASS' : 'FAIL');
  log('redirect       :', redirOk ? 'PASS' : 'FAIL');
  log('ws-request-header:', wsOk ? 'PASS' : 'FAIL');
  log('ui-update       :', updOk ? 'PASS' : 'FAIL');
  log('row-drag        :', dragOk ? 'PASS' : 'FAIL');
  await ctx.close();
  server.close();
  process.exit(reqOk && respOk && redirOk && wsOk && updOk && dragOk ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); server.close(); process.exit(2); });
