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
| Packs | `"packs": [ … ]`, chacun avec `"valide": true`, `id` (minuscules et tirets, 20 caractères au plus, connu de `PACKS` dans `worker/src/index.js`), `prix_mad` entier, `regime` `HT` ou `TTC`, `inclus`, `exclus` ; facultatifs : `badge`, `vedette`, `fiche` (`[{ "libelle", "valeur" }]`), `fournir`, `note`, `cta` | cartes sur l'accueil et la page d'offre, choix dans le formulaire |
| Pages des packs | `"packs_pages": ["offre-lancement/"]` (facultatif) | packs, FAQ des packs, choix du formulaire et FAQ du coût seulement sur ces pages ; ailleurs, rendu comme sans pack |
| FAQ des packs | `"packs_faq": [ { "question", "reponse" } ]` | accueil et page d'offre |
| Offre de l'ouverture | `"offre_ouverture": { "valide": true, "titre", "texte", "lien" }` | encart sous les boutons de l'accueil |
| Fourchettes du simulateur | `"grille": { "valide": true, "devise": "MAD", "regime": "HT", "postes": … }` | fourchette indicative à l'étape 4 |

Forme d'un poste de la grille :

```json
{ "vitrine": { "valide": true, "base": { "min": 0, "max": 0 }, "options": { "blog": { "min": 0, "max": 0 }, "pages:4a6": { "min": 0, "max": 0 } } } }
```

Une option sélectionnée sans prix ramène au message d'estimation personnalisée : jamais de total partiel.

Si des packs sont publiés, adapter à la main la réponse de la FAQ de l'accueil « Combien coûte un projet ? » et celle sur le simulateur.

### Offres de lancement (pilote, `/offre-lancement/`)

`config/commercial.json` porte un pack (`visibilite`, le Site Visibilité) limité par `packs_pages` à `/offre-lancement/`, qui reste `noindex`, hors sitemap et reliée d'aucune page du sitemap. Le bloc de la page est `<!-- commercial:packs cible=demande exclus=visible -->` : les limites sont ouvertes, pas repliées. Le bouton d'une carte, ou `?pack=` dans l'adresse, présélectionne la formule du formulaire (`conversion.js`).

`controles_site.py` vérifie sur cette page : cartes et prix égaux à la configuration, régime écrit, « hors taxes » en clair, tout montant TTC indicatif et sous réserve du régime de TVA, formules du formulaire égales à la configuration et connues du Worker, aucun compte à rebours ni formule d'urgence, explication de la limite des cinq contrats, mention fictive à côté de chaque capture de modèle, Pack Commandes sans montant, aucun prix de pack hors de `packs_pages`, aucun lien depuis les pages du sitemap. Chaque critère est éprouvé par un sabotage dans `test_commercial.py`.

Relier la page ou l'indexer est une décision du propriétaire : retirer `noindex`, l'ajouter au sitemap, la retirer de `HORS_SITEMAP` et du contrôle des liens dans `controles_site.py`, et revoir le contrôle des packs de `avant_production.py`.

## Formulaires

| Parcours | Page | Retour | Champs obligatoires côté serveur |
|---|---|---|---|
| générique | accueils FR et EN (`#devis`) | `/` ou `/en/` | nom, e-mail, projet |
| `simulateur` | `/estimer-mon-projet/` | même page | + entreprise, téléphone, type, budget, délai, consentement |
| `offre` | `/offre-lancement/` | même page | + entreprise, téléphone, type, budget, consentement (formule facultative : `visibilite`, `essentiel`, `business`, `starter` ; seules celles de `config/commercial.json` sont proposées) |
| `audit` | `/audit-gratuit/` | même page | nom, e-mail, entreprise, téléphone, adresse du site, consentement |

Le Worker n'ouvre jamais l'adresse à analyser. Elle est seulement filtrée (ni IP, ni réseau interne, ni port, ni identifiants), pour que le lien reçu par mail soit sain.

**Pour automatiser un jour l'analyse**, passer par un service tiers fiable qui charge la page lui-même (API PageSpeed Insights, avec clé) et n'exécuter aucune requête serveur vers l'adresse saisie.

## Suivi des prospects

Pas de nouvelle base : le Worker continue de ne rien stocker. Le suivi se tient dans `~/Documents/bureaux/Legantis-Acquisition/legantis-suivi-commercial.xlsx`, déjà en place. Chaque mail se termine par une ligne à coller dans l'onglet Prospects, à partir de la colonne Date (Date à Délai).

Une formule demandée sur la page d'offre (`pack`) apparaît dans l'objet du mail (« Demande de devis — Site Visibilité — Nom ») et dans la colonne Demande de la ligne (« Page d'offre de lancement · Site Business statique · Site vitrine »). Sans formule, l'objet garde le type de projet, comme avant.

**Envois de test** : un envoi dont la campagne porte `utm_source=test`, ou dont le nom ou l'entreprise contient « NE PAS TRAITER » (casse indifférente), part normalement mais est marqué : objet préfixé `[TEST]`, avertissement en tête du mail, date de la ligne écrite « [TEST] aaaa-mm-jj ». Collée par erreur, cette ligne reste visible et l'onglet Pilotage, qui compte des dates, l'ignore. Ne jamais la reporter dans le suivi.

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

## Fourchettes indicatives des trois offres (05/11/2026, éteintes)

L'accueil FR porte, dans chaque carte d'offre (Visibilité, Gestion, Applications), un bloc `<!-- commercial:fourchette offre=… -->` vide tant que `config/commercial.json` → `fourchettes.<offre>` n'est pas validé. Pour publier une fourchette, sur accord écrit du propriétaire seulement : renseigner `a_partir_de` (entier, MAD), éventuellement `jusqu_a`, `regime` (`HT` ou `TTC`), mettre `"valide": true`, puis `python3 outils/commercial.py`, `python3 outils/controles_site.py` et `python3 outils/test_commercial.py`. Une valeur à `false`, non entière, sans régime ou avec un maximum inférieur au minimum est refusée ; un montant écrit à la main dans une page est refusé par le contrôle du site. Les hypothèses et leur calcul restent dans le dossier privé, jamais ici.
