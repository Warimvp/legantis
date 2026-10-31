// Vignettes des démonstrations : vraies captures des pages de /realisations/demos/ (640 × 400, WebP par cwebp), bandeau « démonstration » compris dans la page, pas dans l'image :
// la mention figure sur la carte qui montre la vignette. `node outils/captures_demos.js` après toute modification d'une démonstration.
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const { execFileSync } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path');
const RACINE = process.env.SITE_ROOT || path.join(__dirname, '..', 'site');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const nom of ['restaurant', 'services', 'reservation', 'gestion']) {
    await page.goto(`file://${RACINE}/realisations/demos/${nom}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(tmp, nom + '.png');
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '640', '400', png, '-o', path.join(RACINE, 'assets/captures', `demo-${nom}.webp`)]);
    console.log(nom, fs.statSync(path.join(RACINE, 'assets/captures', `demo-${nom}.webp`)).size, 'octets');
  }
  await b.close();
})();
