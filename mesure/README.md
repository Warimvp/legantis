# Mesure d'audience — préparée, **non activée** (26/10/2026)

Rien de ce dossier n'est chargé par le site : `site/` n'a toujours qu'un script (`lumiere.js`) et les mentions légales disent « ni outil de mesure d'audience », ce qui reste exact. L'activation est une décision du user (outil, compte, mentions légales, CNDP).

## Quatre choses différentes, quatre sources

| Ce qu'on veut savoir | Ce que c'est | D'où ça viendra |
|---|---|---|
| **Demandes réelles** | un devis dont le mail a été accepté par Resend | le compteur du Worker (`worker/README.md`, « Compteur de demandes ») : la seule source fiable, côté serveur, sans script |
| **Événements** | un geste : clic sur un bouton de devis, sur un produit, sur l'e-mail… | `mesure/mesure.js`, transmis à l'outil |
| **Visites (sessions)** | un passage sur le site, plusieurs pages possibles | l'outil (Plausible ou Umami), sans cookie |
| **Visiteurs** | une personne estimée sur une journée (empreinte quotidienne, pas de cookie) | l'outil |

Taux de conversion = demandes réelles (Worker) ÷ visiteurs (outil), sur la même période. Les deux sources ne sont pas reliées : impossible de dire quelle source a amené quelle demande sans collecter davantage (choix écarté). L'outil donne les sources des visites (référent, UTM) ; le Worker donne le type de projet de chaque demande.

## Événements préparés (`mesure.js`, testé par `test_mesure.js`)

| Événement | Quand | Propriétés |
|---|---|---|
| `Devis clic` | clic sur un lien vers `#devis` | `emplacement` : barre, menu, ouverture, badge, en-tete, milieu, catalogue, appel-final, pied |
| `Formulaire vu` | le premier champ du formulaire devient visible | — |
| `Devis envoyé` / `Devis échec` | arrivée sur `#devis-envoye` / `#devis-echec` (retour du Worker) | — (le chiffre de référence reste le Worker) |
| `Réalisations vues` | la première couverture du Catalogue devient visible | — |
| `Produit clic` | clic dans une carte produit | `produit` (atlasya, rihla, ostad), `destination` (app-store, etude-de-cas, site-du-produit, catalogue) |
| `E-mail clic`, `Téléphone clic` | clic sur un lien `mailto:` / `tel:` | `emplacement` |
| `WhatsApp clic`, `Mini-audit clic`, `Offre Commandes clic` | clic vers WhatsApp, `/audit-gratuit/` ou `/commandes/` | `emplacement` |
| `Simulateur ouvert`, `Simulateur étape` | ouverture et étape atteinte | `rang` (jamais un choix du visiteur) |
| `Demande envoyée` | envoi réussi sans quitter la page | `parcours` |

Pages vues (prestations, études de cas, portfolio) et sources : mesurées par l'outil lui-même. **Jamais** dans un événement : un champ du formulaire, une adresse, un nom, un texte saisi (le test le vérifie en remplissant le formulaire de faux secrets).

`node mesure/test_mesure.js` : 12 vérifications sur les vraies pages (1440 et 390 px), dont aucune requête réseau du script lui-même et aucune erreur sans outil chargé.

## Outils évalués (tarifs relevés le 26/10/2026)

| Outil | Coût | Cookie | Événements personnalisés | Remarques |
|---|---|---|---|---|
| **Umami Cloud, offre Hobby** | gratuit : 100 000 événements par mois, 1 site, 6 mois de conservation (umami.is/pricing) | non | oui (`umami.track`, géré par `mesure.js`) | le plus simple pour commencer sans payer |
| **Plausible** | payant : formules Starter, Growth, Business ; environ 9 $/mois pour 10 000 pages vues d'après la page d'accueil (à confirmer) ; les événements comptent dans le volume ; essai de 30 jours sans carte (plausible.io/docs/subscription-plans) | non | oui | déjà prévu dans Atlasya (`VITE_PLAUSIBLE_DOMAIN`) : un seul outil pour les deux sites si le compte existe |
| Cloudflare Web Analytics | gratuit | non | **non** | ne mesure ni les clics ni les envois : insuffisant |
| Umami auto-hébergé | serveur et base à maintenir | non | oui | trop de maintenance pour le besoin |

Recommandation : **Umami Cloud Hobby** pour démarrer (gratuit, suffisant au volume actuel), Plausible si un compte payant existe déjà pour Atlasya. Dans les deux cas, le compte est créé par le user, jamais par Claude.

## Avant d'activer : obligations à vérifier (non tranchées ici)

- **Loi 09-08** : un outil sans cookie traite quand même l'adresse IP le temps de calculer son empreinte ; vérifier auprès de la CNDP si une déclaration est nécessaire et si un consentement est requis au Maroc (l'exemption européenne de consentement pour la mesure d'audience ne s'applique pas d'office).
- **Mentions légales FR + EN** : remplacer « ni outil de mesure d'audience » par la description exacte (outil, données, durée, hébergement de l'outil, transfert hors du Maroc). `outils/controles_site.py` exige « ni cookie » / « no cookies » : à garder vrai (les deux outils recommandés sont sans cookie).
- **Règle du dépôt** « un seul script, réservé aux effets à la souris » (CLAUDE.md) : l'activation en est une exception assumée, à noter dans CLAUDE.md.
- **Requête vers un tiers** : le script de l'outil vient de son domaine ; Plausible et Umami documentent un relais par un Worker Cloudflare (première partie) si l'on veut garder « aucune requête vers un tiers ».

## Activer (après décision)

1. Créer le compte (Umami Cloud ou Plausible) et le site `legantis.net` ; noter l'identifiant.
2. Copier `mesure/mesure.js` vers `site/assets/mesure.js`.
3. Dans les 22 pages, après `lumiere.js` : le script de l'outil (`<script defer src="https://cloud.umami.is/script.js" data-website-id="…">` ou `<script defer data-domain="legantis.net" src="https://plausible.io/js/script.js">`) puis `<script src="…/assets/mesure.js" defer>`.
4. Plausible : déclarer les événements ci-dessus comme objectifs (goals) ; Umami : rien à déclarer.
5. Mentions légales, CNDP, CLAUDE.md (voir plus haut) ; relancer `outils/controles_site.py`, `outils/largeurs.js`, Lighthouse et `node mesure/test_mesure.js`.
6. Tableau de bord : celui de l'outil (visiteurs, pages, sources, événements) et `node worker/rapport.mjs` (demandes réelles) ; un modèle de point mensuel est dans `docs/mesure-audience.md`.

## Meta Pixel : préparé, non activé (30/10/2026)

`mesure/pixel.js` n'est chargé par aucune page. Testé par `mesure/test_pixel.js` : aucune requête avant l'accord, refus conservé, `Lead` une seule fois avec `eventID`, `Contact` au clic WhatsApp ou téléphone, aucune donnée saisie transmise.

**Le Pixel ne peut pas être activé tel quel.** Délibération CNDP [D-939-2025 du 28/11/2025](https://www.cndp.ma/wp-content/uploads/2025/12/Deliberation-N°-D-939-2025-du-28112025-relative-au-modele-de-declaration-simplifiee-relative-au-traitement-des-donnees-a-caractere-personnel-de-cookies-sur-un-terminal.pdf), lue dans son texte officiel :

| Exigence | Paragraphe | Conséquence pour Legantis |
|---|---|---|
| Déclaration simplifiée préalable (CNDP-FORMS) | § 8 | à déposer avant toute mise en œuvre ; sa référence doit figurer dans l'information au visiteur (§ 6) |
| Consentement préalable pour la publicité personnalisée, par une action claire et explicite, avec possibilité de refuser | § 6 | bandeau prévu dans `pixel.js` |
| Choix conservé six mois au plus | § 6 | fait ; ajouter un bouton du pied relié à `legantisChoixMesure()` |
| Données conservées six mois au plus | § 5 | réglage de conservation à vérifier côté Meta |
| Transfert à l'étranger soumis à autorisation préalable de la CNDP | § 9 | **bloquant** : Meta traite ces données hors du Maroc |
| Profil de l'internaute (habitudes, préférences, comportements) : autorisation préalable, art. 12 | § 3 | **à trancher** : audiences personnalisées, similaires et reciblage en relèvent probablement |
| Information : identité, finalités, données, destinataires et transferts, droits, références des récépissés | § 6 | mentions légales à réécrire |

Recommandation : garder le Pixel éteint. La source des demandes est déjà connue par les paramètres UTM, sans cookie, et les demandes réelles par le mail ou le compteur du Worker. Mesurer ainsi le coût par demande : budget dépensé ÷ demandes reçues portant l'UTM de la campagne. Faire valider le reste par un juriste avant toute activation.

**Mesure d'audience sans cookie** (Umami, Plausible) : cette délibération porte sur les cookies ; elle ne dit rien d'un outil qui n'en dépose pas. La question de la déclaration reste à poser à la CNDP.

Activer, après les autorisations : poser `window.LEGANTIS_PIXEL_ID`, charger `pixel.js` sur les pages concernées, ajouter le bouton de choix au pied, réécrire les mentions légales FR et EN, adapter `outils/controles_site.py`, qui exige « ni cookie » / « no cookies ».
