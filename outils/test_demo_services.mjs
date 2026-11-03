// Test de bout en bout de la démonstration Mizan Technique (site/realisations/demos/services/).
// Lancer : node outils/test_demo_services.mjs   (code 1 en cas d'échec)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chromium = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];   // NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
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

const PAGES = ['', 'services/', 'services/climatisation/', 'services/electricite/', 'services/maintenance/', 'realisations/', 'a-propos/', 'contact/', 'devis/', 'espace/'];
const TAB = process.env.NAVIGATEUR === 'webkit' ? 'Alt+Tab' : 'Tab';   // WebKit macOS : Alt+Tab pour atteindre les boutons radio
const BANDEAU = '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>';

const browser = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
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
  verifie(!/certifi|label|★|\d+\s*%|clients? satisfaits|avis/i.test(texte.replace(/Aucune? certification ni (d'aucun )?label/gi, '').replace(/ni d'aucun label/gi, '').replace(/certification ni d'aucun label/gi, '')) || p === 'a-propos/' || p === 'espace/', `${n} : pas de label, pourcentage ni avis`);
}
section('2. Liens internes (HTTP)');
for (const h of liensVus) {
  if (h.startsWith('/realisations/demos/services/')) {
    const r = await page.request.get(`http://127.0.0.1:${PORT}${h}`);
    verifie(r.status() === 200, `lien ${h} -> ${r.status()}`);
  } else if (h === '/realisations/' || h === '/estimer-mon-projet/') {   // sorties vers Legantis : réalisations et vraie demande de devis
    const r = await page.request.get(`http://127.0.0.1:${PORT}${h}`);
    verifie(r.status() === 200, `sortie ${h} -> ${r.status()}`);
  }
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
await page.locator('input[name=service][value=climatisation]').check();
await page.locator('input[name=nature][value=entretien]').check();
await suivant();
verifie((await titre()) === 'Votre local', 'étape 2 atteinte');
await suivant();
verifie((await page.locator('.err').innerText()).includes('type de local'), 'étape 2 vide : erreur claire');
await page.locator('input[name=local][value=bureaux]').check();
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
await page.locator('input[name=urgence][value=quarante]').check();
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
await page.locator('input[name=urgence][value=immediate]').check(); await suivant();
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
await page.keyboard.press(TAB); await page.keyboard.press('Space');
verifie(await page.locator('input[name=nature][value=travaux]').isChecked(), 'Tab + Espace : nature');
await page.keyboard.press('Enter');
verifie((await titre()) === 'Votre local', 'Entrée valide l\'étape 1');
verifie(await page.evaluate(() => document.activeElement.id) === 'devis-titre', 'focus sur le titre de l\'étape');
await page.keyboard.press(TAB); await page.keyboard.press('ArrowDown');
verifie(await page.locator('input[name=local]:checked').count() === 1, 'clavier : type de local');
await page.keyboard.press('Enter');
verifie((await titre()) === 'Surface', 'clavier : étape surface');
await page.keyboard.press(TAB); await page.keyboard.type('300'); await page.keyboard.press('Enter');
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
    if (p === 'devis/') { await pw.locator('input[name=service]').first().check(); }
    const d = await pw.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    verifie(d.sw <= d.cw, `${p || 'accueil'} à ${w} px : scrollWidth ${d.sw} > ${d.cw}`);
  }
  // étapes du devis les plus larges à 320 et 390
  if (w <= 390) {
    await pw.goto(BASE + 'devis/?besoin=climatisation');
    await pw.locator('input[name=nature][value=travaux]').check(); await pw.locator('[data-act=suivant]').click();
    await pw.locator('input[name=local][value=cuisine]').check(); await pw.locator('[data-act=suivant]').click();
    await pw.locator('#f-surface').fill('5000'); await pw.locator('[data-act=suivant]').click();
    await pw.locator('input[name=urgence][value=immediate]').check();
    const d = await pw.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    verifie(d.sw <= d.cw, `devis (fourchette affichée) à ${w} px sans débordement`);
  }
  await c.close();
}

/* ------------------------------------------------------------ 12. espace client et gestion */
const E = BASE + 'espace/';
const mad = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD';
const norm = s => s.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
const SEED = {
  'MZ-1041': [650 + 3 * 280 + 4 * 220], 'MZ-1042': [550 + 1450 + 6 * 220], 'MZ-1043': [480 + 5 * 220 + 260],
  'MZ-1044': [3200 + 8 * 95], 'MZ-1045': [650 + 780 + 3 * 220], 'MZ-1049': [900 + 1350],
};
const ttc = ht => ht + Math.round(ht * 0.2);
const onglet = async t => { await page.locator('#tab-' + t).click(); };
const chipDe = sel => page.locator(sel + ' .chip').first().innerText().then(s => s.trim().toLowerCase());
const indic = async nom => norm(await page.locator('.indic > div', { has: page.locator('dt', { hasText: nom }) }).locator('dd').textContent());
const indicSous = async nom => norm(await page.locator('.indic > div', { has: page.locator('dt', { hasText: nom }) }).locator('small').textContent());
const colN = async k => Number((await page.locator(`#col-${k} .cpt`).textContent()).trim());
const etapeCourante = async () => (await page.locator('#cl-detail .etapier li[aria-current=step] b').textContent()).trim();
const badgeG = async () => (await page.locator('#badge-gestion').innerText()).trim().toLowerCase();
const badgeC = async () => (await page.locator('#badge-client').innerText()).trim().toLowerCase();
const ouvrirFiche = async id => { await onglet('gestion'); await page.locator('[data-gv=tableau]').click(); await page.locator(`#p-gestion [data-fiche=${id}]`).click(); await page.locator('#fiche[open]').waitFor(); };
const fermerFiche = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('fiche').open); };
const choisirClient = async id => { await onglet('client'); await page.selectOption('#cl-compte', id); };
const celluleP = (slotIdx, techIdx) => page.locator(`table.planning tbody tr:nth-child(${slotIdx + 1}) td:nth-child(${techIdx + 2})`);
async function demandeEnPage(nom, mail) {
  await onglet('demande');
  await page.locator('input[name=service][value=climatisation]').check();
  await page.locator('input[name=nature][value=depannage]').check(); await suivant();
  await page.locator('input[name=local][value=bureaux]').check(); await suivant();
  await page.locator('#f-surface').fill('150'); await suivant();
  await page.locator('input[name=urgence][value=semaine]').check(); await suivant();
  await page.locator('#f-description').fill('Deux unités du plateau ne refroidissent plus depuis hier.'); await suivant();
  await page.locator('#f-nom').fill(nom); await page.locator('#f-societe').fill('Société inventée');
  await page.locator('#f-email').fill(mail); await page.locator('#f-tel').fill('05 00 00 00 09'); await suivant();
  await page.locator('input[name=accord]').check(); await suivant();
}

section('12. Espace client et gestion : état initial déterministe');
await page.goto(E);
verifie(await page.locator('[role=tab]').count() === 3 && await page.locator('#tab-client[aria-selected=true]').count() === 1, 'trois onglets, « Espace client » actif au départ');
verifie(await page.locator('#sansjs-app').isHidden() && await page.locator('#app').isVisible(), 'avec JavaScript : message sans JS masqué, application visible');
verifie((await page.locator('#effet').textContent()).includes('Aucune action pour l\'instant'), 'bandeau d\'effet : vide au départ');
verifie(await page.locator('.liste-dem .dem').count() === 3 && await etapeCourante() === 'Intervention' && await chipDe('#cl-detail') === 'intervention', 'compte 1 : 3 demandes, MZ-1042 en « Intervention »');
verifie(await page.locator('#cl-detail .etapier li').count() === 7, 'suivi en 7 étapes');
verifie((await page.locator('#cl-detail .etapier li b').allInnerTexts()).map(s => s.trim().toLowerCase()).join('|') === 'reçue|qualifiée|devis envoyé|accepté|planifiée|intervention|terminée', 'étapes dans l\'ordre demandé');
verifie(await badgeC() === 'à jour' && await badgeG() === '7 à traiter', `badges : client « ${await badgeC()} », gestion « ${await badgeG()} »`);
await page.selectOption('#cl-compte', 'c2');
verifie(await page.locator('.liste-dem .dem').count() === 3 && await badgeC() === '1 à traiter', 'compte 2 : 3 demandes, 1 action attendue (créneau à choisir)');
await page.selectOption('#cl-compte', 'c3'); await page.locator('[data-sel=MZ-1045]').click();
verifie(await etapeCourante() === 'Devis envoyé' && norm(await page.locator('#cl-detail .tab-devis').innerText()).includes(mad(ttc(SEED['MZ-1045'][0]))), `compte 3 : devis MZ-1045 affiché, total TTC ${mad(ttc(SEED['MZ-1045'][0]))} recalculé indépendamment`);
await onglet('gestion');
const att = ['recue', 'qualifiee', 'devis', 'accepte', 'planifiee', 'intervention', 'terminee'];
const attendus = [1, 2, 1, 1, 2, 1, 1];
for (let i = 0; i < att.length; i++) verifie(await colN(att[i]) === attendus[i], `colonne ${att[i]} : ${attendus[i]} (lu ${await colN(att[i])})`);
verifie(await colN('refusee') === 1, 'colonne « Devis refusé » : 1');
verifie(await indic('Demandes ouvertes') === '8' && await indic('À qualifier') === '1', 'indicateurs de départ : 8 ouvertes, 1 à qualifier');
verifie((await indicSous('Devis en attente')).startsWith(mad(ttc(SEED['MZ-1045'][0]))) && await indic('Devis en attente') === '1', 'devis en attente : 1, montant = total recalculé');
const acceptes = ['MZ-1041', 'MZ-1042', 'MZ-1043', 'MZ-1044', 'MZ-1049'].reduce((n, k) => n + ttc(SEED[k][0]), 0);
verifie(await indic('Devis acceptés') === '5' && (await indicSous('Devis acceptés')).startsWith(mad(acceptes)), `devis acceptés : 5, ${mad(acceptes)} TTC`);
verifie(await indic('Créneaux occupés') === '3 / 44', 'créneaux occupés : 3 / 44');
await page.selectOption('#g-filtre', 't2');
verifie(await colN('qualifiee') === 1 && await colN('intervention') === 1 && await colN('recue') === 0, 'filtre technicien Lina O. : colonnes recalculées');
await page.selectOption('#g-filtre', 'aucun');
verifie(await colN('recue') === 1 && await colN('qualifiee') === 1 && await colN('devis') === 0, 'filtre « Non affectées » : colonnes recalculées');
await page.selectOption('#g-filtre', 'tous');
// déterminisme : deux chargements identiques
const instantane = async () => { await page.goto(E); await onglet('gestion'); return norm(await page.locator('#p-gestion').innerText()); };
const g1 = await instantane(), g2 = await instantane();
verifie(g1 === g2 && g1.length > 500, 'deux chargements donnent exactement la même gestion (déterministe)');

section('13. Parcours complet : demande créée dans la page, vue des deux côtés');
await page.goto(E);
await demandeEnPage('Personne Fictive', 'personne@exemple.invalid');
verifie((await titre()) === 'Demande enregistrée' && (await page.locator('#devis-numero').innerText()).trim() === 'MZ-1051', 'confirmation : numéro déterministe MZ-1051 (pas MZ-SIM)');
verifie((await page.locator('#devis-etape').innerText()).includes('visible dans l\'espace client et dans la gestion'), 'la confirmation annonce la visibilité des deux côtés');
verifie((await page.locator('#effet').innerText()).includes('MZ-1051'), 'bandeau d\'effet mentionne MZ-1051');
verifie(await badgeG() === '8 à traiter', 'gestion : badge passe de 7 à 8');
await page.locator('[data-vue=client]').click();
verifie(await page.locator('#tab-client[aria-selected=true]').count() === 1 && await page.locator('.liste-dem .dem').count() === 1, 'client : nouveau compte, 1 demande');
verifie((await page.locator('#cl-compte option:checked').innerText()).includes('Personne Fictive') && await etapeCourante() === 'Reçue' && await chipDe('#cl-detail') === 'reçue', 'client : MZ-1051 à l\'étape « Reçue »');
verifie((await page.locator('#cl-detail').innerText()).includes('Deux unités du plateau ne refroidissent plus'), 'client : la description saisie est visible');
await onglet('gestion');
verifie(await indic('Demandes ouvertes') === '9' && await indic('À qualifier') === '2' && await colN('recue') === 2 && await page.locator('#col-recue').locator('xpath=..').locator('[data-fiche=MZ-1051]').count() === 1, 'gestion : 9 ouvertes, 2 à qualifier, carte MZ-1051 dans « Reçue »');
// qualification
await ouvrirFiche('MZ-1051');
await page.locator('[data-act=qualifier]').click();
verifie(await chipDe('#fiche') === 'qualifiée' && (await page.locator('#fiche .ok').innerText()).includes('qualifiée'), 'gestion : statut passé à « Qualifiée », confirmation lue');
verifie(await page.evaluate(() => document.activeElement.id) === 'fiche-titre', 'focus replacé sur le titre de la fiche');
// devis : validations puis lignes, total recalculé
await page.locator('[data-act=envoyer]').click();
verifie((await page.locator('[data-zone=devis]').innerText()).includes('au moins une ligne'), 'devis vide : envoi refusé, message clair');
await page.locator('[data-act=suggerer]').click();
const totalDevis = async () => norm(await page.locator('#totaux .ttc dd').innerText());
const ht0 = 650 + 3 * 280 + 4 * 220;
verifie(await page.locator('.ligne').count() === 3 && await totalDevis() === mad(ttc(ht0)), `devis : 3 lignes proposées, TTC ${mad(ttc(ht0))}`);
await page.locator('.ligne').nth(1).locator('input[data-l$=":q"]').fill('5');
verifie(await totalDevis() === mad(ttc(650 + 5 * 280 + 880)), `quantité 3 → 5 : TTC recalculé ${mad(ttc(650 + 5 * 280 + 880))}`);
verifie(norm(await page.locator('.ligne').nth(1).locator('output').innerText()) === mad(1400), 'total de ligne recalculé (1 400 MAD)');
await page.locator('.ligne').nth(2).locator('[data-suppr]').click();
verifie(await page.locator('.ligne').count() === 2 && await totalDevis() === mad(ttc(650 + 1400)), 'ligne retirée : TTC recalculé');
await page.locator('[data-act=ligne]').click();
verifie(await page.evaluate(() => document.activeElement.id.endsWith('-lib')), 'ligne vide ajoutée, focus sur sa désignation');
await page.locator('[data-act=envoyer]').click();
verifie((await page.locator('[data-zone=devis]').innerText()).includes('Ligne 3') && await page.evaluate(() => document.activeElement.id.endsWith('-lib')), 'ligne vide : envoi refusé, erreur sur la ligne 3 et focus dessus');
const l3 = page.locator('.ligne').nth(2);
await l3.locator('input[data-l$=":lib"]').fill('Déplacement'); await l3.locator('input[data-l$=":p"]').fill('0');
await page.locator('[data-act=envoyer]').click();
verifie((await page.locator('[data-zone=devis]').innerText()).includes('entiers positifs'), 'prix invalide : envoi refusé');
await l3.locator('input[data-l$=":p"]').fill('450');
const htFinal = 650 + 1400 + 450;
verifie(await totalDevis() === mad(ttc(htFinal)), `lignes complétées : TTC ${mad(ttc(htFinal))}`);
await page.locator('[data-act=envoyer]').click();
verifie(await chipDe('#fiche') === 'devis envoyé' && await page.locator('#fiche .tab-devis').count() === 1 && await page.locator('#fiche .ligne').count() === 0, 'devis envoyé : fiche en lecture seule');
verifie((await page.locator('#fiche .tab-devis tfoot .ttc td').innerText()).replace(/\s/g, '') === mad(ttc(htFinal)).replace(/\s/g, ''), 'devis envoyé : total TTC figé = total rédigé');
await fermerFiche();
verifie(await colN('devis') === 2 && await indic('Devis en attente') === '2' && (await indicSous('Devis en attente')).startsWith(mad(ttc(SEED['MZ-1045'][0]) + ttc(htFinal))), 'gestion : indicateurs recalculés (2 devis en attente, montant cumulé)');
await page.waitForFunction(v => (document.activeElement.getAttribute('data-fiche')) === v, 'MZ-1051', { timeout: 1000 }).catch(() => {});   // l'événement close arrive après coup
verifie(await page.evaluate(() => document.activeElement.getAttribute('data-fiche')) === 'MZ-1051', 'fermeture : focus rendu à la carte ouverte');
// côté client : réponse au devis
await onglet('client');
verifie(await badgeC() === '1 à traiter' && await etapeCourante() === 'Devis envoyé' && norm(await page.locator('#cl-detail .tab-devis').innerText()).includes(mad(ttc(htFinal))), 'client : devis visible avec le même total TTC, action attendue signalée');
verifie((await page.locator('#cl-detail .journal').innerText()).includes('Devis v1 envoyé'), 'client : le journal montre l\'envoi du devis');
await page.locator('[data-act=accepter]').click();
verifie(await etapeCourante() === 'Accepté' && await chipDe('#cl-detail') === 'accepté' && (await page.locator('#cl-detail').innerText()).includes('Aucun technicien'), 'client : devis accepté, en attente d\'affectation');
verifie(await page.evaluate(() => document.activeElement.id) === 'cl-titre' && (await page.locator('#cl-detail .ok').textContent()).includes('accepté'), 'client : confirmation lue, focus sur le titre');
await onglet('gestion');
verifie(await colN('accepte') === 2 && await colN('devis') === 1, 'gestion : MZ-1051 passe en « Accepté » (2), « Devis envoyé » redescend à 1');
verifie(await indic('Devis acceptés') === '6', 'gestion : 6 devis acceptés');
// affectation + double affectation
await ouvrirFiche('MZ-1051');
await page.locator('[data-form=affecter] button').click();
verifie((await page.locator('[data-zone=affecter]').innerText()).includes('Choisissez un technicien'), 'affectation sans choix : refusée');
await page.selectOption('#f-tech', 't1'); await page.locator('[data-form=affecter] button').click();
verifie((await page.locator('#fiche .resume').innerText()).includes('Samir A.') && (await page.locator('#fiche .ok').innerText()).includes('Samir A.'), 'gestion : MZ-1051 affectée à Samir A.');
verifie(await page.locator('#f-slot option').count() === 1 + 11, 'créneaux proposés à Samir A. : 11 libres (1 indisponible)');
await fermerFiche();
await onglet('client');
verifie(await page.locator('#cl-detail input[name=creneau]').count() === 11 && (await page.locator('#cl-detail').textContent()).includes('Choisissez votre créneau'), 'client : mêmes 11 créneaux proposés, sans le créneau de formation');
await page.locator('#cl-detail [data-form=creneau] button').click();
verifie((await page.locator('#cl-detail [data-zone]').innerText()).includes('Choisissez un créneau'), 'client : créneau non choisi, message clair');
await page.locator('#cl-detail input[name=creneau][value=mar-am]').check();
await page.locator('#cl-detail [data-form=creneau] button').click();
verifie(await etapeCourante() === 'Planifiée' && (await page.locator('#cl-detail .action-box').innerText()).includes('Mar. 10 nov. · matin'), 'client : créneau confirmé, étape « Planifiée »');
await onglet('gestion'); await page.locator('[data-gv=planning]').click();
verifie((await celluleP(2, 0).innerText()).includes('MZ-1051'), 'planning : MZ-1051 apparaît chez Samir A. le mardi matin');
verifie(await indic('Créneaux occupés') === '4 / 44', 'indicateur : 4 / 44 créneaux occupés');
// aucune double affectation possible
await ouvrirFiche('MZ-1044');
const optionsAvant = await page.locator('#f-slot option').allInnerTexts();
verifie(optionsAvant.length === 1 + 10 && !optionsAvant.some(t => t.includes('Mar. 10 nov. · matin')) && !optionsAvant.some(t => t.includes('Jeu. 12 nov. · après-midi')), 'MZ-1044 (Samir A.) : le créneau pris par MZ-1051 et la formation ne sont plus proposés');
await page.selectOption('#f-slot', 'lun-am'); await page.locator('[data-form=planifier] button').click();
verifie(await chipDe('#fiche') === 'planifiée' && (await page.locator('#fiche .resume').innerText()).includes('Lun. 9 nov. · matin'), 'MZ-1044 planifiée lundi matin avec Samir A.');
await page.selectOption('#f-tech', 't2'); await page.locator('[data-form=affecter] button').click();
verifie(await page.locator('[data-zone=affecter]').isVisible() && (await page.locator('[data-zone=affecter]').innerText()).includes('déjà affecté à MZ-1042') && (await page.locator('#fiche .resume').innerText()).includes('Samir A.'), 'réaffecter MZ-1044 à Lina O. : refusé (déjà MZ-1042 lundi matin), technicien inchangé');
await fermerFiche();
await page.locator('[data-gv=planning]').click();
verifie(await celluleP(0, 0).innerText().then(s => s.includes('MZ-1044')) && !(await celluleP(0, 1).innerText()).includes('MZ-1044'), 'planning : MZ-1044 chez Samir A. seulement');
// placement direct depuis le planning
await page.selectOption('#pl-placer', 'MZ-1044');
const libresAvant = await page.locator('button.act').count();
verifie(libresAvant === 48 - 4 - 5 && (await celluleP(0, 1).locator('button.act').count()) === 0 && (await celluleP(7, 0).locator('button.act').count()) === 0, `placement : ${libresAvant} cases libres cliquables, aucune case occupée ni indisponible`);
await celluleP(3, 3).locator('button.act').click();
verifie((await celluleP(3, 3).innerText()).includes('MZ-1044') && (await celluleP(0, 0).innerText()).includes('Libre'), 'MZ-1044 déplacée chez Nora K. mardi après-midi, ancien créneau libéré');
verifie(await indic('Créneaux occupés') === '5 / 44', 'indicateur : 5 / 44');
// intervention
await ouvrirFiche('MZ-1051');
await page.locator('[data-act=demarrer]').click();
verifie(await chipDe('#fiche') === 'intervention' && await page.locator('#f-t-cr').count() === 1, 'gestion : intervention démarrée, formulaire de compte rendu ouvert');
await fermerFiche();
await onglet('client'); await page.selectOption('#cl-compte', 'c5');
verifie(await etapeCourante() === 'Intervention' && (await page.locator('#cl-detail .action-box').innerText()).includes('Samir A. est sur site'), 'client : voit l\'intervention en cours');
// compte rendu
await ouvrirFiche('MZ-1051');
await page.locator('[data-form=cr] button[type=submit]').click();
verifie((await page.locator('[data-zone=cr]').innerText()).includes('constats') && await page.evaluate(() => document.activeElement.id) === 'cr-constats', 'compte rendu vide : refusé, focus sur les constats');
await page.locator('[data-act=modele-cr]').click();
verifie((await page.locator('#cr-constats').inputValue()).length > 30 && await page.locator('#cr-duree').inputValue() === '3', 'compte rendu type inséré');
await page.fill('#cr-duree', 'abc'); await page.locator('[data-form=cr] button[type=submit]').click();
verifie((await page.locator('[data-zone=cr]').innerText()).includes('durée'), 'durée invalide : refusée');
await page.fill('#cr-duree', '2,5'); await page.fill('#cr-constats', 'Compresseur sain, détendeur encrassé sur la cassette 2.');
await page.locator('[data-form=cr] button[type=submit]').click();
verifie(await chipDe('#fiche') === 'terminée' && (await page.locator('#fiche').textContent()).includes('Compte rendu d\'intervention'), 'gestion : demande terminée, compte rendu consultable');
await fermerFiche();
verifie(await colN('terminee') === 2 && await colN('intervention') === 1 && await indic('Demandes ouvertes') === '8', 'gestion : colonnes et indicateurs recalculés (2 terminées, 8 ouvertes)');
await onglet('client');
const crTexte = await page.locator('#cl-detail').innerText();
verifie(await etapeCourante() === 'Terminée' && crTexte.toLowerCase().includes('compte rendu d\'intervention') && crTexte.includes('Compresseur sain, détendeur encrassé') && crTexte.includes('2,5 h') && /Samir A\./.test(crTexte), 'client : compte rendu lisible (constats saisis côté gestion, durée 2,5 h, technicien)');
verifie(await badgeC() === 'à jour' && (await page.locator('#cl-detail .journal li').count()) >= 8, 'client : plus rien à faire, journal complet (8 événements ou plus)');

section('14. Refus de devis, changement de créneau côté client');
await page.goto(E);
await page.selectOption('#cl-compte', 'c3'); await page.locator('[data-sel=MZ-1045]').click();
await page.locator('.refus summary').click(); await page.selectOption('#refus-motif', 'Montant trop élevé');
await page.locator('[data-form=refus] button').click();
verifie(await chipDe('#cl-detail') === 'devis refusé' && (await page.locator('#cl-detail .etapier li.refus').count()) === 1 && (await page.locator('#cl-detail .etapier li.off').count()) === 4, 'client : devis refusé, suivi interrompu à l\'étape « Devis envoyé »');
await onglet('gestion');
verifie(await colN('devis') === 0 && await colN('refusee') === 2 && await indic('Devis en attente') === '0' && await indic('Demandes ouvertes') === '7', 'gestion : colonne « Devis refusé » 2, devis en attente 0, 7 ouvertes');
await ouvrirFiche('MZ-1045');
verifie((await page.locator('#fiche .journal').innerText()).includes('montant trop élevé') && await page.locator('[data-act=envoyer]').count() === 0, 'gestion : motif dans le journal, plus d\'action possible');
await fermerFiche();
await choisirClient('c2'); await page.locator('[data-sel=MZ-1043]').click();
await page.locator('.refus summary').click();
const optsC = await page.locator('#cl-detail input[name=creneau]').count();
verifie(optsC === 11, 'client : MZ-1043 propose les 11 créneaux libres de Hamza T. (son créneau actuel inclus)');
await page.locator('#cl-detail input[name=creneau][value=mer-pm]').check();
await page.locator('#cl-detail [data-form=creneau] button').click();
await onglet('gestion'); await page.locator('[data-gv=planning]').click();
verifie((await celluleP(5, 2).innerText()).includes('MZ-1043') && (await celluleP(3, 2).innerText()).includes('Libre'), 'planning : MZ-1043 déplacée au mercredi après-midi, mardi après-midi libéré');

section('15. Reprise d\'une demande faite sur la page « Demander un devis »');
await page.goto(BASE + 'devis/?besoin=climatisation');
await page.locator('input[name=nature][value=depannage]').check(); await suivant();
await page.locator('input[name=local][value=commerce]').check(); await suivant();
await page.locator('#f-surface').fill('80'); await suivant();
await page.locator('input[name=urgence][value=quarante]').check(); await suivant();
await page.locator('#f-description').fill('Climatiseur de la boutique en panne depuis ce matin.'); await suivant();
await page.fill('#f-nom', 'Visiteur Fictif'); await page.fill('#f-email', 'visiteur@exemple.invalid'); await page.fill('#f-tel', '05 00 00 00 08'); await suivant();
await page.locator('input[name=accord]').check(); await suivant();
const lienSuite = page.locator('a[href*="/espace/?import=1"]');
verifie(await lienSuite.count() === 1 && (await page.locator('main').innerText()).includes('Rien n\'a été envoyé'), 'page devis : lien « Suivre cette demande dans l\'espace client », rien envoyé');
await lienSuite.click(); await page.waitForURL(/espace\/#client$/);
verifie(await page.locator('#tab-client[aria-selected=true]').count() === 1 && (await page.locator('#cl-detail').innerText()).includes('Climatiseur de la boutique') && await etapeCourante() === 'Reçue', 'espace : la demande est recréée, visible côté client, URL nettoyée');
await onglet('gestion');
verifie(await colN('recue') === 2 && await indic('À qualifier') === '2', 'gestion : la même demande est en « Reçue »');
await page.reload();
verifie(await colN('recue') === 1 && !(await page.content()).includes('Climatiseur de la boutique'), 'rechargement : la demande a disparu (état en mémoire seulement)');
await page.goto(E + '?import=1&service=nimporte');
verifie(await page.locator('#effet').innerText().then(s => s.includes('non valides') || s.includes('pas valides')) && await page.locator('.liste-dem .dem').count() === 3, 'paramètres invalides : ignorés, message, aucune demande créée');
await page.goto('about:blank'); await page.goto(E + '#gestion');
verifie(await page.locator('#tab-gestion[aria-selected=true]').count() === 1, 'ancre #gestion ouvre la gestion');

section('16. Réinitialisation, clavier, boîte de dialogue');
await page.goto(E);
await demandeEnPage('Autre Fictive', 'autre@exemple.invalid');
await page.locator('[data-reset]').click(); await page.waitForTimeout(150);
verifie(await page.locator('#cl-compte option').count() === 4 && await badgeG() === '7 à traiter' && (await page.locator('#app-annonce').innerText()).includes('réinitialisées'), 'réinitialisation : données de départ rétablies');
await page.focus('#tab-client'); await page.keyboard.press('ArrowRight');
verifie(await page.locator('#tab-gestion[aria-selected=true]').count() === 1 && await page.evaluate(() => document.activeElement.id) === 'tab-gestion', 'flèche droite : onglet Gestion actif et focalisé');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
verifie(await page.locator('#tab-client[aria-selected=true]').count() === 1, 'flèches : navigation circulaire entre onglets');
await page.keyboard.press('End');
verifie(await page.locator('#tab-gestion[aria-selected=true]').count() === 1, 'Fin : dernier onglet');
await page.focus('#p-gestion [data-fiche=MZ-1047]'); await page.keyboard.press('Enter');
verifie(await page.locator('#fiche[open]').count() === 1 && await page.evaluate(() => document.getElementById('fiche').contains(document.activeElement)), 'carte au clavier : fiche modale ouverte, focus dedans');
for (let i = 0; i < 40; i++) await page.keyboard.press(TAB);
verifie(await page.evaluate(() => document.getElementById('fiche').contains(document.activeElement)), 'focus piégé dans la fiche après 40 tabulations');
await page.keyboard.press('Escape');
verifie(await page.locator('#fiche[open]').count() === 0 && await page.evaluate(() => document.activeElement.getAttribute('data-fiche')) === 'MZ-1047', 'Échap ferme la fiche et rend le focus à la carte');
verifie(await page.locator('#app [role=tabpanel]:not([hidden])').count() === 1, 'un seul panneau visible');
await page.evaluate(() => new Promise(r => setTimeout(r, 0)));   // laisse passer l'événement close et son rendu
await page.focus('#p-gestion [data-fiche=MZ-1047]'); await page.keyboard.press('Space');
await page.waitForFunction(() => document.getElementById('fiche').contains(document.activeElement));   // Espace agit au relâchement : on attend que la fiche ait pris le focus, comme une personne
await page.locator('#fiche [data-act=qualifier]').focus(); await page.keyboard.press('Enter');
verifie(await chipDe('#fiche') === 'qualifiée', 'qualification entièrement au clavier (lu : ' + await chipDe('#fiche') + ', ouvert : ' + await page.locator('#fiche[open]').count() + ')');
await fermerFiche();

section('17. Espace : sans JavaScript, largeurs, ordinateur et téléphone');
{
  const nj = await browser.newContext({ javaScriptEnabled: false });
  const pn = await nj.newPage(); await pn.goto(E);
  verifie(await pn.locator('#sansjs-app').isVisible() && (await pn.locator('#sansjs-app').innerText()).includes('JavaScript') && await pn.locator('#app').isHidden(), 'sans JS : message clair, application masquée');
  await nj.close();
}
for (const w of [320, 390, 768, 1024, 1440]) {
  const c = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce' });
  const pw = await c.newPage(); await pw.goto(E);
  const deborde = async nom => { const d = await pw.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, dl: (() => { const f = document.getElementById('fiche'); return f.open ? f.scrollWidth - f.clientWidth : 0; })() })); verifie(d.sw <= d.cw && d.dl <= 0, `espace ${nom} à ${w} px : scrollWidth ${d.sw} / ${d.cw}, dialogue ${d.dl}`); };
  await deborde('client');
  await pw.locator('[data-sel=MZ-1041]').click(); await deborde('client, compte rendu');
  await pw.selectOption('#cl-compte', 'c3'); await pw.locator('[data-sel=MZ-1045]').click(); await deborde('client, devis');
  await pw.locator('#tab-gestion').click(); await deborde('gestion, tableau');
  await pw.locator('[data-gv=planning]').click(); await pw.selectOption('#pl-placer', 'MZ-1044'); await deborde('gestion, planning');
  await pw.locator('[data-gv=tableau]').click(); await pw.locator('[data-fiche=MZ-1050]').click(); await pw.locator('[data-act=suggerer]').click(); await deborde('fiche, éditeur de devis');
  await pw.keyboard.press('Escape'); await pw.locator('[data-fiche=MZ-1042]').click(); await deborde('fiche, compte rendu'); await pw.keyboard.press('Escape');
  await pw.locator('#tab-demande').click(); await deborde('nouvelle demande');
  const cibles = await pw.evaluate(() => [...document.querySelectorAll('#app button, #app select, #app input:not([type=radio]):not([type=checkbox]), #app summary')].filter(e => e.offsetParent !== null).map(e => ({ n: (e.className || e.id || e.tagName).toString().slice(0, 30), h: e.getBoundingClientRect().height })).filter(x => x.h < 44));
  verifie(cibles.length === 0, `espace à ${w} px : cibles tactiles >= 44 px ${JSON.stringify(cibles.slice(0, 3))}`);
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
for (const j of ['services.js', 'pages.js', 'espace/espace.js']) {
  const src = fs.readFileSync(path.join(DEMO, j), 'utf8');
  verifie(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie|indexedDB/.test(src), `${j} : ni fetch, XHR, beacon, WebSocket ni stockage`);
  verifie(!/https?:\/\//.test(src), `${j} : aucune URL externe`);
}
for (const c of ['services.css', 'pages.css', 'espace/espace.css']) verifie(!/https?:\/\//.test(fs.readFileSync(path.join(DEMO, c), 'utf8')), `${c} : aucune URL externe`);
let poidsMax = 0, pageMax = '';
for (const p of PAGES) {
  const f = path.join(DEMO, p, 'index.html'), h = fs.readFileSync(f, 'utf8');
  const liees = [...h.matchAll(/(?:href|src)="\/realisations\/demos\/services\/([^"]+\.(?:css|js))"/g)].map(m => fs.statSync(path.join(DEMO, m[1])).size);
  const total = fs.statSync(f).size + liees.reduce((a, b) => a + b, 0);
  if (total > poidsMax) { poidsMax = total; pageMax = p || 'accueil'; }
}
verifie(poidsMax < 120 * 1024, `HTML+CSS+JS liés par page < 120 Ko (max ${(poidsMax / 1024).toFixed(1)} Ko, page ${pageMax})`);
const polices = fs.readdirSync(path.join(DEMO, 'fonts')).filter(f => f.endsWith('.woff2')).reduce((n, f) => n + fs.statSync(path.join(DEMO, 'fonts', f)).size, 0);
verifie(polices < 150 * 1024, `polices < 150 Ko (${(polices / 1024).toFixed(1)} Ko)`);
verifie(fs.readdirSync(path.join(DEMO, 'fonts')).filter(f => f.endsWith('.woff2')).length <= 4, 'deux familles (4 graisses)');

await browser.close(); srv.close();
console.log(`\n${ok} OK / ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
