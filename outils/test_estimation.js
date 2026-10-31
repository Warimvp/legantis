// Moteur d'estimation du simulateur (site/assets/conversion.js), sans navigateur : `node outils/test_estimation.js`. Les montants ci-dessous sont factices, ils ne servent qu'au test.
const assert = require('node:assert/strict');
const { estimer, formaterMontant, libelleEstimation } = require('../site/assets/conversion.js');
const G = { valide: true, devise: 'MAD', regime: 'HT', postes: { vitrine: { valide: true, base: { min: 100, max: 200 }, options: { blog: { min: 10, max: 20 }, 'pages:4a6': { min: 1, max: 2 } } }, web: { valide: false, base: { min: 1, max: 2 } } } };
const cas = [
  ['grille absente', estimer(null, { type: 'vitrine' }), null],
  ['grille non validée', estimer({ ...G, valide: false }, { type: 'vitrine' }), null],
  ['grille validée par une chaîne', estimer({ ...G, valide: 'true' }, { type: 'vitrine' }), null],
  ['poste non validé', estimer(G, { type: 'web' }), null],
  ['poste inconnu', estimer(G, { type: 'mobile' }), null],
  ['nom hérité', estimer(G, { type: '__proto__' }), null],
  ['option sans prix : pas d\'estimation partielle', estimer(G, { type: 'vitrine', fonctions: ['blog', 'multilingue'] }), null],
  ['option héritée', estimer(G, { type: 'vitrine', fonctions: ['constructor'] }), null],
  ['pages sans prix', estimer(G, { type: 'vitrine', pages: '7a15' }), null],
  ['montant négatif', estimer({ ...G, postes: { vitrine: { valide: true, base: { min: -1, max: 2 } } } }, { type: 'vitrine' }), null],
  ['fourchette inversée', estimer({ ...G, postes: { vitrine: { valide: true, base: { min: 5, max: 2 } } } }, { type: 'vitrine' }), null],
  ['montant non numérique', estimer({ ...G, postes: { vitrine: { valide: true, base: { min: '1', max: 2 } } } }, { type: 'vitrine' }), null],
];
for (const [nom, obtenu, attendu] of cas) { assert.deepEqual(obtenu, attendu, nom); console.log('✓', nom); }
assert.deepEqual(estimer(G, { type: 'vitrine', fonctions: ['blog'], pages: '4a6' }), { min: 111, max: 222, devise: 'MAD', regime: 'HT' }); console.log('✓ somme de la base et des options');
assert.equal(formaterMontant(1234567), '1 234 567'); console.log('✓ format des montants');
assert.equal(libelleEstimation({ min: 1000, max: 2000, devise: 'MAD', regime: 'HT' }), 'Fourchette indicative : 1 000 à 2 000 MAD HT'); console.log('✓ libellé');
console.log('tout passe');
