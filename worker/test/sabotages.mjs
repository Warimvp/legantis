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
  ['méthode POST non exigée', `if (request.method !== 'POST') return refus(405, 'Formulaire de devis de legantis.net : POST seulement.');`, ''],
  ['contrôle d\'origine retiré', `if (!origineAcceptee(request, env)) return refus(403, 'Origine refusée.');`, ''],
  ['Origin comparé par préfixe', `return origine === env.SITE_ORIGIN;`, `return origine.startsWith(env.SITE_ORIGIN);`],
  ['Referer comparé sans la barre finale', `referent.startsWith(env.SITE_ORIGIN + '/')`, `referent.startsWith(env.SITE_ORIGIN)`],
  ['type de contenu non vérifié', `if (!(request.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded')) return refus(415, 'Format non pris en charge.');`, ''],
  ['plafond de lecture du corps supprimé', `if (total > TAILLE_MAX) {`, `if (total > 1e9) {`],
  ['champ piège ignoré', `texte(donnees.get('site_web'), 200) !== ''`, `false`],
  ['e-mail non validé', `/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)`, `true`],
  ['projet de 0 caractère accepté', `projet.length >= 10`, `projet.length >= 0`],
  ['nom vide accepté', `nom.length >= 1 &&`, `true &&`],
  ['limite de débit ignorée', `if (!success) return retour(env, d.langue, 'devis-echec');`, ''],
  ['limite de débit sur une clé fixe', `limit({ key: ip })`, `limit({ key: 'tous' })`],
  ['retour à la ligne laissé dans les champs d\'une ligne', `/[\\u0000-\\u001F\\u007F]/g`, `/[\\u0000-\\u0008]/g`],
  ['sauts de ligne du projet aplatis', `if (multiligne) t = t.replace(/\\r\\n?/g, '\\n');`, `if (multiligne) t = t.replace(/\\n/g, ' ');`],
  ['supports non filtrés', `.filter(s => Object.hasOwn(SUPPORTS, s))`, ''],
  ['délai non filtré', `Object.hasOwn(DELAIS, donnees.get('delai')) ? donnees.get('delai') : ''`, `donnees.get('delai') || ''`],
  ['langue recopiée telle quelle', `donnees.get('langue') === 'en' ? 'en' : 'fr'`, `donnees.get('langue') || 'fr'`],
  ['type de projet non filtré', `Object.hasOwn(TYPES, donnees.get('type')) ? donnees.get('type') : ''`, `donnees.get('type') || ''`],
  ['type de projet exigé (les pages en cache échouent)', `const valide = nom.length >= 1 &&`, `const valide = type !== '' && nom.length >= 1 &&`],
  ['entreprise non bornée', `texte(donnees.get('entreprise'), 120)`, `texte(donnees.get('entreprise'), 100000)`],
  ['entreprise sur plusieurs lignes', `texte(donnees.get('entreprise'), 120)`, `texte(donnees.get('entreprise'), 120, true)`],
  ['type absent de l\'objet du mail', `(d.type ? TYPES[d.type] + ' — ' : '')`, `''`],
  ['réponse de Resend ignorée', `return reponse.ok;`, `return true;`],
  ['reply_to retiré', `reply_to: d.email,`, ''],
  ['destinataire changé', `to: [env.MAIL_TO],`, `to: ['autre@exemple.com'],`],
  ['message de l\'exception écrit dans le journal', `console.error('devis:', e && e.name);`, `console.error('devis:', e && e.message);`],
  ['exception relancée au visiteur', `return retour(env, 'fr', 'devis-echec');\n    }\n  },`, `throw e;\n    }\n  },`],
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
    writeFileSync(join(dossier, 'src/index.js'), source.replace(cherche, () => remplace));
    // la copie cassée doit rester du JavaScript valide : sinon « échec » ne prouverait rien sur le test
    if (spawnSync(process.execPath, ['--check', 'src/index.js'], { cwd: dossier }).status !== 0) { console.log(`✗ « ${nom} » : la copie cassée n'est pas du JavaScript valide`); continue; }
    const r = spawnSync(process.execPath, ['--test', 'test/index.test.js'], { cwd: dossier, encoding: 'utf8' });
    if (r.status !== 0) { detectes++; console.log(`✓ détecté : ${nom}`); } else console.log(`✗ SURVIT : ${nom}`);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}
console.log(`${detectes} sabotages détectés sur ${SABOTAGES.length}`);
process.exit(detectes === SABOTAGES.length ? 0 : 1);
