# Legantis — site vitrine de la société

Site statique (HTML + CSS, aucun build, aucun script exécutable) de **LEGANTIS DIGITAL SERVICE SAS**, éditeur d'Atlasya et de Rihla. Il sert aussi de preuve d'existence pour Apple (passage du compte Developer en « Organisation ») et pour Dun & Bradstreet : dénomination, adresse et numéros doivent rester **identiques au registre du commerce**.

En ligne sur **https://legantis.net** (GitHub Pages, déploiement à chaque push sur `main`). `warimvp.github.io/legantis/` redirige vers le domaine.

## Structure
- `site/index.html` (FR) · `site/en/index.html` (EN) · `site/mentions-legales/` (FR) · `site/en/legal/` (EN) · `site/404.html` (bilingue).
- `site/robots.txt`, `site/sitemap.xml` : URL absolues en `https://legantis.net/`.
- `site/assets/site.css` : feuille unique, jetons en tête (clair + sombre via `prefers-color-scheme`).
- Parti pris graphique : un éditeur de logiciels présenté comme un éditeur tout court — « Catalogue » (les produits) et « Colophon » (l'identité légale). Newsreader (titres), Schibsted Grotesk (texte), Spline Sans Mono (identifiants).
- Polices servies par Google Fonts : c'est écrit dans le § « Données personnelles » des deux pages légales. Si on les auto-héberge, corriger ce paragraphe (FR + EN).
- Icônes produits : `assets/atlasya.png` (depuis `Medlink/apps/web-patient/public/apple-touch-icon.png`) et `assets/rihla.png` (depuis `rihla/public/icons/icon-192.png`), réduites à 112 px avec `sips -Z 112`.
- `assets/apple-touch-icon.png` et `assets/partage.png` (image Open Graph 1200×630) sont générées par `outils/images.py` (`arch -x86_64 python3 outils/images.py` : Pillow est en x86_64 sur cette machine).
- `404.html` est servie pour toute URL inconnue, quelle que soit sa profondeur : elle n'utilise que des chemins absolus (`/assets/…`).

## SEO et métadonnées
- Chaque page porte `canonical`, `hreflang` (fr, en, x-default) et Open Graph en URL absolues `https://legantis.net/…`.
- Les deux pages d'accueil portent un bloc JSON-LD `Organization` (données, pas du code) : dénomination, adresse, RC, ICE, email, téléphone. **Le garder synchronisé avec le colophon.**

## Identité légale (source : copie du RC du 08/09/2026)
- Dénomination exacte : `LEGANTIS DIGITAL SERVICE SAS` — au caractère près, c'est celle du D-U-N-S et d'Apple.
- RC Casablanca 745587 (07/09/2026) · ICE 004026900000030 · IF 73343482 · TP 34706792 · capital 10 000 MAD · Président : Yassir Legmara.
- Siège : Oasis Offices Latitudes, Route de l'Oasis, Bureau 304, Maarif, Casablanca. La mention « domiciliée chez MyLegal Offices » est exigée par l'article 4 du contrat de domiciliation.
- **Ne jamais publier** : CIN et date de naissance du Président, code d'accès SIMPL (il figure sur le bulletin IF).
- Toute modification de ces données se fait dans les **4 pages** (accueil + légal, FR + EN), dans les **2 blocs JSON-LD** et dans les pages légales d'Atlasya (`Medlink/apps/web-*/src/pages/MentionsLegalesPage.jsx`).

## Domaine et DNS
- `legantis.net` acheté chez Hostinger le 14/09/2026 (expire le 14/09/2027). Titulaire : la société (profil WHOIS 15854315), protection WHOIS active, domaine verrouillé.
- DNS chez Hostinger : `@` A → 185.199.108-111.153 et AAAA → 2606:50c0:8000-8003::153 (GitHub Pages), `www` CNAME → `warimvp.github.io.`
- Le domaine personnalisé est réglé dans les paramètres Pages du dépôt (`gh api repos/Warimvp/legantis/pages`) : avec un déploiement par workflow, un fichier `site/CNAME` serait ignoré.

## En attente
- **Boîte `contact@legantis.net`** : affichée sur les 4 pages, à créer par le user dans hPanel (Hostinger Email). Jamais créée par Claude (mot de passe).
- **Téléphone** : +33 7 66 37 28 99 provisoire. Passer au numéro marocain dès qu'il est actif (4 pages + 2 JSON-LD), et donner le même à D&B.
- **legantis.ma** (plus tard) : exige un contact administratif personne physique résidant au Maroc (coordonnées publiques, pas de masquage en .ma), un RC modèle 7 de moins de 3 mois déposé sous 14 jours, et 2 à 4 semaines de validation. Ensuite : `.net` redirige vers `.ma`, et toutes les URL absolues (canonical, hreflang, OG, JSON-LD, sitemap, robots) basculent.
- Hébergement : les pages légales annoncent GitHub Pages. Si l'hébergeur change, corriger le § « Hébergement » (FR + EN).

## Lancer
- Serveur `legantis-site` (port 5195) dans `~/.claude/launch.json` — ne jamais lancer via Bash.
