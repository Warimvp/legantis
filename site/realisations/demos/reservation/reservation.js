/* Institut Naïa (démonstration fictive) : interface client et gestion.
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
  var glyphe = function (id) { return '<svg class="glyphe" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#g-' + id + '"/></svg>'; };
  var icone = function (id) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-' + id + '"/></svg>'; };
  var debutSemaine = function (k) { return N.plus(k, -((N.dow(k) + 6) % 7)); };

  /* ---------- état ---------- */
  var auj = inst.aujourdhui();
  var S = {
    vue: 'client', sous: 'reserver', etape: 1, cat: 'visage', service: null, prac: 'any',
    mois: auj.slice(0, 7), date: null, debut: null,
    client: { nom: '', tel: '', email: '', note: '', ok: false }, erreurs: {}, conf: null, annuler: null, msgMes: ''
  };
  var G = { date: auj, mode: 'jour', prac: 'all', semPrac: 'sa' };
  var ETAPES = ['Soin', 'Date et heure', 'Coordonnées', 'Récapitulatif'];

  var elEtape = $('#etape'), elRecap = $('#recap'), elEtapes = $('#etapes'), elToast = $('#toast'), dlg = $('#dlg');
  var tToast = 0;

  function toast(msg) {
    elToast.textContent = msg; elToast.classList.add('on');
    clearTimeout(tToast); tToast = setTimeout(function () { elToast.classList.remove('on'); }, 7000);
  }

  /* ---------- vues ---------- */
  function afficherVue(v, focus) {
    S.vue = v;
    $$('.onglets [role=tab]').forEach(function (b) {
      var on = b.dataset.vue === v; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    $('#vue-client').hidden = v !== 'client';
    $('#vue-gestion').hidden = v !== 'gestion';
    document.body.classList.toggle('en-gestion', v === 'gestion');
    if (v === 'gestion') rendreGestion(); else { revalider(true); rendreClient(); }
    if (focus) $('#onglet-' + v).focus();
  }

  $$('.onglets [role=tab]').forEach(function (b) {
    b.addEventListener('click', function () { afficherVue(b.dataset.vue); });
    b.addEventListener('keydown', function (e) {
      var o = ['client', 'gestion'], i = o.indexOf(b.dataset.vue), n = null;
      if (e.key === 'ArrowRight') n = o[(i + 1) % 2]; else if (e.key === 'ArrowLeft') n = o[(i + 1) % 2];
      else if (e.key === 'Home') n = o[0]; else if (e.key === 'End') n = o[1];
      if (n) { e.preventDefault(); afficherVue(n, true); }
    });
  });

  /* =====================================================================
     VUE CLIENT
     ===================================================================== */
  var service = function () { return S.service ? N.svc(S.service) : null; };

  function pracAffectee() {
    var s = service();
    if (!s || !S.date || S.debut == null) return null;
    return inst.affecter(S.date, S.debut, s, S.prac);
  }

  function revalider(annonce) {
    var s = service();
    if (S.debut != null && (!s || !S.date || !inst.creneaux(S.date, s, S.prac).some(function (c) { return c.debut === S.debut; }))) {
      S.debut = null;
      if (annonce && S.etape > 2 && !S.conf) { S.etape = 2; toast('Le créneau choisi n’est plus disponible. Choisissez un autre horaire.'); }
    }
  }

  function rendreClient() {
    $('#zone-reserver').hidden = S.sous !== 'reserver';
    $('#zone-mes').hidden = S.sous !== 'mes';
    $$('.sousnav button').forEach(function (b) {
      if (b.dataset.sous === S.sous) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var nb = inst.rdvsClient().filter(function (r) { return r.statut !== 'annule'; }).length;
    var p = $('#nb-mes'); p.hidden = !nb; p.textContent = nb;
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

  /* ----- étape 1 ----- */
  function htmlServices() {
    return N.SERVICES.filter(function (s) { return s.cat === S.cat; }).map(function (s) {
      return '<label class="carte svc"><input type="radio" name="service" value="' + s.id + '"' + (S.service === s.id ? ' checked' : '') + '>' +
        '<span class="pastille-radio" aria-hidden="true"></span><span class="svc-txt"><b>' + s.nom + '</b><span>' + s.desc + '</span></span>' +
        '<span class="svc-meta"><b>' + mad(s.prix) + '</b><span>' + s.duree + NB + 'min</span></span></label>';
    }).join('');
  }
  function htmlPracs() {
    var s = service();
    var h = '<label class="carte prac"><input type="radio" name="prac" value="any"' + (S.prac === 'any' ? ' checked' : '') + '><span class="pastille-radio" aria-hidden="true"></span>' +
      '<span class="monogramme libre" aria-hidden="true">·</span><span class="svc-txt"><b>Sans préférence</b><span>Nous vous confions à la praticienne disponible.</span></span></label>';
    N.PRACS.forEach(function (p) {
      var ok = !s || p.cats.indexOf(s.cat) >= 0;
      var jours = p.jours.map(function (j) { return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][j]; }).join(', ');
      h += '<label class="carte prac' + (ok ? '' : ' off') + '"><input type="radio" name="prac" value="' + p.id + '"' + (S.prac === p.id ? ' checked' : '') + (ok ? '' : ' disabled') + '>' +
        '<span class="pastille-radio" aria-hidden="true"></span><span class="monogramme" aria-hidden="true">' + p.nom.charAt(0) + '</span>' +
        '<span class="svc-txt"><b>' + p.nom + '</b><span>' + (ok ? p.titre + ' · ' + jours : 'Ne réalise pas ce soin') + '</span></span></label>';
    });
    return h;
  }
  function etape1() {
    return '<h2 class="etape-titre" tabindex="-1">Choisissez votre soin</h2>' +
      '<p class="aide">Durées et prix fictifs, en dirhams marocains (MAD). Règlement sur place, aucun paiement en ligne.</p>' +
      '<div class="cats" role="radiogroup" aria-label="Catégorie de soins">' + N.CATEGORIES.map(function (c) {
        return '<label class="cat"><input type="radio" name="cat" value="' + c.id + '"' + (S.cat === c.id ? ' checked' : '') + '>' + glyphe(c.id) + '<span>' + c.nom + '</span></label>';
      }).join('') + '</div>' +
      '<div class="services" id="liste-services" role="radiogroup" aria-label="Soins de la catégorie">' + htmlServices() + '</div>' +
      '<h3 class="sous-titre">Avec qui ?</h3>' +
      '<div class="pracs" id="liste-pracs" role="radiogroup" aria-label="Praticienne">' + htmlPracs() + '</div>';
  }

  /* ----- étape 2 ----- */
  function moisLimites() {
    var d = N.depuis(auj), f = new Date(d.getFullYear(), d.getMonth() + 6, 1, 12);
    return { min: auj.slice(0, 7), max: N.cle(f).slice(0, 7) };
  }
  function htmlCal() {
    var s = service(), a = S.mois.split('-').map(Number), y = a[0], m = a[1];
    var premier = y + '-' + N.p2(m) + '-01', dec = (N.dow(premier) + 6) % 7;
    var nj = new Date(y, m, 0).getDate(), lim = moisLimites();
    var tabKey = S.date && S.date.slice(0, 7) === S.mois ? S.date : null, rows = '', cells = [], i;
    var dispo = {};
    for (i = 1; i <= nj; i++) { var k = y + '-' + N.p2(m) + '-' + N.p2(i); dispo[k] = inst.disponibilite(k, s, S.prac); if (!tabKey && dispo[k].etat === 'libre') tabKey = k; }
    if (!tabKey) tabKey = premier;
    for (i = 0; i < dec; i++) cells.push('<td></td>');
    for (i = 1; i <= nj; i++) {
      var kk = y + '-' + N.p2(m) + '-' + N.p2(i), d = dispo[kk], sel = kk === S.date;
      var libre = d.etat === 'libre';
      cells.push('<td><button type="button" class="jour ' + d.etat + (sel ? ' sel' : '') + (kk === auj ? ' auj' : '') + '" data-act="jour" data-date="' + kk + '" data-etat="' + d.etat + '"' +
        (libre ? '' : ' aria-disabled="true"') + ' aria-pressed="' + sel + '" tabindex="' + (kk === tabKey ? 0 : -1) + '" aria-label="' + longJour(kk) + ', ' + d.texte.toLowerCase() + (kk === auj ? ', aujourd’hui' : '') + '">' +
        '<span>' + i + '</span>' + (libre ? '<i class="pt" aria-hidden="true"></i>' : '') + '</button></td>');
    }
    while (cells.length % 7) cells.push('<td></td>');
    for (i = 0; i < cells.length; i += 7) rows += '<tr>' + cells.slice(i, i + 7).join('') + '</tr>';
    var titre = maj(fmt(premier, { month: 'long', year: 'numeric' }));
    return { titre: titre, rows: rows, prec: S.mois > lim.min, suiv: S.mois < lim.max };
  }
  function etape2() {
    var s = service(), p = S.prac === 'any' ? 'sans préférence' : N.prac(S.prac).nom;
    return '<h2 class="etape-titre" tabindex="-1">Choisissez le jour et l’heure</h2>' +
      '<p class="aide rappel"><b>' + s.nom + '</b> · ' + s.duree + NB + 'min · ' + p + '</p>' +
      '<div class="cal"><div class="cal-tete"><button type="button" class="btn-rond" data-act="mois" data-d="-1" aria-label="Mois précédent">' + icone('fleche') + '</button>' +
      '<h3 id="cal-titre" aria-live="polite"></h3><button type="button" class="btn-rond" data-act="mois" data-d="1" aria-label="Mois suivant">' + icone('suiv') + '</button></div>' +
      '<table class="cal-table" aria-labelledby="cal-titre"><thead><tr>' + ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(function (j, i) {
        return '<th scope="col" abbr="' + ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][i] + '">' + j + '</th>'; }).join('') + '</tr></thead><tbody id="cal-corps"></tbody></table>' +
      '<ul class="legende" aria-label="Légende"><li><i class="pt"></i>Disponible</li><li><i class="sw complet"></i>Complet</li><li><i class="sw ferme"></i>Fermé</li><li><i class="sw passe"></i>Passé</li></ul>' +
      '<p class="cal-msg" id="cal-msg" role="status"></p></div>' +
      '<div id="creneaux" class="creneaux"></div>';
  }
  function majCal(focusDate) {
    var c = htmlCal();
    $('#cal-titre').textContent = c.titre; $('#cal-corps').innerHTML = c.rows;
    $$('[data-act=mois]').forEach(function (b) { var ok = b.dataset.d === '-1' ? c.prec : c.suiv; b.disabled = !ok; });
    if (focusDate) { var b = $('[data-date="' + focusDate + '"]'); if (b) b.focus(); }
  }
  function majCreneaux() {
    var el = $('#creneaux'); if (!el) return;
    var s = service();
    if (!S.date) { el.innerHTML = '<p class="vide-creneaux">Choisissez un jour dans le calendrier pour voir les horaires.</p>'; return; }
    var cr = inst.creneaux(S.date, s, S.prac);
    if (!cr.length) {
      var proch = null;
      for (var i = 1; i <= 180 && !proch; i++) { var k = N.plus(S.date, i); if (inst.disponibilite(k, s, S.prac).etat === 'libre') proch = k; }
      el.innerHTML = '<h3 class="sous-titre">' + maj(longJour(S.date)) + '</h3><p class="vide-creneaux">Plus aucun créneau libre ce jour-là pour ce choix.</p>' +
        (proch ? '<button type="button" class="btn btn-sec" data-act="jour-proche" data-date="' + proch + '">Prochaine date disponible : ' + longJour(proch) + '</button>' : '');
      return;
    }
    var grp = function (titre, liste) {
      if (!liste.length) return '';
      return '<fieldset class="groupe"><legend>' + titre + '</legend><div class="pills">' + liste.map(function (c) {
        return '<label class="creneau"><input type="radio" name="creneau" value="' + c.debut + '"' + (S.debut === c.debut ? ' checked' : '') + '><span>' + hh(c.debut) + '</span></label>';
      }).join('') + '</div></fieldset>';
    };
    el.innerHTML = '<h3 class="sous-titre">' + maj(longJour(S.date)) + '</h3><p class="aide" aria-live="polite">' + cr.length + (cr.length > 1 ? ' créneaux disponibles' : ' créneau disponible') +
      ' · fin du soin calculée selon la durée (' + s.duree + NB + 'min)</p>' +
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
      '<div class="champ coche' + (S.erreurs.ok ? ' erreur' : '') + '"><label class="case"><input type="checkbox" id="f-ok" data-champ="ok"' + (c.ok ? ' checked' : '') + (S.erreurs.ok ? ' aria-invalid="true" aria-describedby="e-ok"' : '') + '><span class="case-b" aria-hidden="true">' + icone('coche') + '</span><span>Je comprends que ce rendez-vous est une simulation : aucun SMS ni e-mail n’est envoyé.</span></label>' +
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
    var s = service(), pid = pracAffectee(), pr = pid ? N.prac(pid) : null;
    var mod = function (e, lib) { return modifiable ? ' <button type="button" class="lien" data-act="aller" data-e="' + e + '">Modifier<span class="sr"> ' + lib + '</span></button>' : ''; };
    return '<div class="rl"><dt>Soin</dt><dd>' + (s ? '<b>' + s.nom + '</b><span>' + s.duree + NB + 'min · ' + mad(s.prix) + '</span>' : 'À choisir') + mod(1, 'le soin') + '</dd></div>' +
      '<div class="rl"><dt>Praticienne</dt><dd>' + (S.prac === 'any' ? (pr ? '<b>' + pr.nom + '</b><span>Sans préférence : attribuée selon la disponibilité</span>' : 'Sans préférence') : '<b>' + N.prac(S.prac).nom + '</b>') + mod(1, 'la praticienne') + '</dd></div>' +
      '<div class="rl"><dt>Date et heure</dt><dd>' + (S.date && S.debut != null && s ? '<b>' + maj(longJour(S.date)) + '</b><span>' + plage(S.debut, S.debut + s.duree) + '</span>' : 'À choisir') + mod(2, 'la date et l’heure') + '</dd></div>' +
      (modifiable ? '<div class="rl"><dt>Vous</dt><dd><b>' + esc(S.client.nom.trim()) + '</b><span>' + esc(S.client.tel.trim()) + (S.client.email.trim() ? ' · ' + esc(S.client.email.trim()) : '') + '</span>' + mod(3, 'vos coordonnées') + '</dd></div>' : '');
  }
  function etape4() {
    var s = service();
    return '<h2 class="etape-titre" tabindex="-1">Vérifiez votre rendez-vous</h2>' +
      '<p class="aide">Relisez avant de confirmer : chaque ligne se modifie. Le rendez-vous n’est enregistré qu’à la confirmation.</p>' +
      '<dl class="recap-liste" id="recap-final">' + lignesRecap(true) + '</dl>' +
      (S.client.note.trim() ? '<p class="note-cliente"><b>Votre remarque :</b> ' + esc(S.client.note.trim()) + '</p>' : '') +
      '<div class="total"><span>Total à régler sur place</span><b>' + mad(s.prix) + '</b></div>' +
      '<p class="aide">Simulation : aucun paiement, aucun SMS, aucun e-mail. Annulation possible depuis « Mes rendez-vous ».</p>';
  }

  /* ----- confirmation ----- */
  function htmlConf() {
    var r = S.conf, s = N.svc(r.service), p = N.prac(r.prac), prenom = r.client.nom.trim().split(/\s+/)[0];
    return '<div class="conf" id="conf"><svg class="conf-branche" viewBox="0 0 250 340" aria-hidden="true" focusable="false"><use href="#branche"/></svg>' +
      '<p class="kicker">Rendez-vous confirmé · simulation</p><h2 class="etape-titre" tabindex="-1">À bientôt, ' + esc(prenom) + '</h2>' +
      '<p class="numero">Numéro de rendez-vous <b>' + r.ref + '</b></p>' +
      '<dl class="recap-liste"><div class="rl"><dt>Soin</dt><dd><b>' + s.nom + '</b><span>' + s.duree + NB + 'min · ' + mad(s.prix) + '</span></dd></div>' +
      '<div class="rl"><dt>Praticienne</dt><dd><b>' + p.nom + '</b><span>' + p.titre + '</span></dd></div>' +
      '<div class="rl"><dt>Date et heure</dt><dd><b>' + maj(longJour(r.cle)) + '</b><span>' + plage(r.debut, r.fin) + '</span></dd></div>' +
      '<div class="rl"><dt>Lieu</dt><dd><b>Institut Naïa</b><span>Adresse fictive, Casablanca</span></dd></div></dl>' +
      '<p class="avertissement"><b>Aucun SMS ni e-mail n’est envoyé.</b> Ceci est une simulation : le rendez-vous existe seulement dans cette page, dans « Mes rendez-vous » et dans le planning de la Gestion.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="voir-mes">Voir mes rendez-vous</button>' +
      '<button type="button" class="btn btn-sec" data-act="nouveau">Prendre un autre rendez-vous</button>' +
      '<button type="button" class="btn btn-sec" data-act="voir-gestion">Le voir dans la Gestion</button></div></div>';
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
    var s = service(), pid = pracAffectee();
    var court = s ? '<b>' + s.nom + '</b><span>' + (S.date && S.debut != null ? courtJour(S.date) + ' · ' + hh(S.debut) + ' · ' : s.duree + NB + 'min · ') + mad(s.prix) + '</span>' : '<b>Aucun soin choisi</b><span>Commencez par un soin</span>';
    var dernier = S.etape === 4;
    elRecap.innerHTML = '<h2 class="recap-titre">Votre rendez-vous</h2><dl class="recap-liste compact">' + lignesRecap(false) + '</dl>' +
      '<p class="recap-court">' + court + '</p>' +
      '<p class="recap-aide" id="recap-aide" role="status">' + (aide || '') + '</p>' +
      '<div class="recap-actions">' + (S.etape > 1 ? '<button type="button" class="btn btn-sec" data-act="retour">Retour</button>' : '') +
      '<button type="button" class="btn' + (dernier ? ' btn-conf' : '') + '" data-act="suite"' + (!pret(S.etape) ? ' aria-disabled="true"' : '') + '>' + (dernier ? 'Confirmer<span class="lg"> le rendez-vous</span>' : 'Continuer') + '</button></div>' +
      (dernier ? '' : '<p class="recap-pied">Simulation : rien n’est enregistré avant la confirmation.</p>');
  }

  function aller(e, focus) {
    S.etape = e; S.erreurs = {};
    rendreEtapes(); rendreEtape(focus !== false); rendreRecap();
  }
  function suite() {
    if (S.etape < 3 && !pret(S.etape)) { rendreRecap(AIDE[S.etape]); return; }
    if (S.etape === 2) { revalider(false); if (!pret(2)) { rendreRecap('Ce créneau vient d’être pris. Choisissez-en un autre.'); majCreneaux(); return; } }
    if (S.etape === 3) { if (!validerCoord()) { rendreEtape(); rendreRecap(); var a = $('#alerte-form'); var f = $('[aria-invalid=true]', elEtape); if (f) f.focus(); return; } }
    if (S.etape === 4) { confirmer(); return; }
    aller(S.etape + 1);
  }
  function confirmer() {
    var s = service();
    var res = inst.reserver({ cle: S.date, debut: S.debut, service: s.id, prac: S.prac, client: { nom: S.client.nom.trim(), tel: S.client.tel.trim(), email: S.client.email.trim(), note: S.client.note.trim() }, source: 'client' });
    if (!res.ok) { S.debut = null; S.etape = 2; rendreEtapes(); rendreEtape(true); rendreRecap('Ce créneau vient d’être pris. Choisissez-en un autre.'); toast(res.erreur + ' Choisissez un autre horaire.'); return; }
    S.conf = res.rdv; S.annuler = null;
    rendreClient(); focusTitre();
    toast('Rendez-vous confirmé (simulation), numéro ' + res.rdv.ref + '. Aucun SMS ni e-mail n’est envoyé.');
  }

  /* ----- mes rendez-vous ----- */
  function carteMes(r) {
    var s = N.svc(r.service), p = N.prac(r.prac), futur = r.cle > auj || (r.cle === auj && r.fin > inst.minutesMaintenant());
    var peut = r.statut === 'confirme' && futur;
    var confirmation = S.annuler === r.id;
    return '<li class="rv-carte st-' + r.statut + '"><div class="rv-date"><b>' + N.depuis(r.cle).getDate() + '</b><span>' + fmt(r.cle, { month: 'short' }).replace('.', '') + '</span></div>' +
      '<div class="rv-corps"><p class="rv-ligne"><b>' + s.nom + '</b><span class="chip st-' + r.statut + '">' + statutNom(r.statut) + '</span></p>' +
      '<p>' + maj(longJour(r.cle)) + ' · ' + plage(r.debut, r.fin) + '</p><p>Avec ' + p.nom + ' · ' + mad(s.prix) + ' · n° ' + r.ref + '</p>' +
      (peut ? (confirmation ? '<div class="confirme-annul" role="group" aria-label="Confirmer l’annulation"><p>Annuler ce rendez-vous ? Le créneau sera libéré.</p><button type="button" class="btn btn-danger" data-act="annuler-oui" data-id="' + r.id + '">Oui, annuler</button> <button type="button" class="btn btn-sec" data-act="annuler-non">Garder le rendez-vous</button></div>'
        : '<p class="rv-actions"><button type="button" class="btn btn-sec" data-act="annuler" data-id="' + r.id + '">Annuler ce rendez-vous</button></p>') : '') +
      '</div></li>';
  }
  function rendreMes() {
    var l = inst.rdvsClient(), el = $('#zone-mes');
    var a = l.filter(function (r) { return r.statut !== 'annule' && r.statut !== 'termine' && r.statut !== 'absent'; }), b = l.filter(function (r) { return a.indexOf(r) < 0; });
    el.innerHTML = '<h2 class="etape-titre" tabindex="-1">Mes rendez-vous</h2><p class="aide">Les rendez-vous pris pendant cette visite. La liste se vide au rechargement de la page.</p>' +
      '<p class="msg-mes" role="status" id="msg-mes">' + esc(S.msgMes) + '</p>' +
      (l.length ? (a.length ? '<h3 class="sous-titre">À venir</h3><ul class="rv-liste">' + a.map(carteMes).join('') + '</ul>' : '') +
        (b.length ? '<h3 class="sous-titre">Annulés ou passés</h3><ul class="rv-liste">' + b.map(carteMes).join('') + '</ul>' : '')
        : '<div class="vide"><svg viewBox="0 0 250 340" aria-hidden="true" focusable="false"><use href="#branche"/></svg><p><b>Aucun rendez-vous pour l’instant.</b></p><p>Réservez un soin : il apparaîtra ici, et aussitôt dans le planning de la Gestion.</p><button type="button" class="btn" data-act="vers-reserver">Réserver un soin</button></div>');
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
      var k = t.dataset.date, di = inst.disponibilite(k, service(), S.prac);
      if (a === 'jour-proche') { S.mois = k.slice(0, 7); }
      if (di.etat !== 'libre') { $('#cal-msg').textContent = maj(longJour(k)) + ' : ' + di.texte.toLowerCase() + '. Choisissez un autre jour.'; return; }
      $('#cal-msg').textContent = '';
      if (S.date !== k) { S.date = k; S.debut = null; }
      majCal(k); majCreneaux(); rendreRecap();
      var cr = $('#creneaux'); if (cr && window.matchMedia('(max-width: 899px)').matches) cr.scrollIntoView({ block: 'nearest', behavior: reduit ? 'auto' : 'smooth' });
    }
    else if (a === 'vers-champ') { e.preventDefault(); var f = $('#f-' + t.dataset.id); if (f) f.focus(); }
    else if (a === 'voir-mes' || a === 'vers-mes') { S.sous = 'mes'; S.conf = S.conf; rendreClient(); }
    else if (a === 'vers-reserver') { S.sous = 'reserver'; rendreClient(); }
    else if (a === 'nouveau') { S.conf = null; S.service = null; S.prac = 'any'; S.date = null; S.debut = null; S.etape = 1; S.erreurs = {}; rendreClient(); focusTitre(); }
    else if (a === 'voir-gestion') { G.date = S.conf.cle; G.mode = 'jour'; G.prac = 'all'; afficherVue('gestion'); }
    else if (a === 'annuler') { S.annuler = t.dataset.id; S.msgMes = ''; rendreMes(); var bt = $('[data-act=annuler-oui]'); if (bt) bt.focus(); }
    else if (a === 'annuler-non') { var id0 = S.annuler; S.annuler = null; rendreMes(); var b0 = $('[data-act=annuler][data-id="' + id0 + '"]'); if (b0) b0.focus(); }
    else if (a === 'annuler-oui') {
      var r = inst.changerStatut(t.dataset.id, 'annule'); S.annuler = null;
      S.msgMes = r.ok ? 'Rendez-vous ' + r.rdv.ref + ' annulé. Le créneau est de nouveau disponible (simulation, aucun message envoyé).' : r.erreur;
      rendreClient(); toast(S.msgMes); var h = $('#zone-mes .etape-titre'); if (h) h.focus({ preventScroll: true });
    }
  });

  $$('.sousnav button').forEach(function (b) {
    b.addEventListener('click', function () { S.sous = b.dataset.sous; S.annuler = null; rendreClient(); });
  });

  elEtape.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'cat') { S.cat = t.value; $('#liste-services').innerHTML = htmlServices(); }
    else if (t.name === 'service') { S.service = t.value; $('#liste-pracs').innerHTML = htmlPracs(); var s = service(); if (S.prac !== 'any' && N.prac(S.prac).cats.indexOf(s.cat) < 0) S.prac = 'any'; $('#liste-pracs').innerHTML = htmlPracs(); revalider(false); rendreRecap(); }
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
     VUE GESTION
     ===================================================================== */
  var PPM = 1.2, T0 = 540, T1 = 1140;
  var vueG = $('#vue-gestion');

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
  var libRdv = function (r) { var s = N.svc(r.service); return hh(r.debut) + ', ' + r.client.nom + ', ' + s.nom + ', statut ' + statutNom(r.statut).toLowerCase(); };

  function itemGrille(el, col) {
    var o = el.o, top = (o.debut - T0) * PPM, h = (o.fin - o.debut) * PPM;
    if (el.t === 'bloc') {
      return '<button type="button" class="bloc" style="top:' + top + 'px;height:' + h + 'px" data-act="detail" data-id="' + o.id + '" aria-label="Créneau bloqué, ' + plage(o.debut, o.fin) + ', ' + esc(o.motif) + '"><b>Bloqué</b><span>' + esc(o.motif) + '</span></button>';
    }
    var s = N.svc(o.service);
    return '<button type="button" class="rv st-' + o.statut + (o.fin - o.debut <= 30 ? ' court' : o.fin - o.debut <= 45 ? ' moyen' : '') + (o.source === 'client' ? ' en-ligne' : '') + '" style="top:' + top + 'px;height:' + (h - 2) + 'px" data-act="detail" data-id="' + o.id + '" aria-label="' + esc(libRdv(o)) + '">' +
      '<span class="rv-h">' + hh(o.debut) + '</span><span class="rv-n">' + esc(o.client.nom) + '</span><span class="rv-s">' + s.nom + '</span><span class="rv-st">' + statutNom(o.statut) + (o.source === 'client' ? ' · en ligne' : '') + '</span></button>';
  }
  function itemListe(el) {
    var o = el.o;
    if (el.t === 'bloc') return '<li><button type="button" class="li bloc" data-act="detail" data-id="' + o.id + '"><span class="li-h">' + plage(o.debut, o.fin) + '</span><span class="li-t"><b>Créneau bloqué</b><span>' + esc(o.motif) + '</span></span></button></li>';
    var s = N.svc(o.service);
    return '<li><button type="button" class="li rv st-' + o.statut + '" data-act="detail" data-id="' + o.id + '" aria-label="' + esc(libRdv(o)) + '"><span class="li-h">' + plage(o.debut, o.fin) + '</span><span class="li-t"><b>' + esc(o.client.nom) + '</b><span>' + s.nom + (o.source === 'client' ? ' · réservé en ligne' : '') + '</span></span><span class="chip st-' + o.statut + '">' + statutNom(o.statut) + '</span></button></li>';
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
      '<div class="ind"><dt>Montant prévu <small>(fictif)</small></dt><dd data-i="montant">' + mad(x.montant) + '</dd><dd class="sub">Hors annulés et absents</dd></div></dl></div>';
  }

  function titreG() {
    if (G.mode === 'jour') return maj(longComplet(G.date));
    var l = debutSemaine(G.date), f = N.plus(l, 5);
    return 'Semaine du ' + N.depuis(l).getDate() + ' au ' + N.depuis(f).getDate() + ' ' + fmt(f, { month: 'long', year: 'numeric' });
  }

  function rendreGestion(focusF) {
    var avant = focusF || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f);
    var scroll = vueG.querySelector('.g-plan') ? window.scrollY : null;
    var opt = (G.mode === 'jour' ? '<option value="all"' + (G.prac === 'all' ? ' selected' : '') + '>Toute l’équipe</option>' : '') +
      N.PRACS.map(function (p) { var v = G.mode === 'jour' ? G.prac : G.semPrac; return '<option value="' + p.id + '"' + (v === p.id ? ' selected' : '') + '>' + p.nom + '</option>'; }).join('');
    vueG.innerHTML =
      '<div class="g-tete-page"><div><p class="kicker">Gestion de l’institut · données fictives</p><h2 class="etape-titre" tabindex="-1">Planning</h2></div>' +
      '<div class="g-actions"><button type="button" class="btn" data-act="ajout" data-f="ajout">' + icone('plus') + 'Ajouter un rendez-vous</button><button type="button" class="btn btn-sec" data-act="blocage" data-f="blocage">' + icone('bloc') + 'Bloquer un créneau</button></div></div>' +
      '<div class="g-barre"><div class="g-nav" role="group" aria-label="Navigation dans le temps"><button type="button" class="btn-rond" data-act="g-prec" data-f="prec" aria-label="' + (G.mode === 'jour' ? 'Jour précédent' : 'Semaine précédente') + '">' + icone('fleche') + '</button>' +
      '<button type="button" class="btn btn-sec" data-act="g-auj" data-f="auj">Aujourd’hui</button><button type="button" class="btn-rond" data-act="g-suiv" data-f="suiv" aria-label="' + (G.mode === 'jour' ? 'Jour suivant' : 'Semaine suivante') + '">' + icone('suiv') + '</button></div>' +
      '<p class="g-titre" aria-live="polite">' + titreG() + '</p>' +
      '<div class="g-filtres"><div class="seg" role="radiogroup" aria-label="Affichage"><label><input type="radio" name="g-mode" value="jour"' + (G.mode === 'jour' ? ' checked' : '') + ' data-f="m-jour"><span>Jour</span></label><label><input type="radio" name="g-mode" value="semaine"' + (G.mode === 'semaine' ? ' checked' : '') + ' data-f="m-sem"><span>Semaine</span></label></div>' +
      '<label class="sel-lab"><span>Praticienne</span><select id="g-prac" data-f="g-prac">' + opt + '</select></label>' +
      '<label class="sel-lab"><span>Date</span><input type="date" id="g-date" data-f="g-date" value="' + G.date + '"></label></div></div>' +
      '<div id="g-indic">' + htmlIndic() + '</div>' +
      '<ul class="legende g-leg" aria-label="Légende des statuts">' + N.STATUTS.map(function (s) { return '<li><i class="sw st-' + s.id + '"></i>' + s.nom + '</li>'; }).join('') + '<li><i class="sw blq"></i>Bloqué</li></ul>' +
      '<p class="aide g-aide">Touchez un rendez-vous pour son détail et son statut. ' + (G.mode === 'jour' ? '<span class="seulement-grille">Dans la grille, cliquez une zone vide pour ajouter un rendez-vous à cette heure.</span>' : 'Choisissez un jour dans les en-têtes pour recalculer les indicateurs.') + '</p>' +
      '<div id="g-planning">' + htmlPlanning() + '</div>';
    if (avant) { var f = vueG.querySelector('[data-f="' + avant + '"]'); if (f) f.focus({ preventScroll: true }); }
    if (scroll != null) window.scrollTo(0, scroll);
  }

  function majPlanning() {
    // recalcul des indicateurs et du planning sans toucher aux contrôles
    var a = $('#g-indic'), p = $('#g-planning');
    if (!a || !p) { rendreGestion(); return; }
    a.innerHTML = htmlIndic(); p.innerHTML = htmlPlanning();
  }

  vueG.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'g-mode') { G.mode = t.value; if (G.mode === 'semaine' && G.prac !== 'all') G.semPrac = G.prac; if (G.mode === 'jour') G.prac = 'all'; rendreGestion('m-' + (G.mode === 'jour' ? 'jour' : 'sem')); }
    else if (t.id === 'g-prac') { if (G.mode === 'jour') G.prac = t.value; else G.semPrac = t.value; rendreGestion('g-prac'); }
    else if (t.id === 'g-date') { if (t.value) { G.date = t.value; rendreGestion('g-date'); } }
  });
  vueG.addEventListener('click', function (e) {
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

  /* ----- dialogues ----- */
  var opener = null;
  function ouvrir(html, o, from) {
    opener = from || document.activeElement;
    dlg.innerHTML = html; dlg.dataset.type = o || '';
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', function () {
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    else if (S.vue === 'gestion') { var h = $('#vue-gestion .etape-titre'); if (h) h.focus({ preventScroll: true }); }
    opener = null;
  });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) { dlg.close(); return; }
    var t = e.target.closest('[data-d]'); if (!t) return;
    var a = t.dataset.d;
    if (a === 'fermer') dlg.close();
    else if (a === 'statut') changerStatutDlg(t.dataset.id, t.dataset.s);
    else if (a === 'debloquer') {
      var b = inst.trouver(t.dataset.id), r = inst.debloquer(t.dataset.id);
      if (r.ok) { dlg.close(); majPlanning(); toast('Créneau débloqué : ' + plage(b.debut, b.fin) + ' de nouveau disponible à la réservation.'); }
    }
  });
  dlg.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.form) { e.preventDefault(); e.target.form.requestSubmit ? e.target.form.requestSubmit() : e.target.form.dispatchEvent(new Event('submit', { cancelable: true })); } });

  var entete = function (kicker, titre) { return '<div class="dlg-tete"><div><p class="kicker">' + kicker + '</p><h2 id="dlg-titre">' + titre + '</h2></div><button type="button" class="btn-rond" data-d="fermer" aria-label="Fermer">' + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'; };

  function ouvrirDetail(id, from) {
    var o = inst.trouver(id); if (!o) return;
    if (o.service) {
      var s = N.svc(o.service), p = N.prac(o.prac);
      ouvrir(entete('Rendez-vous · ' + o.ref, esc(o.client.nom)) +
        '<dl class="dlg-dl"><div><dt>Soin</dt><dd>' + s.nom + '</dd></div><div><dt>Praticienne</dt><dd>' + p.nom + '</dd></div><div><dt>Date</dt><dd>' + maj(longJour(o.cle)) + '</dd></div>' +
        '<div><dt>Horaire</dt><dd>' + plage(o.debut, o.fin) + ' (' + s.duree + NB + 'min)</dd></div><div><dt>Prix (fictif)</dt><dd>' + mad(s.prix) + '</dd></div>' +
        '<div><dt>Téléphone (fictif)</dt><dd>' + esc(o.client.tel) + '</dd></div><div><dt>Origine</dt><dd>' + (o.source === 'client' ? 'Réservé en ligne (vous)' : o.source === 'manuel' ? 'Ajouté à la main' : 'Agenda de démonstration') + '</dd></div>' +
        (o.client.note ? '<div><dt>Remarque</dt><dd>' + esc(o.client.note) + '</dd></div>' : '') + '</dl>' +
        '<fieldset class="statuts"><legend>Statut du rendez-vous</legend><div class="statuts-b">' + N.STATUTS.map(function (st) {
          return '<button type="button" class="stbtn st-' + st.id + '" data-d="statut" data-id="' + o.id + '" data-s="' + st.id + '" aria-pressed="' + (o.statut === st.id) + '">' + st.nom + '</button>'; }).join('') + '</div></fieldset>' +
        '<p class="dlg-msg" id="dlg-msg" role="status"></p><div class="actions"><button type="button" class="btn btn-sec" data-d="fermer">Fermer</button></div>', 'detail', from);
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
    msg.className = 'dlg-msg'; msg.textContent = 'Statut : ' + statutNom(st).toLowerCase() + '.' + (st === 'annule' ? ' Le créneau est libéré.' : '');
    majPlanning();
    if (S.vue === 'gestion') toast('Rendez-vous de ' + r.rdv.client.nom + ' : ' + statutNom(st).toLowerCase() + '.');
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
    if (prac0 && N.prac(prac0).cats.indexOf(N.svc(svc0).cat) < 0) svc0 = N.SERVICES.filter(function (s) { return N.prac(prac0).cats.indexOf(s.cat) >= 0; })[0].id;
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

  /* ---------- démarrage ---------- */
  S.mois = auj.slice(0, 7);
  afficherVue('client');
})();
