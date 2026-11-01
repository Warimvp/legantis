// Captures de la démonstration Distribution OS pour /commandes/ et /realisations/ : vraies captures de la page, date de référence fixe
// (mêmes données à chaque fois), WebP. `node outils/captures_distribution_os.js` après toute modification visible de la démonstration.
//   SORTIE=<dossier> pour écrire ailleurs (par exemple des formats publicitaires, qui ne vont pas dans le dépôt) ; FORMATS=pub pour les formats carrés et verticaux.
// Conversion : cwebp s'il est installé, sinon Python et Pillow.
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright')); }
const { execFileSync } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const RACINE = process.env.SITE_ROOT || path.join(__dirname, '..', 'site');
const SORTIE = process.env.SORTIE || path.join(RACINE, 'assets', 'captures');
const JOUR = '2026-11-02';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function webp(png, cible, largeur, hauteur, qualite = 80) {
  try { execFileSync('cwebp', ['-quiet', '-q', String(qualite), '-resize', String(largeur), String(hauteur), png, '-o', cible]); }
  catch { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").resize((int(sys.argv[3]), int(sys.argv[4])), Image.LANCZOS).save(sys.argv[2], "WEBP", quality=int(sys.argv[5]), method=6)', png, cible, String(largeur), String(hauteur), String(qualite)]); }
  console.log(path.basename(cible), fs.statSync(cible).size, 'octets');
}

(async () => {
  const serveur = http.createServer((req, res) => {
    let f = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const DEMO = `http://127.0.0.1:${serveur.address().port}/realisations/demos/distribution-os/?jour=${JOUR}`;
  const b = await chromium.launch();
  async function capture(nom, vue, largeur, hauteur, echelle, sortie, prep) {
    const ctx = await b.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: echelle, reducedMotion: 'reduce', isMobile: largeur < 600, hasTouch: largeur < 600 });
    const page = await ctx.newPage();
    await page.goto(DEMO + '#/' + vue);
    await page.waitForSelector('body.pret');
    await page.evaluate(() => { DOSApp.accueil = false; DOSApp.rendre(); });
    if (prep) await prep(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const png = path.join(tmp, nom + '.png');
    await page.screenshot({ path: png });
    webp(png, path.join(SORTIE, nom + '.webp'), sortie[0], sortie[1]);
    await ctx.close();
  }
  if (process.env.FORMATS === 'pub') {
    // Formats publicitaires (1080 × 1080, 1080 × 1350, 1080 × 1920) : jamais dans le dépôt, à vérifier avant tout usage
    await capture('pub-carre-tableau', 'tableau', 1080, 1080, 1, [1080, 1080]);
    await capture('pub-portrait-commandes', 'commandes', 1080, 1350, 1, [1080, 1350]);
    await capture('pub-story-stocks', 'stocks', 432, 768, 2.5, [1080, 1920]);
    await capture('pub-story-tableau', 'tableau', 432, 768, 2.5, [1080, 1920]);
  } else {
    await capture('dos-tableau', 'tableau', 1440, 900, 1, [1440, 900]);
    await capture('dos-commandes', 'commandes', 1440, 900, 1, [720, 450]);
    await capture('dos-stocks', 'stocks', 1440, 900, 1, [720, 450]);
    await capture('dos-analyses', 'rapports', 1440, 900, 1, [720, 450]);
    await capture('dos-tableau-mobile', 'tableau', 390, 844, 2, [780, 1688], null);
    await capture('demo-distribution-os', 'tableau', 1280, 800, 1, [640, 400]);
  }
  await b.close(); serveur.close();
})();
