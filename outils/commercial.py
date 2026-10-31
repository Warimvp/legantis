"""Applique les décisions commerciales au site : tarifs, packs, offre de lancement, numéro WhatsApp, grille du simulateur.

Le site reste statique et sans build : ce qui est publié est toujours ce qui est écrit dans site/. Ce script réécrit seulement les blocs balisés
<!-- commercial:nom clé=valeur --> … <!-- /commercial --> des pages, à partir de config/commercial.json (valeurs de production). Tant qu'une valeur n'y figure
pas, le bloc reste vide (ou réduit à ce qui ne dépend d'aucune décision) : aucun prix, aucun lien WhatsApp.

    python3 outils/commercial.py                 écrit les blocs dans site/ depuis config/commercial.json
    python3 outils/commercial.py --verifier      sort 1 si site/ ne correspond pas à config/commercial.json
    python3 outils/commercial.py --apercu DOSSIER  copie site/ dans DOSSIER et y applique les hypothèses non validées (fichier privé APERCU ci-dessous)

Le dépôt est public : les hypothèses de prix ne vont jamais dans config/ ni dans site/, seulement dans ~/Documents/bureaux/Legantis-Acquisition/. L'aperçu porte un bandeau et
un noindex ; il sert à montrer les pages tarifaires avant décision, jamais à publier. Un pack n'est écrit dans site/ que s'il porte "valide": true, un prix entier
et un régime "HT" ou "TTC" : voir docs/conversion/README.md."""
import json, os, re, shutil, sys
from urllib.parse import quote

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = os.path.join(RACINE, 'site')
CONFIG = os.path.join(RACINE, 'config', 'commercial.json')
APERCU = os.environ.get('LEGANTIS_APERCU') or os.path.expanduser('~/Documents/bureaux/Legantis-Acquisition/commercial.apercu.json')
BLOC = re.compile(r'<!-- commercial:([a-z-]+)((?: [a-z]+=[^ >]+)*) -->(.*?)<!-- /commercial -->', re.S)

MESSAGES_WHATSAPP = {
    'general': "Bonjour Legantis, je souhaite parler d'un projet.",
    'vitrine': "Bonjour Legantis, je souhaite créer un site vitrine pour mon entreprise.",
    'ecommerce': "Bonjour Legantis, je souhaite créer un site e-commerce.",
    'web': "Bonjour Legantis, je souhaite développer une application web.",
    'mobile': "Bonjour Legantis, je souhaite développer une application mobile.",
    'logiciel': "Bonjour Legantis, je souhaite un logiciel de gestion pour mon entreprise.",
    'autre': "Bonjour Legantis, j'ai un besoin à vous présenter.",
    'audit': "Bonjour Legantis, je souhaite un mini-audit de mon site.",
    'offre': "Bonjour Legantis, je souhaite en savoir plus sur votre offre de lancement.",
    'commandes': "Bonjour Legantis, je souhaite un diagnostic pour le suivi de mes commandes.",
}
SVG_WHATSAPP = '<svg class="logo-reseau" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-.9 1.100-.2.200-.3.200-.6.100-.3-.200-1.300-.5-2.400-1.500-.9-.8-1.500-1.800-1.700-2.100-.2-.3 0-.5.100-.6l.5-.5c.1-.2.200-.3.300-.5.100-.200 0-.4 0-.5-.1-.1-.7-1.700-1-2.300-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.100-.8.400-.3.300-1 1-1 2.500s1.100 2.900 1.200 3.100c.2.200 2.100 3.200 5.100 4.500.7.300 1.300.5 1.700.6.700.2 1.400.2 1.900.100.600-.1 1.800-.7 2-1.400.200-.7.200-1.300.200-1.400-.1-.1-.3-.2-.6-.4zM12 2a10 10 0 0 0-8.600 15L2 22l5.100-1.300A10 10 0 1 0 12 2zm0 18.200c-1.500 0-3-.4-4.300-1.200l-.3-.2-3 .8.800-2.900-.2-.3A8.200 8.200 0 1 1 12 20.200z"/></svg>'


def lire_config(chemin):
    with open(chemin, encoding='utf-8') as f:
        return json.load(f)


def echapper(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def montant(n):
    return f'{int(n):,}'.replace(',', '&nbsp;')


def controler(config, production):
    """Refuse une configuration qui publierait une donnée incomplète. En aperçu, les valeurs non validées sont admises : c'est leur raison d'être."""
    numero = (config.get('whatsapp') or {}).get('numero', '')
    if numero and not re.fullmatch(r'212[5-7]\d{8}', numero):
        raise SystemExit(f'whatsapp.numero invalide : {numero!r} (attendu 2126XXXXXXXX, sans + ni espace)')
    if not production:
        return
    for pack in config.get('packs') or []:
        if pack.get('valide') is not True:
            raise SystemExit(f"pack {pack.get('id')} : \"valide\": true manquant, refus de le publier")
        if not isinstance(pack.get('prix_mad'), int) or pack['prix_mad'] <= 0 or pack.get('regime') not in ('HT', 'TTC'):
            raise SystemExit(f"pack {pack.get('id')} : prix_mad entier et regime HT ou TTC obligatoires")
        if not pack.get('inclus') or not pack.get('exclus'):
            raise SystemExit(f"pack {pack.get('id')} : inclus et exclus obligatoires (périmètre écrit avant publication)")
    offre = config.get('offre_ouverture')
    if offre and offre.get('valide') is not True:
        raise SystemExit('offre_ouverture : "valide": true manquant, refus de la publier')
    grille = config.get('grille') or {}
    if grille.get('valide') is True and grille.get('regime') not in ('HT', 'TTC'):
        raise SystemExit('grille : regime HT ou TTC obligatoire quand elle est validée')


def lien_whatsapp(config, cle):
    numero = (config.get('whatsapp') or {}).get('numero', '')
    return f"https://wa.me/{numero}?text={quote(MESSAGES_WHATSAPP[cle], safe='')}" if numero else ''


def bloc_offre_ouverture(config, params, prefixe):
    offre = config.get('offre_ouverture')
    if not offre:
        return ''
    return (f'<a class="offre-ouverture" href="{prefixe}{echapper(offre["lien"])}"><span class="surtitre">{echapper(offre["titre"])}</span>'
            f'<span>{echapper(offre["texte"])} <span aria-hidden="true">→</span></span></a>')


def bloc_packs(config, params, prefixe):
    packs = config.get('packs') or []
    if not packs:
        return ''
    cible = params.get('cible', 'estimer')
    cartes = []
    for p in packs:
        lien = '#demande' if cible == 'demande' else f'{prefixe}estimer-mon-projet/?type=vitrine&amp;pack={echapper(p["id"])}'
        inclus = ''.join(f'<li>{echapper(i)}</li>' for i in p['inclus'])
        exclus = ''.join(f'<li>{echapper(i)}</li>' for i in p.get('exclus') or [])
        cartes.append(
            f'<article class="pack{" pack--vedette" if p.get("vedette") else ""}" aria-labelledby="pack-{p["id"]}">'
            f'<h3 id="pack-{p["id"]}">{echapper(p["nom"])}</h3><p class="pack-accroche">{echapper(p["accroche"])}</p>'
            f'<p class="pack-prix"><b>{montant(p["prix_mad"])}</b> <span>MAD {echapper(p["regime"])}</span></p>'
            f'<ul class="pack-inclus" role="list">{inclus}</ul>'
            + (f'<p class="pack-note">{echapper(p["note"])}</p>' if p.get('note') else '')
            + (f'<details class="pack-exclus"><summary>Ce qui n\'est pas inclus</summary><ul role="list">{exclus}</ul></details>' if exclus else '')
            + f'<a class="bouton {"bouton--plein" if p.get("vedette") else "bouton--trait"}" href="{lien}" data-pack="{echapper(p["id"])}">{echapper(p.get("cta", "Choisir cette offre"))} <span class="fleche" aria-hidden="true">→</span></a></article>')
    return '<div class="packs">' + ''.join(cartes) + '</div>'


def bloc_faq_packs(config, params, prefixe):
    faq = config.get('packs_faq') or []
    if not faq or not config.get('packs'):
        return ''
    return ''.join(f'<div class="atout"><h3>{echapper(q["question"])}</h3><p>{echapper(q["reponse"])}</p></div>' for q in faq)


def bloc_faq_cout(config, params, prefixe):
    if config.get('packs'):
        return ("<p>Nos sites web simples ont des formules à prix fixe, présentées dans les offres. Pour une application ou un logiciel, cela dépend de ce qu'il fait&nbsp;: "
                "nombre d'écrans, comptes utilisateurs, langues, supports visés. Nous vous remettons gratuitement un devis détaillé, avec le prix et le délai.</p>")
    return ("<p>Cela dépend de ce qu'il fait&nbsp;: nombre d'écrans, comptes utilisateurs, langues, supports visés. Nous ne publions pas de prix unique, car deux projets ne se ressemblent pas&nbsp;: "
            "nous vous remettons gratuitement un devis détaillé, avec le prix et le délai, et vous décidez ensuite, librement.</p>")


def bloc_pack_choix(config, params, prefixe):
    packs = config.get('packs') or []
    if not packs:
        return ''
    options = ''.join(f'<option value="{echapper(p["id"])}">{echapper(p["nom"])}</option>' for p in packs)
    return ('<div class="champ"><label for="demande-pack">Formule qui vous intéresse <small>(facultatif)</small></label>'
            f'<select id="demande-pack" name="pack"><option value="">Je ne sais pas encore</option>{options}</select></div>')


def bloc_grille(config, params, prefixe):
    donnees = json.dumps(config.get('grille') or {'valide': False}, ensure_ascii=False, separators=(',', ':'))
    return f'<script type="application/json" id="grille-tarifs">{donnees}</script>'


def bloc_whatsapp(config, params, prefixe):
    cle = params.get('type', 'general')
    lien = lien_whatsapp(config, cle)
    if not lien:
        return ''
    classe = 'bouton bouton--trait lien-whatsapp' if params.get('style') == 'bouton' else 'lien-whatsapp lien-whatsapp--texte'
    messages = ''
    if params.get('dynamique') == 'oui':
        table = {k: v for k, v in MESSAGES_WHATSAPP.items() if k in ('vitrine', 'ecommerce', 'web', 'mobile', 'logiciel', 'autre')}
        messages = f" data-messages='{json.dumps(table, ensure_ascii=False).replace(chr(39), '&#39;')}'"
    if params.get('libelle') == 'court':
        return f'<a class="bouton bouton--trait" href="{lien}">WhatsApp</a>'
    return f'<a class="{classe}" href="{lien}"{messages}>{SVG_WHATSAPP}Écrire sur WhatsApp</a>'


def bloc_contact_rapide(config, params, prefixe):
    """Barre fixe au téléphone (toutes les pages FR) ; le bouton WhatsApp y apparaît seulement si un numéro est configuré, et reste discret à l'ordinateur."""
    cle = params.get('type', 'general')
    cible = params.get('cible', 'estimer')
    suffixe = f'?type={cle}' if cle in ('vitrine', 'ecommerce', 'web', 'mobile', 'logiciel', 'autre') else ''
    principal = ''
    if cible == 'estimer':
        principal = f'<a class="bouton bouton--plein contact-rapide-devis" href="{prefixe}estimer-mon-projet/{suffixe}">Demander un devis gratuit <span class="fleche" aria-hidden="true">→</span></a>'
    elif cible == 'demande':
        principal = '<a class="bouton bouton--plein contact-rapide-devis" href="#demande">Demander mon devis <span class="fleche" aria-hidden="true">→</span></a>'
    lien = lien_whatsapp(config, cle if cle in MESSAGES_WHATSAPP else 'general')
    whatsapp = f'<a class="contact-rapide-wa" href="{lien}" aria-label="Écrire à Legantis sur WhatsApp">{SVG_WHATSAPP}<span>WhatsApp</span></a>' if lien else ''
    if not principal and not whatsapp:
        return ''
    return f'<div class="contact-rapide">{principal}{whatsapp}</div>'


RENDUS = {
    'offre-ouverture': bloc_offre_ouverture, 'packs': bloc_packs, 'faq-packs': bloc_faq_packs, 'pack-choix': bloc_pack_choix,
    'grille': bloc_grille, 'whatsapp': bloc_whatsapp, 'contact-rapide': bloc_contact_rapide, 'faq-cout': bloc_faq_cout,
}


def pages(racine):
    for dossier, _, fichiers in os.walk(racine):
        for nom in fichiers:
            if nom.endswith('.html'):
                yield os.path.join(dossier, nom)


def rendre(html, config, racine, chemin):
    profondeur = os.path.relpath(chemin, racine).count(os.sep)
    prefixe = '../' * profondeur

    def remplacer(m):
        nom, brut = m.group(1), m.group(2).strip()
        if nom not in RENDUS:
            raise SystemExit(f'{chemin} : bloc commercial inconnu « {nom} »')
        params = dict(p.split('=', 1) for p in brut.split()) if brut else {}
        ouverture = f'<!-- commercial:{nom}{" " + brut if brut else ""} -->'
        return f'{ouverture}{RENDUS[nom](config, params, prefixe)}<!-- /commercial -->'
    return BLOC.sub(remplacer, html)


def appliquer(racine, config):
    """Réécrit les blocs ; renvoie la liste des pages modifiées."""
    modifiees = []
    for chemin in pages(racine):
        avant = open(chemin, encoding='utf-8').read()
        apres = rendre(avant, config, racine, chemin)
        if apres != avant:
            modifiees.append((chemin, apres))
    return modifiees


def main():
    args = sys.argv[1:]
    if args[:1] == ['--apercu']:
        if len(args) != 2:
            raise SystemExit('usage : commercial.py --apercu DOSSIER')
        cible = os.path.abspath(args[1])
        if cible == os.path.abspath(SITE) or cible.startswith(os.path.abspath(SITE) + os.sep):
            raise SystemExit("l'aperçu ne s'écrit jamais dans site/")
        if not os.path.exists(APERCU):
            raise SystemExit(f'{APERCU} absent : y copier config/commercial.apercu.exemple.json avec les hypothèses')
        config = lire_config(APERCU)
        controler(config, production=False)
        shutil.rmtree(cible, ignore_errors=True)
        shutil.copytree(SITE, cible)
        for chemin, apres in appliquer(cible, config):
            open(chemin, 'w', encoding='utf-8').write(apres)
        for chemin in pages(cible):
            h = open(chemin, encoding='utf-8').read()
            h = h.replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
            h = re.sub(r'(<body[^>]*>)', r'\1<p style="position:sticky;top:0;z-index:200;margin:0;padding:6px 12px;background:#B3261E;color:#fff;font:600 13px/1.3 system-ui;text-align:center">APERÇU LOCAL — tarifs et périmètres non validés, ne pas publier</p>', h, count=1)
            open(chemin, 'w', encoding='utf-8').write(h)
        print('aperçu écrit dans', cible)
        return
    config = lire_config(CONFIG)
    controler(config, production=True)
    modifiees = appliquer(SITE, config)
    if args == ['--verifier']:
        for chemin, _ in modifiees:
            print('décalé par rapport à config/commercial.json :', os.path.relpath(chemin, RACINE))
        print('site conforme à config/commercial.json' if not modifiees else 'relancer outils/commercial.py')
        sys.exit(1 if modifiees else 0)
    for chemin, apres in modifiees:
        open(chemin, 'w', encoding='utf-8').write(apres)
    print(len(modifiees), 'page(s) réécrite(s)')


if __name__ == '__main__':
    main()
