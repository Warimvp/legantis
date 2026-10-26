// Formulaire de devis de legantis.net : reçoit le POST du formulaire de la carte #devis des deux accueils, et le transmet par e-mail
// à contact@legantis.net (API Resend, domaine legantis.net déjà vérifié). Le site reste statique et sans script : le navigateur envoie le
// formulaire tel quel (application/x-www-form-urlencoded) et ce Worker répond par un 303 vers l'accueil, ancre #devis-envoye ou
// #devis-echec (le message s'affiche par :target, en CSS). Rien n'est stocké : ni base, ni KV, ni journal du contenu.
//
// Variables (wrangler.jsonc) : SITE_ORIGIN, MAIL_TO, MAIL_FROM. Secret : RESEND_API_KEY (wrangler secret put, jamais dans le dépôt).
// Binding optionnel : LIMITE (Rate Limiting) ; absent, la limite de débit est simplement sautée (tests, wrangler dev).

const TAILLE_MAX = 16 * 1024;                 // un formulaire de devis tient en quelques centaines d'octets
const RESEND = 'https://api.resend.com/emails';

// Listes blanches : on ne recopie dans le mail que des valeurs connues (les libellés sont ceux du formulaire).
const SUPPORTS = { web: 'Web', iphone: 'iPhone', android: 'Android' };
const DELAIS = { vite: 'Dès que possible', '1mois': 'Sous 1 mois', '3mois': 'Sous 3 mois', libre: 'Pas de date précise' };
// Type de projet = les cinq prestations du site, plus « autre ». Facultatif ici : une page en cache d'avant ce champ (26/10/2026) doit encore pouvoir envoyer.
const TYPES = { site: 'Site web', web: 'Application web', mobile: 'Application mobile', logiciel: 'Logiciel métier', conseil: 'Conseil ou reprise d\'une application', autre: 'Autre, ou à définir ensemble' };

// Chemins de retour fixes : jamais d'adresse fournie par le visiteur (pas de redirection ouverte).
const RETOUR = { fr: '/', en: '/en/' };

function retour(env, langue, ancre) {
  const chemin = RETOUR[langue] || RETOUR.fr;
  return new Response(null, { status: 303, headers: { Location: env.SITE_ORIGIN + chemin + '#' + ancre, 'Cache-Control': 'no-store' } });
}

function refus(statut, texte) {
  return new Response(texte, { status: statut, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'POST' } });
}

// Une requête venue d'une AUTRE page web est écartée (Origin, à défaut Referer). Sans l'un ni l'autre (client qui les retire, curl) :
// acceptée, car ces en-têtes se falsifient de toute façon ; le but est d'empêcher qu'une page tierce fasse poster un visiteur.
function origineAcceptee(request, env) {
  const origine = request.headers.get('Origin');
  if (origine && origine !== 'null') return origine === env.SITE_ORIGIN;
  const referent = request.headers.get('Referer');
  if (referent) return referent.startsWith(env.SITE_ORIGIN + '/');
  return true;
}

// Champ texte : une seule ligne ou plusieurs, sans caractères de contrôle (hors saut de ligne), borné.
function texte(valeur, max, multiligne) {
  let t = typeof valeur === 'string' ? valeur : '';
  t = t.replace(multiligne ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');
  if (multiligne) t = t.replace(/\r\n?/g, '\n');
  return t.trim().slice(0, max);
}

function lire(donnees) {
  const nom = texte(donnees.get('nom'), 100);
  const email = texte(donnees.get('email'), 254);
  const telephone = texte(donnees.get('telephone'), 30);
  const entreprise = texte(donnees.get('entreprise'), 120);
  const type = Object.hasOwn(TYPES, donnees.get('type')) ? donnees.get('type') : '';
  const projet = texte(donnees.get('projet'), 4000, true);
  const supports = [...new Set(donnees.getAll('supports'))].filter(s => Object.hasOwn(SUPPORTS, s));
  const delai = Object.hasOwn(DELAIS, donnees.get('delai')) ? donnees.get('delai') : '';
  const langue = donnees.get('langue') === 'en' ? 'en' : 'fr';
  const valide = nom.length >= 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && projet.length >= 10;
  return { nom, email, telephone, entreprise, type, projet, supports, delai, langue, valide };
}

function corps(d) {
  return [
    'Demande de devis reçue par le formulaire de legantis.net (page ' + (d.langue === 'en' ? 'anglaise' : 'française') + ').',
    '',
    'Type de projet : ' + (d.type ? TYPES[d.type] : 'non précisé'),
    'Nom : ' + d.nom,
    'Entreprise : ' + (d.entreprise || 'non indiquée'),
    'E-mail : ' + d.email,
    'Téléphone : ' + (d.telephone || 'non indiqué'),
    'Supports : ' + (d.supports.length ? d.supports.map(s => SUPPORTS[s]).join(', ') : 'non précisés'),
    'Délai souhaité : ' + (d.delai ? DELAIS[d.delai] : 'non précisé'),
    '',
    'Projet :',
    d.projet,
    '',
    '— Répondre à ce message écrit directement à ' + d.nom + ' (« Répondre » utilise son adresse).',
  ].join('\n');
}

async function envoyer(d, env) {
  const reponse = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.MAIL_TO],
      reply_to: d.email,
      subject: ('Demande de devis — ' + (d.type ? TYPES[d.type] + ' — ' : '') + d.nom).slice(0, 120),
      text: corps(d),
    }),
    signal: AbortSignal.timeout(8000),
  });
  return reponse.ok;
}

// Corps lu par morceaux et abandonné au-delà de TAILLE_MAX (un en-tête Content-Length peut manquer ou mentir) ; null = trop grand.
async function lireCorps(request) {
  if (Number(request.headers.get('Content-Length')) > TAILLE_MAX) return null;
  if (!request.body) return '';
  const lecteur = request.body.getReader();
  const decodeur = new TextDecoder();
  let texte = '';
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) return texte + decodeur.decode();
    total += value.byteLength;
    if (total > TAILLE_MAX) { await lecteur.cancel(); return null; }
    texte += decodeur.decode(value, { stream: true });
  }
}

async function traiter(request, env) {
  if (request.method !== 'POST') return refus(405, 'Formulaire de devis de legantis.net : POST seulement.');
  if (!origineAcceptee(request, env)) return refus(403, 'Origine refusée.');
  if (!(request.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded')) return refus(415, 'Format non pris en charge.');
  const brut = await lireCorps(request);
  if (brut === null) return refus(413, 'Demande trop grande.');

  const donnees = new URLSearchParams(brut);
  const d = lire(donnees);

  // Champ piège : invisible pour une personne, rempli par les robots. On répond « envoyé » sans rien envoyer, pour ne rien leur apprendre.
  if (texte(donnees.get('site_web'), 200) !== '') return retour(env, d.langue, 'devis-envoye');

  if (!d.valide) return retour(env, d.langue, 'devis-echec');
  if (env.LIMITE) {
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    const { success } = await env.LIMITE.limit({ key: ip });
    if (!success) return retour(env, d.langue, 'devis-echec');
  }
  return retour(env, d.langue, (await envoyer(d, env)) ? 'devis-envoye' : 'devis-echec');
}

export default {
  async fetch(request, env) {
    try {
      return await traiter(request, env);
    } catch (e) {
      // Pas de journal du contenu (données personnelles) : seulement le type d'erreur, et le visiteur voit le message d'échec.
      console.error('devis:', e && e.name);
      return retour(env, 'fr', 'devis-echec');
    }
  },
};
