// Teste mesure/pixel.js sur une vraie page : rien ne part sans accord, le refus ne charge rien, Lead part une fois sans donnée saisie. La requête vers Meta est interceptée et bloquée.
//   node mesure/test_pixel.js
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = path.join(__dirname, '..', 'site');
const SCRIPT = fs.readFileSync(path.join(__dirname, 'pixel.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const serveur = http.createServer((q, r) => { let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
let echecs = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) echecs++; };
(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + serveur.address().port + '/';
  const b = await chromium.launch();
  async function page(id) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const meta = [];
    await ctx.route(/facebook/, r => { meta.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    await p.goto(BASE + 'estimer-mon-projet/'); if (id) await p.evaluate(v => { window.LEGANTIS_PIXEL_ID = v; }, id);
    await p.addScriptTag({ content: SCRIPT });
    return { ctx, p, meta };
  }
  const file = p => p.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map(a => Array.from(a)) : []));
  { const { ctx, p, meta } = await page(null);
    ok(await p.locator('.consentement-mesure').count() === 0 && meta.length === 0, 'sans identifiant : ni bandeau, ni requête'); await ctx.close(); }
  { const { ctx, p, meta } = await page('123456789012345');
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('legantis:demande-envoyee', { detail: { parcours: 'simulateur' } })));
    await p.waitForTimeout(100);
    ok(meta.length === 0 && await p.evaluate(() => typeof window.fbq) === 'undefined', 'avant tout choix : aucune requête vers Meta, même après une demande');
    await p.click('.consentement-mesure button:nth-of-type(2)'); await p.waitForTimeout(100);
    ok(meta.length === 0 && (await ctx.cookies()).length === 0, 'refus : aucune requête, aucun cookie'); await ctx.close(); }
  { const { ctx, p, meta } = await page('123456789012345');
    await p.fill('#estimer-nom', 'SECRET-NOM').catch(() => {});
    await p.click('.consentement-mesure button:nth-of-type(1)'); await p.waitForTimeout(100);
    ok(meta.some(u => u.includes('fbevents.js')), 'accord : le script de Meta se charge');
    for (let i = 0; i < 3; i++) await p.evaluate(() => document.dispatchEvent(new CustomEvent('legantis:demande-envoyee', { detail: { parcours: 'simulateur' } })));
    await p.evaluate(() => document.querySelector('a[href^="tel:"]').addEventListener('click', e => e.preventDefault()));
    await p.click('.assistant-contact a[href^="tel:"]');
    const q = await file(p); const j = JSON.stringify(q);
    ok(q.filter(a => a[0] === 'track' && a[1] === 'Lead').length === 1, 'Lead une seule fois malgré trois envois signalés');
    ok(q.some(a => a[1] === 'Lead' && a[3] && /^lead-/.test(a[3].eventID)), 'Lead porte un eventID (dédoublonnage)');
    ok(q.some(a => a[0] === 'track' && a[1] === 'Contact'), 'Contact au clic sur le téléphone');
    ok(!/SECRET|@|\+212/.test(j), 'aucune donnée saisie ni coordonnée transmise : ' + j.slice(0, 120));
    await ctx.close(); }
  { const { ctx, p, meta } = await page('123456789012345');
    await p.click('.consentement-mesure button:nth-of-type(2)');
    await p.reload(); await p.evaluate(() => { window.LEGANTIS_PIXEL_ID = '123456789012345'; }); await p.addScriptTag({ content: SCRIPT }); await p.waitForTimeout(100);
    ok(await p.locator('.consentement-mesure').count() === 0 && meta.length === 0, 'refus conservé : plus de question, aucune requête');
    await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('legantis-mesure-meta')); c.date -= 183 * 24 * 3600 * 1000; localStorage.setItem('legantis-mesure-meta', JSON.stringify(c)); });
    await p.reload(); await p.evaluate(() => { window.LEGANTIS_PIXEL_ID = '123456789012345'; }); await p.addScriptTag({ content: SCRIPT }); await p.waitForTimeout(100);
    ok(await p.locator('.consentement-mesure').count() === 1, 'après six mois, la question revient (D-939-2025, § 6)');
    await ctx.close(); }
  await b.close(); serveur.close();
  console.log(echecs ? `${echecs} échec(s)` : 'tout passe'); process.exit(echecs ? 1 : 0);
})();
