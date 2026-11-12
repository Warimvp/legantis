"""Sabotages des contrôles de la page de stage : chaque copie cassée doit faire échouer controles_site.py, pour la raison affichée ;
le témoin (stage devenu rémunéré, salaire balisé) doit passer.     python3 outils/sabotages_controles_stage.py      (une copie du dépôt par cas, dans le dossier temporaire)"""
import os, re, shutil, subprocess, sys, tempfile
DEPOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
P, ACC, ML, SM = 'site/stage-commercial-casablanca/index.html', 'site/index.html', 'site/mentions-legales/index.html', 'site/sitemap.xml'
SALAIRE = '"baseSalary": {"@type": "MonetaryAmount", "currency": "MAD", "value": {"@type": "QuantitativeValue", "unitText": "MONTH"}},\n      "employmentType"'
CAS = [
  ('bouton postuler vers une autre adresse', P, lambda t: t.replace('href="mailto:contact@legantis.net?subject=Candidature', 'href="mailto:rh@exemple.ma?subject=Candidature', 1)),
  ('bouton postuler sans objet de candidature', P, lambda t: t.replace('mailto:contact@legantis.net?subject=Candidature%20stage', 'mailto:contact@legantis.net?subject=Bonjour', 1)),
  ('bouton plein vers un e-mail sur l\'accueil', ACC, lambda t: t.replace('</main>', '<a class="bouton bouton--plein postuler" href="mailto:contact@legantis.net?subject=Candidature%20stage">Postuler</a></main>', 1)),
  ('JobPosting retiré', P, lambda t: t.replace('"@type": "JobPosting"', '"@type": "Article"')),
  ('JobPosting sans description', P, lambda t: t.replace('"description": "<p>', '"resume": "<p>', 1)),
  ('emploi au lieu de stage', P, lambda t: t.replace('"employmentType": "INTERN"', '"employmentType": "FULL_TIME"')),
  ('employeur sans l\'Organization de l\'accueil', P, lambda t: t.replace('"@id": "https://legantis.net/#organisation",\n        "name": "Legantis",\n        "sameAs"', '"name": "Legantis",\n        "sameAs"')),
  ('télétravail retiré du balisage', P, lambda t: t.replace('"jobLocationType": "TELECOMMUTE"', '"jobLocationType": "ONSITE"')),
  ('candidats hors du Maroc', P, lambda t: t.replace('"name": "Morocco"', '"name": "France"')),
  ('lieu physique balisé', P, lambda t: t.replace('"jobLocationType"', '"jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Casablanca", "addressCountry": "MA"}},\n      "jobLocationType"', 1)),
  ('page qui dit encore hybride', P, lambda t: t.replace('<li>100 % à distance</li><li>Tout le Maroc</li>', '<li>Hybride</li><li>Casablanca</li>')),
  ('date limite du balisage sans la date affichée', P, lambda t: t.replace('"validThrough": "2027-03-31', '"validThrough": "2027-04-30')),
  ('offre expirée', P, lambda t: t.replace('"validThrough": "2027-03-31', '"validThrough": "2026-01-31').replace("jusqu'au 31/03/2027", "jusqu'au 31/01/2026").replace('"datePosted": "2026-11-12"', '"datePosted": "2026-01-01"')),
  ('salaire balisé, page « non rémunéré »', P, lambda t: t.replace('"employmentType"', SALAIRE, 1)),
  ('ni « non rémunéré » ni salaire', P, lambda t: t.replace("le stage n'est pas rémunéré", 'le stage est indemnisé')),
  ('paragraphe des mentions retiré', ML, lambda t: t.replace('<p id="candidatures">', '<p>')),
  ('renvoi aux mentions vers #donnees', P, lambda t: t.replace('../mentions-legales/#candidatures', '../mentions-legales/#donnees')),
  ('accueil sans lien vers la page', ACC, lambda t: t.replace('<a href="stage-commercial-casablanca/">', '<a href="realisations/">')),
  ('page retirée du sitemap', SM, lambda t: re.sub(r'\s*<url>\s*<loc>https://legantis\.net/stage-commercial-casablanca/</loc>.*?</url>', '', t, flags=re.S)),
]
TEMOINS = [('stage devenu rémunéré, salaire balisé', P, lambda t: t.replace('"employmentType"', SALAIRE, 1).replace("le stage n'est pas rémunéré", 'le stage est rémunéré'))]
def copie():
    d = tempfile.mkdtemp(prefix='sab-stage-')
    for x in ('site', 'worker', 'outils', 'config'):
        shutil.copytree(os.path.join(DEPOT, x), os.path.join(d, x), ignore=shutil.ignore_patterns('node_modules'))
    return d
def lancer(d):
    r = subprocess.run([sys.executable, os.path.join(d, 'outils', 'controles_site.py'), os.path.join(d, 'site')], capture_output=True, text=True)
    return r.returncode, r.stdout
ok = ko = 0
for nom, f, casse in CAS + TEMOINS:
    d = copie(); chemin = os.path.join(d, f); t = open(chemin, encoding='utf-8').read(); t2 = casse(t)
    if t2 == t: print('✗ MAL FORMÉ :', nom); ko += 1; shutil.rmtree(d); continue
    open(chemin, 'w', encoding='utf-8').write(t2)
    code, sortie = lancer(d); shutil.rmtree(d)
    attendu_echec = (nom, f, casse) in CAS
    bon = (code == 1) if attendu_echec else (code == 0)
    ok += bon; ko += not bon
    print(('✓ ' if bon else '✗ ') + ('détecté : ' if attendu_echec else 'témoin vert : ') + nom + ' → ' + ' | '.join(l.strip()[:150] for l in sortie.split('\n')[2:4]))
print(f'{ok} sur {ok + ko}')
sys.exit(1 if ko else 0)
