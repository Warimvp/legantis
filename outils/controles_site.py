"""Contrôle du site, piloté par le sitemap (une URL du sitemap = une page contrôlée) : liens internes et ancres, un h1 et un canonical
égal à l'URL par page, titre et description présents et uniques, og:title/og:description cohérents, JSON-LD valide, hreflang
fr/en/ar/x-default réciproques et identiques au sitemap, lien de pied vers les pages « Création de site web », pages arabes en dir=rtl.
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

FR_NEW = BASE + 'creation-site-web-casablanca/'; EN_NEW = BASE + 'en/website-development-casablanca/'; AR_NEW = BASE + 'ar/website-development-casablanca/'
# langues déclarées par le sitemap pour chaque URL (xhtml:link) : le <head> de la page doit porter les mêmes, plus x-default
alt_sitemap = {}
for bloc in re.findall(r'<url>.*?</url>', sm, re.S):
    loc = re.search(r'<loc>([^<]+)</loc>', bloc).group(1)
    alt_sitemap[loc] = {l: h for l, h in re.findall(r'hreflang="([^"]+)" href="([^"]+)"', bloc)}
for u, p in pages.items():
    resolus = [urljoin(u, h).split('#')[0] for h in p.hrefs]
    attendu = AR_NEW if '/ar/' in u else EN_NEW if '/en/' in u or u == BASE + 'en/' else FR_NEW
    if u not in (FR_NEW, EN_NEW, AR_NEW) and resolus.count(attendu) < 1 and not (attendu == AR_NEW and FR_NEW in resolus):
        echecs.append(f'{u}: pas de lien vers {attendu}')   # une page arabe sans équivalent arabe renvoie vers la page française
    for lang, href in p.alt:
        if href in pages and u not in [h for _, h in pages[href].alt]: echecs.append(f'{u}: hreflang {lang} -> {href} non réciproque')
    if p.alt:
        langs = sorted(l for l, _ in p.alt)
        attendues = sorted(set(alt_sitemap.get(u, {})) | {'x-default'})
        if langs != attendues: echecs.append(f'{u}: hreflang {langs} ≠ sitemap {attendues}')
        for lang, href in p.alt:
            if lang != 'x-default' and alt_sitemap.get(u, {}).get(lang) != href: echecs.append(f'{u}: hreflang {lang} {href} ≠ sitemap')
# le sitemap porte les alternates réciproques des pages Création de site web (FR, EN, AR)
if not all(f'<loc>{x}</loc>' in sm for x in (FR_NEW, EN_NEW, AR_NEW)): echecs.append('sitemap: pages Création de site web absentes')
# les pages arabes : lang="ar" dir="rtl", og:locale ar_MA
for u, p in pages.items():
    if '/ar/' in u:
        h = open(fichier(u), encoding='utf-8').read()
        if '<html lang="ar" dir="rtl">' not in h: echecs.append(f'{u}: <html lang="ar" dir="rtl"> manquant')
        if p.meta.get('og:locale') != 'ar_MA': echecs.append(f'{u}: og:locale {p.meta.get("og:locale")}')
    elif re.search(r'<html[^>]*dir="rtl"', open(fichier(u), encoding='utf-8').read()): echecs.append(f'{u}: dir="rtl" sur une page non arabe')
print(len(pages), 'pages du sitemap,', n, 'liens internes contrôlés')
print('ÉCHECS:' if echecs else 'tout passe', *echecs, sep='\n  ')
