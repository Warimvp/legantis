# Worker du formulaire de devis

Reçoit le formulaire de la carte `#devis` des accueils de legantis.net et le transmet par e-mail à `contact@legantis.net` (API Resend).
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
5. **Adresse dans le site** : remplacer `legantis-devis.REMPLACER.workers.dev` par l'adresse réelle dans `action=` de `site/index.html` et
   `site/en/index.html`. `python3 outils/controles_site.py` échoue tant que `REMPLACER` y figure.
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

## Tests

```
node --test test/*.test.js     # 17 tests, aucune dépendance : fetch et le binding de limite sont des doubles
node test/sabotages.mjs        # 22 copies volontairement cassées : chacune doit faire échouer les tests
```

Les champs que le Worker lit (`donnees.get('…')`) doivent être ceux du formulaire HTML : `outils/controles_site.py` les compare.
