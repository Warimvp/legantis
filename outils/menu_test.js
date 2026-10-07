// Menu des prestations : survol (liste visible, interstice traversé sans la perdre, fermeture à la sortie), clavier (Tab dans la liste), et menu
// mobile plein écran à six tailles (chevauchement du pied, défilement). `node outils/menu_test.js [site] [dossier-captures]`.
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const path = require('path'); const os = require('os');
const RACINE = process.argv[2] || path.join(__dirname, '..', 'site'); const SP = process.argv[3] || os.tmpdir();   // captures dans SP/cap/ (à créer)
(async () => {
  const b = await chromium.launch();
  // ---------- ordinateur : survol, interstice, clavier ----------
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' }); const p = await ctx.newPage();
    await p.goto(`file://${RACINE}/index.html`, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready).catch(() => {});
    const vis = () => p.evaluate(() => getComputedStyle(document.querySelector('.sous-nav')).visibility);
    const avant = await vis();
    const parent = p.locator('.nav-sous > a'); const pb = await parent.boundingBox();
    await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await p.waitForTimeout(350);
    const survol = await vis();
    // on descend lentement vers le premier élément en traversant l'interstice
    const premier = p.locator('.sous-nav a').first(); const fb = await premier.boundingBox();
    let perdu = false;
    for (let i = 1; i <= 12; i++) { await p.mouse.move(pb.x + pb.width / 2 + (fb.x + 40 - pb.x - pb.width / 2) * i / 12, pb.y + pb.height / 2 + (fb.y + fb.height / 2 - pb.y - pb.height / 2) * i / 12); if (await vis() !== 'visible') perdu = true; }
    const cible = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('a') ? e.closest('a').getAttribute('href') : null; }, [fb.x + 40, fb.y + fb.height / 2]);
    await p.screenshot({ path: `${SP}/cap/menu.${theme}.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } });
    // sortie de la souris : la liste se referme
    await p.mouse.move(700, 600); await p.waitForTimeout(350); const ferme = await vis();
    // clavier
    await p.keyboard.press('Escape'); await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await parent.focus(); await p.waitForTimeout(300); const focus = await vis();
    await p.keyboard.press('Tab'); await p.waitForTimeout(100);
    const actif = await p.evaluate(() => document.activeElement.getAttribute('href'));
    const encore = await vis();
    for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
    const apres = await p.evaluate(() => ({ href: document.activeElement.getAttribute('href'), liste: getComputedStyle(document.querySelector('.sous-nav')).visibility }));
    console.log(`ordinateur ${theme}: repos=${avant} survol=${survol} interstice_perdu=${perdu} élément_sous_la_souris=${cible} sortie=${ferme} | clavier: focus_parent=${focus} Tab→${actif} (${encore}) puis ${JSON.stringify(apres)}`);
    await ctx.close();
  }
  // ---------- mobile : le menu plein écran à plusieurs tailles ----------
  for (const [nom, w, h] of [['390x844', 390, 844], ['375x667', 375, 667], ['360x740', 360, 740], ['360x640', 360, 640], ['320x568', 320, 568], ['844x390 paysage', 844, 390]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, reducedMotion: 'reduce' }); const p = await ctx.newPage();
    await p.goto(`file://${RACINE}/index.html#menu`, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready).catch(() => {}); await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const m = document.querySelector('#menu'); const L = document.documentElement.clientWidth;
      if (getComputedStyle(m).display === 'none') return { ouvert: false };
      const liens = [...m.querySelectorAll('ul a, .menu-devis')].map(a => a.getBoundingClientRect()); const pied = m.querySelector('.menu-pied').getBoundingClientRect();
      const chevauche = liens.some(r => r.bottom > pied.top + 1 && r.top < pied.bottom - 1 && r.right > pied.left && r.left < pied.right);
      const hors = liens.filter(r => r.right > L + 1 || r.left < -1).length;
      return { ouvert: true, defile: m.scrollHeight > m.clientHeight + 1, surplus: m.scrollHeight - m.clientHeight, chevauche, hors, sousLiens: m.querySelectorAll('.menu-sous a').length, position_pied: getComputedStyle(m.querySelector('.menu-pied')).position };
    });
    console.log('mobile', nom.padEnd(16), JSON.stringify(r));
    if (nom === '390x844' || nom === '375x667') await p.screenshot({ path: `${SP}/cap/menu-mobile.${nom}.png` });
    await ctx.close();
  }
  await b.close();
})();
