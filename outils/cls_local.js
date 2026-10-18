// CLS réel en local : les polices (assets/fonts/*.woff2, servies par le site) arrivent avec 1 s de retard après le premier affichage,
// ce qui force l'échange repli -> Archivo ; le site est servi en HTTP local (le routage de Playwright ne voit pas les fichiers file://).
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = process.env.SITE_ROOT || path.join(__dirname, '..', 'site');
const PAGES = process.argv.slice(2);   // ex. : node outils/cls_local.js '' en/ application-web-maroc/   ('' = accueil FR)
const VUES = [['1440', 1440, 900, false], ['1024', 1024, 800, false], ['820', 820, 1100, false], ['414', 414, 896, true], ['390', 390, 844, true], ['360', 360, 800, true]];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const serveur = http.createServer((req, res) => {
  let f = path.join(RACINE, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
});
(async () => {
  await new Promise(ok => serveur.listen(0, '127.0.0.1', ok)); const BASE = 'http://127.0.0.1:' + serveur.address().port + '/';
  const browser = await chromium.launch();
  const res = []; let max = 0;
  for (const [nom, w, h, mob] of VUES) for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, reducedMotion: 'reduce' });
    await ctx.route(/\/assets\/fonts\//, async r => { await new Promise(s => setTimeout(s, 1000)); r.continue(); });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__c = 0; window.__s = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__c += e.value; window.__s.push((e.sources || []).map(s => { const n = s.node; const el = n && n.nodeType === 3 ? n.parentElement : n; return el ? el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] : '?'; }).join(',')); } }).observe({ type: 'layout-shift', buffered: true }); });
    await page.goto(BASE + p, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1800);
    const v = await page.evaluate(() => ({ c: window.__c, s: window.__s, a: [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Archivo' && f.status === 'loaded') })); max = Math.max(max, v.c);
    if (!v.a) res.push(`${nom.padStart(4)}px ${('/' + p).padEnd(40)} ARCHIVO NON CHARGÉ`);
    if (v.c > 0.001) res.push(`${nom.padStart(4)}px ${('/' + p).padEnd(40)} ${v.c.toFixed(3)}  ${[...new Set(v.s)].join(' ; ').slice(0, 70)}`);
    await ctx.close();
  }
  console.log(res.join('\n') || 'aucun décalage'); console.log(`\nCLS maximal ${max.toFixed(3)} sur ${VUES.length * PAGES.length} rendus`);
  await browser.close(); serveur.close();
})();
