"""Teste la règle de l'encart d'accueil (outils/garde_encart.py) et son branchement dans outils/avant_production.py, avec des cas POSITIFS (admis) et NÉGATIFS (refusés),
puis vérifie que les autres contrôles du garde-fou ne se sont pas relâchés. Un cas négatif qui passerait ferait échouer ce test.
    python3 outils/test_garde_encart.py"""
import copy, json, os, re, shutil, subprocess, sys, tempfile
ICI = os.path.dirname(os.path.abspath(__file__)); DEPOT = os.path.join(ICI, '..')
sys.path.insert(0, ICI)
from garde_encart import encart_admis
echecs = 0
def verifier(nom, c, detail=''):
    global echecs
    print(('✓ ' if c else '✗ ') + nom, '' if c else detail)
    echecs += 0 if c else 1
REEL = json.load(open(os.path.join(DEPOT, 'config', 'commercial.json'), encoding='utf-8'))
def avec(modifier):
    c = copy.deepcopy(REEL); modifier(c); return c
# ── positifs : ce qui doit être admis ────────────────────────────────────────────────────────────────
verifier('positif : configuration du candidat (encart validé, mise_en_avant, fourchette Visibilité)', encart_admis(REEL)[0], encart_admis(REEL)[1])
verifier('positif : aucun encart (état de production du 08/11)', encart_admis(avec(lambda c: c.update(offre_ouverture=None)))[0])
verifier('positif : encart avec la seule page d\'accueil', encart_admis(avec(lambda c: c.update(mise_en_avant=[''])))[0])
verifier('positif : texte avec le prix écrit autrement (3 490 MAD HT, espace insécable)', encart_admis(avec(lambda c: c['offre_ouverture'].update(texte='Dès 3 490 MAD HT')))[0])
# ── négatifs : ce qui doit rester refusé ─────────────────────────────────────────────────────────────
negatifs = {
    'encart non validé': lambda c: c['offre_ouverture'].update(valide=False),
    'champ valide absent': lambda c: c['offre_ouverture'].pop('valide'),
    'lien vers une autre page': lambda c: c['offre_ouverture'].update(lien='commandes/'),
    'lien externe': lambda c: c['offre_ouverture'].update(lien='https://exemple.com/'),
    'mise_en_avant absent': lambda c: c.pop('mise_en_avant'),
    'mise_en_avant avec une page de plateforme': lambda c: c.update(mise_en_avant=['', 'application-web-maroc/']),
    'mise_en_avant avec la page de commandes': lambda c: c.update(mise_en_avant=['commandes/']),
    'montant différent du prix du pack': lambda c: c['offre_ouverture'].update(texte='Votre site dès 2 990 MAD HT'),
    'second montant dans l\'encart': lambda c: c['offre_ouverture'].update(texte='Dès 3 490 MAD HT, au lieu de 6 490 MAD HT'),
    'ancien prix 12 900': lambda c: c['offre_ouverture'].update(texte='Dès 12 900 DH'),
    'promotion': lambda c: c['offre_ouverture'].update(texte='Promo de lancement : site dès 3 490 MAD HT'),
    'remise en pourcentage': lambda c: c['offre_ouverture'].update(texte='-30 % sur le site dès 3 490 MAD HT'),
    'urgence': lambda c: c['offre_ouverture'].update(titre='Dernières places'),
    'fourchette Gestion publiée': lambda c: c['fourchettes']['gestion'].update(valide=True, a_partir_de=9000, regime='HT'),
    'fourchette Applications publiée': lambda c: c['fourchettes']['applications'].update(valide=True, a_partir_de=20000, regime='HT'),
    'fourchette Visibilité à un autre montant': lambda c: c['fourchettes']['visibilite'].update(a_partir_de=2990),
    'fourchette Visibilité avec maximum': lambda c: c['fourchettes']['visibilite'].update(jusqu_a=5000),
    'fourchette Visibilité en TTC': lambda c: c['fourchettes']['visibilite'].update(regime='TTC'),
    'pack Visibilité non validé': lambda c: c['packs'][0].update(valide=False),
    'plus aucun pack Visibilité': lambda c: c.update(packs=[]),
}
for nom, mod in negatifs.items():
    verifier(f'négatif : {nom} refusé', not encart_admis(avec(mod))[0])
# ── bout en bout : le vrai garde-fou, en mode rapide, sur des copies jetables ──────────────────────────
def copie(modifier=None):
    d = tempfile.mkdtemp(prefix='garde-')
    for x in ('site', 'config', 'outils', 'worker/src'):
        shutil.copytree(os.path.join(DEPOT, x), os.path.join(d, x))
    p = os.path.join(d, 'config', 'commercial.json'); c = json.load(open(p, encoding='utf-8'))
    if modifier: modifier(c)
    json.dump(c, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    return d
def garde(d):
    r = subprocess.run([sys.executable, os.path.join(d, 'outils', 'avant_production.py')], capture_output=True, text=True, cwd=d)
    lignes = [(m.group(1) == '✓', m.group(2)) for m in re.finditer(r'^([✓✗]) (.*)$', r.stdout, re.M)]
    class Res(dict):
        def get(self, nom, defaut=None):   # une ligne refusée porte son motif après le nom : comparer sur le début
            for ok, texte in lignes:
                if texte.startswith(nom): return ok
            return defaut
        def __iter__(self): return iter([t for _, t in lignes])
    return Res()
NOM_PACKS = 'packs limités aux pages noindex hors sitemap ; encart d\'accueil admis seulement s\'il est validé et conforme'
d = copie(); res = garde(d); shutil.rmtree(d)
verifier('bout en bout : le garde-fou admet le candidat (contrôle de l\'encart)', res.get(NOM_PACKS) is True, str(sorted(k for k in res if 'packs' in k)))
for nom, mod, attendu in (('encart non validé', negatifs['encart non validé'], NOM_PACKS), ('mise_en_avant retiré', negatifs['mise_en_avant absent'], NOM_PACKS),
                          ('fourchette Gestion publiée', negatifs['fourchette Gestion publiée'], NOM_PACKS), ('prix d\'encart modifié', negatifs['montant différent du prix du pack'], NOM_PACKS)):
    d = copie(mod); res = garde(d); shutil.rmtree(d)
    verifier(f'bout en bout : garde-fou refuse « {nom} »', res.get(attendu) is False)
# les autres contrôles ne se sont PAS relâchés
d = copie(lambda c: c.update(grille={'valide': True})); res = garde(d); shutil.rmtree(d)
verifier('bout en bout : « grille de prix désactivée » refuse toujours une grille publiée', res.get('grille de prix désactivée') is False)
d = copie(lambda c: c.update(whatsapp={'numero': '212600000000'})); res = garde(d); shutil.rmtree(d)
verifier('bout en bout : « WhatsApp désactivé » refuse toujours un numéro', res.get('WhatsApp désactivé') is False)
d = copie(lambda c: c.update(packs_pages=[])); res = garde(d); shutil.rmtree(d)
verifier('bout en bout : packs hors page noindex (packs_pages vide) toujours refusé', res.get(NOM_PACKS) is False)
print(f'\n{echecs} échec(s)' if echecs else '\ntout passe')
sys.exit(1 if echecs else 0)
