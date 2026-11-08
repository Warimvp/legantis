// Ordre de mise en ligne Worker / site (05-08/11/2026) : prouve les deux sens, sans rien envoyer (Resend simulé).
//   1. NOUVEAU Worker + ANCIEN site (état entre les deux déploiements, dans le bon ordre) : les six formulaires de la production actuelle marchent encore.
//   2. ANCIEN Worker + NOUVEAU site (mauvais ordre) : le formulaire détaillé marche ; le contact rapide échoue proprement (aucun mail, aucun faux succès).
// « Ancien » = origin/main, lu par git ; « nouveau » = ce dépôt. À lancer depuis la racine :  node outils/test_ordre_deploiement.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url)), DEPOT = path.join(ICI, '..');
const chromium = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];
const WORKER = 'https://legantis-devis.rihla-serveur.workers.dev/';
const git = (...a) => execFileSync('git', ['-C', DEPOT, ...a], { maxBuffer: 1 << 28 });
const tmp = await mkdtemp(path.join(tmpdir(), 'ordre-'));
let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { if (c) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, d); } };

// Une fois le contact rapide publié, origin/main contient déjà le nouveau Worker : il n'y a plus d'« ancien » état à comparer, le test n'a plus d'objet.
if (/PARCOURS_RAPIDE/.test(git('show', 'origin/main:worker/src/index.js').toString())) { console.log('sans objet : origin/main contient déjà le parcours « rapide » (le contact rapide est publié)'); process.exit(0); }
// ancien Worker et ancien site : origin/main
await writeFile(path.join(tmp, 'ancien-worker.mjs'), git('show', 'origin/main:worker/src/index.js'));
const ancienWorker = (await import(pathToFileURL(path.join(tmp, 'ancien-worker.mjs')).href)).default;
execFileSync('bash', ['-c', `git -C '${DEPOT}' archive origin/main site | tar -x -C '${tmp}'`]);
verifier('l\'ancien Worker connaît l\'ancien parcours seulement (pas de « rapide »)', !/PARCOURS_RAPIDE|'rapide'/.test(git('show', 'origin/main:worker/src/index.js').toString()));

// 1. nouveau Worker + ancien site : la suite des six formulaires, avec le site de la production actuelle
const r1 = spawnSync('node', [path.join(ICI, 'test_formulaires.mjs')], { env: { ...process.env, SITE_ROOT: path.join(tmp, 'site') }, encoding: 'utf8' });
const dernier = (r1.stdout.trim().split('\n').pop() || '');
verifier('nouveau Worker + ancien site : les six formulaires de la production actuelle passent encore', r1.status === 0 && /réussies, 0 échec/.test(dernier), dernier);

// 2. ancien Worker + nouveau site
const RACINE = path.join(DEPOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;
let envois = [];
globalThis.fetch = async (url, o) => { if (String(url) !== 'https://api.resend.com/emails') throw new Error('requête inattendue ' + url); envois.push(JSON.parse(o.body)); return new Response('{"id":"x"}', { status: 200 }); };
const env = { SITE_ORIGIN: ORIGINE, MAIL_TO: 'contact@legantis.net', MAIL_FROM: 'F <formulaire@legantis.net>', RESEND_API_KEY: 're_test' };
const nav = await chromium.launch();
async function contexte(options = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE) && !u.href.startsWith(WORKER), r => r.abort());
  await ctx.route(WORKER, async route => {
    const q = route.request();
    const r = await ancienWorker.fetch(new Request(WORKER, { method: q.method(), body: q.postData() || undefined, headers: { 'Content-Type': q.headers()['content-type'] || '', Origin: q.headers().origin || ORIGINE, Accept: q.headers().accept || '' } }), env);
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return ctx;
}
const visible = (p, s) => p.locator(s).first().isVisible();
for (const [langue, url, merci] of [['FR', '/', '#devis-envoye'], ['EN', '/en/', '#devis-envoye']]) {
  { // formulaire détaillé : marche avec l'ancien Worker
    envois = []; const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
    const F = 'form.devis-form:not(.rappel-form)';
    await p.locator(`${F} [name="nom"]`).fill('Sara Test'); await p.locator(`${F} [name="email"]`).fill('sara@exemple.ma');
    await p.locator(`${F} [name="type"]`).selectOption('site'); await p.locator(`${F} [name="projet"]`).fill('Un site pour mon cabinet, merci.');
    await p.locator(`${F} [name="consentement"]`).check(); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
    verifier(`${langue} : ancien Worker + nouveau site, formulaire détaillé : un mail, succès affiché`, envois.length === 1 && (await visible(p, '#devis-envoye')));
    await ctx.close();
  }
  { // contact rapide : échec propre
    envois = []; const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
    const F = '.rappel-form';
    await p.locator(`${F} [name="nom"]`).fill('Karim Test'); await p.locator(`${F} [name="contact"]`).fill('karim@exemple.ma');
    await p.locator(`${F} [name="type"]`).selectOption('site'); await p.locator(`${F} [name="consentement"]`).check(); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
    verifier(`${langue} : ancien Worker + nouveau site, contact rapide : aucun mail, aucun faux succès, saisie conservée`, envois.length === 0 && !(await visible(p, '#rappel-envoye')) && (await p.locator(`${F} [name="nom"]`).inputValue()) === 'Karim Test');
    await ctx.close();
  }
}
await nav.close(); serveur.close();
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
