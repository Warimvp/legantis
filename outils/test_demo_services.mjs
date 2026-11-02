// Test de bout en bout de la démonstration Mizan Technique (site/realisations/demos/services/).
// Lancer : node outils/test_demo_services.mjs   (code 1 en cas d'échec)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const DEMO = path.join(ROOT, 'realisations/demos/services');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('introuvable'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const PORT = srv.address().port;
const BASE = `http://127.0.0.1:${PORT}/realisations/demos/services/`;

let echecs = 0, ok = 0;
const verifie = (cond, msg) => { if (cond) ok++; else { echecs++; console.log('  ECHEC :', msg); } };
const section = t => console.log('\n' + t);

const PAGES = ['', 'services/', 'services/climatisation/', 'services/electricite/', 'services/maintenance/', 'realisations/', 'a-propos/', 'contact/', 'devis/'];
const BANDEAU = '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
const page = await ctx.newPage();
const erreursConsole = [], hotes = new Set(), nonGet = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreursConsole.push(m.text()); });
page.on('pageerror', e => erreursConsole.push('pageerror: ' + e.message));
page.on('request', r => { hotes.add(new URL(r.url()).host); if (r.method() !== 'GET') nonGet.push(r.method() + ' ' + r.url()); });

/* ------------------------------------------------------------ 1. contrat de chaque page */
section('1. Contrat de chaque page');
const liensVus = new Set();
for (const p of PAGES) {
  await page.goto(BASE + p);
  const n = p || 'accueil';
  verifie(await page.evaluate(() => document.documentElement.lang) === 'fr', `${n} : lang fr`);
  verifie(await page.locator('meta[name=robots][content="noindex, follow"]').count() === 1, `${n} : noindex, follow`);
  verifie(await page.locator('h1').count() === 1, `${n} : un seul h1`);
  verifie(await page.locator('link[rel=icon][href="/assets/favicon.svg"]').count() === 1, `${n} : favicon`);
  verifie(await page.evaluate(() => document.body.firstElementChild.outerHTML) === BANDEAU, `${n} : bandeau exact en première ligne`);
  verifie(await page.locator('form[action], [action], a[href^="mailto:"], a[href^="tel:"]').count() === 0, `${n} : aucun action, mailto, tel`);
  verifie(await page.locator('header nav a').count() >= 6 && await page.locator('.menu-btn[aria-controls=nav-principale]').count() === 1, `${n} : header et menu`);
  const pied = (await page.locator('footer').innerText()).toLowerCase();
  verifie(pied.includes('entreprise fictive') && pied.includes('05 00 00 00 00') && pied.includes('adresse fictive'), `${n} : footer complet, mention entreprise fictive`);
  verifie(await page.locator('footer a[href="/realisations/"]').count() >= 1, `${n} : lien de retour dans le footer`);
  verifie(await page.locator('nav a[aria-current=page]').count() >= 1, `${n} : page courante signalée`);
  verifie(await page.locator('script[src^="http"], link[href^="http"], img[src^="http"]').count() === 0, `${n} : aucune ressource externe`);
  const hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  hrefs.filter(h => h.startsWith('/')).forEach(h => liensVus.add(h));
  verifie(!/\p{Extended_Pictographic}/u.test(await page.locator('body').innerText()), `${n} : aucun emoji`);
  const texte = await page.locator('body').innerText();
  verifie(!/certifi|label|★|\d+\s*%|clients? satisfaits|avis/i.test(texte.replace(/Aucune? certification ni (d'aucun )?label/gi, '').replace(/ni d'aucun label/gi, '').replace(/certification ni d'aucun label/gi, '')) || p === 'a-propos/', `${n} : pas de label, pourcentage ni avis`);
}
section('2. Liens internes (HTTP)');
for (const h of liensVus) {
  if (h.startsWith('/realisations/demos/services/')) {
    const r = await page.request.get(`http://127.0.0.1:${PORT}${h}`);
    verifie(r.status() === 200, `lien ${h} -> ${r.status()}`);
  } else if (h === '/realisations/') { /* hors démo, intégré par la session principale */ }
  else verifie(false, `lien interne inattendu ${h}`);
}
verifie(liensVus.size >= 12, `au moins 12 liens distincts (${liensVus.size})`);
// relatif/absolu : l'accueil répond aussi sans slash final dans la page demandée en direct
const rIdx = await page.request.get(`http://127.0.0.1:${PORT}/realisations/demos/services/index.html`);
verifie(rIdx.status() === 200, 'index.html répond');

section('3. Pages de service');
for (const k of ['climatisation', 'electricite', 'maintenance']) {
  await page.goto(BASE + `services/${k}/`);
  verifie(await page.locator('details').count() >= 4, `${k} : FAQ en details`);
  verifie(await page.locator(`a[href="/realisations/demos/services/devis/?besoin=${k}"]`).count() >= 1, `${k} : lien vers le devis pré-rempli`);
  for (const t of ['Problèmes traités', 'Déroulé d\'intervention', 'Équipements']) verifie((await page.locator('main').innerText()).toLowerCase().includes(t.toLowerCase()), `${k} : section ${t}`);
  const d = page.locator('details').first();
  verifie(await d.getAttribute('open') === null, `${k} : FAQ fermée au départ`);
  await d.locator('summary').click();
  verifie(await d.getAttribute('open') !== null, `${k} : la FAQ s'ouvre`);
  verifie(await page.locator('svg[role=img] title').count() >= 1, `${k} : schéma SVG accessible`);
}
// le lien pré-remplit le devis
await page.goto(BASE + 'devis/?besoin=electricite');
verifie(await page.locator('input[name=service][value=electricite]').isChecked(), 'devis pré-rempli par ?besoin=electricite');

/* ------------------------------------------------------------ 4. menu mobile */
section('4. Menu mobile');
{
  const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pm = await m.newPage();
  await pm.goto(BASE);
  const btn = pm.locator('.menu-btn');
  verifie(await btn.isVisible(), 'bouton menu visible à 390');
  verifie(await pm.locator('#nav-principale').isHidden(), 'menu replié au départ');
  verifie(await btn.getAttribute('aria-expanded') === 'false', 'aria-expanded=false au départ');
  await btn.click();
  verifie(await pm.locator('#nav-principale').isVisible() && await btn.getAttribute('aria-expanded') === 'true', 'le menu s\'ouvre');
  await pm.keyboard.press('Escape');
  verifie(await pm.locator('#nav-principale').isHidden() && await btn.getAttribute('aria-expanded') === 'false', 'Échap referme');
  verifie(await pm.evaluate(() => document.activeElement.className) === 'menu-btn', 'focus rendu au bouton');
  await btn.click();
  await pm.locator('#nav-principale a', { hasText: 'Contact' }).click();
  await pm.waitForURL(/contact\/$/);
  verifie(true, 'navigation par le menu');
  const tailles = await pm.$$eval('.menu-btn, .nav a', els => els.map(e => e.getBoundingClientRect().height));
  verifie(tailles.every(h => h === 0 || h >= 44), 'cibles tactiles >= 44 px (menu)');
  await m.close();
}

/* ------------------------------------------------------------ 5. filtres */
section('5. Filtres des réalisations');
await page.goto(BASE + 'realisations/');
const visibles = () => page.$$eval('.reals > li', ls => ls.filter(l => !l.hidden).map(l => l.getAttribute('data-type')));
verifie((await visibles()).length === 9, '9 exemples au départ');
verifie(await page.locator('.reals > li:not([hidden]) .fictif', { hasText: 'Exemple fictif' }).count() === 9, 'chaque exemple porte « Exemple fictif »');
for (const [f, n] of [['climatisation', 3], ['electricite', 3], ['maintenance', 3], ['tous', 9]]) {
  await page.locator(`.filtre[data-filtre=${f}]`).click();
  const v = await visibles();
  verifie(v.length === n && (f === 'tous' || v.every(t => t === f)), `filtre ${f} : ${v.length} affichés`);
  verifie(await page.locator(`.filtre[data-filtre=${f}]`).getAttribute('aria-pressed') === 'true', `filtre ${f} : aria-pressed`);
  verifie((await page.locator('#compte').innerText()).startsWith(String(n)), `filtre ${f} : compteur annoncé`);
}
await page.focus('.filtre[data-filtre=maintenance]'); await page.keyboard.press('Enter');
verifie((await visibles()).length === 3, 'filtre au clavier (Entrée)');
verifie(!/\d+\s*%|\d+\s*(clients|chantiers)/i.test(await page.locator('main').innerText()), 'aucun chiffre de résultat');
await page.goto(BASE + 'realisations/?type=electricite');
verifie((await visibles()).every(t => t === 'electricite') && (await visibles()).length === 3, '?type=electricite filtre');

/* ------------------------------------------------------------ 6. parcours de devis */
section('6. Parcours de devis');
const titre = async () => (await page.locator('#devis-titre').textContent()).trim();
const suivant = () => page.locator('[data-act=suivant]').click();
const numEtape = async () => (await page.locator('.progres-txt span').first().textContent()).trim();
await page.goto(BASE + 'devis/');
verifie(await numEtape() === 'Étape 1 sur 7', 'étape 1 sur 7');
verifie(await page.locator('#devis-progres li').count() === 7 && await page.locator('#devis-progres li[aria-current=step]').count() === 1, 'barre de progression à 7 segments');
verifie(await page.locator('[data-act=retour]').count() === 0, 'pas de Retour à la première étape');
// erreurs
await suivant();
verifie((await page.locator('#devis-erreurs').innerText()).includes('2 points'), 'étape 1 vide : 2 erreurs');
verifie(await page.locator('.err').count() === 2 && await numEtape() === 'Étape 1 sur 7', 'on reste à l\'étape 1');
verifie(await page.evaluate(() => document.activeElement.id) === 'devis-erreurs', 'focus sur le résumé d\'erreurs');
await page.locator('input[name=service][value=climatisation]').check({ force: true });
await page.locator('input[name=nature][value=entretien]').check({ force: true });
await suivant();
verifie((await titre()) === 'Votre local', 'étape 2 atteinte');
await suivant();
verifie((await page.locator('.err').innerText()).includes('type de local'), 'étape 2 vide : erreur claire');
await page.locator('input[name=local][value=bureaux]').check({ force: true });
await suivant();
// surface : cas invalides
const surf = page.locator('#f-surface');
await suivant(); verifie((await page.locator('.err').innerText()).includes('surface en m²'), 'surface vide');
for (const [v, label] of [['5', 'trop petite'], ['6000', 'trop grande'], ['12.5', 'décimale']]) {
  await surf.fill(v); await suivant();
  verifie(await page.locator('.err').count() === 1 && await numEtape() === 'Étape 3 sur 7', `surface ${label} refusée (${v})`);
}
verifie(await surf.getAttribute('aria-invalid') === 'true', 'champ surface aria-invalid');
await surf.fill('120'); await suivant();
verifie((await titre()) === 'Délai', 'étape 4 atteinte');
// la fiche se met à jour
verifie((await page.locator('#devis-fiche').innerText()).includes('120 m²'), 'fiche : surface 120 m²');
verifie((await page.locator('#devis-fiche').innerText()).includes('à renseigner'), 'fiche : délai à renseigner');
await page.locator('input[name=urgence][value=quarante]').check({ force: true });
// fourchette indicative indépendante
const TAUX = { climatisation: { travaux: 380, entretien: 18, depannage: 6 }, electricite: { travaux: 260, entretien: 14, depannage: 5 }, maintenance: { travaux: 120, entretien: 22, depannage: 4 } };
const FIXE = { travaux: 4000, entretien: 1200, depannage: 800 }, CL = { bureaux: 1, commerce: 1.1, cuisine: 1.3, entrepot: 0.8, immeuble: 0.9 }, CU = { planifiee: 1, semaine: 1.1, quarante: 1.25, immediate: 1.5 };
const attendu = (s, n, l, u, sf) => { const e = Math.min(sf, 200) + Math.max(0, sf - 200) * 0.6; const b = (FIXE[n] + TAUX[s][n] * e) * CL[l] * CU[u]; const r = x => Math.round(x / 100) * 100; return [r(b * 0.85), r(b * 1.2)]; };
const lireFourchette = async () => (await page.locator('#devis-fiche .fourchette b').innerText()).replace(/[\s\u00a0\u202f]/g, '');
let [lo, hi] = attendu('climatisation', 'entretien', 'bureaux', 'quarante', 120);
verifie(await lireFourchette() === `De${lo}MADà${hi}MAD`, `fourchette ${lo}–${hi} MAD (lue : ${await lireFourchette()})`);
verifie((await page.locator('#devis-fiche').innerText()).toLowerCase().includes('exemple fictif'), 'fourchette annoncée comme exemple fictif');
await suivant();
verifie((await titre()) === 'Description', 'étape 5 atteinte');
await page.locator('#f-description').fill('trop court'); await suivant();
verifie((await page.locator('.err').innerText()).includes('15 caractères'), 'description trop courte refusée');
await page.locator('#f-description').fill('Unités du plateau qui soufflent tiède, accès par l\'escalier de service.'); await suivant();
verifie((await titre()) === 'Vos coordonnées', 'étape 6 atteinte');
await suivant();
verifie(await page.locator('.err').count() === 3, 'coordonnées vides : 3 erreurs');
await page.locator('#f-nom').fill('A'); await page.locator('#f-email').fill('pas-un-mail'); await page.locator('#f-tel').fill('12');
await suivant();
const msgs = await page.locator('.err').allInnerTexts();
verifie(msgs.length === 3 && msgs.some(m => m.includes('nom@exemple.invalid')) && msgs.some(m => m.includes('8 à 14 chiffres')), 'coordonnées invalides : messages précis');
// retour arrière conserve les réponses
await page.locator('[data-act=retour]').click();
verifie((await titre()) === 'Description' && await page.locator('#f-description').inputValue() === 'Unités du plateau qui soufflent tiède, accès par l\'escalier de service.', 'retour : description conservée');
await page.locator('[data-act=retour]').click();
verifie((await titre()) === 'Délai' && await page.locator('input[name=urgence][value=quarante]').isChecked(), 'retour : délai conservé');
await page.locator('[data-act=retour]').click();
verifie(await page.locator('#f-surface').inputValue() === '120', 'retour : surface conservée');
await page.locator('[data-act=retour]').click(); await page.locator('[data-act=retour]').click();
verifie(await page.locator('input[name=service][value=climatisation]').isChecked() && await page.locator('input[name=nature][value=entretien]').isChecked(), 'retour : besoin conservé');
for (let i = 0; i < 5; i++) await suivant();
verifie((await titre()) === 'Vos coordonnées', 'avance jusqu\'aux coordonnées en conservant tout');
await page.locator('#f-nom').fill('Personne Fictive'); await page.locator('#f-societe').fill('Société fictive');
await page.locator('#f-email').fill('personne@exemple.invalid'); await page.locator('#f-tel').fill('05 00 00 00 00');
await suivant();
verifie((await titre()) === 'Récapitulatif' && await numEtape() === 'Étape 7 sur 7', 'récapitulatif atteint');
const recap = await page.locator('.recap').innerText();
for (const t of ['Climatisation', 'Entretien régulier', 'Bureaux', '120 m²', 'Sous 48 heures', 'Personne Fictive', 'personne@exemple.invalid', '05 00 00 00 00', 'plateau']) verifie(recap.includes(t), `récapitulatif contient « ${t} »`);
verifie(await lireFourchetteRecap() === `De${lo}MADà${hi}MAD`, 'récapitulatif : même fourchette');
async function lireFourchetteRecap() { return (await page.locator('.etape .fourchette b').innerText()).replace(/[\s\u00a0\u202f]/g, ''); }
// modifier depuis le récapitulatif : retour direct au récapitulatif
await page.locator('button[data-aller="3"]').click();
verifie((await titre()) === 'Délai', 'Modifier ouvre l\'étape du délai');
await page.locator('input[name=urgence][value=immediate]').check({ force: true }); await suivant();
verifie((await titre()) === 'Récapitulatif' && (await page.locator('.recap').innerText()).includes('Urgence immédiate'), 'après modification, retour au récapitulatif mis à jour');
[lo, hi] = attendu('climatisation', 'entretien', 'bureaux', 'immediate', 120);
verifie(await lireFourchetteRecap() === `De${lo}MADà${hi}MAD`, `fourchette recalculée ${lo}–${hi}`);
// confirmation sans case
await suivant();
verifie((await page.locator('.err').innerText()).includes('Cochez'), 'case non cochée : erreur');
await page.locator('input[name=accord]').check();
await suivant();
verifie((await titre()) === 'Demande simulée enregistrée', 'confirmation simulée');
const num = (await page.locator('#devis-numero').innerText()).trim();
verifie(/^MZ-SIM-\d{6}$/.test(num), `numéro de simulation ${num}`);
verifie((await page.locator('main').innerText()).includes('Rien n\'a été envoyé'), 'la confirmation dit que rien n\'est envoyé');
verifie((await page.locator('#devis-annonce').textContent()).includes(num), 'annonce aria-live avec le numéro');
verifie(await page.locator('#devis-annonce[aria-live=polite]').count() === 1, 'zone aria-live');
verifie(await page.evaluate(() => document.activeElement.id) === 'devis-titre', 'focus sur le titre de confirmation');
verifie(await numEtape() === 'Terminé' && await page.locator('#devis-progres li.fait').count() === 7, 'progression terminée');
await page.locator('#devis-recommencer').click();
verifie((await titre()) === 'Votre besoin' && !(await page.locator('input[name=service][value=climatisation]').isChecked()), 'nouvelle simulation : réponses vidées');
// rechargement : état réinitialisé
await page.reload();
verifie(!(await page.locator('input[name=service]:checked').count()), 'rechargement : état réinitialisé');

section('7. Parcours de devis au clavier');
await page.goto(BASE + 'devis/');
await page.focus('input[name=service]'); await page.keyboard.press('ArrowRight'); // sélectionne électricité
verifie(await page.locator('input[name=service][value=electricite]').isChecked(), 'flèche : choix du domaine');
await page.keyboard.press('Tab'); await page.keyboard.press('Space');
verifie(await page.locator('input[name=nature][value=travaux]').isChecked(), 'Tab + Espace : nature');
await page.keyboard.press('Enter');
verifie((await titre()) === 'Votre local', 'Entrée valide l\'étape 1');
verifie(await page.evaluate(() => document.activeElement.id) === 'devis-titre', 'focus sur le titre de l\'étape');
await page.keyboard.press('Tab'); await page.keyboard.press('ArrowDown');
verifie(await page.locator('input[name=local]:checked').count() === 1, 'clavier : type de local');
await page.keyboard.press('Enter');
verifie((await titre()) === 'Surface', 'clavier : étape surface');
await page.keyboard.press('Tab'); await page.keyboard.type('300'); await page.keyboard.press('Enter');
verifie((await titre()) === 'Délai', 'clavier : surface saisie et validée');
const outline = await page.evaluate(() => { const e = document.querySelector('[data-act=suivant]'); e.focus(); const s = getComputedStyle(e); return s.outlineStyle + ' ' + s.outlineWidth; });
verifie(!outline.startsWith('none'), 'focus visible sur le bouton Suivant (' + outline + ')');

/* ------------------------------------------------------------ 8. contact */
section('8. Formulaire de contact simulé');
await page.goto(BASE + 'contact/');
verifie(await page.locator('#contact-app form').count() === 1 && await page.locator('#contact-app form[action]').count() === 0, 'formulaire présent, sans action');
await page.locator('#contact-app button[type=submit]').click();
verifie(await page.locator('#contact-app .err').count() === 4, 'formulaire vide : 4 erreurs');
verifie(await page.evaluate(() => document.activeElement.name) === 'nom', 'focus sur le premier champ en erreur');
await page.fill('#c-nom', 'Personne Fictive'); await page.fill('#c-email', 'x@y'); await page.selectOption('#c-sujet', { index: 1 }); await page.fill('#c-message', 'Bonjour, ceci est un message de test.');
await page.locator('#contact-app button[type=submit]').click();
verifie(await page.locator('#contact-app .err').count() === 1, 'e-mail invalide : 1 erreur');
await page.fill('#c-email', 'personne@exemple.invalid');
await page.locator('#contact-app button[type=submit]').click();
verifie(await page.locator('.retour').isVisible() && (await page.locator('.retour').innerText()).includes('Rien n\'a été envoyé'), 'message simulé annoncé');
verifie(/^MZ-MSG-\d{6}$/.test((await page.locator('.retour .ref').innerText()).trim()), 'référence de simulation');
await page.locator('#contact-nouveau').click();
verifie(await page.locator('#contact-app form').isVisible() && await page.inputValue('#c-nom') === '', 'nouveau message : formulaire vidé');

/* ------------------------------------------------------------ 9. sans JavaScript */
section('9. Sans JavaScript');
{
  const nj = await browser.newContext({ javaScriptEnabled: false });
  const pn = await nj.newPage();
  for (const p of PAGES) {
    await pn.goto(BASE + p);
    verifie((await pn.locator('h1').innerText()).length > 3 && (await pn.locator('main').innerText()).length > 300, `sans JS ${p || 'accueil'} : contenu présent`);
  }
  await pn.goto(BASE + 'devis/');
  verifie(await pn.locator('#devis-sansjs').isVisible() && (await pn.locator('#devis-sansjs').innerText()).includes('JavaScript'), 'devis : message JavaScript requis');
  await pn.goto(BASE + 'realisations/');
  verifie(await pn.locator('.reals > li:visible').count() === 9, 'sans JS : 9 exemples visibles');
  await pn.goto(BASE + 'contact/');
  verifie(await pn.locator('#contact-sansjs').isVisible(), 'contact : message JavaScript requis');
  await nj.close();
}

/* ------------------------------------------------------------ 10. largeurs */
section('10. Débordement horizontal');
for (const w of [320, 390, 768, 1024, 1440]) {
  const c = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce' });
  const pw = await c.newPage();
  for (const p of PAGES) {
    await pw.goto(BASE + p);
    if (p === 'devis/') { await pw.locator('input[name=service]').first().check({ force: true }); }
    const d = await pw.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    verifie(d.sw <= d.cw, `${p || 'accueil'} à ${w} px : scrollWidth ${d.sw} > ${d.cw}`);
  }
  // étapes du devis les plus larges à 320 et 390
  if (w <= 390) {
    await pw.goto(BASE + 'devis/?besoin=climatisation');
    await pw.locator('input[name=nature][value=travaux]').check({ force: true }); await pw.locator('[data-act=suivant]').click();
    await pw.locator('input[name=local][value=cuisine]').check({ force: true }); await pw.locator('[data-act=suivant]').click();
    await pw.locator('#f-surface').fill('5000'); await pw.locator('[data-act=suivant]').click();
    await pw.locator('input[name=urgence][value=immediate]').check({ force: true });
    const d = await pw.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    verifie(d.sw <= d.cw, `devis (fourchette affichée) à ${w} px sans débordement`);
  }
  await c.close();
}

/* ------------------------------------------------------------ 11. bilan global */
section('11. Réseau, console, stockage, poids');
verifie([...hotes].every(h => h === `127.0.0.1:${PORT}`), `uniquement l'hôte local (${[...hotes].join(', ')})`);
verifie(nonGet.length === 0, 'aucune requête non GET ' + nonGet.join(','));
verifie(erreursConsole.length === 0, 'aucune erreur de console ' + erreursConsole.join(' | '));
await page.goto(BASE + 'devis/');
const stock = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie }));
verifie(stock.ls === 0 && stock.ss === 0 && stock.ck === '', 'aucun stockage ni cookie');
verifie((await ctx.cookies()).length === 0, 'contexte : aucun cookie');
const src = fs.readFileSync(path.join(DEMO, 'services.js'), 'utf8');
verifie(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie/.test(src), 'le code ne contient ni fetch, XHR, beacon, WebSocket ni stockage');
const css = fs.readFileSync(path.join(DEMO, 'services.css'), 'utf8');
verifie(!/https?:\/\//.test(css) && !/https?:\/\/(?!legantis\.net)/.test(src), 'aucune URL externe dans le CSS et le JS');
let poidsMax = 0;
for (const p of PAGES) {
  const f = path.join(DEMO, p, 'index.html');
  poidsMax = Math.max(poidsMax, fs.statSync(f).size + fs.statSync(path.join(DEMO, 'services.css')).size + fs.statSync(path.join(DEMO, 'services.js')).size);
}
verifie(poidsMax < 120 * 1024, `HTML+CSS+JS par page < 120 Ko (max ${(poidsMax / 1024).toFixed(1)} Ko)`);
const polices = fs.readdirSync(path.join(DEMO, 'fonts')).filter(f => f.endsWith('.woff2')).reduce((n, f) => n + fs.statSync(path.join(DEMO, 'fonts', f)).size, 0);
verifie(polices < 150 * 1024, `polices < 150 Ko (${(polices / 1024).toFixed(1)} Ko)`);
verifie(fs.readdirSync(path.join(DEMO, 'fonts')).filter(f => f.endsWith('.woff2')).length <= 4, 'deux familles (4 graisses)');

await browser.close(); srv.close();
console.log(`\n${ok} OK / ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
