import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.emulateMedia({ media: 'print' });
  for (const mode of ['caisse', 'bordereau']) for (const [paper, content, offset] of [[80, 70, -4], [80, 76, 0], [57, 48, 0], [70, 70, 0]]) {
    await page.goto(`file:///tmp/gar-convoi-pos/${mode}.html`);
    await page.evaluate(([p, c, x]) => {
      const style = document.documentElement.style;
      style.setProperty('--impression-largeur-papier', `${p}mm`);
      style.setProperty('--impression-largeur-contenu', `${c}mm`);
      style.setProperty('--impression-decalage-x', `${x}mm`);
    }, [paper, content, offset]);
    const errors = await page.evaluate(() => {
      const root = document.querySelector('.ticket-recu').getBoundingClientRect();
      return [...document.querySelectorAll('.ticket-recu *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > root.right + 1 || r.left < root.left - 1 || el.scrollWidth > el.clientWidth + 1);
      }).map(el => el.tagName + ':' + el.textContent.slice(0, 40));
    });
    assert.deepEqual(errors, [], `${mode} ${paper}/${content}/${offset}`);
    if (mode === 'bordereau') assert.equal(await page.locator('tbody tr').count(), 200);
    if (mode === 'caisse' && paper === 57) await page.locator('.ticket-recu').screenshot({ path: '/tmp/gar-convoi-pos/caisse-57.png' });
    if (mode === 'bordereau' && paper === 57) await page.pdf({ path: '/tmp/gar-convoi-pos/bordereau-57.pdf', width: '57mm', height: '1000mm', printBackground: true, preferCSSPageSize: false });
  }
  console.log('Rendu Chromium : 8 variantes POS sans debordement, 200 places conservees.');
} finally { await browser.close(); }
