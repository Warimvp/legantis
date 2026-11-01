/* Distribution OS — moteur de la démonstration (Legantis). Entreprise, clients, produits et opérations fictifs.
   Aucun accès réseau, aucune dépendance : ce fichier tourne tel quel dans le navigateur (window.DOS) et sous Node (require), pour les tests.
   Principes :
   - montants en centimes de MAD (entiers), dates en numéros de jour (jours depuis le 01/01/1970, UTC) : aucun arrondi flottant, aucun fuseau ;
   - les données de départ sont produites en rejouant 18 semaines d'activité avec les mêmes règles que les actions du visiteur
     (graine fixe : même date de référence = mêmes données). Chaque mouvement de stock a donc une origine, et les invariants tiennent par construction ;
   - chaque action valide tout AVANT de modifier quoi que ce soit : une action refusée laisse l'état intact ;
   - verifierCoherence() recalcule le stock, les réservations et les paiements depuis les pièces et signale tout écart (tests). */
(function (racine) {
  'use strict';

  var VERSION = 1;
  var TVA_PCT = 20;
  var HEURE_GENERATION = '10:30';   // les données de départ s'arrêtent à 10 h 30 le jour de référence

  /* ── Référentiels ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  var STATUTS = ['nouvelle', 'confirmee', 'en_preparation', 'prete', 'expediee', 'livree', 'annulee'];
  var FLUX = ['nouvelle', 'confirmee', 'en_preparation', 'prete', 'expediee', 'livree'];
  var LIBELLE_STATUT = { nouvelle: 'Nouvelle', confirmee: 'Confirmée', en_preparation: 'En préparation', prete: 'Prête', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée' };
  var TRANSITIONS = {
    nouvelle: ['confirmee', 'annulee'],
    confirmee: ['en_preparation', 'annulee'],
    en_preparation: ['prete', 'annulee'],
    prete: ['expediee', 'annulee'],
    expediee: ['livree'],
    livree: [],
    annulee: []
  };
  var LIBELLE_ACTION = { confirmee: 'Confirmer et réserver le stock', en_preparation: 'Lancer la préparation', prete: 'Marquer prête', expediee: 'Expédier', livree: 'Confirmer la livraison', annulee: 'Annuler la commande' };
  var RESERVANT = { confirmee: true, en_preparation: true, prete: true };
  var EN_COURS = { nouvelle: true, confirmee: true, en_preparation: true, prete: true, expediee: true };
  var FACTURE = { expediee: true, livree: true };
  var MOTIFS_ANNULATION = ['Demande du client', 'Rupture fournisseur', 'Erreur de saisie', 'Doublon'];
  var MODES_PAIEMENT = ['Virement', 'Chèque', 'Espèces', 'Effet (LCN)'];
  var CANAUX = ['Téléphone', 'WhatsApp', 'Commercial terrain', 'Comptoir', 'E-mail'];

  var ROLES = {
    direction: { libelle: 'Direction', personne: 'Samira D.', resume: 'Vue complète : chiffres, commandes, stock, encours et rapports.' },
    commercial: { libelle: 'Commercial', personne: 'Yassine A.', resume: 'Saisit et confirme les commandes, suit ses clients et leurs relances.' },
    magasinier: { libelle: 'Magasinier', personne: 'Hamid E.', resume: 'Prépare et expédie, reçoit les livraisons fournisseurs, tient le stock.' },
    gestionnaire: { libelle: 'Gestionnaire', personne: 'Nadia L.', resume: 'Suit les échéances, enregistre les paiements et prépare les relances.' }
  };
  var DROITS = {
    creer_commande: ['direction', 'commercial'],
    modifier_commande: ['direction', 'commercial'],
    confirmer: ['direction', 'commercial', 'gestionnaire'],
    preparer: ['direction', 'magasinier'],
    expedier: ['direction', 'magasinier'],
    livrer: ['direction', 'magasinier', 'gestionnaire'],
    annuler: ['direction', 'commercial', 'gestionnaire'],
    paiement: ['direction', 'gestionnaire'],
    relance: ['direction', 'gestionnaire', 'commercial'],
    reception: ['direction', 'magasinier'],
    ajustement: ['direction', 'magasinier']
  };
  var LIBELLE_DROIT = {
    creer_commande: 'Créer une commande', modifier_commande: 'Modifier une nouvelle commande', confirmer: 'Confirmer (réserver le stock)', preparer: 'Préparer',
    expedier: 'Expédier', livrer: 'Confirmer une livraison', annuler: 'Annuler une commande', paiement: 'Enregistrer un paiement', relance: 'Relancer un client',
    reception: 'Réceptionner une livraison fournisseur', ajustement: 'Corriger le stock après inventaire'
  };
  /* Modules visibles par rôle (la démonstration simule l'interface ; elle n'a pas de vraie authentification). */
  var MODULES_ROLE = {
    direction: ['tableau', 'commandes', 'clients', 'stocks', 'preparation', 'paiements', 'rapports', 'parametres'],
    commercial: ['tableau', 'commandes', 'clients', 'stocks', 'preparation', 'paiements', 'parametres'],
    magasinier: ['tableau', 'commandes', 'stocks', 'preparation', 'parametres'],
    gestionnaire: ['tableau', 'commandes', 'clients', 'paiements', 'rapports', 'parametres']
  };
  function droitPour(vers) { return { confirmee: 'confirmer', en_preparation: 'preparer', prete: 'preparer', expediee: 'expedier', livree: 'livrer', annulee: 'annuler' }[vers]; }
  function peut(role, droit) { return role === 'systeme' || (DROITS[droit] || []).indexOf(role) >= 0; }

  var EQUIPE = [
    { id: 'u-dir', nom: 'Samira D.', role: 'direction' },
    { id: 'u-com1', nom: 'Yassine A.', role: 'commercial' },
    { id: 'u-com2', nom: 'Salma R.', role: 'commercial' },
    { id: 'u-mag1', nom: 'Hamid E.', role: 'magasinier' },
    { id: 'u-mag2', nom: 'Rachid T.', role: 'magasinier' },
    { id: 'u-ges', nom: 'Nadia L.', role: 'gestionnaire' },
    { id: 'u-liv1', nom: 'Omar K.', role: 'livreur' },
    { id: 'u-liv2', nom: 'Brahim S.', role: 'livreur' }
  ];

  /* Catalogue fictif, sans marque. prix = prix de vente HT de l'unité de vente, en MAD. rot = rotation relative, f = facteur de quantité par ligne. */
  var CATALOGUE = [
    ['EPI-HUI-5L', 'Huile de table 5 L', 'Épicerie', 'carton de 4', 312, 5, 1.0, 'A-01'],
    ['EPI-SUC-1K', 'Sucre en morceaux 1 kg', 'Épicerie', 'carton de 12', 168, 5, 1.1, 'A-02'],
    ['EPI-SPN-2K', 'Sucre en pain 2 kg', 'Épicerie', 'carton de 6', 126, 3, 0.9, 'A-03'],
    ['EPI-THE-500', 'Thé vert 500 g', 'Épicerie', 'carton de 20', 540, 4, 0.5, 'A-04'],
    ['EPI-FAR-25', 'Farine de blé tendre 25 kg', 'Épicerie', 'sac', 165, 4, 1.2, 'B-01'],
    ['EPI-SEM-5K', 'Semoule fine 5 kg', 'Épicerie', 'carton de 4', 138, 3, 0.9, 'B-02'],
    ['EPI-RIZ-5K', 'Riz long 5 kg', 'Épicerie', 'carton de 4', 210, 2, 0.7, 'B-03'],
    ['EPI-PAT-500', 'Pâtes 500 g', 'Épicerie', 'carton de 20', 96, 3, 1.0, 'B-04'],
    ['EPI-TOM-400', 'Concentré de tomate 400 g', 'Épicerie', 'carton de 24', 192, 3, 0.8, 'B-05'],
    ['EPI-LEN-1K', 'Lentilles 1 kg', 'Épicerie', 'carton de 10', 175, 2, 0.6, 'C-01'],
    ['EPI-POI-1K', 'Pois chiches 1 kg', 'Épicerie', 'carton de 10', 160, 2, 0.6, 'C-02'],
    ['EPI-CAF-250', 'Café moulu 250 g', 'Épicerie', 'carton de 24', 648, 2, 0.5, 'C-03'],
    ['EPI-SAR-125', 'Sardines à l\'huile 125 g', 'Épicerie', 'carton de 50', 300, 2, 0.7, 'C-04'],
    ['EPI-BIS-48', 'Biscuits secs', 'Épicerie', 'carton de 48 paquets', 115, 3, 0.8, 'C-05'],
    ['BOI-EAU-15', 'Eau minérale 1,5 L', 'Boissons', 'pack de 6', 24, 5, 2.2, 'D-01'],
    ['BOI-LAI-1L', 'Lait UHT 1 L', 'Boissons', 'pack de 6', 51, 5, 1.8, 'D-02'],
    ['BOI-JUS-1L', 'Jus d\'orange 1 L', 'Boissons', 'carton de 12', 138, 2, 0.7, 'D-03'],
    ['BOI-GAZ-1L', 'Boisson gazeuse 1 L', 'Boissons', 'pack de 6', 45, 3, 1.4, 'D-04'],
    ['ENT-LES-3K', 'Lessive en poudre 3 kg', 'Entretien', 'carton de 4', 176, 2, 0.7, 'E-01'],
    ['ENT-VAI-1L', 'Liquide vaisselle 1 L', 'Entretien', 'carton de 12', 132, 2, 0.6, 'E-02'],
    ['ENT-JAV-1L', 'Eau de Javel 1 L', 'Entretien', 'carton de 12', 54, 2, 0.9, 'E-03'],
    ['HYG-SAV-72', 'Savon de toilette', 'Hygiène', 'carton de 72', 252, 2, 0.5, 'F-01'],
    ['HYG-PAP-12', 'Papier toilette', 'Hygiène', 'lot de 12 rouleaux', 38, 3, 1.3, 'F-02'],
    ['HYG-SHA-400', 'Shampooing 400 ml', 'Hygiène', 'carton de 12', 228, 1, 0.5, 'F-03']
  ];
  var FOURNISSEUR = { 'Épicerie': 'Agro Fournitures Démo', 'Boissons': 'Boissons Démo Import', 'Entretien': 'Hygiène Démo Industrie', 'Hygiène': 'Hygiène Démo Industrie' };
  /* Produits dont le fournisseur est en retard dans le scénario de départ : aucune réception depuis N jours (rupture et stock bas réalistes). */
  var TENSION = { 'EPI-CAF-250': 30, 'EPI-TOM-400': 13 };

  /* Clients fictifs : noms génériques, aucun client réel de Legantis. type, ville, contact (prénom + initiale), remise %, délai de paiement (jours), plafond d'encours (MAD), poids d'activité, comportement de paiement, commercial. */
  var CLIENTS = [
    ['Dépôt Al Wifaq', 'Grossiste', 'Casablanca', 'Karim B.', 7, 60, 260000, 3.4, 'ponctuel', 'u-com1'],
    ['Comptoir du Littoral', 'Grossiste', 'Mohammedia', 'Nadia E.', 6, 60, 200000, 2.6, 'variable', 'u-com1'],
    ['Grossiste Ennakhil', 'Grossiste', 'Marrakech', 'Youssef M.', 6, 60, 180000, 2.2, 'retard', 'u-com2'],
    ['Souss Distribution Démo', 'Grossiste', 'Agadir', 'Fatima Z.', 5, 45, 150000, 1.8, 'ponctuel', 'u-com2'],
    ['Supérette Les Orangers', 'Supérette', 'Rabat', 'Mehdi L.', 3, 30, 70000, 1.7, 'ponctuel', 'u-com2'],
    ['Supérette Anfa Centre', 'Supérette', 'Casablanca', 'Imane K.', 3, 30, 80000, 1.9, 'variable', 'u-com1'],
    ['Mini-marché Al Fath', 'Supérette', 'Salé', 'Hicham R.', 2, 30, 50000, 1.4, 'ponctuel', 'u-com2'],
    ['Supérette Le Panier Bleu', 'Supérette', 'Kénitra', 'Salwa O.', 2, 30, 45000, 1.2, 'retard', 'u-com2'],
    ['Supérette Atlas Express', 'Supérette', 'Tanger', 'Anas G.', 3, 30, 60000, 1.3, 'ponctuel', 'u-com1'],
    ['Épicerie Dar Salam', 'Épicerie', 'Casablanca', 'Rachida M.', 0, 0, 15000, 1.1, 'ponctuel', 'u-com1'],
    ['Épicerie Bab Doukkala', 'Épicerie', 'Marrakech', 'Khadija T.', 0, 15, 15000, 0.9, 'variable', 'u-com2'],
    ['Épicerie Al Baraka', 'Épicerie', 'Fès', 'Omar F.', 1, 15, 20000, 1.0, 'ponctuel', 'u-com2'],
    ['Épicerie du Plateau', 'Épicerie', 'Settat', 'Sanaa H.', 0, 0, 10000, 0.7, 'ponctuel', 'u-com1'],
    ['Épicerie Zitoune', 'Épicerie', 'Meknès', 'Adil N.', 1, 15, 15000, 0.8, 'retard', 'u-com2'],
    ['Café-Restaurant La Corniche', 'CHR', 'Casablanca', 'Leila S.', 3, 30, 40000, 1.2, 'ponctuel', 'u-com1'],
    ['Hôtel Riad Amandier', 'CHR', 'Marrakech', 'Hamza D.', 4, 30, 60000, 1.1, 'variable', 'u-com2'],
    ['Restaurant Jardin d\'Oasis', 'CHR', 'Agadir', 'Zineb A.', 3, 30, 35000, 0.8, 'ponctuel', 'u-com2'],
    ['Cantine Zone Industrielle', 'CHR', 'Tanger', 'Houda B.', 2, 30, 45000, 1.0, 'variable', 'u-com1']
  ];
  var TRANSIT = { Casablanca: 0, Mohammedia: 0, Rabat: 1, 'Salé': 1, 'Kénitra': 1, Settat: 1, Marrakech: 2, 'Fès': 2, 'Meknès': 2, Tanger: 2, Agadir: 2 };
  var QTE_TYPE = { Grossiste: [10, 34], 'Supérette': [3, 12], 'Épicerie': [1, 5], CHR: [2, 9] };

  /* ── Outils ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function erreur(code, message, details) { var e = new Error(message); e.metier = true; e.code = code; e.details = details || null; throw e; }
  function jour(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); if (!m) return NaN; return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5); }
  function iso(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function jourSemaine(n) { return (n + 4) % 7; }   // 0 = dimanche (le 01/01/1970 était un jeudi)
  function debutSemaine(n) { return n - ((jourSemaine(n) + 6) % 7); }   // lundi
  function debutMois(n) { var d = new Date(n * 864e5); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 864e5); }
  function ouvre(n) { return jourSemaine(n) === 0 ? n + 1 : n; }
  function heure(min) { min = Math.max(0, Math.min(23 * 60 + 59, Math.round(min))); return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
  function minutes(h) { h = String(h); return (+h.slice(0, 2)) * 60 + (+h.slice(3, 5) || 0); }
  function alea(graine) {   // mulberry32 : suite pseudo-aléatoire déterministe
    var a = graine >>> 0;
    function suivant() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    suivant.entre = function (min, max) { return min + Math.floor(suivant() * (max - min + 1)); };
    suivant.parmi = function (liste) { return liste[Math.floor(suivant() * liste.length)]; };
    suivant.pondere = function (liste, poids) { var total = 0, i; for (i = 0; i < liste.length; i++) total += poids(liste[i]); var x = suivant() * total; for (i = 0; i < liste.length; i++) { x -= poids(liste[i]); if (x < 0) return liste[i]; } return liste[liste.length - 1]; };
    return suivant;
  }
  function entierPositif(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v > 0; }

  /* ── Accès ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function produit(s, id) { for (var i = 0; i < s.produits.length; i++) if (s.produits[i].id === id) return s.produits[i]; return null; }
  function client(s, id) { for (var i = 0; i < s.clients.length; i++) if (s.clients[i].id === id) return s.clients[i]; return null; }
  function commande(s, id) {
    var idx = s._idx || (Object.defineProperty(s, '_idx', { value: {}, enumerable: false, writable: true }), s._idx);
    var c = idx[id];
    if (c && c.id === id && s.commandes[c._pos] === c) return c;
    for (var i = 0; i < s.commandes.length; i++) if (s.commandes[i].id === id) { Object.defineProperty(s.commandes[i], '_pos', { value: i, enumerable: false, writable: true, configurable: true }); idx[id] = s.commandes[i]; return s.commandes[i]; }
    return null;
  }
  function membre(id) { for (var i = 0; i < EQUIPE.length; i++) if (EQUIPE[i].id === id) return EQUIPE[i]; return null; }
  function disponible(p) { return p.stock - p.reserve; }
  function niveauStock(p) { var d = disponible(p); return d <= 0 ? 'rupture' : d <= p.seuil ? 'bas' : 'ok'; }

  /* ── Montants ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function montants(cmd) {
    var brut = 0;
    for (var i = 0; i < cmd.lignes.length; i++) brut += cmd.lignes[i].qte * cmd.lignes[i].prix;
    var remise = Math.round(brut * cmd.remise / 100);
    var ht = brut - remise;
    var tva = Math.round(ht * TVA_PCT / 100);
    return { brut: brut, remise: remise, ht: ht, tva: tva, ttc: ht + tva };
  }
  function montantLigne(l) { return l.qte * l.prix; }
  function totalPaye(s, id) { var t = 0; for (var i = 0; i < s.paiements.length; i++) if (s.paiements[i].commande === id) t += s.paiements[i].montant; return t; }
  function resteDu(s, cmd) { return FACTURE[cmd.statut] ? montants(cmd).ttc - totalPaye(s, cmd.id) : 0; }
  function etatPaiement(s, cmd, j) {
    if (!FACTURE[cmd.statut]) return cmd.statut === 'annulee' ? 'annulee' : 'a_facturer';
    var reste = resteDu(s, cmd), ttc = montants(cmd).ttc;
    if (reste <= 0) return 'payee';
    if (cmd.echeance < (j == null ? s.jour : j)) return 'echue';
    return reste < ttc ? 'partielle' : 'a_echoir';
  }
  var LIBELLE_PAIEMENT = { a_facturer: 'Non facturée', annulee: '—', payee: 'Payée', partielle: 'Partiellement payée', a_echoir: 'À échoir', echue: 'Échue' };
  function enRetard(cmd, j) { return cmd.statut !== 'livree' && cmd.statut !== 'annulee' && cmd.livraisonPrevue < j; }

  /* ── Journal et mouvements ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function noter(s, ctx, type, texte, ref) { s.journal.push({ jour: ctx.jour, h: ctx.heure, type: type, texte: texte, ref: ref || null, par: ctx.par }); }
  function mouvement(s, ctx, p, type, qte, origine) {
    if (type === 'entree') p.stock += qte;
    else if (type === 'sortie') { p.stock -= qte; p.reserve -= qte; }
    else if (type === 'reservation') p.reserve += qte;
    else if (type === 'liberation') p.reserve -= qte;
    else if (type === 'ajustement') p.stock += qte;
    s.mouvements.push({ id: 'MV-' + (s.compteurs.mouvement++), jour: ctx.jour, h: ctx.heure, produit: p.id, type: type, qte: qte, origine: origine, stock: p.stock, reserve: p.reserve, par: ctx.par });
  }
  function autoriser(ctx, droit) {
    if (!peut(ctx.role, droit)) erreur('droit', 'Action réservée : « ' + LIBELLE_DROIT[droit] + ' » n\'est pas permis au rôle ' + (ROLES[ctx.role] ? ROLES[ctx.role].libelle : ctx.role) + '.', { droit: droit, roles: DROITS[droit] });
  }
  function normaliserLignes(s, lignes) {
    if (!Array.isArray(lignes) || !lignes.length) erreur('lignes_vides', 'Ajoutez au moins un produit à la commande.');
    var vues = {}, sortie = [];
    lignes.forEach(function (l) {
      var p = produit(s, l && l.produit);
      if (!p) erreur('produit_inconnu', 'Produit inconnu.');
      if (!entierPositif(l.qte) || l.qte > 9999) erreur('quantite', 'La quantité de « ' + p.nom + ' » doit être un nombre entier entre 1 et 9 999.', { produit: p.id });
      if (vues[p.id]) { vues[p.id].qte += l.qte; if (vues[p.id].qte > 9999) erreur('quantite', 'Quantité trop élevée pour « ' + p.nom + ' ».', { produit: p.id }); }
      else { vues[p.id] = { produit: p.id, qte: l.qte }; sortie.push(vues[p.id]); }
    });
    if (sortie.length > 40) erreur('trop_de_lignes', 'Une commande compte 40 lignes au plus.');
    return sortie;
  }
  function manquants(s, lignes) {
    var m = [];
    lignes.forEach(function (l) { var p = produit(s, l.produit); var d = disponible(p); if (l.qte > d) m.push({ produit: p.id, nom: p.nom, demande: l.qte, disponible: Math.max(0, d) }); });
    return m;
  }

  /* ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  var ACTIONS = {
    creer_commande: function (s, a, ctx) {
      autoriser(ctx, 'creer_commande');
      var c = client(s, a.client);
      if (!c) erreur('client', 'Choisissez un client.');
      var lignes = normaliserLignes(s, a.lignes);
      var prevue = a.livraisonPrevue == null ? ouvre(ctx.jour + (TRANSIT[c.ville] || 0) + 3) : a.livraisonPrevue;
      if (!Number.isInteger(prevue) || prevue < ctx.jour) erreur('date', 'La date de livraison prévue ne peut pas être dans le passé.');
      if (prevue > ctx.jour + 90) erreur('date', 'La date de livraison prévue doit tomber dans les 90 jours.');
      var canal = CANAUX.indexOf(a.canal) >= 0 ? a.canal : 'Téléphone';
      var cmd = {
        id: 'CMD-' + (s.compteurs.commande++), client: c.id, jour: ctx.jour, h: ctx.heure, livraisonPrevue: prevue, statut: 'nouvelle', canal: canal,
        note: String(a.note || '').replace(/\s+/g, ' ').trim().slice(0, 200), remise: c.remise, commercial: c.commercial,
        lignes: lignes.map(function (l) { return { produit: l.produit, qte: l.qte, prix: produit(s, l.produit).prix }; }),
        historique: [{ statut: 'nouvelle', jour: ctx.jour, h: ctx.heure, par: ctx.par }],
        preparateur: null, livreur: null, expedieeLe: null, livreeLe: null, echeance: null, motif: null, session: !!ctx.session
      };
      s.commandes.push(cmd);
      noter(s, ctx, 'commande', 'Commande ' + cmd.id + ' créée pour ' + c.nom, cmd.id);
      return { id: cmd.id };
    },
    modifier_commande: function (s, a, ctx) {
      autoriser(ctx, 'modifier_commande');
      var cmd = commande(s, a.id);
      if (!cmd) erreur('commande', 'Commande introuvable.');
      if (cmd.statut !== 'nouvelle') erreur('statut', 'Seule une nouvelle commande se modifie : le stock d\'une commande confirmée est déjà réservé.');
      var lignes = normaliserLignes(s, a.lignes);
      var prevue = a.livraisonPrevue == null ? cmd.livraisonPrevue : a.livraisonPrevue;
      if (!Number.isInteger(prevue) || prevue < ctx.jour) erreur('date', 'La date de livraison prévue ne peut pas être dans le passé.');
      cmd.lignes = lignes.map(function (l) { return { produit: l.produit, qte: l.qte, prix: produit(s, l.produit).prix }; });
      cmd.livraisonPrevue = prevue;
      noter(s, ctx, 'commande', 'Commande ' + cmd.id + ' modifiée', cmd.id);
      return { id: cmd.id };
    },
    changer_statut: function (s, a, ctx) {
      var cmd = commande(s, a.id);
      if (!cmd) erreur('commande', 'Commande introuvable.');
      var de = cmd.statut, vers = a.vers;
      if (TRANSITIONS[de].indexOf(vers) < 0) erreur('transition', 'Une commande « ' + LIBELLE_STATUT[de] + ' » ne peut pas passer à « ' + (LIBELLE_STATUT[vers] || vers) + ' ».', { de: de, vers: vers });
      autoriser(ctx, droitPour(vers));
      var c = client(s, cmd.client), resultat = { id: cmd.id, de: de, vers: vers };
      /* Validation complète avant toute écriture */
      if (vers === 'confirmee') {
        var m = manquants(s, cmd.lignes);
        if (m.length) erreur('stock_insuffisant', 'Stock disponible insuffisant : ' + m.map(function (x) { return x.nom + ' (' + x.demande + ' demandé' + (x.demande > 1 ? 's' : '') + ', ' + x.disponible + ' disponible' + (x.disponible > 1 ? 's' : '') + ')'; }).join(' ; ') + '.', { manquants: m });
      }
      if (vers === 'expediee') cmd.lignes.forEach(function (l) { var p = produit(s, l.produit); if (p.reserve < l.qte || p.stock < l.qte) erreur('incoherence', 'Réservation introuvable pour « ' + p.nom + ' ».'); });
      if (vers === 'annulee' && MOTIFS_ANNULATION.indexOf(a.motif) < 0) erreur('motif', 'Choisissez le motif de l\'annulation.');
      if (vers === 'en_preparation' && a.preparateur && !(membre(a.preparateur) && membre(a.preparateur).role === 'magasinier')) erreur('responsable', 'Le responsable de préparation doit être un magasinier.');
      /* Écritures */
      var origine = { type: 'commande', ref: cmd.id };
      if (vers === 'confirmee') {
        var engage = encoursClient(s, c.id) + engageClient(s, c.id), ttc = montants(cmd).ttc;
        if (engage + ttc > c.plafond * 100) resultat.avertissement = 'Plafond d\'encours de ' + c.nom + ' dépassé après cette commande.';
        cmd.lignes.forEach(function (l) { mouvement(s, ctx, produit(s, l.produit), 'reservation', l.qte, origine); });
      } else if (vers === 'en_preparation') {
        cmd.preparateur = a.preparateur || (cmd.lignes.length % 2 ? 'u-mag1' : 'u-mag2');
      } else if (vers === 'expediee') {
        cmd.lignes.forEach(function (l) { mouvement(s, ctx, produit(s, l.produit), 'sortie', l.qte, origine); });
        cmd.expedieeLe = ctx.jour;
        cmd.echeance = ctx.jour + c.delai;
        cmd.livreur = a.livreur || (TRANSIT[c.ville] ? 'u-liv2' : 'u-liv1');
      } else if (vers === 'livree') {
        cmd.livreeLe = ctx.jour;
      } else if (vers === 'annulee') {
        if (RESERVANT[de]) cmd.lignes.forEach(function (l) { mouvement(s, ctx, produit(s, l.produit), 'liberation', l.qte, origine); });
        cmd.motif = a.motif;
        resultat.libere = !!RESERVANT[de];
      }
      cmd.statut = vers;
      cmd.historique.push({ statut: vers, jour: ctx.jour, h: ctx.heure, par: ctx.par });
      noter(s, ctx, 'statut', cmd.id + ' : ' + LIBELLE_STATUT[de] + ' → ' + LIBELLE_STATUT[vers] + (vers === 'annulee' ? ' (' + a.motif.toLowerCase() + ')' : ''), cmd.id);
      return resultat;
    },
    enregistrer_paiement: function (s, a, ctx) {
      autoriser(ctx, 'paiement');
      var cmd = commande(s, a.commande);
      if (!cmd) erreur('commande', 'Commande introuvable.');
      if (!FACTURE[cmd.statut]) erreur('statut', 'Un paiement s\'enregistre sur une commande expédiée ou livrée.');
      if (!entierPositif(a.montant)) erreur('montant', 'Indiquez un montant positif.');
      var reste = resteDu(s, cmd);
      if (a.montant > reste) erreur('montant', 'Le montant dépasse le reste dû (' + formaterMAD(reste) + ').', { reste: reste });
      if (MODES_PAIEMENT.indexOf(a.mode) < 0) erreur('mode', 'Choisissez un mode de paiement.');
      var p = { id: 'REG-' + (s.compteurs.paiement++), commande: cmd.id, client: cmd.client, jour: ctx.jour, montant: a.montant, mode: a.mode, par: ctx.par };
      s.paiements.push(p);
      noter(s, ctx, 'paiement', 'Paiement de ' + formaterMAD(a.montant) + ' enregistré sur ' + cmd.id, cmd.id);
      return { id: p.id, solde: a.montant === reste };
    },
    relancer: function (s, a, ctx) {
      autoriser(ctx, 'relance');
      var cmd = commande(s, a.commande);
      if (!cmd) erreur('commande', 'Commande introuvable.');
      if (resteDu(s, cmd) <= 0) erreur('solde', 'Cette commande est soldée : rien à relancer.');
      if (!(cmd.echeance < ctx.jour)) erreur('non_echue', 'L\'échéance n\'est pas encore passée.');
      var precedentes = s.relances.filter(function (r) { return r.commande === cmd.id; });
      if (precedentes.length >= 3) erreur('maximum', 'Trois relances déjà faites : à traiter par la direction.');
      if (precedentes.some(function (r) { return r.jour === ctx.jour; })) erreur('deja', 'Une relance a déjà été faite aujourd\'hui pour cette commande.');
      var r = { id: 'REL-' + (s.compteurs.relance++), commande: cmd.id, client: cmd.client, jour: ctx.jour, niveau: precedentes.length + 1, canal: a.canal === 'E-mail' ? 'E-mail' : a.canal === 'WhatsApp' ? 'WhatsApp' : 'Téléphone', par: ctx.par };
      s.relances.push(r);
      noter(s, ctx, 'relance', 'Relance n° ' + r.niveau + ' (' + r.canal.toLowerCase() + ') pour ' + cmd.id, cmd.id);
      return { id: r.id, niveau: r.niveau };
    },
    receptionner: function (s, a, ctx) {
      autoriser(ctx, 'reception');
      var lignes = normaliserLignes(s, a.lignes);
      var br = { id: 'BR-' + (s.compteurs.reception++), jour: ctx.jour, fournisseur: a.fournisseur || FOURNISSEUR[produit(s, lignes[0].produit).categorie], lignes: lignes, par: ctx.par };
      s.receptions.push(br);
      lignes.forEach(function (l) { mouvement(s, ctx, produit(s, l.produit), 'entree', l.qte, { type: 'reception', ref: br.id }); });
      noter(s, ctx, 'stock', 'Réception ' + br.id + ' : ' + lignes.length + ' produit' + (lignes.length > 1 ? 's' : '') + ' (' + br.fournisseur + ')', br.id);
      return { id: br.id };
    },
    ajuster_stock: function (s, a, ctx) {
      autoriser(ctx, 'ajustement');
      var p = produit(s, a.produit);
      if (!p) erreur('produit_inconnu', 'Produit inconnu.');
      if (!(typeof a.compte === 'number' && Number.isInteger(a.compte) && a.compte >= 0 && a.compte <= 99999)) erreur('compte', 'Indiquez la quantité comptée (nombre entier).');
      if (!String(a.motif || '').trim()) erreur('motif', 'Indiquez le motif de la correction.');
      if (a.compte < p.reserve) erreur('sous_reserve', 'Le stock compté (' + a.compte + ') ne peut pas être inférieur aux quantités déjà réservées (' + p.reserve + ') : annulez d\'abord les commandes concernées.', { reserve: p.reserve });
      var ecart = a.compte - p.stock;
      if (!ecart) erreur('aucun_ecart', 'Aucun écart avec le stock enregistré.');
      var inv = { id: 'INV-' + (s.compteurs.inventaire++), jour: ctx.jour, produit: p.id, ecart: ecart, motif: String(a.motif).trim().slice(0, 120), par: ctx.par };
      s.inventaires.push(inv);
      mouvement(s, ctx, p, 'ajustement', ecart, { type: 'inventaire', ref: inv.id });
      noter(s, ctx, 'stock', 'Inventaire ' + inv.id + ' : ' + p.nom + ' ' + (ecart > 0 ? '+' : '') + ecart, inv.id);
      return { id: inv.id, ecart: ecart };
    }
  };

  function muter(s, action, ctx) {
    var f = action && Object.prototype.hasOwnProperty.call(ACTIONS, action.type) ? ACTIONS[action.type] : null;
    if (!f) erreur('action', 'Action inconnue.');
    return f(s, action, ctx);
  }
  /* executer : point d'entrée de l'interface. Les actions valident avant d'écrire, l'état reste donc intact en cas de refus. */
  function executer(s, action, ctx) {
    try { return { ok: true, resultat: muter(s, action, ctx) }; }
    catch (e) { if (e && e.metier) return { ok: false, erreur: { code: e.code, message: e.message, details: e.details } }; throw e; }
  }

  /* ── Indicateurs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function encoursClient(s, idClient) {
    var t = 0;
    s.commandes.forEach(function (c) { if (c.client === idClient && FACTURE[c.statut]) t += montants(c).ttc; });
    s.paiements.forEach(function (p) { if (p.client === idClient) t -= p.montant; });
    return t;
  }
  function engageClient(s, idClient) { var t = 0; s.commandes.forEach(function (c) { if (c.client === idClient && RESERVANT[c.statut]) t += montants(c).ttc; }); return t; }

  /* derive : tables calculées une fois par version d'état, partagées par les écrans */
  function derive(s) {
    var j = s.jour, paye = {}, m = {};
    s.paiements.forEach(function (p) { paye[p.commande] = (paye[p.commande] || 0) + p.montant; });
    var parClient = {};
    s.clients.forEach(function (c) { parClient[c.id] = { commandes: [], ca90: 0, ca30: 0, encours: 0, echu: 0, engage: 0, derniere: null, nb: 0 }; });
    s.commandes.forEach(function (c) {
      var mt = montants(c); m[c.id] = mt;
      var pc = parClient[c.client]; pc.commandes.push(c);
      if (c.statut !== 'annulee') { pc.nb++; if (c.jour > j - 90) pc.ca90 += mt.ht; if (c.jour > j - 30) pc.ca30 += mt.ht; }
      if (FACTURE[c.statut]) { var r = mt.ttc - (paye[c.id] || 0); pc.encours += r; if (r > 0 && c.echeance < j) pc.echu += r; }
      if (RESERVANT[c.statut]) pc.engage += mt.ttc;
      pc.derniere = Math.max(pc.derniere || 0, c.jour);
    });
    s.paiements.forEach(function (p) { var pc = parClient[p.client]; pc.derniere = Math.max(pc.derniere || 0, p.jour); });
    /* Segment A/B/C sur le chiffre d'affaires HT des 90 derniers jours : les clients qui font les 70 % premiers sont A, les 20 % suivants B, le reste C */
    var tri = s.clients.slice().sort(function (a, b) { return parClient[b.id].ca90 - parClient[a.id].ca90; });
    var total = tri.reduce(function (t, c) { return t + parClient[c.id].ca90; }, 0), cumul = 0;
    tri.forEach(function (c) { var avant = cumul; cumul += parClient[c.id].ca90; parClient[c.id].segment = total && avant < total * 0.7 ? 'A' : total && avant < total * 0.9 ? 'B' : 'C'; });
    return { montants: m, paye: paye, clients: parClient, jour: j };
  }
  function reste(D, c) { return FACTURE[c.statut] ? D.montants[c.id].ttc - (D.paye[c.id] || 0) : 0; }

  function kpis(s, D) {
    D = D || derive(s);
    var j = s.jour, k = { ca30: 0, ca30Precedent: 0, enCours: 0, nouvelles: 0, bloquees: 0, enRetard: 0, livraisons7: 0, livraisonsJour: 0, alertes: 0, ruptures: 0, encours: 0, echu: 0, aPreparer: 0, prets: 0, nbCommandes30: 0 };
    s.commandes.forEach(function (c) {
      var mt = D.montants[c.id];
      if (c.statut !== 'annulee') {
        if (c.jour > j - 30) { k.ca30 += mt.ht; k.nbCommandes30++; }
        else if (c.jour > j - 60) k.ca30Precedent += mt.ht;
      }
      if (EN_COURS[c.statut]) k.enCours++;
      if (c.statut === 'nouvelle') { k.nouvelles++; if (manquants(s, c.lignes).length) k.bloquees++; }
      if (c.statut === 'confirmee' || c.statut === 'en_preparation') k.aPreparer++;
      if (c.statut === 'prete') k.prets++;
      if (enRetard(c, j)) k.enRetard++;
      if (c.statut !== 'livree' && c.statut !== 'annulee' && c.livraisonPrevue >= j && c.livraisonPrevue <= j + 6) { k.livraisons7++; if (c.livraisonPrevue === j) k.livraisonsJour++; }
      var r = reste(D, c); if (r > 0) { k.encours += r; if (c.echeance < j) k.echu += r; }
    });
    s.produits.forEach(function (p) { var n = niveauStock(p); if (n !== 'ok') k.alertes++; if (n === 'rupture') k.ruptures++; });
    k.panierMoyen = k.nbCommandes30 ? Math.round(k.ca30 / k.nbCommandes30) : 0;
    return k;
  }

  /* Ventes HT par semaine (lundi), les n dernières semaines, semaine en cours comprise. filtre(c) optionnel. */
  function ventesParSemaine(s, D, n, filtre) {
    var fin = debutSemaine(s.jour), sortie = [];
    for (var i = n - 1; i >= 0; i--) sortie.push({ debut: fin - 7 * i, ht: 0, nb: 0, enCours: i === 0 });
    var premier = sortie[0].debut;
    s.commandes.forEach(function (c) {
      if (c.statut === 'annulee' || c.jour < premier || c.jour > s.jour || (filtre && !filtre(c))) return;
      var k = Math.floor((c.jour - premier) / 7); sortie[k].ht += D.montants[c.id].ht; sortie[k].nb++;
    });
    return sortie;
  }
  function produitsDemandes(s, depuis, filtre) {
    var t = {};
    s.commandes.forEach(function (c) {
      if (c.statut === 'annulee' || c.jour < depuis || (filtre && !filtre(c))) return;
      c.lignes.forEach(function (l) { var x = t[l.produit] || (t[l.produit] = { produit: l.produit, qte: 0, ht: 0, commandes: 0 }); x.qte += l.qte; x.ht += Math.round(l.qte * l.prix * (100 - c.remise) / 100); x.commandes++; });
    });
    return Object.keys(t).map(function (k) { return t[k]; }).sort(function (a, b) { return b.qte - a.qte || (a.produit < b.produit ? -1 : 1); });
  }
  function commandesParStatut(s, filtre) {
    var t = {}; STATUTS.forEach(function (x) { t[x] = 0; });
    s.commandes.forEach(function (c) { if (!filtre || filtre(c)) t[c.statut]++; });
    return t;
  }
  /* Retards par semaine : commandes livrées dans la semaine, dont livrées après la date prévue */
  function retardsParSemaine(s, n, filtre) {
    var fin = debutSemaine(s.jour), sortie = [];
    for (var i = n - 1; i >= 0; i--) sortie.push({ debut: fin - 7 * i, livrees: 0, retard: 0, enCours: i === 0 });
    var premier = sortie[0].debut;
    s.commandes.forEach(function (c) {
      if (c.livreeLe == null || c.livreeLe < premier || (filtre && !filtre(c))) return;
      var k = Math.floor((c.livreeLe - premier) / 7); sortie[k].livrees++; if (c.livreeLe > c.livraisonPrevue) sortie[k].retard++;
    });
    return sortie;
  }
  /* Actions prioritaires : ce qu'il faut traiter aujourd'hui, du plus urgent au moins urgent. Chaque entrée renvoie vers l'écran qui permet d'agir. */
  function priorites(s, D, role) {
    D = D || derive(s);
    var j = s.jour, liste = [];
    var retards = s.commandes.filter(function (c) { return enRetard(c, j); });
    if (retards.length) liste.push({ niveau: 'critique', titre: retards.length + ' commande' + (retards.length > 1 ? 's' : '') + ' en retard de livraison', detail: retards.slice(0, 3).map(function (c) { return c.id; }).join(', ') + (retards.length > 3 ? '…' : ''), lien: '#/commandes?retard=1', roles: ['direction', 'commercial', 'magasinier', 'gestionnaire'] });
    var bloquees = s.commandes.filter(function (c) { return c.statut === 'nouvelle' && manquants(s, c.lignes).length; });
    if (bloquees.length) liste.push({ niveau: 'serieux', titre: bloquees.length + ' commande' + (bloquees.length > 1 ? 's' : '') + ' bloquée' + (bloquees.length > 1 ? 's' : '') + ' par le stock', detail: 'Produits en rupture : réceptionner ou ajuster', lien: '#/stocks?etat=alerte', roles: ['direction', 'commercial', 'magasinier'] });
    var aConfirmer = s.commandes.filter(function (c) { return c.statut === 'nouvelle' && !manquants(s, c.lignes).length; });
    if (aConfirmer.length) liste.push({ niveau: 'attention', titre: aConfirmer.length + ' nouvelle' + (aConfirmer.length > 1 ? 's' : '') + ' commande' + (aConfirmer.length > 1 ? 's' : '') + ' à confirmer', detail: 'Le stock est disponible', lien: '#/commandes?statut=nouvelle', roles: ['direction', 'commercial', 'gestionnaire'] });
    var aPreparer = s.commandes.filter(function (c) { return c.statut === 'confirmee'; });
    if (aPreparer.length) liste.push({ niveau: 'attention', titre: aPreparer.length + ' commande' + (aPreparer.length > 1 ? 's' : '') + ' à préparer', detail: 'Stock réservé, en attente du magasin', lien: '#/preparation', roles: ['direction', 'magasinier'] });
    var echues = s.commandes.filter(function (c) { return reste(D, c) > 0 && c.echeance < j; });
    if (echues.length) {
      var total = echues.reduce(function (t, c) { return t + reste(D, c); }, 0);
      liste.push({ niveau: 'serieux', titre: echues.length + ' échéance' + (echues.length > 1 ? 's' : '') + ' dépassée' + (echues.length > 1 ? 's' : ''), detail: formaterMAD(total) + ' à relancer', lien: '#/paiements?etat=echue', roles: ['direction', 'commercial', 'gestionnaire'] });
    }
    var depasses = s.clients.filter(function (c) { var x = D.clients[c.id]; return x.encours + x.engage > c.plafond * 100; });
    if (depasses.length) liste.push({ niveau: 'serieux', titre: depasses.length + ' client' + (depasses.length > 1 ? 's' : '') + ' au-delà du plafond d\'encours', detail: depasses.slice(0, 2).map(function (c) { return c.nom; }).join(', ') + (depasses.length > 2 ? '…' : ''), lien: '#/clients?plafond=1', roles: ['direction', 'commercial', 'gestionnaire'] });
    var ruptures = s.produits.filter(function (p) { return niveauStock(p) !== 'ok'; });
    if (ruptures.length) liste.push({ niveau: 'attention', titre: ruptures.length + ' produit' + (ruptures.length > 1 ? 's' : '') + ' sous le seuil de réapprovisionnement', detail: ruptures.slice(0, 2).map(function (p) { return p.nom; }).join(', ') + (ruptures.length > 2 ? '…' : ''), lien: '#/stocks?etat=alerte', roles: ['direction', 'magasinier', 'commercial'] });
    var ordre = { critique: 0, serieux: 1, attention: 2 };
    return liste.filter(function (x) { return !role || x.roles.indexOf(role) >= 0; }).sort(function (a, b) { return ordre[a.niveau] - ordre[b.niveau]; });
  }

  /* ── Recherche, filtres et tri des commandes (testés à part) ───────────────────────────────────────────────────────────────────────── */
  function sansAccent(t) { return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function filtrerCommandes(s, D, f) {
    f = f || {};
    var q = f.q ? sansAccent(f.q.trim()) : '', j = s.jour;
    return s.commandes.filter(function (c) {
      if (f.statuts && f.statuts.length && f.statuts.indexOf(c.statut) < 0) return false;
      if (f.retard && !enRetard(c, j)) return false;
      var cl = client(s, c.client);
      if (f.type && cl.type !== f.type) return false;
      if (f.ville && cl.ville !== f.ville) return false;
      if (f.paiement && etatPaiement(s, c, j) !== f.paiement) return false;
      if (f.periode && c.jour <= j - f.periode) return false;
      if (f.client && c.client !== f.client) return false;
      if (q && sansAccent(c.id + ' ' + cl.nom + ' ' + cl.ville).indexOf(q) < 0) return false;
      return true;
    });
  }
  function trierCommandes(s, D, liste, cle, sens) {
    var dir = sens === 'asc' ? 1 : -1;
    var val = {
      id: function (c) { return +c.id.slice(4); }, client: function (c) { return sansAccent(client(s, c.client).nom); }, jour: function (c) { return c.jour * 1440 + minutes(c.h); },
      livraison: function (c) { return c.livraisonPrevue; }, montant: function (c) { return D.montants[c.id].ttc; }, statut: function (c) { return STATUTS.indexOf(c.statut); }
    }[cle] || function (c) { return c.jour * 1440 + minutes(c.h); };
    return liste.slice().sort(function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : (+a.id.slice(4) - +b.id.slice(4))) * dir; });
  }

  /* ── Format ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function milliers(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function formaterMAD(centimes, sansDecimales) {
    var neg = centimes < 0, v = Math.abs(Math.round(centimes));
    var ent = Math.floor(v / 100), dec = v % 100;
    return (neg ? '−' : '') + milliers(ent) + (sansDecimales ? '' : ',' + String(dec).padStart(2, '0')) + ' MAD';
  }
  function formaterCompact(centimes) {
    var mad = centimes / 100;
    if (Math.abs(mad) >= 1e6) return (mad / 1e6).toFixed(2).replace('.', ',') + ' M MAD';
    if (Math.abs(mad) >= 1e4) return Math.round(mad / 1e3) + ' k MAD';
    return milliers(Math.round(mad)) + ' MAD';
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dateLongue(n) { var d = new Date(n * 864e5); return JOURS[jourSemaine(n)] + ' ' + d.getUTCDate() + (d.getUTCDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function dateCourte(n) { var d = new Date(n * 864e5); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); }
  function dateJourMois(n) { var d = new Date(n * 864e5); return d.getUTCDate() + ' ' + MOIS_COURT[d.getUTCMonth()]; }
  function relatif(n, j) {
    var e = j - n;
    if (e === 0) return 'aujourd\'hui'; if (e === 1) return 'hier'; if (e === -1) return 'demain';
    if (e > 0 && e < 7) return 'il y a ' + e + ' jours'; if (e < 0 && e > -7) return 'dans ' + (-e) + ' jours';
    return dateJourMois(n);
  }

  /* CSV (séparateur « ; » pour Excel en français, BOM UTF-8). Une cellule qui commence par = + - @ est préfixée d'une apostrophe : pas de formule exécutée à l'ouverture. */
  function celluleCSV(v) {
    var t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(,\d+)?$/.test(t)) t = '\'' + t;
    return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function versCSV(entetes, lignes) { return '﻿' + [entetes].concat(lignes).map(function (l) { return l.map(celluleCSV).join(';'); }).join('\r\n') + '\r\n'; }
  function decimal(centimes) { return (centimes / 100).toFixed(2).replace('.', ','); }

  /* ── Données de départ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function etatVide(j) {
    return {
      version: VERSION, jour: j, entreprise: { nom: 'Démo Négoce SARL', ville: 'Casablanca', activite: 'Distribution de produits alimentaires et d\'entretien' },
      produits: [], clients: [], commandes: [], paiements: [], relances: [], mouvements: [], receptions: [], inventaires: [], journal: [],
      compteurs: { commande: 24180, mouvement: 1, paiement: 5100, relance: 310, reception: 820, inventaire: 40 }
    };
  }
  function dateReference(isoDate) {   // le dimanche est fermé : la démonstration se place au samedi
    var j = jour(isoDate); if (isNaN(j)) return NaN;
    return jourSemaine(j) === 0 ? j - 1 : j;
  }

  function generer(isoDate) {
    var J = dateReference(isoDate);
    if (isNaN(J)) throw new Error('date de référence invalide');
    var r = alea(0x1E6A7715);
    var s = etatVide(J);
    var DEBUT = debutSemaine(J) - 7 * 17;   // 18 semaines de lundi à aujourd'hui
    var sys = function (j, h, par, role) { return { jour: j, heure: h, role: role || 'systeme', par: par || 'Système' }; };

    var sommeRot = CATALOGUE.reduce(function (t, x) { return t + x[5]; }, 0);
    s.produits = CATALOGUE.map(function (x, i) {
      var demande = 4.2 * 3.4 * (x[5] / sommeRot) * 10.5 * x[6];   // unités par jour ouvré, en moyenne
      return { id: 'P' + String(i + 1).padStart(2, '0'), sku: x[0], nom: x[1], categorie: x[2], unite: x[3], prix: x[4] * 100, stock: 0, reserve: 0,
        seuil: Math.max(5, Math.ceil(demande * 5 / 5) * 5), cible: Math.max(20, Math.ceil(demande * 16 / 10) * 10), emplacement: x[7], fournisseur: FOURNISSEUR[x[2]] };
    });
    s.clients = CLIENTS.map(function (x, i) {
      return { id: 'C' + String(i + 1).padStart(2, '0'), nom: x[0], type: x[1], ville: x[2], contact: x[3], remise: x[4], delai: x[5], plafond: x[6], poids: x[7], paiement: x[8], commercial: x[9], depuis: DEBUT - 120 - i * 37 };
    });
    s.produits.forEach(function (p) { var ctx = sys(DEBUT, '07:30', 'Hamid E.'); mouvement(s, ctx, p, 'entree', p.cible, { type: 'inventaire', ref: 'INV-OUV' }); });
    s.inventaires.push({ id: 'INV-OUV', jour: DEBUT, produit: null, ecart: null, motif: 'Stock d\'ouverture (inventaire)', par: 'Hamid E.' });

    var planning = {};   // jour -> [{h, f}]
    function prevoir(j, h, f) { j = ouvre(j); if (j > J || (j === J && minutes(h) > minutes(HEURE_GENERATION))) return; (planning[j] = planning[j] || []).push({ h: h, f: f }); }
    function tard(h, plus) { return heure(Math.min(minutes(h) + plus, 18 * 60 + 30)); }
    function paiements(cmd, c, j) {
      var mt = montants(cmd).ttc, ech = cmd.echeance, mode = c.delai === 0 ? r.parmi(['Espèces', 'Chèque']) : r.parmi(['Virement', 'Virement', 'Chèque', 'Effet (LCN)']);
      var d = c.delai === 0 ? j + (TRANSIT[c.ville] || 0) : ech + (c.paiement === 'ponctuel' ? r.entre(-12, 2) : c.paiement === 'variable' ? r.entre(-6, 14) : r.entre(8, 40));
      d = Math.max(d, j);
      var regler = function (montant, jj) { prevoir(jj, heure(r.entre(9 * 60, 17 * 60)), function (h) { var reste = resteDu(s, cmd); if (reste <= 0) return; muter(s, { type: 'enregistrer_paiement', commande: cmd.id, montant: Math.min(montant, reste), mode: mode }, sys(jj, h, 'Nadia L.')); }); };
      if (c.type === 'Grossiste' && r() < 0.3) { var moitie = Math.round(mt / 2); regler(moitie, d); regler(mt - moitie, d + r.entre(10, 25)); }
      else regler(mt, d);
    }
    function cycle(cmd, c, j, h) {
      var transit = TRANSIT[c.ville] || 0, retard = r() < 0.11 ? r.entre(1, 3) : 0, annule = r() < 0.035;
      var nomCom = membre(c.commercial).nom;
      var jc = r() < 0.45 ? j : j + 1, hc = jc === j ? tard(h, r.entre(30, 150)) : heure(r.entre(8 * 60 + 30, 11 * 60));
      var essais = 0;
      function confirmer(jj, hh) {
        var jx0 = ouvre(jj);
        prevoir(jx0, hh, function (hx) {
          if (cmd.statut !== 'nouvelle') return;
          var res = executer(s, { type: 'changer_statut', id: cmd.id, vers: 'confirmee' }, sys(jx0, hx, nomCom));
          if (!res.ok) {   // stock insuffisant : on attend une réception le lendemain, puis le client accepte une commande réduite au disponible
            if (++essais <= 1) { confirmer(jx0 + 1, heure(r.entre(9 * 60, 11 * 60))); return; }
            var reduites = cmd.lignes.map(function (l) { return { produit: l.produit, qte: Math.min(l.qte, Math.max(0, disponible(produit(s, l.produit)))) }; }).filter(function (l) { return l.qte > 0; });
            var ctxM = sys(jx0, hx, nomCom);
            if (!reduites.length || essais > 3) { muter(s, { type: 'changer_statut', id: cmd.id, vers: 'annulee', motif: 'Rupture fournisseur' }, ctxM); return; }
            muter(s, { type: 'modifier_commande', id: cmd.id, lignes: reduites, livraisonPrevue: Math.max(cmd.livraisonPrevue, jx0) }, ctxM);
            confirmer(jx0, tard(hx, 10));
            return;
          }
          if (annule) { var ja = ouvre(jx0 + r.entre(0, 1)); prevoir(ja, heure(r.entre(12 * 60, 17 * 60)), function (hy) { if (cmd.statut === 'confirmee' || cmd.statut === 'en_preparation') muter(s, { type: 'changer_statut', id: cmd.id, vers: 'annulee', motif: r.parmi(['Demande du client', 'Demande du client', 'Doublon']) }, sys(ja, hy, nomCom)); }); }
          var jp = ouvre(jx0 + (r() < 0.25 ? 0 : 1)), hp = jp === jx0 ? tard(hx, r.entre(60, 180)) : heure(r.entre(8 * 60, 11 * 60));
          prevoir(jp, hp, function (h2) {
            if (cmd.statut !== 'confirmee') return;
            muter(s, { type: 'changer_statut', id: cmd.id, vers: 'en_preparation' }, sys(jp, h2, 'Hamid E.'));
            var jr = ouvre(jp + (minutes(h2) > 13 * 60 || r() < 0.4 ? 1 : 0)), hr = jr === jp ? tard(h2, r.entre(90, 240)) : heure(r.entre(8 * 60, 10 * 60));
            prevoir(jr, hr, function (h3) {
              if (cmd.statut !== 'en_preparation') return;
              muter(s, { type: 'changer_statut', id: cmd.id, vers: 'prete' }, sys(jr, h3, 'Rachid T.'));
              var je = ouvre(jr + 1 + (retard > 1 ? 1 : 0)), he = heure(r.entre(7 * 60 + 30, 9 * 60 + 30));
              prevoir(je, he, function (h4) {
                if (cmd.statut !== 'prete') return;
                muter(s, { type: 'changer_statut', id: cmd.id, vers: 'expediee' }, sys(je, h4, 'Hamid E.'));
                paiements(cmd, c, je);
                var jl = ouvre(je + transit + (retard ? Math.max(1, retard - 1) : 0));
                prevoir(jl, heure(r.entre(10 * 60, 17 * 60 + 30)), function (h5) { if (cmd.statut === 'expediee') muter(s, { type: 'changer_statut', id: cmd.id, vers: 'livree' }, sys(jl, h5, membre(cmd.livreur).nom)); });
              });
            });
          });
        });
      }
      confirmer(jc, hc);
    }

    for (var j = DEBUT; j <= J; j++) {
      var js = jourSemaine(j);
      if (js === 0) continue;
      var file = (planning[j] || []).slice();
      /* Réceptions fournisseurs : lundi et jeudi matin, pour ce qui passe sous 1,6 fois le seuil (sauf produits en tension) */
      if (js === 1 || js === 4) {
        var lignes = [];
        s.produits.forEach(function (p) {
          if (TENSION[p.sku] && j > J - TENSION[p.sku]) return;
          var d = disponible(p);
          if (d < p.seuil * 1.6) lignes.push({ produit: p.id, qte: Math.ceil((p.cible - d) / 10) * 10 });
        });
        var parFournisseur = {};
        lignes.forEach(function (l) { var f = produit(s, l.produit).fournisseur; (parFournisseur[f] = parFournisseur[f] || []).push(l); });
        Object.keys(parFournisseur).sort().forEach(function (f, i) { file.push({ h: heure(8 * 60 + 5 + i * 20), f: function (h) { muter(s, { type: 'receptionner', lignes: parFournisseur[f], fournisseur: f }, sys(j, h, 'Hamid E.')); } }); });
      }
      /* Nouvelles commandes */
      var avance = (j - DEBUT) / (J - DEBUT + 1);
      var facteur = [0, 1.25, 1.1, 1, 1, 0.9, 0.6][js];
      var nb = Math.max(1, Math.round((3.2 + 1.8 * avance) * facteur + (r() - 0.5) * 2.2));
      for (var n = 0; n < nb; n++) {
        (function (hc) {
          file.push({ h: hc, f: function (h) {
            var c = r.pondere(s.clients, function (x) { return x.poids; });
            var nbl = c.type === 'Grossiste' ? r.entre(3, 7) : c.type === 'Épicerie' ? r.entre(2, 4) : r.entre(2, 5);
            var choix = [], lignesCmd = [];
            for (var k = 0; k < nbl; k++) {
              var p = r.pondere(s.produits, function (x) { var rot = CATALOGUE[+x.id.slice(1) - 1][5]; return choix.indexOf(x.id) >= 0 ? 0 : rot * (c.type === 'CHR' && x.categorie === 'Boissons' ? 2 : 1); });
              choix.push(p.id);
              var fq = CATALOGUE[+p.id.slice(1) - 1][6], plage = QTE_TYPE[c.type];
              lignesCmd.push({ produit: p.id, qte: Math.max(1, Math.round(r.entre(plage[0], plage[1]) * fq)) });
            }
            var res = muter(s, { type: 'creer_commande', client: c.id, lignes: lignesCmd, canal: r.pondere(CANAUX, function (x) { return { 'Téléphone': 4, WhatsApp: 4, 'Commercial terrain': 3, Comptoir: 1, 'E-mail': 1 }[x]; }) }, sys(j, h, membre(c.commercial).nom));
            cycle(commande(s, res.id), c, j, h);
          } });
        })(heure(r.entre(8 * 60, 17 * 60 + 45)));
      }
      /* Relances : 7, 21 et 35 jours après l'échéance, tant que la commande n'est pas soldée */
      file.push({ h: '16:45', f: function (h) {
        s.commandes.forEach(function (cmd) {
          if (cmd.echeance == null || cmd.echeance >= j) return;
          var retardJ = j - cmd.echeance;
          if ((retardJ === 7 || retardJ === 21 || retardJ === 35) && resteDu(s, cmd) > 0) executer(s, { type: 'relancer', commande: cmd.id, canal: retardJ === 7 ? 'E-mail' : 'Téléphone' }, sys(j, h, 'Nadia L.'));
        });
      } });
      /* Exécution dans l'ordre des heures ; une étape prévue le même jour rejoint la file */
      var limite = j === J ? minutes(HEURE_GENERATION) : 24 * 60;
      planning[j] = [];
      var vus = 0;
      file.forEach(function (x, i) { x.m = minutes(x.h); x.o = i; });
      file.sort(function (a, b) { return a.m - b.m || a.o - b.o; });
      var ordre = file.length;
      while (file.length || planning[j].length > vus) {
        while (planning[j].length > vus) {   // insertion à sa place (tri stable) d'une étape prévue pendant la journée
          var x = planning[j][vus++]; x.m = minutes(x.h); x.o = ordre++;
          var k = file.length; while (k > 0 && (file[k - 1].m > x.m || (file[k - 1].m === x.m && file[k - 1].o > x.o))) k--;
          file.splice(k, 0, x);
        }
        var ev = file.shift();
        if (minutes(ev.h) > limite) continue;
        ev.f(ev.h);
      }
      delete planning[j];
    }
    /* Plafonds d'encours calés sur l'activité de chaque client (achats TTC mensuels × (délai + 15 jours) × 1,15, arrondis à 5 000 MAD) :
       un client qui paie dans les temps reste dessous, un client qui paie en retard le dépasse et déclenche l'alerte. */
    s.clients.forEach(function (c) {
      var ttc = 0; s.commandes.forEach(function (k) { if (k.client === c.id && k.statut !== 'annulee' && k.jour > J - 90) ttc += montants(k).ttc; });
      c.plafond = Math.max(10000, Math.ceil(ttc / 3 / 100 * ((c.delai + 15) / 30) * 1.15 / 5000) * 5000);
    });
    /* Le seed reste léger dans le journal : on garde l'activité des 10 derniers jours */
    s.journal = s.journal.filter(function (e) { return e.jour > J - 10; });
    return s;
  }

  /* Session : l'état = données de départ + actions du visiteur, rejouées. On ne garde que ces actions (fictives) dans sessionStorage. */
  function rejouer(isoDate, actions) {
    var s = generer(isoDate), refusees = 0;
    (actions || []).forEach(function (x) {
      var res = executer(s, x.action, { jour: s.jour, heure: x.h || '12:00', role: x.role, par: (ROLES[x.role] || {}).personne || 'Démo', session: true });
      if (!res.ok) refusees++;
    });
    return { etat: s, refusees: refusees };
  }

  /* ── Cohérence ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function verifierCoherence(s) {
    var ecarts = [], stock = {}, reserve = {}, origines = { commande: {}, reception: {}, inventaire: {} };
    s.commandes.forEach(function (c) { origines.commande[c.id] = c; });
    s.receptions.forEach(function (b) { origines.reception[b.id] = b; });
    s.inventaires.forEach(function (i) { origines.inventaire[i.id] = i; });
    s.produits.forEach(function (p) { stock[p.id] = 0; reserve[p.id] = 0; });
    var parCommande = {};
    s.mouvements.forEach(function (m) {
      if (!m.origine || !origines[m.origine.type] || !origines[m.origine.type][m.origine.ref]) ecarts.push(m.id + ' : mouvement sans origine valide');
      if (m.type === 'entree') stock[m.produit] += m.qte;
      else if (m.type === 'sortie') { stock[m.produit] -= m.qte; reserve[m.produit] -= m.qte; }
      else if (m.type === 'reservation') reserve[m.produit] += m.qte;
      else if (m.type === 'liberation') reserve[m.produit] -= m.qte;
      else if (m.type === 'ajustement') stock[m.produit] += m.qte;
      if (stock[m.produit] < 0) ecarts.push(m.id + ' : stock négatif');
      if (reserve[m.produit] < 0 || reserve[m.produit] > stock[m.produit]) ecarts.push(m.id + ' : réservation incohérente');
      if (m.origine && m.origine.type === 'commande') { var k = m.origine.ref + '|' + m.produit; var e = parCommande[k] || (parCommande[k] = { reservation: 0, liberation: 0, sortie: 0 }); e[m.type] += m.qte; }
    });
    var attendu = {};
    s.produits.forEach(function (p) { attendu[p.id] = 0; });
    s.commandes.forEach(function (c) {
      if (RESERVANT[c.statut]) c.lignes.forEach(function (l) { attendu[l.produit] += l.qte; });
      c.lignes.forEach(function (l) {
        var e = parCommande[c.id + '|' + l.produit] || { reservation: 0, liberation: 0, sortie: 0 };
        var reservee = e.reservation - e.liberation - e.sortie;
        if (RESERVANT[c.statut] && (e.reservation !== l.qte || reservee !== l.qte)) ecarts.push(c.id + ' : réservation ' + reservee + ' au lieu de ' + l.qte + ' (' + l.produit + ')');
        if (FACTURE[c.statut] && (e.sortie !== l.qte || reservee !== 0)) ecarts.push(c.id + ' : sortie ' + e.sortie + ' au lieu de ' + l.qte + ' (' + l.produit + ')');
        if (c.statut === 'nouvelle' && (e.reservation || e.sortie)) ecarts.push(c.id + ' : mouvement sur une commande non confirmée');
        if (c.statut === 'annulee' && (reservee !== 0 || e.sortie)) ecarts.push(c.id + ' : réservation non libérée après annulation');
        if (e.reservation > l.qte) ecarts.push(c.id + ' : double réservation (' + l.produit + ')');
      });
      var mt = montants(c), somme = c.lignes.reduce(function (t, l) { return t + l.qte * l.prix; }, 0);
      if (mt.brut !== somme || mt.ht !== mt.brut - mt.remise || mt.ttc !== mt.ht + mt.tva || mt.tva !== Math.round(mt.ht * TVA_PCT / 100)) ecarts.push(c.id + ' : montants incohérents');
      var paye = totalPaye(s, c.id);
      if (paye > mt.ttc) ecarts.push(c.id + ' : payé au-delà du montant');
      if (paye && !FACTURE[c.statut]) ecarts.push(c.id + ' : paiement sur une commande non expédiée');
      for (var i = 1; i < c.historique.length; i++) if (TRANSITIONS[c.historique[i - 1].statut].indexOf(c.historique[i].statut) < 0) ecarts.push(c.id + ' : transition interdite dans l\'historique');
      if (c.historique[c.historique.length - 1].statut !== c.statut) ecarts.push(c.id + ' : historique différent du statut');
    });
    s.produits.forEach(function (p) {
      if (p.stock !== stock[p.id]) ecarts.push(p.id + ' : stock ' + p.stock + ' ≠ mouvements ' + stock[p.id]);
      if (p.reserve !== reserve[p.id]) ecarts.push(p.id + ' : réservé ' + p.reserve + ' ≠ mouvements ' + reserve[p.id]);
      if (p.reserve !== attendu[p.id]) ecarts.push(p.id + ' : réservé ' + p.reserve + ' ≠ commandes ' + attendu[p.id]);
      if (p.stock < 0 || p.reserve < 0 || p.reserve > p.stock) ecarts.push(p.id + ' : niveaux impossibles');
    });
    return ecarts;
  }

  var DOS = {
    VERSION: VERSION, TVA_PCT: TVA_PCT, STATUTS: STATUTS, FLUX: FLUX, LIBELLE_STATUT: LIBELLE_STATUT, TRANSITIONS: TRANSITIONS, LIBELLE_ACTION: LIBELLE_ACTION,
    RESERVANT: RESERVANT, EN_COURS: EN_COURS, FACTURE: FACTURE, MOTIFS_ANNULATION: MOTIFS_ANNULATION, MODES_PAIEMENT: MODES_PAIEMENT, CANAUX: CANAUX,
    ROLES: ROLES, DROITS: DROITS, LIBELLE_DROIT: LIBELLE_DROIT, MODULES_ROLE: MODULES_ROLE, EQUIPE: EQUIPE, TRANSIT: TRANSIT, LIBELLE_PAIEMENT: LIBELLE_PAIEMENT,
    droitPour: droitPour, peut: peut, jour: jour, iso: iso, jourSemaine: jourSemaine, debutSemaine: debutSemaine, debutMois: debutMois, ouvre: ouvre, heure: heure, minutes: minutes,
    produit: produit, client: client, commande: commande, membre: membre, disponible: disponible, niveauStock: niveauStock, manquants: manquants,
    montants: montants, montantLigne: montantLigne, totalPaye: totalPaye, resteDu: resteDu, etatPaiement: etatPaiement, enRetard: enRetard, encoursClient: encoursClient, engageClient: engageClient,
    executer: executer, derive: derive, reste: reste, kpis: kpis, ventesParSemaine: ventesParSemaine, produitsDemandes: produitsDemandes, commandesParStatut: commandesParStatut,
    retardsParSemaine: retardsParSemaine, priorites: priorites, filtrerCommandes: filtrerCommandes, trierCommandes: trierCommandes, sansAccent: sansAccent,
    formaterMAD: formaterMAD, formaterCompact: formaterCompact, milliers: milliers, dateLongue: dateLongue, dateCourte: dateCourte, dateJourMois: dateJourMois, relatif: relatif,
    versCSV: versCSV, celluleCSV: celluleCSV, decimal: decimal, dateReference: dateReference, generer: generer, rejouer: rejouer, verifierCoherence: verifierCoherence
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DOS;
  else racine.DOS = DOS;
})(typeof window !== 'undefined' ? window : this);
