// Test de la démonstration « Institut Naïa » (site/realisations/demos/reservation/).
// Usage : node outils/test_demo_reservation.mjs
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const { chromium } = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright');
const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '../site');
const dossierDemo = path.join(racine, 'realisations/demos/reservation');
const echecs = [];
let nb = 0;
const ok = (cond, msg) => { nb++; if (!cond) { echecs.push(msg); console.log('  ÉCHEC : ' + msg); } };

/* ---------- 1. moteur seul ---------- */
{
  const ctx = { Intl, Math, Date, Object, Array, Number, String };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dossierDemo, 'moteur.js'), 'utf8'), ctx);
  const N = ctx.Naia;
  const fixe = (iso) => () => new Date(iso);
  const A = N.creer(fixe('2026-11-02T09:00:00')), B = N.creer(fixe('2026-11-02T09:00:00'));
  const t0 = '2026-11-02';
  // déterminisme
  const snap = (i) => JSON.stringify([0, 1, 2, 3, 9, 10].map((n) => i.jour(N.plus(t0, n)).rdvs.map((r) => [r.prac, r.debut, r.service, r.statut])));
  ok(snap(A) === snap(B), 'données fictives non déterministes pour une même date');
  // aucun chevauchement dans les données générées, ni hors horaires
  let chev = 0, hors = 0;
  for (let n = 0; n < 200; n++) {
    const k = N.plus(t0, n), j = A.jour(k), h = N.horaire(k);
    j.rdvs.forEach((a) => {
      if (!h.ouvert || !h.segments.some((s) => a.debut >= s[0] && a.fin <= s[1])) hors++;
      j.rdvs.forEach((b) => { if (a !== b && a.prac === b.prac && a.statut !== 'annule' && b.statut !== 'annule' && a.debut < b.fin && b.debut < a.fin) chev++; });
    });
  }
  ok(chev === 0, `${chev} chevauchements dans l’agenda généré`);
  ok(hors === 0, `${hors} rendez-vous générés hors horaires ou sur la pause`);
  ok(N.horaire('2026-11-08').ouvert === false, 'dimanche non fermé');
  ok(N.horaire('2026-11-06').ouvert === false, 'jour férié non fermé');
  // créneaux : jamais à cheval sur la pause, jamais après la fermeture
  let mauvais = 0;
  for (let n = 1; n < 60; n++) {
    const k = N.plus(t0, n), h = N.horaire(k);
    ['c2', 'r1', 'v3', 'm1'].forEach((sid) => A.creneaux(k, sid, 'any').forEach((c) => {
      const d = N.svc(sid).duree;
      if (!h.segments.some((s) => c.debut >= s[0] && c.debut + d <= s[1])) mauvais++;
    }));
  }
  ok(mauvais === 0, `${mauvais} créneaux hors horaires/pause`);
  // un service long a moins de créneaux qu’un service court
  const k1 = N.plus(t0, 7);
  ok(A.creneaux(k1, 'm1', 'any').length >= A.creneaux(k1, 'r1', 'any').length, 'la durée ne réduit pas les créneaux');
  // réservation, chevauchement refusé, annulation libère
  const kk = (() => { for (let n = 1; n < 40; n++) { const k = N.plus(t0, n); if (A.creneaux(k, 'c2', 'in').length > 1) return k; } })();
  const cr = A.creneaux(kk, 'c2', 'in')[0].debut;
  const r1 = A.reserver({ cle: kk, debut: cr, service: 'c2', prac: 'in', client: { nom: 'T', tel: '0' } });
  ok(r1.ok, 'réservation valide refusée');
  ok(!A.reserver({ cle: kk, debut: cr, service: 'c2', prac: 'in', client: { nom: 'T', tel: '0' } }).ok, 'double réservation acceptée');
  const mi = A.creneaux(kk, 'c2', 'in').map((c) => c.debut);
  ok(!mi.some((t) => t > cr - 60 && t < cr + 60), 'créneau chevauchant encore proposé');
  ok(!A.reserver({ cle: kk, debut: cr + 30, service: 'c1', prac: 'in', client: { nom: 'T', tel: '0' } }).ok, 'chevauchement partiel accepté');
  A.changerStatut(r1.rdv.id, 'annule');
  ok(A.creneaux(kk, 'c2', 'in').some((c) => c.debut === cr), 'annulation : créneau non libéré');
  const r2 = A.reserver({ cle: kk, debut: cr, service: 'c2', prac: 'in', client: { nom: 'U', tel: '0' } });
  ok(r2.ok, 'reprise du créneau annulé refusée');
  ok(!A.changerStatut(r1.rdv.id, 'confirme').ok && r1.rdv.statut === 'annule', 'rétablissement accepté alors que le créneau a été repris');
  // blocage
  const b = A.bloquer({ cle: kk, prac: 'in', debut: cr, fin: cr + 60, motif: 'x' });
  ok(!b.ok && b.conflits, 'blocage sur un rendez-vous existant accepté');
  const k2 = N.plus(kk, 7);
  const av = A.creneaux(k2, 'c2', 'in').length;
  const b2 = A.bloquer({ cle: k2, prac: 'in', debut: 540, fin: 1140, motif: 'Congé' });
  ok(av === 0 || (b2.ok === false && b2.conflits) || A.creneaux(k2, 'c2', 'in').length === 0, 'blocage de journée sans effet sur les créneaux');
  // indicateurs
  const kI = N.plus(t0, 3), i0 = A.indicateurs(kI);
  const sl = A.creneaux(kI, 'v2', 'any')[0];
  if (sl) {
    const rr = A.reserver({ cle: kI, debut: sl.debut, service: 'v2', prac: 'any', client: { nom: 'V', tel: '0' } });
    const i1 = A.indicateurs(kI);
    ok(i1.rdv === i0.rdv + 1 && i1.montant === i0.montant + 450 && i1.taux >= i0.taux, 'indicateurs non recalculés après réservation');
    A.changerStatut(rr.rdv.id, 'absent');
    ok(A.indicateurs(kI).montant === i0.montant, 'absent compté dans le montant prévu');
    A.changerStatut(rr.rdv.id, 'annule');
    ok(A.indicateurs(kI).rdv === i0.rdv, 'annulé compté dans les rendez-vous');
  }
}

/* ---------- 2. navigateur ---------- */
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const PAGE = `http://localhost:${port}/realisations/demos/reservation/`;
const browser = await chromium.launch();

const aujourdhui = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const NBSP = /[\u00a0\u202f]/g;
const txt = (s) => (s || '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim();

async function ouvrirPage(ctx) {
  const p = await ctx.newPage();
  const etat = { erreurs: [], hotes: new Set(), methodes: new Set() };
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') etat.erreurs.push(m.text()); });
  p.on('pageerror', (e) => etat.erreurs.push('pageerror ' + e.message));
  p.on('request', (r) => { etat.hotes.add(new URL(r.url()).host); etat.methodes.add(r.method()); });
  await p.goto(PAGE);
  await p.waitForSelector('#etape .etape-titre');
  return { p, etat };
}

async function choisirSoin(p, cat, service, prac) {
  await p.click(`label.cat:has-text("${cat}")`);
  await p.click(`label.svc:has-text("${service}")`);
  if (prac) await p.click(`label.prac:has-text("${prac}")`);
}
async function premierJourLibre(p, apresAujourdhui = true) {
  for (let m = 0; m < 3; m++) {
    const d = await p.$$eval('.jour.libre', (bs, a) => bs.map((b) => b.dataset.date).filter((x) => x > a), apresAujourdhui ? aujourdhui : '0000');
    if (d.length) return d[0];
    await p.click('[data-act=mois][data-d="1"]');
  }
  return null;
}
async function remplirCoord(p, nom = 'Sara Test', tel = '06 00 00 00 00') {
  await p.fill('#f-nom', nom); await p.fill('#f-tel', tel); await p.check('#f-ok');
}
async function creneauxAffiches(p) { return p.$$eval('.creneau input', (is) => is.map((i) => +i.value)); }
async function indic(p) {
  return { rdv: +(await p.textContent('[data-i=rdv]')), taux: parseInt(await p.textContent('[data-i=taux]')), montant: parseInt((await p.textContent('[data-i=montant]')).replace(/\D/g, '')) };
}
async function allerGestion(p, date) {
  await p.click('#onglet-gestion');
  await p.waitForSelector('#g-planning');
  await p.fill('#g-date', date); await p.dispatchEvent('#g-date', 'change');
  await p.waitForSelector('#g-planning');
}

try {
  /* --- parcours principal, 1440 --- */
  console.log('Parcours client et gestion (1440 px)');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { p, etat } = await ouvrirPage(ctx);

  ok(await p.$eval('html', (h) => h.lang) === 'fr', 'lang="fr" absent');
  ok(await p.$$eval('h1', (h) => h.length) === 1, 'il faut exactement un h1');
  ok((await p.getAttribute('meta[name=robots]', 'content')) === 'noindex, follow', 'meta robots incorrecte');
  ok((await p.getAttribute('link[rel=icon]', 'href')) === '/assets/favicon.svg', 'favicon incorrecte');
  const premier = await p.$eval('body', (b) => b.firstElementChild.outerHTML);
  ok(premier === '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>', 'bandeau différent du bandeau exact : ' + premier.slice(0, 120));
  ok(await p.$$eval('form[action], a[href^="mailto:"], a[href^="tel:"]', (e) => e.length) === 0, 'form action, mailto ou tel présent');
  ok(await p.$$eval('img', (e) => e.length) === 0, 'image présente');
  ok(await p.isVisible('#etape'), 'application invisible');

  // étape 1 : catégories, services, praticiennes
  ok((await p.$$('label.cat')).length === 4, 'quatre catégories attendues');
  await p.click('[data-act=suite]', { force: true });
  ok(txt(await p.textContent('#recap-aide')).includes('Choisissez un soin'), 'pas de message quand aucun soin n’est choisi');
  ok(await p.$eval('#etape .etape-titre', (t) => t.textContent) === 'Choisissez votre soin', 'on a quitté l’étape 1 sans soin');
  await p.click('label.cat:has-text("Corps")');
  const noms = await p.$$eval('.svc b:first-child', (e) => e.map((x) => x.textContent));
  ok(noms.includes('Massage relaxant') && !noms.includes('Pose de vernis'), 'la catégorie ne filtre pas les soins');
  await p.click('label.svc:has-text("Massage relaxant")');
  ok(txt(await p.textContent('.recap-liste')).includes('Massage relaxant') && txt(await p.textContent('.recap-liste')).includes('500 MAD'), 'récapitulatif non mis à jour avec le soin');
  ok(await p.$eval('input[name=prac][value=any]', (i) => i.checked), '« sans préférence » doit être le choix par défaut');
  ok(await p.$eval('input[name=prac][value=sa]', (i) => i.disabled), 'Salma ne réalise pas les massages du corps : doit être désactivée');
  await p.click('label.prac:has-text("Inès")');
  await p.click('[data-act=suite]', { force: true });

  // étape 2 : calendrier
  ok(await p.$eval('#etape .etape-titre', (t) => t.textContent) === 'Choisissez le jour et l’heure', 'étape 2 non affichée');
  const titre1 = await p.textContent('#cal-titre');
  ok(await p.$eval('[data-act=mois][data-d="-1"]', (b) => b.disabled), 'mois précédent accessible dans le mois courant');
  const etats = await p.$$eval('.jour', (bs) => bs.map((b) => ({ d: b.dataset.date, e: b.dataset.etat, dis: b.getAttribute('aria-disabled') })));
  for (const x of etats) {
    const dow = new Date(x.d + 'T12:00:00').getDay();
    if (x.d < aujourdhui) ok(x.e === 'passe' && x.dis === 'true', `jour passé ${x.d} sélectionnable`);
    else if (dow === 0) ok(x.e === 'ferme' && x.dis === 'true', `dimanche ${x.d} non fermé`);
  }
  const dimanche = etats.find((x) => new Date(x.d + 'T12:00:00').getDay() === 0 && x.d >= aujourdhui);
  if (dimanche) {
    await p.click(`[data-date="${dimanche.d}"]`, { force: true });
    ok(txt(await p.textContent('#cal-msg')).includes('dimanche'), 'clic sur un dimanche sans explication');
    ok(await p.$eval(`[data-date="${dimanche.d}"]`, (b) => b.getAttribute('aria-pressed')) === 'false', 'dimanche sélectionné');
  }
  await p.click('[data-act=mois][data-d="1"]');
  ok((await p.textContent('#cal-titre')) !== titre1, 'le calendrier ne change pas de mois');
  ok(!(await p.$eval('[data-act=mois][data-d="-1"]', (b) => b.disabled)), 'mois précédent inaccessible depuis le mois suivant');
  await p.click('[data-act=mois][data-d="-1"]');
  // ajout d’un rendez-vous existant pour mesurer les indicateurs : jour libre pour Inès
  const jour = await premierJourLibre(p);
  ok(!!jour, 'aucun jour libre pour Inès');
  // indicateurs avant (via la gestion)
  await allerGestion(p, jour);
  const avant = await indic(p);
  await p.click('#onglet-client'); await p.waitForSelector('#cal-corps, #etape .etape-titre');
  ok(await p.$eval('#etape .etape-titre', (t) => t.textContent) === 'Choisissez le jour et l’heure', 'retour sur le client : étape perdue');
  await p.click(`[data-date="${jour}"]`);
  const crAvant = await creneauxAffiches(p);
  ok(crAvant.length > 0, 'aucun créneau affiché');
  const bornes = await p.evaluate((d) => { const w = new Date(d + 'T12:00:00').getDay(); return w === 6 ? 1020 : 1140; }, jour);
  ok(crAvant.every((t) => (t + 60 <= 780) || (t >= 870 && t + 60 <= bornes)), 'créneau à cheval sur la pause ou après la fermeture');
  const choix = crAvant[Math.min(2, crAvant.length - 1)];
  await p.check(`input[name=creneau][value="${choix}"]`, { force: true });
  ok(txt(await p.textContent('.recap-liste')).includes(String(Math.floor(choix / 60)).padStart(2, '0')), 'récapitulatif sans l’heure choisie');
  await p.click('[data-act=suite]', { force: true });

  // étape 3 : validation
  await p.click('[data-act=suite]', { force: true });
  ok((await p.$$('.champ.erreur')).length === 3, 'trois erreurs attendues sur formulaire vide (nom, téléphone, case)');
  ok(await p.$eval('#alerte-form', (a) => a.getAttribute('role')) === 'alert', 'récapitulatif d’erreurs sans role=alert');
  await p.fill('#f-nom', 'Sara Test'); await p.fill('#f-tel', '12345'); await p.check('#f-ok');
  await p.click('[data-act=suite]', { force: true });
  ok(txt(await p.textContent('#e-tel')).includes('invalide'), 'téléphone invalide accepté');
  await p.fill('#f-tel', '06 00 00 00 00'); await p.fill('#f-email', 'pas-un-mail');
  await p.click('[data-act=suite]', { force: true });
  ok(!!(await p.$('#e-email')), 'e-mail invalide accepté');
  await p.fill('#f-email', '');
  await p.click('[data-act=suite]', { force: true });

  // étape 4 : récapitulatif, modification
  ok(await p.$eval('#etape .etape-titre', (t) => t.textContent) === 'Vérifiez votre rendez-vous', 'étape 4 non affichée');
  ok(txt(await p.textContent('#recap-final')).includes('Sara Test') && txt(await p.textContent('#recap-final')).includes('Massage relaxant'), 'récapitulatif incomplet');
  await p.click('#recap-final [data-act=aller][data-e="2"]');
  const autre = crAvant.find((t) => t !== choix);
  if (autre != null) {
    await p.check(`input[name=creneau][value="${autre}"]`, { force: true });
    await p.click('[data-act=suite]', { force: true }); await p.click('[data-act=suite]', { force: true });
    const h = String(Math.floor(autre / 60)).padStart(2, '0') + ':' + String(autre % 60).padStart(2, '0');
    ok(txt(await p.textContent('#recap-final')).includes(h), 'modification de l’heure non répercutée');
  }
  const heureFinale = autre != null ? autre : choix;
  // rien n’est réservé avant la confirmation
  await allerGestion(p, jour);
  ok((await indic(p)).rdv === avant.rdv, 'rendez-vous créé avant confirmation');
  await p.click('#onglet-client');
  if (await p.isVisible('[data-act=suite]') && (await p.textContent('[data-act=suite]')).includes('Continuer')) { /* étape revalidée */ }
  ok((await p.textContent('[data-act=suite]')).includes('Confirmer'), 'étape de confirmation perdue au retour');
  await p.click('[data-act=suite]', { force: true });

  // confirmation
  await p.waitForSelector('#conf');
  const conf = txt(await p.textContent('#conf'));
  ok(/NA-\d{6}-\d+/.test(conf), 'numéro de rendez-vous absent');
  ok(conf.includes('Aucun SMS ni e-mail n’est envoyé'), 'mention « aucun SMS ni e-mail » absente');
  ok(txt(await p.textContent('#toast')).includes('Aucun SMS ni e-mail'), 'annonce de confirmation absente');
  ok(await p.$eval('#toast', (t) => t.getAttribute('role')) === 'status', 'toast sans role=status');
  const numero = (conf.match(/NA-\d{6}-\d+/) || [])[0];

  // créneau pris : plus proposé (et ceux qui chevauchent non plus)
  await p.click('[data-act=nouveau]');
  await choisirSoin(p, 'Corps', 'Massage relaxant', 'Inès');
  await p.click('[data-act=suite]', { force: true });
  const j2 = await p.$eval('.jour.libre[data-date="' + jour + '"]', (b) => b.dataset.date).catch(() => null);
  if (j2) {
    await p.click(`[data-date="${jour}"]`);
    const apres = await creneauxAffiches(p);
    ok(!apres.includes(heureFinale), 'le créneau réservé est encore proposé');
    ok(!apres.some((t) => t > heureFinale - 60 && t < heureFinale + 60), 'des créneaux chevauchant le rendez-vous sont proposés');
  }

  // Mes rendez-vous
  await p.click('.sousnav [data-sous=mes]');
  ok((await p.$$('.rv-carte')).length === 1, 'un rendez-vous attendu dans « Mes rendez-vous »');
  ok(txt(await p.textContent('#zone-mes')).includes(numero), 'numéro absent de la liste');
  ok(txt(await p.textContent('#nb-mes')) === '1', 'pastille du compteur incorrecte');

  // gestion : le rendez-vous apparaît aussitôt, indicateurs recalculés
  await allerGestion(p, jour);
  ok((await p.$$('.g-plan .rv.en-ligne')).length === 1, 'rendez-vous du client absent du planning');
  const apresRes = await indic(p);
  ok(apresRes.rdv === avant.rdv + 1, `compteur de rendez-vous non recalculé (${avant.rdv} → ${apresRes.rdv})`);
  ok(apresRes.montant === avant.montant + 500, `montant prévu non recalculé (${avant.montant} → ${apresRes.montant})`);
  ok(apresRes.taux >= avant.taux, 'taux d’occupation en baisse après réservation');
  // détail et statuts
  await p.click('.g-plan .rv.en-ligne');
  ok(await p.$eval('#dlg', (d) => d.open), 'détail non ouvert');
  ok(txt(await p.textContent('#dlg')).includes('Sara Test') && txt(await p.textContent('#dlg')).includes(numero), 'détail incomplet');
  for (const [st, cls] of [['Arrivé', 'st-arrive'], ['Terminé', 'st-termine'], ['Absent', 'st-absent']]) {
    await p.click(`#dlg .stbtn:has-text("${st}")`);
    ok(await p.$eval('#dlg .stbtn[aria-pressed=true]', (b) => b.textContent) === st, `statut ${st} non appliqué`);
    ok(await p.$eval('.g-plan .rv.en-ligne', (b, c) => b.classList.contains(c), cls), `planning : statut ${st} non répercuté`);
  }
  ok((await indic(p)).montant === avant.montant, 'absent compté dans le montant prévu');
  await p.click('#dlg .stbtn:has-text("Confirmé")');
  await p.keyboard.press('Escape');
  ok(!(await p.$eval('#dlg', (d) => d.open)), 'Échap ne ferme pas le détail');
  // statut côté client
  await p.click('#onglet-client'); await p.click('.sousnav [data-sous=mes]');
  // annulation côté client
  await p.click('[data-act=annuler]');
  ok(txt(await p.textContent('.confirme-annul')).includes('Annuler ce rendez-vous'), 'pas de confirmation avant annulation');
  await p.click('[data-act=annuler-non]');
  ok(txt(await p.textContent('.chip')) === 'Confirmé', 'annulation malgré « garder »');
  await p.click('[data-act=annuler]'); await p.click('[data-act=annuler-oui]');
  ok(txt(await p.textContent('.chip')) === 'Annulé', 'annulation non appliquée');
  ok(txt(await p.textContent('#toast')).includes('annulé'), 'annulation non annoncée');
  // le créneau est libéré (client)
  await p.click('.sousnav [data-sous=reserver]');
  ok(txt(await p.textContent('#etape .etape-titre')) === 'Choisissez le jour et l’heure', 'retour dans « Réserver » : l’assistant a perdu son étape');
  await p.click('.etapes [data-e="1"]');
  await choisirSoin(p, 'Corps', 'Massage relaxant', 'Inès');
  await p.click('[data-act=suite]', { force: true });
  const jm = jour.slice(0, 7);
  const cur = await p.$eval('#cal-titre', (t) => t.textContent);
  for (let i = 0; i < 7 && !(await p.$(`[data-date="${jour}"]`)); i++) await p.click('[data-act=mois][data-d="1"]');
  await p.click(`[data-date="${jour}"]`);
  ok((await creneauxAffiches(p)).includes(heureFinale), 'annulation : le créneau n’est pas libéré côté client');
  // gestion : annulé, indicateurs revenus
  await allerGestion(p, jour);
  const ann = await indic(p);
  ok(ann.rdv === avant.rdv && ann.montant === avant.montant, 'annulation : indicateurs non recalculés dans la gestion');

  // ajout manuel
  await p.click('[data-act=ajout]');
  ok(await p.$eval('#dlg', (d) => d.open), 'dialogue d’ajout fermé');
  await p.click('#dlg button[type=submit]');
  ok(txt(await p.textContent('#a-nom-e')).length > 0 && txt(await p.textContent('#a-tel-e')).length > 0, 'ajout manuel : erreurs de validation absentes');
  await p.selectOption('#a-service', 'm1');
  const optsH = await p.$$eval('#a-heure option', (o) => o.map((x) => x.value).filter(Boolean));
  ok(optsH.length > 0, 'ajout manuel : aucune heure libre');
  await p.fill('#a-nom', 'Cliente Manuelle'); await p.fill('#a-tel', '+212 6 00 00 00 00'.replace(/ /g, ' '));
  const telOk = await p.inputValue('#a-tel');
  await p.click('#dlg button[type=submit]');
  ok(!(await p.$eval('#dlg', (d) => d.open)), 'ajout manuel : dialogue non fermé (' + telOk + ')');
  const apresAjout = await indic(p);
  ok(apresAjout.rdv === avant.rdv + 1 && apresAjout.montant === avant.montant + 120, `ajout manuel : indicateurs ${JSON.stringify(apresAjout)}`);
  ok(txt(await p.textContent('#g-planning')).includes('Cliente Manuelle'), 'ajout manuel absent du planning');

  await ctx.close();

  /* --- blocage / déblocage : effet sur le calendrier client --- */
  console.log('Blocage et déblocage');
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { p: q } = await ouvrirPage(c);
    await choisirSoin(q, 'Corps', 'Massage relaxant', 'Inès');
    await q.click('[data-act=suite]', { force: true });
    const j = await premierJourLibre(q);
    await q.click(`[data-date="${j}"]`);
    const libres = await creneauxAffiches(q);
    const cible = libres[0];
    await q.click('#onglet-gestion');
    await q.fill('#g-date', j); await q.dispatchEvent('#g-date', 'change');
    // 1. bloquer toute la journée alors que des rendez-vous existent : refusé avec explication
    const nbRdvIn = await q.$$eval(`.g-plan .g-col[data-prac=in] .rv:not(.st-annule)`, (e) => e.length);
    if (nbRdvIn > 0) {
      await q.click('[data-act=blocage]');
      await q.check('input[name=b-type][value=jour]'); await q.selectOption('#b-prac', 'in'); await q.fill('#b-date', j);
      await q.click('#dlg button[type=submit]');
      ok(await q.$eval('#dlg', (d) => d.open) && txt(await q.textContent('#b-msg')).includes('Annulez'), 'blocage de journée sur des rendez-vous : pas de refus expliqué');
      await q.keyboard.press('Escape');
    }
    // 2. bloquer un créneau libre : plus réservable côté client
    await q.click('[data-act=blocage]');
    await q.selectOption('#b-prac', 'in'); await q.fill('#b-date', j);
    await q.selectOption('#b-debut', String(cible)); await q.selectOption('#b-duree', '60');
    await q.click('#dlg button[type=submit]');
    ok(!(await q.$eval('#dlg', (d) => d.open)), 'blocage d’un créneau libre refusé : ' + txt(await q.textContent('#b-msg')));
    ok((await q.$$('.g-plan .g-col[data-prac=in] .bloc')).length === 1, 'blocage absent du planning');
    await q.click('#onglet-client');
    await q.waitForSelector('#creneaux');
    await q.click('.etapes [data-e="2"]').catch(() => {});
    if (!(await q.$(`[data-date="${j}"]`))) await q.click('[data-act=mois][data-d="1"]');
    await q.click(`[data-date="${j}"]`);
    ok(!(await creneauxAffiches(q)).includes(cible), 'créneau bloqué encore réservable');
    await q.click('#onglet-gestion');
    await q.click('.g-plan .bloc');
    await q.click('[data-d=debloquer]');
    ok(!(await q.$eval('#dlg', (d) => d.open)), 'déblocage : dialogue resté ouvert');
    await q.click('#onglet-client');
    await q.click(`[data-date="${j}"]`);
    ok((await creneauxAffiches(q)).includes(cible), 'déblocage sans effet côté client');
    await c.close();
  }

  /* --- clavier --- */
  console.log('Parcours au clavier');
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { p: q } = await ouvrirPage(c);
    await q.focus('input[name=cat][value=corps]'); await q.keyboard.press('Space');
    await q.focus('input[name=service][value=c2]'); await q.keyboard.press('Space');
    ok(await q.$eval('input[name=service][value=c2]', (i) => i.checked), 'clavier : service non sélectionné');
    ok(await q.$eval('input[name=service][value=c2]', (i) => getComputedStyle(i.parentElement).outlineStyle !== 'none'), 'clavier : focus invisible sur le service');
    await q.focus('[data-act=suite]'); await q.keyboard.press('Enter');
    ok(await q.$eval('#etape .etape-titre', (t) => t === document.activeElement), 'clavier : le titre de l’étape ne reçoit pas le focus');
    const j = await premierJourLibre(q);
    await q.focus('.jour[tabindex="0"]');
    ok((await q.$$('.jour[tabindex="0"]')).length === 1, 'clavier : un seul arrêt de tabulation dans le calendrier');
    await q.keyboard.press('ArrowRight'); await q.keyboard.press('ArrowLeft'); await q.keyboard.press('ArrowDown'); await q.keyboard.press('ArrowUp');
    await q.focus(`[data-date="${j}"]`); await q.keyboard.press('Enter');
    ok(await q.$eval(`[data-date="${j}"]`, (b) => b.getAttribute('aria-pressed')) === 'true', 'clavier : jour non sélectionné');
    await q.focus('.creneau input'); await q.keyboard.press('Space');
    await q.focus('[data-act=suite]'); await q.keyboard.press('Enter');
    await q.focus('#f-nom'); await q.keyboard.type('Sara Test'); await q.keyboard.press('Tab'); await q.keyboard.type('06 00 00 00 00'); await q.keyboard.press('Tab'); await q.keyboard.press('Tab'); await q.keyboard.press('Tab'); await q.keyboard.press('Space');
    ok(await q.$eval('#f-ok', (i) => i.checked), 'clavier : case non cochée');
    await q.keyboard.press('Shift+Tab'); await q.keyboard.press('Tab');
    await q.focus('#f-nom'); await q.keyboard.press('Enter');
    ok(await q.$eval('#etape .etape-titre', (t) => t.textContent) === 'Vérifiez votre rendez-vous', 'clavier : Entrée dans le formulaire ne valide pas');
    await q.focus('[data-act=suite]'); await q.keyboard.press('Enter');
    await q.waitForSelector('#conf');
    // onglets : flèches
    await q.focus('#onglet-client'); await q.keyboard.press('ArrowRight');
    ok(await q.$eval('#onglet-gestion', (b) => b.getAttribute('aria-selected')) === 'true', 'clavier : flèche sur les onglets sans effet');
    // dialogue : focus piégé puis rendu
    await q.waitForSelector('.g-plan .rv, .g-liste .li');
    await q.click('.g-plan .rv >> nth=0');
    ok(await q.$eval('#dlg', (d) => d.contains(document.activeElement)), 'dialogue : focus hors du dialogue');
    await q.keyboard.press('Escape');
    ok(await q.$eval('#dlg', (d) => !d.open), 'dialogue non fermé');
    await c.close();
  }

  /* --- mobile --- */
  console.log('Mobile (390 px)');
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const { p: q, etat: e2 } = await ouvrirPage(c);
    const barre = async () => q.$eval('#recap', (r) => { const b = r.getBoundingClientRect(); return { bas: Math.round(b.bottom), h: innerHeight, pos: getComputedStyle(r).position }; });
    let b = await barre();
    ok(b.pos === 'fixed' && b.bas === b.h, 'mobile : récapitulatif non fixé en bas');
    await choisirSoin(q, 'Mains', 'Manucure soin');
    ok(txt(await q.textContent('.recap-court')).includes('Manucure soin'), 'mobile : résumé du bas non mis à jour');
    const cibles = await q.$$eval('label.cat, label.svc, label.prac, .recap-actions .btn, .onglets button', (e) => e.filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getBoundingClientRect().height));
    ok(cibles.every((h) => h >= 44), 'mobile : cibles tactiles < 44 px (' + Math.min(...cibles) + ')');
    await q.tap('[data-act=suite]', { force: true });
    ok(await q.isVisible('.recap-actions [data-act=retour]'), 'mobile : bouton Retour absent');
    const j = await premierJourLibre(q);
    const tj = await q.$$eval('.jour', (b) => Math.min(...b.map((x) => x.getBoundingClientRect().height)));
    ok(tj >= 44, 'mobile : jours du calendrier < 44 px');
    const lj = await q.$$eval('.jour', (b) => Math.min(...b.map((x) => x.getBoundingClientRect().width)));
    ok(lj >= 43, 'mobile : jours du calendrier trop étroits (' + lj + ')');
    await q.tap(`[data-date="${j}"]`);
    await q.tap('.creneau >> nth=0');
    await q.tap('[data-act=suite]', { force: true });
    await q.tap('[data-act=retour]');
    ok(await q.$eval('#etape .etape-titre', (t) => t.textContent) === 'Choisissez le jour et l’heure', 'mobile : Retour ne revient pas à l’étape précédente');
    ok(await q.$eval(`[data-date="${j}"]`, (b) => b.getAttribute('aria-pressed')) === 'true', 'mobile : le choix est perdu après Retour');
    await q.tap('[data-act=suite]', { force: true });
    await remplirCoord(q);
    await q.tap('[data-act=suite]', { force: true }); await q.tap('[data-act=suite]', { force: true });
    await q.waitForSelector('#conf');
    // gestion : liste
    await q.tap('[data-act=voir-gestion]');
    await q.waitForSelector('#g-planning');
    ok(await q.$eval('.g-plan', (g) => getComputedStyle(g).display) === 'none', 'mobile : la grille reste affichée');
    ok(await q.$eval('.g-liste', (g) => getComputedStyle(g).display) !== 'none', 'mobile : la liste n’est pas affichée');
    ok((await q.$$('.g-liste .li.rv .chip')).length > 0, 'mobile : aucun rendez-vous en liste');
    ok(txt(await q.textContent('.g-liste')).includes('Sara Test'), 'mobile : rendez-vous du client absent de la liste');
    await q.tap('.g-liste .li.rv >> nth=0');
    ok(await q.$eval('#dlg', (d) => d.open), 'mobile : détail non ouvert');
    await q.keyboard.press('Escape');
    ok(!e2.erreurs.length, 'mobile : erreurs de console ' + e2.erreurs.join(' | '));
    await c.close();
  }

  /* --- débordement horizontal, 5 largeurs, plusieurs écrans --- */
  console.log('Débordement horizontal');
  for (const w of [320, 390, 768, 1024, 1440]) {
    const c = await browser.newContext({ viewport: { width: w, height: 800 } });
    const { p: q } = await ouvrirPage(c);
    const mesure = async (nom) => {
      const r = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      ok(r.sw <= w && r.bw <= w, `${w}px : défilement horizontal sur « ${nom} » (scrollWidth ${r.sw})`);
    };
    await mesure('étape 1');
    await choisirSoin(q, 'Visage', 'Soin hydratation profonde'); await mesure('étape 1 avec choix');
    await q.click('[data-act=suite]', { force: true }); const j = await premierJourLibre(q); await q.click(`[data-date="${j}"]`); await mesure('étape 2');
    await q.click('.creneau >> nth=0'); await q.click('[data-act=suite]', { force: true });
    await q.click('[data-act=suite]', { force: true }); await mesure('étape 3 avec erreurs');
    await remplirCoord(q, 'Sara Test avec un nom particulièrement long pour tester'); await q.click('[data-act=suite]', { force: true }); await mesure('étape 4');
    await q.click('[data-act=suite]', { force: true }); await q.waitForSelector('#conf'); await mesure('confirmation');
    await q.click('[data-act=voir-mes]'); await mesure('mes rendez-vous');
    await q.click('#onglet-gestion'); await q.waitForSelector('#g-planning'); await mesure('gestion jour');
    await q.check('input[value=semaine]', { force: true }); await mesure('gestion semaine');
    await q.click('[data-act=ajout]'); await mesure('dialogue ajout'); await q.keyboard.press('Escape');
    await q.click('[data-act=blocage]'); await mesure('dialogue blocage'); await q.keyboard.press('Escape');
    await c.close();
  }

  /* --- principales exigences transversales, sur la première page --- */
  ok(![...etat.hotes].some((h) => !h.startsWith('localhost')), 'hôte tiers contacté : ' + [...etat.hotes].join(', '));
  ok([...etat.methodes].every((m) => m === 'GET'), 'requête non GET : ' + [...etat.methodes].join(', '));
  ok(!etat.erreurs.length, 'erreurs de console : ' + etat.erreurs.join(' | '));
  {
    const c = await browser.newContext();
    const { p: q } = await ouvrirPage(c);
    await choisirSoin(q, 'Visage', 'Soin éclat express');
    await q.click('[data-act=suite]', { force: true }); const j = await premierJourLibre(q); await q.click(`[data-date="${j}"]`); await q.click('.creneau >> nth=0');
    await q.click('[data-act=suite]', { force: true }); await remplirCoord(q); await q.click('[data-act=suite]', { force: true }); await q.click('[data-act=suite]', { force: true }); await q.waitForSelector('#conf');
    const st = await q.evaluate(() => ({ cookie: document.cookie, ls: localStorage.length, ss: sessionStorage.length, idb: typeof indexedDB !== 'undefined' ? 1 : 0 }));
    ok(st.cookie === '' && st.ls === 0 && st.ss === 0, 'cookie ou stockage utilisé');
    ok((await c.cookies()).length === 0, 'cookie posé');
    // rechargement : état remis à zéro
    await q.reload(); await q.waitForSelector('#etape .etape-titre');
    await q.click('.sousnav [data-sous=mes]');
    ok((await q.$$('.rv-carte')).length === 0, 'l’état survit au rechargement');
    // sans JavaScript
    const c2 = await browser.newContext({ javaScriptEnabled: false });
    const q2 = await c2.newPage(); await q2.goto(PAGE);
    ok((await q2.textContent('.sans-js')).includes('JavaScript') && await q2.isVisible('.sans-js'), 'sans JavaScript : message absent');
    await c2.close(); await c.close();
  }
  // poids
  const poids = ['index.html', 'reservation.css', 'reservation.js', 'moteur.js'].reduce((s, f) => s + fs.statSync(path.join(dossierDemo, f)).size, 0);
  ok(poids < 120 * 1024, `poids HTML+CSS+JS : ${poids} octets (> 120 Ko)`);
  const pol = fs.readdirSync(path.join(dossierDemo, 'fonts')).reduce((s, f) => s + fs.statSync(path.join(dossierDemo, 'fonts', f)).size, 0);
  ok(pol < 150 * 1024, `polices : ${pol} octets (> 150 Ko)`);
} catch (e) {
  echecs.push('exception : ' + (e && e.stack || e));
  console.log(e);
} finally {
  await browser.close();
  srv.close();
}
console.log(`\n${nb} vérifications, ${echecs.length} échec(s)`);
if (echecs.length) { echecs.forEach((x) => console.log(' - ' + x)); process.exit(1); }
console.log('OK');
