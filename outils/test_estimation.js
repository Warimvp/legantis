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
// Option « requis » : un prix n'est donné que si les pages sont connues.
const GR = { valide: true, devise: 'MAD', regime: 'HT', postes: { vitrine: { valide: true, requis: ['pages:'], base: { min: 7, max: 7 }, options: { 'pages:1a3': { min: 0, max: 0 }, formulaire: { min: 0, max: 0 } } } } };
assert.equal(estimer(GR, { type: 'vitrine' }), null); console.log('✓ requis : pages absentes, pas de prix');
assert.equal(estimer(GR, { type: 'vitrine', pages: '' }), null); console.log('✓ requis : pages vides, pas de prix');
assert.deepEqual(estimer(GR, { type: 'vitrine', pages: '1a3', fonctions: ['formulaire'] }), { min: 7, max: 7, devise: 'MAD', regime: 'HT' }); console.log('✓ requis : pages connues, prix');
assert.equal(libelleEstimation({ min: 7, max: 7, devise: 'MAD', regime: 'HT' }), 'Prix indicatif : 7 MAD HT'); console.log('✓ libellé d\'un prix unique');

// La configuration réelle (config/commercial.json) : le prix d'appel ne vaut que pour le périmètre écrit. CONFIG_COMMERCIAL=<fichier> pour éprouver un fichier saboté.
const fs = require('node:fs'), chemin = require('node:path');
const conf = JSON.parse(fs.readFileSync(process.env.CONFIG_COMMERCIAL || chemin.join(__dirname, '..', 'config', 'commercial.json'), 'utf8'));
const g = conf.grille;
if (g && g.valide === true) {
  const prix = (c) => estimer(g, c);
  assert.deepEqual(prix({ type: 'vitrine', pages: '1a3', fonctions: ['formulaire', 'whatsapp'] }), { min: 3490, max: 3490, devise: 'MAD', regime: 'HT' }); console.log('✓ configuration : trois pages, formulaire et WhatsApp = prix d\'appel');
  assert.deepEqual(prix({ type: 'vitrine', pages: '1a3' }), { min: 3490, max: 3490, devise: 'MAD', regime: 'HT' }); console.log('✓ configuration : trois pages sans option = prix d\'appel');
  for (const [nom, c] of [
    ['pages non précisées', { type: 'vitrine', fonctions: ['formulaire'] }],
    ['pages vides', { type: 'vitrine', pages: '', fonctions: [] }],
    ['4 à 6 pages', { type: 'vitrine', pages: '4a6' }],
    ['7 à 15 pages', { type: 'vitrine', pages: '7a15' }],
    ['plus de 15 pages', { type: 'vitrine', pages: 'plus15' }],
    ['nombre de pages inconnu', { type: 'vitrine', pages: 'inconnu' }],
    ['blog en plus', { type: 'vitrine', pages: '1a3', fonctions: ['blog'] }],
    ['multilingue', { type: 'vitrine', pages: '1a3', fonctions: ['multilingue'] }],
    ['e-commerce', { type: 'ecommerce', fonctions: ['catalogue'] }],
    ['application web', { type: 'web', fonctions: ['authentification'] }],
    ['application mobile', { type: 'mobile' }],
    ['logiciel de gestion', { type: 'logiciel' }],
    ['autre besoin', { type: 'autre' }],
    ['vitrine avec espace client', { type: 'vitrine', pages: '1a3', fonctions: ['espace-client'] }],
    ['vitrine avec paiement en ligne', { type: 'vitrine', pages: '1a3', fonctions: ['paiement-ligne'] }],
  ]) { assert.equal(prix(c), null, 'devis personnalisé attendu : ' + nom); console.log('✓ configuration : ' + nom + ' = devis personnalisé'); }
}
console.log('tout passe');
