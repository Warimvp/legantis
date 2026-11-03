/* Institut Naïa (démonstration fictive) : accueil, interface client, planning et gestion.
   Aucune requête, aucun stockage ; l’état est en mémoire. */
(function () {
  'use strict';
  var N = window.Naia, inst = N.creer();
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var NB = '\u00a0';
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.add('js');

  /* ---------- formats ---------- */
  var fmt = function (k, o) { return new Intl.DateTimeFormat('fr-FR', o).format(N.depuis(k)); };
  var maj = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var longJour = function (k) { return fmt(k, { weekday: 'long', day: 'numeric', month: 'long' }); };
  var longComplet = function (k) { return fmt(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
  var courtJour = function (k) { return fmt(k, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };
  var mad = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + NB + 'MAD'; };
  var hh = N.hhmm;
  var plage = function (a, b) { return hh(a) + ' – ' + hh(b); };
  var statutNom = function (id) { return N.STATUTS.filter(function (s) { return s.id === id; })[0].nom; };
  var minutes = function (d) { return d >= 60 ? Math.floor(d / 60) + ' h' + (d % 60 ? NB + N.p2(d % 60) : '') : d + NB + 'min'; };
  var glyphe = function (id) { return '<svg class="glyphe" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#g-' + id + '"/></svg>'; };
  var icone = function (id) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-' + id + '"/></svg>'; };
  var debutSemaine = function (k) { return N.plus(k, -((N.dow(k) + 6) % 7)); };
  var pl = function (n, un, plu) { return n + ' ' + (n > 1 ? plu || un + 's' : un); };
  var nomsOptions = function (ids) { return (ids || []).map(function (i) { return N.opt(i).nom; }); };
  // dernier moment pour annuler sans perdre l’acompte (rendez-vous moins 24 h)
  function limiteRemb(r) {
    var d = N.depuis(r.cle); d.setHours(Math.floor(r.debut / 60), r.debut % 60); d.setHours(d.getHours() - N.DELAI_REMB);
    return fmt(N.cle(d), { weekday: 'long', day: 'numeric', month: 'long' }) + ' à ' + hh(d.getHours() * 60 + d.getMinutes());
  }
  function texteAcompte(r) {
    var a = r.acompte; if (!a) return '';
    if (a.etat === 'rembourse') return 'Acompte de ' + mad(a.montant) + ' remboursé (simulé)';
    if (a.etat === 'conserve') return 'Acompte de ' + mad(a.montant) + ' conservé par l’institut (simulé)';
    return 'Acompte de ' + mad(a.montant) + ' réglé (simulé)';
  }

  /* ---------- état ---------- */
  var auj = inst.aujourdhui();
  var S = {
    vue: 'accueil', sous: 'reserver', etape: 1, cat: 'visage', service: null, opts: [], prac: 'any',
    mois: auj.slice(0, 7), date: null, debut: null,
    client: { nom: '', tel: '', email: '', note: '', ok: false }, erreurs: {}, conf: null, annuler: null, msgMes: ''
  };
  var G = { date: auj, mode: 'jour', prac: 'all', semPrac: 'sa', sous: 'planning', fiche: null, rapDate: null, attDate: null, msgG: '' };
  var ETAPES = ['Soin', 'Date et heure', 'Coordonnées', 'Récapitulatif'];
  var ADLG = {};          // actions des dialogues : data-d -> fonction

  var elEtape = $('#etape'), elRecap = $('#recap'), elEtapes = $('#etapes'), elToast = $('#toast'), dlg = $('#dlg');
  var tToast = 0;

  function toast(msg) {
    elToast.textContent = msg; elToast.classList.add('on');
    clearTimeout(tToast); tToast = setTimeout(function () { elToast.classList.remove('on'); }, 7000);
  }

  /* ---------- vues ---------- */
  var VUES = ['client', 'gestion'];
  function afficherVue(v, focus) {
    S.vue = v;
    $$('.onglets [role=tab]').forEach(function (b) {
      var on = b.dataset.vue === v; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    VUES.forEach(function (n) { $('#vue-' + n).hidden = v !== n; });
    document.body.classList.toggle('en-gestion', v === 'gestion');
    if (v === 'gestion') rendreGestion(); else { revalider(true); rendreClient(); }
    if (focus) $('#onglet-' + v).focus();
  }

  $$('.onglets [role=tab]').forEach(function (b) {
    b.addEventListener('click', function () { afficherVue(b.dataset.vue); });
    b.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') n = VUES[1 - VUES.indexOf(b.dataset.vue)];
      else if (e.key === 'Home') n = VUES[0]; else if (e.key === 'End') n = VUES[1];
      if (n) { e.preventDefault(); afficherVue(n, true); }
    });
  });

  /* =====================================================================
     VUE CLIENT
     ===================================================================== */
  var service = function () { return S.service ? N.svc(S.service) : null; };
  var dv = function () { return inst.devis(S.service, S.opts); };

  function pracAffectee() {
    var s = service();
    if (!s || !S.date || S.debut == null) return null;
    return inst.affecter(S.date, S.debut, s, S.prac, null, dv().duree);
  }
  var creneauxCourants = function (k) { return inst.creneaux(k, service(), S.prac, null, dv().duree); };

  function revalider(annonce) {
    var s = service();
    if (S.debut != null && (!s || !S.date || !creneauxCourants(S.date).some(function (c) { return c.debut === S.debut; }))) {
      S.debut = null;
      if (annonce && S.etape > 2 && !S.conf) { S.etape = 2; toast('Le créneau choisi n’est plus disponible. Choisissez un autre horaire.'); }
    }
  }

  function rendreBandeauOffre() {
    var o = inst.attenteClient().filter(function (e) { return e.statut === 'propose'; })[0], el = $('#bandeau-offre');
    if (!o) { el.innerHTML = ''; return; }
    var r = inst.trouver(o.rdv);
    el.innerHTML = '<p class="offre-bandeau"><b>Une place s’est libérée.</b> ' + N.svc(o.service).nom + ', ' + longJour(r.cle) + ' à ' + hh(r.debut) + '. <button type="button" class="lien" data-act="vers-mes">Voir la proposition</button></p>';
  }

  function rendreClient() {
    $('#zone-reserver').hidden = S.sous !== 'reserver';
    $('#zone-mes').hidden = S.sous !== 'mes';
    $$('.sousnav button').forEach(function (b) {
      if (b.dataset.sous === S.sous) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var nb = inst.rdvsClient().filter(function (r) { return r.statut !== 'annule'; }).length + inst.attenteClient().filter(function (e) { return e.statut === 'propose'; }).length;
    var p = $('#nb-mes'); p.hidden = !nb; p.textContent = nb;
    rendreBandeauOffre();
    document.body.classList.toggle('barre', S.vue === 'client' && S.sous === 'reserver' && !S.conf);
    if (S.sous === 'mes') { rendreMes(); return; }
    rendreEtapes(); rendreEtape(); rendreRecap();
  }

  function rendreEtapes() {
    if (S.conf) { elEtapes.hidden = true; return; }
    elEtapes.hidden = false;
    elEtapes.innerHTML = ETAPES.map(function (nom, i) {
      var n = i + 1, cls = n < S.etape ? 'fait' : n === S.etape ? 'courant' : 'avenir';
      var inner = '<span class="num">' + (n < S.etape ? icone('coche') : n) + '</span><span class="lib">' + nom + '</span>';
      var c = n < S.etape ? '<button type="button" data-act="aller" data-e="' + n + '" aria-label="Retour à l’étape ' + n + ' : ' + nom + '">' + inner + '</button>' : '<span' + (n === S.etape ? ' aria-current="step"' : '') + '>' + inner + '</span>';
      return '<li class="' + cls + '">' + c + '</li>';
    }).join('');
  }

  /* ----- étape 1 : soin, options, praticienne ----- */
  function htmlServices() {
    return N.SERVICES.filter(function (s) { return s.cat === S.cat; }).map(function (s) {
      return '<label class="carte svc"><input type="radio" name="service" value="' + s.id + '"' + (S.service === s.id ? ' checked' : '') + '>' +
        '<span class="pastille-radio" aria-hidden="true"></span><span class="svc-txt"><b>' + s.nom + '</b><span>' + s.desc + '</span></span>' +
        '<span class="svc-meta"><b>' + mad(s.prix) + '</b><span>' + minutes(s.duree) + '</span>' + (s.valeur ? '<span class="eco">au lieu de ' + mad(s.valeur) + '</span>' : '') + '</span></label>';
    }).join('');
  }
  function htmlOptions() {
    var s = service();
    if (!s) return '<p class="aide">Choisissez un soin : les options qui lui vont bien apparaissent ici.</p>';
    var l = N.OPTIONS.filter(function (o) { return o.cats.indexOf(s.cat) >= 0; });
    return '<h3 class="sous-titre" id="t-options">Compléter votre soin <span class="opt">(facultatif)</span></h3>' +
      '<p class="aide">Chaque option ajoute du temps et un supplément : la durée, le prix et les horaires proposés se recalculent.</p>' +
      '<div class="options" role="group" aria-labelledby="t-options">' + l.map(function (o) {
        return '<label class="carte optc"><input type="checkbox" name="opt" value="' + o.id + '"' + (S.opts.indexOf(o.id) >= 0 ? ' checked' : '') + '><span class="case-b" aria-hidden="true">' + icone('coche') + '</span>' +
          '<span class="svc-txt"><b>' + o.nom + '</b></span><span class="svc-meta"><b>+' + o.prix + NB + 'MAD</b><span>' + (o.duree ? '+' + o.duree + NB + 'min' : 'sans temps en plus') + '</span></span></label>';
      }).join('') + '</div><p class="opt-total" id="opt-total" role="status">' + htmlTotalOpt() + '</p>';
  }
  function htmlTotalOpt() {
    var d = dv(), s = d.service; if (!s) return '';
    return 'Votre soin : <b>' + minutes(d.duree) + ' · ' + mad(d.prix) + '</b>' + (d.options.length ? ' <span>(soin seul : ' + minutes(s.duree) + ' · ' + mad(s.prix) + ')</span>' : '');
  }
  function htmlPracs() {
    var s = service();
    var h = '<label class="carte prac"><input type="radio" name="prac" value="any"' + (S.prac === 'any' ? ' checked' : '') + '><span class="pastille-radio" aria-hidden="true"></span>' +
      '<span class="monogramme libre" aria-hidden="true">·</span><span class="svc-txt"><b>Sans préférence</b><span>Nous vous confions à la praticienne disponible.</span></span></label>';
    N.PRACS.forEach(function (p) {
      var ok = !s || N.peut(p, s);
      var jours = p.jours.map(function (j) { return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][j]; }).join(', ');
      h += '<label class="carte prac' + (ok ? '' : ' off') + '"><input type="radio" name="prac" value="' + p.id + '"' + (S.prac === p.id ? ' checked' : '') + (ok ? '' : ' disabled') + '>' +
        '<span class="pastille-radio" aria-hidden="true"></span><span class="monogramme" aria-hidden="true">' + p.nom.charAt(0) + '</span>' +
        '<span class="svc-txt"><b>' + p.nom + '</b><span>' + (ok ? p.titre + ' · ' + jours : 'Ne réalise pas ce soin') + '</span></span></label>';
    });
    return h;
  }
  function etape1() {
    return '<h2 class="etape-titre" tabindex="-1">Choisissez votre soin</h2>' +
      '<p class="aide">Durées et prix fictifs, en dirhams marocains (MAD). Un acompte simulé de ' + N.TAUX_ACOMPTE + ' % est demandé à la réservation ; aucun vrai paiement.</p>' +
      '<div class="cats" role="radiogroup" aria-label="Catégorie de soins">' + N.CATEGORIES.map(function (c) {
        return '<label class="cat"><input type="radio" name="cat" value="' + c.id + '"' + (S.cat === c.id ? ' checked' : '') + '>' + glyphe(c.id) + '<span>' + c.nom + '</span></label>';
      }).join('') + '</div>' +
      '<div class="services" id="liste-services" role="radiogroup" aria-label="Soins de la catégorie">' + htmlServices() + '</div>' +
      '<div id="zone-options">' + htmlOptions() + '</div>' +
      '<h3 class="sous-titre">Avec qui ?</h3>' +
      '<div class="pracs" id="liste-pracs" role="radiogroup" aria-label="Praticienne">' + htmlPracs() + '</div>';
  }

  /* ----- étape 2 : calendrier, créneaux, liste d’attente ----- */
  function moisLimites() {
    var d = N.depuis(auj), f = new Date(d.getFullYear(), d.getMonth() + 6, 1, 12);
    return { min: auj.slice(0, 7), max: N.cle(f).slice(0, 7) };
  }
  function htmlCal() {
    var s = service(), du = dv().duree, a = S.mois.split('-').map(Number), y = a[0], m = a[1];
    var premier = y + '-' + N.p2(m) + '-01', dec = (N.dow(premier) + 6) % 7;
    var nj = new Date(y, m, 0).getDate(), lim = moisLimites();
    var tabKey = S.date && S.date.slice(0, 7) === S.mois ? S.date : null, rows = '', cells = [], i;
    var dispo = {};
    for (i = 1; i <= nj; i++) { var k = y + '-' + N.p2(m) + '-' + N.p2(i); dispo[k] = inst.disponibilite(k, s, S.prac, du); if (!tabKey && dispo[k].etat === 'libre') tabKey = k; }
    if (!tabKey) tabKey = premier;
    for (i = 0; i < dec; i++) cells.push('<td></td>');
    for (i = 1; i <= nj; i++) {
      var kk = y + '-' + N.p2(m) + '-' + N.p2(i), d = dispo[kk], sel = kk === S.date;
      var actif = d.etat === 'libre' || d.etat === 'complet';
      cells.push('<td><button type="button" class="jour ' + d.etat + (sel ? ' sel' : '') + (kk === auj ? ' auj' : '') + '" data-act="jour" data-date="' + kk + '" data-etat="' + d.etat + '"' +
        (actif ? '' : ' aria-disabled="true"') + ' aria-pressed="' + sel + '" tabindex="' + (kk === tabKey ? 0 : -1) + '" aria-label="' + longJour(kk) + ', ' + d.texte.toLowerCase() + (d.etat === 'complet' ? ', liste d’attente possible' : '') + (kk === auj ? ', aujourd’hui' : '') + '">' +
        '<span>' + i + '</span>' + (d.etat === 'libre' ? '<i class="pt" aria-hidden="true"></i>' : '') + '</button></td>');
    }
    while (cells.length % 7) cells.push('<td></td>');
    for (i = 0; i < cells.length; i += 7) rows += '<tr>' + cells.slice(i, i + 7).join('') + '</tr>';
    var titre = maj(fmt(premier, { month: 'long', year: 'numeric' }));
    return { titre: titre, rows: rows, prec: S.mois > lim.min, suiv: S.mois < lim.max };
  }
  function etape2() {
    var d = dv(), s = d.service, p = S.prac === 'any' ? 'sans préférence' : N.prac(S.prac).nom;
    return '<h2 class="etape-titre" tabindex="-1">Choisissez le jour et l’heure</h2>' +
      '<p class="aide rappel"><b>' + s.nom + '</b>' + (d.options.length ? ' + ' + pl(d.options.length, 'option') : '') + ' · ' + minutes(d.duree) + ' · ' + mad(d.prix) + ' · ' + p + '</p>' +
      '<div class="cal"><div class="cal-tete"><button type="button" class="btn-rond" data-act="mois" data-d="-1" aria-label="Mois précédent">' + icone('fleche') + '</button>' +
      '<h3 id="cal-titre" aria-live="polite"></h3><button type="button" class="btn-rond" data-act="mois" data-d="1" aria-label="Mois suivant">' + icone('suiv') + '</button></div>' +
      '<table class="cal-table" aria-labelledby="cal-titre"><thead><tr>' + ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(function (j, i) {
        return '<th scope="col" abbr="' + ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][i] + '">' + j + '</th>'; }).join('') + '</tr></thead><tbody id="cal-corps"></tbody></table>' +
      '<ul class="legende" aria-label="Légende"><li><i class="pt"></i>Disponible</li><li><i class="sw complet"></i>Complet : liste d’attente</li><li><i class="sw ferme"></i>Fermé</li><li><i class="sw passe"></i>Passé</li></ul>' +
      '<p class="cal-msg" id="cal-msg" role="status"></p></div>' +
      '<div id="creneaux" class="creneaux"></div>';
  }
  function majCal(focusDate) {
    var c = htmlCal();
    $('#cal-titre').textContent = c.titre; $('#cal-corps').innerHTML = c.rows;
    $$('[data-act=mois]').forEach(function (b) { var ok = b.dataset.d === '-1' ? c.prec : c.suiv; b.disabled = !ok; });
    if (focusDate) { var b = $('[data-date="' + focusDate + '"]'); if (b) b.focus(); }
  }
  function prochaineDate(depuisK) {
    for (var i = 1; i <= 180; i++) { var k = N.plus(depuisK, i); if (inst.disponibilite(k, service(), S.prac, dv().duree).etat === 'libre') return k; }
    return null;
  }
  function majCreneaux() {
    var el = $('#creneaux'); if (!el) return;
    var s = service(), d = dv();
    if (!S.date) { el.innerHTML = '<p class="vide-creneaux">Choisissez un jour dans le calendrier pour voir les horaires.</p>'; return; }
    var etat = inst.disponibilite(S.date, s, S.prac, d.duree).etat, proch = etat === 'libre' ? null : prochaineDate(S.date);
    var btnProch = proch ? '<button type="button" class="btn btn-sec" data-act="jour-proche" data-date="' + proch + '">Prochaine date disponible : ' + longJour(proch) + '</button>' : '';
    if (etat === 'complet') {
      var file = inst.actives(S.date), moi = file.filter(function (e) { return e.source === 'client'; })[0];
      el.innerHTML = '<h3 class="sous-titre">' + maj(longJour(S.date)) + '</h3><div class="attente-box" id="attente-box"><p class="kicker">Jour complet pour ce choix (' + minutes(d.duree) + ')</p>' +
        (moi ? '<p><b>Vous êtes en liste d’attente, n° ' + (file.indexOf(moi) + 1) + ' sur ' + file.length + '.</b> Si un rendez-vous est annulé ou déplacé ce jour-là, le créneau libéré vous est proposé dans « Mes rendez-vous ».</p>' +
          '<div class="actions"><button type="button" class="btn" data-act="vers-mes">Voir ma place</button>' + btnProch + '</div>'
          : '<p>Plus aucun créneau ce jour-là. Mettez-vous sur la liste d’attente : si un rendez-vous est annulé ou déplacé, le créneau libéré est proposé <b>à la première personne inscrite</b>, dans l’ordre d’arrivée.' + (file.length ? ' ' + pl(file.length, 'personne attend', 'personnes attendent') + ' déjà ce jour-là.' : '') + '</p>' +
          '<p class="aide">Simulation : aucun SMS ni e-mail. La proposition apparaît dans « Mes rendez-vous » ; l’acompte n’est demandé qu’à l’acceptation.</p>' +
          '<div class="actions"><button type="button" class="btn" data-act="att-ouvrir">Rejoindre la liste d’attente</button>' + btnProch + '</div>') + '</div>';
      return;
    }
    var cr = creneauxCourants(S.date);
    if (!cr.length) {
      el.innerHTML = '<h3 class="sous-titre">' + maj(longJour(S.date)) + '</h3><p class="vide-creneaux">Aucun créneau libre ce jour-là pour ce choix.</p>' + btnProch;
      return;
    }
    var base = d.options.length ? inst.creneaux(S.date, s, S.prac).length : null;
    var grp = function (titre, liste) {
      if (!liste.length) return '';
      return '<fieldset class="groupe"><legend>' + titre + '</legend><div class="pills">' + liste.map(function (c) {
        return '<label class="creneau"><input type="radio" name="creneau" value="' + c.debut + '"' + (S.debut === c.debut ? ' checked' : '') + '><span>' + hh(c.debut) + '</span></label>';
      }).join('') + '</div></fieldset>';
    };
    el.innerHTML = '<h3 class="sous-titre">' + maj(longJour(S.date)) + '</h3><p class="aide" id="nb-creneaux" aria-live="polite">' + pl(cr.length, 'créneau disponible', 'créneaux disponibles') +
      ' pour ' + minutes(d.duree) + (base != null ? ' (au lieu de ' + base + ' pour le soin seul)' : '') + ' · fin du soin calculée selon la durée</p>' +
      grp('Matin', cr.filter(function (c) { return c.debut < 780; })) + grp('Après-midi', cr.filter(function (c) { return c.debut >= 780; }));
  }

  /* ----- étape 3 ----- */
  var valideNom = function (v) { v = v.trim(); return v.length >= 2 && v.length <= 60 && /^[\p{L}][\p{L}\s'’.-]*$/u.test(v); };
  var normTel = function (v) { return v.replace(/[\s.\-()]/g, ''); };
  var valideTel = function (v) { return /^(0|\+212)[5-7]\d{8}$/.test(normTel(v)); };
  var valideMail = function (v) { v = v.trim(); return v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };

  function champ(id, label, valeur, o) {
    o = o || {};
    var err = S.erreurs[id];
    return '<div class="champ' + (err ? ' erreur' : '') + '"><label for="f-' + id + '">' + label + (o.opt ? ' <span class="opt">(facultatif)</span>' : '') + '</label>' +
      (o.area ? '<textarea id="f-' + id + '" data-champ="' + id + '" rows="3" maxlength="200" autocomplete="off"' : '<input id="f-' + id + '" data-champ="' + id + '" type="' + (o.type || 'text') + '" autocomplete="off"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' value="' + esc(valeur) + '"') +
      (o.aide ? ' aria-describedby="a-' + id + (err ? ' e-' + id : '') + '"' : (err ? ' aria-describedby="e-' + id + '"' : '')) + (err ? ' aria-invalid="true"' : '') + (o.ph ? ' placeholder="' + o.ph + '"' : '') + (o.area ? '>' + esc(valeur) + '</textarea>' : '>') +
      (o.aide ? '<small id="a-' + id + '">' + o.aide + '</small>' : '') + (err ? '<small class="msg-err" id="e-' + id + '">' + err + '</small>' : '') + '</div>';
  }
  function etape3() {
    var c = S.client, e = Object.keys(S.erreurs).length;
    return '<h2 class="etape-titre" tabindex="-1">Vos coordonnées</h2>' +
      '<p class="aide">Démonstration : saisissez des coordonnées fictives (par exemple « Sara Test », « 06 00 00 00 00 »). Rien n’est transmis ni conservé.</p>' +
      (e ? '<div class="alerte" role="alert" id="alerte-form"><b>Vérifiez les champs signalés.</b> ' + Object.keys(S.erreurs).map(function (k) { return '<a href="#f-' + k + '" data-act="vers-champ" data-id="' + k + '">' + esc(S.erreurs[k]) + '</a>'; }).join(' · ') + '</div>' : '') +
      '<form id="f-coord" class="form" novalidate>' +
      champ('nom', 'Nom et prénom', c.nom, { ph: 'Sara Test' }) +
      champ('tel', 'Téléphone', c.tel, { type: 'tel', mode: 'tel', ph: '06 00 00 00 00', aide: 'Numéro marocain à 10 chiffres, ou +212. Un numéro fictif suffit.' }) +
      champ('email', 'Adresse e-mail', c.email, { type: 'email', mode: 'email', opt: true, ph: 'sara@exemple.invalid', aide: 'Aucun e-mail n’est envoyé.' }) +
      champ('note', 'Remarque pour la praticienne', c.note, { area: true, opt: true }) +
      '<div class="champ coche' + (S.erreurs.ok ? ' erreur' : '') + '"><label class="case"><input type="checkbox" id="f-ok" data-champ="ok"' + (c.ok ? ' checked' : '') + (S.erreurs.ok ? ' aria-invalid="true" aria-describedby="e-ok"' : '') + '><span class="case-b" aria-hidden="true">' + icone('coche') + '</span><span>Je comprends que ce rendez-vous et son acompte sont une simulation : aucun SMS, e-mail ni paiement réel.</span></label>' +
      (S.erreurs.ok ? '<small class="msg-err" id="e-ok">' + S.erreurs.ok + '</small>' : '') + '</div></form>';
  }
  function validerCoord() {
    var c = S.client, e = {};
    if (!valideNom(c.nom)) e.nom = c.nom.trim() ? 'Indiquez un nom valide (lettres uniquement, 2 caractères au moins).' : 'Indiquez votre nom et prénom.';
    if (!valideTel(c.tel)) e.tel = c.tel.trim() ? 'Numéro invalide : 10 chiffres commençant par 05, 06 ou 07 (ou +212).' : 'Indiquez un numéro de téléphone.';
    if (!valideMail(c.email)) e.email = 'Adresse e-mail invalide (exemple : sara@exemple.invalid).';
    if (!c.ok) e.ok = 'Cochez la case pour continuer.';
    S.erreurs = e;
    return !Object.keys(e).length;
  }

  /* ----- étape 4 ----- */
  function lignesRecap(modifiable) {
    var d = dv(), s = d.service, pid = pracAffectee(), pr = pid ? N.prac(pid) : null;
    var mod = function (e, lib) { return modifiable ? ' <button type="button" class="lien" data-act="aller" data-e="' + e + '">Modifier<span class="sr"> ' + lib + '</span></button>' : ''; };
    return '<div class="rl"><dt>Soin</dt><dd>' + (s ? '<b>' + s.nom + '</b>' + d.options.map(function (o) { return '<span>+ ' + o.nom + '</span>'; }).join('') + '<span>' + minutes(d.duree) + ' · ' + mad(d.prix) + '</span>' : 'À choisir') + mod(1, 'le soin') + '</dd></div>' +
      '<div class="rl"><dt>Praticienne</dt><dd>' + (S.prac === 'any' ? (pr ? '<b>' + pr.nom + '</b><span>Sans préférence : attribuée selon la disponibilité</span>' : 'Sans préférence') : '<b>' + N.prac(S.prac).nom + '</b>') + mod(1, 'la praticienne') + '</dd></div>' +
      '<div class="rl"><dt>Date et heure</dt><dd>' + (S.date && S.debut != null && s ? '<b>' + maj(longJour(S.date)) + '</b><span>' + plage(S.debut, S.debut + d.duree) + '</span>' : 'À choisir') + mod(2, 'la date et l’heure') + '</dd></div>' +
      (modifiable ? '<div class="rl"><dt>Vous</dt><dd><b>' + esc(S.client.nom.trim()) + '</b><span>' + esc(S.client.tel.trim()) + (S.client.email.trim() ? ' · ' + esc(S.client.email.trim()) : '') + '</span>' + mod(3, 'vos coordonnées') + '</dd></div>' : '');
  }
  function blocAcompte(d, r) {
    var ac = r ? r.acompte.montant : d.acompte, prix = r ? r.prix : d.prix;
    return '<div class="acompte-box" id="acompte-box"><p class="kicker">Acompte simulé · aucun vrai paiement</p>' +
      '<p class="ac-ligne"><span>Acompte de ' + N.TAUX_ACOMPTE + ' % ' + (r ? 'réglé' : 'à régler maintenant') + ' (simulé)</span><b id="ac-montant">' + mad(ac) + '</b></p>' +
      '<p class="ac-ligne"><span>Reste à régler sur place</span><b>' + mad(prix - ac) + '</b></p>' +
      '<p class="ac-regle"><b>Annulation gratuite jusqu’à ' + N.DELAI_REMB + ' h avant le rendez-vous</b>' + (r ? ' (jusqu’au ' + limiteRemb(r) + ')' : '') + ' : l’acompte est alors remboursé (simulé). Moins de ' + N.DELAI_REMB + ' h avant, ou en cas d’absence, l’institut le conserve. Aucune carte bancaire n’est demandée.</p></div>';
  }
  function etape4() {
    var d = dv();
    return '<h2 class="etape-titre" tabindex="-1">Vérifiez votre rendez-vous</h2>' +
      '<p class="aide">Relisez avant de confirmer : chaque ligne se modifie. Le rendez-vous n’est enregistré qu’à la confirmation.</p>' +
      '<dl class="recap-liste" id="recap-final">' + lignesRecap(true) + '</dl>' +
      (S.client.note.trim() ? '<p class="note-cliente"><b>Votre remarque :</b> ' + esc(S.client.note.trim()) + '</p>' : '') +
      '<div class="total"><span>Total du soin</span><b id="total-prix">' + mad(d.prix) + '</b></div>' + blocAcompte(d) +
      '<p class="aide">Simulation : aucun paiement, aucun SMS, aucun e-mail. Annulation possible depuis « Mes rendez-vous ».</p>';
  }

  /* ----- confirmation ----- */
  function htmlConf() {
    var r = S.conf, s = N.svc(r.service), p = N.prac(r.prac), prenom = r.client.nom.trim().split(/\s+/)[0], os = nomsOptions(r.options);
    return '<div class="conf" id="conf"><svg class="conf-branche" viewBox="0 0 250 340" aria-hidden="true" focusable="false"><use href="#branche"/></svg>' +
      '<p class="kicker">Rendez-vous confirmé · simulation</p><h2 class="etape-titre" tabindex="-1">À bientôt, ' + esc(prenom) + '</h2>' +
      '<p class="numero">Numéro de rendez-vous <b>' + r.ref + '</b></p>' +
      '<dl class="recap-liste"><div class="rl"><dt>Soin</dt><dd><b>' + s.nom + '</b>' + os.map(function (o) { return '<span>+ ' + o + '</span>'; }).join('') + '<span>' + minutes(r.duree) + ' · ' + mad(r.prix) + '</span></dd></div>' +
      '<div class="rl"><dt>Praticienne</dt><dd><b>' + p.nom + '</b><span>' + p.titre + '</span></dd></div>' +
      '<div class="rl"><dt>Date et heure</dt><dd><b>' + maj(longJour(r.cle)) + '</b><span>' + plage(r.debut, r.fin) + '</span></dd></div>' +
      '<div class="rl"><dt>Lieu</dt><dd><b>Institut Naïa</b><span>Adresse fictive, Casablanca</span></dd></div></dl>' + blocAcompte(null, r) +
      '<p class="avertissement"><b>Aucun SMS ni e-mail n’est envoyé.</b> Ceci est une simulation : le rendez-vous et son acompte existent seulement dans cette page, dans « Mes rendez-vous » et dans le planning de la Gestion.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="voir-mes">Voir mes rendez-vous</button>' +
      '<button type="button" class="btn btn-sec" data-act="nouveau">Prendre un autre rendez-vous</button>' +
      '<button type="button" class="btn btn-sec" data-act="voir-gestion">Le voir dans la Gestion</button></div>' +
      /* Sortie vers la vraie demande de devis de Legantis, séparée de l’institut fictif ; source.js y recopie la source au clic. */
      '<aside class="cta-legantis" aria-label="Legantis, hors démonstration"><p class="kicker">Hors démonstration · Legantis</p>' +
      '<p><b>Une prise de rendez-vous en ligne pour votre établissement ?</b> L’Institut Naïa est fictif. Legantis construit ce type d’outil sur mesure : réservation, planning de gestion, à vos règles.</p>' +
      '<a class="btn" href="/estimer-mon-projet/?type=web">Demander un devis à Legantis</a><p class="aide">Devis détaillé, gratuit et sans engagement. Ce lien quitte la démonstration.</p></aside></div>';
  }

  function rendreEtape(focusHead) {
    if (S.conf) { elEtape.innerHTML = htmlConf(); elRecap.hidden = true; document.body.classList.remove('barre'); if (focusHead) focusTitre(); return; }
    elRecap.hidden = false;
    elEtape.innerHTML = [null, etape1, etape2, etape3, etape4][S.etape]();
    if (S.etape === 2) { majCal(); majCreneaux(); }
    if (focusHead) focusTitre();
  }
  function focusTitre() {
    var t = $('.etape-titre', elEtape); if (t) t.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduit ? 'auto' : 'smooth' });
  }

  /* ----- récapitulatif / barre d’action ----- */
  function pret(e) {
    if (e === 1) return !!S.service;
    if (e === 2) return !!S.date && S.debut != null;
    return true;
  }
  var AIDE = { 1: 'Choisissez un soin pour continuer.', 2: 'Choisissez un jour puis un créneau pour continuer.' };
  function rendreRecap(aide) {
    if (S.conf || S.sous !== 'reserver') return;
    var d = dv(), s = d.service;
    var court = s ? '<b>' + s.nom + (d.options.length ? ' + ' + pl(d.options.length, 'option') : '') + '</b><span>' + (S.date && S.debut != null ? courtJour(S.date) + ' · ' + hh(S.debut) + ' · ' : minutes(d.duree) + ' · ') + mad(d.prix) + '</span>' : '<b>Aucun soin choisi</b><span>Commencez par un soin</span>';
    var dernier = S.etape === 4;
    elRecap.innerHTML = '<h2 class="recap-titre">Votre rendez-vous</h2><dl class="recap-liste compact">' + lignesRecap(false) + '</dl>' +
      (s ? '<p class="recap-acompte">Acompte simulé : <b>' + mad(d.acompte) + '</b></p>' : '') +
      '<p class="recap-court">' + court + '</p>' +
      '<p class="recap-aide" id="recap-aide" role="status">' + (aide || '') + '</p>' +
      '<div class="recap-actions">' + (S.etape > 1 ? '<button type="button" class="btn btn-sec" data-act="retour">Retour</button>' : '') +
      '<button type="button" class="btn' + (dernier ? ' btn-conf' : '') + '" data-act="suite"' + (!pret(S.etape) ? ' aria-disabled="true"' : '') + '>' + (dernier ? 'Confirmer<span class="lg"> et régler l’acompte (simulé)</span>' : 'Continuer') + '</button></div>' +
      (dernier ? '' : '<p class="recap-pied">Simulation : rien n’est enregistré avant la confirmation.</p>');
  }

  function aller(e, focus) {
    S.etape = e; S.erreurs = {};
    rendreEtapes(); rendreEtape(focus !== false); rendreRecap();
  }
  function suite() {
    if (S.etape < 3 && !pret(S.etape)) { rendreRecap(AIDE[S.etape]); return; }
    if (S.etape === 2) { revalider(false); if (!pret(2)) { rendreRecap('Ce créneau vient d’être pris. Choisissez-en un autre.'); majCreneaux(); return; } }
    if (S.etape === 3) { if (!validerCoord()) { rendreEtape(); rendreRecap(); var f = $('[aria-invalid=true]', elEtape); if (f) f.focus(); return; } }
    if (S.etape === 4) { confirmer(); return; }
    aller(S.etape + 1);
  }
  function confirmer() {
    var s = service();
    var res = inst.reserver({ cle: S.date, debut: S.debut, service: s.id, options: S.opts, prac: S.prac, acompte: true, client: { nom: S.client.nom.trim(), tel: S.client.tel.trim(), email: S.client.email.trim(), note: S.client.note.trim() }, source: 'client' });
    if (!res.ok) { S.debut = null; S.etape = 2; rendreEtapes(); rendreEtape(true); rendreRecap('Ce créneau vient d’être pris. Choisissez-en un autre.'); toast(res.erreur + ' Choisissez un autre horaire.'); return; }
    S.conf = res.rdv; S.annuler = null;
    rendreClient(); focusTitre();
    toast('Rendez-vous confirmé (simulation), numéro ' + res.rdv.ref + '. Acompte simulé de ' + mad(res.rdv.acompte.montant) + '. Aucun SMS ni e-mail n’est envoyé.');
  }

  /* ----- mes rendez-vous ----- */
  function lignesAcompteMes(r) {
    if (!r.acompte) return '';
    var a = r.acompte;
    if (a.etat !== 'verse') return '<p class="rv-ac ' + a.etat + '">' + texteAcompte(r) + (a.etat === 'conserve' && r.statut === 'annule' ? ' : annulation à moins de ' + N.DELAI_REMB + ' h.' : '.') + '</p>';
    var h = inst.heuresAvant(r);
    return '<p class="rv-ac">' + texteAcompte(r) + '. ' + (h >= N.DELAI_REMB ? 'Remboursable si vous annulez avant le ' + limiteRemb(r) + '.' : 'Délai de remboursement dépassé : l’acompte serait conservé en cas d’annulation.') + '</p>';
  }
  function carteMes(r) {
    var s = N.svc(r.service), p = N.prac(r.prac), futur = r.cle > auj || (r.cle === auj && r.fin > inst.minutesMaintenant());
    var peut = r.statut === 'confirme' && futur, confirmation = S.annuler === r.id, os = nomsOptions(r.options);
    var h = inst.heuresAvant(r), ok = r.acompte && h >= N.DELAI_REMB;
    return '<li class="rv-carte st-' + r.statut + '"><div class="rv-date"><b>' + N.depuis(r.cle).getDate() + '</b><span>' + fmt(r.cle, { month: 'short' }).replace('.', '') + '</span></div>' +
      '<div class="rv-corps"><p class="rv-ligne"><b>' + s.nom + '</b><span class="chip st-' + r.statut + '">' + statutNom(r.statut) + '</span></p>' +
      (os.length ? '<p>+ ' + os.join(', ') + '</p>' : '') +
      '<p>' + maj(longJour(r.cle)) + ' · ' + plage(r.debut, r.fin) + ' (' + minutes(r.duree) + ')</p><p>Avec ' + p.nom + ' · ' + mad(r.prix) + ' · n° ' + r.ref + '</p>' + lignesAcompteMes(r) +
      (peut ? (confirmation ? '<div class="confirme-annul" role="group" aria-label="Confirmer l’annulation"><p>Annuler ce rendez-vous ? Le créneau sera libéré.</p>' +
        (r.acompte ? '<p class="ac-prevision" id="ac-prevision">' + (ok ? 'Il reste plus de ' + N.DELAI_REMB + ' h : votre acompte de ' + mad(r.acompte.montant) + ' vous sera remboursé (simulé).' : 'Il reste moins de ' + N.DELAI_REMB + ' h : l’acompte de ' + mad(r.acompte.montant) + ' sera conservé par l’institut.') + '</p>' : '') +
        '<button type="button" class="btn btn-danger" data-act="annuler-oui" data-id="' + r.id + '">Oui, annuler</button> <button type="button" class="btn btn-sec" data-act="annuler-non">Garder le rendez-vous</button></div>'
        : '<p class="rv-actions"><button type="button" class="btn btn-sec" data-act="annuler" data-id="' + r.id + '">Annuler ce rendez-vous</button></p>') : '') +
      '</div></li>';
  }
  function carteAttente(e) {
    var s = N.svc(e.service), os = nomsOptions(e.options), r = e.rdv ? inst.trouver(e.rdv) : null, rang = inst.actives(e.cle).indexOf(e) + 1;
    var etat = { attente: 'En attente', propose: 'Place proposée', accepte: 'Acceptée', refuse: 'Refusée', expire: 'Sans réponse', retire: 'Retirée' }[e.statut];
    var corps;
    if (e.statut === 'propose') {
      corps = '<p><b>Une place s’est libérée.</b> ' + maj(longJour(r.cle)) + ', ' + plage(r.debut, r.fin) + ', avec ' + N.prac(r.prac).nom + '.</p>' +
        '<p>Proposée en premier à votre inscription. Acompte simulé à régler : ' + mad(inst.devis(e.service, e.options).acompte) + ' (remboursable jusqu’à ' + N.DELAI_REMB + ' h avant).</p>' +
        '<div class="actions"><button type="button" class="btn" data-act="att-oui" data-id="' + e.id + '">Accepter et régler l’acompte (simulé)</button><button type="button" class="btn btn-sec" data-act="att-non" data-id="' + e.id + '">Refuser</button></div>';
    } else if (e.statut === 'attente') {
      corps = '<p>' + maj(longJour(e.cle)) + ' · ' + minutes(e.duree) + ' · n° ' + rang + ' sur la liste. Rien n’est envoyé : la proposition apparaîtra ici.</p>' +
        '<p class="rv-actions"><button type="button" class="btn btn-sec" data-act="att-quitter" data-id="' + e.id + '">Quitter la liste</button></p>';
    } else corps = '<p>' + maj(longJour(e.cle)) + (e.statut === 'accepte' ? ' · le rendez-vous figure dans votre liste ci-dessous.' : ' · plus de proposition pour cette inscription.') + '</p>';
    return '<li class="rv-carte attente st-' + e.statut + '"><div class="rv-date"><b>' + N.depuis(e.cle).getDate() + '</b><span>' + fmt(e.cle, { month: 'short' }).replace('.', '') + '</span></div>' +
      '<div class="rv-corps"><p class="rv-ligne"><b>' + s.nom + '</b><span class="chip st-att-' + e.statut + '">' + etat + '</span></p>' + (os.length ? '<p>+ ' + os.join(', ') + '</p>' : '') + corps + '</div></li>';
  }
  function rendreMes() {
    var l = inst.rdvsClient(), el = $('#zone-mes'), att = inst.attenteClient();
    var a = l.filter(function (r) { return r.statut !== 'annule' && r.statut !== 'termine' && r.statut !== 'absent'; }), b = l.filter(function (r) { return a.indexOf(r) < 0; });
    el.innerHTML = '<h2 class="etape-titre" tabindex="-1">Mes rendez-vous</h2><p class="aide">Les rendez-vous pris pendant cette visite. La liste se vide au rechargement de la page.</p>' +
      '<p class="msg-mes" role="status" id="msg-mes">' + esc(S.msgMes) + '</p>' +
      (att.length ? '<h3 class="sous-titre">Liste d’attente</h3><ul class="rv-liste" id="liste-attente">' + att.map(carteAttente).join('') + '</ul>' : '') +
      (l.length ? (a.length ? '<h3 class="sous-titre">À venir</h3><ul class="rv-liste">' + a.map(carteMes).join('') + '</ul>' : '') +
        (b.length ? '<h3 class="sous-titre">Annulés ou passés</h3><ul class="rv-liste">' + b.map(carteMes).join('') + '</ul>' : '')
        : (att.length ? '' : '<div class="vide"><svg viewBox="0 0 250 340" aria-hidden="true" focusable="false"><use href="#branche"/></svg><p><b>Aucun rendez-vous pour l’instant.</b></p><p>Réservez un soin : il apparaîtra ici, et aussitôt dans le planning de la Gestion.</p><button type="button" class="btn" data-act="vers-reserver">Réserver un soin</button></div>'));
  }

  /* ----- liste d’attente : inscription ----- */
  function ouvrirAttente(from) {
    var d = dv();
    ouvrir(entete('Liste d’attente · simulation', 'Rejoindre la liste') +
      '<form id="f-att" class="form" novalidate><p class="aide">' + maj(longJour(S.date)) + ' · ' + d.service.nom + ' · ' + minutes(d.duree) + '. Si un créneau se libère, il vous est proposé si vous êtes la première personne inscrite à qui il convient. Aucun message n’est envoyé.</p>' +
      '<div class="champ"><label for="w-nom">Nom et prénom</label><input id="w-nom" type="text" autocomplete="off" value="' + esc(S.client.nom) + '" placeholder="Sara Test"><small class="msg-err" id="w-nom-e"></small></div>' +
      '<div class="champ"><label for="w-tel">Téléphone</label><input id="w-tel" type="tel" inputmode="tel" autocomplete="off" value="' + esc(S.client.tel) + '" placeholder="06 00 00 00 00"><small class="msg-err" id="w-tel-e"></small></div>' +
      '<p class="dlg-msg err" id="w-msg" role="alert"></p>' +
      '<div class="actions"><button type="submit" class="btn">M’inscrire sur la liste</button><button type="button" class="btn btn-sec" data-d="fermer">Annuler</button></div></form>', 'attente', from);
    $('#w-nom').focus();
    $('#f-att').addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = $('#w-nom').value, tel = $('#w-tel').value;
      $('#w-nom-e').textContent = valideNom(nom) ? '' : 'Indiquez un nom valide.'; $('#w-tel-e').textContent = valideTel(tel) ? '' : 'Numéro invalide (10 chiffres, 05/06/07, ou +212).';
      if (!valideNom(nom)) { $('#w-nom').focus(); return; } if (!valideTel(tel)) { $('#w-tel').focus(); return; }
      var r = inst.rejoindre({ cle: S.date, service: S.service, options: S.opts, prac: S.prac, client: { nom: nom.trim(), tel: tel.trim() }, source: 'client' });
      if (!r.ok) { $('#w-msg').textContent = r.erreur; return; }
      S.client.nom = nom.trim(); S.client.tel = tel.trim();
      dlg.close(); majCreneaux(); rendreRecap(); rendreClient();
      toast('Inscrite sur la liste d’attente du ' + longJour(S.date) + ', n° ' + r.rang + ' (simulation, aucun message envoyé).');
    });
  }

  /* ----- événements client ----- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act;
    if (a === 'aller') aller(+t.dataset.e);
    else if (a === 'retour') aller(S.etape - 1);
    else if (a === 'suite') suite();
    else if (a === 'mois') { var d = +t.dataset.d, m = S.mois.split('-').map(Number), n = new Date(m[0], m[1] - 1 + d, 1, 12); S.mois = N.cle(n).slice(0, 7); majCal(); }
    else if (a === 'jour' || a === 'jour-proche') {
      var k = t.dataset.date, di = inst.disponibilite(k, service(), S.prac, dv().duree);
      if (a === 'jour-proche') { S.mois = k.slice(0, 7); }
      if (di.etat !== 'libre' && di.etat !== 'complet') { $('#cal-msg').textContent = maj(longJour(k)) + ' : ' + di.texte.toLowerCase() + '. Choisissez un autre jour.'; return; }
      $('#cal-msg').textContent = '';
      if (S.date !== k) { S.date = k; S.debut = null; }
      majCal(k); majCreneaux(); rendreRecap();
      var cr = $('#creneaux'); if (cr && window.matchMedia('(max-width: 899px)').matches) cr.scrollIntoView({ block: 'nearest', behavior: reduit ? 'auto' : 'smooth' });
    }
    else if (a === 'vers-champ') { e.preventDefault(); var f = $('#f-' + t.dataset.id); if (f) f.focus(); }
    else if (a === 'voir-mes' || a === 'vers-mes') { if (S.vue !== 'client') afficherVue('client'); S.sous = 'mes'; rendreClient(); window.scrollTo(0, 0); }
    else if (a === 'vers-reserver') { S.sous = 'reserver'; rendreClient(); }
    else if (a === 'nouveau') { S.conf = null; S.service = null; S.opts = []; S.prac = 'any'; S.date = null; S.debut = null; S.etape = 1; S.erreurs = {}; rendreClient(); focusTitre(); }
    else if (a === 'voir-gestion') { G.date = S.conf.cle; G.mode = 'jour'; G.prac = 'all'; G.sous = 'planning'; afficherVue('gestion'); }
    else if (a === 'att-ouvrir') ouvrirAttente(t);
    else if (a === 'att-oui' || a === 'att-non' || a === 'att-quitter') {
      var rr = a === 'att-quitter' ? inst.quitter(t.dataset.id) : inst.repondre(t.dataset.id, a === 'att-oui');
      S.msgMes = !rr.ok ? (rr.erreur || 'Action impossible.') : a === 'att-oui' ? 'Place acceptée : rendez-vous ' + rr.rdv.ref + ' confirmé, acompte simulé de ' + mad(rr.rdv.acompte.montant) + ' réglé. Aucun message envoyé.' : a === 'att-non' ? 'Proposition refusée' + (rr.suivante ? ' : le créneau est proposé à la personne suivante sur la liste.' : ' : le créneau est de nouveau libre.') : 'Vous avez quitté la liste d’attente.';
      rendreClient(); toast(S.msgMes); var h0 = $('#zone-mes .etape-titre'); if (h0) h0.focus({ preventScroll: true });
    }
    else if (a === 'annuler') { S.annuler = t.dataset.id; S.msgMes = ''; rendreMes(); var bt = $('[data-act=annuler-oui]'); if (bt) bt.focus(); }
    else if (a === 'annuler-non') { var id0 = S.annuler; S.annuler = null; rendreMes(); var b0 = $('[data-act=annuler][data-id="' + id0 + '"]'); if (b0) b0.focus(); }
    else if (a === 'annuler-oui') {
      var r = inst.changerStatut(t.dataset.id, 'annule'); S.annuler = null;
      S.msgMes = r.ok ? 'Rendez-vous ' + r.rdv.ref + ' annulé. Le créneau est de nouveau disponible.' + (r.rdv.acompte ? ' ' + texteAcompte(r.rdv) + ' (simulation, aucun mouvement bancaire).' : '') + ' Aucun message envoyé.' : r.erreur;
      rendreClient(); toast(S.msgMes); var h = $('#zone-mes .etape-titre'); if (h) h.focus({ preventScroll: true });
    }
  });

  $$('.sousnav button').forEach(function (b) {
    b.addEventListener('click', function () { S.sous = b.dataset.sous; S.annuler = null; rendreClient(); });
  });

  function majOptions() {
    $('#opt-total').innerHTML = htmlTotalOpt(); revalider(false); rendreRecap();
  }
  elEtape.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'cat') { S.cat = t.value; $('#liste-services').innerHTML = htmlServices(); }
    else if (t.name === 'service') {
      S.service = t.value; var s = service();
      S.opts = S.opts.filter(function (o) { return N.opt(o).cats.indexOf(s.cat) >= 0; });
      if (S.prac !== 'any' && !N.peut(N.prac(S.prac), s)) S.prac = 'any';
      $('#liste-pracs').innerHTML = htmlPracs(); $('#zone-options').innerHTML = htmlOptions(); revalider(false); rendreRecap();
    }
    else if (t.name === 'opt') { S.opts = $$('input[name=opt]:checked', elEtape).map(function (i) { return i.value; }); majOptions(); }
    else if (t.name === 'prac') { S.prac = t.value; revalider(false); rendreRecap(); }
    else if (t.name === 'creneau') { S.debut = +t.value; rendreRecap(); }
    else if (t.dataset.champ === 'ok') { S.client.ok = t.checked; }
  });
  elEtape.addEventListener('input', function (e) {
    var c = e.target.dataset.champ; if (c && c !== 'ok') S.client[c] = e.target.value;
  });
  elEtape.addEventListener('submit', function (e) { e.preventDefault(); suite(); });
  elEtape.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('#f-coord input[type=text], #f-coord input[type=tel], #f-coord input[type=email]')) { e.preventDefault(); suite(); return; }
    var b = e.target.closest && e.target.closest('.jour');
    if (!b) return;
    var k = b.dataset.date, d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], cible = null;
    if (d) cible = N.plus(k, d);
    else if (e.key === 'Home') cible = N.plus(k, -((N.dow(k) + 6) % 7));
    else if (e.key === 'End') cible = N.plus(k, 6 - ((N.dow(k) + 6) % 7));
    else if (e.key === 'PageUp' || e.key === 'PageDown') { var x = N.depuis(k); x.setMonth(x.getMonth() + (e.key === 'PageUp' ? -1 : 1)); cible = N.cle(x); }
    if (!cible) return;
    e.preventDefault();
    var lim = moisLimites();
    if (cible.slice(0, 7) < lim.min || cible.slice(0, 7) > lim.max) return;
    if (cible.slice(0, 7) !== S.mois) { S.mois = cible.slice(0, 7); majCal(); }
    var prev = $('.jour[tabindex="0"]'); if (prev) prev.tabIndex = -1;
    var nb = $('[data-date="' + cible + '"]'); if (nb) { nb.tabIndex = 0; nb.focus(); }
  });


  /* =====================================================================
     VUE GESTION : cadre, planning, dialogues
     ===================================================================== */
  var PPM = 1.2, T0 = 540, T1 = 1140;
  var vueG = $('#vue-gestion');
  var SOUS_G = [['planning', 'Planning'], ['attente', 'Liste d’attente'], ['clientes', 'Clientes'], ['rappels', 'Rappels'], ['semaine', 'Semaine']];
  var msgPlanning = { texte: '', erreur: false };

  function colonnes() {
    if (G.mode === 'jour') {
      return (G.prac === 'all' ? N.PRACS : [N.prac(G.prac)]).map(function (p) { return { cle: G.date, prac: p, titre: p.nom, sous: p.titre }; });
    }
    var l = debutSemaine(G.date), out = [];
    for (var i = 0; i < 6; i++) { var k = N.plus(l, i); out.push({ cle: k, prac: N.prac(G.semPrac), titre: maj(fmt(k, { weekday: 'short' }).replace('.', '')) + ' ' + N.depuis(k).getDate(), sous: fmt(k, { month: 'short' }).replace('.', '') }); }
    return out;
  }
  function etatCol(c) {
    var h = N.horaire(c.cle);
    if (!h.ouvert) return { etat: 'ferme', texte: h.raison };
    if (!inst.travaille(c.prac.id, c.cle)) return { etat: 'repos', texte: c.prac.nom + ' ne travaille pas ce jour' };
    return { etat: 'ouvert' };
  }
  function elementsCol(c) {
    var j = inst.jour(c.cle), out = [];
    j.rdvs.forEach(function (r) { if (r.prac === c.prac.id) out.push({ t: 'rdv', o: r }); });
    j.blocs.forEach(function (b) { if (b.prac === c.prac.id || b.prac === 'all') out.push({ t: 'bloc', o: b }); });
    return out.sort(function (a, b) { return a.o.debut - b.o.debut; });
  }
  var libRdv = function (r) {
    var s = N.svc(r.service);
    return hh(r.debut) + ', ' + r.client.nom + ', ' + s.nom + ', statut ' + statutNom(r.statut).toLowerCase() + (r.acompte ? ', acompte simulé' : '') + (r.statut === 'confirme' ? '. Maj et flèches pour déplacer' : '');
  };
  var stGrille = function (o) { return o.statut === 'propose' ? 'Proposé · attente' : statutNom(o.statut) + (o.source === 'client' ? ' · en ligne' : '') + (o.acompte ? ' · acompte' : ''); };

  function itemGrille(el, col) {
    var o = el.o, top = (o.debut - T0) * PPM, h = (o.fin - o.debut) * PPM;
    if (el.t === 'bloc') {
      return '<button type="button" class="bloc" style="top:' + top + 'px;height:' + h + 'px" data-act="detail" data-id="' + o.id + '" aria-label="Créneau bloqué, ' + plage(o.debut, o.fin) + ', ' + esc(o.motif) + '"><b>Bloqué</b><span>' + esc(o.motif) + '</span></button>';
    }
    var s = N.svc(o.service);
    return '<button type="button" class="rv st-' + o.statut + (o.fin - o.debut <= 30 ? ' court' : o.fin - o.debut <= 45 ? ' moyen' : '') + (o.source === 'client' ? ' en-ligne' : '') + (o.deplace ? ' deplace' : '') + '" style="top:' + top + 'px;height:' + (h - 2) + 'px" data-act="detail" data-id="' + o.id + '" aria-label="' + esc(libRdv(o)) + '"' + (o.statut === 'confirme' ? ' aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"' : '') + '>' +
      '<span class="rv-h">' + hh(o.debut) + '</span><span class="rv-n">' + esc(o.client.nom) + '</span><span class="rv-s">' + s.nom + ((o.options || []).length ? ' +' + o.options.length : '') + '</span><span class="rv-st">' + stGrille(o) + '</span></button>';
  }
  function itemListe(el) {
    var o = el.o;
    if (el.t === 'bloc') return '<li><button type="button" class="li bloc" data-act="detail" data-id="' + o.id + '"><span class="li-h">' + plage(o.debut, o.fin) + '</span><span class="li-t"><b>Créneau bloqué</b><span>' + esc(o.motif) + '</span></span></button></li>';
    var s = N.svc(o.service);
    return '<li><button type="button" class="li rv st-' + o.statut + '" data-act="detail" data-id="' + o.id + '" aria-label="' + esc(libRdv(o)) + '"><span class="li-h">' + plage(o.debut, o.fin) + '</span><span class="li-t"><b>' + esc(o.client.nom) + '</b><span>' + s.nom + ((o.options || []).length ? ' + ' + pl(o.options.length, 'option') : '') + (o.source === 'client' ? ' · réservé en ligne' : '') + (o.acompte ? ' · acompte simulé' : '') + '</span></span><span class="chip st-' + o.statut + '">' + statutNom(o.statut) + '</span></button></li>';
  }

  function htmlPlanning() {
    var cols = colonnes(), n = cols.length, grille = '', liste = '';
    var heures = ''; for (var t = T0; t <= T1; t += 60) heures += '<span style="top:' + ((t - T0) * PPM) + 'px">' + hh(t) + '</span>';
    var entetes = '<div class="g-coin"></div>' + cols.map(function (c) {
      var sel = c.cle === G.date, ei = G.mode === 'semaine';
      var inner = '<b>' + c.titre + '</b><span>' + c.sous + '</span>';
      return ei ? '<div class="g-tete' + (sel ? ' sel' : '') + '"><button type="button" data-act="jour-g" data-date="' + c.cle + '" aria-pressed="' + sel + '" aria-label="' + longJour(c.cle) + '">' + inner + '</button></div>' : '<div class="g-tete">' + inner + '</div>';
    }).join('');
    var corps = '<div class="g-axe" style="height:' + ((T1 - T0) * PPM) + 'px" aria-hidden="true">' + heures + '</div>';
    cols.forEach(function (c) {
      var et = etatCol(c), els = elementsCol(c), h = N.horaire(c.cle), inner = '';
      if (et.etat !== 'ouvert') inner = '<p class="col-etat">' + et.texte + '</p>';
      else {
        inner += '<i class="pause" style="top:' + ((N.PAUSE[0] - T0) * PPM) + 'px;height:' + ((N.PAUSE[1] - N.PAUSE[0]) * PPM) + 'px"><span>Pause</span></i>';
        if (h.fermeture < T1) inner += '<i class="hors" style="top:' + ((h.fermeture - T0) * PPM) + 'px;bottom:0"></i>';
        inner += els.map(function (el) { return itemGrille(el, c); }).join('');
        if (c.cle === auj) { var nm = inst.minutesMaintenant(); if (nm >= T0 && nm <= T1) inner += '<i class="maintenant" style="top:' + ((nm - T0) * PPM) + 'px"><span>Maintenant</span></i>'; }
      }
      corps += '<div class="g-col ' + et.etat + '" data-cle="' + c.cle + '" data-prac="' + c.prac.id + '" style="height:' + ((T1 - T0) * PPM) + 'px">' + inner + '</div>';
      var li = et.etat !== 'ouvert' ? '<p class="liste-vide">' + et.texte + '</p>' : (els.length ? '<ul>' + els.map(itemListe).join('') + '</ul>' : '<p class="liste-vide">Aucun rendez-vous.</p>');
      liste += '<section class="liste-col"><h3>' + (G.mode === 'jour' ? c.titre + ' <span>' + c.sous + '</span>' : maj(longJour(c.cle)) + (c.cle === G.date ? ' <em>jour affiché</em>' : '')) + '</h3>' + li + '</section>';
    });
    grille = '<div class="g-plan" style="--n:' + n + '" role="group" aria-label="Planning en grille">' + entetes + corps + '</div>';
    return grille + '<div class="g-liste" role="group" aria-label="Planning en liste">' + liste + '</div>';
  }

  function htmlIndic() {
    var f = G.mode === 'jour' ? G.prac : G.semPrac, x = inst.indicateurs(G.date, f), h = N.horaire(G.date);
    var qui = f === 'all' ? 'toute l’équipe' : N.prac(f).nom;
    return '<div class="indic" aria-label="Indicateurs du jour"><p class="indic-titre">Indicateurs du ' + longJour(G.date) + (G.date === auj ? ' (aujourd’hui)' : '') + ' · ' + qui + '</p>' +
      (h.ouvert ? '' : '<p class="indic-ferme">' + h.raison + '.</p>') +
      '<dl><div class="ind"><dt>Rendez-vous</dt><dd data-i="rdv">' + x.rdv + '</dd><dd class="sub">' + x.termines + ' terminé' + (x.termines > 1 ? 's' : '') + ' · ' + x.annules + ' annulé' + (x.annules > 1 ? 's' : '') + ' · ' + x.absents + ' absent' + (x.absents > 1 ? 's' : '') + '</dd></div>' +
      '<div class="ind"><dt>Taux d’occupation</dt><dd data-i="taux">' + x.taux + NB + '%</dd><dd class="sub"><span class="jauge" aria-hidden="true"><i style="width:' + x.taux + '%"></i></span>' + Math.round(x.occupe / 60 * 10) / 10 + ' h réservées sur ' + Math.round(x.dispo / 60 * 10) / 10 + ' h</dd></div>' +
      '<div class="ind"><dt>Montant prévu <small>(fictif)</small></dt><dd data-i="montant">' + mad(x.montant) + '</dd><dd class="sub">Hors annulés et absents</dd></div>' +
      '<div class="ind"><dt>Acomptes <small>(simulés)</small></dt><dd data-i="acompte">' + mad(x.acompte) + '</dd><dd class="sub">' + (x.rembourse ? mad(x.rembourse) + ' remboursés' : 'Versés ou conservés') + '</dd></div></dl></div>';
  }

  function titreG() {
    if (G.mode === 'jour') return maj(longComplet(G.date));
    var l = debutSemaine(G.date), f = N.plus(l, 5);
    return 'Semaine du ' + N.depuis(l).getDate() + ' au ' + N.depuis(f).getDate() + ' ' + fmt(f, { month: 'long', year: 'numeric' });
  }

  function htmlSectionPlanning() {
    var opt = (G.mode === 'jour' ? '<option value="all"' + (G.prac === 'all' ? ' selected' : '') + '>Toute l’équipe</option>' : '') +
      N.PRACS.map(function (p) { var v = G.mode === 'jour' ? G.prac : G.semPrac; return '<option value="' + p.id + '"' + (v === p.id ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('');
    return '<div class="g-barre"><div class="g-nav" role="group" aria-label="Navigation dans le temps"><button type="button" class="btn-rond" data-act="g-prec" data-f="prec" aria-label="' + (G.mode === 'jour' ? 'Jour précédent' : 'Semaine précédente') + '">' + icone('fleche') + '</button>' +
      '<button type="button" class="btn btn-sec" data-act="g-auj" data-f="auj">Aujourd’hui</button><button type="button" class="btn-rond" data-act="g-suiv" data-f="suiv" aria-label="' + (G.mode === 'jour' ? 'Jour suivant' : 'Semaine suivante') + '">' + icone('suiv') + '</button></div>' +
      '<p class="g-titre" aria-live="polite">' + titreG() + '</p>' +
      '<div class="g-filtres"><div class="seg" role="radiogroup" aria-label="Affichage"><label><input type="radio" name="g-mode" value="jour"' + (G.mode === 'jour' ? ' checked' : '') + ' data-f="m-jour"><span>Jour</span></label><label><input type="radio" name="g-mode" value="semaine"' + (G.mode === 'semaine' ? ' checked' : '') + ' data-f="m-sem"><span>Semaine</span></label></div>' +
      '<label class="sel-lab"><span>Praticienne</span><select id="g-prac" data-f="g-prac">' + opt + '</select></label>' +
      '<label class="sel-lab"><span>Date</span><input type="date" id="g-date" data-f="g-date" value="' + G.date + '"></label></div></div>' +
      '<div id="g-indic">' + htmlIndic() + '</div>' +
      '<ul class="legende g-leg" aria-label="Légende des statuts">' + N.STATUTS.map(function (s) { return '<li><i class="sw st-' + s.id + '"></i>' + s.nom + (s.id === 'propose' ? ' (liste d’attente)' : '') + '</li>'; }).join('') + '<li><i class="sw blq"></i>Bloqué</li></ul>' +
      '<p class="aide g-aide">Touchez un rendez-vous pour son détail, son statut et son déplacement. ' + (G.mode === 'jour' ? '<span class="seulement-grille">Dans la grille : cliquez une zone vide pour ajouter un rendez-vous, glissez un rendez-vous confirmé pour le déplacer, ou, au clavier, <kbd>Maj</kbd> + flèches (30 minutes par pression ; gauche et droite changent de colonne).</span>' : '<span class="seulement-grille">Dans la grille : glissez un rendez-vous confirmé vers un autre jour, ou, au clavier, <kbd>Maj</kbd> + flèches. </span>Choisissez un jour dans les en-têtes pour recalculer les indicateurs.') + '</p>' +
      '<p class="g-msg" id="g-msg" role="status"></p>' +
      '<div id="g-planning">' + htmlPlanning() + '</div>';
  }

  function htmlCorpsG() {
    return { planning: htmlSectionPlanning, attente: htmlAttente, clientes: htmlClientes, rappels: htmlRappels, semaine: htmlSemaine }[G.sous]();
  }

  function rendreGestion(focusF) {
    var avant = focusF || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f);
    var scroll = vueG.querySelector('.g-plan, .g-corps-s') ? window.scrollY : null;
    var titre = SOUS_G.filter(function (s) { return s[0] === G.sous; })[0][1];
    vueG.innerHTML =
      '<nav class="sousnav g-sousnav" aria-label="Sections de la gestion">' + SOUS_G.map(function (s) { return '<button type="button" data-gs="' + s[0] + '" data-f="gs-' + s[0] + '"' + (G.sous === s[0] ? ' aria-current="page"' : '') + '>' + s[1] + '</button>'; }).join('') + '</nav>' +
      '<div class="g-tete-page"><div><p class="kicker">Gestion de l’institut · données fictives</p><h2 class="etape-titre" tabindex="-1">' + titre + '</h2></div>' +
      (G.sous === 'planning' ? '<div class="g-actions"><button type="button" class="btn" data-act="ajout" data-f="ajout">' + icone('plus') + 'Ajouter un rendez-vous</button><button type="button" class="btn btn-sec" data-act="blocage" data-f="blocage">' + icone('bloc') + 'Bloquer un créneau</button></div>' : '') + '</div>' +
      '<div class="g-corps-s" id="g-corps">' + htmlCorpsG() + '</div>';
    if (avant) { var f = vueG.querySelector('[data-f="' + avant + '"]'); if (f) f.focus({ preventScroll: true }); }
    if (scroll != null) window.scrollTo(0, scroll);
    if (msgPlanning.texte && G.sous === 'planning') afficherMsgPlanning();
  }

  function afficherMsgPlanning() {
    var m = $('#g-msg'); if (!m) return;
    m.textContent = msgPlanning.texte; m.classList.toggle('err', msgPlanning.erreur);
  }
  function dire(texte, erreur) { msgPlanning = { texte: texte, erreur: !!erreur }; afficherMsgPlanning(); }

  function majPlanning() {
    // recalcul des indicateurs et du planning sans toucher aux contrôles
    var a = $('#g-indic'), p = $('#g-planning');
    if (!a || !p || G.sous !== 'planning') { rendreGestion(); return; }
    a.innerHTML = htmlIndic(); p.innerHTML = htmlPlanning();
  }

  vueG.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'g-mode') { G.mode = t.value; if (G.mode === 'semaine' && G.prac !== 'all') G.semPrac = G.prac; if (G.mode === 'jour') G.prac = 'all'; rendreGestion('m-' + (G.mode === 'jour' ? 'jour' : 'sem')); }
    else if (t.id === 'g-prac') { if (G.mode === 'jour') G.prac = t.value; else G.semPrac = t.value; rendreGestion('g-prac'); }
    else if (t.id === 'g-date') { if (t.value) { G.date = t.value; rendreGestion('g-date'); } }
  });

  var clicBloque = false, finClic = function () { clicBloque = true; setTimeout(function () { clicBloque = false; }, 0); };
  vueG.addEventListener('click', function (e) {
    if (clicBloque) { e.stopPropagation(); return; }     // le clic qui suit un glisser-déposer
    var gs = e.target.closest('[data-gs]');
    if (gs) { G.sous = gs.dataset.gs; if (G.sous === 'clientes') G.fiche = null; rendreGestion('gs-' + G.sous); return; }
    var t = e.target.closest('[data-act]');
    if (!t) {
      var col = e.target.closest('.g-col.ouvert');
      if (col && !e.target.closest('button')) {
        var y = e.clientY - col.getBoundingClientRect().top, m = T0 + Math.floor(y / PPM / 30) * 30;
        ouvrirAjout({ cle: col.dataset.cle, prac: col.dataset.prac, debut: m }, col);
      }
      return;
    }
    var a = t.dataset.act, pas = G.mode === 'jour' ? 1 : 7;
    if (a === 'g-prec') { G.date = N.plus(G.date, -pas); rendreGestion('prec'); }
    else if (a === 'g-suiv') { G.date = N.plus(G.date, pas); rendreGestion('suiv'); }
    else if (a === 'g-auj') { G.date = auj; rendreGestion('auj'); }
    else if (a === 'jour-g') { G.date = t.dataset.date; rendreGestion(); var b = vueG.querySelector('[data-act=jour-g][data-date="' + G.date + '"]'); if (b) b.focus({ preventScroll: true }); }
    else if (a === 'detail') ouvrirDetail(t.dataset.id, t);
    else if (a === 'ajout') ouvrirAjout({}, t);
    else if (a === 'blocage') ouvrirBlocage({}, t);
  });

  /* ----- déplacement d’un rendez-vous : souris et clavier ----- */
  function appliquerDeplacement(id, o) {
    var avant = inst.trouver(id), nom = avant ? avant.client.nom : '', r = inst.deplacer(id, o);
    if (!r.ok) {
      dire('Déplacement impossible : ' + r.erreur, true); toast('Déplacement impossible : ' + r.erreur);
      return r;
    }
    var m = r.rdv, txt = 'Rendez-vous de ' + nom + ' déplacé : ' + courtJour(r.ancien.cle) + ' à ' + hh(r.ancien.debut) + ' → ' + courtJour(m.cle) + ' à ' + hh(m.debut) + ' avec ' + N.prac(m.prac).nom + '. Aucun chevauchement.' +
      (r.offre ? ' Créneau libéré proposé à ' + r.offre.client.nom + ' (liste d’attente).' : '') + ' Rappel simulé recalculé, aucun message envoyé.';
    dire(txt, false); toast(txt);
    return r;
  }
  function refocusRdv(id) { var n = $('.g-plan .rv[data-id="' + id + '"], .g-liste .rv[data-id="' + id + '"]'); if (n) n.focus({ preventScroll: true }); }

  var drag = null;
  vueG.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    var b = e.target.closest && e.target.closest('.g-plan .rv'); if (!b) return;
    var r = inst.trouver(b.dataset.id); if (!r || r.statut !== 'confirme') return;
    drag = { b: b, r: r, x: e.clientX, y: e.clientY, actif: false, cible: null };
  });
  function cibleDrag(e) {
    var els = document.elementsFromPoint(e.clientX, e.clientY), col = null, i;
    for (i = 0; i < els.length; i++) if (els[i].classList && els[i].classList.contains('g-col')) { col = els[i]; break; }
    if (!col) return null;
    var d = Math.round((e.clientY - drag.y) / PPM / 30) * 30;
    return { col: col, o: { cle: col.dataset.cle, prac: col.dataset.prac, debut: drag.r.debut + d } };
  }
  function retirerCible() { $$('.cible').forEach(function (x) { x.remove(); }); }
  function montrerCible(c) {
    retirerCible();
    if (!c) return;
    var res = inst.deplacer(drag.r.id, c.o, true), top = (c.o.debut - T0) * PPM, h = drag.r.duree * PPM;
    var el = document.createElement('i');
    el.className = 'cible ' + (res.ok ? 'ok' : 'ko'); el.style.top = top + 'px'; el.style.height = h + 'px';
    el.innerHTML = '<span>' + (res.ok ? plage(c.o.debut, c.o.debut + drag.r.duree) + ' · ' + N.prac(c.o.prac).nom : esc(res.erreur)) + '</span>';
    c.col.appendChild(el);
  }
  function finDrag() {
    if (!drag) return;
    drag.b.classList.remove('glisse'); drag.b.style.transform = ''; drag.b.style.pointerEvents = '';
    document.body.classList.remove('glisse-en-cours'); retirerCible();
  }
  document.addEventListener('pointermove', function (e) {
    if (!drag || drag.annule) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.actif) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.actif = true; drag.b.classList.add('glisse'); drag.b.style.pointerEvents = 'none'; document.body.classList.add('glisse-en-cours');
    }
    drag.b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    drag.cible = cibleDrag(e); montrerCible(drag.cible);
  });
  document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    if (drag.annule) { drag = null; finClic(); return; }   /* glissement annulé par Échap : le clic du relâchement ne doit rien ouvrir */
    if (drag.actif) drag.cible = cibleDrag(e);   /* position du relâchement : Safari peut regrouper les derniers mouvements */
    var d = drag; finDrag(); drag = null;
    if (!d.actif) return;
    finClic();
    if (!d.cible) { dire('Déplacement annulé : déposez le rendez-vous sur une colonne du planning.', true); return; }
    var r = appliquerDeplacement(d.r.id, d.cible.o);
    if (r.ok) { majPlanning(); refocusRdv(d.r.id); }
  });
  document.addEventListener('pointercancel', function () { finDrag(); drag = null; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drag && drag.actif && !drag.annule) { finDrag(); drag.annule = true; dire('Déplacement annulé.', false); } });

  vueG.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('.g-plan .rv');
    if (!b || !e.shiftKey) return;
    var dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key], dy = { ArrowUp: -30, ArrowDown: 30 }[e.key];
    if (dx === undefined && dy === undefined) return;
    e.preventDefault();
    var r = inst.trouver(b.dataset.id), cols = $$('.g-plan .g-col'), i = cols.indexOf(b.closest('.g-col')), o = { cle: r.cle, prac: r.prac, debut: r.debut + (dy || 0) };
    if (dx) {
      var c = cols[i + dx];
      if (!c) { dire('Déplacement impossible : il n’y a pas de colonne de ce côté.', true); return; }
      o.cle = c.dataset.cle; o.prac = c.dataset.prac;
    }
    var res = appliquerDeplacement(r.id, o);
    if (res.ok) { majPlanning(); refocusRdv(r.id); }
  });

  /* ----- dialogues ----- */
  var opener = null;
  function ouvrir(html, o, from) {
    opener = from || document.activeElement;
    dlg.innerHTML = html; dlg.dataset.type = o || '';
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', function () {
    var a = document.activeElement;
    if (a && a !== document.body && a !== dlg && !dlg.contains(a)) { opener = null; return; }   // le focus est déjà ailleurs : on ne le déplace pas
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    else if (S.vue === 'gestion') { var h = $('#vue-gestion .etape-titre'); if (h) h.focus({ preventScroll: true }); }
    opener = null;
  });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) { dlg.close(); return; }
    var t = e.target.closest('[data-d]'); if (!t) return;
    var f = ADLG[t.dataset.d]; if (f) f(t);
  });
  dlg.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.form) { e.preventDefault(); e.target.form.requestSubmit ? e.target.form.requestSubmit() : e.target.form.dispatchEvent(new Event('submit', { cancelable: true })); } });
  ADLG.fermer = function () { dlg.close(); };
  ADLG.statut = function (t) { changerStatutDlg(t.dataset.id, t.dataset.s); };
  ADLG.debloquer = function (t) {
    var b = inst.trouver(t.dataset.id), r = inst.debloquer(t.dataset.id);
    if (r.ok) { dlg.close(); majPlanning(); toast('Créneau débloqué : ' + plage(b.debut, b.fin) + ' de nouveau disponible à la réservation.'); }
  };
  ADLG.deplacer = function (t) { ouvrirDeplacement(t.dataset.id, opener); };
  ADLG.fiche = function (t) { var o = inst.trouver(t.dataset.id); G.sous = 'clientes'; G.fiche = N.cleTel(o.client.tel); dlg.close(); opener = null; rendreGestion(); var h = $('#vue-gestion .etape-titre'); if (h) h.focus({ preventScroll: true }); window.scrollTo(0, 0); };
  ADLG['att-oui'] = function (t) { reponseAttenteGestion(t.dataset.id, true); };
  ADLG['att-non'] = function (t) { reponseAttenteGestion(t.dataset.id, false); };

  var entete = function (kicker, titre) { return '<div class="dlg-tete"><div><p class="kicker">' + kicker + '</p><h2 id="dlg-titre">' + titre + '</h2></div><button type="button" class="btn-rond" data-d="fermer" aria-label="Fermer">' + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'; };

  function reponseAttenteGestion(id, accepte) {
    var r = inst.repondre(id, accepte, accepte ? { sansAcompte: true } : { expire: true });
    if (!r.ok) { toast(r.erreur); return; }
    dlg.close(); opener = null; rendreGestion();
    toast(accepte ? 'Place acceptée par téléphone : rendez-vous confirmé pour ' + r.rdv.client.nom + '.' : 'Sans réponse de ' + r.entree.client.nom + '.' + (r.suivante ? ' Le créneau est proposé à ' + r.suivante.client.nom + ' (suivante sur la liste).' : ' Le créneau est de nouveau libre.'));
  }

  function lignesAcompteGestion(o) {
    if (!o.acompte) return '<div><dt>Acompte (simulé)</dt><dd id="dlg-ac">Aucun acompte (rendez-vous pris sur place ou au téléphone)</dd></div>';
    var a = o.acompte, h = inst.heuresAvant(o);
    var suite = a.etat === 'verse' ? (h >= N.DELAI_REMB ? ' · remboursé si annulé avant le ' + limiteRemb(o) : ' · conservé si annulé (moins de ' + N.DELAI_REMB + ' h)') : '';
    return '<div><dt>Acompte (simulé)</dt><dd id="dlg-ac" data-etat="' + a.etat + '">' + texteAcompte(o) + suite + '</dd></div>';
  }

  function ouvrirDetail(id, from) {
    var o = inst.trouver(id); if (!o) return;
    if (o.service && o.statut === 'propose') {
      var e = inst.fileJour(o.cle).filter(function (x) { return x.rdv === o.id; })[0], s0 = N.svc(o.service);
      ouvrir(entete('Place proposée · liste d’attente', esc(o.client.nom)) +
        '<dl class="dlg-dl"><div><dt>Soin</dt><dd>' + s0.nom + ' · ' + minutes(o.duree) + '</dd></div><div><dt>Créneau retenu</dt><dd>' + maj(longJour(o.cle)) + ', ' + plage(o.debut, o.fin) + ' avec ' + N.prac(o.prac).nom + '</dd></div>' +
        '<div><dt>Téléphone (fictif)</dt><dd>' + esc(o.client.tel) + '</dd></div><div><dt>Rang à l’inscription</dt><dd>' + (e ? inst.fileJour(o.cle).indexOf(e) + 1 : '') + '</dd></div></dl>' +
        '<p class="aide">Le créneau est mis de côté pour cette personne (aucun message réel). Sans réponse, il passe à la suivante.</p>' +
        '<div class="actions"><button type="button" class="btn" data-d="att-oui" data-id="' + (e ? e.id : '') + '">Accepté par téléphone</button><button type="button" class="btn btn-sec" data-d="att-non" data-id="' + (e ? e.id : '') + '">Sans réponse : passer à la suivante</button><button type="button" class="btn btn-sec" data-d="fermer">Fermer</button></div>', 'propose', from);
      return;
    }
    if (o.service) {
      var s = N.svc(o.service), p = N.prac(o.prac), os = nomsOptions(o.options);
      ouvrir(entete('Rendez-vous · ' + o.ref, esc(o.client.nom)) +
        '<dl class="dlg-dl"><div><dt>Soin</dt><dd>' + s.nom + (os.length ? ' + ' + os.join(', ') : '') + '</dd></div><div><dt>Praticienne</dt><dd>' + p.nom + '</dd></div><div><dt>Date</dt><dd>' + maj(longJour(o.cle)) + '</dd></div>' +
        '<div><dt>Horaire</dt><dd>' + plage(o.debut, o.fin) + ' (' + minutes(o.duree) + ')</dd></div><div><dt>Prix (fictif)</dt><dd>' + mad(o.prix) + '</dd></div>' + lignesAcompteGestion(o) +
        '<div><dt>Téléphone (fictif)</dt><dd>' + esc(o.client.tel) + '</dd></div><div><dt>Origine</dt><dd>' + (o.source === 'client' ? 'Réservé en ligne (vous)' : o.source === 'manuel' ? 'Ajouté à la main' : o.source === 'attente' ? 'Place de la liste d’attente' : 'Agenda de démonstration') + '</dd></div>' +
        (o.ancien ? '<div><dt>Déplacé</dt><dd>depuis le ' + longJour(o.ancien.cle) + ' à ' + hh(o.ancien.debut) + '</dd></div>' : '') +
        (o.client.note ? '<div><dt>Remarque</dt><dd>' + esc(o.client.note) + '</dd></div>' : '') + '</dl>' +
        '<fieldset class="statuts"><legend>Statut du rendez-vous</legend><div class="statuts-b">' + N.STATUTS.filter(function (st) { return st.id !== 'propose'; }).map(function (st) {
          return '<button type="button" class="stbtn st-' + st.id + '" data-d="statut" data-id="' + o.id + '" data-s="' + st.id + '" aria-pressed="' + (o.statut === st.id) + '">' + st.nom + '</button>'; }).join('') + '</div></fieldset>' +
        '<p class="dlg-msg" id="dlg-msg" role="status"></p><div class="actions"><button type="button" class="btn" data-d="deplacer" data-id="' + o.id + '">Déplacer…</button><button type="button" class="btn btn-sec" data-d="fiche" data-id="' + o.id + '">Fiche cliente</button><button type="button" class="btn btn-sec" data-d="fermer">Fermer</button></div>', 'detail', from);
    } else {
      var pr = o.prac === 'all' ? 'Toute l’équipe' : N.prac(o.prac).nom;
      ouvrir(entete('Créneau bloqué', esc(o.motif)) +
        '<dl class="dlg-dl"><div><dt>Praticienne</dt><dd>' + pr + '</dd></div><div><dt>Date</dt><dd>' + maj(longJour(o.cle)) + '</dd></div><div><dt>Plage</dt><dd>' + plage(o.debut, o.fin) + '</dd></div></dl>' +
        '<p class="aide">Ce créneau n’est pas proposé à la réservation en ligne.</p><div class="actions"><button type="button" class="btn" data-d="debloquer" data-id="' + o.id + '">Débloquer ce créneau</button><button type="button" class="btn btn-sec" data-d="fermer">Fermer</button></div>', 'bloc', from);
    }
  }
  function changerStatutDlg(id, st) {
    var r = inst.changerStatut(id, st), msg = $('#dlg-msg');
    if (!r.ok) { msg.textContent = r.erreur; msg.className = 'dlg-msg err'; return; }
    $$('.stbtn', dlg).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.s === st); });
    var ac = r.rdv.acompte;
    msg.className = 'dlg-msg'; msg.textContent = 'Statut : ' + statutNom(st).toLowerCase() + '.' + (st === 'annule' ? ' Le créneau est libéré.' : '') + (ac && (st === 'annule' || st === 'absent') ? ' ' + texteAcompte(r.rdv) + '.' : '') +
      (r.offre ? ' Créneau proposé à ' + r.offre.client.nom + ' (première en liste d’attente).' : '');
    var d = $('#dlg-ac'); if (d) { d.textContent = ac ? texteAcompte(r.rdv) : d.textContent; d.dataset.etat = ac ? ac.etat : ''; }
    majPlanning();
    if (S.vue === 'gestion') toast('Rendez-vous de ' + r.rdv.client.nom + ' : ' + statutNom(st).toLowerCase() + '.' + (r.offre ? ' Créneau proposé à ' + r.offre.client.nom + ' (liste d’attente).' : ''));
  }

  /* déplacement par formulaire (téléphone, clavier) */
  function ouvrirDeplacement(id, from) {
    var o = inst.trouver(id); if (!o) return;
    var s = N.svc(o.service);
    ouvrir(entete('Déplacer · ' + o.ref, esc(o.client.nom)) +
      '<form id="f-dep" class="form" novalidate><p class="aide">' + s.nom + ' · ' + minutes(o.duree) + '. Actuellement : ' + longJour(o.cle) + ', ' + plage(o.debut, o.fin) + ' avec ' + N.prac(o.prac).nom + '. Seuls les créneaux sans chevauchement sont proposés.</p>' +
      '<div class="duo"><div class="champ"><label for="d-date">Nouvelle date</label><input type="date" id="d-date" min="' + auj + '" value="' + o.cle + '"></div>' +
      '<div class="champ"><label for="d-prac">Praticienne</label><select id="d-prac"></select></div></div>' +
      '<div class="champ"><label for="d-heure">Nouvelle heure</label><select id="d-heure"></select><small id="d-info" role="status"></small></div>' +
      '<div class="actions"><button type="submit" class="btn">Déplacer le rendez-vous</button><button type="button" class="btn btn-sec" data-d="fermer">Annuler</button></div></form>', 'deplacer', from);
    var selP = $('#d-prac'), selH = $('#d-heure');
    function maj2() {
      var k = $('#d-date').value, prevP = selP.value || o.prac, prevH = selH.value ? +selH.value : o.debut;
      var el = inst.eligibles(s).filter(function (p) { return inst.travaille(p.id, k); });
      selP.innerHTML = el.map(function (p) { return '<option value="' + p.id + '"' + (p.id === prevP ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('') || '<option value="">Aucune praticienne ce jour</option>';
      var hs = selP.value ? inst.debutsPrac(selP.value, k, o.duree, 0, o.id) : [];
      selH.innerHTML = hs.map(function (t) { return '<option value="' + t + '"' + (t === prevH ? ' selected' : '') + '>' + plage(t, t + o.duree) + '</option>'; }).join('') || '<option value="">Aucun créneau libre</option>';
      $('#d-info').textContent = hs.length ? pl(hs.length, 'créneau libre', 'créneaux libres') + ' pour ' + (selP.value ? N.prac(selP.value).nom : '') + ' ce jour-là, sans chevauchement.' : 'Aucun créneau libre : essayez une autre date ou praticienne.';
    }
    maj2();
    $('#d-date').addEventListener('change', maj2); selP.addEventListener('change', maj2);
    $('#f-dep').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!selH.value || !selP.value) { $('#d-info').textContent = 'Choisissez un créneau libre pour continuer.'; return; }
      var r = appliquerDeplacement(o.id, { cle: $('#d-date').value, prac: selP.value, debut: +selH.value });
      if (!r.ok) { $('#d-info').textContent = r.erreur; maj2(); return; }
      G.date = r.rdv.cle; dlg.close(); opener = null; rendreGestion(); refocusRdv(o.id);
    });
    selH.focus();
  }

  /* ajout manuel */
  function optionsServices(sel) {
    return N.CATEGORIES.map(function (c) { return '<optgroup label="' + c.nom + '">' + N.SERVICES.filter(function (s) { return s.cat === c.id; }).map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + s.nom + ' · ' + s.duree + ' min · ' + mad(s.prix) + '</option>'; }).join('') + '</optgroup>'; }).join('');
  }
  function ouvrirAjout(pre, from) {
    var cle0 = pre.cle || (G.date >= auj ? G.date : auj);
    var prac0 = pre.prac || (G.mode === 'jour' ? (G.prac !== 'all' ? G.prac : '') : G.semPrac);
    var svc0 = 'c2';
    if (prac0 && !N.peut(N.prac(prac0), N.svc(svc0))) svc0 = N.SERVICES.filter(function (s) { return N.peut(N.prac(prac0), s); })[0].id;
    ouvrir(entete('Gestion', 'Ajouter un rendez-vous') +
      '<form id="f-ajout" class="form" novalidate><p class="aide">Rendez-vous pris au téléphone ou sur place. Le créneau doit être libre pour la praticienne : deux rendez-vous ne peuvent pas se chevaucher.</p>' +
      '<div class="champ"><label for="a-service">Soin</label><select id="a-service">' + optionsServices(svc0) + '</select></div>' +
      '<div class="duo"><div class="champ"><label for="a-date">Date</label><input type="date" id="a-date" min="' + auj + '" value="' + cle0 + '"></div>' +
      '<div class="champ"><label for="a-prac">Praticienne</label><select id="a-prac"></select></div></div>' +
      '<div class="champ"><label for="a-heure">Heure de début</label><select id="a-heure"></select><small id="a-info" role="status"></small></div>' +
      '<div class="duo"><div class="champ"><label for="a-nom">Nom et prénom</label><input id="a-nom" type="text" autocomplete="off" placeholder="Sara Test"><small class="msg-err" id="a-nom-e"></small></div>' +
      '<div class="champ"><label for="a-tel">Téléphone</label><input id="a-tel" type="tel" inputmode="tel" autocomplete="off" placeholder="06 00 00 00 00"><small class="msg-err" id="a-tel-e"></small></div></div>' +
      '<div class="actions"><button type="submit" class="btn">Ajouter au planning</button><button type="button" class="btn btn-sec" data-d="fermer">Annuler</button></div></form>', 'ajout', from);
    var f = $('#f-ajout', dlg), selP = $('#a-prac'), selH = $('#a-heure'), dem = pre;
    function maj2() {
      var s = N.svc($('#a-service').value), k = $('#a-date').value, prevP = selP.value || prac0 || '', prevH = selH.value ? +selH.value : dem.debut;
      var el = inst.eligibles(s).filter(function (p) { return inst.travaille(p.id, k); });
      selP.innerHTML = el.map(function (p) { return '<option value="' + p.id + '"' + (p.id === prevP ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('') || '<option value="">Aucune praticienne ce jour</option>';
      var hs = selP.value ? inst.debutsPrac(selP.value, k, s.duree, 0) : [];
      selH.innerHTML = hs.map(function (t) { return '<option value="' + t + '"' + (t === prevH ? ' selected' : '') + '>' + hh(t) + ' – ' + hh(t + s.duree) + '</option>'; }).join('') || '<option value="">Aucun créneau libre</option>';
      $('#a-info').textContent = hs.length ? hs.length + ' créneau' + (hs.length > 1 ? 'x' : '') + ' libre' + (hs.length > 1 ? 's' : '') + ' pour ' + (selP.value ? N.prac(selP.value).nom : '') + ' ce jour-là.' : 'Aucun créneau libre : essayez une autre date ou praticienne.';
    }
    maj2();
    ['a-service', 'a-date'].forEach(function (i) { $('#' + i).addEventListener('change', function () { dem = {}; maj2(); }); });
    selP.addEventListener('change', function () { dem = {}; maj2(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = $('#a-nom').value, tel = $('#a-tel').value, ok = true;
      $('#a-nom-e').textContent = valideNom(nom) ? '' : 'Indiquez un nom valide.'; $('#a-tel-e').textContent = valideTel(tel) ? '' : 'Numéro invalide (10 chiffres, 05/06/07, ou +212).';
      $('#a-nom').toggleAttribute('aria-invalid', !valideNom(nom)); $('#a-tel').toggleAttribute('aria-invalid', !valideTel(tel));
      if (!valideNom(nom)) { $('#a-nom').focus(); ok = false; } else if (!valideTel(tel)) { $('#a-tel').focus(); ok = false; }
      if (!selH.value || !selP.value) { $('#a-info').textContent = 'Choisissez un créneau libre pour continuer.'; ok = false; }
      if (!ok) return;
      var r = inst.reserver({ cle: $('#a-date').value, debut: +selH.value, service: $('#a-service').value, prac: selP.value, client: { nom: nom.trim(), tel: tel.trim() }, source: 'manuel', delai: 0 });
      if (!r.ok) { $('#a-info').textContent = r.erreur; maj2(); return; }
      G.date = r.rdv.cle; if (G.mode === 'semaine') G.semPrac = r.rdv.prac; else if (G.prac !== 'all') G.prac = r.rdv.prac;
      dlg.close(); rendreGestion(); toast('Rendez-vous ajouté : ' + r.rdv.client.nom + ', ' + courtJour(r.rdv.cle) + ' à ' + hh(r.rdv.debut) + ' avec ' + N.prac(r.rdv.prac).nom + '.');
    });
    $('#a-nom').focus();
  }

  /* blocage */
  function ouvrirBlocage(pre, from) {
    var cle0 = G.date >= auj ? G.date : auj, prac0 = G.mode === 'jour' ? (G.prac !== 'all' ? G.prac : 'sa') : G.semPrac;
    ouvrir(entete('Gestion', 'Bloquer un créneau') +
      '<form id="f-bloc" class="form" novalidate><p class="aide">Un créneau bloqué n’est plus proposé à la réservation en ligne. Les rendez-vous déjà pris ne sont pas déplacés : annulez-les d’abord.</p>' +
      '<fieldset class="choix"><legend>Que bloquer ?</legend><label><input type="radio" name="b-type" value="creneau" checked><span>Un créneau</span></label><label><input type="radio" name="b-type" value="jour"><span>Toute la journée d’une praticienne</span></label><label><input type="radio" name="b-type" value="equipe"><span>Tout l’institut sur un créneau</span></label></fieldset>' +
      '<div class="duo"><div class="champ"><label for="b-prac">Praticienne</label><select id="b-prac">' + N.PRACS.map(function (p) { return '<option value="' + p.id + '"' + (p.id === prac0 ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('') + '</select></div>' +
      '<div class="champ"><label for="b-date">Date</label><input type="date" id="b-date" min="' + auj + '" value="' + cle0 + '"></div></div>' +
      '<div class="duo" id="b-horaire"><div class="champ"><label for="b-debut">Début</label><select id="b-debut">' + (function () { var o = ''; for (var t = T0; t < T1; t += 30) o += '<option value="' + t + '"' + (t === 870 ? ' selected' : '') + '>' + hh(t) + '</option>'; return o; })() + '</select></div>' +
      '<div class="champ"><label for="b-duree">Durée</label><select id="b-duree"><option value="30">30 min</option><option value="60">1 h</option><option value="90" selected>1 h 30</option><option value="120">2 h</option><option value="180">3 h</option></select></div></div>' +
      '<div class="champ"><label for="b-motif">Motif</label><select id="b-motif"><option>Formation</option><option>Congé</option><option>Pause prolongée</option><option>Entretien du matériel</option><option>Autre motif</option></select></div>' +
      '<p class="dlg-msg" id="b-msg" role="alert"></p>' +
      '<div class="actions"><button type="submit" class="btn">Bloquer</button><button type="button" class="btn btn-sec" data-d="fermer">Annuler</button></div></form>', 'blocage', from);
    var f = $('#f-bloc', dlg);
    function typ() { return f.elements['b-type'].value; }
    function vis() { var t = typ(); $('#b-horaire').hidden = t === 'jour'; $('#b-prac').closest('.champ').hidden = t === 'equipe'; }
    $$('[name=b-type]', dlg).forEach(function (r) { r.addEventListener('change', vis); }); vis();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = typ(), k = $('#b-date').value, h = N.horaire(k), o;
      if (!h.ouvert) { $('#b-msg').textContent = h.raison + ' : rien à bloquer ce jour-là.'; return; }
      var motif = $('#b-motif').value;
      if (t === 'jour') o = { cle: k, prac: $('#b-prac').value, debut: h.ouverture, fin: h.fermeture, motif: motif + ' (journée)' };
      else { var d = +$('#b-debut').value; o = { cle: k, prac: t === 'equipe' ? 'all' : $('#b-prac').value, debut: d, fin: Math.min(d + +$('#b-duree').value, h.fermeture), motif: motif }; }
      if (o.prac !== 'all' && !inst.travaille(o.prac, k)) { $('#b-msg').textContent = N.prac(o.prac).nom + ' ne travaille pas ce jour-là.'; return; }
      var r = inst.bloquer(o);
      if (!r.ok) { $('#b-msg').textContent = r.erreur; return; }
      G.date = k; dlg.close(); rendreGestion();
      toast('Bloqué : ' + (o.prac === 'all' ? 'tout l’institut' : N.prac(o.prac).nom) + ', ' + courtJour(k) + ', ' + plage(o.debut, o.fin) + '. Ces horaires ne sont plus réservables en ligne.');
    });
  }

  /* =====================================================================
     GESTION : liste d’attente, clientes, rappels simulés, semaine
     ===================================================================== */

  var bas = function (s) { return s.charAt(0).toLowerCase() + s.slice(1); };

  /* ----- liste d’attente ----- */
  function joursChargees() {
    var out = [];
    for (var i = 0; i < 70 && out.length < 6; i++) {
      var k = N.plus(auj, i);
      if (N.horaire(k).ouvert && inst.indicateurs(k).taux >= 90) out.push({ cle: k, taux: inst.indicateurs(k).taux });
    }
    return out;
  }
  function htmlAttente() {
    var k = G.attDate || G.date, file = inst.fileJour(k), x = inst.indicateurs(k), h = N.horaire(k);
    var chauds = joursChargees();
    return '<p class="aide">Quand un rendez-vous est annulé ou déplacé, le créneau libéré est proposé à la première personne en attente à qui il convient. Sans réponse, il passe à la suivante. Messages simulés : rien n’est envoyé.</p>' +
      '<div class="g-barre att-barre"><label class="sel-lab"><span>Jour</span><input type="date" id="att-date" data-f="att-date" value="' + k + '" min="' + auj + '"></label>' +
      '<p class="att-occ">' + (h.ouvert ? 'Occupation ce jour-là : <b>' + x.taux + NB + '%</b>' : h.raison) + '</p>' +
      '<button type="button" class="btn" data-act="att-ajout" data-f="att-ajout">' + icone('plus') + 'Ajouter une personne en attente</button></div>' +
      (chauds.length ? '<div class="chauds"><p class="indic-titre">Jours presque complets</p><ul class="chauds-l">' + chauds.map(function (c) {
        return '<li><button type="button" class="pilule' + (c.cle === k ? ' on' : '') + '" data-act="att-jour" data-date="' + c.cle + '">' + courtJour(c.cle) + ' · ' + c.taux + NB + '%</button></li>'; }).join('') + '</ul></div>' : '') +
      '<h3 class="sous-titre">File d’attente du ' + longJour(k) + '</h3>' +
      (file.length ? '<ol class="file" id="file-attente">' + file.map(function (e, i) {
        var s = N.svc(e.service), r = e.rdv ? inst.trouver(e.rdv) : null, os = nomsOptions(e.options);
        var etat = { attente: 'En attente', propose: 'Place proposée', accepte: 'Acceptée', refuse: 'Refusée', expire: 'Sans réponse', retire: 'Retirée' }[e.statut];
        return '<li class="file-i st-att-' + e.statut + '" data-e="' + e.id + '"><span class="rang" aria-label="Rang à l’inscription">' + (i + 1) + '</span><div class="file-c"><p class="rv-ligne"><b>' + esc(e.client.nom) + '</b><span class="chip st-att-' + e.statut + '">' + etat + '</span></p>' +
          '<p>' + s.nom + (os.length ? ' + ' + os.join(', ') : '') + ' · ' + minutes(e.duree) + ' · ' + esc(e.client.tel) + ' · ' + (e.source === 'client' ? 'inscrite en ligne (vous)' : 'ajoutée à la main') + '</p>' +
          (e.statut === 'propose' && r ? '<p class="offre-l"><b>Créneau proposé :</b> ' + plage(r.debut, r.fin) + ' avec ' + N.prac(r.prac).nom + '. Message simulé, jamais envoyé.</p><p class="rv-actions"><button type="button" class="btn btn-sec" data-act="att-g-oui" data-id="' + e.id + '">Accepté par téléphone</button> <button type="button" class="btn btn-sec" data-act="att-g-non" data-id="' + e.id + '">Sans réponse : passer à la suivante</button></p>' : '') +
          (e.statut === 'attente' ? '<p class="rv-actions"><button type="button" class="btn btn-sec" data-act="att-retirer" data-id="' + e.id + '">Retirer de la liste</button></p>' : '') + '</div></li>';
      }).join('') + '</ol>' : '<div class="vide-g"><p><b>Personne en attente ce jour-là.</b></p><p>Une cliente s’inscrit depuis l’espace client sur un jour complet, ou vous ajoutez quelqu’un à la main.</p></div>');
  }

  function ouvrirAttenteAjout(from) {
    var k = G.attDate || G.date, pleins = N.SERVICES.filter(function (s) { return inst.disponibilite(k, s, 'any').etat === 'complet'; });
    if (!pleins.length) {
      ouvrir(entete('Liste d’attente', 'Ajouter une personne') + '<p class="aide">' + maj(longJour(k)) + (N.horaire(k).ouvert ? ' n’est complet pour aucun soin : réservez directement le créneau.' : ' : ' + N.horaire(k).raison.toLowerCase() + '.') + ' Choisissez un jour presque complet.</p><div class="actions"><button type="button" class="btn btn-sec" data-d="fermer">Fermer</button></div>', 'attente-vide', from);
      return;
    }
    ouvrir(entete('Liste d’attente · simulation', 'Ajouter une personne') +
      '<form id="f-attg" class="form" novalidate><p class="aide">' + maj(longJour(k)) + '. Seuls les soins pour lesquels le jour est complet sont proposés.</p>' +
      '<div class="champ"><label for="g-svc">Soin</label><select id="g-svc">' + pleins.map(function (s) { return '<option value="' + s.id + '">' + s.nom + ' · ' + minutes(s.duree) + '</option>'; }).join('') + '</select></div>' +
      '<div class="duo"><div class="champ"><label for="g-nom">Nom et prénom</label><input id="g-nom" type="text" autocomplete="off" placeholder="Lamia Test"><small class="msg-err" id="g-nom-e"></small></div>' +
      '<div class="champ"><label for="g-tel">Téléphone</label><input id="g-tel" type="tel" inputmode="tel" autocomplete="off" placeholder="06 00 00 00 00"><small class="msg-err" id="g-tel-e"></small></div></div>' +
      '<p class="dlg-msg err" id="g-msg2" role="alert"></p>' +
      '<div class="actions"><button type="submit" class="btn">Ajouter à la liste</button><button type="button" class="btn btn-sec" data-d="fermer">Annuler</button></div></form>', 'attente-g', from);
    $('#g-nom').focus();
    $('#f-attg').addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = $('#g-nom').value, tel = $('#g-tel').value;
      $('#g-nom-e').textContent = valideNom(nom) ? '' : 'Indiquez un nom valide.'; $('#g-tel-e').textContent = valideTel(tel) ? '' : 'Numéro invalide (10 chiffres, 05/06/07, ou +212).';
      if (!valideNom(nom)) { $('#g-nom').focus(); return; } if (!valideTel(tel)) { $('#g-tel').focus(); return; }
      var r = inst.rejoindre({ cle: k, service: $('#g-svc').value, options: [], prac: 'any', client: { nom: nom.trim(), tel: tel.trim() }, source: 'manuel' });
      if (!r.ok) { $('#g-msg2').textContent = r.erreur; return; }
      dlg.close(); opener = null; rendreGestion('att-ajout');
      toast(nom.trim() + ' est n° ' + r.rang + ' sur la liste d’attente du ' + longJour(k) + '.');
    });
  }

  /* ----- clientes et fiches ----- */
  function htmlClientes() {
    if (G.fiche) return htmlFiche(inst.fiche(G.fiche));
    return '<p class="aide">Chaque fiche réunit l’historique, les notes et le prochain rendez-vous. Les rendez-vous pris en ligne ou à la main créent ou complètent une fiche.</p>' +
      '<div class="champ cl-filtre"><label for="cl-filtre">Chercher une cliente</label><input id="cl-filtre" data-f="cl-filtre" type="search" autocomplete="off" placeholder="Prénom ou téléphone" value="' + esc(G.clFiltre || '') + '"></div>' +
      '<ul class="cl-liste" id="cl-liste">' + htmlListeClientes() + '</ul>';
  }
  function htmlListeClientes() {
    var q = (G.clFiltre || '').toLowerCase().trim(), l = inst.clientes().filter(function (c) { return !q || c.nom.toLowerCase().indexOf(q) >= 0 || c.tel.replace(/\s/g, '').indexOf(q.replace(/\s/g, '')) >= 0; });
    if (!l.length) return '<li class="liste-vide">Aucune cliente ne correspond à « ' + esc(G.clFiltre) + ' ».</li>';
    return l.map(function (c) {
      return '<li><button type="button" class="carte-cl" data-act="fiche-ouvrir" data-k="' + c.key + '"><span class="monogramme" aria-hidden="true">' + esc(c.nom.charAt(0)) + '</span><span class="cl-t"><b>' + esc(c.nom) + '</b><span>' + esc(c.tel) + '</span></span>' +
        '<span class="cl-m">' + (c.prochain ? 'Prochain : ' + courtJour(c.prochain.cle) + ' · ' + hh(c.prochain.debut) : 'Aucun rendez-vous à venir') + '<span>' + pl(c.nbVenue, 'visite') + ' · ' + pl(c.notes.length, 'note') + '</span></span></button></li>';
    }).join('');
  }
  function htmlFiche(c) {
    var pr = c.pref ? N.prac(c.pref).nom : null, p = c.prochain;
    return '<p><button type="button" class="btn btn-sec" data-act="fiche-retour" data-f="fiche-retour">' + icone('fleche') + 'Toutes les clientes</button></p>' +
      '<div class="fiche" id="fiche" data-k="' + c.key + '"><div class="fiche-tete"><span class="monogramme grand" aria-hidden="true">' + esc(c.nom.charAt(0)) + '</span><div><h3>' + esc(c.nom) + '</h3><p>' + esc(c.tel) + ' (fictif)' + (pr ? ' · praticienne habituelle : ' + pr : '') + '</p><p class="fiche-chiffres">' + pl(c.nbVenue, 'visite terminée', 'visites terminées') + ' · ' + mad(c.depense) + ' dépensés (fictif)</p></div></div>' +
      '<section class="fiche-bloc" aria-labelledby="fp-t"><h3 id="fp-t">Prochain rendez-vous</h3>' + (p ? '<div class="prochain" id="prochain-rdv"><b>' + maj(longJour(p.cle)) + ', ' + plage(p.debut, p.fin) + '</b><span>' + N.svc(p.service).nom + ((p.options || []).length ? ' + ' + pl(p.options.length, 'option') : '') + ' avec ' + N.prac(p.prac).nom + ' · ' + mad(p.prix) + (p.acompte ? ' · ' + bas(texteAcompte(p)) : '') + '</span>' +
        '<button type="button" class="btn btn-sec" data-act="detail" data-id="' + p.id + '">Voir ou déplacer</button></div>' + (c.aVenir.length > 1 ? '<p class="aide">+ ' + pl(c.aVenir.length - 1, 'autre rendez-vous') + ' à venir.</p>' : '') : '<p class="liste-vide" id="prochain-rdv">Aucun rendez-vous à venir.</p>') + '</section>' +
      '<section class="fiche-bloc" aria-labelledby="fn-t"><h3 id="fn-t">Notes</h3>' + (c.notes.length ? '<ul class="notes" id="notes">' + c.notes.map(function (n) { return '<li><span class="note-d">' + courtJour(n.d) + ' · ' + n.de + '</span>' + esc(n.texte) + '</li>'; }).join('') + '</ul>' : '<p class="liste-vide" id="notes">Aucune note pour l’instant.</p>') +
      '<div class="champ"><label for="note-texte">Ajouter une note</label><textarea id="note-texte" data-f="note-texte" rows="2" maxlength="300" placeholder="Préférence, allergie, remarque…"></textarea></div>' +
      '<p class="actions"><button type="button" class="btn" data-act="note-ajout">Ajouter la note</button></p><p class="dlg-msg" id="note-msg" role="status"></p></section>' +
      '<section class="fiche-bloc" aria-labelledby="fh-t"><h3 id="fh-t">Historique</h3>' + (c.historique.length ? '<ul class="histo" id="histo">' + c.historique.map(function (r) {
        var os = nomsOptions(r.options);
        return '<li><span class="h-d">' + courtJour(r.cle) + '</span><span class="h-t"><b>' + N.svc(r.service).nom + (os.length ? ' + ' + os.length : '') + '</b><span>' + N.prac(r.prac).nom + ' · ' + mad(r.prix) + (r.acompte ? ' · ' + bas(texteAcompte(r)) : '') + '</span></span><span class="chip st-' + r.statut + '">' + statutNom(r.statut) + '</span></li>'; }).join('') + '</ul>' : '<p class="liste-vide" id="histo">Aucun rendez-vous passé.</p>') + '</section></div>';
  }

  /* ----- rappels simulés ----- */
  function dateRappels() {
    if (!G.rapDate) { for (var i = 1; i < 8; i++) { var k = N.plus(auj, i); if (N.horaire(k).ouvert) { G.rapDate = k; break; } } }
    return G.rapDate;
  }
  function htmlRappels() {
    var k = dateRappels(), l = inst.rappels(k), nb = { planifie: 0, du: 0, simule: 0 };
    l.forEach(function (x) { nb[x.etat]++; });
    return '<p class="aide">La veille à 18 h, chaque cliente recevrait un rappel. <b>Ici tout est simulé : aucun SMS, aucun e-mail, aucune requête n’est jamais émis.</b> La liste montre ce qui partirait et se recalcule quand un rendez-vous est déplacé, annulé ou ajouté.</p>' +
      '<div class="g-barre att-barre"><label class="sel-lab"><span>Rendez-vous du</span><input type="date" id="rap-date" data-f="rap-date" value="' + k + '" min="' + auj + '"></label>' +
      '<button type="button" class="btn btn-sec" data-act="rap-tous" data-f="rap-tous"' + (l.length ? '' : ' disabled') + '>Simuler l’envoi de tous</button></div>' +
      '<p class="rap-resume" id="rap-resume" role="status">' + (N.horaire(k).ouvert ? pl(l.length, 'rappel') + ' pour le ' + longJour(k) + ' : ' + nb.planifie + ' planifié' + (nb.planifie > 1 ? 's' : '') + ', ' + nb.du + ' à envoyer, ' + nb.simule + ' envoi' + (nb.simule > 1 ? 's' : '') + ' simulé' + (nb.simule > 1 ? 's' : '') + '. Aucun message réel.' : N.horaire(k).raison + '.') + '</p>' +
      '<p class="gabarit">Modèle : « Bonjour {prénom}, nous vous attendons demain à {heure} pour {soin} à l’Institut Naïa. Annulation sans frais avant {limite}. » <i>Message de démonstration, jamais envoyé.</i></p>' +
      (l.length ? '<ul class="rappels" id="rappels">' + l.map(function (x) {
        var r = x.rdv, tx = { planifie: 'Planifié', du: 'À envoyer', simule: 'Envoi simulé' + (r.rappel ? ' · ' + hh(r.rappel.min) : '') }[x.etat];
        return '<li class="rap st-rap-' + x.etat + '" data-etat="' + x.etat + '" data-id="' + r.id + '"><span class="rap-h">' + hh(r.debut) + '</span><span class="rap-t"><b>' + esc(r.client.nom) + '</b><span>' + N.svc(r.service).nom + ' · ' + N.prac(r.prac).nom + (r.source === 'client' ? ' · réservé en ligne' : '') + (r.deplace ? ' · déplacé' : '') + '</span>' +
          '<span class="rap-quand">Rappel prévu le ' + courtJour(x.envoiCle) + ' à ' + hh(x.envoiMin) + ' · SMS simulé</span></span>' +
          '<span class="chip st-rap-' + x.etat + '">' + tx + '</span>' +
          (x.etat === 'simule' ? '' : '<button type="button" class="btn btn-sec petit" data-act="rap-un" data-id="' + r.id + '">Simuler l’envoi<span class="sr"> à ' + esc(r.client.nom) + '</span></button>') + '</li>';
      }).join('') + '</ul>' : '<div class="vide-g"><p><b>Aucun rendez-vous confirmé ce jour-là.</b></p><p>Choisissez un autre jour.</p></div>');
  }

  /* ----- statistiques de la semaine ----- */
  function htmlSemaine() {
    var f = G.statPrac || 'all', w = inst.semaine(G.date, f), t = w.total;
    var lun = w.lundi, sam = N.plus(lun, 5), maxJ = Math.max.apply(null, w.jours.map(function (j) { return j.x.rdv; }).concat([1])), maxS = w.top.length ? w.top[0].n : 1;
    var opt = '<option value="all"' + (f === 'all' ? ' selected' : '') + '>Toute l’équipe</option>' + N.PRACS.map(function (p) { return '<option value="' + p.id + '"' + (f === p.id ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('');
    var kpi = function (cle, lib, val, sub) { return '<div class="kpi"><dt>' + lib + '</dt><dd data-s="' + cle + '">' + val + '</dd>' + (sub ? '<dd class="sub">' + sub + '</dd>' : '') + '</div>'; };
    return '<div class="g-barre"><div class="g-nav" role="group" aria-label="Changer de semaine"><button type="button" class="btn-rond" data-act="sem-prec" data-f="sem-prec" aria-label="Semaine précédente">' + icone('fleche') + '</button>' +
      '<button type="button" class="btn btn-sec" data-act="sem-auj" data-f="sem-auj">Cette semaine</button><button type="button" class="btn-rond" data-act="sem-suiv" data-f="sem-suiv" aria-label="Semaine suivante">' + icone('suiv') + '</button></div>' +
      '<p class="g-titre" aria-live="polite">Semaine du ' + N.depuis(lun).getDate() + ' au ' + N.depuis(sam).getDate() + ' ' + fmt(sam, { month: 'long', year: 'numeric' }) + '</p>' +
      '<label class="sel-lab"><span>Praticienne</span><select id="sem-prac" data-f="sem-prac">' + opt + '</select></label></div>' +
      '<p class="aide g-aide">Ces chiffres se recalculent à chaque réservation, annulation, déplacement, acompte ou liste d’attente. Tout est fictif.</p>' +
      '<dl class="kpis" id="kpis">' + kpi('rdv', 'Rendez-vous', t.rdv, t.annules + ' annulé' + (t.annules > 1 ? 's' : '') + ' · ' + t.absents + ' absent' + (t.absents > 1 ? 's' : '')) +
      kpi('montant', 'Montant prévu (fictif)', mad(t.montant), 'Hors annulés et absents') +
      kpi('acompte', 'Acomptes (simulés)', mad(t.acompte), mad(t.rembourse) + ' remboursés') +
      kpi('taux', 'Occupation', t.taux + NB + '%', Math.round(t.occupe / 60) + ' h sur ' + Math.round(t.dispo / 60) + ' h') +
      kpi('options', 'Options vendues', t.options, 'Sur les soins de la semaine') +
      kpi('deplaces', 'Rendez-vous déplacés', t.deplaces, 'Sans chevauchement') +
      kpi('attente', 'En liste d’attente', w.attente, 'Personnes sur la semaine') + '</dl>' +
      '<div class="stat-cols"><section aria-labelledby="sj-t"><h3 id="sj-t">Rendez-vous par jour</h3><ul class="barres">' + w.jours.map(function (j) {
        return '<li><span class="b-l">' + maj(fmt(j.cle, { weekday: 'short' }).replace('.', '')) + ' ' + N.depuis(j.cle).getDate() + '</span><span class="b-b" aria-hidden="true"><i style="width:' + Math.round(j.x.rdv / maxJ * 100) + '%"></i></span><b data-j="' + j.cle + '">' + j.x.rdv + '</b></li>'; }).join('') + '</ul></section>' +
      '<section aria-labelledby="sp-t"><h3 id="sp-t">Occupation par praticienne</h3><ul class="barres">' + N.PRACS.map(function (p) {
        var z = w.parPrac[p.id]; return '<li><span class="b-l">' + p.nom + '</span><span class="b-b" aria-hidden="true"><i class="alt" style="width:' + z.taux + '%"></i></span><b data-p="' + p.id + '">' + z.taux + NB + '%</b></li>'; }).join('') + '</ul></section>' +
      '<section aria-labelledby="ss-t"><h3 id="ss-t">Soins les plus réservés</h3>' + (w.top.length ? '<ol class="top">' + w.top.slice(0, 5).map(function (s) {
        return '<li><span>' + N.svc(s.id).nom + '</span><span class="b-b" aria-hidden="true"><i style="width:' + Math.round(s.n / maxS * 100) + '%"></i></span><b>' + s.n + '</b></li>'; }).join('') + '</ol>' : '<p class="liste-vide">Aucun rendez-vous cette semaine.</p>') + '</section></div>';
  }

  /* ----- événements de ces sections ----- */
  vueG.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'att-date' && t.value) { G.attDate = t.value; rendreGestion('att-date'); }
    else if (t.id === 'rap-date' && t.value) { G.rapDate = t.value; rendreGestion('rap-date'); }
    else if (t.id === 'sem-prac') { G.statPrac = t.value; rendreGestion('sem-prac'); }
  });
  vueG.addEventListener('input', function (e) {
    if (e.target.id === 'cl-filtre') { G.clFiltre = e.target.value; $('#cl-liste').innerHTML = htmlListeClientes(); }
  });
  vueG.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act;
    if (a === 'att-jour') { G.attDate = t.dataset.date; rendreGestion(); var b = vueG.querySelector('[data-act=att-jour].on'); if (b) b.focus({ preventScroll: true }); }
    else if (a === 'att-ajout') ouvrirAttenteAjout(t);
    else if (a === 'att-retirer') { inst.quitter(t.dataset.id); rendreGestion('att-ajout'); toast('Retirée de la liste d’attente.'); }
    else if (a === 'att-g-oui' || a === 'att-g-non') reponseAttenteGestion(t.dataset.id, a === 'att-g-oui');
    else if (a === 'fiche-ouvrir') { G.fiche = t.dataset.k; rendreGestion('fiche-retour'); window.scrollTo(0, 0); }
    else if (a === 'fiche-retour') { G.fiche = null; rendreGestion('cl-filtre'); }
    else if (a === 'note-ajout') {
      var ta = $('#note-texte'), r = inst.ajouterNote(G.fiche, ta.value);
      if (!r.ok) { var m = $('#note-msg'); m.textContent = r.erreur; m.className = 'dlg-msg err'; ta.focus(); return; }
      rendreGestion('note-texte'); $('#note-msg').textContent = 'Note ajoutée à la fiche.'; toast('Note ajoutée à la fiche de ' + inst.fiche(G.fiche).nom + '.');
    }
    else if (a === 'rap-un') { var rr = inst.simulerRappel(t.dataset.id); rendreGestion(); if (rr.ok) toast('Envoi simulé pour ' + rr.rdv.client.nom + ' : aucun SMS ni e-mail n’a été envoyé.'); }
    else if (a === 'rap-tous') {
      var n = 0; inst.rappels(dateRappels()).forEach(function (x) { if (x.etat !== 'simule') { inst.simulerRappel(x.rdv.id); n++; } });
      rendreGestion('rap-tous'); toast(pl(n, 'envoi simulé', 'envois simulés') + ' : aucun SMS ni e-mail n’a été envoyé.');
    }
    else if (a === 'sem-prec') { G.date = N.plus(G.date, -7); rendreGestion('sem-prec'); }
    else if (a === 'sem-suiv') { G.date = N.plus(G.date, 7); rendreGestion('sem-suiv'); }
    else if (a === 'sem-auj') { G.date = auj; rendreGestion('sem-auj'); }
  });

  /* ---------- démarrage : la page d’accueil transmet ?soin=… et ?prac=… ; #gestion ouvre la gestion ---------- */
  S.mois = auj.slice(0, 7);
  (function () {
    var p = new URLSearchParams(location.search), sv = N.svc(p.get("soin")), pr = N.prac(p.get("prac"));
    if (pr) S.prac = pr.id;
    if (sv) { S.service = sv.id; S.cat = sv.cat; if (S.prac !== "any" && !N.peut(N.prac(S.prac), sv)) S.prac = "any"; }
  })();
  afficherVue(location.hash === "#gestion" ? "gestion" : "client");
})();
