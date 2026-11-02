/* Institut Naïa (démonstration fictive) : moteur de réservation.
   Aucune requête, aucun stockage : tout vit en mémoire et repart de zéro au rechargement.
   Les rendez-vous « déjà pris » sont générés de façon déterministe à partir de la date. */
(function (racine) {
  'use strict';

  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function cle(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function depuis(k) { var a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12); }
  function plus(k, n) { var d = depuis(k); d.setDate(d.getDate() + n); return cle(d); }
  function numJour(k) { var a = k.split('-').map(Number); return Math.floor(Date.UTC(a[0], a[1] - 1, a[2]) / 864e5); }
  function dow(k) { return depuis(k).getDay(); }
  function hhmm(m) { return p2(Math.floor(m / 60)) + ':' + p2(m % 60); }
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function telDe(nom) { var h = hash(nom); return '06 00 00 ' + p2(h % 100) + ' ' + p2(Math.floor(h / 100) % 100); }
  function cleTel(t) { return String(t).replace(/[\s.\-()]/g, '').replace(/^\+212/, '0'); }

  var CATEGORIES = [
    { id: 'visage', nom: 'Visage' },
    { id: 'corps', nom: 'Corps' },
    { id: 'mains', nom: 'Mains et pieds' },
    { id: 'rituels', nom: 'Rituels' },
    { id: 'forfaits', nom: 'Forfaits' }
  ];

  var SERVICES = [
    { id: 'v1', cat: 'visage', nom: 'Soin éclat express', desc: 'Nettoyage doux, masque à l’argile rose, crème de finition.', duree: 30, prix: 250 },
    { id: 'v2', cat: 'visage', nom: 'Soin hydratation profonde', desc: 'Gommage, sérum à l’acide hyaluronique, massage du visage.', duree: 60, prix: 450 },
    { id: 'v3', cat: 'visage', nom: 'Nettoyage de peau complet', desc: 'Vapeur, extraction, masque apaisant à la camomille.', duree: 75, prix: 520 },
    { id: 'c1', cat: 'corps', nom: 'Massage dos et nuque', desc: 'Huile tiède d’argan, pressions lentes sur les trapèzes.', duree: 30, prix: 280 },
    { id: 'c2', cat: 'corps', nom: 'Massage relaxant', desc: 'Corps entier, huile de sésame, rythme lent.', duree: 60, prix: 500 },
    { id: 'c3', cat: 'corps', nom: 'Gommage et enveloppement', desc: 'Savon noir, gant de crin, enveloppement au rhassoul.', duree: 45, prix: 380 },
    { id: 'm1', cat: 'mains', nom: 'Pose de vernis', desc: 'Mise en forme et vernis au choix.', duree: 30, prix: 120 },
    { id: 'm2', cat: 'mains', nom: 'Manucure soin', desc: 'Bain de mains, cuticules, massage, vernis ou finition mate.', duree: 45, prix: 200 },
    { id: 'm3', cat: 'mains', nom: 'Pédicure soin', desc: 'Bain de pieds, gommage, limage, massage des voûtes.', duree: 60, prix: 280 },
    { id: 'r1', cat: 'rituels', nom: 'Rituel Naïa', desc: 'Gommage, massage du corps et soin du visage, thé à la menthe.', duree: 90, prix: 780 },
    { id: 'r2', cat: 'rituels', nom: 'Rituel détente', desc: 'Massage du dos, soin du visage express, infusion.', duree: 60, prix: 520 },
    { id: 'f1', cat: 'forfaits', nom: 'Forfait Escale', desc: 'Hydratation profonde du visage, puis massage du dos et de la nuque.', duree: 90, prix: 680, valeur: 730, pracs: ['ha'] },
    { id: 'f2', cat: 'forfaits', nom: 'Forfait mains et pieds', desc: 'Manucure soin et pédicure soin à la suite, dans le même fauteuil.', duree: 105, prix: 440, valeur: 480, pracs: ['sa', 'ha'] },
    { id: 'f3', cat: 'forfaits', nom: 'Forfait Naïa complet', desc: 'Nettoyage de peau complet, puis massage relaxant et thé à la menthe.', duree: 135, prix: 890, valeur: 1020, pracs: ['ha'] }
  ];

  var OPTIONS = [
    { id: 'o1', cats: ['visage'], nom: 'Masque LED apaisant', duree: 15, prix: 120 },
    { id: 'o2', cats: ['visage'], nom: 'Contour des yeux', duree: 15, prix: 90 },
    { id: 'o3', cats: ['visage', 'rituels', 'forfaits'], nom: 'Massage du cuir chevelu', duree: 15, prix: 80 },
    { id: 'o4', cats: ['corps', 'rituels', 'forfaits'], nom: 'Pierres chaudes', duree: 30, prix: 150 },
    { id: 'o5', cats: ['corps'], nom: 'Gommage express du dos', duree: 15, prix: 100 },
    { id: 'o6', cats: ['mains', 'forfaits'], nom: 'Bain de paraffine', duree: 15, prix: 90 },
    { id: 'o7', cats: ['mains'], nom: 'Décor sur deux ongles', duree: 15, prix: 60 },
    { id: 'o8', cats: ['visage', 'corps', 'mains', 'rituels', 'forfaits'], nom: 'Thé à la menthe et douceurs', duree: 0, prix: 40 }
  ];

  var TAUX_ACOMPTE = 30, DELAI_REMB = 24;

  var PRACS = [
    { id: 'sa', nom: 'Salma', titre: 'Esthéticienne', cats: ['visage', 'mains', 'rituels', 'forfaits'], jours: [1, 2, 4, 5, 6], note: 'Soins du visage, mains, rituels' },
    { id: 'in', nom: 'Inès', titre: 'Praticienne de massage', cats: ['corps', 'rituels'], jours: [2, 3, 4, 5, 6], note: 'Massages, soins du corps, rituels' },
    { id: 'ha', nom: 'Hanane', titre: 'Esthéticienne', cats: ['visage', 'mains', 'corps', 'forfaits'], jours: [1, 3, 4, 5, 6], note: 'Visage, corps, mains et pieds' }
  ];

  var STATUTS = [
    { id: 'confirme', nom: 'Confirmé' },
    { id: 'arrive', nom: 'Arrivé' },
    { id: 'termine', nom: 'Terminé' },
    { id: 'absent', nom: 'Absent' },
    { id: 'annule', nom: 'Annulé' },
    { id: 'propose', nom: 'Proposé' }
  ];

  var ROSTER = [
    { nom: 'Salwa K.', pref: 'sa', notes: ['Peau sensible : éviter les huiles aux agrumes.', 'Aime le thé sans sucre.'] },
    { nom: 'Hajar M.', pref: 'in', notes: ['Préfère les matinées. Pièce plutôt fraîche.'] },
    { nom: 'Lina R.', pref: 'ha', notes: ['Allergie au latex : gants en nitrile.'] },
    { nom: 'Oumaima T.', pref: 'sa', notes: ['Cliente du rituel Naïa, vient une fois par saison.'] },
    { nom: 'Chaymae D.', pref: 'in', notes: ['Grossesse déclarée : massage adapté, pas de pierres chaudes.'] },
    { nom: 'Rania F.', pref: 'ha', notes: ['Prend souvent deux soins le même jour.'] },
    { nom: 'Nour A.', pref: 'sa', notes: [] },
    { nom: 'Siham L.', pref: 'ha', notes: ['Préfère être appelée avant tout changement.'] }
  ];
  ROSTER.forEach(function (c, i) { c.tel = '06 00 01 00 ' + p2(i + 1); });

  var PAUSE = [780, 870];                       // 13:00 – 14:30
  var HORAIRES = { 1: [540, 1140], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [540, 1020] };
  /* Fermetures. Annuelles : jours fériés civils à date fixe au Maroc (décret n° 2.77.169 complété, dont le 14 janvier depuis 2024 et le 31 octobre depuis 2025 ;
     à revérifier sur le texte officiel avant tout usage réel). Datées : fêtes religieuses, qui suivent le calendrier lunaire et l'annonce officielle,
     et fermetures exceptionnelles de l'institut. Aucune date religieuse n'est inventée : la liste reste vide tant qu'on ne la renseigne pas
     avec Naia.configurerFermetures({ 'AAAA-MM-JJ': 'libellé' }), à appeler avant Naia.creer(). */
  var ANNUELLES = {
    '01-01': 'Nouvel An', '01-11': 'Manifeste de l’indépendance', '01-14': 'Nouvel An amazigh', '05-01': 'Fête du travail',
    '07-30': 'Fête du Trône', '08-14': 'Allégeance d’Oued Eddahab', '08-20': 'Révolution du roi et du peuple', '08-21': 'Fête de la jeunesse',
    '10-31': 'Fête de l’Unité', '11-06': 'Marche verte', '11-18': 'Fête de l’indépendance'
  };
  var DATEES = Object.create(null);
  function fermeture(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return null;
    if (DATEES[k]) return DATEES[k];
    return Object.prototype.hasOwnProperty.call(ANNUELLES, k.slice(5)) ? ANNUELLES[k.slice(5)] : null;
  }
  /* remplace les fermetures datées ; renvoie les entrées refusées (date inexistante ou libellé vide) */
  function configurerFermetures(liste) {
    var refusees = [];
    DATEES = Object.create(null);
    Object.keys(liste || {}).forEach(function (k) {
      var v = String(liste[k] == null ? '' : liste[k]).trim().slice(0, 60);
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && cle(depuis(k)) === k && v) DATEES[k] = v; else refusees.push(k);
    });
    return refusees;
  }
  var PAS = 30;

  var PRENOMS = ['Nadia', 'Lamia', 'Sofia', 'Imane', 'Rita', 'Meryem', 'Dounia', 'Kenza', 'Yasmine', 'Aya', 'Zineb', 'Ghita', 'Leïla', 'Soraya', 'Amina', 'Houda', 'Najwa', 'Sanae', 'Wafa', 'Inas'];
  var INITIALES = 'ABCDEFGHJKLMNRSTZ';

  function svc(id) { for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; return null; }
  function opt(id) { for (var i = 0; i < OPTIONS.length; i++) if (OPTIONS[i].id === id) return OPTIONS[i]; return null; }
  function prac(id) { for (var i = 0; i < PRACS.length; i++) if (PRACS[i].id === id) return PRACS[i]; return null; }
  function peut(p, s) { return p.cats.indexOf(s.cat) >= 0 && (!s.pracs || s.pracs.indexOf(p.id) >= 0); }
  function acompteDe(prix) { return Math.ceil(prix * TAUX_ACOMPTE / 100 / 10) * 10; }

  /* durée, prix et acompte d’un soin avec ses options */
  function devis(service, ids) {
    var s = typeof service === 'string' ? svc(service) : service, d = s ? s.duree : 0, p = s ? s.prix : 0, os = [];
    (ids || []).forEach(function (id) {
      var o = opt(id);
      if (o && s && o.cats.indexOf(s.cat) >= 0) { os.push(o); d += o.duree; p += o.prix; }
    });
    return { service: s, options: os, duree: d, prix: p, acompte: acompteDe(p) };
  }

  function horaire(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return { ouvert: false, raison: 'Choisissez une date' };   // champ de date vidé au clavier
    var w = dow(k);
    if (w === 0) return { ouvert: false, raison: 'Fermé le dimanche' };
    var f = fermeture(k);
    if (f) return { ouvert: false, raison: 'Institut fermé (' + f + ')' };
    var h = HORAIRES[w];
    return { ouvert: true, ouverture: h[0], fermeture: h[1], segments: [[h[0], PAUSE[0]], [PAUSE[1], h[1]]] };
  }

  function creer(maintenant) {
    maintenant = maintenant || function () { return new Date(); };
    var jours = {}, parId = {}, compteur = 1000, seq = 0, attente = [], notes = {}, noteSeq = 0;

    function aujourdhui() { return cle(maintenant()); }
    function minutesMaintenant() { var n = maintenant(); return n.getHours() * 60 + n.getMinutes(); }
    function travaille(p, k) { return horaire(k).ouvert && prac(p).jours.indexOf(dow(k)) >= 0; }
    function chevauche(a, b, c, d) { return a < d && c < b; }

    /* heures entre maintenant et le début d’un rendez-vous */
    function heuresAvant(r) { return ((numJour(r.cle) - numJour(aujourdhui())) * 1440 + r.debut - minutesMaintenant()) / 60; }

    /* ce qui occupe une plage pour une praticienne : le rendez-vous ou le bloc en cause */
    function obstacle(p, k, a, b, ignorer) {
      var j = jour(k), i;
      for (i = 0; i < j.rdvs.length; i++) {
        var r = j.rdvs[i];
        if (r.prac === p && r.statut !== 'annule' && r.id !== ignorer && chevauche(a, b, r.debut, r.fin)) return { rdv: r };
      }
      for (i = 0; i < j.blocs.length; i++) {
        var bl = j.blocs[i];
        if ((bl.prac === p || bl.prac === 'all') && chevauche(a, b, bl.debut, bl.fin)) return { bloc: bl };
      }
      return null;
    }
    function libre(p, k, a, b, ignorer) { return !obstacle(p, k, a, b, ignorer); }

    function dansSegment(k, a, b) {
      var h = horaire(k);
      if (!h.ouvert) return false;
      return h.segments.some(function (s) { return a >= s[0] && b <= s[1]; });
    }

    function nouveauRdv(o) {
      var dv = devis(o.service, o.options), s = dv.service;
      seq++;
      var r = {
        id: 'r' + seq, ref: o.ref || ('NA-' + o.cle.replace(/-/g, '').slice(2) + '-' + (++compteur)),
        cle: o.cle, debut: o.debut, fin: o.debut + dv.duree, service: s.id, options: dv.options.map(function (x) { return x.id; }),
        duree: dv.duree, prix: dv.prix, prac: o.prac,
        client: o.client, statut: o.statut || 'confirme', source: o.source || 'seed',
        acompte: o.acompte ? { montant: o.acompte, etat: 'verse' } : null
      };
      jour(o.cle).rdvs.push(r); parId[r.id] = r;
      return r;
    }

    function jour(k) {
      if (jours[k]) return jours[k];
      var j = { rdvs: [], blocs: [] };
      jours[k] = j;
      var h = horaire(k);
      if (!h.ouvert) return j;
      var n = numJour(k), r = mulberry(n * 7919 + 17), today = aujourdhui(), nowM = minutesMaintenant();
      var charge = (n % 9 === 4) ? 1 : [0.3, 0.45, 0.6, 0.75, 0.9][Math.floor(r() * 5)];
      var travailleuses = PRACS.filter(function (p) { return travaille(p.id, k); });
      var carte = SERVICES.filter(function (s) { return s.cat !== 'forfaits'; });
      if (n % 11 === 0 && travailleuses.length) {
        var pb = travailleuses[Math.floor(r() * travailleuses.length)];
        var bid = 'b' + (++seq);
        var bl = { id: bid, prac: pb.id, cle: k, debut: 870, fin: 990, motif: 'Formation interne (fictive)', source: 'seed' };
        j.blocs.push(bl); parId[bid] = bl;
      }
      travailleuses.forEach(function (p) {
        h.segments.forEach(function (seg) {
          var t = seg[0];
          while (t + PAS <= seg[1]) {
            if (r() >= charge) { t += PAS; continue; }
            var opts = carte.filter(function (s) {
              return p.cats.indexOf(s.cat) >= 0 && t + s.duree <= seg[1] && libre(p.id, k, t, t + s.duree);
            });
            if (!opts.length) { t += PAS; continue; }
            var s = opts[Math.floor(r() * opts.length)];
            var nom = PRENOMS[Math.floor(r() * PRENOMS.length)] + ' ' + INITIALES[Math.floor(r() * INITIALES.length)] + '.';
            r();                                   // conserve la suite pseudo-aléatoire d’origine
            var tel = telDe(nom);
            // une cliente de la liste de fiches revient de temps en temps
            if ((n + t / PAS) % 23 === 0) {
              var c = ROSTER[(n + t / PAS * 3) % ROSTER.length], deja = j.rdvs.some(function (x) { return x.client.tel === c.tel; });
              if (!deja) { nom = c.nom; tel = c.tel; }
            }
            var st = 'confirme';
            if (k < today) st = r() < 0.08 ? 'absent' : 'termine';
            else if (k === today) {
              if (t + s.duree <= nowM) st = r() < 0.08 ? 'absent' : 'termine';
              else if (t <= nowM) st = 'arrive';
            }
            if (charge < 1 && k >= today && r() < 0.07) st = 'annule';
            var ac = (st === 'confirme' && (n + t / PAS) % 3 === 0) ? acompteDe(s.prix) : 0;
            nouveauRdv({ cle: k, debut: t, service: s.id, prac: p.id, client: { nom: nom, tel: tel }, statut: st, source: 'seed', acompte: ac, ref: 'NA-' + k.replace(/-/g, '').slice(2) + '-' + p.id.toUpperCase() + (t / 30) });
            t = Math.ceil((t + s.duree) / PAS) * PAS;
          }
        });
      });
      return j;
    }

    function debutsPrac(p, k, duree, delai, ignorer) {
      if (!travaille(p, k)) return [];
      var today = aujourdhui();
      if (k < today) return [];
      var mini = k === today ? minutesMaintenant() + (delai == null ? 60 : delai) : 0;
      var h = horaire(k), res = [];
      h.segments.forEach(function (seg) {
        for (var t = seg[0]; t + duree <= seg[1]; t += PAS) {
          if (t >= mini && libre(p, k, t, t + duree, ignorer)) res.push(t);
        }
      });
      return res;
    }

    function eligibles(service, pracId) {
      var s = typeof service === 'string' ? svc(service) : service;
      var liste = (pracId && pracId !== 'any') ? [prac(pracId)] : PRACS;
      return liste.filter(function (p) { return p && peut(p, s); });
    }

    /* `duree` : durée totale (soin + options) ; à défaut, celle du soin seul */
    function creneaux(k, service, pracId, delai, duree) {
      var s = typeof service === 'string' ? svc(service) : service, d = duree || s.duree;
      var map = {};
      eligibles(s, pracId).forEach(function (p) {
        debutsPrac(p.id, k, d, delai).forEach(function (t) { (map[t] = map[t] || []).push(p.id); });
      });
      return Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return { debut: t, pracs: map[t] }; });
    }

    function charges(k, id) { return jour(k).rdvs.filter(function (r) { return r.prac === id && r.statut !== 'annule'; }).length; }

    function affecter(k, debut, service, pracId, delai, duree) {
      var c = creneaux(k, service, pracId, delai, duree).filter(function (x) { return x.debut === debut; })[0];
      if (!c) return null;
      if (pracId && pracId !== 'any') return pracId;
      return c.pracs.slice().sort(function (a, b) { return charges(k, a) - charges(k, b); })[0];
    }

    function disponibilite(k, service, pracId, duree) {
      if (k < aujourdhui()) return { etat: 'passe', n: 0, texte: 'Date passée' };
      var h = horaire(k);
      if (!h.ouvert) return { etat: 'ferme', n: 0, texte: h.raison };
      var s = service ? (typeof service === 'string' ? svc(service) : service) : SERVICES[0];
      var el = eligibles(s, pracId);
      if (!el.some(function (p) { return travaille(p.id, k); })) return { etat: 'indispo', n: 0, texte: 'Aucune praticienne ce jour pour ce choix' };
      var n = creneaux(k, s, pracId, null, duree).length;
      if (!n) return { etat: 'complet', n: 0, texte: 'Complet' };
      return { etat: 'libre', n: n, texte: n + (n > 1 ? ' créneaux' : ' créneau') };
    }

    function reserver(o) {
      var dv = devis(o.service, o.options), s = dv.service;
      if (!s) return { ok: false, erreur: 'Soin inconnu.' };
      var p = affecter(o.cle, o.debut, s, o.prac, o.delai, dv.duree);
      if (!p || !libre(p, o.cle, o.debut, o.debut + dv.duree) || !dansSegment(o.cle, o.debut, o.debut + dv.duree)) {
        return { ok: false, erreur: 'Ce créneau n’est plus disponible.' };
      }
      return { ok: true, rdv: nouveauRdv({ cle: o.cle, debut: o.debut, service: s.id, options: o.options, prac: p, client: o.client, source: o.source || 'client', acompte: o.acompte ? dv.acompte : 0 }) };
    }

    /* ---------- acompte simulé ---------- */
    function sortAcompte(r, motif) {
      var a = r.acompte; if (!a) return null;
      if (motif === 'annule') {
        var h = heuresAvant(r);
        a.heures = Math.round(h * 10) / 10;
        a.etat = h >= DELAI_REMB ? 'rembourse' : 'conserve';
      } else if (motif === 'absent') a.etat = 'conserve';
      else a.etat = 'verse';
      return a;
    }

    /* ---------- liste d’attente ---------- */
    function fileJour(k) { return attente.filter(function (e) { return e.cle === k; }).sort(function (a, b) { return a.rang - b.rang; }); }
    function actives(k) { return fileJour(k).filter(function (e) { return e.statut === 'attente' || e.statut === 'propose'; }); }

    function rejoindre(o) {
      var dv = devis(o.service, o.options);
      if (!dv.service) return { ok: false, erreur: 'Soin inconnu.' };
      if (disponibilite(o.cle, dv.service, o.prac, dv.duree).etat !== 'complet') return { ok: false, erreur: 'Ce jour n’est pas complet pour ce choix : réservez directement.' };
      var tel = cleTel(o.client.tel);
      if (actives(o.cle).some(function (e) { return cleTel(e.client.tel) === tel; })) return { ok: false, erreur: 'Ce numéro est déjà sur la liste d’attente de ce jour.' };
      var e = { id: 'w' + (++seq), rang: seq, cle: o.cle, service: dv.service.id, options: dv.options.map(function (x) { return x.id; }), duree: dv.duree, prix: dv.prix, prac: o.prac || 'any', client: o.client, source: o.source || 'client', statut: 'attente', rdv: null };
      attente.push(e);
      return { ok: true, entree: e, rang: actives(o.cle).indexOf(e) + 1 };
    }

    /* un créneau vient de se libérer : on le propose à la première personne en attente à qui il convient */
    function liberer(k, debutLibre, finLibre, pracLibre) {
      var file = fileJour(k).filter(function (e) { return e.statut === 'attente'; });
      for (var i = 0; i < file.length; i++) {
        var e = file[i];
        var cr = creneaux(k, e.service, e.prac, 0, e.duree).filter(function (c) {
          return c.pracs.indexOf(pracLibre) >= 0 && c.debut < finLibre && debutLibre < c.debut + e.duree;
        });
        if (!cr.length) continue;
        var r = nouveauRdv({ cle: k, debut: cr[0].debut, service: e.service, options: e.options, prac: pracLibre, client: e.client, statut: 'propose', source: 'attente' });
        e.statut = 'propose'; e.rdv = r.id;
        return e;
      }
      return null;
    }

    function repondre(id, accepte, o) {
      var e = attente.filter(function (x) { return x.id === id; })[0];
      if (!e || e.statut !== 'propose') return { ok: false, erreur: 'Cette proposition n’est plus valable.' };
      var r = parId[e.rdv];
      if (accepte) {
        r.statut = 'confirme'; r.source = e.source;
        if (!(o && o.sansAcompte)) r.acompte = { montant: acompteDe(r.prix), etat: 'verse' };
        e.statut = 'accepte';
        return { ok: true, entree: e, rdv: r };
      }
      var j = jour(r.cle);
      j.rdvs = j.rdvs.filter(function (x) { return x.id !== r.id; }); delete parId[r.id];
      e.statut = (o && o.expire) ? 'expire' : 'refuse'; e.rdv = null;
      return { ok: true, entree: e, suivante: liberer(r.cle, r.debut, r.fin, r.prac) };
    }

    function quitter(id) {
      var e = attente.filter(function (x) { return x.id === id; })[0];
      if (!e || (e.statut !== 'attente' && e.statut !== 'propose')) return { ok: false };
      if (e.statut === 'propose') return repondre(id, false);
      e.statut = 'retire';
      return { ok: true, entree: e };
    }

    function changerStatut(id, st) {
      var r = parId[id];
      if (!r || !r.fin) return { ok: false, erreur: 'Rendez-vous introuvable.' };
      if (r.statut === 'annule' && st !== 'annule' && !libre(r.prac, r.cle, r.debut, r.fin, r.id)) {
        return { ok: false, erreur: 'Impossible de rétablir ce rendez-vous : le créneau a été repris.' };
      }
      var avant = r.statut;
      if (st === avant) return { ok: true, rdv: r, offre: null };   // réappliquer le même statut ne touche ni à l'acompte ni au créneau
      r.statut = st;
      var res = { ok: true, rdv: r, offre: null };
      if (st === 'annule' && avant !== 'annule') { sortAcompte(r, 'annule'); res.offre = liberer(r.cle, r.debut, r.fin, r.prac); }
      else if (st === 'absent') sortAcompte(r, 'absent');
      else if (avant === 'annule' || avant === 'absent') sortAcompte(r, 'retabli');
      return res;
    }

    /* ---------- déplacement : jamais de chevauchement ---------- */
    function deplacer(id, o, essai) {
      var r = parId[id];
      if (!r || !r.fin) return { ok: false, erreur: 'Rendez-vous introuvable.' };
      if (r.statut !== 'confirme') return { ok: false, erreur: 'Seul un rendez-vous confirmé peut être déplacé.' };
      var k = o.cle || r.cle, p = o.prac || r.prac, d = o.debut == null ? r.debut : o.debut, f = d + r.duree, s = svc(r.service);
      if (k === r.cle && p === r.prac && d === r.debut) return { ok: false, erreur: 'Le rendez-vous est déjà à cette place.' };
      if (k < aujourdhui() || (k === aujourdhui() && d < minutesMaintenant())) return { ok: false, erreur: 'Ce créneau est déjà passé.' };
      if (!horaire(k).ouvert) return { ok: false, erreur: horaire(k).raison + '.' };
      if (!prac(p) || !peut(prac(p), s)) return { ok: false, erreur: (prac(p) ? prac(p).nom : 'Cette praticienne') + ' ne réalise pas ce soin.' };
      if (!travaille(p, k)) return { ok: false, erreur: prac(p).nom + ' ne travaille pas ce jour-là.' };
      if (!dansSegment(k, d, f)) return { ok: false, erreur: 'Le soin (' + hhmm(d) + ' – ' + hhmm(f) + ') sortirait des horaires ou tomberait sur la pause.' };
      var ob = obstacle(p, k, d, f, r.id);
      if (ob) return { ok: false, erreur: ob.rdv ? 'Chevauche le rendez-vous de ' + ob.rdv.client.nom + ' (' + hhmm(ob.rdv.debut) + ' – ' + hhmm(ob.rdv.fin) + ').' : 'Chevauche un créneau bloqué (' + hhmm(ob.bloc.debut) + ' – ' + hhmm(ob.bloc.fin) + ').' };
      if (essai) return { ok: true, rdv: r, fin: f };   // simple vérification, rien n’est modifié
      var ancien = { cle: r.cle, debut: r.debut, fin: r.fin, prac: r.prac };
      var jA = jour(r.cle); jA.rdvs = jA.rdvs.filter(function (x) { return x.id !== r.id; });
      r.cle = k; r.prac = p; r.debut = d; r.fin = f; r.deplace = (r.deplace || 0) + 1; r.ancien = ancien; r.rappel = null;
      jour(k).rdvs.push(r);
      return { ok: true, rdv: r, ancien: ancien, offre: liberer(ancien.cle, ancien.debut, ancien.fin, ancien.prac) };
    }

    function bloquer(o) {
      var cibles = o.prac === 'all' ? PRACS.map(function (p) { return p.id; }) : [o.prac];
      if (!horaire(o.cle).ouvert) return { ok: false, erreur: 'L’institut est fermé ce jour-là.' };
      if (o.cle < aujourdhui()) return { ok: false, erreur: 'Impossible de bloquer une date passée.' };
      if (!(o.fin > o.debut)) return { ok: false, erreur: 'La fin doit être après le début.' };
      var j = jour(o.cle);
      var conflits = j.rdvs.filter(function (r) { return cibles.indexOf(r.prac) >= 0 && r.statut !== 'annule' && chevauche(o.debut, o.fin, r.debut, r.fin); });
      if (conflits.length) {
        return { ok: false, erreur: conflits.length + (conflits.length > 1 ? ' rendez-vous occupent' : ' rendez-vous occupe') + ' déjà cette plage. Annulez-' + (conflits.length > 1 ? 'les' : 'le') + ' d’abord.', conflits: conflits };
      }
      var id = 'b' + (++seq);
      var bl = { id: id, prac: o.prac, cle: o.cle, debut: o.debut, fin: o.fin, motif: o.motif || 'Indisponible', source: 'manuel' };
      j.blocs.push(bl); parId[id] = bl;
      return { ok: true, bloc: bl };
    }

    function debloquer(id) {
      var b = parId[id];
      if (!b || b.fin == null || b.service) return { ok: false };
      var j = jour(b.cle);
      j.blocs = j.blocs.filter(function (x) { return x.id !== id; });
      delete parId[id];
      return { ok: true };
    }

    /* ---------- indicateurs ---------- */
    function indicateurs(k, filtre) {
      var h = horaire(k), j = jour(k);
      var res = { rdv: 0, annules: 0, absents: 0, termines: 0, occupe: 0, dispo: 0, taux: 0, montant: 0, acompte: 0, rembourse: 0, options: 0, deplaces: 0, propose: 0 };
      if (!h.ouvert) return res;
      PRACS.forEach(function (p) {
        if (filtre && filtre !== 'all' && p.id !== filtre) return;
        if (!travaille(p.id, k)) return;
        var dispo = 0;
        h.segments.forEach(function (s) {
          var l = s[1] - s[0];
          j.blocs.forEach(function (b) {
            if (b.prac === p.id || b.prac === 'all') l -= Math.max(0, Math.min(s[1], b.fin) - Math.max(s[0], b.debut));
          });
          dispo += Math.max(0, l);
        });
        res.dispo += dispo;
        j.rdvs.forEach(function (r) {
          if (r.prac !== p.id) return;
          if (r.statut === 'propose') { res.propose++; res.occupe += r.fin - r.debut; return; }
          if (r.acompte) { if (r.acompte.etat === 'rembourse') res.rembourse += r.acompte.montant; else res.acompte += r.acompte.montant; }
          if (r.statut === 'annule') { res.annules++; return; }
          res.rdv++; res.occupe += r.fin - r.debut;
          res.options += (r.options || []).length;
          if (r.deplace) res.deplaces++;
          if (r.statut === 'absent') res.absents++;
          else res.montant += r.prix;
          if (r.statut === 'termine') res.termines++;
        });
      });
      res.taux = res.dispo ? Math.min(100, Math.round(res.occupe / res.dispo * 100)) : 0;
      return res;
    }

    /* la semaine (du lundi au samedi) qui contient `k` */
    function semaine(k, filtre) {
      var lundi = plus(k, -((dow(k) + 6) % 7)), jr = [], tot = { rdv: 0, annules: 0, absents: 0, occupe: 0, dispo: 0, montant: 0, acompte: 0, rembourse: 0, options: 0, deplaces: 0, taux: 0 };
      var parPrac = {}, soins = {}, nAttente = 0;
      PRACS.forEach(function (p) { parPrac[p.id] = { rdv: 0, occupe: 0, dispo: 0, taux: 0 }; });
      for (var i = 0; i < 6; i++) {
        var d = plus(lundi, i), x = indicateurs(d, filtre);
        jr.push({ cle: d, x: x });
        Object.keys(tot).forEach(function (c) { if (c !== 'taux') tot[c] += x[c]; });
        PRACS.forEach(function (p) { var y = indicateurs(d, p.id), z = parPrac[p.id]; z.rdv += y.rdv; z.occupe += y.occupe; z.dispo += y.dispo; });
        jour(d).rdvs.forEach(function (r) {
          if (r.statut === 'annule' || r.statut === 'propose' || r.statut === 'absent') return;
          if (filtre && filtre !== 'all' && r.prac !== filtre) return;
          soins[r.service] = (soins[r.service] || 0) + 1;
        });
        nAttente += actives(d).length;
      }
      tot.taux = tot.dispo ? Math.min(100, Math.round(tot.occupe / tot.dispo * 100)) : 0;
      PRACS.forEach(function (p) { var z = parPrac[p.id]; z.taux = z.dispo ? Math.min(100, Math.round(z.occupe / z.dispo * 100)) : 0; });
      var top = Object.keys(soins).map(function (id) { return { id: id, n: soins[id] }; }).sort(function (a, b) { return b.n - a.n || (a.id < b.id ? -1 : 1); });
      return { lundi: lundi, jours: jr, total: tot, parPrac: parPrac, top: top, attente: nAttente };
    }

    /* ---------- fiches clientes ---------- */
    function noteDe(key) { return notes[key] || (notes[key] = []); }
    ROSTER.forEach(function (c, ci) {
      c.notes.forEach(function (t, i) { noteDe(cleTel(c.tel)).push({ id: 'n' + (++noteSeq), d: plus(aujourdhui(), -30 - i * 40 - ci), texte: t, de: 'Équipe' }); });
    });

    function balayage(fn) {
      var a = aujourdhui();
      for (var n = -120; n <= 120; n++) {
        var k = plus(a, n);
        if (!horaire(k).ouvert) continue;
        jour(k).rdvs.forEach(function (r) { if (r.statut !== 'propose') fn(r, k); });
      }
    }
    function fabriqueFiche(key, nom, rdvs) {
      var a = aujourdhui(), mn = minutesMaintenant();
      var tri = rdvs.slice().sort(function (x, y) { return x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : x.debut - y.debut; });
      var futur = function (r) { return r.statut === 'confirme' && (r.cle > a || (r.cle === a && r.debut >= mn)); };
      var ro = ROSTER.filter(function (c) { return cleTel(c.tel) === key; })[0];
      var hist = tri.filter(function (r) { return !futur(r); }).reverse();
      var fait = hist.filter(function (r) { return r.statut === 'termine'; });
      return {
        key: key, nom: ro ? ro.nom : (nom || (tri.length ? tri[tri.length - 1].client.nom : 'Cliente')),
        tel: ro ? ro.tel : (tri.length ? tri[0].client.tel : key), pref: ro ? ro.pref : null,
        notes: noteDe(key).slice().reverse(), historique: hist, aVenir: tri.filter(futur), prochain: tri.filter(futur)[0] || null,
        nbVenue: fait.length, depense: fait.reduce(function (s, r) { return s + r.prix; }, 0)
      };
    }
    function fiche(tel, nom) {
      var key = cleTel(tel), l = [];
      balayage(function (r) { if (cleTel(r.client.tel) === key) l.push(r); });
      return fabriqueFiche(key, nom, l);
    }
    /* les clientes suivies : la liste de fiches et toute personne ajoutée pendant la visite */
    function clientes() {
      var par = {}, ordre = [];
      ROSTER.forEach(function (c) { par[cleTel(c.tel)] = []; ordre.push(cleTel(c.tel)); });
      balayage(function (r) {
        var key = cleTel(r.client.tel);
        if (par[key]) par[key].push(r);
        else if (r.source !== 'seed') { par[key] = [r]; ordre.push(key); }
      });
      return ordre.map(function (key) { return fabriqueFiche(key, null, par[key]); });
    }
    function ajouterNote(tel, texte) {
      var key = cleTel(tel), t = String(texte).trim();
      if (!t) return { ok: false, erreur: 'Écrivez une note avant de l’ajouter.' };
      if (t.length > 300) return { ok: false, erreur: 'Note trop longue (300 caractères au plus).' };
      noteDe(key).push({ id: 'n' + (++noteSeq), d: aujourdhui(), texte: t, de: 'Vous' });
      return { ok: true };
    }

    /* ---------- rappels simulés : rien n’est jamais envoyé ---------- */
    function rappels(k) {
      var veille = plus(k, -1), envoi = horaire(veille).ouvert ? veille : plus(k, -2);
      return jour(k).rdvs.filter(function (r) { return r.statut === 'confirme'; }).sort(function (a, b) { return a.debut - b.debut; }).map(function (r) {
        var passe = envoi < aujourdhui() || (envoi === aujourdhui() && 1080 <= minutesMaintenant());
        return { rdv: r, envoiCle: envoi, envoiMin: 1080, etat: r.rappel ? 'simule' : (passe ? 'du' : 'planifie') };
      });
    }
    function simulerRappel(id) {
      var r = parId[id];
      if (!r || r.statut !== 'confirme') return { ok: false };
      r.rappel = { cle: aujourdhui(), min: minutesMaintenant() };
      return { ok: true, rdv: r };
    }

    function rdvsClient() {
      var out = [];
      Object.keys(jours).forEach(function (k) { jours[k].rdvs.forEach(function (r) { if (r.source === 'client') out.push(r); }); });
      return out.sort(function (a, b) { return a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : a.debut - b.debut; });
    }
    function attenteClient() { return attente.filter(function (e) { return e.source === 'client' && e.statut !== 'retire'; }); }

    return {
      aujourdhui: aujourdhui, minutesMaintenant: minutesMaintenant, jour: jour, horaire: horaire, travaille: travaille,
      creneaux: creneaux, affecter: affecter, disponibilite: disponibilite, reserver: reserver, changerStatut: changerStatut,
      bloquer: bloquer, debloquer: debloquer, indicateurs: indicateurs, rdvsClient: rdvsClient, libre: libre, debutsPrac: debutsPrac,
      eligibles: eligibles, trouver: function (id) { return parId[id] || null; }, nouveauRdv: function (o) { jour(o.cle); return nouveauRdv(o); },
      devis: devis, heuresAvant: heuresAvant, deplacer: deplacer, obstacle: obstacle,
      rejoindre: rejoindre, repondre: repondre, quitter: quitter, fileJour: fileJour, actives: actives, attenteClient: attenteClient,
      semaine: semaine, fiche: fiche, clientes: clientes, ajouterNote: ajouterNote, rappels: rappels, simulerRappel: simulerRappel
    };
  }

  racine.Naia = {
    creer: creer, CATEGORIES: CATEGORIES, SERVICES: SERVICES, OPTIONS: OPTIONS, PRACS: PRACS, STATUTS: STATUTS, PAUSE: PAUSE,
    TAUX_ACOMPTE: TAUX_ACOMPTE, DELAI_REMB: DELAI_REMB, ROSTER: ROSTER,
    svc: svc, opt: opt, prac: prac, peut: peut, devis: devis, cle: cle, depuis: depuis, plus: plus, dow: dow, hhmm: hhmm, p2: p2, horaire: horaire, cleTel: cleTel,
    fermeture: fermeture, configurerFermetures: configurerFermetures
  };
})(typeof window !== 'undefined' ? window : globalThis);
