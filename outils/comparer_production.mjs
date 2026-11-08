// Compare chaque fichier de site/ (ou du dossier donné) à ce que sert https://legantis.net, octet à octet. Lecture seule : que des GET.
//     node outils/comparer_production.mjs [dossier]      → code de sortie 1 s'il y a un fichier différent ou absent
// À lancer APRÈS la mise en ligne (tout doit être identique) et AVANT (le site actuel doit être identique à origin/main : `git archive origin/main site`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const RACINE = process.argv[2] || new URL('../site', import.meta.url).pathname;
const sha = b => createHash('sha256').update(b).digest('hex');
const fichiers = [];
(function marche(d) { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? marche(p) : fichiers.push(p); } })(RACINE);
let ok = 0; const diff = [], absent = [];
for (const f of fichiers) {
  const rel = relative(RACINE, f);
  const url = 'https://legantis.net/' + rel.replace(/index\.html$/, '') + '?verif=' + Date.now();   // paramètre : contourne un cache de bord périmé sans rien changer côté serveur
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) { absent.push(`${rel} ${r.status}`); continue; }
    sha(Buffer.from(await r.arrayBuffer())) === sha(readFileSync(f)) ? ok++ : diff.push(rel);
  } catch (e) { absent.push(`${rel} ${e.message}`); }
}
console.log(JSON.stringify({ total: fichiers.length, identiques: ok, differents: diff, absents: absent }, null, 1));
process.exit(diff.length || absent.length ? 1 : 0);
