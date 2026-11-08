"""Dernier contrôle avant de fusionner dans main. Ne déploie rien et ne modifie rien.
    python3 outils/avant_production.py            contrôles rapides
    python3 outils/avant_production.py --complet  ajoute les tests du Worker, les contrôles du site et les parcours Chromium
Sortie 1 au premier motif de refus. À lancer depuis la branche candidate, juste avant la fusion."""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from garde_encart import encart_admis
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SITE = os.path.join(RACINE, 'site')
INTERDITS = ('docs/acquisition', 'docs/marketing', 'docs/sortlist.md', 'docs/conversion/RAPPORT-VALIDATION.md', 'prive')
refus = []
def git(*a):
    return subprocess.run(('git', '-C', RACINE) + a, capture_output=True, text=True)
def verifier(nom, condition, detail=''):
    print(('✓ ' if condition else '✗ ') + nom, '' if condition else detail)
    if not condition: refus.append(nom)

print('Le contrôle de main interroge origin : il faut une connexion.')
f = git('fetch', 'origin', 'main')
verifier('origin/main relu', f.returncode == 0, f.stderr.strip())
verifier('la branche contient tout origin/main', git('merge-base', '--is-ancestor', 'origin/main', 'HEAD').returncode == 0, 'refaire la fusion')
verifier('aucune modification en attente', git('status', '--porcelain').stdout.strip() == '')
suivis = git('ls-files').stdout.split('\n')
presents = [p for p in suivis if p.startswith(INTERDITS)]
verifier('aucun document interne dans le dépôt', not presents, ', '.join(presents[:5]))
ajouts = git('log', '-p', '--no-color', 'origin/main..HEAD', '--', '.').stdout
verifier('historique à publier sans document interne', not re.search(r'^\+\+\+ b/docs/(acquisition|marketing)/', ajouts, re.M), 'fusionner depuis la branche candidate à un seul commit')
n = git('rev-list', '--count', 'origin/main..HEAD').stdout.strip()
verifier('un seul commit à publier', n == '1', f'{n} commits : l\'historique complet deviendrait public')

conf = json.load(open(os.path.join(RACINE, 'config', 'commercial.json'), encoding='utf-8'))
verifier('WhatsApp désactivé', not (conf.get('whatsapp') or {}).get('numero'))
# Packs : éteints, ou limités par packs_pages à des pages noindex et absentes du sitemap (pilote du 04/11/2026, /offre-lancement/). Publier des prix
# sur une page indexée ou sur l'accueil reste une décision du propriétaire : il faudra alors changer ce contrôle sciemment.
plan = open(os.path.join(SITE, 'sitemap.xml'), encoding='utf-8').read()
def page_pilote(dossier):
    chemin = os.path.join(SITE, dossier, 'index.html')
    return os.path.exists(chemin) and re.search(r'<meta name="robots" content="noindex', open(chemin, encoding='utf-8').read()) and f'https://legantis.net/{dossier}<' not in plan
encart_ok, encart_motif = encart_admis(conf)   # règle précise de l'encart d'accueil (décision D11a du 08/11/2026) : outils/garde_encart.py
verifier('packs limités aux pages noindex hors sitemap ; encart d\'accueil admis seulement s\'il est validé et conforme', encart_ok and (not conf.get('packs') or (bool(conf.get('packs_pages')) and all(page_pilote(x) for x in conf['packs_pages']))), encart_motif)
verifier('grille de prix désactivée', (conf.get('grille') or {}).get('valide') is False)
pages = [os.path.join(d, x) for d, _, fs in os.walk(SITE) for x in fs if x.endswith(('.html', '.js'))]
texte = {p: open(p, encoding='utf-8').read() for p in pages}
verifier('Meta Pixel absent du site', not [p for p, t in texte.items() if re.search(r'fbevents|connect\.facebook\.net|fbq\(|pixel\.js', t)])
verifier('aucun lien WhatsApp publié', not [p for p, t in texte.items() if 'wa.me/' in t])
verifier('aucun outil de mesure chargé', not [p for p, t in texte.items() if re.search(r'plausible\.io/js|cloud\.umami\.is|googletagmanager|google-analytics', t)])
w = open(os.path.join(RACINE, 'worker', 'src', 'index.js'), encoding='utf-8').read()
verifier('Worker : parcours /commandes/ conservé', "commandes: '/commandes/'" in w and 'const QUALIFICATION' in w and 'function priorite' in w)
c = open(os.path.join(SITE, 'commandes', 'index.html'), encoding='utf-8').read()
verifier('/commandes/ : formulaire complet', all(f'name="{x}"' in c for x in ('entreprise', 'nom', 'telephone', 'email', 'activite', 'ville', 'equipe', 'budget', 'delai', 'projet', 'consentement', 'site_web')))
m = open(os.path.join(SITE, 'mentions-legales', 'index.html'), encoding='utf-8').read()
verifier('mentions légales : ni pixel ni cookie, comme le site', 'ni cookie, ni outil de mesure d\'audience, ni pixel publicitaire' in m)

if '--complet' in sys.argv:
    for nom, cmd in (('Worker', ['node', '--test', 'worker/test/index.test.js']), ('contrôles du site', [sys.executable, 'outils/controles_site.py']), ('outil commercial', [sys.executable, 'outils/test_commercial.py']), ('garde-fou de l\'encart', [sys.executable, 'outils/test_garde_encart.py']), ('estimation', ['node', 'outils/test_estimation.js']), ('parcours', ['node', 'outils/parcours_test.mjs']), ('démonstration restaurant', ['node', 'outils/test_demo_restaurant.mjs']), ('démonstration réservation', ['node', 'outils/test_demo_reservation.mjs']), ('démonstration services', ['node', 'outils/test_demo_services.mjs']), ('assistant sans saut de page', ['node', 'outils/test_cls_assistant.mjs']), ('contact rapide', ['node', 'outils/test_contact_rapide.mjs']), ('ordre Worker / site', ['node', 'outils/test_ordre_deploiement.mjs']), ('contrôles de l\'accueil éprouvés', [sys.executable, 'outils/sabotages_controles_accueil.py']), ('sabotages du Worker', ['node', 'worker/test/sabotages.mjs']), ('six formulaires', ['node', 'outils/test_formulaires.mjs']), ('source UTM dans les démonstrations', ['node', 'outils/test_utm_demos.mjs']), ('Distribution OS : règles', ['node', '--test', 'outils/test_distribution_os.js']), ('Distribution OS : parcours', ['node', 'outils/parcours_distribution_os.mjs'])):
        r = subprocess.run(cmd, cwd=RACINE, capture_output=True, text=True)
        verifier(f'{nom} : tests', r.returncode == 0 and 'ÉCHECS' not in r.stdout, r.stdout[-300:])

print('\nPRÊT POUR VALIDATION' if not refus else f'\nREFUSÉ : {len(refus)} point(s)')
sys.exit(1 if refus else 0)
