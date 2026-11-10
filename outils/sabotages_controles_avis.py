"""Sabotages des contrôles d'avis clients : chaque copie cassée (site, Worker) doit faire échouer controles_site.py, pour la raison affichée ;
les deux témoins (avis publiés bien formés) doivent passer.     python3 outils/sabotages_controles_avis.py      (une copie du dépôt par cas, dans le dossier temporaire)"""
import os, shutil, subprocess, sys, tempfile
DEPOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
FIG_OK = '<ul class="avis-clients" role="list"><li><figure class="avis-client" data-accord="2026-11-10" data-forme="complet"><p class="avis-note"><span class="avis-etoiles" aria-hidden="true">★★★★★</span>5/5</p><blockquote><p>Texte.</p></blockquote><figcaption><p><b>Amina Benali</b></p><p>Gérante, Salon Amina</p></figcaption></figure></li></ul>'
FIG_INI = '<ul class="avis-clients" role="list"><li><figure class="avis-client" data-accord="2026-11-10" data-forme="initiales"><p class="avis-note"><span class="avis-etoiles" aria-hidden="true">★★★★☆</span>4/5</p><blockquote><p>Texte.</p></blockquote><figcaption><p><b>A. B.</b></p></figcaption></figure></li></ul>'
FR, EN, W, ACC, ML, SM = 'site/donner-mon-avis/index.html', 'site/en/leave-a-review/index.html', 'worker/src/index.js', 'site/index.html', 'site/mentions-legales/index.html', 'site/sitemap.xml'
def avant_main(t, ajout): return t.replace('</main>', ajout + '</main>', 1)
CAS = [
  ('adresse du formulaire = racine', FR, lambda t: t.replace('workers.dev/avis"', 'workers.dev/"')),
  ('note sans required', FR, lambda t: t.replace('name="note" value="3" required', 'name="note" value="3"')),
  ('champ en trop (EN)', EN, lambda t: t.replace('<input type="hidden" name="langue" value="en">', '<input type="hidden" name="langue" value="en"><input type="hidden" name="telephone" value="">')),
  ('champ facultatif retiré', FR, lambda t: t.replace('name="realisation"', 'name="projet"')),
  ('borne minimale différente', FR, lambda t: t.replace('minlength="20" maxlength="1500"', 'minlength="10" maxlength="1500"')),
  ('borne du Worker changée', W, lambda t: t.replace('AVIS_MIN = 20, AVIS_MAX = 1500;', 'AVIS_MIN = 30, AVIS_MAX = 1500;')),
  ('retour EN du Worker changé', W, lambda t: t.replace("en: '/en/leave-a-review/' }", "en: '/en/review/' }")),
  ('note 6 au Worker', W, lambda t: t.replace("const NOTES = { 5:", "const NOTES = { 6: 'Parfait', 5:")),
  ('accord de publication renommé', FR, lambda t: t.replace('value="prive"', 'value="privé"')),
  ('champ piège retiré', FR, lambda t: t.replace('name="site_web" tabindex="-1"', 'name="site_web"')),
  ('noindex retiré', EN, lambda t: t.replace('content="noindex, follow"', 'content="index, follow"')),
  ('page dans le sitemap', SM, lambda t: t.replace('</urlset>', '<url><loc>https://legantis.net/donner-mon-avis/</loc></url></urlset>')),
  ('lien depuis l\'accueil', ACC, lambda t: avant_main(t, '<p><a href="donner-mon-avis/">Donnez votre avis</a></p>')),
  ('paragraphe des mentions retiré', ML, lambda t: t.replace('<p id="avis-clients">', '<p>')),
  ('consentement vers #donnees', FR, lambda t: t.replace('<a href="../mentions-legales/#avis-clients">mentions légales</a>', '<a href="../mentions-legales/#donnees">mentions légales</a>')),
  ('message d\'échec retiré', FR, lambda t: t.replace('id="avis-echec"', 'id="avis-erreur"')),
  ('langue envoyée fausse', FR, lambda t: t.replace('name="langue" value="fr"', 'name="langue" value="en"')),
  ('avis publié sans date d\'accord', ACC, lambda t: avant_main(t, FIG_OK.replace(' data-accord="2026-11-10"', ''))),
  ('avis publié avec une forme inconnue', ACC, lambda t: avant_main(t, FIG_OK.replace('data-forme="complet"', 'data-forme="anonyme"'))),
  ('avis en initiales qui montre le nom', ACC, lambda t: avant_main(t, FIG_INI.replace('<b>A. B.</b>', '<b>Amina Benali</b>'))),
  ('avis en initiales qui montre l\'entreprise', ACC, lambda t: avant_main(t, FIG_INI.replace('<p><b>A. B.</b></p>', '<p><b>A. B.</b></p><p>Salon Amina</p>'))),
  ('note sans « n/5 » lisible', ACC, lambda t: avant_main(t, FIG_OK.replace('★★★★★</span>5/5', '★★★★★</span>'))),
  ('AggregateRating en JSON-LD', ACC, lambda t: t.replace('"@type": "Organization",', '"@type": "Organization",\n      "aggregateRating": {"@type": "AggregateRating", "ratingValue": "5", "reviewCount": "1"},', 1)),
]
TEMOINS = [('avis complet bien formé', ACC, lambda t: avant_main(t, FIG_OK)), ('avis en initiales bien formé', ACC, lambda t: avant_main(t, FIG_INI))]
def copie():
    d = tempfile.mkdtemp(prefix='sab-avis-')
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
