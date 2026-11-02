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

  var CATEGORIES = [
    { id: 'visage', nom: 'Visage' },
    { id: 'corps', nom: 'Corps' },
    { id: 'mains', nom: 'Mains et pieds' },
    { id: 'rituels', nom: 'Rituels' }
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
    { id: 'r2', cat: 'rituels', nom: 'Rituel détente', desc: 'Massage du dos, soin du visage express, infusion.', duree: 60, prix: 520 }
  ];

  var PRACS = [
    { id: 'sa', nom: 'Salma', titre: 'Esthéticienne', cats: ['visage', 'mains', 'rituels'], jours: [1, 2, 4, 5, 6], note: 'Soins du visage, mains, rituels' },
    { id: 'in', nom: 'Inès', titre: 'Praticienne de massage', cats: ['corps', 'rituels'], jours: [2, 3, 4, 5, 6], note: 'Massages, soins du corps, rituels' },
    { id: 'ha', nom: 'Hanane', titre: 'Esthéticienne', cats: ['visage', 'mains', 'corps'], jours: [1, 3, 4, 5, 6], note: 'Visage, corps, mains et pieds' }
  ];

  var STATUTS = [
    { id: 'confirme', nom: 'Confirmé' },
    { id: 'arrive', nom: 'Arrivé' },
    { id: 'termine', nom: 'Terminé' },
    { id: 'absent', nom: 'Absent' },
    { id: 'annule', nom: 'Annulé' }
  ];

  var PAUSE = [780, 870];                       // 13:00 – 14:30
  var HORAIRES = { 1: [540, 1140], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [540, 1020] };
  var FERIES = ['01-01', '01-11', '05-01', '07-30', '08-14', '08-20', '08-21', '11-06', '11-18'];
  var PAS = 30;

  var PRENOMS = ['Nadia', 'Lamia', 'Sofia', 'Imane', 'Rita', 'Meryem', 'Dounia', 'Kenza', 'Yasmine', 'Aya', 'Zineb', 'Ghita', 'Leïla', 'Soraya', 'Amina', 'Houda', 'Najwa', 'Sanae', 'Wafa', 'Inas'];
  var INITIALES = 'ABCDEFGHJKLMNRSTZ';

  function svc(id) { for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i]; return null; }
  function prac(id) { for (var i = 0; i < PRACS.length; i++) if (PRACS[i].id === id) return PRACS[i]; return null; }

  function horaire(k) {
    var w = dow(k);
    if (w === 0) return { ouvert: false, raison: 'Fermé le dimanche' };
    if (FERIES.indexOf(k.slice(5)) >= 0) return { ouvert: false, raison: 'Jour férié, institut fermé' };
    var h = HORAIRES[w];
    return { ouvert: true, ouverture: h[0], fermeture: h[1], segments: [[h[0], PAUSE[0]], [PAUSE[1], h[1]]] };
  }

  function creer(maintenant) {
    maintenant = maintenant || function () { return new Date(); };
    var jours = {}, parId = {}, compteur = 1000, seq = 0;

    function aujourdhui() { return cle(maintenant()); }
    function minutesMaintenant() { var n = maintenant(); return n.getHours() * 60 + n.getMinutes(); }
    function travaille(p, k) { return horaire(k).ouvert && prac(p).jours.indexOf(dow(k)) >= 0; }
    function chevauche(a, b, c, d) { return a < d && c < b; }

    function libre(p, k, a, b, ignorer) {
      var j = jour(k), i;
      for (i = 0; i < j.rdvs.length; i++) {
        var r = j.rdvs[i];
        if (r.prac === p && r.statut !== 'annule' && r.id !== ignorer && chevauche(a, b, r.debut, r.fin)) return false;
      }
      for (i = 0; i < j.blocs.length; i++) {
        var bl = j.blocs[i];
        if ((bl.prac === p || bl.prac === 'all') && chevauche(a, b, bl.debut, bl.fin)) return false;
      }
      return true;
    }

    function dansSegment(k, a, b) {
      var h = horaire(k);
      if (!h.ouvert) return false;
      return h.segments.some(function (s) { return a >= s[0] && b <= s[1]; });
    }

    function nouveauRdv(o) {
      var s = svc(o.service);
      seq++;
      var r = {
        id: 'r' + seq, ref: o.ref || ('NA-' + o.cle.replace(/-/g, '').slice(2) + '-' + (++compteur)),
        cle: o.cle, debut: o.debut, fin: o.debut + s.duree, service: s.id, prac: o.prac,
        client: o.client, statut: o.statut || 'confirme', source: o.source || 'seed'
      };
      jours[o.cle].rdvs.push(r); parId[r.id] = r;
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
            var opts = SERVICES.filter(function (s) {
              return p.cats.indexOf(s.cat) >= 0 && t + s.duree <= seg[1] && libre(p.id, k, t, t + s.duree);
            });
            if (!opts.length) { t += PAS; continue; }
            var s = opts[Math.floor(r() * opts.length)];
            var nom = PRENOMS[Math.floor(r() * PRENOMS.length)] + ' ' + INITIALES[Math.floor(r() * INITIALES.length)] + '.';
            var tel = '06 00 00 00 ' + p2(Math.floor(r() * 100));
            var st = 'confirme';
            if (k < today) st = r() < 0.08 ? 'absent' : 'termine';
            else if (k === today) {
              if (t + s.duree <= nowM) st = r() < 0.08 ? 'absent' : 'termine';
              else if (t <= nowM) st = 'arrive';
            }
            if (charge < 1 && k >= today && r() < 0.07) st = 'annule';
            nouveauRdv({ cle: k, debut: t, service: s.id, prac: p.id, client: { nom: nom, tel: tel }, statut: st, source: 'seed', ref: 'NA-' + k.replace(/-/g, '').slice(2) + '-' + p.id.toUpperCase() + (t / 30) });
            t = Math.ceil((t + s.duree) / PAS) * PAS;
          }
        });
      });
      return j;
    }

    function debutsPrac(p, k, duree, delai) {
      if (!travaille(p, k)) return [];
      var today = aujourdhui();
      if (k < today) return [];
      var mini = k === today ? minutesMaintenant() + (delai == null ? 60 : delai) : 0;
      var h = horaire(k), res = [];
      h.segments.forEach(function (seg) {
        for (var t = seg[0]; t + duree <= seg[1]; t += PAS) {
          if (t >= mini && libre(p, k, t, t + duree)) res.push(t);
        }
      });
      return res;
    }

    function eligibles(service, pracId) {
      var s = typeof service === 'string' ? svc(service) : service;
      var liste = (pracId && pracId !== 'any') ? [prac(pracId)] : PRACS;
      return liste.filter(function (p) { return p && p.cats.indexOf(s.cat) >= 0; });
    }

    function creneaux(k, service, pracId, delai) {
      var s = typeof service === 'string' ? svc(service) : service;
      var map = {};
      eligibles(s, pracId).forEach(function (p) {
        debutsPrac(p.id, k, s.duree, delai).forEach(function (t) { (map[t] = map[t] || []).push(p.id); });
      });
      return Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return { debut: t, pracs: map[t] }; });
    }

    function charges(k, id) { return jour(k).rdvs.filter(function (r) { return r.prac === id && r.statut !== 'annule'; }).length; }

    function affecter(k, debut, service, pracId, delai) {
      var c = creneaux(k, service, pracId, delai).filter(function (x) { return x.debut === debut; })[0];
      if (!c) return null;
      if (pracId && pracId !== 'any') return pracId;
      return c.pracs.slice().sort(function (a, b) { return charges(k, a) - charges(k, b); })[0];
    }

    function disponibilite(k, service, pracId) {
      if (k < aujourdhui()) return { etat: 'passe', n: 0, texte: 'Date passée' };
      var h = horaire(k);
      if (!h.ouvert) return { etat: 'ferme', n: 0, texte: h.raison };
      var s = service ? (typeof service === 'string' ? svc(service) : service) : SERVICES[0];
      var el = eligibles(s, pracId);
      if (!el.some(function (p) { return travaille(p.id, k); })) return { etat: 'indispo', n: 0, texte: 'Aucune praticienne ce jour pour ce choix' };
      var n = creneaux(k, s, pracId).length;
      if (!n) return { etat: 'complet', n: 0, texte: 'Complet' };
      return { etat: 'libre', n: n, texte: n + (n > 1 ? ' créneaux' : ' créneau') };
    }

    function reserver(o) {
      var s = svc(o.service);
      if (!s) return { ok: false, erreur: 'Soin inconnu.' };
      var p = affecter(o.cle, o.debut, s, o.prac, o.delai);
      if (!p || !libre(p, o.cle, o.debut, o.debut + s.duree) || !dansSegment(o.cle, o.debut, o.debut + s.duree)) {
        return { ok: false, erreur: 'Ce créneau n’est plus disponible.' };
      }
      return { ok: true, rdv: nouveauRdv({ cle: o.cle, debut: o.debut, service: s.id, prac: p, client: o.client, source: o.source || 'client' }) };
    }

    function changerStatut(id, st) {
      var r = parId[id];
      if (!r || !r.fin) return { ok: false, erreur: 'Rendez-vous introuvable.' };
      if (r.statut === 'annule' && st !== 'annule' && !libre(r.prac, r.cle, r.debut, r.fin, r.id)) {
        return { ok: false, erreur: 'Impossible de rétablir ce rendez-vous : le créneau a été repris.' };
      }
      r.statut = st;
      return { ok: true, rdv: r };
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

    function indicateurs(k, filtre) {
      var h = horaire(k), j = jour(k);
      var res = { rdv: 0, annules: 0, absents: 0, termines: 0, occupe: 0, dispo: 0, taux: 0, montant: 0 };
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
          if (r.statut === 'annule') { res.annules++; return; }
          res.rdv++; res.occupe += r.fin - r.debut;
          if (r.statut === 'absent') res.absents++;
          else res.montant += svc(r.service).prix;
          if (r.statut === 'termine') res.termines++;
        });
      });
      res.taux = res.dispo ? Math.min(100, Math.round(res.occupe / res.dispo * 100)) : 0;
      return res;
    }

    function rdvsClient() {
      var out = [];
      Object.keys(jours).forEach(function (k) { jours[k].rdvs.forEach(function (r) { if (r.source === 'client') out.push(r); }); });
      return out.sort(function (a, b) { return a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : a.debut - b.debut; });
    }

    return {
      aujourdhui: aujourdhui, minutesMaintenant: minutesMaintenant, jour: jour, horaire: horaire, travaille: travaille,
      creneaux: creneaux, affecter: affecter, disponibilite: disponibilite, reserver: reserver, changerStatut: changerStatut,
      bloquer: bloquer, debloquer: debloquer, indicateurs: indicateurs, rdvsClient: rdvsClient, libre: libre, debutsPrac: debutsPrac,
      eligibles: eligibles, trouver: function (id) { return parId[id] || null; }, nouveauRdv: function (o) { jour(o.cle); return nouveauRdv(o); }
    };
  }

  racine.Naia = {
    creer: creer, CATEGORIES: CATEGORIES, SERVICES: SERVICES, PRACS: PRACS, STATUTS: STATUTS, PAUSE: PAUSE,
    svc: svc, prac: prac, cle: cle, depuis: depuis, plus: plus, dow: dow, hhmm: hhmm, p2: p2, horaire: horaire
  };
})(typeof window !== 'undefined' ? window : globalThis);
