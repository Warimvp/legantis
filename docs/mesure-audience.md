# Mesure d'audience et suivi commercial — préparé, non activé (26/10/2026)

**État actuel : aucun outil de mesure sur legantis.net.** Les mentions légales (FR + EN, § Données personnelles) affirment « ni cookie, ni outil de mesure d'audience, ni pixel publicitaire » : c'est exact aujourd'hui et **doit être réécrit avant** toute activation. Rien n'a été installé ni aucun compte créé ; ce document prépare la décision.

## Ce qui se mesure déjà, sans rien ajouter

| Question | Où regarder |
|---|---|
| Combien de demandes de devis arrivent | La boîte `contact@legantis.net` (objet « Demande de devis — <type> — <nom> » depuis le 26/10/2026) ; le tableau de bord Resend compte les e-mails envoyés par le Worker |
| Quel type de projet est demandé | Le champ « Type de projet » du formulaire, recopié dans l'objet du mail |
| Ce que Google montre et ce qui est cliqué depuis Google | Search Console (requêtes, impressions, clics par page) ; Bing Webmaster pour Bing |
| Les demandes venues des publicités Meta | Le gestionnaire de publicités (formulaire instantané), hors du site |

## Options évaluées

| Option | Coût | Cookie | Requête vers un tiers | Événements personnalisés | Remarque |
|---|---|---|---|---|---|
| **Plausible** | abonnement payant (essai gratuit) | non | oui (plausible.io), sauf si on le sert par le Worker Cloudflare (proxy documenté par Plausible) | oui | **Déjà prévu dans Atlasya** (`Medlink/apps/web-patient/src/lib/analytics.js`, chargé seulement si `VITE_PLAUSIBLE_DOMAIN` est défini) : un seul fournisseur pour les deux sites si le compte existe |
| Umami | auto-hébergé (serveur + base) ou offre en ligne, conditions à vérifier | non | oui, sauf auto-hébergement | oui | plus de maintenance si auto-hébergé |
| Cloudflare Web Analytics | gratuit | non | oui (static.cloudflareinsights.com) | **non** | ne répond pas à la demande (pas de clics, pas d'envois) |
| Compteur dans le Worker du devis (Workers Analytics Engine, même compte Cloudflare) | gratuit dans les limites de Cloudflare | non | **aucune** côté visiteur | seulement l'issue du formulaire | zéro script sur le site ; ne voit pas les clics |

**Recommandation** : en deux temps. (1) Sans script : compter dans le Worker l'issue de chaque envoi (`envoye`, `echec`, `piege`, `limite`) avec le type de projet et la langue, **sans aucune donnée personnelle** ; c'est le chiffre qui compte le plus (les demandes réelles) et il ne demande ni bannière ni outil tiers. (2) Si les clics doivent être mesurés : Plausible servi par le Worker (première partie, sans cookie), avec la liste d'événements ci-dessous. Les deux demandent un `wrangler deploy` et une réécriture des mentions légales : à décider par le user.

## Faisabilité des cinq suivis demandés (V2, 26/10/2026)

| Suivi | Possible sans script ? | Comment |
|---|---|---|
| Visites des pages de prestation | **Non** : GitHub Pages ne donne aucun journal d'accès ; Search Console ne compte que les arrivées depuis Google | un outil de mesure (Plausible servi par le Worker, ou équivalent), événement de page vue avec le chemin |
| Consultation des études de cas | Non (même raison) | page vue sur `/etude-de-cas-*/` et `/en/case-study-*/` |
| Clics vers les projets | Non | `produit_clic` (tableau ci-dessous) |
| Clics sur les demandes de devis | Non | `devis_clic` |
| Envois de devis réellement réussis | **Oui** | compteur dans le Worker (il est le seul à savoir que Resend a accepté le mail) ; en attendant, l'objet des mails reçus (« Demande de devis — <type> — … ») et le tableau de bord Resend |

Conclusion : seul le dernier suivi se fait sans script ni outil tiers. Les quatre autres demandent un outil de mesure côté visiteur, donc une décision du user (outil, compte, mentions légales).

## Événements préparés

Les éléments à suivre portent déjà des classes stables : **aucun attribut n'a été ajouté au HTML** (rien de mort dans les pages). Un futur script s'y accroche par sélecteur.

| Événement | Déclencheur (sélecteur existant) | Propriétés autorisées |
|---|---|---|
| `devis_clic` | `a.barre-cta`, `a.menu-devis`, `a.pied-devis`, `a.badge`, `a.bouton--plein[href$="#devis"]` | page, emplacement (classe), langue |
| `formulaire_vu` | la carte `#devis` entre dans l'écran | page, langue |
| `formulaire_envoye` | arrivée sur `#devis-envoye` (le Worker renvoie vers cette ancre après un envoi réel) ; mieux : compté par le Worker | type de projet, langue |
| `formulaire_echec` | arrivée sur `#devis-echec` ; mieux : compté par le Worker | langue |
| `email_clic` | `a[href^="mailto:"]` | page, emplacement |
| `telephone_clic` | `a[href^="tel:"]` | page |
| `whatsapp_clic` | *aucun lien WhatsApp sur le site* (voir CLAUDE.md « En attente ») | — |
| `realisations_vues` | la section `#produits` entre dans l'écran | page, langue |
| `produit_clic` | `.titre .liens a` (le nom du produit vient de l'`aria-labelledby` de l'`article`) | produit, destination (App Store, site, étude de cas) |

**Jamais dans un événement** : nom, e-mail, téléphone, entreprise, texte du projet, adresse IP, identifiant de visiteur.

## Avant d'activer quoi que ce soit

1. Choisir l'option (et créer le compte : à faire par le user, jamais par Claude).
2. Réécrire le § Données personnelles des mentions légales FR + EN pour décrire **exactement** ce qui est mesuré, par qui, où, combien de temps ; retirer « ni outil de mesure d'audience ». `outils/controles_site.py` exige aujourd'hui « ni cookie » / « no cookies » : à garder vrai (les deux options recommandées sont sans cookie).
3. Si un script est ajouté : c'est une exception à la règle « un seul script, réservé aux effets à la souris » (CLAUDE.md) ; il doit rester sans cookie ni stockage, et être ajouté aux 20 pages.
4. Loi 09-08 / CNDP : vérifier si une déclaration est nécessaire pour ce traitement (non vérifié).
