/* Maison Tilal : démonstration Legantis. JavaScript vanilla, aucun stockage, aucune requête réseau.
   Tout l'état (réservations, tables, commandes, carte, créneaux) vit en mémoire et disparaît au rechargement. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pad = n => String(n).padStart(2, '0');
const plur = (n, s, p) => n + ' ' + (n > 1 ? p || s + 's' : s);
const maj1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const jourLong = s => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heure = t => t.replace(':', ' h ');
const asc = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ferme = d => d.getDay() === 1;
const svOf = h => h < '16:00' ? 'midi' : 'soir';

/* ---------- Navigation ---------- */
(() => {
  const b = $('.menu-bouton'), nav = $('#nav-principale');
  const ouvrir = o => { nav.classList.toggle('ouvert', o); b.setAttribute('aria-expanded', String(o)); b.textContent = o ? 'Fermer' : 'Menu'; };
  b.addEventListener('click', () => ouvrir(b.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) ouvrir(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('ouvert')) { ouvrir(false); b.focus(); } });
  if (!('IntersectionObserver' in window)) return;
  const liens = $$('a', nav), cibles = liens.map(a => $(a.getAttribute('href')));
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) liens.forEach((a, i) => cibles[i] === en.target ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')); }), { rootMargin: '-45% 0px -50% 0px' });
  cibles.forEach(c => c && io.observe(c));
  const barre = $('.barre-resa');
  new IntersectionObserver(es => barre.classList.toggle('cachee', es.some(e => e.isIntersecting)), { rootMargin: '0px 0px -5% 0px' }).observe($('#reserver'));
})();

/* ---------- Données ---------- */
const SV = { midi: { nom: 'Midi', plage: '12 h 30 à 14 h 30', cr: ['12:30', '13:00', '13:30', '14:00'] }, soir: { nom: 'Soir', plage: '19 h 30 à 22 h 30', cr: ['19:30', '20:00', '20:30', '21:00', '21:30'] } };
const TB = [['S1', 2], ['S2', 4], ['S3', 4], ['S4', 2], ['S5', 6], ['S6', 4], ['S7', 2], ['S8', 4], ['S9', 4], ['C1', 2], ['C2', 4], ['C3', 4]];
const seats = id => TB.find(t => t[0] === id)[1];
const zoneDe = id => id[0] === 'C' ? 'cour' : 'salle';
const CAP = 10, CAP_MAX = 24, PAS = 2, MAX_COUV = 8, JOURS = 30;
const DEG = { m1: 'Menu Tilal, parcours du feu', m2: 'Menu Tilal végétal, parcours du jardin' };
const NOMS = ['Cèdre', 'Safran', 'Menthe', 'Figuier', 'Jasmin', 'Sumac', 'Thym', 'Amande', 'Datte', 'Grenade', 'Olivier', 'Verveine'];
const OCC = ['attendue', 'installée', 'terminée'];
const today = new Date(); today.setHours(0, 0, 0, 0);
const JL = Array.from({ length: JOURS }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
const OUV = JL.filter(d => !ferme(d)).map(iso);

const DISHES = $$('.plat').map(li => {
  const tags = $('.plat-tags', li).textContent, cat = li.closest('.cat').dataset.cat, na = tags.includes('Sans alcool');
  return { id: li.dataset.id, li, cat, tags, na, veg: tags.includes('Végétarien'), gf: tags.includes('Sans gluten'), nom: $('.plat-nom', li).textContent.trim(), prix: parseInt($('.plat-prix', li).textContent, 10), emp: cat !== 'boissons' || na };
});
const dish = id => DISHES.find(d => d.id === id);

const S = { resas: [], seq: 0, over: {}, stat: {}, bloc: {}, indispo: {}, cart: {}, orders: [], oseq: 0, emp: true, jour: OUV[0], sv: 'soir', onglet: 'resas', selT: null, annuler: null, cAnnuler: null, conf: null, pick: { date: OUV[0], heure: '', nom: '' }, errP: {} };

/* ---------- Règles de la salle ---------- */
const fcache = {};
const bloqueSeed = (d, sv, id) => hash(d + sv + id + 'b') % 100 < 7;
function fict(d, sv) {
  const k = d + sv; if (fcache[k]) return fcache[k];
  const wd = parse(d).getDay(), p = (wd === 5 || wd === 6) && sv === 'soir' ? .85 : (wd === 0 && sv === 'midi' ? .7 : .45), cr = SV[sv].cr;
  return fcache[k] = TB.filter(t => !bloqueSeed(d, sv, t[0]) && hash(d + sv + t[0]) % 1000 / 1000 < p).map(t => {
    const h = hash(d + sv + t[0] + 'x');
    return { id: 'f-' + d + '-' + sv + '-' + t[0], fict: true, num: 'Fictive', date: d, service: sv, heure: cr[h % cr.length], couverts: Math.max(1, t[1] - h % 2 - (t[1] > 4 ? h % 3 : 0)), nom: 'Groupe ' + NOMS[h % 12], table: t[0], statut: 'attendue' };
  });
}
const st = r => r.fict ? S.stat[r.id] || r.statut : r.statut;
const tous = d => [...fict(d, 'midi'), ...fict(d, 'soir'), ...S.resas.filter(r => r.date === d)].sort((a, b) => a.heure.localeCompare(b.heure));
const byId = id => { for (const d of OUV) { const r = tous(d).find(x => String(x.id) === id); if (r) return r; } };
function tEtat(d, sv, id) {
  const k = d + sv + id, b = k in S.bloc ? S.bloc[k] : bloqueSeed(d, sv, id);
  if (b) return { k: 'bloquee' };
  const r = tous(d).find(x => x.service === sv && x.table === id && OCC.includes(st(x)));
  return r ? { k: 'reservee', r } : { k: 'libre' };
}
const ov = (d, t) => S.over[d + '|' + t] || { cap: CAP, ferme: false };
const ovw = (d, t) => S.over[d + '|' + t] || (S.over[d + '|' + t] = { cap: CAP, ferme: false });
const pris = (d, sv, t) => tous(d).filter(r => r.service === sv && r.heure === t && OCC.includes(st(r))).reduce((n, r) => n + r.couverts, 0);
function passe(d, t) { if (d !== iso(today)) return false; const n = new Date(), p = t.split(':').map(Number); return p[0] * 60 + p[1] <= n.getHours() * 60 + n.getMinutes() + 30; }
const tableLibre = (d, sv, n) => TB.some(t => t[1] >= n && tEtat(d, sv, t[0]).k === 'libre');
function creneau(d, sv, t) { const o = ov(d, t), p = pris(d, sv, t); return { cap: o.cap, ferme: o.ferme, pris: p, restant: Math.max(0, o.cap - p), passe: passe(d, t) }; }
function statutCreneau(d, sv, t, n) {
  const c = creneau(d, sv, t);
  if (c.ferme) return { ok: false, motif: 'Fermé', c };
  if (c.passe) return { ok: false, motif: 'Passé', c };
  if (c.restant < n || !tableLibre(d, sv, n)) return { ok: false, motif: c.restant === 0 ? 'Complet' : 'Complet pour ' + n, c };
  return { ok: true, motif: c.restant - n <= 3 ? 'Dernières places' : 'Disponible', c };
}
const libres = (d, sv, n) => SV[sv].cr.filter(t => statutCreneau(d, sv, t, n).ok).length;
function meilleure(d, sv, n) { const l = TB.filter(t => t[1] >= n && tEtat(d, sv, t[0]).k === 'libre').sort((a, b) => a[1] - b[1]); return l.length ? l[0][0] : null; }

/* ---------- Plan de salle (SVG) ---------- */
const LAY = {
  L: { w: 640, h: 440, k: 1, z: [[14, 14, 456, 412, 'Salle'], [486, 14, 140, 412, 'Cour']], deco: [['foyer', 232, 18], ['porte', 242, 426], ['arbre', 556, 50], ['fontaine', 556, 404]],
    p: { S1: [95, 120], S2: [242, 120], S3: [395, 120], S4: [95, 232], S5: [250, 232], S6: [395, 232], S7: [95, 344], S8: [242, 344], S9: [395, 344], C1: [556, 120], C2: [556, 232], C3: [556, 344] } },
  P: { w: 360, h: 530, k: .85, z: [[4, 4, 352, 372, 'Salle'], [4, 388, 352, 134, 'Cour']], deco: [['foyer', 163, 8], ['porte', 180, 376]],
    p: { S1: [58, 100], S2: [180, 100], S3: [302, 100], S4: [58, 200], S5: [180, 200], S6: [302, 200], S7: [58, 300], S8: [180, 300], S9: [302, 300], C1: [58, 462], C2: [180, 462], C3: [302, 462] } }
};
const etroit = window.matchMedia('(max-width: 639px)');
const DECO = {
  foyer: (x, y) => `<g class="deco" transform="translate(${x} ${y})"><path d="M0 36V14C0-5 34-5 34 14V36Z"/><path d="M17 32c-7-6 0-11-3-18 7 3 10 10 6 16M8 32c-4-4-1-8-2-12" stroke-width=".8"/></g>`,
  porte: (x, y) => `<path class="deco" d="M${x - 24} ${y}a24 24 0 0 1 48 0"/>`,
  arbre: (x, y) => `<g class="deco" transform="translate(${x} ${y})"><circle r="21" stroke-dasharray="1 4"/><circle r="11"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<use href="#feuille" transform="rotate(${a}) translate(4 0) scale(.33)"/>`).join('')}</g>`,
  fontaine: (x, y) => `<g class="deco" transform="translate(${x} ${y})"><circle r="13"/><circle r="8"/><use href="#etoile" x="-6" y="-6" width="12" height="12"/></g>`
};
function tableSvg(id, x, y, k, cls, txt, aria, extra) {
  const n = seats(id), rond = n === 2, w = (n === 4 ? 110 : 156) * k, h = 84 * k, R = 42 * k;
  let ch = '';
  if (rond) ch = `<rect class="chaise" x="${-R - 10}" y="-9" width="7" height="18" rx="3"/><rect class="chaise" x="${R + 3}" y="-9" width="7" height="18" rx="3"/>`;
  else for (let i = 0; i < n / 2; i++) { const cx = -w / 2 + w / (n / 2) * (i + .5); ch += `<rect class="chaise" x="${cx - 10}" y="${-h / 2 - 10}" width="20" height="7" rx="3"/><rect class="chaise" x="${cx - 10}" y="${h / 2 + 3}" width="20" height="7" rx="3"/>`; }
  const corps = rond ? `<circle class="corps" r="${R}"/>` : `<rect class="corps" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6"/>`;
  const an = rond ? `<circle class="anneau" r="${R + 7}"/>` : `<rect class="anneau" x="${-w / 2 - 7}" y="${-h / 2 - 7}" width="${w + 14}" height="${h + 14}" rx="10"/>`;
  return `<g class="tbl ${cls}" tabindex="0" role="button" aria-label="${esc(aria)}" data-t="${id}" ${extra} transform="translate(${x} ${y})">${an}${ch}${corps}<text class="t-id" y="2">${id}</text><text class="t-etat" y="19">${txt}</text></g>`;
}
function plan(mode, d, sv, o) {
  const L = LAY[etroit.matches ? 'P' : 'L'];
  let s = `<svg class="plan" viewBox="0 0 ${L.w} ${L.h}" role="group" aria-label="Plan de la salle et de la cour">`;
  L.z.forEach(z => { s += `<rect class="zone ${z[4] === 'Cour' ? 'zone--cour' : ''}" x="${z[0]}" y="${z[1]}" width="${z[2]}" height="${z[3]}" rx="3"/><text class="nom-zone" x="${z[0] + 12}" y="${z[1] + 20}">${z[4]}</text>`; });
  s += L.deco.map(a => DECO[a[0]](a[1], a[2])).join('');
  TB.forEach(t => {
    const id = t[0], e = tEtat(d, sv, id), p = L.p[id], nom = `Table ${id}, ${t[1]} places, ${zoneDe(id)}`;
    let cls, txt, aria;
    if (mode === 'client') {
      if (e.k === 'bloquee') [cls, txt, aria] = ['bloquee', 'bloquée', nom + ', bloquée, indisponible'];
      else if (e.k === 'reservee') [cls, txt, aria] = ['reservee', 'réservée', nom + ', réservée, indisponible'];
      else if (t[1] < o.n) [cls, txt, aria] = ['petite', 'trop petite', nom + ', trop petite pour ' + plur(o.n, 'couvert') + ', indisponible'];
      else if (o.sel === id) [cls, txt, aria] = ['choisie', 'choisie', nom + ', libre, choisie'];
      else [cls, txt, aria] = ['libre', 'libre', nom + ', libre'];
      s += tableSvg(id, p[0], p[1], L.k, cls, txt, aria, `data-k="t-c-${id}" aria-pressed="${cls === 'choisie'}"` + (['libre', 'choisie'].includes(cls) ? '' : ' aria-disabled="true"'));
    } else {
      const sta = e.k === 'reservee' ? st(e.r) : '';
      cls = e.k === 'libre' ? 'libre' : e.k === 'bloquee' ? 'bloquee' : asc(sta);
      txt = e.k === 'libre' ? 'libre' : e.k === 'bloquee' ? 'bloquée' : sta;
      aria = nom + ', ' + (e.k === 'bloquee' ? 'bloquée' : e.k === 'libre' ? 'libre' : sta + ', ' + e.r.nom + ', ' + plur(e.r.couverts, 'couvert'));
      s += tableSvg(id, p[0], p[1], L.k, cls + (S.selT === id ? ' vue' : ''), txt, aria, `data-k="t-r-${id}" aria-pressed="${S.selT === id}"`);
    }
  });
  return s + '</svg>';
}
const LEG = '<ul class="legende"><li><i></i>Libre</li><li><i class="l-cho"></i>Votre choix</li><li><i class="l-res"></i>Réservée</li><li><i class="l-blo"></i>Bloquée</li><li><i class="l-pet"></i>Trop petite</li></ul>';
function planClavier(e) {
  const t = e.target.closest('.tbl'); if (!t) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
  const l = $$('.tbl', t.closest('svg')), i = l.indexOf(t), n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (n) { e.preventDefault(); l[(i + n + l.length) % l.length].focus(); }
}

/* ---------- Carte ---------- */
const majCarte = () => DISHES.forEach(d => {
  const q = S.cart[d.id] || 0, bas = $('.plat-bas', d.li);
  bas.innerHTML = !d.emp ? '<span class="etat-plat" style="color:var(--ivoire-2)">Sur place uniquement</span>' : S.indispo[d.id] ? '<span class="etat-plat">Indisponible pour le moment</span>'
    : `<button class="ajout${q ? ' dans' : ''}" data-ajout="${d.id}" data-k="aj-${d.id}" aria-label="Ajouter ${esc(d.nom)} à la commande à emporter${q ? ' (déjà ' + q + ')' : ''}">${q ? 'Ajouté · ' + q + ' · +' : 'Ajouter à emporter'}</button>`;
  d.li.classList.toggle('indispo', !!S.indispo[d.id]);
});
function initCarte() {
  const outils = $('#carte-outils'), corps = $('#carte-corps'); outils.hidden = false;
  const cats = $$('.cat', corps), onglets = $('#onglets'), etat = $('#carte-etat'), vide = $('#carte-vide'), filtres = $$('input[name="filtre"]', outils);
  const ART = { entrees: ['poisson', '0 0 260 140'], plats: ['tajine', '0 -20 240 190'], desserts: ['agrume', '0 0 220 220'], boissons: ['theiere', '0 0 230 140'] };
  let courant = cats[0].dataset.cat; const bt = {};
  const panneau = $('#panneau'), pn = $('#pn-corps'); let opener = null;
  cats.forEach(c => {
    const id = c.dataset.cat, nom = $('.cat-titre', c).childNodes[0].textContent.trim();
    const b = document.createElement('button'); b.type = 'button'; b.className = 'onglet'; b.id = 'tab-' + id; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', c.id); b.dataset.nom = nom; b.textContent = nom;
    b.addEventListener('click', () => choisir(id)); onglets.appendChild(b); bt[id] = b;
    c.setAttribute('role', 'tabpanel'); c.setAttribute('aria-labelledby', b.id);
    c.insertAdjacentHTML('afterbegin', `<svg class="gravure cat-art" viewBox="${ART[id][1]}" aria-hidden="true"><use href="#${ART[id][0]}"/></svg>`);
  });
  onglets.addEventListener('keydown', e => {
    const ids = cats.map(c => c.dataset.cat), i = ids.indexOf(courant); let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ids.length - 1; else return;
    e.preventDefault(); choisir(ids[n]); bt[ids[n]].focus();
  });
  const act = () => filtres.filter(f => f.checked).map(f => f.value), LIB = { veg: 'végétarien', gf: 'sans gluten', na: 'sans alcool' };
  const vis = (c, a) => DISHES.filter(d => d.cat === c.dataset.cat && a.every(f => d[f]));
  function maj(annoncer) {
    const a = act();
    cats.forEach(c => { const ok = vis(c, a); DISHES.filter(d => d.cat === c.dataset.cat).forEach(d => { d.li.hidden = !ok.includes(d); }); const b = bt[c.dataset.cat]; b.textContent = b.dataset.nom + (a.length ? ' (' + ok.length + ')' : ''); c.hidden = c.dataset.cat !== courant; b.setAttribute('aria-selected', String(c.dataset.cat === courant)); b.tabIndex = c.dataset.cat === courant ? 0 : -1; });
    const n = vis($('#cat-' + courant), a).length; vide.hidden = n > 0;
    if (annoncer) etat.textContent = n === 0 ? 'Aucun plat ne correspond.' : plur(n, 'proposition') + ' dans « ' + bt[courant].dataset.nom + ' »' + (a.length ? ', filtre ' + a.map(f => LIB[f]).join(' + ') : '') + '.';
  }
  const choisir = id => { courant = id; maj(true); };
  filtres.forEach(f => f.addEventListener('change', () => maj(true)));
  $('#carte-raz').addEventListener('click', () => { filtres.forEach(f => { f.checked = false; }); maj(true); bt[courant].focus(); });
  DISHES.forEach(d => {
    const h = $('.plat-nom', d.li), b = document.createElement('button'); b.type = 'button'; b.className = 'plat-ouvrir'; b.textContent = d.nom; b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => ouvrirPlat(d, b)); h.textContent = ''; h.appendChild(b); d.li.insertAdjacentHTML('beforeend', '<div class="plat-bas"></div>');
  });
  function ouvrirPlat(d, b) {
    opener = b; const a = ART[d.cat], tg = d.tags.split(' · ');
    pn.innerHTML = `<div class="pn"><div class="pn-haut"><span class="pn-cat">${esc(bt[d.cat].dataset.nom)}</span><button class="pn-fermer" data-fermer>Fermer</button></div>` +
      `<svg class="pn-art gravure" viewBox="${a[1]}" aria-hidden="true"><use href="#${a[0]}"/></svg><h3 id="pn-titre">${esc(d.nom)}</h3><p class="pn-prix">${d.prix} MAD <span class="pn-note">(prix fictif)</span></p>` +
      `<p>${esc(($('.plat-detail p', d.li) || $('.plat-desc', d.li)).textContent)}</p><div class="pn-tags">${tg.map(t => `<span>${esc(t)}</span>`).join('')}</div>` +
      (S.indispo[d.id] ? '<p class="etat-plat">Indisponible pour le moment.</p>' : '') + '<p class="pn-note">Informations de démonstration : en réalité, signalez vos allergies à l\'équipe.</p>' +
      `<div class="pn-bas"><a class="btn" href="#reserver" data-reserver>Réserver une table</a>${d.emp && !S.indispo[d.id] ? `<button class="btn btn--filet" data-ajout="${d.id}" data-fermer>Ajouter à emporter</button>` : ''}<button class="btn btn--filet" data-fermer>Fermer</button></div></div>`;
    panneau.showModal(); panneau.scrollTop = 0; $('.pn-fermer', pn).focus();
  }
  const fermer = r => { panneau.close(); if (r) { opener = null; $('#reserver').scrollIntoView(); history.replaceState(null, '', '#reserver'); } };
  panneau.addEventListener('click', e => { if (e.target === panneau || e.target.closest('[data-fermer]')) { const a = e.target.closest('[data-ajout]'); if (a) ajouter(a.dataset.ajout); fermer(); } else if (e.target.closest('[data-reserver]')) fermer(true); });
  panneau.addEventListener('close', () => { if (opener) { opener.focus(); opener = null; } });
  corps.addEventListener('click', e => { const a = e.target.closest('[data-ajout]'); if (a) ajouter(a.dataset.ajout, a.dataset.k); });
  maj(false);
}

/* ---------- Réservation ---------- */
function initResa() {
  const zone = $('#resa-zone'), etape = $('#etape'), etapesEl = $('#etapes'), msg = $('#resa-msg'); zone.hidden = false;
  const NOMS_E = ['Date', 'Service', 'Créneau', 'Table', 'Préférences', 'Coordonnées', 'Récapitulatif'];
  let D, step, E, conf;
  const neuf = () => { D = { date: null, service: 'soir', covers: 2, slot: null, table: null, degust: D ? D.degust : '', regimes: [], note: '', nom: '', tel: '', mail: '', ok: false }; step = 1; E = {}; conf = null; };
  neuf(); D.degust = '';
  const titre = (t, a) => `<h3 tabindex="-1" id="etape-titre">${t}</h3>${a ? `<p class="etape-aide">${a}</p>` : ''}`;
  const actions = (retour, lib) => `<div class="etape-actions">${retour ? '<button class="btn btn--filet" data-act="retour">Retour</button>' : ''}<button class="btn" data-act="suivant">${lib || 'Continuer'}</button></div>`;
  const erreur = (id, t) => `<p class="erreur${t ? ' vu' : ''}" id="err-${id}">${t ? esc(t) : ''}</p>`;
  const radios = (nom, vals, cur, cls) => `<div class="rec ${cls || ''}">${vals.map(v => `<label><input type="radio" name="${nom}" value="${esc(v.v)}" data-k="${nom}${v.v}"${String(cur) === String(v.v) ? ' checked' : ''}${v.off ? ' disabled' : ''}><span>${v.h}</span></label>`).join('')}</div>`;
  const tableTxt = () => D.table === 'auto' ? 'La maison choisira la table la mieux adaptée.' : D.table ? `Table choisie : ${D.table}, ${seats(D.table)} places, ${zoneDe(D.table)}.` : 'Aucune table choisie.';

  function vueDate() {
    const mois = []; let cur = null;
    JL.forEach(d => { const k = d.getFullYear() * 12 + d.getMonth(); if (!cur || cur.k !== k) { cur = { k, d, j: [] }; mois.push(cur); } cur.j.push(d); });
    let h = titre('Choisissez une date', `Les ${JOURS} prochains jours. La maison est fermée le lundi.`) + '<div class="cal-bleed">';
    mois.forEach(m => {
      const nm = m.d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      h += `<div class="cal-mois"><h4>${esc(nm)}</h4><div class="cal" role="group" aria-label="${esc(nm)}">` + ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(n => `<span class="cal-nom" aria-hidden="true">${n}</span>`).join('') + '<span class="cal-vide"></span>'.repeat((m.j[0].getDay() + 6) % 7);
      m.j.forEach(d => { const s = iso(d), f = ferme(d); h += `<button class="cal-j" data-act="date" data-d="${s}" data-k="d${s}"${f ? ' disabled' : ''} aria-pressed="${D.date === s}" aria-label="${esc(jourLong(s) + (f ? ', fermé' : '') + (s === iso(today) ? ", aujourd'hui" : ''))}">${d.getDate()}${f ? '<small>fermé</small>' : s === iso(today) ? '<small>auj.</small>' : ''}</button>`; });
      h += '</div></div>';
    });
    return h + `</div><p class="cal-choix">${D.date ? esc(maj1(jourLong(D.date))) : 'Aucune date choisie'}</p>` + erreur('date', E.date) + actions(false);
  }
  function vueService() {
    const sv = Object.keys(SV).map(k => { const n = libres(D.date, k, D.covers); return { v: k, h: `<b>${SV[k].nom}</b><small>${SV[k].plage} · ${n ? plur(n, 'créneau libre', 'créneaux libres') : 'complet'}</small>` }; });
    const cv = Array.from({ length: MAX_COUV }, (_, i) => ({ v: i + 1, h: String(i + 1) }));
    return titre('Service et couverts', esc(maj1(jourLong(D.date))) + '.') + `<fieldset class="groupe"><legend>Service</legend>${radios('service', sv, D.service, 'rec--service')}</fieldset>` +
      `<fieldset class="groupe"><legend>Nombre de couverts</legend>${radios('covers', cv, D.covers)}<p class="aide" style="margin-top:8px">Au-delà de ${MAX_COUV} couverts, la maison étudie la demande par téléphone (fictif).</p></fieldset>` + actions(true);
  }
  function vueCreneau() {
    let libre = 0;
    const it = SV[D.service].cr.map(t => { const s = statutCreneau(D.date, D.service, t, D.covers); if (s.ok) libre++; return { v: t, off: !s.ok, h: `<b>${heure(t)}</b><small>${s.motif}</small>` }; });
    return titre('Choisissez un créneau', `${esc(maj1(jourLong(D.date)))} · service ${SV[D.service].nom.toLowerCase()} · ${plur(D.covers, 'couvert')}.`) + (E.slotPerdu ? '<p class="erreur vu" role="alert">Le créneau choisi n\'est plus disponible. Choisissez-en un autre.</p>' : '') +
      `<fieldset class="groupe"><legend>Créneaux</legend>${radios('slot', it, D.slot, 'rec--creneaux')}</fieldset>` + (libre ? '' : `<p class="vide" style="margin:0 0 18px;padding:16px">Aucun créneau libre pour ${plur(D.covers, 'couvert')} à ce service. Essayez l'autre service, moins de couverts ou une autre date.</p>`) + erreur('slot', E.slot) + actions(true);
  }
  function vueTable() {
    const lib = TB.filter(t => t[1] >= D.covers && tEtat(D.date, D.service, t[0]).k === 'libre').length;
    return titre('Choisissez votre table', `${esc(maj1(jourLong(D.date)))} · service ${SV[D.service].nom.toLowerCase()} · ${plur(D.covers, 'couvert')} : ${plur(lib, 'table libre', 'tables libres')}. Une table est gardée pour tout le service.`) +
      (E.tablePerdue ? '<p class="erreur vu" role="alert">La table choisie n\'est plus disponible. Choisissez-en une autre.</p>' : '') + LEG +
      `<div class="plan-boite" id="plan-client">${plan('client', D.date, D.service, { n: D.covers, sel: D.table })}</div><p class="table-choix" id="table-choix">${tableTxt()}</p>` +
      `<button class="btn btn--filet" data-act="auto" data-k="auto" aria-pressed="${D.table === 'auto'}">Laisser la maison choisir</button>` + erreur('table', E.table) + actions(true);
  }
  function vuePrefs() {
    const reg = ['Végétarien', 'Sans gluten', 'Sans alcool', 'Allergie à signaler'];
    return titre('Préférences', 'Facultatif. La maison fait au mieux, sans garantie.') +
      `<fieldset class="groupe"><legend>Menu dégustation (pour toute la table)</legend>${radios('degust', [{ v: '', h: 'Carte' }, { v: 'm1', h: 'Parcours du feu, 690 MAD' }, { v: 'm2', h: 'Parcours du jardin, 590 MAD' }], D.degust)}</fieldset>` +
      `<fieldset class="groupe"><legend>Régimes et allergies</legend><div class="rec">${reg.map((r, i) => `<label><input type="checkbox" name="reg" value="${esc(r)}" data-k="reg${i}"${D.regimes.includes(r) ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div></fieldset>` +
      `<div class="champ"><label for="f-note">Note pour la maison</label><textarea class="saisie" id="f-note" data-f="note" maxlength="300" aria-describedby="f-note-a">${esc(D.note)}</textarea><p class="aide" id="f-note-a">300 caractères maximum. Fictif : n'écrivez rien de personnel.</p></div>` + actions(true);
  }
  const champ = (id, lib, type, val, aide) => `<div class="champ"><label for="f-${id}">${lib}</label><input class="saisie" id="f-${id}" data-f="${id}" type="${type}" value="${esc(val)}" autocomplete="off"${E[id] ? ' aria-invalid="true"' : ''} aria-describedby="aide-${id} err-${id}" required><p class="aide" id="aide-${id}">${aide}</p>${erreur(id, E[id])}</div>`;
  function vueCoord() {
    return titre('Vos coordonnées', 'Données fictives uniquement : rien n\'est transmis ni conservé.') + champ('nom', 'Nom pour la réservation', 'text', D.nom, 'Un nom inventé suffit, par exemple « Table Test ».') +
      champ('tel', 'Téléphone', 'tel', D.tel, 'Numéro fictif au format 10 chiffres, par exemple 05 00 00 00 00.') + champ('mail', 'Adresse e-mail', 'email', D.mail, 'Adresse fictive, par exemple nom@exemple.test.') +
      `<div class="champ"><label class="champ-case"><input type="checkbox" id="f-ok" data-f="ok"${D.ok ? ' checked' : ''}${E.ok ? ' aria-invalid="true"' : ''} aria-describedby="err-ok"> Je comprends que cette réservation est simulée et que mes saisies ne sont pas envoyées.</label>${erreur('ok', E.ok)}</div>` + actions(true);
  }
  const tabTxt = id => `${id} · ${seats(id)} places · ${zoneDe(id)}`;
  const recapHtml = (l, modif) => `<dl class="recap">${l.map(r => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd>${modif ? `<button class="lien" data-act="aller" data-s="${r[2]}">Modifier<span class="vh"> ${r[0].toLowerCase()}</span></button>` : ''}</div>`).join('')}</dl>`;
  function vueRecap() {
    return titre('Récapitulatif', 'Vérifiez avant de confirmer. La réservation est simulée.') + recapHtml([
      ['Date', maj1(jourLong(D.date)), 1], ['Service', SV[D.service].nom + ' · ' + heure(D.slot), 3], ['Couverts', String(D.covers), 2],
      ['Table', D.table === 'auto' ? 'Au choix de la maison' : tabTxt(D.table), 4], ['Menu', D.degust ? DEG[D.degust] : 'À la carte', 5],
      ['Préférences', D.regimes.join(', ') + (D.note ? ' · « ' + D.note + ' »' : '') || 'Aucune', 5], ['Contact', `${D.nom} · ${D.tel} · ${D.mail}`, 6]], true) +
      (E.conflit ? `<p class="erreur vu" role="alert">${esc(E.conflit)}</p>` : '') + '<div class="etape-actions"><button class="btn btn--filet" data-act="retour">Retour</button><button class="btn" data-act="confirmer">Confirmer la réservation (simulée)</button></div>';
  }
  const vueConf = () => `<div class="conf"><h3 tabindex="-1" id="etape-titre">Table réservée, en simulation</h3><p class="conf-petit">Numéro de réservation simulé</p><p class="conf-num">${esc(conf.num)}</p>` +
    `<p class="etape-aide">Aucun message n'est envoyé. La réservation apparaît dans « Mes réservations » et dans la vue « Côté restaurant ». Table attribuée : ${conf.table}.</p>` +
    recapHtml([['Date', maj1(jourLong(conf.date))], ['Service', SV[conf.service].nom + ' · ' + heure(conf.heure)], ['Couverts', String(conf.couverts)], ['Table', tabTxt(conf.table)], ['Contact', conf.nom]]) +
    '<div class="etape-actions"><button class="btn" data-act="nouvelle">Faire une autre réservation</button><a class="btn btn--filet" href="#restaurant">Voir côté restaurant</a></div></div>';

  function render(focusTitre, keepKey) {
    if (D.slot && D.date && !statutCreneau(D.date, D.service, D.slot, D.covers).ok) { D.slot = null; if (step > 3) { step = 3; E.slotPerdu = true; focusTitre = true; } else if (step === 3) E.slotPerdu = true; }
    if (D.table && D.table !== 'auto' && (tEtat(D.date, D.service, D.table).k !== 'libre' || seats(D.table) < D.covers)) { D.table = null; if (step > 4) { step = 4; E.tablePerdue = true; focusTitre = true; } else if (step === 4) E.tablePerdue = true; }
    if (D.table === 'auto' && !tableLibre(D.date, D.service, D.covers)) D.table = null;
    etapesEl.innerHTML = NOMS_E.map((n, i) => { const k = i + 1, fait = conf || k < step; return `<li aria-label="Étape ${k} : ${n}"${!conf && k === step ? ' aria-current="step"' : ''}${fait ? ' class="fait"' : ''}><span>${n}</span>${fait ? '<span class="vh"> (terminé)</span>' : ''}</li>`; }).join('');
    etape.innerHTML = conf ? vueConf() : [0, vueDate, vueService, vueCreneau, vueTable, vuePrefs, vueCoord, vueRecap][step]();
    if (focusTitre) { const t = $('#etape-titre', etape); if (t) t.focus(); } else if (keepKey) { const el = $('[data-k="' + keepKey + '"]', etape); if (el) el.focus(); }
  }
  function valider() {
    const e = {};
    if (step === 1 && !D.date) e.date = 'Choisissez une date dans le calendrier.';
    if (step === 3 && !D.slot) e.slot = 'Choisissez un créneau disponible.';
    if (step === 4 && !D.table) e.table = 'Choisissez une table sur le plan, ou laissez la maison choisir.';
    if (step === 6) {
      if (D.nom.trim().length < 2) e.nom = 'Indiquez un nom d\'au moins 2 caractères.';
      if (!/^0\d{9}$/.test(D.tel.replace(/[\s.\-]/g, ''))) e.tel = 'Saisissez un numéro fictif de 10 chiffres commençant par 0.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(D.mail.trim())) e.mail = 'Saisissez une adresse e-mail valide, par exemple nom@exemple.test.';
      if (!D.ok) e.ok = 'Cochez la case pour confirmer que vous avez compris.';
    }
    return e;
  }
  function suivant() {
    E = valider();
    const premier = ['date', 'slot', 'table', 'nom', 'tel', 'mail', 'ok'].find(k => E[k]);
    if (premier) {
      render(false);
      const c = premier === 'date' ? $('.cal-j:not(:disabled)', etape) : premier === 'slot' ? $('input[name=slot]:not(:disabled)', etape) || $('[data-act=retour]', etape) : premier === 'table' ? $('.tbl', etape) : $('#f-' + premier, etape);
      if (c) c.focus(); return;
    }
    step++; render(true);
  }
  function confirmer() {
    const s = statutCreneau(D.date, D.service, D.slot, D.covers);
    if (!s.ok) { E = { slotPerdu: true }; step = 3; D.slot = null; render(true); return; }
    let t = D.table === 'auto' ? meilleure(D.date, D.service, D.covers) : D.table;
    if (!t || tEtat(D.date, D.service, t).k !== 'libre') { E = { tablePerdue: true }; step = 4; D.table = null; render(true); return; }
    S.seq++; let n; const base = D.date.replace(/-/g, '').slice(2);
    let essai = 0;
    do { n = 'MT-' + base + '-' + (1000 + hash(D.date + D.slot + D.nom + S.seq + '|' + essai++) % 9000); } while (S.resas.some(r => r.num === n));
    conf = { id: S.seq, num: n, date: D.date, service: D.service, heure: D.slot, couverts: D.covers, nom: D.nom.trim(), table: t, choisie: D.table !== 'auto', degust: D.degust, regimes: D.regimes.slice(), statut: 'attendue' };
    S.resas.push(conf); S.jour = D.date; S.sv = D.service;
    msg.textContent = `Réservation confirmée, numéro simulé ${n}, table ${t}.`; majTout(true);
  }
  etape.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    if (a === 'date') { D.date = b.dataset.d; E = {}; D.slot = null; D.table = null; render(false, 'd' + D.date); }
    else if (a === 'suivant') suivant(); else if (a === 'retour') { step--; E = {}; render(true); }
    else if (a === 'aller') { step = +b.dataset.s; E = {}; render(true); }
    else if (a === 'auto') { D.table = D.table === 'auto' ? null : 'auto'; E = {}; render(false, 'auto'); }
    else if (a === 'confirmer') confirmer(); else if (a === 'nouvelle') { neuf(); msg.textContent = ''; render(true); }
  });
  etape.addEventListener('click', e => {
    const g = e.target.closest('.tbl'); if (!g) return; const id = g.dataset.t, es = tEtat(D.date, D.service, id);
    if (es.k !== 'libre') msg.textContent = `Table ${id} ${es.k === 'bloquee' ? 'bloquée par la maison' : 'déjà réservée'} pour ce service.`;
    else if (seats(id) < D.covers) msg.textContent = `Table ${id} trop petite pour ${plur(D.covers, 'couvert')}.`;
    else { D.table = D.table === id ? null : id; E = {}; msg.textContent = ''; render(false, 't-c-' + id); }
  });
  etape.addEventListener('keydown', planClavier);
  etape.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'service') { D.service = t.value; D.slot = null; D.table = null; render(false, 'service' + t.value); }
    else if (t.name === 'covers') { D.covers = +t.value; D.slot = null; render(false, 'covers' + t.value); }
    else if (t.name === 'slot') { D.slot = t.value; E = {}; render(false, 'slot' + t.value); }
    else if (t.name === 'degust') D.degust = t.value;
    else if (t.name === 'reg') D.regimes = $$('input[name=reg]:checked', etape).map(i => i.value);
    else if (t.dataset.f === 'ok') { D.ok = t.checked; if (t.checked) { delete E.ok; const er = $('#err-ok', etape); er.textContent = ''; er.classList.remove('vu'); t.removeAttribute('aria-invalid'); } }
  });
  etape.addEventListener('input', e => { const f = e.target.dataset.f; if (f && f !== 'ok') D[f] = e.target.value; });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-menu]'); if (!a) return;
    D.degust = a.dataset.menu; msg.textContent = DEG[D.degust] + ' ajouté à votre réservation (étape Préférences).'; if (step === 5) render(false);
  });

  /* Mes réservations */
  const liste = $('#mr-liste'), aide = $('#mr-aide'), mrMsg = $('#mr-msg');
  const LIBC = { attendue: 'Confirmée (simulée)', 'installée': 'Vous êtes installé(e) à votre table', 'terminée': 'Service terminé', absente: 'Marquée absente par la maison', 'annulée': 'Annulée', 'annulée par la maison': 'Annulée par la maison' };
  S.rendreMes = () => {
    aide.hidden = S.resas.length > 0;
    liste.innerHTML = S.resas.slice().reverse().map(r => {
      const s = st(r), att = s === 'attendue', fer = att && ov(r.date, r.heure).ferme;
      const act = !att ? '' : S.annuler === r.id ? `<span class="mr-det" style="width:100%">Annuler cette réservation ?</span><button class="mini mini--danger" data-act="oui" data-id="${r.id}" data-k="oui${r.id}">Oui, annuler</button><button class="mini" data-act="non" data-id="${r.id}">Garder</button>`
        : `<button class="mini" data-act="annuler" data-id="${r.id}" data-k="an${r.id}" aria-label="Annuler la réservation ${esc(r.num)}">Annuler</button>`;
      return `<li class="mr${s.startsWith('annulée') ? ' annulee' : ''}"><p class="mr-num">${esc(r.num)}</p><p class="mr-det">${esc(maj1(jourLong(r.date)))} · ${SV[r.service].nom} ${heure(r.heure)} · ${plur(r.couverts, 'couvert')} · table ${r.table}${r.degust ? ' · ' + DEG[r.degust] : ''}</p><p class="mr-det">${esc(r.nom)}</p><span class="mr-etat${fer ? ' alerte' : ''}" data-statut="${esc(s)}">${fer ? 'Créneau fermé par la maison : à reprogrammer (simulation)' : LIBC[s]}</span>${act ? `<div class="mr-actions">${act}</div>` : ''}</li>`;
    }).join('');
  };
  liste.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const id = +b.dataset.id, a = b.dataset.act;
    if (a === 'annuler') { S.annuler = id; S.rendreMes(); $('[data-k="oui' + id + '"]', liste).focus(); }
    else if (a === 'non') { S.annuler = null; S.rendreMes(); $('[data-k="an' + id + '"]', liste).focus(); }
    else if (a === 'oui') { const r = S.resas.find(x => x.id === id); r.statut = 'annulée'; S.annuler = null; mrMsg.textContent = `Réservation ${r.num} annulée : ${plur(r.couverts, 'place')} et table ${r.table} remises à disposition.`; majTout(); const h = $('#mr-titre'); h.tabIndex = -1; h.focus(); }
  });
  S.renderResa = render; render(false);
}

/* ---------- Commande à emporter ---------- */
const retraits = d => { const out = []; [['midi', 12 * 60 + 30, 14 * 60 + 15], ['soir', 19 * 60 + 30, 22 * 60 + 15]].forEach(([sv, a, b]) => { for (let m = a; m <= b; m += 15) { const t = pad(Math.floor(m / 60)) + ':' + pad(m % 60); if (!passe(d, t)) out.push([sv, t]); } }); return out; };
const lignes = () => Object.keys(S.cart).map(id => ({ d: dish(id), q: S.cart[id] }));
const total = ls => ls.reduce((n, l) => n + l.d.prix * l.q, 0);
function ajouter(id, fk) {
  const d = dish(id); if (!d || !d.emp || S.indispo[id]) return;
  S.cart[id] = Math.min(9, (S.cart[id] || 0) + 1); S.conf = null;
  $('#carte-etat').textContent = `${d.nom} ajouté : ${S.cart[id]} dans la commande à emporter.`; majTout(false, fk);
}
function initEmporter() {
  const zone = $('#emp-zone'), pan = $('#panier'), liste = $('#mc-liste'), aide = $('#mc-aide'), mm = $('#mc-msg'); zone.hidden = false;
  const jours3 = OUV.slice(0, 3), errs = () => S.errP;
  const optJ = jours3.map(d => `<option value="${d}"${S.pick.date === d ? ' selected' : ''}>${esc(maj1(jourLong(d)))}</option>`).join('');
  S.rendrePanier = () => {
    const ls = lignes(), p = S.pick, E = errs();
    if (!retraits(p.date).some(r => r[1] === p.heure)) p.heure = '';
    if (S.conf) {
      const o = S.conf;
      pan.innerHTML = `<div class="tk-ok"><h3 tabindex="-1" id="tk-titre">Commande reçue <span>simulée</span></h3><p class="conf-petit" style="margin-top:12px">Numéro de commande simulé</p><p class="tk-num">${esc(o.num)}</p>` +
        `<p class="tk-paiement"><b>Paiement sur place</b> au retrait, ${esc(jourLong(o.date))} à ${heure(o.heure)}. Rien n'a été payé en ligne.</p>` + recapHtmlTk(o) + '<div class="etape-actions" style="border-color:var(--encre)"><button class="btn" data-pa="nouvelle">Nouvelle commande</button></div></div>';
      return;
    }
    const indis = ls.filter(l => S.indispo[l.d.id]);
    let h = `<h3>Ma commande <span>à emporter</span></h3>`;
    if (!ls.length) h += '<p class="tk-vide">Votre panier est vide. Ajoutez des plats depuis la carte : chaque plat porte un bouton « Ajouter à emporter ».</p><div style="margin-top:14px"><a class="btn btn--filet" href="#carte">Aller à la carte</a></div>';
    else {
      h += '<ul class="tk-lignes">' + ls.map(l => `<li><span class="tk-nom">${esc(l.d.nom)}${S.indispo[l.d.id] ? '<small>Plus disponible : retirez cette ligne.</small>' : ''}</span><span class="qte" role="group" aria-label="Quantité de ${esc(l.d.nom)}"><button data-pa="moins" data-id="${l.d.id}" data-k="m-${l.d.id}" aria-label="Retirer un ${esc(l.d.nom)}">−</button><output>${l.q}</output><button data-pa="plus" data-id="${l.d.id}" data-k="p-${l.d.id}" aria-label="Ajouter un ${esc(l.d.nom)}"${l.q >= 9 || S.indispo[l.d.id] ? ' aria-disabled="true"' : ''}>+</button></span><span class="tk-prix">${l.d.prix * l.q} MAD</span></li>`).join('') + '</ul>';
      h += `<p class="tk-total">Total <b id="tk-total">${total(ls)} MAD</b></p><p class="tk-paiement"><b>Paiement sur place</b> au retrait. Aucun paiement en ligne.</p>`;
      h += `<div class="tk-duo"><div class="champ"><label for="p-jour">Jour de retrait</label><select class="saisie" id="p-jour" data-p="date">${optJ}</select></div>` +
        `<div class="champ"><label for="p-heure">Heure de retrait</label><select class="saisie" id="p-heure" data-p="heure" aria-describedby="err-ph"${E.heure ? ' aria-invalid="true"' : ''}><option value="">Choisir…</option>${['midi', 'soir'].map(sv => `<optgroup label="${SV[sv].nom}">${retraits(p.date).filter(r => r[0] === sv).map(r => `<option value="${r[1]}"${p.heure === r[1] ? ' selected' : ''}>${heure(r[1])}</option>`).join('')}</optgroup>`).join('')}</select>${erreur2('ph', E.heure)}</div></div>`;
      h += `<div class="champ"><label for="p-nom">Nom pour le retrait</label><input class="saisie" id="p-nom" data-p="nom" value="${esc(p.nom)}" autocomplete="off" aria-describedby="err-pn"${E.nom ? ' aria-invalid="true"' : ''}><p class="aide">Un nom inventé suffit. Rien n'est envoyé.</p>${erreur2('pn', E.nom)}</div>`;
      if (!S.emp) h += '<p class="erreur vu" role="alert">La cuisine ne prend plus de commandes à emporter pour le moment.</p>';
      if (indis.length) h += '<p class="erreur vu" role="alert">' + (indis.length > 1 ? 'Des plats ne sont' : 'Un plat n\'est') + ' plus disponible : retirez-' + (indis.length > 1 ? 'les' : 'le') + ' pour commander.</p>';
      h += `<button class="btn" data-pa="commander" data-k="commander"${!S.emp || indis.length ? ' aria-disabled="true"' : ''}>Passer la commande (simulée)</button>`;
    }
    pan.innerHTML = h;
  };
  const erreur2 = (id, t) => `<p class="erreur${t ? ' vu' : ''}" id="err-${id}">${t ? esc(t) : ''}</p>`;
  const recapHtmlTk = o => `<ul class="tk-lignes">${o.lignes.map(l => `<li><span class="tk-nom">${l.q} × ${esc(l.nom)}</span><span></span><span class="tk-prix">${l.q * l.prix} MAD</span></li>`).join('')}</ul><p class="tk-total">Total <b>${o.total} MAD</b></p>`;
  pan.addEventListener('click', e => {
    const b = e.target.closest('[data-pa]'); if (!b) return; const a = b.dataset.pa, id = b.dataset.id;
    if (a === 'plus') { if (b.getAttribute('aria-disabled')) return; S.cart[id]++; majTout(false, b.dataset.k); }
    else if (a === 'moins') { if (--S.cart[id] <= 0) { delete S.cart[id]; majTout(false, 'commander'); } else majTout(false, b.dataset.k); }
    else if (a === 'nouvelle') { S.conf = null; majTout(); $('#tk-titre') && $('#tk-titre').focus(); }
    else if (a === 'commander') {
      if (b.getAttribute('aria-disabled')) { mm.textContent = !S.emp ? 'La cuisine ne prend plus de commandes pour le moment.' : 'Retirez les plats indisponibles pour commander.'; return; }
      const p = S.pick, ls = lignes(); S.errP = {};
      if (!p.heure) S.errP.heure = 'Choisissez une heure de retrait.';
      if (p.nom.trim().length < 2) S.errP.nom = 'Indiquez un nom d\'au moins 2 caractères.';
      if (S.errP.heure || S.errP.nom) { S.rendrePanier(); (S.errP.heure ? $('#p-heure') : $('#p-nom')).focus(); return; }
      S.oseq++; const o = { id: 'c' + S.oseq, num: `EM-${p.date.slice(8)}${p.date.slice(5, 7)}-${100 + S.oseq}`, date: p.date, heure: p.heure, nom: p.nom.trim(), lignes: ls.map(l => ({ id: l.d.id, nom: l.d.nom, prix: l.d.prix, q: l.q })), total: total(ls), statut: 'reçue' };
      S.orders.push(o); S.cart = {}; S.conf = o; S.jour = o.date; S.sv = svOf(o.heure);
      mm.textContent = `Commande ${o.num} reçue (simulée). Paiement sur place au retrait.`; majTout(); $('#tk-titre').focus();
    }
  });
  pan.addEventListener('change', e => { const f = e.target.dataset.p; if (f === 'date') { S.pick.date = e.target.value; S.pick.heure = ''; S.rendrePanier(); $('#p-jour').focus(); } else if (f === 'heure') { S.pick.heure = e.target.value; delete S.errP.heure; } });
  pan.addEventListener('input', e => { if (e.target.dataset.p === 'nom') S.pick.nom = e.target.value; });
  const LIBO = { 'reçue': 'Reçue par la cuisine', 'en cuisine': 'En cuisine', 'prête': 'Prête : à retirer au comptoir, paiement sur place', 'retirée': 'Retirée, merci', 'annulée': 'Annulée' };
  S.rendreCmd = () => {
    aide.hidden = S.orders.length > 0;
    liste.innerHTML = S.orders.slice().reverse().map(o => `<li class="mr${o.statut === 'annulée' ? ' annulee' : ''}"><p class="mr-num">${esc(o.num)}</p><p class="mr-det">Retrait ${esc(jourLong(o.date))} à ${heure(o.heure)} · ${esc(o.nom)}</p><p class="mr-lignes">${o.lignes.map(l => l.q + ' × ' + esc(l.nom)).join(', ')} · <b>${o.total} MAD</b></p><span class="mr-etat" data-statut="${o.statut}">${LIBO[o.statut]}</span></li>`).join('');
  };
}

/* ---------- Côté restaurant ---------- */
const NEXT = { attendue: [['installée', 'Installer', 'pri'], ['absente', 'Absente', ''], ['annulée par la maison', 'Annuler', 'danger']], 'installée': [['terminée', 'Terminer', 'pri'], ['attendue', 'Remettre en attente', '']], 'terminée': [['installée', 'Rouvrir', '']], absente: [['attendue', 'Remettre en attente', '']] };
const CNEXT = { 'reçue': [['en cuisine', 'Passer en cuisine', 'pri'], ['annulée', 'Annuler', 'danger']], 'en cuisine': [['prête', 'Marquer prête', 'pri'], ['annulée', 'Annuler', 'danger']], 'prête': [['retirée', 'Marquer retirée', 'pri']] };
const badge = s => `<span class="statut st-${s.replace(/ /g, '-')}">${s}</span>`;
const btns = (list, attr, id, nom) => list.map(a => `<button class="mini${a[2] ? ' mini--' + a[2] : ''}" ${attr}="${a[0]}" data-id="${id}" data-k="${attr}-${asc(a[0]).replace(/ /g, '')}-${id}" aria-label="${a[1]} ${esc(nom)}">${a[1]}</button>`).join('');
const actResa = r => btns(NEXT[st(r)] || [], 'data-ra', r.id, r.nom + ', table ' + r.table);
function initConsole() {
  const c = $('#console'), jour = $('#cs-jour'), svEl = $('#cs-service'), kp = $('#kpis'), tabs = $('#cs-onglets'), pan = $('#cs-panneau'), msg = $('#cs-msg'); c.hidden = false;
  jour.innerHTML = OUV.map(d => `<option value="${d}">${esc(maj1(jourLong(d)))}</option>`).join('');
  const TABS = [['resas', 'Réservations'], ['plan', 'Plan de salle'], ['emporter', 'À emporter'], ['creneaux', 'Créneaux'], ['carte', 'Carte']];
  const dire = t => { msg.textContent = t; };
  const ordres = () => S.orders.filter(o => o.date === S.jour && svOf(o.heure) === S.sv).sort((a, b) => a.heure.localeCompare(b.heure));
  const rsv = () => tous(S.jour).filter(r => r.service === S.sv);
  function kpiHtml() {
    const rs = rsv(), sum = s => rs.filter(r => st(r) === s).reduce((n, r) => n + r.couverts, 0), att = sum('attendue'), ins = sum('installée'), ter = sum('terminée');
    const capTot = SV[S.sv].cr.reduce((n, t) => { const k = creneau(S.jour, S.sv, t); return n + (k.ferme ? 0 : k.cap); }, 0), os = ordres().filter(o => o.statut !== 'annulée');
    const K = [['Couverts attendus', att, 'att'], ['Couverts installés', ins, 'ins'], ['Tables occupées', rs.filter(r => st(r) === 'installée').length + `<small> / ${TB.length}</small>`, 'occ'], ['Remplissage', (capTot ? Math.round(100 * (att + ins + ter) / capTot) : 0) + '<small> %</small>', 'rem'],
      ['Emporter en cours', os.filter(o => ['reçue', 'en cuisine', 'prête'].includes(o.statut)).length, 'emp'], ['Encaissé sur place', os.filter(o => o.statut === 'retirée').reduce((n, o) => n + o.total, 0) + '<small> MAD</small>', 'enc']];
    return K.map(k => `<dl class="kpi" data-kpi="${k[2]}"><dt class="kpi-nom">${k[0]}</dt><dd class="kpi-val">${k[1]}</dd></dl>`).join('');
  }
  function pResas() {
    const rs = rsv();
    return `<h3>Réservations · ${esc(jourLong(S.jour))}, ${SV[S.sv].nom.toLowerCase()}</h3><p class="cs-aide">${plur(rs.length, 'réservation')}. Les groupes « fictifs » sont des exemples ; vos réservations portent un numéro MT-.</p>` +
      (rs.length ? '<ul class="rl">' + rs.map(r => `<li data-resa="${r.id}" data-statut="${esc(st(r))}"><span class="rl-h">${heure(r.heure)}</span><span class="rl-info"><b>${esc(r.nom)}</b>${r.fict ? ' (fictif)' : ' · ' + esc(r.num)} · ${plur(r.couverts, 'couvert')} · table ${r.table}${r.degust ? ' · ' + DEG[r.degust] : ''}${badge(st(r))}</span><span class="rl-actions">${actResa(r)}</span></li>`).join('') + '</ul>' : '<p class="vide">Aucune réservation sur ce service.</p>');
  }
  function fiche() {
    const id = S.selT; if (!id) return '<div class="fiche-table"><h4>Fiche de table</h4><p class="cs-aide">Touchez une table du plan pour voir son état et agir dessus.</p></div>';
    const e = tEtat(S.jour, S.sv, id);
    let h = `<div class="fiche-table"><h4>Table ${id}</h4><p class="cs-aide">${seats(id)} places · ${zoneDe(id)}</p>`;
    if (e.k === 'libre') h += `<p>Libre pour ce service.</p><div class="mr-actions"><button class="mini mini--danger" data-bl="1" data-k="bl-${id}">Bloquer la table</button></div>`;
    else if (e.k === 'bloquee') h += `<p>Bloquée pour ce service : le client ne peut plus la choisir.</p><div class="mr-actions"><button class="mini mini--pri" data-bl="0" data-k="bl-${id}">Débloquer la table</button></div>`;
    else h += `<p><b>${esc(e.r.nom)}</b>${badge(st(e.r))}<br>${plur(e.r.couverts, 'couvert')} · ${heure(e.r.heure)}${e.r.fict ? ' (fictif)' : ' · ' + esc(e.r.num)}</p><div class="mr-actions">${actResa(e.r)}</div><p class="aide" style="margin-top:8px">Pour bloquer cette table, annulez d'abord la réservation.</p>`;
    return h + '</div>';
  }
  const pPlan = () => `<h3>Plan de salle · ${SV[S.sv].nom.toLowerCase()}</h3><p class="cs-aide">Même plan que celui du client, avec les statuts du service.</p><div class="resto-plan"><div><ul class="legende"><li><i></i>Libre</li><li><i class="l-res"></i>Attendue</li><li><i class="l-ins"></i>Installée</li><li><i class="l-blo"></i>Bloquée</li></ul><div class="plan-boite" id="plan-resto">${plan('resto', S.jour, S.sv, {})}</div></div><div id="fiche">${fiche()}</div></div>`;
  function pEmporter() {
    const os = ordres();
    return `<h3>Commandes à emporter · ${SV[S.sv].nom.toLowerCase()}</h3><p class="cs-aide">${plur(os.length, 'commande')}. Chaque changement de statut est visible tout de suite par le client.</p>` +
      (os.length ? '<ul class="rl">' + os.map(o => `<li data-cmd="${o.id}" data-statut="${o.statut}"><span class="rl-h">${heure(o.heure)}</span><span class="rl-info"><b>${esc(o.nom)}</b> · ${esc(o.num)}${o.fict ? ' (fictif)' : ''}${badge(o.statut)}<br>${o.lignes.map(l => l.q + ' × ' + esc(l.nom)).join(', ')} · <b>${o.total} MAD</b>, à payer sur place</span><span class="rl-actions">${btns(CNEXT[o.statut] || [], 'data-co', o.id, o.num)}</span></li>`).join('') + '</ul>' : '<p class="vide">Aucune commande à emporter sur ce service. Passez-en une côté client, plus haut.</p>');
  }
  function pCreneaux() {
    return `<h3>Créneaux · ${SV[S.sv].nom.toLowerCase()}</h3><p class="cs-aide">Ouvrez, fermez ou ajustez la capacité : le parcours de réservation en tient compte aussitôt.</p>` +
      `<div class="bascule"><span><b>Commandes à emporter</b><br><span class="aide">${S.emp ? 'La cuisine accepte les commandes.' : 'Commandes en pause : le client ne peut plus commander.'}</span></span><button class="interrupteur" role="switch" aria-checked="${S.emp}" data-emp="1" data-k="emp">${S.emp ? 'Ouvertes' : 'En pause'}</button></div>` +
      SV[S.sv].cr.map(t => {
        const k = creneau(S.jour, S.sv, t), o = ov(S.jour, t), rp = S.resas.filter(r => st(r) === 'attendue' && r.date === S.jour && r.heure === t).length;
        const etat = k.ferme ? 'Fermé' : k.passe ? 'Horaire passé' : k.restant === 0 ? 'Complet' : 'Ouvert';
        return `<div class="cr${k.ferme ? ' ferme' : ''}" data-slot="${t}" data-restantes="${k.restant}" data-capacite="${k.cap}" data-ferme="${k.ferme}"><span class="cr-h">${heure(t)}</span><p class="cr-det"><span class="cr-etat">${etat}</span><b>${k.restant} restantes</b> sur ${k.cap} couverts · ${k.pris} déjà réservés${k.ferme && rp ? ' · ' + plur(rp, 'réservation') + ' à reprogrammer' : ''}</p>` +
          `<span class="cr-cap" role="group" aria-label="Capacité de ${heure(t)}"><button data-cap="-${PAS}" data-t="${t}" data-k="cm${t}" aria-label="Retirer ${PAS} couverts à ${heure(t)}"${o.cap - PAS < k.pris ? ' aria-disabled="true"' : ''}>−</button><output aria-label="Capacité, en couverts">${o.cap}</output><button data-cap="${PAS}" data-t="${t}" data-k="cp${t}" aria-label="Ajouter ${PAS} couverts à ${heure(t)}"${o.cap + PAS > CAP_MAX ? ' aria-disabled="true"' : ''}>+</button></span>` +
          `<button class="mini" data-fe="${t}" data-k="fe${t}">${k.ferme ? 'Ouvrir le créneau' : 'Fermer le créneau'}<span class="vh"> de ${heure(t)}</span></button></div>`;
      }).join('');
  }
  function pCarte() {
    const CN = { entrees: 'Entrées', plats: 'Plats', desserts: 'Desserts', boissons: 'Boissons' };
    let h = '<h3>Carte</h3><p class="cs-aide">Rendez un plat indisponible : la carte, le panier et les commandes en cours côté client changent aussitôt.</p><ul class="carte-resto">';
    Object.keys(CN).forEach(cat => { h += `<li class="rl-sep" style="display:block;border:0">${CN[cat]}</li>` + DISHES.filter(d => d.cat === cat).map(d => `<li class="${S.indispo[d.id] ? 'off' : ''}"><span class="cr-nom">${esc(d.nom)} <small>${d.prix} MAD</small></span><button class="interrupteur" role="switch" aria-checked="${!S.indispo[d.id]}" data-di="${d.id}" data-k="di-${d.id}" aria-label="${esc(d.nom)}, disponible">${S.indispo[d.id] ? 'Indisponible' : 'Disponible'}</button></li>`).join(''); });
    return h + '</ul>';
  }
  S.rendreConsole = () => {
    jour.value = S.jour; svEl.innerHTML = ['midi', 'soir'].map(k => `<label><input type="radio" name="cs-sv" value="${k}" data-k="sv-${k}"${S.sv === k ? ' checked' : ''}><span>${SV[k].nom}<small>${SV[k].plage}</small></span></label>`).join('');
    kp.innerHTML = kpiHtml();
    const nAtt = rsv().filter(r => st(r) === 'attendue').length, nEm = ordres().filter(o => ['reçue', 'en cuisine', 'prête'].includes(o.statut)).length;
    tabs.innerHTML = TABS.map(t => `<button class="onglet" role="tab" id="cs-t-${t[0]}" aria-selected="${S.onglet === t[0]}" aria-controls="cs-panneau" tabindex="${S.onglet === t[0] ? 0 : -1}" data-tab="${t[0]}" data-k="tab-${t[0]}">${t[1]}${t[0] === 'resas' && nAtt ? `<span class="pastille" aria-label="${nAtt} attendues">${nAtt}</span>` : ''}${t[0] === 'emporter' && nEm ? `<span class="pastille" aria-label="${nEm} en cours">${nEm}</span>` : ''}</button>`).join('');
    pan.setAttribute('aria-labelledby', 'cs-t-' + S.onglet);
    pan.innerHTML = { resas: pResas, plan: pPlan, emporter: pEmporter, creneaux: pCreneaux, carte: pCarte }[S.onglet]();
  };
  jour.addEventListener('change', () => { S.jour = jour.value; S.selT = null; majTout(); });
  svEl.addEventListener('change', e => { S.sv = e.target.value; S.selT = null; majTout(false, 'sv-' + S.sv); });
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.onglet = b.dataset.tab; majTout(false, b.dataset.k); } });
  tabs.addEventListener('keydown', e => {
    const ids = TABS.map(t => t[0]), i = ids.indexOf(e.target.dataset.tab); let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ids.length - 1; else return;
    e.preventDefault(); S.onglet = ids[n]; majTout(false, 'tab-' + ids[n]);
  });
  const ok = dire;
  const setSt = (r, s) => {
    if (OCC.includes(s) && !OCC.includes(st(r))) {   // la table a pu être réservée ou bloquée entre-temps
      const e = tEtat(r.date, r.service, r.table);
      if (e.k !== 'libre') { ok(`Impossible : la table ${r.table} est ${e.k === 'bloquee' ? 'bloquée' : 'déjà réservée'} pour ce service.`); return; }
    }
    if (r.fict) S.stat[r.id] = s; else r.statut = s; ok(`${r.nom} (table ${r.table}) : ${s}.`);
  };
  const rf = (a, id) => { const m = $(`[data-k^="${a}"][data-id="${id}"]`); (m || tabs.querySelector('[aria-selected=true]')).focus(); };
  pan.addEventListener('click', e => {
    const t = e.target, g = t.closest('.tbl'), b = t.closest('button'); if (g) { S.selT = g.dataset.t; majTout(false, 't-r-' + S.selT); return; } if (!b) return; const D = b.dataset, fk = D.k;
    if (b.hasAttribute('data-ra')) { setSt(byId(D.id), b.getAttribute('data-ra')); majTout(); rf('data-ra', D.id); }
    else if (b.hasAttribute('data-co')) { const o = S.orders.find(x => x.id === D.id), s = b.getAttribute('data-co'); o.statut = s; ok(`Commande ${o.num} : ${s}.`); majTout(); rf('data-co', D.id); }
    else if (D.bl) { const v = D.bl === '1'; S.bloc[S.jour + S.sv + S.selT] = v; ok(`Table ${S.selT} ${v ? 'bloquée' : 'débloquée'}.`); majTout(false, fk); }
    else if (D.cap) { const tt = D.t, o = ovw(S.jour, tt), k = creneau(S.jour, S.sv, tt), nv = o.cap + +D.cap; if (nv < k.pris) { dire(`Capacité minimale : ${k.pris} couverts déjà réservés.`); return; } if (nv > CAP_MAX) { dire(`Capacité maximale : ${CAP_MAX} couverts.`); return; } o.cap = nv; ok(`Créneau ${heure(tt)} : capacité ${nv} couverts.`); majTout(false, fk); }
    else if (D.fe) { const o = ovw(S.jour, D.fe); o.ferme = !o.ferme; ok(`Créneau ${heure(D.fe)} ${o.ferme ? 'fermé' : 'rouvert'}.`); majTout(false, fk); }
    else if (D.emp) { S.emp = !S.emp; ok(S.emp ? 'Commandes à emporter rouvertes.' : 'Commandes à emporter en pause.'); majTout(false, 'emp'); }
    else if (D.di) { const d = dish(D.di); S.indispo[d.id] = !S.indispo[d.id]; ok(`${d.nom} : ${S.indispo[d.id] ? 'indisponible' : 'de nouveau disponible'}.`); majTout(false, fk); }
  });
  pan.addEventListener('keydown', planClavier);
}

function majTout(focusTitre, fk) {
  majCarte(); S.renderResa(!!focusTitre); S.rendreMes(); S.rendrePanier(); S.rendreCmd(); S.rendreConsole();
  const n = Object.values(S.cart).reduce((a, b) => a + b, 0), p = $('#pastille-panier'); p.hidden = !n; p.textContent = n;
  if (fk) { const el = $('[data-k="' + fk + '"]'); if (el) el.focus(); }
}

initCarte(); initResa(); initEmporter(); initConsole(); majTout();
etroit.addEventListener('change', () => majTout());
})();
