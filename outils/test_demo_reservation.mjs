// Test de la démonstration « Institut Naïa » (site/realisations/demos/reservation/).
// Usage : node outils/test_demo_reservation.mjs
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const chromium = createRequire(import.meta.url)('/Users/user/Projects/RydeX/node_modules/playwright')[process.env.NAVIGATEUR || 'chromium'];   // NAVIGATEUR=webkit|firefox, NAVIGATEUR_CHEMIN=exécutable
const TAB = process.env.NAVIGATEUR === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';   // WebKit macOS : Tab ne s'arrête pas sur les cases sans Option
const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '../site');
const dossierDemo = path.join(racine, 'realisations/demos/reservation');
const echecs = [];
let nb = 0;
// « Continuer » puis attente de l'étape suivante (son titre change) ou de la confirmation. Sans forçage : l'étape est valide,
// et le clic attend que le bouton soit stable et réellement atteint (un clic forcé pendant une transition pouvait se perdre).
const avancer = async (pg) => {
  const avant = await pg.$eval('#etape .etape-titre', (t) => t.textContent).catch(() => '');
  await pg.click('[data-act=suite]');
  await pg.waitForFunction((a) => document.querySelector('#conf') || (document.querySelector('#etape .etape-titre') || {}).textContent !== a, avant);
};
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
  // fermetures : jours civils à date fixe nommés, fêtes religieuses et fermetures exceptionnelles seulement si on les déclare
  ok(N.horaire('2027-01-14').raison === 'Institut fermé (Nouvel An amazigh)', 'Nouvel An amazigh non fermé ou sans libellé');
  ok(N.horaire('2026-10-31').ouvert === false, 'Fête de l’Unité (samedi 31 octobre 2026) non fermée');
  ok(N.horaire('2026-11-07').ouvert === true, 'samedi ordinaire fermé à tort');
  const refus = N.configurerFermetures({ '2026-11-07': 'Fermeture exceptionnelle (essai)', '2026-02-30': 'date inexistante', '2026-11-10': '  ', 'demain': 'x' });
  ok(N.horaire('2026-11-07').raison === 'Institut fermé (Fermeture exceptionnelle (essai))', 'fermeture datée non appliquée');
  ok(JSON.stringify(refus) === JSON.stringify(['2026-02-30', '2026-11-10', 'demain']), 'entrées invalides acceptées : ' + JSON.stringify(refus));
  ok(N.creer(fixe('2026-11-02T09:00:00')).creneaux('2026-11-07', 'c2', 'any').length === 0, 'créneaux proposés un jour de fermeture déclarée');
  N.configurerFermetures({});
  ok(N.horaire('2026-11-07').ouvert === true, 'fermeture datée conservée après réinitialisation');
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
const TAB = process.env.NAVIGATEUR === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';   // Safari/WebKit macOS : Tab ne s'arrête pas sur les cases sans Option

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

/* ---------- 1 bis. moteur : options, acompte, liste d’attente, déplacement, rappels, fiches, semaine (horloge fixe) ---------- */
const FIXE_ISO = [2026, 10, 2, 9, 0, 0];             // lundi 2 novembre 2026, 09:00
const NF = (() => {
  const c = { Intl, Math, Date, Object, Array, Number, String }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(dossierDemo, 'moteur.js'), 'utf8'), c);
  return c.Naia;
})();
const nouveauMoteur = () => NF.creer(() => new Date(...FIXE_ISO));
const T0F = '2026-11-02';
let jourOptions = null, jourComplet = null, jourDeplace = null;
{
  const N = NF, A = nouveauMoteur();
  // devis : durée, prix, acompte recalculés ; une option d’une autre catégorie est ignorée
  const dv = N.devis('v2', ['o1', 'o2', 'o8']);
  ok(dv.duree === 90 && dv.prix === 700 && dv.acompte === 210, `devis v2 + 3 options : ${JSON.stringify([dv.duree, dv.prix, dv.acompte])}`);
  ok(N.devis('v2', ['o4']).options.length === 0 && N.devis('v2', ['o4']).duree === 60, 'option d’une autre catégorie acceptée');
  ok(N.devis('v2', ['o8']).duree === 60 && N.devis('v2', ['o8']).prix === 490, 'option sans durée : la durée doit rester 60 min');
  // les créneaux se recalculent avec la durée totale
  let moins = 0, plusQue = 0;
  for (let n = 1; n < 40; n++) {
    const k = N.plus(T0F, n), a = A.creneaux(k, 'v2', 'any').length, b = A.creneaux(k, 'v2', 'any', null, 90).length;
    if (b > a) plusQue++;
    if (b < a) { moins++; if (!jourOptions && b >= 2) jourOptions = { k, base: a, avec: b }; }
  }
  ok(plusQue === 0 && moins > 5, `durée +30 min : créneaux ${moins} jours en baisse, ${plusQue} en hausse`);
  ok(!!jourOptions, 'aucun jour de test pour les options');
  // réservation avec options : durée, prix, acompte, plage occupée
  const kk = jourOptions.k, c0 = A.creneaux(kk, 'v2', 'any', null, 90)[0];
  const r = A.reserver({ cle: kk, debut: c0.debut, service: 'v2', options: ['o1', 'o2'], prac: c0.pracs[0], client: { nom: 'T', tel: '0600000000' }, acompte: true });
  ok(r.ok && r.rdv.fin - r.rdv.debut === 90 && r.rdv.prix === 660 && r.rdv.acompte.montant === 200, 'réservation avec options : durée/prix/acompte incorrects');
  ok(!A.libre(r.rdv.prac, kk, c0.debut + 60, c0.debut + 90), 'la fin allongée par les options doit occuper les 30 dernières minutes');
  ok(A.indicateurs(kk).options >= 2, 'indicateurs : options non comptées');
  // acompte : remboursé si annulé au moins 24 h avant, conservé sinon, conservé si absent, rétabli
  const rA = A.reserver({ cle: N.plus(T0F, 5), debut: A.creneaux(N.plus(T0F, 5), 'v1', 'any')[0].debut, service: 'v1', prac: 'any', client: { nom: 'A', tel: '0600000001' }, acompte: true });
  ok(rA.ok && rA.rdv.acompte.montant === 80 && rA.rdv.acompte.etat === 'verse', 'acompte de v1 : 30 % de 250 arrondi à la dizaine = 80');
  const sA = A.changerStatut(rA.rdv.id, 'annule');
  ok(sA.rdv.acompte.etat === 'rembourse' && sA.rdv.acompte.heures >= 24, 'annulation à plus de 24 h : acompte non remboursé');
  A.changerStatut(rA.rdv.id, 'annule'); ok(rA.rdv.acompte.etat === 'rembourse', 'réappliquer « annulé » ne doit pas rendre l\'acompte réglé (revue V3.1, R1)');
  ok(A.horaire ? !A.horaire('').ouvert : true, 'date vide : jour fermé, sans exception (revue V3.1, R2)');
  ok(!A.deplacer(rA.rdv.id, { cle: '', prac: rA.rdv.prac, debut: rA.rdv.debut }, true).ok, 'déplacement vers une date vide refusé sans exception (R2)');
  A.changerStatut(rA.rdv.id, 'confirme'); ok(rA.rdv.acompte.etat === 'verse', 'rétablissement : acompte non redevenu versé');
  const auj = A.creneaux(T0F, 'v1', 'any')[0];
  const rB = A.reserver({ cle: T0F, debut: auj.debut, service: 'v1', prac: 'any', client: { nom: 'B', tel: '0600000002' }, acompte: true });
  ok(rB.ok && A.heuresAvant(rB.rdv) < 24, 'rendez-vous du jour : moins de 24 h attendu');
  ok(A.changerStatut(rB.rdv.id, 'annule').rdv.acompte.etat === 'conserve', 'annulation à moins de 24 h : acompte non conservé');
  const kC = N.plus(T0F, 7), rC = A.reserver({ cle: kC, debut: A.creneaux(kC, 'v1', 'any')[0].debut, service: 'v1', prac: 'any', client: { nom: 'C', tel: '0600000003' }, acompte: true });
  A.changerStatut(rC.rdv.id, 'absent'); ok(rC.rdv.acompte.etat === 'conserve', 'absence : acompte non conservé');
  ok(A.indicateurs(kC).acompte >= 80, 'indicateurs : acompte conservé non compté');

  // liste d’attente sur un jour complet
  for (let n = 1; n < 80 && !jourComplet; n++) { const k = N.plus(T0F, n); if (A.disponibilite(k, 'v1', 'any').etat === 'complet') jourComplet = k; }
  ok(!!jourComplet, 'aucun jour complet pour v1');
  const W = (nom, tel) => A.rejoindre({ cle: jourComplet, service: 'v1', prac: 'any', client: { nom, tel }, source: 'manuel' });
  ok(!A.rejoindre({ cle: jourOptions.k, service: 'v1', prac: 'any', client: { nom: 'X', tel: '0600000099' } }).ok, 'inscription acceptée sur un jour qui n’est pas complet');
  const w1 = W('Premiere', '0600000011'), w2 = W('Deuxieme', '0600000012');
  ok(w1.ok && w1.rang === 1 && w2.ok && w2.rang === 2, 'rangs de la liste d’attente');
  ok(!W('Premiere bis', '06 00 00 00 11').ok, 'doublon de téléphone accepté');
  const cible = A.jour(jourComplet).rdvs.filter((x) => x.statut === 'confirme' && ['sa', 'ha'].includes(x.prac))[0];
  const avant = A.creneaux(jourComplet, 'v1', 'any').length;
  const ann = A.changerStatut(cible.id, 'annule');
  ok(ann.offre && ann.offre.client.nom === 'Premiere' && ann.offre.statut === 'propose', 'l’annulation ne propose pas le créneau à la première personne');
  ok(w2.entree.statut === 'attente', 'la deuxième personne ne doit pas être sollicitée');
  const hold = A.trouver(ann.offre.rdv);
  ok(hold.statut === 'propose' && hold.prac === cible.prac && hold.debut < cible.fin && cible.debut < hold.fin, 'créneau proposé hors de la plage libérée');
  ok(!A.creneaux(jourComplet, 'v1', 'any').some((c) => c.debut === hold.debut && c.pracs.includes(hold.prac)), 'le créneau proposé doit être réservé le temps de la réponse');
  const refus = A.repondre(w1.entree.id, false, { expire: true });
  ok(refus.ok && refus.suivante && refus.suivante.client.nom === 'Deuxieme' && w1.entree.statut === 'expire', 'sans réponse : le créneau ne passe pas à la suivante');
  const acc = A.repondre(w2.entree.id, true);
  ok(acc.ok && acc.rdv.statut === 'confirme' && acc.rdv.acompte.montant === 80, 'acceptation : rendez-vous ou acompte absent');
  ok(!A.repondre(w2.entree.id, true).ok, 'une proposition acceptée peut être acceptée deux fois');

  // déplacement sans chevauchement
  for (let n = 3; n < 40 && !jourDeplace; n++) {
    const k = N.plus(T0F, n);
    if (N.horaire(k).ouvert && A.travaille('sa', k) && A.travaille('ha', k)) {
      const libres = A.debutsPrac('sa', k, 30, 0), h = A.debutsPrac('ha', k, 30, 0);
      const s = libres.find((t) => libres.includes(t + 30) && h.includes(t));
      if (s != null) jourDeplace = { k, s };
    }
  }
  ok(!!jourDeplace, 'aucun jour de test pour le déplacement');
  const R1 = A.reserver({ cle: jourDeplace.k, debut: jourDeplace.s, service: 'm1', prac: 'sa', client: { nom: 'Mobile', tel: '0600000020' }, delai: 0 }).rdv;
  const d1 = A.deplacer(R1.id, { debut: jourDeplace.s + 30 });
  ok(d1.ok && R1.debut === jourDeplace.s + 30 && R1.fin === jourDeplace.s + 60 && R1.deplace === 1, 'déplacement valide refusé');
  ok(A.libre('sa', jourDeplace.k, jourDeplace.s, jourDeplace.s + 30), 'ancien créneau non libéré après déplacement');
  const occupe = A.jour(jourDeplace.k).rdvs.filter((x) => x.prac === 'sa' && x.statut !== 'annule' && x.id !== R1.id)[0];
  if (occupe) {
    const dc = A.deplacer(R1.id, { debut: occupe.debut });
    ok(!dc.ok && /Chevauche/.test(dc.erreur) && R1.debut === jourDeplace.s + 30, 'déplacement sur un autre rendez-vous accepté : ' + JSON.stringify(dc));
  }
  ok(!A.deplacer(R1.id, { debut: 780 }).ok, 'déplacement sur la pause accepté');
  ok(!A.deplacer(R1.id, { debut: 1110 }).ok || (R1.fin <= 1140), 'déplacement au-delà de la fermeture accepté');
  ok(!A.deplacer(R1.id, { cle: N.plus(T0F, -1), debut: 600 }).ok, 'déplacement dans le passé accepté');
  ok(!A.deplacer(R1.id, { prac: 'in' }).ok, 'déplacement vers une praticienne qui ne fait pas ce soin accepté');
  const dessai = A.deplacer(R1.id, { prac: 'ha', debut: jourDeplace.s }, true);
  ok(dessai.ok && R1.prac === 'sa', 'l’essai de déplacement ne doit rien modifier');
  A.changerStatut(R1.id, 'termine'); ok(!A.deplacer(R1.id, { debut: jourDeplace.s }).ok, 'déplacement d’un rendez-vous terminé accepté');
  A.changerStatut(R1.id, 'confirme');

  // rappels : recalculés après déplacement et annulation, jamais envoyés
  const R2 = A.reserver({ cle: jourDeplace.k, debut: jourDeplace.s + 60 > 1080 ? jourDeplace.s : jourDeplace.s, service: 'm1', prac: 'ha', client: { nom: 'Rappel', tel: '0600000021' }, delai: 0 });
  const R2r = R2.ok ? R2.rdv : null;
  ok(!!R2r && A.rappels(jourDeplace.k).some((x) => x.rdv.id === R2r.id && x.etat === 'planifie'), 'rappel absent ou non planifié');
  A.simulerRappel(R2r.id); ok(A.rappels(jourDeplace.k).find((x) => x.rdv.id === R2r.id).etat === 'simule', 'envoi simulé non enregistré');
  const k2 = N.plus(jourDeplace.k, 1), hs = N.horaire(k2).ouvert && A.travaille('ha', k2) ? A.debutsPrac('ha', k2, 30, 0)[0] : null;
  if (hs != null) {
    A.deplacer(R2r.id, { cle: k2, debut: hs });
    ok(!A.rappels(jourDeplace.k).some((x) => x.rdv.id === R2r.id) && A.rappels(k2).find((x) => x.rdv.id === R2r.id).etat === 'planifie', 'rappel non recalculé après déplacement');
  }
  A.changerStatut(R2r.id, 'annule'); ok(![jourDeplace.k, k2].some((k) => A.rappels(k).some((x) => x.rdv.id === R2r.id)), 'rappel d’un rendez-vous annulé encore listé');

  // fiches
  const cl = A.clientes();
  ok(cl.length >= 8 && cl.slice(0, 8).every((c) => c.historique.length > 0), 'fiches : les huit clientes suivies ont un historique');
  ok(cl.some((c) => c.nom === 'Deuxieme'), 'fiches : une personne ajoutée pendant la visite doit avoir une fiche');
  const f = cl[0];
  ok(f.notes.length > 0 && f.prochain && f.prochain.cle >= T0F, 'fiche : notes ou prochain rendez-vous absents');
  const nb = f.notes.length; A.ajouterNote(f.key, 'Note de test'); ok(A.fiche(f.key).notes.length === nb + 1 && A.fiche(f.key).notes[0].texte === 'Note de test', 'note non ajoutée à la fiche');
  ok(!A.ajouterNote(f.key, '   ').ok, 'note vide acceptée');
  ok(A.fiche('06 00 01 00 01').key === f.key, 'clé de fiche indépendante du format du numéro');

  // semaine : somme des jours, recalculée après réservation
  const S0 = A.semaine(T0F), somme = S0.jours.reduce((s, j) => s + j.x.rdv, 0);
  ok(S0.total.rdv === somme && S0.jours.length === 6, 'semaine : total différent de la somme des jours');
  const kw = N.plus(T0F, 2), c = A.creneaux(kw, 'v1', 'any')[0];
  const S1b = A.semaine(T0F);
  A.reserver({ cle: kw, debut: c.debut, service: 'v1', prac: 'any', client: { nom: 'S', tel: '0600000030' }, acompte: true });
  const S1 = A.semaine(T0F);
  ok(S1.total.rdv === S1b.total.rdv + 1 && S1.total.montant === S1b.total.montant + 250 && S1.total.acompte === S1b.total.acompte + 80, 'semaine non recalculée après réservation');
  ok(Math.abs(Object.values(S1.parPrac).reduce((s, z) => s + z.occupe, 0) - S1.total.occupe) < 1, 'semaine : occupation par praticienne incohérente');
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
const PAGE = `http://localhost:${port}/realisations/demos/reservation/reserver/`;
const browser = await chromium.launch({ executablePath: process.env.NAVIGATEUR_CHEMIN || undefined, slowMo: process.env.NAVIGATEUR === 'webkit' ? 60 : 0 });

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
  { // l'illustration de l'en-tête ne recouvre ni la note ni le lien
    const c0 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } }); const p0 = await c0.newPage(); await p0.goto(PAGE);
    const coupe = await p0.evaluate(() => { const b = document.querySelector('.entete-branche').getBoundingClientRect(); return ['.entete-note', '.entete-lien'].filter(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom; }); });
    ok(coupe.length === 0, 'en-tête : texte recouvert par l\'illustration : ' + coupe.join(' '));
    await c0.close();
  }
  const ctx = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 1440, height: 900 } });
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
  ok((await p.$$("label.cat")).length === 5, "cinq catégories attendues");
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
    await p.waitForFunction(() => document.querySelector('#cal-msg').textContent.includes('dimanche'), null, { timeout: 2000 }).catch(() => {});
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
    const c = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 1440, height: 900 } });
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
    const c = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 1440, height: 900 } });
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
    await q.focus('#f-nom'); await q.keyboard.type('Sara Test'); await q.keyboard.press(TAB); await q.keyboard.type('06 00 00 00 00'); await q.keyboard.press(TAB); await q.keyboard.press(TAB); await q.keyboard.press(TAB); await q.keyboard.press('Space');
    ok(await q.$eval('#f-ok', (i) => i.checked), 'clavier : case non cochée');
    await q.keyboard.press('Alt+Shift+Tab'.replace('Alt+', TAB === 'Tab' ? '' : 'Alt+')); await q.keyboard.press(TAB);
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
    const c = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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
    const c = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: w, height: 800 } });
    const { p: q } = await ouvrirPage(c);
    const mesure = async (nom) => {
      const r = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      ok(r.sw <= w && r.bw <= w, `${w}px : défilement horizontal sur « ${nom} » (scrollWidth ${r.sw})`);
    };
    await mesure('étape 1');
    await choisirSoin(q, 'Visage', 'Soin hydratation profonde'); await mesure('étape 1 avec choix');
    await avancer(q); const j = await premierJourLibre(q); await q.click(`[data-date="${j}"]`); await mesure('étape 2');
    await q.click('.creneau >> nth=0'); await q.click('[data-act=suite]', { force: true });
    await q.click('[data-act=suite]', { force: true }); await mesure('étape 3 avec erreurs');
    await remplirCoord(q, 'Sara Test avec un nom particulièrement long pour tester'); await q.click('[data-act=suite]', { force: true }); await mesure('étape 4');
    await avancer(q); await q.waitForSelector('#conf'); await mesure('confirmation');
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
    await avancer(q); const j = await premierJourLibre(q); await q.click(`[data-date="${j}"]`); await q.click('.creneau >> nth=0');
    await avancer(q); await remplirCoord(q); await avancer(q); await avancer(q); await q.waitForSelector('#conf');
    const st = await q.evaluate(() => ({ cookie: document.cookie, ls: localStorage.length, ss: sessionStorage.length, idb: typeof indexedDB !== 'undefined' ? 1 : 0 }));
    ok(st.cookie === '' && st.ls === 0 && st.ss === 0, 'cookie ou stockage utilisé');
    ok((await c.cookies()).length === 0, 'cookie posé');
    // rechargement : état remis à zéro
    await q.reload(); await q.waitForSelector('#etape .etape-titre');
    await q.click('.sousnav [data-sous=mes]');
    ok((await q.$$('.rv-carte')).length === 0, 'l’état survit au rechargement');
    // sans JavaScript
    const c2 = await browser.newContext({ reducedMotion: 'reduce',  javaScriptEnabled: false });
    const q2 = await c2.newPage(); await q2.goto(PAGE);
    ok((await q2.textContent('.sans-js')).includes('JavaScript') && await q2.isVisible('.sans-js'), 'sans JavaScript : message absent');
    await c2.close(); await c.close();
  }
  /* =====================================================================
     V3.1 : accueil, options, acompte, liste d’attente, déplacement, fiches, rappels, semaine
     (horloge figée au lundi 2 novembre 2026, 09:00 : les valeurs avant/après sont reproductibles)
     ===================================================================== */
  const hhmm = NF.hhmm;
  const APP = `http://localhost:${port}/realisations/demos/reservation/reserver/`;
  const ACCUEIL = `http://localhost:${port}/realisations/demos/reservation/`;
  const horlogeFixe = (iso) => {
    const T = new Date(...iso).getTime(), R = Date, t0 = performance.now();
    class D extends R { constructor(...a) { if (a.length) super(...a); else super(T + (performance.now() - t0)); } static now() { return T + (performance.now() - t0); } }
    window.Date = D;
  };
  const nombre = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);
  async function contexteFixe(w = 1440, h = 1500, mobile = false) {
    const c = await browser.newContext(mobile ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    await c.addInitScript(horlogeFixe, FIXE_ISO);
    return c;
  }
  async function ouvrirApp(c, qs = '') {
    const q = await c.newPage();
    const e = { erreurs: [], hotes: new Set(), methodes: new Set(), n: 0 };
    q.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') e.erreurs.push(m.text()); });
    q.on('pageerror', (x) => e.erreurs.push('pageerror ' + x.message));
    q.on('request', (r) => { e.hotes.add(new URL(r.url()).host); e.methodes.add(r.method()); e.n++; });
    await q.goto(APP + qs);
    await q.waitForSelector('#etape .etape-titre');
    return { q, e };
  }
  async function versMois(q, k) { for (let i = 0; i < 8 && !(await q.$(`[data-date="${k}"]`)); i++) await q.click('[data-act=mois][data-d="1"]'); }
  async function gestionJour(q, k, section = 'planning') {
    await q.click('#onglet-gestion'); await q.waitForSelector('[data-gs]');
    await q.click(`[data-gs=${section}]`); await q.waitForSelector('.g-corps-s');
    if (section === 'planning') { await q.fill('#g-date', k); await q.dispatchEvent('#g-date', 'change'); await q.waitForSelector('#g-planning'); }
  }
  async function indicG(q) {
    return { rdv: nombre(await q.textContent('[data-i=rdv]')), montant: nombre(await q.textContent('[data-i=montant]')), acompte: nombre(await q.textContent('[data-i=acompte]')), taux: nombre(await q.textContent('[data-i=taux]')) };
  }
  const debutDe = (style) => Math.round(parseFloat(/top:([\d.]+)px/.exec(style)[1]) / 1.2) + 540;
  async function positions(q) {
    return q.$$eval('.g-plan .g-col', (cols) => cols.map((c) => ({ prac: c.dataset.prac, cle: c.dataset.cle, items: [...c.querySelectorAll('.rv:not(.st-annule), .bloc')].map((x) => ({ id: x.dataset.id, top: parseFloat(x.style.top), h: parseFloat(x.style.height), nom: x.textContent })) })));
  }
  function chevauchements(cols) {
    let n = 0;
    for (const c of cols) for (let i = 0; i < c.items.length; i++) for (let j = i + 1; j < c.items.length; j++) { const a = c.items[i], b = c.items[j]; if (a.top < b.top + b.h - 2.5 && b.top < a.top + a.h - 2.5) n++; }
    return n;
  }
  async function ajouterManuel(q, { k, prac, service, debut, nom, tel = '06 00 00 00 77' }) {
    await q.click('[data-act=ajout]');
    await q.selectOption('#a-service', service);
    await q.fill('#a-date', k); await q.dispatchEvent('#a-date', 'change');
    await q.selectOption('#a-prac', prac);
    await q.selectOption('#a-heure', String(debut));
    await q.fill('#a-nom', nom); await q.fill('#a-tel', tel);
    await q.click('#dlg button[type=submit]');
    return q.waitForSelector(`.g-plan .rv:has-text("${nom}")`);
  }

  /* --- page d’accueil (statique, sans script) --- */
  console.log('Page d’accueil de l’institut');
  {
    const c = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 1440, height: 900 } });
    const q = await c.newPage(), reqs = [], err = [];
    q.on('request', (r) => reqs.push(r)); q.on('console', (m) => { if (['error', 'warning'].includes(m.type())) err.push(m.text()); });
    await q.goto(ACCUEIL);
    ok(await q.$$eval('h1', (h) => h.length) === 1 && txt(await q.textContent('h1')) === 'Institut Naïa', 'accueil : un seul h1 « Institut Naïa »');
    // page statique : aucun script de démonstration ; seul source.js, qui ne fait rien sans paramètre de campagne dans l'adresse
    const scripts = await q.$$eval('script', (s) => s.map((x) => x.getAttribute('src') || 'en ligne'));
    ok(scripts.length === 1 && scripts[0] === '/realisations/demos/source.js', 'accueil : aucun script attendu hors source.js (page statique) : ' + scripts.join(', '));
    ok((await q.getAttribute('meta[name=robots]', 'content')) === 'noindex, follow', 'accueil : meta robots');
    ok((await q.$eval('body', (b) => b.firstElementChild.outerHTML)) === '<p class="demo-bandeau"><span>Démonstration créée par Legantis · entreprise et données fictives</span> <a href="/realisations/">Retour aux réalisations</a></p>', 'accueil : bandeau exact absent');
    const titres = await q.$$eval('main h2', (h) => h.map((x) => x.textContent.trim()));
    ok(['L’institut', 'Les soins', 'Les praticiennes'].every((t) => titres.includes(t)), 'accueil : présentation, soins et praticiennes attendus : ' + titres.join(' | '));
    ok(await q.$$eval('main svg.hero-ill *', (e) => e.length) > 30, 'accueil : illustration du hero absente ou trop pauvre');
    ok(await q.$$eval('.vignette', (e) => e.length) === 5 && await q.$$eval('.p-cadre', (e) => e.length) === 3, 'accueil : 5 vignettes de soins et 3 portraits attendus');
    ok(await q.$$eval('.ligne-soin', (e) => e.length) === 14, 'accueil : 14 soins et forfaits attendus');
    ok(await q.$$eval('img, picture, video, canvas', (e) => e.length) === 0, 'accueil : image bitmap interdite');
    ok(/Casablanca/.test(await q.textContent('.pratique')) && /fictive/.test(await q.textContent('.pratique')), 'accueil : adresse fictive');
    ok(await q.$$eval('a[href^="mailto:"], a[href^="tel:"], form[action]', (e) => e.length) === 0, 'accueil : mailto, tel ou form action');
    ok(![...reqs.map((r) => new URL(r.url()).host)].some((h) => !h.startsWith('localhost')) && reqs.every((r) => r.method() === 'GET'), 'accueil : requête tierce ou non GET');
    ok(!err.length, 'accueil : erreurs de console ' + err.join('|'));
    ok(nombre(await q.$$eval('.ligne-soin .ls-prix', (e) => e.length)) === 14 && /Forfait Escale/.test(await q.textContent('#soins-forfaits')) && /au lieu de/.test(await q.textContent('#soins-forfaits')), 'accueil : forfaits avec prix barré attendus');
    // la présentation mène à l’application avec le choix transmis
    await q.click('a.ligne-soin[href$="soin=c2"]');
    await q.waitForSelector('#etape .etape-titre');
    ok(/reserver\/\?soin=c2/.test(q.url()) && await q.$eval('input[name=service][value=c2]', (i) => i.checked) && txt(await q.textContent('.recap-liste')).includes('Massage relaxant'), 'accueil → application : le soin choisi n’est pas transmis');
    await q.goto(ACCUEIL); await q.click('a[href="reserver/?prac=in"]'); await q.waitForSelector('#etape .etape-titre');
    ok(await q.$eval('input[name=prac][value=in]', (i) => i.checked), 'accueil → application : la praticienne choisie n’est pas transmise');
    await q.goto(ACCUEIL); await q.click('.onglets a[href="reserver/#gestion"]'); await q.waitForSelector('#g-planning');
    ok(await q.isVisible('#vue-gestion') && await q.$eval('#onglet-gestion', (b) => b.getAttribute('aria-selected')) === 'true', 'accueil → gestion : la gestion ne s’ouvre pas');
    await q.goto(ACCUEIL); await q.click('.hero a.btn:not(.btn-sec)'); await q.waitForSelector('#etape .etape-titre');
    ok(/\/reserver\/$/.test(q.url()), 'accueil : le bouton Réserver ne mène pas à l’application');
    await q.goto(APP); await q.waitForSelector('#etape .etape-titre');
    ok(await q.$eval('a.entete-lien', (a) => a.getAttribute('href') === '../' && a.target === '_blank' && a.rel.includes('noopener')), 'application : retour vers l’accueil (nouvel onglet, noopener) absent');
    // largeurs
    for (const w of [320, 390, 768, 1024, 1440]) {
      await q.setViewportSize({ width: w, height: 900 });
      await q.goto(ACCUEIL);
      const r = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth }));
      ok(r.sw <= w && r.bw <= w, `accueil ${w}px : défilement horizontal (${r.sw})`);
      const petit = await q.$$eval('a.btn, .ligne-soin, .onglets a', (e) => e.filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getBoundingClientRect().height));
      ok(Math.min(...petit) >= 44, `accueil ${w}px : cible tactile < 44 px (${Math.min(...petit)})`);
    }
    await c.close();
  }

  /* --- options : durée, prix et créneaux recalculés --- */
  console.log('Forfaits et options');
  let numeroOptions = null;
  {
    const c = await contexteFixe();
    const { q, e } = await ouvrirApp(c, '?soin=v2');
    const K = jourOptions.k;
    ok(await q.$eval('input[name=service][value=v2]', (i) => i.checked), 'options : soin de l’URL non sélectionné');
    ok(txt(await q.textContent('#opt-total')).includes('1 h · 450 MAD') && !txt(await q.textContent('#opt-total')).includes('soin seul'), 'options : total initial du soin seul');
    ok((await q.$$('input[name=opt]')).length === 4, 'options : quatre options attendues pour un soin du visage');
    // forfaits : catégorie, économie affichée, options propres au forfait
    await q.click('label.cat:has-text("Forfaits")');
    ok((await q.$$('label.svc')).length === 3 && /au lieu de 730 MAD/.test(txt(await q.textContent('#liste-services'))), 'forfaits : trois forfaits avec prix de référence attendus');
    await q.click('label.svc:has-text("Forfait Escale")');
    ok(txt(await q.textContent('.recap-liste')).includes('1 h 30 · 680 MAD'), 'forfait : durée et prix absents du récapitulatif');
    ok(await q.$eval('input[name=prac][value=in]', (i) => i.disabled) && await q.$eval('input[name=prac][value=sa]', (i) => i.disabled) && !(await q.$eval('input[name=prac][value=ha]', (i) => i.disabled)), 'forfait Escale : seule Hanane doit être proposée');
    await q.click('label.cat:has-text("Visage")'); await q.click('label.svc:has-text("Soin hydratation profonde")');
    ok(!(await q.$('input[name=opt][value=o4]')) && !!(await q.$('input[name=opt][value=o1]')), 'options : la liste doit dépendre du soin');
    // état avant : indicateurs du jour K dans la gestion
    await gestionJour(q, K); const avant = await indicG(q);
    await q.click('#onglet-client');
    await q.click('[data-act=suite]', { force: true }); await versMois(q, K); await q.click(`[data-date="${K}"]`);
    const crBase = await creneauxAffiches(q), n0 = crBase.length;
    ok(n0 === jourOptions.base, `options : créneaux du soin seul ${n0} ≠ moteur ${jourOptions.base}`);
    await q.click('.etapes [data-e="1"]');
    await q.check('input[name=opt][value=o1]', { force: true }); await q.check('input[name=opt][value=o2]', { force: true });
    ok(txt(await q.textContent('#opt-total')).includes('1 h 30 · 660 MAD') && txt(await q.textContent('#opt-total')).includes('soin seul : 1 h · 450 MAD'), 'options : durée et prix non recalculés : ' + txt(await q.textContent('#opt-total')));
    ok(txt(await q.textContent('.recap-liste')).includes('Masque LED apaisant') && txt(await q.textContent('.recap-liste')).includes('1 h 30 · 660 MAD'), 'options : récapitulatif non mis à jour');
    await q.check('input[name=opt][value=o8]', { force: true });
    ok(txt(await q.textContent('#opt-total')).includes('1 h 30 · 700 MAD'), 'option sans durée : le prix seul doit changer');
    ok(txt(await q.textContent('.recap-acompte')).includes('210 MAD'), 'récapitulatif : acompte recalculé avec les options attendu (210 MAD)');
    await q.click('[data-act=suite]', { force: true });
    await q.click(`[data-date="${K}"]`);
    const crOpt = await creneauxAffiches(q);
    ok(crOpt.length === jourOptions.avec && crOpt.length < n0, `créneaux recalculés : ${n0} → ${crOpt.length} (moteur ${jourOptions.avec})`);
    ok(txt(await q.textContent('#nb-creneaux')).includes(`au lieu de ${n0} pour le soin seul`) && txt(await q.textContent('#nb-creneaux')).includes('1 h 30'), 'créneaux : le recalcul n’est pas expliqué');
    ok(crOpt.every((t) => crBase.includes(t)), 'créneaux recalculés : un créneau avec options n’existait pas pour le soin seul');
    await q.check(`input[name=creneau][value="${crOpt[0]}"]`, { force: true });
    ok(txt(await q.textContent('.recap-liste')).includes(`${hhmm(crOpt[0])} – ${hhmm(crOpt[0] + 90)}`), 'récapitulatif : la plage doit faire 1 h 30');
    // retirer les options rétablit les créneaux
    await q.click('.etapes [data-e="1"]'); await q.uncheck('input[name=opt][value=o1]', { force: true }); await q.uncheck('input[name=opt][value=o2]', { force: true }); await q.uncheck('input[name=opt][value=o8]', { force: true });
    await q.click('[data-act=suite]', { force: true }); await q.click(`[data-date="${K}"]`);
    ok((await creneauxAffiches(q)).length === n0, 'sans options : les créneaux d’origine doivent revenir');
    // retour avec options, réservation
    await q.click('.etapes [data-e="1"]'); for (const o of ['o1', 'o2', 'o8']) await q.check(`input[name=opt][value=${o}]`, { force: true });
    await q.click('[data-act=suite]', { force: true }); await q.click(`[data-date="${K}"]`);
    await q.check(`input[name=creneau][value="${crOpt[0]}"]`, { force: true }); await q.click('[data-act=suite]', { force: true });
    await remplirCoord(q); await q.click('[data-act=suite]', { force: true });
    // acompte simulé annoncé comme tel
    const box = txt(await q.textContent('#acompte-box'));
    ok(/Acompte simulé/.test(box) && /aucun vrai paiement/.test(box) && /Annulation gratuite jusqu’à 24 h/.test(box) && /Aucune carte bancaire/.test(box), 'acompte : annonce « simulé », délai de 24 h ou absence de carte non affichés');
    ok(txt(await q.textContent('#ac-montant')) === '210 MAD' && txt(await q.textContent('#total-prix')) === '700 MAD', 'acompte : 30 % de 700 = 210 MAD attendu');
    ok(await q.$$eval('input[type=text][name*=card], input[autocomplete^="cc-"], input[name*=carte]', (e) => e.length) === 0, 'acompte : aucun champ de carte bancaire ne doit exister');
    ok(/simulé/.test(txt(await q.textContent('[data-act=suite]'))), 'acompte : le bouton de confirmation doit annoncer le caractère simulé');
    await avancer(q); await q.waitForSelector('#conf');
    const conf = txt(await q.textContent('#conf'));
    ok(/Acompte de 30 % réglé \(simulé\)/.test(conf) && /210 MAD/.test(conf) && /jusqu’au .* à \d\d:\d\d/.test(conf) && conf.includes('Masque LED apaisant') && conf.includes('1 h 30'), 'confirmation : options, acompte ou délai absents : ' + conf.slice(0, 400));
    numeroOptions = (conf.match(/NA-\d{6}-\d+/) || [])[0];
    // la gestion reporte durée, prix, acompte
    await gestionJour(q, K); const apres = await indicG(q);
    ok(apres.rdv === avant.rdv + 1 && apres.montant === avant.montant + 700 && apres.acompte === avant.acompte + 210, `gestion : indicateurs ${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);
    const h = await q.$eval('.g-plan .rv.en-ligne', (b) => b.getBoundingClientRect().height);
    ok(h > 100 && h < 112, 'planning : un rendez-vous de 1 h 30 doit occuper 108 px (' + h + ')');
    await q.click('.g-plan .rv.en-ligne');
    const dtl = txt(await q.textContent('#dlg'));
    ok(dtl.includes('Masque LED apaisant') && dtl.includes('Contour des yeux') && dtl.includes('1 h 30') && dtl.includes('700 MAD') && /Acompte de 210 MAD réglé \(simulé\)/.test(dtl), 'gestion : détail sans options, durée, prix ou acompte : ' + dtl.slice(0, 300));
    ok(/remboursé si annulé avant le/.test(dtl), 'gestion : règle de remboursement absente du détail');
    await q.keyboard.press('Escape');
    // remboursement simulé à l’annulation, plus de 24 h avant
    await q.click('#onglet-client'); await q.click('.sousnav [data-sous=mes]');
    ok(txt(await q.textContent('.rv-ac')).includes('Remboursable si vous annulez avant le'), 'Mes rendez-vous : délai de remboursement absent');
    await q.click('[data-act=annuler]');
    ok(/vous sera remboursé \(simulé\)/.test(txt(await q.textContent('#ac-prevision'))), 'annulation : prévision du remboursement absente : ' + txt(await q.textContent('.confirme-annul')));
    await q.click('[data-act=annuler-oui]');
    ok(/Acompte de 210 MAD remboursé \(simulé\)/.test(txt(await q.textContent('#msg-mes'))) && /remboursé/.test(txt(await q.textContent('.rv-ac'))), 'annulation : remboursement simulé non annoncé');
    await gestionJour(q, K); const fin = await indicG(q);
    ok(fin.rdv === avant.rdv && fin.montant === avant.montant && fin.acompte === avant.acompte, `gestion après annulation : ${JSON.stringify(fin)} ≠ ${JSON.stringify(avant)}`);
    await q.click('.g-plan .rv.st-annule'); ok(/remboursé \(simulé\)/.test(txt(await q.textContent('#dlg-ac'))) && await q.$eval('#dlg-ac', (d) => d.dataset.etat) === 'rembourse', 'gestion : remboursement non reporté dans la fiche du rendez-vous');
    await q.keyboard.press('Escape');
    ok(![...e.hotes].some((x) => !x.startsWith('localhost')) && [...e.methodes].every((m) => m === 'GET'), 'options/acompte : requête tierce ou non GET');
    ok(!e.erreurs.length, 'options/acompte : erreurs de console ' + e.erreurs.join('|'));
    await c.close();
  }

  /* --- annulation tardive : l’acompte est conservé --- */
  console.log('Acompte conservé (moins de 24 h)');
  {
    const c = await contexteFixe();
    const { q } = await ouvrirApp(c, '?soin=v1');
    await gestionJour(q, T0F); const avant = await indicG(q); await q.click('#onglet-client');
    await q.click('[data-act=suite]', { force: true }); await q.click(`[data-date="${T0F}"]`);
    const cr = await creneauxAffiches(q); ok(cr.length > 0 && cr.every((t) => t >= 600), 'aujourd’hui : seuls les créneaux à plus d’une heure sont proposés');
    await q.check(`input[name=creneau][value="${cr[0]}"]`, { force: true }); await q.click('[data-act=suite]', { force: true });
    await remplirCoord(q); await q.click('[data-act=suite]', { force: true }); await avancer(q); await q.waitForSelector('#conf');
    ok(/80 MAD/.test(txt(await q.textContent('#ac-montant'))), 'acompte du soin éclat express : 80 MAD');
    await q.click('[data-act=voir-mes]');
    ok(/Délai de remboursement dépassé/.test(txt(await q.textContent('.rv-ac'))), 'rendez-vous du jour : le délai dépassé doit être annoncé');
    await q.click('[data-act=annuler]');
    ok(/moins de 24 h : l’acompte de 80 MAD sera conservé/.test(txt(await q.textContent('#ac-prevision'))), 'annulation tardive : conservation annoncée avant confirmation');
    await q.click('[data-act=annuler-oui]');
    ok(/conservé par l’institut \(simulé\)/.test(txt(await q.textContent('.rv-ac'))), 'annulation tardive : acompte conservé non annoncé');
    await gestionJour(q, T0F); const apres = await indicG(q);
    ok(apres.rdv === avant.rdv && apres.acompte === avant.acompte + 80, `acompte conservé : le montant doit rester dans la gestion (${avant.acompte} → ${apres.acompte})`);
    await q.click('.g-plan .rv.st-annule'); ok(await q.$eval('#dlg-ac', (d) => d.dataset.etat) === 'conserve', 'gestion : acompte conservé non indiqué');
    await q.keyboard.press('Escape'); await c.close();
  }

  /* --- liste d’attente sur un jour complet --- */
  console.log('Liste d’attente');
  {
    const c = await contexteFixe();
    const { q, e } = await ouvrirApp(c, '?soin=v1');
    const D = jourComplet;
    await q.click('[data-act=suite]', { force: true }); await versMois(q, D);
    ok(await q.$eval(`[data-date="${D}"]`, (b) => b.dataset.etat === 'complet' && b.getAttribute('aria-disabled') !== 'true'), 'jour complet : doit rester activable pour la liste d’attente');
    await q.click(`[data-date="${D}"]`);
    ok(await q.isVisible('#attente-box') && /Jour complet/.test(txt(await q.textContent('#attente-box'))) && (await q.$$('.creneau')).length === 0, 'jour complet : panneau de liste d’attente attendu, aucun créneau');
    ok(await q.$eval('[data-act=suite]', (b) => b.getAttribute('aria-disabled')) === 'true', 'jour complet : on ne peut pas continuer sans créneau');
    await q.click('[data-act=att-ouvrir]');
    await q.click('#f-att button[type=submit]');
    ok(txt(await q.textContent('#w-nom-e')).length > 0 && txt(await q.textContent('#w-tel-e')).length > 0, 'liste d’attente : erreurs de validation absentes');
    await q.fill('#w-nom', 'Sara Test'); await q.fill('#w-tel', '06 00 00 00 00'); await q.click('#f-att button[type=submit]');
    ok(!(await q.$eval('#dlg', (d) => d.open)) && /n° 1/.test(txt(await q.textContent('#toast'))), 'liste d’attente : inscription non confirmée');
    ok(/Vous êtes en liste d’attente, n° 1 sur 1/.test(txt(await q.textContent('#attente-box'))), 'liste d’attente : le rang n’est pas affiché');
    await q.click('[data-act=vers-mes]');
    ok(/En attente/.test(txt(await q.textContent('#liste-attente'))) && /n° 1 sur la liste/.test(txt(await q.textContent('#liste-attente'))), 'Mes rendez-vous : place en liste d’attente absente');
    // côté gestion : la file, puis une deuxième personne ajoutée à la main
    await gestionJour(q, D, 'attente'); await q.fill('#att-date', D); await q.dispatchEvent('#att-date', 'change');
    ok((await q.$$('#file-attente .file-i')).length === 1 && /Sara Test/.test(txt(await q.textContent('#file-attente'))) && /inscrite en ligne/.test(txt(await q.textContent('#file-attente'))), 'gestion : la file doit contenir la cliente inscrite en ligne');
    await q.click('[data-act=att-ajout]');
    ok((await q.$$eval('#g-svc option', (o) => o.map((x) => x.value))).includes('v1'), 'gestion : le soin complet doit être proposé');
    await q.selectOption('#g-svc', 'v1'); await q.fill('#g-nom', 'Lamia Test'); await q.fill('#g-tel', '06 00 00 00 11'); await q.click('#f-attg button[type=submit]');
    const file = await q.$$eval('#file-attente .file-i', (l) => l.map((x) => ({ rang: x.querySelector('.rang').textContent, texte: x.textContent })));
    ok(file.length === 2 && /Sara Test/.test(file[0].texte) && /Lamia Test/.test(file[1].texte) && file[1].rang === '2', 'gestion : ordre d’arrivée de la file : ' + JSON.stringify(file.map((f) => f.rang)));
    // une annulation propose le créneau à la première personne
    await q.click('[data-gs=planning]'); await q.fill('#g-date', D); await q.dispatchEvent('#g-date', 'change');
    const nbProp0 = (await q.$$('.g-plan .rv.st-propose')).length;
    await q.click('.g-plan .g-col[data-prac=sa] .rv.st-confirme >> nth=0');
    const nomAnnule = txt(await q.textContent('#dlg-titre'));
    await q.click('#dlg .stbtn.st-annule');
    ok(/Créneau proposé à Sara Test/.test(txt(await q.textContent('#dlg-msg'))), 'annulation : le créneau doit être proposé à la première personne (Sara Test) : ' + txt(await q.textContent('#dlg-msg')));
    await q.keyboard.press('Escape');
    ok((await q.$$('.g-plan .rv.st-propose')).length === nbProp0 + 1 && /Proposé/.test(txt(await q.textContent('.g-plan .rv.st-propose'))), 'planning : la place proposée doit apparaître dans la grille');
    await q.click('[data-gs=attente]');
    const etats = await q.$$eval('#file-attente .file-i', (l) => l.map((x) => x.querySelector('.chip').textContent));
    ok(etats[0] === 'Place proposée' && etats[1] === 'En attente', 'file : Sara doit être sollicitée, Lamia attendre : ' + etats.join(','));
    // côté client : bandeau, pastille, acceptation
    await q.click('#onglet-client');
    ok(/Une place s’est libérée/.test(txt(await q.textContent('#bandeau-offre'))) && txt(await q.textContent('#nb-mes')) === '1', 'client : la proposition doit être signalée (bandeau et pastille)');
    await q.click('#bandeau-offre [data-act=vers-mes]');
    const offre = txt(await q.textContent('#liste-attente'));
    ok(/Place proposée/.test(offre) && /Acompte simulé à régler : 80 MAD/.test(offre) && /Accepter et régler l’acompte \(simulé\)/.test(offre), 'client : offre incomplète : ' + offre.slice(0, 300));
    await q.click('[data-act=att-oui]');
    ok(/Place acceptée/.test(txt(await q.textContent('#msg-mes'))) && (await q.$$('.rv-carte:not(.attente)')).length === 1 && /Acompte de 80 MAD réglé \(simulé\)/.test(txt(await q.textContent('.rv-carte:not(.attente)'))), 'client : acceptation non reportée dans les rendez-vous');
    ok((await q.$$('#bandeau-offre .offre-bandeau')).length === 0, 'client : le bandeau doit disparaître après acceptation');
    await gestionJour(q, D);
    ok((await q.$$('.g-plan .rv.st-propose')).length === nbProp0 && (await q.$$('.g-plan .rv.en-ligne')).length === 1, 'gestion : la place acceptée doit devenir un rendez-vous en ligne');
    // deuxième annulation : la suivante (Lamia) est sollicitée ; sans réponse, plus personne
    await q.click('.g-plan .g-col[data-prac=sa] .rv.st-confirme >> nth=0'); await q.click('#dlg .stbtn.st-annule');
    ok(/Créneau proposé à Lamia Test/.test(txt(await q.textContent('#dlg-msg'))), 'deuxième annulation : la place doit aller à la suivante');
    await q.keyboard.press('Escape');
    await q.click('.g-plan .rv.st-propose'); ok(/Place proposée/.test(txt(await q.textContent('#dlg'))) && /Rang à l’inscription/.test(txt(await q.textContent('#dlg'))), 'gestion : détail d’une place proposée');
    await q.click('[data-d=att-non]');
    ok((await q.$$('.g-plan .rv.st-propose')).length === 0, 'sans réponse : la place mise de côté doit être libérée');
    await q.click('[data-gs=attente]'); await q.fill('#att-date', D); await q.dispatchEvent('#att-date', 'change');
    const fin = await q.$$eval('#file-attente .chip', (l) => l.map((x) => x.textContent));
    ok(fin.join() === 'Acceptée,Sans réponse', 'file finale : ' + fin.join());
    ok(!e.erreurs.length && [...e.methodes].every((m) => m === 'GET'), 'liste d’attente : erreurs ou requête non GET');
    await c.close();
  }

  /* --- déplacement d’un rendez-vous : souris, clavier, formulaire, sans chevauchement --- */
  console.log('Déplacement des rendez-vous');
  {
    const c = await contexteFixe(1440, 2400);
    const { q, e } = await ouvrirApp(c);
    const K = jourDeplace.k, A = nouveauMoteur();
    await gestionJour(q, K);
    ok(chevauchements(await positions(q)) === 0, 'planning de départ : aucun chevauchement attendu');
    await ajouterManuel(q, { k: K, prac: 'sa', service: 'm1', debut: jourDeplace.s, nom: 'Cliente Glisse' });
    const sel = '.g-plan .rv:has-text("Cliente Glisse")';
    const id = await q.$eval(sel, (b) => b.dataset.id);
    const topDe = async () => parseFloat(await q.$eval(`.g-plan .rv[data-id="${id}"]`, (b) => b.style.top));
    const colDe = async () => q.$eval(`.g-plan .rv[data-id="${id}"]`, (b) => b.closest('.g-col').dataset.prac);
    ok(debutDe(`top:${await topDe()}px`) === jourDeplace.s, 'ajout manuel : position de départ');
    // 1. clavier : Maj + flèche bas = 30 minutes plus tard
    await q.focus(sel);
    await q.keyboard.press('Shift+ArrowDown');
    ok(Math.abs((await topDe()) - (jourDeplace.s + 30 - 540) * 1.2) < 0.5 && /déplacé/.test(txt(await q.textContent('#g-msg'))), 'clavier : Maj+flèche bas doit déplacer de 30 min : ' + txt(await q.textContent('#g-msg')));
    ok(await q.$eval(`.g-plan .rv[data-id="${id}"]`, (b) => b === document.activeElement), 'clavier : le focus doit rester sur le rendez-vous déplacé');
    ok(/Aucun chevauchement/.test(txt(await q.textContent('#g-msg'))) && await q.$eval('#g-msg', (m) => !m.classList.contains('err')), 'clavier : succès annoncé');
    await q.keyboard.press('Shift+ArrowUp');
    ok(Math.abs((await topDe()) - (jourDeplace.s - 540) * 1.2) < 0.5, 'clavier : Maj+flèche haut doit revenir');
    // clavier : colonne voisine (Inès ne fait pas ce soin) → refus expliqué, rien ne bouge
    await q.keyboard.press('Shift+ArrowRight');
    ok(/Déplacement impossible/.test(txt(await q.textContent('#g-msg'))) && await q.$eval('#g-msg', (m) => m.classList.contains('err')) && (await colDe()) === 'sa', 'clavier : colonne interdite : ' + txt(await q.textContent('#g-msg')));
    // clavier : descendre jusqu’au refus
    let refus = false;
    for (let i = 0; i < 24 && !refus; i++) { await q.keyboard.press('Shift+ArrowDown'); refus = /Déplacement impossible/.test(txt(await q.textContent('#g-msg'))); }
    ok(refus, 'clavier : le déplacement doit finir par être refusé (occupation, pause ou fermeture)');
    ok(/Chevauche|pause|horaires|déjà/.test(txt(await q.textContent('#g-msg'))), 'clavier : motif du refus absent : ' + txt(await q.textContent('#g-msg')));
    ok(chevauchements(await positions(q)) === 0, 'clavier : aucun chevauchement après la série de déplacements');
    // 2. souris : vers un créneau libre, pendant le glissement la cible est indiquée
    const libresSa = A.debutsPrac('sa', K, 30, 0), cur = debutDe(`top:${await topDe()}px`);
    const tLibre = libresSa.filter((t) => t !== cur && Math.abs(t - cur) >= 60)[0];
    async function glisser(vers, { prac = null, lacher = true } = {}) {
      // Le glissement précédent doit être terminé côté page : WebKit peut traiter le relâchement après que Playwright a rendu la main,
      // et le rendez-vous garde alors son décalage (transform) : sa position mesurée serait fausse.
      await q.waitForFunction(() => !document.body.classList.contains('glisse-en-cours') && !document.querySelector('.g-plan .rv.glisse'));
      // Après un dépôt refusé, une transition ramène le rendez-vous à sa place : on mesure une fois toutes ses animations terminées.
      await q.evaluate((i) => Promise.all(document.querySelector(`.g-plan .rv[data-id="${i}"]`).getAnimations().map((a) => a.finished)), id);
      // Comme une personne : le rendez-vous et sa destination doivent être à l'écran. Un moteur peut simuler une souris hors de la fenêtre (Chromium), un autre non (WebKit).
      const cur0 = debutDe(`top:${await topDe()}px`);
      await q.evaluate(([i, d]) => { const r = document.querySelector(`.g-plan .rv[data-id="${i}"]`).getBoundingClientRect(), haut = Math.min(r.top, r.top + d), bas = Math.max(r.bottom, r.bottom + d); scrollBy({ top: (haut + bas) / 2 - innerHeight / 2, behavior: 'instant' }); }, [id, (vers - cur0) * 1.2]);
      const b = await (await q.$(`.g-plan .rv[data-id="${id}"]`)).boundingBox();
      const colCible = prac ? await (await q.$(`.g-plan .g-col[data-prac=${prac}]`)).boundingBox() : null;
      const x0 = b.x + b.width / 2, y0 = b.y + Math.min(10, b.height / 2);
      const x1 = colCible ? colCible.x + colCible.width / 2 : x0, y1 = y0 + (vers - cur0) * 1.2;
      const vue = q.viewportSize();
      if ([y0, y1].some((y) => y < 0 || y > vue.height) || [x0, x1].some((x) => x < 0 || x > vue.width)) throw new Error(`glisser : coordonnées hors de la fenêtre (${Math.round(x0)},${Math.round(y0)} → ${Math.round(x1)},${Math.round(y1)})`);
      await q.mouse.move(x0, y0); await q.mouse.down(); await q.mouse.move(x1, y1, { steps: 14 });
      await q.mouse.move(x1, y1 + 1); await q.waitForSelector('.cible', { timeout: 3000 }).catch(() => {});
      const cible = await q.$eval('.cible', (c) => ({ cls: c.className, txt: c.textContent })).catch(() => null);
      if (lacher) { await q.mouse.up(); await q.waitForFunction(() => !document.body.classList.contains('glisse-en-cours')); }
      return cible;
    }
    const ci = await glisser(tLibre);
    ok(ci && /ok/.test(ci.cls) && ci.txt.includes(hhmm(tLibre)), 'souris : la cible valide doit être indiquée pendant le glissement : ' + JSON.stringify(ci));
    ok(Math.abs((await topDe()) - (tLibre - 540) * 1.2) < 0.5 && /déplacé/.test(txt(await q.textContent('#g-msg'))), `souris : rendez-vous non déplacé en ${hhmm(tLibre)}`);
    ok(!(await q.$('#dlg[open]')), 'souris : un glisser-déposer ne doit pas ouvrir le détail');
    ok(chevauchements(await positions(q)) === 0, 'souris : chevauchement après déplacement');
    // souris : dépôt sur un rendez-vous existant → refus, position inchangée
    const occ = A.jour(K).rdvs.filter((x) => x.prac === 'sa' && x.statut !== 'annule')[0], avantTop = await topDe();
    const cr = await glisser(occ.debut, { lacher: false });
    ok(cr && /ko/.test(cr.cls) && /Chevauche/.test(cr.txt), 'souris : la cible invalide doit être signalée : ' + JSON.stringify(cr));
    await q.mouse.up();
    ok(Math.abs((await topDe()) - avantTop) < 0.5 && /Déplacement impossible : Chevauche/.test(txt(await q.textContent('#g-msg'))), 'souris : dépôt sur un rendez-vous : position inchangée et refus expliqué');
    ok(chevauchements(await positions(q)) === 0, 'souris : chevauchement après dépôt refusé');
    // souris : Échap pendant le glissement annule
    const topAvEsc = await topDe(); await glisser(tLibre + 90 > 1000 ? tLibre - 90 : tLibre + 90, { lacher: false }); await q.keyboard.press('Escape'); await q.mouse.up();
    ok(Math.abs((await topDe()) - topAvEsc) < 0.5 && /annulé/.test(txt(await q.textContent('#g-msg'))), 'souris : Échap doit annuler le glissement');
    ok(await q.locator('dialog[open]').count() === 0, 'souris : le relâchement après Échap ne doit ouvrir aucune fenêtre');
    // souris : vers une autre praticienne (Hanane), si elle est libre
    const libresHa = A.debutsPrac('ha', K, 30, 0), tHa = libresHa[Math.min(3, libresHa.length - 1)];
    await glisser(tHa, { prac: 'ha' });
    ok((await colDe()) === 'ha' && Math.abs((await topDe()) - (tHa - 540) * 1.2) < 0.5, 'souris : déplacement vers Hanane');
    ok(chevauchements(await positions(q)) === 0, 'souris : chevauchement après changement de praticienne');
    // 3. formulaire : « Déplacer… » (tactile, lecteur d’écran)
    await q.click(`.g-plan .rv[data-id="${id}"]`);
    await q.click('[data-d=deplacer]');
    const heures = await q.$$eval('#d-heure option', (o) => o.map((x) => +x.value).filter(Boolean));
    ok(heures.length > 0 && heures.every((t) => A.libre('ha', K, t, t + 30) || t === tHa), 'formulaire : seuls des créneaux libres sont proposés');
    const nouvelle = heures.find((t) => t !== tHa);
    await q.selectOption('#d-heure', String(nouvelle)); await q.click('#f-dep button[type=submit]');
    ok(!(await q.$eval('#dlg', (d) => d.open)) && Math.abs((await topDe()) - (nouvelle - 540) * 1.2) < 0.5, 'formulaire : le rendez-vous doit changer de créneau');
    await q.click(`.g-plan .rv[data-id="${id}"]`);
    ok(/Déplacé/.test(txt(await q.textContent('#dlg'))) && /depuis le/.test(txt(await q.textContent('#dlg'))), 'détail : l’ancien créneau doit être rappelé');
    await q.keyboard.press('Escape');
    ok(chevauchements(await positions(q)) === 0, 'formulaire : chevauchement');
    // statistiques : déplacements comptés
    await q.click('[data-gs=semaine]'); ok(nombre(await q.textContent('[data-s=deplaces]')) >= 1, 'semaine : les rendez-vous déplacés doivent être comptés');
    ok(!e.erreurs.length && [...e.methodes].every((m) => m === 'GET'), 'déplacement : erreurs de console ou requête non GET ' + e.erreurs.join('|'));
    await c.close();
  }

  /* --- rappels simulés --- */
  console.log('Rappels simulés');
  {
    const c = await contexteFixe();
    const { q, e } = await ouvrirApp(c);
    const K = jourDeplace.k, A = nouveauMoteur();
    await gestionJour(q, K);
    await ajouterManuel(q, { k: K, prac: 'ha', service: 'm1', debut: jourDeplace.s, nom: 'Cliente Rappel' });
    const id = await q.$eval('.g-plan .rv:has-text("Cliente Rappel")', (b) => b.dataset.id);
    await q.click('[data-gs=rappels]'); await q.fill('#rap-date', K); await q.dispatchEvent('#rap-date', 'change');
    const ligne = `.rap[data-id="${id}"]`;
    ok(!!(await q.$(ligne)) && /Planifié/.test(txt(await q.textContent(ligne))) && /Rappel prévu le .* à 18:00 · SMS simulé/.test(txt(await q.textContent(ligne))), 'rappels : rendez-vous ajouté absent de la liste ou non planifié : ' + txt(await q.textContent('#rappels')).slice(0, 200));
    ok(/Aucun SMS, aucun e-mail, aucune requête/.test(txt(await q.textContent('#vue-gestion'))) || /aucun SMS, aucun e-mail/i.test(txt(await q.textContent('#vue-gestion'))), 'rappels : l’absence d’envoi doit être affichée');
    const n0 = (await q.$$('.rap')).length, req0 = e.n;
    const resume0 = txt(await q.textContent('#rap-resume'));
    await q.click(`${ligne} [data-act=rap-un]`);
    ok(/Envoi simulé/.test(txt(await q.textContent(ligne))) && !(await q.$(`${ligne} [data-act=rap-un]`)), 'rappels : l’envoi simulé doit changer l’état de la ligne');
    ok(txt(await q.textContent('#rap-resume')) !== resume0 && /1 envoi simulé/.test(txt(await q.textContent('#rap-resume'))), 'rappels : le résumé doit être recalculé');
    ok(e.n === req0, 'rappels : « simuler l’envoi » ne doit émettre aucune requête (' + (e.n - req0) + ')');
    await q.click('[data-act=rap-tous]');
    ok((await q.$$('.rap[data-etat=simule]')).length === n0 && (await q.$$('.rap:not([data-etat=simule])')).length === 0 && e.n === req0, 'rappels : « simuler tout » : toutes les lignes en envoi simulé, sans requête');
    // un déplacement recalcule la liste
    const jours = [1, 2, 3].map((n) => NF.plus(K, n)).filter((k) => NF.horaire(k).ouvert && A.travaille('ha', k) && A.debutsPrac('ha', k, 30, 0).length);
    const K2 = jours[0], h2 = A.debutsPrac('ha', K2, 30, 0)[0];
    await q.click('[data-gs=planning]'); await q.click(`.g-plan .rv[data-id="${id}"]`); await q.click('[data-d=deplacer]');
    await q.fill('#d-date', K2); await q.dispatchEvent('#d-date', 'change'); await q.selectOption('#d-prac', 'ha'); await q.selectOption('#d-heure', String(h2)); await q.click('#f-dep button[type=submit]');
    await q.click('[data-gs=rappels]'); await q.fill('#rap-date', K); await q.dispatchEvent('#rap-date', 'change');
    ok(!(await q.$(ligne)), 'rappels : le rendez-vous déplacé ne doit plus figurer à l’ancienne date');
    await q.fill('#rap-date', K2); await q.dispatchEvent('#rap-date', 'change');
    ok(!!(await q.$(ligne)) && /Planifié/.test(txt(await q.textContent(ligne))) && /Rappel prévu/.test(txt(await q.textContent(ligne))) && /déplacé/.test(txt(await q.textContent(ligne))), 'rappels : le rendez-vous déplacé doit apparaître à la nouvelle date, de nouveau planifié');
    // une annulation retire le rappel
    await q.click('[data-gs=planning]'); await q.fill('#g-date', K2); await q.dispatchEvent('#g-date', 'change'); await q.click(`.g-plan .rv[data-id="${id}"]`); await q.click('#dlg .stbtn.st-annule'); await q.keyboard.press('Escape');
    await q.click('[data-gs=rappels]'); ok(!(await q.$(ligne)), 'rappels : un rendez-vous annulé ne doit plus avoir de rappel');
    ok(!e.erreurs.length && [...e.methodes].every((m) => m === 'GET') && [...e.hotes].every((h) => h.startsWith('localhost')), 'rappels : erreurs, requête non GET ou hôte tiers');
    await c.close();
  }

  /* --- fiches clientes --- */
  console.log('Fiches clientes');
  {
    const c = await contexteFixe();
    const { q, e } = await ouvrirApp(c);
    await q.click('#onglet-gestion'); await q.click('[data-gs=clientes]');
    const nb = (await q.$$('.carte-cl')).length; ok(nb >= 8, 'fiches : au moins huit clientes (' + nb + ')');
    await q.fill('#cl-filtre', 'salwa'); ok((await q.$$('.carte-cl')).length === 1, 'fiches : le filtre doit réduire la liste');
    await q.fill('#cl-filtre', 'zzz'); ok(/Aucune cliente ne correspond/.test(txt(await q.textContent('#cl-liste'))), 'fiches : état vide du filtre');
    await q.fill('#cl-filtre', '06 00 01 00 03'); ok(/Lina R\./.test(txt(await q.textContent('#cl-liste'))), 'fiches : recherche par téléphone');
    await q.fill('#cl-filtre', 'salwa'); await q.click('.carte-cl');
    const f0 = txt(await q.textContent('#fiche'));
    ok(/Salwa K\./.test(f0) && /agrumes/.test(txt(await q.textContent('#notes'))) && (await q.$$('#histo li')).length >= 4 && /Prochain rendez-vous/.test(f0), 'fiche : notes, historique et prochain rendez-vous attendus');
    const prochain0 = txt(await q.textContent('#prochain-rdv'));
    ok(/\d{1,2} .* à|, \d\d:\d\d/.test(prochain0), 'fiche : prochain rendez-vous daté : ' + prochain0);
    const n0 = (await q.$$('#notes li')).length;
    await q.click('[data-act=note-ajout]'); ok(/Écrivez une note/.test(txt(await q.textContent('#note-msg'))), 'fiche : note vide refusée avec message');
    await q.fill('#note-texte', 'Préfère la salle fraîche <b>test</b>'); await q.click('[data-act=note-ajout]');
    ok((await q.$$('#notes li')).length === n0 + 1 && /Préfère la salle fraîche <b>test<\/b>/.test(await q.textContent('#notes')) && (await q.$$('#notes b')).length === 0, 'fiche : la note doit s’ajouter, texte échappé');
    // déplacer le prochain rendez-vous : la fiche le reflète
    await q.click('#prochain-rdv [data-act=detail]'); await q.click('[data-d=deplacer]');
    const dateAvant = await q.inputValue('#d-date');
    let K2 = null, h2 = null;
    for (let n = 1; n < 25 && !K2; n++) { const k = NF.plus(dateAvant, n); await q.fill('#d-date', k); await q.dispatchEvent('#d-date', 'change'); const hs = await q.$$eval('#d-heure option', (o) => o.map((x) => x.value).filter(Boolean)); if (hs.length) { K2 = k; h2 = hs[0]; } }
    await q.click('#f-dep button[type=submit]');
    // retour sur la fiche
    await q.click('[data-gs=clientes]'); await q.fill('#cl-filtre', 'salwa'); await q.click('.carte-cl');
    const prochain1 = txt(await q.textContent('#prochain-rdv'));
    ok(prochain1 !== prochain0 && prochain1.includes(String(nombre(K2.slice(8)))), `fiche : le prochain rendez-vous doit refléter le déplacement (${prochain0} → ${prochain1})`);
    // une cliente en ligne obtient sa fiche
    await q.click('#onglet-client'); await choisirSoin(q, 'Visage', 'Soin éclat express'); await q.click('[data-act=suite]', { force: true });
    const j = await premierJourLibre(q); await q.click(`[data-date="${j}"]`); await q.click('.creneau >> nth=0'); await q.click('[data-act=suite]', { force: true });
    await remplirCoord(q, 'Sara Test', '06 12 34 56 78'); await q.click('[data-act=suite]', { force: true }); await avancer(q); await q.waitForSelector('#conf');
    await q.click('#onglet-gestion'); await q.click('[data-gs=clientes]'); await q.fill('#cl-filtre', 'sara');
    ok(/Sara Test/.test(txt(await q.textContent('#cl-liste'))) && /Prochain/.test(txt(await q.textContent('#cl-liste'))), 'fiche : une cliente réservant en ligne doit avoir une fiche avec prochain rendez-vous');
    await q.click('.carte-cl'); ok(/Soin éclat express/.test(txt(await q.textContent('#prochain-rdv'))) && /acompte de 80 MAD réglé/.test(txt(await q.textContent('#prochain-rdv'))), 'fiche : prochain rendez-vous et acompte de la cliente en ligne');
    // depuis un rendez-vous du planning
    await q.click('[data-gs=planning]'); await q.fill('#g-date', j); await q.dispatchEvent('#g-date', 'change'); await q.click('.g-plan .rv.en-ligne'); await q.click('[data-d=fiche]');
    ok(/Sara Test/.test(txt(await q.textContent('#fiche'))), 'détail : le bouton « Fiche cliente » doit ouvrir la fiche');
    ok(!e.erreurs.length, 'fiches : erreurs de console ' + e.erreurs.join('|'));
    await c.close();
  }

  /* --- statistiques de la semaine --- */
  console.log('Statistiques de la semaine');
  {
    const c = await contexteFixe();
    const { q, e } = await ouvrirApp(c, '?soin=v1');
    const K = NF.plus(T0F, 2);                                     // mercredi 4 novembre
    await q.click('#onglet-gestion'); await q.click('[data-gs=semaine]');
    const lire = async () => ({ rdv: nombre(await q.textContent('[data-s=rdv]')), montant: nombre(await q.textContent('[data-s=montant]')), acompte: nombre(await q.textContent('[data-s=acompte]')), taux: nombre(await q.textContent('[data-s=taux]')), options: nombre(await q.textContent('[data-s=options]')), jour: nombre(await q.textContent(`[data-j="${K}"]`)) });
    const s0 = await lire();
    ok(/Semaine du 2 au 7 novembre 2026/.test(txt(await q.textContent('#vue-gestion'))), 'semaine : titre de la semaine');
    const somme = (await q.$$eval('[data-j]', (l) => l.map((x) => +x.textContent))).reduce((a, b) => a + b, 0);
    ok(somme === s0.rdv, `semaine : le total (${s0.rdv}) doit être la somme des jours (${somme})`);
    await q.click('#onglet-client');
    await q.click('label.cat:has-text("Visage")'); await q.click('label.svc:has-text("Soin hydratation profonde")'); await q.check('input[name=opt][value=o1]', { force: true });
    await q.click('[data-act=suite]', { force: true }); await q.click(`[data-date="${K}"]`); await q.click('.creneau >> nth=0'); await q.click('[data-act=suite]', { force: true });
    await remplirCoord(q); await q.click('[data-act=suite]', { force: true }); await avancer(q); await q.waitForSelector('#conf');
    await q.click('#onglet-gestion'); await q.click('[data-gs=semaine]');
    const s1 = await lire();
    ok(s1.rdv === s0.rdv + 1 && s1.montant === s0.montant + 570 && s1.acompte === s0.acompte + 180 && s1.options === s0.options + 1 && s1.jour === s0.jour + 1 && s1.taux >= s0.taux, `semaine après réservation : ${JSON.stringify(s0)} → ${JSON.stringify(s1)}`);
    // annulation depuis le client : tout revient (acompte remboursé)
    await q.click('#onglet-client'); await q.click('.sousnav [data-sous=mes]'); await q.click('[data-act=annuler]'); await q.click('[data-act=annuler-oui]');
    await q.click('#onglet-gestion'); await q.click('[data-gs=semaine]');
    const s2 = await lire(); ok(s2.rdv === s0.rdv && s2.montant === s0.montant && s2.acompte === s0.acompte && s2.options === s0.options, `semaine après annulation : ${JSON.stringify(s2)} ≠ ${JSON.stringify(s0)}`);
    ok(nombre(await q.textContent('[data-s=attente]')) === 0, 'semaine : personne en liste d’attente au départ');
    // filtre par praticienne
    await q.selectOption('#sem-prac', 'in'); const sIn = await lire(); ok(sIn.rdv < s0.rdv && sIn.rdv > 0, 'semaine : filtre par praticienne');
    // semaine suivante / précédente
    const titre0 = txt(await q.textContent('#vue-gestion .g-titre')); await q.click('[data-act=sem-suiv]'); ok(txt(await q.textContent('#vue-gestion .g-titre')) !== titre0 && /9 au 14 novembre/.test(txt(await q.textContent('#vue-gestion .g-titre'))), 'semaine : navigation');
    await q.click('[data-act=sem-auj]'); ok(txt(await q.textContent('#vue-gestion .g-titre')) === titre0, 'semaine : retour à aujourd’hui');
    ok(!e.erreurs.length, 'semaine : erreurs de console ' + e.erreurs.join('|'));
    await c.close();
  }

  /* --- téléphone : toutes les nouveautés restent complètes --- */
  console.log('Téléphone : accueil, options, attente, gestion');
  {
    const c = await contexteFixe(390, 844, true);
    const { q, e } = await ouvrirApp(c, '?soin=v2');
    const K = jourOptions.k;
    await q.tap('input[name=opt][value=o1] >> xpath=..', { force: true });
    ok(txt(await q.textContent('#opt-total')).includes('1 h 15 · 570 MAD'), 'mobile : option non appliquée au toucher');
    const cibles = await q.$$eval('label.optc, label.cat, .recap-actions .btn', (l) => l.filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getBoundingClientRect().height));
    ok(Math.min(...cibles) >= 44, 'mobile : cibles tactiles des options < 44 px (' + Math.min(...cibles) + ')');
    ok(await q.$eval('.recap-acompte', (r) => getComputedStyle(r).display === 'none'), 'mobile : l’acompte détaillé est dans le récapitulatif final');
    // le jour complet dépend du soin : l’attente se teste avec le soin éclat express
    await q.goto(APP + '?soin=v1'); await q.waitForSelector('#etape .etape-titre'); await q.tap('[data-act=suite]', { force: true }); await versMois(q, jourComplet); await q.tap(`[data-date="${jourComplet}"]`);
    ok(await q.isVisible('#attente-box'), 'mobile : panneau de liste d’attente');
    await q.tap('[data-act=att-ouvrir]'); await q.fill('#w-nom', 'Sara Test'); await q.fill('#w-tel', '06 00 00 00 00'); await q.tap('#f-att button[type=submit]');
    ok(/n° 1/.test(txt(await q.textContent('#toast'))), 'mobile : inscription en liste d’attente');
    // gestion : sections sans débordement, cibles tactiles, déplacement par formulaire
    await q.tap('#onglet-gestion'); await q.waitForSelector('[data-gs]');
    const larg = async (nom) => { const r = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth })); ok(r.sw <= 390 && r.bw <= 390, `mobile : défilement horizontal sur « ${nom} » (${r.sw})`); };
    for (const s of ['attente', 'clientes', 'rappels', 'semaine', 'planning']) {
      await q.tap(`[data-gs=${s}]`); await q.waitForSelector('.g-corps-s'); await larg(s);
      const t = await q.$$eval('#vue-gestion button, #vue-gestion .pilule, #vue-gestion input:not([type=radio]), #vue-gestion select', (l) => l.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((x) => Math.round(x.getBoundingClientRect().height)));
      if (Math.min(...t) < 44) console.log('  petits :', JSON.stringify(await q.$$eval('#vue-gestion button, #vue-gestion .pilule, #vue-gestion input:not([type=radio]), #vue-gestion select', (l) => l.filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((x) => x.outerHTML.slice(0, 120)))));
      ok(Math.min(...t) >= 44, `mobile : cible < 44 px sur « ${s} » (${Math.min(...t)})`);
    }
    await q.tap('[data-gs=clientes]'); await q.tap('.carte-cl >> nth=0'); await larg('fiche'); ok(await q.isVisible('#notes') && await q.isVisible('#histo') && await q.isVisible('#prochain-rdv'), 'mobile : fiche complète');
    await q.tap('[data-gs=planning]'); await q.fill('#g-date', jourDeplace.k); await q.dispatchEvent('#g-date', 'change');
    ok(await q.$eval('.g-plan', (g) => getComputedStyle(g).display) === 'none', 'mobile : liste à la place de la grille');
    const rdvMob = await q.$('.g-liste .li.rv.st-confirme >> nth=0'); await rdvMob.tap(); await q.tap('[data-d=deplacer]');
    const hs = await q.$$eval('#d-heure option', (o) => o.map((x) => x.value).filter(Boolean)); ok(hs.length > 0, 'mobile : formulaire de déplacement sans créneau');
    await q.selectOption('#d-heure', hs[hs.length - 1]); await q.tap('#f-dep button[type=submit]');
    ok(!(await q.$eval('#dlg', (d) => d.open)) && /déplacé/.test(txt(await q.textContent('#g-msg'))), 'mobile : déplacement par formulaire');
    await larg('planning après déplacement');
    ok(!e.erreurs.length, 'mobile : erreurs de console ' + e.erreurs.join('|'));
    await c.close();
  }

  // poids
  const taille = (fl) => fl.reduce((s, f) => s + fs.statSync(path.join(dossierDemo, f)).size, 0);
  const poidsApp = taille(['reserver/index.html', 'reservation.css', 'reservation.js', 'moteur.js']), poidsAccueil = taille(['index.html', 'accueil.css']);
  console.log(`  poids : application ${poidsApp} octets, accueil ${poidsAccueil} octets`);
  console.log("  (limite de poids supprimée par la correction V3.1 du 02/11 : code publié lisible, non compacté)");
  
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
