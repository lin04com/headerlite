// 由 promo-tile.html 生成两种尺寸宣传图：1400×560（主图）与 440×280（小图）
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/store-assets');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 560 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${path.resolve(__dirname, 'promo-tile.html')}`);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, 'promo-1400x560.png') });
console.log('promo-1400x560.png ✓');

// 小图：zoom 等比缩放（Chromium 支持，布局保持）
await page.setViewportSize({ width: 440, height: 280 });
await page.addStyleTag({ content: 'body { zoom: 0.3143; }' });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'promo-440x280.png') });
console.log('promo-440x280.png ✓');

// 降采样至 CWS 标准尺寸（2x 超采样降回）
const { execSync } = await import('node:child_process');
execSync('sips -z 560 1400 promo-1400x560.png && sips -z 280 440 promo-440x280.png', { cwd: OUT });

await browser.close();
process.exit(0);
