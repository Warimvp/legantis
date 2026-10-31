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
tout = lambda d: ''.join(open(os.path.join(r, f), encoding='utf-8').read() for r, _, fs in os.walk(os.path.join(d, 'site')) for f in fs if f.endswith('.html') and not r.endswith('commandes'))   # /commandes/, en production, garde son lien wa.me écrit à la main

d = copie()
verifier('état de production : conforme à la configuration', lancer(d, '--verifier').returncode == 0)
verifier('état de production : aucun pack, aucun lien WhatsApp', 'pack-prix' not in tout(d) and 'wa.me/' not in tout(d))
shutil.rmtree(d)

d = copie(); ecrire_config(d, lambda c: c.update(packs=[{**PACK}]))
r = lancer(d); verifier('pack sans "valide": true refusé', r.returncode != 0 and 'pack-prix' not in tout(d), r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True, 'regime': 'à confirmer'}]))
r = lancer(d); verifier('régime non confirmé refusé', r.returncode != 0, r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True, 'exclus': []}]))
r = lancer(d); verifier('pack sans exclusions refusé', r.returncode != 0, r.stdout)
ecrire_config(d, lambda c: c.update(packs=[{**PACK, 'valide': True}]))
r = lancer(d); h = open(os.path.join(d, 'site/index.html'), encoding='utf-8').read()
verifier('pack validé : publié sur l\'accueil et la page d\'offre', r.returncode == 0 and '1&nbsp;234' in h and '1&nbsp;234' in open(os.path.join(d, 'site/offre-lancement/index.html'), encoding='utf-8').read(), r.stderr)
verifier('pack validé : le contrôle l\'accepte', 'montant' not in controles(d))
r2 = lancer(d); verifier('réécriture idempotente', r2.stdout.startswith('0 page'), r2.stdout)
shutil.rmtree(d)

d = copie(); ecrire_config(d, lambda c: c.update(whatsapp={'numero': '+212 6 72'}))
verifier('numéro WhatsApp mal formé refusé', lancer(d).returncode != 0)
ecrire_config(d, lambda c: c.update(whatsapp={'numero': '212600000000'}))
r = lancer(d); h = open(os.path.join(d, 'site/application-mobile-casablanca/index.html'), encoding='utf-8').read()
verifier('numéro configuré : message prérempli propre à la prestation', r.returncode == 0 and 'https://wa.me/212600000000?text=' in h and 'application%20mobile' in h)
verifier('numéro configuré : aucun indicateur « en ligne »', not re.search(r'en ligne maintenant|disponible maintenant|répond en', tout(d), re.I))
shutil.rmtree(d)

d = copie()
p = os.path.join(d, 'site/index.html'); h = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<p>Pack à 7 777 MAD</p></main>', 1))
s = controles(d); verifier('contrôle : montant en clair détecté', '7 777' in s, s[-300:])
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<a href="https://wa.me/212600000000">x</a></main>', 1))
s = controles(d); verifier('contrôle : lien WhatsApp sans numéro configuré détecté', 'WhatsApp' in s, s[-300:])
open(p, 'w', encoding='utf-8').write(h.replace('</main>', '<p>Pack Starter</p></main>', 1))
s = controles(d); verifier('contrôle : offre non validée détectée', 'offre non validée' in s, s[-300:])
shutil.rmtree(d)

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
