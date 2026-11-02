// Vignettes des démonstrations : vraies captures des pages de /realisations/demos/ (640 × 400, WebP par cwebp), bandeau « démonstration » compris dans la page, pas dans l'image :
// la mention figure sur la carte qui montre la vignette. `node outils/captures_demos.js` après toute modification d'une démonstration.
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const { execFileSync } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path');
const RACINE = process.env.SITE_ROOT || path.join(__dirname, '..', 'site');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
// Serveur local : les chemins absolus (/realisations/…) et la politique de sécurité ne fonctionnent pas en file://.
const http = require('http');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
const serveur = http.createServer((q, r) => { let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(k => serveur.listen(0, '127.0.0.1', k));
  const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const nom of (process.env.DEMOS || 'restaurant,services,reservation').split(',')) {
    await page.goto(`${ORIGINE}/realisations/demos/${nom}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(tmp, nom + '.png');
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '640', '400', png, '-o', path.join(RACINE, 'assets/captures', `demo-${nom}.webp`)]);
    console.log(nom, fs.statSync(path.join(RACINE, 'assets/captures', `demo-${nom}.webp`)).size, 'octets');
  }
  await b.close();
  serveur.close();
})();
