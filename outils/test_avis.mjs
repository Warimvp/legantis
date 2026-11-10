// Avis clients (/donner-mon-avis/, /en/leave-a-review/) : vraies pages, vrai code du Worker, Resend simulé : aucun e-mail ne part.
//     node outils/test_avis.mjs       NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
// Avec script (envoi, panne de Resend, validation du navigateur, ancien Worker de origin/main), sans script (POST classique, retour sur #avis-envoye ou #avis-echec),
// au bureau et au téléphone ; aucune violation de la politique de sécurité, aucun champ hors de l'écran à 320 px.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import worker from '../worker/src/index.js';

const require = createRequire(import.meta.url);
const chromium = require('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];
const DEPOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RACINE = process.env.SITE_ROOT || path.join(DEPOT, 'site');
const WORKER = 'https://legantis-devis.rihla-serveur.workers.dev/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;

// Worker de production supposé = celui de origin/main (état entre la mise en ligne du site et celle du Worker, si l'ordre n'était pas respecté).
// Une fois les avis publiés, origin/main contient déjà la route /avis : il n'y a plus d'« ancien » Worker à comparer, ce cas n'a plus d'objet (comme dans test_ordre_deploiement.mjs).
const tmp = await mkdtemp(path.join(tmpdir(), 'avis-'));
const sourceAncien = execFileSync('git', ['-C', DEPOT, 'show', 'origin/main:worker/src/index.js']);
const avisPublies = /CHEMIN_AVIS/.test(sourceAncien.toString());
await writeFile(path.join(tmp, 'ancien-worker.mjs'), sourceAncien);
const ancienWorker = (await import(pathToFileURL(path.join(tmp, 'ancien-worker.mjs')).href)).default;

let envois = [], panne = false;
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://api.resend.com/emails') throw new Error('requête inattendue du Worker vers ' + url);
  if (panne) return new Response('{}', { status: 500 });
  envois.push(JSON.parse(options.body));
  return new Response('{"id":"x"}', { status: 200 });
};
const env = () => ({ SITE_ORIGIN: ORIGINE, MAIL_TO: 'contact@legantis.net', MAIL_FROM: 'Formulaire <formulaire@legantis.net>', RESEND_API_KEY: 're_test' });
let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { if (c) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, d); } };
const nav = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
async function contexte(options = {}, { traitant = worker } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE) && !u.href.startsWith(WORKER), r => r.abort());
  await ctx.route(u => u.href.startsWith(WORKER), async route => {
    const q = route.request();
    const r = await traitant.fetch(new Request(q.url(), { method: q.method(), body: q.postData() || undefined, headers: { 'Content-Type': q.headers()['content-type'] || '', Origin: q.headers().origin || ORIGINE, Accept: q.headers().accept || '' } }), env());
    if (process.env.NAVIGATEUR === 'webkit' && r.status === 303) return route.fulfill({ status: 200, contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=${r.headers.get('Location')}">` });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return ctx;
}
const F = 'form.avis-form';
const visible = (p, sel) => p.locator(sel).first().isVisible();
const TEXTE = 'Site livré à la date prévue, explications claires, je recommande.';
async function remplir(p, { note = '4', publication = 'initiales' } = {}) {
  await p.locator(`${F} input[name="note"][value="${note}"]`).check();
  await p.locator(`${F} [name="avis"]`).fill(TEXTE);
  await p.locator(`${F} [name="nom"]`).fill('Karim Test');
  await p.locator(`${F} [name="email"]`).fill('karim@exemple.ma');
  await p.locator(`${F} [name="entreprise"]`).fill('Atelier Karim');
  await p.locator(`${F} input[name="publication"][value="${publication}"]`).check();
  await p.locator(`${F} [name="consentement"]`).check();
}
const PAGES = [['FR', '/donner-mon-avis/', 'page française'], ['EN', '/en/leave-a-review/', 'page anglaise']];
for (const [langue, url, mention] of PAGES) {
  for (const [appareil, options] of [['bureau', {}], ['téléphone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const nom = `${langue} ${appareil}`;
    { // avec script : envoi
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); const csp = []; p.on('console', m => /Content Security Policy/.test(m.text()) && csp.push(m.text()));
      await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
      verifier(`${nom} : un mail « Avis client », réponse possible au client`, envois.length === 1 && envois[0].subject === 'Avis client — 4/5 — publiable en initiales — Karim Test' && envois[0].reply_to === 'karim@exemple.ma', JSON.stringify(envois[0]?.subject));
      verifier(`${nom} : texte, entreprise, accord et langue dans le mail`, envois[0]?.text.includes(TEXTE) && envois[0].text.includes('Entreprise : Atelier Karim') && envois[0].text.includes('Accord de publication : Oui, avec mes initiales seulement') && envois[0].text.includes(mention));
      verifier(`${nom} : message de succès affiché, formulaire masqué`, (await visible(p, '#avis-envoye')) && !(await visible(p, F)));
      verifier(`${nom} : aucune violation de la politique de sécurité`, csp.length === 0, csp[0]);
      await ctx.close();
    }
    { // avec script : panne de Resend, la saisie reste
      envois = []; panne = true; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400); panne = false;
      verifier(`${nom} : panne, message d'échec, saisie conservée`, (await visible(p, '#avis-echec')) && (await visible(p, F)) && (await p.locator(`${F} [name="avis"]`).inputValue()) === TEXTE && !(await visible(p, '#avis-envoye')));
      await ctx.close();
    }
    { // validation du navigateur : rien ne part sans note ni accord de publication
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await p.locator(`${F} [name="avis"]`).fill(TEXTE); await p.locator(`${F} [name="nom"]`).fill('Karim Test'); await p.locator(`${F} [name="email"]`).fill('karim@exemple.ma'); await p.locator(`${F} [name="consentement"]`).check();
      await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(300);
      const invalides = await p.locator(`${F} :invalid`).evaluateAll(l => [...new Set(l.map(e => e.name))]);
      verifier(`${nom} : sans note ni accord, rien ne part`, envois.length === 0 && invalides.includes('note') && invalides.includes('publication'), JSON.stringify(invalides));
      await ctx.close();
    }
  }
  { // à 320 px : aucun champ ni choix hors de l'écran
    const ctx = await contexte({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
    const hors = await p.locator(`${F} :is(input:not([type="hidden"]):not([name="site_web"]), textarea, .choix, button, legend, .champ-aide)`).evaluateAll(l => l.filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -0.5 || r.right > innerWidth + 0.5); }).map(e => e.name || e.className || e.tagName));
    verifier(`${langue} 320 px : rien ne dépasse de l'écran`, hors.length === 0 && (await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), JSON.stringify(hors));
    // le texte lui-même, mot par mot (Range.getClientRects) : une case peut tenir dans l'écran alors que son libellé déborde de la case
    const debordes = await p.locator(`${F} :is(.choix, legend, label, .champ-aide, .devis-consigne)`).evaluateAll(l => l.flatMap(boite => {
      const b = boite.getBoundingClientRect(), sortis = [];
      const marcheur = document.createTreeWalker(boite, NodeFilter.SHOW_TEXT);
      for (let n; (n = marcheur.nextNode());) {
        if (!n.textContent.trim() || n.parentElement.closest('.visuellement-cache')) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const x of r.getClientRects()) if (x.width && (x.left < b.left - 0.5 || x.right > b.right + 0.5)) sortis.push(n.textContent.trim().slice(0, 24));
      }
      return sortis;
    }));
    verifier(`${langue} 320 px : aucun texte ne sort de sa case`, debordes.length === 0, JSON.stringify(debordes.slice(0, 5)));
    await ctx.close();
  }
  if (avisPublies) console.log(`sans objet : ${langue} ancien Worker (origin/main gère déjà /avis, les avis sont publiés)`);
  else { // ancien Worker (origin/main) + nouvelle page : aucun mail, et l'échec se voit
    envois = []; const ctx = await contexte({}, { traitant: ancienWorker }); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
    await remplir(p); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
    verifier(`${langue} ancien Worker : aucun mail, message d'échec visible`, envois.length === 0 && (await visible(p, '#avis-echec')) && !(await visible(p, '#avis-envoye')));
    await ctx.close();
  }
  { // sans script : POST classique, retour sur la page avec #avis-envoye
    envois = []; const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(ORIGINE + url);
    await remplir(p, { note: '5', publication: 'complet' }); await p.locator(`${F} [type="submit"]`).click();
    await p.waitForURL(u => u.hash === '#avis-envoye' || u.hash === '#avis-echec', { timeout: 8000 }).catch(() => {});
    verifier(`${langue} sans script : envoi, retour sur ${url}#avis-envoye, message visible, formulaire masqué`, envois.length === 1 && envois[0].subject === 'Avis client — 5/5 — publiable avec son nom — Karim Test' && p.url().endsWith(`${url}#avis-envoye`) && (await visible(p, '#avis-envoye')) && !(await visible(p, F)), p.url());
    await ctx.close();
  }
  { // sans script, panne : retour sur #avis-echec
    envois = []; panne = true; const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(ORIGINE + url);
    await remplir(p); await p.locator(`${F} [type="submit"]`).click();
    await p.waitForURL(u => u.hash === '#avis-echec' || u.hash === '#avis-envoye', { timeout: 8000 }).catch(() => {}); panne = false;
    verifier(`${langue} sans script : panne, retour sur #avis-echec, message d'échec visible`, p.url().endsWith(`${url}#avis-echec`) && (await visible(p, '#avis-echec')), p.url());
    await ctx.close();
  }
}
await nav.close(); serveur.close();
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
