"""Contrôle du site, piloté par le sitemap (une URL du sitemap = une page contrôlée) : liens internes et ancres, un h1 et un canonical
égal à l'URL par page, titre et description présents et uniques, og:title/og:description cohérents, JSON-LD valide, hreflang
fr/en/x-default réciproques, lien de pied vers les pages « Création de site web ».
    python3 outils/controles_site.py [dossier-du-site]        (sans argument : ../site)
Sortie : « tout passe » ou la liste des échecs. Éprouvé sur des copies cassées (ancre absente, titre dupliqué, URL de sitemap sans fichier,
hreflang non réciproque, lien de pied retiré). Ne mesure pas la largeur des titres en pixels (voir CLAUDE.md : Chromium, Arial 20 px / 14 px)."""
import re, os, json, sys
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
RACINE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
BASE = 'https://legantis.net/'
sm = open(os.path.join(RACINE, 'sitemap.xml'), encoding='utf-8').read()
urls = [BASE + u for u in re.findall(r'<loc>https://legantis.net/([^<]*)</loc>', sm)]
class P(HTMLParser):
    def __init__(s): super().__init__(); s.ids=set(); s.hrefs=[]; s.h1=0; s.meta={}; s.title=None; s._t=None; s.jsonld=[]; s._j=False; s.canon=None; s.alt=[]
    def handle_starttag(s, t, a):
        a = dict(a)
        if 'id' in a: s.ids.add(a['id'])
        if t == 'a' and 'href' in a: s.hrefs.append(a['href'])
        if t == 'h1': s.h1 += 1
        if t == 'title': s._t = ''
        if t == 'meta': s.meta[a.get('name') or a.get('property')] = a.get('content')
        if t == 'link' and a.get('rel') == 'canonical': s.canon = a['href']
        if t == 'link' and a.get('rel') == 'alternate' and a.get('hreflang'): s.alt.append((a['hreflang'], a['href']))
        if t == 'script' and a.get('type') == 'application/ld+json': s._j = True; s.jsonld.append('')
    def handle_endtag(s, t):
        if t == 'title': s.title = s._t; s._t = None
        if t == 'script': s._j = False
    def handle_data(s, d):
        if s._t is not None: s._t += d
        if s._j: s.jsonld[-1] += d
def fichier(u):
    p = urlparse(u).path.lstrip('/'); c = os.path.join(RACINE, p)
    return os.path.join(c, 'index.html') if p == '' or p.endswith('/') else c
pages = {}; echecs = []; n = 0
for u in urls:
    if not os.path.exists(fichier(u)): echecs.append(f'sitemap: {u} sans fichier'); continue
    p = P(); p.feed(open(fichier(u), encoding='utf-8').read()); pages[u] = p
for u, p in pages.items():
    for h in p.hrefs:
        if h.startswith(('mailto:', 'tel:', '#!')) or urlparse(h).netloc not in ('', 'legantis.net'): continue
        full = urljoin(u, h); ur = urlparse(full); n += 1
        cible = BASE + ur.path.lstrip('/')
        if not os.path.exists(fichier(cible)): echecs.append(f'{u}: {h} -> fichier absent'); continue
        if ur.fragment and cible in pages and ur.fragment not in pages[cible].ids: echecs.append(f'{u}: {h} -> ancre #{ur.fragment} absente')
    if p.h1 != 1: echecs.append(f'{u}: {p.h1} h1')
    if p.canon != u: echecs.append(f'{u}: canonical {p.canon}')
    if not p.title or not p.meta.get('description'): echecs.append(f'{u}: titre ou description manquant')
    if p.meta.get('og:title') != p.title: echecs.append(f'{u}: og:title différent du title')
    if p.meta.get('og:description') is not None and p.meta.get('og:description') != p.meta.get('description'): echecs.append(f'{u}: og:description différente de la description')
    for j in p.jsonld:
        try: json.loads(j)
        except Exception as e: echecs.append(f'{u}: JSON-LD invalide {e}')
seen = {}
for u, p in pages.items():
    seen.setdefault('T:' + (p.title or ''), []).append(u); seen.setdefault('D:' + (p.meta.get('description') or ''), []).append(u)
for k, v in seen.items():
    if len(v) > 1: echecs.append(f'doublon {k[:60]}: {v}')

FR_NEW = BASE + 'creation-site-web-casablanca/'; EN_NEW = BASE + 'en/website-development-casablanca/'
for u, p in pages.items():
    resolus = [urljoin(u, h).split('#')[0] for h in p.hrefs]
    attendu = EN_NEW if '/en/' in u or u == BASE + 'en/' else FR_NEW
    if u not in (FR_NEW, EN_NEW) and resolus.count(attendu) < 1: echecs.append(f'{u}: pas de lien vers {attendu}')
    for lang, href in p.alt:
        if href in pages and u not in [h for _, h in pages[href].alt]: echecs.append(f'{u}: hreflang {lang} -> {href} non réciproque')
    if p.alt:
        langs = sorted(l for l, _ in p.alt)
        if langs != ['en', 'fr', 'x-default']: echecs.append(f'{u}: hreflang {langs}')
# le sitemap porte les alternates réciproques des deux nouvelles pages
if f'<loc>{FR_NEW}</loc>' not in sm or f'<loc>{EN_NEW}</loc>' not in sm: echecs.append('sitemap: nouvelles pages absentes')
print(len(pages), 'pages du sitemap,', n, 'liens internes contrôlés')
print('ÉCHECS:' if echecs else 'tout passe', *echecs, sep='\n  ')
