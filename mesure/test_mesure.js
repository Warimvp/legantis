// Teste mesure/mesure.js sur les vraies pages du site servies en local, avec un faux `window.plausible` qui enregistre les appels.
//   node mesure/test_mesure.js      (Playwright de RydeX, comme les outils du dépôt)
// Vérifie : chaque geste donne le bon événement et les bonnes propriétés ; aucun texte saisi dans le formulaire ne sort ;
// sans outil chargé, aucune erreur ; le script ne fait aucune requête réseau lui-même.
const { chromium } = require('/Users/user/Projects/RydeX/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = path.join(__dirname, '..', 'site');
const SCRIPT = fs.readFileSync(path.join(__dirname, 'mesure.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const serveur = http.createServer((q, r) => { let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
let echecs = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) echecs++; };

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + serveur.address().port + '/';
  const b = await chromium.launch();
  async function page(chemin, avecOutil = true, largeur = 1440) {
    const mob = largeur < 768;
    const ctx = await b.newContext({ viewport: { width: largeur, height: mob ? 844 : 900 }, isMobile: mob, hasTouch: mob }); const p = await ctx.newPage();
    const err = [], requetes = []; p.on('pageerror', e => err.push(String(e)));
    if (avecOutil) await p.addInitScript(() => { window.__ev = []; window.plausible = (nom, o) => window.__ev.push([nom, (o && o.props) || {}]); });
    await p.goto(BASE + chemin); await p.evaluate(() => document.fonts.ready);
    // empêche la navigation sans retirer l'écoute en capture du script (ajoutée avant, donc appelée avant)
    await p.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); }));
    p.on('request', r => { if (['xhr', 'fetch', 'ping', 'eventsource', 'websocket'].includes(r.resourceType()) || !r.url().startsWith(BASE)) requetes.push(r.resourceType() + ' ' + r.url()); });   // les images paresseuses chargées par le défilement ne comptent pas
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });   // le défilement doux fausserait la visibilité mesurée
    await p.addScriptTag({ content: SCRIPT });
    return { ctx, p, err, requetes, ev: () => p.evaluate(() => window.__ev || []) };
  }
  const clic = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);

  // 1. Accueil FR : boutons de devis par emplacement, produits, e-mail, téléphone, sections vues, aucun texte saisi
  { const { ctx, p, err, requetes, ev } = await page('');
    for (const sel of ['a.barre-cta', '.ouverture a.bouton--plein', '.catalogue-cta a.bouton--plein', '.appel a.bouton--plein', 'a.pied-devis', 'a.badge']) await clic(p, sel);
    await clic(p, '.titre--atlasya a[href*="apps.apple.com"]'); await clic(p, '.titre--ostad a[href="etude-de-cas-ostad/"]'); await clic(p, '.titre--rihla a[href="https://warimvp.github.io/rihla/"]');
    await clic(p, '.contact-tel a[href^="mailto:"]'); await clic(p, '.contact-tel a[href^="tel:"]');
    await p.fill('#devis-nom', 'SECRET-NOM'); await p.fill('#devis-email', 'secret@exemple.ma'); await p.fill('#devis-projet', 'SECRET-PROJET très confidentiel');
    await p.evaluate(() => document.querySelector('#produits .catalogue').scrollIntoView()); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#devis .devis-form').scrollIntoView()); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#devis .devis-form').scrollIntoView()); await p.waitForTimeout(200);
    const e = await ev(); const j = JSON.stringify(e);
    const devis = e.filter(x => x[0] === 'Devis clic').map(x => x[1].emplacement);
    ok(JSON.stringify(devis) === JSON.stringify(['barre', 'ouverture', 'catalogue', 'appel-final', 'pied', 'badge']), `Devis clic par emplacement : ${devis.join(', ')}`);
    const prod = e.filter(x => x[0] === 'Produit clic').map(x => `${x[1].produit}→${x[1].destination}`);
    ok(JSON.stringify(prod) === JSON.stringify(['atlasya→app-store', 'ostad→etude-de-cas', 'rihla→site-du-produit']), `Produit clic : ${prod.join(', ')}`);
    ok(e.some(x => x[0] === 'E-mail clic' && x[1].emplacement === 'appel-final') && e.some(x => x[0] === 'Téléphone clic'), 'E-mail clic et Téléphone clic');
    ok(e.filter(x => x[0] === 'Réalisations vues').length === 1 && e.filter(x => x[0] === 'Formulaire vu').length === 1, `Réalisations vues et Formulaire vu : une fois chacun (${e.filter(x => x[0] === 'Réalisations vues').length}, ${e.filter(x => x[0] === 'Formulaire vu').length})`);
    ok(!/SECRET|secret@|confidentiel/.test(j), 'aucun texte saisi dans les événements');
    ok(requetes.length === 0, `aucune requête réseau du script (${requetes.length}) ${requetes.join(' | ').slice(0, 200)}`); ok(err.length === 0, 'aucune erreur ' + err.join('|'));
    await ctx.close(); }
  // 1 bis. Téléphone (390 px) : les sections vues sont détectées aussi (la section entière y fait plusieurs écrans)
  { const { ctx, p, ev } = await page('', true, 390);
    for (const sel of ['#produits .titre .couverture', '#devis-nom']) { await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(400); }
    const e = await ev();
    ok(e.filter(x => x[0] === 'Réalisations vues').length === 1 && e.filter(x => x[0] === 'Formulaire vu').length === 1, `390 px : Réalisations vues et Formulaire vu (${e.map(x => x[0]).join(', ')})`);
    await ctx.close(); }
  // 1 ter. Simulateur : ouverture, étapes par leur rang, demande envoyée ; aucun choix du visiteur dans les événements
  { const { ctx, p, ev } = await page('estimer-mon-projet/?type=mobile');
    await p.check('input[name="fonctions"][value="paiement"]');
    await clic(p, '[data-suite]'); await p.waitForTimeout(50); await clic(p, '[data-suite]'); await p.waitForTimeout(50);
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('legantis:demande-envoyee', { detail: { parcours: 'simulateur' } })));
    await clic(p, 'a[href^="mailto:"]');
    const e = await ev(); const j = JSON.stringify(e);
    ok(e.some(x => x[0] === 'Simulateur ouvert') && e.some(x => x[0] === 'Demande envoyée' && x[1].parcours === 'simulateur'), `simulateur : ouverture et demande envoyée (${e.map(x => x[0]).join(', ')})`);
    ok(!/paiement|mobile/.test(j), 'simulateur : aucun choix du visiteur dans les événements ' + j.slice(0, 160));
    await ctx.close(); }
  // 2. Retour du Worker : #devis-envoye et #devis-echec, une seule fois
  for (const [h, nom] of [['#devis-envoye', 'Devis envoyé'], ['#devis-echec', 'Devis échec']]) {
    const { ctx, ev } = await page('' + h); const e = await ev();
    ok(e.filter(x => x[0] === nom).length === 1, `arrivée sur ${h} → « ${nom} »`); await ctx.close(); }
  // 3. Page de prestation EN et étude de cas : emplacements propres aux pages de service
  { const { ctx, p, ev } = await page('en/mobile-app-casablanca/');
    await clic(p, '.service-tete a.bouton--plein'); await clic(p, '.service-cta a.bouton--plein'); await clic(p, 'a.barre-cta');
    const d = (await ev()).filter(x => x[0] === 'Devis clic').map(x => x[1].emplacement);
    ok(JSON.stringify(d) === JSON.stringify(['en-tete', 'milieu', 'barre']), `page EN : ${d.join(', ')}`); await ctx.close(); }
  // 4. Sans outil chargé : rien, aucune erreur
  { const { ctx, p, err } = await page('', false); await clic(p, 'a.barre-cta'); await clic(p, '.contact-tel a[href^="mailto:"]');
    ok(err.length === 0, 'sans outil : aucune erreur'); await ctx.close(); }
  await b.close(); serveur.close();
  console.log(echecs ? `${echecs} ÉCHEC(S)` : 'tout passe'); process.exit(echecs ? 1 : 0);
})();
