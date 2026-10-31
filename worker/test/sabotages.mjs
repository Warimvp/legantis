// Éprouve les tests : pour chaque garde-fou du Worker, une copie volontairement cassée doit faire échouer `node --test`.
// Un sabotage dont le texte n'est pas trouvé exactement une fois dans le code est lui-même un échec (sabotage mal formé = test qui ne prouve rien).
//     node test/sabotages.mjs        → « n sabotages détectés sur n » ; code de sortie 1 si l'un survit.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(RACINE, 'src/index.js'), 'utf8');

const SABOTAGES = [
  ['qualification non exigée', `for (const champ of Object.keys(QUALIFICATION)) if (!d.choix[champ]) e.push(champ);`, ''],
  ['entreprise facultative dans le parcours', `if (!d.entreprise) e.push('entreprise');\n    if (!d.telephone) e.push('telephone');`, `if (!d.telephone) e.push('telephone');`],
  ['téléphone facultatif dans le parcours', `if (!d.telephone) e.push('telephone');`, ''],
  ['budget hors liste accepté', `choix[champ] = Object.hasOwn(valeurs, valeur) ? valeur : '';`, `choix[champ] = valeur || '';`],
  ['retour du parcours oublié', `return retour(env, d.langue, envoye ? 'devis-envoye' : 'devis-echec', d.parcours);`, `return retour(env, d.langue, envoye ? 'devis-envoye' : 'devis-echec');`],
  ['priorité C retirée', `if (d.choix.budget === 'moins25') return 'C';`, ``],
  ['échéance ignorée dans la priorité', `return cible && budget && echeance ? 'A' : 'B';`, `return cible && budget ? 'A' : 'B';`],
  ['méthode POST non exigée', `if (request.method !== 'POST') return refus(405, 'Formulaire de devis de legantis.net : POST seulement.');`, ''],
  ['contrôle d\'origine retiré', `if (!origineAcceptee(request, env)) return refus(403, 'Origine refusée.');`, ''],
  ['Origin comparé par préfixe', `return origine === env.SITE_ORIGIN;`, `return origine.startsWith(env.SITE_ORIGIN);`],
  ['Referer comparé sans la barre finale', `referent.startsWith(env.SITE_ORIGIN + '/')`, `referent.startsWith(env.SITE_ORIGIN)`],
  ['type de contenu non vérifié', `if (!(request.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded')) return refus(415, 'Format non pris en charge.');`, ''],
  ['plafond de lecture du corps supprimé', `if (total > TAILLE_MAX) {`, `if (total > 1e9) {`],
  ['champ piège ignoré', `texte(donnees.get('site_web'), 200) !== ''`, `false`],
  ['e-mail non validé', `!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(d.email)`, `false`],
  ['projet de 0 caractère accepté', `!(d.projet.length >= 10)`, `!(d.projet.length >= 0)`],
  ['nom vide accepté', `if (!(d.nom.length >= 1)) e.push('nom');`, ''],
  ['limite de débit ignorée', `if (!success) { await compter(env, 'limite', d); return issue(request, env, d, false, [], 'limite'); }`, ''],
  ['limite de débit sur une clé fixe', `limit({ key: ip })`, `limit({ key: 'tous' })`],
  ['retour à la ligne laissé dans les champs d\'une ligne', `/[\\u0000-\\u001F\\u007F]/g`, `/[\\u0000-\\u0008]/g`],
  ['sauts de ligne du projet aplatis', `if (multiligne) t = t.replace(/\\r\\n?/g, '\\n');`, `if (multiligne) t = t.replace(/\\n/g, ' ');`],
  ['supports non filtrés', `.filter(s => Object.hasOwn(SUPPORTS, s))`, ''],
  ['délai non filtré', `Object.hasOwn(DELAIS, donnees.get('delai')) ? donnees.get('delai') : ''`, `donnees.get('delai') || ''`],
  ['langue recopiée telle quelle', `donnees.get('langue') === 'en' ? 'en' : 'fr'`, `donnees.get('langue') || 'fr'`],
  ['type de projet non filtré', `Object.hasOwn(TYPES, donnees.get('type')) ? donnees.get('type') : ''`, `donnees.get('type') || ''`],
  ['type de projet exigé (les pages en cache échouent)', `if (d.parcours === 'simulateur' || d.parcours === 'offre') {`, `if (true) {`],
  ['entreprise non bornée', `texte(donnees.get('entreprise'), 120)`, `texte(donnees.get('entreprise'), 100000)`],
  ['entreprise sur plusieurs lignes', `texte(donnees.get('entreprise'), 120)`, `texte(donnees.get('entreprise'), 120, true)`],
  ['type absent de l\'objet du mail', `PARCOURS_LIBELLES.audit : d.type ? TYPES[d.type] : '';`, `PARCOURS_LIBELLES.audit : '';`],
  ['réponse de Resend ignorée', `return reponse.ok;`, `return true;`],
  ['reply_to retiré', `reply_to: d.email,`, ''],
  ['destinataire changé', `to: [env.MAIL_TO],`, `to: ['autre@exemple.com'],`],
  ['message de l\'exception écrit dans le journal', `console.error('devis:', e && e.name);`, `console.error('devis:', e && e.message);`],
  // compteur de demandes (binding MESURES)
  ['doublon jamais reconnu', `return r.meta.changes === 0;`, `return false;`],
  ['empreinte gardée après un échec d\'envoi', `if (!envoye && cle) await oublier(env, cle);`, ''],
  ['échec compté comme un envoi', `await compter(env, envoye ? 'envoye' : 'echec_envoi', d);`, `await compter(env, 'envoye', d);`],
  ['donnée personnelle dans le compteur', `.bind(new Date().toISOString().slice(0, 10), issue, d.type || '', d.langue || '', d.parcours || '',`, `.bind(new Date().toISOString().slice(0, 10), issue, d.email || '', d.langue || '', d.parcours || '',`],
  ['panne de mesure qui bloque l\'envoi', `    console.error('mesure:', e && e.name);\n  }\n}\n\nasync function empreinte`, `    throw e;\n  }\n}\n\nasync function empreinte`],
  ['empreintes expirées jamais purgées', `await env.MESURES.prepare('DELETE FROM devis_empreintes WHERE expire < ?').bind(maintenant).run();`, ''],
  ['dédoublonnage par une lecture puis une écriture (course)', `'INSERT INTO devis_empreintes (empreinte, expire) VALUES (?, ?) ON CONFLICT (empreinte) DO NOTHING'`, `'INSERT OR REPLACE INTO devis_empreintes (empreinte, expire) VALUES (?, ?)'`],
  // parcours qualifiants, JSON, adresse à analyser
  ['parcours : chemin de retour fourni par le visiteur', `const chemin = PARCOURS[parcours] || RETOUR[langue] || RETOUR.fr;`, `const chemin = parcours || RETOUR[langue] || RETOUR.fr;`],
  ['parcours non filtré', `Object.hasOwn(PARCOURS, donnees.get('parcours')) ? donnees.get('parcours') : ''`, `donnees.get('parcours') || ''`],
  ['budget non filtré', `Object.hasOwn(BUDGETS, donnees.get('budget')) ? donnees.get('budget') : ''`, `donnees.get('budget') || ''`],
  ['fonctions non filtrées', `.filter(f => Object.hasOwn(FONCTIONS, f))`, ''],
  ['pack non filtré', `Object.hasOwn(PACKS, donnees.get('pack')) ? donnees.get('pack') : ''`, `donnees.get('pack') || ''`],
  ['consentement facultatif', `if (!d.consentement) e.push('consentement');`, ''],
  ['consentement accepté pour toute valeur', `donnees.get('consentement') === 'oui'`, `true`],
  ['téléphone non validé', `if (!telephoneValide(d.telephone)) e.push('telephone');`, ''],
  ['téléphone exigé sur le formulaire générique', `if (d.parcours) {\n    if (!d.entreprise)`, `if (true) {\n    if (!d.entreprise)`],
  ['entreprise facultative', `if (d.parcours) {\n    if (!d.entreprise) e.push('entreprise');`, `if (d.parcours) {`],
  ['délai facultatif au simulateur', `if (d.parcours === 'simulateur' && !d.delai) e.push('delai');`, ''],
  ['adresse exigée par le mini-audit retirée', `if (d.parcours === 'audit' && !d.urlSite) e.push('url_site');`, ''],
  ['projet exigé au mini-audit', `if (d.parcours !== 'audit' && !(d.projet`, `if (!(d.projet`],
  ['schémas exotiques acceptés', `if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';`, ''],
  ['identifiants et ports acceptés', `if (u.username || u.password || u.port) return '';`, ''],
  ['adresses IP acceptées', `/^[0-9]+$/.test(suffixe) ||`, ''],
  ['nom sans point accepté', `if (!/^[a-z0-9-]+(\\.[a-z0-9-]+)+$/.test(hote)) return '';`, ''],
  ['suffixes internes acceptés', `|| SUFFIXES_INTERNES.has(suffixe)`, ''],
  ['UTM sans filtre de caractères', `return /^[\\p{L}\\p{N} ._~%+|-]+$/u.test(t) ? t : '';`, `return t;`],
  ['formule de tableur non neutralisée', `return /^[=+\\-@]/.test(s) ? "'" + s : s;`, `return s;`],
  ['tabulation laissée dans la ligne de suivi', `.replace(/[\\r\\n\\t"]+/g, ' ')`, ''],
  ['CORS ouvert à tous', `'Access-Control-Allow-Origin': env.SITE_ORIGIN`, `'Access-Control-Allow-Origin': '*'`],
  ['erreur renvoyée en 200', `envoye ? 200 : erreurs.length ? 422 : 503`, `200`],
  ['récapitulatif absent du mail', `...lignesParcours(d),`, ''],
  ['source absente du mail', `...lignesSource(d),`, ''],
  ['guillemets laissés devant une formule', `/[\\r\\n\\t"]+/g`, `/[\\r\\n\\t]+/g`],
  ['adresse sans schéma mal reconnue', `/^[a-z][a-z0-9+.-]*:\\/\\//i.test(brut)`, `brut.includes('://')`],
  ['estimation libre dans le mail', `ESTIMATION.test(estimationBrute) ? estimationBrute : ''`, `estimationBrute`],
  ['UTM comptées pour un refus', `issue === 'envoye' ? d.utm?.source || '' : ''`, `d.utm?.source || ''`],
  ['parcours commandes retiré', `, commandes: '/commandes/' }`, ` }`],
  ['priorité absente de l\'objet', `'Demande commandes — Priorité ' + priorite(d)`, `'Demande commandes'`],
  ['consentement absent du mail /commandes/', `, 'Consentement au traitement : ' + (d.consentement ? 'oui' : 'non')];`, `];`],
  ['consentement générique non noté', `...(!d.parcours && d.consentement ? ['Consentement au traitement : oui'] : []),`, ''],
  ['exception relancée au visiteur', `return veutJson(request) ? json(env, 503, { ok: false }) : retour(env, 'fr', 'devis-echec');\n    }\n  },`, `throw e;\n    }\n  },`],
];

let detectes = 0;
for (const [nom, cherche, remplace] of SABOTAGES) {
  const n = source.split(cherche).length - 1;
  if (n !== 1) { console.log(`✗ « ${nom} » : texte à saboter trouvé ${n} fois (attendu 1) — sabotage mal formé`); continue; }
  const dossier = mkdtempSync(join(tmpdir(), 'sabotage-devis-'));
  try {
    mkdirSync(join(dossier, 'src')); mkdirSync(join(dossier, 'test'));
    copyFileSync(join(RACINE, 'package.json'), join(dossier, 'package.json'));
    copyFileSync(join(RACINE, 'test/index.test.js'), join(dossier, 'test/index.test.js'));
    mkdirSync(join(dossier, 'migrations')); copyFileSync(join(RACINE, 'migrations/0001_mesures.sql'), join(dossier, 'migrations/0001_mesures.sql'));
    writeFileSync(join(dossier, 'src/index.js'), source.replace(cherche, () => remplace));
    // la copie cassée doit rester du JavaScript valide : sinon « échec » ne prouverait rien sur le test
    if (spawnSync(process.execPath, ['--check', 'src/index.js'], { cwd: dossier }).status !== 0) { console.log(`✗ « ${nom} » : la copie cassée n'est pas du JavaScript valide`); continue; }
    const r = spawnSync(process.execPath, ['--test', 'test/index.test.js'], { cwd: dossier, encoding: 'utf8' });
    if (r.status !== 0) { detectes++; console.log(`✓ détecté : ${nom}`); } else console.log(`✗ SURVIT : ${nom}`);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}
console.log(`${detectes} sabotages détectés sur ${SABOTAGES.length}`);
process.exit(detectes === SABOTAGES.length ? 0 : 1);
