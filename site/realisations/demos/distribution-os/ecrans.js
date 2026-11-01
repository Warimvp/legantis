/* Distribution OS — les huit écrans, les fiches (tiroirs) et les fenêtres d'action. Toutes les valeurs affichées sont calculées depuis l'état de la session
   (moteur.js) : un indicateur, un graphique ou une liste change dès qu'une action le concerne. */
(function () {
  'use strict';
  var A = window.DOSApp, D = window.DOS, G = window.DOSGraph;
  var e = A.e, ic = A.ic, mad = A.mad, pluriel = A.pluriel, $ = A.$, $$ = A.$$;
  var PAR_PAGE = 20;

  function S() { return A.etat; }
  function compact(c) { return D.formaterCompact(c); }
  function quand(j, h) { return D.relatif(j, S().jour) + (h ? ' · ' + h : ''); }
  function pct(a, b) { return b ? Math.round((a - b) / b * 100) : 0; }
  function tete(titre, sous, actions, surtitre) {
    return '<header class="page-tete"><div>' + (surtitre ? '<p class="surtitre">' + surtitre + '</p>' : '') + '<h1>' + e(titre) + '</h1>' + (sous ? '<p class="page-sous">' + sous + '</p>' : '') + '</div>' + (actions ? '<div class="page-actions">' + actions + '</div>' : '') + '</header>';
  }
  function boutonNouvelle(texte) { return A.peut('creer_commande') ? A.bouton({ action: 'nouvelle-commande', texte: texte || 'Nouvelle commande', icone: 'plus', classe: 'btn--plein', focus: 'nouvelle-page' }) : ''; }
  function boutonExport(quoi) { return A.bouton({ action: 'exporter', data: { quoi: quoi }, texte: 'Exporter', icone: 'telecharger', titre: 'Fichier CSV des données fictives affichées', focus: 'export-' + quoi }); }
  function select(id, saisie, options, valeur, libelle) {
    return '<label class="filtre"><span class="visuellement-cache">' + e(libelle) + '</span><select id="' + id + '" data-choix="' + saisie + '" data-focus="' + id + '">' + options.map(function (o) { return '<option value="' + e(o[0]) + '"' + (String(o[0]) === String(valeur) ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function recherche(id, saisie, valeur, placeholder) {
    return '<label class="recherche">' + ic('loupe') + '<span class="visuellement-cache">' + e(placeholder) + '</span><input type="search" id="' + id + '" data-saisie="' + saisie + '" value="' + e(valeur) + '" placeholder="' + e(placeholder) + '" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></label>';
  }
  function donnees(titre, entetes, lignes) {
    return '<details class="donnees"><summary>Voir les données</summary><div class="table-defile"><table class="table table--compacte"><caption class="visuellement-cache">' + e(titre) + '</caption><thead><tr>' + entetes.map(function (h, i) { return '<th scope="col"' + (i ? ' class="num"' : '') + '>' + e(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + lignes.map(function (l) { return '<tr>' + l.map(function (c, i) { return i ? '<td class="num">' + e(c) + '</td>' : '<th scope="row">' + e(c) + '</th>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
  }
  function villes() { var v = {}; S().clients.forEach(function (c) { v[c.ville] = 1; }); return Object.keys(v).sort(); }
  function categories() { var v = {}; S().produits.forEach(function (p) { v[p.categorie] = 1; }); return Object.keys(v); }
  var TYPES = ['Grossiste', 'Supérette', 'Épicerie', 'CHR'];

  /* ══ A. Tableau de bord ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  var KPI_ROLE = {
    direction: ['ca30', 'enCours', 'enRetard', 'livraisons7', 'alertes', 'encours'],
    commercial: ['ca30', 'nouvelles', 'enCours', 'enRetard', 'encours', 'alertes'],
    magasinier: ['aPreparer', 'prets', 'livraisons7', 'enRetard', 'alertes', 'ruptures'],
    gestionnaire: ['encours', 'echu', 'aEchoir', 'encaisse30', 'enRetard', 'ca30']
  };
  function extras() {
    var s = S(), j = s.jour, x = { aEchoir: 0, nbAEchoir: 0, encaisse30: 0, nbEncaisse: 0 };
    s.commandes.forEach(function (c) { var r = D.reste(A.d, c); if (r > 0 && c.echeance >= j && c.echeance <= j + 7) { x.aEchoir += r; x.nbAEchoir++; } });
    s.paiements.forEach(function (p) { if (p.jour > j - 30) { x.encaisse30 += p.montant; x.nbEncaisse++; } });
    return x;
  }
  function tuile(cle, k, x, ventes) {
    var t = {
      ca30: { nom: 'Chiffre d\'affaires HT · 30 j', val: compact(k.ca30), pied: deltaTxt(pct(k.ca30, k.ca30Precedent), 'vs 30 jours précédents', true), lien: '#/rapports', tendance: ventes.map(function (v) { return v.ht; }).slice(0, -1) },
      enCours: { nom: 'Commandes en cours', val: k.enCours, pied: 'dont ' + pluriel(k.nouvelles, 'nouvelle') + ' à confirmer', lien: '#/preparation' },
      nouvelles: { nom: 'Nouvelles à confirmer', val: k.nouvelles, pied: k.bloquees ? pluriel(k.bloquees, 'bloquée') + ' par le stock' : 'stock disponible', lien: '#/commandes?statut=nouvelle', niveau: k.bloquees ? 'attention' : '' },
      enRetard: { nom: 'Commandes en retard', val: k.enRetard, pied: k.enRetard ? 'date de livraison dépassée' : 'aucune livraison en retard', lien: '#/commandes?retard=1', niveau: k.enRetard ? 'critique' : 'ok' },
      livraisons7: { nom: 'Livraisons prévues · 7 j', val: k.livraisons7, pied: 'dont ' + k.livraisonsJour + ' aujourd\'hui', lien: '#/preparation' },
      alertes: { nom: 'Alertes de stock', val: k.alertes, pied: k.ruptures ? 'dont ' + pluriel(k.ruptures, 'rupture') : 'aucune rupture', lien: '#/stocks?etat=alerte', niveau: k.ruptures ? 'serieux' : k.alertes ? 'attention' : 'ok' },
      ruptures: { nom: 'Produits en rupture', val: k.ruptures, pied: 'disponible à zéro', lien: '#/stocks?etat=rupture', niveau: k.ruptures ? 'critique' : 'ok' },
      encours: { nom: 'Encours clients TTC', val: compact(k.encours), pied: 'dont ' + compact(k.echu) + ' échus', lien: '#/paiements', niveau: k.echu ? 'attention' : '' },
      echu: { nom: 'Échéances dépassées', val: compact(k.echu), pied: 'à relancer', lien: '#/paiements?etat=echue', niveau: k.echu ? 'critique' : 'ok' },
      aEchoir: { nom: 'À encaisser · 7 j', val: compact(x.aEchoir), pied: pluriel(x.nbAEchoir, 'échéance'), lien: '#/paiements?etat=a_echoir' },
      encaisse30: { nom: 'Encaissé · 30 j', val: compact(x.encaisse30), pied: pluriel(x.nbEncaisse, 'paiement'), lien: '#/paiements?etat=payee' },
      aPreparer: { nom: 'À préparer', val: k.aPreparer, pied: 'confirmées ou en préparation', lien: '#/preparation?onglet=liste' },
      prets: { nom: 'Prêtes à expédier', val: k.prets, pied: 'en attente du livreur', lien: '#/preparation' }
    }[cle];
    var change = A.kPrecedent && A.kPrecedent[cle] != null && A.kPrecedent[cle] !== (k[cle] != null ? k[cle] : x[cle]);
    return '<a class="kpi' + (t.niveau ? ' kpi--' + t.niveau : '') + (change ? ' kpi--change' : '') + '" href="' + t.lien + '" data-kpi="' + cle + '"><span class="kpi-nom">' + e(t.nom) + '</span><b class="kpi-val">' + e(t.val) + '</b><span class="kpi-pied">' + t.pied + '</span>' + (t.tendance ? G.tendance(t.tendance) : '') + '</a>';
  }
  function deltaTxt(d, ref, hautBien) {
    var sens = d > 0 ? 'hausse' : d < 0 ? 'baisse' : 'stable', bien = d === 0 ? 'neutre' : (d > 0) === hautBien ? 'bien' : 'mal';
    return '<span class="delta delta--' + bien + '">' + ic(sens === 'hausse' ? 'haut' : sens === 'baisse' ? 'bas' : 'egal') + (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + ' %</span> ' + e(ref);
  }
  var JOURNAL_IC = { commande: 'commandes', statut: 'fleche', paiement: 'paiement', relance: 'cloche', stock: 'stock' };
  A.ecrans.tableau = function () {
    var s = S(), k = A.k, x = extras(), role = A.role, ventes = D.ventesParSemaine(s, A.d, 12);
    var prenom = D.ROLES[role].personne.split(' ')[0];
    var html = tete('Bonjour ' + prenom + ', voici la situation', e(D.ROLES[role].resume), '', e(D.dateLongue(s.jour)) + ' · ' + e(s.entreprise.nom));
    if (A.accueil && !A.guideActif) html += '<section class="accueil" aria-labelledby="accueil-titre"><div><p class="surtitre">Démonstration interactive</p><h2 id="accueil-titre">Un logiciel de distribution complet, à essayer librement.</h2><p>Démo Négoce SARL est un distributeur fictif de Casablanca : 18 clients, 24 produits et 18 semaines d\'activité. Créez une commande, réservez le stock, préparez, expédiez : chaque écran se met à jour. Rien n\'est envoyé, aucune inscription.</p></div><div class="accueil-actions">' + A.bouton({ action: 'guide', texte: 'Tester un scénario en 3 minutes', icone: 'lecture', classe: 'btn--plein btn--grand', focus: 'guide-accueil' }) + A.bouton({ action: 'fermer-accueil', texte: 'Explorer librement', classe: 'btn--discret btn--grand' }) + '</div></section>';
    html += '<section class="kpis" aria-label="Indicateurs clés">' + KPI_ROLE[role].map(function (c) { return tuile(c, k, x, ventes); }).join('') + '</section>';
    A.kPrecedent = Object.assign({}, k, x);
    html += '<div class="grille-tableau">';
    if (role !== 'magasinier') {
      var derniere = ventes.length - 2;
      html += '<section class="carte carte--ventes" aria-labelledby="t-ventes"><header class="carte-tete"><div><h2 id="t-ventes">Évolution des ventes</h2><p class="carte-sous">Chiffre d\'affaires HT par semaine, 12 semaines · la dernière est en cours</p></div><a class="lien-fleche" href="#/rapports">Rapports' + ic('droite') + '</a></header>' +
        A.graphe('colonnes', { titre: 'Ventes HT par semaine sur 12 semaines', hauteur: 230, marque: derniere, format: function (v, plein) { return plein ? compact(v) : v >= 1e5 ? Math.round(v / 1e5) + ' k' : Math.round(v / 100); }, points: ventes.map(function (v) { return { etiquette: D.dateJourMois(v.debut), valeur: v.ht, attenue: v.enCours, infobulle: 'Semaine du ' + D.dateJourMois(v.debut) + (v.enCours ? ' (en cours)' : '') + ' : ' + mad(v.ht, true) + ' HT · ' + pluriel(v.nb, 'commande') }; }) }) +
        donnees('Ventes HT par semaine', ['Semaine du', 'Commandes', 'CA HT (MAD)'], ventes.map(function (v) { return [D.dateCourte(v.debut) + (v.enCours ? ' (en cours)' : ''), v.nb, D.decimal(v.ht)]; })) + '</section>';
    }
    var prio = D.priorites(s, A.d, role);
    html += '<section class="carte" aria-labelledby="t-prio"><header class="carte-tete"><div><h2 id="t-prio">Actions prioritaires</h2><p class="carte-sous">Ce qui demande une décision aujourd\'hui</p></div></header>' +
      (prio.length ? '<ul class="priorites">' + prio.map(function (p) { return '<li class="prio prio--' + p.niveau + '">' + ic(p.niveau === 'critique' ? 'alerte' : p.niveau === 'serieux' ? 'alerte' : 'info') + '<div><a href="' + p.lien + '">' + e(p.titre) + '</a><p>' + e(p.detail) + '</p></div>' + ic('droite', 'prio-fleche') + '</li>'; }).join('') + '</ul>' : A.vide('Rien d\'urgent', 'Toutes les commandes sont dans les temps.')) + '</section>';
    var tops = D.produitsDemandes(s, s.jour - 29).slice(0, 6);
    html += '<section class="carte" aria-labelledby="t-top"><header class="carte-tete"><div><h2 id="t-top">Produits les plus demandés</h2><p class="carte-sous">Quantités commandées, 30 derniers jours</p></div></header>' +
      G.barresH(tops.map(function (t) { var p = D.produit(s, t.produit); return { nom: p.nom, sous: p.unite, valeur: t.qte, lien: '#/stocks/' + p.id, infobulle: t.qte + ' × ' + p.unite + ' · ' + pluriel(t.commandes, 'commande') }; }), function (v) { return D.milliers(v); }) + '</section>';
    var par = D.commandesParStatut(s), flux = ['nouvelle', 'confirmee', 'en_preparation', 'prete', 'expediee'], total = flux.reduce(function (t, x) { return t + par[x]; }, 0) || 1;
    html += '<section class="carte" aria-labelledby="t-flux"><header class="carte-tete"><div><h2 id="t-flux">Commandes par étape</h2><p class="carte-sous">' + pluriel(k.enCours, 'commande') + ' en cours</p></div><a class="lien-fleche" href="#/preparation">Kanban' + ic('droite') + '</a></header>' +
      '<div class="segments" aria-hidden="true">' + flux.filter(function (x) { return par[x]; }).map(function (x) { return '<i class="statut-fond--' + x + '" style="flex-grow:' + par[x] / total + '" data-tip="' + e(D.LIBELLE_STATUT[x] + ' : ' + par[x]) + '"></i>'; }).join('') + '</div>' +
      '<ul class="legende">' + flux.map(function (x) { return '<li><a href="#/commandes?statut=' + x + '"><i class="pastille-couleur statut-fond--' + x + '"></i>' + e(D.LIBELLE_STATUT[x]) + '<b>' + par[x] + '</b></a></li>'; }).join('') + '</ul></section>';
    var journal = s.journal.slice(-8).reverse();
    html += '<section class="carte" aria-labelledby="t-activite"><header class="carte-tete"><div><h2 id="t-activite">Activité récente</h2><p class="carte-sous">Toute l\'équipe, en direct</p></div></header><ol class="activite">' + journal.map(function (j) {
      var lien = j.ref && /^CMD-/.test(j.ref) ? '#/commandes/' + j.ref : null;
      return '<li>' + ic(JOURNAL_IC[j.type] || 'info') + '<div><p>' + (lien ? '<a href="' + lien + '">' + e(j.texte) + '</a>' : e(j.texte)) + '</p><small>' + e(j.par) + ' · ' + e(quand(j.jour, j.h)) + '</small></div></li>';
    }).join('') + '</ol></section>';
    html += '</div>';
    return html;
  };
  A.gestes['fermer-accueil'] = function () { A.accueil = false; A.ecrireSession(); A.rendre(); var k = $('.kpi'); if (k) k.focus(); };

  /* ══ B. Commandes ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  function filtresCommandes() {
    var u = A.ui.commandes;
    return { q: u.q, statuts: u.statut ? [u.statut] : [], type: u.type, ville: u.ville, paiement: u.paiement, periode: u.periode, retard: u.retard, client: u.client };
  }
  function commandesFiltrees() { var u = A.ui.commandes; return D.trierCommandes(S(), A.d, D.filtrerCommandes(S(), A.d, filtresCommandes()), u.tri, u.sens); }
  A.commandesFiltrees = commandesFiltrees;
  A.ecrans.commandes = function () {
    var s = S(), u = A.ui.commandes, liste = commandesFiltrees(), montrerMontant = A.role !== 'magasinier';
    var compte = D.commandesParStatut(s, function (c) { var f = filtresCommandes(); f.statuts = []; return D.filtrerCommandes(s, A.d, f).indexOf(c) >= 0; });
    var html = tete('Commandes', pluriel(s.commandes.length, 'commande') + ' sur 18 semaines · ' + pluriel(A.k.enCours, 'commande') + ' en cours', boutonExport('commandes'));
    html += '<div class="onglets-filtre" role="group" aria-label="Filtrer par statut">' + [['', 'Toutes']].concat(D.STATUTS.map(function (x) { return [x, D.LIBELLE_STATUT[x]]; })).map(function (o) {
      var n = o[0] ? compte[o[0]] : Object.keys(compte).reduce(function (t, x) { return t + compte[x]; }, 0);
      return '<button type="button" class="onglet-f" data-action="cmd-statut" data-statut="' + o[0] + '" aria-pressed="' + (u.statut === o[0]) + '" data-focus="statut-f-' + (o[0] || 'tout') + '">' + e(o[1]) + '<span>' + n + '</span></button>';
    }).join('') + '</div>';
    var actifs = [];
    if (u.q) actifs.push(['q', '« ' + u.q + ' »']);
    if (u.client) actifs.push(['client', D.client(s, u.client).nom]);
    if (u.type) actifs.push(['type', u.type]); if (u.ville) actifs.push(['ville', u.ville]);
    if (u.paiement) actifs.push(['paiement', D.LIBELLE_PAIEMENT[u.paiement]]); if (u.periode) actifs.push(['periode', u.periode + ' derniers jours']);
    if (u.retard) actifs.push(['retard', 'En retard']);
    html += '<div class="barre-filtres">' + recherche('cmd-q', 'cmd-q', u.q, 'Référence, client ou ville') +
      select('cmd-type', 'cmd-filtre', [['', 'Tous les clients']].concat(TYPES.map(function (t) { return [t, t]; })), u.type, 'Type de client') +
      select('cmd-ville', 'cmd-filtre', [['', 'Toutes les villes']].concat(villes().map(function (v) { return [v, v]; })), u.ville, 'Ville') +
      (montrerMontant ? select('cmd-paiement', 'cmd-filtre', [['', 'Tous les paiements'], ['a_facturer', 'Non facturées'], ['a_echoir', 'À échoir'], ['partielle', 'Partiellement payées'], ['echue', 'Échues'], ['payee', 'Payées']], u.paiement, 'Paiement') : '') +
      select('cmd-periode', 'cmd-filtre', [[0, 'Toute la période'], [7, '7 derniers jours'], [30, '30 derniers jours'], [90, '90 derniers jours']], u.periode, 'Période') +
      '<label class="bascule"><input type="checkbox" id="cmd-retard" data-choix="cmd-filtre" data-focus="cmd-retard"' + (u.retard ? ' checked' : '') + '><span>En retard</span></label></div>';
    if (actifs.length) html += '<div class="puces" aria-label="Filtres actifs">' + actifs.map(function (a) { return '<button type="button" class="puce" data-action="cmd-retirer" data-cle="' + a[0] + '" aria-label="Retirer le filtre ' + e(a[1]) + '">' + e(a[1]) + ic('croix') + '</button>'; }).join('') + '<button type="button" class="lien-bouton" data-action="cmd-effacer">Effacer les filtres</button></div>';
    var page = liste.slice((u.page - 1) * PAR_PAGE, u.page * PAR_PAGE);
    html += '<section class="carte carte--table table-zone" aria-label="Liste des commandes">';
    if (!liste.length) html += A.vide('Aucune commande ne correspond', 'Modifiez la recherche ou retirez un filtre.', '<button type="button" class="btn" data-action="cmd-effacer">Effacer les filtres</button>');
    else {
      html += '<div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Commandes, ' + pluriel(liste.length, 'résultat') + '</caption><thead><tr>' + A.tri('commandes', 'id', 'Référence') + A.tri('commandes', 'client', 'Client') + A.tri('commandes', 'jour', 'Créée') + A.tri('commandes', 'livraison', 'Livraison prévue') + '<th scope="col" class="num">Articles</th>' + (montrerMontant ? A.tri('commandes', 'montant', 'Montant TTC', 'num') : '') + A.tri('commandes', 'statut', 'Statut') + (montrerMontant ? '<th scope="col">Paiement</th>' : '') + '<th scope="col"><span class="visuellement-cache">Actions</span></th></tr></thead><tbody>';
      page.forEach(function (c) {
        var cl = D.client(s, c.client), retard = D.enRetard(c, s.jour);
        html += '<tr' + (c.session ? ' class="ligne-session"' : '') + '><td data-l="Référence">' + A.lienCommande(c) + (c.session ? '<span class="nouveau" title="Créée pendant votre visite">vous</span>' : '') + '</td><td data-l="Client"><span class="cellule-2">' + e(cl.nom) + '<small>' + e(cl.type + ' · ' + cl.ville) + '</small></span></td><td data-l="Créée">' + e(quand(c.jour, c.h)) + '</td><td data-l="Livraison prévue"><span class="' + (retard ? 'texte-critique' : '') + '">' + (retard ? ic('horloge') : '') + e(D.dateJourMois(c.livraisonPrevue)) + '</span></td><td data-l="Articles" class="num">' + c.lignes.length + '</td>' + (montrerMontant ? '<td data-l="Montant TTC" class="num">' + mad(A.d.montants[c.id].ttc) + '</td>' : '') + '<td data-l="Statut">' + A.badge(c.statut) + '</td>' + (montrerMontant ? '<td data-l="Paiement">' + A.badgePaiement(D.etatPaiement(s, c)) + '</td>' : '') + '<td class="cellule-menu">' + A.menuCommande(c) + '</td></tr>';
      });
      html += '</tbody></table></div>' + A.pagination('commandes', liste.length, PAR_PAGE);
    }
    return html + '</section>';
  };
  A.gestes['cmd-q'] = function (c) { A.ui.commandes.q = c.value; A.ui.commandes.page = 1; A.rendre(); };
  A.gestes['cmd-statut'] = function (b) { A.ui.commandes.statut = b.getAttribute('data-statut'); A.ui.commandes.page = 1; A.rendre(); };
  A.gestes['cmd-filtre'] = function () { var u = A.ui.commandes; u.type = $('#cmd-type').value; u.ville = $('#cmd-ville').value; u.paiement = $('#cmd-paiement') ? $('#cmd-paiement').value : ''; u.periode = +$('#cmd-periode').value; u.retard = $('#cmd-retard').checked; u.page = 1; A.rendre(); };
  A.gestes['cmd-retirer'] = function (b) { var u = A.ui.commandes, k = b.getAttribute('data-cle'); u[k] = k === 'periode' ? 0 : k === 'retard' ? false : ''; u.page = 1; A.rendre(); var q = $('#cmd-q'); if (q) q.focus(); };
  A.gestes['cmd-effacer'] = function () { var u = A.ui.commandes; u.q = ''; u.statut = ''; u.type = ''; u.ville = ''; u.paiement = ''; u.periode = 0; u.retard = false; u.client = ''; u.page = 1; A.rendre(); var q = $('#cmd-q'); if (q) q.focus(); };

  /* Fiche commande */
  function etapes(c) {
    if (c.statut === 'annulee') return '';
    var i = D.FLUX.indexOf(c.statut);
    return '<ol class="etapes" aria-label="Avancement">' + D.FLUX.map(function (x, n) { return '<li class="' + (n < i ? 'faite' : n === i ? 'courante' : '') + '"' + (n === i ? ' aria-current="step"' : '') + '><i>' + (n < i ? ic('coche') : n + 1) + '</i><span>' + e(D.LIBELLE_STATUT[x]) + '</span></li>'; }).join('') + '</ol>';
  }
  A.tiroirs.commandes = function (id) {
    var s = S(), c = D.commande(s, id); if (!c) return null;
    var cl = D.client(s, c.client), mt = A.d.montants[c.id], argent = A.role !== 'magasinier', m = D.manquants(s, c.lignes);
    var h = '<div class="tiroir-tete"><div><p class="surtitre">Commande · ' + e(c.canal) + ' · ' + e(D.membre(c.commercial).nom) + '</p><h2 id="tiroir-titre" class="mono">' + e(c.id) + '</h2><div class="tiroir-badges">' + A.badge(c.statut) + A.badgeRetard(c) + (c.session ? '<span class="pastille pastille--info">Créée pendant votre visite</span>' : '') + '</div></div><a class="btn btn--icone" href="#/' + A.route.module + '" aria-label="Fermer la fiche">' + ic('croix') + '</a></div><div class="tiroir-corps">';
    h += etapes(c);
    var actions = A.actionsCommande(c);
    if (c.statut === 'nouvelle' && A.peut('modifier_commande')) actions += A.bouton({ action: 'modifier', data: { id: c.id }, texte: 'Modifier', icone: 'crayon', classe: 'btn--discret' });
    if (argent && D.reste(A.d, c) > 0) { actions += A.bouton({ action: 'paiement', data: { id: c.id }, texte: 'Enregistrer un paiement', icone: 'paiement', refus: A.peut('paiement') ? null : 'Réservé aux rôles : ' + A.rolesPour('paiement') }); if (c.echeance < s.jour) actions += A.bouton({ action: 'relancer', data: { id: c.id }, texte: 'Relancer', icone: 'cloche', refus: A.peut('relance') ? null : 'Réservé aux rôles : ' + A.rolesPour('relance') }); }
    if (actions) h += '<div class="tiroir-actions">' + actions + '</div>';
    if (c.statut === 'annulee') h += '<p class="bandeau-info bandeau-info--neutre">' + ic('info') + '<span>Annulée ' + e(quand(c.historique[c.historique.length - 1].jour)) + ' · motif : ' + e(c.motif) + '. Le stock réservé, s\'il y en avait, a été libéré.</span></p>';
    if (c.statut === 'nouvelle') h += m.length ? '<div class="bandeau-info bandeau-info--attention" role="note">' + ic('alerte') + '<span><b>Stock insuffisant pour confirmer.</b> ' + m.map(function (x) { return e(x.nom) + ' : ' + x.demande + ' demandés, ' + x.disponible + ' disponibles'; }).join(' ; ') + '.</span></div>' : '<p class="bandeau-info bandeau-info--ok">' + ic('coche') + '<span>Stock disponible pour toutes les lignes : la confirmation réservera les quantités.</span></p>';
    if (D.RESERVANT[c.statut]) h += '<p class="bandeau-info bandeau-info--ok">' + ic('stock') + '<span>Stock réservé pour cette commande : il n\'est plus proposé aux autres.</span></p>';
    h += '<section class="bloc"><h3>Client</h3><dl class="def"><dt>Client</dt><dd>' + (A.visible('clients') ? A.lienClient(cl) : e(cl.nom)) + ' <small>' + e(cl.type + ' · ' + cl.ville) + '</small></dd><dt>Contact</dt><dd>' + e(cl.contact) + ' <small>(fictif)</small></dd>' + (argent ? '<dt>Conditions</dt><dd>Remise ' + cl.remise + ' % · ' + (cl.delai ? 'paiement à ' + cl.delai + ' jours' : 'paiement comptant') + '</dd>' : '') + (c.note ? '<dt>Note</dt><dd>' + e(c.note) + '</dd>' : '') + '</dl></section>';
    h += '<section class="bloc"><h3>Articles</h3><div class="table-defile"><table class="table table--compacte"><thead><tr><th scope="col">Produit</th><th scope="col" class="num">Qté</th>' + (c.statut === 'nouvelle' ? '<th scope="col" class="num">Disponible</th>' : '') + (argent ? '<th scope="col" class="num">PU HT</th><th scope="col" class="num">Total HT</th>' : '') + '</tr></thead><tbody>' + c.lignes.map(function (l) {
      var p = D.produit(s, l.produit), d = D.disponible(p), manque = c.statut === 'nouvelle' && l.qte > d;
      return '<tr><th scope="row"><span class="cellule-2">' + (A.visible('stocks') ? A.lienProduit(p) : e(p.nom)) + '<small><span class="mono">' + e(p.sku) + '</span> · ' + e(p.unite) + '</small></span></th><td class="num">' + l.qte + '</td>' + (c.statut === 'nouvelle' ? '<td class="num ' + (manque ? 'texte-critique' : '') + '">' + (manque ? ic('alerte') : '') + Math.max(0, d) + '</td>' : '') + (argent ? '<td class="num">' + mad(l.prix) + '</td><td class="num">' + mad(l.qte * l.prix) + '</td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>' + (argent ? '<dl class="totaux"><dt>Total brut HT</dt><dd>' + mad(mt.brut) + '</dd>' + (mt.remise ? '<dt>Remise client ' + c.remise + ' %</dt><dd>−' + mad(mt.remise) + '</dd>' : '') + '<dt>Total HT</dt><dd>' + mad(mt.ht) + '</dd><dt>TVA ' + D.TVA_PCT + ' %</dt><dd>' + mad(mt.tva) + '</dd><dt class="total">Total TTC</dt><dd class="total">' + mad(mt.ttc) + '</dd></dl>' : '') + '</section>';
    h += '<section class="bloc"><h3>Préparation et livraison</h3><dl class="def"><dt>Livraison prévue</dt><dd>' + e(D.dateLongue(c.livraisonPrevue)) + '</dd><dt>Préparation</dt><dd>' + (c.preparateur ? e(D.membre(c.preparateur).nom) : '<span class="discret">non commencée</span>') + '</dd><dt>Livreur</dt><dd>' + (c.livreur ? e(D.membre(c.livreur).nom) : '<span class="discret">non affecté</span>') + '</dd>' + (c.expedieeLe != null ? '<dt>Expédiée</dt><dd>' + e(D.dateCourte(c.expedieeLe)) + '</dd>' : '') + (c.livreeLe != null ? '<dt>Livrée</dt><dd>' + e(D.dateCourte(c.livreeLe)) + (c.livreeLe > c.livraisonPrevue ? ' <span class="pastille pastille--attention">' + pluriel(c.livreeLe - c.livraisonPrevue, 'jour') + ' de retard</span>' : '') + '</dd>' : '') + '</dl></section>';
    if (argent && D.FACTURE[c.statut]) {
      var pai = s.paiements.filter(function (p) { return p.commande === c.id; }), rel = s.relances.filter(function (r) { return r.commande === c.id; });
      h += '<section class="bloc"><h3>Paiement</h3><dl class="def"><dt>État</dt><dd>' + A.badgePaiement(D.etatPaiement(s, c)) + '</dd><dt>Échéance</dt><dd>' + e(D.dateCourte(c.echeance)) + '</dd><dt>Payé</dt><dd>' + mad(A.d.paye[c.id] || 0) + '</dd><dt>Reste dû</dt><dd><b>' + mad(D.reste(A.d, c)) + '</b></dd></dl>' +
        (pai.length || rel.length ? '<ul class="mini-liste">' + pai.map(function (p) { return '<li>' + ic('paiement') + e(D.dateCourte(p.jour) + ' · ' + p.mode + ' · ' + mad(p.montant)) + '</li>'; }).concat(rel.map(function (r) { return '<li>' + ic('cloche') + e(D.dateCourte(r.jour) + ' · relance n° ' + r.niveau + ' par ' + r.canal.toLowerCase() + ' (simulée)') + '</li>'; })).join('') + '</ul>' : '') + '</section>';
    }
    h += '<section class="bloc"><h3>Historique</h3><ol class="chrono">' + c.historique.slice().reverse().map(function (x) { return '<li><b>' + e(D.LIBELLE_STATUT[x.statut]) + '</b><small>' + e(D.dateCourte(x.jour) + ' à ' + x.h + ' · ' + x.par) + '</small></li>'; }).join('') + '</ol></section>';
    return h + '</div>';
  };

  /* Changement de statut, avec un retour précis sur ce que l'action a changé */
  A.changerStatut = function (id, vers) {
    var s = S(), c = D.commande(s, id);
    var res = A.agir({ type: 'changer_statut', id: id, vers: vers });
    if (!res.ok) { A.notifier(res.erreur.message, 'erreur'); return res; }
    var n = c.lignes.reduce(function (t, l) { return t + l.qte; }, 0);
    var msg = {
      confirmee: function () { return id + ' confirmée : ' + pluriel(n, 'unité') + ' réservée' + (n > 1 ? 's' : '') + ' dans le stock.'; },
      en_preparation: function () { return 'Préparation de ' + id + ' confiée à ' + D.membre(c.preparateur).nom + '.'; },
      prete: function () { return id + ' est prête à expédier.'; },
      expediee: function () { return id + ' expédiée : ' + pluriel(n, 'unité') + ' sortie' + (n > 1 ? 's' : '') + ' du stock, échéance le ' + D.dateCourte(c.echeance) + '.'; },
      livree: function () { return id + ' livrée chez ' + D.client(s, c.client).nom + '.'; }
    }[vers]();
    A.notifier(msg, 'ok');
    if (res.resultat.avertissement) A.notifier(res.resultat.avertissement, 'info');
    return res;
  };
  A.gestes.statut = function (b) { A.fermerMenus(); A.changerStatut(b.getAttribute('data-id'), b.getAttribute('data-vers')); };
  A.gestes.annuler = function (b) {
    var id = b.getAttribute('data-id'), c = D.commande(S(), id);
    A.ouvrirModale({ titre: 'Annuler ' + id, contenu: function () {
      return '<form novalidate data-formulaire="annuler-ok" data-id="' + e(id) + '"><p>' + (D.RESERVANT[c.statut] ? 'Le stock réservé pour cette commande sera libéré et de nouveau proposé aux autres commandes.' : 'Cette commande n\'a pas encore réservé de stock : rien à libérer.') + '</p><div class="champ"><label for="motif">Motif de l\'annulation</label><select id="motif" name="motif" required autofocus><option value="">Choisissez</option>' + D.MOTIFS_ANNULATION.map(function (m) { return '<option>' + e(m) + '</option>'; }).join('') + '</select></div><p class="champ-erreur" id="annuler-erreur" hidden></p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Garder la commande', classe: 'btn--discret' }) + '<button type="submit" class="btn btn--danger">' + ic('croix') + '<span>Annuler la commande</span></button></div></form>';
    } });
  };
  A.gestes['annuler-ok'] = function (f) {
    var id = f.getAttribute('data-id'), c = D.commande(S(), id), reserve = D.RESERVANT[c.statut];
    var res = A.agir({ type: 'changer_statut', id: id, vers: 'annulee', motif: f.motif.value }, { silencieux: true });
    if (!res.ok) { var p = $('#annuler-erreur'); p.textContent = res.erreur.message; p.hidden = false; f.motif.setAttribute('aria-invalid', 'true'); f.motif.setAttribute('aria-describedby', 'annuler-erreur'); f.motif.focus(); return; }
    A.fermerModale(); A.rendre();
    A.notifier(id + ' annulée' + (reserve ? ' : stock réservé libéré.' : '.'), 'ok');
  };

  /* ══ Fenêtre « Nouvelle commande » (et modification) ═══════════════════════════════════════════════════════════════════════════════ */
  function versJour(isoDate) { return D.jour(isoDate); }
  A.gestes['nouvelle-commande'] = function (b) {
    if (!A.peut('creer_commande')) { A.notifier('Le rôle ' + D.ROLES[A.role].libelle + ' ne crée pas de commande : passez en Direction ou Commercial.', 'info'); return; }
    var cl = b && b.getAttribute && b.getAttribute('data-client');
    A.form = { edition: null, client: cl || '', lignes: [], q: '', livraison: null, canal: 'Téléphone', note: '', erreur: null };
    ouvrirFormulaire('Nouvelle commande');
  };
  A.gestes.modifier = function (b) {
    var c = D.commande(S(), b.getAttribute('data-id'));
    A.form = { edition: c.id, client: c.client, lignes: c.lignes.map(function (l) { return { produit: l.produit, qte: l.qte }; }), q: '', livraison: c.livraisonPrevue, canal: c.canal, note: c.note, erreur: null };
    ouvrirFormulaire('Modifier ' + c.id);
  };
  function ouvrirFormulaire(titre) { A.ouvrirModale({ titre: titre, large: true, contenu: formulaire, onFermer: function () { A.form = null; } }); A.emettre('formulaire', A.form); }
  function habituels(idClient) {
    var t = {};
    S().commandes.forEach(function (c) { if (c.client === idClient) c.lignes.forEach(function (l) { t[l.produit] = (t[l.produit] || 0) + 1; }); });
    return Object.keys(t).sort(function (a, b) { return t[b] - t[a]; }).slice(0, 6);
  }
  function formulaire() {
    var s = S(), f = A.form, cl = f.client ? D.client(s, f.client) : null;
    var prevue = f.livraison != null ? f.livraison : cl ? D.ouvre(s.jour + (D.TRANSIT[cl.ville] || 0) + 3) : D.ouvre(s.jour + 3);
    var h = '<form class="nc" data-formulaire="nc-creer" novalidate><div class="nc-gauche">';
    h += '<div class="champ"><label for="nc-client">Client</label><select id="nc-client" data-choix="nc-client" data-focus="nc-client"' + (f.edition ? ' disabled' : '') + ' autofocus><option value="">Choisissez un client fictif</option>' + TYPES.map(function (t) { return '<optgroup label="' + e(t) + '">' + s.clients.filter(function (c) { return c.type === t; }).map(function (c) { return '<option value="' + c.id + '"' + (c.id === f.client ? ' selected' : '') + '>' + e(c.nom + ' · ' + c.ville) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></div>';
    if (cl) {
      var dc = A.d.clients[cl.id], utilise = dc.encours + dc.engage;
      h += '<div class="nc-client"><div><b>' + e(cl.nom) + '</b><small>' + e(cl.type + ' · ' + cl.ville + ' · ' + cl.contact + ' (fictif)') + '</small></div><dl class="def def--ligne"><dt>Remise</dt><dd>' + cl.remise + ' %</dd><dt>Paiement</dt><dd>' + (cl.delai ? cl.delai + ' jours' : 'comptant') + '</dd><dt>Encours</dt><dd>' + compact(utilise) + ' / ' + compact(cl.plafond * 100) + '</dd></dl><div class="jauge" role="img" aria-label="Encours utilisé : ' + Math.round(utilise / (cl.plafond * 100) * 100) + ' % du plafond"><i style="width:' + Math.min(100, utilise / (cl.plafond * 100) * 100).toFixed(1) + '%" class="' + (utilise > cl.plafond * 100 ? 'jauge--critique' : utilise > cl.plafond * 80 ? 'jauge--attention' : '') + '"></i></div></div>';
    }
    h += '<fieldset class="nc-produits"><legend>Produits</legend><label class="recherche recherche--pleine">' + ic('loupe') + '<span class="visuellement-cache">Rechercher un produit</span><input type="search" id="nc-q" data-saisie="nc-q" data-focus="nc-q" value="' + e(f.q) + '" placeholder="Rechercher un produit ou une référence" autocomplete="off"></label>';
    var t = D.sansAccent(f.q.trim()), dejaLa = f.lignes.map(function (l) { return l.produit; });
    var propositions = t ? s.produits.filter(function (p) { return D.sansAccent(p.nom + ' ' + p.sku + ' ' + p.categorie).indexOf(t) >= 0; }).slice(0, 6) : (cl ? habituels(cl.id).map(function (id) { return D.produit(s, id); }) : s.produits.slice(0, 6));
    h += '<p class="nc-aide">' + (t ? pluriel(propositions.length, 'produit') + ' trouvé' + (propositions.length > 1 ? 's' : '') : cl ? 'Produits habituels de ce client' : 'Produits du catalogue') + '</p><ul class="nc-propositions">' + (propositions.length ? propositions.map(function (p) {
      var d = D.disponible(p), la = dejaLa.indexOf(p.id) >= 0;
      return '<li><span class="cellule-2">' + e(p.nom) + '<small><span class="mono">' + e(p.sku) + '</span> · ' + mad(p.prix) + ' HT · ' + e(p.unite) + '</small></span><span class="dispo dispo--' + D.niveauStock(p) + '">' + Math.max(0, d) + ' dispo.</span>' + A.bouton({ action: 'nc-ajouter', data: { produit: p.id }, texte: la ? 'Ajouté' : 'Ajouter', icone: la ? 'coche' : 'plus', classe: 'btn--petit', refus: la ? 'Produit déjà dans la commande : modifiez sa quantité.' : null, focus: 'nc-aj-' + p.id }) + '</li>';
    }).join('') : '<li class="nc-rien">Aucun produit ne correspond.</li>') + '</ul>';
    h += '<div class="table-defile"><table class="table table--compacte nc-lignes"><caption class="visuellement-cache">Lignes de la commande</caption><thead><tr><th scope="col">Produit</th><th scope="col" class="num">Disponible</th><th scope="col">Quantité</th><th scope="col" class="num">Total HT</th><th scope="col"><span class="visuellement-cache">Retirer</span></th></tr></thead><tbody>';
    if (!f.lignes.length) h += '<tr><td colspan="5" class="nc-rien">Aucun produit pour l\'instant : ajoutez-en depuis la liste ci-dessus.</td></tr>';
    f.lignes.forEach(function (l, i) {
      var p = D.produit(s, l.produit), d = Math.max(0, D.disponible(p) + (f.edition ? 0 : 0)), trop = l.qte > d;
      h += '<tr class="' + (trop ? 'ligne-alerte' : '') + '"><th scope="row"><span class="cellule-2">' + e(p.nom) + '<small>' + e(p.unite) + '</small></span></th><td class="num">' + d + '</td><td><div class="quantite"><button type="button" class="btn btn--icone btn--petit" data-action="nc-moins" data-i="' + i + '" aria-label="Diminuer ' + e(p.nom) + '">' + ic('moins') + '</button><input type="number" inputmode="numeric" min="1" max="9999" step="1" id="nc-qte-' + i + '" data-saisie="nc-qte" data-i="' + i + '" data-focus="nc-qte-' + p.id + '" value="' + l.qte + '" aria-label="Quantité de ' + e(p.nom) + '"' + (trop ? ' aria-invalid="true" aria-describedby="nc-trop-' + i + '"' : '') + '><button type="button" class="btn btn--icone btn--petit" data-action="nc-plus" data-i="' + i + '" aria-label="Augmenter ' + e(p.nom) + '">' + ic('plus') + '</button></div>' + (trop ? '<p class="champ-erreur" id="nc-trop-' + i + '">' + ic('alerte') + 'Seulement ' + d + ' disponible' + (d > 1 ? 's' : '') + '</p>' : '') + '</td><td class="num">' + mad(l.qte * p.prix) + '</td><td>' + A.bouton({ action: 'nc-retirer', data: { i: i }, icone: 'corbeille', classe: 'btn--icone btn--petit', aria: 'Retirer ' + p.nom }) + '</td></tr>';
    });
    h += '</tbody></table></div></fieldset></div><div class="nc-droite">';
    var brouillon = { lignes: f.lignes.map(function (l) { return { qte: l.qte, prix: D.produit(s, l.produit).prix }; }), remise: cl ? cl.remise : 0 }, mt = D.montants(brouillon);
    var manque = f.lignes.filter(function (l) { return l.qte > D.disponible(D.produit(s, l.produit)); }).length;
    h += '<div class="champ"><label for="nc-date">Livraison prévue</label><input type="date" id="nc-date" data-choix="nc-date" data-focus="nc-date" min="' + D.iso(s.jour) + '" max="' + D.iso(s.jour + 90) + '" value="' + D.iso(prevue) + '"></div>';
    h += '<div class="champ"><label for="nc-canal">Reçue par</label><select id="nc-canal" data-choix="nc-canal" data-focus="nc-canal">' + D.CANAUX.map(function (c) { return '<option' + (c === f.canal ? ' selected' : '') + '>' + e(c) + '</option>'; }).join('') + '</select></div>';
    h += '<div class="champ"><label for="nc-note">Note interne <small>(facultative)</small></label><textarea id="nc-note" data-saisie="nc-note" data-focus="nc-note" rows="2" maxlength="200" placeholder="Par exemple : livrer avant 10 h">' + e(f.note) + '</textarea></div>';
    h += '<dl class="totaux totaux--carte" aria-live="polite"><dt>Total brut HT</dt><dd>' + mad(mt.brut) + '</dd>' + (mt.remise ? '<dt>Remise ' + brouillon.remise + ' %</dt><dd>−' + mad(mt.remise) + '</dd>' : '') + '<dt>Total HT</dt><dd>' + mad(mt.ht) + '</dd><dt>TVA ' + D.TVA_PCT + ' %</dt><dd>' + mad(mt.tva) + '</dd><dt class="total">Total TTC</dt><dd class="total" id="nc-ttc">' + mad(mt.ttc) + '</dd></dl>';
    if (cl && mt.ttc && A.d.clients[cl.id].encours + A.d.clients[cl.id].engage + mt.ttc > cl.plafond * 100) h += '<p class="bandeau-info bandeau-info--attention">' + ic('alerte') + '<span>Avec cette commande, ' + e(cl.nom) + ' dépasse son plafond d\'encours. Elle reste possible ; la direction est alertée.</span></p>';
    if (manque) h += '<p class="bandeau-info bandeau-info--attention" id="nc-manque">' + ic('alerte') + '<span>Stock insuffisant sur ' + pluriel(manque, 'ligne') + ' : la commande peut être enregistrée, mais pas confirmée tant que le stock ne suffit pas.</span></p>';
    if (f.erreur) h += '<p class="bandeau-info bandeau-info--critique" role="alert" id="nc-erreur">' + ic('alerte') + '<span>' + e(f.erreur) + '</span></p>';
    var refusConfirmer = !A.peut('confirmer') ? 'Réservé aux rôles : ' + A.rolesPour('confirmer') : manque ? 'Stock insuffisant : ajustez les quantités pour confirmer.' : null;
    h += '<div class="modale-pied modale-pied--colonne">' + (f.edition ? '<button type="submit" class="btn btn--plein btn--grand" data-focus="nc-enregistrer">' + ic('coche') + '<span>Enregistrer les modifications</span></button>' : '<button type="submit" class="btn btn--plein btn--grand" data-confirmer="1" data-focus="nc-creer-confirmer"' + (refusConfirmer ? ' aria-disabled="true" data-refus="' + e(refusConfirmer) + '"' : '') + '>' + ic('stock') + '<span>Créer et réserver le stock</span></button><button type="submit" class="btn btn--grand" data-focus="nc-creer">' + ic('plus') + '<span>Créer sans confirmer</span></button>') + '</div>';
    return h + '</div></form>';
  }
  function reformer() { if (A.modaleActive) A.modaleActive.rendre(); }
  A.gestes['nc-client'] = function (sel) { A.form.client = sel.value; A.form.livraison = null; A.form.erreur = null; reformer(); A.emettre('formulaire', A.form); };
  A.gestes['nc-q'] = function (c) { A.form.q = c.value; reformer(); };
  A.gestes['nc-ajouter'] = function (b) {
    var id = b.getAttribute('data-produit');
    if (!A.form.lignes.some(function (l) { return l.produit === id; })) A.form.lignes.push({ produit: id, qte: 1 });
    A.form.erreur = null; reformer();
    var champ = $('[data-focus="nc-qte-' + id + '"]'); if (champ) { champ.focus(); champ.select(); }
    A.emettre('formulaire', A.form);
  };
  A.gestes['nc-qte'] = function (c) {
    var v = parseInt(c.value, 10), l = A.form.lignes[+c.getAttribute('data-i')];
    if (!l) return;
    if (!isNaN(v) && v >= 1) { l.qte = Math.min(9999, v); reformer(); A.emettre('formulaire', A.form); }
  };
  function pas(b, d) { var l = A.form.lignes[+b.getAttribute('data-i')]; l.qte = Math.max(1, Math.min(9999, l.qte + d)); reformer(); A.emettre('formulaire', A.form); }
  A.gestes['nc-moins'] = function (b) { pas(b, -1); };
  A.gestes['nc-plus'] = function (b) { pas(b, 1); };
  A.gestes['nc-retirer'] = function (b) { A.form.lignes.splice(+b.getAttribute('data-i'), 1); reformer(); var q = $('#nc-q'); if (q) q.focus(); A.emettre('formulaire', A.form); };
  A.gestes['nc-date'] = function (c) { var j = versJour(c.value); if (!isNaN(j)) A.form.livraison = j; reformer(); };
  A.gestes['nc-canal'] = function (c) { A.form.canal = c.value; };
  A.gestes['nc-note'] = function (c) { A.form.note = c.value; };
  A.gestes['nc-creer'] = function (form, ev) {
    var f = A.form, bouton = ev.submitter, confirmer = bouton && bouton.getAttribute('data-confirmer') === '1';
    if (bouton && bouton.getAttribute('aria-disabled') === 'true') { A.notifier(bouton.getAttribute('data-refus'), 'info'); return; }
    if (!f.client) { f.erreur = 'Choisissez un client.'; reformer(); $('#nc-client').focus(); return; }
    if (!f.lignes.length) { f.erreur = 'Ajoutez au moins un produit.'; reformer(); $('#nc-q').focus(); return; }
    var dateSaisie = $('#nc-date').value, jourSaisi = versJour(dateSaisie);
    if (isNaN(jourSaisi)) { f.erreur = 'Indiquez une date de livraison valide.'; reformer(); $('#nc-date').focus(); return; }
    var action = f.edition ? { type: 'modifier_commande', id: f.edition, lignes: f.lignes, livraisonPrevue: jourSaisi } : { type: 'creer_commande', client: f.client, lignes: f.lignes, livraisonPrevue: jourSaisi, canal: f.canal, note: f.note };
    var res = A.agir(action, { silencieux: true });
    if (!res.ok) { f.erreur = res.erreur.message; reformer(); var err = $('#nc-erreur'); if (err) err.focus && err.setAttribute('tabindex', '-1'); return; }
    var id = res.resultat.id, edition = f.edition;
    A.fermerModale();
    if (confirmer) {
      var r2 = A.agir({ type: 'changer_statut', id: id, vers: 'confirmee' }, { silencieux: true });
      if (r2.ok) A.notifier(id + ' créée et confirmée : stock réservé.', 'ok'); else A.notifier(id + ' créée, mais non confirmée : ' + r2.erreur.message, 'erreur');
      if (r2.ok && r2.resultat.avertissement) A.notifier(r2.resultat.avertissement, 'info');
    } else A.notifier(edition ? id + ' modifiée.' : id + ' créée. Confirmez-la pour réserver le stock.', 'ok');
    A.aller('#/commandes/' + id);
  };

  /* ══ C. Clients ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  A.ecrans.clients = function () {
    var s = S(), u = A.ui.clients, q = D.sansAccent(u.q.trim()), dc = A.d.clients;
    var liste = s.clients.filter(function (c) { return (!q || D.sansAccent(c.nom + ' ' + c.ville + ' ' + c.contact).indexOf(q) >= 0) && (!u.type || c.type === u.type) && (!u.segment || dc[c.id].segment === u.segment) && (!u.echu || dc[c.id].echu > 0) && (!u.plafond || dc[c.id].encours + dc[c.id].engage > c.plafond * 100); });
    var val = { nom: function (c) { return D.sansAccent(c.nom); }, ca90: function (c) { return dc[c.id].ca90; }, encours: function (c) { return dc[c.id].encours; }, derniere: function (c) { return dc[c.id].derniere || 0; }, nb: function (c) { return dc[c.id].nb; } }[u.tri];
    liste.sort(function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (u.sens === 'asc' ? 1 : -1); });
    var argent = A.role !== 'magasinier';
    var html = tete('Clients', pluriel(s.clients.length, 'client') + ' fictif' + (s.clients.length > 1 ? 's' : '') + ' · segments A, B, C sur le chiffre d\'affaires des 90 derniers jours', boutonExport('clients'));
    html += '<div class="barre-filtres">' + recherche('cl-q', 'cl-q', u.q, 'Nom, ville ou contact') + select('cl-type', 'cl-filtre', [['', 'Tous les types']].concat(TYPES.map(function (t) { return [t, t]; })), u.type, 'Type de client') + select('cl-segment', 'cl-filtre', [['', 'Tous les segments'], ['A', 'Segment A'], ['B', 'Segment B'], ['C', 'Segment C']], u.segment, 'Segment') + (argent ? '<label class="bascule"><input type="checkbox" id="cl-echu" data-choix="cl-filtre" data-focus="cl-echu"' + (u.echu ? ' checked' : '') + '><span>Avec échéances dépassées</span></label><label class="bascule"><input type="checkbox" id="cl-plafond" data-choix="cl-filtre" data-focus="cl-plafond"' + (u.plafond ? ' checked' : '') + '><span>Plafond dépassé</span></label>' : '') + '</div>';
    html += '<section class="carte carte--table table-zone" aria-label="Liste des clients">';
    if (!liste.length) html += A.vide('Aucun client ne correspond', 'Modifiez la recherche ou les filtres.', '<button type="button" class="btn" data-action="cl-effacer">Effacer les filtres</button>');
    else {
      html += '<div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Clients, ' + pluriel(liste.length, 'résultat') + '</caption><thead><tr>' + A.tri('clients', 'nom', 'Client') + '<th scope="col">Segment</th>' + (argent ? A.tri('clients', 'ca90', 'CA HT 90 j', 'num') + A.tri('clients', 'encours', 'Encours TTC', 'num') : '') + A.tri('clients', 'nb', 'Commandes', 'num') + A.tri('clients', 'derniere', 'Dernière activité') + '</tr></thead><tbody>';
      liste.forEach(function (c) {
        var x = dc[c.id];
        html += '<tr><td data-l="Client"><span class="cellule-2">' + A.lienClient(c) + '<small>' + e(c.type + ' · ' + c.ville) + '</small></span></td><td data-l="Segment"><span class="segment segment--' + x.segment + '">' + x.segment + '</span></td>' + (argent ? '<td data-l="CA HT 90 j" class="num">' + compact(x.ca90) + '</td><td data-l="Encours TTC" class="num">' + compact(x.encours) + (x.echu ? '<small class="texte-critique">' + compact(x.echu) + ' échus</small>' : '') + '</td>' : '') + '<td data-l="Commandes" class="num">' + x.nb + '</td><td data-l="Dernière activité">' + e(x.derniere ? D.relatif(x.derniere, s.jour) : '—') + '</td></tr>';
      });
      html += '</tbody></table></div><p class="pagination-info">' + pluriel(liste.length, 'client') + '</p>';
    }
    return html + '</section>';
  };
  A.gestes['cl-q'] = function (c) { A.ui.clients.q = c.value; A.rendre(); };
  A.gestes['cl-filtre'] = function () { var u = A.ui.clients; u.type = $('#cl-type').value; u.segment = $('#cl-segment').value; u.echu = $('#cl-echu') ? $('#cl-echu').checked : false; u.plafond = $('#cl-plafond') ? $('#cl-plafond').checked : false; A.rendre(); };
  A.gestes['cl-effacer'] = function () { A.ui.clients.q = ''; A.ui.clients.type = ''; A.ui.clients.segment = ''; A.ui.clients.echu = false; A.ui.clients.plafond = false; A.rendre(); };
  A.tiroirs.clients = function (id) {
    var s = S(), c = D.client(s, id); if (!c) return null;
    var x = A.d.clients[c.id], argent = A.role !== 'magasinier', cmds = x.commandes.slice().sort(function (a, b) { return b.jour - a.jour || (b.id > a.id ? 1 : -1); });
    var actives = cmds.filter(function (k) { return k.statut !== 'annulee'; }), panier = actives.length ? Math.round(actives.reduce(function (t, k) { return t + A.d.montants[k.id].ht; }, 0) / actives.length) : 0;
    var utilise = x.encours + x.engage, plafond = c.plafond * 100;
    var h = '<div class="tiroir-tete"><div><p class="surtitre">Client fictif · ' + e(c.type) + ' · ' + e(c.ville) + '</p><h2 id="tiroir-titre">' + e(c.nom) + '</h2><div class="tiroir-badges"><span class="segment segment--' + x.segment + '">Segment ' + x.segment + '</span>' + (x.echu ? '<span class="pastille pastille--critique">' + ic('alerte') + compact(x.echu) + ' échus</span>' : '') + (x.encours + x.engage > c.plafond * 100 ? '<span class="pastille pastille--attention">' + ic('alerte') + 'Plafond dépassé</span>' : '') + '</div></div><a class="btn btn--icone" href="#/clients" aria-label="Fermer la fiche">' + ic('croix') + '</a></div><div class="tiroir-corps">';
    if (A.peut('creer_commande')) h += '<div class="tiroir-actions">' + A.bouton({ action: 'nouvelle-commande', data: { client: c.id }, texte: 'Nouvelle commande pour ce client', icone: 'plus', classe: 'btn--plein' }) + '</div>';
    if (argent) h += '<div class="mini-kpis"><div><span>CA HT 90 j</span><b>' + compact(x.ca90) + '</b></div><div><span>Commandes</span><b>' + x.nb + '</b></div><div><span>Panier moyen HT</span><b>' + compact(panier) + '</b></div><div><span>Encours TTC</span><b>' + compact(x.encours) + '</b></div></div>' +
      '<section class="bloc"><h3>Encours et plafond</h3><div class="jauge jauge--grande" role="img" aria-label="Encours et commandes confirmées : ' + Math.round(utilise / plafond * 100) + ' % du plafond"><i style="width:' + Math.min(100, utilise / plafond * 100).toFixed(1) + '%" class="' + (utilise > plafond ? 'jauge--critique' : utilise > plafond * 0.8 ? 'jauge--attention' : '') + '"></i></div><p class="jauge-legende">' + compact(x.encours) + ' facturés non payés + ' + compact(x.engage) + ' confirmés non expédiés, sur un plafond de ' + compact(plafond) + '</p></section>';
    h += '<section class="bloc"><h3>Conditions commerciales</h3><dl class="def"><dt>Contact</dt><dd>' + e(c.contact) + ' <small>(fictif)</small></dd><dt>Commercial</dt><dd>' + e(D.membre(c.commercial).nom) + '</dd>' + (argent ? '<dt>Remise</dt><dd>' + c.remise + ' % sur le prix catalogue</dd><dt>Paiement</dt><dd>' + (c.delai ? c.delai + ' jours après expédition' : 'comptant à la livraison') + '</dd><dt>Plafond d\'encours</dt><dd>' + mad(plafond, true) + '</dd>' : '') + '<dt>Livraison</dt><dd>' + (D.TRANSIT[c.ville] ? 'J+' + (D.TRANSIT[c.ville] + 3) + ' (hors Casablanca)' : 'J+3, tournée de Casablanca') + '</dd><dt>Client depuis</dt><dd>' + e(D.dateCourte(c.depuis)) + '</dd><dt>Dernière activité</dt><dd>' + e(x.derniere ? D.relatif(x.derniere, s.jour) : '—') + '</dd></dl></section>';
    h += '<section class="bloc"><h3>Historique des commandes <small>' + cmds.length + '</small></h3><ul class="liste-cmd">' + cmds.slice(0, 12).map(function (k) { return '<li>' + A.lienCommande(k) + '<span>' + e(D.dateCourte(k.jour)) + '</span>' + (argent ? '<span class="num">' + compact(A.d.montants[k.id].ttc) + '</span>' : '') + A.badge(k.statut) + '</li>'; }).join('') + '</ul>' + (cmds.length > 12 ? '<button type="button" class="lien-bouton" data-action="cmd-client" data-client="' + c.id + '">Voir les ' + cmds.length + ' commandes</button>' : '') + '</section>';
    if (argent) {
      var pai = s.paiements.filter(function (p) { return p.client === c.id; }).slice(-5).reverse(), rel = s.relances.filter(function (r) { return r.client === c.id; }).slice(-3).reverse();
      h += '<section class="bloc"><h3>Derniers paiements et relances</h3>' + (pai.length || rel.length ? '<ul class="mini-liste">' + pai.map(function (p) { return '<li>' + ic('paiement') + e(D.dateCourte(p.jour) + ' · ' + p.commande + ' · ' + p.mode + ' · ' + mad(p.montant)) + '</li>'; }).concat(rel.map(function (r) { return '<li>' + ic('cloche') + e(D.dateCourte(r.jour) + ' · relance n° ' + r.niveau + ' · ' + r.commande + ' (simulée)') + '</li>'; })).join('') + '</ul>' : '<p class="discret">Aucun paiement enregistré.</p>') + '</section>';
    }
    return h + '</div>';
  };
  A.gestes['cmd-client'] = function (b) { A.gestes['cmd-effacer'] && Object.assign(A.ui.commandes, { q: '', statut: '', type: '', ville: '', paiement: '', periode: 0, retard: false, page: 1 }); A.ui.commandes.client = b.getAttribute('data-client'); A.aller('#/commandes'); };

  /* ══ D. Stocks ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  function produitsFiltres() {
    var u = A.ui.stocks, q = D.sansAccent(u.q.trim());
    return S().produits.filter(function (p) { var n = D.niveauStock(p); return (!q || D.sansAccent(p.nom + ' ' + p.sku).indexOf(q) >= 0) && (!u.categorie || p.categorie === u.categorie) && (!u.etat || (u.etat === 'alerte' ? n !== 'ok' : n === u.etat)); });
  }
  var TYPE_MV = { entree: ['Entrée', 'ok'], sortie: ['Sortie', 'info'], reservation: ['Réservation', 'neutre'], liberation: ['Libération', 'neutre'], ajustement: ['Inventaire', 'attention'] };
  function origine(m) { return m.origine.type === 'commande' ? '<a class="ref" href="#/commandes/' + e(m.origine.ref) + '">' + e(m.origine.ref) + '</a>' : '<span class="mono">' + e(m.origine.ref) + '</span> <small>' + (m.origine.type === 'reception' ? 'réception' : 'inventaire') + '</small>'; }
  A.ecrans.stocks = function () {
    var s = S(), u = A.ui.stocks, k = A.k;
    var html = tete('Stocks', s.produits.length + ' références · ' + pluriel(k.alertes, 'alerte') + ' dont ' + pluriel(k.ruptures, 'rupture'), boutonExport(u.onglet === 'mouvements' ? 'mouvements' : 'stock') + (A.peut('reception') ? A.bouton({ action: 'reception', texte: 'Réceptionner', icone: 'entree', classe: 'btn--plein' }) : ''));
    html += '<div class="onglets" role="tablist" aria-label="Vues du stock">' + [['catalogue', 'Catalogue'], ['mouvements', 'Mouvements'], ['reappro', 'Réapprovisionnement']].map(function (o) { return '<button type="button" role="tab" id="onglet-' + o[0] + '" aria-selected="' + (u.onglet === o[0]) + '" aria-controls="panneau-stock" data-action="stock-onglet" data-onglet="' + o[0] + '" data-focus="onglet-' + o[0] + '"' + (u.onglet === o[0] ? '' : ' tabindex="-1"') + '>' + e(o[1]) + '</button>'; }).join('') + '</div><div id="panneau-stock" role="tabpanel" aria-labelledby="onglet-' + u.onglet + '">';
    if (u.onglet === 'catalogue') {
      var liste = produitsFiltres();
      html += '<div class="barre-filtres">' + recherche('st-q', 'st-q', u.q, 'Produit ou référence') + select('st-cat', 'st-filtre', [['', 'Toutes les catégories']].concat(categories().map(function (c) { return [c, c]; })), u.categorie, 'Catégorie') + select('st-etat', 'st-filtre', [['', 'Tous les états'], ['alerte', 'Sous le seuil'], ['rupture', 'En rupture'], ['bas', 'Stock bas'], ['ok', 'Disponible']], u.etat, 'État du stock') + '</div>';
      html += '<section class="carte carte--table table-zone" aria-label="Catalogue">';
      if (!liste.length) html += A.vide('Aucun produit ne correspond', 'Modifiez la recherche ou les filtres.', '<button type="button" class="btn" data-action="st-effacer">Effacer les filtres</button>');
      else html += '<div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Catalogue, ' + pluriel(liste.length, 'produit') + '</caption><thead><tr><th scope="col">Produit</th><th scope="col">Catégorie</th><th scope="col" class="num">Stock</th><th scope="col" class="num">Réservé</th><th scope="col" class="num">Disponible</th><th scope="col" class="num">Seuil</th><th scope="col">État</th></tr></thead><tbody>' + liste.map(function (p) {
        var d = D.disponible(p);
        return '<tr><td data-l="Produit"><span class="cellule-2">' + A.lienProduit(p) + '<small class="mono">' + e(p.sku) + ' · ' + e(p.emplacement) + '</small></span></td><td data-l="Catégorie">' + e(p.categorie) + '</td><td data-l="Stock" class="num">' + p.stock + '</td><td data-l="Réservé" class="num">' + (p.reserve || '<span class="discret">0</span>') + '</td><td data-l="Disponible" class="num"><span class="niveau"><b>' + Math.max(0, d) + '</b><span class="niveau-piste" aria-hidden="true"><i class="niveau--' + D.niveauStock(p) + '" style="width:' + Math.max(0, Math.min(100, d / p.cible * 100)).toFixed(0) + '%"></i><em style="left:' + Math.min(100, p.seuil / p.cible * 100).toFixed(0) + '%"></em></span></span></td><td data-l="Seuil" class="num">' + p.seuil + '</td><td data-l="État">' + A.badgeStock(p) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="pagination-info">' + pluriel(liste.length, 'produit') + ' · disponible = stock − réservé · le trait marque le seuil</p>';
      html += '</section>';
    } else if (u.onglet === 'mouvements') {
      var mv = s.mouvements.slice().reverse(), parPage = 25;
      if (u.type) mv = mv.filter(function (m) { return m.type === u.type; });
      html += '<div class="barre-filtres">' + select('mv-type', 'mv-filtre', [['', 'Tous les mouvements']].concat(Object.keys(TYPE_MV).map(function (t) { return [t, TYPE_MV[t][0]]; })), u.type || '', 'Type de mouvement') + '<p class="discret">Chaque mouvement a une origine : une commande, une réception fournisseur ou un inventaire.</p></div>';
      html += '<section class="carte carte--table table-zone" aria-label="Mouvements de stock"><div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Mouvements de stock</caption><thead><tr><th scope="col">Date</th><th scope="col">Produit</th><th scope="col">Type</th><th scope="col" class="num">Quantité</th><th scope="col">Origine</th><th scope="col" class="num">Stock après</th><th scope="col" class="num">Réservé après</th><th scope="col">Par</th></tr></thead><tbody>' + mv.slice((u.page - 1) * parPage, u.page * parPage).map(function (m) {
        var p = D.produit(s, m.produit), t = TYPE_MV[m.type], signe = m.type === 'sortie' ? '−' : m.type === 'entree' ? '+' : m.type === 'ajustement' ? (m.qte > 0 ? '+' : '−') : '';
        return '<tr><td data-l="Date">' + e(quand(m.jour, m.h)) + '</td><td data-l="Produit">' + A.lienProduit(p) + '</td><td data-l="Type"><span class="pastille pastille--' + t[1] + '">' + e(t[0]) + '</span></td><td data-l="Quantité" class="num">' + signe + Math.abs(m.qte) + '</td><td data-l="Origine">' + origine(m) + '</td><td data-l="Stock après" class="num">' + m.stock + '</td><td data-l="Réservé après" class="num">' + m.reserve + '</td><td data-l="Par">' + e(m.par) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + A.pagination('stocks', mv.length, parPage) + '</section>';
    } else {
      var sug = s.produits.filter(function (p) { return D.disponible(p) < p.seuil * 1.6; }).map(function (p) { return { p: p, qte: Math.ceil((p.cible - D.disponible(p)) / 10) * 10 }; });
      var coches = u.coches || (u.coches = {});
      html += '<section class="carte" aria-labelledby="t-reappro"><header class="carte-tete"><div><h2 id="t-reappro">Suggestions de réapprovisionnement</h2><p class="carte-sous">Produits sous 1,6 fois leur seuil · quantité suggérée = niveau cible − disponible, arrondie à la dizaine</p></div></header>';
      if (!sug.length) html += A.vide('Aucun réapprovisionnement à prévoir', 'Tous les produits sont au-dessus de leur seuil.');
      else {
        html += '<form data-formulaire="reappro-ok"><div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Suggestions</caption><thead><tr><th scope="col"><span class="visuellement-cache">Choisir</span></th><th scope="col">Produit</th><th scope="col">Fournisseur</th><th scope="col" class="num">Disponible</th><th scope="col" class="num">Seuil</th><th scope="col" class="num">Cible</th><th scope="col">Quantité à recevoir</th></tr></thead><tbody>' + sug.map(function (x) {
          var p = x.p, coche = coches[p.id] !== false;
          return '<tr><td><input type="checkbox" name="choix" value="' + p.id + '" id="re-' + p.id + '"' + (coche ? ' checked' : '') + ' data-choix="re-coche" data-focus="re-' + p.id + '" aria-label="Recevoir ' + e(p.nom) + '"></td><td data-l="Produit"><label for="re-' + p.id + '" class="cellule-2">' + e(p.nom) + '<small class="mono">' + e(p.sku) + '</small></label></td><td data-l="Fournisseur">' + e(p.fournisseur) + ' <small>(fictif)</small></td><td data-l="Disponible" class="num">' + Math.max(0, D.disponible(p)) + '</td><td data-l="Seuil" class="num">' + p.seuil + '</td><td data-l="Cible" class="num">' + p.cible + '</td><td data-l="Quantité"><input class="champ-court" type="number" min="1" max="9999" name="qte-' + p.id + '" value="' + x.qte + '" aria-label="Quantité de ' + e(p.nom) + '" data-focus="re-q-' + p.id + '"></td></tr>';
        }).join('') + '</tbody></table></div><div class="carte-pied"><p class="discret">La réception est simulée : aucun bon de commande n\'est envoyé à un fournisseur.</p>' + (A.peut('reception') ? '<button type="submit" class="btn btn--plein">' + ic('entree') + '<span>Réceptionner la sélection</span></button>' : '<button type="button" class="btn" aria-disabled="true" data-refus="Réservé aux rôles : ' + e(A.rolesPour('reception')) + '">Réceptionner la sélection</button>') + '</div></form>';
      }
      html += '</section>';
    }
    return html + '</div>';
  };
  A.gestes['stock-onglet'] = function (b) { A.ui.stocks.onglet = b.getAttribute('data-onglet'); A.ui.stocks.page = 1; A.rendre(); $('[data-focus="onglet-' + A.ui.stocks.onglet + '"]').focus(); };
  A.gestes['st-q'] = function (c) { A.ui.stocks.q = c.value; A.rendre(); };
  A.gestes['st-filtre'] = function () { A.ui.stocks.categorie = $('#st-cat').value; A.ui.stocks.etat = $('#st-etat').value; A.rendre(); };
  A.gestes['st-effacer'] = function () { A.ui.stocks.q = ''; A.ui.stocks.categorie = ''; A.ui.stocks.etat = ''; A.rendre(); };
  A.gestes['mv-filtre'] = function (c) { A.ui.stocks.type = c.value; A.ui.stocks.page = 1; A.rendre(); };
  A.gestes['re-coche'] = function (c) { A.ui.stocks.coches[c.value] = c.checked; };
  A.gestes['reappro-ok'] = function (f) {
    var lignes = $$('input[name="choix"]:checked', f).map(function (c) { return { produit: c.value, qte: parseInt(f.elements['qte-' + c.value].value, 10) }; });
    if (!lignes.length) { A.notifier('Cochez au moins un produit à recevoir.', 'info'); return; }
    var res = A.agir({ type: 'receptionner', lignes: lignes });
    if (res.ok) { A.ui.stocks.coches = {}; A.notifier('Réception ' + res.resultat.id + ' enregistrée : ' + pluriel(lignes.length, 'produit') + ' en stock.', 'ok'); }
    else A.notifier(res.erreur.message, 'erreur');
  };
  A.tiroirs.stocks = function (id) {
    var s = S(), p = D.produit(s, id); if (!p) return null;
    var d = D.disponible(p), reservent = s.commandes.filter(function (c) { return D.RESERVANT[c.statut] && c.lignes.some(function (l) { return l.produit === p.id; }); });
    var bloquees = s.commandes.filter(function (c) { return c.statut === 'nouvelle' && c.lignes.some(function (l) { return l.produit === p.id && l.qte > d; }); });
    var mv = s.mouvements.filter(function (m) { return m.produit === p.id; }).slice(-12).reverse();
    var h = '<div class="tiroir-tete"><div><p class="surtitre mono">' + e(p.sku) + ' · ' + e(p.categorie) + ' · emplacement ' + e(p.emplacement) + '</p><h2 id="tiroir-titre">' + e(p.nom) + '</h2><div class="tiroir-badges">' + A.badgeStock(p) + '<span class="pastille pastille--neutre">' + e(p.unite) + '</span></div></div><a class="btn btn--icone" href="#/stocks" aria-label="Fermer la fiche">' + ic('croix') + '</a></div><div class="tiroir-corps">';
    h += '<div class="tiroir-actions">' + A.bouton({ action: 'reception', data: { produit: p.id }, texte: 'Réceptionner', icone: 'entree', classe: 'btn--plein', refus: A.peut('reception') ? null : 'Réservé aux rôles : ' + A.rolesPour('reception') }) + A.bouton({ action: 'ajustement', data: { produit: p.id }, texte: 'Corriger après inventaire', icone: 'crayon', refus: A.peut('ajustement') ? null : 'Réservé aux rôles : ' + A.rolesPour('ajustement') }) + '</div>';
    h += '<div class="mini-kpis"><div><span>Stock physique</span><b>' + p.stock + '</b></div><div><span>Réservé</span><b>' + p.reserve + '</b></div><div><span>Disponible</span><b class="' + (d <= 0 ? 'texte-critique' : '') + '">' + Math.max(0, d) + '</b></div><div><span>Seuil · cible</span><b>' + p.seuil + ' · ' + p.cible + '</b></div></div>';
    if (bloquees.length) h += '<div class="bandeau-info bandeau-info--attention">' + ic('alerte') + '<span>' + pluriel(bloquees.length, 'commande') + ' en attente faute de stock : ' + bloquees.map(function (c) { return '<a href="#/commandes/' + c.id + '">' + c.id + '</a>'; }).join(', ') + '.</span></div>';
    h += '<section class="bloc"><h3>Réservé pour <small>' + reservent.length + '</small></h3>' + (reservent.length ? '<ul class="liste-cmd">' + reservent.map(function (c) { var l = c.lignes.find(function (x) { return x.produit === p.id; }); return '<li>' + A.lienCommande(c) + '<span>' + e(D.client(s, c.client).nom) + '</span><span class="num">' + l.qte + '</span>' + A.badge(c.statut) + '</li>'; }).join('') + '</ul>' : '<p class="discret">Aucune réservation en cours.</p>') + '</section>';
    h += '<section class="bloc"><h3>Derniers mouvements</h3><ul class="liste-mv">' + mv.map(function (m) { var t = TYPE_MV[m.type]; return '<li><span class="pastille pastille--' + t[1] + '">' + e(t[0]) + '</span><span class="num">' + (m.type === 'sortie' ? '−' : m.type === 'entree' ? '+' : m.type === 'ajustement' && m.qte > 0 ? '+' : m.type === 'ajustement' ? '−' : '') + Math.abs(m.qte) + '</span><span>' + origine(m) + '</span><small>' + e(quand(m.jour, m.h)) + '</small></li>'; }).join('') + '</ul></section>';
    h += '<section class="bloc"><h3>Fiche</h3><dl class="def"><dt>Prix de vente HT</dt><dd>' + mad(p.prix) + ' / ' + e(p.unite) + '</dd><dt>Fournisseur</dt><dd>' + e(p.fournisseur) + ' <small>(fictif)</small></dd><dt>Emplacement</dt><dd class="mono">' + e(p.emplacement) + '</dd></dl></section>';
    return h + '</div>';
  };
  A.gestes.reception = function (b) {
    var pre = b && b.getAttribute && b.getAttribute('data-produit');
    A.ouvrirModale({ titre: 'Réception fournisseur', contenu: function () {
      return '<form novalidate data-formulaire="reception-ok"><p>Enregistrez les quantités reçues : le stock physique et le disponible augmentent, avec un mouvement d\'entrée rattaché au bon de réception.</p><div class="champ"><label for="rc-produit">Produit</label><select id="rc-produit" name="produit" required' + (pre ? '' : ' autofocus') + '>' + S().produits.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pre ? ' selected' : '') + '>' + e(p.nom + ' · ' + p.sku + ' · dispo. ' + Math.max(0, D.disponible(p))) + '</option>'; }).join('') + '</select></div><div class="champ"><label for="rc-qte">Quantité reçue</label><input id="rc-qte" name="qte" type="number" inputmode="numeric" min="1" max="9999" step="1" required value="20"' + (pre ? ' autofocus' : '') + '></div><p class="champ-erreur" id="rc-erreur" hidden></p><p class="discret">Réception simulée : aucun fournisseur réel.</p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Annuler', classe: 'btn--discret' }) + '<button type="submit" class="btn btn--plein">' + ic('entree') + '<span>Enregistrer la réception</span></button></div></form>';
    } });
  };
  A.gestes['reception-ok'] = function (f) {
    var res = A.agir({ type: 'receptionner', lignes: [{ produit: f.produit.value, qte: parseInt(f.qte.value, 10) }] }, { silencieux: true });
    if (!res.ok) { var p = $('#rc-erreur'); p.textContent = res.erreur.message; p.hidden = false; f.qte.setAttribute('aria-invalid', 'true'); f.qte.setAttribute('aria-describedby', 'rc-erreur'); f.qte.focus(); return; }
    A.fermerModale(); A.rendre(); A.notifier('Réception ' + res.resultat.id + ' : +' + f.qte.value + ' ' + D.produit(S(), f.produit.value).nom + '.', 'ok');
  };
  A.gestes.ajustement = function (b) {
    var p = D.produit(S(), b.getAttribute('data-produit'));
    A.ouvrirModale({ titre: 'Corriger le stock de ' + p.nom, contenu: function () {
      return '<form novalidate data-formulaire="ajustement-ok" data-produit="' + p.id + '"><p>Stock enregistré : <b>' + p.stock + '</b>, dont <b>' + p.reserve + '</b> réservés. Le stock compté ne peut pas descendre sous les quantités réservées.</p><div class="champ"><label for="aj-compte">Quantité comptée</label><input id="aj-compte" name="compte" type="number" inputmode="numeric" min="0" max="99999" step="1" required value="' + p.stock + '" autofocus></div><div class="champ"><label for="aj-motif">Motif</label><select id="aj-motif" name="motif" required><option value="">Choisissez</option><option>Inventaire tournant</option><option>Casse constatée</option><option>Erreur de réception</option><option>Produit périmé</option></select></div><p class="champ-erreur" id="aj-erreur" hidden></p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Annuler', classe: 'btn--discret' }) + '<button type="submit" class="btn btn--plein">' + ic('coche') + '<span>Enregistrer l\'écart</span></button></div></form>';
    } });
  };
  A.gestes['ajustement-ok'] = function (f) {
    var res = A.agir({ type: 'ajuster_stock', produit: f.getAttribute('data-produit'), compte: f.compte.value === '' ? NaN : Number(f.compte.value), motif: f.motif.value }, { silencieux: true });
    if (!res.ok) { var p = $('#aj-erreur'); p.textContent = res.erreur.message; p.hidden = false; var champ = res.erreur.code === 'motif' ? f.motif : f.compte; champ.setAttribute('aria-invalid', 'true'); champ.setAttribute('aria-describedby', 'aj-erreur'); champ.focus(); return; }
    A.fermerModale(); A.rendre(); A.notifier('Inventaire ' + res.resultat.id + ' : écart de ' + (res.resultat.ecart > 0 ? '+' : '') + res.resultat.ecart + ' enregistré.', 'ok');
  };

  /* ══ E. Préparation et livraison ════════════════════════════════════════════════════════════════════════════════════════════════════ */
  A.ecrans.preparation = function (r) {
    var s = S(), u = A.ui.preparation;
    if (r.params && r.params.get && r.params.get('onglet')) u.onglet = r.params.get('onglet');
    var k = A.k;
    var html = tete('Préparation et livraison', pluriel(k.aPreparer, 'commande') + ' à préparer · ' + pluriel(k.prets, 'commande') + ' prête' + (k.prets > 1 ? 's' : '') + ' à expédier · ' + pluriel(k.livraisonsJour, 'livraison') + ' prévue' + (k.livraisonsJour > 1 ? 's' : '') + ' aujourd\'hui', u.onglet === 'liste' ? A.bouton({ action: 'imprimer', texte: 'Imprimer la liste', icone: 'imprimer' }) : '');
    var alertes = [];
    if (k.enRetard) alertes.push('<li class="prio prio--critique">' + ic('alerte') + '<div><a href="#/commandes?retard=1">' + pluriel(k.enRetard, 'commande') + ' en retard de livraison</a><p>Date de livraison prévue dépassée</p></div></li>');
    var pretesAnciennes = s.commandes.filter(function (c) { return c.statut === 'prete' && c.historique[c.historique.length - 1].jour < s.jour; });
    if (pretesAnciennes.length) alertes.push('<li class="prio prio--serieux">' + ic('horloge') + '<div><b>' + pluriel(pretesAnciennes.length, 'commande') + ' prête' + (pretesAnciennes.length > 1 ? 's' : '') + ' depuis hier ou plus</b><p>' + pretesAnciennes.map(function (c) { return c.id; }).join(', ') + '</p></div></li>');
    if (k.bloquees) alertes.push('<li class="prio prio--attention">' + ic('stock') + '<div><a href="#/stocks?etat=alerte">' + pluriel(k.bloquees, 'nouvelle commande') + ' bloquée' + (k.bloquees > 1 ? 's' : '') + ' par le stock</a><p>À débloquer par une réception</p></div></li>');
    if (alertes.length) html += '<ul class="priorites priorites--ligne" aria-label="Alertes">' + alertes.join('') + '</ul>';
    html += '<div class="onglets" role="tablist" aria-label="Vues de la préparation">' + [['kanban', 'Tableau de suivi'], ['liste', 'Liste de préparation']].map(function (o) { return '<button type="button" role="tab" id="onglet-p-' + o[0] + '" aria-selected="' + (u.onglet === o[0]) + '" aria-controls="panneau-prep" data-action="prep-onglet" data-onglet="' + o[0] + '" data-focus="onglet-p-' + o[0] + '"' + (u.onglet === o[0] ? '' : ' tabindex="-1"') + '>' + e(o[1]) + '</button>'; }).join('') + '</div><div id="panneau-prep" role="tabpanel" aria-labelledby="onglet-p-' + u.onglet + '">';
    if (u.onglet === 'kanban') {
      html += '<p class="discret kanban-aide">Faites avancer une commande avec son bouton, ou glissez sa carte dans la colonne suivante. Seule l\'étape suivante est permise.</p><div class="kanban">';
      D.FLUX.forEach(function (st) {
        var cartes = s.commandes.filter(function (c) { return c.statut === st && (st !== 'livree' || c.livreeLe >= s.jour - 2); }).sort(function (a, b) { return a.livraisonPrevue - b.livraisonPrevue || (a.id < b.id ? -1 : 1); });
        html += '<section class="colonne" data-colonne="' + st + '" aria-labelledby="col-' + st + '"><header><h2 id="col-' + st + '"><i class="pastille-couleur statut-fond--' + st + '"></i>' + e(D.LIBELLE_STATUT[st]) + (st === 'livree' ? ' <small>3 derniers jours</small>' : '') + '</h2><b>' + cartes.length + '</b></header><ul>';
        if (!cartes.length) html += '<li class="colonne-vide">Aucune commande</li>';
        cartes.forEach(function (c) {
          var cl = D.client(s, c.client), m = c.statut === 'nouvelle' && D.manquants(s, c.lignes).length, suiv = D.TRANSITIONS[c.statut].filter(function (v) { return v !== 'annulee'; })[0];
          var resp = c.livreur && (c.statut === 'expediee' || c.statut === 'livree') ? D.membre(c.livreur).nom : c.preparateur ? D.membre(c.preparateur).nom : D.membre(c.commercial).nom;
          html += '<li class="fiche' + (c.session ? ' fiche--session' : '') + '" data-carte="' + c.id + '"' + (suiv && A.peut(D.droitPour(suiv)) ? ' draggable="true"' : '') + '><div class="fiche-haut">' + A.lienCommande(c) + (D.enRetard(c, s.jour) ? '<span class="pastille pastille--critique">' + ic('horloge') + 'Retard</span>' : '') + (m ? '<span class="pastille pastille--attention">' + ic('alerte') + 'Stock</span>' : '') + '</div><p class="fiche-client">' + e(cl.nom) + '</p><p class="fiche-meta">' + e(cl.ville) + ' · ' + pluriel(c.lignes.length, 'article') + ' · ' + (c.statut === 'livree' ? 'livrée ' + e(D.relatif(c.livreeLe, s.jour)) : 'livraison ' + e(D.relatif(c.livraisonPrevue, s.jour))) + '</p><p class="fiche-resp">' + ic('personne') + e(resp) + '</p>' + (suiv ? '<div class="fiche-action">' + A.actionsCommande(c, true) + '</div>' : '') + '</li>';
        });
        html += '</ul></section>';
      });
      html += '</div>';
    } else {
      var aPrep = s.commandes.filter(function (c) { return c.statut === 'confirmee' || c.statut === 'en_preparation'; }).sort(function (a, b) { return a.livraisonPrevue - b.livraisonPrevue; });
      var coches = u.coches || (u.coches = {});
      if (!aPrep.length) html += A.vide('Rien à préparer', 'Les commandes confirmées apparaîtront ici avec leurs emplacements.');
      else {
        var total = {};
        aPrep.forEach(function (c) { c.lignes.forEach(function (l) { total[l.produit] = (total[l.produit] || 0) + l.qte; }); });
        html += '<div class="grille-prep"><div class="prep-commandes">';
        aPrep.forEach(function (c) {
          var cl = D.client(s, c.client), faites = c.lignes.filter(function (l) { return coches[c.id + l.produit]; }).length;
          html += '<section class="carte prep" aria-labelledby="prep-' + c.id + '"><header class="carte-tete"><div><h2 id="prep-' + c.id + '" class="mono">' + e(c.id) + '</h2><p class="carte-sous">' + e(cl.nom + ' · ' + cl.ville + ' · livraison ' + D.relatif(c.livraisonPrevue, s.jour)) + '</p></div>' + A.badge(c.statut) + '</header><ul class="prelevement">' + c.lignes.slice().sort(function (a, b) { return D.produit(s, a.produit).emplacement < D.produit(s, b.produit).emplacement ? -1 : 1; }).map(function (l) { var p = D.produit(s, l.produit), id = 'pr-' + c.id + '-' + p.id; return '<li><input type="checkbox" id="' + id + '" data-choix="prep-coche" data-cle="' + c.id + p.id + '" data-focus="' + id + '"' + (coches[c.id + p.id] ? ' checked' : '') + '><label for="' + id + '"><span class="mono emplacement">' + e(p.emplacement) + '</span><span>' + e(p.nom) + '</span><b>' + l.qte + '</b><small>' + e(p.unite) + '</small></label></li>'; }).join('') + '</ul><footer class="carte-pied"><p class="discret">' + faites + ' / ' + c.lignes.length + ' ligne' + (c.lignes.length > 1 ? 's' : '') + ' prélevée' + (faites > 1 ? 's' : '') + (c.preparateur ? ' · ' + e(D.membre(c.preparateur).nom) : '') + '</p>' + A.actionsCommande(c, true) + '</footer></section>';
        });
        html += '</div><section class="carte prep-total" aria-labelledby="t-total"><header class="carte-tete"><div><h2 id="t-total">À prélever, toutes commandes</h2><p class="carte-sous">Trié par emplacement pour une seule tournée</p></div></header><table class="table table--compacte"><thead><tr><th scope="col">Empl.</th><th scope="col">Produit</th><th scope="col" class="num">Qté</th></tr></thead><tbody>' + Object.keys(total).sort(function (a, b) { return D.produit(s, a).emplacement < D.produit(s, b).emplacement ? -1 : 1; }).map(function (id) { var p = D.produit(s, id); return '<tr><td class="mono">' + e(p.emplacement) + '</td><th scope="row">' + e(p.nom) + '</th><td class="num">' + total[id] + '</td></tr>'; }).join('') + '</tbody></table></section></div>';
      }
    }
    return html + '</div>';
  };
  A.gestes['prep-onglet'] = function (b) { A.ui.preparation.onglet = b.getAttribute('data-onglet'); A.rendre(); $('[data-focus="onglet-p-' + A.ui.preparation.onglet + '"]').focus(); };
  A.gestes['prep-coche'] = function (c) { A.ui.preparation.coches[c.getAttribute('data-cle')] = c.checked; A.rendre(); };
  A.gestes.imprimer = function () { window.print(); };
  /* Glisser-déposer : seulement vers l'étape suivante, avec les mêmes règles que les boutons */
  var glisse = null;
  document.addEventListener('dragstart', function (ev) { var f = ev.target.closest && ev.target.closest('[data-carte]'); if (!f) return; glisse = f.getAttribute('data-carte'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', glisse); f.classList.add('fiche--glisse'); var c = D.commande(S(), glisse); $$('.colonne').forEach(function (col) { if (D.TRANSITIONS[c.statut].indexOf(col.getAttribute('data-colonne')) >= 0) col.classList.add('colonne--cible'); }); });
  document.addEventListener('dragend', function () { glisse = null; $$('.colonne--cible, .colonne--survol').forEach(function (c) { c.classList.remove('colonne--cible', 'colonne--survol'); }); $$('.fiche--glisse').forEach(function (f) { f.classList.remove('fiche--glisse'); }); });
  document.addEventListener('dragover', function (ev) { var col = ev.target.closest && ev.target.closest('.colonne--cible'); if (col && glisse) { ev.preventDefault(); $$('.colonne--survol').forEach(function (c) { if (c !== col) c.classList.remove('colonne--survol'); }); col.classList.add('colonne--survol'); } });
  document.addEventListener('drop', function (ev) { var col = ev.target.closest && ev.target.closest('.colonne--cible'); if (!col || !glisse) return; ev.preventDefault(); var id = glisse; glisse = null; A.changerStatut(id, col.getAttribute('data-colonne')); });

  /* ══ F. Paiements et relances ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */
  A.ecrans.paiements = function () {
    var s = S(), u = A.ui.paiements, j = s.jour, x = extras(), k = A.k, q = D.sansAccent(u.q.trim());
    var factures = s.commandes.filter(function (c) { return D.FACTURE[c.statut]; }).map(function (c) { return { c: c, etat: D.etatPaiement(s, c), reste: D.reste(A.d, c), rel: s.relances.filter(function (r) { return r.commande === c.id; }) }; });
    var liste = factures.filter(function (f) {
      if (u.etat === 'payee') { if (f.etat !== 'payee' || f.c.expedieeLe < j - 45) return false; }
      else if (u.etat) { if (f.etat !== u.etat) return false; }
      else if (f.reste <= 0) return false;
      return !q || D.sansAccent(f.c.id + ' ' + D.client(s, f.c.client).nom).indexOf(q) >= 0;
    });
    var val = { echeance: function (f) { return f.c.echeance; }, reste: function (f) { return f.reste; }, client: function (f) { return D.sansAccent(D.client(s, f.c.client).nom); }, ttc: function (f) { return A.d.montants[f.c.id].ttc; } }[u.tri] || function (f) { return f.c.echeance; };
    liste.sort(function (a, b) { var x1 = val(a), y1 = val(b); return (x1 < y1 ? -1 : x1 > y1 ? 1 : 0) * (u.sens === 'asc' ? 1 : -1); });
    var html = tete('Paiements et relances', 'Suivi des encaissements des commandes expédiées · montants TTC', boutonExport('paiements'));
    html += '<p class="bandeau-info bandeau-info--neutre">' + ic('info') + '<span>Suivi de démonstration : ce n\'est pas un logiciel de comptabilité ni de facturation certifié. Aucun paiement réel n\'est traité et aucune relance n\'est envoyée.</span></p>';
    html += '<section class="kpis kpis--4" aria-label="Indicateurs de paiement">' + [['Encours TTC', compact(k.encours), pluriel(factures.filter(function (f) { return f.reste > 0; }).length, 'facture') + ' ouverte' + (factures.filter(function (f) { return f.reste > 0; }).length > 1 ? 's' : ''), '', ''], ['Échu', compact(k.echu), 'à relancer', k.echu ? 'critique' : 'ok', 'echue'], ['À échoir · 7 j', compact(x.aEchoir), pluriel(x.nbAEchoir, 'échéance'), '', 'a_echoir'], ['Encaissé · 30 j', compact(x.encaisse30), pluriel(x.nbEncaisse, 'paiement'), '', 'payee']].map(function (t) { return '<button type="button" class="kpi' + (t[3] ? ' kpi--' + t[3] : '') + '" data-action="pai-etat" data-etat="' + t[4] + '" aria-pressed="' + (u.etat === t[4]) + '"><span class="kpi-nom">' + t[0] + '</span><b class="kpi-val">' + t[1] + '</b><span class="kpi-pied">' + t[2] + '</span></button>'; }).join('') + '</section>';
    html += '<div class="grille-paiements"><div>';
    html += '<div class="barre-filtres">' + recherche('pai-q', 'pai-q', u.q, 'Commande ou client') + select('pai-etat', 'pai-filtre', [['', 'Toutes les factures ouvertes'], ['echue', 'Échues'], ['a_echoir', 'À échoir'], ['partielle', 'Partiellement payées'], ['payee', 'Payées (45 derniers jours)']], u.etat, 'État') + '</div>';
    html += '<section class="carte carte--table table-zone" aria-label="Factures">';
    if (!liste.length) html += A.vide('Aucune facture ne correspond', 'Modifiez la recherche ou l\'état choisi.');
    else html += '<div class="table-defile"><table class="table table--cartes"><caption class="visuellement-cache">Factures, ' + pluriel(liste.length, 'résultat') + '</caption><thead><tr><th scope="col">Commande</th>' + A.tri('paiements', 'client', 'Client') + A.tri('paiements', 'ttc', 'Montant TTC', 'num') + A.tri('paiements', 'reste', 'Reste dû', 'num') + A.tri('paiements', 'echeance', 'Échéance') + '<th scope="col">État</th><th scope="col">Relances</th><th scope="col"><span class="visuellement-cache">Actions</span></th></tr></thead><tbody>' + liste.slice(0, 40).map(function (f) {
      var c = f.c, retard = j - c.echeance;
      return '<tr><td data-l="Commande">' + A.lienCommande(c) + '</td><td data-l="Client">' + e(D.client(s, c.client).nom) + '</td><td data-l="Montant TTC" class="num">' + mad(A.d.montants[c.id].ttc) + '</td><td data-l="Reste dû" class="num"><b>' + mad(f.reste) + '</b></td><td data-l="Échéance">' + e(D.dateCourte(c.echeance)) + (f.reste > 0 && retard > 0 ? '<small class="texte-critique">' + pluriel(retard, 'jour') + ' de retard</small>' : '') + '</td><td data-l="État">' + A.badgePaiement(f.etat) + '</td><td data-l="Relances">' + (f.rel.length ? 'n° ' + f.rel[f.rel.length - 1].niveau + ' <small>' + e(D.relatif(f.rel[f.rel.length - 1].jour, j)) + '</small>' : '<span class="discret">aucune</span>') + '</td><td class="cellule-actions">' + (f.reste > 0 ? A.bouton({ action: 'paiement', data: { id: c.id }, icone: 'paiement', classe: 'btn--icone btn--petit', aria: 'Enregistrer un paiement sur ' + c.id, titre: 'Enregistrer un paiement', refus: A.peut('paiement') ? null : 'Réservé aux rôles : ' + A.rolesPour('paiement') }) + (c.echeance < j ? A.bouton({ action: 'relancer', data: { id: c.id }, icone: 'cloche', classe: 'btn--icone btn--petit', aria: 'Relancer pour ' + c.id, titre: 'Relancer (simulé)', refus: A.peut('relance') ? null : 'Réservé aux rôles : ' + A.rolesPour('relance') }) : '') : '') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="pagination-info">' + pluriel(liste.length, 'facture') + (liste.length > 40 ? ' · les 40 premières affichées, toutes dans l\'export' : '') + '</p>';
    html += '</section></div>';
    var parClient = s.clients.map(function (c) { return { c: c, x: A.d.clients[c.id] }; }).filter(function (o) { return o.x.encours > 0; }).sort(function (a, b) { return b.x.encours - a.x.encours; }).slice(0, 8);
    html += '<section class="carte" aria-labelledby="t-encours"><header class="carte-tete"><div><h2 id="t-encours">Encours par client</h2><p class="carte-sous">TTC, les 8 plus élevés</p></div></header>' + G.barresH(parClient.map(function (o) { return { nom: o.c.nom, sous: o.x.echu ? compact(o.x.echu) + ' échus' : 'rien d\'échu', valeur: o.x.encours, lien: '#/clients/' + o.c.id, infobulle: o.c.nom + ' : ' + mad(o.x.encours) + ' dont ' + mad(o.x.echu) + ' échus' }; }), compact) + '</section>';
    return html + '</div>';
  };
  A.gestes['pai-q'] = function (c) { A.ui.paiements.q = c.value; A.rendre(); };
  A.gestes['pai-filtre'] = function (c) { A.ui.paiements.etat = c.value; A.rendre(); };
  A.gestes['pai-etat'] = function (b) { var v = b.getAttribute('data-etat'); A.ui.paiements.etat = A.ui.paiements.etat === v ? '' : v; A.rendre(); };
  function enCentimes(t) { var m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(String(t).replace(/[\s  ]/g, '')); return m ? (+m[1]) * 100 + (m[2] ? +(m[2] + '0').slice(0, 2) : 0) : NaN; }
  A.enCentimes = enCentimes;
  A.gestes.paiement = function (b) {
    A.fermerMenus();
    var c = D.commande(S(), b.getAttribute('data-id')), reste = D.reste(A.d, c);
    A.ouvrirModale({ titre: 'Paiement sur ' + c.id, contenu: function () {
      return '<form novalidate data-formulaire="paiement-ok" data-id="' + c.id + '"><p>' + e(D.client(S(), c.client).nom) + ' · reste dû <b>' + mad(reste) + '</b> sur ' + mad(A.d.montants[c.id].ttc) + '.</p><div class="champ"><label for="pa-montant">Montant reçu (MAD)</label><input id="pa-montant" name="montant" inputmode="decimal" autocomplete="off" required value="' + D.decimal(reste) + '" autofocus></div><div class="champ"><label for="pa-mode">Mode</label><select id="pa-mode" name="mode">' + D.MODES_PAIEMENT.map(function (m) { return '<option>' + e(m) + '</option>'; }).join('') + '</select></div><p class="champ-erreur" id="pa-erreur" hidden></p><p class="discret">Enregistrement simulé, daté d\'aujourd\'hui : aucun paiement réel.</p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Annuler', classe: 'btn--discret' }) + '<button type="submit" class="btn btn--plein">' + ic('coche') + '<span>Enregistrer le paiement</span></button></div></form>';
    } });
  };
  A.gestes['paiement-ok'] = function (f) {
    var id = f.getAttribute('data-id'), montant = enCentimes(f.montant.value);
    var res = isNaN(montant) ? { ok: false, erreur: { message: 'Indiquez un montant, par exemple 1250,50.' } } : A.agir({ type: 'enregistrer_paiement', commande: id, montant: montant, mode: f.mode.value }, { silencieux: true });
    if (!res.ok) { var p = $('#pa-erreur'); p.textContent = res.erreur.message; p.hidden = false; f.montant.setAttribute('aria-invalid', 'true'); f.montant.setAttribute('aria-describedby', 'pa-erreur'); f.montant.focus(); return; }
    A.fermerModale(); A.rendre(); A.notifier('Paiement de ' + mad(montant) + ' enregistré sur ' + id + (res.resultat.solde ? ' : commande soldée.' : '.'), 'ok');
  };
  A.gestes.relancer = function (b) {
    A.fermerMenus();
    var s = S(), c = D.commande(s, b.getAttribute('data-id')), cl = D.client(s, c.client), n = s.relances.filter(function (r) { return r.commande === c.id; }).length + 1;
    A.ouvrirModale({ titre: 'Relance n° ' + n + ' · ' + c.id, contenu: function () {
      return '<form novalidate data-formulaire="relance-ok" data-id="' + c.id + '"><fieldset class="choix-canal"><legend>Canal</legend>' + ['Téléphone', 'E-mail', 'WhatsApp'].map(function (x, i) { return '<label><input type="radio" name="canal" value="' + x + '"' + (i === (n === 1 ? 1 : 0) ? ' checked' : '') + '> ' + x + '</label>'; }).join('') + '</fieldset><div class="apercu-relance"><p class="surtitre">Aperçu du message (fictif)</p><p>Bonjour ' + e(cl.contact.split(' ')[0]) + ', sauf erreur de notre part, la commande ' + e(c.id) + ' du ' + e(D.dateCourte(c.jour)) + ' présente un reste dû de ' + mad(D.reste(A.d, c)) + ', échu depuis le ' + e(D.dateCourte(c.echeance)) + '. Merci de nous indiquer la date de règlement prévue. — Démo Négoce SARL</p></div><p class="bandeau-info bandeau-info--neutre">' + ic('info') + '<span>Relance simulée : aucun message n\'est envoyé. Elle est seulement tracée dans l\'historique de la commande.</span></p><p class="champ-erreur" id="re-erreur" hidden></p><div class="modale-pied">' + A.bouton({ action: 'fermer-modale', texte: 'Annuler', classe: 'btn--discret' }) + '<button type="submit" class="btn btn--plein" autofocus>' + ic('cloche') + '<span>Tracer la relance</span></button></div></form>';
    } });
  };
  A.gestes['relance-ok'] = function (f) {
    var id = f.getAttribute('data-id'), canal = (f.querySelector('input[name="canal"]:checked') || {}).value;
    var res = A.agir({ type: 'relancer', commande: id, canal: canal }, { silencieux: true });
    if (!res.ok) { var p = $('#re-erreur'); p.textContent = res.erreur.message; p.hidden = false; return; }
    A.fermerModale(); A.rendre(); A.notifier('Relance n° ' + res.resultat.niveau + ' tracée pour ' + id + ' (simulée, rien n\'est envoyé).', 'ok');
  };

  /* ══ G. Rapports ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  A.ecrans.rapports = function () {
    var s = S(), u = A.ui.rapports, j = s.jour;
    var filtre = function (c) { var cl = D.client(s, c.client); return (!u.type || cl.type === u.type) && (!u.categorie || c.lignes.some(function (l) { return D.produit(s, l.produit).categorie === u.categorie; })); };
    var depuis = D.debutSemaine(j) - 7 * (u.semaines - 1);
    var ventes = D.ventesParSemaine(s, A.d, u.semaines, filtre);
    if (u.categorie) ventes.forEach(function (v) { v.ht = 0; v.nb = 0; });
    if (u.categorie) s.commandes.forEach(function (c) { if (c.statut === 'annulee' || c.jour < depuis || !filtre(c)) return; var k = Math.floor((c.jour - depuis) / 7), part = 0; c.lignes.forEach(function (l) { if (D.produit(s, l.produit).categorie === u.categorie) part += Math.round(l.qte * l.prix * (100 - c.remise) / 100); }); ventes[k].ht += part; ventes[k].nb++; });
    var totalHT = ventes.reduce(function (t, v) { return t + v.ht; }, 0), nb = ventes.reduce(function (t, v) { return t + v.nb; }, 0), completes = ventes.filter(function (v) { return !v.enCours; });
    var statuts = D.commandesParStatut(s, function (c) { return c.jour >= depuis && filtre(c); });
    var tops = D.produitsDemandes(s, depuis, filtre).filter(function (t) { return !u.categorie || D.produit(s, t.produit).categorie === u.categorie; }).slice(0, 8);
    var clients = s.clients.filter(function (c) { return !u.type || c.type === u.type; }).map(function (c) { var t = 0; s.commandes.forEach(function (k) { if (k.client === c.id && k.statut !== 'annulee' && k.jour >= depuis && filtre(k)) t += A.d.montants[k.id].ht; }); return { c: c, ht: t }; }).filter(function (x) { return x.ht > 0; }).sort(function (a, b) { return b.ht - a.ht; }).slice(0, 8);
    var critiques = s.produits.filter(function (p) { return D.niveauStock(p) !== 'ok' && (!u.categorie || p.categorie === u.categorie); }).sort(function (a, b) { return D.disponible(a) / a.seuil - D.disponible(b) / b.seuil; });
    var retards = D.retardsParSemaine(s, u.semaines, filtre);
    u.donnees = { ventes: ventes, statuts: statuts, tops: tops, clients: clients, critiques: critiques, retards: retards };
    var html = tete('Rapports et analyses', 'Calculés en direct sur les données de la session · ' + e(D.dateCourte(depuis)) + ' – ' + e(D.dateCourte(j)), A.bouton({ action: 'exporter', data: { quoi: 'rapport' }, texte: 'Exporter le rapport', icone: 'telecharger', focus: 'export-rapport' }));
    html += '<div class="barre-filtres">' + select('ra-semaines', 'ra-filtre', [[4, '4 dernières semaines'], [12, '12 dernières semaines'], [18, '18 semaines (tout)']], u.semaines, 'Période') + select('ra-type', 'ra-filtre', [['', 'Tous les clients']].concat(TYPES.map(function (t) { return [t, t]; })), u.type, 'Type de client') + select('ra-cat', 'ra-filtre', [['', 'Toutes les catégories']].concat(categories().map(function (c) { return [c, c]; })), u.categorie, 'Catégorie de produits') + '</div>';
    html += '<div class="mini-kpis mini-kpis--large"><div><span>CA HT sur la période</span><b>' + compact(totalHT) + '</b></div><div><span>Commandes</span><b>' + nb + '</b></div><div><span>Moyenne par semaine complète</span><b>' + compact(completes.length ? Math.round(completes.reduce(function (t, v) { return t + v.ht; }, 0) / completes.length) : 0) + '</b></div><div><span>Panier moyen HT</span><b>' + compact(nb ? Math.round(totalHT / nb) : 0) + '</b></div></div>';
    html += '<div class="grille-rapports">';
    html += '<section class="carte carte--large" aria-labelledby="r-ventes"><header class="carte-tete"><div><h2 id="r-ventes">Ventes par semaine</h2><p class="carte-sous">CA HT' + (u.categorie ? ' de la catégorie ' + e(u.categorie) : '') + (u.type ? ', clients ' + e(u.type) : '') + ' · la dernière semaine est en cours</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-ventes' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter les ventes par semaine' }) + '</header>' + A.graphe('colonnes', { titre: 'Ventes HT par semaine', hauteur: 240, marque: ventes.length - 2, format: function (v, plein) { return plein ? compact(v) : v >= 1e5 ? Math.round(v / 1e5) + ' k' : Math.round(v / 100); }, points: ventes.map(function (v) { return { etiquette: D.dateJourMois(v.debut), valeur: v.ht, attenue: v.enCours, infobulle: 'Semaine du ' + D.dateJourMois(v.debut) + ' : ' + mad(v.ht, true) + ' HT · ' + pluriel(v.nb, 'commande') }; }) }) + donnees('Ventes par semaine', ['Semaine du', 'Commandes', 'CA HT (MAD)'], ventes.map(function (v) { return [D.dateCourte(v.debut), v.nb, D.decimal(v.ht)]; })) + '</section>';
    var totalS = D.STATUTS.reduce(function (t, x) { return t + statuts[x]; }, 0);
    html += '<section class="carte" aria-labelledby="r-statuts"><header class="carte-tete"><div><h2 id="r-statuts">Commandes par statut</h2><p class="carte-sous">' + pluriel(totalS, 'commande') + ' créée' + (totalS > 1 ? 's' : '') + ' sur la période</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-statuts' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter les commandes par statut' }) + '</header>' + G.barresH(D.STATUTS.map(function (x) { return { nom: D.LIBELLE_STATUT[x], valeur: statuts[x], lien: '#/commandes?statut=' + x, infobulle: D.LIBELLE_STATUT[x] + ' : ' + statuts[x] + ' (' + (totalS ? Math.round(statuts[x] / totalS * 100) : 0) + ' %)' }; }), String) + '</section>';
    html += '<section class="carte" aria-labelledby="r-produits"><header class="carte-tete"><div><h2 id="r-produits">Produits les plus demandés</h2><p class="carte-sous">Quantités commandées sur la période</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-produits' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter les produits les plus demandés' }) + '</header>' + (tops.length ? G.barresH(tops.map(function (t) { var p = D.produit(s, t.produit); return { nom: p.nom, sous: p.unite, valeur: t.qte, lien: '#/stocks/' + p.id, infobulle: t.qte + ' × ' + p.unite + ' · ' + mad(t.ht, true) + ' HT' }; }), D.milliers) : A.vide('Aucune vente', 'Rien sur cette sélection.')) + '</section>';
    html += '<section class="carte" aria-labelledby="r-clients"><header class="carte-tete"><div><h2 id="r-clients">Clients principaux</h2><p class="carte-sous">CA HT sur la période</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-clients' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter les clients principaux' }) + '</header>' + (clients.length ? G.barresH(clients.map(function (x) { return { nom: x.c.nom, sous: x.c.type + ' · ' + x.c.ville, valeur: x.ht, lien: '#/clients/' + x.c.id, infobulle: x.c.nom + ' : ' + mad(x.ht, true) + ' HT' }; }), compact) : A.vide('Aucun client', 'Rien sur cette sélection.')) + '</section>';
    html += '<section class="carte" aria-labelledby="r-retards"><header class="carte-tete"><div><h2 id="r-retards">Évolution des retards</h2><p class="carte-sous">Part des livraisons de la semaine arrivées après la date prévue</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-retards' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter l\'évolution des retards' }) + '</header>' + A.graphe('courbe', { titre: 'Part des livraisons en retard par semaine', hauteur: 200, min: 10, format: function (v) { return Math.round(v) + ' %'; }, points: retards.map(function (r) { var t = r.livrees ? r.retard / r.livrees * 100 : 0; return { etiquette: D.dateJourMois(r.debut), valeur: t, infobulle: 'Semaine du ' + D.dateJourMois(r.debut) + (r.enCours ? ' (en cours)' : '') + ' : ' + r.retard + ' en retard sur ' + pluriel(r.livrees, 'livraison') + ' (' + Math.round(t) + ' %)' }; }) }) + donnees('Retards par semaine', ['Semaine du', 'Livraisons', 'En retard', 'Part (%)'], retards.map(function (r) { return [D.dateCourte(r.debut), r.livrees, r.retard, r.livrees ? Math.round(r.retard / r.livrees * 100) : 0]; })) + '</section>';
    html += '<section class="carte" aria-labelledby="r-critiques"><header class="carte-tete"><div><h2 id="r-critiques">Stocks critiques</h2><p class="carte-sous">Produits sous leur seuil, aujourd\'hui</p></div>' + A.bouton({ action: 'exporter', data: { quoi: 'r-critiques' }, icone: 'telecharger', classe: 'btn--icone', aria: 'Exporter les stocks critiques' }) + '</header>' + (critiques.length ? '<table class="table table--compacte"><thead><tr><th scope="col">Produit</th><th scope="col" class="num">Disponible</th><th scope="col" class="num">Seuil</th><th scope="col">État</th></tr></thead><tbody>' + critiques.map(function (p) { return '<tr><th scope="row">' + A.lienProduit(p) + '</th><td class="num">' + Math.max(0, D.disponible(p)) + '</td><td class="num">' + p.seuil + '</td><td>' + A.badgeStock(p) + '</td></tr>'; }).join('') + '</tbody></table>' : A.vide('Aucun stock critique', 'Tous les produits sont au-dessus de leur seuil.')) + '</section>';
    return html + '</div>';
  };
  A.gestes['ra-filtre'] = function () { var u = A.ui.rapports; u.semaines = +$('#ra-semaines').value; u.type = $('#ra-type').value; u.categorie = $('#ra-cat').value; A.rendre(); };

  /* ══ Exports CSV (données fictives, préparés dans le navigateur) ════════════════════════════════════════════════════════════════════ */
  A.gestes.exporter = function (b) {
    var s = S(), quoi = b.getAttribute('data-quoi'), date = D.iso(s.jour), R = A.ui.rapports.donnees || {};
    var x = {
      commandes: function () { return ['commandes', ['Référence', 'Date', 'Client', 'Type', 'Ville', 'Statut', 'Livraison prévue', 'Articles', 'Total HT', 'TVA', 'Total TTC', 'Paiement', 'Reste dû'], commandesFiltreesExport()]; },
      clients: function () { return ['clients', ['Client', 'Type', 'Ville', 'Segment', 'Remise %', 'Délai (jours)', 'Plafond', 'CA HT 90 j', 'Encours TTC', 'Échu', 'Commandes'], s.clients.map(function (c) { var x1 = A.d.clients[c.id]; return [c.nom, c.type, c.ville, x1.segment, c.remise, c.delai, D.decimal(c.plafond * 100), D.decimal(x1.ca90), D.decimal(x1.encours), D.decimal(x1.echu), x1.nb]; })]; },
      stock: function () { return ['stock', ['Référence', 'Produit', 'Catégorie', 'Unité', 'Emplacement', 'Stock', 'Réservé', 'Disponible', 'Seuil', 'Cible', 'État'], s.produits.map(function (p) { return [p.sku, p.nom, p.categorie, p.unite, p.emplacement, p.stock, p.reserve, D.disponible(p), p.seuil, p.cible, D.niveauStock(p)]; })]; },
      mouvements: function () { return ['mouvements', ['Mouvement', 'Date', 'Heure', 'Référence', 'Produit', 'Type', 'Quantité', 'Origine', 'Pièce', 'Stock après', 'Réservé après', 'Par'], s.mouvements.map(function (m) { var p = D.produit(s, m.produit); return [m.id, D.dateCourte(m.jour), m.h, p.sku, p.nom, m.type, m.qte, m.origine.type, m.origine.ref, m.stock, m.reserve, m.par]; })]; },
      paiements: function () { return ['paiements', ['Commande', 'Client', 'Total TTC', 'Payé', 'Reste dû', 'Échéance', 'État', 'Relances'], s.commandes.filter(function (c) { return D.FACTURE[c.statut]; }).map(function (c) { return [c.id, D.client(s, c.client).nom, D.decimal(A.d.montants[c.id].ttc), D.decimal(A.d.paye[c.id] || 0), D.decimal(D.reste(A.d, c)), D.dateCourte(c.echeance), D.LIBELLE_PAIEMENT[D.etatPaiement(s, c)], s.relances.filter(function (r) { return r.commande === c.id; }).length]; })]; },
      'r-ventes': function () { return ['ventes-par-semaine', ['Semaine du', 'Commandes', 'CA HT'], (R.ventes || []).map(function (v) { return [D.dateCourte(v.debut), v.nb, D.decimal(v.ht)]; })]; },
      'r-statuts': function () { return ['commandes-par-statut', ['Statut', 'Commandes'], D.STATUTS.map(function (x1) { return [D.LIBELLE_STATUT[x1], (R.statuts || {})[x1] || 0]; })]; },
      'r-produits': function () { return ['produits-demandes', ['Référence', 'Produit', 'Quantité', 'CA HT', 'Commandes'], (R.tops || []).map(function (t) { var p = D.produit(s, t.produit); return [p.sku, p.nom, t.qte, D.decimal(t.ht), t.commandes]; })]; },
      'r-clients': function () { return ['clients-principaux', ['Client', 'Type', 'Ville', 'CA HT'], (R.clients || []).map(function (x1) { return [x1.c.nom, x1.c.type, x1.c.ville, D.decimal(x1.ht)]; })]; },
      'r-retards': function () { return ['retards-par-semaine', ['Semaine du', 'Livraisons', 'En retard'], (R.retards || []).map(function (r) { return [D.dateCourte(r.debut), r.livrees, r.retard]; })]; },
      'r-critiques': function () { return ['stocks-critiques', ['Référence', 'Produit', 'Disponible', 'Seuil'], (R.critiques || []).map(function (p) { return [p.sku, p.nom, D.disponible(p), p.seuil]; })]; }
    };
    if (quoi === 'rapport') {
      var parts = ['r-ventes', 'r-statuts', 'r-produits', 'r-clients', 'r-retards', 'r-critiques'].map(function (k) { var r = x[k](); return [[r[0].toUpperCase()]].concat([r[1]]).concat(r[2]).concat([[]]); });
      var lignes = [].concat.apply([], parts);
      A.telecharger('demo-distribution-os-rapport-' + date + '.csv', D.versCSV(['Rapport de démonstration Distribution OS — données fictives — ' + D.dateCourte(s.jour)], lignes));
      return;
    }
    var r = x[quoi](); A.telecharger('demo-distribution-os-' + r[0] + '-' + date + '.csv', D.versCSV(r[1], r[2]));
  };
  function commandesFiltreesExport() { var s = S(); return commandesFiltrees().map(function (c) { var cl = D.client(s, c.client), m = A.d.montants[c.id]; return [c.id, D.dateCourte(c.jour), cl.nom, cl.type, cl.ville, D.LIBELLE_STATUT[c.statut], D.dateCourte(c.livraisonPrevue), c.lignes.length, D.decimal(m.ht), D.decimal(m.tva), D.decimal(m.ttc), D.LIBELLE_PAIEMENT[D.etatPaiement(s, c)], D.decimal(D.reste(A.d, c))]; }); }

  /* ══ H. Paramètres et rôles ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  A.ecrans.parametres = function () {
    var s = S();
    var html = tete('Paramètres et rôles', 'Comment l\'interface change selon la personne qui l\'utilise');
    html += '<section class="carte" aria-labelledby="p-roles"><header class="carte-tete"><div><h2 id="p-roles">Voir l\'interface comme…</h2><p class="carte-sous">Changement de vue simulé : la démonstration n\'a pas de comptes. Dans un vrai logiciel, chaque personne se connecte avec ses propres droits.</p></div></header><div class="roles">' + Object.keys(D.ROLES).map(function (r) {
      var x = D.ROLES[r], actif = A.role === r;
      return '<article class="role' + (actif ? ' role--actif' : '') + '"><h3>' + e(x.libelle) + (actif ? ' <span class="pastille pastille--ok">' + ic('coche') + 'Vue actuelle</span>' : '') + '</h3><p class="discret">' + e(x.personne) + ' (fictive)</p><p>' + e(x.resume) + '</p><p class="role-modules">' + D.MODULES_ROLE[r].length + ' écrans sur 8' + (r === 'magasinier' ? ' · montants masqués' : '') + '</p>' + (actif ? '' : A.bouton({ action: 'voir-role', data: { role: r }, texte: 'Voir comme ' + x.libelle.toLowerCase(), classe: 'btn--petit', focus: 'role-' + r })) + '</article>';
    }).join('') + '</div></section>';
    var roles = Object.keys(D.ROLES);
    html += '<section class="carte carte--table" aria-labelledby="p-droits"><header class="carte-tete"><div><h2 id="p-droits">Droits par rôle</h2><p class="carte-sous">Appliqués par le moteur de la démonstration : une action non permise est refusée, même hors de l\'interface.</p></div></header><div class="table-defile" tabindex="0" role="region" aria-label="Droits par rôle (défilable)"><table class="table table--compacte matrice"><thead><tr><th scope="col">Action</th>' + roles.map(function (r) { return '<th scope="col">' + e(D.ROLES[r].libelle) + '</th>'; }).join('') + '</tr></thead><tbody>' + Object.keys(D.DROITS).map(function (d) { return '<tr><th scope="row">' + e(D.LIBELLE_DROIT[d]) + '</th>' + roles.map(function (r) { var ok = D.peut(r, d); return '<td>' + (ok ? ic('coche', 'oui') + '<span class="visuellement-cache">Oui</span>' : '<span aria-hidden="true" class="non">—</span><span class="visuellement-cache">Non</span>') + '</td>'; }).join('') + '</tr>'; }).join('') + '<tr><th scope="row">Écrans visibles</th>' + roles.map(function (r) { return '<td>' + D.MODULES_ROLE[r].length + '</td>'; }).join('') + '</tr></tbody></table></div></section>';
    html += '<div class="grille-2"><section class="carte" aria-labelledby="p-entreprise"><header class="carte-tete"><div><h2 id="p-entreprise">Entreprise</h2><p class="carte-sous">Fictive</p></div></header><dl class="def"><dt>Raison sociale</dt><dd>' + e(s.entreprise.nom) + '</dd><dt>Activité</dt><dd>' + e(s.entreprise.activite) + '</dd><dt>Ville</dt><dd>' + e(s.entreprise.ville) + '</dd><dt>Devise</dt><dd>Dirham marocain (MAD)</dd><dt>TVA appliquée</dt><dd>' + D.TVA_PCT + ' %</dd><dt>Équipe</dt><dd>' + D.EQUIPE.length + ' personnes fictives</dd></dl></section>';
    html += '<section class="carte" aria-labelledby="p-session"><header class="carte-tete"><div><h2 id="p-session">Session de démonstration</h2><p class="carte-sous">Vos manipulations, dans cet onglet uniquement</p></div></header><dl class="def"><dt>Date de référence</dt><dd>' + e(D.dateLongue(s.jour)) + '</dd><dt>Actions de la session</dt><dd>' + A.actions.length + '</dd><dt>Thème</dt><dd>' + A.bouton({ action: 'theme', texte: A.theme === 'sombre' ? 'Passer en clair' : 'Passer en sombre', icone: A.theme === 'sombre' ? 'soleil' : 'lune', classe: 'btn--petit' }) + '</dd></dl><p class="discret">Les données sont fictives et restent dans votre navigateur (stockage de session de cet onglet) : rien n\'est transmis à Legantis ni à personne. Elles s\'effacent à la fermeture de l\'onglet ou avec « Réinitialiser ».</p><div class="carte-pied">' + A.bouton({ action: 'reinitialiser', texte: 'Réinitialiser la démonstration', icone: 'recharger' }) + '</div></section></div>';
    html += '<section class="carte cta-carte" aria-labelledby="p-cta"><div><h2 id="p-cta">Vous aimeriez un outil adapté à votre entreprise ?</h2><p>Les écrans, les règles et les rôles de Distribution OS sont un exemple. Le vôtre partirait de votre façon de vendre, en français et en arabe, avec le code source remis.</p></div><a class="btn btn--plein btn--grand" data-lien-legantis="#demande" href="' + e(A.lienLegantis()) + '">Discuter de mon projet avec Legantis' + ic('droite') + '</a></section>';
    return html;
  };
  A.gestes['voir-role'] = function (b) { var sel = $('#role'); sel.value = b.getAttribute('data-role'); A.gestes.role(sel); };
})();
