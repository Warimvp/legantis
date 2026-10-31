// Éprouve outils/parcours_test.mjs : chaque copie volontairement cassée du site doit le faire échouer. `node outils/sabotages_parcours.mjs` (une dizaine de minutes).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ICI, '..', 'site');
const JS = 'assets/conversion.js', CSS = 'assets/site.css', DEMO = 'realisations/demos/demos.js';
const SABOTAGES = [
  ['source UTM non reportée', JS, 'reporterSource();\n', '\n'],
  ['formulaire laissé après un succès', JS, 'form.hidden = true;', ''],
  ['erreurs jamais effacées', JS, '      effacer();\n', ''],
  ['fonctionnalités de tous les types affichées', JS, 'g.hidden = !actif; g.disabled = !actif;', 'g.hidden = false; g.disabled = false;'],
  ['historique du navigateur ignoré', JS, "if (memoriser) history.pushState({ etape: i }, '');", ''],
  ['étape vide non sautée', JS, "if (etapes[n] && etapes[n].hasAttribute('data-fonctions') && sansFonctions()) n++;", ''],
  ['étape non validée avant de continuer', JS, 'if (etapeValide(courante)) montrer(suivante(courante), true);', 'montrer(suivante(courante), true);'],
  ['type de la prestation perdu', JS, "if (radio) { radio.checked = true; depart = 1; }", ''],
  ['erreur serveur non signalée', JS, 'else if (rep.erreurs) signaler(rep.erreurs);', ''],
  ['panne d\'envoi non signalée', JS, 'else afficherEchec(rep.code);', ''],
  ['focus non posé sur le champ en erreur', JS, 'if (premier) premier.focus();', ''],
  ['comparaison inerte au clavier', JS, "curseur.addEventListener('input', function () { poser(Number(curseur.value)); });", ''],
  ['comparaison inerte à la souris', JS, 'if (glisse) depuisPointeur(ev);', ''],
  ['étapes cachées sans effet', CSS, '.assistant-bloc [hidden], .assistant [hidden] { display: none !important; }', ''],
  ['sans script : formulaire laissé après l\'envoi', CSS, '[data-formulaire]:has(#devis-envoye:target) form { display: none; }', ''],
  ['filtre des réalisations cassé', CSS, '.realisations:has(#f-demo:checked) .projet:not([data-nature~="demo"]),', ''],
  ['barre de contact absente au téléphone', CSS, '  .contact-rapide { display: flex; }\n', ''],
  ['bouton principal repoussé sous la barre', CSS, '.ouverture--accroche .chapeau { font-size: 1.04rem; line-height: 1.5; margin-bottom: 22px; }', '.ouverture--accroche .chapeau { margin-bottom: 400px; }'],
  ['démonstration qui envoie', DEMO, 'ev.preventDefault();', ''],
  ['simulateur repoussé sous le premier écran', 'estimer-mon-projet/index.html', 'service-tete--compacte', 'service-tete-x'],
  ['lien WhatsApp revenu sur /commandes/', 'commandes/index.html', '<!-- commercial:whatsapp type=commandes style=bouton --><!-- /commercial -->', '<a class="bouton" href="https://wa.me/212600000000">WhatsApp</a>'],
  ['source non relevée sur /commandes/', 'commandes/index.html', '<script src="../assets/conversion.js" defer></script>\n', ''],
  ['consentement facultatif sur /commandes/', 'commandes/index.html', 'name="consentement" type="checkbox" value="oui" required', 'name="consentement" type="checkbox" value="oui"'],
  ['consentement facultatif sur l\'accueil', 'index.html', 'id="devis-consentement" name="consentement" type="checkbox" value="oui" required', 'id="devis-consentement" name="consentement" type="checkbox" value="oui"'],
  ['offre prioritaire absente de l\'accueil', 'index.html', '<a class="bouton bouton--plein" href="commandes/">Découvrir', '<a class="bouton bouton--plein" href="realisations/">Découvrir'],
  ['script tiers ajouté à l\'accueil', 'index.html', '</head>', '<script src="https://connect.facebook.net/en_US/fbevents.js"></script></head>'],
];
let detectes = 0;
for (const [nom, fichier, cherche, remplace] of SABOTAGES) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'sabotage-site-'));
  try {
    cpSync(SITE, dossier, { recursive: true });
    const f = path.join(dossier, fichier); const t = readFileSync(f, 'utf8');
    if (t.split(cherche).length !== 2) { console.log(`✗ « ${nom} » : texte trouvé ${t.split(cherche).length - 1} fois (attendu 1)`); continue; }
    writeFileSync(f, t.replace(cherche, () => remplace));
    const r = spawnSync(process.execPath, [path.join(ICI, 'parcours_test.mjs')], { env: { ...process.env, SITE_ROOT: dossier }, encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) { detectes++; console.log(`✓ détecté : ${nom}`); } else console.log(`✗ SURVIT : ${nom}`);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
}
console.log(`${detectes} sabotages détectés sur ${SABOTAGES.length}`);
process.exit(detectes === SABOTAGES.length ? 0 : 1);
