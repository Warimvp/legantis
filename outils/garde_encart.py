"""Règle de l'encart d'accueil de l'offre Visibilité, utilisée par outils/avant_production.py (décision D11a du propriétaire, 08/11/2026).
Sans encart (`offre_ouverture` absent), tout reste comme avant. Avec un encart, il n'est admis que s'il est EXACTEMENT celui qui a été validé :
validé (`valide` à true), qui mène à la page d'offre, dont le seul montant écrit est le prix du pack Visibilité, sans formule de promotion ou d'urgence,
avec `mise_en_avant` défini et limité aux pages autorisées, et sans autre fourchette de prix publiée que celle du Site Visibilité au même montant.
Toute autre configuration est refusée : un nouveau cas à admettre se décide par écrit, puis se code ici."""
import re

PAGES_ADMISES = {'', 'creation-site-web-casablanca/', 'prix-site-web-maroc/'}   # guide des prix : décision du propriétaire du 11/11/2026 (« avec fourchettes »)
LIEN_ADMIS = 'offre-lancement/'
MOTS_INTERDITS = re.compile(r'promo|remise|réduction|reduction|solde|urgent|dernière|dernières|dernier|places?\b|compte à rebours|gratuit(?!\w)|-\s?\d+\s?%|\d+\s?%', re.I)


def _montants(texte):
    return {int(re.sub(r'\D', '', m)) for m in re.findall(r'(\d[\d\s  .]*)\s*(?:MAD|DH)\b', texte or '', re.I) if re.sub(r'\D', '', m)}


def encart_admis(conf):
    """(admis, motif). `motif` vide si admis."""
    encart = conf.get('offre_ouverture')
    if not encart:
        return True, ''
    if not isinstance(encart, dict) or encart.get('valide') is not True:
        return False, "encart d'accueil non validé (valide doit valoir true)"
    if encart.get('lien') != LIEN_ADMIS:
        return False, f"l'encart doit mener à {LIEN_ADMIS} seulement"
    pages = conf.get('mise_en_avant')
    if not isinstance(pages, list) or not set(pages) <= PAGES_ADMISES:
        return False, f"mise_en_avant absent ou page non autorisée ({sorted(set(pages or []) - PAGES_ADMISES) if isinstance(pages, list) else 'absent'})"
    prix = {p.get('prix_mad') for p in conf.get('packs') or [] if p.get('id') == 'visibilite' and p.get('valide') is True and isinstance(p.get('prix_mad'), int)}
    if len(prix) != 1:
        return False, "l'encart exige un pack Visibilité validé, à un seul prix"
    texte = f"{encart.get('titre', '')} {encart.get('texte', '')}"
    if MOTS_INTERDITS.search(texte):
        return False, "formule de promotion, de remise ou d'urgence dans l'encart"
    montants = _montants(texte)
    if montants - prix:
        return False, f"montant autre que le prix du pack Visibilité dans l'encart : {sorted(montants - prix)}"
    for cle, f in (conf.get('fourchettes') or {}).items():
        if cle.startswith('_') or not isinstance(f, dict):
            continue
        if f.get('valide') is True:
            if cle != 'visibilite':
                return False, f"fourchette publiée pour {cle} : seule celle du Site Visibilité est admise"
            if f.get('a_partir_de') not in prix or f.get('jusqu_a') is not None or f.get('regime') != 'HT':
                return False, 'la fourchette Visibilité doit valoir « à partir du prix du pack », en HT, sans maximum'
    return True, ''
