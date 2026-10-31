# Conversion : mode d'emploi

Couche commerciale ajoutée le 30/10/2026. Le rapport de validation et les analyses restent hors du dépôt public.

## Principe

Le site reste statique, sans build. Ce qui est publié est ce qui est écrit dans `site/`. Les décisions commerciales vivent dans `config/commercial.json`, et `outils/commercial.py` les recopie dans des blocs balisés des pages.

```text
<!-- commercial:packs cible=estimer --> … <!-- /commercial -->
```

Sans valeur validée, le bloc reste vide. Le dépôt est **public** : aucune hypothèse de prix dans `config/`, `docs/` ou `site/`. Les hypothèses vont dans `~/Documents/bureaux/Legantis-Acquisition/`, à côté des documents des Phases B et C.

| Commande | Effet |
|---|---|
| `python3 outils/commercial.py` | écrit `config/commercial.json` dans `site/` |
| `python3 outils/commercial.py --verifier` | sort 1 si `site/` ne correspond pas à la configuration |
| `python3 outils/commercial.py --apercu /tmp/apercu` | copie le site et y applique `commercial.apercu.json` du dossier privé, avec bandeau rouge et `noindex` |
| `python3 outils/controles_site.py` | refuse tout montant ou lien WhatsApp non configuré |

## Activer une fonction

| Fonction | Dans `config/commercial.json` | Ce qui change |
|---|---|---|
| WhatsApp | `"whatsapp": { "numero": "2126XXXXXXXX" }` | barre mobile, lien discret à l'ordinateur, lien du simulateur, du mini-audit et de la page d'offre, messages préremplis par type |
| Packs | `"packs": [ … ]`, chacun avec `"valide": true`, `prix_mad` entier, `regime` `HT` ou `TTC`, `inclus`, `exclus` | cartes sur l'accueil et la page d'offre, choix dans le formulaire |
| FAQ des packs | `"packs_faq": [ { "question", "reponse" } ]` | accueil et page d'offre |
| Offre de l'ouverture | `"offre_ouverture": { "valide": true, "titre", "texte", "lien" }` | encart sous les boutons de l'accueil |
| Fourchettes du simulateur | `"grille": { "valide": true, "devise": "MAD", "regime": "HT", "postes": … }` | fourchette indicative à l'étape 4 |

Forme d'un poste de la grille :

```json
{ "vitrine": { "valide": true, "base": { "min": 0, "max": 0 }, "options": { "blog": { "min": 0, "max": 0 }, "pages:4a6": { "min": 0, "max": 0 } } } }
```

Une option sélectionnée sans prix ramène au message d'estimation personnalisée : jamais de total partiel.

Si des packs sont publiés, adapter à la main la réponse de la FAQ de l'accueil « Combien coûte un projet ? » et celle sur le simulateur.

## Formulaires

| Parcours | Page | Retour | Champs obligatoires côté serveur |
|---|---|---|---|
| générique | accueils FR et EN (`#devis`) | `/` ou `/en/` | nom, e-mail, projet |
| `simulateur` | `/estimer-mon-projet/` | même page | + entreprise, téléphone, type, budget, délai, consentement |
| `offre` | `/offre-lancement/` | même page | + entreprise, téléphone, type, budget, consentement |
| `audit` | `/audit-gratuit/` | même page | nom, e-mail, entreprise, téléphone, adresse du site, consentement |

Le Worker n'ouvre jamais l'adresse à analyser. Elle est seulement filtrée (ni IP, ni réseau interne, ni port, ni identifiants), pour que le lien reçu par mail soit sain.

**Pour automatiser un jour l'analyse**, passer par un service tiers fiable qui charge la page lui-même (API PageSpeed Insights, avec clé) et n'exécuter aucune requête serveur vers l'adresse saisie.

## Suivi des prospects

Pas de nouvelle base : le Worker continue de ne rien stocker. Le suivi se tient dans `~/Documents/bureaux/Legantis-Acquisition/legantis-suivi-commercial.xlsx`, déjà en place. Chaque mail se termine par une ligne à coller dans l'onglet Prospects, à partir de la colonne Date (Date à Délai).

| Statut demandé | Classeur | `legantis-crm` |
|---|---|---|
| Nouveau | Nouveau | `demande` |
| À contacter | absent, à ajouter si utile | `demande` |
| Contacté | Contacté | `demande` |
| Qualifié | Qualifié (et Diagnostic fait) | `demande` |
| Devis envoyé | Devis envoyé | `devis_envoye` |
| Gagné | Signé | `signe` |
| Perdu | Perdu | `perdu` |

**`legantis-crm`** (`~/Projects/legantis-crm`) reste l'outil prévu pour plus tard, pas encore en service.

Avant de le brancher : lire le `Reply-To` du mail (l'expéditeur est `formulaire@legantis.net`), ajouter à son analyseur les libellés de ce mail et son test de contrat, qui ne lit que les `mailto:`, et faire aboutir le dossier CNDP qu'il exige avant toute donnée réelle.

## Mise en production, dans l'ordre

1. Depuis la branche candidate à un seul commit : `python3 outils/avant_production.py --complet`. Si `origin/main` a bougé, refaire la fusion : `/commandes/` et son Worker doivent rester intacts.
2. Déployer le Worker d'abord : `npx wrangler@4 deploy` dans `worker/`. Une page neuve avec l'ancien Worker perd ses champs et ses retours.
3. Fusionner dans `main`, ce qui publie `site/` sur GitHub Pages.
4. Faire un essai réel par formulaire et vérifier la réception dans la boîte Hostinger.

## Tests

```bash
node --test worker/test/*.test.js
```

```bash
node worker/test/sabotages.mjs
```

```bash
python3 outils/controles_site.py
```

```bash
python3 outils/test_commercial.py
```

```bash
node outils/test_estimation.js
```

```bash
node outils/parcours_test.mjs
```

```bash
node outils/sabotages_parcours.mjs
```

```bash
node outils/largeurs.js
```

```bash
node mesure/test_mesure.js
```

```bash
node mesure/test_pixel.js
```

```bash
python3 outils/avant_production.py --complet
```
