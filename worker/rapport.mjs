// Rapport des demandes de devis, lu dans la base D1 « legantis-mesures » (compteur du Worker, voir README « Compteur de demandes »).
//   node rapport.mjs [--jours 30] [--local --persist-to <dossier> --config <wrangler.jsonc>]
// Sans option : base distante (`wrangler d1 execute --remote`, compte Cloudflare déjà connecté). Aucune donnée personnelle n'existe
// dans cette base : le rapport ne montre que des comptes. Ce qu'elle ne peut pas savoir (visiteurs, clics) est écrit « non disponible ».
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
const jours = Math.max(1, Math.min(366, Number(opt('--jours', 30)) || 30));
const cible = args.includes('--local') ? ['--local', ...(opt('--persist-to') ? ['--persist-to', opt('--persist-to')] : [])] : ['--remote'];
const config = opt('--config') ? ['--config', opt('--config')] : [];

function requete(sql) {
  const sortie = execFileSync('npx', ['wrangler@4', 'd1', 'execute', 'legantis-mesures', ...cible, ...config, '--json', '--command', sql],
    { cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(sortie)[0].results;
}

const depuis = new Date(Date.now() - (jours - 1) * 86400000).toISOString().slice(0, 10);
const filtre = `jour >= '${depuis}'`;
const parIssue = Object.fromEntries(requete(`SELECT issue, SUM(n) AS n FROM devis_compteur WHERE ${filtre} GROUP BY issue`).map(r => [r.issue, r.n]));
const n = k => parIssue[k] || 0;
const parParcours = requete(`SELECT parcours, SUM(n) AS n FROM devis_compteur WHERE ${filtre} AND issue = 'envoye' GROUP BY parcours ORDER BY n DESC`);
const parSource = requete(`SELECT source, campagne, SUM(n) AS n FROM devis_compteur WHERE ${filtre} AND issue = 'envoye' GROUP BY source, campagne ORDER BY n DESC`);
const PARCOURS = { '': 'Formulaire de l\'accueil', simulateur: 'Simulateur', audit: 'Mini-audit', offre: 'Page d\'offre' };
const LIBELLES = { vitrine: 'Site vitrine', ecommerce: 'Site e-commerce', site: 'Site web', web: 'Application web', mobile: 'Application mobile', logiciel: 'Logiciel métier', conseil: 'Conseil ou reprise', autre: 'Autre / à définir', '': 'Non précisé (page en cache d\'avant le champ)' };
const parType = requete(`SELECT type, SUM(n) AS n FROM devis_compteur WHERE ${filtre} AND issue = 'envoye' GROUP BY type ORDER BY n DESC`);
const parLangue = requete(`SELECT langue, SUM(n) AS n FROM devis_compteur WHERE ${filtre} AND issue = 'envoye' GROUP BY langue ORDER BY n DESC`);
const parSemaine = requete(`SELECT strftime('%Y-S%W', jour) AS semaine, SUM(n) AS n FROM devis_compteur WHERE ${filtre} AND issue = 'envoye' GROUP BY semaine ORDER BY semaine`);

const lignes = [
  `# Demandes de devis — ${jours} derniers jours (depuis le ${depuis}, jours en UTC)`,
  '',
  '| Indicateur | Valeur | Source |',
  '|---|---|---|',
  `| Demandes reçues (mail accepté par Resend) | **${n('envoye')}** | compteur du Worker |`,
  `| Renvois de la même demande neutralisés | ${n('doublon')} | compteur du Worker |`,
  `| Échecs techniques (Resend en erreur ou injoignable, erreur du Worker) | ${n('echec_envoi') + n('exception')} | compteur du Worker |`,
  `| Refus : champs invalides / champ anti-robot / limite de débit | ${n('invalide')} / ${n('piege')} / ${n('limite')} | compteur du Worker |`,
  '| Visiteurs, visites des prestations, consultations du portfolio, clics sur les boutons de devis | non disponible | aucun outil de mesure d\'audience activé (docs/mesure-audience.md) |',
  '| Taux de conversion visiteurs → demandes | non calculable | il faut le nombre de visiteurs |',
  '| Demandes venues des publicités Meta | hors de ce compteur | gestionnaire de publicités Meta (formulaire instantané) |',
  '',
  '## Demandes reçues par type de projet',
  ...(parType.length ? parType.map(r => `- ${LIBELLES[r.type] ?? r.type} : ${r.n}`) : ['- aucune']),
  '',
  '## Par formulaire d\'origine',
  ...(parParcours.length ? parParcours.map(r => `- ${PARCOURS[r.parcours] ?? r.parcours} : ${r.n}`) : ['- aucune']),
  '',
  '## Par source (paramètres UTM de la page)',
  ...(parSource.length ? parSource.map(r => `- ${r.source || 'sans UTM'}${r.campagne ? ' / ' + r.campagne : ''} : ${r.n}`) : ['- aucune']),
  '',
  '## Par langue de la page',
  ...(parLangue.length ? parLangue.map(r => `- ${r.langue === 'en' ? 'anglais' : r.langue === 'fr' ? 'français' : r.langue || 'non précisée'} : ${r.n}`) : ['- aucune']),
  '',
  '## Par semaine',
  ...(parSemaine.length ? parSemaine.map(r => `- ${r.semaine} : ${r.n}`) : ['- aucune']),
];
console.log(lignes.join('\n'));
