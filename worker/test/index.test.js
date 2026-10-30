// Tests du Worker du formulaire de devis : `node --test test/*.test.js` (aucune dépendance). fetch est remplacé par un double qui note les envois
// à Resend ; le binding de limite de débit est un double aussi. Chaque garde-fou a un test qui échoue s'il est retiré (voir sabotages.sh).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const URL_WORKER = 'https://legantis-devis.exemple.workers.dev/';
const ENV = { SITE_ORIGIN: 'https://legantis.net', MAIL_TO: 'contact@legantis.net', MAIL_FROM: 'Formulaire legantis.net <formulaire@legantis.net>', RESEND_API_KEY: 're_cle_de_test' };
const VALIDE = { nom: 'Amina Benali', email: 'amina@exemple.ma', telephone: '+212 6 12 34 56 78', projet: 'Une application de réservation pour mon salon de coiffure.', delai: '3mois', langue: 'fr' };

let envois;          // appels à Resend : { url, options, corps }
let reponseResend;   // () => Response | throw
const realFetch = globalThis.fetch;
beforeEach(() => {
  envois = [];
  reponseResend = () => new Response('{"id":"x"}', { status: 200 });
  globalThis.fetch = async (url, options) => { envois.push({ url, options, corps: JSON.parse(options.body) }); return reponseResend(); };
});
afterEach(() => { globalThis.fetch = realFetch; });

// Requête de formulaire telle que l'envoie un navigateur : urlencoded, Origin du site, Content-Length. `champs` : objet, ou tableau de paires pour les champs répétés.
function post(champs, { entetes = {}, corps } = {}) {
  const paires = Array.isArray(champs) ? champs : Object.entries(champs);
  const brut = corps ?? new URLSearchParams(paires).toString();
  return new Request(URL_WORKER, {
    method: 'POST', body: brut,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(new TextEncoder().encode(brut).length), Origin: 'https://legantis.net', 'CF-Connecting-IP': '203.0.113.7', ...entetes },
  });
}
const lieu = r => r.headers.get('Location');

test('un devis valide part par Resend et renvoie vers #devis-envoye (FR)', async () => {
  const r = await worker.fetch(post(VALIDE), ENV);
  assert.equal(r.status, 303);
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 1);
  const { url, options, corps } = envois[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.headers.Authorization, 'Bearer re_cle_de_test');
  assert.deepEqual(corps.to, ['contact@legantis.net']);
  assert.equal(corps.from, ENV.MAIL_FROM);
  assert.equal(corps.reply_to, 'amina@exemple.ma');
  assert.equal(corps.subject, 'Demande de devis — Amina Benali');
  for (const morceau of ['Nom : Amina Benali', 'E-mail : amina@exemple.ma', 'Téléphone : +212 6 12 34 56 78', 'Délai souhaité : Sous 3 mois', 'Supports : non précisés', 'salon de coiffure']) assert.ok(corps.text.includes(morceau), morceau);
});

// VALIDE n'a ni type ni entreprise : c'est le formulaire d'avant le 26/10/2026, qu'une page en cache peut encore envoyer
test('une page d\'avant les champs type et entreprise envoie toujours', async () => {
  const r = await worker.fetch(post(VALIDE), ENV);
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 1);
  assert.ok(envois[0].corps.text.includes('Type de projet : non précisé'));
  assert.ok(envois[0].corps.text.includes('Entreprise : non indiquée'));
});

test('type de projet et entreprise : recopiés, le type seulement s\'il est connu', async () => {
  await worker.fetch(post({ ...VALIDE, type: 'mobile', entreprise: 'Salon Amina' }), ENV);
  assert.equal(envois[0].corps.subject, 'Demande de devis — Application mobile — Amina Benali');
  assert.ok(envois[0].corps.text.includes('Type de projet : Application mobile\n'));
  assert.ok(envois[0].corps.text.includes('Entreprise : Salon Amina\n'));
  for (const mauvais of ['<script>', 'constructor', '__proto__', 'Mobile']) {
    envois.length = 0;
    await worker.fetch(post({ ...VALIDE, type: mauvais }), ENV);
    assert.equal(envois[0].corps.subject, 'Demande de devis — Amina Benali', mauvais);
    assert.ok(envois[0].corps.text.includes('Type de projet : non précisé'), mauvais);
  }
});

test('entreprise : une seule ligne, bornée à 120 caractères', async () => {
  await worker.fetch(post({ ...VALIDE, entreprise: 'Salon\r\nBcc: pirate@exemple.com ' + 'x'.repeat(300) }), ENV);
  const ligne = envois[0].corps.text.split('\n').find(l => l.startsWith('Entreprise : '));
  assert.ok(!ligne.includes('\r'));
  assert.ok(envois[0].corps.text.includes('Entreprise : Salon  Bcc: pirate@exemple.com'));
  assert.ok(ligne.length <= 'Entreprise : '.length + 120, String(ligne.length));
});

test('la page anglaise revient sur /en/', async () => {
  const r = await worker.fetch(post({ ...VALIDE, langue: 'en' }), ENV);
  assert.equal(lieu(r), 'https://legantis.net/en/#devis-envoye');
  assert.ok(envois[0].corps.text.includes('page anglaise'));
});

test('la langue ne peut pas servir à rediriger ailleurs', async () => {
  for (const mauvais of ['https://evil.example/', '//evil.example', '../x', 'EN', '__proto__']) {
    const r = await worker.fetch(post({ ...VALIDE, langue: mauvais }), ENV);
    assert.equal(lieu(r), 'https://legantis.net/#devis-envoye', mauvais);
  }
});

test('supports et délai : seules les valeurs connues sont recopiées', async () => {
  await worker.fetch(post([...Object.entries(VALIDE), ['supports', 'web'], ['supports', 'iphone'], ['supports', 'web'], ['supports', '<script>']]), ENV);
  assert.ok(envois[0].corps.text.includes('Supports : Web, iPhone\n'));
  assert.ok(!envois[0].corps.text.includes('script'));
  envois.length = 0;
  await worker.fetch(post({ ...VALIDE, delai: 'constructor' }), ENV);
  assert.ok(envois[0].corps.text.includes('Délai souhaité : non précisé'));
});

test('champ piège rempli : réponse « envoyé » mais rien n\'est envoyé', async () => {
  const r = await worker.fetch(post({ ...VALIDE, site_web: 'https://spam.example' }), ENV);
  assert.equal(r.status, 303);
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 0);
});

test('champs manquants ou invalides : #devis-echec, aucun envoi', async () => {
  const cas = {
    'nom vide': { nom: '   ' }, 'nom absent': { nom: undefined },
    'e-mail sans arobase': { email: 'amina.exemple.ma' }, 'e-mail avec espace': { email: 'am ina@exemple.ma' }, 'e-mail sans point': { email: 'amina@exemple' }, 'e-mail absent': { email: undefined },
    'projet trop court': { projet: 'Bonjour' }, 'projet absent': { projet: undefined },
  };
  for (const [nom, modif] of Object.entries(cas)) {
    const champs = Object.fromEntries(Object.entries({ ...VALIDE, ...modif }).filter(([, v]) => v !== undefined));
    const r = await worker.fetch(post(champs), ENV);
    assert.equal(lieu(r), 'https://legantis.net/#devis-echec', nom);
  }
  assert.equal(envois.length, 0);
});

test('un retour à la ligne dans le nom ne passe pas dans l\'objet du mail', async () => {
  await worker.fetch(post({ ...VALIDE, nom: 'Amina\r\nBcc: pirate@exemple.com' }), ENV);
  assert.ok(!/[\r\n]/.test(envois[0].corps.subject));
});

test('le projet garde ses sauts de ligne, borné à 4000 caractères', async () => {
  await worker.fetch(post({ ...VALIDE, projet: 'Ligne un\r\nLigne deux ' + 'x'.repeat(5000) }), ENV);
  const t = envois[0].corps.text;
  assert.ok(t.includes('Ligne un\nLigne deux '));
  assert.ok(t.length < 4000 + 700);
});

test('une autre origine est refusée (403) ; Origin null + Referer étranger aussi', async () => {
  let r = await worker.fetch(post(VALIDE, { entetes: { Origin: 'https://evil.example' } }), ENV);
  assert.equal(r.status, 403);
  r = await worker.fetch(post(VALIDE, { entetes: { Origin: 'https://legantis.net.evil.example' } }), ENV);
  assert.equal(r.status, 403);
  r = await worker.fetch(post(VALIDE, { entetes: { Origin: 'null', Referer: 'https://evil.example/page' } }), ENV);
  assert.equal(r.status, 403);
  r = await worker.fetch(post(VALIDE, { entetes: { Origin: 'null', Referer: 'https://legantis.net.evil.example/' } }), ENV);
  assert.equal(r.status, 403);
  assert.equal(envois.length, 0);
});

test('origine du site, Origin null avec Referer du site, ou aucun des deux : acceptés', async () => {
  for (const entetes of [{}, { Origin: 'null', Referer: 'https://legantis.net/en/' }, { Origin: '' }]) {
    const r = await worker.fetch(post(VALIDE, { entetes }), ENV);
    assert.equal(r.status, 303, JSON.stringify(entetes));
  }
  assert.equal(envois.length, 3);
});

test('seul POST est accepté', async () => {
  for (const methode of ['GET', 'PUT', 'DELETE']) {
    const r = await worker.fetch(new Request(URL_WORKER, { method: methode, headers: { Origin: 'https://legantis.net' } }), ENV);
    assert.equal(r.status, 405, methode);
  }
  assert.equal(envois.length, 0);
});

test('autre type de contenu : 415', async () => {
  const r = await worker.fetch(post(VALIDE, { entetes: { 'Content-Type': 'application/json' }, corps: JSON.stringify(VALIDE) }), ENV);
  assert.equal(r.status, 415);
  assert.equal(envois.length, 0);
});

test('corps trop grand : 413, déclaré ou non', async () => {
  const gros = new URLSearchParams({ ...VALIDE, projet: 'x'.repeat(20000) }).toString();
  let r = await worker.fetch(post(VALIDE, { corps: gros }), ENV);                         // Content-Length honnête
  assert.equal(r.status, 413);
  r = await worker.fetch(post(VALIDE, { corps: gros, entetes: { 'Content-Length': '100' } }), ENV);   // Content-Length menteur
  assert.equal(r.status, 413);
  assert.equal(envois.length, 0);
});

test('Resend en erreur, ou injoignable : #devis-echec', async () => {
  reponseResend = () => new Response('{"message":"x"}', { status: 500 });
  let r = await worker.fetch(post(VALIDE), ENV);
  assert.equal(lieu(r), 'https://legantis.net/#devis-echec');
  reponseResend = () => { throw new TypeError('réseau'); };
  r = await worker.fetch(post(VALIDE), ENV);
  assert.equal(r.status, 303);
  assert.equal(lieu(r), 'https://legantis.net/#devis-echec');
});

test('limite de débit : refusé sans envoi si le binding dit non, clé = adresse IP', async () => {
  const cles = [];
  const refuse = { limit: async ({ key }) => { cles.push(key); return { success: false }; } };
  let r = await worker.fetch(post(VALIDE), { ...ENV, LIMITE: refuse });
  assert.equal(lieu(r), 'https://legantis.net/#devis-echec');
  assert.deepEqual(cles, ['203.0.113.7']);
  assert.equal(envois.length, 0);
  const accepte = { limit: async () => ({ success: true }) };
  r = await worker.fetch(post(VALIDE), { ...ENV, LIMITE: accepte });
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 1);
});

test('la clé Resend et le contenu du message ne sortent jamais dans une réponse ni un journal', async () => {
  const journal = [];
  const vraiErreur = console.error; console.error = (...a) => journal.push(a.join(' '));
  try {
    reponseResend = () => { throw new Error('boom ' + VALIDE.email + ' ' + ENV.RESEND_API_KEY); };
    const r = await worker.fetch(post(VALIDE), ENV);
    const tout = [r.status, lieu(r), [...r.headers].join(), await r.text(), journal.join()].join('\n');
    assert.ok(!tout.includes('re_cle_de_test'));
    assert.ok(!tout.includes('amina@exemple.ma'));
    assert.ok(!tout.includes('salon'));
  } finally { console.error = vraiErreur; }
});

test('une exception inattendue ne donne jamais une page d\'erreur : #devis-echec', async () => {
  const r = await worker.fetch(post(VALIDE), { ...ENV, LIMITE: { limit: async () => { throw new Error('binding en panne'); } } });
  assert.equal(r.status, 303);
  assert.equal(lieu(r), 'https://legantis.net/#devis-echec');
});

// Parcours d'acquisition /commandes/ : qualification en liste blanche, retour sur la page, priorité dans l'objet du mail
const COMMANDES = { ...VALIDE, parcours: 'commandes', type: 'logiciel', entreprise: 'Distribution Atlas', activite: 'distribution', ville: 'casablanca', equipe: '4-10', budget: '50-100', delai: '3mois' };

test('parcours commandes : une demande qualifiée part en priorité A et revient sur la page', async () => {
  const r = await worker.fetch(post(COMMANDES), ENV);
  assert.equal(lieu(r), 'https://legantis.net/commandes/#devis-envoye');
  assert.equal(envois.length, 1);
  assert.equal(envois[0].corps.subject, 'Demande commandes — Priorité A — Distribution Atlas — Amina Benali');
  for (const morceau of ['Priorité estimée : A', 'Activité : Distribution ou vente en gros', 'Ville : Casablanca-Mohammedia', 'Utilisateurs prévus : 4 à 10', 'Budget envisagé : 50 000 à 100 000 MAD', 'Délai souhaité : Sous 3 mois']) assert.ok(envois[0].corps.text.includes(morceau), morceau);
});

test('parcours commandes : budget sous le plancher = priorité C, budget à définir ou hors cible = priorité B', async () => {
  await worker.fetch(post({ ...COMMANDES, budget: 'moins25' }), ENV);
  await worker.fetch(post({ ...COMMANDES, budget: 'definir' }), ENV);
  await worker.fetch(post({ ...COMMANDES, activite: 'services' }), ENV);
  await worker.fetch(post({ ...COMMANDES, delai: 'libre' }), ENV);
  assert.deepEqual(envois.map(e => e.corps.subject.match(/Priorité (.)/)[1]), ['C', 'B', 'B', 'B']);
});

test('parcours commandes : tout champ de qualification manquant ou hors liste refuse la demande, sans envoi', async () => {
  for (const manque of ['entreprise', 'telephone', 'delai', 'activite', 'ville', 'equipe', 'budget']) {
    const { [manque]: _, ...champs } = COMMANDES;
    const r = await worker.fetch(post(champs), ENV);
    assert.equal(lieu(r), 'https://legantis.net/commandes/#devis-echec', manque);
  }
  const r = await worker.fetch(post({ ...COMMANDES, budget: '999999' }), ENV);
  assert.equal(lieu(r), 'https://legantis.net/commandes/#devis-echec');
  assert.equal(envois.length, 0);
});

test('parcours commandes : le champ piège répond « envoyé » sur la page, sans envoi', async () => {
  const r = await worker.fetch(post({ ...COMMANDES, site_web: 'robot' }), ENV);
  assert.equal(lieu(r), 'https://legantis.net/commandes/#devis-envoye');
  assert.equal(envois.length, 0);
});

test('un parcours inconnu ne redirige jamais ailleurs : retour à l\'accueil, formulaire générique', async () => {
  const r = await worker.fetch(post({ ...VALIDE, parcours: 'https://exemple.test/' }), ENV);
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.ok(envois[0].corps.subject.startsWith('Demande de devis'));
  assert.ok(!envois[0].corps.text.includes('Priorité estimée'));
});

test('le formulaire générique n\'exige aucun champ de qualification', async () => {
  await worker.fetch(post(VALIDE), ENV);
  assert.equal(envois.length, 1);
  assert.ok(!envois[0].corps.text.includes('Budget envisagé'));
});
