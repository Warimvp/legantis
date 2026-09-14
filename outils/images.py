"""Génère site/assets/apple-touch-icon.png (180 px) et site/assets/partage.png (1200x630, Open Graph)
à partir du dessin de site/assets/favicon.svg et du cachet de l'accueil. Lancer depuis la racine du dépôt :
    arch -x86_64 python3 outils/images.py
(Pillow est installé en x86_64 sur cette machine : sans `arch`, l'import échoue.)"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "assets")
# Mêmes valeurs que les jetons de site.css (thème clair)
TAMPON, CHAUX, SAFRAN, ENCRE, GRIS = "#3D36B2", "#F6F7F9", "#E3A33A", "#16172E", "#5A5C72"


def marque(draw, x, y, taille, arrondi=True):
    """Le favicon (viewBox 64) dessiné à (x, y) sur `taille` px."""
    k = taille / 64
    if arrondi:
        draw.rounded_rectangle([x, y, x + taille, y + taille], radius=14 * k, fill=TAMPON)
    else:
        draw.rectangle([x, y, x + taille, y + taille], fill=TAMPON)
    pts = [(21, 13), (32, 13), (32, 42), (49, 42), (49, 51), (21, 51)]
    draw.polygon([(x + a * k, y + b * k) for a, b in pts], fill=CHAUX)
    draw.rectangle([x + 41 * k, y + 13 * k, x + 49 * k, y + 21 * k], fill=SAFRAN)


def police(candidats, taille):
    """candidats : (chemin, style) ; pour un .ttc, cherche la face dont le style correspond (None = la première)."""
    for chemin, style in candidats:
        if not os.path.exists(chemin):
            continue
        for i in range(40):
            try:
                f = ImageFont.truetype(chemin, taille, index=i)
            except OSError:
                break
            if style is None or f.getname()[1] == style:
                print("police :", chemin, f.getname())
                return f
    raise SystemExit(f"aucune police trouvée parmi {candidats}")


def cachet(largeur, hauteur, lignes, S):
    """Le cachet de l'accueil : double filet, lignes centrées, encre usée. Renvoie une image RGBA non tournée."""
    im = Image.new("RGBA", (largeur, hauteur), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    e = 5 * S
    d.rounded_rectangle([e // 2, e // 2, largeur - e // 2, hauteur - e // 2], radius=20 * S, outline=TAMPON, width=e)
    i = 13 * S
    d.rounded_rectangle([i, i, largeur - i, hauteur - i], radius=11 * S, outline=TAMPON, width=2 * S)
    total = sum(f.size * interligne for _, f, interligne in lignes)
    y = (hauteur - total) / 2
    for texte, f, interligne in lignes:
        d.text(((largeur - d.textlength(texte, font=f)) / 2, y), texte, font=f, fill=TAMPON)
        y += f.size * interligne
    # Usure : ~10 % de l'encre manque, par petites taches (bruit flouté puis seuillé au 90e centile)
    bruit = Image.effect_noise((largeur, hauteur), 90).filter(ImageFilter.GaussianBlur(1.1 * S))
    hist, cumul = bruit.histogram(), 0
    for seuil, n in enumerate(hist):
        cumul += n
        if cumul >= 0.90 * largeur * hauteur:
            break
    masque = bruit.point(lambda v: 230 if v < seuil else 30)
    im.putalpha(ImageChops.multiply(im.getchannel("A"), masque))
    return im


# Icône iOS : carré plein (iOS arrondit lui-même), rendu 4x puis réduit pour l'anticrénelage
S = 4
img = Image.new("RGB", (180 * S, 180 * S), TAMPON)
marque(ImageDraw.Draw(img), 0, 0, 180 * S, arrondi=False)
img.resize((180, 180), Image.LANCZOS).save(f"{SITE}/apple-touch-icon.png", optimize=True)

# Image de partage (Open Graph), sans texte propre à une langue
S = 2
W, H = 1200 * S, 630 * S
img = Image.new("RGB", (W, H), CHAUX)
d = ImageDraw.Draw(img)
titre = police([("/System/Library/Fonts/HelveticaNeue.ttc", "Bold"), ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", None)], 160 * S)
mono = police([("/System/Library/Fonts/SFNSMono.ttf", None), ("/System/Library/Fonts/Menlo.ttc", None)], 28 * S)
sans = police([("/System/Library/Fonts/HelveticaNeue.ttc", "Medium"), ("/System/Library/Fonts/Supplemental/Arial.ttf", None)], 34 * S)
etroite = [("/System/Library/Fonts/Avenir Next Condensed.ttc", "Bold"), ("/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf", None)]
etroite_fine = [("/System/Library/Fonts/Avenir Next Condensed.ttc", "Demi Bold"), ("/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf", None)]

marge = 96 * S
marque(d, marge, 92 * S, 112 * S)
d.text((marge - 8 * S, 250 * S), "Legantis", font=titre, fill=ENCRE)
x = marge
for lettre in "DIGITAL SERVICE":  # interlettrage à la main, comme le .marque small du site
    d.text((x, 452 * S), lettre, font=mono, fill=GRIS)
    x += d.textlength(lettre, font=mono) + 6 * S
d.rectangle([marge, 512 * S, W - marge, 512 * S + 2 * S], fill=TAMPON)
d.text((marge, 540 * S), "Atlasya  ·  Rihla  ·  Casablanca", font=sans, fill=TAMPON)

tampon = cachet(420 * S, 140 * S, [
    ("LEGANTIS DIGITAL SERVICE SAS", police(etroite, 29 * S), 1.3),
    ("CAPITAL 10 000 MAD · CASABLANCA", police(etroite_fine, 17 * S), 1.35),
    ("RC 745587 · ICE 004026900000030", police(etroite_fine, 17 * S), 1.2),
], S).rotate(6, resample=Image.BICUBIC, expand=True)
img.paste(tampon, (W - marge - tampon.width + 16 * S, 64 * S), tampon)
img.resize((1200, 630), Image.LANCZOS).save(f"{SITE}/partage.png", optimize=True)

for f in ("apple-touch-icon.png", "partage.png"):
    p = f"{SITE}/{f}"
    print(f, Image.open(p).size, os.path.getsize(p), "octets")
