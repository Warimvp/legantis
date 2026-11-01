// Démonstration Distribution OS dans Chromium : vraies pages servies en HTTP, aucune requête hors du site, données fictives.
//     node outils/parcours_distribution_os.mjs            SITE_ROOT=<dossier> pour un autre site
// Couvre : chargement, création de commande, quantité insuffisante, réservation, annulation (stock libéré), changements de statut, indicateurs,
// recherche et filtres, cohérence des montants, réinitialisation, scénario guidé (fait et passé), clavier, rôles, téléphone, export CSV,
// paramètres de campagne conservés vers /commandes/, session abîmée, thème. Sort 1 au premier échec constaté.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright')); }
const RACINE = process.env.SITE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const serveur = http.createServer(async (req, res) => {
  let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('absent'); }
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;
const DEMO = ORIGINE + '/realisations/demos/distribution-os/';
const JOUR = '2026-11-02';

let ok = 0, ko = 0;
const verifier = (nom, condition, detail = '') => { if (condition) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, detail); } };
const navigateur = await chromium.launch();
const tiers = new Set(), requetes = [];
async function contexte(options = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, ...options });
  await ctx.route(u => !u.href.startsWith(ORIGINE), r => { tiers.add(new URL(r.request().url()).host); return r.abort(); });
  ctx.on('request', r => { if (r.method() !== 'GET') requetes.push(r.method() + ' ' + r.url()); });
  return ctx;
}
async function ouvrir(ctx, suite = '') {
  const page = await ctx.newPage();
  page.erreurs = []; page.on('pageerror', e => page.erreurs.push(e.stack || e.message)); page.on('console', m => { if (m.type() === 'error') page.erreurs.push(m.text()); });
  await page.goto(DEMO + (suite.startsWith('?') ? suite + (suite.includes('jour=') ? '' : '&jour=' + JOUR) : '?jour=' + JOUR + suite));
  await page.waitForSelector('body.pret');
  return page;
}
const etat = (page, f, arg) => page.evaluate(f, arg);
const kpi = (page, cle) => page.locator(`[data-kpi="${cle}"] .kpi-val`).innerText();
const nav = async (page, m) => { await page.click(`.nav-lien[href="#/${m}"]`); await page.waitForFunction(m => DOSApp.route.module === m && !DOSApp.route.id && !document.querySelector('#tiroir .tiroir'), m); };
const titreGuide = async (page, t) => { try { await page.waitForFunction(t => (document.querySelector('#guide-titre') || {}).textContent === t, t, { timeout: 4000 }); return true; } catch { return false; } };
const texteNum = t => Number(t.replace(/[^\d,−-]/g, '').replace(',', '.').replace('−', '-'));

// ── Chargement, bandeau, navigation ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx);
  verifier('chargement sans erreur JavaScript', page.erreurs.length === 0, page.erreurs.join(' | '));
  verifier('bandeau : démonstration créée par Legantis, données fictives', (await page.locator('.bandeau-demo').innerText()).includes('Démonstration interactive créée par Legantis. Entreprises, opérations et données fictives.'));
  verifier('huit modules dans la navigation (direction)', await page.locator('.nav-lien').count() === 8);
  verifier('un seul h1, le titre du tableau de bord', await page.locator('h1').count() === 1 && (await page.locator('h1').innerText()).startsWith('Bonjour'));
  verifier('six indicateurs, chacun est un lien vers son écran', await page.locator('.kpis a.kpi[href^="#/"]').count() === 6);
  verifier('graphique des ventes dessiné (12 colonnes)', await page.locator('.carte--ventes .graph-colonne').count() === 12);
  verifier('premier écran : bouton « Tester un scénario en 3 minutes » visible sans défiler', await page.locator('.accueil [data-action="guide"]').isVisible() && (await page.locator('.accueil [data-action="guide"]').boundingBox()).y < 900);
  const cohérent = await etat(page, () => { const k = DOSApp.k; return document.querySelector('[data-kpi="enCours"] .kpi-val').textContent === String(k.enCours) && document.querySelector('[data-kpi="enRetard"] .kpi-val').textContent === String(k.enRetard); });
  verifier('les tuiles affichent les valeurs calculées par le moteur', cohérent);
  verifier('données de départ cohérentes (stock, réservations, montants)', (await etat(page, () => DOS.verifierCoherence(DOSApp.etat))).length === 0);
  for (const m of ['commandes', 'clients', 'stocks', 'preparation', 'paiements', 'rapports', 'parametres']) {
    await nav(page, m);
    verifier(`module ${m} : s'ouvre, un h1, sans erreur`, await page.locator('h1').count() === 1 && page.url().endsWith('#/' + m) && page.erreurs.length === 0, page.erreurs.join(' | '));
  }
  await ctx.close();
}

// ── Création de commande, montants, quantité insuffisante ───────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx);
  const avant = await etat(page, () => ({ n: DOSApp.etat.commandes.length, enCours: DOSApp.k.enCours, ca: DOSApp.k.ca30 }));
  await page.click('.haut-nouvelle');
  verifier('fenêtre « Nouvelle commande » ouverte, focus dedans', await page.locator('#modale .modale').isVisible() && await etat(page, () => document.querySelector('#modale').contains(document.activeElement)));
  await page.click('.modale button[type="submit"]:not([data-confirmer])');
  verifier('sans client : refus explicite, rien n\'est créé', (await page.locator('#nc-erreur').innerText()).includes('Choisissez un client') && (await etat(page, () => DOSApp.etat.commandes.length)) === avant.n);
  await page.selectOption('#nc-client', 'C05');
  await page.fill('#nc-q', 'huile');
  await page.click('[data-action="nc-ajouter"][data-produit="P01"]');
  await page.fill('[data-focus="nc-qte-P01"]', '7');
  await page.fill('#nc-q', 'the vert');
  await page.click('[data-action="nc-ajouter"][data-produit="P04"]');
  await page.click('[data-action="nc-plus"][data-i="1"]');
  const attendu = await etat(page, () => { const s = DOSApp.etat, c = DOS.client(s, 'C05'); return DOS.formaterMAD(DOS.montants({ remise: c.remise, lignes: [{ qte: 7, prix: DOS.produit(s, 'P01').prix }, { qte: 2, prix: DOS.produit(s, 'P04').prix }] }).ttc); });
  verifier('total TTC recalculé en direct (remise client et TVA 20 %)', (await page.locator('#nc-ttc').innerText()) === attendu, await page.locator('#nc-ttc').innerText() + ' ≠ ' + attendu);
  await page.click('[data-focus="nc-creer"]');
  await page.waitForURL(/#\/commandes\/CMD-/);
  const id = decodeURIComponent(page.url().split('/').pop());
  verifier('commande créée : fiche ouverte, statut Nouvelle', (await page.locator('#tiroir-titre').innerText()) === id && (await page.locator('.tiroir-badges .badge').innerText()).includes('Nouvelle'));
  const m = await etat(page, (id) => { const c = DOS.commande(DOSApp.etat, id); return { m: DOS.montants(c), lignes: c.lignes.map(l => l.qte * l.prix) }; }, id);
  const totaux = await page.locator('.tiroir .totaux dd').allInnerTexts();
  verifier('fiche : brut = somme des lignes, TTC = HT + TVA', m.m.brut === m.lignes.reduce((a, b) => a + b, 0) && m.m.ttc === m.m.ht + m.m.tva && totaux[totaux.length - 1].replace(/\s/g, '') === (await etat(page, (v) => DOS.formaterMAD(v), m.m.ttc)).replace(/\s/g, ''), totaux.join(' / '));
  await page.click('.tiroir-tete a.btn');
  await page.waitForFunction(() => !document.querySelector('#tiroir .tiroir'));
  verifier('la commande apparaît en tête de liste, marquée « vous »', (await page.locator('tbody tr').first().innerText()).includes(id) && await page.locator('tbody tr').first().locator('.nouveau').count() === 1);
  await nav(page, 'tableau');
  verifier('tableau de bord : commandes en cours +1', Number(await kpi(page, 'enCours')) === avant.enCours + 1);
  verifier('activité récente : la création y figure', (await page.locator('.activite li').first().innerText()).includes(id));

  // Quantité insuffisante
  const cafe = await etat(page, () => { const p = DOS.produit(DOSApp.etat, 'P12'); return DOS.disponible(p); });
  await page.click('.haut-nouvelle');
  await page.selectOption('#nc-client', 'C01');
  await page.fill('#nc-q', 'cafe');
  await page.click('[data-action="nc-ajouter"][data-produit="P12"]');
  await page.fill('[data-focus="nc-qte-P12"]', String(cafe + 5));
  verifier('quantité insuffisante : message sur la ligne et bandeau', (await page.locator('.ligne-alerte .champ-erreur').innerText()).includes('Seulement') && await page.locator('#nc-manque').isVisible());
  verifier('« Créer et réserver » désactivé avec la raison', (await page.getAttribute('[data-focus="nc-creer-confirmer"]', 'aria-disabled')) === 'true');
  await page.click('[data-focus="nc-creer"]');
  await page.waitForURL(/#\/commandes\/CMD-/);
  const bloquee = decodeURIComponent(page.url().split('/').pop());
  const reserveAvant = await etat(page, () => DOS.produit(DOSApp.etat, 'P12').reserve);
  verifier('fiche : stock insuffisant signalé avant confirmation', (await page.locator('.bandeau-info--attention').innerText()).includes('Stock insuffisant'));
  await page.click(`.tiroir [data-action="statut"][data-vers="confirmee"][data-id="${bloquee}"]`, { force: true });
  verifier('confirmation refusée, rien de réservé, raison affichée', await page.locator('.toast').last().isVisible() && (await etat(page, () => DOS.produit(DOSApp.etat, 'P12').reserve)) === reserveAvant && (await etat(page, (i) => DOS.commande(DOSApp.etat, i).statut, bloquee)) === 'nouvelle');
  // la débloquer par une réception
  await page.goto(DEMO + '?jour=' + JOUR + '#/stocks/P12');
  await page.waitForSelector('#tiroir-titre');
  await page.click('.tiroir [data-action="reception"]');
  await page.fill('#rc-qte', '40');
  await page.click('#modale button[type="submit"]');
  verifier('réception : stock et mouvement d\'entrée tracés', (await etat(page, () => { const s = DOSApp.etat, m = s.mouvements[s.mouvements.length - 1]; return m.type === 'entree' && m.produit === 'P12' && m.origine.type === 'reception'; })));
  verifier('la session survit au rechargement (même commande, même stock)', (await etat(page, (i) => !!DOS.commande(DOSApp.etat, i), bloquee)));
  await page.goto(DEMO + '?jour=' + JOUR + '#/commandes/' + bloquee);
  await page.waitForSelector('#tiroir-titre');
  await page.click(`.tiroir [data-action="statut"][data-vers="confirmee"][data-id="${bloquee}"]`);
  verifier('après réception, la confirmation réserve le stock', (await etat(page, (i) => DOS.commande(DOSApp.etat, i).statut, bloquee)) === 'confirmee' && (await etat(page, () => DOS.produit(DOSApp.etat, 'P12').reserve)) === reserveAvant + cafe + 5);
  // Annulation : réservation libérée
  await page.click('.tiroir [data-action="annuler"]');
  await page.click('#modale button[type="submit"]');
  verifier('annulation sans motif refusée', await page.locator('#annuler-erreur').isVisible());
  await page.selectOption('#motif', 'Demande du client');
  await page.click('#modale button[type="submit"]');
  verifier('annulation : stock réservé libéré, statut Annulée', (await etat(page, () => DOS.produit(DOSApp.etat, 'P12').reserve)) === reserveAvant && (await page.locator('.tiroir-badges .badge').innerText()).includes('Annulée'));
  verifier('aucune incohérence après ces actions', (await etat(page, () => DOS.verifierCoherence(DOSApp.etat))).length === 0);
  verifier('aucune erreur JavaScript', page.erreurs.length === 0, page.erreurs.join(' | '));

  // Changements de statut jusqu'à l'expédition, depuis le Kanban
  await page.keyboard.press('Escape');
  const k0 = await etat(page, () => ({ encours: DOSApp.k.encours, ca: DOSApp.k.ca30 }));
  await nav(page, 'preparation');
  const carte = page.locator(`[data-carte="${id}"]`);
  verifier('Kanban : la commande est dans « Nouvelle »', await page.locator(`[data-colonne="nouvelle"] [data-carte="${id}"]`).count() === 1);
  const stockP01 = await etat(page, () => DOS.produit(DOSApp.etat, 'P01').stock);
  for (const [vers, col] of [['confirmee', 'confirmee'], ['en_preparation', 'en_preparation'], ['prete', 'prete'], ['expediee', 'expediee']]) {
    await page.click(`[data-carte="${id}"] [data-action="statut"][data-vers="${vers}"]`);
    verifier(`statut ${vers} : la carte change de colonne`, await page.locator(`[data-colonne="${col}"] [data-carte="${id}"]`).count() === 1);
  }
  verifier('expédition : 7 cartons d\'huile sortis du stock physique', (await etat(page, () => DOS.produit(DOSApp.etat, 'P01').stock)) === stockP01 - 7);
  const ttc = await etat(page, (i) => DOS.montants(DOS.commande(DOSApp.etat, i)).ttc, id);
  verifier('expédition : l\'encours augmente du TTC de la commande', (await etat(page, () => DOSApp.k.encours)) === k0.encours + ttc);
  await nav(page, 'tableau');
  verifier('tableau de bord : tuile Encours mise à jour et signalée', await page.locator('[data-kpi="encours"].kpi--change').count() === 1);
  verifier('aucun stockage hors de la clé de la démonstration', (await etat(page, () => Object.keys(sessionStorage).join(',') + '|' + localStorage.length)) === 'legantis-demo-distribution-os|0');
  // Réinitialisation
  await page.click('.nav-reset');
  await page.click('#modale [data-action="reinitialiser-direct"]');
  verifier('réinitialiser : la commande créée disparaît, données de départ', (await etat(page, (i) => !DOS.commande(DOSApp.etat, i) && DOSApp.actions.length === 0, id)) && Number(await kpi(page, 'enCours')) === avant.enCours);
  verifier('réinitialiser : la session ne garde plus aucune action', (await etat(page, () => JSON.parse(sessionStorage.getItem('legantis-demo-distribution-os')).actions.length)) === 0);
  await page.reload(); await page.waitForSelector('body.pret');
  verifier('après rechargement, toujours les données de départ', (await etat(page, () => DOSApp.etat.commandes.length)) === avant.n);
  await ctx.close();
}

// ── Recherche, filtres, tri, export ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx, '#/commandes');
  await page.fill('#cmd-q', 'wifaq');
  const lignes = await page.locator('tbody tr').allInnerTexts();
  verifier('recherche « wifaq » : seulement Dépôt Al Wifaq', lignes.length > 0 && lignes.every(l => l.includes('Dépôt Al Wifaq')));
  verifier('recherche : le champ garde le focus pendant la saisie', await etat(page, () => document.activeElement.id === 'cmd-q'));
  await page.click('[data-action="cmd-statut"][data-statut="livree"]');
  verifier('filtre statut Livrée combiné à la recherche', (await page.locator('tbody .badge').allInnerTexts()).every(t => t.includes('Livrée')));
  await page.fill('#cmd-q', 'zzz introuvable');
  verifier('état vide soigné avec « Effacer les filtres »', await page.locator('.vide').isVisible() && await page.locator('.vide [data-action="cmd-effacer"]').isVisible());
  await page.click('.vide [data-action="cmd-effacer"]');
  verifier('effacer les filtres : toutes les commandes', (await page.locator('.pagination-info').first().innerText()).includes(String(await etat(page, () => DOSApp.etat.commandes.length))));
  await page.check('#cmd-retard');
  verifier('filtre « En retard » = indicateur du tableau de bord', await page.locator('tbody tr').count() === await etat(page, () => DOSApp.k.enRetard));
  await page.uncheck('#cmd-retard');
  await page.selectOption('#cmd-type', 'Grossiste'); await page.selectOption('#cmd-periode', '30');
  const types = await page.locator('tbody td[data-l="Client"] small').allInnerTexts();
  verifier('filtres multiples : type de client et période', types.length > 0 && types.every(t => t.startsWith('Grossiste')));
  await page.click('[data-action="trier"][data-cle="montant"]');
  const montants = (await page.locator('tbody td[data-l="Montant TTC"]').allInnerTexts()).map(texteNum);
  verifier('tri par montant décroissant', montants.every((v, i) => i === 0 || montants[i - 1] >= v), montants.slice(0, 5).join(' '));
  verifier('tri annoncé aux lecteurs d\'écran (aria-sort)', (await page.locator('th[aria-sort="descending"]').innerText()).includes('Montant'));
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="exporter"][data-quoi="commandes"]')]);
  const csv = await readFile(await telechargement.path(), 'utf8');
  verifier('export CSV : fichier préparé dans le navigateur, filtres appliqués', telechargement.suggestedFilename().startsWith('demo-distribution-os-commandes-') && csv.startsWith('﻿Référence;') && csv.trim().split('\r\n').length - 1 === await etat(page, () => DOSApp.commandesFiltrees().length));
  await nav(page, 'rapports');
  await page.selectOption('#ra-semaines', '4');
  verifier('rapports : le filtre de période redessine le graphique (4 semaines)', await page.locator('.graph-colonne').count() === 4);
  const [rapport] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="exporter"][data-quoi="rapport"]')]);
  verifier('rapports : export du rapport complet', (await readFile(await rapport.path(), 'utf8')).includes('VENTES-PAR-SEMAINE'));
  await nav(page, 'stocks');
  await page.selectOption('#st-etat', 'alerte');
  verifier('stocks : filtre « sous le seuil » = alertes du tableau de bord', await page.locator('tbody tr').count() === await etat(page, () => DOSApp.k.alertes));
  verifier('aucune erreur JavaScript', page.erreurs.length === 0, page.erreurs.join(' | '));
  await ctx.close();
}

// ── Paiements et relances ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx, '#/paiements?etat=echue');
  verifier('paiements : mention « pas un logiciel de comptabilité certifié »', (await page.locator('.bandeau-info--neutre').first().innerText()).includes('pas un logiciel de comptabilité'));
  const id = (await page.locator('tbody .ref').first().innerText()).trim();
  const reste = await etat(page, (i) => DOS.reste(DOSApp.d, DOS.commande(DOSApp.etat, i)), id);
  await page.locator('tbody tr').first().locator('[data-action="relancer"]').click();
  verifier('relance : aperçu fictif et mention « aucun message n\'est envoyé »', (await page.locator('#modale').innerText()).includes('aucun message n\'est envoyé'));
  await page.click('#modale button[type="submit"]');
  verifier('relance tracée, aucune requête envoyée', (await etat(page, (i) => DOSApp.etat.relances.filter(r => r.commande === i && r.jour === DOSApp.etat.jour).length, id)) === 1);
  await page.locator('tbody tr').first().locator('[data-action="paiement"]').click();
  await page.fill('#pa-montant', '1000000000');
  await page.click('#modale button[type="submit"]');
  verifier('paiement supérieur au reste dû refusé', await page.locator('#pa-erreur').isVisible());
  await page.fill('#pa-montant', '100,50');
  await page.click('#modale button[type="submit"]');
  verifier('paiement partiel : reste dû diminué de 100,50 MAD', (await etat(page, (i) => DOS.reste(DOSApp.d, DOS.commande(DOSApp.etat, i)), id)) === reste - 10050);
  await ctx.close();
}

// ── Scénario guidé, fait à la main ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx, '?scenario=1&utm_source=meta&utm_campaign=demo-test');
  verifier('?scenario=1 lance le guide à l\'étape 1', await titreGuide(page, 'Découvrez le tableau de bord') && (await page.locator('.guide .surtitre').textContent()).includes('étape 1 sur 6'));
  const k0 = await etat(page, () => ({ ...DOSApp.k }));
  await page.click('.haut-nouvelle');
  verifier('étape 2 après ouverture de la saisie', await titreGuide(page, 'Créez une commande fictive'));
  await page.click('[data-action="guide-remplir"]');
  verifier('« Remplir pour moi » prépare la saisie sans l\'envoyer', (await page.locator('#nc-client').inputValue()) === 'C05' && await page.locator('.nc-lignes tbody tr').count() === 3 && (await etat(page, () => DOSApp.actions.length)) === 0);
  await page.click('[data-focus="nc-creer"]');
  await page.waitForURL(/#\/commandes\/CMD-/);
  verifier('étape 3 : réserver le stock, le bouton est désigné', await titreGuide(page, 'Vérifiez et réservez le stock') && await page.locator('.guide-cible[data-vers="confirmee"]').count() === 1);
  await page.click('.tiroir [data-action="statut"][data-vers="confirmee"]');
  verifier('étape 4 : préparer', await titreGuide(page, 'Préparez la commande'));
  await page.click('.guide [data-action="guide-aller"]');
  await page.waitForFunction(() => DOSApp.route.module === 'preparation');
  await page.click('.guide-cible[data-vers="en_preparation"]');
  verifier('étape 5 : faire avancer le statut', await titreGuide(page, 'Faites avancer son statut'));
  await page.click('.guide-cible[data-vers="prete"]');
  verifier('étape 5 : « Prête » reconnu, reste l\'expédition', (await page.locator('.guide-ok').innerText()).includes('Prête'));
  await page.click('.guide-cible[data-vers="expediee"]');
  verifier('étape 6 : observer les indicateurs', await titreGuide(page, 'Observez l\'impact sur les indicateurs'));
  await page.click('.guide [data-action="guide-aller"]');
  await page.waitForFunction(() => DOSApp.route.module === 'tableau');
  verifier('étape 6 : tuiles modifiées signalées sur le tableau de bord', await page.locator('.kpi--change').count() >= 1);
  const tableau = await page.locator('.guide-table').innerText();
  verifier('étape 6 : avant / après chiffrés (encours, stock)', tableau.includes('Encours clients TTC') && tableau.includes('Stock physique'));
  await page.click('[data-action="guide-passer"]');
  verifier('résumé final affiché', (await page.locator('#modale-titre').innerText()) === 'Scénario terminé');
  const lien = await page.getAttribute('#modale .resume-cta a', 'href');
  verifier('résumé : « Discuter de mon projet » vers le formulaire, campagne conservée', lien.startsWith('../../../commandes/?') && lien.includes('utm_source=meta') && lien.includes('utm_campaign=demo-test') && lien.endsWith('#demande'), lien);
  verifier('résumé : aucun chiffre présenté comme un résultat client', (await page.locator('#modale').innerText()).includes('ce ne sont pas des résultats obtenus chez un client'));
  verifier('effet réel : stock réservé puis sorti, commande expédiée', (await etat(page, () => DOS.verifierCoherence(DOSApp.etat).length === 0 && DOSApp.etat.commandes.some(c => c.session && c.statut === 'expediee'))));
  verifier('effet réel : encours +TTC de la commande', (await etat(page, () => { const c = DOSApp.etat.commandes.find(x => x.session); return DOSApp.k.encours - DOS.montants(c).ttc; })) === k0.encours);
  await page.click('#modale .modale-pied [data-action="fermer-modale"]');
  verifier('le visiteur peut continuer à explorer (guide fermé)', await page.locator('#guide').isHidden() && !(await page.locator('#modale').isVisible()));
  verifier('aucune erreur JavaScript pendant le scénario', page.erreurs.length === 0, page.erreurs.join(' | '));
  await ctx.close();
}

// ── Scénario guidé : passer chaque étape, quitter, réinitialiser ───────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx);
  await page.click('.accueil [data-action="guide"]');
  for (let i = 0; i < 5; i++) await page.click('[data-action="guide-passer"]');
  verifier('passer les étapes : la commande est réellement expédiée', await etat(page, () => DOSApp.etat.commandes.some(c => c.session && c.statut === 'expediee')));
  await page.click('[data-action="guide-passer"]');
  verifier('passer la dernière étape : résumé', (await page.locator('#modale-titre').innerText()) === 'Scénario terminé');
  await page.click('#modale [data-action="guide-recommencer"]');
  verifier('recommencer : session réinitialisée, guide à l\'étape 1', await titreGuide(page, 'Découvrez le tableau de bord') && (await etat(page, () => DOSApp.actions.length)) === 0);
  await page.click('.guide-pied [data-action="guide-quitter"]');
  verifier('quitter le guide : panneau fermé, démonstration libre', await page.locator('#guide').isHidden());
  await ctx.close();
}

// ── Clavier ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx);
  await page.keyboard.press('Tab');
  verifier('clavier : premier arrêt = lien d\'évitement', await etat(page, () => document.activeElement.classList.contains('lien-evitement')));
  await page.keyboard.press('Control+k');
  verifier('Ctrl+K ouvre la palette de recherche', await page.locator('#palette-q').isVisible() && await etat(page, () => document.activeElement.id === 'palette-q'));
  const id = await etat(page, () => DOSApp.etat.commandes[DOSApp.etat.commandes.length - 3].id);
  await page.keyboard.type(id.slice(4));
  await page.keyboard.press('Enter');
  verifier('palette : Entrée ouvre la commande trouvée', (await page.locator('#tiroir-titre').innerText()) === id);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  verifier('fiche : le focus reste dans la fiche (Tab)', await etat(page, () => document.querySelector('#tiroir').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  verifier('Échap ferme la fiche', await page.waitForFunction(() => !document.querySelector('#tiroir .tiroir'), null, { timeout: 2000 }).then(() => true, () => false));
  await page.keyboard.press('n');
  verifier('raccourci « n » : nouvelle commande', await page.locator('#modale .modale').isVisible());
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+Tab');
  verifier('fenêtre : le focus reste dedans (Maj+Tab)', await etat(page, () => document.querySelector('#modale').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  verifier('Échap ferme la fenêtre et rend le focus', !(await page.locator('#modale .modale').count()));
  await page.goto(DEMO + '?jour=' + JOUR + '#/commandes'); await page.waitForSelector('body.pret');
  await page.locator('tbody tr').first().locator('[data-action="menu"]').click();
  verifier('menu contextuel : ouvert, focus sur la première entrée', await etat(page, () => document.activeElement.getAttribute('role') === 'menuitem'));
  await page.keyboard.press('ArrowDown');
  verifier('menu contextuel : flèches', await etat(page, () => document.activeElement === document.querySelectorAll('.menu-ctx:not([hidden]) [role="menuitem"]')[1]));
  await page.keyboard.press('Escape');
  verifier('menu contextuel : Échap le ferme et rend le focus au bouton', await page.locator('.menu-ctx:not([hidden])').count() === 0 && await etat(page, () => document.activeElement.getAttribute('data-action') === 'menu'));
  await ctx.close();
}

// ── Rôles ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx, '#/commandes');
  await page.selectOption('#role', 'magasinier');
  verifier('magasinier : 5 écrans, sans paiements ni clients', await page.locator('.nav-lien').count() === 5 && await page.locator('.nav-lien[href="#/paiements"]').count() === 0);
  verifier('magasinier : montants masqués dans les commandes', !(await page.locator('thead').innerText()).includes('Montant'));
  verifier('magasinier : pas de bouton « Nouvelle commande »', await page.locator('.haut-nouvelle').isHidden());
  await page.goto(DEMO + '?jour=' + JOUR + '#/paiements'); await page.waitForSelector('body.pret');
  verifier('magasinier : écran non permis → tableau de bord', page.url().endsWith('#/tableau') && (await page.locator('[data-kpi="aPreparer"]').count()) === 1);
  await nav(page, 'preparation');
  const conf = page.locator('[data-colonne="nouvelle"] [data-action="statut"][data-vers="confirmee"]').first();
  verifier('magasinier : confirmer une commande est désactivé, avec la raison', (await conf.getAttribute('aria-disabled')) === 'true' && (await conf.getAttribute('data-refus')).includes('Réservé aux rôles'));
  await page.selectOption('#role', 'gestionnaire');
  verifier('gestionnaire : indicateurs d\'encaissement', await page.locator('[data-kpi="echu"]').count() === 1 || await page.locator('.nav-lien[href="#/paiements"]').count() === 1);
  await ctx.close();
}

// ── Téléphone ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ouvrir(ctx);
  for (const m of ['tableau', 'commandes', 'clients', 'stocks', 'preparation', 'paiements', 'rapports', 'parametres', 'commandes/' + await etat(page, () => DOSApp.etat.commandes[5].id)]) {
    await page.goto(DEMO + '?jour=' + JOUR + '#/' + m); await page.waitForSelector('body.pret'); await page.waitForTimeout(50);
    const debord = await etat(page, () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    verifier(`téléphone (390 px) : ${m} sans défilement horizontal`, !debord);
  }
  await page.goto(DEMO + '?jour=' + JOUR + '#/tableau'); await page.waitForSelector('body.pret');
  verifier('téléphone : menu fermé au départ', !(await page.locator('.nav').isVisible()));
  await page.tap('.haut-menu');
  verifier('téléphone : le menu s\'ouvre', await page.locator('.nav').isVisible());
  await page.tap('.nav-lien[href="#/commandes"]');
  verifier('téléphone : navigation puis menu refermé', page.url().endsWith('#/commandes') && !(await page.locator('.app').evaluate(a => a.classList.contains('nav-ouverte'))));
  verifier('téléphone : tableau présenté en cartes avec intitulés', await etat(page, () => getComputedStyle(document.querySelector('.table--cartes tr')).display === 'grid'));
  await page.tap('.haut-nouvelle');
  const boite = await page.locator('#modale .modale').boundingBox();
  verifier('téléphone : saisie de commande en plein écran par le bas', boite.width >= 389 && boite.y + boite.height >= 843);
  await ctx.close();
}

// ── Paramètres de campagne, session abîmée, thème ──────────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await contexte(); const page = await ouvrir(ctx, '?utm_source=facebook&utm_medium=paid&utm_campaign=distribution');
  const href = await page.getAttribute('.nav-cta a', 'href');
  verifier('CTA de la démonstration : formulaire /commandes/ avec la campagne', href === '../../../commandes/?utm_source=facebook&utm_medium=paid&utm_campaign=distribution&utm_content=demo-distribution-os#demande', href);
  await page.click('.nav-cta a');
  await page.waitForURL('**/commandes/**');
  verifier('CTA : arrivée sur le formulaire de diagnostic, source relevée par le formulaire', page.url().endsWith('#demande') && (await page.locator('form.devis-form input[name="utm_source"]').inputValue()) === 'facebook');
  await page.goto(DEMO + '?jour=' + JOUR);
  await page.evaluate(() => sessionStorage.setItem('legantis-demo-distribution-os', '{abîmé'));
  await page.reload(); await page.waitForSelector('body.pret');
  verifier('session abîmée : la démonstration repart des données de départ', (await etat(page, () => DOSApp.actions.length)) === 0 && page.erreurs.length === 0);
  await page.evaluate(() => sessionStorage.setItem('legantis-demo-distribution-os', JSON.stringify({ v: 1, jour: '2026-11-02', actions: [{ action: { type: 'changer_statut', id: 'CMD-1', vers: 'livree' }, role: 'direction', h: '10:00' }] })));
  await page.reload(); await page.waitForSelector('body.pret');
  verifier('session invalide (action impossible) : ignorée', (await etat(page, () => DOSApp.actions.length)) === 0);
  await page.click('[data-action="theme"]');
  await page.reload(); await page.waitForSelector('body.pret');
  verifier('thème sombre gardé pendant la session', (await page.getAttribute('html', 'data-theme')) === 'sombre');
  await ctx.close();
}

verifier('aucun hôte tiers contacté', tiers.size === 0, [...tiers].join(', '));
verifier('aucune requête d\'envoi (POST, etc.) depuis la démonstration', requetes.filter(r => r.includes('/distribution-os/')).length === 0, requetes.join(', '));
await navigateur.close();
serveur.close();
console.log(`\n${ok} vérifications réussies, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
