/* Mizan Technique, espace client et gestion (démonstration fictive).
   Tout l'état vit en mémoire : ni cookie, ni stockage, ni requête. Il disparaît au rechargement. */
(function () {
  'use strict';
  var racine = document.getElementById('app');
  if (!racine) return;
  var D = window.MIZAN_DEVIS || { SERVICES: {}, NATURES: {}, LOCAUX: {}, URGENCES: {} };

  /* ---------- référentiels ---------- */
  var STATUTS = [['recue', 'Reçue'], ['qualifiee', 'Qualifiée'], ['devis', 'Devis envoyé'], ['accepte', 'Accepté'], ['planifiee', 'Planifiée'], ['intervention', 'Intervention'], ['terminee', 'Terminée']];
  var LIB = { refusee: 'Devis refusé' }, RANG = {};
  STATUTS.forEach(function (s, i) { LIB[s[0]] = s[1]; RANG[s[0]] = i; });
  var TECHS = [
    { id: 't1', nom: 'Samir A.', spe: 'Climatisation' },
    { id: 't2', nom: 'Lina O.', spe: 'Électricité' },
    { id: 't3', nom: 'Hamza T.', spe: 'Maintenance de locaux' },
    { id: 't4', nom: 'Nora K.', spe: 'Polyvalente, urgences' }
  ];
  var JOURS = [['lun', 'Lun. 9 nov.'], ['mar', 'Mar. 10 nov.'], ['mer', 'Mer. 11 nov.'], ['jeu', 'Jeu. 12 nov.'], ['ven', 'Ven. 13 nov.'], ['sam', 'Sam. 14 nov.']];
  var SLOTS = [];
  JOURS.forEach(function (j) { SLOTS.push(j[0] + '-am', j[0] + '-pm'); });
  var BLOQUES = { 't1|jeu-pm': 'Formation', 't3|ven-am': 'Congé', 't2|sam-am': 'Astreinte', 't4|sam-pm': 'Repos' };
  var MOTIFS = ['Budget différé', 'Montant trop élevé', 'Autre prestataire retenu', 'Travaux reportés'];
  var CATALOGUE = [['Déplacement et diagnostic', 1, 450], ['Main-d\'œuvre technicien (heure)', 4, 220], ['Petites fournitures', 1, 380], ['Remise du compte rendu', 1, 150]];
  var SUGGESTIONS = {
    climatisation: [['Diagnostic et contrôle des unités', 1, 650], ['Fluide frigorigène (kg)', 3, 280], ['Main-d\'œuvre technicien (heure)', 4, 220]],
    electricite: [['Relevé et diagnostic du tableau', 1, 550], ['Protections et repérage des départs', 1, 1450], ['Main-d\'œuvre technicien (heure)', 6, 220]],
    maintenance: [['Visite de contrôle des équipements', 1, 480], ['Petites fournitures', 1, 260], ['Main-d\'œuvre technicien (heure)', 3, 220]]
  };

  /* ---------- utilitaires ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var mad = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0MAD'; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var slotLib = function (s) { var p = s.split('-'); var j = JOURS.filter(function (x) { return x[0] === p[0]; })[0]; return j[1] + ' · ' + (p[1] === 'am' ? 'matin' : 'après-midi'); };
  var techNom = function (id) { var t = TECHS.filter(function (x) { return x.id === id; })[0]; return t ? t.nom : 'Non affectée'; };
  var titreDe = function (r) { return (D.SERVICES[r.service] || r.service) + ' · ' + (D.NATURES[r.nature] || r.nature); };
  var estLigneOk = function (l) { return /^\d{1,4}$/.test(String(l.q).trim()) && +l.q > 0 && /^\d{1,7}$/.test(String(l.p).trim()) && +l.p > 0; };   // au plus 9 999 unités et 9 999 999 MAD par ligne

  /* ---------- données fictives déterministes ---------- */
  var etat, derniereOuverture = null;
  var JOURS_PASSES = ['mar. 3 nov.', 'mer. 4 nov.', 'jeu. 5 nov.', 'ven. 6 nov.', 'sam. 7 nov.', 'dim. 8 nov.'];

  function graine() {
    var clients = [
      { id: 'c1', nom: 'Imane R.', societe: 'Atelier Zellige', email: 'imane@exemple.invalid', tel: '05 00 00 00 01' },
      { id: 'c2', nom: 'Youssef M.', societe: 'Centre Médina Plaza', email: 'youssef@exemple.invalid', tel: '05 00 00 00 02' },
      { id: 'c3', nom: 'Salma D.', societe: 'Résidence Les Embruns', email: 'salma@exemple.invalid', tel: '05 00 00 00 03' },
      { id: 'c4', nom: 'Reda L.', societe: 'Cabinet Orchidée', email: 'reda@exemple.invalid', tel: '05 00 00 00 04' }
    ];
    var n = 0;
    var L = function (lib, q, p) { n++; return { id: 'l' + n, lib: lib, q: String(q), p: String(p) }; };
    var etat0 = { clients: clients, reqs: [], horloge: 8 * 60 + 30, seq: 1051, nl: 0, tab: 'client', gv: 'tableau', client: 'c1', selC: 'MZ-1042', filtre: 'tous', placer: '', effet: null, msgC: '', msgF: '', msgP: '' };
    var def = [
      ['MZ-1041', 'c1', 'climatisation', 'depannage', 'entrepot', 420, 'quarante', 'Deux cassettes ne soufflent plus d\'air froid depuis lundi, condensats au sol près de l\'entrée.', 'terminee', 't1', null, [L('Diagnostic et recherche de fuite', 1, 650), L('Fluide frigorigène (kg)', 3, 280), L('Main-d\'œuvre technicien (heure)', 4, 220)], { constats: 'Fuite lente sur un raccord de la cassette 2 ; siphon de condensats obstrué.', actions: 'Raccord refait, siphon nettoyé, charge complétée, essais de fonctionnement pendant quarante minutes.', pieces: 'Raccord (1), fluide frigorigène (3 kg)', duree: '4', reco: 'Contrôle d\'étanchéité conseillé dans trois mois.' }],
      ['MZ-1042', 'c1', 'electricite', 'travaux', 'entrepot', 420, 'semaine', 'Reprise du tableau divisionnaire de l\'atelier et repérage de tous les départs.', 'intervention', 't2', 'lun-am', [L('Relevé et diagnostic du tableau', 1, 550), L('Protections et repérage des départs', 1, 1450), L('Main-d\'œuvre technicien (heure)', 6, 220)]],
      ['MZ-1043', 'c2', 'maintenance', 'entretien', 'commerce', 1800, 'planifiee', 'Visite trimestrielle des équipements techniques du centre, relevé des anomalies.', 'planifiee', 't3', 'mar-pm', [L('Visite de contrôle des équipements', 1, 480), L('Main-d\'œuvre technicien (heure)', 5, 220), L('Petites fournitures', 1, 260)]],
      ['MZ-1044', 'c2', 'climatisation', 'entretien', 'commerce', 950, 'semaine', 'Entretien annuel des unités de la galerie marchande, nettoyage des filtres.', 'accepte', 't1', null, [L('Entretien des unités (forfait)', 1, 3200), L('Filtres de remplacement', 8, 95)]],
      ['MZ-1045', 'c3', 'electricite', 'depannage', 'immeuble', 600, 'quarante', 'Coupures répétées sur l\'éclairage des parties communes, disjoncteur qui saute le soir.', 'devis', 't2', null, [L('Recherche de panne', 1, 650), L('Disjoncteur différentiel', 1, 780), L('Main-d\'œuvre technicien (heure)', 3, 220)]],
      ['MZ-1046', 'c3', 'maintenance', 'entretien', 'immeuble', 2400, 'planifiee', 'Mise en place d\'un calendrier de visites des parties communes, inventaire des équipements.', 'qualifiee', null, null, []],
      ['MZ-1047', 'c4', 'climatisation', 'travaux', 'bureaux', 160, 'immediate', 'Installation de deux unités murales dans les bureaux du premier étage.', 'recue', null, null, []],
      ['MZ-1048', 'c4', 'electricite', 'entretien', 'bureaux', 160, 'planifiee', 'Contrôle annuel de l\'installation et vérification des prises.', 'refusee', 't2', null, [L('Contrôle annuel de l\'installation', 1, 1800), L('Main-d\'œuvre technicien (heure)', 2, 220)]],
      ['MZ-1049', 'c1', 'maintenance', 'depannage', 'cuisine', 90, 'immediate', 'Hotte à l\'arrêt dans la cuisine du réfectoire, extraction saturée.', 'planifiee', 't4', 'mer-am', [L('Dépannage de l\'extraction', 1, 900), L('Moteur de hotte', 1, 1350)]],
      ['MZ-1050', 'c2', 'electricite', 'travaux', 'commerce', 300, 'semaine', 'Ajout de huit prises et d\'un circuit dédié pour la vitrine réfrigérée.', 'qualifiee', 't2', null, [L('Circuit dédié vitrine', 1, 2100), L('Prises supplémentaires', 8, 140)]]
    ];
    var textes = [
      ['Client', 'Demande reçue par le formulaire en ligne.'],
      ['Gestion', 'Demande qualifiée : besoin et accès confirmés par téléphone (simulé).'],
      ['Gestion', 'Devis envoyé au client.'],
      ['Client', 'Devis accepté.'],
      ['Gestion', 'Intervention planifiée.'],
      ['Gestion', 'Intervention démarrée sur site.'],
      ['Gestion', 'Compte rendu remis, demande terminée.']
    ];
    def.forEach(function (d, s) {
      var r = { id: d[0], client: d[1], service: d[2], nature: d[3], local: d[4], surface: d[5], urgence: d[6], description: d[7], statut: d[8], tech: d[9], slot: d[10], lignes: d[11], version: (RANG[d[8]] >= 2 || d[8] === 'refusee') ? 1 : 0, decision: null, motif: '', cr: d[12] || null, journal: [] };
      var jusqua = r.statut === 'refusee' ? 2 : RANG[r.statut];
      for (var k = 0; k <= jusqua; k++) {
        var t = textes[k];
        if (k === 2 && r.tech) r.journal.push({ q: 'Gestion', t: 'Affectée à ' + techNom(r.tech) + '.', d: JOURS_PASSES[Math.min(5, (s % 2) + k)] + ' ' + pad(8 + k) + ':' + pad((s * 13) % 60) });
        r.journal.push({ q: t[0], t: k === 4 && r.slot ? 'Intervention planifiée : ' + slotLib(r.slot) + ' avec ' + techNom(r.tech) + '.' : t[1], d: JOURS_PASSES[Math.min(5, (s % 2) + k)] + ' ' + pad(8 + k) + ':' + pad((s * 13) % 60) });
      }
      if (r.statut === 'refusee') { r.decision = 'refuse'; r.motif = 'Budget différé'; r.journal.push({ q: 'Client', t: 'Devis refusé : budget différé.', d: 'sam. 7 nov. 10:' + pad((s * 13) % 60) }); }
      else if (RANG[r.statut] >= 3) r.decision = 'accepte';
      etat0.reqs.push(r);
    });
    return etat0;
  }

  /* ---------- logique métier ---------- */
  var req = function (id) { return etat.reqs.filter(function (r) { return r.id === id; })[0] || null; };
  var client = function (id) { return etat.clients.filter(function (c) { return c.id === id; })[0] || null; };
  var libClient = function (c) { return c.nom + (c.societe ? ' · ' + c.societe : ''); };
  var totaux = function (r) {
    var ht = 0; r.lignes.forEach(function (l) { if (estLigneOk(l)) ht += (+l.q) * (+l.p); });
    var tva = Math.round(ht * 0.2); return { ht: ht, tva: tva, ttc: ht + tva };
  };
  var occupant = function (tech, slot, sauf) { return etat.reqs.filter(function (r) { return r.tech === tech && r.slot === slot && r.id !== sauf; })[0] || null; };
  var libre = function (tech, slot, sauf) { return !BLOQUES[tech + '|' + slot] && !occupant(tech, slot, sauf); };
  var libres = function (tech, sauf) { return SLOTS.filter(function (s) { return libre(tech, s, sauf); }); };
  var stamp = function () { var m = etat.horloge; etat.horloge += 6; return 'lun. 9 nov. ' + pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); };
  var trace = function (r, q, t) { r.journal.push({ q: q, t: t, d: stamp() }); };
  var effet = function (texte, ou, id) { etat.effet = { texte: texte, ou: ou, id: id }; };
  var actionClient = function (r) { return r.statut === 'devis' ? 'Répondre au devis' : (r.statut === 'accepte' && r.tech ? 'Choisir un créneau' : null); };
  var actionGestion = function (r) { return { recue: 'Qualifier', qualifiee: 'Rédiger et envoyer le devis', accepte: r.tech ? 'Planifier' : 'Affecter et planifier', planifiee: 'Démarrer l\'intervention', intervention: 'Clôturer avec compte rendu' }[r.statut] || null; };

  function creer(d, ou) {
    var c = etat.clients.filter(function (x) { return x.email.toLowerCase() === d.email.toLowerCase(); })[0];
    if (!c) { c = { id: 'c' + (etat.clients.length + 1), nom: d.nom, societe: d.societe || '', email: d.email, tel: d.tel }; etat.clients.push(c); }
    var id = 'MZ-' + etat.seq++;
    var r = { id: id, client: c.id, service: d.service, nature: d.nature, local: d.local, surface: +d.surface, urgence: d.urgence, description: d.description, statut: 'recue', tech: null, slot: null, lignes: [], version: 0, decision: null, motif: '', cr: null, journal: [] };
    trace(r, 'Client', 'Demande créée par le parcours de devis en ligne.');
    etat.reqs.push(r); etat.client = c.id; etat.selC = id;
    effet('Demande ' + id + ' créée : elle apparaît en colonne « Reçue » côté gestion et dans la liste du client.', 'gestion', id);
    return r;
  }

  var A = {
    qualifier: function (r) {
      r.statut = 'qualifiee'; trace(r, 'Gestion', 'Demande qualifiée : besoin confirmé (simulé).');
      effet(r.id + ' est qualifiée : le suivi du client passe à l\'étape « Qualifiée ».', 'client', r.id); return 'Demande qualifiée.';
    },
    affecter: function (r, tid) {
      if (!tid) return { err: 'Choisissez un technicien.' };
      if (r.slot && !libre(tid, r.slot, r.id)) { var o = occupant(tid, r.slot, r.id); return { err: techNom(tid) + ' n\'est pas disponible le ' + slotLib(r.slot) + ' (' + (o ? 'déjà affecté à ' + o.id : BLOQUES[tid + '|' + r.slot]) + '). Choisissez un autre technicien ou replanifiez.' }; }
      r.tech = tid; trace(r, 'Gestion', 'Affectée à ' + techNom(tid) + '.');
      effet(r.id + ' est affectée à ' + techNom(tid) + ' : ses créneaux libres sont proposés au client et au planning.', 'client', r.id); return 'Affectée à ' + techNom(tid) + '.';
    },
    planifier: function (r, slot, qui) {
      if (!r.tech) return { err: 'Affectez d\'abord un technicien.' };
      if (!slot) return { err: 'Choisissez un créneau.' };
      if (!libre(r.tech, slot, r.id)) return { err: 'Ce créneau n\'est plus libre pour ' + techNom(r.tech) + '.' };
      var avant = r.slot; r.slot = slot;
      if (r.statut === 'accepte') r.statut = 'planifiee';
      trace(r, qui, (avant ? 'Créneau modifié : ' : 'Intervention planifiée : ') + slotLib(slot) + ' avec ' + techNom(r.tech) + '.');
      effet(r.id + ' : ' + slotLib(slot) + ' avec ' + techNom(r.tech) + ' (le créneau est pris dans le planning).', qui === 'Client' ? 'gestion' : 'client', r.id);
      return 'Créneau retenu : ' + slotLib(slot) + '.';
    },
    placerEn: function (r, tid, slot) {
      if (!libre(tid, slot, r.id)) return { err: 'Cette case n\'est pas libre pour ' + techNom(tid) + '.' };
      var prev = r.tech; r.tech = tid;
      if (prev !== tid) trace(r, 'Gestion', 'Affectée à ' + techNom(tid) + ' depuis le planning.');
      return A.planifier(r, slot, 'Gestion');
    },
    envoyer: function (r) {
      if (!r.lignes.length) return { err: 'Ajoutez au moins une ligne au devis.', champ: 'ajout' };
      for (var i = 0; i < r.lignes.length; i++) {
        var l = r.lignes[i];
        if (l.lib.trim().length < 3) return { err: 'Ligne ' + (i + 1) + ' : indiquez une désignation d\'au moins 3 caractères.', champ: l.id + '-lib' };
        if (!estLigneOk(l)) return { err: 'Ligne ' + (i + 1) + ' : la quantité et le prix unitaire doivent être des entiers positifs.', champ: l.id + (/^\d+$/.test(String(l.q).trim()) && +l.q > 0 ? '-p' : '-q') };
      }
      r.statut = 'devis'; r.version++; var t = totaux(r);
      trace(r, 'Gestion', 'Devis v' + r.version + ' envoyé : ' + mad(t.ttc) + ' TTC.');
      effet('Devis de ' + mad(t.ttc) + ' TTC envoyé pour ' + r.id + ' : le client peut l\'accepter ou le refuser.', 'client', r.id);
      return 'Devis envoyé au client : ' + mad(t.ttc) + ' TTC.';
    },
    repondre: function (r, ok, motif) {
      if (ok) { r.statut = 'accepte'; r.decision = 'accepte'; trace(r, 'Client', 'Devis accepté.'); effet('Le client a accepté le devis de ' + r.id + ' : la demande passe en colonne « Accepté », à planifier.', 'gestion', r.id); return 'Devis accepté.'; }
      r.statut = 'refusee'; r.decision = 'refuse'; r.motif = motif; trace(r, 'Client', 'Devis refusé : ' + motif.toLowerCase() + '.');
      effet('Le client a refusé le devis de ' + r.id + ' : la demande est classée « Devis refusé » côté gestion.', 'gestion', r.id); return 'Devis refusé.';
    },
    demarrer: function (r) {
      if (!r.tech || !r.slot) return { err: 'Il faut un technicien et un créneau.' };
      r.statut = 'intervention'; trace(r, 'Gestion', 'Intervention démarrée sur site.');
      effet(r.id + ' : l\'intervention a démarré, le client voit l\'étape « Intervention ».', 'client', r.id); return 'Intervention démarrée.';
    },
    cloturer: function (r, cr) {
      if (cr.constats.trim().length < 15) return { err: 'Décrivez les constats en au moins 15 caractères.', champ: 'cr-constats' };
      if (cr.actions.trim().length < 15) return { err: 'Décrivez les actions réalisées en au moins 15 caractères.', champ: 'cr-actions' };
      if (!/^\d+([.,]\d)?$/.test(cr.duree.trim()) || parseFloat(cr.duree.replace(',', '.')) <= 0) return { err: 'La durée doit être un nombre d\'heures positif (par exemple 3 ou 2,5).', champ: 'cr-duree' };
      r.cr = { constats: cr.constats.trim(), actions: cr.actions.trim(), pieces: cr.pieces.trim() || 'Aucune pièce remplacée', duree: cr.duree.trim(), reco: cr.reco.trim() || 'Aucune recommandation particulière.' };
      r.statut = 'terminee'; trace(r, 'Gestion', 'Compte rendu remis, demande terminée.');
      effet('Compte rendu remis pour ' + r.id + ' : le client le lit dans son suivi, la demande est terminée.', 'client', r.id); return 'Intervention clôturée, compte rendu remis.';
    }
  };

  function indicateurs() {
    var ouv = etat.reqs.filter(function (r) { return r.statut !== 'terminee' && r.statut !== 'refusee'; });
    var att = etat.reqs.filter(function (r) { return r.statut === 'devis'; });
    var acc = etat.reqs.filter(function (r) { return RANG[r.statut] >= 3 && r.decision === 'accepte'; });
    var occ = etat.reqs.filter(function (r) { return r.slot; }).length;
    var dispo = TECHS.length * SLOTS.length - Object.keys(BLOQUES).length;
    return [
      ['Demandes ouvertes', String(ouv.length), 'ni terminées ni refusées'],
      ['À qualifier', String(etat.reqs.filter(function (r) { return r.statut === 'recue'; }).length), 'colonne « Reçue »'],
      ['Devis en attente', String(att.length), mad(att.reduce(function (n, r) { return n + totaux(r).ttc; }, 0)) + ' TTC'],
      ['Devis acceptés', String(acc.length), mad(acc.reduce(function (n, r) { return n + totaux(r).ttc; }, 0)) + ' TTC'],
      ['Créneaux occupés', occ + ' / ' + dispo, 'planning de la semaine']
    ];
  }

  /* ---------- fragments HTML ---------- */
  var chip = function (r) { return '<span class="chip ch-' + r.statut + '">' + LIB[r.statut] + '</span>'; };
  var urgTag = function (r) { return '<span class="urg u-' + r.urgence + '">' + esc((D.URGENCES[r.urgence] || '').split(' (')[0]) + '</span>'; };

  function etapier(r) {
    var ref = r.statut === 'refusee' ? 2 : RANG[r.statut];
    return '<ol class="etapier" aria-label="Suivi de la demande">' + STATUTS.map(function (s, i) {
      var cls = r.statut === 'terminee' || i < ref ? 'fait' : (i === ref ? (r.statut === 'refusee' ? 'refus' : 'cour') : (r.statut === 'refusee' ? 'off' : ''));
      var lab = cls === 'fait' ? ', étape franchie' : cls === 'cour' ? ', étape en cours' : cls === 'refus' ? ', devis refusé' : ', à venir';
      return '<li class="' + cls + '"' + (cls === 'cour' || cls === 'refus' || (r.statut === 'terminee' && i === 6) ? ' aria-current="step"' : '') + '><span class="pt" aria-hidden="true">' + (i + 1) + '</span><b>' + s[1] + '</b><span class="sr">' + lab + '</span></li>';
    }).join('') + '</ol>';
  }

  function tabDevis(r, titre) {
    var t = totaux(r);
    return '<table class="tab-devis"><caption>' + titre + '</caption><thead><tr><th scope="col">Désignation</th><th scope="col" class="n">Qté</th><th scope="col" class="n">Prix unit.</th><th scope="col" class="n">Total HT</th></tr></thead><tbody>' +
      r.lignes.map(function (l) { return '<tr><th scope="row">' + esc(l.lib) + '</th><td class="n">' + esc(l.q) + '</td><td class="n">' + mad(+l.p) + '</td><td class="n">' + mad((+l.q) * (+l.p)) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th scope="row" colspan="3">Total HT</th><td class="n">' + mad(t.ht) + '</td></tr><tr><th scope="row" colspan="3">TVA 20 %</th><td class="n">' + mad(t.tva) + '</td></tr><tr class="ttc"><th scope="row" colspan="3">Total TTC</th><td class="n">' + mad(t.ttc) + '</td></tr></tfoot></table>';
  }

  function fiches(r) {
    var c = client(r.client);
    var l = function (a, b) { return '<div><dt>' + a + '</dt><dd>' + esc(b) + '</dd></div>'; };
    return '<dl class="resume">' + l('Client', c ? libClient(c) : '') + l('Local', (D.LOCAUX[r.local] || r.local) + ' · ' + r.surface + ' m²') + l('Délai', D.URGENCES[r.urgence] || r.urgence) + l('Technicien', techNom(r.tech)) + l('Créneau', r.slot ? slotLib(r.slot) : 'Non planifié') + '<div class="large"><dt>Description</dt><dd>' + esc(r.description) + '</dd></div></dl>';
  }

  function compteRendu(r) {
    if (!r.cr) return '';
    var l = function (a, b) { return '<div><dt>' + a + '</dt><dd>' + esc(b) + '</dd></div>'; };
    return '<section class="bloc-app" aria-labelledby="cr-t-' + r.id + '"><h3 id="cr-t-' + r.id + '">Compte rendu d\'intervention</h3><dl class="resume resume--cr">' + l('Technicien', techNom(r.tech)) + l('Durée sur site', r.cr.duree.replace('.', ',') + ' h') + '<div class="large"><dt>Constats</dt><dd>' + esc(r.cr.constats) + '</dd></div><div class="large"><dt>Actions réalisées</dt><dd>' + esc(r.cr.actions) + '</dd></div>' + l('Pièces remplacées', r.cr.pieces) + l('Recommandation', r.cr.reco) + '</dl><p class="note">Compte rendu simulé : rédigé dans la gestion, lisible ici.</p></section>';
  }

  function journal(r) {
    return '<section class="bloc-app" aria-labelledby="jr-t-' + r.id + '"><h3 id="jr-t-' + r.id + '">Journal de la demande</h3><ol class="journal">' + r.journal.slice().reverse().map(function (e) { return '<li class="' + (e.q === 'Client' ? 'jc' : 'jg') + '"><span class="qui">' + e.q + '</span><span>' + esc(e.t) + '</span><time>' + esc(e.d) + '</time></li>'; }).join('') + '</ol></section>';
  }

  /* ---------- espace client ---------- */
  function rClient() {
    var cl = client(etat.client) || etat.clients[0];
    var mes = etat.reqs.filter(function (r) { return r.client === cl.id; });
    var r = req(etat.selC);
    if (!r || r.client !== cl.id) { r = mes[0] || null; etat.selC = r ? r.id : ''; }
    var opts = etat.clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cl.id ? ' selected' : '') + '>' + esc(libClient(c)) + '</option>'; }).join('');
    var liste = mes.length ? '<ul class="liste-dem">' + mes.map(function (m) {
      var a = actionClient(m);
      return '<li><button type="button" class="dem" data-sel="' + m.id + '" aria-current="' + (r && m.id === r.id ? 'true' : 'false') + '"><span class="ref">' + m.id + '</span><b>' + esc(titreDe(m)) + '</b>' + chip(m) + (a ? '<span class="att">Action attendue : ' + a + '</span>' : '') + '</button></li>';
    }).join('') + '</ul>' : '<p class="vide-app">Aucune demande pour ce compte. <button type="button" class="lien" data-vue="demande">Faire une première demande</button>.</p>';
    $('#p-client').innerHTML =
      '<div class="barre-compte"><div class="champ"><label for="cl-compte"><span>Compte client fictif</span></label><select id="cl-compte">' + opts + '</select></div><button type="button" class="btn btn--ligne" data-vue="demande">Nouvelle demande</button></div>' +
      '<div class="cl-grille"><section aria-labelledby="cl-t-liste"><h2 id="cl-t-liste" class="h-app">Mes demandes <span class="cpt">' + mes.length + '</span></h2>' + liste + '</section>' +
      '<section class="cl-detail" aria-labelledby="cl-titre" id="cl-detail">' + (r ? detailClient(r) : '<p class="vide-app">Sélectionnez ou créez une demande pour voir son suivi.</p>') + '</section></div>';
  }

  function detailClient(r) {
    var msg = etat.msgC ? '<p class="ok" role="status">' + esc(etat.msgC) + '</p>' : ''; etat.msgC = '';
    var h = '<header class="cartouche"><div><span class="etiq">Demande ' + r.id + '</span><h2 id="cl-titre" tabindex="-1" class="h-app">' + esc(titreDe(r)) + '</h2></div>' + chip(r) + '</header>' + msg + etapier(r);
    var box = '';
    if (r.statut === 'recue') box = '<p>Votre demande est reçue. L\'équipe va la qualifier : confirmer le besoin et l\'accès au local.</p><p class="aide">Prochaine étape côté gestion : « Qualifier ». <button type="button" class="lien" data-goto="gestion:' + r.id + '">Ouvrir la fiche côté gestion</button></p>';
    else if (r.statut === 'qualifiee') box = '<p>Votre demande est qualifiée. Un devis écrit est en préparation' + (r.tech ? ' ; ' + techNom(r.tech) + ' est affecté(e) à votre dossier' : '') + '.</p><p class="aide">Côté gestion : rédaction du devis par lignes. <button type="button" class="lien" data-goto="gestion:' + r.id + '">Ouvrir la fiche côté gestion</button></p>';
    else if (r.statut === 'devis') box = '<div class="decision"><h3>Votre décision sur le devis</h3><p>Le devis v' + r.version + ' est à accepter ou à refuser. La réponse est simulée et visible aussitôt côté gestion.</p><div class="nav-etape nav-etape--court"><button type="button" class="btn fl" data-act="accepter" data-id="' + r.id + '">Accepter le devis</button></div>' +
      '<details class="refus"><summary>Refuser le devis</summary><form data-form="refus" data-id="' + r.id + '" novalidate><div class="champ"><label for="refus-motif"><span>Motif du refus</span></label><select id="refus-motif" name="motif">' + MOTIFS.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></div><button type="submit" class="btn btn--ink">Confirmer le refus</button></form></details></div>';
    else if (r.statut === 'accepte') box = r.tech ? '<div class="decision"><h3>Choisissez votre créneau d\'intervention</h3>' + formCreneau(r) + '</div>' : '<p>Devis accepté. Aucun technicien n\'est encore affecté, les créneaux seront proposés dès l\'affectation.</p><p class="aide"><button type="button" class="lien" data-goto="gestion:' + r.id + '">Affecter un technicien côté gestion</button></p>';
    else if (r.statut === 'planifiee') box = '<div class="decision"><h3>Intervention planifiée</h3><p><strong>' + slotLib(r.slot) + '</strong> avec ' + techNom(r.tech) + '.</p><details class="refus"><summary>Changer de créneau</summary>' + formCreneau(r) + '</details></div>';
    else if (r.statut === 'intervention') box = '<p><strong>' + techNom(r.tech) + ' est sur site</strong> (' + slotLib(r.slot) + '). Le compte rendu sera disponible à la clôture, rédigé côté gestion.</p>';
    else if (r.statut === 'terminee') box = '<p>L\'intervention est terminée. Le compte rendu est ci-dessous.</p>';
    else box = '<p>Vous avez refusé ce devis (motif : ' + esc(r.motif.toLowerCase()) + '). La demande est clôturée sans suite.</p><p class="aide"><button type="button" class="lien" data-vue="demande">Faire une nouvelle demande</button></p>';
    h += '<div class="action-box">' + box + '</div>' + fiches(r);
    if (r.lignes.length && RANG[r.statut] >= 2 || (r.statut === 'refusee' && r.lignes.length)) h += '<section class="bloc-app" aria-labelledby="dv-t-' + r.id + '"><h3 id="dv-t-' + r.id + '">Devis v' + r.version + '</h3>' + tabDevis(r, 'Devis ' + r.id + ' version ' + r.version + ', montants en dirhams fictifs') + '</section>';
    return h + compteRendu(r) + journal(r);
  }

  function formCreneau(r) {
    var l = libres(r.tech, r.id);
    if (!l.length) return '<p class="note">Aucun créneau libre cette semaine pour ' + techNom(r.tech) + '. La gestion vous proposera une autre date.</p>';
    return '<form data-form="creneau" data-id="' + r.id + '" novalidate><fieldset class="choix"><legend>Créneaux libres de ' + techNom(r.tech) + ' cette semaine (' + l.length + ')</legend><div class="grille grille--3">' +
      l.map(function (s) { return '<label class="tuile"><input type="radio" name="creneau" value="' + s + '"' + (r.slot === s ? ' checked' : '') + '><span><b>' + slotLib(s) + '</b></span></label>'; }).join('') +
      '</div><p class="err" role="alert" hidden data-zone></p></fieldset><button type="submit" class="btn fl">' + (r.slot ? 'Confirmer le nouveau créneau' : 'Confirmer ce créneau') + '</button></form>';
  }

  /* ---------- gestion ---------- */
  function rGestion() {
    var ind = indicateurs();
    var filtre = etat.filtre;
    var opts = [['tous', 'Tous les techniciens'], ['aucun', 'Non affectées']].concat(TECHS.map(function (t) { return [t.id, t.nom]; }));
    var visibles = function (r) { return filtre === 'tous' || (filtre === 'aucun' ? !r.tech : r.tech === filtre); };
    var cols = STATUTS.map(function (s) {
      var rs = etat.reqs.filter(function (r) { return r.statut === s[0] && visibles(r); });
      return '<section class="col" aria-labelledby="col-' + s[0] + '"><h3 id="col-' + s[0] + '"><span>' + s[1] + '</span><span class="cpt">' + rs.length + '</span></h3>' + (rs.length ? '<ul>' + rs.map(carte).join('') + '</ul>' : '<p class="vide-col">Aucune demande</p>') + '</section>';
    }).join('');
    var ref = etat.reqs.filter(function (r) { return r.statut === 'refusee' && visibles(r); });
    var tableau = '<div class="outil"><div class="champ"><label for="g-filtre"><span>Technicien</span></label><select id="g-filtre">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === filtre ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div><p class="aide">Ouvrez une carte pour affecter, rédiger le devis ou changer le statut.</p></div>' +
      '<div class="board">' + cols + '</div>' +
      '<section class="col col--ref" aria-labelledby="col-refusee"><h3 id="col-refusee"><span>Devis refusé</span><span class="cpt">' + ref.length + '</span></h3>' + (ref.length ? '<ul>' + ref.map(carte).join('') + '</ul>' : '<p class="vide-col">Aucune demande</p>') + '</section>';
    $('#p-gestion').innerHTML =
      '<h2 class="sr" id="g-t">Gestion des demandes</h2><dl class="indic" aria-label="Indicateurs">' + ind.map(function (i) { return '<div><dt>' + i[0] + '</dt><dd>' + i[1] + '</dd><small>' + i[2] + '</small></div>'; }).join('') + '</dl>' +
      '<div class="gv" role="group" aria-label="Affichage de la gestion"><button type="button" data-gv="tableau" aria-pressed="' + (etat.gv === 'tableau') + '">Tableau des demandes</button><button type="button" data-gv="planning" aria-pressed="' + (etat.gv === 'planning') + '">Planning de la semaine</button></div>' +
      (etat.gv === 'tableau' ? tableau : planning());
  }

  function carte(r) {
    var c = client(r.client), a = actionGestion(r);
    return '<li><button type="button" class="carte" data-fiche="' + r.id + '"><span class="ref">' + r.id + '</span><b>' + esc(titreDe(r)) + '</b><span class="soc">' + esc(c ? c.societe || c.nom : '') + '</span><span class="meta">' + urgTag(r) + '<span>' + (r.tech ? esc(techNom(r.tech)) : 'Non affectée') + '</span></span>' + (r.lignes.length && RANG[r.statut] >= 1 ? '<span class="mt">' + mad(totaux(r).ttc) + ' TTC</span>' : '') + (a ? '<span class="att">Prochaine action : ' + a + '</span>' : '') + '</button></li>';
  }

  function planning() {
    var erreurP = etat.msgP; etat.msgP = '';
    var elig = etat.reqs.filter(function (r) { return r.statut === 'accepte' || r.statut === 'planifiee'; });
    var sel = etat.placer && req(etat.placer);
    var lignes = '';
    JOURS.forEach(function (j) {
      ['am', 'pm'].forEach(function (p) {
        var s = j[0] + '-' + p;
        lignes += '<tr class="' + (p === 'am' ? 'debut-jour' : '') + '"><th scope="row">' + j[1] + '<small>' + (p === 'am' ? 'matin' : 'après-midi') + '</small></th>' + TECHS.map(function (t) {
          var o = occupant(t.id, s);
          if (o) return '<td><button type="button" class="cel occ st-' + o.statut + '" data-fiche="' + o.id + '"><b>' + o.id + '</b><small>' + LIB[o.statut] + '</small></button></td>';
          if (BLOQUES[t.id + '|' + s]) return '<td><span class="cel blq">' + BLOQUES[t.id + '|' + s] + '</span></td>';
          if (sel) return '<td><button type="button" class="cel libre act" data-placer="' + t.id + '|' + s + '">Placer ici<span class="sr"> ' + sel.id + ' avec ' + t.nom + ', ' + slotLib(s) + '</span></button></td>';
          return '<td><span class="cel libre">Libre</span></td>';
        }).join('') + '</tr>';
      });
    });
    return '<div class="outil"><div class="champ"><label for="pl-placer"><span>Demande à placer</span></label><select id="pl-placer"><option value="">Aucune (consultation)</option>' + elig.map(function (r) { return '<option value="' + r.id + '"' + (r.id === etat.placer ? ' selected' : '') + '>' + r.id + ' · ' + esc(titreDe(r)) + (r.slot ? ' (déjà planifiée)' : '') + '</option>'; }).join('') + '</select></div>' +
      (erreurP ? '<p class="err" role="alert">' + esc(erreurP) + '</p>' : '') + '<p class="aide">' + (sel ? 'Cliquez sur une case libre pour placer ' + sel.id + ' : le technicien de la colonne est affecté. Les cases occupées ou indisponibles ne peuvent pas être choisies.' : 'Chaque technicien ne peut avoir qu\'une demande par demi-journée. Choisissez une demande acceptée pour la placer directement.') + '</p></div>' +
      '<table class="planning"><caption>Planning de la semaine du lundi 9 au samedi 14 novembre (fictif)</caption><thead><tr><th scope="col">Créneau</th>' + TECHS.map(function (t) { return '<th scope="col">' + t.nom + '<small>' + t.spe + '</small></th>'; }).join('') + '</tr></thead><tbody>' + lignes + '</tbody></table>';
  }

  /* ---------- fiche gestion (boîte de dialogue) ---------- */
  var dlg = $('#fiche');
  function rFiche(focusId) {
    var r = req(etat.fiche);
    if (!r || !dlg.open) return;
    var c = client(r.client);
    var msg = etat.msgF ? '<p class="ok" role="status">' + esc(etat.msgF) + '</p>' : ''; etat.msgF = '';
    var h = '<div class="dlg-tete"><header class="cartouche"><div><span class="etiq">Fiche demande</span><h2 id="fiche-titre" tabindex="-1" class="h-app">' + r.id + ' · ' + esc(titreDe(r)) + '</h2></div>' + chip(r) + '</header><button type="button" class="btn btn--ligne fermer" data-fermer="1">Fermer<span class="sr"> la fiche</span></button></div>' + msg + etapier(r);
    h += '<div class="action-box"><p><strong>Contact fictif :</strong> ' + esc(c.nom) + ' · ' + esc(c.tel) + ' · ' + esc(c.email) + '</p><p class="aide"><button type="button" class="lien" data-goto="client:' + r.id + '">Voir cette demande côté client</button></p></div>' + fiches(r);

    /* statut */
    var s = '';
    if (r.statut === 'recue') s = '<p>La demande vient d\'arriver. Qualifier confirme le besoin et ouvre la rédaction du devis.</p><button type="button" class="btn fl" data-act="qualifier" data-id="' + r.id + '">Qualifier la demande</button>';
    else if (r.statut === 'qualifiee') s = '<p>Rédigez le devis ci-dessous puis envoyez-le : le client pourra l\'accepter ou le refuser.</p>';
    else if (r.statut === 'devis') s = '<p>Le devis v' + r.version + ' attend la réponse du client. <button type="button" class="lien" data-goto="client:' + r.id + '">Répondre à sa place côté client (démonstration)</button></p>';
    else if (r.statut === 'accepte') s = '<p>Devis accepté. Affectez un technicien puis planifiez, ou laissez le client choisir son créneau.</p>';
    else if (r.statut === 'planifiee') s = '<p>Planifiée : ' + slotLib(r.slot) + ' avec ' + techNom(r.tech) + '.</p><button type="button" class="btn fl" data-act="demarrer" data-id="' + r.id + '">Démarrer l\'intervention</button>';
    else if (r.statut === 'intervention') s = '<p>Intervention en cours. Rédigez le compte rendu pour clôturer.</p>';
    else if (r.statut === 'terminee') s = '<p>Demande terminée, compte rendu remis au client.</p>';
    else s = '<p>Le client a refusé le devis (' + esc(r.motif.toLowerCase()) + '). Demande classée.</p>';
    h += '<section class="bloc-app" aria-labelledby="f-t-statut"><h3 id="f-t-statut">Statut</h3>' + s + '<p class="err" role="alert" hidden data-zone="statut"></p></section>';

    /* affectation et créneau */
    if (RANG[r.statut] <= 4 && r.statut !== 'refusee') {
      h += '<section class="bloc-app" aria-labelledby="f-t-aff"><h3 id="f-t-aff">Affectation</h3><form data-form="affecter" data-id="' + r.id + '" class="ligne-form" novalidate><div class="champ"><label for="f-tech"><span>Technicien</span></label><select id="f-tech" name="tech"><option value="">Choisir…</option>' +
        TECHS.map(function (t) { return '<option value="' + t.id + '"' + (r.tech === t.id ? ' selected' : '') + '>' + t.nom + ' · ' + t.spe + '</option>'; }).join('') + '</select></div><button type="submit" class="btn btn--ligne">Affecter</button></form><p class="err" role="alert" hidden data-zone="affecter"></p>';
      if (r.statut === 'accepte' || r.statut === 'planifiee') {
        var ls = r.tech ? libres(r.tech, r.id) : [];
        h += '<form data-form="planifier" data-id="' + r.id + '" class="ligne-form" novalidate><div class="champ"><label for="f-slot"><span>Créneau' + (r.tech ? ' de ' + techNom(r.tech) : '') + '</span></label><select id="f-slot" name="slot"' + (r.tech ? '' : ' disabled') + '><option value="">' + (r.tech ? 'Choisir un créneau libre…' : 'Affectez d\'abord un technicien') + '</option>' +
          ls.map(function (x) { return '<option value="' + x + '"' + (r.slot === x ? ' selected' : '') + '>' + slotLib(x) + '</option>'; }).join('') + '</select></div><button type="submit" class="btn btn--ligne">' + (r.slot ? 'Replanifier' : 'Planifier') + '</button></form><p class="err" role="alert" hidden data-zone="planifier"></p>';
      }
      h += '</section>';
    }

    /* devis */
    if (r.statut === 'qualifiee') h += editeurDevis(r);
    else if (r.lignes.length) h += '<section class="bloc-app" aria-labelledby="dv-t-' + r.id + '"><h3 id="dv-t-' + r.id + '">Devis v' + r.version + '</h3>' + tabDevis(r, 'Devis ' + r.id + ' version ' + r.version + ', montants en dirhams fictifs') + '</section>';

    /* compte rendu */
    if (r.statut === 'intervention') h += formCR(r); else h += compteRendu(r);
    h += journal(r) + '<div class="nav-etape nav-etape--court"><button type="button" class="btn btn--ligne" data-fermer="1">Fermer la fiche</button></div>';
    dlg.innerHTML = h;
    var cible = focusId && document.getElementById(focusId);
    (cible || $('#fiche-titre', dlg)).focus();
  }

  function ligneHtml(l, i) {
    var id = l.id;
    return '<div class="ligne" data-ligne="' + id + '"><div class="champ c-lib"><label for="' + id + '-lib"><span>Désignation</span></label><input id="' + id + '-lib" type="text" data-l="' + id + ':lib" value="' + esc(l.lib) + '" autocomplete="off"></div>' +
      '<div class="champ c-q"><label for="' + id + '-q"><span>Qté</span></label><input id="' + id + '-q" type="number" inputmode="numeric" min="1" step="1" data-l="' + id + ':q" value="' + esc(l.q) + '"></div>' +
      '<div class="champ c-p"><label for="' + id + '-p"><span>Prix unitaire HT (MAD)</span></label><input id="' + id + '-p" type="number" inputmode="numeric" min="1" step="1" data-l="' + id + ':p" value="' + esc(l.p) + '"></div>' +
      '<p class="c-t"><span class="sr">Total de la ligne ' + (i + 1) + ' : </span><output id="' + id + '-t">' + (estLigneOk(l) ? mad((+l.q) * (+l.p)) : '—') + '</output></p>' +
      '<button type="button" class="btn btn--ligne c-x" data-suppr="' + id + '">Retirer<span class="sr"> la ligne ' + (i + 1) + '</span></button></div>';
  }

  function totauxHtml(r) { var t = totaux(r); return '<div><dt>Total HT</dt><dd>' + mad(t.ht) + '</dd></div><div><dt>TVA 20 %</dt><dd>' + mad(t.tva) + '</dd></div><div class="ttc"><dt>Total TTC</dt><dd>' + mad(t.ttc) + '</dd></div>'; }

  function editeurDevis(r) {
    return '<section class="bloc-app" aria-labelledby="f-t-devis"><h3 id="f-t-devis">Rédaction du devis (brouillon)</h3>' +
      (r.lignes.length ? '' : '<p class="vide-app">Le devis est vide. Ajoutez des lignes, ou partez des lignes proposées pour ce besoin.</p>') +
      '<div class="lignes" id="lignes">' + r.lignes.map(ligneHtml).join('') + '</div>' +
      '<dl class="totaux" id="totaux" aria-live="polite" aria-label="Totaux du devis">' + totauxHtml(r) + '</dl>' +
      '<div class="ajout"><button type="button" class="btn btn--ligne" id="ajout" data-act="ligne" data-id="' + r.id + '">Ajouter une ligne vide</button>' +
      '<div class="champ"><label for="cat"><span>Ajouter une ligne type</span></label><select id="cat" data-cat="' + r.id + '"><option value="">Choisir…</option>' + CATALOGUE.map(function (c, i) { return '<option value="' + i + '">' + esc(c[0]) + ' · ' + mad(c[2]) + '</option>'; }).join('') + '</select></div>' +
      '<button type="button" class="btn btn--ligne" data-act="suggerer" data-id="' + r.id + '">Proposer des lignes pour ce besoin</button></div>' +
      '<p class="err" role="alert" hidden data-zone="devis"></p>' +
      '<div class="nav-etape nav-etape--court"><button type="button" class="btn fl" data-act="envoyer" data-id="' + r.id + '">Envoyer le devis au client</button></div></section>';
  }

  function formCR(r) {
    var b = etat.brouillon && etat.brouillon[r.id] || { constats: '', actions: '', pieces: '', duree: '', reco: '' };
    return '<section class="bloc-app" aria-labelledby="f-t-cr"><h3 id="f-t-cr">Compte rendu d\'intervention</h3><form data-form="cr" data-id="' + r.id + '" novalidate>' +
      '<div class="champ"><label for="cr-constats"><span>Constats</span></label><textarea id="cr-constats" name="constats" data-cr="constats">' + esc(b.constats) + '</textarea></div>' +
      '<div class="champ"><label for="cr-actions"><span>Actions réalisées</span></label><textarea id="cr-actions" name="actions" data-cr="actions">' + esc(b.actions) + '</textarea></div>' +
      '<div class="champ"><label for="cr-pieces"><span>Pièces remplacées</span></label><input id="cr-pieces" name="pieces" type="text" data-cr="pieces" value="' + esc(b.pieces) + '" autocomplete="off"></div>' +
      '<div class="champ"><label for="cr-duree"><span>Durée sur site, en heures</span></label><input id="cr-duree" name="duree" type="text" inputmode="decimal" data-cr="duree" value="' + esc(b.duree) + '" autocomplete="off"></div>' +
      '<div class="champ"><label for="cr-reco"><span>Recommandation (facultatif)</span></label><input id="cr-reco" name="reco" type="text" data-cr="reco" value="' + esc(b.reco) + '" autocomplete="off"></div>' +
      '<p class="err" role="alert" hidden data-zone="cr"></p><div class="nav-etape nav-etape--court"><button type="button" class="btn btn--ligne" data-act="modele-cr" data-id="' + r.id + '">Pré-remplir un compte rendu type</button><button type="submit" class="btn fl">Clôturer l\'intervention</button></div></form></section>';
  }

  /* ---------- rendu global ---------- */
  var TABS = ['demande', 'client', 'gestion'];
  function rTabs() {
    TABS.forEach(function (t) {
      var b = $('#tab-' + t), p = $('#p-' + t), on = etat.tab === t;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; p.hidden = !on;
    });
    var cl = client(etat.client);
    var nc = etat.reqs.filter(function (r) { return cl && r.client === cl.id && actionClient(r); }).length;
    var ng = etat.reqs.filter(function (r) { return actionGestion(r); }).length;
    $('#badge-client').textContent = nc ? nc + ' à traiter' : 'à jour';
    $('#badge-gestion').textContent = ng + ' à traiter';
  }
  function rEffet() {
    var e = etat.effet, z = $('#effet');
    if (!e) { z.innerHTML = '<b>Aucune action pour l\'instant.</b> Chaque action faite d\'un côté s\'affiche ici et change l\'autre vue.'; return; }
    z.innerHTML = '<b>Dernière action</b> ' + esc(e.texte) + ' ' + (etat.tab !== e.ou && e.id ? '<button type="button" class="lien" data-goto="' + e.ou + ':' + e.id + '">Voir côté ' + (e.ou === 'client' ? 'client' : 'gestion') + '</button>' : '');
  }
  function render(focusId) {
    var actif = document.activeElement && document.activeElement.id;
    rClient(); rGestion(); rTabs(); rEffet(); rFiche(focusId);
    if (focusId && !dlg.open) { var cible = document.getElementById(focusId); if (cible) cible.focus(); return; }
    if (!focusId && actif && !dlg.open) { var f = document.getElementById(actif); if (f && f !== document.activeElement && f.offsetParent !== null) f.focus(); }
  }
  var annoncer = function (t) { $('#app-annonce').textContent = ''; setTimeout(function () { $('#app-annonce').textContent = t; }, 30); };

  function aller(tab, id, focus) {
    etat.tab = tab;
    if (tab === 'client' && id) { var r = req(id); if (r) { etat.client = r.client; etat.selC = r.id; } }
    if (tab === 'gestion' && id) { etat.fiche = id; if (!dlg.open) { derniereOuverture = '#tab-gestion'; dlg.showModal(); } }
    else if (dlg.open) dlg.close();
    render();
    if (history.replaceState) history.replaceState(null, '', '#' + tab);
    if (focus) { var cible = tab === 'client' ? $('#cl-titre') || $('#tab-client') : tab === 'gestion' ? (dlg.open ? $('#fiche-titre') : $('#g-t') || $('#tab-gestion')) : $('#devis-titre'); if (cible) { if (!cible.hasAttribute('tabindex')) cible.tabIndex = -1; cible.focus(); } }
  }

  /* ---------- événements ---------- */
  function majTotaux(r) {
    $('#totaux').innerHTML = totauxHtml(r);
    r.lignes.forEach(function (l) { var o = document.getElementById(l.id + '-t'); if (o) o.textContent = estLigneOk(l) ? mad((+l.q) * (+l.p)) : '—'; });
  }
  function zoneErr(nom, msg, champ) {
    var z = dlg.querySelector('[data-zone="' + nom + '"]') || dlg.querySelector('[data-zone]');
    if (!z) return;
    z.textContent = msg; z.hidden = !msg;
    if (msg && champ) { var f = document.getElementById(champ); if (f) { f.setAttribute('aria-invalid', 'true'); f.focus(); } }
  }

  racine.addEventListener('click', function (e) {
    var b = e.target.closest('button, [data-goto]');
    if (!b || !racine.contains(b)) return;
    var d = b.dataset, r;
    if (d.tab) { aller(d.tab, null, false); return; }
    if (d.vue) { aller(d.vue, d.vue === 'client' ? (etat.reqs[etat.reqs.length - 1] || {}).id : null, d.vue !== 'demande'); if (d.vue === 'demande') { var t = $('#devis-titre'); if (t) t.focus(); } return; }
    if (d.goto) { var p = d.goto.split(':'); aller(p[0], p[1], true); return; }
    if (d.sel) { etat.selC = d.sel; render('cl-titre'); return; }
    if (d.fiche) { etat.fiche = d.fiche; derniereOuverture = '[data-fiche="' + d.fiche + '"]'; if (!dlg.open) dlg.showModal(); rFiche(); return; }
    if (d.fermer) { dlg.close(); return; }
    if (d.gv) { etat.gv = d.gv; render(); var g = $('[data-gv="' + d.gv + '"]'); if (g) g.focus(); return; }
    if (d.reset) { etat = graine(); if (dlg.open) dlg.close(); var rb = $('#devis-recommencer'); if (rb) rb.click(); render(); annoncer('Données de démonstration réinitialisées.'); return; }
    if (d.placer) {
      var q = d.placer.split('|'), rp = req(etat.placer);
      if (!rp) return;
      var res4 = A.placerEn(rp, q[0], q[1]);
      if (res4.err) { etat.msgP = res4.err; render(); annoncer(res4.err); return; }
      etat.placer = ''; render(); annoncer(rp.id + ' placée : ' + slotLib(q[1]) + ' avec ' + techNom(q[0]) + '.'); return;
    }
    if (d.suppr) {
      r = req(etat.fiche); if (!r) return;
      var i = r.lignes.map(function (l) { return l.id; }).indexOf(d.suppr);
      r.lignes.splice(i, 1); rFiche(r.lignes.length ? (r.lignes[Math.max(0, i - 1)].id + '-lib') : 'ajout');
      annoncer('Ligne retirée. Total mis à jour.'); return;
    }
    if (d.act) {
      r = req(d.id); if (!r) return;
      var res3;
      if (d.act === 'accepter') { res3 = A.repondre(r, true); etat.msgC = res3; render('cl-titre'); annoncer(res3); }
      else if (d.act === 'qualifier') { res3 = A.qualifier(r); etat.msgF = res3; render(); annoncer(res3); }
      else if (d.act === 'demarrer') { res3 = A.demarrer(r); if (res3.err) { zoneErr('statut', res3.err); return; } etat.msgF = res3; render(); annoncer(res3); }
      else if (d.act === 'ligne') { r.lignes.push({ id: 'n' + (++etat.nl), lib: '', q: '1', p: '' }); rFiche('n' + etat.nl + '-lib'); annoncer('Ligne ajoutée.'); }
      else if (d.act === 'suggerer') { (SUGGESTIONS[r.service] || []).forEach(function (s) { r.lignes.push({ id: 'n' + (++etat.nl), lib: s[0], q: String(s[1]), p: String(s[2]) }); }); rFiche('totaux'); annoncer('Lignes proposées ajoutées. Total ' + mad(totaux(r).ttc) + ' TTC.'); }
      else if (d.act === 'envoyer') { res3 = A.envoyer(r); if (res3.err) { zoneErr('devis', res3.err, res3.champ); return; } etat.msgF = res3; render(); annoncer(res3); }
      else if (d.act === 'modele-cr') {
        var m = { climatisation: ['Unités contrôlées, filtres encrassés, évacuation des condensats à surveiller.', 'Nettoyage des filtres et des siphons, contrôle des pressions, essais de fonctionnement.'], electricite: ['Tableau contrôlé, serrages à reprendre sur deux départs, repérage incomplet.', 'Serrages repris, départs repérés, essais de déclenchement des protections.'], maintenance: ['Équipements contrôlés, anomalies mineures relevées et consignées.', 'Réglages effectués, petits travaux réalisés, carnet de suivi mis à jour.'] }[r.service];
        etat.brouillon = etat.brouillon || {}; etat.brouillon[r.id] = { constats: m[0], actions: m[1], pieces: 'Aucune pièce remplacée', duree: '3', reco: 'Prochaine visite de contrôle dans trois mois.' };
        rFiche('cr-constats'); annoncer('Compte rendu type inséré, modifiable.');
      }
    }
  });
  racine.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    var r = req(f.dataset.id), res;
    if (f.dataset.form === 'refus') { res = A.repondre(r, false, f.elements.motif.value); etat.msgC = res; render('cl-titre'); annoncer(res); }
    else if (f.dataset.form === 'creneau') {
      var v = f.querySelector('input[name=creneau]:checked');
      if (!v) { var z = f.querySelector('[data-zone]'); z.textContent = 'Choisissez un créneau dans la liste.'; z.hidden = false; f.querySelector('input').focus(); return; }
      res = A.planifier(r, v.value, 'Client');
      if (res.err) { var z2 = f.querySelector('[data-zone]'); z2.textContent = res.err; z2.hidden = false; return; }
      etat.msgC = res; render('cl-titre'); annoncer(res);
    } else if (f.dataset.form === 'affecter') {
      res = A.affecter(r, f.elements.tech.value);
      if (res.err) { zoneErr('affecter', res.err, 'f-tech'); return; }
      etat.msgF = res; render(); annoncer(res);
    } else if (f.dataset.form === 'planifier') {
      res = A.planifier(r, f.elements.slot.value, 'Gestion');
      if (res.err) { zoneErr('planifier', res.err, 'f-slot'); return; }
      etat.msgF = res; render(); annoncer(res);
    } else if (f.dataset.form === 'cr') {
      res = A.cloturer(r, { constats: f.elements.constats.value, actions: f.elements.actions.value, pieces: f.elements.pieces.value, duree: f.elements.duree.value, reco: f.elements.reco.value });
      if (res.err) { zoneErr('cr', res.err, res.champ); return; }
      etat.msgF = res; render(); annoncer(res);
    }
  });
  racine.addEventListener('input', function (e) {
    var el = e.target, r = req(etat.fiche);
    if (el.dataset.l && r) {
      var p = el.dataset.l.split(':'), l = r.lignes.filter(function (x) { return x.id === p[0]; })[0];
      if (!l) return; l[p[1]] = el.value; el.removeAttribute('aria-invalid'); majTotaux(r);
    } else if (el.dataset.cr && r) { etat.brouillon = etat.brouillon || {}; var b = etat.brouillon[r.id] = etat.brouillon[r.id] || { constats: '', actions: '', pieces: '', duree: '', reco: '' }; b[el.dataset.cr] = el.value; }
  });
  racine.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'cl-compte') { etat.client = el.value; var m = etat.reqs.filter(function (r) { return r.client === el.value; })[0]; etat.selC = m ? m.id : ''; render('cl-compte'); }
    else if (el.id === 'g-filtre') { etat.filtre = el.value; render('g-filtre'); annoncer('Filtre appliqué : ' + el.options[el.selectedIndex].text + '.'); }
    else if (el.id === 'pl-placer') { etat.placer = el.value; render('pl-placer'); }
    else if (el.dataset.cat) {
      var r = req(el.dataset.cat), c = CATALOGUE[+el.value]; if (!r || !c) return;
      r.lignes.push({ id: 'n' + (++etat.nl), lib: c[0], q: String(c[1]), p: String(c[2]) }); rFiche('n' + etat.nl + '-lib'); annoncer('Ligne ajoutée : ' + c[0] + '. Total ' + mad(totaux(r).ttc) + ' TTC.');
    }
  });
  dlg.addEventListener('close', function () { if (dlg.open) return;   /* close arrive après coup : la fiche a pu être rouverte entre-temps */
    etat.fiche = ''; render(); var o = derniereOuverture && $(derniereOuverture); if (o && o.offsetParent !== null) o.focus(); else { var g = $('[data-gv]'); if (g && etat.tab === 'gestion') g.focus(); } });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* onglets, avec flèches */
  $('#tabs').addEventListener('keydown', function (e) {
    var i = TABS.indexOf(etat.tab), n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % 3; else if (e.key === 'ArrowLeft') n = (i + 2) % 3; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = 2; else return;
    e.preventDefault(); aller(TABS[n], null, false); $('#tab-' + TABS[n]).focus();
  });

  /* demande créée par le parcours de devis de cette page */
  document.addEventListener('mizan:demande', function (e) {
    var r = creer(e.detail.d);
    e.detail.numero = r.id;
    render(); annoncer('Demande ' + r.id + ' créée. Visible côté client et côté gestion.');
  });

  /* ---------- démarrage ---------- */
  etat = graine();
  var q = new URLSearchParams(location.search), ok = true;
  if (q.get('import') === '1') {
    var d = {}; ['service', 'nature', 'local', 'surface', 'urgence', 'description', 'nom', 'societe', 'email', 'tel'].forEach(function (k) { d[k] = (q.get(k) || '').trim(); });
    ok = !!(D.SERVICES[d.service] && D.NATURES[d.nature] && D.LOCAUX[d.local] && D.URGENCES[d.urgence] && /^\d{2,4}$/.test(d.surface) && d.description.length >= 15 && d.nom.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(d.email) && d.tel);
    if (ok) { var nr = creer(d); etat.tab = 'client'; etat.msgC = 'Demande ' + nr.id + ' reprise depuis le parcours de devis.'; }
    if (history.replaceState) history.replaceState(null, '', location.pathname + (ok ? '#client' : ''));
  } else if (/^#(demande|client|gestion)$/.test(location.hash)) etat.tab = location.hash.slice(1);
  document.getElementById('app').hidden = false;
  $('#sansjs-app').hidden = true;
  var sj = $('#devis-sansjs'); if (sj) sj.hidden = true;
  render();
  if (!ok) { etat.effet = { texte: 'Les paramètres de demande reçus n\'étaient pas valides : ils ont été ignorés.', ou: etat.tab, id: '' }; rEffet(); }
})();
