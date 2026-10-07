// CLS réel en local : polices Google servies depuis un cache disque avec 1 s de retard (échange repli -> Archivo après le premier affichage).
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const RACINE = process.env.SITE_ROOT || require('path').join(__dirname, '..', 'site');
const PAGES = process.argv.slice(2);   // ex. : node outils/cls_local.js '' en/ application-web-maroc/   ('' = accueil FR)
const VUES = [['1440', 1440, 900, false], ['1024', 1024, 800, false], ['820', 820, 1100, false], ['414', 414, 896, true], ['390', 390, 844, true], ['360', 360, 800, true]];
(async () => {
  const browser = await chromium.launch(); const cache = new Map();
  { const c = await browser.newContext(); const p = await c.newPage();
    await c.route(/fonts\.(googleapis|gstatic)\.com/, async r => { const u = r.request().url(); const resp = await r.fetch(); cache.set(u, { status: resp.status(), headers: resp.headers(), body: await resp.body() }); r.fulfill({ response: resp }); });
    await p.goto('file://' + RACINE + '/index.html', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600); await c.close(); }
  const res = []; let max = 0;
  for (const [nom, w, h, mob] of VUES) for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, reducedMotion: 'reduce' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async r => { const c = cache.get(r.request().url()); if (!c) return r.continue(); await new Promise(s => setTimeout(s, 1000)); r.fulfill({ status: c.status, headers: c.headers, body: c.body }); });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__c = 0; window.__s = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__c += e.value; window.__s.push((e.sources || []).map(s => { const n = s.node; const el = n && n.nodeType === 3 ? n.parentElement : n; return el ? el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] : '?'; }).join(',')); } }).observe({ type: 'layout-shift', buffered: true }); });
    await page.goto('file://' + RACINE + '/' + p + 'index.html', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1800);
    const v = await page.evaluate(() => ({ c: window.__c, s: window.__s })); max = Math.max(max, v.c);
    if (v.c > 0.001) res.push(`${nom.padStart(4)}px ${('/' + p).padEnd(40)} ${v.c.toFixed(3)}  ${[...new Set(v.s)].join(' ; ').slice(0, 70)}`);
    await ctx.close();
  }
  console.log(res.join('\n') || 'aucun décalage'); console.log(`\nCLS maximal ${max.toFixed(3)} sur ${VUES.length * PAGES.length} rendus`);
  await browser.close();
})();
