/* Meta Pixel de legantis.net — PRÉPARÉ, NON ACTIVÉ (30/10/2026). Aucune page ne charge ce fichier ; la page de mentions légales dit « ni pixel publicitaire », ce qui reste exact.
   Activation : décision du user après vérification juridique, voir mesure/README.md (« Meta Pixel »).

   Principes :
   - rien ne se charge sans un accord explicite du visiteur : ni le script de Meta, ni requête, ni cookie ;
   - sans réponse, rien ne se charge ; aucun mur, aucune case précochée ;
   - le choix est conservé six mois au plus, comme l'exige la délibération CNDP D-939-2025 (§ 6) ; à l'activation, les mentions légales ne peuvent donc plus dire « ni cookie ni stockage » ;
   - seuls deux événements standard partent : Lead (demande réellement envoyée) et Contact (clic WhatsApp ou téléphone) ;
   - jamais de donnée saisie ni de correspondance avancée (advanced matching) : aucun nom, e-mail ou téléphone, en clair ou haché ;
   - Lead ne part qu'une fois par page, avec un eventID pour que Meta dédoublonne un rechargement ou un futur envoi serveur.
   Identifiant : window.LEGANTIS_PIXEL_ID, à poser avant ce script ; sans lui, rien ne se passe. */
(function () {
  'use strict';
  var ID = window.LEGANTIS_PIXEL_ID;
  if (!ID || !/^\d{10,20}$/.test(String(ID))) return;

  var actif = false, leadEnvoye = false, enAttente = [];
  var CLE = 'legantis-mesure-meta', SIX_MOIS = 182 * 24 * 3600 * 1000;

  function choixConserve() {
    try {
      var c = JSON.parse(localStorage.getItem(CLE));
      if (c && (c.valeur === 'oui' || c.valeur === 'non') && Date.now() - c.date < SIX_MOIS) return c.valeur;
      localStorage.removeItem(CLE);
    } catch (e) { /* stockage bloqué : la question reviendra, rien ne se charge sans réponse */ }
    return null;
  }
  function conserver(valeur) { try { localStorage.setItem(CLE, JSON.stringify({ valeur: valeur, date: Date.now() })); } catch (e) { /* idem */ } }

  function suivre(nom, parametres, identifiant) {
    if (!actif) { enAttente.push([nom, parametres, identifiant]); return; }
    window.fbq('track', nom, parametres || {}, identifiant ? { eventID: identifiant } : undefined);
  }

  function charger() {
    /* Code d'amorçage publié par Meta, réécrit sans noindex ni <noscript> : la balise image de repli contournerait le consentement. */
    var fbq = window.fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    var s = document.createElement('script');
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    fbq('init', String(ID), {}, { autoConfig: false });
    fbq('track', 'PageView');
    actif = true;
    enAttente.splice(0).forEach(function (e) { suivre(e[0], e[1], e[2]); });
  }

  function lead(parcours) {
    if (leadEnvoye) return;
    leadEnvoye = true;
    suivre('Lead', { content_name: parcours || 'devis' }, 'lead-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  }

  function bandeau() {
    var d = document.createElement('div');
    d.className = 'consentement-mesure';
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Choix de mesure publicitaire');
    d.style.cssText = 'position:fixed;z-index:70;inset:auto 12px 84px 12px;max-width:520px;padding:14px 16px;background:var(--carte);color:var(--encre);border:1px solid var(--filet);border-radius:8px;box-shadow:var(--ombre);font-size:.92rem';
    var p = document.createElement('p');
    p.textContent = 'Acceptez-vous une mesure publicitaire de Meta sur cette page ? Elle dépose un cookie et transmet votre visite à Meta.';
    var oui = document.createElement('button'), non = document.createElement('button');
    oui.type = non.type = 'button';
    oui.textContent = 'Accepter'; non.textContent = 'Refuser';
    oui.className = non.className = 'bouton bouton--petit';
    oui.addEventListener('click', function () { conserver('oui'); d.remove(); charger(); });
    non.addEventListener('click', function () { conserver('non'); d.remove(); enAttente.length = 0; });
    d.appendChild(p); d.appendChild(oui); d.appendChild(non);
    document.body.appendChild(d);
  }

  document.addEventListener('legantis:demande-envoyee', function (ev) { lead(ev.detail && ev.detail.parcours); });
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (a && /^(https:\/\/wa\.me\/|tel:)/.test(a.getAttribute('href') || '')) suivre('Contact');
  }, { capture: true, passive: true });
  if (location.hash === '#devis-envoye') lead('sans-script');
  var choix = choixConserve();
  if (choix === 'oui') charger(); else if (choix !== 'non') bandeau();
  window.legantisChoixMesure = bandeau;   // à relier à un bouton du pied : le visiteur doit pouvoir revenir sur son choix
})();
