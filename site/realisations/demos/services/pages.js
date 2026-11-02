/* Mizan Technique (démonstration fictive) : filtres des réalisations et formulaire de contact simulé. Aucun stockage, aucune requête. */
(function () {
  'use strict';
  /* ---------- filtres des réalisations ---------- */
  var filtres = document.querySelectorAll('.filtre');
  if (filtres.length) {
    var items = document.querySelectorAll('.reals > li');
    var compte = document.getElementById('compte');
    var vide = document.getElementById('vide');
    var appliquer = function (type) {
      var n = 0;
      items.forEach(function (li) {
        var ok = type === 'tous' || li.getAttribute('data-type') === type;
        li.hidden = !ok;
        if (ok) n++;
      });
      filtres.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filtre') === type ? 'true' : 'false'); });
      compte.textContent = n === 0 ? 'Aucun exemple pour ce type.' : n + (n > 1 ? ' exemples fictifs affichés' : ' exemple fictif affiché') + (type === 'tous' ? '.' : ' pour ce type.');
      if (vide) vide.hidden = n !== 0;
    };
    filtres.forEach(function (b) { b.addEventListener('click', function () { appliquer(b.getAttribute('data-filtre')); }); });
    var q = /[?&]type=(climatisation|electricite|maintenance)/.exec(location.search);
    appliquer(q ? q[1] : 'tous');
  }

  var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v); };

  /* ---------- formulaire de contact simulé ---------- */
  var cont = document.getElementById('contact-app');
  if (cont) {
    var tpl = document.getElementById('tpl-contact');
    cont.appendChild(tpl.content.cloneNode(true));
    var form = cont.querySelector('form');
    var retour = cont.querySelector('.retour');
    var msgs = cont.querySelector('.msgs');
    var vider = function () { cont.querySelectorAll('.err').forEach(function (n) { n.remove(); }); cont.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); }); msgs.innerHTML = ''; };
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); vider();
      var f = form.elements, bad = [];
      var verifie = function (el, ok, texte) {
        if (ok) return;
        el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'e-' + el.id);
        var p = document.createElement('p'); p.className = 'err'; p.id = 'e-' + el.id; p.textContent = texte;
        el.parentNode.appendChild(p); bad.push({ el: el, texte: texte });
      };
      verifie(f.nom, f.nom.value.trim().length >= 2, 'Indiquez un nom d\'au moins 2 caractères.');
      verifie(f.email, emailOk(f.email.value.trim()), f.email.value.trim() ? 'Cette adresse n\'est pas valide : elle doit ressembler à nom@exemple.invalid.' : 'Indiquez une adresse e-mail.');
      verifie(f.sujet, !!f.sujet.value, 'Choisissez un sujet.');
      verifie(f.message, f.message.value.trim().length >= 15, 'Écrivez un message d\'au moins 15 caractères.');
      if (bad.length) {
        msgs.innerHTML = '<div class="resume-err" role="alert"><p>' + (bad.length > 1 ? bad.length + ' points à corriger' : '1 point à corriger') + '.</p></div>';
        bad[0].el.focus(); return;
      }
      form.hidden = true; retour.hidden = false;
      retour.querySelector('.ref').textContent = 'MZ-MSG-' + (100000 + Math.floor(Math.random() * 900000));
      retour.setAttribute('tabindex', '-1'); retour.focus();
    });
    cont.querySelector('#contact-nouveau').addEventListener('click', function () { form.reset(); vider(); form.hidden = false; retour.hidden = true; f0(); });
    var f0 = function () { form.elements.nom.focus(); };
    var nojs = document.getElementById('contact-sansjs'); if (nojs) nojs.hidden = true;
  }
})();
