/* Démonstrations : un formulaire de démonstration n'envoie rien et le dit au clic ; le récapitulatif de la réservation suit les choix. Aucune requête, aucun stockage. */
(function () {
  'use strict';
  document.querySelectorAll('form[data-demo]').forEach(function (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var retour = form.querySelector('.demo-retour');
      if (retour) { retour.hidden = false; retour.focus(); }
    });
  });
  var resa = document.querySelector('form[data-recap]');
  if (!resa) return;
  function maj() {
    resa.querySelectorAll('input[type="radio"]:checked').forEach(function (r) {
      var sortie = document.getElementById('recap-' + r.name);
      if (sortie) sortie.textContent = r.closest('label').querySelector('b').textContent;
    });
  }
  resa.addEventListener('change', maj);
  maj();
})();
