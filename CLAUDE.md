# Legantis, site vitrine

Site statique en HTML et CSS, sans étape de construction, de **LEGANTIS DIGITAL SERVICE SAS**. Il est publié sur https://legantis.net par GitHub Pages à chaque push sur `main`. Le dossier `worker/` contient le Worker Cloudflare qui reçoit les formulaires.

**Ce dépôt est public.** Les notes de travail sont dans un fichier privé, importé ci-dessous. S'il existe sur ta machine, lis-le avant d'agir et tiens-le à jour.

@~/Documents/bureaux/Legantis-Acquisition/documents-internes/CLAUDE-legantis-interne.md

## Ce qui ne va jamais dans ce dépôt

Prix ou hypothèses de prix, prospects, stratégie commerciale, état réel des produits, comptes, adresses personnelles, secrets. `outils/controles_site.py` et `outils/avant_production.py` refusent une partie de ces contenus ; le reste dépend de la relecture.

## Structure

- `site/` : les pages publiées, sans aucune étape de construction. `site/assets/site.css` est la feuille unique.
- `site/assets/lumiere.js` : effets à la souris. `site/assets/conversion.js` : formulaires et simulateur. Le site fonctionne sans script.
- `worker/` : Worker des formulaires, tests dans `worker/test/`, mise en service dans `worker/README.md`.
- `config/commercial.json` : valeurs commerciales de production, appliquées à `site/` par `outils/commercial.py`.
- `mesure/` : mesure préparée, non activée. `docs/` : modes d'emploi techniques.
- `outils/` : contrôles du site.

## Contrôles

Depuis la racine du dépôt :

```bash
python3 outils/controles_site.py
```

```bash
node outils/largeurs.js
```

```bash
node outils/parcours_test.mjs
```

Depuis `worker/` :

```bash
node --test test/*.test.js
```

```bash
node test/sabotages.mjs
```

Un contrôle qui ne peut pas échouer ne prouve rien : éprouve chaque nouveau critère sur une copie volontairement cassée. Après une modification de contenu, relance `python3 outils/lastmod.py`.

## Publier

Jamais sans l'accord du propriétaire. Un seul commit au-dessus de `origin/main`, contrôlé par :

```bash
python3 outils/avant_production.py --complet
```

Si le Worker change, déploie-le d'abord avec `npx wrangler@4 deploy` dans `worker/`, puis pousse le site. Les formulaires déjà publiés doivent continuer à fonctionner avec la nouvelle version.

## Lancer

Serveur `legantis-site`, port 5195, déclaré dans `~/.claude/launch.json`.
