// Source de campagne (UTM) à travers les démonstrations : /realisations/ → démonstration → navigation interne → bouton commercial →
// formulaire de Legantis (champs cachés). Aucun envoi, aucune donnée personnelle ; vérifie aussi : ni cookie, ni stockage, seulement des GET vers le site.
//     node outils/test_utm_demos.mjs       NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const moteur = require('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];
const RACINE = process.env.SITE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;
const UTM = { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'essai-v1', utm_term: 'distribution' };

let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { if (c) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, d); } };
const nav = await moteur.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
const porte = (url) => { const q = new URL(url).searchParams; return Object.entries(UTM).every(([k, v]) => q.get(k) === v); };
const champsCaches = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('form[action*="workers.dev"] input[type=hidden][name^="utm_"]')].map(i => [i.name, i.value])));
const sansTrace = async (page, ctx) => (await ctx.cookies()).length === 0 && await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === '');

async function parcours(nom, { entree, interne, cta, contenu, formulaire }) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const requetes = []; ctx.on('request', r => { if (r.method() !== 'GET' || !r.url().startsWith(ORIGINE)) requetes.push(r.method() + ' ' + r.url()); });
  await ctx.route(u => !u.href.startsWith(ORIGINE), r => r.abort());
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(ORIGINE + '/realisations/?' + new URLSearchParams(UTM));
  await Promise.all([p.waitForURL(u => u.pathname.includes('/demos/')), p.locator(`a[href*="${entree}"]:visible`).first().click()]);
  verifier(`${nom} : entrée depuis /realisations/ avec la source`, porte(p.url()), p.url());
  if (interne) {
    await Promise.all([p.waitForURL(u => u.pathname.includes(interne.chemin)), p.locator(interne.lien + ':visible').first().click()]);
    verifier(`${nom} : navigation interne, source conservée`, porte(p.url()), p.url());
  }
  await Promise.all([p.waitForURL(u => !u.pathname.includes('/demos/')), p.locator(cta.split(', ').map(x => x + ':visible').join(', ')).first().click()]);
  const sortie = new URL(p.url());
  verifier(`${nom} : bouton commercial, source conservée et utm_content=${contenu}`, porte(p.url()) && sortie.searchParams.get('utm_content') === contenu, p.url());
  if (formulaire) {
    if (sortie.pathname !== formulaire) await Promise.all([p.waitForURL(u => u.pathname === formulaire), p.locator(`a[href*="${formulaire.slice(1)}"]:visible`).first().click()]);
    const c = await champsCaches(p);
    verifier(`${nom} : formulaire ${formulaire}, source dans les champs cachés`, Object.entries(UTM).every(([k, v]) => c[k] === v) && c.utm_content === contenu, JSON.stringify(c));
  }
  verifier(`${nom} : ni cookie ni stockage`, await sansTrace(p, ctx));
  verifier(`${nom} : seulement des GET vers le site, aucune erreur`, requetes.length === 0 && erreurs.length === 0, requetes.concat(erreurs).join(' | '));
  await ctx.close();
}

await parcours('Maison Tilal', { entree: 'demos/restaurant/', cta: 'a[href*="/estimer-mon-projet/"]', contenu: 'demo-restaurant', formulaire: '/estimer-mon-projet/' });
await parcours('Institut Naïa', { entree: 'demos/reservation/', interne: { lien: 'a.btn[href*="reserver/"]', chemin: '/reserver/' }, cta: 'a[href*="/estimer-mon-projet/"]', contenu: 'demo-reservation', formulaire: '/estimer-mon-projet/' });
await parcours('Mizan Technique', { entree: 'demos/services/', interne: { lien: 'a.btn[href*="/realisations/demos/services/devis/"]', chemin: '/services/devis/' }, cta: 'a[href$="/realisations/"], a[href*="/realisations/?"]', contenu: 'demo-services', formulaire: '/estimer-mon-projet/' });
await parcours('Mizan Technique, bouton de devis direct', { entree: 'demos/services/', cta: 'a[href*="/estimer-mon-projet/"]', contenu: 'demo-services', formulaire: '/estimer-mon-projet/' });
await parcours('Distribution OS', { entree: 'demos/distribution-os/', cta: 'a[href*="commandes/"]', contenu: 'demo-distribution-os', formulaire: '/commandes/' });

// Lien écrit par la démonstration après le chargement : recopié au clic.
{
  const ctx = await nav.newContext(); await ctx.route(u => !u.href.startsWith(ORIGINE), r => r.abort()); const p = await ctx.newPage();
  await p.goto(ORIGINE + '/realisations/demos/services/devis/?' + new URLSearchParams(UTM));
  await p.evaluate(() => { const a = document.createElement('a'); a.href = '/estimer-mon-projet/'; a.id = 'lien-tardif'; a.textContent = 'lien écrit plus tard'; document.body.prepend(a); });
  await Promise.all([p.waitForURL(u => u.pathname === '/estimer-mon-projet/'), p.click('#lien-tardif')]);
  verifier('lien ajouté après le chargement : source recopiée au clic', porte(p.url()) && new URL(p.url()).searchParams.get('utm_content') === 'demo-services', p.url());
  await ctx.close();
}
// Écrans finaux des démonstrations (devis simulé de Mizan, rendez-vous confirmé de Naïa) : le bouton vers la vraie demande de devis
// est écrit par la démonstration à la fin du parcours, absent au chargement ; source.js doit y recopier la source au clic, sans perdre ?type=web.
async function finDeDemo(nom, { adresse, utm, contenu, derouler }) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const requetes = []; ctx.on('request', r => { if (r.method() !== 'GET' || !r.url().startsWith(ORIGINE)) requetes.push(r.method() + ' ' + r.url()); });
  await ctx.route(u => !u.href.startsWith(ORIGINE), r => r.abort());
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(ORIGINE + adresse + '?' + new URLSearchParams(utm));
  verifier(`${nom} : bouton de fin absent au chargement (lien écrit plus tard)`, await p.locator('.cta-legantis').count() === 0);
  await derouler(p);
  const lien = p.locator('.cta-legantis a');
  if (await lien.count() !== 1) { verifier(`${nom} : un bouton vers la vraie demande de devis à la fin de la démonstration`, false, `${await lien.count()} trouvé(s)`); await ctx.close(); return; }
  verifier(`${nom} : bouton de fin écrit sans la source, avant le clic`, (await lien.getAttribute('href')) === '/estimer-mon-projet/?type=web', await lien.getAttribute('href'));
  await Promise.all([p.waitForURL(u => u.pathname === '/estimer-mon-projet/'), lien.click()]);
  const q = new URL(p.url()).searchParams, attendu = { ...utm, utm_content: contenu };
  verifier(`${nom} : fin de démonstration → devis, source conservée, type=web, utm_content=${contenu}`, Object.entries(attendu).every(([k, v]) => q.get(k) === v) && q.get('type') === 'web', p.url());
  const c = await champsCaches(p);
  verifier(`${nom} : source complète dans les champs cachés du formulaire`, Object.entries(attendu).every(([k, v]) => c[k] === v), JSON.stringify(c));
  verifier(`${nom} : « Application web » présélectionné par ?type=web`, await p.locator('input[name=type][value=web]').isChecked());
  verifier(`${nom} : ni cookie ni stockage`, await sansTrace(p, ctx));
  verifier(`${nom} : seulement des GET vers le site, aucune erreur`, requetes.length === 0 && erreurs.length === 0, requetes.concat(erreurs).join(' | '));
  await ctx.close();
}
await finDeDemo('Mizan Technique, fin du devis simulé', { adresse: '/realisations/demos/services/devis/', utm: UTM, contenu: 'demo-services', derouler: async (p) => {
  const suivant = () => p.locator('[data-act=suivant]').click();
  await p.locator('input[name=service][value=electricite]').check({ force: true }); await p.locator('input[name=nature][value=travaux]').check({ force: true }); await suivant();
  await p.locator('input[name=local][value=commerce]').check({ force: true }); await suivant();
  await p.locator('#f-surface').fill('80'); await suivant();
  await p.locator('input[name=urgence][value=semaine]').check({ force: true }); await suivant();
  await p.locator('#f-description').fill('Texte fictif : tableau électrique à remplacer.'); await suivant();
  await p.locator('#f-nom').fill('Nom Fictif'); await p.locator('#f-email').fill('nom@exemple.invalid'); await p.locator('#f-tel').fill('05 00 00 00 00'); await suivant();
  await p.locator('input[name=accord]').check({ force: true }); await suivant();
  await p.locator('#devis-numero').waitFor();
} });
await finDeDemo('Institut Naïa, rendez-vous confirmé (utm_content de l\'annonce)', { adresse: '/realisations/demos/reservation/reserver/', utm: { ...UTM, utm_content: 'r1-demo-naia-video' }, contenu: 'r1-demo-naia-video', derouler: async (p) => {
  const titre = () => p.$eval('#etape .etape-titre', t => t.textContent).catch(() => '');
  const avancer = async () => { const a = await titre(); await p.click('[data-act=suite]'); await p.waitForFunction(x => document.querySelector('#conf') || (document.querySelector('#etape .etape-titre') || {}).textContent !== x, a); };
  await p.waitForSelector('#etape .etape-titre');
  await p.click('label.cat:has-text("Visage")'); await p.click('label.svc:has-text("Soin éclat express")'); await avancer();
  const auj = new Date().toISOString().slice(0, 10);
  let jour = null;
  for (let m = 0; m < 3 && !jour; m++) { jour = (await p.$$eval('.jour.libre', (bs, a) => bs.map(b => b.dataset.date).filter(x => x > a), auj))[0] || null; if (!jour) await p.click('[data-act=mois][data-d="1"]'); }
  await p.click(`[data-date="${jour}"]`); await p.click('.creneau >> nth=0'); await avancer();
  await p.fill('#f-nom', 'Sara Test'); await p.fill('#f-tel', '06 00 00 00 00'); await p.check('#f-ok'); await avancer();
  await avancer(); await p.waitForSelector('#conf');
} });
// Sans paramètre, les liens restent tels quels.
{
  const ctx = await nav.newContext(); await ctx.route(u => !u.href.startsWith(ORIGINE), r => r.abort()); const p = await ctx.newPage();
  await p.goto(ORIGINE + '/realisations/demos/restaurant/');
  verifier('sans source dans l\'adresse : liens inchangés', (await p.locator('a[href^="/estimer-mon-projet"]').first().getAttribute('href')) === '/estimer-mon-projet/');
  await ctx.close();
}

await nav.close(); serveur.close();
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
