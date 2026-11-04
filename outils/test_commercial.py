"""Teste outils/commercial.py et le garde-fou des prix, sur des copies du dépôt : aucun prix publié sans validation.
    python3 outils/test_commercial.py"""
import json, os, re, shutil, subprocess, sys, tempfile
ICI = os.path.dirname(os.path.abspath(__file__)); DEPOT = os.path.join(ICI, '..')
echecs = 0
def verifier(nom, c, detail=''):
    global echecs
    print(('✓ ' if c else '✗ ') + nom, '' if c else detail)
    echecs += 0 if c else 1
def copie():
    d = tempfile.mkdtemp(prefix='commercial-')
    for x in ('site', 'config', 'outils', 'worker/src'):
        shutil.copytree(os.path.join(DEPOT, x), os.path.join(d, x))
    return d
def lancer(d, *args, apercu=None):
    return subprocess.run([sys.executable, os.path.join(d, 'outils/commercial.py'), *args], capture_output=True, text=True, env={**os.environ, **({'LEGANTIS_APERCU': apercu} if apercu else {})})
def controles(d):
    return subprocess.run([sys.executable, os.path.join(d, 'outils/controles_site.py')], capture_output=True, text=True, cwd=d).stdout
def ecrire_config(d, modifier):
    p = os.path.join(d, 'config/commercial.json'); c = json.load(open(p, encoding='utf-8')); modifier(c); json.dump(c, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
PACK = {'id': 'starter', 'nom': 'Pack Starter', 'prix_mad': 1234, 'regime': 'HT', 'accroche': 'A', 'inclus': ['x'], 'exclus': ['y']}
offre = lambda d: open(os.path.join(d, 'site/offre-lancement/index.html'), encoding='utf-8').read()
instantane = lambda d: {os.path.join(r, f): open(os.path.join(r, f), encoding='utf-8').read() for r, _, fs in os.walk(os.path.join(d, 'site')) for f in fs if f.endswith('.html')}
hors_offre = lambda d: ''.join(open(os.path.join(r, f), encoding='utf-8').read() for r, _, fs in os.walk(os.path.join(d, 'site')) for f in fs if f.endswith('.html') and not r.endswith(('commandes', 'offre-lancement')))
tout = lambda d: ''.join(open(os.path.join(r, f), encoding='utf-8').read() for r, _, fs in os.walk(os.path.join(d, 'site')) for f in fs if f.endswith('.html') and not r.endswith('commandes'))   # /commandes/, en production, garde son lien wa.me écrit à la main

d = copie()
verifier('état de production : conforme à la configuration', lancer(d, '--verifier').returncode == 0)
verifier('état de production : packs sur la seule page d\'offre, aucun lien WhatsApp', 'pack-prix' not in hors_offre(d) and 'pack-prix' in offre(d) and 'wa.me/' not in tout(d))
verifier('état de production : la FAQ « Combien coûte un projet ? » de l\'accueil reste sans prix', 'Nous ne publions pas de prix unique' in open(os.path.join(d, 'site/index.html'), encoding='utf-8').read())
shutil.rmtree(d)

d = copie(); ecrire_config(d, lambda c: (c.update(packs=[{**PACK}]), c.pop('packs_pages', None))); avant = instantane(d)
r = lancer(d); verifier('pack sans "valide": true refusé, site/ inchangé', r.returncode != 0 and instantane(d) == avant, r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True, 'regime': 'à confirmer'}]))
r = lancer(d); verifier('régime non confirmé refusé', r.returncode != 0, r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True, 'exclus': []}]))
r = lancer(d); verifier('pack sans exclusions refusé', r.returncode != 0, r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True}]))
r = lancer(d); h = open(os.path.join(d, 'site/index.html'), encoding='utf-8').read()
verifier('pack validé, sans packs_pages : publié sur l\'accueil et la page d\'offre', r.returncode == 0 and '1&nbsp;234' in h and '1&nbsp;234' in open(os.path.join(d, 'site/offre-lancement/index.html'), encoding='utf-8').read(), r.stderr)
verifier('pack validé : le contrôle l\'accepte', 'montant' not in controles(d))
r2 = lancer(d); verifier('réécriture idempotente', r2.stdout.startswith('0 page'), r2.stdout)
ecrire_config(d, lambda c: c.update(packs_pages=['offre-lancement/']))
r = lancer(d); h = open(os.path.join(d, 'site/index.html'), encoding='utf-8').read()
verifier('packs_pages : le pack quitte l\'accueil (cartes et FAQ du coût) et reste sur la page d\'offre', r.returncode == 0 and 'pack-prix' not in h and 'Nous ne publions pas de prix unique' in h and '1&nbsp;234' in offre(d), r.stdout + r.stderr)
for nom_test, valeur in (('chemin remontant', ['../x/']), ('chaîne au lieu d\'une liste', 'offre-lancement/'), ('page inexistante', ['nulle-part/'])):
    ecrire_config(d, lambda c: c.update(packs_pages=valeur)); avant = instantane(d)
    r = lancer(d); verifier(f'packs_pages refusé : {nom_test}', r.returncode != 0 and instantane(d) == avant, r.stdout)
for nom_test, packs in (('identifiant avec majuscule ou espace', [{**PACK, 'valide': True, 'id': 'Site Pro'}]), ('identifiants en double', [{**PACK, 'valide': True}, {**PACK, 'valide': True}])):
    ecrire_config(d, lambda c: c.update(packs_pages=['offre-lancement/'], packs=packs))
    r = lancer(d); verifier(f'pack refusé : {nom_test}', r.returncode != 0, r.stdout)
riche = {**PACK, 'valide': True, 'badge': 'Conseillé <b>', 'fiche': [{'libelle': 'Pages', 'valeur': "jusqu'à 3"}], 'fournir': ['vos textes'], 'exclus': ['boutique & paiement']}
ecrire_config(d, lambda c: c.update(packs_pages=['offre-lancement/'], packs=[riche]))
r = lancer(d); o = offre(d)
verifier('fiche, contenus à fournir et badge publiés, échappés', r.returncode == 0 and '<dt>Pages</dt><dd>jusqu\'à 3</dd>' in o and 'À fournir par vous' in o and 'Conseillé &lt;b&gt;' in o and 'boutique &amp; paiement' in o, r.stdout + r.stderr)
verifier('exclus=visible : limites ouvertes, pas repliées', 'pack-exclus--visible' in o and '<details class="pack-exclus">' not in o)
verifier('formulaire : la formule configurée est proposée', '<option value="starter">Pack Starter</option>' in o)
shutil.rmtree(d)

d = copie(); ecrire_config(d, lambda c: c.update(whatsapp={'numero': '+212 6 72'}))
verifier('numéro WhatsApp mal formé refusé', lancer(d).returncode != 0)
ecrire_config(d, lambda c: c.update(whatsapp={'numero': '212600000000'}))
r = lancer(d); h = open(os.path.join(d, 'site/application-mobile-casablanca/index.html'), encoding='utf-8').read()
verifier('numéro configuré : message prérempli propre à la prestation', r.returncode == 0 and 'https://wa.me/212600000000?text=' in h and 'application%20mobile' in h)
verifier('numéro configuré : aucun indicateur « en ligne »', not re.search(r'en ligne maintenant|disponible maintenant|répond en', tout(d), re.I))
shutil.rmtree(d)

d = copie(); ecrire_config(d, lambda c: c.update(packs=[])); lancer(d)
p = os.path.join(d, 'site/index.html'); h = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<p>Pack à 7 777 MAD</p></main>', 1))
s = controles(d); verifier('contrôle : montant en clair détecté', '7 777' in s, s[-300:])
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<a href="https://wa.me/212600000000">x</a></main>', 1))
s = controles(d); verifier('contrôle : lien WhatsApp sans numéro configuré détecté', 'WhatsApp' in s, s[-300:])
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<p>Pack Starter</p></main>', 1))
s = controles(d); verifier('contrôle : offre non validée détectée', 'offre non validée' in s, s[-300:])
shutil.rmtree(d)

# Offres de lancement : chaque contrôle de la page doit échouer sur une copie volontairement cassée (le contrôle tourne sur l'état de production).
def casser(nom, modifier, attendu, cible='site/offre-lancement/index.html'):
    d = copie(); p = os.path.join(d, cible); h = open(p, encoding='utf-8').read(); h2 = modifier(h)
    if h2 == h: verifier(f'sabotage mal formé : {nom}', False, 'texte introuvable'); shutil.rmtree(d); return
    open(p, 'w', encoding='utf-8').write(h2); s_ = controles(d)
    verifier(f'offres de lancement, sabotage détecté : {nom}', attendu in s_, s_[-400:]); shutil.rmtree(d)
d0 = copie(); verifier('offres de lancement : la page de production passe', 'tout passe' in controles(d0), controles(d0)[-400:]); shutil.rmtree(d0)
casser('prix d\'une carte retouché à la main', lambda h: h.replace('<b>12&nbsp;900</b>', '<b>11&nbsp;900</b>'), 'cartes de prix')
casser('régime HT effacé d\'une carte', lambda h: h.replace('<span>MAD HT</span>', '<span>MAD</span>', 1), 'cartes de prix')
casser('« hors taxes » retiré de la page', lambda h: h.replace('Prix hors taxes (HT)', 'Prix').replace('<li>Prix hors taxes</li>', '').replace('Hors taxes. ', '').replace('le montant hors taxes', 'le montant'), '« hors taxes » absent')
casser('montant TTC sans réserve', lambda h: h.replace('Le prix définitif est celui', 'Soit 77 777 MAD TTC. Le prix définitif est celui'), 'TTC affiché sans')
casser('compte à rebours', lambda h: h.replace('<section class="section" id="offres"', '<p class="compte-a-rebours" data-fin="2026-11-30">J-7</p><section class="section" id="offres"'), 'compte à rebours ou de minuterie')
casser('date d\'échéance', lambda h: h.replace('<section class="section" id="offres"', '<p>Offre valable <time datetime="2026-11-30">jusqu\'à fin novembre</time></p><section class="section" id="offres"'), 'compte à rebours ou de minuterie')
casser('rareté inventée', lambda h: h.replace('Pas de date limite</b>', 'Il ne reste que 2 places</b>'), 'formule d\'urgence')
casser('capacité réelle retirée de l\'explication', lambda h: h.replace('plus de deux projets de site', 'plus de projets'), '« plus de deux projets » absent')
casser('formule retirée du formulaire', lambda h: h.replace('<option value="essentiel">Site Essentiel</option>', ''), 'offres du formulaire')
casser('formule inventée dans le formulaire', lambda h: h.replace('<option value="business">', '<option value="signature">Site Signature</option><option value="business">'), 'offres du formulaire')
casser('formule inconnue du Worker', lambda h: h.replace("essentiel: 'Site Essentiel', ", ''), 'inconnue du Worker', cible='worker/src/index.js')
casser('capture de modèle sans mention fictive', lambda h: h.replace('<span class="nature nature--demo">Modèle fictif</span><h3>Style «&nbsp;Bloc', '<h3>Style «&nbsp;Bloc'), 'sans mention fictive')
casser('prix affiché pour le Pack Commandes', lambda h: h.replace('Aucun prix n\'est affiché pour cette offre', 'Dès 99 999 MAD HT'), 'encart Pack Commandes')
casser('carte de prix recopiée sur l\'accueil', lambda h: h.replace('</main>', '<p class="pack-prix"><b>6&nbsp;490</b> <span>MAD HT</span></p></main>', 1), 'hors des pages autorisées', cible='site/index.html')
casser('montant d\'un pack écrit sur une page de prestation', lambda h: h.replace('</main>', '<p>Site dès 6 490 MAD HT</p></main>', 1), 'hors des pages autorisées', cible='site/creation-site-web-casablanca/index.html')
casser('page d\'offre reliée depuis l\'accueil', lambda h: h.replace('</main>', '<a href="offre-lancement/">Offres</a></main>', 1), 'lien vers /offre-lancement/', cible='site/index.html')
casser('page d\'offre rendue indexable', lambda h: h.replace('content="noindex, follow"', 'content="index, follow"'), 'noindex absent')

sortie = tempfile.mkdtemp(prefix='apercu-'); cible = os.path.join(sortie, 'site')
d = copie(); exemple = os.path.join(d, 'config/commercial.apercu.exemple.json')
avant = tout(d)
r = lancer(d, '--apercu', cible, apercu=exemple)
ap = open(os.path.join(cible, 'index.html'), encoding='utf-8').read()
verifier('aperçu : valeurs non validées visibles, signalées, en noindex', r.returncode == 0 and 'pack-prix' in ap and 'APERÇU LOCAL' in ap and 'noindex, nofollow' in ap, r.stderr)
verifier('aperçu : site/ intact', tout(d) == avant)
verifier('aperçu refusé dans site/', lancer(d, '--apercu', os.path.join(d, 'site/x'), apercu=exemple).returncode != 0)
shutil.rmtree(d); shutil.rmtree(sortie)

print('tout passe' if not echecs else f'{echecs} échec(s)')
sys.exit(1 if echecs else 0)
