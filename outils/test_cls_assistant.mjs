// Non-régression du décalage de mise en page de /estimer-mon-projet/ (CLS intermittent de 0,70 à 820 px, corrigé le 31/10/2026) et de la robustesse du formulaire.
//     node outils/test_cls_assistant.mjs            SITE_ROOT=<dossier> pour essayer une autre version du site (la version d'avant le correctif doit échouer)
// Cause : sans CSS dédié, le formulaire s'affiche avec ses cinq étapes puis se replie en une seule quand conversion.js démarre ; le pied de page remonte alors dans la fenêtre. Le test retarde
// le script (le premier affichage a lieu avant lui : c'est le cas qui ne se produit « parfois » qu'en vrai) et mesure les décalages APRÈS le démarrage de l'assistant.
// Il vérifie aussi les cas où le script ne démarre pas : sans JavaScript, ou JavaScript actif mais script bloqué (le formulaire complet doit rester utilisable).
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const chromium = require('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];   // NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
const RACINE = process.env.SITE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = path.join(RACINE, chemin);
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const URL_PAGE = `http://127.0.0.1:${serveur.address().port}/estimer-mon-projet/`;
let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { if (c) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, d); } };
const navigateur = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });

// ── 1. Le script démarre après le premier affichage : rien ne doit bouger quand l'assistant démarre ──────────────────────────────────────────────────
for (const mouvement of ['no-preference', 'reduce']) {
  for (const [w, h] of [[820, 1100], [1024, 800], [1440, 900], [390, 844]]) {
    const ctx = await navigateur.newContext({ viewport: { width: w, height: h }, reducedMotion: mouvement });
    await ctx.route(/conversion\.js/, async r => { await new Promise(s => setTimeout(s, 1500)); r.continue(); });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__decalages = []; window.__demarrage = null;
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__decalages.push({ v: e.value, t: e.startTime }); }).observe({ type: 'layout-shift', buffered: true });
      new MutationObserver(() => { const f = document.querySelector('form.assistant'); if (f && f.classList.contains('assistant--actif') && window.__demarrage === null) window.__demarrage = performance.now(); }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    });
    await page.goto(URL_PAGE, { waitUntil: 'commit' }); await page.waitForTimeout(900);
    const avant = await page.evaluate(() => ({ etape2: getComputedStyle(document.querySelector('[data-etape="2"]')).visibility, hauteurForm: document.querySelector('form.assistant').getBoundingClientRect().height }));
    await page.waitForFunction(() => window.__demarrage !== null, null, { timeout: 8000 }); await page.waitForTimeout(700);
    const m = await page.evaluate(() => { const apres = window.__decalages.filter(x => x.t >= window.__demarrage - 5).reduce((a, x) => a + x.v, 0); const total = window.__decalages.reduce((a, x) => a + x.v, 0); return { apres, total, hauteurForm: document.querySelector('form.assistant').getBoundingClientRect().height }; });
    verifier(`${w}×${h}, mouvement ${mouvement} : avant le script, une seule étape (étape 2 masquée)`, avant.etape2 === 'hidden', JSON.stringify(avant));
    verifier(`${w}×${h}, mouvement ${mouvement} : le formulaire garde sa hauteur au démarrage de l'assistant`, Math.abs(avant.hauteurForm - m.hauteurForm) <= 2, `${avant.hauteurForm} -> ${m.hauteurForm}`);
    verifier(`${w}×${h}, mouvement ${mouvement} : décalage au démarrage de l'assistant ≤ 0,01 (obtenu ${m.apres.toFixed(3)})`, m.apres <= 0.01);
    verifier(`${w}×${h}, mouvement ${mouvement} : décalage total ≤ 0,05 (obtenu ${m.total.toFixed(3)})`, m.total <= 0.05);
    await ctx.close();
  }
}

// ── 2. JavaScript désactivé : le formulaire complet, tout de suite ───────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await navigateur.newContext({ viewport: { width: 820, height: 1100 }, javaScriptEnabled: false }); const page = await ctx.newPage();
  await page.goto(URL_PAGE, { waitUntil: 'load' });
  const s = await page.evaluate(() => ({ etapes: [...document.querySelectorAll('[data-etape]')].map(e => { const c = getComputedStyle(e), l = e.querySelector(':scope > legend').getBoundingClientRect().height; return c.visibility === 'visible' && e.getBoundingClientRect().height > 60 && l > 10; }), envoi: getComputedStyle(document.querySelector('.assistant-envoi')).visibility === 'visible' && document.querySelector('.assistant-envoi').getBoundingClientRect().height > 20,
    nav: getComputedStyle(document.querySelector('.assistant-nav')).display, prog: getComputedStyle(document.querySelector('.assistant-progression')).display, cpt: getComputedStyle(document.querySelector('.assistant-compteur')).display }));
  verifier('sans JavaScript : les cinq étapes et leurs titres sont visibles tout de suite', s.etapes.length === 5 && s.etapes.every(Boolean), JSON.stringify(s));
  verifier('sans JavaScript : le bouton d\'envoi est visible, ni « Continuer », ni progression, ni compteur', s.envoi && s.nav === 'none' && s.prog === 'none' && s.cpt === 'none', JSON.stringify(s));
  await ctx.close();
}

// ── 3. JavaScript actif mais script bloqué : l'étape 1 d'abord, puis le formulaire complet après 6 s, utilisable et envoyable sans script ───────────────────────────
for (const mouvement of ['no-preference', 'reduce']) {
  const ctx = await navigateur.newContext({ viewport: { width: 820, height: 1100 }, reducedMotion: mouvement });
  await ctx.route(/conversion\.js/, r => r.abort());
  let envoi = null;
  await ctx.route('https://legantis-devis.rihla-serveur.workers.dev/**', async r => { envoi = r.request().postData(); await r.fulfill({ status: 200, contentType: 'text/html', body: '<p>reçu</p>' }); });
  const page = await ctx.newPage();
  await page.goto(URL_PAGE, { waitUntil: 'load' }); await page.waitForTimeout(1000);
  const tot = await page.evaluate(() => getComputedStyle(document.querySelector('[data-etape="2"]')).visibility);
  verifier(`script bloqué, mouvement ${mouvement} : avant 6 s, l'étape 1 seulement`, tot === 'hidden', tot);
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => ({ etapes: [...document.querySelectorAll('[data-etape]')].map(e => getComputedStyle(e).visibility === 'visible' && e.getBoundingClientRect().height > 60 && e.querySelector(':scope > legend').getBoundingClientRect().height > 10), envoi: getComputedStyle(document.querySelector('.assistant-envoi')).visibility === 'visible' && document.querySelector('.assistant-envoi').getBoundingClientRect().height > 20,
    nav: getComputedStyle(document.querySelector('.assistant-nav')).visibility === 'hidden' || document.querySelector('.assistant-nav').getBoundingClientRect().height === 0, prog: document.querySelector('.assistant-progression').getBoundingClientRect().height === 0 || getComputedStyle(document.querySelector('.assistant-progression')).visibility === 'hidden', cpt: document.querySelector('.assistant-compteur').getBoundingClientRect().height === 0 || getComputedStyle(document.querySelector('.assistant-compteur')).visibility === 'hidden' }));
  verifier(`script bloqué, mouvement ${mouvement} : après 6 s, les cinq étapes et leurs titres sont visibles`, s.etapes.every(Boolean), JSON.stringify(s));
  verifier(`script bloqué, mouvement ${mouvement} : bouton d'envoi visible, « Continuer », progression et compteur retirés`, s.envoi && s.nav && s.prog && s.cpt, JSON.stringify(s));
  await page.check('input[name="type"][value="vitrine"]', { force: true });
  await page.check('input[name="delai"][value="vite"]', { force: true });
  await page.fill('#estimer-nom', 'Sara Test'); await page.fill('#estimer-entreprise', 'Atelier Test'); await page.fill('#estimer-email', 'sara@exemple.ma'); await page.fill('#estimer-tel', '06 12 34 56 78');
  await page.selectOption('#estimer-budget', '5a15'); await page.fill('#estimer-projet', 'Un site pour présenter nos services.'); await page.check('#estimer-consentement');
  await page.click('.assistant-envoi button'); await page.waitForTimeout(800);
  verifier(`script bloqué, mouvement ${mouvement} : le formulaire s'envoie sans script (POST classique)`, !!envoi && envoi.includes('type=vitrine') && envoi.includes('nom=Sara') && envoi.includes('parcours=simulateur'), String(envoi).slice(0, 120));
  await ctx.close();
}

await navigateur.close(); serveur.close();
console.log(ko ? `\n${ko} échec(s), ${ok} vérifications réussies` : `\n${ok} vérifications réussies, 0 échec(s)`);
process.exit(ko ? 1 : 0);
