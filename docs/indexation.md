# Indexation Google et Bing

## État technique (contrôlé le 2026-11-01)

- `https://legantis.net/` est l'unique hôte : `www.` et `http://` redirigent en 301 vers lui. Une page absente répond 404.
- `robots.txt` autorise tout et déclare `https://legantis.net/sitemap.xml`.
- Le sitemap liste 26 pages, toutes en 200, sans `noindex`, avec une balise canonique sur elles-mêmes, un titre, une description et un seul `<h1>`. Les `hreflang` (fr, en, ar, x-default) sont identiques dans les pages et le sitemap, et réciproques.
- Hors sitemap, volontairement en `noindex, follow` : `/offre-lancement/` et les quatre `/realisations/demos/…/`. La page 404 est en `noindex`.
- `<lastmod>` vient de git (`outils/lastmod.py --verifier`). Dans un clone superficiel (`--depth 1`), toutes les dates sortent au jour du dernier commit : vérifier dans un clone complet.
- Propriété Google vérifiée par l'enregistrement DNS TXT `google-site-verification` chez Hostinger : ne pas le supprimer. Propriété Bing vérifiée par `site/BingSiteAuth.xml` : ne pas le supprimer.

## Google Search Console

Google n'accepte plus de « ping » de sitemap et n'utilise pas IndexNow. Tout passe par la console.

1. https://search.google.com/search-console : choisir la propriété de domaine `legantis.net`.
2. **Sitemaps** : soumettre `https://legantis.net/sitemap.xml`. L'état doit devenir « Opération effectuée » avec 26 URL détectées.
3. **Inspection de l'URL** : coller l'adresse, puis « Demander une indexation ». Le quota est d'environ 10 demandes par jour : commencer par l'accueil, `/en/`, puis les pages de service, les études de cas, enfin les autres.
4. Une à deux semaines plus tard, **Indexation des pages** : « Explorée, actuellement non indexée » ou « Détectée, actuellement non indexée » sont normaux pour un site jeune. Seuls « Bloquée par robots.txt », « Exclue par la balise noindex » ou « Erreur de redirection » sur une page du sitemap signalent un vrai problème.

## Bing Webmaster Tools

1. https://www.bing.com/webmasters : propriété `https://legantis.net/` (ou l'importer depuis Search Console).
2. **Sitemaps** : soumettre `https://legantis.net/sitemap.xml`.
3. **IndexNow** : après chaque mise en ligne, depuis la racine du dépôt :

```bash
python3 outils/indexnow.py --envoyer
```

Le script envoie toutes les URL du sitemap à `api.indexnow.org` (Bing, Yandex, Seznam, Naver). Il refuse d'envoyer tant que le fichier de clé `site/<clé>.txt` n'est pas en ligne. Ne pas renommer ni supprimer ce fichier.

4. Sinon, **Soumission d'URL** dans la console : jusqu'à 100 URL par jour.
