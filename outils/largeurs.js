// Largeur : rectangles des éléments ET du texte (un mot peut sortir de sa propre boîte), défilement horizontal réel de <html>, bouton du menu
// entièrement visible. Pages = sitemap, 7 largeurs de 320 à 1440 px. `node outils/largeurs.js` ; SITE_ROOT=<dossier> pour un autre site.
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const fs = require('fs');
const RACINE = process.env.SITE_ROOT || require('path').join(__dirname, '..', 'site');
const PAGES = [...fs.readFileSync(RACINE + '/sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/legantis.net\/([^<]*)<\/loc>/g)].map(m => m[1]);
const LARGEURS = [320, 340, 360, 390, 414, 768, 1440];
(async () => {
  const browser = await chromium.launch(); let bad = 0, n = 0;
  for (const w of LARGEURS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`file://${RACINE}/${p}index.html`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      const r = await page.evaluate(() => {
        const L = document.documentElement.clientWidth;
        const EXCLU = '.visuellement-cache, .forme, .halo, .capteurs, .cachet, .filtres, .lien-evitement, .rond-tournant, .defile, .menu-plein, .numero-fantome, .curseur';
        const elements = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && !e.closest(EXCLU) && (b.right > L + 1 || b.left < -1); }).slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal === undefined ? e.className : '').split(' ')[0]);
        const texte = []; const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t; (t = wk.nextNode());) {
          if (!t.nodeValue.trim() || !t.parentElement || t.parentElement.closest(EXCLU) || getComputedStyle(t.parentElement).visibility === 'hidden') continue;
          const range = document.createRange(); range.selectNodeContents(t);
          for (const b of range.getClientRects()) if (b.width && (b.right > L + 1 || b.left < -1)) { texte.push(t.nodeValue.trim().slice(0, 30) + ' →' + Math.round(b.right)); break; }
          if (texte.length >= 3) break;
        }
        const m = document.querySelector('.menu-ouvrir'); const mb = m && getComputedStyle(m).display !== 'none' ? m.getBoundingClientRect() : null;
        return { elements, texte, defile: document.documentElement.scrollWidth > L + 1, menuOk: mb ? (mb.right <= L + 0.5 && mb.left >= 0) : true };
      });
      n++; if (r.elements.length || r.texte.length || r.defile || !r.menuOk) { bad++; console.log('✗', w, p || 'accueil', JSON.stringify(r)); }
    }
    await ctx.close();
  }
  console.log(bad ? `${bad} défaut(s) sur ${n}` : `aucun défaut sur ${n} combinaisons (${PAGES.length} pages × ${LARGEURS.length} largeurs)`);
  await browser.close();
})();
