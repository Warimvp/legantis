// Tests du Worker du formulaire de devis : `node --test test/*.test.js` (aucune dépendance). fetch est remplacé par un double qui note les envois
// à Resend ; le binding de limite de débit est un double aussi. Chaque garde-fou a un test qui échoue s'il est retiré (voir sabotages.sh).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

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
  for (const morceau of ['Nom : Amina Benali', 'E-mail : amina@exemple.ma', 'Téléphone : +212 6 12 34 56 78', 'Délai souhaité : Sous 3 mois', 'Supports visés : non précisés', 'salon de coiffure']) assert.ok(corps.text.includes(morceau), morceau);
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
  assert.ok(envois[0].corps.text.includes('Supports visés : Web, iPhone\n'));
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


// ── Compteur de demandes (binding D1 MESURES) ──────────────────────────────────────────────────────────────────────────
// Base D1 simulée par une vraie base SQLite en mémoire qui exécute la migration elle-même : le SQL testé est celui de la prod.
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_mesures.sql', import.meta.url), 'utf8'));
  return {
    db,
    prepare(sql) {
      let p = [];
      return {
        bind(...v) { p = v; return this; },
        async run() { const r = db.prepare(sql).run(...p); return { success: true, meta: { changes: Number(r.changes) } }; },
        async all() { return { results: db.prepare(sql).all(...p) }; },
        async first() { return db.prepare(sql).get(...p) ?? null; },
      };
    },
  };
}
const compte = (base, issue) => base.db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM devis_compteur WHERE issue = ?').get(issue).n;
const AVEC_TYPE = { ...VALIDE, type: 'mobile', entreprise: 'Salon Amina' };

test('mesure : un envoi accepté est compté une fois, avec le jour, le type et la langue, rien de personnel', async () => {
  const base = d1();
  const r = await worker.fetch(post(AVEC_TYPE), { ...ENV, MESURES: base });
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  const lignes = base.db.prepare('SELECT * FROM devis_compteur').all();
  assert.equal(lignes.length, 1);
  assert.deepEqual({ ...lignes[0] }, { jour: new Date().toISOString().slice(0, 10), issue: 'envoye', type: 'mobile', langue: 'fr', parcours: '', source: '', campagne: '', n: 1 });
  const tout = JSON.stringify([lignes, base.db.prepare('SELECT * FROM devis_empreintes').all()]);
  for (const perso of ['Amina', 'amina@exemple.ma', '+212', 'Salon', 'coiffure']) assert.ok(!tout.includes(perso), perso);
  const [{ empreinte }] = base.db.prepare('SELECT empreinte FROM devis_empreintes').all();
  assert.match(empreinte, /^[0-9a-f]{64}$/);
});

test('mesure : la même demande renvoyée (double clic, retour arrière) ne part pas deux fois et n\'est comptée qu\'une fois', async () => {
  const base = d1(); const env = { ...ENV, MESURES: base };
  const r1 = await worker.fetch(post(AVEC_TYPE), env);
  const r2 = await worker.fetch(post(AVEC_TYPE), env);
  assert.equal(lieu(r1), 'https://legantis.net/#devis-envoye');
  assert.equal(lieu(r2), 'https://legantis.net/#devis-envoye');   // la personne voit le même message
  assert.equal(envois.length, 1);
  assert.equal(compte(base, 'envoye'), 1);
  assert.equal(compte(base, 'doublon'), 1);
  // l'e-mail en majuscules est la même demande ; un autre projet est une autre demande
  await worker.fetch(post({ ...AVEC_TYPE, email: 'AMINA@exemple.ma' }), env);
  assert.equal(envois.length, 1);
  await worker.fetch(post({ ...AVEC_TYPE, projet: 'Un second projet, différent du premier, pour la boutique.' }), env);
  assert.equal(envois.length, 2);
  assert.equal(compte(base, 'envoye'), 2);
});

test('mesure : deux envois simultanés de la même demande ne donnent qu\'un mail', async () => {
  const base = d1(); const env = { ...ENV, MESURES: base };
  const [a, b] = await Promise.all([worker.fetch(post(AVEC_TYPE), env), worker.fetch(post(AVEC_TYPE), env)]);
  assert.equal(lieu(a), 'https://legantis.net/#devis-envoye');
  assert.equal(lieu(b), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 1);
  assert.equal(compte(base, 'envoye') + compte(base, 'doublon'), 2);
});

test('mesure : après un échec d\'envoi, un nouvel essai part (l\'empreinte est retirée) ; échec et exception comptés', async () => {
  const base = d1(); const env = { ...ENV, MESURES: base };
  reponseResend = () => new Response('{}', { status: 500 });
  assert.equal(lieu(await worker.fetch(post(AVEC_TYPE), env)), 'https://legantis.net/#devis-echec');
  assert.equal(compte(base, 'echec_envoi'), 1);
  reponseResend = () => { throw new TypeError('réseau'); };
  assert.equal(lieu(await worker.fetch(post(AVEC_TYPE), env)), 'https://legantis.net/#devis-echec');
  assert.equal(compte(base, 'exception'), 1);
  assert.equal(base.db.prepare('SELECT COUNT(*) AS n FROM devis_empreintes').get().n, 0);
  reponseResend = () => new Response('{"id":"x"}', { status: 200 });
  assert.equal(lieu(await worker.fetch(post(AVEC_TYPE), env)), 'https://legantis.net/#devis-envoye');
  assert.equal(compte(base, 'envoye'), 1);
  assert.equal(compte(base, 'doublon'), 0);
});

test('mesure : une empreinte expirée (plus de 10 min) est purgée, la demande repart', async () => {
  const base = d1(); const env = { ...ENV, MESURES: base };
  await worker.fetch(post(AVEC_TYPE), env);
  base.db.prepare('UPDATE devis_empreintes SET expire = ?').run(Math.floor(Date.now() / 1000) - 1);
  await worker.fetch(post(AVEC_TYPE), env);
  assert.equal(envois.length, 2);
  assert.equal(compte(base, 'envoye'), 2);
});

test('mesure : piège, champs invalides et limite de débit comptés, sans envoi', async () => {
  const base = d1();
  await worker.fetch(post({ ...AVEC_TYPE, site_web: 'https://spam.example' }), { ...ENV, MESURES: base });
  await worker.fetch(post({ ...AVEC_TYPE, email: 'pas-un-email' }), { ...ENV, MESURES: base });
  await worker.fetch(post(AVEC_TYPE), { ...ENV, MESURES: base, LIMITE: { limit: async () => ({ success: false }) } });
  assert.equal(envois.length, 0);
  assert.deepEqual([compte(base, 'piege'), compte(base, 'invalide'), compte(base, 'limite'), compte(base, 'envoye')], [1, 1, 1, 0]);
});

test('mesure : une base en panne ne bloque jamais un envoi (ni la réponse)', async () => {
  const panne = { prepare() { throw new Error('D1 indisponible'); } };
  const r = await worker.fetch(post(AVEC_TYPE), { ...ENV, MESURES: panne });
  assert.equal(lieu(r), 'https://legantis.net/#devis-envoye');
  assert.equal(envois.length, 1);
});

test('mesure : sans binding MESURES, aucun dédoublonnage (comportement d\'avant la mesure)', async () => {
  await worker.fetch(post(AVEC_TYPE), ENV);
  await worker.fetch(post(AVEC_TYPE), ENV);
  assert.equal(envois.length, 2);
});

// ── Parcours qualifiants (simulateur, mini-audit, page d'offre) ──────────────────────────────────────────────────────────────────────────
const SIMULATEUR = { parcours: 'simulateur', langue: 'fr', type: 'vitrine', pages_site: '4a6', delai: '1a3mois', budget: '5a15', nom: 'Karim Alaoui', entreprise: 'Plomberie Alaoui', email: 'karim@exemple.ma', telephone: '06 12 34 56 78', projet: 'Un site pour présenter mes services à Rabat.', consentement: 'oui' };
const AUDIT = { parcours: 'audit', langue: 'fr', url_site: 'https://www.plomberie-exemple.ma/', nom: 'Karim Alaoui', entreprise: 'Plomberie Alaoui', email: 'karim@exemple.ma', telephone: '06 12 34 56 78', consentement: 'oui' };
const JSON_OK = { entetes: { Accept: 'application/json' } };

test('simulateur : le récapitulatif complet part dans le mail, retour sur la page du simulateur', async () => {
  const r = await worker.fetch(post([...Object.entries(SIMULATEUR), ['fonctions', 'formulaire'], ['fonctions', 'whatsapp'], ['fonctions', 'formulaire'], ['fonctions', '<script>'], ['estimation', 'Estimation personnalisée']]), ENV);
  assert.equal(lieu(r), 'https://legantis.net/estimer-mon-projet/#devis-envoye');
  const { subject, text } = envois[0].corps;
  assert.equal(subject, 'Demande de devis — Site vitrine — Karim Alaoui');
  for (const morceau of ['Parcours : Simulateur de projet', 'Nombre de pages : 4 à 6 pages', 'Fonctionnalités : Formulaire de contact, WhatsApp\n', 'Budget envisagé : 5 000 à 15 000 MAD', 'Délai souhaité : Dans 1 à 3 mois', 'Estimation affichée au visiteur : Estimation personnalisée', 'Consentement au traitement : oui', 'Entreprise : Plomberie Alaoui']) assert.ok(text.includes(morceau), morceau);
  assert.ok(!text.includes('script'));
});

test('simulateur : chaque champ obligatoire manquant est refusé côté serveur, sans envoi', async () => {
  for (const champ of ['type', 'budget', 'delai', 'entreprise', 'telephone', 'consentement', 'nom', 'email', 'projet']) {
    const r = await worker.fetch(post({ ...SIMULATEUR, [champ]: '' }, JSON_OK), ENV);
    assert.equal(r.status, 422, champ);
    assert.deepEqual((await r.json()).erreurs, [champ]);
  }
  assert.equal(envois.length, 0);
});

test('simulateur : valeurs hors liste blanche refusées comme absentes', async () => {
  for (const [champ, valeur] of [['type', 'constructor'], ['budget', '__proto__'], ['delai', 'toString']]) {
    const r = await worker.fetch(post({ ...SIMULATEUR, [champ]: valeur }, JSON_OK), ENV);
    assert.equal(r.status, 422, champ);
  }
  assert.equal(envois.length, 0);
});

test('téléphone : un numéro plausible est exigé dans les parcours, pas dans le formulaire générique', async () => {
  for (const faux of ['abc', '123', '1'.repeat(16), '06 12 <34> 56 78']) {
    const r = await worker.fetch(post({ ...SIMULATEUR, telephone: faux }, JSON_OK), ENV);
    assert.deepEqual((await r.json()).erreurs, ['telephone'], faux);
  }
  assert.equal((await worker.fetch(post({ ...SIMULATEUR, telephone: '+212 6 12 34 56 78' }, JSON_OK), ENV)).status, 200);
  assert.equal(lieu(await worker.fetch(post({ ...VALIDE, telephone: 'abc' }), ENV)), 'https://legantis.net/#devis-envoye');
});

test('sans script : un refus revient sur la page du parcours, jamais ailleurs', async () => {
  assert.equal(lieu(await worker.fetch(post({ ...SIMULATEUR, nom: '' }), ENV)), 'https://legantis.net/estimer-mon-projet/#devis-echec');
  assert.equal(lieu(await worker.fetch(post({ ...AUDIT, url_site: 'http://localhost/' }), ENV)), 'https://legantis.net/audit-gratuit/#devis-echec');
  assert.equal(lieu(await worker.fetch(post({ ...SIMULATEUR, parcours: 'offre' }), ENV)), 'https://legantis.net/offre-lancement/#devis-envoye');
  assert.equal(lieu(await worker.fetch(post({ ...VALIDE, parcours: 'https://malveillant.example/' }), ENV)), 'https://legantis.net/#devis-envoye');
  assert.equal(lieu(await worker.fetch(post({ ...VALIDE, parcours: 'constructor' }), ENV)), 'https://legantis.net/#devis-envoye');
});

test('JSON : succès, en-têtes CORS limités au site, aucune redirection', async () => {
  const r = await worker.fetch(post(SIMULATEUR, JSON_OK), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://legantis.net');
  assert.equal(r.headers.get('Location'), null);
  assert.equal(r.headers.get('Set-Cookie'), null);
});

test('JSON : Resend en panne = 503 sans liste d\'erreurs ; limite de débit signalée', async () => {
  reponseResend = () => new Response('{}', { status: 500 });
  const r = await worker.fetch(post(SIMULATEUR, JSON_OK), ENV);
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false });
  const r2 = await worker.fetch(post(SIMULATEUR, JSON_OK), { ...ENV, LIMITE: { limit: async () => ({ success: false }) } });
  assert.deepEqual(await r2.json(), { ok: false, code: 'limite' });
});

test('JSON : champ piège = « envoyé », rien ne part ; exception = 503 lisible', async () => {
  const r = await worker.fetch(post({ ...SIMULATEUR, site_web: 'robot' }, JSON_OK), ENV);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(envois.length, 0);
  reponseResend = () => { throw new TypeError('reseau'); };
  const journal = console.error; console.error = () => {};
  const r2 = await worker.fetch(post(SIMULATEUR, JSON_OK), ENV);
  console.error = journal;
  assert.equal(r2.status, 503);
  assert.equal(r2.headers.get('Access-Control-Allow-Origin'), 'https://legantis.net');
});

test('mini-audit : l\'adresse part dans le mail, le Worker n\'y fait AUCUNE requête, la description est facultative', async () => {
  const r = await worker.fetch(post(AUDIT), ENV);
  assert.equal(lieu(r), 'https://legantis.net/audit-gratuit/#devis-envoye');
  assert.equal(envois.length, 1);
  assert.equal(envois[0].url, 'https://api.resend.com/emails');
  assert.equal(envois[0].corps.subject, 'Demande de devis — Mini-audit gratuit — Karim Alaoui');
  assert.ok(envois[0].corps.text.includes('Site à analyser : https://www.plomberie-exemple.ma/'));
  assert.ok(!envois[0].corps.text.includes('Budget envisagé'));
});

test('mini-audit : adresse publique acceptée et normalisée', async () => {
  for (const [saisie, attendu] of [['plomberie-exemple.ma', 'https://plomberie-exemple.ma/'], ['http://exemple.ma/contact?x=1', 'http://exemple.ma/contact?x=1'], ['HTTPS://WWW.Exemple.MA', 'https://www.exemple.ma/'], ['exemple.ma/a?b=https://c.ma', 'https://exemple.ma/a?b=https://c.ma'], ['café-exemple.ma', new URL('https://café-exemple.ma').href]]) {
    envois.length = 0;
    await worker.fetch(post({ ...AUDIT, url_site: saisie }), ENV);
    assert.ok(envois[0]?.corps.text.includes('Site à analyser : ' + attendu), saisie);
  }
});

test('mini-audit : réseaux internes, IP, schémas et ports refusés', async () => {
  const refuses = ['http://localhost/', 'localhost', 'http://127.0.0.1/', '127.1', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://10.0.0.1/', 'http://192.168.1.1/admin', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://intranet/', 'http://serveur/', 'http://serveur.local/', 'http://db.internal/', 'https://nas.lan/', 'https://x.localhost/', 'https://exemple.ma:8443/', 'https://admin:secret@exemple.ma/', 'ftp://exemple.ma/', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'mailto:a@b.ma', 'http://exemple.invalid/', 'pas une adresse', '', 'kubernetes.default.svc'];
  for (const url of refuses) {
    const r = await worker.fetch(post({ ...AUDIT, url_site: url }, JSON_OK), ENV);
    assert.deepEqual((await r.json()).erreurs, ['url_site'], url);
  }
  assert.equal(envois.length, 0);
});

test('UTM : recopiées dans le mail, bornées, sans caractère dangereux ; rien sans UTM', async () => {
  await worker.fetch(post({ ...SIMULATEUR, utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'lancement-nov', utm_content: 'video 1', utm_term: 'x'.repeat(200) }), ENV);
  const { text } = envois[0].corps;
  assert.ok(text.includes('Source de la visite (UTM) : facebook / paid / lancement-nov / video 1 / ' + 'x'.repeat(80) + '\n'), text);
  envois.length = 0;
  await worker.fetch(post({ ...SIMULATEUR, utm_source: '<img src=x>' }), ENV);
  assert.ok(!envois[0].corps.text.includes('Source de la visite'));
  assert.ok(!envois[0].corps.text.includes('<img'));
});

test('ligne de suivi : colonnes de l\'onglet Prospects, tabulations, formule de tableur neutralisée', async () => {
  await worker.fetch(post({ ...SIMULATEUR, nom: '"=HYPERLINK("x")"', entreprise: 'A\tB', telephone: '+212 6 12 34 56 78', utm_source: 'facebook', utm_campaign: 'nov' }), ENV);
  const c = envois[0].corps.text.split('\n').find(l => l.includes('\t')).split('\t');
  assert.equal(c.length, 13, c.join('|'));
  assert.match(c[0], /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(c[2].startsWith("'="), c[2]);
  assert.ok(!c[2].includes('"'), 'guillemets retirés : ils cacheraient la formule');
  assert.equal(c[3], 'A B');
  assert.equal(c[6], 'karim@exemple.ma');
  assert.ok(c[7].startsWith("'+212"));
  assert.equal(c[9], 'facebook / nov');
  assert.equal(c[10], 'Simulateur de projet · Site vitrine');
  assert.deepEqual(c.slice(11), ['5 000 à 15 000 MAD', 'Dans 1 à 3 mois']);
});

test('formulaire générique : ni parcours ni consentement exigés, mail sans bloc de parcours', async () => {
  await worker.fetch(post(VALIDE), ENV);
  assert.ok(!envois[0].corps.text.includes('Parcours :'));
  assert.ok(!envois[0].corps.text.includes('Consentement'));
});

test('pack demandé : recopié s\'il est connu seulement', async () => {
  await worker.fetch(post({ ...SIMULATEUR, parcours: 'offre', pack: 'starter' }), ENV);
  assert.ok(envois[0].corps.text.includes('Pack demandé : Pack Starter'));
  envois.length = 0;
  await worker.fetch(post({ ...SIMULATEUR, parcours: 'offre', pack: 'gratuit-a-vie' }), ENV);
  assert.ok(!envois[0].corps.text.includes('Pack demandé'));
});

test('mesure : parcours, source et campagne comptés, rien de personnel', async () => {
  const base = d1();
  await worker.fetch(post({ ...SIMULATEUR, utm_source: 'facebook', utm_campaign: 'nov' }), { ...ENV, MESURES: base });
  const [ligne] = base.db.prepare('SELECT * FROM devis_compteur').all();
  assert.equal(ligne.parcours, 'simulateur');
  assert.equal(ligne.source, 'facebook');
  assert.equal(ligne.campagne, 'nov');
  assert.ok(!JSON.stringify(ligne).includes('Karim'));
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

test('estimation : seules les formes produites par la page passent dans le mail', async () => {
  for (const [valeur, present] of [['Estimation personnalisée', true], ['Fourchette indicative\u00A0: 1\u00A0000 à 2\u00A0000 MAD HT', true], ['Devis accepté à 1 MAD', false], ['<b>x</b>', false]]) {
    envois.length = 0;
    await worker.fetch(post({ ...SIMULATEUR, estimation: valeur }), ENV);
    assert.equal(envois[0].corps.text.includes('Estimation affichée au visiteur'), present, valeur);
  }
});

test('mesure : source et campagne ne sont comptées que pour un envoi réel', async () => {
  const base = d1();
  await worker.fetch(post({ ...SIMULATEUR, nom: '', utm_source: 'robot', utm_campaign: 'x' }), { ...ENV, MESURES: base });
  await worker.fetch(post({ ...SIMULATEUR, site_web: 'robot', utm_source: 'robot2' }), { ...ENV, MESURES: base });
  assert.deepEqual(base.db.prepare("SELECT DISTINCT source FROM devis_compteur").all().map(l => l.source), ['']);
});

test('une page d\'offre ne peut pas se faire passer pour /commandes/ ni l\'inverse : champs propres à chacune', async () => {
  const r = await worker.fetch(post({ ...SIMULATEUR, parcours: 'commandes' }, JSON_OK), ENV);
  assert.equal(r.status, 422);
  assert.ok((await r.json()).erreurs.includes('activite'));
});

test('ligne de suivi : la page /commandes/ remplit activité, ville et budget', async () => {
  await worker.fetch(post({ parcours: 'commandes', langue: 'fr', type: 'logiciel', entreprise: 'Négoce Test', nom: 'Sara', telephone: '0612345678', email: 'sara@exemple.ma', activite: 'distribution', ville: 'rabat', equipe: '4-10', budget: '25-50', delai: 'vite', projet: 'Nos commandes arrivent sur WhatsApp.' }), ENV);
  const c = envois[0].corps.text.split('\n').find(l => l.includes('\t')).split('\t');
  assert.deepEqual([c[4], c[5], c[10], c[11]], ['Distribution ou vente en gros', 'Rabat-Salé-Témara', 'Page Commandes · Logiciel de gestion', '25 000 à 50 000 MAD']);
});

test('/commandes/ : le consentement figure dans le mail, sans être exigé pour une page en cache', async () => {
  const base = { parcours: 'commandes', langue: 'fr', type: 'logiciel', entreprise: 'Négoce Test', nom: 'Sara', telephone: '0612345678', email: 'sara@exemple.ma', activite: 'distribution', ville: 'rabat', equipe: '4-10', budget: '25-50', delai: 'vite', projet: 'Nos commandes arrivent sur WhatsApp.' };
  await worker.fetch(post({ ...base, consentement: 'oui' }), ENV);
  assert.ok(envois[0].corps.text.includes('Consentement au traitement : oui'));
  envois.length = 0;
  const r = await worker.fetch(post(base), ENV);
  assert.equal(lieu(r), 'https://legantis.net/commandes/#devis-envoye');
  assert.ok(envois[0].corps.text.includes('Consentement au traitement : non'));
});

test('formulaire générique : la case cochée est notée, son absence ne bloque pas une page en cache', async () => {
  await worker.fetch(post({ ...VALIDE, consentement: 'oui' }), ENV);
  assert.ok(envois[0].corps.text.includes('Consentement au traitement : oui'));
});
