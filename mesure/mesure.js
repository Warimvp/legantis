/* Mesure d'audience de legantis.net — PRÉPARÉE, NON ACTIVÉE (26/10/2026). Aucune page ne charge ce fichier.
   Activation (décision du user : outil, compte, mentions légales) : voir mesure/README.md.

   Rôle : transformer les gestes utiles en événements personnalisés pour un outil de mesure sans cookie compatible avec l'API
   `window.plausible(nom, { props })` (Plausible ; Umami fournit l'équivalent `umami.track`, adapté plus bas). Les pages vues
   et les sources (référent, UTM) sont mesurées par l'outil lui-même. Ce script n'en sait pas plus que la page :
   - il ne lit JAMAIS un champ du formulaire, une adresse, un nom ni un texte saisi ;
   - il n'écrit ni cookie ni stockage ; il ne fait aucune requête lui-même (l'outil s'en charge) ;
   - sans outil chargé, il ne fait rien.
   Événements : « Devis clic » (emplacement), « Formulaire vu », « Devis envoyé » / « Devis échec » (arrivée sur l'ancre que
   le Worker renvoie ; le chiffre de référence reste le compteur du Worker), « Réalisations vues », « Produit clic »
   (produit, destination), « E-mail clic », « Téléphone clic » (emplacement), et depuis le 30/10/2026 « WhatsApp clic », « Mini-audit clic », « Simulateur ouvert »,
   « Simulateur étape » (rang), « Demande envoyée » (parcours). */
(function () {
  'use strict';

  function envoyer(nom, props) {
    try {
      if (typeof window.plausible === 'function') window.plausible(nom, { props: props || {} });
      else if (window.umami && typeof window.umami.track === 'function') window.umami.track(nom, props || {});
    } catch (e) { /* une panne de mesure ne doit jamais gêner la page */ }
  }

  // Emplacement d'un lien : une étiquette fixe tirée des classes ou de la section, jamais du texte saisi.
  function emplacement(a) {
    if (a.classList.contains('barre-cta')) return 'barre';
    if (a.classList.contains('menu-devis')) return 'menu';
    if (a.classList.contains('pied-devis')) return 'pied';
    if (a.classList.contains('badge')) return 'badge';
    if (a.closest('.ouverture')) return 'ouverture';
    if (a.closest('.contact-rapide')) return 'barre-mobile';
    if (a.closest('.service-tete')) return 'en-tete';
    if (a.closest('.service-cta')) return 'milieu';
    if (a.closest('.catalogue-cta')) return 'catalogue';
    if (a.closest('.packs')) return 'offres';
    if (a.closest('#offres')) return 'sur-devis';
    if (a.closest('#pourquoi')) return 'pourquoi';
    if (a.closest('.appel')) return 'appel-final';
    if (a.closest('.pied')) return 'pied';
    if (a.closest('.menu-plein')) return 'menu';
    return 'autre';
  }

  function produit(a) {
    var carte = a.closest('.titre');
    if (!carte) return null;
    var m = /titre--(atlasya|rihla|ostad)/.exec(carte.className);
    return m ? m[1] : null;
  }

  function destination(href) {
    if (/apps\.apple\.com/.test(href)) return 'app-store';
    if (/etude-de-cas-|case-study-/.test(href)) return 'etude-de-cas';
    if (/#produits$/.test(href)) return 'catalogue';
    return 'site-du-produit';
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/(^|\/)#devis$|estimer-mon-projet\/|^#demande$/.test(href)) return envoyer('Devis clic', { emplacement: emplacement(a) });
    if (/audit-gratuit\//.test(href)) return envoyer('Mini-audit clic', { emplacement: emplacement(a) });
    if (/(^|\/)commandes\/$/.test(href)) return envoyer('Offre Commandes clic', { emplacement: emplacement(a) });
    if (/^https:\/\/wa\.me\//.test(href)) return envoyer('WhatsApp clic', { emplacement: emplacement(a) });
    if (/^mailto:/.test(href)) return envoyer('E-mail clic', { emplacement: emplacement(a) });
    if (/^tel:/.test(href)) return envoyer('Téléphone clic', { emplacement: emplacement(a) });
    var p = produit(a);
    if (p) return envoyer('Produit clic', { produit: p, destination: destination(href) });
  }, { capture: true, passive: true });

  // Sections vues une fois par page. On observe une PETITE cible, visible en entier sur tout écran : un seuil sur la section
  // entière ne serait jamais atteint au téléphone (le Catalogue y fait plus de trois écrans de haut).
  function vueUneFois(selecteur, nom) {
    var el = document.querySelector(selecteur);
    if (!el || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entrees) {
      if (entrees.some(function (e) { return e.isIntersecting; })) { envoyer(nom); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
  }
  vueUneFois('#devis-nom', 'Formulaire vu');
  vueUneFois('#produits .titre .couverture', 'Réalisations vues');

  // Simulateur : ouverture et étape atteinte (le rang seulement, jamais un choix du visiteur).
  var compteur = document.querySelector('.assistant-compteur');
  if (compteur) {
    envoyer('Simulateur ouvert');
    var vues = {};
    new MutationObserver(function () {
      var rang = /\d+/.exec(compteur.textContent);
      if (rang && !vues[rang[0]]) { vues[rang[0]] = true; envoyer('Simulateur étape', { rang: rang[0] }); }
    }).observe(compteur, { childList: true, characterData: true, subtree: true });
  }

  // Envoi sans quitter la page (conversion.js) : l'événement ne porte que le nom du parcours.
  document.addEventListener('legantis:demande-envoyee', function (ev) { envoyer('Demande envoyée', { parcours: ev.detail && ev.detail.parcours }); });

  // Retour du Worker (303 vers #devis-envoye ou #devis-echec) : une fois, à l'arrivée.
  if (location.hash === '#devis-envoye') envoyer('Devis envoyé');
  else if (location.hash === '#devis-echec') envoyer('Devis échec');
})();
