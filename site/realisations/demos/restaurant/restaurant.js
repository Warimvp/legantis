/* Maison Tilal : démonstration Legantis. JavaScript vanilla, aucun stockage, aucune requête réseau.
   Tout l'état (réservations, créneaux) vit en mémoire et disparaît au rechargement. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function plur(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  /* ------------------------------------------------------------------ Navigation */
  function initNav() {
    var bouton = $('.menu-bouton'), nav = $('#nav-principale');
    if (!bouton || !nav) return;
    function ouvrir(o) { nav.classList.toggle('ouvert', o); bouton.setAttribute('aria-expanded', String(o)); bouton.textContent = o ? 'Fermer' : 'Menu'; }
    bouton.addEventListener('click', function () { ouvrir(bouton.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) ouvrir(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('ouvert')) { ouvrir(false); bouton.focus(); } });

    var liens = $$('a', nav), cibles = liens.map(function (a) { return $(a.getAttribute('href')); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return;
          liens.forEach(function (a, i) { if (cibles[i] === en.target) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      cibles.forEach(function (c) { if (c) io.observe(c); });
    }
  }

  /* Sur téléphone, la barre fixe disparaît dans la section de réservation : elle doublerait les boutons du parcours. */
  function initBarreResa() {
    var barre = $('.barre-resa'), zone = $('#reserver');
    if (!barre || !zone || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) { barre.classList.toggle('cachee', es[0].isIntersecting); }).observe(zone);
  }

  function initRevele() {
    var els = $$('.rang, .section h2, .lead, .lieu-image, .chef-image, .pieces li, .gestes > div, .citation, .infos-liste > div, .infos-image');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    els.forEach(function (e) { e.classList.add('rv'); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('vu'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
    /* filet de sécurité : tout apparaît même si l'observateur tarde */
    setTimeout(function () { els.forEach(function (e) { e.classList.add('vu'); }); }, 4000);
  }

  /* ------------------------------------------------------------------ Carte */
  function initCarte() {
    var outils = $('#carte-outils'), corps = $('#carte-corps');
    if (!outils || !corps) return;
    outils.hidden = false;
    var cats = $$('.cat', corps), onglets = $('#onglets'), etat = $('#carte-etat'), vide = $('#carte-vide');
    var filtres = $$('input[name="filtre"]', outils);
    var courant = cats[0].dataset.cat, boutons = {};
    var panneau = $('#panneau'), pn = $('#pn-corps'), opener = null;

    cats.forEach(function (c) {
      var id = c.dataset.cat, h = $('.cat-titre', c);
      var nom = h.childNodes[0].textContent.trim();
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'onglet'; b.id = 'tab-' + id; b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', c.id); b.dataset.nom = nom; b.textContent = nom;
      b.addEventListener('click', function () { choisir(id, false); });
      onglets.appendChild(b); boutons[id] = b;
      c.setAttribute('role', 'tabpanel'); c.setAttribute('aria-labelledby', b.id);
    });
    onglets.addEventListener('keydown', function (e) {
      var ids = cats.map(function (c) { return c.dataset.cat; }), i = ids.indexOf(courant), n = i;
      if (e.key === 'ArrowRight') n = (i + 1) % ids.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = ids.length - 1;
      else return;
      e.preventDefault(); choisir(ids[n], true);
    });

    function actifs() { return filtres.filter(function (f) { return f.checked; }).map(function (f) { return f.value; }); }
    var cle = { veg: 'veg', gf: 'gf', na: 'na' };
    var libelle = { veg: 'végétarien', gf: 'sans gluten', na: 'sans alcool' };

    function visibles(cat, act) {
      return $$('.plat', cat).filter(function (li) { return act.every(function (f) { return li.dataset[cle[f]] === '1'; }); });
    }
    function maj(annoncer) {
      var act = actifs();
      cats.forEach(function (c) {
        var ok = visibles(c, act);
        $$('.plat', c).forEach(function (li) { li.hidden = ok.indexOf(li) < 0; });
        var b = boutons[c.dataset.cat];
        b.textContent = b.dataset.nom + (act.length ? ' (' + ok.length + ')' : '');
        c.hidden = c.dataset.cat !== courant;
        b.setAttribute('aria-selected', String(c.dataset.cat === courant));
        b.tabIndex = c.dataset.cat === courant ? 0 : -1;
      });
      var cc = $('#cat-' + courant), n = visibles(cc, act).length;
      vide.hidden = n > 0;
      if (annoncer) {
        etat.textContent = n === 0 ? 'Aucun plat ne correspond.' : plur(n, 'proposition') + ' dans « ' + boutons[courant].dataset.nom + ' »' + (act.length ? ', filtre ' + act.map(function (f) { return libelle[f]; }).join(' + ') : '') + '.';
      }
    }
    function choisir(id, focus) { courant = id; maj(true); if (focus) boutons[id].focus(); }
    filtres.forEach(function (f) { f.addEventListener('change', function () { maj(true); }); });
    $('#carte-raz').addEventListener('click', function () { filtres.forEach(function (f) { f.checked = false; }); maj(true); boutons[courant].focus(); });

    /* plats cliquables */
    $$('.plat', corps).forEach(function (li) {
      var h = $('.plat-nom', li), nom = h.textContent;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'plat-ouvrir'; b.textContent = nom;
      b.setAttribute('aria-haspopup', 'dialog');
      b.addEventListener('click', function () { ouvrirPlat(li, b); });
      h.textContent = ''; h.appendChild(b);
    });

    var ART = { entrees: 'branche', plats: 'tajine', desserts: 'agrume', boissons: 'branche', degustation: 'tajine' };
    function ouvrirPlat(li, b) {
      opener = b;
      var cat = li.dataset.cat, nom = $('.plat-ouvrir', li).textContent;
      var tags = $('.plat-tags', li).textContent;
      var vb = ART[cat] === 'tajine' ? '0 -20 240 190' : (ART[cat] === 'agrume' ? '0 0 220 220' : '0 0 360 230');
      var ref = ART[cat] === 'agrume' ? 'agrume-s' : ART[cat];
      pn.innerHTML =
        '<div class="pn">' +
        '<div class="pn-haut"><span class="pn-cat">' + esc(boutons[cat].dataset.nom) + '</span><button type="button" class="pn-fermer" data-fermer>Fermer</button></div>' +
        '<svg class="pn-art" viewBox="' + vb + '" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" color="#cbbfab"><use href="#' + ref + '"/></svg>' +
        '<h3 id="pn-titre">' + esc(nom) + '</h3>' +
        '<p class="pn-prix">' + esc($('.plat-prix', li).textContent.replace(/\u00a0/g, ' ')) + ' <span class="pn-note">(prix fictif)</span></p>' +
        '<p>' + esc($('.plat-detail p', li).textContent) + '</p>' +
        '<p class="pn-ingr"><b>Dans l\'assiette</b>' + esc($('.plat-ingr', li).textContent.replace(/^Dans l'assiette\s*/, '')) + '</p>' +
        '<div class="pn-tags">' + tags.split(' · ').map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<p class="pn-note">Informations de démonstration : en réalité, signalez vos allergies à l\'équipe.</p>' +
        '<div class="pn-bas"><a class="btn" href="#reserver" data-reserver>Réserver une table</a><button type="button" class="btn btn--filet" data-fermer>Fermer</button></div>' +
        '</div>';
      if (typeof panneau.showModal === 'function') panneau.showModal(); else panneau.setAttribute('open', '');
      panneau.scrollTop = 0;
      var f = $('.pn-fermer', pn); if (f) f.focus();
    }
    panneau.addEventListener('click', function (e) {
      if (e.target === panneau || e.target.closest('[data-fermer]')) fermer();
      else if (e.target.closest('[data-reserver]')) { fermer(true); }
    });
    function fermer(versResa) {
      if (panneau.close) panneau.close(); else panneau.removeAttribute('open');
      if (versResa) { opener = null; var r = $('#reserver'); if (r) { r.scrollIntoView(); history.replaceState(null, '', '#reserver'); } }
    }
    panneau.addEventListener('close', function () { if (opener) { opener.focus(); opener = null; } });
    maj(false);
  }

  /* ------------------------------------------------------------------ Réservation */
  var SERVICES = {
    midi: { nom: 'Midi', plage: '12 h 30 à 14 h 30', creneaux: ['12:30', '13:00', '13:30', '14:00'] },
    soir: { nom: 'Soir', plage: '19 h 30 à 22 h 30', creneaux: ['19:30', '20:00', '20:30', '21:00', '21:30'] }
  };
  var CAP_DEFAUT = 30, MAX_COUV = 8, CAP_MAX = 60, PAS_CAP = 2, JOURS = 30;

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function jourLong(s) { return parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function heure(t) { return t.replace(':', ' h '); }
  function ferme(d) { return d.getDay() === 1; }
  function maj1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var S = { resas: [], seq: 0, over: {}, annuler: null };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var JOURS_LISTE = [];
  for (var i = 0; i < JOURS; i++) { var dd = new Date(today); dd.setDate(today.getDate() + i); JOURS_LISTE.push(dd); }

  function fictives(date, t, service) {
    var d = parse(date), wd = d.getDay();
    var h = (hash(date + '|' + t) % 1000) / 1000;
    var poids = (wd === 5 || wd === 6) ? 1.18 : (wd === 0 && service === 'midi' ? 1.1 : 0.92);
    return Math.min(CAP_DEFAUT, Math.round(Math.pow(h, 0.8) * CAP_DEFAUT * poids));
  }
  function surcharge(date, t) { return S.over[date + '|' + t] || (S.over[date + '|' + t] = { cap: CAP_DEFAUT, ferme: false }); }
  function pris(date, t) {
    return S.resas.reduce(function (n, r) { return n + (r.statut === 'confirmée' && r.date === date && r.heure === t ? r.couverts : 0); }, 0);
  }
  function passe(date, t) {
    if (date !== iso(today)) return false;
    var now = new Date(), p = t.split(':').map(Number);
    return p[0] * 60 + p[1] <= now.getHours() * 60 + now.getMinutes() + 30;
  }
  function creneau(date, service, t) {
    var o = surcharge(date, t), f = fictives(date, t, service), p = pris(date, t);
    return { cap: o.cap, ferme: o.ferme, fict: f, pris: p, restant: Math.max(0, o.cap - f - p), passe: passe(date, t) };
  }
  function statutCreneau(date, service, t, n) {
    var c = creneau(date, service, t);
    if (c.ferme) return { ok: false, motif: 'Fermé', c: c };
    if (c.passe) return { ok: false, motif: 'Passé', c: c };
    if (c.restant < n) return { ok: false, motif: c.restant === 0 ? 'Complet' : 'Complet pour ' + n, c: c };
    return { ok: true, motif: c.restant - n <= 6 ? 'Dernières places' : 'Disponible', c: c };
  }
  function libres(date, service, n) {
    return SERVICES[service].creneaux.filter(function (t) { return statutCreneau(date, service, t, n).ok; }).length;
  }

  function initResa() {
    var zone = $('#resa-zone'), etape = $('#etape'), etapesEl = $('#etapes');
    if (!zone) return;
    zone.hidden = false;
    var bascule = $('#bascule-vue'); bascule.hidden = false;
    var NOMS = ['Date', 'Service', 'Créneau', 'Préférences', 'Coordonnées', 'Récapitulatif'];
    var draft, step, errs, conf, msg;
    function neuf() { draft = { date: null, service: 'soir', covers: 2, slot: null, occasion: 'Aucune', zone: 'Salle', regimes: [], note: '', nom: '', tel: '', mail: '', ok: false }; step = 1; errs = {}; conf = null; }
    neuf();
    msg = document.createElement('p'); msg.className = 'sr-msg'; msg.id = 'resa-msg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    etape.parentNode.appendChild(msg);

    /* ---- affichage ---- */
    function rendreEtapes() {
      etapesEl.innerHTML = NOMS.map(function (n, i) {
        var k = i + 1, cur = !conf && k === step, fait = conf || k < step;
        return '<li' + (cur ? ' aria-current="step"' : '') + (fait ? ' class="fait"' : '') + '><span>' + n + '</span>' + (fait ? '<span class="vh"> (terminé)</span>' : '') + '</li>';
      }).join('');
      /* le texte des étapes non courantes est lu par les lecteurs d'écran */
      $$('li', etapesEl).forEach(function (li, i) { li.setAttribute('aria-label', 'Étape ' + (i + 1) + ' : ' + NOMS[i]); });
    }
    function titre(t, aide) { return '<h3 tabindex="-1" id="etape-titre">' + t + '</h3>' + (aide ? '<p class="etape-aide">' + aide + '</p>' : ''); }
    function actions(retour, suivant, libelle) {
      return '<div class="etape-actions">' + (retour ? '<button type="button" class="btn btn--filet" data-act="retour">Retour</button>' : '') +
        '<button type="button" class="btn" data-act="' + (suivant || 'suivant') + '">' + (libelle || 'Continuer') + '</button></div>';
    }
    function erreur(id, texte) { return '<p class="erreur' + (texte ? ' vu' : '') + '" id="err-' + id + '">' + (texte ? esc(texte) : '') + '</p>'; }

    function vueDate() {
      var mois = [], cur = null;
      JOURS_LISTE.forEach(function (d) {
        var k = d.getFullYear() * 12 + d.getMonth();
        if (!cur || cur.k !== k) { cur = { k: k, d: d, jours: [] }; mois.push(cur); }
        cur.jours.push(d);
      });
      var h = titre('Choisissez une date', 'Les ' + JOURS + ' prochains jours. La maison est fermée le lundi.');
      h += '<div class="cal-bleed">';
      mois.forEach(function (m) {
        h += '<div class="cal-mois"><h4>' + esc(m.d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '</h4><div class="cal" role="group" aria-label="' + esc(m.d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) + '">';
        ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].forEach(function (n) { h += '<span class="cal-nom" aria-hidden="true">' + n + '</span>'; });
        var off = (m.jours[0].getDay() + 6) % 7;
        for (var i = 0; i < off; i++) h += '<span class="cal-vide"></span>';
        m.jours.forEach(function (d) {
          var s = iso(d), f = ferme(d), sel = draft.date === s;
          var etiq = jourLong(s) + (f ? ', fermé' : '') + (s === iso(today) ? ', aujourd\'hui' : '');
          h += '<button type="button" class="cal-j" data-act="date" data-d="' + s + '" data-k="d' + s + '"' + (f ? ' disabled' : '') + ' aria-pressed="' + sel + '" aria-label="' + esc(etiq) + '">' + d.getDate() + (f ? '<small>fermé</small>' : (s === iso(today) ? '<small>auj.</small>' : '')) + '</button>';
        });
        h += '</div></div>';
      });
      h += '</div><p class="cal-choix" id="cal-choix">' + (draft.date ? esc(maj1(jourLong(draft.date))) : 'Aucune date choisie') + '</p>' + erreur('date', errs.date);
      return h + actions(false);
    }
    function radios(nom, valeurs, courant, cls) {
      return '<div class="rec ' + (cls || '') + '">' + valeurs.map(function (v) {
        return '<label><input type="radio" name="' + nom + '" value="' + esc(v.v) + '" data-k="' + nom + v.v + '"' + (String(courant) === String(v.v) ? ' checked' : '') + (v.off ? ' disabled' : '') + '><span>' + v.h + '</span></label>';
      }).join('') + '</div>';
    }
    function vueService() {
      var h = titre('Service et couverts', esc(maj1(jourLong(draft.date))) + '.');
      h += '<fieldset class="groupe"><legend>Service</legend>' + radios('service', Object.keys(SERVICES).map(function (k) {
        var n = libres(draft.date, k, draft.covers);
        return { v: k, h: '<b>' + SERVICES[k].nom + '</b><small>' + SERVICES[k].plage + ' · ' + (n ? plur(n, 'créneau libre', 'créneaux libres') : 'complet') + '</small>' };
      }), draft.service, 'rec--service') + '</fieldset>';
      var cv = []; for (var i = 1; i <= MAX_COUV; i++) cv.push({ v: i, h: String(i) });
      h += '<fieldset class="groupe"><legend>Nombre de couverts</legend>' + radios('covers', cv, draft.covers) +
        '<p class="aide" style="margin-top:8px">Au-delà de ' + MAX_COUV + ' couverts, la maison étudie la demande par téléphone (fictif).</p></fieldset>';
      return h + actions(true);
    }
    function vueCreneau() {
      var sv = SERVICES[draft.service], libre = 0;
      var items = sv.creneaux.map(function (t) {
        var st = statutCreneau(draft.date, draft.service, t, draft.covers); if (st.ok) libre++;
        return { v: t, off: !st.ok, h: '<b>' + heure(t) + '</b><small>' + st.motif + '</small>' };
      });
      var h = titre('Choisissez un créneau', esc(maj1(jourLong(draft.date))) + ' · service ' + sv.nom.toLowerCase() + ' · ' + plur(draft.covers, 'couvert') + '.');
      if (errs.slotPerdu) h += '<p class="erreur vu" role="alert">Le créneau choisi n\'est plus disponible. Choisissez-en un autre.</p>';
      h += '<fieldset class="groupe"><legend>Créneaux</legend>' + radios('slot', items, draft.slot, 'rec--creneaux') + '</fieldset>';
      if (!libre) h += '<p class="vide" style="margin:0 0 18px;padding:16px">Aucun créneau libre pour ' + plur(draft.covers, 'couvert') + ' à ce service. Essayez l\'autre service, moins de couverts ou une autre date.</p>';
      h += erreur('slot', errs.slot);
      return h + actions(true);
    }
    function vuePrefs() {
      var occ = ['Aucune', 'Anniversaire', 'Dîner en couple', 'Repas d\'affaires', 'Autre'];
      var reg = ['Végétarien', 'Sans gluten', 'Sans alcool', 'Allergie à signaler'];
      var h = titre('Préférences', 'Facultatif. La maison fait au mieux, sans garantie.');
      h += '<div class="champ"><label for="f-occ">Occasion</label><select class="saisie" id="f-occ" data-f="occasion">' + occ.map(function (o) { return '<option' + (draft.occasion === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>';
      h += '<fieldset class="groupe"><legend>Emplacement</legend>' + radios('zone', [{ v: 'Salle', h: 'Salle' }, { v: 'Cour', h: 'Cour (selon météo)' }], draft.zone) + '</fieldset>';
      h += '<fieldset class="groupe"><legend>Régimes et allergies</legend><div class="rec">' + reg.map(function (r, i) {
        return '<label><input type="checkbox" name="reg" value="' + esc(r) + '" data-k="reg' + i + '"' + (draft.regimes.indexOf(r) >= 0 ? ' checked' : '') + '><span>' + esc(r) + '</span></label>';
      }).join('') + '</div></fieldset>';
      h += '<div class="champ"><label for="f-note">Note pour la maison</label><textarea class="saisie" id="f-note" data-f="note" maxlength="300" aria-describedby="f-note-a">' + esc(draft.note) + '</textarea><p class="aide" id="f-note-a">300 caractères maximum. Fictif : n\'écrivez rien de personnel.</p></div>';
      return h + actions(true);
    }
    function champ(id, lib, type, val, aide, auto) {
      return '<div class="champ"><label for="f-' + id + '">' + lib + '</label><input class="saisie" id="f-' + id + '" data-f="' + id + '" type="' + type + '" value="' + esc(val) + '" autocomplete="' + (auto || 'off') + '"' + (errs[id] ? ' aria-invalid="true"' : '') + ' aria-describedby="' + (aide ? 'aide-' + id + ' ' : '') + 'err-' + id + '" required>' + (aide ? '<p class="aide" id="aide-' + id + '">' + aide + '</p>' : '') + erreur(id, errs[id]) + '</div>';
    }
    function vueCoord() {
      var h = titre('Vos coordonnées', 'Données fictives uniquement : rien n\'est transmis ni conservé.');
      h += champ('nom', 'Nom pour la réservation', 'text', draft.nom, 'Un nom inventé suffit, par exemple « Table Test ».');
      h += champ('tel', 'Téléphone', 'tel', draft.tel, 'Numéro fictif au format 10 chiffres, par exemple 05 00 00 00 00.');
      h += champ('mail', 'Adresse e-mail', 'email', draft.mail, 'Adresse fictive, par exemple nom@exemple.test.');
      h += '<div class="champ"><label style="display:flex;gap:12px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--ivoire);min-height:44px"><input type="checkbox" id="f-ok" data-f="ok" style="width:22px;height:22px;margin-top:2px;flex:none;accent-color:#d98f4e"' + (draft.ok ? ' checked' : '') + (errs.ok ? ' aria-invalid="true"' : '') + ' aria-describedby="err-ok"> Je comprends que cette réservation est simulée et que mes saisies ne sont pas envoyées.</label>' + erreur('ok', errs.ok) + '</div>';
      return h + actions(true);
    }
    function lignesRecap(modif) {
      var l = [
        ['Date', maj1(jourLong(draft.date)), 1],
        ['Service', SERVICES[draft.service].nom + ' · ' + heure(draft.slot), 3],
        ['Couverts', String(draft.covers), 2],
        ['Préférences', [draft.occasion !== 'Aucune' ? draft.occasion : '', draft.zone].concat(draft.regimes).filter(Boolean).join(', ') + (draft.note ? ' · « ' + draft.note + ' »' : ''), 4],
        ['Contact', draft.nom + ' · ' + draft.tel + ' · ' + draft.mail, 5]
      ];
      return '<dl class="recap">' + l.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>' + (modif ? '<button type="button" class="lien" data-act="aller" data-s="' + r[2] + '">Modifier<span class="vh"> ' + r[0].toLowerCase() + '</span></button>' : '') + '</div>';
      }).join('') + '</dl>';
    }
    function vueRecap() {
      var h = titre('Récapitulatif', 'Vérifiez avant de confirmer. La réservation est simulée.');
      h += lignesRecap(true);
      if (errs.conflit) h += '<p class="erreur vu" role="alert">' + esc(errs.conflit) + '</p>';
      return h + '<div class="etape-actions"><button type="button" class="btn btn--filet" data-act="retour">Retour</button><button type="button" class="btn" data-act="confirmer">Confirmer la réservation (simulée)</button></div>';
    }
    function vueConf() {
      var r = conf;
      return '<div class="conf"><h3 tabindex="-1" id="etape-titre">Table réservée, en simulation</h3><p class="conf-petit">Numéro de réservation simulé</p><p class="conf-num">' + esc(r.num) + '</p>' +
        '<p class="etape-aide">Aucun message n\'est envoyé. La réservation apparaît dans « Mes réservations » et a retiré ' + plur(r.couverts, 'place') + ' au créneau.</p>' + lignesRecapConf(r) +
        '<div class="etape-actions"><button type="button" class="btn" data-act="nouvelle">Faire une autre réservation</button><button type="button" class="btn btn--filet" data-act="voir">Voir mes réservations</button></div></div>';
    }
    function lignesRecapConf(r) {
      var l = [['Date', maj1(jourLong(r.date))], ['Service', SERVICES[r.service].nom + ' · ' + heure(r.heure)], ['Couverts', String(r.couverts)], ['Contact', r.nom]];
      return '<dl class="recap">' + l.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl>';
    }

    function render(focusTitre, keepKey) {
      /* créneau perdu (changé côté restaurant) */
      if (draft.slot && draft.date && !statutCreneau(draft.date, draft.service, draft.slot, draft.covers).ok) { draft.slot = null; if (step > 3) { step = 3; errs.slotPerdu = true; focusTitre = true; } else if (step === 3) errs.slotPerdu = true; }
      rendreEtapes();
      var v = conf ? vueConf() : [null, vueDate, vueService, vueCreneau, vuePrefs, vueCoord, vueRecap][step]();
      etape.innerHTML = v;
      if (focusTitre) { var t = $('#etape-titre', etape); if (t) t.focus({ preventScroll: false }); }
      else if (keepKey) { var el = $('[data-k="' + keepKey + '"]', etape); if (el) el.focus(); }
    }

    /* ---- validation ---- */
    function valider() {
      var e = {};
      if (step === 1 && !draft.date) e.date = 'Choisissez une date dans le calendrier.';
      if (step === 3) { if (!draft.slot) e.slot = 'Choisissez un créneau disponible.'; }
      if (step === 5) {
        if (draft.nom.trim().length < 2) e.nom = 'Indiquez un nom d\'au moins 2 caractères.';
        var tel = draft.tel.replace(/[\s.\-]/g, '');
        if (!/^0\d{9}$/.test(tel)) e.tel = 'Saisissez un numéro fictif de 10 chiffres commençant par 0.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.mail.trim())) e.mail = 'Saisissez une adresse e-mail valide, par exemple nom@exemple.test.';
        if (!draft.ok) e.ok = 'Cochez la case pour confirmer que vous avez compris.';
      }
      return e;
    }
    function aller(n) { step = n; errs = {}; render(true); }
    function suivant() {
      errs = valider();
      var cles = Object.keys(errs);
      if (cles.length) {
        render(false);
        var ordre = ['date', 'slot', 'nom', 'tel', 'mail', 'ok'], premier = ordre.filter(function (k) { return errs[k]; })[0];
        var cible = premier === 'date' ? $('.cal-j:not(:disabled)', etape) : premier === 'slot' ? ($('input[name=slot]:not(:disabled)', etape) || $('.btn[data-act=retour]', etape)) : $('#f-' + premier, etape);
        if (cible) cible.focus();
        return;
      }
      errs = {}; step++; render(true);
    }
    function confirmer() {
      var st = statutCreneau(draft.date, draft.service, draft.slot, draft.covers);
      if (!st.ok) { errs = { slotPerdu: true }; step = 3; draft.slot = null; render(true); return; }
      S.seq++;
      var base = iso(parse(draft.date)).replace(/-/g, '').slice(2), n;
      do { n = 'MT-' + base + '-' + (1000 + (hash(draft.date + draft.slot + draft.nom + S.seq) % 9000)); } while (S.resas.some(function (r) { return r.num === n; }));
      conf = { id: S.seq, num: n, date: draft.date, service: draft.service, heure: draft.slot, couverts: draft.covers, nom: draft.nom.trim(), tel: draft.tel, mail: draft.mail, prefs: draft.regimes.slice(), zone: draft.zone, occasion: draft.occasion, statut: 'confirmée' };
      S.resas.push(conf);
      msg.textContent = 'Réservation confirmée, numéro simulé ' + n + '.';
      rafraichir(true);
    }

    /* ---- événements de l'assistant ---- */
    etape.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var a = b.dataset.act;
      if (a === 'date') { draft.date = b.dataset.d; errs = {}; draft.slot = null; render(false, 'd' + draft.date); }
      else if (a === 'suivant') suivant();
      else if (a === 'retour') aller(step - 1);
      else if (a === 'aller') aller(Number(b.dataset.s));
      else if (a === 'confirmer') confirmer();
      else if (a === 'nouvelle') { neuf(); msg.textContent = ''; render(true); }
      else if (a === 'voir') { var h = $('#mr-titre'); h.setAttribute('tabindex', '-1'); h.scrollIntoView(); h.focus(); }
    });
    etape.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'service') { draft.service = t.value; draft.slot = null; render(false, 'service' + t.value); }
      else if (t.name === 'covers') { draft.covers = Number(t.value); draft.slot = null; render(false, 'covers' + t.value); }
      else if (t.name === 'slot') { draft.slot = t.value; errs = {}; render(false, 'slot' + t.value); }
      else if (t.name === 'zone') { draft.zone = t.value; }
      else if (t.name === 'reg') { draft.regimes = $$('input[name=reg]:checked', etape).map(function (i) { return i.value; }); }
      else if (t.dataset.f === 'occasion') draft.occasion = t.value;
      else if (t.dataset.f === 'ok') { draft.ok = t.checked; if (t.checked) { delete errs.ok; var er = $('#err-ok', etape); if (er) { er.textContent = ''; er.classList.remove('vu'); } t.removeAttribute('aria-invalid'); } }
    });
    etape.addEventListener('input', function (e) {
      var f = e.target.dataset.f; if (!f || f === 'ok' || f === 'occasion') return;
      draft[f] = e.target.value;
    });
    etape.addEventListener('focusout', function (e) {
      var f = e.target.dataset && e.target.dataset.f;
      if (step !== 5 || !['nom', 'tel', 'mail'].includes(f) || !draft[f]) return;
      var avant = errs[f]; var all = valider(); var er = $('#err-' + f, etape);
      if (all[f]) { errs[f] = all[f]; e.target.setAttribute('aria-invalid', 'true'); er.textContent = all[f]; er.classList.add('vu'); }
      else if (avant) { delete errs[f]; e.target.removeAttribute('aria-invalid'); er.textContent = ''; er.classList.remove('vu'); }
    });

    /* ---- Mes réservations ---- */
    var liste = $('#mr-liste'), aide = $('#mr-aide'), mrMsg = $('#mr-msg');
    function rendreMes() {
      aide.hidden = S.resas.length > 0;
      liste.innerHTML = S.resas.slice().reverse().map(function (r) {
        var conf_ = r.statut === 'confirmée', fer = conf_ && creneau(r.date, r.service, r.heure).ferme;
        var etat = fer ? 'Créneau fermé par la maison : à reprogrammer (simulation)' : (r.statut === 'confirmée' ? 'Confirmée (simulée)' : maj1(r.statut));
        var act = '';
        if (conf_) {
          act = S.annuler === r.id
            ? '<span class="mr-det" style="width:100%">Annuler cette réservation ?</span><button type="button" class="mini mini--danger" data-act="oui" data-id="' + r.id + '" data-k="oui' + r.id + '">Oui, annuler</button><button type="button" class="mini" data-act="non" data-id="' + r.id + '">Garder</button>'
            : '<button type="button" class="mini" data-act="annuler" data-id="' + r.id + '" data-k="an' + r.id + '" aria-label="Annuler la réservation ' + esc(r.num) + '">Annuler</button>';
        }
        return '<li class="mr' + (conf_ ? '' : ' annulee') + '"><p class="mr-num">' + esc(r.num) + '</p><p class="mr-det">' + esc(maj1(jourLong(r.date))) + ' · ' + SERVICES[r.service].nom + ' ' + heure(r.heure) + ' · ' + plur(r.couverts, 'couvert') + '</p><p class="mr-det">' + esc(r.nom) + '</p><span class="mr-etat' + (fer ? ' alerte' : '') + '">' + etat + '</span>' + (act ? '<div class="mr-actions">' + act + '</div>' : '') + '</li>';
      }).join('');
    }
    function annulerResa(id, par) {
      var r = S.resas.filter(function (x) { return x.id === id; })[0]; if (!r || r.statut !== 'confirmée') return;
      r.statut = par === 'resto' ? 'annulée par la maison' : 'annulée'; S.annuler = null;
      var m = 'Réservation ' + r.num + ' annulée : ' + plur(r.couverts, 'place') + ' remise' + (r.couverts > 1 ? 's' : '') + ' dans le créneau.';
      mrMsg.textContent = m; if (restoMsg) restoMsg.textContent = m;
      rafraichir(false);
    }
    liste.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var id = Number(b.dataset.id);
      if (b.dataset.act === 'annuler') { S.annuler = id; rendreMes(); var o = $('[data-k="oui' + id + '"]', liste); if (o) o.focus(); }
      else if (b.dataset.act === 'non') { S.annuler = null; rendreMes(); var a = $('[data-k="an' + id + '"]', liste); if (a) a.focus(); }
      else if (b.dataset.act === 'oui') { annulerResa(id, 'client'); var h = $('#mr-titre'); h.setAttribute('tabindex', '-1'); h.focus(); }
    });

    /* ---- Côté restaurant ---- */
    var vueClient = $('#vue-client'), vueResto = $('#vue-resto'), selJour = $('#resto-date'), grille = $('#resto-creneaux'), listeResto = $('#resto-liste'), restoMsg = $('#resto-msg');
    var jourResto = iso(today);
    if (ferme(today)) jourResto = iso(JOURS_LISTE.filter(function (d) { return !ferme(d); })[0]);
    selJour.innerHTML = JOURS_LISTE.filter(function (d) { return !ferme(d); }).map(function (d) {
      var s = iso(d); return '<option value="' + s + '">' + (s === iso(today) ? 'Aujourd\'hui, ' : '') + esc(jourLong(s)) + '</option>';
    }).join('');
    selJour.value = jourResto;
    selJour.addEventListener('change', function () { jourResto = selJour.value; rendreResto(); });

    function rendreResto() {
      selJour.value = jourResto;
      grille.innerHTML = Object.keys(SERVICES).map(function (k) {
        var sv = SERVICES[k];
        return '<section class="resto-service" aria-labelledby="rs-' + k + '"><h4 id="rs-' + k + '">Service du ' + (k === 'midi' ? 'midi' : 'soir') + ' <span style="font-family:var(--sans);font-size:.8125rem;color:var(--ivoire-2)">' + sv.plage + '</span></h4>' + sv.creneaux.map(function (t) {
          var c = creneau(jourResto, k, t), o = surcharge(jourResto, t), reprog = S.resas.filter(function (r) { return r.statut === 'confirmée' && r.date === jourResto && r.heure === t; }).length;
          var etat = c.ferme ? 'Fermé' : (c.passe ? 'Horaire passé' : (c.restant === 0 ? 'Complet' : 'Ouvert'));
          var min = c.fict + c.pris;
          return '<div class="cr' + (c.ferme ? ' ferme' : '') + '" data-slot="' + t + '" data-restantes="' + c.restant + '" data-capacite="' + c.cap + '" data-ferme="' + c.ferme + '">' +
            '<span class="cr-h">' + heure(t) + '</span>' +
            '<p class="cr-det"><span class="cr-etat">' + etat + '</span><b>' + c.restant + ' restantes</b> sur ' + c.cap + ' couverts · ' + c.fict + ' déjà pris (fictif) · ' + c.pris + ' par vous' + (c.ferme && reprog ? ' · ' + plur(reprog, 'réservation') + ' à reprogrammer' : '') + '</p>' +
            '<span class="cr-cap" role="group" aria-label="Capacité du créneau de ' + heure(t) + '"><button type="button" data-act="cap" data-t="' + t + '" data-d="-' + PAS_CAP + '" data-k="m' + t + '" aria-label="Retirer ' + PAS_CAP + ' couverts à ' + heure(t) + '"' + (o.cap - PAS_CAP < min ? ' aria-disabled="true"' : '') + '>−</button><output aria-label="Capacité, en couverts">' + o.cap + '</output><button type="button" data-act="cap" data-t="' + t + '" data-d="' + PAS_CAP + '" data-k="p' + t + '" aria-label="Ajouter ' + PAS_CAP + ' couverts à ' + heure(t) + '"' + (o.cap + PAS_CAP > CAP_MAX ? ' aria-disabled="true"' : '') + '>+</button></span>' +
            '<button type="button" class="mini" data-act="bascule" data-t="' + t + '" data-k="b' + t + '">' + (c.ferme ? 'Ouvrir le créneau' : 'Fermer le créneau') + '<span class="vh"> de ' + heure(t) + '</span></button></div>';
        }).join('') + '</section>';
      }).join('');
      var rs = S.resas.filter(function (r) { return r.date === jourResto; });
      listeResto.innerHTML = rs.length ? rs.map(function (r) {
        return '<li><span><b>' + esc(r.num) + '</b> · ' + SERVICES[r.service].nom + ' ' + heure(r.heure) + ' · ' + plur(r.couverts, 'couvert') + ' · ' + esc(r.nom) + ' <em style="font-style:normal;color:var(--cuivre-clair)">(' + (r.statut === 'confirmée' ? 'confirmée' : esc(r.statut)) + ')</em></span>' +
          (r.statut === 'confirmée' ? '<button type="button" class="mini mini--danger" data-act="annuler-resto" data-id="' + r.id + '">Annuler<span class="vh"> ' + esc(r.num) + '</span></button>' : '') + '</li>';
      }).join('') : '<li><span class="vide-l">Aucune réservation passée par la démonstration pour ce jour. Faites-en une côté client pour la voir apparaître ici.</span></li>';
    }
    grille.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var t = b.dataset.t, o = surcharge(jourResto, t), k = Object.keys(SERVICES).filter(function (s) { return SERVICES[s].creneaux.indexOf(t) >= 0; })[0];
      if (b.dataset.act === 'cap') {
        var min = fictives(jourResto, t, k) + pris(jourResto, t), nv = o.cap + Number(b.dataset.d);
        if (nv < min) { restoMsg.textContent = 'Capacité minimale atteinte pour ' + heure(t) + ' : ' + min + ' couverts déjà pris.'; return; }
        if (nv > CAP_MAX) { restoMsg.textContent = 'Capacité maximale de la salle : ' + CAP_MAX + ' couverts.'; return; }
        o.cap = nv; restoMsg.textContent = 'Capacité du créneau de ' + heure(t) + ' : ' + nv + ' couverts.';
      } else if (b.dataset.act === 'bascule') {
        o.ferme = !o.ferme; restoMsg.textContent = 'Créneau de ' + heure(t) + (o.ferme ? ' fermé' : ' ouvert') + '.';
      }
      rafraichir(false, b.dataset.k);
    });
    listeResto.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="annuler-resto"]'); if (!b) return;
      annulerResa(Number(b.dataset.id), 'resto');
      selJour.focus();
    });
    bascule.addEventListener('click', function () {
      var versResto = vueResto.hidden;
      vueResto.hidden = !versResto; vueClient.hidden = versResto;
      bascule.textContent = versResto ? 'Retour côté client' : 'Côté restaurant';
      $('#note-simul').textContent = versResto ? 'Vue fictive : vos réglages s\'appliquent tout de suite au parcours de réservation. Rien n\'est enregistré.' : 'Réservation simulée : rien n\'est envoyé ni enregistré, tout est conservé en mémoire et disparaît au rechargement de la page.';
      if (versResto) { rendreResto(); var h = $('h3', vueResto); h.tabIndex = -1; h.focus(); }
      else { render(false); var h2 = $('#etape-titre'); if (h2) { h2.focus(); } }
    });

    function rafraichir(focusTitre, keepKey) {
      render(focusTitre);
      rendreMes();
      rendreResto();
      if (keepKey) { var el = $('[data-k="' + keepKey + '"]', vueResto); if (el) el.focus(); }
    }
    rafraichir(false);
    /* retire le focus automatique du premier rendu : la page ne doit pas défiler seule */
  }

  /* ------------------------------------------------------------------ Démarrage */
  initNav();
    initBarreResa();
  initRevele();
  initCarte();
  initResa();
})();
