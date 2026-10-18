"""Écrit un <lastmod> par URL du sitemap, tiré du dernier commit qui a touché le fichier de la page (git log -1 --format=%cs).
    python3 outils/lastmod.py           (réécrit site/sitemap.xml ; relancer après avoir commité des changements de pages)
    python3 outils/lastmod.py --verifier   (sort 1 si un <lastmod> est absent ou en retard sur git ; ne modifie rien)
Une page modifiée mais pas encore commitée prend la date du jour. Un lastmod faux est ignoré par Google : ne jamais l'écrire à la main."""
import os, re, subprocess, sys, datetime

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = os.path.join(RACINE, 'site')
SITEMAP = os.path.join(SITE, 'sitemap.xml')
BASE = 'https://legantis.net/'


def fichier(url):
    chemin = url[len(BASE):]
    return os.path.join('site', chemin, 'index.html')


def date_git(rel):
    sale = subprocess.run(['git', 'status', '--porcelain', '--', rel], cwd=RACINE, capture_output=True, text=True).stdout.strip()
    if sale:
        return datetime.date.today().isoformat()
    return subprocess.run(['git', 'log', '-1', '--format=%cs', '--', rel], cwd=RACINE, capture_output=True, text=True).stdout.strip()


xml = open(SITEMAP, encoding='utf-8').read()
blocs = re.findall(r'<url>.*?</url>', xml, re.S)
ecarts, neuf = [], xml
for b in blocs:
    url = re.search(r'<loc>([^<]+)</loc>', b).group(1)
    d = date_git(fichier(url))
    actuel = re.search(r'<lastmod>([^<]+)</lastmod>', b)
    if not d:
        ecarts.append(f'{url} : aucun commit pour {fichier(url)}')
        continue
    if not actuel or actuel.group(1) < d:
        ecarts.append(f'{url} : lastmod {actuel.group(1) if actuel else "absent"}, git {d}')
    nb = re.sub(r'\s*<lastmod>[^<]*</lastmod>', '', b)
    nb = nb.replace('</loc>', f'</loc>\n    <lastmod>{d}</lastmod>', 1)
    neuf = neuf.replace(b, nb, 1)

if '--verifier' in sys.argv:
    print('\n'.join(ecarts) or 'lastmod à jour')
    sys.exit(1 if ecarts else 0)
open(SITEMAP, 'w', encoding='utf-8').write(neuf)
print(f'{len(blocs)} URL, lastmod écrit' + (f' ({len(ecarts)} mises à jour)' if ecarts else ' (déjà à jour)'))
