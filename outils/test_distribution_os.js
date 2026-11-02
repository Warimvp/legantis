// Règles métier de la démonstration Distribution OS (site/realisations/demos/distribution-os/moteur.js) : génération, commandes, stock, statuts,
// paiements, relances, droits par rôle, indicateurs, filtres, CSV, rejeu de session. Sans navigateur.
//     node --test outils/test_distribution_os.js
// Chaque test échoue si la règle disparaît ; le dernier mélange 400 actions au hasard (graine fixe) et vérifie qu'aucun invariant ne casse.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const D = require(path.join(__dirname, '..', 'site', 'realisations', 'demos', 'distribution-os', 'moteur.js'));

const REF = '2026-11-02';   // un lundi
const ctx = (s, role = 'direction', h = '11:00') => ({ jour: s.jour, heure: h, role, par: D.ROLES[role] ? D.ROLES[role].personne : 'Test', session: true });
const neuf = () => D.generer(REF);
const ok = (r) => { assert.equal(r.ok, true, r.erreur && r.erreur.message); return r.resultat; };
const refuse = (r, code) => { assert.equal(r.ok, false, 'action acceptée à tort'); if (code) assert.equal(r.erreur.code, code, r.erreur.message); return r.erreur; };
const produitDispo = (s, min) => s.produits.find(p => D.disponible(p) >= min);
const copie = (s) => JSON.stringify(s);

test('génération : déterministe, cohérente, plausible', () => {
  const a = neuf(), b = neuf();
  assert.equal(copie(a), copie(b), 'même date de référence, mêmes données');
  assert.deepEqual(D.verifierCoherence(a), []);
  assert.ok(a.commandes.length > 300 && a.commandes.length < 600, a.commandes.length + ' commandes');
  assert.equal(a.clients.length, 18); assert.equal(a.produits.length, 24);
  const k = D.kpis(a);
  assert.ok(k.enCours >= 8, 'des commandes à chaque étape');
  assert.ok(k.alertes >= 1 && k.ruptures >= 1, 'au moins une rupture pour illustrer les alertes');
  assert.ok(k.echu > 0 && k.encours > k.echu, 'un encours dont une part échue');
  for (const c of a.commandes) assert.ok(c.jour <= a.jour && c.livraisonPrevue >= c.jour, 'dates plausibles ' + c.id);
  for (const p of a.produits) assert.ok(p.stock >= 0 && p.reserve >= 0 && p.reserve <= p.stock);
  for (const iso of ['2026-11-01', '2027-02-27', '2027-06-30']) assert.deepEqual(D.verifierCoherence(D.generer(iso)), [], iso);
  assert.equal(D.iso(D.generer('2026-11-01').jour), '2026-10-31', 'dimanche : la démonstration se place au samedi');
});

test('parcours complet : commande, stock, livraison, facture, règlement, indicateurs', () => {
  const s = neuf(), p = produitDispo(s, 10), kAvant = D.kpis(s, D.derive(s));
  const stockAvant = p.stock;
  const id = ok(D.executer(s, { type: 'creer_commande', client: s.clients[0].id, lignes: [{ produit: p.id, qte: 10 }], canal: 'WhatsApp' }, ctx(s))).id;
  const cmd = D.commande(s, id);
  assert.equal(D.factureDe(s, cmd), null, 'pas de facture avant l\'expédition');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)));
  assert.equal(D.produit(s, p.id).stock, stockAvant, 'la confirmation réserve sans sortir');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'en_preparation' }, ctx(s)));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'prete' }, ctx(s)));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'expediee' }, ctx(s)));
  assert.equal(D.produit(s, p.id).stock, stockAvant - 10, 'l\'expédition sort le stock');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'livree' }, ctx(s)));
  const f = D.factureDe(s, cmd), mt = D.montants(cmd);
  assert.equal(f.numero, 'FA-' + id.replace('CMD-', ''));
  assert.equal(f.lignes.length, 1); assert.equal(f.lignes[0].total, 10 * cmd.lignes[0].prix);
  assert.equal(f.reste, mt.ttc); assert.equal(f.paye, 0);
  const kExp = D.kpis(s, D.derive(s));
  assert.equal(kExp.encours, kAvant.encours + mt.ttc, 'l\'encours monte du TTC');
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: mt.ttc + 1, mode: D.MODES_PAIEMENT[0] }, ctx(s)));
  ok(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: mt.ttc, mode: D.MODES_PAIEMENT[0] }, ctx(s)));
  const f2 = D.factureDe(s, cmd), k2 = D.kpis(s, D.derive(s));
  assert.equal(f2.reste, 0); assert.equal(f2.paye, mt.ttc);
  assert.equal(k2.encours, kAvant.encours, 'le règlement ramène l\'encours');
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('modification de commande : même borne de 90 jours qu\'à la création (revue V3.1, D1)', () => {
  const s = neuf(), p = produitDispo(s, 2);
  const id = ok(D.executer(s, { type: 'creer_commande', client: s.clients[0].id, lignes: [{ produit: p.id, qte: 1 }] }, ctx(s))).id;
  refuse(D.executer(s, { type: 'modifier_commande', id, lignes: [{ produit: p.id, qte: 1 }], livraisonPrevue: s.jour + 91 }, ctx(s)));
  ok(D.executer(s, { type: 'modifier_commande', id, lignes: [{ produit: p.id, qte: 1 }], livraisonPrevue: s.jour + 90 }, ctx(s)));
});

test('quantités : 1e3 ou 12.7 sont refusées, jamais tronquées (revue V3.1, D2)', () => {
  const s = neuf(), p = s.produits[0];
  for (const q of [Number('1e3') + 0.5, 12.7, NaN]) refuse(D.executer(s, { type: 'receptionner', lignes: [{ produit: p.id, qte: q }] }, ctx(s)));
});

test('création de commande : prix, remise, TVA et TTC cohérents', () => {
  const s = neuf();
  const cl = s.clients.find(c => c.remise === 7);
  const p1 = produitDispo(s, 10), p2 = s.produits.find(p => p !== p1 && D.disponible(p) >= 5);
  const n = s.commandes.length;
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: cl.id, lignes: [{ produit: p1.id, qte: 3 }, { produit: p2.id, qte: 2 }, { produit: p1.id, qte: 1 }] }, ctx(s)));
  const c = D.commande(s, id);
  assert.equal(s.commandes.length, n + 1);
  assert.equal(c.statut, 'nouvelle');
  assert.equal(c.lignes.length, 2, 'les lignes du même produit sont regroupées');
  assert.equal(c.lignes[0].qte, 4);
  const brut = 4 * p1.prix + 2 * p2.prix, remise = Math.round(brut * 7 / 100), ht = brut - remise, tva = Math.round(ht * 0.2);
  assert.deepEqual(D.montants(c), { brut, remise, ht, tva, ttc: ht + tva });
  assert.equal(p1.reserve, JSON.parse(copie(neuf())).produits.find(p => p.id === p1.id).reserve, 'une nouvelle commande ne réserve rien');
  assert.deepEqual(D.verifierCoherence(s), []);
  assert.ok(D.commande(s, id).session, 'commande marquée comme créée pendant la session');
});

test('création refusée : client absent, aucune ligne, quantité invalide, date passée', () => {
  const s = neuf(), avant = copie(s), p = s.produits[0].id;
  refuse(D.executer(s, { type: 'creer_commande', client: 'C99', lignes: [{ produit: p, qte: 1 }] }, ctx(s)), 'client');
  refuse(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [] }, ctx(s)), 'lignes_vides');
  for (const q of [0, -2, 1.5, NaN, '3', 10000]) refuse(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p, qte: q }] }, ctx(s)), 'quantite');
  refuse(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p, qte: 1 }], livraisonPrevue: s.jour - 1 }, ctx(s)), 'date');
  assert.equal(copie(s), avant, 'une action refusée ne modifie rien');
});

test('quantité insuffisante : la confirmation est refusée et rien n\'est réservé', () => {
  const s = neuf();
  const p = s.produits.find(x => D.disponible(x) > 0 && D.disponible(x) < 500);
  const autre = produitDispo(s, 50);
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C05', lignes: [{ produit: autre.id, qte: 2 }, { produit: p.id, qte: D.disponible(p) + 1 }] }, ctx(s)));
  const avant = copie(s);
  const e = refuse(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)), 'stock_insuffisant');
  assert.equal(e.details.manquants.length, 1);
  assert.equal(e.details.manquants[0].produit, p.id);
  assert.equal(copie(s), avant, 'aucune réservation partielle (l\'autre ligne non plus)');
  assert.equal(D.commande(s, id).statut, 'nouvelle');
  assert.equal(D.kpis(s).bloquees, D.kpis(JSON.parse(avant)).bloquees, 'la commande compte parmi les bloquées');
});

test('confirmation : réserve exactement, une seule fois', () => {
  const s = neuf(), p = produitDispo(s, 20);
  const dispo = D.disponible(p), reserve = p.reserve, stock = p.stock;
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C04', lignes: [{ produit: p.id, qte: 12 }] }, ctx(s)));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)));
  assert.equal(p.reserve, reserve + 12); assert.equal(p.stock, stock); assert.equal(D.disponible(p), dispo - 12);
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)), 'transition');
  assert.equal(p.reserve, reserve + 12, 'pas de double réservation');
  const mv = s.mouvements.filter(m => m.origine.ref === id);
  assert.equal(mv.length, 1); assert.equal(mv[0].type, 'reservation');
  assert.deepEqual(D.verifierCoherence(s), []);
  refuse(D.executer(s, { type: 'modifier_commande', id, lignes: [{ produit: p.id, qte: 1 }] }, ctx(s)), 'statut');
});

test('deux commandes ne réservent pas le même stock deux fois', () => {
  const s = neuf(), p = produitDispo(s, 4), d = D.disponible(p);
  const a = ok(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p.id, qte: d }] }, ctx(s))).id;
  const b = ok(D.executer(s, { type: 'creer_commande', client: 'C02', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s))).id;
  ok(D.executer(s, { type: 'changer_statut', id: a, vers: 'confirmee' }, ctx(s)));
  assert.equal(D.disponible(p), 0);
  refuse(D.executer(s, { type: 'changer_statut', id: b, vers: 'confirmee' }, ctx(s)), 'stock_insuffisant');
  assert.equal(D.niveauStock(p), 'rupture');
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('cycle complet : préparation, expédition (sortie de stock), livraison', () => {
  const s = neuf(), p = produitDispo(s, 10);
  const stock = p.stock, reserve = p.reserve;
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C10', lignes: [{ produit: p.id, qte: 5 }] }, ctx(s)));
  for (const vers of ['confirmee', 'en_preparation', 'prete']) ok(D.executer(s, { type: 'changer_statut', id, vers }, ctx(s)));
  const c = D.commande(s, id);
  assert.ok(c.preparateur, 'un responsable de préparation est affecté');
  assert.equal(p.stock, stock); assert.equal(p.reserve, reserve + 5);
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'expediee' }, ctx(s)));
  assert.equal(p.stock, stock - 5, 'l\'expédition sort le stock'); assert.equal(p.reserve, reserve, 'et consomme la réservation');
  assert.equal(c.echeance, s.jour + D.client(s, 'C10').delai);
  assert.equal(D.resteDu(s, c), D.montants(c).ttc);
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'livree' }, ctx(s)));
  assert.equal(p.stock, stock - 5, 'la livraison ne touche plus au stock');
  assert.deepEqual(c.historique.map(h => h.statut), ['nouvelle', 'confirmee', 'en_preparation', 'prete', 'expediee', 'livree']);
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'annulee', motif: 'Doublon' }, ctx(s)), 'transition');
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('transitions interdites : pas de saut d\'étape', () => {
  const s = neuf(), p = produitDispo(s, 3);
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C03', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s)));
  for (const vers of ['en_preparation', 'prete', 'expediee', 'livree', 'nouvelle', 'inconnu']) refuse(D.executer(s, { type: 'changer_statut', id, vers }, ctx(s)), 'transition');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)));
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'expediee' }, ctx(s)), 'transition');
});

test('annulation : motif obligatoire, réservation libérée, stock intact', () => {
  const s = neuf(), p = produitDispo(s, 10);
  const stock = p.stock, reserve = p.reserve;
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C06', lignes: [{ produit: p.id, qte: 7 }] }, ctx(s)));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s)));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'en_preparation' }, ctx(s)));
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'annulee' }, ctx(s)), 'motif');
  const r = ok(D.executer(s, { type: 'changer_statut', id, vers: 'annulee', motif: 'Demande du client' }, ctx(s)));
  assert.equal(r.libere, true);
  assert.equal(p.reserve, reserve, 'réservation libérée'); assert.equal(p.stock, stock, 'stock physique intact');
  const types = s.mouvements.filter(m => m.origine.ref === id).map(m => m.type);
  assert.deepEqual(types, ['reservation', 'liberation']);
  assert.deepEqual(D.verifierCoherence(s), []);
  // une nouvelle commande annulée ne crée aucun mouvement
  const b = ok(D.executer(s, { type: 'creer_commande', client: 'C06', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s))).id;
  assert.equal(ok(D.executer(s, { type: 'changer_statut', id: b, vers: 'annulee', motif: 'Erreur de saisie' }, ctx(s))).libere, false);
  assert.equal(s.mouvements.filter(m => m.origine.ref === b).length, 0);
});

test('stock : réception et inventaire tracés, jamais sous les réservations', () => {
  const s = neuf(), p = s.produits.find(x => D.niveauStock(x) === 'rupture');
  assert.ok(p, 'un produit en rupture au départ');
  const r = ok(D.executer(s, { type: 'receptionner', lignes: [{ produit: p.id, qte: 40 }] }, ctx(s, 'magasinier')));
  assert.equal(D.disponible(p), 40 - p.reserve + (p.stock - 40));
  const mv = s.mouvements[s.mouvements.length - 1];
  assert.deepEqual([mv.type, mv.qte, mv.origine.type, mv.origine.ref], ['entree', 40, 'reception', r.id]);
  const q = s.produits.find(x => x.reserve > 0);
  refuse(D.executer(s, { type: 'ajuster_stock', produit: q.id, compte: q.reserve - 1, motif: 'Casse' }, ctx(s)), 'sous_reserve');
  refuse(D.executer(s, { type: 'ajuster_stock', produit: q.id, compte: q.stock, motif: 'Contrôle' }, ctx(s)), 'aucun_ecart');
  refuse(D.executer(s, { type: 'ajuster_stock', produit: q.id, compte: q.stock - 1, motif: '  ' }, ctx(s)), 'motif');
  refuse(D.executer(s, { type: 'ajuster_stock', produit: q.id, compte: -1, motif: 'x' }, ctx(s)), 'compte');
  ok(D.executer(s, { type: 'ajuster_stock', produit: q.id, compte: q.reserve, motif: 'Casse constatée' }, ctx(s)));
  assert.equal(D.disponible(q), 0);
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('paiements : seulement après expédition, jamais au-delà du reste dû', () => {
  const s = neuf(), p = produitDispo(s, 5);
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C02', lignes: [{ produit: p.id, qte: 3 }] }, ctx(s)));
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: 100, mode: 'Virement' }, ctx(s)), 'statut');
  for (const vers of ['confirmee', 'en_preparation', 'prete', 'expediee']) ok(D.executer(s, { type: 'changer_statut', id, vers }, ctx(s)));
  const c = D.commande(s, id), ttc = D.montants(c).ttc;
  assert.equal(D.etatPaiement(s, c), 'a_echoir');
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: ttc + 1, mode: 'Virement' }, ctx(s)), 'montant');
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: 0, mode: 'Virement' }, ctx(s)), 'montant');
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: 100, mode: 'Bitcoin' }, ctx(s)), 'mode');
  const encours = D.kpis(s).encours;
  ok(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: 10000, mode: 'Chèque' }, ctx(s)));
  assert.equal(D.etatPaiement(s, c), 'partielle');
  assert.equal(D.kpis(s).encours, encours - 10000, 'l\'encours baisse du montant payé');
  assert.equal(ok(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: ttc - 10000, mode: 'Virement' }, ctx(s))).solde, true);
  assert.equal(D.etatPaiement(s, c), 'payee'); assert.equal(D.resteDu(s, c), 0);
  refuse(D.executer(s, { type: 'relancer', commande: id }, ctx(s)), 'solde');
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('relances : sur échéance passée seulement, une par jour, trois au plus', () => {
  const s = neuf();
  const D0 = D.derive(s);
  const c = s.commandes.find(x => D.reste(D0, x) > 0 && x.echeance < s.jour && s.relances.filter(r => r.commande === x.id).length === 0);
  assert.ok(c, 'une échéance dépassée sans relance au départ');
  const r1 = ok(D.executer(s, { type: 'relancer', commande: c.id, canal: 'Téléphone' }, ctx(s, 'gestionnaire')));
  assert.equal(r1.niveau, 1);
  refuse(D.executer(s, { type: 'relancer', commande: c.id }, ctx(s, 'gestionnaire')), 'deja');
  const lendemain = { ...ctx(s, 'gestionnaire'), jour: s.jour + 1 }, surlendemain = { ...lendemain, jour: s.jour + 2 }, apres = { ...lendemain, jour: s.jour + 3 };
  ok(D.executer(s, { type: 'relancer', commande: c.id }, lendemain)); ok(D.executer(s, { type: 'relancer', commande: c.id }, surlendemain));
  refuse(D.executer(s, { type: 'relancer', commande: c.id }, apres), 'maximum');
  const nonEchue = s.commandes.find(x => D.reste(D0, x) > 0 && x.echeance >= s.jour);
  refuse(D.executer(s, { type: 'relancer', commande: nonEchue.id }, ctx(s, 'gestionnaire')), 'non_echue');
});

test('rôles : chaque rôle n\'a que ses droits', () => {
  const s = neuf(), p = produitDispo(s, 5);
  refuse(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s, 'magasinier')), 'droit');
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s, 'commercial')));
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'confirmee' }, ctx(s, 'commercial')));
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'en_preparation' }, ctx(s, 'commercial')), 'droit');
  refuse(D.executer(s, { type: 'changer_statut', id, vers: 'en_preparation' }, ctx(s, 'gestionnaire')), 'droit');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'en_preparation' }, ctx(s, 'magasinier')));
  refuse(D.executer(s, { type: 'receptionner', lignes: [{ produit: p.id, qte: 1 }] }, ctx(s, 'commercial')), 'droit');
  refuse(D.executer(s, { type: 'enregistrer_paiement', commande: id, montant: 1, mode: 'Virement' }, ctx(s, 'magasinier')), 'droit');
  for (const role of Object.keys(D.ROLES)) assert.ok(D.MODULES_ROLE[role].includes('tableau') && D.MODULES_ROLE[role].includes('parametres'), role);
  assert.ok(!D.MODULES_ROLE.magasinier.includes('paiements'), 'le magasinier ne voit pas les paiements');
});

test('indicateurs : ils suivent les actions', () => {
  const s = neuf(), p = produitDispo(s, 30);
  const k0 = D.kpis(s);
  const { id } = ok(D.executer(s, { type: 'creer_commande', client: 'C01', lignes: [{ produit: p.id, qte: 20 }] }, ctx(s)));
  const ht = D.montants(D.commande(s, id)).ht, ttc = D.montants(D.commande(s, id)).ttc;
  const k1 = D.kpis(s);
  assert.equal(k1.enCours, k0.enCours + 1); assert.equal(k1.nouvelles, k0.nouvelles + 1); assert.equal(k1.ca30, k0.ca30 + ht);
  for (const vers of ['confirmee', 'en_preparation', 'prete', 'expediee']) ok(D.executer(s, { type: 'changer_statut', id, vers }, ctx(s)));
  const k2 = D.kpis(s);
  assert.equal(k2.encours, k0.encours + ttc, 'l\'expédition crée la créance');
  ok(D.executer(s, { type: 'changer_statut', id, vers: 'livree' }, ctx(s)));
  assert.equal(D.kpis(s).enCours, k0.enCours, 'une commande livrée sort des commandes en cours');
  const semaines = D.ventesParSemaine(s, D.derive(s), 12);
  assert.equal(semaines.length, 12); assert.ok(semaines[11].enCours);
  const avant = D.ventesParSemaine(JSON.parse(JSON.stringify(neuf())), D.derive(neuf()), 12);
  assert.equal(semaines[11].ht - avant[11].ht, ht, 'le graphique des ventes reprend la commande');
  const statuts = D.commandesParStatut(s);
  assert.equal(Object.values(statuts).reduce((a, b) => a + b, 0), s.commandes.length);
  const tops = D.produitsDemandes(s, s.jour - 29);
  assert.ok(tops[0].qte >= tops[tops.length - 1].qte);
});

test('recherche, filtres et tri des commandes', () => {
  const s = neuf(), Dv = D.derive(s);
  const toutes = D.filtrerCommandes(s, Dv, {});
  assert.equal(toutes.length, s.commandes.length);
  const wifaq = D.filtrerCommandes(s, Dv, { q: 'wifaq' });
  assert.ok(wifaq.length > 0 && wifaq.every(c => c.client === 'C01'));
  assert.ok(D.filtrerCommandes(s, Dv, { q: 'epicerie' }).every(c => D.client(s, c.client).nom.startsWith('Épicerie')), 'recherche sans accents');
  assert.equal(D.filtrerCommandes(s, Dv, { q: s.commandes[5].id }).length, 1);
  const livrees = D.filtrerCommandes(s, Dv, { statuts: ['livree'] });
  assert.ok(livrees.length && livrees.every(c => c.statut === 'livree'));
  const combine = D.filtrerCommandes(s, Dv, { statuts: ['livree', 'expediee'], type: 'Grossiste', periode: 30 });
  assert.ok(combine.every(c => ['livree', 'expediee'].includes(c.statut) && D.client(s, c.client).type === 'Grossiste' && c.jour > s.jour - 30));
  assert.equal(D.filtrerCommandes(s, Dv, { retard: true }).length, D.kpis(s).enRetard);
  assert.equal(D.filtrerCommandes(s, Dv, { q: 'aucun client ne porte ce nom' }).length, 0);
  const tri = D.trierCommandes(s, Dv, toutes, 'montant', 'desc');
  for (let i = 1; i < tri.length; i++) assert.ok(Dv.montants[tri[i - 1].id].ttc >= Dv.montants[tri[i].id].ttc);
  const triAsc = D.trierCommandes(s, Dv, toutes, 'client', 'asc');
  assert.ok(D.sansAccent(D.client(s, triAsc[0].client).nom) <= D.sansAccent(D.client(s, triAsc[triAsc.length - 1].client).nom));
});

test('encours : par client = somme des restes dus, segments A/B/C', () => {
  const s = neuf(), Dv = D.derive(s), k = D.kpis(s, Dv);
  const somme = Object.values(Dv.clients).reduce((t, c) => t + c.encours, 0);
  assert.equal(somme, k.encours);
  for (const c of s.clients) assert.equal(Dv.clients[c.id].encours, D.encoursClient(s, c.id), c.id);
  const segs = new Set(Object.values(Dv.clients).map(c => c.segment));
  assert.ok(segs.has('A') && segs.has('C'));
});

test('CSV : séparateur, guillemets, formules neutralisées', () => {
  const csv = D.versCSV(['a', 'b'], [['=1+1', 'x;y'], ['-12,50', 'il dit "oui"'], ['+33 6', '@SOMME']]);
  assert.ok(csv.startsWith('﻿a;b\r\n'));
  assert.ok(csv.includes('\'=1+1;"x;y"'));
  assert.ok(csv.includes('-12,50;"il dit ""oui"""'), 'un nombre négatif reste un nombre');
  assert.ok(csv.includes('\'+33 6;\'@SOMME'));
});

test('format : MAD avec espaces fines, dates françaises', () => {
  assert.equal(D.formaterMAD(123456789), '1 234 567,89 MAD');
  assert.equal(D.formaterMAD(-500), '−5,00 MAD');
  assert.equal(D.dateLongue(D.jour('2026-11-02')), 'lundi 2 novembre 2026');
  assert.equal(D.dateLongue(D.jour('2026-11-01')), 'dimanche 1er novembre 2026');
  assert.equal(D.dateCourte(D.jour('2027-01-05')), '05/01/2027');
});

test('session : le rejeu des actions redonne le même état ; une session vide = données de départ', () => {
  const s = neuf(), p = produitDispo(s, 10), actions = [];
  const jouer = (action, role = 'direction') => { const r = D.executer(s, action, ctx(s, role, '11:00')); actions.push({ action, role, h: '11:00' }); return r; };
  const { id } = ok(jouer({ type: 'creer_commande', client: 'C07', lignes: [{ produit: p.id, qte: 4 }] }));
  ok(jouer({ type: 'changer_statut', id, vers: 'confirmee' }));
  refuse(jouer({ type: 'changer_statut', id, vers: 'livree' }));
  const r = D.rejouer(REF, actions);
  assert.equal(r.refusees, 1);
  assert.equal(r.acceptees.length, 2, 'les actions acceptées sont gardées pour la session');
  assert.equal(copie(r.etat), copie(s));
  assert.equal(copie(D.rejouer(REF, []).etat), copie(neuf()), 'réinitialiser = repartir des données de départ');
});

test('fuzz : 400 actions au hasard, aucun invariant ne casse, les refus ne modifient rien', () => {
  const s = neuf();
  let graine = 7; const r = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  const choix = (l) => l[Math.floor(r() * l.length)];
  const roles = Object.keys(D.ROLES);
  let acceptees = 0;
  for (let i = 0; i < 400; i++) {
    const c = choix(s.commandes.slice(-40)), p = choix(s.produits), role = choix(roles);
    const action = choix([
      { type: 'creer_commande', client: choix(s.clients).id, lignes: [{ produit: p.id, qte: 1 + Math.floor(r() * 60) }, { produit: choix(s.produits).id, qte: 1 + Math.floor(r() * 10) }] },
      { type: 'changer_statut', id: c.id, vers: choix(D.STATUTS), motif: choix(D.MOTIFS_ANNULATION) },
      { type: 'changer_statut', id: c.id, vers: (D.TRANSITIONS[c.statut] || [])[0] },
      { type: 'enregistrer_paiement', commande: c.id, montant: 1 + Math.floor(r() * 2e6), mode: choix(D.MODES_PAIEMENT) },
      { type: 'relancer', commande: c.id },
      { type: 'receptionner', lignes: [{ produit: p.id, qte: 1 + Math.floor(r() * 50) }] },
      { type: 'ajuster_stock', produit: p.id, compte: Math.floor(r() * 200), motif: 'Inventaire tournant' }
    ]);
    const avant = copie(s);
    const res = D.executer(s, action, ctx(s, role));
    if (res.ok) acceptees++; else assert.equal(copie(s), avant, 'refus sans effet : ' + res.erreur.code);
  }
  assert.ok(acceptees > 80, acceptees + ' actions acceptées');
  assert.deepEqual(D.verifierCoherence(s), []);
});

test('le contrôle de cohérence détecte une incohérence volontaire', () => {
  const s = neuf();
  s.produits[0].reserve += 1;
  assert.ok(D.verifierCoherence(s).some(e => e.includes('réservé')));
  const t = neuf(); t.mouvements[0].origine.ref = 'INV-INEXISTANT';
  assert.ok(D.verifierCoherence(t).some(e => e.includes('sans origine')));
  const u = neuf(); const c = u.commandes.find(x => x.statut === 'livree'); c.lignes[0].qte += 1;
  assert.ok(D.verifierCoherence(u).some(e => e.includes(c.id)));
});
