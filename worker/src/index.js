// Formulaires de legantis.net : reçoit le POST de la carte #devis des deux accueils et des parcours qualifiants (simulateur, mini-audit,
// page d'offre), et le transmet par e-mail à contact@legantis.net (API Resend, domaine legantis.net déjà vérifié). Sans script, le navigateur
// envoie le formulaire tel quel (application/x-www-form-urlencoded) et ce Worker répond par un 303 vers la page d'origine, ancre #devis-envoye
// ou #devis-echec (le message s'affiche par :target, en CSS). Avec script (assets/conversion.js), le même POST part avec Accept: application/json :
// la réponse est du JSON { ok, erreurs } et le formulaire garde ce que le visiteur a saisi. Rien n'est stocké : ni base, ni KV, ni journal du contenu.
//
// Variables (wrangler.jsonc) : SITE_ORIGIN, MAIL_TO, MAIL_FROM. Secret : RESEND_API_KEY (wrangler secret put, jamais dans le dépôt).
// Binding optionnel : LIMITE (Rate Limiting) ; absent, la limite de débit est simplement sautée (tests, wrangler dev).

const TAILLE_MAX = 16 * 1024;                 // un formulaire de devis tient en quelques centaines d'octets
const RESEND = 'https://api.resend.com/emails';

// Listes blanches : on ne recopie dans le mail que des valeurs connues (les libellés sont ceux du formulaire).
const SUPPORTS = { web: 'Web', iphone: 'iPhone', android: 'Android' };
const DELAIS = { vite: 'Dès que possible', '1mois': 'Sous 1 mois', '3mois': 'Sous 3 mois', libre: 'Pas de date précise', '1a3mois': 'Dans 1 à 3 mois', 'plus-tard': 'Plus tard' };
// Type de projet = les cinq prestations du site, plus « autre ». Facultatif ici : une page en cache d'avant ce champ (26/10/2026) doit encore pouvoir envoyer.
const TYPES = { site: 'Site web', vitrine: 'Site vitrine', ecommerce: 'Site e-commerce', web: 'Application web', mobile: 'Application mobile', logiciel: 'Logiciel de gestion', conseil: 'Conseil ou reprise d\'une application', autre: 'Autre, ou à définir ensemble' };

// Parcours qualifiants : le formulaire d'où vient la demande. Le chemin de retour est fixe (jamais une adresse fournie par le visiteur) ; sans parcours connu,
// c'est le formulaire générique des accueils, qui reste moins exigeant pour qu'une page en cache puisse toujours envoyer.
const PARCOURS = { simulateur: '/estimer-mon-projet/', audit: '/audit-gratuit/', offre: '/offre-lancement/', commandes: '/commandes/' };
const PARCOURS_LIBELLES = { simulateur: 'Simulateur de projet', audit: 'Mini-audit gratuit', offre: 'Page d\'offre de lancement', commandes: 'Page Commandes' };
const BUDGETS = { moins5: 'Moins de 5 000 MAD', '5a15': '5 000 à 15 000 MAD', '15a50': '15 000 à 50 000 MAD', plus50: 'Plus de 50 000 MAD', definir: 'À définir ensemble' };
const PAGES_SITE = { '1a3': '1 à 3 pages', '4a6': '4 à 6 pages', '7a15': '7 à 15 pages', plus15: 'Plus de 15 pages', inconnu: 'Je ne sais pas encore' };
const FONCTIONS = {
  formulaire: 'Formulaire de contact', whatsapp: 'WhatsApp', blog: 'Blog', multilingue: 'Multilingue',
  catalogue: 'Catalogue produits', 'paiement-ligne': 'Paiement en ligne', commandes: 'Gestion des commandes', 'espace-client': 'Espace client', stock: 'Gestion de stock',
  authentification: 'Authentification', 'tableau-de-bord': 'Tableau de bord', notifications: 'Notifications', administration: 'Administration', paiement: 'Paiement', integrations: 'Intégrations externes',
};
const PACKS = { starter: 'Pack Starter', business: 'Pack Business' };
const ESTIMATION = /^(Estimation personnalisée|Fourchette indicative\u00A0?: [\d\u00A0 ]+ à [\d\u00A0 ]+ MAD( HT| TTC)?)$/;   // la page le calcule : seule une forme connue passe dans le mail

// Mesure des demandes (facultative, préparée le 26/10/2026) : binding D1 MESURES, schéma dans migrations/0001_mesures.sql.
// Sans binding (état actuel, tests de base, wrangler dev sans base), rien n'est compté ni dédoublonné : le formulaire marche
// exactement comme avant. Rien de personnel n'est compté : jour, issue, type de projet, langue, parcours, source et campagne (UTM) ; l'anti-doublon ne garde
// qu'une empreinte SHA-256 pendant 10 minutes. Une panne de la base ne bloque jamais un envoi.
const DUREE_EMPREINTE_S = 600;

async function compter(env, issue, d = {}) {
  if (!env.MESURES) return;
  try {
    await env.MESURES.prepare(
      `INSERT INTO devis_compteur (jour, issue, type, langue, parcours, source, campagne, n) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (jour, issue, type, langue, parcours, source, campagne) DO UPDATE SET n = n + 1`
    ).bind(new Date().toISOString().slice(0, 10), issue, d.type || '', d.langue || '', d.parcours || '', issue === 'envoye' ? d.utm?.source || '' : '', issue === 'envoye' ? d.utm?.campaign || '' : '').run();   // source et campagne, libres, ne sont comptées que pour un envoi réel : un robot ne peut pas gonfler la table
  } catch (e) {
    console.error('mesure:', e && e.name);
  }
}

async function empreinte(d, env) {
  const octets = new TextEncoder().encode([env.MESURE_SEL || 'legantis-devis', d.email.toLowerCase(), d.projet, d.urlSite].join('\n'));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', octets))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Même demande renvoyée sous 10 minutes (double clic, retour arrière, réponse perdue) : vrai si elle est déjà passée.
// L'empreinte est posée AVANT l'envoi (deux envois simultanés ne passent pas tous les deux) et retirée s'il échoue.
async function dejaRecue(env, cle) {
  try {
    const maintenant = Math.floor(Date.now() / 1000);
    await env.MESURES.prepare('DELETE FROM devis_empreintes WHERE expire < ?').bind(maintenant).run();
    const r = await env.MESURES.prepare('INSERT INTO devis_empreintes (empreinte, expire) VALUES (?, ?) ON CONFLICT (empreinte) DO NOTHING')
      .bind(cle, maintenant + DUREE_EMPREINTE_S).run();
    return r.meta.changes === 0;
  } catch (e) {
    console.error('mesure:', e && e.name);
    return false;   // base injoignable : on envoie, comme sans mesure
  }
}

async function oublier(env, cle) {
  try { await env.MESURES.prepare('DELETE FROM devis_empreintes WHERE empreinte = ?').bind(cle).run(); } catch (e) { console.error('mesure:', e && e.name); }
}

// Parcours d'acquisition (page /commandes/, pour les publicités) : questions de qualification en liste blanche. Lus par lireParcours,
// jamais par les deux accueils : le formulaire générique continue de marcher sans ces champs.
const QUALIFICATION = {
  activite: { libelle: 'Activité', valeurs: { distribution: 'Distribution ou vente en gros', import: 'Import ou négoce', commerce: 'Commerce à plusieurs points de vente', services: 'Services aux entreprises', autre: 'Autre activité' } },
  ville: { libelle: 'Ville', valeurs: { casablanca: 'Casablanca-Mohammedia', rabat: 'Rabat-Salé-Témara', tanger: 'Tanger', marrakech: 'Marrakech', agadir: 'Agadir', autre: 'Autre ville' } },
  equipe: { libelle: 'Utilisateurs prévus', valeurs: { '1-3': '1 à 3', '4-10': '4 à 10', '11-30': '11 à 30', '31+': 'Plus de 30' } },
  budget: { libelle: 'Budget envisagé', valeurs: { moins25: 'Moins de 25 000 MAD', '25-50': '25 000 à 50 000 MAD', '50-100': '50 000 à 100 000 MAD', '100+': 'Plus de 100 000 MAD', definir: 'À définir ensemble' } },
};
// Chemins de retour fixes : jamais d'adresse fournie par le visiteur (pas de redirection ouverte).
const RETOUR = { fr: '/', en: '/en/' };

function retour(env, langue, ancre, parcours) {
  const chemin = PARCOURS[parcours] || RETOUR[langue] || RETOUR.fr;
  return new Response(null, { status: 303, headers: { Location: env.SITE_ORIGIN + chemin + '#' + ancre, 'Cache-Control': 'no-store' } });
}

function refus(statut, texte) {
  return new Response(texte, { status: statut, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'POST' } });
}

// Script actif (assets/conversion.js) : même POST, mais Accept: application/json. Requête « simple » sans en-tête personnalisé, donc sans preflight ;
// seule l'origine du site est autorisée à lire la réponse.
const veutJson = request => (request.headers.get('Accept') || '').includes('application/json');

function json(env, statut, corps) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': env.SITE_ORIGIN, Vary: 'Origin' } });
}

// Issue d'une demande : 303 vers la page d'origine sans script, JSON avec script.
function issue(request, env, d, envoye, erreurs = [], code = '') {
  if (!veutJson(request)) return retour(env, d.langue, envoye ? 'devis-envoye' : 'devis-echec', d.parcours);
  return json(env, envoye ? 200 : erreurs.length ? 422 : 503, { ok: envoye, ...(erreurs.length ? { erreurs } : {}), ...(code ? { code } : {}) });
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

// Jeton de campagne (UTM) : court, une seule ligne (les paramètres dynamiques de Meta contiennent des espaces). Vient de l'adresse de la page, donc non fiable : il ne sert qu'à être lu dans le mail et compté.
function jeton(valeur) {
  const t = typeof valeur === 'string' ? valeur.trim().slice(0, 80) : '';
  return /^[\p{L}\p{N} ._~%+|-]+$/u.test(t) ? t : '';
}

// Suffixes qui ne désignent pas un site public.
const SUFFIXES_INTERNES = new Set(['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'test', 'example', 'invalid', 'arpa', 'onion', 'svc']);

// Adresse du site à analyser (mini-audit). Ce Worker ne l'OUVRE JAMAIS : l'audit est manuel, aucune requête ne part vers cette adresse. Elle est filtrée pour que le lien
// reçu par mail ne vise ni une machine interne, ni un schéma exotique, ni un port inhabituel. Le parseur URL ramène déjà 2130706433, 0x7f.1 et 127.1 à 127.0.0.1.
function urlPublique(valeur) {
  const brut = texte(valeur, 300);
  if (!brut) return '';
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : 'https://' + brut); } catch { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (u.username || u.password || u.port) return '';
  const hote = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hote)) return '';                       // au moins un point : ni « serveur », ni une IPv6 entre crochets
  const suffixe = hote.split('.').pop();
  if (suffixe.length < 2 || /^[0-9]+$/.test(suffixe) || SUFFIXES_INTERNES.has(suffixe)) return '';   // suffixe numérique : une IPv4
  return u.href.slice(0, 300);
}

const telephoneValide = t => /^[+0-9 ().-]+$/.test(t) && t.replace(/\D/g, '').length >= 8 && t.replace(/\D/g, '').length <= 15;

// Champs obligatoires, par parcours. Le formulaire générique garde ses trois champs ; les parcours qualifiants en demandent plus, et le navigateur l'a déjà vérifié :
// ce contrôle est celui qui compte (un robot n'exécute pas la validation de la page).
function champsEnErreur(d) {
  const e = [];
  if (!(d.nom.length >= 1)) e.push('nom');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.push('email');
  if (d.parcours !== 'audit' && !(d.projet.length >= 10)) e.push('projet');
  if (d.parcours === 'commandes') {     // page en production depuis le 30/10/2026 : ses dix champs ; ni format de téléphone ni case de consentement exigés ici, une page en cache d'avant la case doit encore pouvoir envoyer
    if (!d.entreprise) e.push('entreprise');
    if (!d.telephone) e.push('telephone');
    if (!d.delai) e.push('delai');
    for (const champ of Object.keys(QUALIFICATION)) if (!d.choix[champ]) e.push(champ);
    return e;
  }
  if (d.parcours) {
    if (!d.entreprise) e.push('entreprise');
    if (!telephoneValide(d.telephone)) e.push('telephone');
    if (!d.consentement) e.push('consentement');
  }
  if (d.parcours === 'simulateur' || d.parcours === 'offre') {
    if (!d.type) e.push('type');
    if (!d.budget) e.push('budget');
  }
  if (d.parcours === 'simulateur' && !d.delai) e.push('delai');
  if (d.parcours === 'audit' && !d.urlSite) e.push('url_site');
  return e;
}

// Page /commandes/ : questions de qualification en liste blanche.
function lireChoix(donnees) {
  const choix = {};
  for (const [champ, { valeurs }] of Object.entries(QUALIFICATION)) {
    const valeur = donnees.get(champ);
    choix[champ] = Object.hasOwn(valeurs, valeur) ? valeur : '';
  }
  return choix;
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
  const parcours = Object.hasOwn(PARCOURS, donnees.get('parcours')) ? donnees.get('parcours') : '';
  const budget = Object.hasOwn(BUDGETS, donnees.get('budget')) ? donnees.get('budget') : '';
  const pagesSite = Object.hasOwn(PAGES_SITE, donnees.get('pages_site')) ? donnees.get('pages_site') : '';
  const pack = Object.hasOwn(PACKS, donnees.get('pack')) ? donnees.get('pack') : '';
  const fonctions = [...new Set(donnees.getAll('fonctions'))].filter(f => Object.hasOwn(FONCTIONS, f));
  const urlSite = urlPublique(donnees.get('url_site'));
  const consentement = donnees.get('consentement') === 'oui';
  const estimationBrute = texte(donnees.get('estimation'), 120);
  const estimation = ESTIMATION.test(estimationBrute) ? estimationBrute : '';
  const choix = parcours === 'commandes' ? lireChoix(donnees) : {};
  const utm = { source: jeton(donnees.get('utm_source')), medium: jeton(donnees.get('utm_medium')), campaign: jeton(donnees.get('utm_campaign')), content: jeton(donnees.get('utm_content')), term: jeton(donnees.get('utm_term')) };
  const d = { nom, email, telephone, entreprise, type, projet, supports, delai, langue, parcours, budget, pagesSite, pack, fonctions, urlSite, consentement, estimation, utm, choix };
  d.erreurs = champsEnErreur(d);
  return d;
}

// Tri de la boîte de réception : A = activité visée, budget réaliste et échéance ; C = budget sous le plancher ; B = le reste, à clarifier en échange.
function priorite(d) {
  if (d.choix.budget === 'moins25') return 'C';
  const cible = ['distribution', 'import', 'commerce'].includes(d.choix.activite);
  const budget = ['25-50', '50-100', '100+'].includes(d.choix.budget);
  const echeance = ['vite', '1mois', '3mois'].includes(d.delai);
  return cible && budget && echeance ? 'A' : 'B';
}

// Ligne prête à coller dans l'onglet Prospects de legantis-suivi-commercial.xlsx, à partir de la colonne Date : tabulations, pour qu'elle se répartisse seule dans les colonnes
// (Date, Heure, Nom, Entreprise, Activité, Ville, E-mail, Téléphone, WhatsApp, Source, Demande, Budget, Délai). Une cellule qui commence par = + - @ serait une formule dans
// un tableur : elle est neutralisée par une apostrophe ; les guillemets sont retirés d'abord, sinon "=FORMULE" passerait le contrôle et redeviendrait une formule.
function ligneSuivi(d) {
  const cellule = v => { const s = String(v ?? '').replace(/[\r\n\t"]+/g, ' ').trim(); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const reponse = champ => d.choix[champ] ? QUALIFICATION[champ].valeurs[d.choix[champ]] : '';
  const demande = [PARCOURS_LIBELLES[d.parcours] || 'Formulaire de devis', d.type ? TYPES[d.type] : '', d.urlSite].filter(Boolean).join(' · ');
  const source = [d.utm.source, d.utm.campaign].filter(Boolean).join(' / ') || 'Site';
  return [new Date().toISOString().slice(0, 10), '', d.nom, d.entreprise, reponse('activite'), reponse('ville'), d.email, d.telephone, '', source, demande, d.budget ? BUDGETS[d.budget] : reponse('budget'), d.delai ? DELAIS[d.delai] : ''].map(cellule).join('\t');
}

function lignesParcours(d) {
  if (!d.parcours) return [];
  if (d.parcours === 'commandes') return ['Priorité estimée : ' + priorite(d), ...Object.entries(QUALIFICATION).map(([champ, { libelle, valeurs }]) => libelle + ' : ' + valeurs[d.choix[champ]]), 'Consentement au traitement : ' + (d.consentement ? 'oui' : 'non')];
  return [
    'Parcours : ' + PARCOURS_LIBELLES[d.parcours],
    ...(d.pack ? ['Pack demandé : ' + PACKS[d.pack]] : []),
    ...(d.urlSite ? ['Site à analyser : ' + d.urlSite] : []),
    ...(d.pagesSite ? ['Nombre de pages : ' + PAGES_SITE[d.pagesSite]] : []),
    ...(d.fonctions.length ? ['Fonctionnalités : ' + d.fonctions.map(f => FONCTIONS[f]).join(', ')] : []),
    ...(d.parcours === 'audit' ? [] : ['Budget envisagé : ' + (d.budget ? BUDGETS[d.budget] : 'non précisé')]),
    ...(d.estimation ? ['Estimation affichée au visiteur : ' + d.estimation] : []),
    'Consentement au traitement : ' + (d.consentement ? 'oui' : 'non'),
  ];
}

function lignesSource(d) {
  const { source, medium, campaign, content, term } = d.utm;
  if (!source && !medium && !campaign && !content && !term) return [];
  return ['', 'Source de la visite (UTM) : ' + [source, medium, campaign, content, term].filter(Boolean).join(' / ')];
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
    'Supports visés : ' + (d.supports.length ? d.supports.map(s => SUPPORTS[s]).join(', ') : 'non précisés'),
    'Délai souhaité : ' + (d.delai ? DELAIS[d.delai] : 'non précisé'),
    ...lignesParcours(d),
    ...(!d.parcours && d.consentement ? ['Consentement au traitement : oui'] : []),
    ...lignesSource(d),
    '',
    'Ce que vous souhaitez développer :',
    d.projet || 'non précisé',
    '',
    'Ligne à coller dans l\'onglet Prospects du classeur de suivi, colonne Date :',
    ligneSuivi(d),
    '',
    '— Répondre à ce message écrit directement à ' + d.nom + ' (« Répondre » utilise son adresse).',
  ].join('\n');
}

// « Demande de devis » reste en tête de tous les objets : c'est ce que l'analyseur du courrier de legantis-crm reconnaît.
function objet(d) {
  if (d.parcours === 'commandes') return ('Demande commandes — Priorité ' + priorite(d) + ' — ' + d.entreprise + ' — ' + d.nom).slice(0, 120);
  const libelle = d.parcours === 'audit' ? PARCOURS_LIBELLES.audit : d.type ? TYPES[d.type] : '';
  return ('Demande de devis — ' + (libelle ? libelle + ' — ' : '') + d.nom).slice(0, 120);
}

async function envoyer(d, env) {
  const reponse = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.MAIL_TO],
      reply_to: d.email,
      subject: objet(d),
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
  if (texte(donnees.get('site_web'), 200) !== '') { await compter(env, 'piege', d); return issue(request, env, d, true); }

  if (d.erreurs.length) { await compter(env, 'invalide', d); return issue(request, env, d, false, d.erreurs); }
  if (env.LIMITE) {
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    const { success } = await env.LIMITE.limit({ key: ip });
    if (!success) { await compter(env, 'limite', d); return issue(request, env, d, false, [], 'limite'); }
  }
  // Renvoi de la même demande : la personne revoit « envoyé », mais ni deuxième mail ni deuxième comptage.
  const cle = env.MESURES ? await empreinte(d, env) : null;
  if (cle && (await dejaRecue(env, cle))) { await compter(env, 'doublon', d); return issue(request, env, d, true); }
  let envoye = false;
  try {
    envoye = await envoyer(d, env);
  } finally {
    if (!envoye && cle) await oublier(env, cle);   // échec (ou exception) : un nouvel essai doit pouvoir partir
  }
  await compter(env, envoye ? 'envoye' : 'echec_envoi', d);
  return issue(request, env, d, envoye);
}

export default {
  async fetch(request, env) {
    try {
      return await traiter(request, env);
    } catch (e) {
      // Pas de journal du contenu (données personnelles) : seulement le type d'erreur, et le visiteur voit le message d'échec.
      console.error('devis:', e && e.name);
      await compter(env, 'exception');
      return veutJson(request) ? json(env, 503, { ok: false }) : retour(env, 'fr', 'devis-echec');
    }
  },
};
