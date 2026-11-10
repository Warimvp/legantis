# Avis clients

Recueil d'avis vérifiés : un client donne son avis sur une page privée, l'avis arrive par e-mail, et la publication sur le site se fait à la main, seulement sous la forme que le client a acceptée. Rien n'est publié automatiquement, rien n'est stocké hors de la boîte `contact@legantis.net`.

## Ce qui existe

- **Pages de recueil** : `/donner-mon-avis/` (FR) et `/en/leave-a-review/` (EN). `noindex`, hors sitemap, reliées par aucune autre page : le lien s'envoie au client, il ne se trouve pas en naviguant. Note de 1 à 5, texte (20 à 1 500 caractères), nom, e-mail, fonction, entreprise et projet réalisé (ces trois derniers facultatifs), accord de publication (avec le nom, en initiales, ou retour privé), consentement.
- **Worker** : `POST /avis` (`worker/src/index.js`, section « Avis clients »). Mêmes garde-fous que les devis (origine, format, taille, champ piège, limite de débit). Le mail a pour objet `Avis client — 5/5 — publiable avec son nom — Nom` (jamais « Demande de devis » : ce n'est pas un prospect) et rappelle l'accord donné, avec sa date.
- **Affichage** : styles `.avis-clients` et `.avis-client` dans `site/assets/site.css`. Aucune page n'affiche d'avis tant qu'aucun avis réel n'a été reçu et accepté.
- **Mentions légales** : paragraphe `#avis-clients` (FR) et `#customer-reviews` (EN), auquel renvoie la case de consentement.

## Mise en service

Le Worker d'abord (`npx wrangler@4 deploy` dans `worker/`), puis le site : une page publiée avant le Worker posterait sur une adresse que l'ancien Worker traite comme un devis ; il le refuse (champ « projet » absent) et la page affiche l'échec, sans rien envoyer.

## Recueillir un avis

1. Après une prestation livrée, envoyer au client le lien `https://legantis.net/donner-mon-avis/` (ou `/en/leave-a-review/`).
2. L'avis arrive dans `contact@legantis.net`. **Vérifier que l'auteur est bien un client** : la page est publique, n'importe qui peut l'envoyer.
3. **Garder le mail** : c'est la preuve de l'accord. L'avis publié porte sa date (`data-accord`).
4. « Retour privé » : ne jamais le publier, ni en entier ni en extrait.

## Publier un avis

1. Ne publier que le texte du client, sans le réécrire. Un extrait est possible s'il ne change pas le sens, et **seulement après l'avoir montré au client** (la page de recueil et les mentions légales le promettent).
2. Forme « complet » : nom, fonction, entreprise. Forme « initiales » : initiales seulement (par exemple « A. B. »), sans entreprise ni fonction.
3. Gabarit (une section par page qui en affiche ; les textes sont en `<p>` pour le curseur de `lumiere.js`) :

```html
<section class="section" id="avis" aria-labelledby="avis-titre">
  <div class="enveloppe">
    <div class="entete">
      <h2 id="avis-titre">Ils ont travaillé <em>avec nous.</em></h2>
    </div>
    <ul class="avis-clients" role="list">
      <li>
        <figure class="avis-client" data-accord="AAAA-MM-JJ" data-forme="complet">
          <p class="avis-note"><span class="avis-etoiles" aria-hidden="true">★★★★★</span>5/5</p>
          <blockquote><p>Texte du client, tel quel.</p></blockquote>
          <figcaption><p><b>Prénom Nom</b></p><p>Fonction, Entreprise · Projet</p></figcaption>
        </figure>
      </li>
    </ul>
  </div>
</section>
```

En initiales : `data-forme="initiales"` et une seule ligne dans `figcaption`, `<p><b>A. B.</b></p>`.

4. `python3 outils/controles_site.py` refuse : un avis sans `data-accord` ou `data-forme`, un avis « initiales » qui montre un nom ou une entreprise, une note sans « n/5 » lisible, et tout `Review` ou `AggregateRating` en JSON-LD (Google n'affiche pas d'étoiles pour les avis qu'une entreprise publie sur elle-même, et une note moyenne sur peu d'avis tromperait).
5. Ne jamais publier de moyenne ni de nombre d'avis tant qu'il y en a peu, ni un avis retouché, ni un avis dont l'auteur n'est pas un client.

## Retirer un avis

Sur simple demande à `contact@legantis.net` : retirer le bloc `<li>` de la page, publier, répondre au client. Garder le mail deux ans au plus après le retrait (mentions légales).
