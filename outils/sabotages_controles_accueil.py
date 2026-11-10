"""Éprouve les contrôles du contact rapide et des trois offres de l'accueil (05/11/2026), et de la page d'offre (10/11/2026) : chaque copie volontairement cassée de site/ doit faire échouer controles_site.py.
    python3 outils/sabotages_controles_accueil.py        → « n sabotages détectés sur n » ; code de sortie 1 si l'un survit."""
import shutil,subprocess,sys,os,re,tempfile
RAC=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
def essai(nom, fichier, ancien, nouveau, attendu):
    t=tempfile.mkdtemp()
    shutil.copytree(RAC+'/site',t+'/site'); shutil.copytree(RAC+'/worker/src',t+'/worker/src'); shutil.copytree(RAC+'/outils',t+'/outils'); shutil.copytree(RAC+'/config',t+'/config')
    p=t+'/'+fichier; s=open(p,encoding='utf8').read()
    assert s.count(ancien)>=1,(nom,'introuvable')
    open(p,'w',encoding='utf8').write(s.replace(ancien,nouveau,1))
    r=subprocess.run([sys.executable,t+'/outils/controles_site.py',t+'/site'],capture_output=True,text=True)
    ok = r.returncode==1 and attendu in r.stdout
    print(('✓ détecté' if ok else '✗ SURVIT'),nom, '' if ok else r.stdout[-300:])
    shutil.rmtree(t)
    return ok
T=[
 ('contact rapide : champ contact renommé','site/index.html','name="contact" type="text"','name="courriel" type="text"','contact rapide : champs'),
 ('contact rapide : parcours retiré','site/index.html','<input type="hidden" name="parcours" value="rapide">','','champs cachés parcours=rapide'),
 ('contact rapide : message de succès retiré','site/index.html','id="rappel-envoye"','id="rappel-ok"','rappel-envoye'),
 ('contact rapide : consentement facultatif','site/index.html','name="consentement" type="checkbox" value="oui" required><span>J\'accepte que LEGANTIS DIGITAL SERVICE SAS utilise ces informations pour répondre à ma demande, et qu\'elles transitent par ses prestataires hors du Maroc, comme expliqué dans les <a href="mentions-legales/#donnees">mentions légales</a>.</span></label></div>\n          <div class="visuellement-cache"','name="consentement" type="checkbox" value="oui"><span>J\'accepte que LEGANTIS DIGITAL SERVICE SAS utilise ces informations pour répondre à ma demande, et qu\'elles transitent par ses prestataires hors du Maroc, comme expliqué dans les <a href="mentions-legales/#donnees">mentions légales</a>.</span></label></div>\n          <div class="visuellement-cache"','champ « consentement » non obligatoire'),
 ('contact rapide : besoin hors liste du Worker','site/index.html','<option value="mobile">Une application mobile','<option value="pirate">Une application mobile','absents de la liste du Worker'),
 ('contact rapide : piège retiré','site/index.html','<div class="visuellement-cache" aria-hidden="true"><label>Ne pas remplir ce champ<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>\n          <div class="devis-bas">\n            <button class="bouton bouton--plein" type="submit">Être recontacté','<div class="devis-bas">\n            <button class="bouton bouton--plein" type="submit">Être recontacté','champ piège'),
 ('offre Gestion sans son devis','site/index.html','href="estimer-mon-projet/?type=logiciel" aria-label="Demander un devis Gestion"','href="estimer-mon-projet/" aria-label="Demander un devis Gestion"','offre « gestion »'),
 ('offre Visibilité retirée','site/index.html','id="visibilite"','id="vis"','offre « visibilite »'),
 ('identifiant en double','site/index.html','id="rappel-echec"','id="rappel-envoye"','identifiants en double'),
 ('EN : contact rapide sans consentement','site/en/index.html','name="consentement" type="checkbox" value="oui" required><span>I agree that LEGANTIS DIGITAL SERVICE SAS may use this information to answer my request, and that it passes through its service providers outside Morocco, as explained in the <a href="legal/#personal-data">legal notice</a>.</span></label></div>\n          <div class="visuellement-cache" aria-hidden="true"><label>Leave this field empty<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>\n          <div class="devis-bas">\n            <button class="bouton bouton--plein" type="submit">Get in touch','name="consentement" type="checkbox" value="oui"><span>I agree that LEGANTIS DIGITAL SERVICE SAS may use this information to answer my request, and that it passes through its service providers outside Morocco, as explained in the <a href="legal/#personal-data">legal notice</a>.</span></label></div>\n          <div class="visuellement-cache" aria-hidden="true"><label>Leave this field empty<input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>\n          <div class="devis-bas">\n            <button class="bouton bouton--plein" type="submit">Get in touch','non obligatoire'),
 ('EN : offre Gestion sans contact rapide','site/en/index.html','href="#rappel" aria-label="Get a quote for Management"','href="#devis" aria-label="Get a quote for Management"','offre « gestion »'),
 ('Worker sans le type d\'un besoin','worker/src/index.js',"ecommerce: 'Site e-commerce', ","","absents de la liste du Worker"),
 # page d'offre, page d'arrivée des publicités Google (10/11/2026)
 ('offre : contact rapide sans parcours','site/offre-lancement/index.html','<input type="hidden" name="parcours" value="rapide">','','offre-lancement/: contact rapide : champs cachés parcours=rapide'),
 ('offre : message de succès du contact rapide retiré','site/offre-lancement/index.html','id="rappel-envoye"','id="rappel-ok"','offre-lancement/: contact rapide : data-ok'),
 ('offre : formulaire détaillé sans son parcours','site/offre-lancement/index.html','<input type="hidden" name="parcours" value="offre">','','parcours=offre absent'),
 ('offre : premier écran sans lien d\'appel','site/offre-lancement/index.html','Ou appelez le <a href="tel:+212672759097">','Ou appelez le <a href="#demande">','premier écran sans lien'),
 ('offre : premier écran sans lien vers le contact rapide','site/offre-lancement/index.html','Pressé&nbsp;? <a href="#rappel">','Pressé&nbsp;? <a href="#demande">','premier écran sans lien'),
 ('offre : étude de cas Ostad retirée','site/offre-lancement/index.html','href="../etude-de-cas-ostad/"','href="../realisations/"','étude de cas etude-de-cas-ostad'),
 ('commandes : lien d\'appel retiré','site/commandes/index.html','<a href="tel:+212672759097">','<a href="#devis">','commandes/: lien d\'appel'),
]
n=sum(essai(*t) for t in T); print(n,'sabotages détectés sur',len(T)); sys.exit(0 if n==len(T) else 1)
