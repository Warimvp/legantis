# Worker du formulaire de devis

Reçoit le formulaire de la carte `#devis` des accueils de legantis.net et les parcours qualifiants (simulateur, mini-audit, page d'offre : `docs/conversion/README.md`), et les transmet par e-mail à `contact@legantis.net` (API Resend). Avec `Accept: application/json`, il répond en JSON `{ ok, erreurs }` au lieu d'un 303, sur l'origine du site seulement. **Il n'ouvre jamais l'adresse à analyser du mini-audit.**
Le site reste statique et sans script : le navigateur envoie le formulaire en POST, le Worker répond par un 303 vers `/#devis-envoye`
ou `/#devis-echec` (`/en/#…` pour la page anglaise), et la page affiche le bon message par `:target`.

```
navigateur ──POST──▶ Worker (Cloudflare) ──▶ API Resend ──▶ contact@legantis.net (Hostinger)
          ◀─303 /#devis-envoye ou /#devis-echec
```

Le Worker ne stocke rien : ni base, ni KV, observabilité coupée, aucun journal du contenu. Garde-fous : champ piège `site_web`,
contrôle de l'origine (Origin, à défaut Referer), corps de 16 Ko au plus, valeurs de `supports` et `delai` en liste blanche,
5 envois par minute et par adresse IP (binding Rate Limiting : approximatif, par site Cloudflare). Pas de CAPTCHA : Turnstile
chargerait un script de Cloudflare dans la page.

## Mise en service (une fois)

1. **Clé Resend** : tableau de bord Resend → API Keys → *Sending access*, restreinte au domaine `legantis.net`. (Le domaine est déjà vérifié.)
2. **Connexion Cloudflare** : `cd worker && npm install && npx wrangler login`.
3. **Déploiement** : `npx wrangler deploy`. Wrangler propose de créer le sous-domaine `workers.dev` du compte au premier déploiement ; il affiche
   ensuite l'adresse du Worker, `https://legantis-devis.<sous-domaine>.workers.dev`.
4. **Secret** : `npx wrangler secret put RESEND_API_KEY` (coller la clé ; elle n'est jamais écrite dans le dépôt).
5. **Adresse dans le site** : l'adresse affichée à l'étape 3 va dans `action=` de `site/index.html` et `site/en/index.html`
   (fait le 23/10/2026 : `https://legantis-devis.rihla-serveur.workers.dev/`). `python3 outils/controles_site.py` refuse le texte provisoire `REMPLACER`.
6. **Essai réel** : envoyer le formulaire depuis le site, vérifier l'arrivée dans `contact@legantis.net` (et pas dans les indésirables), que
   « Répondre » écrit au visiteur, et que la réponse du Worker ne pose aucun cookie (`curl -si -X POST …` : pas de `Set-Cookie`).
7. Fusionner la branche : `main` se déploie sur GitHub Pages à chaque push.

Changer de clé : `npx wrangler secret put RESEND_API_KEY` à nouveau, puis révoquer l'ancienne chez Resend.

## Réglages (`wrangler.jsonc`)

| Variable | Rôle |
|---|---|
| `SITE_ORIGIN` | origine acceptée et base des redirections (`https://legantis.net`) |
| `MAIL_TO` | destinataire (`contact@legantis.net`) |
| `MAIL_FROM` | expéditeur : une adresse de `legantis.net` (domaine vérifié chez Resend) |
| `RESEND_API_KEY` | **secret**, jamais dans ce fichier |

## Compteur de demandes (préparé le 26/10/2026, **non activé**)

Le Worker sait compter les demandes dans une base **D1** (offre gratuite de Cloudflare : 100 000 lignes écrites et 5 millions lues par jour, 5 Go ; une demande écrit 2 à 4 lignes). Tant que le binding `MESURES` n'existe pas, il ne compte rien et se comporte exactement comme avant.

**Ce qui est compté** (table `devis_compteur`, une ligne par jour UTC, issue, type de projet, langue, parcours, source et campagne UTM) : `envoye` (Resend a accepté le mail : **c'est le chiffre des demandes reçues**), `doublon` (même demande renvoyée sous 10 minutes : ni deuxième mail ni deuxième comptage, la personne revoit « envoyé »), `echec_envoi` (Resend a répondu une erreur), `exception` (Resend injoignable ou erreur du Worker), `invalide`, `piege`, `limite`. Une simple ouverture du formulaire n'est jamais comptée : seul le POST l'est. **Aucune donnée personnelle** : pas de nom, d'e-mail, de téléphone, d'entreprise, de texte ni d'adresse IP. L'anti-doublon garde 10 minutes une empreinte SHA-256 de (sel, e-mail, projet), jamais le contenu, purgée à chaque requête. Une panne de D1 ne bloque jamais un envoi.

**Activer** (décision du user, une fois ; tout est gratuit dans l'offre actuelle) :

1. `npx wrangler@4 d1 create legantis-mesures` → noter le `database_id` affiché.
2. Ajouter à `wrangler.jsonc` :
   ```jsonc
   "d1_databases": [ { "binding": "MESURES", "database_name": "legantis-mesures", "database_id": "<id affiché>", "migrations_dir": "migrations" } ]
   ```
3. `npx wrangler@4 d1 migrations apply legantis-mesures --remote` (crée les deux tables).
4. Facultatif : `npx wrangler@4 secret put MESURE_SEL` (une valeur aléatoire ; sans elle, un sel fixe est utilisé).
5. **Mentions légales FR + EN, § Données personnelles**, à compléter AVANT le déploiement, par exemple : « Pour mesurer le nombre de demandes, nous comptons chaque envoi par jour, type de projet et langue, sans aucune donnée personnelle. Pour éviter qu'une même demande parte deux fois, une empreinte chiffrée et irréversible de votre adresse et de votre message est conservée dix minutes, puis effacée. »
6. `npx wrangler@4 deploy`, puis un envoi d'essai et `node rapport.mjs`.

**Lire les chiffres** : `node rapport.mjs [--jours 30]` (base distante, compte Cloudflare déjà connecté) affiche les demandes reçues, les doublons, les échecs techniques, les refus, et la répartition par type, langue et semaine ; ce que la base ne peut pas savoir (visiteurs, clics, taux de conversion) y est écrit « non disponible ».

## Tests

```
node --test test/*.test.js     # 56 tests, aucune dépendance : fetch, la limite et D1 (une vraie base SQLite en mémoire qui exécute la migration) sont des doubles
node test/sabotages.mjs        # 74 copies volontairement cassées : chacune doit faire échouer les tests
```

Les champs des formulaires HTML doivent être lus par le Worker (`donnees.get('…')`) : `outils/controles_site.py` les compare.
