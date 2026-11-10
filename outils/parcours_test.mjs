// Parcours de conversion de bout en bout : vraies pages servies en HTTP, vrai code du Worker (worker/src/index.js), Resend simulé (aucun mail ne part).
//     node outils/parcours_test.mjs            SITE_ROOT=<dossier> pour un autre site
// Chromium (Playwright de RydeX). Chaque vérification échoue si le comportement disparaît ; le script sort 1 s'il y a un échec.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';

const require = createRequire(import.meta.url);
const chromium = require('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];   // NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
const RACINE = process.env.SITE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const WORKER = 'https://legantis-devis.rihla-serveur.workers.dev/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const serveur = http.createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(RACINE, chemin);
  try {
    if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;
const ENV = { SITE_ORIGIN: ORIGINE, MAIL_TO: 'contact@legantis.net', MAIL_FROM: 'Formulaire <formulaire@legantis.net>', RESEND_API_KEY: 're_test' };

let envois = [], resendEnPanne = false;
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://api.resend.com/emails') throw new Error('requête inattendue du Worker vers ' + url);   // l'adresse à auditer n'est jamais ouverte
  if (resendEnPanne) return new Response('{}', { status: 500 });
  envois.push(JSON.parse(options.body));
  return new Response('{"id":"x"}', { status: 200 });
};

let ok = 0, ko = 0;
const verifier = (nom, condition, detail = '') => { if (condition) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, detail); } };

const navigateur = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
const tiers = new Set();
async function contexte(options = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE) && !u.href.startsWith(WORKER), r => { tiers.add(new URL(r.request().url()).host); return r.abort(); });
  await ctx.route(WORKER, async route => {
    const q = route.request();
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const requete = new Request(WORKER, { method: q.method(), body: q.postData() || undefined, headers: { 'Content-Type': q.headers()['content-type'] || '', Origin: q.headers().origin || ORIGINE, Accept: q.headers().accept || '', 'CF-Connecting-IP': '203.0.113.9' } });
    const r = await worker.fetch(requete, ENV);
    if (process.env.NAVIGATEUR === 'webkit' && r.status === 303) return route.fulfill({ status: 200, contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=${r.headers.get('Location')}">` });   // Playwright ne simule pas une redirection sur WebKit
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
  });
  return ctx;
}
const contact = async (page, prefixe) => {
  await page.fill(`#${prefixe}-nom`, 'Sara Test');
  await page.fill(`#${prefixe}-entreprise`, 'Atelier Test');
  await page.fill(`#${prefixe}-email`, 'sara@exemple.ma');
  await page.fill(`#${prefixe}-tel`, '06 12 34 56 78');
};
const visible = (page, s) => page.locator(s).isVisible();

// ── Accueil → simulateur, parcours complet ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.goto(ORIGINE + '/');
  await page.click('.ouverture .bouton--plein');
  await page.waitForURL('**/estimer-mon-projet/');
  verifier('le bouton de l\'ouverture mène au simulateur', page.url().endsWith('/estimer-mon-projet/'));
  verifier('étape 1 seule visible', await visible(page, '[data-etape="1"]') && !(await visible(page, '[data-etape="2"]')));
  await page.click('[data-suite]');
  verifier('Continuer sans choix : reste à l\'étape 1', await visible(page, '[data-etape="1"]'));
  await page.check('input[name="type"][value="vitrine"]');
  await page.click('[data-suite]');
  verifier('étape 2 : fonctionnalités du site vitrine', await visible(page, '[data-pour="vitrine"]') && !(await visible(page, '[data-pour="ecommerce"]')) && !(await visible(page, '[data-pour="web mobile logiciel"]')));
  await page.selectOption('#estimer-pages', '4a6');
  await page.check('input[name="fonctions"][value="formulaire"]');
  await page.check('input[name="fonctions"][value="multilingue"]');
  await page.click('[data-suite]');
  await page.check('input[name="delai"][value="1a3mois"]');
  await page.click('[data-suite]');
  const texte = await page.locator('[data-etape="4"]').innerText();
  verifier('étape 4 : message d\'estimation personnalisée, grille non validée', texte.includes('Votre projet nécessite une estimation personnalisée. Recevez un devis gratuit adapté à vos besoins.'));
  verifier('étape 4 : aucun montant affiché', !/\d\s*MAD/.test(texte), texte);
  verifier('étape 4 : récapitulatif des choix', ['Site vitrine', '4 à 6 pages', 'Formulaire de contact', 'Multilingue', 'Dans 1 à 3 mois'].every(m => texte.includes(m)), texte);
  await page.click('[data-suite]');
  await page.click('.assistant-envoi button');
  verifier('étape 5 : envoi vide bloqué par le navigateur', envois.length === 0 && await visible(page, '[data-etape="5"]'));
  await contact(page, 'estimer');
  await page.selectOption('#estimer-budget', '5a15');
  await page.fill('#estimer-projet', 'Un site pour présenter nos services.');
  await page.check('#estimer-consentement');
  await page.click('.assistant-envoi button');
  await page.locator('#devis-envoye').waitFor({ state: 'visible' });
  verifier('envoi : message de succès, formulaire et progression masqués', await visible(page, '#devis-envoye') && !(await visible(page, 'form.assistant')) && !(await visible(page, '.assistant-progression')) && !(await visible(page, '.assistant-compteur')));
  verifier('envoi : le script masque lui-même le formulaire, sans dépendre de :has() (navigateurs plus anciens)', await page.locator('form.assistant').evaluate(f => f.hidden === true));
  verifier('envoi : un seul mail', envois.length === 1);
  const m = envois[0];
  verifier('mail : objet', m?.subject === 'Demande de devis — Site vitrine — Sara Test', m?.subject);
  verifier('mail : récapitulatif complet', ['Parcours : Simulateur de projet', 'Nombre de pages : 4 à 6 pages', 'Fonctionnalités : Formulaire de contact, Multilingue', 'Budget envisagé : 5 000 à 15 000 MAD', 'Délai souhaité : Dans 1 à 3 mois', 'Estimation affichée au visiteur : Estimation personnalisée', 'Consentement au traitement : oui'].every(l => m?.text.includes(l)), m?.text);
  verifier('aucun cookie', (await ctx.cookies()).length === 0);
  verifier('aucune erreur de script', erreurs.length === 0, erreurs.join(' | '));
  await ctx.close();
}

// ── Contexte et navigation de l'assistant ────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/application-mobile-casablanca/');
  await page.click('.barre-cta');
  await page.waitForURL('**/estimer-mon-projet/?type=mobile');
  await page.waitForSelector('form.assistant--actif');
  await page.waitForSelector('[data-pour="web mobile logiciel"]', { state: 'visible', timeout: 3000 }).catch(() => {});
  verifier('page de prestation : le type est repris, étape 2 directement', await visible(page, '[data-etape="2"]') && await visible(page, '[data-pour="web mobile logiciel"]') && await page.isChecked('input[name="type"][value="mobile"]'));
  await page.click('[data-retour]');
  verifier('Retour : étape 1, choix conservé', await visible(page, '[data-etape="1"]') && await page.isChecked('input[name="type"][value="mobile"]'));
  await page.check('input[name="type"][value="autre"]');
  await page.click('[data-suite]');
  verifier('« Autre besoin » saute les fonctionnalités', await visible(page, '[data-etape="3"]'));
  await page.click('[data-retour]');
  verifier('Retour depuis le délai : revient au type', await visible(page, '[data-etape="1"]'));
  await page.check('input[name="type"][value="ecommerce"]');
  await page.click('[data-suite]');
  await page.check('input[name="fonctions"][value="stock"]');
  await page.goBack();
  verifier('bouton Précédent du navigateur : revient à l\'étape 1 sans quitter la page', await visible(page, '[data-etape="1"]') && page.url().includes('estimer-mon-projet'));
  await page.goForward();
  verifier('bouton Suivant : retrouve l\'étape 2 et la case cochée', await visible(page, '[data-etape="2"]') && await page.isChecked('input[name="fonctions"][value="stock"]'));
  await ctx.close();
}

// ── Clavier seul ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/estimer-mon-projet/');
  const actif = () => page.evaluate(() => { const e = document.activeElement; return e.name || e.getAttribute('data-suite') !== null && 'suite' || e.tagName; });
  await page.locator('input[name="type"]').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  verifier('clavier : flèches et espace choisissent le type', await page.isChecked('input[name="type"][value="ecommerce"]'));
  await page.keyboard.press('Enter');
  verifier('clavier : Entrée avance sans envoyer', await visible(page, '[data-etape="2"]') && envois.length === 0);
  verifier('clavier : le focus suit le titre de l\'étape', (await page.evaluate(() => document.activeElement.textContent)).includes('De quoi avez-vous besoin'));
  await page.keyboard.press(process.env.TOUCHE_TAB || 'Tab');
  verifier('clavier : Tab entre dans les fonctionnalités visibles', await actif() === 'fonctions', await actif());
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.locator('input[name="delai"]').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter').catch(() => {});
  verifier('clavier : les étapes s\'enchaînent jusqu\'au contact', await visible(page, '[data-etape="4"]') || await visible(page, '[data-etape="5"]'));
  await page.goto(ORIGINE + '/');
  await page.keyboard.press(process.env.TOUCHE_TAB || 'Tab');
  verifier('clavier : premier arrêt sur le lien d\'évitement', (await page.evaluate(() => document.activeElement.className)) === 'lien-evitement');
  await ctx.close();
  const tel = await contexte({ viewport: { width: 390, height: 700 } }); const q = await tel.newPage();
  await q.goto(ORIGINE + '/audit-gratuit/');
  await q.locator('#audit-consentement').focus();
  const b = await q.evaluate(() => { const c = document.querySelector('.contact-rapide').getBoundingClientRect(); const f = document.querySelector('#audit-consentement').getBoundingClientRect(); return f.bottom <= c.top; });
  verifier('téléphone : un champ focalisé ne passe pas sous la barre fixe', b);
  await tel.close();
}

// ── Erreurs ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/estimer-mon-projet/?type=autre');
  await page.check('input[name="delai"][value="vite"]');
  await page.click('[data-suite]'); await page.click('[data-suite]');
  await contact(page, 'estimer');
  await page.fill('#estimer-tel', 'abc');
  await page.selectOption('#estimer-budget', 'definir');
  await page.fill('#estimer-projet', 'Reprendre une application existante.');
  await page.check('#estimer-consentement');
  await page.click('.assistant-envoi button');
  await page.locator('#erreur-telephone').waitFor();
  verifier('validation serveur : erreur sur le champ, focus dessus', (await page.locator('#erreur-telephone').innerText()).includes('numéro') && await page.evaluate(() => document.activeElement.id) === 'estimer-tel');
  verifier('erreur : champ lié à son message (aria)', await page.getAttribute('#estimer-tel', 'aria-describedby') === 'erreur-telephone' && await page.getAttribute('#estimer-tel', 'aria-invalid') === 'true');
  verifier('erreur : rien n\'est parti', envois.length === 0);
  resendEnPanne = true;
  await page.fill('#estimer-tel', '0612345678');
  await page.click('.assistant-envoi button');
  await page.locator('#devis-echec').waitFor({ state: 'visible' });
  verifier('panne d\'envoi : message d\'échec', await visible(page, '#devis-echec'));
  verifier('panne d\'envoi : la saisie est conservée', await page.inputValue('#estimer-projet') === 'Reprendre une application existante.' && await page.isChecked('#estimer-consentement'));
  verifier('panne d\'envoi : erreur précédente effacée', await page.locator('#erreur-telephone').count() === 0);
  resendEnPanne = false;
  await page.click('.assistant-envoi button');
  await page.locator('#devis-envoye').waitFor({ state: 'visible' });
  verifier('nouvel essai réussi après la panne', envois.length === 1 && !(await visible(page, '#devis-echec')));
  await ctx.close();
}

// ── Sans JavaScript ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte({ javaScriptEnabled: false }); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/estimer-mon-projet/');
  verifier('sans script : toutes les étapes visibles', await page.locator('[data-etape]:visible').count() === 5);
  verifier('sans script : navigation de l\'assistant masquée', !(await visible(page, '.assistant-nav')) && await visible(page, '.assistant-envoi button'));
  await page.check('input[name="type"][value="vitrine"]');
  await page.check('input[name="delai"][value="vite"]');
  await contact(page, 'estimer');
  await page.selectOption('#estimer-budget', '15a50');
  await page.fill('#estimer-projet', 'Un site pour mon entreprise.');
  await page.check('#estimer-consentement');
  await page.click('.assistant-envoi button');
  await page.waitForURL('**/estimer-mon-projet/#devis-envoye');
  verifier('sans script : retour sur la page, message affiché, formulaire masqué', await visible(page, '#devis-envoye') && !(await visible(page, 'form.assistant')));
  verifier('sans script : mail parti', envois.length === 1);
  await page.goto(ORIGINE + '/realisations/');
  await page.check('#f-demo');
  verifier('sans script : le filtre des réalisations fonctionne', await page.locator('.projet:visible').count() === 4);
  await page.goto(ORIGINE + '/');
  await page.fill('#devis-nom', 'Sara Test'); await page.fill('#devis-email', 'sara@exemple.ma'); await page.selectOption('#devis-type', 'site'); await page.fill('#devis-projet', 'Un site pour mon entreprise.');
  await page.click('#devis form button[type="submit"]');
  verifier('accueil : case de consentement obligatoire', envois.length === 1 && page.url().endsWith('/'));
  await page.check('#devis-consentement');
  await page.click('#devis form button[type="submit"]');
  await page.waitForURL('**/#devis-envoye');
  verifier('accueil : formulaire générique envoyé, consentement noté', envois.length === 2 && envois[1].text.includes('Consentement au traitement : oui'), envois[1]?.text);
  await ctx.close();
}

// ── Source marketing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS]' });
  const page = await ctx.newPage();
  await page.goto(ORIGINE + '/offre-lancement/?utm_source=facebook&utm_medium=paid&utm_campaign=lancement&utm_content=video%201');
  verifier('page d\'offre : aucune navigation hors logo et action', await page.locator('.barre nav').count() === 0 && await page.locator('#menu').count() === 0);
  verifier('page d\'offre : barre d\'action fixe vers le formulaire', await visible(page, '.contact-rapide-devis'));
  const prixAffiches = await page.locator('.pack-prix').allInnerTexts();
  verifier('page d\'offre : une offre, prix hors taxes', prixAffiches.length === 1 && prixAffiches.every(t => /MAD HT$/.test(t.replace(/\s+/g, ' ').trim())), prixAffiches.join(' | '));
  await page.locator('a[data-pack="visibilite"]').tap();
  verifier('page d\'offre : le bouton de la carte Visibilité présélectionne la formule dans le formulaire', await page.inputValue('#demande-pack') === 'visibilite');
  await page.tap('.contact-rapide-devis');
  verifier('page d\'offre : la barre d\'action ne perd pas la formule choisie', await page.inputValue('#demande-pack') === 'visibilite');
  await contact(page, 'demande');
  await page.selectOption('#demande-budget', '5a15');
  await page.fill('#demande-projet', 'Un site pour mon salon à Rabat.');
  await page.check('#demande-consentement');
  await page.tap('#demande form button[type="submit"]');
  await page.locator('#devis-envoye').waitFor({ state: 'visible' });
  const t = envois[0]?.text || '';
  verifier('UTM dans le mail', t.includes('Source de la visite (UTM) : facebook / paid / lancement / video 1'), t);
  verifier('parcours « offre » dans le mail', t.includes('Parcours : Page d\'offre de lancement'));
  verifier('formule choisie dans le mail, sous son nom', t.includes('Pack demandé : Site Visibilité\n'), t);
  verifier('formule choisie dans l\'objet du mail', envois[0]?.subject === 'Demande de devis — Site Visibilité — Sara Test', envois[0]?.subject);
  verifier('ligne de suivi complète, formule dans la colonne Demande', /\tfacebook \/ lancement\tPage d'offre de lancement · Site Visibilité · Site vitrine\t5 000 à 15 000 MAD\t/.test(t), t);
  await page.goto(ORIGINE + '/?utm_source=instagram&utm_campaign=bio');
  const lien = await page.getAttribute('.ouverture .bouton--plein', 'href');
  verifier('UTM transmis au lien du simulateur, sans stockage', lien.includes('utm_source=instagram') && lien.includes('utm_campaign=bio'), lien);
  verifier('aucun stockage local', await page.evaluate(() => localStorage.length + sessionStorage.length) === 0);
  verifier('UTM ajouté au formulaire de l\'accueil', await page.locator('#devis form input[name="utm_source"]').inputValue() === 'instagram');
  await ctx.close();
}

// ── /commandes/, en production : rien ne doit changer pour elle ──────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/commandes/?utm_source=meta&utm_medium=paid&utm_campaign=pack-commandes&utm_content=a-video');
  const liensWa = await page.locator('a[href*="wa.me"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
  verifier('/commandes/ : WhatsApp vers le numéro de la société, message prérempli « diagnostic »', liensWa.length > 0 && liensWa.every(h => h.startsWith('https://wa.me/212672759097?text=') && decodeURIComponent(h).includes('diagnostic')), liensWa.join(' '));
  await page.fill('#acq-entreprise', 'Négoce Test'); await page.fill('#acq-nom', 'Sara Test'); await page.fill('#acq-tel', '0612345678'); await page.fill('#acq-email', 'sara@exemple.ma');
  await page.selectOption('#acq-activite', 'distribution'); await page.selectOption('#acq-ville', 'rabat'); await page.selectOption('#acq-equipe', '4-10'); await page.selectOption('#acq-budget', '25-50'); await page.selectOption('#acq-delai', 'vite');
  await page.fill('#acq-projet', 'Nos commandes arrivent sur WhatsApp et se perdent.');
  await page.click('form button[type="submit"]');
  verifier('/commandes/ : case de consentement obligatoire dans la page', envois.length === 0);
  await page.check('#acq-consentement');
  await page.click('form button[type="submit"]');
  await page.locator('#devis-envoye').waitFor({ state: 'visible' });
  verifier('/commandes/ : retour sur sa page, mail prioritaire comme en production', envois[0]?.subject === 'Demande commandes — Priorité A — Négoce Test — Sara Test', envois[0]?.subject);
  verifier('/commandes/ : qualification complète dans le mail', ['Activité : Distribution ou vente en gros', 'Ville : Rabat-Salé-Témara', 'Utilisateurs prévus : 4 à 10', 'Budget envisagé : 25 000 à 50 000 MAD'].every(l => envois[0]?.text.includes(l)), envois[0]?.text);
  verifier('/commandes/ : la variante de publicité arrive dans le mail', envois[0]?.text.includes('Source de la visite (UTM) : meta / paid / pack-commandes / a-video') && envois[0]?.text.includes('Consentement au traitement : oui'), envois[0]?.text);
  await page.goto(ORIGINE + '/');
  await page.click('.offre-phare .bouton--plein');
  await page.waitForURL('**/commandes/');
  verifier('accueil : l\'offre prioritaire mène à /commandes/, sans aucun prix', page.url().endsWith('/commandes/'));
  await ctx.close();
}

// ── Mini-audit ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  envois = [];
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/audit-gratuit/');
  await page.fill('#audit-url', 'http://192.168.1.1/admin');
  await contact(page, 'audit');
  await page.check('#audit-consentement');
  await page.click('#demande button[type="submit"]');
  await page.locator('#erreur-url_site').waitFor();
  verifier('mini-audit : adresse interne refusée, rien ne part', envois.length === 0);
  await page.fill('#audit-url', 'mon-entreprise.ma');
  await page.click('#demande button[type="submit"]');
  await page.locator('#devis-envoye').waitFor({ state: 'visible' });
  verifier('mini-audit : demande transmise, sans description', envois[0]?.text.includes('Site à analyser : https://mon-entreprise.ma/') && envois[0]?.subject.includes('Mini-audit gratuit'), envois[0]?.text);
  await ctx.close();
}

// ── Comparaison, filtres, barre de contact, démonstrations ───────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ctx.newPage();
  await page.goto(ORIGINE + '/');
  const cadre = page.locator('.comparaison[data-comparaison="gestion"] .comparaison-cadre');   // « Gestion » est la situation affichée d'abord (31/10/2026)
  await cadre.scrollIntoViewIfNeeded();
  const p = () => cadre.evaluate(e => parseFloat(e.style.getPropertyValue('--p')));
  verifier('comparaison : 50 % au départ', await p() === 50);
  await page.locator('.comparaison[data-comparaison="gestion"] input[type="range"]').focus();
  await page.keyboard.press('ArrowRight');
  verifier('comparaison : clavier', await p() === 51, String(await p()));
  const b = await cadre.boundingBox();
  await page.mouse.move(b.x + b.width * .5, b.y + 100); await page.mouse.down(); await page.mouse.move(b.x + b.width * .2, b.y + 100); await page.mouse.up();
  verifier('comparaison : glisser à la souris', Math.abs(await p() - 20) < 2, String(await p()));
  verifier('comparaison : valeur lisible par un lecteur d\'écran', (await page.getAttribute('.comparaison[data-comparaison="gestion"] input[type="range"]', 'aria-valuetext')).includes('version après'));
  verifier('comparaison : « Gestion » affichée au départ', await visible(page, '[data-comparaison="gestion"]') && !(await visible(page, '[data-comparaison="site"]')));
  await page.check('#comparer-site');
  verifier('comparaison : changement de situation', await visible(page, '[data-comparaison="site"]') && !(await visible(page, '[data-comparaison="gestion"]')));
  verifier('à l\'ordinateur : bouton WhatsApp flottant seul, sans barre de devis', await visible(page, '.contact-rapide-wa') && !(await visible(page, '.contact-rapide-devis')));
  await page.goto(ORIGINE + '/realisations/');
  verifier('réalisations : sept cartes', await page.locator('.projet').count() === 7);
  await page.check('#f-interne');
  verifier('filtre produits internes', await page.locator('.projet:visible').count() === 3);
  await page.check('#f-site');
  verifier('filtre sites web', await page.locator('.projet:visible').count() === 2);
  // Les démonstrations ont leurs propres tests (outils/test_demo_*.mjs, parcours_distribution_os.mjs) : ici, le bandeau et aucun envoi au chargement.
  for (const nom of ['restaurant', 'services', 'reservation']) {
    const avant = envois.length;
    await page.goto(`${ORIGINE}/realisations/demos/${nom}/`);
    verifier(`démonstration ${nom} : bandeau, rien n'est envoyé`, (await page.locator('.demo-bandeau').innerText()).includes('entreprise et données fictives') && envois.length === avant);
  }
  // Un formulaire de démonstration n'envoie rien : rempli correctement et soumis, la page ne tente aucune navigation (form-action 'none' la bloquerait,
  // mais une tentative bloquée est déjà un défaut : violation de la politique de sécurité), ne change pas d'adresse et dit que c'est une simulation.
  {
    const avant = envois.length, navigations = [], erreursDemo = [];
    await page.goto(`${ORIGINE}/realisations/demos/services/contact/`);
    const noter = r => { if (r.isNavigationRequest()) navigations.push(r.method() + ' ' + r.url()); };
    const noterErreur = m => { if (m.type() === 'error') erreursDemo.push(m.text()); };
    page.on('request', noter); page.on('console', noterErreur);
    await page.evaluate(() => { window.__violations = []; document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective)); });
    await page.fill('#c-nom', 'Personne Fictive'); await page.fill('#c-email', 'essai@exemple.invalid'); await page.selectOption('#c-sujet', { index: 1 }); await page.fill('#c-message', 'Message fictif pour la démonstration.');
    await page.click('#contact-app button[type="submit"]', { noWaitAfter: true });
    await page.waitForTimeout(300);
    page.off('request', noter); page.off('console', noterErreur);
    const violations = await page.evaluate(() => window.__violations).catch(() => ['page quittée']);
    const retour = await visible(page, '#contact-app .retour').catch(() => false);
    verifier('démonstration : le formulaire simulé n\'envoie rien et ne tente aucun envoi, la page le dit', navigations.length === 0 && violations.length === 0 && erreursDemo.length === 0 && page.url() === `${ORIGINE}/realisations/demos/services/contact/` && retour && envois.length === avant, [...navigations, ...violations, ...erreursDemo].join(' | ') || page.url());
  }
  // Politique de sécurité : un script injecté dans la page ne s'exécute pas.
  await page.goto(`${ORIGINE}/`);
  const injecte = await page.evaluate(() => new Promise(fin => { const s = document.createElement('script'); s.textContent = 'window.__injecte = true'; document.body.append(s); setTimeout(() => fin(window.__injecte === true), 50); }));
  verifier('politique de sécurité : script injecté bloqué', injecte === false);
  // Source de campagne : elle suit le visiteur vers /commandes/ et depuis les pages de service, jusqu'au formulaire.
  await page.goto(`${ORIGINE}/?utm_source=essai&utm_campaign=v3`); await page.waitForTimeout(150);
  verifier('UTM : accueil → /commandes/', (await page.locator('main a[href*="commandes/"]').first().getAttribute('href')).includes('utm_campaign=v3'));
  await page.goto(`${ORIGINE}/application-web-maroc/?utm_source=essai`); await page.waitForTimeout(150);
  verifier('UTM : page de service → formulaire', (await page.locator('main a[href*="estimer-mon-projet/"]').first().getAttribute('href')).includes('utm_source=essai'));
  await ctx.close();
  const tel = await contexte({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const q = await tel.newPage();
  await q.goto(ORIGINE + '/');
  verifier('téléphone : barre de contact visible', await visible(q, '.contact-rapide-devis'));
  const boite = await q.locator('.ouverture .bouton--plein').boundingBox();
  verifier('téléphone : bouton principal au-dessus de la barre de contact', boite.y + boite.height < 760, String(boite.y + boite.height));
  await q.goto(ORIGINE + '/estimer-mon-projet/');
  verifier('simulateur : première question dans le premier écran', (await q.locator('[data-etape="1"] h2').boundingBox()).y < 500);
  verifier('simulateur : pas de barre de contact par-dessus les boutons', await q.locator('.contact-rapide').count() === 0);
  await q.check('input[name="type"][value="vitrine"]'); await q.tap('[data-suite]'); await q.tap('[data-suite]');
  await q.waitForTimeout(100);
  await q.check('input[name="delai"][value="vite"]'); await q.tap('[data-suite]'); await q.waitForTimeout(100);
  const pos = await q.locator('.assistant-progression').boundingBox();
  verifier('simulateur au téléphone : la progression reste sous la barre fixe', pos.y >= 84, String(pos.y));
  await tel.close();
}

// ── Arrivée à froid sur une ancre, animations actives : le contenu visé finit visible ─────
// (écran blanc signalé sur /en/#devis-titre dans Safari iOS simulé : c'était le démarrage de Safari, mais l'apparition au défilement
// ne doit jamais laisser la cible transparente). Attente de la fin réelle du défilement : position stable sur 20 images, pas de délai fixe.
for (const [url, cible] of [['/en/#devis-titre', '#devis-titre'], ['/en/', 'h1'], ['/#devis', '#devis'], ['/en/#services', '#services']]) {
  const ctx = await contexte({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'no-preference' }); const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message)); page.on('console', m => m.type() === 'error' && erreurs.push(m.text()));
  page.on('requestfailed', r => erreurs.push('échec ' + r.url())); page.on('response', r => r.status() >= 400 && erreurs.push(r.status() + ' ' + r.url()));
  await page.goto(ORIGINE + url, { waitUntil: 'load' });
  await page.evaluate(() => new Promise((fin, echec) => {
    let y = -1, stable = 0, n = 0;
    const f = () => { if (++n > 900) return echec(new Error('défilement jamais stabilisé')); if (scrollY === y && document.readyState === 'complete') stable++; else { stable = 0; y = scrollY; } if (stable >= 20) fin(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  // puis la fin des animations d'entrée réglées sur le temps (mots du titre…), hors animations infinies et liées au défilement
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  const vu = await page.evaluate((sel) => {
    const opacite = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const c = document.querySelector(sel), b = c.getBoundingClientRect(), barre = document.querySelector('header.barre');
    const y = Math.min(Math.max(b.top + 8, 0), innerHeight - 1), x = Math.min(b.left + 12, innerWidth - 1), sous = document.elementFromPoint(x, y);
    return { dansLaVue: b.bottom > 0 && b.top < innerHeight, cible: opacite(c), point: sous ? opacite(sous) : 0, barre: barre ? opacite(barre) : 0, haut: Math.round(b.top), basBarre: barre ? Math.round(barre.getBoundingClientRect().bottom) : 0 };
  }, cible);
  verifier(`arrivée à froid sur ${url} : ${cible} à l'écran, opaque, barre visible`, vu.dansLaVue && vu.cible > 0.99 && vu.point > 0.99 && vu.barre > 0.99, JSON.stringify(vu));
  if (url.includes('#')) verifier(`arrivée à froid sur ${url} : la cible commence sous la barre fixe`, vu.haut >= vu.basBarre, JSON.stringify(vu));
  verifier(`arrivée à froid sur ${url} : aucune erreur ni ressource en échec`, erreurs.length === 0, erreurs.join(' | '));
  await ctx.close();
}

verifier('aucun hôte tiers contacté', tiers.size === 0, [...tiers].join(', '));
await navigateur.close();
serveur.close();
globalThis.fetch = vraiFetch;
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
