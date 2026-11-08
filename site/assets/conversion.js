/* Parcours de conversion de legantis.net (accueil, simulateur, mini-audit, page d'offre). Second script du site, chargé seulement par ces pages ; le site reste
   complet sans lui : chaque formulaire part en POST classique vers le Worker et le simulateur s'affiche en une seule page.
   Avec lui : assistant par étapes, envoi sans quitter la page (le visiteur garde sa saisie en cas d'échec), comparaison avant/après, source UTM.
   Sans cookie ni stockage : la source est lue dans l'adresse et recopiée dans le formulaire de la page, ou passée au lien suivant. Aucune requête sauf l'envoi du formulaire.
   Aucun prix ici : la grille vient du bloc #grille-tarifs de la page, écrit par outils/commercial.py depuis config/commercial.json. */
(function () {
  'use strict';

  /* Moteur d'estimation : null dès qu'un élément n'a pas de prix validé. Jamais de prix par défaut : mieux vaut une estimation personnalisée qu'un chiffre inventé. */
  function plage(v) {
    return !!v && Number.isFinite(v.min) && Number.isFinite(v.max) && v.min >= 0 && v.max >= v.min;
  }
  function estimer(grille, choix) {
    if (!grille || grille.valide !== true || !grille.postes) return null;
    var poste = Object.prototype.hasOwnProperty.call(grille.postes, choix.type) ? grille.postes[choix.type] : null;
    if (!poste || poste.valide !== true || !plage(poste.base)) return null;
    var min = poste.base.min, max = poste.base.max, options = poste.options || {};
    var liste = (choix.fonctions || []).slice();
    if (choix.pages) liste.push('pages:' + choix.pages);
    var requis = poste.requis || [];
    for (var r = 0; r < requis.length; r++) {
      if (!liste.some(function (c) { return c.indexOf(requis[r]) === 0; })) return null;
    }
    for (var i = 0; i < liste.length; i++) {
      var o = Object.prototype.hasOwnProperty.call(options, liste[i]) ? options[liste[i]] : null;
      if (!plage(o)) return null;
      min += o.min; max += o.max;
    }
    return { min: min, max: max, devise: grille.devise || 'MAD', regime: grille.regime || '' };
  }
  function formaterMontant(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function libelleEstimation(e) {
    var unite = ' ' + e.devise + (e.regime ? ' ' + e.regime : '');
    if (e.min === e.max) return 'Prix indicatif\u00a0: ' + formaterMontant(e.min) + unite;
    return 'Fourchette indicative : ' + formaterMontant(e.min) + ' à ' + formaterMontant(e.max) + unite;
  }

  if (typeof document === 'undefined') { module.exports = { estimer: estimer, formaterMontant: formaterMontant, libelleEstimation: libelleEstimation }; return; }

  var CHAMPS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var parametres = new URLSearchParams(location.search);

  /* Source marketing : sans stockage. Recopiée dans les formulaires de la page et transmise aux liens vers les autres formulaires et vers les
     démonstrations, qui la rendent au retour (Distribution OS : app.js ; les autres : realisations/demos/source.js). */
  function reporterSource() {
    var utm = CHAMPS_UTM.filter(function (c) { return parametres.get(c); });
    if (!utm.length) return;
    document.querySelectorAll('form[action*="workers.dev"]').forEach(function (form) {
      utm.forEach(function (c) {
        var champ = document.createElement('input');
        champ.type = 'hidden'; champ.name = c; champ.value = parametres.get(c).slice(0, 80);
        form.appendChild(champ);
      });
    });
    document.querySelectorAll('a[href*="estimer-mon-projet/"], a[href*="audit-gratuit/"], a[href*="offre-lancement/"], a[href*="commandes/"], a[href*="demos/"]').forEach(function (a) {
      var url = new URL(a.href);
      utm.forEach(function (c) { url.searchParams.set(c, parametres.get(c).slice(0, 80)); });
      a.href = url.href;
    });
  }

  /* Textes de l'envoi selon la langue de la page (<html lang="en"> pour /en/). */
  var TEXTES = document.documentElement.lang === 'en' ? {
    champs: {
      nom: 'Please enter your name.', email: 'Please enter a valid email address.', entreprise: 'Please enter your company or business.',
      telephone: 'Please enter a valid phone number, for example +212 6 12 34 56 78.', projet: 'Describe your project in a few words (at least 10 characters).',
      contact: 'Please enter a valid email address or phone number.', type: 'Please choose a type of project.', budget: 'Please choose a budget range.', delai: 'Please choose a timeline.',
      consentement: 'Please tick the box so that we can process your request.', url_site: 'Please enter the public address of your website, for example yoursite.ma.',
    },
    defaut: 'Please check this field.', envoi: 'Sending…',
    limite: 'Too many requests in a short time. Please try again in a minute, or write to us at ', reessayer: 'Please try again in a moment, or write to us at ',
  } : {
    champs: {
      nom: 'Indiquez votre nom.', email: 'Indiquez une adresse e-mail valide.', entreprise: 'Indiquez votre entreprise ou votre activité.',
      telephone: 'Indiquez un numéro de téléphone valide, par exemple 06 12 34 56 78.', projet: 'Décrivez votre besoin en quelques mots (10 caractères au moins).',
      contact: 'Indiquez une adresse e-mail ou un numéro de téléphone valide.', type: 'Choisissez un type de projet.', budget: 'Choisissez une tranche de budget.', delai: 'Choisissez un délai.',
      consentement: 'Cochez la case pour que nous puissions traiter votre demande.', url_site: 'Indiquez l\'adresse publique de votre site, par exemple votresite.ma.',
    },
    defaut: 'Vérifiez ce champ.', envoi: 'Envoi en cours…',
    limite: 'Trop d\'envois en peu de temps. Réessayez dans une minute, ou écrivez-nous à ', reessayer: 'Réessayez dans un instant, ou écrivez-nous à ',
  };

  /* Envoi : même POST que sans script, avec Accept: application/json. La réponse du Worker dit quoi afficher ; en cas d'échec, rien de ce qui a été saisi n'est perdu. */
  function brancherEnvoi(form) {
    var bloc = form.closest('[data-formulaire]') || document;
    /* Un formulaire peut avoir ses propres messages (contact rapide : data-ok / data-echec), la page garde ainsi des identifiants uniques. */
    var ok = bloc.querySelector('#' + (form.getAttribute('data-ok') || 'devis-envoye')), echec = bloc.querySelector('#' + (form.getAttribute('data-echec') || 'devis-echec'));
    var bouton = form.querySelector('[type="submit"]');
    var enCours = false;

    function effacer() {
      form.querySelectorAll('.champ-erreur').forEach(function (e) { e.remove(); });
      form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); });
      if (echec) echec.classList.remove('visible');
    }
    function signaler(codes) {
      var premier = null;
      codes.forEach(function (code) {
        var champ = form.querySelector('[name="' + code + '"]');
        if (!champ) return;
        var conteneur = champ.closest('.champ, fieldset') || champ.parentElement;
        var message = document.createElement('p');
        message.className = 'champ-erreur'; message.id = 'erreur-' + code; message.textContent = TEXTES.champs[code] || TEXTES.defaut;
        conteneur.appendChild(message);
        champ.setAttribute('aria-invalid', 'true'); champ.setAttribute('aria-describedby', message.id);
        premier = premier || champ;
      });
      if (form.__montrerChamp && premier) form.__montrerChamp(premier);
      if (premier) premier.focus();
    }
    function afficherEchec(code) {
      if (!echec) return;
      var detail = echec.querySelector('[data-detail]');
      if (detail) detail.textContent = code === 'limite' ? TEXTES.limite : TEXTES.reessayer;
      echec.classList.add('visible');
      echec.focus();
    }
    function reussir() {
      form.hidden = true;
      bloc.querySelectorAll('.assistant-progression, .assistant-compteur').forEach(function (e) { e.hidden = true; });
      if (ok) { ok.classList.add('visible'); ok.focus(); ok.scrollIntoView({ block: 'center' }); }
      document.dispatchEvent(new CustomEvent('legantis:demande-envoyee', { detail: { parcours: (form.elements.parcours || {}).value || 'devis' } }));
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (enCours) return;
      enCours = true;
      effacer();
      var libelle = bouton.innerHTML;
      bouton.setAttribute('aria-disabled', 'true');
      bouton.textContent = TEXTES.envoi;
      fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (rep) {
          if (rep.ok) reussir();
          else if (rep.erreurs) signaler(rep.erreurs);
          else afficherEchec(rep.code);
        })
        .catch(function () { afficherEchec(); })
        .finally(function () { enCours = false; bouton.removeAttribute('aria-disabled'); bouton.innerHTML = libelle; });
    });
  }

  /* Assistant du simulateur : les fieldsets [data-etape], affichés un par un. Sans script ils sont tous visibles et le formulaire s'envoie d'un bloc. */
  function brancherAssistant(form) {
    var etapes = Array.prototype.slice.call(form.querySelectorAll('[data-etape]'));
    var progression = document.querySelector('.assistant-progression');
    var compteur = document.querySelector('.assistant-compteur');
    var retour = form.querySelector('[data-retour]'), suite = form.querySelector('[data-suite]');
    var envoi = form.querySelector('.assistant-envoi');
    var groupes = Array.prototype.slice.call(form.querySelectorAll('[data-pour]'));
    var champEstimation = form.elements.estimation;
    var grille = null;
    try { grille = JSON.parse(document.getElementById('grille-tarifs').textContent); } catch (e) { grille = null; }
    var courante = 0;

    function typeChoisi() { var c = form.querySelector('[name="type"]:checked'); return c ? c.value : ''; }
    function libelle(input) { var l = input.closest('label'); var b = l && l.querySelector('b'); return (b || l).textContent.trim(); }

    function appliquerType() {
      var type = typeChoisi();
      groupes.forEach(function (g) {
        var actif = g.getAttribute('data-pour').split(' ').indexOf(type) >= 0;
        g.hidden = !actif; g.disabled = !actif;
      });
      var wa = form.parentElement.querySelector('.lien-whatsapp[data-messages]');
      if (wa && type) {
        var messages = JSON.parse(wa.getAttribute('data-messages'));
        var url = new URL(wa.href);
        if (messages[type]) { url.searchParams.set('text', messages[type]); wa.href = url.href; }
      }
    }
    function sansFonctions() { return !groupes.some(function (g) { return !g.hidden; }); }

    function resumer() {
      var fonctions = Array.prototype.slice.call(form.querySelectorAll('[name="fonctions"]:checked:not(:disabled)'));
      var pages = form.querySelector('[name="pages_site"]:not(:disabled)');
      var delai = form.querySelector('[name="delai"]:checked');
      var type = form.querySelector('[name="type"]:checked');
      var lignes = [['Projet', type ? libelle(type) : '']];
      if (pages && pages.value) lignes.push(['Pages', pages.options[pages.selectedIndex].text]);
      if (fonctions.length) lignes.push(['Fonctionnalités', fonctions.map(libelle).join(', ')]);
      if (delai) lignes.push(['Délai', libelle(delai)]);
      var dl = form.querySelector('.assistant-recap');
      dl.textContent = '';
      lignes.forEach(function (l) {
        var dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = l[0]; dd.textContent = l[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      var e = estimer(grille, { type: typeChoisi(), fonctions: fonctions.map(function (f) { return f.value; }), pages: pages && pages.value });
      var zone = form.querySelector('.assistant-estimation');
      var message = form.querySelector('.assistant-personnalisee');
      var fourchette = form.querySelector('.assistant-fourchette');
      if (e) {
        fourchette.textContent = libelleEstimation(e) + '. Le prix ferme figure dans votre devis gratuit.' + (e.min === e.max ? ' Il vaut pour le périmètre de l\'offre de lancement\u00a0: trois pages au plus, une seule langue, contenus fournis par vous.' : '');
        fourchette.hidden = false; message.hidden = true;
        champEstimation.value = libelleEstimation(e);
      } else {
        fourchette.hidden = true; message.hidden = false;
        champEstimation.value = 'Estimation personnalisée';
      }
      zone.hidden = false;
    }

    function montrer(i, memoriser, donnerFocus) {
      courante = i;
      etapes.forEach(function (e, k) { e.hidden = k !== i; });
      if (etapes[i].hasAttribute('data-recap')) resumer();
      retour.hidden = i === 0;
      var derniere = i === etapes.length - 1;
      suite.hidden = derniere; envoi.hidden = !derniere;
      var rang = etapes[i].getAttribute('data-etape');
      if (progression) progression.querySelectorAll('li').forEach(function (li, k) {
        if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.classList.toggle('fait', k < i);
      });
      if (compteur) compteur.textContent = 'Étape ' + rang + ' sur ' + etapes.length;
      if (memoriser) history.pushState({ etape: i }, '');
      if (donnerFocus !== false) {
        var titre = etapes[i].querySelector('h2');
        if (titre) { titre.focus({ preventScroll: true }); }
        var haut = (progression || form).getBoundingClientRect().top + window.scrollY - 104;   // sous la barre fixe : la progression reste visible
        if (window.scrollY > haut) window.scrollTo({ top: haut });
      }
    }

    function etapeValide(i) {
      var champs = etapes[i].querySelectorAll('input, select, textarea');
      for (var k = 0; k < champs.length; k++) {
        if (!champs[k].disabled && !champs[k].checkValidity()) { champs[k].reportValidity(); return false; }
      }
      return true;
    }
    function suivante(i) {
      var n = i + 1;
      appliquerType();
      if (etapes[n] && etapes[n].hasAttribute('data-fonctions') && sansFonctions()) n++;
      return n;
    }
    function precedente(i) {
      var n = i - 1;
      if (etapes[n] && etapes[n].hasAttribute('data-fonctions') && sansFonctions()) n--;
      return n;
    }

    /* Une erreur du serveur sur un champ d'une étape précédente : on y revient. */
    form.__montrerChamp = function (champ) {
      var etape = champ.closest('[data-etape]');
      if (etape) montrer(etapes.indexOf(etape), false, false);
    };

    form.classList.add('assistant--actif');
    if (progression) progression.hidden = false;
    if (compteur) compteur.hidden = false;
    retour.parentElement.hidden = false;
    suite.addEventListener('click', function () { if (etapeValide(courante)) montrer(suivante(courante), true); });
    retour.addEventListener('click', function () { montrer(precedente(courante), true); });
    form.addEventListener('change', function (ev) { if (ev.target.name === 'type') appliquerType(); });
    /* Entrée dans un champ avant la dernière étape : avance au lieu d'envoyer. */
    form.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA' && ev.target.tagName !== 'BUTTON' && courante < etapes.length - 1) { ev.preventDefault(); suite.click(); }
    });
    window.addEventListener('popstate', function (ev) { montrer(ev.state && Number.isInteger(ev.state.etape) ? ev.state.etape : 0, false); });

    /* Arrivée depuis une page de prestation (?type=mobile) ou depuis une offre (?pack=starter) : le contexte n'est pas perdu. */
    var type = parametres.get('type'), depart = 0;
    var radio = type && form.querySelector('[name="type"][value="' + type.replace(/[^a-z-]/g, '') + '"]');
    if (radio) { radio.checked = true; depart = 1; }
    var pack = parametres.get('pack');
    if (pack && form.elements.pack) form.elements.pack.value = pack.replace(/[^a-z-]/g, '').slice(0, 20);
    appliquerType();
    if (depart === 1 && sansFonctions()) depart = 2;
    history.replaceState({ etape: depart }, '');
    montrer(depart, false, false);
  }

  /* Comparaison avant/après : sans script, les deux panneaux côte à côte. Avec script, superposés ; le curseur natif reste la commande clavier et lecteur d'écran, le pointeur fait glisser. */
  function brancherComparaison(figure) {
    var cadre = figure.querySelector('.comparaison-cadre'), curseur = figure.querySelector('input[type="range"]');
    if (!cadre || !curseur) return;
    figure.classList.add('comparaison--active');
    function poser(v) { cadre.style.setProperty('--p', v + '%'); curseur.setAttribute('aria-valuetext', Math.round(v) + ' % de la version avant, ' + Math.round(100 - v) + ' % de la version après'); }
    function depuisPointeur(ev) {
      var b = cadre.getBoundingClientRect();
      var v = Math.max(0, Math.min(100, (ev.clientX - b.left) / b.width * 100));
      curseur.value = v; poser(v);
    }
    var glisse = false;
    curseur.addEventListener('input', function () { poser(Number(curseur.value)); });
    cadre.addEventListener('pointerdown', function (ev) { glisse = true; cadre.setPointerCapture(ev.pointerId); depuisPointeur(ev); });
    cadre.addEventListener('pointermove', function (ev) { if (glisse) depuisPointeur(ev); });
    ['pointerup', 'pointercancel'].forEach(function (n) { cadre.addEventListener(n, function () { glisse = false; }); });
    poser(50);
  }

  /* Page Offres de lancement : le bouton d'une carte de pack, ou ?pack= dans l'adresse, préremplit la formule du formulaire ; seule une valeur
     présente dans la liste est retenue. Sans script, le visiteur la choisit lui-même dans la liste. */
  function choisirPack(valeur) {
    var choix = document.getElementById('demande-pack'), v = String(valeur || '').replace(/[^a-z-]/g, '').slice(0, 20);
    if (choix && v && choix.querySelector('option[value="' + v + '"]')) choix.value = v;
  }
  document.querySelectorAll('a[data-pack][href="#demande"]').forEach(function (lien) {
    lien.addEventListener('click', function () { choisirPack(lien.getAttribute('data-pack')); });
  });
  if (!document.querySelector('form.assistant')) choisirPack(new URLSearchParams(location.search).get('pack'));

  reporterSource();
  document.querySelectorAll('form[data-envoi]').forEach(brancherEnvoi);
  var assistant = document.querySelector('form.assistant');
  if (assistant) brancherAssistant(assistant);
  document.querySelectorAll('.comparaison').forEach(brancherComparaison);
})();
