"""Contrôle du site, piloté par le sitemap (une URL du sitemap = une page contrôlée) : liens internes et ancres, un h1 et un canonical
égal à l'URL par page, titre et description présents et uniques, og:title/og:description cohérents, JSON-LD valide, hreflang
fr/en/ar/x-default réciproques et identiques au sitemap, lien de pied vers les pages « Création de site web », pages arabes en dir=rtl, un lien LinkedIn et un lien Instagram (avec leur logo) par page, sameAs des accueils, texte alternatif non vide sur chaque image.
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
    def __init__(s): super().__init__(); s.ids=set(); s.imgs=[]; s.hrefs=[]; s.h1=0; s.meta={}; s.title=None; s._t=None; s.jsonld=[]; s._j=False; s.canon=None; s.alt=[]
    def handle_starttag(s, t, a):
        a = dict(a)
        if 'id' in a: s.ids.add(a['id'])
        if t == 'a' and 'href' in a: s.hrefs.append(a['href'])
        if t == 'h1': s.h1 += 1
        if t == 'img': s.imgs.append(a)
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
# images : un texte alternatif non vide (Bing signale « alt manquant » sur alt="" ; ici les icônes Atlasya et Rihla sont des images de contenu)
for u, p in pages.items():
    for i in p.imgs:
        if not (i.get('alt') or '').strip(): echecs.append(f'{u}: image sans texte alternatif ({i.get("src")})')
# réseaux : un seul lien LinkedIn et un seul lien Instagram par page du sitemap (pied), chacun avec son logo, et le sameAs des deux accueils les porte, identique FR et EN
LI = 'https://www.linkedin.com/company/legantis-digital-service-sas/'; IG = 'https://www.instagram.com/legantis.ma/'
#   emplacements (22/10/2026, demande du user : « les rendre plus visibles ») : le bas de page de chaque page (nav « Liens de pied de page »), la colonne Contact du pied (`<span class="pied-reseaux">` dans l'<address>) et, sur les DEUX ACCUEILS seulement, la section Contact (`<div class="contact-tel contact-reseaux">`) : 3 liens par réseau sur un accueil, 2 ailleurs
ACCUEILS = (BASE, BASE + 'en/')
for u, p in pages.items():
    h = open(fichier(u), encoding='utf-8').read()
    for nom, lien in (('LinkedIn', LI), ('Instagram', IG)):
        motif = r'<a class="reseau" href="' + re.escape(lien) + r'"><svg class="logo-reseau"[^>]*aria-hidden="true"[^>]*><path d="[^"]{40,}"/></svg>' + nom + '</a>'
        attendu = 3 if u in ACCUEILS else 2
        if p.hrefs.count(lien) != attendu: echecs.append(f'{u}: {p.hrefs.count(lien)} lien(s) {nom} ({attendu} attendus)')
        # le logo (svg décoratif, tracé non vide) est dans le lien, avant l'intitulé qui reste le nom accessible
        if len(re.findall(motif, h)) != attendu: echecs.append(f'{u}: logo {nom} absent ou mal formé dans un des {attendu} liens')
        # un lien dans chaque emplacement : bas de page, colonne Contact du pied, section Contact (accueils)
        bas = re.search(r'<nav aria-label="[^"]*">(.*?)</nav>', h[h.index('class="pied-bas"'):], re.S)
        if not bas or not re.search(motif, bas.group(1)): echecs.append(f'{u}: lien {nom} absent du bas de page')
        adr = re.search(r'<address>(.*?)</address>', h, re.S)
        if not adr or not re.search(r'<span class="pied-reseaux">.*?' + motif + '.*?</span>', adr.group(1), re.S): echecs.append(f'{u}: lien {nom} absent de la colonne Contact du pied')
        if u in ACCUEILS and not re.search(r'<div class="contact-tel contact-reseaux">.*?' + motif + r'.*?</div>', h, re.S): echecs.append(f'{u}: lien {nom} absent de la section Contact')
def same_as(p):
    for j in p.jsonld:
        try: g = json.loads(j).get('@graph', [])
        except Exception: continue
        for e in g:
            if e.get('@type') == 'Organization': return e.get('sameAs')
sa = {u: same_as(pages[u]) for u in (BASE, BASE + 'en/') if u in pages}
for u, v in sa.items():
    if v != [LI, IG]: echecs.append(f'{u}: sameAs {v} (attendu LinkedIn puis Instagram)')
# horaires (lundi au samedi, 9 h – 18 h, dimanche fermé) : la ligne du pied (dans l'<address>) de chaque page du sitemap, dans sa langue, et le hoursAvailable du contactPoint des deux accueils
HORAIRES = {'fr': 'Du lundi au samedi<br>9&nbsp;h – 18&nbsp;h', 'en': 'Monday to Saturday<br>9 am – 6 pm, Morocco time', 'ar': 'من الاثنين إلى السبت<br><bdi dir="ltr">9:00 – 18:00</bdi>'}
for u in pages:
    lang = 'ar' if '/ar/' in u else 'en' if '/en/' in u else 'fr'
    m = re.search(r'<address>(.*?)</address>', open(fichier(u), encoding='utf-8').read(), re.S)
    if not m or ('<span>' + HORAIRES[lang] + '</span>') not in m.group(1): echecs.append(f'{u}: ligne d\'horaires ({lang}) absente ou modifiée dans le pied')
HORAIRES_LD = {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], 'opens': '09:00', 'closes': '18:00'}
def horaires_ld(p):
    for j in p.jsonld:
        try: g = json.loads(j).get('@graph', [])
        except Exception: continue
        for e in g:
            if e.get('@type') == 'Organization': return (e.get('contactPoint') or {}).get('hoursAvailable')
for u in (BASE, BASE + 'en/'):
    if u in pages and horaires_ld(pages[u]) != HORAIRES_LD: echecs.append(f'{u}: contactPoint.hoursAvailable {horaires_ld(pages[u])} (attendu lundi–samedi 09:00–18:00)')
# formulaire de devis (23/10/2026) : carte #devis des deux accueils, POST vers le Worker de worker/ (qui renvoie vers #devis-envoye / #devis-echec).
#   Contrôlé : méthode et adresse du Worker (le texte de remplacement REMPLACER fait échouer : la branche ne se fusionne qu'avec la vraie adresse), les champs du HTML
#   = ceux que le Worker lit (lus dans worker/src/index.js), la langue de la page, un <label for> par champ, le champ piège caché, les deux messages, et les mentions
#   légales : plus de « ni formulaire », les prestataires du Worker nommés (Cloudflare, Resend) et la messagerie (Hostinger).
WORKER_SRC = os.path.join(RACINE, '..', 'worker', 'src', 'index.js')
champs_worker = set(re.findall(r"donnees\.(?:get|getAll)\('([a-z_]+)'\)", open(WORKER_SRC, encoding='utf-8').read())) if os.path.exists(WORKER_SRC) else None
for u, lang in ((BASE, 'fr'), (BASE + 'en/', 'en')):
    if u not in pages: continue
    h = open(fichier(u), encoding='utf-8').read()
    m = re.search(r'<form class="devis-form"([^>]*)>(.*?)</form>', h, re.S)
    if not m: echecs.append(f'{u}: formulaire de devis absent'); continue
    ouv, corps = m.group(1), m.group(2)
    action = (re.search(r'action="([^"]*)"', ouv) or [None, ''])[1]
    if 'method="post"' not in ouv: echecs.append(f'{u}: le formulaire de devis n\'est pas en method="post"')
    if 'REMPLACER' in action: echecs.append(f'{u}: action du formulaire = {action} (remplacer par l\'adresse workers.dev du Worker déployé)')
    elif not re.fullmatch(r'https://[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev/', action): echecs.append(f'{u}: action du formulaire {action!r} (adresse workers.dev attendue)')
    noms = set(re.findall(r'<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"', corps))
    if champs_worker is not None and noms != champs_worker: echecs.append(f'{u}: champs du formulaire {sorted(noms)} ≠ champs lus par le Worker {sorted(champs_worker)}')
    if f'<input type="hidden" name="langue" value="{lang}">' not in corps: echecs.append(f'{u}: champ caché langue={lang} absent')
    for ident in re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', corps):
        if f'<label for="{ident}">' not in corps: echecs.append(f'{u}: champ #{ident} sans <label for>')
    if not re.search(r'<div class="visuellement-cache" aria-hidden="true"><label>[^<]*<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>', corps): echecs.append(f'{u}: champ piège site_web absent ou visible')
    for ident in ('devis-envoye', 'devis-echec'):
        if ident not in pages[u].ids: echecs.append(f'{u}: message #{ident} absent')
    if not re.search(r'<button class="bouton bouton--plein" type="submit">', corps): echecs.append(f'{u}: bouton d\'envoi absent')
for u, mots in ((BASE + 'mentions-legales/', ('Cloudflare', 'Resend', 'Hostinger', 'id="donnees"', 'ni cookie')), (BASE + 'en/legal/', ('Cloudflare', 'Resend', 'Hostinger', 'id="personal-data"', 'no cookies'))):
    if u not in pages: continue
    h = open(fichier(u), encoding='utf-8').read()
    for mot in mots:
        if mot not in h: echecs.append(f'{u}: « {mot} » absent des données personnelles')
    if re.search(r'ni formulaire|no forms|aucune donnée personnelle|no personal data', h): echecs.append(f'{u}: dit encore qu\'il n\'y a ni formulaire ni donnée personnelle')
# boutons « Devis gratuit » (23/10/2026) : barre, menu mobile, pied et boutons pleins ouvrent le formulaire #devis, plus de mailto prérempli.
#   Cible : #devis sur les deux accueils ; ../#devis ailleurs (accueil FR pour les pages FR, accueil EN pour les pages EN) ; ../../#devis sur les pages arabes (accueil FR : pas d'accueil arabe).
#   Les liens qui affichent l'adresse e-mail (contact, ligne « Vous préférez écrire directement ? ») gardent leur mailto : ils n'ont pas ces classes.
CTA_UNIQUES = ('barre-cta', 'menu-devis', 'pied-devis')
for u in pages:
    h = open(fichier(u), encoding='utf-8').read()
    cible = '#devis' if u in ACCUEILS else '../../#devis' if '/ar/' in u else '../#devis'
    for cls in CTA_UNIQUES:
        liens = re.findall(r'<a class="[^"]*\b' + cls + r'\b[^"]*" href="([^"]*)"', h)
        if liens != [cible]: echecs.append(f'{u}: lien « {cls} » = {liens} (attendu une fois {cible})')
    for classes, href in re.findall(r'<a class="([^"]*)" href="([^"]*)"', h):
        if any(c in classes.split() for c in CTA_UNIQUES + ('bouton--plein',)) and href.startswith('mailto:'): echecs.append(f'{u}: bouton « {classes} » ouvre encore un mailto')
        if 'bouton--plein' in classes.split() and href.startswith(('#devis', '../#devis', '../../#devis')) and href != cible: echecs.append(f'{u}: bouton « {classes} » vise {href} (attendu {cible})')
# catalogue et compteurs (26/10/2026 ; l'intro disait « Deux titres » au-dessus de trois cartes) : pas de build qui centraliserait le nombre de titres,
#   donc un contrôle. Sur chaque accueil, le nombre de cartes du Catalogue = le compteur de l'ouverture = le chiffre « titres publiés » = le mot de l'intro ;
#   et partout, chaque compteur animé (--n, la valeur d'arrivée de l'animation) = le nombre écrit dans le texte (celui des lecteurs d'écran et du repli).
MOTS = {'fr': ('Un titre', 'Deux titres', 'Trois titres', 'Quatre titres', 'Cinq titres', 'Six titres'), 'en': ('One title', 'Two titles', 'Three titles', 'Four titles', 'Five titles', 'Six titles')}
PUBLIES = {'fr': 'titres publiés', 'en': 'titles published'}
for u in pages:
    h = open(fichier(u), encoding='utf-8').read()
    for anime, ecrit in re.findall(r'<span class="n" style="--n:(\d+)">(\d+)</span>', h):
        if anime != ecrit: echecs.append(f'{u}: compteur animé jusqu\'à {anime} mais {ecrit} dans le texte')
for u, lang in ((BASE, 'fr'), (BASE + 'en/', 'en')):
    if u not in pages: continue
    h = open(fichier(u), encoding='utf-8').read()
    if '<div class="catalogue">' not in h: echecs.append(f'{u}: Catalogue introuvable'); continue
    debut = h.index('<div class="catalogue">')
    nb = len(re.findall(r'<article class="titre ', h[debut:h.index('</section>', debut)]))
    ouv = re.search(r'<p class="compteur"><span class="chiffre-n"><span class="n" style="--n:\d+">(\d+)</span>', h)
    if not ouv or int(ouv.group(1)) != nb: echecs.append(f'{u}: compteur de l\'ouverture {ouv and ouv.group(1)} ≠ {nb} cartes au Catalogue')
    pub = re.search(r'<span class="n" style="--n:\d+">(\d+)</span></span><span class="chiffre-l">' + PUBLIES[lang] + '</span>', h)
    if not pub or int(pub.group(1)) != nb: echecs.append(f'{u}: chiffre « {PUBLIES[lang]} » {pub and pub.group(1)} ≠ {nb} cartes au Catalogue')
    intro = re.search(r'id="produits-titre">.*?<p class="intro">([^<]*)', h, re.S)
    if not intro or not 1 <= nb <= 6 or not intro.group(1).startswith(MOTS[lang][nb - 1] + ' '): echecs.append(f'{u}: l\'intro du Catalogue ne commence pas par « {MOTS[lang][nb - 1] if 1 <= nb <= 6 else nb} » ({nb} cartes)')
    # captures des produits (couvertures) : dimensions écrites (pas de décalage au chargement) et chargement paresseux (le Catalogue est loin sous l'ouverture)
    for img in re.findall(r'<div class="ecran">(<img [^>]*>)</div>', h):
        if not re.search(r'\bwidth="\d+" height="\d+"', img) or 'loading="lazy"' not in img: echecs.append(f'{u}: capture {img[:60]}… sans width/height ou sans loading="lazy"')
print(len(pages), 'pages du sitemap,', n, 'liens internes contrôlés')
print('ÉCHECS:' if echecs else 'tout passe', *echecs, sep='\n  ')
