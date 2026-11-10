"""Contrôle du site, piloté par le sitemap (une URL du sitemap = une page contrôlée) : liens internes et ancres, un h1 et un canonical
égal à l'URL par page, titre et description présents et uniques, og:title/og:description cohérents, JSON-LD valide, hreflang
fr/en/ar/x-default réciproques et identiques au sitemap, lien de pied vers les pages « Création de site web », pages arabes en dir=rtl, un lien LinkedIn et un lien Instagram (avec leur logo) par page, sameAs des accueils, texte alternatif non vide sur chaque image.
    python3 outils/controles_site.py [dossier-du-site]        (sans argument : ../site)
Sortie : « tout passe » ou la liste des échecs. Éprouvé sur des copies cassées (ancre absente, titre dupliqué, URL de sitemap sans fichier,
hreflang non réciproque, lien de pied retiré). Ne mesure pas la largeur des titres en pixels (voir CLAUDE.md : Chromium, Arial 20 px / 14 px)."""
import re, os, json, sys, glob
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
# Catalogue de l'accueil (03/11/2026, SEO C1/C5) : chaque Service d'une page française (hors /en/, /ar/) y figure avec le même @id et le même nom.
def services_ld(o, acc):
    if isinstance(o, dict):
        if o.get('@type') == 'Service' and str(o.get('@id', '')).startswith(BASE): acc[o['@id']] = o.get('name')
        for v in o.values(): services_ld(v, acc)
    elif isinstance(o, list):
        for v in o: services_ld(v, acc)
catalogue = {}
for j in pages.get(BASE, None).jsonld if BASE in pages else []:
    try:
        o = json.loads(j)
        for g in (o.get('@graph', [o]) if isinstance(o, dict) else o):
            for cat in [g.get('hasOfferCatalog')] if isinstance(g, dict) and g.get('hasOfferCatalog') else []:
                for e in cat.get('itemListElement', []): services_ld(e, catalogue)
    except Exception: pass
for u, p in pages.items():
    if p.meta.get('og:description') is None: echecs.append(f'{u}: og:description absente')
    if u.startswith((BASE + 'en/', BASE + 'ar/')) or u == BASE: continue
    declares = {}
    for j in p.jsonld:
        try: services_ld(json.loads(j), declares)
        except Exception: pass
    for i, nom in declares.items():
        if i.startswith((BASE + 'en/', BASE + 'ar/')): continue
        if catalogue.get(i) != nom: echecs.append(f'{u}: Service {i} « {nom} » absent du catalogue de l\'accueil ou nommé autrement')
seen = {}
for u, p in pages.items():
    seen.setdefault('T:' + (p.title or ''), []).append(u); seen.setdefault('D:' + (p.meta.get('description') or ''), []).append(u)
for k, v in seen.items():
    if len(v) > 1: echecs.append(f'doublon {k[:60]}: {v}')

# /commandes/ est une page d'acquisition indexable (depuis le 31/10/2026) mais sans barre, sans menu et sans pied complet :
#   elle passe les contrôles communs ci-dessus (h1, canonical, titre, description, JSON-LD, liens) et ses contrôles propres plus bas,
#   pas ceux du gabarit des pages de prestation (pied, réseaux, horaires, boutons « Devis gratuit », liens vers « Création de site web »).
ACQ_URL = BASE + 'commandes/'
gabarit = {u: p for u, p in pages.items() if u != ACQ_URL}

FR_NEW = BASE + 'creation-site-web-casablanca/'; EN_NEW = BASE + 'en/website-development-casablanca/'; AR_NEW = BASE + 'ar/website-development-casablanca/'
# langues déclarées par le sitemap pour chaque URL (xhtml:link) : le <head> de la page doit porter les mêmes, plus x-default
alt_sitemap = {}
for bloc in re.findall(r'<url>.*?</url>', sm, re.S):
    loc = re.search(r'<loc>([^<]+)</loc>', bloc).group(1)
    alt_sitemap[loc] = {l: h for l, h in re.findall(r'hreflang="([^"]+)" href="([^"]+)"', bloc)}
for u, p in gabarit.items():
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
# chaque alternate déclaré dans le sitemap est lui-même une URL du sitemap (09/11/2026 : retirer le bloc d'une page arabe laissait ses alternates pendants, sans échec)
for loc, d in alt_sitemap.items():
    for lang, href in d.items():
        if href not in urls: echecs.append(f'sitemap: {loc} déclare hreflang {lang} -> {href}, absent du sitemap comme <loc>')
# x-default : le sitemap le déclare pour chaque URL qui a des alternates, identique à celui du <head> de la page
for u, p in pages.items():
    if not alt_sitemap.get(u): continue
    xd_html = dict(p.alt).get('x-default')
    if alt_sitemap[u].get('x-default') != xd_html: echecs.append(f'{u}: x-default du sitemap {alt_sitemap[u].get("x-default")} ≠ celui de la page {xd_html}')
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
for u, p in gabarit.items():
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
for u in gabarit:
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
#   les champs qu'une page d'avant le 30/10/2026 envoyait doivent rester lus ; chaque formulaire n'emploie ensuite que ce qui le concerne (les parcours sont contrôlés plus bas)
CHAMPS_ACCUEIL = {'nom', 'email', 'telephone', 'entreprise', 'type', 'projet', 'supports', 'delai', 'langue', 'site_web', 'consentement'}
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
    if champs_worker is not None and not (noms == CHAMPS_ACCUEIL and noms <= champs_worker): echecs.append(f'{u}: champs du formulaire {sorted(noms)} ≠ {sorted(CHAMPS_ACCUEIL)} ou non lus par le Worker')
    if f'<input type="hidden" name="langue" value="{lang}">' not in corps: echecs.append(f'{u}: champ caché langue={lang} absent')
    for ident in re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', corps):
        if f'<label for="{ident}">' not in corps: echecs.append(f'{u}: champ #{ident} sans <label for>')
    if not re.search(r'<div class="visuellement-cache" aria-hidden="true"><label>[^<]*<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>', corps): echecs.append(f'{u}: champ piège site_web absent ou visible')
    for ident in ('devis-envoye', 'devis-echec'):
        if ident not in pages[u].ids: echecs.append(f'{u}: message #{ident} absent')
    if not re.search(r'<button class="bouton bouton--plein" type="submit">', corps): echecs.append(f'{u}: bouton d\'envoi absent')

# contact rapide (05/11/2026) : nom, un moyen de contact (e-mail OU téléphone) et le besoin, sur l'accueil FR. Parcours « rapide » du Worker, qui renvoie vers #rappel-envoye / #rappel-echec
# (les ancres du formulaire détaillé, #devis-envoye / #devis-echec, restent à celui-ci : jamais deux fois le même identifiant dans une page).
# Depuis le 10/11/2026, aussi sur la page d'offre, page d'arrivée des publicités Google : au premier écran, un lien vers ce formulaire et un lien d'appel.
CHAMPS_RAPIDE = {'langue', 'parcours', 'nom', 'contact', 'type', 'projet', 'consentement', 'site_web'}
TYPES_WORKER = set(re.findall(r'(\w+):', (re.search(r"const TYPES = \{([^}]*)\}", open(WORKER_SRC, encoding='utf-8').read()) or [None, ''])[1])) if os.path.exists(WORKER_SRC) else None
for u, lang in ((BASE, 'fr'), (BASE + 'en/', 'en'), (BASE + 'offre-lancement/', 'fr')):
    if not os.path.exists(fichier(u)): echecs.append(f'{u}: page absente'); continue
    h = open(fichier(u), encoding='utf-8').read()
    if u in pages: q = pages[u]
    else: q = P(); q.feed(h)
    m = re.search(r'<form class="devis-form rappel-form"([^>]*)>(.*?)</form>', h, re.S)
    if not m: echecs.append(f'{u}: formulaire de contact rapide absent'); continue
    ouv, corps = m.group(1), m.group(2)
    if 'method="post"' not in ouv or not re.search(r'action="https://[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev/"', ouv): echecs.append(f'{u}: contact rapide : method="post" et adresse workers.dev attendus')
    for attr, ident in (('data-ok', 'rappel-envoye'), ('data-echec', 'rappel-echec')):
        if f'{attr}="{ident}"' not in ouv or ident not in q.ids: echecs.append(f'{u}: contact rapide : {attr}="{ident}" et message #{ident} attendus')
    noms = set(re.findall(r'<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"', corps))
    if noms != CHAMPS_RAPIDE or (champs_worker is not None and not noms <= champs_worker): echecs.append(f'{u}: contact rapide : champs {sorted(noms)} ≠ {sorted(CHAMPS_RAPIDE)} ou non lus par le Worker')
    if '<input type="hidden" name="parcours" value="rapide">' not in corps or f'<input type="hidden" name="langue" value="{lang}">' not in corps: echecs.append(f'{u}: contact rapide : champs cachés parcours=rapide et langue={lang} attendus')
    for nom in ('nom', 'contact', 'type', 'consentement'):
        if not re.search(r'<(?:input|select)\b[^>]*\bname="' + nom + r'"[^>]*\brequired\b', corps): echecs.append(f'{u}: contact rapide : champ « {nom} » non obligatoire')
    for ident in re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', corps):
        if f'<label for="{ident}">' not in corps and f'<label for="{ident}"><input' not in corps: echecs.append(f'{u}: contact rapide : champ #{ident} sans <label for>')
    options = set(re.findall(r'<option value="([a-z]+)"', corps))
    if TYPES_WORKER is not None and (not options or not options <= TYPES_WORKER): echecs.append(f'{u}: contact rapide : besoins {sorted(options)} absents de la liste du Worker')
    if not re.search(r'<div class="visuellement-cache" aria-hidden="true"><label>[^<]*<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>', corps): echecs.append(f'{u}: contact rapide : champ piège absent ou visible')
    if ('mentions-legales/#donnees' if lang == 'fr' else 'legal/#personal-data') not in corps: echecs.append(f'{u}: contact rapide : lien vers les mentions légales (données) absent')
    if u not in ACCUEILS:
        tete = re.search(r'<section class="service-tete".*?</section>', h, re.S)
        if not tete or 'href="#rappel"' not in tete.group(0) or 'href="tel:+212672759097"' not in tete.group(0): echecs.append(f'{u}: premier écran sans lien vers le contact rapide (#rappel) ou sans lien d\'appel')
        continue
    # trois offres : chacune a son identifiant et son devis, dont le type existe dans le simulateur
    for ident, type_ in (('visibilite', 'vitrine'), ('gestion', 'logiciel'), ('applications', 'web')):
        offre = re.search(r'<li class="prestation[^"]*" id="' + ident + r'">(.*?)</li>', h, re.S)
        cible_devis = f'href="estimer-mon-projet/?type={type_}"' if lang == 'fr' else 'href="#rappel"'   # l'accueil anglais n'a pas de simulateur : ses offres mènent au contact rapide
        if not offre or cible_devis not in offre.group(1): echecs.append(f'{u}: offre « {ident} » absente ou sans devis ({cible_devis})')
for u, mots in ((BASE + 'mentions-legales/', ('Cloudflare', 'Resend', 'Hostinger', 'id="donnees"', 'ni cookie')), (BASE + 'en/legal/', ('Cloudflare', 'Resend', 'Hostinger', 'id="personal-data"', 'no cookies'))):
    if u not in pages: continue
    h = open(fichier(u), encoding='utf-8').read()
    for mot in mots:
        if mot not in h: echecs.append(f'{u}: « {mot} » absent des données personnelles')
    if re.search(r'ni formulaire|no forms|aucune donnée personnelle|no personal data', h): echecs.append(f'{u}: dit encore qu\'il n\'y a ni formulaire ni donnée personnelle')
# Rihla : pas de promesse sans limite de durée (une publicité récompensée est prévue, on écrit « à ce jour »), sur toutes les pages, hors sitemap comprises.
for dossier, _, noms in os.walk(RACINE):
    for nom in noms:
        if nom.endswith('.html'):
            page = os.path.join(dossier, nom)
            if re.search(r'pour toujours|free forever|مجانية دائمًا', open(page, encoding='utf-8').read()):
                echecs.append(f'{os.path.relpath(page, RACINE)}: promesse sans limite de durée')
# page d'acquisition /commandes/ (indexable et au sitemap depuis le 31/10/2026, aussi page d'arrivée des publicités) : pas de noindex, au sitemap, balisage Service, formulaire vers le Worker, choix = listes blanches du Worker, un <label for> par champ.
ACQ = os.path.join(RACINE, 'commandes', 'index.html')
if os.path.exists(ACQ):
    u = '/commandes/'; h = open(ACQ, encoding='utf-8').read(); src = open(WORKER_SRC, encoding='utf-8').read() if os.path.exists(WORKER_SRC) else ''
    if 'noindex' in h.split('</head>')[0]: echecs.append(f'{u}: noindex présent (la page est indexable depuis le 31/10/2026)')
    if '<loc>' + ACQ_URL + '</loc>' not in sm: echecs.append(f'{u}: absente du sitemap')
    if ACQ_URL not in pages: echecs.append(f'{u}: non contrôlée par le sitemap')
    else:
        servis = [e for j in pages[ACQ_URL].jsonld for e in json.loads(j).get('@graph', []) if e.get('@type') == 'Service']
        if len(servis) != 1 or servis[0].get('@id') != ACQ_URL + '#service' or servis[0].get('url') != ACQ_URL: echecs.append(f'{u}: balisage Service absent ou mal formé')
        elif (servis[0].get('provider') or {}).get('@id') != 'https://legantis.net/#organisation': echecs.append(f'{u}: le Service n\'a pas l\'Organization de l\'accueil pour fournisseur')
    titre_acq = ((pages[ACQ_URL].title if ACQ_URL in pages else '') or '').lower()
    if ACQ_URL in pages and not ('logiciel' in titre_acq and 'commandes' in titre_acq): echecs.append(f'{u}: le titre ne porte plus « logiciel » et « commandes »')
    m = re.search(r'<form class="devis-form"([^>]*)>(.*?)</form>', h, re.S)
    if not m: echecs.append(f'{u}: formulaire absent')
    else:
        ouv, corps = m.group(1), m.group(2)
        if not re.search(r'action="https://[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev/"', ouv) or 'method="post"' not in ouv: echecs.append(f'{u}: méthode ou adresse du formulaire')
        if '<input type="hidden" name="parcours" value="commandes">' not in corps: echecs.append(f'{u}: champ caché parcours absent')
        for nom in ('activite', 'ville', 'equipe', 'budget'):   # activité et budget font la priorité : obligatoires ; ville et équipe facultatives (V3.1)
            sel = re.search(r'<select\b[^>]*name="' + nom + r'"[^>]*>(.*?)</select>', corps, re.S)
            if not sel: echecs.append(f'{u}: liste {nom} absente'); continue
            if nom in ('activite', 'budget') and 'required' not in sel.group(0).split('>')[0]: echecs.append(f'{u}: liste {nom} facultative, la priorité ne peut plus être calculée')
            bloc = re.search(nom + r": \{ libelle: '[^']*', valeurs: \{(.*?)\} \}", src, re.S)
            for v, lib in re.findall(r'<option value="([^"]+)">([^<]*)</option>', sel.group(1)):
                if bloc and not re.search(r"(?:^|[\s,{])'?" + re.escape(v) + r"'?: '" + re.escape(lib).replace("'", "\\\\?'") + "'", bloc.group(1)): echecs.append(f'{u}: option {nom}={v} ({lib}) inconnue du Worker')
        for ident in re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', corps):
            if f'<label for="{ident}">' not in corps: echecs.append(f'{u}: champ #{ident} sans <label for>')
        if 'name="site_web"' not in corps or 'mentions-legales/#donnees' not in corps: echecs.append(f'{u}: champ piège ou lien de confidentialité absent')
        if not re.search(r'<input[^>]*name="consentement"[^>]*required', corps): echecs.append(f'{u}: case de consentement absente ou facultative')
    if 'assets/conversion.js' not in h: echecs.append(f'{u}: conversion.js absent : la source des publicités ne serait pas relevée')
    for ident in ('devis-envoye', 'devis-echec', 'demande'):
        if f'id="{ident}"' not in h: echecs.append(f'{u}: #{ident} absent')
# boutons « Devis gratuit » (23/10/2026) : barre, menu mobile, pied et boutons pleins ouvrent le formulaire #devis, plus de mailto prérempli.
#   Cible : #devis sur les deux accueils ; ../#devis ailleurs (accueil FR pour les pages FR, accueil EN pour les pages EN) ; ../../#devis sur les pages arabes (accueil FR : pas d'accueil arabe).
#   Les liens qui affichent l'adresse e-mail (contact, ligne « Vous préférez écrire directement ? ») gardent leur mailto : ils n'ont pas ces classes.
#   Depuis le 30/10/2026, les pages françaises mènent au simulateur (?type= garde le contexte de la prestation) ; EN et AR gardent le formulaire #devis de leur accueil.
CTA_UNIQUES = ('barre-cta', 'menu-devis', 'pied-devis')
TYPES_PAGE = {'creation-site-web-casablanca/': '?type=vitrine', 'application-web-maroc/': '?type=web', 'application-mobile-casablanca/': '?type=mobile', 'logiciel-sur-mesure-maroc/': '?type=logiciel', 'conseil-reprise-application-maroc/': '?type=autre', 'etude-de-cas-atlasya/': '?type=web', 'etude-de-cas-rihla/': '?type=mobile', 'etude-de-cas-ostad/': '?type=web', 'e-commerce-marketplace-maroc/': '?type=ecommerce', 'automatisation-integrations-maroc/': '?type=logiciel', 'expertise-technique/': '', 'partenaires-sous-traitance/': '?type=autre'}
for u in gabarit:
    h = open(fichier(u), encoding='utf-8').read()
    rel = u[len(BASE):]
    if rel == 'estimer-mon-projet/': cible = '#titre'
    elif '/ar/' in u: cible = '../../#devis'
    elif '/en/' in u or u == BASE + 'en/': cible = '#devis' if u in ACCUEILS else '../#devis'
    elif u == BASE: cible = 'estimer-mon-projet/'
    else: cible = '../estimer-mon-projet/' + TYPES_PAGE.get(rel, '')
    for cls in CTA_UNIQUES:
        liens = re.findall(r'<a class="[^"]*\b' + cls + r'\b[^"]*" href="([^"]*)"', h)
        attendu = '#demande' if rel == 'audit-gratuit/' and cls == 'barre-cta' else cible   # page d'arrivée de la publicité Services : son bouton de barre reste sur son formulaire
        if liens != [attendu]: echecs.append(f'{u}: lien « {cls} » = {liens} (attendu une fois {attendu})')
    for classes, href in re.findall(r'<a class="([^"]*)" href="([^"]*)"', h):
        if any(c in classes.split() for c in CTA_UNIQUES + ('bouton--plein',)) and href.startswith('mailto:'): echecs.append(f'{u}: bouton « {classes} » ouvre encore un mailto')
        if 'bouton--plein' in classes.split() and '#devis' in href and href != cible: echecs.append(f'{u}: bouton « {classes} » vise {href} (attendu {cible})')
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
# ── Conversion (30/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
HORS_SITEMAP = ['offre-lancement/', 'realisations/demos/restaurant/', 'realisations/demos/services/', 'realisations/demos/reservation/', 'realisations/demos/gestion/', 'realisations/demos/distribution-os/', 'realisations/demos/services/services/', 'realisations/demos/services/services/climatisation/', 'realisations/demos/services/services/electricite/', 'realisations/demos/services/services/maintenance/', 'realisations/demos/services/realisations/', 'realisations/demos/services/a-propos/', 'realisations/demos/services/contact/', 'realisations/demos/services/devis/', 'realisations/demos/services/espace/', 'realisations/demos/reservation/reserver/']
for rel in HORS_SITEMAP:
    u = BASE + rel
    if f'<loc>{u}</loc>' in sm: echecs.append(f'{u}: page d\'offre ou démonstration dans le sitemap')
    if not os.path.exists(fichier(u)): echecs.append(f'{u}: fichier absent'); continue
    t = open(fichier(u), encoding='utf-8').read(); q = P(); q.feed(t)
    if 'noindex' not in (q.meta.get('robots') or ''): echecs.append(f'{u}: noindex absent')
    if q.h1 != 1: echecs.append(f'{u}: {q.h1} h1')
    for href in q.hrefs:
        if href.startswith(('mailto:', 'tel:', '#!')) or urlparse(href).netloc not in ('', 'legantis.net'): continue
        c = urlparse(urljoin(u, href))
        if not os.path.exists(fichier(BASE + c.path.lstrip('/'))): echecs.append(f'{u}: {href} -> fichier absent')
        if c.fragment and urljoin(u, href).split('#')[0].split('?')[0] == u and c.fragment not in q.ids: echecs.append(f'{u}: {href} -> ancre absente')
    if '/demos/' in rel:
        if 'entreprise et données fictives' not in t: echecs.append(f'{u}: mention « données fictives » absente du bandeau')
        if re.search(r'<form[^>]*\baction=', t): echecs.append(f'{u}: une démonstration ne doit rien envoyer (action trouvée)')
        if re.search(r'href="(mailto|tel):', t): echecs.append(f'{u}: une démonstration ne doit proposer aucun contact réel fictif')
# CSP en <meta> : GitHub Pages ne permet pas d'en-têtes ; aucun script en ligne exécutable, sinon script-src 'self' le bloquerait.
for f in (os.path.join(d, n) for d, _, fs in os.walk(RACINE) for n in fs if n.endswith('.html')):
    t = open(f, encoding='utf-8').read(); rel = os.path.relpath(f, RACINE)
    if "Content-Security-Policy" not in t or "script-src 'self'" not in t: echecs.append(f'{rel}: politique de sécurité absente')
    if re.search(r'<script(?![^>]*\bsrc=)(?![^>]*\btype="application/(?:ld\+)?json")[^>]*>', t): echecs.append(f'{rel}: script en ligne, bloqué par la politique de sécurité')
# Hiérarchie des titres : aucun niveau sauté, démonstrations comprises.
for f in (os.path.join(d, n) for d, _, fs in os.walk(RACINE) for n in fs if n == 'index.html'):
    niveaux = [int(x) for x in re.findall(r'<h([1-6])\b', open(f, encoding='utf-8').read())]
    for a_, b_ in zip(niveaux, niveaux[1:]):
        if b_ > a_ + 1: echecs.append(f'{os.path.relpath(f, RACINE)}: titre h{b_} juste après h{a_}'); break
# Numéro de section : affiché une seule fois (plus de chiffre fantôme) et séparé du libellé pour les lecteurs d'écran.
for f in (os.path.join(d, n) for d, _, fs in os.walk(RACINE) for n in fs if n == 'index.html'):
    t = open(f, encoding='utf-8').read(); rel = os.path.relpath(f, RACINE)
    if 'numero-fantome' in t: echecs.append(f'{rel}: numéro de section affiché deux fois')
    if re.search(r'<span class="no">\d\d</span>\S', t): echecs.append(f'{rel}: numéro de section collé à son libellé')
# Atlasya : pas de lien vers le site web tant que sa recherche ne propose aucun praticien (02/11/2026) ; la politique de confidentialité reste liée.
for f in (os.path.join(d, n) for d, _, fs in os.walk(RACINE) for n in fs if n == 'index.html'):
    for h in re.findall(r'<a[^>]*href="(https://atlasyahealth\.com[^"]*)"', open(f, encoding='utf-8').read()):
        if not h.endswith('/confidentialite'): echecs.append(f'{os.path.relpath(f, RACINE)}: lien vers {h}')
# Démonstrations : sur écran tactile, un survol « collé » après un toucher masquait l'état choisi (jour du restaurant sur iOS) ;
#   toute règle :hover vit dans @media (hover: hover). Et iOS ne doit pas transformer les faux numéros en liens d'appel.
for f in (os.path.join(d, n) for d, _, fs in os.walk(os.path.join(RACINE, 'realisations', 'demos')) for n in fs):
    rel = os.path.relpath(f, RACINE)
    if f.endswith('.css'):
        css = re.sub(r'/\*.*?\*/', '', open(f, encoding='utf-8').read(), flags=re.S); prof = 0; tete = ''
        for c in css:
            if c == '{':
                if prof == 0 and ':hover' in tete and not tete.strip().startswith('@'): echecs.append(f'{rel}: :hover hors de @media (hover: hover) : {tete.strip()[:60]}')
                if prof == 0 and tete.strip().startswith('@media') and 'hover' in tete: prof += 100
                prof += 1; tete = ''
            elif c == '}': prof = 0 if prof in (1, 101) else prof - 1; tete = ''
            elif prof == 0: tete += c
    elif f.endswith('.html') and 'format-detection' not in open(f, encoding='utf-8').read(): echecs.append(f'{rel}: numéros fictifs transformés en liens par iOS (format-detection absent)')
# Rihla : « hors ligne » sans réserve est faux (le jeu en ligne du web envoie des scores à un serveur).
for f in (os.path.join(d, n) for d, _, fs in os.walk(RACINE) for n in fs if n == 'index.html'):
    if '/demos/' in f: continue
    t = open(f, encoding='utf-8').read()
    if re.search(r'Rihla[^<\n]{0,120}(gratuite et hors|free and offline|sans compte, hors ligne,|works offline, with)', t) or re.search(r'gratuite et hors(\s|&nbsp;)ligne|free and offline', t):
        echecs.append(f'{os.path.relpath(f, RACINE)}: Rihla « hors ligne » sans la réserve « sur l\'iPhone »')
# Distribution OS (01/11/2026) : démonstration interactive, données fictives, rien ne quitte le navigateur. Ses scripts ne contiennent aucun moyen d'envoi
#   (fetch, XMLHttpRequest, sendBeacon, WebSocket, formulaire, image ou script tiers), ne touchent qu'au sessionStorage (jamais localStorage ni cookie),
#   le bandeau porte la mention complète, et /commandes/ y renvoie (vitrine #demonstration, bouton principal) avec un retour vers son formulaire.
DOS = os.path.join(RACINE, 'realisations', 'demos', 'distribution-os')
if os.path.isdir(DOS):
    u = 'realisations/demos/distribution-os/'
    for nom in sorted(os.listdir(DOS)):
        if not nom.endswith('.js'): continue
        src = open(os.path.join(DOS, nom), encoding='utf-8').read()
        for motif, quoi in ((r'\bfetch\s*\(', 'fetch'), (r'XMLHttpRequest', 'XMLHttpRequest'), (r'sendBeacon', 'sendBeacon'), (r'WebSocket|EventSource', 'WebSocket'), (r'\blocalStorage\b', 'localStorage'), (r'document\.cookie', 'cookie'), (r'\.submit\s*\(', 'envoi de formulaire'), (r'https?://(?!www\.w3\.org/2000/svg)', 'adresse externe'), (r'\bimport\s*\(|createElement\(\s*[\'"]script', 'chargement de code')):
            if re.search(motif, src): echecs.append(f'{u}{nom}: {quoi} dans une démonstration qui ne doit rien transmettre')
    h = open(os.path.join(DOS, 'index.html'), encoding='utf-8').read()
    if 'Démonstration interactive créée par Legantis.</b> Entreprises, opérations et données fictives.' not in h: echecs.append(f'{u}: bandeau « Démonstration interactive créée par Legantis. Entreprises, opérations et données fictives. » absent')
    if re.search(r'<(script|link|img)[^>]+(src|href)="https?://', h): echecs.append(f'{u}: ressource externe chargée')
    app = open(os.path.join(DOS, 'app.js'), encoding='utf-8').read() if os.path.exists(os.path.join(DOS, 'app.js')) else ''
    if "'../../../commandes/'" not in app or "'#demande'" not in app or 'utm_source' not in app: echecs.append(f'{u}: le retour vers le formulaire de /commandes/ (avec la campagne) a disparu')
    if os.path.exists(ACQ):
        c = open(ACQ, encoding='utf-8').read()
        if not re.search(r'<section class="section vitrine" id="demonstration"', c) or not re.search(r'<a class="bouton bouton--plein" href="\.\./realisations/demos/distribution-os/">Essayer la démonstration interactive', c) or '<a class="bouton" href="#demande">Demander mon diagnostic gratuit</a>' not in c:
            echecs.append('/commandes/: vitrine de la démonstration (bouton principal, diagnostic) absente')
        for img in re.findall(r'<img [^>]*dos-[a-z-]+\.webp[^>]*>', c):
            if not re.search(r'\bwidth="\d+" height="\d+"', img) or 'loading="lazy"' not in img or not re.search(r'alt="[^"]{20,}"', img): echecs.append(f'/commandes/: capture {img[:70]}… sans dimensions, sans chargement paresseux ou sans texte alternatif')
            src = re.search(r'src="\.\./([^"]+)"', img).group(1)
            if not os.path.exists(os.path.join(RACINE, src)): echecs.append(f'/commandes/: {src} absente')
    cv = open(os.path.join(RACINE, 'assets', 'conversion.js'), encoding='utf-8').read()
    if 'a[href*="demos/"]' not in cv: echecs.append('conversion.js : la campagne n\'est plus transmise aux liens vers les démonstrations')
    # Maison Tilal, Mizan Technique, Institut Naïa : chaque page charge source.js, qui rend la campagne aux liens (test : outils/test_utm_demos.mjs)
    for nom_demo in ('restaurant', 'services', 'reservation'):   # Distribution OS : sa source passe par app.js (lienLegantis)
        for dossier, _, fichiers in os.walk(os.path.join(RACINE, 'realisations', 'demos', nom_demo)):
            if 'index.html' not in fichiers: continue
            page = os.path.join(dossier, 'index.html')
            if '/realisations/demos/source.js' not in open(page, encoding='utf-8').read():
                echecs.append(f'{os.path.relpath(page, RACINE)} : source.js absent, la campagne serait perdue dans la démonstration')
# réalisations : chaque carte dit sa nature ; aucune démonstration sans étiquette ; aucun témoignage ni client
rea = BASE + 'realisations/'
if rea in pages:
    t = open(fichier(rea), encoding='utf-8').read()
    for bloc in re.findall(r'<li class="projet[^"]*" data-nature="(\w+)".*?</li>', t, re.S):
        pass
    cartes = re.findall(r'<li class="projet[^>]*data-nature="(\w+)"[^>]*>(.*?)</li>\s*(?=<li class="projet|</ul>)', t, re.S)
    if len(cartes) < 7: echecs.append(f'{rea}: {len(cartes)} cartes de projet')
    for nature, corps in cartes:
        attendu = {'interne': 'Produit interne Legantis', 'demo': 'Démonstration interactive'}.get(nature)
        if not attendu or attendu not in corps: echecs.append(f'{rea}: carte de nature {nature} sans son étiquette')
# parcours : mêmes contrôles que le formulaire de l'accueil, plus le consentement et le retour prévu par le Worker
WS = open(WORKER_SRC, encoding='utf-8').read() if os.path.exists(WORKER_SRC) else ''
for rel, parcours in (('estimer-mon-projet/', 'simulateur'), ('audit-gratuit/', 'audit'), ('offre-lancement/', 'offre')):
    u = BASE + rel
    if not os.path.exists(fichier(u)): echecs.append(f'{u}: page absente'); continue
    t = open(fichier(u), encoding='utf-8').read()
    m = re.search(r'<form class="devis-form(?! rappel-form)[^"]*"([^>]*)>(.*?)</form>', t, re.S)
    if not m: echecs.append(f'{u}: formulaire absent'); continue
    ouv, corps = m.group(1), m.group(2)
    action = (re.search(r'action="([^"]*)"', ouv) or [None, ''])[1]
    if 'method="post"' not in ouv or not re.fullmatch(r'https://[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev/', action): echecs.append(f'{u}: méthode ou adresse du formulaire ({action!r})')
    noms = set(re.findall(r'<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"', corps))
    if champs_worker is not None and not noms <= champs_worker: echecs.append(f'{u}: champs non lus par le Worker : {sorted(noms - champs_worker)}')
    if f'<input type="hidden" name="parcours" value="{parcours}">' not in corps: echecs.append(f'{u}: parcours={parcours} absent')
    if f"{parcours}: '/{rel}'" not in WS: echecs.append(f'{u}: chemin de retour absent du Worker')
    if 'name="consentement"' not in corps or 'required' not in re.search(r'<input[^>]*name="consentement"[^>]*>', corps).group(0): echecs.append(f'{u}: case de consentement absente ou facultative')
    if 'name="site_web" tabindex="-1"' not in corps: echecs.append(f'{u}: champ piège absent')
    for ident in ('devis-envoye', 'devis-echec'):
        if f'id="{ident}"' not in t: echecs.append(f'{u}: message #{ident} absent')
    for ident in re.findall(r'<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"', corps):
        if f'<label for="{ident}">' not in corps: echecs.append(f'{u}: champ #{ident} sans <label for>')
# pages d'arrivée des publicités (10/11/2026) : un lien d'appel vers le numéro de la société ; la page d'offre montre les produits publiés (études de cas)
for rel in ('offre-lancement/', 'commandes/'):
    t = open(fichier(BASE + rel), encoding='utf-8').read() if os.path.exists(fichier(BASE + rel)) else ''
    if 'href="tel:+212672759097"' not in t: echecs.append(f'{BASE + rel}: lien d\'appel vers +212 6 72 75 90 97 absent')
    if rel == 'offre-lancement/':
        for cas in ('etude-de-cas-atlasya', 'etude-de-cas-ostad', 'etude-de-cas-rihla'):
            if f'href="../{cas}/"' not in t: echecs.append(f'{BASE + rel}: lien vers l\'étude de cas {cas} absent (produits publiés)')
# le simulateur affiche le texte convenu tant que la grille n'est pas validée
est = fichier(BASE + 'estimer-mon-projet/')
if os.path.exists(est) and 'Votre projet nécessite une estimation personnalisée. Recevez un devis gratuit adapté à vos besoins.' not in open(est, encoding='utf-8').read(): echecs.append('simulateur : message d\'estimation personnalisée absent')
# aucun tarif non validé dans ce qui est publié : tant que config/commercial.json ne porte aucun pack validé, aucun montant de vente ; seuls sont admis le capital, les tranches
# de budget du visiteur et, dans les démonstrations, les prix fictifs. Aucune adresse wa.me non plus tant qu'aucun numéro n'est configuré.
CONFIG = os.path.join(RACINE, '..', 'config', 'commercial.json')
if os.path.exists(CONFIG):
    conf = json.load(open(CONFIG, encoding='utf-8'))
    montants_valides = {f"{p['prix_mad']:,}".replace(',', ' ') for p in conf.get('packs') or []}
    for f_ in [v for k, v in (conf.get('fourchettes') or {}).items() if not k.startswith('_')]:   # fourchettes indicatives des trois offres : admises seulement validées
        if f_.get('valide') is True: montants_valides |= {f"{f_[k]:,}".replace(',', ' ') for k in ('a_partir_de', 'jusqu_a') if isinstance(f_.get(k), int)}
    ADMIS = {'10 000', '5 000', '15 000', '50 000', '25 000', '100 000'}   # capital ; tranches de budget du visiteur (simulateur, /commandes/)
    for dossier, _, fichiers in os.walk(RACINE):
        for nom in fichiers:
            if not nom.endswith(('.html', '.js', '.css', '.json', '.xml', '.txt')): continue
            chemin = os.path.join(dossier, nom); relatif = os.path.relpath(chemin, RACINE)
            t = open(chemin, encoding='utf-8').read().replace('&nbsp;', ' ').replace('\u00a0', ' ')
            if not (conf.get('whatsapp') or {}).get('numero') and 'wa.me/' in t: echecs.append(f'{relatif}: lien WhatsApp alors qu\'aucun numéro n\'est configuré')
            if relatif.startswith(os.path.join('realisations', 'demos')): continue
            for m in re.findall(r'(\d[\d ]*\d|\d)\s*(?:MAD|DH|dirhams)\b', t):
                if m.strip() not in ADMIS | montants_valides: echecs.append(f'{relatif}: montant « {m} MAD » non validé dans config/commercial.json')
            if not conf.get('packs') and re.search(r'\b(pack starter|pack business|prix_mad)\b', re.sub(r'<script type="application/ld\+json">.*?</script>', '', t, flags=re.S), re.I) and not relatif.endswith('conversion.js'): echecs.append(f'{relatif}: offre non validée publiée')
# identité légale (loi n° 5-96, art. 43-12 et 43-14) : le capital figure une fois par accueil et par page de commande, dans .pied-legal avec la dénomination, la forme, le siège et le RC,
# et une fois par page légale avec tous les identifiants ; il n'apparaît nulle part ailleurs. Toute page qui affiche l'adresse dit la domiciliation, tout RC dit son lieu.
def visible(h): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)\b.*?</\1>|<!--.*?-->', '', h, flags=re.S))).replace('&nbsp;', ' ').replace('\u00a0', ' ')
MONTANT_CAPITAL = re.compile(r'\b10 000 MAD\b|\bMAD 10,000\b|\bcapital 10 000\b', re.I)
LIGNE_LEGALE = {BASE: ('LEGANTIS DIGITAL SERVICE SAS', 'société par actions simplifiée à associé unique', '10 000 MAD', 'Oasis Offices Latitudes, Route de l\'Oasis, Bureau 304, Maarif, Casablanca', 'MyLegal Offices', 'RC Casablanca n° 745587', '004026900000030', '73343482'),
                BASE + 'commandes/': ('LEGANTIS DIGITAL SERVICE SAS', 'société par actions simplifiée à associé unique', '10 000 MAD', 'Oasis Offices Latitudes, Route de l\'Oasis, Bureau 304, Maarif, Casablanca', 'MyLegal Offices', 'RC Casablanca n° 745587', '004026900000030', '73343482'),
                BASE + 'offre-lancement/': ('LEGANTIS DIGITAL SERVICE SAS', 'société par actions simplifiée à associé unique', '10 000 MAD', 'Oasis Offices Latitudes, Route de l\'Oasis, Bureau 304, Maarif, Casablanca', 'MyLegal Offices', 'RC Casablanca n° 745587', '004026900000030', '73343482'),
                BASE + 'en/': ('LEGANTIS DIGITAL SERVICE SAS', 'simplified joint-stock company with a single shareholder', 'MAD 10,000', 'Oasis Offices Latitudes, Route de l\'Oasis, Bureau 304, Maarif, Casablanca', 'MyLegal Offices', 'Casablanca Commercial Register No. 745587', '004026900000030', '73343482')}
PAGES_LEGALES = {BASE + 'mentions-legales/': ('LEGANTIS DIGITAL SERVICE SAS', '10 000 MAD', 'Oasis Offices Latitudes', 'MyLegal Offices', 'Casablanca n° 745587', '07/09/2026', 'titre III bis de la loi n° 5-96', '004026900000030', '73343482', '34706792', 'Yassir Legmara'),
                 BASE + 'en/legal/': ('LEGANTIS DIGITAL SERVICE SAS', 'MAD 10,000', 'Oasis Offices Latitudes', 'MyLegal Offices', 'Casablanca No. 745587', '7 September 2026', 'Title III bis of Moroccan Law No. 5-96', '004026900000030', '73343482', '34706792', 'Yassir Legmara')}
for u in [*pages, BASE + 'offre-lancement/']:
    h = open(fichier(u), encoding='utf-8').read(); t = visible(h); nb = len(MONTANT_CAPITAL.findall(t))
    attendu = 1 if u in LIGNE_LEGALE or u in PAGES_LEGALES else 0
    if nb != attendu: echecs.append(f'{u}: capital social affiché {nb} fois, {attendu} attendue(s)')
    if 'Oasis Offices Latitudes' in t and 'MyLegal Offices' not in t: echecs.append(f'{u}: adresse sans mention de domiciliation')
    if 'RC 745587' in t: echecs.append(f'{u}: RC sans son lieu d\'immatriculation')
    if u in LIGNE_LEGALE:
        ligne = re.search(r'<p class="pied-legal">(.*?)</p>', h, re.S)
        for mot in LIGNE_LEGALE[u]:
            if not ligne or mot not in visible(ligne.group(1)): echecs.append(f'{u}: ligne légale sans « {mot} »')
    for mot in PAGES_LEGALES.get(u, ()):
        if mot not in t: echecs.append(f'{u}: page légale sans « {mot} »')
# aucun client signé : aucune formulation ne doit laisser croire le contraire, en français comme en anglais
SUGGERE_CLIENTS = ('à nos clients', 'pour ses clients', 'nos clients', 'remis au client', 'clients concernés', 'our clients', 'its clients', 'to the client')
for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
    texte_page = open(chemin, encoding='utf-8').read()
    for mot in SUGGERE_CLIENTS:
        if mot in texte_page: echecs.append(f'{os.path.relpath(chemin, RACINE)}: formulation qui suggère des clients : « {mot} »')
# Titres en préparation : jamais nommés sur le site (choix du propriétaire du 24/09/2026 ; Joutia n'est pas ouvert au public). Ils se décrivent par type.
for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
    if re.search(r'joutia', open(chemin, encoding='utf-8').read(), re.I): echecs.append(f'{os.path.relpath(chemin, RACINE)}: titre en préparation nommé (Joutia)')
# Produits édités par Legantis : jamais « conçus par Legantis » (premiers commits d'Ostad et de Rihla antérieurs à l'immatriculation du 07/09/2026), jamais « publiés » en bloc (Ostad n'est ni sur l'App Store ni ouvert au public), jamais « au stade du lancement » pour Ostad.
# Démonstrations : chaque page porte la mention « fictif » (hors redirection). Ostad : l'état réel reste dit, et aucun nom ni chiffre de démonstration n'est présenté comme réel.
for chemin in glob.glob(os.path.join(RACINE, 'realisations', 'demos', '**', 'index.html'), recursive=True):
    t_demo = open(chemin, encoding='utf-8').read()
    if 'http-equiv="refresh"' not in t_demo and not re.search(r'fictif|fictive|invent[ée]', t_demo, re.I): echecs.append(f'{os.path.relpath(chemin, RACINE)}: démonstration sans mention « fictif »')
for rel_, etat_, note_ in (('etude-de-cas-ostad/', "pas encore ouvert au grand public", 'fictifs'), ('en/case-study-ostad/', "not yet open to the general public", 'fictitious')):
    if BASE + rel_ not in pages: continue
    t_ostad = open(fichier(BASE + rel_), encoding='utf-8').read()
    if etat_ not in t_ostad: echecs.append(f'{rel_}: état réel d\'Ostad (« {etat_} ») absent')
    if note_ not in t_ostad: echecs.append(f'{rel_}: mention « {note_} » sous la galerie absente')
for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
    if os.sep + 'demos' + os.sep in chemin: continue
    t_nom = open(chemin, encoding='utf-8').read()
    for motif in ('Al Khawarizmi', 'Nadia El Amrani', 'Yassine Bennani', '35 élèves', '180 MAD'):
        if motif in t_nom: echecs.append(f'{os.path.relpath(chemin, RACINE)}: donnée de démonstration présentée hors démonstration : « {motif} »')
# Référencement de l'accueil FR : « création de sites web » (Casablanca, Maroc) reste dans le titre et la description, sans bourrage (au plus 20 occurrences de « site(s) web » dans le texte visible).
if BASE in pages:
    accueil = open(fichier(BASE), encoding='utf-8').read()
    titre_accueil = (re.search(r'<title>(.*?)</title>', accueil, re.S) or [None, ''])[1]
    desc_accueil = (re.search(r'<meta name="description" content="(.*?)"', accueil, re.S) or [None, ''])[1]
    if not (titre_accueil.startswith('Création de sites web') and 'Casablanca' in titre_accueil): echecs.append(f'{BASE}: titre « {titre_accueil} » : « Création de sites web » en tête et « Casablanca » attendus')
    if not ('Création de sites web' in desc_accueil and 'Maroc' in desc_accueil): echecs.append(f'{BASE}: description sans « Création de sites web » ou sans « Maroc »')
    if len(re.findall(r'sites? web', re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)\b.*?</\1>', '', accueil, flags=re.S)), re.I)) > 20: echecs.append(f'{BASE}: « site(s) web » plus de 20 fois dans le texte visible (sur-optimisation)')
FORMULATIONS_PRODUITS = (r'con[çc]us?,? d[ée]velopp[ée]s? et maintenus? par Legantis', r'designed, built and maintained by Legantis', r'Des produits publi[ée]s', r'Published products', r'Ostad est au stade du lancement', r'Ostad is at launch stage')
for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
    texte_page = open(chemin, encoding='utf-8').read()
    for motif in FORMULATIONS_PRODUITS:
        if re.search(motif, texte_page): echecs.append(f'{os.path.relpath(chemin, RACINE)}: formulation sur les produits à ne pas employer : « {motif} »')
# Ce qu'une page dit de ses propres scripts doit rester vrai (03/11/2026 : « aucun script » sur l'accueil d'Institut Naïa après l'ajout de
# source.js ; « un seul petit script » sur la création de site après l'ajout de conversion.js).
for dossier, _, fichiers in os.walk(RACINE):
    for nom_fichier in fichiers:
        if not nom_fichier.endswith('.html'): continue
        chemin = os.path.join(dossier, nom_fichier); texte_page = open(chemin, encoding='utf-8').read()
        n_scripts = len(re.findall(r'<script\b[^>]*\bsrc=', texte_page))
        if re.search(r"n[’']utilise aucun script", texte_page) and n_scripts: echecs.append(f'{os.path.relpath(chemin, RACINE)}: dit n\'utiliser aucun script, en charge {n_scripts}')
        if re.search(r'un seul (petit )?script', texte_page) and n_scripts != 1: echecs.append(f'{os.path.relpath(chemin, RACINE)}: dit avoir un seul script, en charge {n_scripts}')
# Titre d'appel final : une espace entre ses deux lignes, sinon le texte brut colle deux mots (« Parlons devotre projet »).
for dossier, _, fichiers in os.walk(RACINE):
    for nom_fichier in fichiers:
        if nom_fichier.endswith('.html') and re.search(r'<h2 id="contact-titre"[^>]*><span>[^<]*</span><span', open(os.path.join(dossier, nom_fichier), encoding='utf-8').read()):
            echecs.append(f'{os.path.relpath(os.path.join(dossier, nom_fichier), RACINE)}: titre d\'appel final sans espace entre ses deux lignes')
# ── Offres de lancement (pilote, 04/11/2026) ─────────────────────────────────────────────────────────────────────────────────────────────
# Prix = config/commercial.json (cartes et formulaire), mention HT, aucune fausse urgence, modèles de design présentés comme fictifs, page hors navigation
# tant que le propriétaire n'a pas décidé de la relier. Éprouvé par outils/test_commercial.py (sabotages « offres de lancement »).
OFFRE = BASE + 'offre-lancement/'
if os.path.exists(CONFIG) and os.path.exists(fichier(OFFRE)):
    conf = json.load(open(CONFIG, encoding='utf-8'))
    packs = conf.get('packs') or []
    h = open(fichier(OFFRE), encoding='utf-8').read(); tv = visible(h)
    # 1. chaque carte affiche le prix et le régime de la configuration, dans l'ordre ; rien d'autre ne ressemble à une carte de prix
    cartes = re.findall(r'<article class="pack[^"]*" id="offre-([a-z-]+)".*?<p class="pack-prix"><b>([^<]*)</b> <span>MAD ([A-Z]+)</span></p>', h, re.S)
    attendu = [(p_['id'], f"{p_['prix_mad']:,}".replace(',', '&nbsp;'), p_['regime']) for p_ in packs]
    if packs and cartes != attendu: echecs.append(f'{OFFRE}: cartes de prix {cartes} différentes de config/commercial.json {attendu}')
    n_prix = h.count('class="pack-prix"')
    if n_prix != len(packs): echecs.append(f'{OFFRE}: {n_prix} prix affichés pour {len(packs)} packs configurés')
    # 2. formulaire : exactement les formules configurées, et le Worker les connaît toutes
    choix = re.search(r'<select id="demande-pack" name="pack">(.*?)</select>', h, re.S)
    options = re.findall(r'<option value="([^"]*)">([^<]*)</option>', choix.group(1)) if choix else []
    if packs and options != [('', 'Je ne sais pas encore')] + [(p_['id'], p_['nom']) for p_ in packs]: echecs.append(f'{OFFRE}: offres du formulaire {options} différentes de config/commercial.json')
    packs_worker = re.search(r'const PACKS = \{([^}]*)\}', WS)
    for p_ in packs:
        if not packs_worker or not re.search(rf"\b{re.escape(p_['id'])}: '", packs_worker.group(1)): echecs.append(f'{OFFRE}: formule « {p_["id"]} » inconnue du Worker (PACKS) : elle serait perdue dans le mail')
    # 3. régime affiché : HT écrit en clair ; un TTC éventuel est indicatif et sous réserve du régime de TVA
    if packs and 'hors taxes' not in tv.lower(): echecs.append(f'{OFFRE}: « hors taxes » absent de la page')
    for m in re.finditer(r'\d[\d ]*\s*(?:MAD\s*|DH\s*)?TTC|TTC\W{0,3}\d', tv):   # un montant TTC (la question « HT ou TTC ? » n'en est pas un)
        autour = tv[max(0, m.start() - 160): m.end() + 160].lower()
        if 'indicatif' not in autour or 'régime de tva' not in autour: echecs.append(f'{OFFRE}: TTC affiché sans « indicatif » ni « sous réserve du régime de TVA »'); break
    # 4. aucune fausse urgence : ni minuterie ni compte à rebours, ni rareté inventée ; la limite des cinq contrats est expliquée par la capacité
    if re.search(r'<time\b|\b(?:class|id|data-[a-z-]+)="[^"]*(?:rebours|countdown|minuterie|timer|chrono|expire)', h, re.I): echecs.append(f'{OFFRE}: élément de compte à rebours ou de minuterie')
    if re.search(r'setInterval|setTimeout|requestAnimationFrame', h): echecs.append(f'{OFFRE}: script en ligne de minuterie')
    URGENCE = r"plus que \d|il ne reste|derni[eè]res? places?|places? limit[ée]es|d[ée]p[êe]chez|offre expire|expire le|jusqu'au \d|aujourd'hui seulement|avant qu'il ne soit trop tard|\d+ ?(?:h|heures?|jours?) restant"
    u_ = re.search(URGENCE, tv, re.I)
    if u_: echecs.append(f'{OFFRE}: formule d\'urgence « {u_.group(0)} »')
    for mot in ('cinq premiers contrats', 'plus de deux projets', 'compte à rebours', 'temps réellement passé'):
        if mot not in tv.lower(): echecs.append(f'{OFFRE}: explication de la limite des cinq contrats incomplète (« {mot} » absent)')
    # 5. exemples de design : chaque capture est signalée comme fictive à côté de l'image
    for li in re.findall(r'<li class="projet modele">(.*?)</li>', h, re.S):
        if 'Modèle fictif' not in li or 'fictives' not in li: echecs.append(f'{OFFRE}: capture de modèle sans mention fictive à côté'); break
    if '<li class="projet modele">' not in h: echecs.append(f'{OFFRE}: exemples de design (modèles fictifs) absents')
    # 6. Pack Commandes : sur devis après diagnostic, lien vers /commandes/, aucun montant dans son encart
    encart = re.search(r'<article class="offre-surdevis" aria-labelledby="commandes-titre">.*?</article>', h, re.S)
    if not encart or 'href="../commandes/"' not in encart.group(0) or 'diagnostic gratuit' not in encart.group(0) or re.search(r'\d\s*(?:MAD|DH)', visible(encart.group(0))): echecs.append(f'{OFFRE}: encart Pack Commandes absent, sans lien, sans diagnostic gratuit ou avec un montant')
    # 6 bis. « site plus complet » : sur devis, lien vers le simulateur, aucun montant dans son encart
    complet = re.search(r'<article class="offre-surdevis" aria-labelledby="complet-titre">.*?</article>', h, re.S)
    if not complet or 'href="../estimer-mon-projet/"' not in complet.group(0) or 'devis' not in complet.group(0) or re.search(r'\d\s*(?:MAD|DH)', visible(complet.group(0))): echecs.append(f'{OFFRE}: encart « un site plus complet » absent, sans lien vers le simulateur, sans devis ou avec un montant')
    # 6 ter. le prix d'appel ne vaut que pour son périmètre : exclusions écrites sur la carte et liste « devis si » sur la page
    for pack_ in packs:
        carte_ = re.search(rf'<article class="pack[^"]*" id="offre-{re.escape(pack_["id"])}".*?</article>', h, re.S)
        texte_ = visible(carte_.group(0)).lower() if carte_ else ''
        manque_ = [m_ for m_ in ('boutique en ligne', 'espace utilisateur', 'réservation', 'sur mesure', 'seconde langue') if m_ not in texte_ and not (m_ == 'seconde langue' and 'seconde langue' in texte_)]
        if manque_ or 'il vous faut un devis si' not in visible(h).lower(): echecs.append(f"{OFFRE}: exclusions du prix d'appel incomplètes (manque : {manque_ or 'liste « il vous faut un devis si »'})")
    # 7. pilote : packs et montants des packs seulement sur les pages de packs_pages ; aucune page du sitemap ne relie la page d'offre
    autorisees = conf.get('packs_pages')
    montants_packs = {f"{p_['prix_mad']:,}".replace(',', ' ') for p_ in packs}
    if autorisees is not None:
        for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
            rel = os.path.relpath(os.path.dirname(chemin), RACINE).replace(os.sep, '/') + '/'
            if rel in autorisees or rel.startswith('realisations/demos/'): continue
            t_ = open(chemin, encoding='utf-8').read()
            vis = visible(t_)
            mise_ = (rel if rel != './' else '') in (conf.get('mise_en_avant') or [])   # prix d'appel admis en texte seulement sur les pages listées par la configuration (candidat D11) ; jamais la carte de prix
            if 'class="pack-prix"' in t_ or (not mise_ and any(re.search(rf'\b{re.escape(m_)}\s*(?:MAD|DH)', vis) for m_ in montants_packs)): echecs.append(f'{os.path.relpath(chemin, RACINE)}: prix d\'un pack hors des pages autorisées (packs_pages)')
    for u_ in pages:
        lien_ = open(fichier(u_), encoding='utf-8').read()
        if conf.get('mise_en_avant') is not None:   # le propriétaire a décidé de relier l'offre (candidat D11a) : liens de contenu admis sur les pages listées seulement
            if u_[len(BASE):] in conf['mise_en_avant']: continue
            lien_ = re.sub(r'<li><a href="[^"]*offre-lancement/">Offre Visibilité</a></li>', '', lien_)   # l'entrée commune du menu et du pied reste admise partout
        if re.search(r'href="[^"]*offre-lancement/?[#"?]', lien_): echecs.append(f'{u_}: lien vers /offre-lancement/ (page pilote non reliée tant que le propriétaire n\'a pas décidé)')
# aucun identifiant en double dans une page (deux formulaires sur la même page : messages et libellés distincts, sinon #ancre et <label for> visent le mauvais élément)
import collections
for chemin in glob.glob(os.path.join(RACINE, '**', '*.html'), recursive=True):
    sans_script = re.sub(r'<script\b.*?</script>|<!--.*?-->', '', open(chemin, encoding='utf-8').read(), flags=re.S)
    doubles = [k for k, v in collections.Counter(re.findall(r'<[a-zA-Z][^>]*?\sid="([^"]+)"', sans_script)).items() if v > 1]
    if doubles: echecs.append(f'{os.path.relpath(chemin, RACINE)}: identifiants en double {doubles}')
IMAGES = os.path.join(RACINE, '..', 'outils', 'images.py')
if os.path.exists(IMAGES) and 'CAPITAL' in open(IMAGES, encoding='utf-8').read(): echecs.append('outils/images.py : capital sur l\'image de partage')
import subprocess
if os.path.exists(os.path.join(RACINE, '..', 'outils', 'commercial.py')) and os.path.abspath(RACINE) == os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')):
    r = subprocess.run([sys.executable, os.path.join(RACINE, '..', 'outils', 'commercial.py'), '--verifier'], capture_output=True, text=True)
    if r.returncode != 0: echecs.append('site/ décalé par rapport à config/commercial.json : ' + (r.stdout + r.stderr).strip()[:200])
print(len(pages), 'pages du sitemap,', n, 'liens internes contrôlés')
print('ÉCHECS:' if echecs else 'tout passe', *echecs, sep='\n  ')
sys.exit(1 if echecs else 0)
