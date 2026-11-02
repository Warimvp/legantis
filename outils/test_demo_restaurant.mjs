// Test de bout en bout de la démonstration Maison Tilal (site/realisations/demos/restaurant/).
// Lancer : node outils/test_demo_restaurant.mjs   (code 1 en cas d'échec)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
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
const URL_PAGE = `http://127.0.0.1:${PORT}/realisations/demos/restaurant/`;

let echecs = 0, ok = 0;
function verifie(cond, msg) { if (cond) { ok++; } else { echecs++; console.log('  ECHEC :', msg); } }
function section(t) { console.log('\n' + t); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
const page = await ctx.newPage();
const erreursConsole = [], hotes = new Set(), posts = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreursConsole.push(m.text()); });
page.on('pageerror', e => erreursConsole.push('pageerror: ' + e.message));
page.on('request', r => {
  const u = new URL(r.url()); hotes.add(u.host);
  if (r.method() !== 'GET') posts.push(r.method() + ' ' + r.url());
});

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const jours = Array.from({ length: 30 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
const ouverts = jours.filter(d => d.getDay() !== 1);

async function charger(p = page) { await p.goto(URL_PAGE); await p.waitForSelector('#etape h3'); }
async function etapeTitre() { return (await page.locator('#etape-titre').innerText()).trim(); }
async function suivant() { await page.locator('#etape [data-act=suivant]').click(); }
async function choisirDate(d) { await page.locator(`.cal-j[data-d="${iso(d)}"]`).click(); }
async function versService(d) { await choisirDate(d); await suivant(); }
async function reglerService(service, covers) {
  await page.locator(`#etape input[name=service][value=${service}]`).check({ force: true });
  await page.locator(`#etape input[name=covers][value="${covers}"]`).check({ force: true });
}
async function lireCreneaux() {
  return page.$$eval('#etape input[name=slot]', els => els.map(e => ({ t: e.value, off: e.disabled, motif: e.nextElementSibling.querySelector('small').textContent })));
}
async function ouvrirResto() { if (await page.locator('#vue-resto').isHidden()) await page.locator('#bascule-vue').click(); }
async function fermerResto() { if (await page.locator('#vue-resto').isVisible()) await page.locator('#bascule-vue').click(); }
async function restoLigne(dateIso, t) {
  await ouvrirResto();
  await page.selectOption('#resto-date', dateIso);
  const l = page.locator(`#resto-creneaux .cr[data-slot="${t}"]`);
  return { restantes: Number(await l.getAttribute('data-restantes')), cap: Number(await l.getAttribute('data-capacite')), ferme: (await l.getAttribute('data-ferme')) === 'true', l };
}

/* ------------------------------------------------------------------ 1. Contrat de la page */
section('1. Contrat de la page');
await charger();
verifie(await page.evaluate(() => document.documentElement.lang) === 'fr', 'lang="fr"');
verifie(await page.locator('meta[name=robots][content="noindex, follow"]').count() === 1, 'meta noindex, follow');
verifie(await page.locator('h1').count() === 1, 'un seul h1');
verifie(await page.locator('link[rel=icon][href="/assets/favicon.svg"]').count() === 1, 'favicon /assets/favicon.svg');
const bandeau = await page.evaluate(() => { const b = document.body.firstElementChild; return b ? b.outerHTML : ''; });
verifie(bandeau === '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>', 'bandeau exact en première ligne du body : ' + bandeau.slice(0, 80));
verifie(await page.locator('form, [action], a[href^="mailto:"], a[href^="tel:"]').count() === 0, 'aucun form, action, mailto ni tel');
verifie(await page.locator('nav a[href="#reserver"]').count() === 1, 'navigation par ancres');
for (const id of ['lieu', 'carte', 'chef', 'reserver', 'infos']) verifie(await page.locator('#' + id).count() === 1, 'ancre #' + id);
const poids = ['index.html', 'restaurant.css', 'restaurant.js'].reduce((n, f) => n + fs.statSync(path.join(ROOT, 'realisations/demos/restaurant', f)).size, 0);
verifie(poids < 120 * 1024, `poids HTML+CSS+JS < 120 Ko (${(poids / 1024).toFixed(1)} Ko)`);
const polices = fs.readdirSync(path.join(ROOT, 'realisations/demos/restaurant/fonts')).filter(f => f.endsWith('.woff2')).reduce((n, f) => n + fs.statSync(path.join(ROOT, 'realisations/demos/restaurant/fonts', f)).size, 0);
verifie(polices < 150 * 1024, `polices < 150 Ko (${(polices / 1024).toFixed(1)} Ko)`);

/* ------------------------------------------------------------------ 2. Carte */
section('2. Carte : onglets, filtres, panneau');
const onglets = await page.locator('#onglets [role=tab]').allInnerTexts();
verifie(onglets.length === 5 && onglets[0].startsWith('Entrées') && onglets[4].startsWith('Menu dégustation'), 'cinq onglets : ' + onglets.join(' | '));
verifie(await page.locator('#tab-entrees').getAttribute('aria-selected') === 'true', 'premier onglet sélectionné');
await page.locator('#tab-plats').click();
verifie(await page.locator('#cat-plats').isVisible() && await page.locator('#cat-entrees').isHidden(), 'clic sur Plats : seul le panneau Plats est visible');
await page.locator('#tab-plats').focus();
await page.keyboard.press('ArrowRight');
verifie(await page.evaluate(() => document.activeElement.id) === 'tab-desserts' && await page.locator('#cat-desserts').isVisible(), 'flèche droite : onglet Desserts');
await page.keyboard.press('End');
verifie(await page.evaluate(() => document.activeElement.id) === 'tab-degustation', 'Fin : dernier onglet');
await page.keyboard.press('Home');
verifie(await page.evaluate(() => document.activeElement.id) === 'tab-entrees', 'Début : premier onglet');
await page.locator('#tab-plats').click();
const avant = await page.locator('#cat-plats .plat:visible').count();
await page.locator('.puce:has-text("Végétarien")').click();
const veg = await page.$$eval('#cat-plats .plat:not([hidden])', l => l.map(e => e.dataset.veg));
verifie(veg.length > 0 && veg.length < avant && veg.every(v => v === '1'), `filtre végétarien : ${avant} -> ${veg.length}, tous végétariens`);
await page.locator('.puce:has-text("Sans alcool")').click();
await page.locator('.puce:has-text("Sans gluten")').click();
verifie(await page.locator('#carte-vide').isVisible(), 'filtres cumulés sur les plats : état vide affiché');
verifie((await page.locator('#carte-etat').innerText()).includes('Aucun'), 'annonce « Aucun plat » dans la zone live');
await page.locator('#carte-raz').click();
verifie(await page.locator('#cat-plats .plat:visible').count() === avant && await page.locator('#carte-vide').isHidden(), 'retrait des filtres : liste complète');
verifie(await page.locator('input[name=filtre]:checked').count() === 0, 'cases décochées');
await page.locator('.puce:has-text("Sans alcool")').click();
await page.locator('#tab-boissons').click();
const nb = await page.$$eval('#cat-boissons .plat:not([hidden])', l => l.map(e => e.dataset.na));
verifie(nb.length === 4 && nb.every(v => v === '1'), `Boissons sans alcool : ${nb.length} boissons`);
await page.locator('.puce:has-text("Sans alcool")').click();
await page.locator('#tab-plats').click();
const prem = page.locator('#cat-plats .plat-ouvrir').first();
const nomPlat = (await prem.innerText()).trim();
await prem.click();
verifie(await page.locator('#panneau[open]').count() === 1, 'panneau ouvert');
verifie((await page.locator('#pn-titre').innerText()).trim() === nomPlat, 'panneau : titre = plat');
verifie(/\d+ MAD/.test(await page.locator('.pn-prix').innerText()), 'panneau : prix en MAD');
verifie(await page.evaluate(() => document.querySelector('#panneau').contains(document.activeElement)), 'focus dans le panneau');
await page.keyboard.press('Escape');
verifie(await page.locator('#panneau[open]').count() === 0, 'Échap ferme le panneau');
verifie(await page.evaluate(() => document.activeElement.classList.contains('plat-ouvrir')), 'focus rendu au plat');
await prem.click(); await page.locator('.pn-bas [data-reserver]').click();
verifie(await page.locator('#panneau[open]').count() === 0, 'bouton Réserver du panneau le ferme');

/* ------------------------------------------------------------------ 3. Calendrier */
section('3. Calendrier des 30 prochains jours');
await charger();
verifie(await page.locator('.cal-j').count() === 30, '30 jours affichés');
const lundis = await page.$$eval('.cal-j', bs => bs.filter(b => /lundi/.test(b.getAttribute('aria-label'))).map(b => b.disabled));
verifie(lundis.length >= 4 && lundis.every(Boolean), `tous les lundis (${lundis.length}) sont désactivés`);
const autres = await page.$$eval('.cal-j', bs => bs.filter(b => !/lundi/.test(b.getAttribute('aria-label'))).map(b => b.disabled));
verifie(autres.every(d => !d), 'les autres jours sont actifs');
verifie(await page.locator(`.cal-j[data-d="${iso(today)}"]`).count() === 1 && await page.locator(`.cal-j[data-d="${iso(jours[29])}"]`).count() === 1, "premier jour = aujourd'hui, dernier = J+29");
await suivant();
verifie(await page.locator('#err-date.vu').count() === 1 && (await etapeTitre()).startsWith('Choisissez une date'), 'continuer sans date : erreur, on reste à l\'étape 1');

/* ------------------------------------------------------------------ 4. Disponibilité variable */
section('4. Disponibilité selon date et couverts');
const motifs = new Map();
let jourTrouve = null, slotTrouve = null;
const candidats = ouverts.filter(d => iso(d) !== iso(today)).slice(0, 14);
for (const d of candidats) {
  await charger();
  await versService(d);
  await reglerService('soir', 1);
  await suivant();
  const a = await lireCreneaux();
  await page.locator('#etape [data-act=retour]').click();
  await reglerService('soir', 8);
  await suivant();
  const b = await lireCreneaux();
  motifs.set(iso(d), a.map(x => x.off ? 'x' : 'o').join('') + '/' + b.map(x => x.off ? 'x' : 'o').join(''));
  if (!jourTrouve) {
    const i = a.findIndex((x, k) => !x.off && b[k].off);
    if (i >= 0) { jourTrouve = d; slotTrouve = a[i].t; }
  }
}
verifie(jourTrouve !== null, `au moins un créneau libre pour 1 couvert et complet pour 8 (${jourTrouve ? iso(jourTrouve) + ' ' + slotTrouve : 'aucun'})`);
verifie(new Set([...motifs.values()]).size > 2, 'les disponibilités diffèrent d\'un jour à l\'autre : ' + [...motifs.values()].slice(0, 6).join(' ; '));
{ // déterminisme : même date, même résultat après rechargement
  await charger(); await versService(candidats[0]); await reglerService('soir', 1); await suivant();
  const a1 = (await lireCreneaux()).map(x => x.off).join();
  await charger(); await versService(candidats[0]); await reglerService('soir', 1); await suivant();
  verifie((await lireCreneaux()).map(x => x.off).join() === a1, 'capacité fictive déterministe (même date, même résultat)');
}

/* ------------------------------------------------------------------ 5. Parcours de réservation complet */
section('5. Réservation complète, capacité, annulation');
const COUV = 2;
await charger();
// trouver un créneau avec au moins COUV places, sur un jour ouvert, et relever sa capacité restante
const jour = jourTrouve || candidats[0];
let t = slotTrouve;
await ouvrirResto();
await page.selectOption('#resto-date', iso(jour));
if (!t) t = await page.locator('#resto-creneaux .cr').evaluateAll((l, c) => (l.find(e => Number(e.dataset.restantes) >= c) || {}).dataset?.slot, COUV);
const avantRes = await restoLigne(iso(jour), t);
verifie(avantRes.restantes >= COUV, `créneau ${t} du ${iso(jour)} : ${avantRes.restantes} places restantes avant`);
await fermerResto();
await charger(); // état propre
await versService(jour);
verifie((await etapeTitre()).startsWith('Service'), 'étape 2 : service et couverts');
await reglerService(t < '15:00' ? 'midi' : 'soir', COUV);
await suivant();
verifie((await etapeTitre()).startsWith('Choisissez un créneau'), 'étape 3 : créneaux');
await suivant();
verifie(await page.locator('#err-slot.vu').count() === 1, 'continuer sans créneau : erreur');
await page.locator(`#etape input[name=slot][value="${t}"]`).check({ force: true });
await suivant();
verifie((await etapeTitre()).startsWith('Préférences'), 'étape 4 : préférences');
await page.selectOption('#f-occ', 'Anniversaire');
await page.locator('#etape label:has-text("Végétarien")').click();
await page.fill('#f-note', 'Table calme <b>fictive</b>');
await suivant();
verifie((await etapeTitre()).startsWith('Vos coordonnées'), 'étape 5 : coordonnées');
await suivant();
verifie(await page.locator('#etape .erreur.vu').count() === 4 && await page.locator('#etape [aria-invalid=true]').count() === 4, 'coordonnées vides : 4 erreurs, 4 champs invalides');
verifie(await page.evaluate(() => document.activeElement.id) === 'f-nom', 'focus sur le premier champ invalide');
await page.fill('#f-nom', 'Table Test'); await page.fill('#f-tel', '12345'); await page.fill('#f-mail', 'pas-un-mail');
await suivant();
verifie((await page.locator('#err-tel').innerText()).includes('10 chiffres') && (await page.locator('#err-mail').innerText()).includes('e-mail'), 'téléphone et e-mail invalides refusés');
verifie(await page.locator('#err-nom.vu').count() === 0, 'nom valide : pas d\'erreur');
await page.fill('#f-tel', '05 00 00 00 00'); await page.fill('#f-mail', 'test@exemple.test');
await suivant();
verifie(await page.locator('#err-ok.vu').count() === 1 && (await etapeTitre()).startsWith('Vos coordonnées'), 'case de compréhension obligatoire');
await page.locator('#f-ok').check();
await suivant();
verifie((await etapeTitre()) === 'Récapitulatif', 'étape 6 : récapitulatif');
const recap = await page.locator('.recap').innerText();
verifie(recap.includes('Table Test') && recap.includes('05 00 00 00 00') && recap.includes('Anniversaire') && recap.includes('Végétarien') && recap.includes(t.replace(':', ' h ')), 'récapitulatif : toutes les saisies');
verifie(recap.includes('<b>fictive</b>') && await page.locator('.recap b').count() === 0, 'saisie échappée (pas de HTML injecté)');
await page.locator('.recap [data-act=aller][data-s="2"]').click();
verifie((await etapeTitre()).startsWith('Service'), 'Modifier : retour à l\'étape voulue');
await suivant(); await suivant(); await suivant(); await suivant();
verifie((await etapeTitre()) === 'Récapitulatif', 'les saisies sont conservées en revenant au récapitulatif');
await page.locator('[data-act=confirmer]').click();
verifie((await etapeTitre()).startsWith('Table réservée'), 'confirmation affichée');
const num = (await page.locator('.conf-num').innerText()).trim();
verifie(/^MT-\d{6}-\d{4}$/.test(num), 'numéro simulé : ' + num);
verifie((await page.locator('#resa-msg').innerText()).includes(num), 'annonce live de la confirmation');
verifie(await page.locator('#mr-liste .mr').count() === 1 && (await page.locator('#mr-liste').innerText()).includes(num), 'apparaît dans « Mes réservations »');
verifie((await page.locator('#mr-liste').innerText()).toLowerCase().includes('confirmée'), 'statut confirmée');
const apresRes = await restoLigne(iso(jour), t);
verifie(apresRes.restantes === avantRes.restantes - COUV, `capacité du créneau réduite de ${COUV} : ${avantRes.restantes} -> ${apresRes.restantes}`);
verifie((await page.locator('#resto-liste').innerText()).includes(num), 'visible côté restaurant');
await fermerResto();
// Annulation : refus puis confirmation
await page.locator('#mr-liste [data-act=annuler]').click();
await page.locator('#mr-liste [data-act=non]').click();
verifie((await page.locator('#mr-liste').innerText()).toLowerCase().includes('confirmée'), 'annulation refusée : la réservation reste');
await page.locator('#mr-liste [data-act=annuler]').click();
await page.locator('#mr-liste [data-act=oui]').click();
verifie((await page.locator('#mr-liste').innerText()).toLowerCase().includes('annulée') && await page.locator('#mr-liste .mr.annulee').count() === 1, 'annulation : statut Annulée');
const retour = await restoLigne(iso(jour), t);
verifie(retour.restantes === avantRes.restantes, `annulation : places rendues (${retour.restantes})`);
await fermerResto();

/* ------------------------------------------------------------------ 6. Côté restaurant */
section('6. Côté restaurant : fermer, ajuster, effet immédiat');
await charger();
const j2 = ouverts.filter(d => iso(d) !== iso(today))[2];
await versService(j2);
await reglerService('soir', 2); await suivant();
const avantFerme = await lireCreneaux();
const cible = avantFerme.find(x => !x.off);
verifie(!!cible, 'un créneau du soir libre pour 2 le ' + iso(j2));
// Côté client : choisir ce créneau, puis le restaurant le ferme
await page.locator(`#etape input[name=slot][value="${cible.t}"]`).check({ force: true });
await ouvrirResto();
verifie(await page.locator('#vue-client').isHidden(), 'vue restaurant exclusive de la vue client');
await page.selectOption('#resto-date', iso(j2));
const ligne = page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"]`);
await ligne.locator('[data-act=bascule]').click();
verifie(await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"]`).getAttribute('data-ferme') === 'true', 'créneau fermé côté restaurant');
verifie((await page.locator('#resto-msg').innerText()).includes('fermé'), 'annonce live côté restaurant');
await page.locator('#bascule-vue').click();
verifie((await etapeTitre()).startsWith('Choisissez un créneau') && await page.locator('#err-slot, .erreur[role=alert]').count() >= 1, 'créneau choisi puis fermé : le parcours le détecte');
const apresFerme = await lireCreneaux();
const c2 = apresFerme.find(x => x.t === cible.t);
verifie(c2.off && c2.motif === 'Fermé', 'côté client : le créneau est désactivé « Fermé »');
// rouvrir
await ouvrirResto(); await page.selectOption('#resto-date', iso(j2));
await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"] [data-act=bascule]`).click();
await page.locator('#bascule-vue').click();
verifie((await lireCreneaux()).find(x => x.t === cible.t).off === false, 'créneau rouvert : de nouveau réservable');
// capacité : descendre au minimum => complet
await ouvrirResto(); await page.selectOption('#resto-date', iso(j2));
const l2 = page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"]`);
const cap0 = Number(await l2.getAttribute('data-capacite'));
await l2.locator('[data-d="2"]').click();
verifie(Number(await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"]`).getAttribute('data-capacite')) === cap0 + 2, 'capacité +2');
await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"] [data-d="-2"]`).click({ force: true });
for (let i = 0; i < 40; i++) await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"] [data-d="-2"]`).click({ force: true });
const l3 = page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"]`);
const restMin = Number(await l3.getAttribute('data-restantes'));
verifie(restMin <= 1, `capacité réduite au minimum : ${restMin} place(s) restante(s) (le plancher est le nombre de couverts déjà pris)`);
verifie((await page.locator('#resto-msg').innerText()).includes('minimale'), 'message de capacité minimale');
await page.locator('#bascule-vue').click();
const c3 = (await lireCreneaux()).find(x => x.t === cible.t);
verifie(c3.off && c3.motif.startsWith('Complet'), `côté client : créneau « ${c3.motif} » après baisse de capacité`);
// capacité augmentée => redevient disponible
await ouvrirResto(); await page.selectOption('#resto-date', iso(j2));
for (let i = 0; i < 6; i++) await page.locator(`#resto-creneaux .cr[data-slot="${cible.t}"] [data-d="2"]`).click();
await page.locator('#bascule-vue').click();
verifie((await lireCreneaux()).find(x => x.t === cible.t).off === false, 'capacité relevée : créneau de nouveau disponible');
// le jour affiché par défaut côté restaurant est un jour ouvert
await ouvrirResto();
verifie(ouverts.map(iso).includes(await page.inputValue('#resto-date')), 'jour restaurant par défaut : jour ouvert');
await fermerResto();

/* ------------------------------------------------------------------ 7. Clavier seul */
section('7. Parcours complet au clavier');
await charger();
async function tabVers(sel, max = 120) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(s => document.activeElement && document.activeElement.matches(s), sel)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}
const jk = ouverts.filter(d => iso(d) !== iso(today))[4];
await page.locator(`.cal-j[data-d="${iso(jk)}"]`).focus();
verifie(await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }), 'focus visible (contour ≥ 2 px) sur un jour du calendrier');
await page.keyboard.press('Space');
verifie(await page.locator(`.cal-j[data-d="${iso(jk)}"]`).getAttribute('aria-pressed') === 'true', 'Espace sélectionne la date');
verifie(await tabVers('[data-act=suivant]'), 'Tab atteint Continuer'); await page.keyboard.press('Enter');
verifie((await etapeTitre()).startsWith('Service'), 'clavier : étape 2');
await tabVers('input[name=covers]'); await page.keyboard.press('ArrowRight'); // 1 -> 2 ou 3...
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
verifie((await etapeTitre()).startsWith('Choisissez un créneau'), 'clavier : étape 3');
let sk = await tabVers('input[name=slot]:not(:disabled)');
if (!sk) { // jour complet pour ces couverts : on revient prendre 1 couvert
  await page.locator('[data-act=retour]').click(); await reglerService('soir', 1); await suivant(); sk = await tabVers('input[name=slot]:not(:disabled)');
}
verifie(sk, 'un créneau atteignable au clavier');
await page.keyboard.press('Space');
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
verifie((await etapeTitre()).startsWith('Préférences'), 'clavier : étape 4');
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
await tabVers('#f-nom'); await page.keyboard.type('Table Clavier');
await page.keyboard.press('Tab'); await page.keyboard.type('0500000000');
await page.keyboard.press('Tab'); await page.keyboard.type('clavier@exemple.test');
await page.keyboard.press('Tab'); await page.keyboard.press('Space');
await tabVers('[data-act=suivant]'); await page.keyboard.press('Enter');
verifie((await etapeTitre()) === 'Récapitulatif', 'clavier : récapitulatif');
await tabVers('[data-act=confirmer]'); await page.keyboard.press('Enter');
verifie(/^MT-\d{6}-\d{4}$/.test((await page.locator('.conf-num').innerText()).trim()), 'clavier : confirmation avec numéro');
await tabVers('#mr-liste [data-act=annuler]'); await page.keyboard.press('Enter');
await page.keyboard.press('Enter'); // focus sur « Oui, annuler »
verifie((await page.locator('#mr-liste').innerText()).toLowerCase().includes('annulée'), 'clavier : annulation');

/* ------------------------------------------------------------------ 8. Mobile : barre fixe */
section('8. Barre mobile et cibles tactiles');
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', hasTouch: true });
const pm = await mob.newPage();
pm.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreursConsole.push('mobile: ' + m.text()); });
pm.on('pageerror', e => erreursConsole.push('mobile pageerror: ' + e.message));
pm.on('request', r => { hotes.add(new URL(r.url()).host); if (r.method() !== 'GET') posts.push(r.method()); });
await charger(pm);
const barre = pm.locator('.barre-resa');
verifie(await barre.isVisible(), 'barre « Réserver » visible sur téléphone');
verifie(await barre.evaluate(e => getComputedStyle(e).position) === 'fixed', 'barre en position fixe');
await pm.evaluate(() => scrollTo(0, 900));
await pm.waitForTimeout(150);
const bb = await barre.boundingBox();
verifie(bb && Math.abs(bb.y + bb.height - 844) < 2, 'barre toujours collée en bas après défilement');
await barre.locator('a').click();
await pm.waitForTimeout(700);
verifie((await pm.evaluate(() => location.hash)) === '#reserver', 'la barre mène à #reserver');
verifie(await barre.isHidden(), 'barre masquée pendant la réservation : elle doublerait les boutons du parcours');
verifie(await page.locator('.barre-resa').isHidden(), 'barre masquée sur grand écran');
const petits = await pm.evaluate(() => {
  const sel = '.onglet, .puce span, .cal-j:not(:disabled), .rec span, .btn, .entete-cta, .menu-bouton, .plat-ouvrir';
  return [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().height));
});
verifie(petits.length === 0, 'cibles tactiles ≥ 44 px de haut : ' + (petits.slice(0, 5).join(', ') || 'toutes'));
await pm.locator('.menu-bouton').click();
verifie(await pm.locator('#nav-principale').isVisible() && await pm.locator('.menu-bouton').getAttribute('aria-expanded') === 'true', 'menu mobile ouvert');
await pm.locator('#nav-principale a[href="#carte"]').click();
verifie(await pm.locator('#nav-principale').isHidden(), 'menu refermé après navigation');
await mob.close();

/* ------------------------------------------------------------------ 9. Débordement horizontal */
section('9. Aucun défilement horizontal (320, 390, 768, 1024, 1440)');
for (const w of [320, 390, 768, 1024, 1440]) {
  const c = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'fr-FR' });
  const p = await c.newPage();
  await charger(p);
  const mesure = async (etat) => {
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    verifie(r.sw <= r.cw && r.bw <= r.cw, `${w} px, ${etat} : pas de débordement (scrollWidth ${r.sw} / ${r.cw})`);
  };
  await mesure('accueil');
  await p.locator('#tab-boissons').click(); await mesure('carte, boissons');
  await p.locator('#tab-degustation').click(); await mesure('carte, dégustation');
  const d = ouverts.filter(x => iso(x) !== iso(today))[3];
  await p.locator(`.cal-j[data-d="${iso(d)}"]`).click(); await mesure('calendrier');
  await p.locator('[data-act=suivant]').click(); await mesure('service');
  await p.locator('[data-act=suivant]').click(); await mesure('créneaux');
  await p.locator('#bascule-vue').click(); await mesure('côté restaurant');
  await p.locator('.cr').first().scrollIntoViewIfNeeded();
  const horsEcran = await p.evaluate(() => [...document.querySelectorAll('#vue-resto .cr, #vue-resto .cr *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length);
  verifie(horsEcran === 0, `${w} px : lignes de créneaux dans l'écran`);
  if (w === 320) {
    await p.locator('#bascule-vue').click();
    await p.locator('[data-act=retour]').click(); await p.locator('[data-act=retour]').click();
    const cw = await p.evaluate(() => { const b = document.querySelector('.cal-j:not(:disabled)'); return Math.round(b.getBoundingClientRect().width * 10) / 10; });
    verifie(cw >= 43, `320 px : jour du calendrier de ${cw} px de large`);
  }
  await c.close();
}

/* ------------------------------------------------------------------ 10. Sans JavaScript, mouvement réduit */
section('10. Sans JavaScript et mouvement réduit');
const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
const pn = await nojs.newPage();
await pn.goto(URL_PAGE);
const texte = await pn.locator('main').innerText();
verifie(texte.includes('Maison Tilal') && texte.includes('Zaalouk') && texte.includes('Menu Tilal'), 'sans JS : contenu et carte entière présents');
verifie(texte.includes('demande JavaScript'), 'sans JS : message indiquant que l\'interaction demande JavaScript');
verifie(await pn.locator('#resa-zone').isHidden(), 'sans JS : pas de faux assistant de réservation');
await nojs.close();
const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
const pr = await rm.newPage(); await pr.goto(URL_PAGE);
const opaque = await pr.$$eval('.rang, .pieces li, .citation', l => l.every(e => getComputedStyle(e).opacity === '1'));
verifie(opaque, 'mouvement réduit : tout est visible sans animation');
verifie(await pr.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) === 'auto', 'mouvement réduit : défilement sans animation');
await rm.close();

/* ------------------------------------------------------------------ 11. Contrat réseau et stockage */
section('11. Réseau, stockage, console');
const cookies = await ctx.cookies();
const stock = await page.evaluate(() => ({ c: document.cookie, l: localStorage.length, s: sessionStorage.length }));
verifie(cookies.length === 0 && stock.c === '' && stock.l === 0 && stock.s === 0, 'aucun cookie, localStorage ni sessionStorage');
verifie([...hotes].every(h => h.startsWith('127.0.0.1')), 'aucun hôte tiers : ' + [...hotes].join(', '));
verifie(posts.length === 0, 'aucune requête autre que GET : ' + posts.join(', '));
verifie(erreursConsole.length === 0, 'aucune erreur ni avertissement de console' + (erreursConsole.length ? ' : ' + erreursConsole.slice(0, 3).join(' / ') : ''));
const src = fs.readFileSync(path.join(ROOT, 'realisations/demos/restaurant/restaurant.js'), 'utf8');
verifie(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie|indexedDB)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'le code ne contient aucun appel réseau ni stockage');
const html = fs.readFileSync(path.join(ROOT, 'realisations/demos/restaurant/index.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'realisations/demos/restaurant/restaurant.css'), 'utf8');
verifie(!/(https?:)?\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}/i.test(html.replace(/https?:\/\/www\.w3\.org\/\d+\/svg/g, '').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')), 'HTML et CSS : aucune URL externe');

await browser.close(); srv.close();
console.log(`\n${ok} vérifications réussies, ${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
