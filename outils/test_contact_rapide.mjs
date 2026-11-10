// Contact rapide (accueils FR et EN, page d'offre depuis le 10/11/2026) : vraies pages, vrai code du Worker, Resend simulé : aucun e-mail ne part.
//     node outils/test_contact_rapide.mjs       NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
// Avec script (e-mail, téléphone seul, refus du serveur, panne de Resend, UTM, double clic), sans script (POST classique, retour sur #rappel-envoye), au bureau et au téléphone.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';

const require = createRequire(import.meta.url);
const chromium = require('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];
const RACINE = process.env.SITE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const WORKER = 'https://legantis-devis.rihla-serveur.workers.dev/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;

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
async function contexte(options = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE) && !u.href.startsWith(WORKER), r => r.abort());
  await ctx.route(WORKER, async route => {
    const q = route.request();
    const r = await worker.fetch(new Request(WORKER, { method: q.method(), body: q.postData() || undefined, headers: { 'Content-Type': q.headers()['content-type'] || '', Origin: q.headers().origin || ORIGINE, Accept: q.headers().accept || '' } }), env());
    if (process.env.NAVIGATEUR === 'webkit' && r.status === 303) return route.fulfill({ status: 200, contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=${r.headers.get('Location')}">` });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return ctx;
}
const F = '.rappel-form';
const visible = (p, id) => p.locator(id).first().isVisible();
const remplir = async (p, { nom = 'Karim Test', contact = 'karim@exemple.ma', type = 'site', projet = '' } = {}) => {
  await p.locator(`${F} [name="nom"]`).fill(nom); await p.locator(`${F} [name="contact"]`).fill(contact);
  await p.locator(`${F} [name="type"]`).selectOption(type); if (projet) await p.locator(`${F} [name="projet"]`).fill(projet);
  await p.locator(`${F} [name="consentement"]`).check();
};
// Dernier élément : page de retour sans script. Le Worker renvoie le contact rapide vers l'accueil de la langue (chemin fixe), qui porte le même message #rappel-envoye.
const PAGES = [['FR', '/', 'Contact rapide', 'Merci', '/'], ['EN', '/en/', 'Contact rapide', 'Thank you', '/en/'], ['FR offre', '/offre-lancement/', 'Contact rapide', 'Merci', '/']];
for (const [langue, url, , merci, retour] of PAGES) {
  for (const [appareil, options] of [['bureau', {}], ['téléphone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const nom = `${langue} ${appareil}`;
    { // e-mail, avec script, source UTM recopiée
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); const csp = []; p.on('console', m => /Content Security Policy/.test(m.text()) && csp.push(m.text()));
      await p.goto(ORIGINE + url + '?utm_source=essai&utm_campaign=rapide'); await p.waitForTimeout(150);
      await remplir(p, { projet: 'Un site pour mon cabinet.' }); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
      verifier(`${nom} : e-mail, un mail avec objet et reply_to`, envois.length === 1 && envois[0].reply_to === 'karim@exemple.ma' && envois[0].subject === 'Demande de devis — Contact rapide — Site web — Karim Test', JSON.stringify(envois[0] || {}).slice(0, 200));
      verifier(`${nom} : message de succès affiché, formulaire masqué`, (await visible(p, '#rappel-envoye')) && !(await visible(p, F)));
      verifier(`${nom} : le message de succès ne parle pas du formulaire détaillé`, !(await visible(p, '#devis-envoye')) || false);
      verifier(`${nom} : source UTM et besoin libre dans le mail`, envois[0]?.text.includes('essai') && envois[0].text.includes('rapide') && envois[0].text.includes('Un site pour mon cabinet.'));
      verifier(`${nom} : aucune violation de la politique de sécurité`, csp.length === 0, csp[0]);
      await ctx.close();
    }
    { // téléphone seul
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p, { contact: '06 12 34 56 78', type: 'logiciel' }); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
      verifier(`${nom} : téléphone seul accepté, pas d'adresse de réponse`, envois.length === 1 && !('reply_to' in envois[0]) && envois[0].text.includes('Téléphone : 06 12 34 56 78') && (await visible(p, '#rappel-envoye')), JSON.stringify(envois[0] || {}).slice(0, 200));
      await ctx.close();
    }
    { // contact invalide : refus du serveur, erreur sous le champ, saisie conservée
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p, { contact: 'bonjour' }); await p.evaluate(() => { const f = document.querySelector('.rappel-form'); f.noValidate = true; f.requestSubmit(); }); await p.waitForTimeout(400);
      verifier(`${nom} : contact invalide, rien d'envoyé, erreur sous le champ, saisie conservée`, envois.length === 0 && (await p.locator('#erreur-contact').count()) === 1 && (await p.locator(`${F} [name="nom"]`).inputValue()) === 'Karim Test' && !(await visible(p, '#rappel-envoye')));
      await ctx.close();
    }
    { // panne de Resend
      envois = []; panne = true; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400); panne = false;
      verifier(`${nom} : panne de Resend, échec affiché, saisie conservée`, (await visible(p, '#rappel-echec')) && !(await visible(p, '#rappel-envoye')) && (await p.locator(`${F} [name="contact"]`).inputValue()) === 'karim@exemple.ma');
      await ctx.close();
    }
    { // double clic
      envois = []; const ctx = await contexte(options); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
      await remplir(p); await p.evaluate(() => { const f = document.querySelector('.rappel-form'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); }); await p.waitForTimeout(500);
      verifier(`${nom} : trois envois rapides, un seul mail`, envois.length === 1, String(envois.length));
      await ctx.close();
    }
  }
  { // sans script : POST classique, retour sur #rappel-envoye, formulaire masqué par :target
    envois = []; const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(ORIGINE + url);
    await remplir(p); await p.locator(`${F} [type="submit"]`).click();
    await p.waitForURL(u => u.hash === '#rappel-envoye' || u.hash === '#rappel-echec', { timeout: 8000 }).catch(() => {});
    verifier(`${langue} sans script : envoi, retour sur #rappel-envoye, message visible, formulaire masqué`, envois.length === 1 && p.url().endsWith(`${retour}#rappel-envoye`) && (await visible(p, '#rappel-envoye')) && !(await visible(p, F)), p.url());
    await ctx.close();
  }
  { // sans script, échec : retour sur #rappel-echec
    envois = []; panne = true; const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(ORIGINE + url);
    await remplir(p); await p.locator(`${F} [type="submit"]`).click();
    await p.waitForURL(u => u.hash === '#rappel-echec' || u.hash === '#rappel-envoye', { timeout: 8000 }).catch(() => {}); panne = false;
    verifier(`${langue} sans script : panne, retour sur #rappel-echec, message d'échec visible`, p.url().endsWith(`${retour}#rappel-echec`) && (await visible(p, '#rappel-echec')), p.url());
    await ctx.close();
  }
  { // le formulaire détaillé n'est pas touché par le contact rapide
    envois = []; const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(150);
    await remplir(p); await p.locator(`${F} [type="submit"]`).click(); await p.waitForTimeout(400);
    verifier(`${langue} : après un contact rapide, le formulaire détaillé reste affiché`, await visible(p, 'form.devis-form:not(.rappel-form)'));
    await ctx.close();
  }
}
await nav.close(); serveur.close();
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
