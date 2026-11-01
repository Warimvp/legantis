/* Distribution OS — graphiques en SVG et HTML, écrits pour la démonstration (aucune bibliothèque : quelques fonctions suffisent et rien n'est chargé d'ailleurs).
   Une série par graphique, couleur d'accent, barres de 24 px au plus à bout arrondi, filets fins, infobulle au survol, et toujours un tableau des données à côté. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function e(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); }

  /* Graduations « rondes » : 0, 1, 2, 2,5 ou 5 × 10^n */
  function graduations(max, n) {
    if (max <= 0) return [0, 1];
    var brut = max / n, p = Math.pow(10, Math.floor(Math.log10(brut))), pas = [1, 2, 2.5, 5, 10].map(function (x) { return x * p; }).find(function (x) { return x >= brut; });
    var sortie = []; for (var v = 0; v <= max + pas * 0.001; v += pas) sortie.push(v);
    if (sortie[sortie.length - 1] < max) sortie.push(sortie[sortie.length - 1] + pas);
    return sortie;
  }
  function arrondiHaut(x, y, l, h, r) {   // barre arrondie en haut seulement (bout de données), carrée sur la ligne de base
    r = Math.min(r, l / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + l - r) + 'Q' + (x + l) + ',' + y + ' ' + (x + l) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  /* Colonnes : points = [{ etiquette, valeur, infobulle, attenue }] ; format(v) pour l'axe ; marque = index à étiqueter */
  function colonnes(boite, o) {
    var L = Math.max(260, boite.clientWidth), H = o.hauteur || 220, g = 46, d = 8, h = 12, b = 26;
    var pts = o.points, max = Math.max.apply(null, pts.map(function (p) { return p.valeur; }).concat([0]));
    var grad = graduations(max, 4), top = grad[grad.length - 1] || 1;
    var lb = (L - g - d) / pts.length, lBar = Math.min(24, Math.max(6, lb * 0.58));
    var y = function (v) { return h + (H - h - b) * (1 - v / top); };
    var svg = '<svg class="graph-svg" width="' + L + '" height="' + H + '" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="' + e(o.titre) + '">';
    grad.forEach(function (v) { svg += '<line class="graph-grille" x1="' + g + '" x2="' + (L - d) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="graph-axe" x="' + (g - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + e(o.format(v)) + '</text>'; });
    var pasEtiquette = Math.ceil(pts.length / Math.max(2, Math.floor((L - g) / 52)));
    pts.forEach(function (p, i) {
      var cx = g + lb * i + lb / 2, x = cx - lBar / 2, yv = y(p.valeur), hv = Math.max(0, H - b - yv);
      svg += '<g class="graph-colonne' + (p.attenue ? ' graph-colonne--attenue' : '') + '" data-tip="' + e(p.infobulle) + '">';
      svg += '<rect class="graph-cible" x="' + (g + lb * i) + '" y="' + h + '" width="' + lb + '" height="' + (H - h - b) + '"/>';
      if (hv > 0) svg += '<path class="graph-barre" d="' + arrondiHaut(x, yv, lBar, hv, 4) + '"/>';
      svg += '</g>';
      if ((pts.length - 1 - i) % pasEtiquette === 0) svg += '<text class="graph-axe" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + e(p.etiquette) + '</text>';
      if (o.marque === i && p.valeur > 0) svg += '<text class="graph-valeur" x="' + cx + '" y="' + (yv - 7) + '" text-anchor="middle">' + e(o.format(p.valeur, true)) + '</text>';
    });
    svg += '<line class="graph-base" x1="' + g + '" x2="' + (L - d) + '" y1="' + (H - b) + '" y2="' + (H - b) + '"/></svg>';
    boite.innerHTML = svg;
  }

  /* Courbe (une série) avec aire à 10 %, points de 8 px cerclés de la couleur du fond, guide vertical au survol */
  function courbe(boite, o) {
    var L = Math.max(260, boite.clientWidth), H = o.hauteur || 200, g = 40, d = 14, h = 14, b = 26;
    var pts = o.points, max = Math.max.apply(null, pts.map(function (p) { return p.valeur; }).concat([o.min || 0]));
    var grad = graduations(max, 4), top = grad[grad.length - 1] || 1;
    var x = function (i) { return g + (L - g - d) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); };
    var y = function (v) { return h + (H - h - b) * (1 - v / top); };
    var svg = '<svg class="graph-svg" width="' + L + '" height="' + H + '" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="' + e(o.titre) + '">';
    grad.forEach(function (v) { svg += '<line class="graph-grille" x1="' + g + '" x2="' + (L - d) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="graph-axe" x="' + (g - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + e(o.format(v)) + '</text>'; });
    var ligne = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.valeur).toFixed(1); }).join('');
    svg += '<path class="graph-aire" d="' + ligne + 'L' + x(pts.length - 1) + ',' + (H - b) + 'L' + x(0) + ',' + (H - b) + 'Z"/><path class="graph-ligne" d="' + ligne + '"/>';
    var pasEtiquette = Math.ceil(pts.length / Math.max(2, Math.floor((L - g) / 52)));
    var lb = (L - g - d) / Math.max(1, pts.length - 1);
    pts.forEach(function (p, i) {
      svg += '<g class="graph-point" data-tip="' + e(p.infobulle) + '"><rect class="graph-cible" x="' + (x(i) - lb / 2) + '" y="' + h + '" width="' + lb + '" height="' + (H - h - b) + '"/><line class="graph-guide" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + h + '" y2="' + (H - b) + '"/><circle class="graph-rond" cx="' + x(i) + '" cy="' + y(p.valeur) + '" r="4"/></g>';
      if ((pts.length - 1 - i) % pasEtiquette === 0) svg += '<text class="graph-axe" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + e(p.etiquette) + '</text>';
    });
    var dernier = pts[pts.length - 1];
    if (dernier) svg += '<text class="graph-valeur" x="' + (x(pts.length - 1) - 6) + '" y="' + (y(dernier.valeur) - 9) + '" text-anchor="end">' + e(o.format(dernier.valeur, true)) + '</text>';
    svg += '<line class="graph-base" x1="' + g + '" x2="' + (L - d) + '" y1="' + (H - b) + '" y2="' + (H - b) + '"/></svg>';
    boite.innerHTML = svg;
  }

  /* Mini-courbe d'une tuile d'indicateur */
  function tendance(valeurs) {
    if (!valeurs || valeurs.length < 2) return '';
    var L = 96, H = 28, max = Math.max.apply(null, valeurs), min = Math.min.apply(null, valeurs), ec = max - min || 1;
    var pts = valeurs.map(function (v, i) { return (i * (L - 4) / (valeurs.length - 1) + 2).toFixed(1) + ',' + (H - 3 - (v - min) / ec * (H - 6)).toFixed(1); });
    var der = pts[pts.length - 1].split(',');
    return '<svg class="tendance" viewBox="0 0 ' + L + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '"/><circle cx="' + der[0] + '" cy="' + der[1] + '" r="3"/></svg>';
  }

  /* Barres horizontales en HTML (lisibles, sélectionnables, sans calcul de texte) */
  function barresH(items, format, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (x) { return x.valeur; }).concat([1]));
    return '<ol class="barres-h' + (opts.classe ? ' ' + opts.classe : '') + '">' + items.map(function (x) {
      return '<li' + (x.infobulle ? ' data-tip="' + e(x.infobulle) + '"' : '') + '><span class="barres-h-nom">' + (x.lien ? '<a href="' + e(x.lien) + '">' + e(x.nom) + '</a>' : e(x.nom)) + (x.sous ? '<small>' + e(x.sous) + '</small>' : '') + '</span><span class="barres-h-piste"><i style="width:' + (x.valeur / max * 100).toFixed(1) + '%"' + (x.statut ? ' class="statut-fond--' + x.statut + '"' : '') + '></i></span><span class="barres-h-val">' + e(format(x.valeur)) + '</span></li>';
    }).join('') + '</ol>';
  }

  /* Infobulle commune : survol à la souris, et focus au clavier pour les éléments focusables */
  var bulle = null;
  function montrer(cible, x, y) {
    if (!bulle) { bulle = document.createElement('div'); bulle.className = 'infobulle'; bulle.setAttribute('role', 'tooltip'); document.body.appendChild(bulle); }
    bulle.textContent = cible.getAttribute('data-tip');
    bulle.classList.add('visible');
    var r = bulle.getBoundingClientRect(), L = document.documentElement.clientWidth;
    var px = Math.min(Math.max(8, x - r.width / 2), L - r.width - 8), py = y - r.height - 14;
    if (py < 8) py = y + 18;
    bulle.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)';
  }
  function cacher() { if (bulle) bulle.classList.remove('visible'); }
  document.addEventListener('pointermove', function (ev) {
    var c = ev.target.closest && ev.target.closest('[data-tip]');
    if (c && c.getAttribute('data-tip')) { montrer(c, ev.clientX, ev.clientY); var actif = document.querySelector('.survole'); if (actif !== c) { if (actif) actif.classList.remove('survole'); c.classList.add('survole'); } }
    else { cacher(); var a = document.querySelector('.survole'); if (a) a.classList.remove('survole'); }
  }, { passive: true });
  document.addEventListener('focusin', function (ev) { var c = ev.target.closest && ev.target.closest('[data-tip]'); if (c && c.getAttribute('data-tip')) { var r = c.getBoundingClientRect(); montrer(c, r.left + r.width / 2, r.top); } else cacher(); });
  document.addEventListener('scroll', cacher, { passive: true, capture: true });

  window.DOSGraph = { colonnes: colonnes, courbe: courbe, tendance: tendance, barresH: barresH, cacher: cacher, graduations: graduations, NS: NS };
})();
