/* Distribution OS — noyau de l'interface : session, routes, rendu, composants, fenêtres, palette de commandes, notifications.
   Les écrans sont dans ecrans.js, le scénario guidé dans guide.js, les règles dans moteur.js.
   Rien ne quitte le navigateur : aucune requête, aucun cookie. La session (seulement les actions fictives du visiteur) est gardée dans sessionStorage,
   effacée par « Réinitialiser » et à la fermeture de l'onglet. */
(function () {
  'use strict';
  var D = window.DOS, G = window.DOSGraph;
  var CLE = 'legantis-demo-distribution-os';
  var PARAMS = new URLSearchParams(location.search);
  var CHAMPS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  var MODULES = [
    { id: 'tableau', nom: 'Tableau de bord', court: 'Accueil', icone: 'grille' },
    { id: 'commandes', nom: 'Commandes', court: 'Commandes', icone: 'commandes' },
    { id: 'clients', nom: 'Clients', court: 'Clients', icone: 'clients' },
    { id: 'stocks', nom: 'Stocks', court: 'Stocks', icone: 'stock' },
    { id: 'preparation', nom: 'Préparation et livraison', court: 'Préparation', icone: 'camion' },
    { id: 'paiements', nom: 'Paiements et relances', court: 'Paiements', icone: 'paiement' },
    { id: 'rapports', nom: 'Rapports', court: 'Rapports', icone: 'rapport' },
    { id: 'parametres', nom: 'Paramètres et rôles', court: 'Paramètres', icone: 'reglages' }
  ];

  var A = {
    D: D, G: G, MODULES: MODULES, etat: null, d: null, k: null, actions: [], role: 'direction', theme: 'clair', accueil: true, jourIso: null,
    route: { module: 'tableau', id: null }, ecrans: {}, tiroirs: {}, graphes: [], ecouteurs: {}, version: 0,
    ui: {
      commandes: { q: '', statut: '', type: '', ville: '', paiement: '', periode: 0, retard: false, tri: 'jour', sens: 'desc', page: 1 },
      clients: { q: '', type: '', segment: '', echu: false, tri: 'ca90', sens: 'desc' },
      stocks: { onglet: 'catalogue', q: '', categorie: '', etat: '', page: 1 },
      preparation: { onglet: 'kanban' },
      paiements: { etat: '', q: '', tri: 'echeance', sens: 'asc' },
      rapports: { semaines: 12, categorie: '', type: '', donnees: {} }
    }
  };
  window.DOSApp = A;

  /* ── Outils ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function e(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); }
  function ic(nom, classe) { return '<svg class="ic' + (classe ? ' ' + classe : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + nom + '"/></svg>'; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function mad(c, sans) { return D.formaterMAD(c, sans); }
  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? (plusieurs || un + 's') : un); }
  /* Horloge de la session : l'heure réelle, mais jamais avant 10 h 31 (les données de départ s'arrêtent à 10 h 30) */
  function heureCourante() { var d = new Date(), m = Math.max(d.getHours() * 60 + d.getMinutes(), 10 * 60 + 31); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function aujourdhuiLocal() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  A.e = e; A.ic = ic; A.mad = mad; A.pluriel = pluriel; A.$ = $; A.$$ = $$;

  /* ── Évènements internes (le guide les écoute) ─────────────────────────────────────────────────────────────────────────────────────── */
  A.sur = function (nom, f) { (A.ecouteurs[nom] = A.ecouteurs[nom] || []).push(f); };
  A.emettre = function (nom, x) { (A.ecouteurs[nom] || []).slice().forEach(function (f) { try { f(x); } catch (err) { console.error(err); } }); };

  /* ── Session ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function lireSession() { try { var x = JSON.parse(sessionStorage.getItem(CLE)); return x && x.v === D.VERSION && Array.isArray(x.actions) ? x : null; } catch (err) { return null; } }
  function ecrireSession() {
    try { sessionStorage.setItem(CLE, JSON.stringify({ v: D.VERSION, jour: A.jourIso, actions: A.actions.slice(-600), role: A.role, theme: A.theme, accueil: A.accueil, guide: A.guideEtat || null })); } catch (err) { /* stockage plein ou refusé : la démonstration continue sans mémoire */ }
  }
  A.ecrireSession = ecrireSession;
  function recalculer() { A.d = D.derive(A.etat); A.k = D.kpis(A.etat, A.d); A.version++; }
  A.recalculer = recalculer;

  /* ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function contexte() { return { jour: A.etat.jour, heure: heureCourante(), role: A.role, par: D.ROLES[A.role].personne, session: true }; }
  A.agir = function (action, opts) {
    opts = opts || {};
    var ctx = contexte(), avant = A.k;
    var res = D.executer(A.etat, action, ctx);
    if (res.ok) {
      A.actions.push({ action: action, role: A.role, h: ctx.heure });
      recalculer(); ecrireSession();
      A.emettre('action', { action: action, resultat: res.resultat, avant: avant, apres: A.k });
      if (!opts.silencieux) rendre();
    } else A.emettre('refus', { action: action, erreur: res.erreur });
    return res;
  };
  A.peut = function (droit) { return D.peut(A.role, droit); };
  A.rolesPour = function (droit) { return D.DROITS[droit].map(function (r) { return D.ROLES[r].libelle; }).join(', '); };

  /* ── Liens vers Legantis : on garde la source de campagne (UTM) de l'adresse, sans rien stocker ─────────────────────────────────────── */
  A.lienLegantis = function (ancre) {
    var q = new URLSearchParams();
    CHAMPS_UTM.forEach(function (c) { var v = PARAMS.get(c); if (v) q.set(c, v.slice(0, 80)); });
    if (!q.get('utm_content') && q.get('utm_source')) q.set('utm_content', 'demo-distribution-os');
    var s = q.toString();
    return '../../../commandes/' + (s ? '?' + s : '') + (ancre || '#demande');
  };

  /* ── Routes : #/module/identifiant?filtres ─────────────────────────────────────────────────────────────────────────────────────────── */
  function lireRoute() {
    var h = location.hash;
    if (h.indexOf('#/') !== 0) return null;
    var p = h.slice(2).split('?'), chemin = p[0].split('/');
    return { module: chemin[0] || 'tableau', id: chemin[1] ? decodeURIComponent(chemin[1]) : null, params: new URLSearchParams(p[1] || '') };
  }
  A.visible = function (module) { return D.MODULES_ROLE[A.role].indexOf(module) >= 0; };
  A.aller = function (hash) { if (location.hash === hash) surRoute(); else location.hash = hash; };
  function appliquerParams(r) {
    var p = r.params; if (!p || ![].concat(Array.from(p.keys())).length) return false;
    if (r.module === 'commandes') { A.ui.commandes = Object.assign({}, A.ui.commandes, { q: '', statut: p.get('statut') || '', type: '', ville: '', paiement: p.get('paiement') || '', periode: 0, retard: p.get('retard') === '1', page: 1 }); }
    if (r.module === 'stocks') { A.ui.stocks.onglet = p.get('onglet') || 'catalogue'; A.ui.stocks.etat = p.get('etat') || ''; A.ui.stocks.q = ''; A.ui.stocks.categorie = ''; }
    if (r.module === 'paiements') { A.ui.paiements.etat = p.get('etat') || ''; }
    if (r.module === 'clients') { A.ui.clients.echu = p.get('echu') === '1'; A.ui.clients.plafond = p.get('plafond') === '1'; A.ui.clients.q = ''; A.ui.clients.type = ''; A.ui.clients.segment = ''; }
    history.replaceState(null, '', '#/' + r.module + (r.id ? '/' + encodeURIComponent(r.id) : ''));
    return true;
  }
  var moduleAvant = null;
  function surRoute() {
    var r = lireRoute();
    if (!r) return;   // ancre ordinaire (lien d'évitement) : on ne change pas d'écran
    if (!MODULES.some(function (m) { return m.id === r.module; })) r.module = 'tableau';
    if (!A.visible(r.module)) { notifier('Le rôle ' + D.ROLES[A.role].libelle + ' n\'a pas accès à « ' + nomModule(r.module) + ' ».', 'info'); r = { module: 'tableau', id: null, params: new URLSearchParams() }; history.replaceState(null, '', '#/tableau'); }
    appliquerParams(r);
    var change = r.module !== moduleAvant;
    A.route = r;
    fermerMenus();
    $('.app').classList.remove('nav-ouverte');
    rendre();
    if (change) {
      moduleAvant = r.module;
      $('#vue').scrollTop = 0; window.scrollTo(0, 0);
      if (!r.id && document.activeElement && document.activeElement.closest('.nav, .palette, .modale')) { var t = $('#vue h1'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } }
    }
    A.emettre('route', r);
  }
  function nomModule(id) { var m = MODULES.find(function (x) { return x.id === id; }); return m ? m.nom : id; }
  A.nomModule = nomModule;

  /* ── Rendu ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function memoriserFocus() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    var cle = a.getAttribute('data-focus') || (a.id ? '#' + a.id : null);
    return cle ? { cle: cle, debut: a.selectionStart, fin: a.selectionEnd } : null;
  }
  function restaurerFocus(f) {
    if (!f) return;
    var el = f.cle.charAt(0) === '#' ? document.getElementById(f.cle.slice(1)) : $('[data-focus="' + f.cle + '"]');
    if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); if (f.debut != null && el.setSelectionRange) try { el.setSelectionRange(f.debut, f.fin); } catch (err) { /* type sans sélection */ } }
  }
  function rendre() {
    if (!A.etat) return;
    var f = memoriserFocus();
    rendreNav();
    rendreHaut();
    A.graphes = [];
    var r = A.route, ecran = A.ecrans[r.module] || A.ecrans.tableau;
    var vue = $('#vue');
    vue.setAttribute('aria-busy', 'false');
    vue.innerHTML = ecran(r);
    rendreTiroir();
    if (A.modaleActive && A.modaleActive.rendre) A.modaleActive.rendre();
    monterGraphes();
    restaurerFocus(f);
    A.emettre('rendu', r);
  }
  A.rendre = rendre;
  function monterGraphes() {
    A.graphes.forEach(function (g) { var b = document.getElementById(g.id); if (b) G[g.type](b, g.options); });
  }
  A.graphe = function (type, options) {   // réserve un emplacement, rempli après le rendu à la largeur réelle
    var id = 'g-' + A.graphes.length + '-' + A.version;
    A.graphes.push({ id: id, type: type, options: options });
    return '<div class="graph" id="' + id + '" style="height:' + (options.hauteur || 220) + 'px"></div>';
  };
  var redimension;
  window.addEventListener('resize', function () { clearTimeout(redimension); redimension = setTimeout(monterGraphes, 120); });

  function rendreNav() {
    var k = A.k;
    var compte = { commandes: k.nouvelles, stocks: k.alertes, preparation: k.aPreparer + k.prets, paiements: A.etat.commandes.filter(function (c) { return D.reste(A.d, c) > 0 && c.echeance < A.etat.jour; }).length };
    var alerte = { stocks: k.ruptures > 0, paiements: true };
    $('#nav-liste').innerHTML = MODULES.filter(function (m) { return A.visible(m.id); }).map(function (m) {
      var n = compte[m.id], actif = A.route.module === m.id;
      return '<li><a href="#/' + m.id + '" class="nav-lien' + (actif ? ' actif' : '') + '"' + (actif ? ' aria-current="page"' : '') + ' data-focus="nav-' + m.id + '">' + ic(m.icone) + '<span>' + e(m.nom) + '</span>' +
        (n ? '<b class="nav-compte' + (alerte[m.id] ? ' nav-compte--alerte' : '') + '" aria-label="' + n + ' à traiter">' + n + '</b>' : '') + '</a></li>';
    }).join('');
    $('#nav-role').textContent = D.ROLES[A.role].personne + ' · ' + D.ROLES[A.role].libelle;
    $$('[data-lien-legantis]').forEach(function (a) { a.href = A.lienLegantis(a.getAttribute('data-lien-legantis') || '#demande'); });
  }
  function rendreHaut() {
    $('#haut-titre').textContent = nomModule(A.route.module);
    var sel = $('#role');
    if (sel.value !== A.role) sel.value = A.role;
    var bt = $('[data-action="theme"]');
    bt.setAttribute('aria-pressed', A.theme === 'sombre' ? 'true' : 'false');
    bt.setAttribute('aria-label', A.theme === 'sombre' ? 'Passer en thème clair' : 'Passer en thème sombre');
    var nouvelle = $('[data-action="nouvelle-commande"].haut-nouvelle');
    if (nouvelle) nouvelle.hidden = !A.peut('creer_commande');
  }

  /* ── Composants ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  A.badge = function (statut) { return '<span class="badge badge--' + statut + '"><i aria-hidden="true"></i>' + e(D.LIBELLE_STATUT[statut]) + '</span>'; };
  A.badgePaiement = function (etat) {
    if (etat === 'annulee') return '<span class="discret">—</span>';
    var cls = { a_facturer: 'neutre', payee: 'ok', partielle: 'info', a_echoir: 'info', echue: 'critique' }[etat];
    return '<span class="pastille pastille--' + cls + '">' + (etat === 'echue' ? ic('alerte') : etat === 'payee' ? ic('coche') : '') + e(D.LIBELLE_PAIEMENT[etat]) + '</span>';
  };
  A.badgeStock = function (p) {
    var n = D.niveauStock(p);
    return '<span class="pastille pastille--' + (n === 'rupture' ? 'critique' : n === 'bas' ? 'attention' : 'ok') + '">' + (n === 'ok' ? ic('coche') : ic('alerte')) + (n === 'rupture' ? 'Rupture' : n === 'bas' ? 'Stock bas' : 'Disponible') + '</span>';
  };
  A.badgeRetard = function (c) { return D.enRetard(c, A.etat.jour) ? '<span class="pastille pastille--critique">' + ic('horloge') + 'En retard de ' + pluriel(A.etat.jour - c.livraisonPrevue, 'jour') + '</span>' : ''; };
  A.bouton = function (o) {
    var dis = o.refus ? ' aria-disabled="true" data-refus="' + e(o.refus) + '"' : '';
    var attrs = Object.keys(o.data || {}).map(function (k) { return ' data-' + k + '="' + e(o.data[k]) + '"'; }).join('');
    return '<button type="button" class="btn' + (o.classe ? ' ' + o.classe : '') + '" data-action="' + e(o.action) + '"' + attrs + dis + (o.focus ? ' data-focus="' + e(o.focus) + '"' : '') + (o.titre ? ' title="' + e(o.titre) + '"' : '') + (o.aria ? ' aria-label="' + e(o.aria) + '"' : '') + '>' + (o.icone ? ic(o.icone) : '') + (o.texte ? '<span>' + e(o.texte) + '</span>' : '') + '</button>';
  };
  /* Actions d'une commande selon son statut et le rôle : jamais un bouton qui ne fait rien. Une action non permise reste visible, désactivée, avec la raison. */
  var COURT = { confirmee: 'Confirmer et réserver', en_preparation: 'Lancer la préparation', prete: 'Marquer prête', expediee: 'Expédier', livree: 'Confirmer la livraison' };
  A.actionsCommande = function (c, compact) {
    var suivantes = D.TRANSITIONS[c.statut].filter(function (v) { return v !== 'annulee'; });
    var html = suivantes.map(function (v) {
      var droit = D.droitPour(v), refus = !A.peut(droit) ? 'Réservé aux rôles : ' + A.rolesPour(droit) : null;
      if (!refus && v === 'confirmee' && D.manquants(A.etat, c.lignes).length) refus = 'Stock disponible insuffisant : réceptionnez ou modifiez la commande.';
      return A.bouton({ action: 'statut', data: { id: c.id, vers: v }, texte: compact ? COURT[v] : D.LIBELLE_ACTION[v], classe: 'btn--plein' + (compact ? ' btn--petit' : ''), icone: v === 'expediee' ? 'camion' : v === 'livree' ? 'coche' : 'fleche', refus: refus, focus: 'statut-' + c.id + '-' + v });
    }).join('');
    if (D.TRANSITIONS[c.statut].indexOf('annulee') >= 0 && !compact) html += A.bouton({ action: 'annuler', data: { id: c.id }, texte: 'Annuler', classe: 'btn--discret', refus: A.peut('annuler') ? null : 'Réservé aux rôles : ' + A.rolesPour('annuler') });
    return html;
  };
  A.vide = function (titre, texte, bouton) {
    return '<div class="vide">' + ic('loupe', 'vide-ic') + '<p class="vide-titre">' + e(titre) + '</p><p>' + e(texte) + '</p>' + (bouton || '') + '</div>';
  };
  A.tri = function (zone, cle, libelle, classe) {
    var u = A.ui[zone], actif = u.tri === cle;
    return '<th scope="col"' + (classe ? ' class="' + classe + '"' : '') + ' aria-sort="' + (actif ? (u.sens === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="tri' + (actif ? ' actif' : '') + '" data-action="trier" data-zone="' + zone + '" data-cle="' + cle + '" data-focus="tri-' + zone + '-' + cle + '">' + e(libelle) + ic(actif && u.sens === 'asc' ? 'haut' : 'bas') + '</button></th>';
  };
  A.pagination = function (zone, total, parPage) {
    var u = A.ui[zone], pages = Math.max(1, Math.ceil(total / parPage));
    if (u.page > pages) u.page = pages;
    if (pages === 1) return '<p class="pagination-info">' + pluriel(total, 'résultat') + '</p>';
    return '<nav class="pagination" aria-label="Pages"><p class="pagination-info">' + ((u.page - 1) * parPage + 1) + '–' + Math.min(total, u.page * parPage) + ' sur ' + total + '</p>' +
      A.bouton({ action: 'page', data: { zone: zone, page: u.page - 1 }, icone: 'gauche', aria: 'Page précédente', classe: 'btn--icone', refus: u.page === 1 ? 'Première page' : null, focus: 'page-prec-' + zone }) +
      '<span class="pagination-n">' + u.page + ' / ' + pages + '</span>' +
      A.bouton({ action: 'page', data: { zone: zone, page: u.page + 1 }, icone: 'droite', aria: 'Page suivante', classe: 'btn--icone', refus: u.page === pages ? 'Dernière page' : null, focus: 'page-suiv-' + zone }) + '</nav>';
  };
  A.lienCommande = function (c) { return '<a class="ref" href="#/commandes/' + e(c.id) + '" data-focus="lien-' + e(c.id) + '">' + e(c.id) + '</a>'; };
  A.lienClient = function (cl) { return '<a href="#/clients/' + cl.id + '" data-focus="lien-' + cl.id + '">' + e(cl.nom) + '</a>'; };
  A.lienProduit = function (p) { return '<a href="#/stocks/' + p.id + '" data-focus="lien-' + p.id + '">' + e(p.nom) + '</a>'; };
  A.telecharger = function (nom, contenu) {
    var blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    notifier('Fichier « ' + nom + ' » préparé dans votre navigateur (données fictives).', 'ok');
  };

  /* ── Notifications ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function notifier(texte, type, lien) {
    var zone = type === 'erreur' ? $('#toasts-alerte') : $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast toast--' + (type || 'info');
    t.innerHTML = ic(type === 'erreur' ? 'alerte' : type === 'ok' ? 'coche' : 'info') + '<p>' + e(texte) + '</p>' + (lien ? '<a href="' + e(lien.href) + '">' + e(lien.texte) + '</a>' : '') + '<button type="button" class="toast-fermer" aria-label="Fermer la notification">' + ic('croix') + '</button>';
    zone.appendChild(t);
    var fermer = function () { t.classList.add('sortie'); setTimeout(function () { t.remove(); }, 200); };
    t.querySelector('.toast-fermer').addEventListener('click', fermer);
    setTimeout(fermer, type === 'erreur' ? 9000 : 5200);
    while (zone.children.length > 3) zone.firstChild.remove();
  }
  A.notifier = notifier;

  /* ── Fenêtres (modales et tiroirs) : focus piégé, Échap, retour du focus ─────────────────────────────────────────────────────────── */
  var pileFocus = [];
  A.ouvrirModale = function (m) {   // m = { titre, rendre: fn → html du corps, large, onFermer }
    pileFocus.push(document.activeElement);
    A.modaleActive = m;
    var boite = $('#modale');
    boite.hidden = false;
    boite.innerHTML = '<div class="voile" data-action="fermer-modale"></div><div class="modale' + (m.large ? ' modale--large' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modale-titre"><header class="modale-tete"><h2 id="modale-titre">' + e(m.titre) + '</h2><button type="button" class="btn btn--icone" data-action="fermer-modale" aria-label="Fermer">' + ic('croix') + '</button></header><div class="modale-corps" id="modale-corps"></div></div>';
    m.rendre = (function (f) { return function () { var fo = memoriserFocus(); $('#modale-corps').innerHTML = f(); restaurerFocus(fo); }; })(m.contenu);
    m.rendre();
    document.documentElement.classList.add('fige');
    var premier = $('#modale [autofocus]') || $('#modale .modale-corps input, #modale .modale-corps select, #modale .modale-corps button');
    if (premier) premier.focus();
    A.emettre('modale', m);
  };
  A.fermerModale = function () {
    if (!A.modaleActive) return;
    var m = A.modaleActive; A.modaleActive = null;
    $('#modale').hidden = true; $('#modale').innerHTML = '';
    if (!$('#tiroir .tiroir')) document.documentElement.classList.remove('fige');
    var f = pileFocus.pop(); if (f && document.contains(f)) f.focus({ preventScroll: true });
    if (m.onFermer) m.onFermer();
  };
  var focusAvantTiroir = null;
  function rendreTiroir() {
    var r = A.route, boite = $('#tiroir'), f = r.id && A.tiroirs[r.module];
    var deja = !!$('#tiroir .tiroir');
    if (!f) {
      if (deja) { boite.innerHTML = ''; boite.hidden = true; if (!A.modaleActive) document.documentElement.classList.remove('fige'); if (focusAvantTiroir && document.contains(focusAvantTiroir)) focusAvantTiroir.focus({ preventScroll: true }); else { var lien = $('[data-focus="lien-' + (A.dernierTiroir || '') + '"]'); if (lien) lien.focus({ preventScroll: true }); } focusAvantTiroir = null; }
      return;
    }
    var contenu = f(r.id);
    if (contenu == null) { notifier('Élément introuvable dans cette session.', 'erreur'); history.replaceState(null, '', '#/' + r.module); A.route = { module: r.module, id: null }; boite.hidden = true; boite.innerHTML = ''; return; }
    if (!deja) focusAvantTiroir = document.activeElement !== document.body ? document.activeElement : null;
    A.dernierTiroir = r.id;
    var defile = deja ? $('#tiroir .tiroir-corps').scrollTop : 0;
    boite.hidden = false;
    boite.innerHTML = '<a class="voile" href="#/' + r.module + '" tabindex="-1" aria-hidden="true"></a><aside class="tiroir" role="dialog" aria-modal="true" aria-labelledby="tiroir-titre">' + contenu + '</aside>';
    $('#tiroir .tiroir-corps').scrollTop = defile;
    document.documentElement.classList.add('fige');
    if (!deja) { var t = $('#tiroir-titre'); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  }
  A.fermerTiroir = function () { A.aller('#/' + A.route.module); };
  function pieger(ev) {
    var calque = A.modaleActive ? $('#modale .modale') : $('#tiroir .tiroir') || ($('.palette') && $('.palette'));
    if (!calque) return;
    var f = $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', calque).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    var premier = f[0], dernier = f[f.length - 1];
    if (!calque.contains(document.activeElement)) { ev.preventDefault(); premier.focus(); }
    else if (ev.shiftKey && document.activeElement === premier) { ev.preventDefault(); dernier.focus(); }
    else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus(); }
  }

  /* ── Menus contextuels ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function fermerMenus(sauf) {
    $$('.menu-ctx').forEach(function (m) { if (m !== sauf) { m.hidden = true; var b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); } });
  }
  A.fermerMenus = fermerMenus;
  A.menuCommande = function (c) {
    var items = [{ action: 'ouvrir', lien: '#/commandes/' + c.id, texte: 'Voir le détail', icone: 'oeil' }];
    D.TRANSITIONS[c.statut].forEach(function (v) {
      if (v === 'annulee') items.push({ action: 'annuler', data: { id: c.id }, texte: 'Annuler la commande', icone: 'croix', danger: true, refus: !A.peut('annuler') });
      else items.push({ action: 'statut', data: { id: c.id, vers: v }, texte: D.LIBELLE_ACTION[v], icone: 'fleche', refus: !A.peut(D.droitPour(v)) || (v === 'confirmee' && D.manquants(A.etat, c.lignes).length > 0) });
    });
    if (D.reste(A.d, c) > 0) {
      items.push({ action: 'paiement', data: { id: c.id }, texte: 'Enregistrer un paiement', icone: 'paiement', refus: !A.peut('paiement') });
      if (c.echeance < A.etat.jour) items.push({ action: 'relancer', data: { id: c.id }, texte: 'Relancer le client', icone: 'cloche', refus: !A.peut('relance') });
    }
    var id = 'menu-' + c.id;
    return '<div class="menu-zone"><button type="button" class="btn btn--icone btn--petit" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="' + id + '" aria-label="Actions pour ' + e(c.id) + '" data-focus="menu-' + e(c.id) + '">' + ic('points') + '</button>' +
      '<div class="menu-ctx" id="' + id + '" role="menu" hidden>' + items.map(function (x) {
        if (x.lien) return '<a role="menuitem" href="' + x.lien + '" tabindex="-1">' + ic(x.icone) + e(x.texte) + '</a>';
        return '<button type="button" role="menuitem" tabindex="-1" data-action="' + x.action + '"' + Object.keys(x.data).map(function (k) { return ' data-' + k + '="' + e(x.data[k]) + '"'; }).join('') + (x.refus ? ' aria-disabled="true" data-refus="Action non disponible pour ce rôle ou ce statut."' : '') + (x.danger ? ' class="danger"' : '') + '>' + ic(x.icone) + e(x.texte) + '</button>';
      }).join('') + '</div></div>';
  };

  /* ── Démarrage ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function erreurChargement(err) {
    console.error(err);
    $('#vue').innerHTML = '<div class="etat-erreur" role="alert">' + ic('alerte') + '<h1>La session de démonstration n\'a pas pu être chargée</h1><p>Les données fictives de cet onglet semblent abîmées. Repartir d\'une session neuve règle le problème.</p><button type="button" class="btn btn--plein" data-action="reinitialiser-direct">Repartir d\'une session neuve</button></div>';
  }
  A.reinitialiser = function (garderGuide) {
    try { sessionStorage.removeItem(CLE); } catch (err) { /* rien à effacer */ }
    A.actions = []; A.guideEtat = garderGuide ? A.guideEtat : null;
    var r = D.rejouer(A.jourIso, []);
    A.etat = r.etat; recalculer();
    A.ui.commandes = { q: '', statut: '', type: '', ville: '', paiement: '', periode: 0, retard: false, tri: 'jour', sens: 'desc', page: 1 };
    A.ui.clients = { q: '', type: '', segment: '', echu: false, tri: 'ca90', sens: 'desc' };
    A.ui.stocks = { onglet: 'catalogue', q: '', categorie: '', etat: '', page: 1 };
    A.ui.paiements = { etat: '', q: '', tri: 'echeance', sens: 'asc' };
    A.emettre('reinitialisation');
    ecrireSession();
    if (location.hash !== '#/tableau') location.hash = '#/tableau'; else rendre();
  };
  function demarrer() {
    var pJour = PARAMS.get('jour');
    A.jourIso = /^\d{4}-\d{2}-\d{2}$/.test(pJour || '') && !isNaN(D.jour(pJour)) ? pJour : aujourdhuiLocal();
    var ses = lireSession();
    if (ses && ses.jour !== A.jourIso) ses = null;
    try {
      var r = D.rejouer(A.jourIso, ses ? ses.actions : []);
      A.etat = r.etat;
      A.actions = ses ? ses.actions.slice() : [];
      if (r.refusees) A.actions = [];
    } catch (err) { erreurChargement(err); brancher(); return; }
    A.role = ses && D.ROLES[ses.role] ? ses.role : D.ROLES[PARAMS.get('role')] ? PARAMS.get('role') : 'direction';
    A.theme = ses && ses.theme === 'sombre' ? 'sombre' : PARAMS.get('theme') === 'sombre' ? 'sombre' : 'clair';
    A.accueil = ses ? ses.accueil !== false : true;
    A.guideEtat = ses ? ses.guide : null;
    document.documentElement.setAttribute('data-theme', A.theme);
    recalculer();
    brancher();
    if (!lireRoute()) history.replaceState(null, '', location.pathname + location.search + '#/tableau');
    document.body.classList.add('pret');
    surRoute();
    A.emettre('pret');
  }

  /* ── Interactions (délégation) ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
  A.gestes = {};   // action -> function(cible, ev), complété par ecrans.js et guide.js
  function brancher() {
    document.addEventListener('click', function (ev) {
      var cible = ev.target.closest('[data-action]');
      if (!ev.target.closest('.menu-zone')) fermerMenus();
      if (!cible) return;
      var action = cible.getAttribute('data-action');
      if (cible.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); var raison = cible.getAttribute('data-refus'); if (raison) notifier(raison, 'info'); return; }
      var f = A.gestes[action];
      if (f) { ev.preventDefault(); f(cible, ev); }
    });
    document.addEventListener('input', function (ev) { var c = ev.target.closest('[data-saisie]'); if (c && A.gestes[c.getAttribute('data-saisie')]) A.gestes[c.getAttribute('data-saisie')](c, ev); });
    document.addEventListener('change', function (ev) { var c = ev.target.closest('[data-choix]'); if (c && A.gestes[c.getAttribute('data-choix')]) A.gestes[c.getAttribute('data-choix')](c, ev); });
    document.addEventListener('submit', function (ev) { var f = ev.target.closest('form[data-formulaire]'); if (f) { ev.preventDefault(); var g = A.gestes[f.getAttribute('data-formulaire')]; if (g) g(f, ev); } });
    document.addEventListener('keydown', function (ev) {
      var dansChamp = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); A.gestes.palette(); return; }
      if (ev.key === 'Escape') {
        if ($('.menu-ctx:not([hidden])')) { var m = $('.menu-ctx:not([hidden])'); fermerMenus(); m.previousElementSibling.focus(); return; }
        if (A.paletteOuverte) { A.fermerPalette(); return; }
        if (A.modaleActive) { A.fermerModale(); return; }
        if ($('#tiroir .tiroir')) { A.fermerTiroir(); return; }
        if ($('.app').classList.contains('nav-ouverte')) { $('.app').classList.remove('nav-ouverte'); $('[data-action="nav"]').focus(); return; }
      }
      if (ev.key === 'Tab' && (A.modaleActive || $('#tiroir .tiroir') || A.paletteOuverte)) pieger(ev);
      var menu = ev.target.closest('.menu-ctx');
      if (menu && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        var items = $$('[role="menuitem"]', menu), i = items.indexOf(document.activeElement);
        items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
      if (!dansChamp && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !A.modaleActive && !A.paletteOuverte) {
        if (ev.key === '/') { var champ = $('#vue input[type="search"]'); if (champ) { ev.preventDefault(); champ.focus(); } }
        if (ev.key === 'n' && A.peut('creer_commande')) { ev.preventDefault(); A.gestes['nouvelle-commande'](); }
      }
    });
    $('#role').addEventListener('change', function (ev) { A.gestes.role(ev.target); });
    window.addEventListener('hashchange', surRoute);
  }

  A.gestes.menu = function (b) {
    var m = b.nextElementSibling, ouvert = !m.hidden;
    fermerMenus(m);
    m.hidden = ouvert; b.setAttribute('aria-expanded', String(!ouvert));
    if (!ouvert) {
      var r = b.getBoundingClientRect();
      m.classList.toggle('menu-ctx--haut', r.bottom + 260 > window.innerHeight && r.top > 280);
      var premier = m.querySelector('[role="menuitem"]'); if (premier) premier.focus();
    }
  };
  A.gestes.nav = function () { var app = $('.app'), o = !app.classList.contains('nav-ouverte'); app.classList.toggle('nav-ouverte', o); $('[data-action="nav"]').setAttribute('aria-expanded', String(o)); if (o) $('.nav-lien').focus(); };
  A.gestes['fermer-nav'] = function () { $('.app').classList.remove('nav-ouverte'); };
  A.gestes.theme = function () { A.theme = A.theme === 'sombre' ? 'clair' : 'sombre'; document.documentElement.setAttribute('data-theme', A.theme); ecrireSession(); rendre(); };
  A.gestes.role = function (sel) {
    var avant = A.role; A.role = sel.value; ecrireSession();
    notifier('Vue « ' + D.ROLES[A.role].libelle + ' » : ' + D.ROLES[A.role].resume, 'info');
    A.emettre('role', { avant: avant, apres: A.role });
    if (!A.visible(A.route.module)) A.aller('#/tableau'); else rendre();
  };
  A.gestes['fermer-modale'] = function () { A.fermerModale(); };
  A.gestes['fermer-tiroir'] = function () { A.fermerTiroir(); };
  A.gestes['reinitialiser'] = function () {
    A.ouvrirModale({ titre: 'Réinitialiser la démonstration ?', contenu: function () {
      return '<p>Les commandes, paiements et mouvements créés pendant votre visite sont effacés de cet onglet, et la démonstration revient aux données fictives de départ.</p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Garder ma session', classe: 'btn--discret' }) + A.bouton({ action: 'reinitialiser-direct', texte: 'Réinitialiser', classe: 'btn--plein', icone: 'recharger' }) + '</div>';
    } });
  };
  A.gestes['reinitialiser-direct'] = function () { A.fermerModale(); A.reinitialiser(); notifier('Démonstration réinitialisée : données fictives de départ.', 'ok'); };
  A.gestes.page = function (b) { A.ui[b.getAttribute('data-zone')].page = +b.getAttribute('data-page'); rendre(); var t = $('#vue .table-zone'); if (t) t.scrollIntoView({ block: 'nearest' }); };
  A.gestes.trier = function (b) {
    var u = A.ui[b.getAttribute('data-zone')], cle = b.getAttribute('data-cle');
    if (u.tri === cle) u.sens = u.sens === 'asc' ? 'desc' : 'asc'; else { u.tri = cle; u.sens = /client|nom|echeance|sku/.test(cle) ? 'asc' : 'desc'; }
    u.page = 1; rendre();
  };

  /* ── Palette de commandes (Ctrl/⌘ + K) ─────────────────────────────────────────────────────────────────────────────────────────────── */
  A.gestes.palette = function () {
    if (A.paletteOuverte) return;
    A.paletteOuverte = true; pileFocus.push(document.activeElement);
    var boite = $('#palette');
    boite.hidden = false;
    boite.innerHTML = '<div class="voile" data-action="fermer-palette"></div><div class="palette" role="dialog" aria-modal="true" aria-label="Rechercher et aller à"><div class="palette-champ">' + ic('loupe') + '<input id="palette-q" type="text" role="combobox" aria-expanded="true" aria-controls="palette-liste" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Commande, client, produit ou écran…"><kbd>Échap</kbd></div><ul id="palette-liste" role="listbox" aria-label="Résultats"></ul></div>';
    var q = $('#palette-q'), choix = 0, res = [];
    function chercher() {
      var t = D.sansAccent(q.value.trim()), s = A.etat;
      res = [];
      MODULES.filter(function (m) { return A.visible(m.id); }).forEach(function (m) { if (!t || D.sansAccent(m.nom).indexOf(t) >= 0) res.push({ type: 'Écran', texte: m.nom, lien: '#/' + m.id, icone: m.icone }); });
      if (A.peut('creer_commande') && (!t || 'nouvelle commande'.indexOf(t) >= 0 || 'creer'.indexOf(t) >= 0)) res.unshift({ type: 'Action', texte: 'Créer une commande', action: 'nouvelle-commande', icone: 'plus' });
      if (t) {
        s.commandes.filter(function (c) { return D.sansAccent(c.id).indexOf(t) >= 0; }).slice(-5).reverse().forEach(function (c) { res.push({ type: 'Commande', texte: c.id + ' · ' + D.client(s, c.client).nom, lien: '#/commandes/' + c.id, icone: 'commandes' }); });
        if (A.visible('clients')) s.clients.filter(function (c) { return D.sansAccent(c.nom + ' ' + c.ville).indexOf(t) >= 0; }).slice(0, 5).forEach(function (c) { res.push({ type: 'Client', texte: c.nom + ' · ' + c.ville, lien: '#/clients/' + c.id, icone: 'clients' }); });
        if (A.visible('stocks')) s.produits.filter(function (p) { return D.sansAccent(p.nom + ' ' + p.sku).indexOf(t) >= 0; }).slice(0, 5).forEach(function (p) { res.push({ type: 'Produit', texte: p.nom + ' · ' + p.sku, lien: '#/stocks/' + p.id, icone: 'stock' }); });
      }
      res = res.slice(0, 12); choix = Math.min(choix, Math.max(0, res.length - 1));
      $('#palette-liste').innerHTML = res.length ? res.map(function (r, i) { return '<li role="option" id="palette-' + i + '" aria-selected="' + (i === choix) + '" data-i="' + i + '">' + ic(r.icone) + '<span>' + e(r.texte) + '</span><small>' + e(r.type) + '</small></li>'; }).join('') : '<li class="palette-vide">Aucun résultat dans les données fictives.</li>';
      q.setAttribute('aria-activedescendant', res.length ? 'palette-' + choix : '');
    }
    function valider(i) { var r = res[i]; if (!r) return; A.fermerPalette(true); if (r.action) A.gestes[r.action](); else A.aller(r.lien); }
    q.addEventListener('input', function () { choix = 0; chercher(); });
    q.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); choix = (choix + (ev.key === 'ArrowDown' ? 1 : -1) + res.length) % Math.max(1, res.length); chercher(); var o = $('#palette-' + choix); if (o) o.scrollIntoView({ block: 'nearest' }); }
      if (ev.key === 'Enter') { ev.preventDefault(); valider(choix); }
    });
    $('#palette-liste').addEventListener('click', function (ev) { var li = ev.target.closest('[data-i]'); if (li) valider(+li.getAttribute('data-i')); });
    chercher(); q.focus();
  };
  A.fermerPalette = function (sansFocus) { A.paletteOuverte = false; $('#palette').hidden = true; $('#palette').innerHTML = ''; var f = pileFocus.pop(); if (!sansFocus && f && document.contains(f)) f.focus(); };
  A.gestes['fermer-palette'] = function () { A.fermerPalette(); };

  document.addEventListener('DOMContentLoaded', function () {
    try { demarrer(); } catch (err) { erreurChargement(err); }
  });
})();
