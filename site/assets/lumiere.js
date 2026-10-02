/* Legantis — effets à la souris : le seul script du site. Sans dépendance, sans réseau, sans cookie, sans stockage.

   Amélioration progressive : sans ce fichier, au toucher, sans pointeur précis, en mouvement réduit ou en contraste
   renforcé, le site reste celui que décrit site.css. Quand les effets sont permis, le script pose la classe « lumiere »
   sur <html> ; toute la CSS qui en dépend est écrite sous cette classe, la retirer rend le site à son état de repli.
   Les réglages sont ré-évalués en direct : on peut brancher ou débrancher une souris, changer de réglage système.

   Un effet est un objet { demarrer, arreter } inscrit dans `effets`. L'ossature le démarre quand les effets sont permis,
   l'arrête sinon, et le redémarre au retour. Seuls les pointeurs de type souris comptent (pas le stylet, pas le doigt).
   Les effets qui suivent le pointeur s'abonnent au suivi commun : un seul écouteur passif, une seule mise à jour par image.
   Trois effets : le halo de l'ouverture, le projecteur qui suit le curseur dans chaque carte, et le curseur personnalisé
   (un point et un anneau, qui remplacent le curseur système tant que tout le permet). */
(function () {
  'use strict';

  if (!window.matchMedia) return;

  var racine = document.documentElement;
  var PASSIF = { passive: true };

  /* ── Capacités ─────────────────────────────────────────────── */
  var pointeurFin = matchMedia('(hover: hover) and (pointer: fine)');
  var mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)');
  var contrastes = matchMedia('(forced-colors: active), (prefers-contrast: more)');

  /* Les contrastes renforcés coupent aussi les effets : dans ce mode le site doit rester celui du repli, à l'identique. */
  function permis() {
    return pointeurFin.matches && !mouvementReduit.matches && !contrastes.matches;
  }

  var effets = [];
  var actifs = false;

  function inscrire(effet) {
    effets.push(effet);
  }

  function evaluer() {
    var oui = permis();
    if (oui === actifs) return;
    actifs = oui;
    if (oui) racine.classList.add('lumiere');
    for (var i = 0; i < effets.length; i++) {
      if (oui) effets[i].demarrer(); else effets[i].arreter();
    }
    if (!oui) racine.classList.remove('lumiere');
  }

  function surveiller(requete) {
    if (requete.addEventListener) requete.addEventListener('change', evaluer);
    else requete.addListener(evaluer);   // Safari avant 14
  }

  /* ── Suivi du pointeur, commun à tous les effets ───────────── */
  var souris = { x: 0, y: 0, cible: null, connue: false };   // dernière position de la souris, en pixels de fenêtre, et élément visé
  var abonnes = [];
  var sorties = [];      // pour chaque abonné (même rang), la fonction à appeler quand la souris quitte la page, ou null
  var disposition = 0;   // change à chaque défilement ou redimensionnement : les rectangles mis en cache sont périmés
  var vuCible = -1;      // valeur de `disposition` quand souris.cible a été lue pour la dernière fois
  var image = 0;         // requestAnimationFrame en attente
  var ecoute = false;

  /* Le gestionnaire ne lit ni ne change rien dans la page : il note la position et réclame une image. */
  function aBouge(e) {
    if (e.pointerType !== 'mouse') return;
    souris.x = e.clientX;
    souris.y = e.clientY;
    souris.cible = e.target;   // le navigateur a déjà trouvé l'élément sous le pointeur : pas de lecture de la mise en page
    vuCible = disposition;
    souris.connue = true;
    planifier();
  }

  /* La souris a quitté la page : plus de position à suivre, les effets gardent leur dernière place (ceux qui ont
     donné une fonction de sortie à abonner() en sont prévenus). */
  function aSorti(e) {
    if (e.pointerType !== 'mouse') return;
    souris.connue = false;
    souris.cible = null;
    var liste = sorties.slice();
    for (var i = 0; i < liste.length; i++) if (liste[i]) liste[i]();
  }

  /* Défilement ou redimensionnement : sous une souris immobile, le contenu a bougé. */
  function aChange() {
    disposition++;
    if (souris.connue) planifier();
  }

  function planifier() {
    if (!image) image = requestAnimationFrame(diffuser);
  }

  function diffuser() {
    image = 0;
    if (souris.connue && vuCible !== disposition) {   // la page a bougé sous une souris immobile : l'élément visé est à relire, une seule fois pour tous les abonnés
      vuCible = disposition;
      souris.cible = document.elementFromPoint(souris.x, souris.y);
    }
    var liste = abonnes.slice();
    for (var i = 0; i < liste.length; i++) liste[i](souris.x, souris.y);
  }

  /* Un abonné reçoit (x, y) et lit `disposition` pour savoir s'il doit recalculer ses rectangles, et `souris.cible` pour
     l'élément visé. Il peut donner une seconde fonction, appelée quand la souris quitte la page.
     Tant qu'il n'y a aucun abonné, rien n'écoute. */
  function abonner(fonction, quandSort) {
    disposition++;
    if (abonnes.indexOf(fonction) >= 0) return;
    abonnes.push(fonction);
    sorties.push(quandSort || null);
    if (ecoute) return;
    ecoute = true;
    document.addEventListener('pointermove', aBouge, PASSIF);
    racine.addEventListener('pointerleave', aSorti, PASSIF);
    window.addEventListener('scroll', aChange, PASSIF);
    window.addEventListener('resize', aChange, PASSIF);
  }

  function desabonner(fonction) {
    var i = abonnes.indexOf(fonction);
    if (i >= 0) { abonnes.splice(i, 1); sorties.splice(i, 1); }
    if (abonnes.length || !ecoute) return;
    ecoute = false;
    document.removeEventListener('pointermove', aBouge, PASSIF);
    racine.removeEventListener('pointerleave', aSorti, PASSIF);
    window.removeEventListener('scroll', aChange, PASSIF);
    window.removeEventListener('resize', aChange, PASSIF);
    if (image) { cancelAnimationFrame(image); image = 0; }
  }

  /* ── Halo de l'ouverture ───────────────────────────────────── */
  /* Le halo suit la souris au pixel, dans le repère de .ouverture (et non dans celui de la fenêtre : après un défilement,
     les deux ne coïncident plus). Le retard doux vient d'une transition CSS sur `translate` (voir site.css) : composée par
     le processeur graphique, aucune boucle ici. Avant le premier mouvement, le halo reste à sa place de repos ; quand la
     souris sort de l'ouverture, il garde sa dernière position. La classe « allumee » (cœur plus clair, textes qui passent à
     un gris plus contrasté) n'existe que pendant que la souris est dans l'ouverture : elle est retirée à la sortie de
     l'ouverture, de la fenêtre, ou quand l'ouverture quitte l'écran, et les textes retrouvent leur couleur de repos. */
  (function () {
    var ouverture = document.querySelector('.ouverture');
    var halo = ouverture && ouverture.querySelector('.halo');
    if (!halo) return;

    /* Repli CSS sans script : 160 cases survolées, leurs règles :has() et un texte qui ne se sélectionne pas.
       Retirée du DOM, elle ne correspond plus à aucune règle et ne coûte plus aucun recalcul. */
    var capteurs = ouverture.querySelector(':scope > .capteurs');
    var apres = capteurs && capteurs.nextSibling;
    var observateur = null;
    var rect = null;
    var vuEn = -1;
    var allumee = false;

    function eteindre() {
      if (!allumee) return;
      allumee = false;
      ouverture.classList.remove('allumee');
    }

    function suivre(x, y) {
      if (vuEn !== disposition) {   // lecture de la mise en page : une fois par image au plus, avant toute écriture
        rect = ouverture.getBoundingClientRect();
        vuEn = disposition;
      }
      var dx = x - rect.left;
      var dy = y - rect.top;
      if (dx < 0 || dy < 0 || dx > rect.width || dy > rect.height) {   // hors de l'ouverture : dernière place gardée, cœur éteint
        eteindre();
        return;
      }
      halo.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
      if (!allumee) {
        allumee = true;
        ouverture.classList.add('allumee');
      }
    }

    /* Le suivi n'a de sens que tant que l'ouverture est à l'écran. */
    function regarder(entrees) {
      if (entrees[entrees.length - 1].isIntersecting) {
        abonner(suivre, eteindre);
      } else {
        desabonner(suivre);
        eteindre();
      }
    }

    inscrire({
      demarrer: function () {
        if (capteurs && capteurs.parentNode) {
          /* Souris déjà posée sur une case quand le script arrive : le halo est à la place de cette case. Sans la figer, il
             retomberait à sa place de repos dès que la grille disparaît (les règles :has() qui le portaient ne correspondent
             plus) et ne suivrait plus rien avant le prochain mouvement. Aucune case survolée (--halo-x vaut 0) : il est déjà
             à sa place de repos, calculée par la CSS (elle suit un redimensionnement), on n'y touche pas. */
          if (parseFloat(getComputedStyle(ouverture).getPropertyValue('--halo-x')) > 0) halo.style.translate = getComputedStyle(halo).translate;
          capteurs.parentNode.removeChild(capteurs);
        }
        abonner(suivre, eteindre);
        if ('IntersectionObserver' in window) {
          observateur = new IntersectionObserver(regarder);
          observateur.observe(ouverture);
        }
      },
      arreter: function () {
        if (observateur) { observateur.disconnect(); observateur = null; }
        desabonner(suivre);
        halo.style.removeProperty('translate');
        eteindre();
        rect = null;
        vuEn = -1;
        if (capteurs && !capteurs.parentNode) ouverture.insertBefore(capteurs, apres);
      }
    });
  })();

  /* ── Projecteur des cartes ─────────────────────────────────── */
  /* Sous le curseur, une lumière suit la souris dans la carte et le bord de la carte s'allume (voir « Projecteur des cartes » dans
     site.css). Le script ne fait qu'une chose : écrire --sx et --sy, la position du curseur dans le cadre intérieur de la carte
     survolée, sur cette carte seulement. L'allumage et l'extinction en fondu sont de la CSS (:hover et une transition d'opacité).
     La carte vient de closest() sur la cible de l'événement. Son origine est mise en cache : une lecture de la mise en page à
     l'entrée dans la carte, puis seulement après un défilement, un redimensionnement ou la fin de son soulèvement au survol
     (la carte monte de 3 px : l'origine lue en entrant serait décalée d'autant). Le suivi n'est abonné que tant qu'une carte est visible. */
  (function () {
    var CARTES = '.prestation, .offre, .titre, .epreuve, .atout, .fiche';
    var cartes = document.querySelectorAll(CARTES);
    if (!cartes.length) return;   // pages légales et 404 : aucune carte, rien à suivre

    var courante = null;   // carte sous le pointeur
    var origine = null;    // coin haut gauche de son cadre intérieur, en pixels de fenêtre
    var vuEn = -1;
    var ecrites = [];      // cartes qui portent --sx / --sy en ligne : à nettoyer à l'arrêt
    var visibles = [];
    var observateur = null;

    function suivre(x, y) {
      var cible = souris.cible;   // relue par le suivi commun quand la page a bougé sous une souris immobile
      if (vuEn !== disposition) {   // la page a bougé : l'origine de la carte est à relire
        vuEn = disposition;
        origine = null;
      }
      var carte = cible && cible.closest ? cible.closest(CARTES) : null;
      if (carte !== courante) {
        courante = carte;
        origine = null;
      }
      if (!carte) return;
      if (!origine) {   // une lecture par entrée dans une carte, avant toute écriture
        var r = carte.getBoundingClientRect();
        var s = getComputedStyle(carte);
        origine = { x: r.left + parseFloat(s.borderLeftWidth), y: r.top + parseFloat(s.borderTopWidth) };
        if (ecrites.indexOf(carte) < 0) ecrites.push(carte);
      }
      carte.style.setProperty('--sx', (x - origine.x).toFixed(1) + 'px');
      carte.style.setProperty('--sy', (y - origine.y).toFixed(1) + 'px');
    }

    /* Fin du soulèvement de la carte : son origine a changé, la lumière doit retrouver le curseur sans qu'il bouge. */
    function fini(e) {
      if (e.target === courante && e.propertyName === 'transform') aChange();
    }

    /* Suivi abonné seulement tant qu'au moins une carte est à l'écran. */
    function regarder(entrees) {
      for (var i = 0; i < entrees.length; i++) {
        var k = visibles.indexOf(entrees[i].target);
        if (entrees[i].isIntersecting && k < 0) visibles.push(entrees[i].target);
        else if (!entrees[i].isIntersecting && k >= 0) visibles.splice(k, 1);
      }
      if (visibles.length) abonner(suivre); else desabonner(suivre);
    }

    inscrire({
      demarrer: function () {
        document.addEventListener('transitionend', fini, PASSIF);
        if ('IntersectionObserver' in window) {
          observateur = new IntersectionObserver(regarder);
          for (var i = 0; i < cartes.length; i++) observateur.observe(cartes[i]);
        } else {
          abonner(suivre);
        }
      },
      arreter: function () {
        document.removeEventListener('transitionend', fini, PASSIF);
        if (observateur) { observateur.disconnect(); observateur = null; }
        visibles.length = 0;
        desabonner(suivre);
        for (var i = 0; i < ecrites.length; i++) {
          ecrites[i].style.removeProperty('--sx');
          ecrites[i].style.removeProperty('--sy');
        }
        ecrites.length = 0;
        courante = null;
        origine = null;
        vuEn = -1;
      }
    });
  })();

  /* ── Curseur personnalisé ──────────────────────────────────── */
  /* Un point (qui suit presque à l'instant) et un anneau (qui traîne, comme tenu par un ressort) remplacent le curseur système
     (voir « Curseur personnalisé » dans site.css). Le script crée un conteneur .curseur (aria-hidden, sans événements) contenant
     les deux, au premier mouvement d'une vraie souris seulement : jamais un point à (0, 0), jamais rien pour un doigt.
     Il pose alors la classe « curseur » sur <html> : elle seule masque le curseur système, et elle est retirée dès que le
     curseur personnalisé ne l'est plus (doigt ou stylet, souris sortie de la fenêtre ou posée sur une barre de défilement,
     réglage système changé).
     Les deux éléments ne bougent que par transform. La boucle d'animation est une seule requestAnimationFrame, indépendante de
     la fréquence d'images (ressort amorti critique, intégré exactement sur le temps écoulé), et elle s'arrête dès que le point et
     l'anneau ont rejoint la souris, qu'ils retrouvent alors au centre exact. L'état (repos, lien, vue, texte) est cherché par
     closest() à chaque pointerover, pas à chaque mouvement ; l'appui est une classe. Le libellé de la vue (« Voir », « View ») est
     lu dans l'attribut data-curseur de la couverture, donc écrit dans la langue de la page, dans le HTML.
     Le pointeur du système peut avoir été agrandi ou recoloré par le visiteur (réglage d'accessibilité) : la page ne peut pas le
     savoir, et ce curseur le remplace. Le bouton « Curseur standard » du pied de page (dans le HTML, affiché par la CSS quand
     les effets sont permis) rend le curseur du système pour la page en cours ; rien n'est mémorisé. */
  (function () {
    var LIENS = 'a[href], button, summary, [role="button"], label';
    var VUE = '.couverture';
    var TEXTE = 'p, li, dd, dt, h1, h2, h3, h4, address, .fiche';
    var SOUS_LE_LIBELLE = TEXTE + ', .domaine, img';   // dans la vue, ce qui porte du texte ou une image : pas de libellé par-dessus
    var SUR_BANDE = '.chiffres';                  // surfaces d'indigo moyen, où l'inverse du blanc a presque la même luminance : le curseur s'y adapte (voir site.css)
    var SUR_INDIGO = '.bouton--plein, .barre-cta';
    var RAIDEUR_POINT = 70;    // rad/s : le point a environ 14 ms de retard
    var RAIDEUR_ANNEAU = 14;   // rad/s : l'anneau met environ 0,4 s à rattraper la souris

    var conteneur = null;      // créés au premier mouvement de souris, retirés à l'arrêt
    var point = null;
    var anneau = null;
    var formePoint = null;
    var visible = false;
    var standard = false;      // le visiteur a choisi le curseur du système (bouton du pied de page) : valable pour cette page seulement
    var bouton = null;
    var sansStyle = false;     // la feuille de style n'a pas habillé le conteneur (cache périmé, requête média inconnue) : pas de curseur
    var etat = '';
    var fond = '';
    var libelle = '';
    var vuEn = -1;
    var limiteX = Infinity;    // bord droit et bord bas du contenu : au-delà, le pointeur est sur une barre de défilement (relevés quand il y entre,
    var limiteY = Infinity;    // puis à chaque défilement ou redimensionnement)
    var image = 0;             // requestAnimationFrame en attente : 0 tant que point et anneau sont arrivés
    var dernier = 0;
    var pt = { x: 0, y: 0, vx: 0, vy: 0 };   // position (px) et vitesse (px/s) du point, puis de l'anneau
    var an = { x: 0, y: 0, vx: 0, vy: 0 };

    /* Ressort amorti critique vers (cx, cy), intégré exactement sur dt secondes : le résultat ne dépend pas de la fréquence
       d'images (60, 120 Hz ou une image perdue donnent la même trajectoire). */
    function ressort(r, cx, cy, k, dt) {
      var e = Math.exp(-k * dt);
      var dx = r.x - cx;
      var dy = r.y - cy;
      var jx = r.vx + k * dx;
      var jy = r.vy + k * dy;
      r.x = cx + (dx + jx * dt) * e;
      r.y = cy + (dy + jy * dt) * e;
      r.vx = (r.vx - k * jx * dt) * e;
      r.vy = (r.vy - k * jy * dt) * e;
    }

    function arrive(r, cx, cy) {
      return Math.abs(r.x - cx) < 0.05 && Math.abs(r.y - cy) < 0.05 && Math.abs(r.vx) < 0.5 && Math.abs(r.vy) < 0.5;
    }

    function poser(r, cx, cy) {
      r.x = cx;
      r.y = cy;
      r.vx = 0;
      r.vy = 0;
    }

    function ecrire(element, r) {
      element.style.transform = 'translate3d(' + r.x.toFixed(2) + 'px,' + r.y.toFixed(2) + 'px,0)';
    }

    /* Chaque porteur est un élément sans taille, déplacé par transform ; la forme visible (dont la taille change selon l'état)
       est centrée sur lui par le CSS : le centre reste sur le pointeur pendant les changements d'état. */
    function porteur(classe) {
      var p = document.createElement('div');
      var forme = document.createElement('i');
      p.className = classe;
      forme.className = 'curseur-forme';
      p.appendChild(forme);
      return p;
    }

    function creer() {
      conteneur = document.createElement('div');
      conteneur.className = 'curseur';
      conteneur.setAttribute('aria-hidden', 'true');
      conteneur.setAttribute('data-etat', 'repos');
      anneau = porteur('curseur-anneau');
      point = porteur('curseur-point');
      formePoint = point.firstChild;
      conteneur.appendChild(anneau);
      conteneur.appendChild(point);
      document.body.appendChild(conteneur);
      /* Garde-fou : un conteneur que la CSS n'habille pas (feuille en cache plus ancienne que le script : GitHub Pages sert avec
         dix minutes de cache ; navigateur qui ignore une des requêtes média) resterait dans le flux, en bas de page, et ferait
         défiler la page au gré de la souris. On le retire et on n'essaie plus : le site reste celui du repli. */
      if (getComputedStyle(conteneur).position !== 'fixed') {
        document.body.removeChild(conteneur);
        conteneur = point = anneau = formePoint = null;
        sansStyle = true;
        return;
      }
      etat = 'repos';
      fond = '';
      libelle = '';
    }

    /* Première apparition, ou retour après un doigt ou une sortie de la fenêtre : au pixel sous la souris, sans trajet depuis
       l'ancienne place, puis en fondu. */
    function apparaitre(x, y) {
      if (!conteneur) creer();
      if (!conteneur) return;   // creer() a renoncé : sansStyle
      poser(pt, x, y);
      poser(an, x, y);
      ecrire(point, pt);
      ecrire(anneau, an);
      getComputedStyle(conteneur).opacity;   // fixe l'état de départ : sans cela, la création et l'apparition se confondent (pas de fondu)
      racine.classList.add('curseur');
      conteneur.classList.remove('appui');   // un glissement de barre de défilement n'envoie pas toujours le pointerup
      conteneur.classList.add('visible');
      visible = true;
    }

    /* Doigt ou stylet, souris sortie de la fenêtre ou posée sur une barre de défilement : le curseur personnalisé s'efface et le curseur
       système revient (sur la barre, le point serait rogné par le bord du contenu et le curseur système masqué par l'héritage de cursor: none :
       le pointeur disparaîtrait). */
    function masquer() {
      if (image) { cancelAnimationFrame(image); image = 0; }
      racine.classList.remove('curseur');
      if (!visible) return;
      visible = false;
      conteneur.classList.remove('visible');
      conteneur.classList.remove('appui');
    }

    function appliquer(nouvelEtat, nouveauLibelle, nouveauFond) {
      if (nouvelEtat !== etat) {
        etat = nouvelEtat;
        conteneur.setAttribute('data-etat', nouvelEtat);
      }
      if (nouveauFond !== fond) {
        fond = nouveauFond;
        if (fond) conteneur.setAttribute('data-fond', fond); else conteneur.removeAttribute('data-fond');
      }
      if (nouveauLibelle) {   // le dernier libellé reste dans la forme pendant son fondu de sortie
        if (nouveauLibelle !== libelle) {
          libelle = nouveauLibelle;
          formePoint.setAttribute('data-libelle', nouveauLibelle);
        }
        conteneur.classList.add('libelle');
      } else {
        conteneur.classList.remove('libelle');
      }
    }

    /* L'état vient de la cible : lien (le point devient un disque), vue (grand anneau : couvertures des produits), texte
       (barre verticale), sinon repos. Les liens passent avant le reste : un lien dans un texte reste un lien.
       Le libellé de la vue (data-curseur de la couverture : « Voir », « View ») ne s'écrit que si rien de lisible n'est dessous :
       sur le titre, la légende, l'étiquette ou l'icône de la couverture, il se superposerait au texte. Aucun lien n'en porte :
       le texte du lien serait toujours sous le mot. */
    function chercher(cible) {
      var nom = 'repos';
      var texte = '';
      var surface = '';
      var n;
      if (cible && cible.closest) {
        if (cible.closest(LIENS)) nom = 'lien';
        else if ((n = cible.closest(VUE))) {
          nom = 'vue';
          if (!cible.closest(SOUS_LE_LIBELLE)) texte = n.getAttribute('data-curseur') || '';
        } else if (cible.closest(TEXTE)) nom = 'texte';
        if (cible.closest(SUR_BANDE)) surface = 'bande';
        else if (cible.closest(SUR_INDIGO)) surface = 'indigo';
      }
      appliquer(nom, texte, surface);
    }

    /* Une image : le point et l'anneau avancent vers la souris, lue à cet instant. Quand les deux sont arrivés, ils sont posés
       exactement dessus et la boucle s'arrête : rien ne tourne souris immobile. */
    function pas(t) {
      image = 0;
      var dt = Math.max(0, (t - dernier) / 1000);
      dernier = t;
      ressort(pt, souris.x, souris.y, RAIDEUR_POINT, dt);
      ressort(an, souris.x, souris.y, RAIDEUR_ANNEAU, dt);
      if (arrive(pt, souris.x, souris.y) && arrive(an, souris.x, souris.y)) {
        poser(pt, souris.x, souris.y);
        poser(an, souris.x, souris.y);
      } else {
        image = requestAnimationFrame(pas);
      }
      ecrire(point, pt);
      ecrire(anneau, an);
    }

    /* Appelé par le suivi commun, une fois par image au plus, après un mouvement, un défilement ou un redimensionnement. */
    function reveil() {
      if (!souris.connue || standard || sansStyle) return;
      var relire = false;
      if (vuEn !== disposition) {   // la page a bougé sous une souris immobile : bords du contenu et cible à relire
        vuEn = disposition;
        limiteX = racine.clientWidth;
        limiteY = racine.clientHeight;
        relire = true;
      }
      if (souris.x >= limiteX || souris.y >= limiteY) { masquer(); return; }   // sur une barre de défilement : curseur système
      if (!visible) {   // première apparition, ou retour après un doigt, une sortie ou une barre de défilement : l'état gardé est périmé
        apparaitre(souris.x, souris.y);
        if (!visible) return;
        relire = true;
      }
      if (relire) chercher(souris.cible);   // fraîche : celle du dernier mouvement, ou relue par le suivi commun si la page a bougé
      if (!image && !(arrive(pt, souris.x, souris.y) && arrive(an, souris.x, souris.y))) {
        dernier = performance.now();
        image = requestAnimationFrame(pas);
      }
    }

    function surSurvol(e) {
      if (e.pointerType !== 'mouse') { masquer(); return; }
      if (e.target === racine) { limiteX = racine.clientWidth; limiteY = racine.clientHeight; }   // la cible est <html> sur une barre de défilement
      if (e.clientX >= limiteX || e.clientY >= limiteY) { masquer(); return; }
      /* Pas d'apparition ici : c'est reveil() qui l'assure, au mouvement qui suit, à la position fraîche. Un pointerover n'est pas
         toujours précédé d'un mouvement : après un glisser-déposer natif, Chromium en envoie un à la dernière position connue
         d'avant le glissement, périmée de plusieurs centaines de pixels. */
      if (!visible) return;
      chercher(e.target);
    }

    /* Bouton « Curseur standard » : le curseur du système revient, pour cette page. Rien n'est mémorisé. */
    function basculer() {
      standard = !standard;
      if (bouton) bouton.setAttribute('aria-pressed', standard ? 'true' : 'false');
      if (standard) masquer();
    }

    function surAppui(e) {
      if (e.pointerType !== 'mouse') { masquer(); return; }
      if (e.button === 0 && conteneur) conteneur.classList.add('appui');
    }

    function surRelache() {
      if (conteneur) conteneur.classList.remove('appui');
    }

    /* relatedTarget nul : le pointeur quitte la fenêtre. */
    function surSortie(e) {
      if (e.pointerType === 'mouse' && !e.relatedTarget) masquer();
    }

    inscrire({
      demarrer: function () {
        document.addEventListener('pointerover', surSurvol, PASSIF);
        document.addEventListener('pointerdown', surAppui, PASSIF);
        document.addEventListener('pointerout', surSortie, PASSIF);
        document.addEventListener('pointercancel', surRelache, PASSIF);
        document.addEventListener('contextmenu', surRelache, PASSIF);
        document.addEventListener('dragstart', surRelache, PASSIF);
        window.addEventListener('pointerup', surRelache, PASSIF);
        bouton = document.querySelector('.curseur-standard');
        if (bouton) bouton.addEventListener('click', basculer, PASSIF);
        abonner(reveil);
      },
      arreter: function () {
        document.removeEventListener('pointerover', surSurvol, PASSIF);
        document.removeEventListener('pointerdown', surAppui, PASSIF);
        document.removeEventListener('pointerout', surSortie, PASSIF);
        document.removeEventListener('pointercancel', surRelache, PASSIF);
        document.removeEventListener('contextmenu', surRelache, PASSIF);
        document.removeEventListener('dragstart', surRelache, PASSIF);
        window.removeEventListener('pointerup', surRelache, PASSIF);
        if (bouton) {
          bouton.removeEventListener('click', basculer, PASSIF);
          bouton.setAttribute('aria-pressed', 'false');
          bouton = null;
        }
        standard = false;
        sansStyle = false;
        desabonner(reveil);
        masquer();
        if (conteneur && conteneur.parentNode) conteneur.parentNode.removeChild(conteneur);
        conteneur = point = anneau = formePoint = null;
        etat = fond = libelle = '';
        vuEn = -1;
        limiteX = limiteY = Infinity;
      }
    });
  })();

  /* ── Départ ────────────────────────────────────────────────── */
  surveiller(pointeurFin);
  surveiller(mouvementReduit);
  surveiller(contrastes);
  evaluer();
})();
