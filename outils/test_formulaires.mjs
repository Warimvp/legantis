// Les six formulaires publics, vraies pages et vrai Worker, Resend simulé : aucun e-mail ne part.
//     node outils/test_formulaires.mjs       NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
// Pour chacun : envoi nominal, sans JavaScript, e-mail invalide, champ piège, double clic, panne de Resend, limite de débit, texte hostile.
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
// ?echec-reel : la page envoie vers /echec-reel, qui répond par une vraie redirection 303 comme le Worker en échec (sur WebKit, la simulation par route ne le peut pas).
const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/echec-reel') { req.resume(); res.writeHead(303, { Location: '/en/#devis-echec' }); return res.end(); }
  let f = path.join(RACINE, decodeURIComponent(u.pathname));
  try {
    if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html');
    let corps = await readFile(f);
    if (u.searchParams.has('echec-reel') && f.endsWith('.html')) corps = corps.toString().replaceAll(WORKER, '/echec-reel');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(corps);
  } catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;

let envois = [], panne = false, limite = false, retard = 0;
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://api.resend.com/emails') throw new Error('requête inattendue du Worker vers ' + url);
  if (panne) return new Response('{}', { status: 500 });
  envois.push(JSON.parse(options.body));
  return new Response('{"id":"x"}', { status: 200 });
};
const env = () => ({ SITE_ORIGIN: ORIGINE, MAIL_TO: 'contact@legantis.net', MAIL_FROM: 'Formulaire <formulaire@legantis.net>', RESEND_API_KEY: 're_test', LIMITE: { limit: async () => ({ success: !limite }) } });

let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { if (c) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, d); } };
const nav = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
async function contexte(options = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE) && !u.href.startsWith(WORKER), r => r.abort());
  await ctx.route(WORKER, async route => {
    const q = route.request();
    if (retard) await new Promise(r => setTimeout(r, retard));
    const requete = new Request(WORKER, { method: q.method(), body: q.postData() || undefined, headers: { 'Content-Type': q.headers()['content-type'] || '', Origin: q.headers().origin || ORIGINE, Accept: q.headers().accept || '' } });
    const r = await worker.fetch(requete, env());
    if (process.env.NAVIGATEUR === 'webkit' && r.status === 303) return route.fulfill({ status: 200, contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=${r.headers.get('Location')}">` });   // Playwright ne simule pas une redirection sur WebKit
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return ctx;
}
const VALEURS = { nom: 'Sara Test', email: 'sara@exemple.ma', entreprise: 'Atelier Test', telephone: '06 12 34 56 78', projet: 'Un outil pour suivre nos commandes fictives.', url_site: 'exemple.ma' };
// Remplit le formulaire sans dépendre de ses étapes : valeur connue, sinon première option proposée.
const remplir = (page, extra = {}) => page.evaluate(({ V, extra }) => {
  const f = document.querySelector('form[action*="workers.dev"]');
  for (const c of f.elements) {
    if (!c.name || c.name === 'site_web' || c.type === 'hidden' || c.type === 'submit') continue;
    if (c.type === 'radio') { const g = [...f.querySelectorAll(`[name="${c.name}"]`)]; if (!g.some(x => x.checked)) g[0].checked = true; }
    else if (c.type === 'checkbox') { if (c.name === 'consentement') c.checked = true; }
    else if (c.tagName === 'SELECT') { if (!c.value) c.value = [...c.options].find(o => o.value).value; }
    else if (c.name in V) c.value = V[c.name];
    c.dispatchEvent(new Event('change', { bubbles: true }));
  }
  for (const [k, v] of Object.entries(extra)) { const c = f.elements[k]; if (c) c.value = v; }
}, { V: VALEURS, extra });
const envoyer = page => page.evaluate(() => { const f = document.querySelector('form[action*="workers.dev"]'); f.noValidate = true; f.requestSubmit(); });
const FORMS = [['accueil FR', '/'], ['accueil EN', '/en/'], ['/commandes/', '/commandes/'], ['devis guidé', '/estimer-mon-projet/?type=web'], ['mini-audit', '/audit-gratuit/'], ['offre', '/offre-lancement/']];
const attendre = (page, n) => page.waitForFunction(() => true).then(() => new Promise(async fin => { for (let i = 0; i < 40; i++) { if (envois.length >= n) break; await new Promise(r => setTimeout(r, 50)); } setTimeout(fin, 120); }));
const message = (page, id) => page.locator(id).first().isVisible();

for (const [nom, url] of FORMS) {
  { // nominal, avec script
    envois = []; panne = limite = false; retard = 0;
    const ctx = await contexte(); const p = await ctx.newPage(); const erreurs = []; p.on('console', m => /Content Security Policy/.test(m.text()) && erreurs.push(m.text()));
    await p.goto(ORIGINE + url + (url.includes('?') ? '&' : '?') + 'utm_source=essai&utm_campaign=formulaires'); await p.waitForTimeout(150);
    await remplir(p); await envoyer(p); await attendre(p, 1); await p.waitForTimeout(150);
    const m = envois[0];
    verifier(`${nom} : envoi nominal, un mail vers contact@legantis.net`, envois.length === 1 && m.to[0] === 'contact@legantis.net' && m.reply_to === VALEURS.email, JSON.stringify(m || {}).slice(0, 160));
    verifier(`${nom} : message de succès`, await message(p, '#devis-envoye'));
    verifier(`${nom} : source UTM dans le mail`, !!m && m.text.includes('essai') && m.text.includes('formulaires'));
    verifier(`${nom} : aucune violation de la politique de sécurité`, erreurs.length === 0, erreurs[0]);
    await ctx.close();
  }
  { // sans JavaScript : POST classique, 303, retour sur la page
    envois = [];
    const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage();
    await p.goto(ORIGINE + url.split('?')[0]);
    for (const [k, v] of Object.entries(VALEURS)) { const c = p.locator(`form[action*="workers.dev"] [name="${k}"]`).first(); if (await c.count() && await c.isVisible().catch(() => false)) await c.fill(v); }
    for (const s of await p.locator('form[action*="workers.dev"] select').all()) if (await s.isVisible()) { const v = await s.locator('option[value]:not([value=""])').first().getAttribute('value'); await s.selectOption(v); }
    for (const g of new Set(await p.locator('form[action*="workers.dev"] input[type="radio"]').evaluateAll(l => l.map(x => x.name)))) await p.locator(`form[action*="workers.dev"] input[name="${g}"]`).first().check({ force: true });
    await p.locator('form[action*="workers.dev"] input[name="consentement"]').check({ force: true });
    await p.locator('form[action*="workers.dev"] [type="submit"]').last().click({ force: true });
    await p.waitForURL(u => u.hash === '#devis-envoye' || u.hash === '#devis-echec', { timeout: 8000 }).catch(() => {});
    verifier(`${nom} : sans JavaScript, envoi et retour`, envois.length === 1 && p.url().endsWith('#devis-envoye'), p.url() + ' envois ' + envois.length);
    await ctx.close();
  }
  { // e-mail invalide, côté serveur
    envois = [];
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p, { email: 'pas-une-adresse' }); await envoyer(p); await p.waitForTimeout(300);
    verifier(`${nom} : e-mail invalide refusé, rien d'envoyé, saisie conservée`, envois.length === 0 && (await p.evaluate(() => document.querySelector('form[action*="workers.dev"]').elements.nom.value)) === VALEURS.nom);
    await ctx.close();
  }
  { // champ piège
    envois = [];
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p, { site_web: 'robot.example' }); await envoyer(p); await p.waitForTimeout(300);
    verifier(`${nom} : champ piège, aucun mail`, envois.length === 0);
    await ctx.close();
  }
  { // double envoi
    envois = []; retard = 250;
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p); await envoyer(p); await envoyer(p); await envoyer(p); await p.waitForTimeout(700); retard = 0;
    verifier(`${nom} : trois envois rapides, un seul mail`, envois.length === 1, String(envois.length));
    await ctx.close();
  }
  { // panne de Resend
    envois = []; panne = true;
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p); await envoyer(p); await p.waitForTimeout(350); panne = false;
    verifier(`${nom} : panne de Resend, échec affiché, saisie conservée`, await message(p, '#devis-echec') && !(await message(p, '#devis-envoye')) && (await p.evaluate(() => document.querySelector('form[action*="workers.dev"]').elements.email.value)) === VALEURS.email);
    await ctx.close();
  }
  { // limite de débit (binding simulé)
    envois = []; limite = true;
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p); await envoyer(p); await p.waitForTimeout(300); limite = false;
    verifier(`${nom} : limite de débit, aucun mail, échec affiché`, envois.length === 0 && await message(p, '#devis-echec'));
    await ctx.close();
  }
  { // texte hostile
    envois = [];
    const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + url); await p.waitForTimeout(100);
    await remplir(p, { nom: '=SOMME(1;1) <script>x</script>', projet: 'Test hostile <img src=x onerror=alert(1)> sur plusieurs lignes.' }); await envoyer(p); await attendre(p, 1);
    const m = envois[0];
    verifier(`${nom} : texte hostile, mail en texte brut, formule neutralisée`, !!m && !m.html && m.text.includes("'=SOMME"), JSON.stringify(m || {}).slice(0, 120));
    await ctx.close();
  }
}
// /commandes/ allégé (V3.1) : sans ville, équipe ni description, la demande part quand même, priorité calculée.
{
  envois = [];
  const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + '/commandes/'); await p.waitForTimeout(100);
  await remplir(p); await p.evaluate(() => { const f = document.querySelector('form[action*="workers.dev"]'); f.elements.ville.value = ''; f.elements.equipe.value = ''; f.elements.projet.value = ''; });
  await envoyer(p); await attendre(p, 1); await p.waitForTimeout(150);
  verifier('/commandes/ allégé : envoi avec les seuls champs obligatoires', envois.length === 1 && /Priorité/.test(envois[0].subject) && /Ville : non précisé/.test(envois[0].text), JSON.stringify(envois[0] || {}).slice(0, 140));
  await ctx.close();
}
// Accueil anglais : messages du script en anglais.
{
  envois = []; retard = 250;
  const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + '/en/'); await p.waitForTimeout(100);
  await remplir(p, { email: 'pas-une-adresse' }); await envoyer(p);
  const pendant = await p.locator('.devis-form [type="submit"]').innerText(); await p.waitForTimeout(500); retard = 0;
  verifier('accueil EN : bouton « Sending… » pendant l\'envoi', pendant === 'Sending…', pendant);
  verifier('accueil EN : erreur de champ en anglais', (await p.locator('#erreur-email').innerText()) === 'Please enter a valid email address.');
  panne = true; await remplir(p); await envoyer(p); await p.waitForTimeout(350); panne = false;
  verifier('accueil EN : échec en anglais, sans la consigne réservée au mode sans script', (await p.locator('#devis-echec').innerText()).includes('Please try again in a moment') && !(await p.locator('#devis-echec').innerText()).includes('Back button'));
  await ctx.close();
}
// Accueil anglais sans JavaScript : en cas d'échec, la page dit comment retrouver la saisie, et le bouton Retour la rend.
{
  const ctx = await contexte({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(ORIGINE + '/en/?echec-reel');
  await p.fill('#devis-nom', VALEURS.nom); await p.fill('#devis-email', VALEURS.email); await p.selectOption('#devis-type', { index: 1 }); await p.fill('#devis-projet', VALEURS.projet); await p.check('#devis-consentement');
  await Promise.all([p.waitForURL(u => u.hash === '#devis-echec'), p.click('.devis-form [type="submit"]')]);
  verifier('accueil EN sans script : l\'échec indique le bouton Retour', (await p.locator('#devis-echec').innerText()).includes('Back button'));
  await p.goBack(); await p.waitForLoadState();
  verifier('accueil EN sans script : le bouton Retour rend la saisie', (await p.inputValue('#devis-nom')) === VALEURS.nom && (await p.inputValue('#devis-projet')) === VALEURS.projet);
  await ctx.close();
}
// Renvoi identique plus tard : sans la base D1, deux mails. Limite connue, activation soumise à accord.
{
  envois = [];
  const ctx = await contexte(); const p = await ctx.newPage(); await p.goto(ORIGINE + '/'); await p.waitForTimeout(100);
  for (let i = 0; i < 2; i++) { await remplir(p); await envoyer(p); await attendre(p, i + 1); await p.goto(ORIGINE + '/'); await p.waitForTimeout(100); }
  verifier('limite connue : deux envois identiques espacés donnent deux mails sans D1', envois.length === 2, String(envois.length));
  await ctx.close();
}
await nav.close(); serveur.close(); globalThis.fetch = vraiFetch;
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
