/* Source de campagne (UTM) dans les démonstrations Maison Tilal, Mizan Technique et Institut Naïa : lue dans l'adresse de la page, recopiée
   sur les liens du site au chargement et au clic (les liens écrits ensuite par la démonstration sont donc couverts). Ni cookie, ni stockage,
   ni requête : sans paramètre dans l'adresse, le script ne fait rien. En quittant la démonstration vers une page de Legantis, utm_content
   prend « demo-<nom> » s'il est vide, comme dans Distribution OS (app.js, lienLegantis). */
(function () {
  'use strict';
  var CHAMPS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var params = new URLSearchParams(location.search);
  var presents = CHAMPS.filter(function (c) { return params.get(c); });
  if (!presents.length) return;
  var demo = (/\/realisations\/demos\/([a-z-]+)\//.exec(location.pathname) || [])[1];

  function marquer(a) {
    var brut = a.getAttribute('href');
    if (!brut || brut.charAt(0) === '#' || a.hasAttribute('download')) return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    presents.forEach(function (c) { if (!u.searchParams.has(c)) u.searchParams.set(c, params.get(c).slice(0, 80)); });
    var dansLaDemo = demo && u.pathname.indexOf('/realisations/demos/' + demo + '/') === 0;
    if (!dansLaDemo && demo && !u.searchParams.get('utm_content') && u.searchParams.get('utm_source')) u.searchParams.set('utm_content', 'demo-' + demo);
    a.href = u.href;
  }

  document.querySelectorAll('a[href]').forEach(marquer);
  ['click', 'auxclick'].forEach(function (type) {
    document.addEventListener(type, function (ev) { var a = ev.target.closest && ev.target.closest('a[href]'); if (a) marquer(a); }, true);
  });
})();
