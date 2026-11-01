"""Soumet les URL du sitemap à IndexNow (Bing, Yandex, Seznam, Naver…). Google n'utilise pas IndexNow : voir docs/indexation.md.
    python3 outils/indexnow.py            (montre ce qui serait envoyé, n'envoie rien)
    python3 outils/indexnow.py --envoyer  (envoie toutes les URL du sitemap, après la mise en ligne)
La clé est le nom du fichier site/<clé>.txt, qui contient la clé elle-même. Il doit être en ligne avant l'envoi."""
import glob, json, os, re, sys, urllib.request

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = os.path.join(RACINE, 'site')
HOTE = 'legantis.net'

cles = [f for f in glob.glob(os.path.join(SITE, '*.txt')) if re.fullmatch(r'[0-9a-f]{32}\.txt', os.path.basename(f))]
if len(cles) != 1: sys.exit(f'il faut exactement un fichier de clé IndexNow dans site/, trouvé {len(cles)}')
cle = os.path.basename(cles[0])[:-4]
if open(cles[0], encoding='utf-8').read().strip() != cle: sys.exit('le fichier de clé ne contient pas sa propre clé')
urls = re.findall(r'<loc>([^<]+)</loc>', open(os.path.join(SITE, 'sitemap.xml'), encoding='utf-8').read())
if not urls or any(not u.startswith(f'https://{HOTE}/') for u in urls): sys.exit('sitemap vide ou URL hors de ' + HOTE)
corps = {'host': HOTE, 'key': cle, 'keyLocation': f'https://{HOTE}/{cle}.txt', 'urlList': urls}

if '--envoyer' not in sys.argv:
    print(json.dumps(corps, indent=2, ensure_ascii=False)); print(f'\n{len(urls)} URL. Rien envoyé : ajouter --envoyer.'); sys.exit(0)

try:
    en_ligne = urllib.request.urlopen(corps['keyLocation'], timeout=20).read().decode().strip()
except Exception as e:
    sys.exit(f'clé introuvable en ligne ({e}) : publier le site avant l\'envoi')
if en_ligne != cle: sys.exit('la clé en ligne ne correspond pas au fichier local')
req = urllib.request.Request('https://api.indexnow.org/indexnow', data=json.dumps(corps).encode(), headers={'Content-Type': 'application/json; charset=utf-8'})
try:
    r = urllib.request.urlopen(req, timeout=30); print(f'IndexNow : HTTP {r.status} pour {len(urls)} URL (200 ou 202 = accepté)')
except urllib.error.HTTPError as e:
    sys.exit(f'IndexNow : HTTP {e.code} {e.read().decode(errors="replace")[:300]}')
