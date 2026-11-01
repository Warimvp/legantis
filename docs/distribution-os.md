# Distribution OS : mode d'emploi technique

Démonstration interactive d'un logiciel de distribution, publiée dans `site/realisations/demos/distribution-os/` (hors sitemap, `noindex`). Entreprise, clients, produits et opérations fictifs. Aucune dépendance, aucune étape de construction, aucune requête réseau.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille : bandeau « Démonstration interactive créée par Legantis. Entreprises, opérations et données fictives. », navigation, barre d'outils, icônes (sprite SVG), squelette de chargement, message sans JavaScript. |
| `moteur.js` | Données de départ et règles métier. Tourne dans le navigateur (`window.DOS`) et sous Node (`require`) pour les tests. |
| `graphiques.js` | Colonnes, courbe, mini-courbes, barres horizontales, infobulle. SVG et HTML écrits à la main. |
| `app.js` | Session, routes `#/module/id?filtres`, rendu, composants, tiroirs, fenêtres, menus contextuels, palette Ctrl/⌘ K, notifications. |
| `ecrans.js` | Les huit écrans, les fiches et les fenêtres d'action, les exports CSV. |
| `guide.js` | Scénario guidé en six étapes. |
| `dos.css` | Design system : jetons clair et sombre, composants, adaptation mobile, impression. |

Ordre de chargement : `moteur`, `graphiques`, `app`, `ecrans`, `guide`, tous en `defer`. `app.js` démarre au `DOMContentLoaded`.

## Moteur

- Montants en centimes de MAD (entiers), dates en numéros de jour UTC : aucun arrondi flottant ni fuseau horaire.
- Données de départ : 18 semaines d'activité rejouées avec les mêmes actions que le visiteur (graine fixe). Même date de référence, mêmes données. Le dimanche, la démonstration se place au samedi.
- Une action valide tout avant d'écrire ; refusée, elle laisse l'état intact.
- Statuts : Nouvelle → Confirmée → En préparation → Prête → Expédiée → Livrée ; Annulée depuis les quatre premiers.
- Stock : la confirmation réserve, refusée si le disponible manque ; l'expédition sort le stock et consomme la réservation ; l'annulation libère. Réception fournisseur et inventaire tracés par une pièce. Le stock compté ne descend jamais sous le réservé.
- Paiements : seulement sur une commande expédiée ou livrée, jamais au-delà du reste dû. Relances simulées : après l'échéance, une par jour, trois au plus.
- Droits par rôle (Direction, Commercial, Magasinier, Gestionnaire) appliqués par le moteur.
- `verifierCoherence(etat)` recalcule stock, réservations, sorties, paiements et historiques depuis les pièces et liste les écarts.

## Session

`sessionStorage`, clé `legantis-demo-distribution-os` : la date de référence, les actions du visiteur, le rôle, le thème, l'état du guide. Au chargement, les actions sont rejouées sur les données de départ ; une action qui ne se rejoue plus est écartée. « Réinitialiser » efface la clé. Aucun `localStorage`, aucun cookie, rien d'envoyé : `outils/controles_site.py` le vérifie.

Paramètres d'adresse : `?jour=AAAA-MM-JJ` (date de référence fixe, pour les captures et les vidéos), `?scenario=1` (lance le guide), `?role=magasinier`, `?theme=sombre`, et les `utm_*`, transmis au lien de retour vers `/commandes/#demande`.

## Contrôles

```bash
node --test outils/test_distribution_os.js
```

```bash
node outils/parcours_distribution_os.mjs
```

```bash
python3 outils/controles_site.py
```

Les deux premiers sont aussi lancés par `python3 outils/avant_production.py --complet`.

## Captures

```bash
node outils/captures_distribution_os.js
```

Écrit `site/assets/captures/dos-*.webp` et `demo-distribution-os.webp` depuis la date de référence fixe du 2 novembre 2026. Avec `SORTIE=<dossier> FORMATS=pub`, produit des formats carrés et verticaux hors du dépôt.

## Mise en production et retour arrière

Le Worker ne change pas. La publication suit `CLAUDE.md` : accord du propriétaire, un seul commit au-dessus de `origin/main`, contrôlé par `python3 outils/avant_production.py --complet`.

Retour arrière : `git revert` du commit publié, puis push sur `main`. La démonstration ne stocke rien côté serveur ; les sessions ouvertes dans des onglets disparaissent avec eux.
