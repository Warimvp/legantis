/* Mizan Technique (démonstration fictive). Aucun stockage, aucune requête : tout reste en mémoire. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var BASE = '/realisations/demos/services/';

  /* ---------- menu mobile ---------- */
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav-principale');
  if (btn && nav) {
    var fermer = function (rendreFocus) {
      nav.classList.remove('ouvert');
      btn.setAttribute('aria-expanded', 'false');
      if (rendreFocus) btn.focus();
    };
    btn.addEventListener('click', function () {
      var ouvert = nav.classList.toggle('ouvert');
      btn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('ouvert')) fermer(true);
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) fermer(false); });
  }

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v); };
  var telOk = function (v) { var d = v.replace(/[\s.\-()]/g, ''); return /^\+?\d{8,14}$/.test(d); };

  /* ---------- parcours de devis ---------- */
  var racine = document.getElementById('devis-app');
  if (racine) {
    var SERVICES = { climatisation: 'Climatisation', electricite: 'Électricité', maintenance: 'Maintenance de locaux' };
    var NATURES = { travaux: 'Installation ou travaux', entretien: 'Entretien régulier', depannage: 'Dépannage' };
    var LOCAUX = { bureaux: 'Bureaux', commerce: 'Commerce ou showroom', cuisine: 'Cuisine ou local de restauration', entrepot: 'Entrepôt ou atelier', immeuble: 'Parties communes d\'immeuble' };
    var URGENCES = { planifiee: 'Planifiée (dans plus de deux semaines)', semaine: 'Sous sept jours', quarante: 'Sous 48 heures', immediate: 'Urgence immédiate' };
    var TAUX = { climatisation: { travaux: 380, entretien: 18, depannage: 6 }, electricite: { travaux: 260, entretien: 14, depannage: 5 }, maintenance: { travaux: 120, entretien: 22, depannage: 4 } };
    var FIXE = { travaux: 4000, entretien: 1200, depannage: 800 };
    var COEF_LOCAL = { bureaux: 1, commerce: 1.1, cuisine: 1.3, entrepot: 0.8, immeuble: 0.9 };
    var COEF_URG = { planifiee: 1, semaine: 1.1, quarante: 1.25, immediate: 1.5 };
    var NOMS = ['besoin', 'local', 'surface', 'urgence', 'description', 'coordonnees', 'recap'];
    var TITRES = ['Votre besoin', 'Votre local', 'Surface', 'Délai', 'Description', 'Vos coordonnées', 'Récapitulatif'];

    window.MIZAN_DEVIS = { SERVICES: SERVICES, NATURES: NATURES, LOCAUX: LOCAUX, URGENCES: URGENCES };
    var dansEspace = !!document.getElementById('espace-app');
    var etat = { etape: 0, d: {}, err: {}, retourRecap: false, termine: false, numero: '' };
    var zone = document.getElementById('devis-etape');
    var fiche = document.getElementById('devis-fiche');
    var progres = document.getElementById('devis-progres');
    var annonce = document.getElementById('devis-annonce');

    var qs = /[?&]besoin=(climatisation|electricite|maintenance)/.exec(location.search);
    if (qs) etat.d.service = qs[1];

    var arrondi = function (n) { return Math.round(n / 100) * 100; };
    var mad = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0MAD'; };
    var estimer = function () {
      var d = etat.d;
      if (!(d.service && d.nature && d.local && d.surface && d.urgence)) return null;
      var s = Number(d.surface);
      var eff = Math.min(s, 200) + Math.max(0, s - 200) * 0.6;
      var brut = (FIXE[d.nature] + TAUX[d.service][d.nature] * eff) * COEF_LOCAL[d.local] * COEF_URG[d.urgence];
      return { bas: arrondi(brut * 0.85), haut: arrondi(brut * 1.2) };
    };
    var texteFourchette = function (e) { return 'De ' + mad(e.bas) + ' à ' + mad(e.haut); };

    var tuiles = function (nom, valeurs, courant, sous) {
      return Object.keys(valeurs).map(function (k) {
        return '<label class="tuile"><input type="radio" name="' + nom + '" value="' + k + '"' + (courant === k ? ' checked' : '') + '><span><b>' + esc(valeurs[k]) + '</b>' + (sous && sous[k] ? '<small>' + esc(sous[k]) + '</small>' : '') + '</span></label>';
      }).join('');
    };
    var erreur = function (id) { return etat.err[id] ? '<p class="err" id="e-' + id + '">' + esc(etat.err[id]) + '</p>' : ''; };
    var attrErr = function (id) { return etat.err[id] ? ' aria-invalid="true" aria-describedby="e-' + id + '"' : ''; };

    var corps = [
      function () {
        return '<fieldset class="choix" aria-describedby="e-service"><legend>Domaine concerné</legend><div class="grille grille--3">' + tuiles('service', SERVICES, etat.d.service) + '</div>' + erreur('service') + '</fieldset>' +
          '<fieldset class="choix"><legend>Nature de la demande</legend><div class="grille grille--3">' + tuiles('nature', NATURES, etat.d.nature) + '</div>' + erreur('nature') + '</fieldset>';
      },
      function () {
        return '<fieldset class="choix"><legend>Type de local</legend><div class="grille">' + tuiles('local', LOCAUX, etat.d.local) + '</div>' + erreur('local') + '</fieldset>';
      },
      function () {
        return '<div class="champ"><label for="f-surface"><span>Surface concernée, en m²</span></label><input id="f-surface" name="surface" type="number" inputmode="numeric" min="10" max="5000" step="1" value="' + esc(etat.d.surface || '') + '"' + attrErr('surface') + '><small>Entre 10 et 5 000 m². Une estimation, pas un métré.</small>' + erreur('surface') + '</div>';
      },
      function () {
        return '<fieldset class="choix"><legend>Délai souhaité</legend><div class="grille">' + tuiles('urgence', URGENCES, etat.d.urgence) + '</div>' + erreur('urgence') + '</fieldset>';
      },
      function () {
        var v = etat.d.description || '';
        return '<div class="champ"><label for="f-description"><span>Décrivez la situation</span></label><textarea id="f-description" name="description" maxlength="800"' + attrErr('description') + '>' + esc(v) + '</textarea><small>Au moins 15 caractères : ce qui ne fonctionne plus, les équipements, les contraintes d\'accès. Texte fictif conseillé.</small>' + erreur('description') + '</div>';
      },
      function () {
        var d = etat.d;
        return '<p class="note">Saisissez des coordonnées fictives (par exemple « 05 00 00 00 00 » et « nom@exemple.invalid »). Rien n\'est envoyé ni conservé.</p><br>' +
          '<div class="champ"><label for="f-nom"><span>Nom et prénom</span></label><input id="f-nom" name="nom" type="text" autocomplete="off" value="' + esc(d.nom || '') + '"' + attrErr('nom') + '>' + erreur('nom') + '</div>' +
          '<div class="champ"><label for="f-societe"><span>Société (facultatif)</span></label><input id="f-societe" name="societe" type="text" autocomplete="off" value="' + esc(d.societe || '') + '"></div>' +
          '<div class="champ"><label for="f-email"><span>Adresse e-mail</span></label><input id="f-email" name="email" type="email" autocomplete="off" value="' + esc(d.email || '') + '"' + attrErr('email') + '>' + erreur('email') + '</div>' +
          '<div class="champ"><label for="f-tel"><span>Téléphone</span></label><input id="f-tel" name="tel" type="tel" autocomplete="off" value="' + esc(d.tel || '') + '"' + attrErr('tel') + '><small>8 à 14 chiffres ; espaces, points et tirets acceptés.</small>' + erreur('tel') + '</div>';
      },
      function () {
        var d = etat.d, e = estimer();
        var ligne = function (lib, val, i) { return '<div><dt>' + lib + '</dt><dd>' + esc(val) + '</dd><button type="button" data-aller="' + i + '">Modifier<span class="sr"> : ' + lib + '</span></button></div>'; };
        return '<dl class="recap">' +
          ligne('Besoin', SERVICES[d.service] + ' · ' + NATURES[d.nature], 0) + ligne('Local', LOCAUX[d.local], 1) + ligne('Surface', d.surface + ' m²', 2) + ligne('Délai', URGENCES[d.urgence], 3) + ligne('Description', d.description, 4) +
          ligne('Contact', d.nom + (d.societe ? ' (' + d.societe + ')' : '') + ' · ' + d.email + ' · ' + d.tel, 5) + '</dl>' +
          (e ? '<div class="fourchette fiche"><div style="padding:16px"><span class="etiq">Fourchette indicative, exemple fictif</span><b>' + texteFourchette(e) + '</b><p>Calcul de démonstration à partir de taux inventés. Ce n\'est ni un devis ni un engagement.</p></div></div><br>' : '') +
          '<div class="champ"><label class="case"><input type="checkbox" name="accord"' + (etat.d.accord ? ' checked' : '') + (etat.err.accord ? ' aria-invalid="true" aria-describedby="e-accord"' : '') + '><span>Je comprends que cette confirmation est simulée : aucune demande n\'est envoyée.</span></label>' + erreur('accord') + '</div>';
      }
    ];

    var DONNEES_ETAPE = [['service', 'nature'], ['local'], ['surface'], ['urgence'], ['description'], ['nom', 'email', 'tel']];
    var valider = function (i, f) {
      var d = etat.d, err = {};
      if (i === 0) {
        d.service = (f.service && f.service.value) || ''; d.nature = (f.nature && f.nature.value) || '';
        if (!d.service) err.service = 'Choisissez le domaine concerné.';
        if (!d.nature) err.nature = 'Précisez la nature de la demande.';
      } else if (i === 1) {
        d.local = (f.local && f.local.value) || '';
        if (!d.local) err.local = 'Choisissez le type de local.';
      } else if (i === 2) {
        d.surface = (f.surface.value || '').trim();
        var n = Number(d.surface);
        if (!d.surface) err.surface = 'Indiquez une surface en m².';
        else if (!/^\d+$/.test(d.surface) || n < 10 || n > 5000) err.surface = 'La surface doit être un nombre entier compris entre 10 et 5 000 m².';
      } else if (i === 3) {
        d.urgence = (f.urgence && f.urgence.value) || '';
        if (!d.urgence) err.urgence = 'Choisissez un délai.';
      } else if (i === 4) {
        d.description = f.description.value.trim();
        if (d.description.length < 15) err.description = 'Décrivez la situation en au moins 15 caractères (' + d.description.length + ' saisis).';
      } else if (i === 5) {
        d.nom = f.nom.value.trim(); d.societe = f.societe.value.trim(); d.email = f.email.value.trim(); d.tel = f.tel.value.trim();
        if (d.nom.length < 2) err.nom = 'Indiquez un nom d\'au moins 2 caractères.';
        if (!d.email) err.email = 'Indiquez une adresse e-mail.';
        else if (!emailOk(d.email)) err.email = 'Cette adresse n\'est pas valide : elle doit ressembler à nom@exemple.invalid.';
        if (!d.tel) err.tel = 'Indiquez un numéro de téléphone.';
        else if (!telOk(d.tel)) err.tel = 'Ce numéro n\'est pas valide : 8 à 14 chiffres attendus.';
      } else if (i === 6) {
        d.accord = !!f.accord.checked;
        if (!d.accord) err.accord = 'Cochez la case pour confirmer la simulation.';
      }
      return err;
    };

    var rendreFiche = function () {
      var d = etat.d, e = estimer();
      var l = function (lib, val) { return '<div><dt>' + lib + '</dt><dd>' + (val ? esc(val) : '<span class="vide-v">à renseigner</span>') + '</dd></div>'; };
      fiche.innerHTML = '<h2>Fiche de demande</h2><dl>' +
        l('Besoin', d.service && d.nature ? SERVICES[d.service] + ' · ' + NATURES[d.nature] : '') + l('Local', d.local ? LOCAUX[d.local] : '') + l('Surface', d.surface ? d.surface + ' m²' : '') + l('Délai', d.urgence ? URGENCES[d.urgence] : '') + '</dl>' +
        '<div class="fourchette"><span class="etiq">Fourchette indicative, exemple fictif</span>' +
        (e ? '<b>' + texteFourchette(e) + '</b><p>Exemple calculé avec des taux inventés. Pas un devis.</p>' : '<b>—</b><p>Elle s\'affiche dès que le besoin, le local, la surface et le délai sont renseignés.</p>') + '</div>';
    };

    var rendreProgres = function () {
      var i = etat.etape;
      progres.innerHTML = '<div class="progres-txt"><span>' + (etat.termine ? 'Terminé' : 'Étape ' + (i + 1) + ' sur 7') + '</span><span>' + (etat.termine ? 'Simulation confirmée' : TITRES[i]) + '</span></div><ol aria-label="Progression">' +
        NOMS.map(function (n, k) { return '<li class="' + (etat.termine || k < i ? 'fait' : '') + '"' + (!etat.termine && k === i ? ' aria-current="step"' : '') + '><span class="sr">' + TITRES[k] + (k < i || etat.termine ? ', terminé' : '') + '</span></li>'; }).join('') + '</ol>';
    };

    var rendre = function (focusSur) {
      rendreProgres(); rendreFiche();
      var i = etat.etape;
      if (etat.termine) {
        var e = estimer();
        var qp = ['service', 'nature', 'local', 'surface', 'urgence', 'description', 'nom', 'societe', 'email', 'tel'].map(function (k) { return k + '=' + encodeURIComponent(etat.d[k] || ''); }).join('&');
        var suite = dansEspace
          ? '<p><strong>La demande ' + esc(etat.numero) + ' est créée dans cette démonstration.</strong> Elle est visible dans l\'espace client et dans la gestion, où chaque action se répercute des deux côtés. Rien n\'est envoyé : l\'état reste en mémoire et disparaît au rechargement.</p>'
          : '<p><strong>Rien n\'a été envoyé.</strong> Cette confirmation est une simulation : aucune équipe ne vous rappellera et aucune donnée n\'a quitté cette page. Pour voir la suite d\'une demande (qualification, devis, planning, compte rendu), ouvrez-la dans l\'espace client : elle y sera recréée en mémoire.</p>';
        var liens = dansEspace
          ? '<button type="button" class="btn fl" data-vue="client">Suivre dans l\'espace client</button><button type="button" class="btn btn--ligne" data-vue="gestion">Voir côté gestion</button><button type="button" class="btn btn--ligne" id="devis-recommencer">Faire une autre demande</button>'
          : '<a class="btn fl" href="' + BASE + 'espace/?import=1&amp;' + qp.replace(/&/g, '&amp;') + '">Suivre cette demande dans l\'espace client</a><button type="button" class="btn btn--ligne" id="devis-recommencer">Nouvelle simulation</button><a class="btn btn--ligne" href="' + BASE + '">Retour à l\'accueil</a>';
        zone.innerHTML = '<div class="etape"><h2 id="devis-titre" tabindex="-1">' + (dansEspace ? 'Demande enregistrée' : 'Demande simulée enregistrée') + '</h2><p>Merci ' + esc(etat.d.nom) + '. Voici le numéro ' + (dansEspace ? 'de la demande' : 'de la simulation') + ' :</p>' +
          '<div class="conf-num" id="devis-numero">' + esc(etat.numero) + '</div>' + suite +
          (e ? '<p>Fourchette indicative, exemple fictif : <strong>' + texteFourchette(e) + '</strong>.</p>' : '') +
          '<div class="nav-etape">' + liens + '</div></div>';
        annonce.textContent = (dansEspace ? 'Demande créée. Numéro ' : 'Simulation confirmée. Numéro ') + etat.numero + '.';
        var t = document.getElementById('devis-titre'); if (t) t.focus();
        return;
      }
      var nbErr = Object.keys(etat.err).length;
      var resume = '';
      if (nbErr) {
        resume = '<div class="resume-err" role="alert" tabindex="-1" id="devis-erreurs"><p>' + (nbErr > 1 ? nbErr + ' points à corriger' : '1 point à corriger') + ' avant de continuer :</p><ul>' +
          Object.keys(etat.err).map(function (k) { return '<li><a href="#' + (k === 'service' || k === 'nature' || k === 'local' || k === 'urgence' ? 'e-' + k : (k === 'accord' ? 'e-accord' : 'f-' + (k === 'tel' ? 'tel' : k))) + '" data-champ="' + k + '">' + esc(etat.err[k]) + '</a></li>'; }).join('') + '</ul></div>';
      }
      var intro = ['Quel type d\'intervention ? Un seul choix par domaine et par nature.', 'Le type de local pèse sur la complexité du chantier.', 'Un ordre de grandeur suffit.', 'Plus le délai est court, plus la fourchette monte.', 'Quelques lignes suffisent.', 'Nous les validons ici, sans les envoyer.', 'Relisez, modifiez si besoin, puis confirmez la simulation.'][i];
      zone.innerHTML = '<form class="etape" novalidate aria-labelledby="devis-titre"><h2 id="devis-titre" tabindex="-1">' + TITRES[i] + '</h2><p>' + intro + '</p>' + resume + corps[i]() +
        '<div class="nav-etape">' + (i > 0 ? '<button type="button" class="btn btn--ligne" data-act="retour">Retour</button>' : '') +
        '<button type="submit" class="btn' + (i === 6 ? ' btn--ink' : ' fl') + '" data-act="suivant">' + (i === 6 ? 'Confirmer la simulation' : (i === 5 ? 'Voir le récapitulatif' : 'Suivant')) + '</button></div></form>';
      annonce.textContent = 'Étape ' + (i + 1) + ' sur 7 : ' + TITRES[i] + (nbErr ? '. ' + nbErr + ' erreur(s).' : '');
      if (focusSur === 'erreurs') {
        var r = document.getElementById('devis-erreurs'); if (r) r.focus();
      } else if (focusSur === 'titre') {
        var t2 = document.getElementById('devis-titre'); if (t2) t2.focus();
      }
    };

    var lire = function (form) { var o = {}; new FormData(form).forEach(function (v, k) { o[k] = { value: v, checked: true }; }); return o; };

    zone.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var form = ev.target;
      var f = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'radio') { if (el.checked) f[el.name] = el; }
        else f[el.name] = el;
      });
      var i = etat.etape;
      etat.err = valider(i, f);
      if (Object.keys(etat.err).length) { rendre('erreurs'); return; }
      if (i === 6) {
        etat.termine = true; etat.err = {};
        var det = { d: JSON.parse(JSON.stringify(etat.d)), numero: 'MZ-SIM-' + (100000 + Math.floor(Math.random() * 900000)) };
        document.dispatchEvent(new CustomEvent('mizan:demande', { detail: det }));
        etat.numero = det.numero;
        rendre(); return;
      }
      etat.etape = etat.retourRecap ? 6 : i + 1;
      if (etat.etape === 6) etat.retourRecap = false;
      rendre('titre');
    });
    zone.addEventListener('click', function (ev) {
      var b = ev.target.closest('button, a[data-champ]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'retour') {
        /* conserve les réponses déjà saisies sur l'étape courante, sans les valider */
        var form = zone.querySelector('form'), d = etat.d;
        if (form) {
          var g = function (n) { var el = form.elements[n]; return el && el.value !== undefined ? el.value : ''; };
          var coche = function (n) { var el = form.querySelector('[name=' + n + ']:checked'); return el ? el.value : ''; };
          var i = etat.etape;
          if (i === 0) { d.service = coche('service') || d.service; d.nature = coche('nature') || d.nature; }
          if (i === 1) d.local = coche('local') || d.local;
          if (i === 2) d.surface = g('surface').trim();
          if (i === 3) d.urgence = coche('urgence') || d.urgence;
          if (i === 4) d.description = g('description').trim();
          if (i === 5) { d.nom = g('nom').trim(); d.societe = g('societe').trim(); d.email = g('email').trim(); d.tel = g('tel').trim(); }
        }
        etat.err = {}; etat.etape = Math.max(0, etat.etape - 1); etat.retourRecap = false; rendre('titre');
      } else if (b.hasAttribute('data-aller')) {
        etat.etape = Number(b.getAttribute('data-aller')); etat.retourRecap = true; etat.err = {}; rendre('titre');
      } else if (b.id === 'devis-recommencer') {
        etat.d = {}; etat.etape = 0; etat.err = {}; etat.termine = false; etat.retourRecap = false; etat.numero = ''; rendre('titre');
      } else if (b.hasAttribute('data-champ')) {
        ev.preventDefault();
        var cible = document.getElementById('f-' + b.getAttribute('data-champ')) || zone.querySelector('input[name=' + b.getAttribute('data-champ') + ']') || zone.querySelector('input[type=radio]');
        if (cible) cible.focus();
      }
    });
    /* mise à jour en direct de la fiche pendant le choix */
    zone.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el.name || etat.termine) return;
      if (el.type === 'radio') etat.d[el.name] = el.value;
      else if (el.name === 'surface' && /^\d+$/.test(el.value.trim())) etat.d.surface = el.value.trim();
      rendreFiche();
    });
    document.getElementById('devis-sansjs').hidden = true;
    rendre();
  }

})();
