// Test de bout en bout de la démonstration Maison Tilal (site/realisations/demos/restaurant/).
// Lancer : node outils/test_demo_restaurant.mjs   (code 1 en cas d'échec)
// NAVIGATEUR=webkit|firefox pour un autre moteur, NAVIGATEUR_CHEMIN=exécutable.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chromium = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const DEMO = path.join(ROOT, 'realisations/demos/restaurant');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('introuvable'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const URL_PAGE = `http://127.0.0.1:${srv.address().port}/realisations/demos/restaurant/`;

let echecs = 0, ok = 0;
const verifie = (cond, msg) => { if (cond) ok++; else { echecs++; console.log('  ECHEC :', msg); } };
const section = t => console.log('\n' + t);

const browser = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined });
// JOUR_FIGE=2026-11-11T10:00 : horloge figée dans chaque page (la démonstration sème ses réservations d'après la date) ; sans lui, la date du jour.
const JOUR_FIGE = process.env.JOUR_FIGE ? new Date(process.env.JOUR_FIGE) : null;
if (JOUR_FIGE) { const nouveau = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await nouveau(o); await c.clock.setFixedTime(JOUR_FIGE); return c; }; }
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
const page = await ctx.newPage();
const erreursConsole = [], hotes = new Set(), posts = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreursConsole.push(m.text()); });
page.on('pageerror', e => erreursConsole.push('pageerror: ' + e.message));
page.on('request', r => { hotes.add(new URL(r.url()).host); if (r.method() !== 'GET') posts.push(r.method() + ' ' + r.url()); });

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(JOUR_FIGE || Date.now()); today.setHours(0, 0, 0, 0);
const ouverts = Array.from({ length: 30 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; }).filter(d => d.getDay() !== 1).map(iso);
const txt = async sel => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const num = async sel => parseInt(await txt(sel), 10);

async function charger(p = page) { await p.goto(URL_PAGE); await p.waitForSelector('#etape h3'); }
const suivant = () => page.locator('#etape [data-act=suivant]').click();
const kpi = k => num(`.kpi[data-kpi=${k}] .kpi-val`);
async function ctxResto(date, sv) { await page.selectOption('#cs-jour', date); await page.locator(`#cs-service input[value=${sv}]`).check(); }
const onglet = t => page.locator(`#cs-onglets [data-tab=${t}]`).click();
const ligne = (sel, num_) => page.locator(`#cs-panneau ${sel}`).filter({ hasText: num_ });
/* Va jusqu'à l'étape « Table » ; renvoie false si aucun créneau libre. */
async function versTable(date, sv, covers) {
  await page.locator(`.cal-j[data-d="${date}"]`).click(); await suivant();
  await page.locator(`#etape input[name=service][value=${sv}]`).check();
  await page.locator(`#etape input[name=covers][value="${covers}"]`).check(); await suivant();
  const slot = page.locator('#etape input[name=slot]:not(:disabled)').first();
  if (!await slot.count()) return false;
  await slot.check(); await suivant();
  return (await txt('#etape-titre')).startsWith('Choisissez votre table');
}
const etatsPlan = (id = '#plan-client') => page.$$eval(`${id} .tbl`, l => Object.fromEntries(l.map(g => [g.dataset.t, g.getAttribute('class').replace('tbl ', '').replace(' vue', '')])));
const TAB = process.env.NAVIGATEUR === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';   // Safari/WebKit macOS : Tab ne s'arrête pas sur les boutons sans Option
async function tabVers(sel, max = 150) {
  for (let i = 0; i < max; i++) { if (await page.evaluate(s => document.activeElement && document.activeElement.matches(s), sel)) return true; await page.keyboard.press(TAB); }
  return false;
}

/* ================================================================== 1 */
section('1. Contrat de la page');
await charger();
const src = { html: fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8'), css: fs.readFileSync(path.join(DEMO, 'restaurant.css'), 'utf8'), js: fs.readFileSync(path.join(DEMO, 'restaurant.js'), 'utf8') };
verifie(await page.evaluate(() => document.documentElement.lang) === 'fr', 'lang="fr"');
verifie(await page.locator('meta[name=robots][content="noindex, follow"]').count() === 1, 'meta noindex, follow');
verifie(await page.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1, 'balise CSP conservée');
verifie(await page.locator('h1').count() === 1, 'un seul h1');
verifie(await page.locator('link[rel=icon][href="/assets/favicon.svg"]').count() === 1, 'favicon');
verifie(await page.evaluate(() => document.body.firstElementChild.outerHTML) === '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>', 'bandeau exact en première ligne du body');
verifie(await page.locator('form, [action], a[href^="mailto:"], a[href^="tel:"], img').count() === 0, 'aucun form, action, mailto, tel ni image');
verifie(!/<script(?![^>]*\bsrc=)/i.test(src.html) && !/\son[a-z]+\s*=/i.test(src.html) && !/\son(click|change|input|keydown)\s*=/i.test(src.js), 'aucun script ni gestionnaire en ligne');
for (const id of ['lieu', 'carte', 'degustation', 'chef', 'reserver', 'emporter', 'restaurant', 'infos']) verifie(await page.locator('#' + id).count() === 1, 'ancre #' + id);
const poids = ['index.html', 'restaurant.css', 'restaurant.js'].reduce((n, f) => n + fs.statSync(path.join(DEMO, f)).size, 0);
verifie(poids < 200 * 1024, `poids HTML+CSS+JS < 200 Ko, code lisible (${(poids / 1024).toFixed(1)} Ko)`);
const polices = fs.readdirSync(path.join(DEMO, 'fonts')).filter(f => f.endsWith('.woff2')).reduce((n, f) => n + fs.statSync(path.join(DEMO, 'fonts', f)).size, 0);
verifie(polices < 150 * 1024, `polices < 150 Ko (${(polices / 1024).toFixed(1)} Ko)`);
verifie(!/\p{Extended_Pictographic}/u.test(src.html + src.js), 'aucun emoji');
verifie((src.css.match(/\{/g) || []).length === (src.css.match(/\}/g) || []).length, 'CSS : accolades équilibrées');
verifie(await page.locator('svg:not([width="0"]) use, svg.gravure').count() >= 8, 'illustrations SVG au trait présentes');
verifie(await page.locator('#degustation .carte-menu').count() === 1 && /690/.test(await txt('#degustation')) && !await page.locator('#onglets [role=tab]:has-text("dégustation")').count(), 'menu dégustation : pièce à part, hors des onglets de la carte');

/* ================================================================== 2 */
section('2. Plan de salle : tables, clavier, états selon date et service');
const d1 = ouverts[1], d2 = ouverts[3];
let cartes = {}, tableOk = false;
for (const [d, sv] of [[d1, 'midi'], [d1, 'soir'], [d2, 'midi'], [d2, 'soir']]) {
  await charger(); const r = await versTable(d, sv, 2); tableOk = tableOk || r;
  cartes[d + sv] = r ? JSON.stringify(await etatsPlan()) : 'aucun créneau';
}
verifie(Object.values(cartes).every(c => c !== 'aucun créneau'), 'un créneau libre existe pour 2 couverts sur les 4 combinaisons testées');
verifie(new Set(Object.values(cartes)).size >= 3, `l'état des tables varie selon la date et le service (${new Set(Object.values(cartes)).size} plans différents sur 4)`);
await charger(); await versTable(d1, 'midi', 2);
const plan0 = await etatsPlan();
verifie(Object.keys(plan0).length === 12, '12 tables sur le plan');
verifie(Object.values(plan0).every(c => ['libre', 'reservee', 'bloquee', 'petite', 'choisie'].includes(c)), 'états : ' + [...new Set(Object.values(plan0))].join(', '));
verifie(Object.values(plan0).includes('libre') && Object.values(plan0).includes('reservee'), 'au moins une table libre et une réservée');
verifie(await page.$$eval('#plan-client .tbl', l => l.every(g => g.getAttribute('role') === 'button' && g.tabIndex === 0 && g.getAttribute('aria-label').length > 12 && /places/.test(g.getAttribute('aria-label')))), 'chaque table : role=button, tabindex 0, nom accessible avec places et état');
verifie(await page.locator('svg.plan[role=group][aria-label]').count() === 1, 'plan : groupe nommé');
const libre1 = Object.keys(plan0).find(k => plan0[k] === 'libre'), resv1 = Object.keys(plan0).find(k => plan0[k] === 'reservee');
await page.locator(`#plan-client .tbl[data-t=${resv1}]`).click({ force: true });
verifie(await page.locator(`#plan-client .tbl[data-t=${resv1}]`).getAttribute('aria-pressed') === 'false' && /réservée/.test(await txt('#resa-msg')), 'table réservée : non sélectionnable, message annoncé');
await page.locator(`#plan-client .tbl[data-t=${libre1}]`).focus();
await page.keyboard.press('Enter');
verifie(await page.locator(`#plan-client .tbl[data-t=${libre1}]`).getAttribute('aria-pressed') === 'true' && (await txt('#table-choix')).includes(libre1), `clavier : Entrée choisit la table ${libre1}`);
verifie(await page.evaluate(() => document.activeElement.classList.contains('tbl')), 'le focus reste sur la table après le choix');
await page.keyboard.press('Space');
verifie(await page.locator(`#plan-client .tbl[data-t=${libre1}]`).getAttribute('aria-pressed') === 'false', 'clavier : Espace désélectionne');
await page.keyboard.press('ArrowRight');
verifie(await page.evaluate(() => document.activeElement.dataset.t) !== libre1, 'flèche droite : table suivante');
verifie(await page.evaluate(() => { const g = document.querySelector('#plan-client .tbl.libre'); g.focus(); return getComputedStyle(g.querySelector('.anneau')).stroke !== 'none'; }), 'focus visible : anneau autour de la table');
await suivant();
verifie(await page.locator('#err-table.vu').count() === 1, 'continuer sans table : erreur affichée');
await page.locator('[data-act=auto]').click();
verifie(await page.locator('[data-act=auto]').getAttribute('aria-pressed') === 'true' && /maison choisira/.test(await txt('#table-choix')), '« Laisser la maison choisir » : état annoncé');
await page.locator('[data-act=auto]').click();
let gros = {};
const deux = ['S1', 'S4', 'S7', 'C1'];
// Les réservations de la démonstration sont semées d'après la date : un jour très rempli a toutes ses tables de 2 places déjà réservées (aucune ne peut alors être « trop petite »).
// On prend le premier jour ouvert où au moins une table de 2 places est libre ; sans un seul tel jour sur 30, le contrôle ci-dessous échoue, comme avant.
for (const d of ouverts) { await charger(); if (await versTable(d, 'midi', 4)) { gros = await etatsPlan(); if (deux.some(k => gros[k] === 'petite')) break; } }
verifie(deux.some(k => gros[k] === 'petite') && deux.every(k => ['petite', 'reservee', 'bloquee'].includes(gros[k])) && Object.keys(gros).filter(k => !deux.includes(k)).every(k => gros[k] !== 'petite'), '4 couverts : les tables de 2 places sont « trop petites », les autres non');

/* ================================================================== 3 */
section('3. Réservation complète : le client agit, le restaurant voit');
await charger();
await ctxResto(d1, 'soir');
const avant = { att: await kpi('att'), ins: await kpi('ins'), occ: await kpi('occ') };
const rowsAvant = await page.locator('#cs-panneau li[data-resa]').count();
await page.locator('#degustation [data-menu=m1]').click();
verifie(/Menu Tilal/.test(await txt('#resa-msg')), 'bouton du menu dégustation : annoncé dans le parcours');
const okT = await versTable(d1, 'soir', 2); verifie(okT, 'étape Table atteinte (soir, 2 couverts)');
const planS = await etatsPlan(); const T = Object.keys(planS).find(k => planS[k] === 'libre' && ['S1', 'S4', 'S7', 'C1'].includes(k)) || Object.keys(planS).find(k => planS[k] === 'libre');
await page.locator(`#plan-client .tbl[data-t=${T}]`).click();
verifie((await txt('#table-choix')).includes(T), `table ${T} choisie sur le plan`);
await suivant();
verifie(await page.locator('input[name=degust][value=m1]').isChecked(), 'le menu dégustation choisi plus haut est coché dans les préférences');
await suivant();
await suivant(); verifie(await page.locator('#err-nom.vu').count() === 1 && await page.locator('#err-ok.vu').count() === 1, 'coordonnées vides : erreurs');
await page.fill('#f-nom', 'Table Test'); await page.fill('#f-tel', '05 00 00 00 00'); await page.fill('#f-mail', 'nom@exemple.test'); await page.check('#f-ok');
await suivant();
const recap = await txt('.recap');
verifie(recap.includes(T) && /Menu Tilal/.test(recap), 'récapitulatif : table et menu');
await page.locator('[data-act=confirmer]').click();
const numResa = await txt('.conf-num');
verifie(await page.$$eval('.conf .conf-legantis a', as => as.length === 1 && as[0].getAttribute('href') === '/estimer-mon-projet/?type=vitrine'), 'confirmation de réservation : lien vers la vraie demande de devis Legantis (?type=vitrine)');
verifie(/^MT-\d{6}-\d{4}$/.test(numResa), 'numéro de réservation simulé : ' + numResa);
verifie((await txt('#mr-liste')).includes(numResa) && (await txt('#mr-liste')).includes('table ' + T), 'Mes réservations : numéro et table');
verifie(await page.locator('#cs-jour').inputValue() === d1 && await page.locator('#cs-service input[value=soir]').isChecked(), 'côté restaurant : le jour et le service de la réservation sont affichés');
const rl = ligne('li[data-resa]', numResa);
verifie(await rl.count() === 1 && (await rl.innerText()).includes('Table Test') && await rl.getAttribute('data-statut') === 'attendue', 'restaurant : la réservation apparaît, statut « attendue »');
verifie(await kpi('att') === avant.att + 2, `indicateur couverts attendus : ${avant.att} -> ${await kpi('att')}`);
await onglet('plan');
verifie((await etatsPlan('#plan-resto'))[T] === 'attendue', `plan restaurant : la table ${T} est « attendue »`);

section('4. Statuts de réservation côté restaurant, effet côté client');
await onglet('resas');
const statClient = () => page.locator('#mr-liste .mr-etat').first().getAttribute('data-statut');
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Installer/ }).click();
verifie(await ligne('li[data-resa]', numResa).getAttribute('data-statut') === 'installée' && await statClient() === 'installée' && /installé/i.test(await txt('#mr-liste')), 'installée : visible côté restaurant et côté client');
verifie(await kpi('ins') === avant.ins + 2 && await kpi('att') === avant.att && await kpi('occ') === avant.occ + 1, 'indicateurs recalculés : installés +2, attendus -2, tables occupées +1');
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Terminer/ }).click();
verifie(await statClient() === 'terminée' && await ligne('li[data-resa]', numResa).getAttribute('data-statut') === 'terminée', 'terminée');
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Rouvrir/ }).click();
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Remettre en attente/ }).click();
verifie(await statClient() === 'attendue', 'remise en attente');
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Absente/ }).click();
verifie(await statClient() === 'absente' && /absente/i.test(await txt('#mr-liste')), 'absente : visible côté client');
verifie(await kpi('att') === avant.att, 'une réservation absente ne compte plus dans les couverts attendus');
await page.locator('[data-act=nouvelle]').click();
verifie(await versTable(d1, 'soir', 2) && (await etatsPlan())[T] === 'libre', `la table ${T} d'une réservation absente est de nouveau libre côté client`);
// Revue V3.1 (T1) : pendant que la réservation est absente, sa table peut être reprise ou bloquée ; la remettre en attente ne doit pas la doubler.
await onglet('plan'); await page.locator(`#plan-resto .tbl[data-t=${T}]`).click(); await page.locator('[data-bl="1"]').click();
await onglet('resas');
await page.locator('#cs-panneau').scrollIntoViewIfNeeded();
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Remettre en attente/ }).click();
verifie(await statClient() === 'absente' && /Impossible : la table/.test(await page.locator('#cs-msg').innerText()), 'table bloquée entre-temps : remise en attente refusée, pas de double affectation');
await onglet('plan'); await page.locator(`#plan-resto .tbl[data-t=${T}]`).click(); await page.locator('[data-bl="0"]').click();
await onglet('resas');
await page.locator('#cs-panneau').scrollIntoViewIfNeeded();
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Remettre en attente/ }).click();
verifie((await etatsPlan())[T] === 'reservee', `remise en attente : la table ${T} redevient réservée sur le plan du client, sans rechargement`);
await ligne('li[data-resa]', numResa).getByRole('button', { name: /Annuler/ }).click();
verifie(await statClient() === 'annulée par la maison' && /Annulée par la maison/i.test(await txt('#mr-liste')), 'annulation par la maison : visible côté client');
verifie((await etatsPlan())[T] === 'libre', 'table libérée côté client');

section('5. Blocage d\'une table et créneaux');
await onglet('plan');
const planR = await etatsPlan('#plan-resto'), planC = await etatsPlan(); const X = Object.keys(planR).find(k => planR[k] === 'libre' && k !== T && planC[k] === 'libre');   // libre des deux côtés : le plan du client montre un autre service si la journée est chargée
await page.locator(`#plan-resto .tbl[data-t=${X}]`).click();
verifie(/Bloquer la table/.test(await txt('#fiche')), 'fiche de table : bouton Bloquer');
await page.locator('[data-bl="1"]').click();
verifie((await etatsPlan('#plan-resto'))[X] === 'bloquee' && (await etatsPlan())[X] === 'bloquee', `table ${X} bloquée : bloquée aussi sur le plan du client`);
verifie(await page.locator(`#plan-client .tbl[data-t=${X}]`).getAttribute('aria-disabled') === 'true', 'table bloquée : aria-disabled côté client');
const Y = Object.keys(await etatsPlan()).find(k => k !== X && k !== T && ['S1', 'S4', 'S7', 'C1'].includes(k));
const etY = (await etatsPlan())[Y];
if (etY === 'libre') {
  await page.locator(`#plan-client .tbl[data-t=${Y}]`).click();
  verifie((await txt('#table-choix')).includes(Y), 'table Y choisie par le client');
  await page.locator(`#plan-resto .tbl[data-t=${Y}]`).click(); await page.locator('[data-bl="1"]').click();
  verifie(/Aucune table choisie/.test(await txt('#table-choix')) && (await etatsPlan())[Y] === 'bloquee' && await page.locator('#etape [role=alert]').count() === 1, 'le restaurant bloque la table choisie : le client la perd, avec une alerte');
  await page.locator(`#plan-resto .tbl[data-t=${Y}]`).click(); await page.locator('[data-bl="0"]').click();
  verifie((await etatsPlan())[Y] === 'libre', 'déblocage : la table redevient libre côté client');
} else verifie(true, `table Y ${etY} (non libre, scénario de perte non rejoué)`);
await page.locator(`#plan-resto .tbl[data-t=${X}]`).click(); await page.locator('[data-bl="0"]').click();
verifie((await etatsPlan())[X] === 'libre', `table ${X} débloquée`);
const occ = Object.keys(planR).find(k => planR[k] === 'attendue');
if (occ) { await page.locator(`#plan-resto .tbl[data-t=${occ}]`).click(); verifie(await page.locator('[data-bl]').count() === 0 && /annulez d'abord/.test(await txt('#fiche')), 'une table réservée ne peut pas être bloquée'); }
await page.locator('#etape [data-act=retour]').click();
await onglet('creneaux');
const s0 = await page.locator('#cs-panneau .cr').first().getAttribute('data-slot');
const cap0 = Number(await page.locator(`#cs-panneau .cr[data-slot="${s0}"]`).getAttribute('data-capacite'));
await page.locator(`#etape input[name=slot][value="${s0}"]`).check();
await page.locator(`#cs-panneau [data-fe="${s0}"]`).click();
verifie(await page.locator(`#etape input[name=slot][value="${s0}"]`).isDisabled() && /Fermé/.test(await txt('#etape .rec--creneaux')), `créneau ${s0} fermé côté restaurant : désactivé côté client`);
verifie(await page.locator('#etape [role=alert]').count() === 1, 'le créneau choisi puis fermé : le client est prévenu');
await page.locator(`#cs-panneau [data-fe="${s0}"]`).click();
verifie(await page.locator(`#etape input[name=slot][value="${s0}"]`).isEnabled(), 'créneau rouvert : de nouveau disponible');
await page.locator(`#cs-panneau [data-cap="2"][data-t="${s0}"]`).click();
verifie(Number(await page.locator(`#cs-panneau .cr[data-slot="${s0}"]`).getAttribute('data-capacite')) === cap0 + 2, 'capacité du créneau +2 couverts');
await page.locator(`#cs-panneau [data-cap="-2"][data-t="${s0}"]`).click();

/* ================================================================== 6 */
section('6. Commande à emporter : de la carte au retrait');
await charger();
const emp0 = await (async () => { await ctxResto(ouverts[0], 'soir'); return kpi('emp'); })();
await page.locator('[data-ajout=e1]').click(); await page.locator('[data-ajout=e1]').click();
verifie(await txt('#pastille-panier') === '2' && /Zaalouk fumé.*2.*190 MAD/.test(await txt('#panier')) && (await txt('#tk-total')) === '190 MAD', 'ajout depuis la carte : 2 × 95 = 190 MAD, pastille 2');
await page.locator('#tab-plats').click(); await page.locator('[data-ajout=p3]').click();
verifie(await txt('#tk-total') === '480 MAD' && await txt('#pastille-panier') === '3', 'second plat : total 480 MAD');
await page.locator('#panier [data-pa=plus]').first().click();
verifie(await txt('#tk-total') === '575 MAD', 'quantité + : 575 MAD');
await page.locator('#panier [data-pa=moins]').last().click();
verifie(await page.locator('#panier .tk-lignes li').count() === 1 && await txt('#tk-total') === '285 MAD', 'quantité − jusqu\'à zéro : la ligne disparaît, total 285 MAD');
verifie(/Paiement sur place/.test(await txt('#panier')), 'paiement sur place annoncé dans le panier');
await page.locator('[data-pa=commander]').click();
verifie(await page.locator('#err-ph.vu').count() === 1 && await page.locator('#err-pn.vu').count() === 1, 'commande sans heure ni nom : erreurs');
await page.fill('#p-nom', 'Table Menthe');
const heures = await page.$$eval('#p-heure option', o => o.map(x => x.value).filter(Boolean));
verifie(heures.length >= 8 && heures.every(h => /^\d\d:(00|15|30|45)$/.test(h)), `heures de retrait par quart d'heure (${heures.length})`);
const hr = heures.find(h => h >= '19:30') || heures[0];
await page.selectOption('#p-heure', hr);
await page.locator('[data-pa=commander]').click();
const numCmd = await txt('.tk-num');
verifie(await page.$$eval('.tk-ok .conf-legantis a', as => as.length === 1 && as[0].getAttribute('href') === '/estimer-mon-projet/?type=vitrine'), 'commande à emporter : lien vers la vraie demande de devis Legantis (?type=vitrine)');
verifie(/^EM-\d{4}-\d+$/.test(numCmd) && /Paiement sur place/.test(await txt('#panier')) && /Rien n'a été payé/.test(await txt('#panier')), 'numéro de commande simulé et paiement sur place : ' + numCmd);
verifie(await page.locator('#pastille-panier').isHidden() && await page.locator('[data-ajout=p3]').getAttribute('class').then(c => !c.includes('dans')), 'panier vidé, boutons de la carte remis à zéro');
verifie(/Reçue/i.test(await txt('#mc-liste')) && (await txt('#mc-liste')).includes(numCmd), 'Mes commandes : reçue');
const svCmd = hr < '16:00' ? 'midi' : 'soir';
verifie(await page.locator('#cs-service input:checked').getAttribute('value') === svCmd, 'côté restaurant : service de la commande affiché');
await onglet('emporter');
const rc = ligne('li[data-cmd]', numCmd);
verifie(await rc.count() === 1 && await rc.getAttribute('data-statut') === 'reçue' && (await rc.innerText()).includes('Table Menthe'), 'restaurant : la commande apparaît, statut « reçue »');
verifie(await kpi('emp') === emp0 + 1 || svCmd !== 'soir', `indicateur emporter en cours : ${emp0} -> ${await kpi('emp')}`);
const cmdStat = () => page.locator('#mc-liste .mr-etat').first().getAttribute('data-statut');
await rc.getByRole('button', { name: /Passer en cuisine/ }).click(); verifie(await cmdStat() === 'en cuisine', 'en cuisine : visible côté client');
await rc.getByRole('button', { name: /Marquer prête/ }).click(); verifie(await cmdStat() === 'prête' && /Prête/i.test(await txt('#mc-liste')), 'prête : visible côté client');
const enc0 = await kpi('enc');
await rc.getByRole('button', { name: /Marquer retirée/ }).click(); verifie(await cmdStat() === 'retirée', 'retirée : visible côté client');
verifie(await kpi('enc') === enc0 + 285, `encaissé sur place : ${enc0} -> ${await kpi('enc')} MAD`);
await page.locator('[data-ajout=p3]').click(); await page.fill('#p-nom', 'Table Thym'); await page.selectOption('#p-heure', hr); await page.locator('[data-pa=commander]').click();
const numCmd2 = await txt('.tk-num');
await ligne('li[data-cmd]', numCmd2).getByRole('button', { name: /Annuler/ }).click();
verifie(await cmdStat() === 'annulée', 'annulation par la cuisine : visible côté client');

section('7. Disponibilité de la carte, effet immédiat sur la carte et le panier');
await page.locator('#tab-plats').click(); await page.locator('[data-ajout=p1]').click();
await onglet('carte');
const sw = page.locator('#cs-panneau [data-di=p1]');
verifie(await sw.getAttribute('aria-checked') === 'true', 'plat disponible : interrupteur actif');
await sw.click();
verifie(await sw.getAttribute('aria-checked') === 'false', 'interrupteur : indisponible');
verifie(await page.locator('.plat[data-id=p1]').evaluate(e => e.classList.contains('indispo')) && await page.locator('[data-ajout=p1]').count() === 0 && /Indisponible/.test(await txt('.plat[data-id=p1]')), 'carte client : plat indisponible, plus de bouton d\'ajout');
verifie(/Plus disponible/.test(await txt('#panier')) && await page.locator('[data-pa=commander]').getAttribute('aria-disabled') === 'true', 'panier : ligne signalée, commande bloquée');
const nCmd = await page.locator('#mc-liste li').count();
await page.fill('#p-nom', 'Table Test'); await page.locator('[data-pa=commander]').click({ force: true });
verifie(await page.locator('#mc-liste li').count() === nCmd, 'aucune commande créée avec un plat indisponible');
await page.locator('.plat[data-id=p1] .plat-ouvrir').click();
verifie(await page.locator('#pn-corps [data-ajout]').count() === 0, 'fiche du plat : pas d\'ajout possible');
await page.keyboard.press('Escape');
await page.locator('#panier [data-pa=moins]').first().click();
await sw.click();
verifie(await page.locator('[data-ajout=p1]').count() === 1 && !await page.locator('.plat[data-id=p1]').evaluate(e => e.classList.contains('indispo')), 'plat de nouveau disponible : bouton revenu');
await page.locator('#tab-boissons').click();
verifie(/Sur place uniquement/.test(await txt('.plat[data-id=b5]')) && await page.locator('[data-ajout=b5]').count() === 0, 'boisson alcoolisée : non vendue à emporter');
await page.locator('#tab-entrees').click(); await page.locator('[data-ajout=e1]').click();
await onglet('creneaux'); await page.locator('#cs-panneau [data-emp]').click();
verifie(/ne prend plus de commandes/.test(await txt('#panier')) && await page.locator('[data-pa=commander]').getAttribute('aria-disabled') === 'true', 'commandes en pause côté restaurant : le client est prévenu, commande bloquée');
await page.locator('#cs-panneau [data-emp]').click();
verifie(await page.locator('[data-pa=commander]').getAttribute('aria-disabled') === null, 'commandes rouvertes');

section('8. Console : onglets au clavier');
await page.locator('#cs-onglets [data-tab=resas]').focus();
await page.keyboard.press('ArrowRight');
verifie(await page.locator('#cs-onglets [data-tab=plan]').getAttribute('aria-selected') === 'true' && await page.locator('#plan-resto').isVisible(), 'flèche droite : onglet Plan de salle');
await page.keyboard.press('End');
verifie(await page.locator('#cs-onglets [data-tab=carte]').getAttribute('aria-selected') === 'true', 'Fin : dernier onglet');
verifie(await page.locator('#cs-onglets [role=tab]').count() === 5 && await page.locator('#cs-panneau[role=tabpanel][aria-labelledby]').count() === 1, 'cinq onglets, panneau relié');

section('9. Parcours complet au clavier');
await charger();
await page.locator(`.cal-j[data-d="${ouverts[2]}"]`).focus(); await page.keyboard.press('Space');
verifie(await tabVers('[data-act=suivant]'), 'Tab atteint Continuer'); await page.keyboard.press('Enter');
verifie((await txt('#etape-titre')).startsWith('Service'), 'clavier : étape Service');
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
await tabVers('input[name=slot]:not(:disabled)'); await page.keyboard.press('Space');
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
verifie((await txt('#etape-titre')).startsWith('Choisissez votre table'), 'clavier : étape Table');
verifie(await tabVers('#plan-client .tbl.libre'), 'Tab atteint une table libre'); await page.keyboard.press('Enter');
verifie(await page.locator('#plan-client .tbl[aria-pressed=true]').count() === 1, 'clavier : table choisie');
verifie(await page.evaluate(() => { const a = document.activeElement.querySelector && document.activeElement.querySelector('.anneau'); if (!a) return false; const s = getComputedStyle(a); return s.stroke !== 'none' && parseFloat(s.strokeWidth) >= 2; }), 'focus visible sur la table (contour ≥ 2 px)');

section('10. Hiérarchie des titres, stockage, réseau, console');
const niveaux = await page.$$eval('h1,h2,h3,h4,h5,h6', l => l.filter(h => h.offsetParent !== null || h.closest('[hidden]') === null).map(h => +h.tagName[1]));
verifie(niveaux.every((n, i) => i === 0 ? n === 1 : n <= niveaux[i - 1] + 1), 'aucun saut dans la hiérarchie des titres');
const cookies = await ctx.cookies();
const stock = await page.evaluate(() => ({ c: document.cookie, l: localStorage.length, s: sessionStorage.length }));
verifie(cookies.length === 0 && stock.c === '' && stock.l === 0 && stock.s === 0, 'aucun cookie, localStorage ni sessionStorage');
verifie([...hotes].every(h => h.startsWith('127.0.0.1')), 'aucun hôte tiers : ' + [...hotes].join(', '));
verifie(posts.length === 0, 'aucune requête autre que GET : ' + posts.join(', '));
verifie(erreursConsole.length === 0, 'aucune erreur ni avertissement de console' + (erreursConsole.length ? ' : ' + erreursConsole.slice(0, 3).join(' / ') : ''));
verifie(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie|indexedDB)\b/.test(src.js.replace(/\/\*[\s\S]*?\*\//g, '')), 'le code ne contient aucun appel réseau ni stockage');
verifie(!/(https?:)?\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}/i.test((src.html + src.css).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/https?:\/\/www\.w3\.org\/\d+\/svg/g, '')), 'HTML et CSS : aucune adresse externe');

section('11. Largeurs : aucun défilement horizontal, cibles tactiles');
for (const w of [320, 390, 768, 1024, 1440]) {
  const c2 = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'fr-FR' }); const p = await c2.newPage();
  await charger(p);
  const dep = async () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  verifie(await dep() <= 0, `${w} px : page à l'accueil`);
  const cols = s => p.$eval(s, e => getComputedStyle(e).gridTemplateColumns.split(' ').length), att = w > 960 ? 2 : 1;
  verifie(await cols('.cat:not([hidden]) .plats') === att && await cols('.lieu-grille') === att && await cols('.resa-client') === att, `${w} px : carte, maison et réservation sur ${att} colonne(s)`);
  const marges = await p.evaluate(() => { const t = document.querySelector('#etape-titre').getBoundingClientRect(); return [...document.querySelectorAll('.cal-mois h4, .cal')].map(e => e.getBoundingClientRect()).map(b => [b.left - t.left, t.right - b.right, b.left]); });
  verifie(marges.every(([g, d, bord]) => g >= -0.5 && d >= -0.5 && bord >= 12), `${w} px : calendrier et noms des mois alignés sur le texte, à distance du bord ${JSON.stringify(marges[0])}`);
  if (w <= 390) verifie(await p.$$eval('.cal-j', l => l.every(e => { const b = e.getBoundingClientRect(); return b.width >= 40 && b.height >= 44; })), `${w} px : chaque jour du calendrier reste une cible d'au moins 40 × 44 px`);
  await p.locator(`.cal-j[data-d="${ouverts[2]}"]`).click(); await p.locator('#etape [data-act=suivant]').click(); await p.locator('#etape [data-act=suivant]').click();
  await p.locator('#etape input[name=slot]:not(:disabled)').first().check(); await p.locator('#etape [data-act=suivant]').click();
  verifie(await dep() <= 0, `${w} px : plan de salle côté client`);
  if (w <= 390) verifie(await p.$$eval('#plan-client .tbl .corps', l => l.every(e => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height) >= 44; })), `${w} px : chaque table mesure au moins 44 px`);
  for (const t of ['resas', 'plan', 'emporter', 'creneaux', 'carte']) { await p.locator(`[data-tab=${t}]`).click(); verifie(await dep() <= 0, `${w} px : console, onglet ${t}`); }
  await p.locator('[data-ajout=e1]').click(); verifie(await dep() <= 0, `${w} px : panier`);
  await c2.close();
}

section('12. Sans JavaScript, mouvement réduit');
const nj = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } }); const pn = await nj.newPage(); await pn.goto(URL_PAGE);
verifie(await pn.locator('h1').isVisible() && await pn.locator('#cat-plats .plat').first().isVisible() && await pn.locator('#cat-boissons').isVisible(), 'sans JS : titre et carte complète visibles');
verifie(await pn.locator('#degustation').isVisible() && /690/.test(await pn.locator('#degustation').innerText()), 'sans JS : menu dégustation visible');
verifie(/JavaScript/.test(await pn.locator('#reserver').innerText()) && /JavaScript/.test(await pn.locator('#emporter').innerText()) && /JavaScript/.test(await pn.locator('#restaurant').innerText()), 'sans JS : la page dit que l\'interaction demande JavaScript');
verifie(await pn.locator('#resa-zone').isHidden() && await pn.locator('#console').isHidden() && await pn.locator('#emp-zone').isHidden(), 'sans JS : pas de faux outils');
await nj.close();
const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } }); const pr = await rm.newPage(); await pr.goto(URL_PAGE);
verifie(await pr.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) === 'auto', 'mouvement réduit : défilement sans animation');
await rm.close();

await browser.close(); srv.close();
console.log(`\n${ok} vérifications réussies, ${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
