/* Distribution OS — scénario guidé « Tester un scénario en 3 minutes ».
   Six étapes réellement interactives : le guide observe l'état de la session (pas des clics) et avance quand l'étape est faite, quel que soit le chemin pris.
   « Passer l'étape » la réalise pour le visiteur avec les mêmes règles métier, pour que la suite reste cohérente. Le visiteur peut quitter, reprendre,
   réinitialiser, ou explorer librement pendant le guide : le panneau ne bloque rien. Lien d'accès direct : ?scenario=1 (et &jour=AAAA-MM-JJ pour une vidéo reproductible). */
(function () {
  'use strict';
  var A = window.DOSApp, D = window.DOS, e = A.e, ic = A.ic, $ = A.$, $$ = A.$$;
  var CLIENT = 'C05';   // Supérette Les Orangers (fictive), Rabat
  var LIGNES = [{ produit: 'P01', qte: 12 }, { produit: 'P04', qte: 4 }, { produit: 'P16', qte: 30 }];

  var ETAPES = [
    { cle: 'decouvrir', titre: 'Découvrez le tableau de bord', texte: 'Chaque indicateur est calculé sur les commandes de la session, pas affiché pour décorer. Repérez « Commandes en cours » et « Alertes de stock », puis cliquez sur <b>Nouvelle commande</b>.', cible: '.kpis, .haut-nouvelle', ecran: 'tableau', passer: 'Ouvrir la saisie' },
    { cle: 'creer', titre: 'Créez une commande fictive', texte: 'Choisissez <b>Supérette Les Orangers</b>, ajoutez de l\'huile, du thé et du lait. Essayez une quantité supérieure au disponible : l\'outil vous prévient. Terminez avec <b>Créer sans confirmer</b>.', cible: '.haut-nouvelle', aide: 'Remplir pour moi', passer: 'Créer la commande pour moi' },
    { cle: 'reserver', titre: 'Vérifiez et réservez le stock', texte: 'La fiche de la commande compare chaque ligne au stock disponible. Cliquez sur <b>Confirmer et réserver le stock</b> : les quantités ne seront plus proposées aux autres commandes.', cible: '[data-action="statut"][data-vers="confirmee"]', passer: 'Réserver pour moi' },
    { cle: 'preparer', titre: 'Préparez la commande', texte: 'Dans <b>Préparation et livraison</b>, votre commande attend dans la colonne « Confirmée ». Cliquez sur <b>Lancer la préparation</b> ou glissez sa carte dans la colonne suivante.', cible: '[data-action="statut"][data-vers="en_preparation"], .nav-lien[href="#/preparation"]', allerA: '#/preparation', passer: 'Lancer pour moi' },
    { cle: 'statut', titre: 'Faites avancer son statut', texte: 'Marquez-la <b>prête</b>, puis <b>expédiez-la</b> : le stock réservé sort du stock physique et l\'échéance de paiement est calculée selon les conditions du client.', cible: '[data-action="statut"][data-vers="prete"], [data-action="statut"][data-vers="expediee"]', allerA: '#/preparation', passer: 'Expédier pour moi' },
    { cle: 'kpi', titre: 'Observez l\'impact sur les indicateurs', texte: 'De retour au tableau de bord, les tuiles modifiées par votre commande sont soulignées : chiffre d\'affaires, encours client, activité récente, stock.', cible: '.kpi--change, .activite li:first-child', allerA: '#/tableau', passer: 'Voir le résumé' }
  ];

  function g() { return A.guideEtat; }
  function sauver() { A.ecrireSession(); }
  function cmd() { return g() && g().id ? D.commande(A.etat, g().id) : null; }
  function rang(c) { return c ? (c.statut === 'annulee' ? -1 : D.FLUX.indexOf(c.statut)) : -1; }

  /* L'étape courante se déduit de l'état : une commande créée avec « Créer et réserver » passe directement l'étape 3. */
  function etapeAtteinte() {
    var x = g(), c = cmd(), r = rang(c);
    if (!x) return 0;
    if (x.fini) return ETAPES.length;
    if (x.vuKpi) return 6;
    if (r >= 4) return 5;
    if (r >= 2) return 4;
    if (r >= 1) return 3;
    if (c) return 2;
    if (x.formulaireOuvert) return 1;
    return 0;
  }

  function demarrer() {
    if (!A.peut('creer_commande')) { var sel = $('#role'); sel.value = 'direction'; A.role = 'direction'; A.notifier('Le scénario se joue en vue Direction, qui a tous les droits.', 'info'); }
    var stock = {}; LIGNES.forEach(function (l) { var p = D.produit(A.etat, l.produit); stock[l.produit] = { stock: p.stock, reserve: p.reserve }; });
    A.guideEtat = { actif: true, debut: Date.now(), avant: Object.assign({}, A.k), stock: stock, id: null, formulaireOuvert: false, vuKpi: false, fini: false, passees: 0 };
    A.guideActif = true; A.accueil = false;
    sauver();
    A.aller('#/tableau');
    afficher(true);
  }
  A.gestes.guide = function () { if (A.guideActif) { afficher(true); return; } demarrer(); };

  function quitter(sansMessage) {
    A.guideActif = false;
    if (A.guideEtat) A.guideEtat.actif = false;
    sauver();
    $('#guide').hidden = true; $('#guide').innerHTML = '';
    nettoyerCibles();
    if (!sansMessage) A.notifier('Scénario quitté. Vous pouvez le reprendre avec « Tester un scénario en 3 minutes ».', 'info');
    A.rendre();
  }
  A.gestes['guide-quitter'] = function () { quitter(); var b = $('[data-action="guide"]'); if (b) b.focus(); };
  A.gestes['guide-reinitialiser'] = function () { A.reinitialiser(); demarrer(); A.notifier('Démonstration réinitialisée, scénario relancé depuis le début.', 'ok'); };
  A.gestes['guide-aller'] = function (b) { A.aller(b.getAttribute('data-lien')); };

  function nettoyerCibles() { $$('.guide-cible').forEach(function (x) { x.classList.remove('guide-cible'); }); }
  function marquerCibles() {
    nettoyerCibles();
    if (!A.guideActif) return;
    var n = etapeAtteinte(); if (n >= ETAPES.length) return;
    var et = ETAPES[n], c = cmd();
    $$(et.cible).forEach(function (x) {
      if (x.matches('[role="menuitem"]') || (x.matches('[data-action="statut"]') && (!c || x.getAttribute('data-id') !== c.id))) return;
      x.classList.add('guide-cible');
    });
  }

  function resumeChangements() {
    var x = g(), k = A.k, av = x.avant, c = cmd();
    var lignes = [
      ['Chiffre d\'affaires HT · 30 j', D.formaterCompact(av.ca30), D.formaterCompact(k.ca30)],
      ['Commandes en cours', av.enCours, k.enCours],
      ['Encours clients TTC', D.formaterCompact(av.encours), D.formaterCompact(k.encours)]
    ];
    if (c) c.lignes.forEach(function (l) { var p = D.produit(A.etat, l.produit), s0 = x.stock[l.produit]; if (s0) lignes.push(['Stock physique · ' + p.nom, s0.stock, p.stock]); });
    return lignes;
  }

  function afficher(focus) {
    var boite = $('#guide');
    if (!A.guideActif) { boite.hidden = true; return; }
    var n = etapeAtteinte();
    if (n >= ETAPES.length) { boite.hidden = true; return; }
    var et = ETAPES[n], c = cmd();
    var h = '<section class="guide" role="region" aria-labelledby="guide-titre"><header class="guide-tete"><p class="surtitre">Scénario guidé · étape ' + (n + 1) + ' sur ' + ETAPES.length + '</p><button type="button" class="btn btn--icone btn--petit" data-action="guide-quitter" aria-label="Quitter le scénario">' + ic('croix') + '</button></header>' +
      '<div class="guide-progression" role="progressbar" aria-label="Progression du scénario" aria-valuemin="0" aria-valuemax="' + ETAPES.length + '" aria-valuenow="' + n + '"><i style="width:' + (n / ETAPES.length * 100) + '%"></i></div>' +
      '<ol class="guide-etapes" aria-hidden="true">' + ETAPES.map(function (x, i) { return '<li class="' + (i < n ? 'faite' : i === n ? 'courante' : '') + '"></li>'; }).join('') + '</ol>' +
      '<div aria-live="polite"><h2 id="guide-titre" tabindex="-1">' + e(et.titre) + '</h2><p>' + et.texte + '</p>';
    if (c && n >= 2) h += '<p class="guide-cmd">' + ic('commandes') + 'Votre commande : <a href="#/commandes/' + e(c.id) + '">' + e(c.id) + '</a> ' + A.badge(c.statut) + '</p>';
    if (et.cle === 'statut' && c && c.statut === 'prete') h += '<p class="guide-ok">' + ic('coche') + 'Prête. Il reste à l\'expédier.</p>';
    if (et.cle === 'kpi') h += '<table class="table table--compacte guide-table"><caption>Avant et après votre commande</caption><thead><tr><th scope="col">Indicateur</th><th scope="col" class="num">Avant</th><th scope="col" class="num">Après</th></tr></thead><tbody>' + resumeChangements().map(function (l) { return '<tr><th scope="row">' + e(l[0]) + '</th><td class="num">' + e(l[1]) + '</td><td class="num"><b>' + e(l[2]) + '</b></td></tr>'; }).join('') + '</tbody></table>';
    h += '</div><div class="guide-actions">';
    if (et.aide && A.modaleActive && A.form) h += A.bouton({ action: 'guide-remplir', texte: et.aide, icone: 'baguette', classe: 'btn--petit' });
    if (et.allerA && A.route.module !== et.allerA.slice(2) && !(et.cle === 'statut' && A.route.module === 'commandes')) h += A.bouton({ action: 'guide-aller', data: { lien: et.allerA }, texte: 'Y aller', icone: 'droite', classe: 'btn--petit btn--plein' });
    if (et.cle === 'reserver' && c && !(A.route.module === 'commandes' && A.route.id === c.id)) h += A.bouton({ action: 'guide-aller', data: { lien: '#/commandes/' + c.id }, texte: 'Ouvrir la commande', icone: 'droite', classe: 'btn--petit btn--plein' });
    h += A.bouton({ action: 'guide-passer', texte: et.passer, classe: 'btn--petit btn--discret', titre: 'Réalise l\'étape avec les mêmes règles que l\'interface' }) + '</div>' +
      '<footer class="guide-pied"><button type="button" class="lien-bouton" data-action="guide-reinitialiser">' + ic('recharger') + 'Réinitialiser</button><button type="button" class="lien-bouton" data-action="guide-quitter">Quitter le guide</button></footer></section>';
    boite.hidden = false;
    var titreAvant = $('#guide-titre') && $('#guide-titre').textContent;
    boite.innerHTML = h;
    if (focus && titreAvant !== et.titre && !A.modaleActive) $('#guide-titre').focus({ preventScroll: true });
    marquerCibles();
  }

  /* « Remplir pour moi » : prépare la saisie sans l'envoyer ; le visiteur clique lui-même sur « Créer » */
  A.gestes['guide-remplir'] = function () {
    if (!A.form) return;
    A.form.client = CLIENT; A.form.lignes = lignesPossibles(); A.form.q = ''; A.form.erreur = null;
    A.modaleActive.rendre(); afficher();
    var b = $('[data-focus="nc-creer"]'); if (b) { b.classList.add('guide-cible'); b.focus(); }
  };
  function lignesPossibles() {
    return LIGNES.map(function (l) { var p = D.produit(A.etat, l.produit); return { produit: l.produit, qte: Math.max(1, Math.min(l.qte, D.disponible(p))) }; }).filter(function (l) { return D.disponible(D.produit(A.etat, l.produit)) > 0; });
  }
  A.gestes['guide-passer'] = function () {
    var n = etapeAtteinte(), c = cmd();
    g().passees++;
    if (n === 0) { A.gestes['nouvelle-commande'](); return; }
    if (n === 1) {
      if (A.modaleActive) A.fermerModale();
      var res = A.agir({ type: 'creer_commande', client: CLIENT, lignes: lignesPossibles(), canal: 'WhatsApp', note: 'Commande du scénario guidé' }, { silencieux: true });
      if (res.ok) { g().id = res.resultat.id; sauver(); A.notifier(res.resultat.id + ' créée pour Supérette Les Orangers.', 'ok'); A.aller('#/commandes/' + res.resultat.id); }
      else A.notifier(res.erreur.message, 'erreur');
      return;
    }
    if (n === 2) { var r = A.changerStatut(c.id, 'confirmee'); if (r.ok) A.aller('#/commandes/' + c.id); return; }
    if (n === 3) { A.aller('#/preparation'); A.changerStatut(c.id, 'en_preparation'); return; }
    if (n === 4) { if (c.statut === 'en_preparation') A.changerStatut(c.id, 'prete'); if (cmd().statut === 'prete') A.changerStatut(c.id, 'expediee'); A.aller('#/tableau'); return; }
    if (n === 5) { g().vuKpi = true; terminer(); }
  };

  function terminer() {
    var x = g(), c = cmd();
    x.fini = true; x.actif = false; A.guideActif = false; sauver();
    $('#guide').hidden = true; nettoyerCibles();
    var cl = c ? D.client(A.etat, c.client) : null, mt = c ? D.montants(c) : null;
    var duree = Math.max(1, Math.round((Date.now() - x.debut) / 60000));
    A.ouvrirModale({ titre: 'Scénario terminé', large: false, contenu: function () {
      return '<div class="resume"><p class="resume-intro">En ' + pluriel(duree, 'minute') + ', vous avez fait vivre une commande de bout en bout, avec les mêmes règles qu\'un vrai logiciel de distribution.</p>' +
        (c ? '<ol class="resume-liste"><li>' + ic('commandes') + '<div><b>Commande ' + e(c.id) + '</b> pour ' + e(cl.nom) + ' : ' + A.mad(mt.ttc) + ' TTC, remise client de ' + c.remise + ' % appliquée.</div></li><li>' + ic('stock') + '<div><b>Stock vérifié puis réservé</b> à la confirmation, sans double réservation possible.</div></li><li>' + ic('camion') + '<div><b>Préparée puis expédiée</b> : le stock physique a baissé, l\'échéance de paiement est fixée au ' + e(D.dateCourte(c.echeance || A.etat.jour)) + '.</div></li><li>' + ic('grille') + '<div><b>Indicateurs à jour</b> : chiffre d\'affaires, encours et activité récente ont suivi.</div></li></ol>' : '') +
        '<table class="table table--compacte"><caption class="visuellement-cache">Avant et après</caption><thead><tr><th scope="col">Indicateur</th><th scope="col" class="num">Avant</th><th scope="col" class="num">Après</th></tr></thead><tbody>' + resumeChangements().map(function (l) { return '<tr><th scope="row">' + e(l[0]) + '</th><td class="num">' + e(l[1]) + '</td><td class="num"><b>' + e(l[2]) + '</b></td></tr>'; }).join('') + '</tbody></table>' +
        '<p class="discret">Entreprise, opérations et chiffres fictifs, créés pour la démonstration : ce ne sont pas des résultats obtenus chez un client.</p>' +
        '<div class="resume-cta"><h3>Vous aimeriez un outil adapté à votre entreprise ?</h3><p>Nous partons de votre façon de vendre : vos clients, vos produits, vos règles.</p><a class="btn btn--plein btn--grand" data-lien-legantis="#demande" href="' + e(A.lienLegantis()) + '">Discuter de mon projet avec Legantis' + ic('droite') + '</a></div>' +
        '<div class="modale-pied">' + A.bouton({ action: 'guide-recommencer', texte: 'Recommencer le scénario', icone: 'recharger', classe: 'btn--discret' }) + A.bouton({ action: 'fermer-modale', texte: 'Continuer à explorer', classe: '' }) + '</div></div>';
    } });
    A.emettre('guide-fini', x);
  }
  function pluriel(n, m) { return A.pluriel(n, m); }
  A.gestes['guide-recommencer'] = function () { A.fermerModale(); A.reinitialiser(); demarrer(); };

  /* Observation de la session */
  A.sur('formulaire', function () { if (A.guideActif && g() && !g().formulaireOuvert) { g().formulaireOuvert = true; sauver(); afficher(true); } });
  A.sur('modale', function () { setTimeout(function () { if (A.guideActif) afficher(); }, 0); });
  A.sur('action', function (x) {
    if (!A.guideActif || !g()) return;
    if (x.action.type === 'creer_commande' && !g().id) { g().id = x.resultat.id; sauver(); }
    var c = cmd();
    if (c && c.statut === 'annulee') { A.notifier('La commande du scénario a été annulée : le guide repart de la création.', 'info'); g().id = null; g().formulaireOuvert = false; sauver(); }
    setTimeout(function () { afficher(true); }, 0);
  });
  A.sur('route', function (r) {
    if (!A.guideActif || !g()) return;
    if (etapeAtteinte() === 5 && r.module === 'tableau' && !r.id) { setTimeout(function () { afficher(true); }, 0); }
  });
  A.sur('rendu', function () { if (A.guideActif) { afficher(); } });
  A.sur('reinitialisation', function () { if (!A.guideActif) { $('#guide').hidden = true; } });
  A.sur('pret', function () {
    var x = g();
    if (x && x.actif && !x.fini) { A.guideActif = true; afficher(); }
    else if (new URLSearchParams(location.search).get('scenario') === '1' && !(x && x.fini)) demarrer();
  });
})();
