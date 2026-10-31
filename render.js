'use strict';

/* =====================================================================
   RENDERIZAÇÃO, EFEITOS DE VISÃO (noturna/térmica), ENTRADA E LOOP
   ===================================================================== */

const fogC = document.createElement('canvas'), fogX = fogC.getContext('2d');
const roofC = document.createElement('canvas'), roofX = roofC.getContext('2d');
const miniC = $('minimap'), miniX = miniC.getContext('2d');
const noiseC = document.createElement('canvas');
{ noiseC.width = noiseC.height = 96; const nx = noiseC.getContext('2d'), im = nx.createImageData(96, 96); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } nx.putImageData(im, 0, 0); }

/* =====================================================================
   ARMAS E SOLDADOS
   ===================================================================== */
// posições de montagem dos acessórios (ponta do cano, topo e parte de baixo)
function gunGeom(w) {
  const s = w.shape;
  if (typeof s === 'object') return { mx: s.b + s.br, tx: s.b * .3, ux: s.b * .7, th: s.bh };
  return { mx: w.len, tx: w.len * .3, ux: w.len * .62, th: 5 };
}
function drawAtt(c, w, att) {
  if (!att || !w.att) return;
  const g = gunGeom(w), mx = g.mx, y2 = g.th / 2;
  switch (att.muzzle) {
    case 'a_sup':   c.fillStyle = '#1b1e22'; c.fillRect(mx - 2, -2.6, 13, 5.2); c.fillStyle = '#3d434a'; c.fillRect(mx, -2, 10, 1); c.fillRect(mx, 1, 10, 1); break;
    case 'a_flash': c.fillStyle = '#2a2d31'; c.fillRect(mx - 1, -2, 5, 4); c.fillStyle = '#111'; c.fillRect(mx + 3, -2.4, 1.4, 1.2); c.fillRect(mx + 3, 1.2, 1.4, 1.2); break;
    case 'a_comp':  c.fillStyle = '#25282c'; c.fillRect(mx - 1, -2.4, 5, 4.8); c.fillStyle = '#0b0c0d'; c.fillRect(mx + 1, -2.4, .9, 4.8); c.fillRect(mx + 2.6, -2.4, .9, 4.8); break;
    case 'a_brake': c.fillStyle = '#2b2f34'; c.fillRect(mx - 1, -3.2, 6, 6.4); c.fillStyle = '#0b0c0d'; c.fillRect(mx + 2, -3.2, 1.2, 1.4); c.fillRect(mx + 2, 1.8, 1.2, 1.4); break;
    case 'a_long':  c.fillStyle = '#15171a'; c.fillRect(mx, -1.2, 9, 2.4); c.fillStyle = '#4a4f55'; c.fillRect(mx + 8, -1.8, 1.6, 3.6); break;
    case 'a_choke': c.fillStyle = '#3a3f45'; c.fillRect(mx - 1, -2.8, 3.4, 5.6); c.fillStyle = '#111'; c.fillRect(mx + 1.4, -1.6, 1, 3.2); break;
  }
  switch (att.top) {
    case 'a_red':    c.fillStyle = '#101214'; c.fillRect(g.tx, -2.4, 6, 4.8); c.fillStyle = '#ff3030'; c.beginPath(); c.arc(g.tx + 4.6, 0, 1.1, 0, PI2); c.fill(); break;
    case 'a_holo':   c.fillStyle = '#16181b'; c.fillRect(g.tx, -2.8, 7, 5.6); c.fillStyle = 'rgba(120,220,255,.85)'; c.fillRect(g.tx + 5.4, -2.4, 1.2, 4.8); break;
    case 'a_scope3': c.fillStyle = '#0d0d0d'; c.fillRect(g.tx - 1, -2.4, 14, 4.8); c.fillStyle = '#7fd4ff'; c.fillRect(g.tx - 1.4, -2.2, 1.6, 4.4); c.fillRect(g.tx + 12, -2.2, 1.6, 4.4); break;
    case 'a_scope6': c.fillStyle = '#0d0d0d'; c.fillRect(g.tx - 2, -2.7, 20, 5.4); c.fillStyle = '#9fe0ff'; c.fillRect(g.tx - 2.4, -2.5, 1.8, 5); c.fillRect(g.tx + 17, -2.5, 1.8, 5); c.fillStyle = '#2a2d31'; c.fillRect(g.tx + 6, -3.2, 4, 6.4); break;
    case 'a_thermal': c.fillStyle = '#2a2d31'; c.fillRect(g.tx - 1, -3.2, 11, 6.4); c.fillStyle = '#ff9a3a'; c.beginPath(); c.arc(g.tx + 9.6, 0, 2.2, 0, PI2); c.fill(); c.fillStyle = '#111'; c.fillRect(g.tx + 1, -2.4, 4, 4.8); break;
  }
  switch (att.under) {
    case 'a_grip':   c.fillStyle = '#1b1d20'; c.fillRect(g.ux, y2, 3.2, 6.5); c.fillStyle = '#3a3d42'; c.fillRect(g.ux, y2 + 4, 3.2, 1.2); break;
    case 'a_angled': c.fillStyle = '#1b1d20'; c.beginPath(); c.moveTo(g.ux, y2); c.lineTo(g.ux + 3.4, y2); c.lineTo(g.ux + 6.4, y2 + 5.6); c.lineTo(g.ux + 3.4, y2 + 5.6); c.closePath(); c.fill(); break;
    case 'a_laser':  c.fillStyle = '#25282c'; c.fillRect(g.ux, y2, 6.5, 3); c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(g.ux + 6.6, y2 + 1.5, 1.1, 0, PI2); c.fill(); break;
    case 'a_light':  c.fillStyle = '#4a4f55'; c.fillRect(g.ux, y2, 7.5, 4); c.fillStyle = '#fff3b0'; c.fillRect(g.ux + 7.4, y2 + .5, 1.6, 3); break;
    case 'a_bipod':  c.strokeStyle = '#2a2d31'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(g.ux, y2); c.lineTo(g.ux + 6, y2 + 6); c.moveTo(g.ux + 2, y2); c.lineTo(g.ux + 8, y2 + 5); c.stroke(); break;
  }
}
function drawGun(c, id, att) {
  drawGunBase(c, id);
  const w = WMAP[id];
  if (att && !w.melee) drawAtt(c, w, att);
}

function drawGunBase(c, id) {
  const w = WMAP[id], s = w.shape;
  if (s === 'pistol') {
    const L = w.len, th = L > 16 ? 5.6 : 4.8;
    c.fillStyle = '#2d2d2d'; c.fillRect(-1, -th / 2, L + 1, th); c.fillStyle = '#6a6a6a'; c.fillRect(1, -th / 2 + 1.1, L - 2, th - 2.2);
    if (w.sup) { c.fillStyle = '#1a1c20'; c.fillRect(L - 2, -2.1, 8, 4.2); }
  } else if (s === 'revolver') {
    c.fillStyle = '#2d2d2d'; c.fillRect(-1, -2.2, 18, 4.4); c.fillStyle = '#6a6a6a'; c.fillRect(8, -1.2, 9, 2.4);
    c.fillStyle = '#4a4a4a'; c.beginPath(); c.arc(5, 0, 4.2, 0, PI2); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(5, 0, 1.6, 0, PI2); c.fill();
  } else if (s === 'dupla') {
    c.fillStyle = '#5b3b1f'; c.fillRect(-8, -2.8, 9, 5.6);
    c.fillStyle = '#2c2f33'; c.fillRect(0, -3.4, 10, 6.8);
    c.fillStyle = '#15171a'; c.fillRect(10, -3.2, w.len - 10, 2.8); c.fillRect(10, .4, w.len - 10, 2.8);
  } else if (s === 'minigun') {
    c.fillStyle = '#2a2d2a'; c.fillRect(-9, -4, 12, 8);
    c.fillStyle = '#3a3d3a'; c.fillRect(3, -4.4, 8, 8.8);
    c.fillStyle = '#15171a'; for (let i = -3; i <= 3; i += 2) c.fillRect(11, i - .8, 25, 1.6);
    c.fillStyle = '#6b6b3a'; c.fillRect(2, 4, 10, 5);
  } else if (s === 'flame') {
    c.fillStyle = '#7a2a1a'; c.beginPath(); c.arc(-4, 6, 5, 0, PI2); c.fill();
    c.fillStyle = '#2a2d2a'; c.fillRect(-2, -3, 14, 6);
    c.fillStyle = '#15171a'; c.fillRect(12, -1.6, 14, 3.2); c.fillStyle = '#ff9a3a'; c.beginPath(); c.arc(27, 0, 2, 0, PI2); c.fill();
  } else if (s === 'mgl') {
    c.fillStyle = '#2a2a2a'; c.fillRect(-7, -2.4, 9, 4.8);
    c.fillStyle = '#4a4a40'; c.beginPath(); c.arc(8, 0, 6.5, 0, PI2); c.fill();
    c.fillStyle = '#222'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(8 + Math.cos(i * 1.047) * 3.6, Math.sin(i * 1.047) * 3.6, 1.3, 0, PI2); c.fill(); }
    c.fillStyle = '#15171a'; c.fillRect(14, -1.8, 12, 3.6);
  } else if (s === 'rpg') {
    c.fillStyle = '#2a2a2a'; c.fillRect(-13, -4.6, 5, 9.2);
    c.fillStyle = '#4d5a34'; c.fillRect(-8, -3.5, 36, 7);
    c.fillStyle = '#3a4426'; c.fillRect(6, 2, 4, 4);
    c.fillStyle = '#8a2e1c'; c.beginPath(); c.moveTo(28, -4.6); c.lineTo(39, 0); c.lineTo(28, 4.6); c.closePath(); c.fill();
  } else if (s === 'm79') {
    c.fillStyle = '#5a4326'; c.fillRect(-7, -2.6, 11, 5.2);
    c.fillStyle = '#2a2a2a'; c.fillRect(4, -3, 12, 6);
    c.fillStyle = '#3a3a3a'; c.fillRect(16, -3.6, 10, 7.2);
    c.fillStyle = '#111'; c.fillRect(24.5, -3, 2, 6);
  } else if (s === 'knife') {
    c.fillStyle = '#222'; c.fillRect(-3, -1.6, 7, 3.2);
    c.fillStyle = '#d4d9dd'; c.beginPath(); c.moveTo(4, -2); c.lineTo(17, -.4); c.lineTo(17, .8); c.lineTo(4, 2); c.closePath(); c.fill();
  } else if (s === 'knuckles') {
    c.fillStyle = '#b8b8b8'; for (let i = -3; i <= 3; i += 2) { c.beginPath(); c.arc(2, i, 1.7, 0, PI2); c.fill(); }
  } else if (s === 'bat') {
    c.fillStyle = '#b88a4c'; c.beginPath(); c.moveTo(-3, -1.5); c.lineTo(w.len - 6, -2.6); c.lineTo(w.len, -2.6); c.lineTo(w.len, 2.6); c.lineTo(w.len - 6, 2.6); c.lineTo(-3, 1.5); c.closePath(); c.fill();
  } else if (s === 'machete') {
    c.fillStyle = '#222'; c.fillRect(-3, -1.8, 8, 3.6);
    c.fillStyle = '#c9ced2'; c.beginPath(); c.moveTo(5, -2.4); c.lineTo(26, -2.4); c.quadraticCurveTo(30, 0, 24, 3); c.lineTo(5, 2.4); c.closePath(); c.fill();
  } else if (s === 'crowbar') {
    c.fillStyle = '#5a1a1a'; c.fillRect(-3, -1.5, w.len + 2, 3);
    c.fillStyle = '#5a1a1a'; c.beginPath(); c.moveTo(w.len - 1, -1.5); c.lineTo(w.len + 5, -5); c.lineTo(w.len + 3, -1.5); c.closePath(); c.fill();
  } else if (s === 'axe') {
    c.fillStyle = '#6a4524'; c.fillRect(-3, -1.5, 23, 3);
    c.fillStyle = '#b8bec2'; c.beginPath(); c.moveTo(16, -2); c.lineTo(24, -7); c.lineTo(26, 0); c.lineTo(24, 7); c.lineTo(16, 2); c.closePath(); c.fill();
  } else if (s === 'katana') {
    c.fillStyle = '#1a1a1a'; c.fillRect(-4, -1.6, 10, 3.2);
    c.fillStyle = '#d8b04a'; c.beginPath(); c.arc(7, 0, 3.2, 0, PI2); c.fill();
    c.fillStyle = '#e6ecf0'; c.beginPath(); c.moveTo(8, -1.3); c.lineTo(36, -1.3); c.lineTo(38, 0); c.lineTo(36, 1.3); c.lineTo(8, 1.3); c.closePath(); c.fill();
  } else if (s === 'sledge') {
    c.fillStyle = '#6a4524'; c.fillRect(-3, -1.8, 30, 3.6);
    c.fillStyle = '#555a5f'; c.fillRect(25, -6, 10, 12); c.fillStyle = '#7a8086'; c.fillRect(25, -6, 10, 3);
  } else {
    c.fillStyle = s.sc; c.fillRect(-s.st, -s.bh / 2 + .4, s.st, s.bh - .8);
    c.fillStyle = s.bc; c.fillRect(0, -s.bh / 2, s.b, s.bh);
    if (s.pump) { c.fillStyle = '#6a4524'; c.fillRect(s.b + 2, -s.bh / 2 - .6, 9, s.bh + 1.2); }
    if (s.wood) { c.fillStyle = '#6a4524'; c.fillRect(s.b - 4, -s.bh / 2 - .2, s.br * .6, s.bh + .4); }
    c.fillStyle = '#15171a'; c.fillRect(s.b, -s.brh / 2, s.br, s.brh);
    if (s.sup) { c.fillStyle = '#1b1e22'; c.fillRect(s.b + s.br * .35, -s.brh / 2 - 1, s.br * .95, s.brh + 2); }
    if (s.mag) { c.fillStyle = '#6b6b3a'; c.fillRect(s.b * .35, s.bh / 2, 9, 5); }
    if (s.scope) {
      c.fillStyle = '#0d0d0d'; c.fillRect(s.b * .25, -2, s.b * .8, 4);
      c.fillStyle = '#7fd4ff'; c.fillRect(s.b * .25 - .5, -1.8, 1.6, 3.6); c.fillRect(s.b * 1.05 - 1, -1.8, 1.6, 3.6);
    }
  }
}

function drawBackpack(c, id) {
  if (id === 'bp_l') { c.fillStyle = '#2f3a30'; c.fillRect(-17, -10, 12, 20); c.fillStyle = '#242d25'; c.fillRect(-17, -10, 3, 20); c.fillStyle = '#3d4a3e'; c.fillRect(-16, -12, 5, 3); c.fillRect(-16, 9, 5, 3); }
  else if (id === 'bp_m') { c.fillStyle = '#5a5238'; c.fillRect(-14, -8.5, 10, 17); c.fillStyle = '#463f2a'; c.fillRect(-14, -8.5, 2.6, 17); }
  else { c.fillStyle = '#4a4f3a'; c.fillRect(-12, -6.5, 8, 13); c.fillStyle = '#383c2c'; c.fillRect(-12, -6.5, 2.2, 13); }
}
function drawVestSkin(c, id, body) {
  if (id === 'v_light') { c.fillStyle = '#55633f'; c.fillRect(-4.6, -7.8, 9.2, 15.6); c.strokeStyle = '#3a452a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1, -7.8); c.lineTo(-1, 7.8); c.stroke(); }
  else if (id === 'v_med') { c.fillStyle = '#8c7b55'; c.fillRect(-5, -8.4, 10, 16.8); c.fillStyle = '#6f6244'; c.fillRect(1.6, -6.6, 3, 3.8); c.fillRect(1.6, 2.8, 3, 3.8); c.fillStyle = '#a69568'; c.fillRect(-5, -8.4, 10, 1.6); }
  else if (id === 'v_heavy') { c.fillStyle = '#2b3035'; c.fillRect(-5.4, -9.4, 10.8, 18.8); c.fillStyle = '#3d444b'; c.fillRect(-3, -6.6, 6.4, 13.2); c.fillStyle = '#4a525a'; c.fillRect(-3, -6.6, 6.4, 2); c.fillStyle = '#1b1f23'; c.fillRect(2.4, -9.4, 2, 18.8); }
  else if (id === 'v_plate') { c.fillStyle = '#8f959b'; c.fillRect(-5.8, -10, 11.6, 20); c.fillStyle = '#c9ced2'; c.fillRect(-3.4, -7, 7, 14); c.fillStyle = '#e4e8eb'; c.fillRect(-3.4, -7, 7, 2); c.fillStyle = '#6c7278'; c.beginPath(); c.arc(0, -11, 3.4, 0, PI2); c.arc(0, 11, 3.4, 0, PI2); c.fill(); }
  else { c.fillStyle = body; c.fillRect(-4.6, -7.8, 9.2, 15.6); }
}
function drawHeadSkin(c, o) {
  const h = o.helmId;
  if (!h) { c.fillStyle = '#d9b48f'; c.beginPath(); c.arc(0, 0, 6.2, 0, PI2); c.fill(); c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(-.8, 0, 6.2, Math.PI * .5, Math.PI * 1.5); c.fill(); }
  else if (h === 'h_light') { c.fillStyle = '#4f5e3c'; c.beginPath(); c.arc(0, 0, 6.9, 0, PI2); c.fill(); c.fillStyle = '#39452b'; c.fillRect(4, -5.4, 3.6, 10.8); }
  else if (h === 'h_mich') { c.fillStyle = '#4a5440'; c.beginPath(); c.arc(0, 0, 7.4, 0, PI2); c.fill(); c.strokeStyle = '#2c3326'; c.lineWidth = 1.3; c.stroke(); c.strokeStyle = '#1a1d16'; c.lineWidth = 1; c.beginPath(); c.moveTo(-2, -6.6); c.lineTo(-2, 6.6); c.stroke(); c.fillStyle = '#222'; c.fillRect(4.4, -1.6, 2.6, 3.2); }
  else if (h === 'h_heavy') { c.fillStyle = '#2a2f33'; c.beginPath(); c.arc(0, 0, 7.9, 0, PI2); c.fill(); c.fillStyle = '#14181b'; c.fillRect(2.6, -6.2, 4.4, 12.4); c.fillStyle = '#4a5258'; c.fillRect(-1.5, -8.8, 3.4, 2.6); c.fillRect(-1.5, 6.2, 3.4, 2.6); c.strokeStyle = '#4a5258'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 7.9, 0, PI2); c.stroke(); }
  if (h) { c.fillStyle = o.stripe; c.globalAlpha = .75; c.fillRect(-1.2, -6.4, 2.4, 12.8); c.globalAlpha = 1; }
  if (o.eyesId === 'nvg') { c.fillStyle = '#15181a'; c.fillRect(2.6, -5.2, 3.6, 10.4); c.fillStyle = '#7dff9a'; c.beginPath(); c.arc(5.6, -2.6, 1.5, 0, PI2); c.arc(5.6, 2.6, 1.5, 0, PI2); c.fill(); }
  else if (o.eyesId === 'thermal') { c.fillStyle = '#2a2d31'; c.fillRect(2.4, -5.6, 5, 11.2); c.fillStyle = '#ff9a3a'; c.beginPath(); c.arc(7, 0, 2.3, 0, PI2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.arc(-1.5, -1.5, 3.2, 0, PI2); c.fill();
}

function drawSoldier(c, x, y, ang, o) {
  const s = o.scale || 1;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(2, 3, 13 * s, 11 * s, 0, 0, PI2); c.fill();
  c.rotate(ang); c.scale(s, s);
  const dead = o.dead;
  const body = o.tint ? '#ffffff' : dead ? '#3a2a26' : o.body;
  const vest = o.tint ? '#eeeeee' : dead ? '#2a1d1a' : o.vest;
  const helmet = o.tint ? '#ffffff' : dead ? '#2a1d1a' : o.helmet;
  if (o.skin && o.backId && !dead) drawBackpack(c, o.backId);
  const st = o.crawl ? 0 : Math.sin(o.walk) * 5;
  const bootCol = o.legsId === 'b_run' ? '#e8e8ea' : o.legsId === 'b_tac' ? '#3a2a1a' : '#1e1e1e', bootR = o.legsId ? 4.8 : 4.2;
  c.fillStyle = bootCol;
  c.beginPath(); c.ellipse(st, -5, bootR, 3, 0, 0, PI2); c.fill();
  c.beginPath(); c.ellipse(-st, 5, bootR, 3, 0, 0, PI2); c.fill();
  if (o.legsId === 'b_run') { c.fillStyle = '#d33'; c.fillRect(st - 1, -6.6, 2, 3); c.fillRect(-st - 1, 3.6, 2, 3); }
  c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, 6.8, 12.2, 0, 0, PI2); c.fill();
  if (o.skin && !dead && !o.tint) drawVestSkin(c, o.vestId, vest); else { c.fillStyle = vest; c.fillRect(-4.6, -7.8, 9.2, 15.6); }
  if (o.wound) { c.fillStyle = 'rgba(150,10,10,.8)'; for (let i = 0; i < o.wound; i++) { c.beginPath(); c.arc(-2 + i * 2.2, -4 + i * 3.4, 2.2, 0, PI2); c.fill(); } }
  if (!dead) {
    const rec = (o.recoil || 0) * 3;
    c.strokeStyle = body; c.lineWidth = 4.4; c.lineCap = 'round';
    const wd = o.weapon ? WMAP[o.weapon] : null;
    if (wd && wd.melee) {
      const sw = o.swing || 0, arc = wd.arc || 1.4;
      const rot = sw > 0 ? lerp(arc / 2, -arc / 2, sw) : -.35;
      c.beginPath(); c.moveTo(0, 9); c.lineTo(5, 3); c.moveTo(0, -9); c.lineTo(8, 2); c.stroke();
      c.save(); c.translate(9, 2.5); c.rotate(rot); drawGun(c, o.weapon); c.restore();
      c.fillStyle = '#d9b48f'; c.beginPath(); c.arc(9, 2.5, 2.4, 0, PI2); c.fill();
    } else if (wd) {
      const heavy = wd.len > 36 || wd.shape === 'rpg';
      c.beginPath(); c.moveTo(0, -9); c.lineTo(11 - rec, -3.2); c.moveTo(0, 9); c.lineTo((heavy ? 19 : 15) - rec, 2.4); c.stroke();
      c.save(); c.translate(7 - rec, 0); drawGun(c, o.weapon, o.att); c.restore();
      c.fillStyle = '#d9b48f';
      c.beginPath(); c.arc(11 - rec, -3.2, 2.3, 0, PI2); c.fill();
      c.beginPath(); c.arc((heavy ? 19 : 15) - rec, 2.4, 2.3, 0, PI2); c.fill();
      if (o.flash > 0) {
        const k = o.fm == null ? 1 : o.fm, tip = 7 - rec + wd.len + 2, R = 16 * k;
        const g = c.createRadialGradient(tip, 0, 0, tip, 0, R);
        g.addColorStop(0, 'rgba(255,245,200,.95)'); g.addColorStop(.4, 'rgba(255,190,70,.7)'); g.addColorStop(1, 'rgba(255,120,20,0)');
        c.fillStyle = g; c.beginPath(); c.arc(tip, 0, R, 0, PI2); c.fill();
        c.fillStyle = '#fff6c4'; c.beginPath(); c.moveTo(tip - 3, -2.5 * k); c.lineTo(tip + 11 * k, 0); c.lineTo(tip - 3, 2.5 * k); c.closePath(); c.fill();
      }
    } else {
      c.beginPath(); c.moveTo(0, -9); c.lineTo(5, -2); c.moveTo(0, 9); c.lineTo(5, 2); c.stroke();
    }
  }
  if (o.skin && !dead && !o.tint) drawHeadSkin(c, o);
  else {
    c.fillStyle = helmet; c.beginPath(); c.arc(0, 0, 6.9, 0, PI2); c.fill();
    if (!dead) {
      c.fillStyle = o.tint ? '#ddd' : o.stripe; c.fillRect(-1.2, -6.8, 2.4, 13.6);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(-1.5, -1.5, 3.2, 0, PI2); c.fill();
    }
  }
  c.restore();
}

// silhueta do corpo com as cores de dano (verde → amarelo → laranja → vermelho → preto)
function drawBodyDiagram(c, parts, x, y, h, hl) {
  const w = h * .62, cx = x + w / 2;
  const col = k => STATE_COL[stateOf(parts[k].hp / parts[k].max)];
  const piece = (k, fn) => {
    const st = stateOf(parts[k].hp / parts[k].max);
    c.fillStyle = STATE_COL[st]; c.strokeStyle = hl === k ? '#fff' : 'rgba(0,0,0,.85)'; c.lineWidth = hl === k ? 2 : 1.2;
    c.beginPath(); fn(); c.fill(); c.stroke();
    if (st === 4) { c.strokeStyle = '#ff3b30'; c.lineWidth = 1; c.save(); c.clip(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + h); c.moveTo(x + w, y); c.lineTo(x, y + h); c.stroke(); c.restore(); }
  };
  const rr = (rx, ry, rw, rh, r) => { c.moveTo(rx + r, ry); c.arcTo(rx + rw, ry, rx + rw, ry + rh, r); c.arcTo(rx + rw, ry + rh, rx, ry + rh, r); c.arcTo(rx, ry + rh, rx, ry, r); c.arcTo(rx, ry, rx + rw, ry, r); c.closePath(); };
  c.save();
  piece('legL', () => rr(cx - h * .2, y + h * .56, h * .17, h * .42, 3));
  piece('legR', () => rr(cx + h * .03, y + h * .56, h * .17, h * .42, 3));
  piece('armL', () => rr(cx - h * .36, y + h * .22, h * .12, h * .34, 3));
  piece('armR', () => rr(cx + h * .24, y + h * .22, h * .12, h * .34, 3));
  piece('torso', () => rr(cx - h * .2, y + h * .21, h * .4, h * .36, 4));
  piece('head', () => { c.arc(cx, y + h * .1, h * .09, 0, PI2); });
  c.restore();
  void col;
}

function drawPickup(c, it) {
  const bob = Math.sin(it.t * 3) * 2;
  c.save(); c.translate(it.x, it.y + bob);
  const col = it.type === 'med' || it.type === 'heal' ? '120,255,120' : it.type === 'ammo' ? '255,210,90' : it.type === 'gear' ? '190,140,255' : it.type === 'repair' ? '120,200,255' : it.type === 'grenade' ? '170,230,120' : '255,230,90';
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 26);
  g.addColorStop(0, 'rgba(' + col + ',.45)'); g.addColorStop(1, 'rgba(' + col + ',0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 26, 0, PI2); c.fill();
  if (it.type === 'heal') {
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(0, 0, 10, 0, PI2); c.fill(); c.font = '15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(HMAP[it.kind].icon, 0, 1);
  } else if (it.type === 'med') {
    c.fillStyle = '#f2f2f2'; c.fillRect(-9, -9, 18, 18); c.fillStyle = '#d33'; c.fillRect(-2.5, -7, 5, 14); c.fillRect(-7, -2.5, 14, 5);
  } else if (it.type === 'ammo') {
    c.fillStyle = '#4d5a34'; c.fillRect(-12, -8, 24, 16); c.fillStyle = '#2f3820'; c.fillRect(-12, -8, 24, 3);
    const n = it.items.length, wd = 20 / n;
    it.items.forEach((x, i) => { c.fillStyle = CALIBERS[x.cal].color; c.fillRect(-10 + i * wd + 1, -3, wd - 2, 9); });
    c.fillStyle = '#fff'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(n + ' calibres', 0, 10);
  } else if (it.type === 'grenade') {
    c.fillStyle = '#3f5a2a'; c.beginPath(); c.arc(0, 1, 7, 0, PI2); c.fill(); c.fillStyle = '#222'; c.fillRect(-2.5, -9, 5, 4); c.strokeStyle = '#bbb'; c.lineWidth = 1.5; c.beginPath(); c.arc(4, -8, 3, 0, PI2); c.stroke();
  } else if (it.type === 'repair') {
    c.fillStyle = '#2d5a86'; c.beginPath(); c.moveTo(-8, -8); c.lineTo(8, -8); c.lineTo(8, 2); c.lineTo(0, 9); c.lineTo(-8, 2); c.closePath(); c.fill();
    c.strokeStyle = '#bfe4ff'; c.lineWidth = 1.5; c.stroke();
  } else if (it.type === 'gear') {
    c.fillStyle = '#5a3a8a'; c.fillRect(-11, -8, 22, 16); c.strokeStyle = '#ffd36a'; c.lineWidth = 2; c.strokeRect(-11, -8, 22, 16);
    c.fillStyle = '#ffd36a'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 1);
  } else {
    c.fillStyle = '#6a4a1a'; c.fillRect(-10, -7, 20, 14); c.fillStyle = '#ffd24a'; c.fillRect(-8, -5, 16, 10);
    c.fillStyle = '#6a4a1a'; c.fillRect(-5, -2, 10, 1.5); c.fillRect(-5, 1, 7, 1.5);
  }
  c.restore();
}

/* =====================================================================
   QUADRO
   ===================================================================== */
const shown = e => layerShown(e.L, e.x, e.y);
const woundLevel = e => { const s = pState(e, 'torso'); return s >= 3 ? 3 : s >= 2 ? 2 : s >= 1 ? 1 : 0; };

function render() {
  const c2 = ctx;
  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  c2.fillStyle = '#0b0f0c'; c2.fillRect(0, 0, vw, vh);
  if (!player) return;

  const p = player, t = G.time;
  VIS = visRadius();
  const shx = (Math.random() - .5) * G.shake, shy = (Math.random() - .5) * G.shake;
  const cx = cam.x + shx + G.kx, cy = cam.y + shy + G.ky;
  c2.setTransform(S * dpr, 0, 0, S * dpr, -cx * S * dpr, -cy * S * dpr);
  c2.drawImage(mapC, 0, 0, mapC.width, mapC.height, 0, 0, WORLD_W, WORLD_H);
  if (p.L >= 0) {      // no 2º andar: mostra o piso de cima do prédio atual
    const b = blds[p.L];
    c2.save(); c2.beginPath(); c2.rect(b.x * T, b.y * T, b.w * T, b.h * T); c2.clip();
    c2.drawImage(map1C, 0, 0, map1C.width, map1C.height, 0, 0, WORLD_W, WORLD_H); c2.restore();
  }

  // zona de extração
  if (MP.on && MP.sites.length) mpDrawSites(c2);
  if (G.mode !== 'survival' && G.mode !== 'mp') {
    const ex = extT.x * T + T / 2, ey = extT.y * T + T / 2, open = G.extractOpen;
    c2.save(); c2.translate(ex, ey);
    c2.fillStyle = open ? 'rgba(90,220,90,' + (.18 + .08 * Math.sin(t * 4)) + ')' : 'rgba(200,80,60,.12)';
    c2.beginPath(); c2.arc(0, 0, 52, 0, PI2); c2.fill();
    c2.strokeStyle = open ? '#7ddc5a' : 'rgba(220,100,80,.6)'; c2.lineWidth = 3; c2.setLineDash([10, 8]);
    c2.rotate(t * (open ? .6 : .1)); c2.beginPath(); c2.arc(0, 0, 50, 0, PI2); c2.stroke(); c2.setLineDash([]);
    c2.rotate(-t * (open ? .6 : .1));
    c2.fillStyle = open ? '#d6ffc9' : 'rgba(240,160,140,.7)'; c2.font = 'bold 34px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(open ? 'H' : '✕', 0, 1);
    c2.restore();
  }

  // decalques (sangue, poças, queimaduras), buracos de bala e cadáveres
  for (const d of decals) {
    if (d.k === 'corpse' || !layerShown(d.L, d.x, d.y)) continue;
    if (d.k === 'blood') { c2.fillStyle = 'rgba(110,12,12,' + d.a + ')'; c2.beginPath(); c2.ellipse(d.x, d.y, d.r, d.r * .75, 0, 0, PI2); c2.fill(); }
    else if (d.k === 'pool') { const g = c2.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); g.addColorStop(0, 'rgba(90,6,6,' + d.a + ')'); g.addColorStop(.75, 'rgba(110,10,10,' + d.a * .8 + ')'); g.addColorStop(1, 'rgba(110,10,10,0)'); c2.fillStyle = g; c2.beginPath(); c2.arc(d.x, d.y, d.r, 0, PI2); c2.fill(); }
    else if (d.k === 'scorch') { const g = c2.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); g.addColorStop(0, 'rgba(10,10,10,' + d.a + ')'); g.addColorStop(1, 'rgba(10,10,10,0)'); c2.fillStyle = g; c2.beginPath(); c2.arc(d.x, d.y, d.r, 0, PI2); c2.fill(); }
    else if (d.k === 'debris') { c2.fillStyle = '#7a5a2c'; for (let i = 0; i < 5; i++) c2.fillRect(d.x + hash(i, d.x | 0) * 28 - 14, d.y + hash(d.y | 0, i) * 28 - 14, 5, 3); }
  }
  for (const h of holes) {
    if (!layerShown(h.L, h.x, h.y)) continue;
    c2.fillStyle = h.k === 'glass' ? 'rgba(220,240,250,.7)' : h.k === 'door' ? '#2a170a' : 'rgba(15,15,15,.85)';
    c2.beginPath(); c2.arc(h.x, h.y, h.k === 'glass' ? 1.2 : 1.7, 0, PI2); c2.fill();
  }
  for (const d of decals) if (d.k === 'corpse' && layerShown(d.L, d.x, d.y)) {
    const ty = ETYPES[d.who];
    drawSoldier(c2, d.x, d.y, d.ang, { dead: true, scale: ty ? ty.scale : 1, walk: 0 });
  }

  // alvos de sabotagem e cargas plantadas
  for (const it of interacts) {
    if (it.type !== 'charge' || !layerShown(it.L, it.x, it.y)) continue;
    c2.save(); c2.translate(it.x, it.y);
    c2.fillStyle = it.done ? 'rgba(0,0,0,.3)' : 'rgba(255,120,40,.18)'; c2.beginPath(); c2.arc(0, 0, 30, 0, PI2); c2.fill();
    c2.fillStyle = '#4a4f55'; c2.fillRect(-16, -12, 32, 24); c2.fillStyle = '#2d3136'; c2.fillRect(-12, -8, 24, 16);
    c2.strokeStyle = '#7fd4ff'; c2.lineWidth = 2; c2.beginPath(); c2.arc(0, 0, 7, 0, PI2); c2.stroke();
    c2.beginPath(); c2.moveTo(0, -7); c2.lineTo(0, 7); c2.moveTo(-7, 0); c2.lineTo(7, 0); c2.stroke();
    if (!it.done) { c2.strokeStyle = 'rgba(255,140,50,' + (.5 + .4 * Math.sin(t * 4)) + ')'; c2.lineWidth = 2; c2.beginPath(); c2.arc(0, 0, 28, 0, PI2); c2.stroke(); }
    c2.restore();
  }
  for (const ch of charges) {
    if (!layerShown(ch.L, ch.x, ch.y)) continue;
    c2.save(); c2.translate(ch.x, ch.y);
    c2.fillStyle = '#7a2a1a'; c2.fillRect(-8, -5, 16, 10);
    const on = Math.sin(ch.fuse * 10) > 0;
    c2.fillStyle = on ? '#ff3a2a' : '#661a12'; c2.beginPath(); c2.arc(0, 0, 3.5, 0, PI2); c2.fill();
    c2.fillStyle = '#fff'; c2.font = 'bold 14px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.strokeStyle = '#000'; c2.lineWidth = 3;
    c2.strokeText(Math.ceil(ch.fuse), 0, -20); c2.fillText(Math.ceil(ch.fuse), 0, -20);
    c2.restore();
  }

  drawParticles(0);

  for (const it of pickups) { if (layerShown(it.L, it.x, it.y) && canView(p.L, it.L, it.x, it.y) && Math.hypot(it.x - p.x, it.y - p.y) < VIS && hasLOS(p.x, p.y, it.x, it.y, p.L)) drawPickup(c2, it); }

  // aliados e reféns
  for (const a of allies) {
    if (a.dead || !shown(a)) continue;
    if (a.kind === 'hostage') {
      drawSoldier(c2, a.x, a.y, a.ang, { body: '#d6781e', vest: '#b8631a', helmet: '#8a5a2a', stripe: '#8a5a2a', weapon: null, walk: a.walk, scale: 1, tint: a.hitT > 0 });
      if (a.bound) {
        c2.strokeStyle = '#d9b48f'; c2.lineWidth = 2; c2.beginPath(); c2.arc(a.x, a.y, 14, 0, PI2); c2.stroke();
        c2.fillStyle = '#6fd8ff'; c2.font = 'bold 18px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.strokeStyle = '#000'; c2.lineWidth = 3;
        c2.strokeText('!', a.x, a.y - 26 + Math.sin(t * 5) * 2); c2.fillText('!', a.x, a.y - 26 + Math.sin(t * 5) * 2);
      }
    } else {
      drawSoldier(c2, a.x, a.y, a.ang, { body: '#3b7a56', vest: '#24503a', helmet: '#2c5e44', stripe: a.def.color, weapon: a.wpn, flash: a.flash, recoil: a.flash > 0 ? 1 : 0, walk: a.walk, scale: 1, tint: a.hitT > 0 });
      c2.font = 'bold 9px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.strokeStyle = '#000'; c2.lineWidth = 3; c2.fillStyle = a.def.color;
      c2.strokeText(a.def.role, a.x, a.y - 26); c2.fillText(a.def.role, a.x, a.y - 26);
    }
    if (a.hp < a.maxHp) {
      c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillRect(a.x - 13, a.y - 19, 26, 4);
      c2.fillStyle = '#6fe07a'; c2.fillRect(a.x - 13, a.y - 19, 26 * a.hp / a.maxHp, 4);
    }
  }

  // inimigos
  const trad = thermalRadius();
  const pts = visPoints();
  for (const e of enemies) {
    const sh = shown(e), d = Math.hypot(e.x - p.x, e.y - p.y);
    e.visible = sh && canView(p.L, e.L, e.x, e.y) && seesEnemy(p, e, d, pts);
    if (e.visible) e.seenT = .22; else if (e.seenT > 0) { e.seenT -= G.dt || .016; if (sh && canView(p.L, e.L, e.x, e.y) && d < VIS) e.visible = true; }
    e.heat = sh && trad > 0 && d < trad;
    if (e.visible) {
      const ty = e.ty;
      const lk = e.mpId != null ? mpBotLook(e) : ty;
      drawSoldier(c2, e.x, e.y, e.ang, { body: lk.color, vest: lk.vest, helmet: lk.helmet, stripe: lk.stripe, weapon: ty.weapon, flash: e.flash, recoil: e.flash > 0 ? 1 : 0, walk: e.walk, scale: ty.scale, tint: e.hitT > 0, wound: woundLevel(e), crawl: e.fx.crawl, swing: e.swing > 0 ? 1 - e.swing / .25 : 0 });
      if (ty.laser && e.state === 'attack' && e.sees && e.tgt && !e.tgt.dead && e.L === e.tgt.L) {     // mira a laser do sniper
        const ta = Math.atan2(e.tgt.y - e.y, e.tgt.x - e.x), dl = Math.min(Math.hypot(e.tgt.x - e.x, e.tgt.y - e.y), castRay(e.x, e.y, ta, 1200, e.L));
        c2.strokeStyle = 'rgba(255,40,40,' + (.25 + .35 * Math.min(1, 1.6 / Math.max(.3, e.pause + .3))) + ')'; c2.lineWidth = 1.3;
        c2.beginPath(); c2.moveTo(e.x, e.y); c2.lineTo(e.x + Math.cos(ta) * dl, e.y + Math.sin(ta) * dl); c2.stroke();
      }
      const bw = 26 * ty.scale, ratio = e.hp / e.maxHp;
      if (ratio < .999 || e.vip) {
        c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 4);
        c2.fillStyle = ratio > .4 ? '#e5533d' : '#ff2a1a'; c2.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * ratio, 4);
      }
      if (e.mpId != null) { c2.font = 'bold 10px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.strokeStyle = '#000'; c2.lineWidth = 3; c2.fillStyle = mpColor(e.mpId); c2.strokeText(e.name, e.x, e.y - e.r - 20); c2.fillText(e.name, e.x, e.y - e.r - 20); }
      if (e.vip) { c2.font = 'bold 10px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.strokeStyle = '#000'; c2.lineWidth = 3; c2.fillStyle = '#ffd24a'; c2.strokeText('★ VIP', e.x, e.y - e.r - 20); c2.fillText('★ VIP', e.x, e.y - e.r - 20); }
      if (e.mark > 0) {
        c2.font = 'bold 20px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillStyle = e.markType === '!' ? '#ff4a3a' : '#ffd24a'; c2.strokeStyle = '#000'; c2.lineWidth = 3;
        c2.strokeText(e.markType, e.x, e.y - e.r - 24); c2.fillText(e.markType, e.x, e.y - e.r - 24);
      }
      if (e.showT > 0) {     // painel de dano estilo War Thunder
        c2.save(); c2.globalAlpha = Math.min(1, e.showT);
        c2.fillStyle = 'rgba(0,0,0,.55)'; c2.fillRect(e.x + 18, e.y - 46, 30, 52);
        drawBodyDiagram(c2, e.parts, e.x + 22, e.y - 43, 46, e.lastPart);
        c2.restore();
      }
    } else if (e.flash > 0) {
      const g = c2.createRadialGradient(e.x, e.y, 0, e.x, e.y, 40);
      g.addColorStop(0, 'rgba(255,220,120,.8)'); g.addColorStop(1, 'rgba(255,150,40,0)');
      if (sh) { c2.fillStyle = g; c2.beginPath(); c2.arc(e.x, e.y, 40, 0, PI2); c2.fill(); }
    }
  }

  if (MP.on) mpDraw(c2, p, pts);

  for (const g of grenades) {
    if (!layerShown(g.L, g.x, g.y)) continue;
    c2.fillStyle = '#3f5a2a'; c2.beginPath(); c2.arc(g.x, g.y, 5, 0, PI2); c2.fill();
    c2.fillStyle = Math.sin(g.t * 16) > 0 ? '#ff4a3a' : '#222'; c2.beginPath(); c2.arc(g.x, g.y - 1, 1.8, 0, PI2); c2.fill();
  }

  // jogador
  if (!p.dead) {
    const w = curW();
    if (w && !w.melee) {
      const muzzleX = p.x + Math.cos(p.ang) * 20, muzzleY = p.y + Math.sin(p.ang) * 20;
      const fa = p.ang + p.rcOff;     // direção real do tiro (com recuo)
      if (w.cat === 'Sniper' || w.laser) {
        const d = castRay(muzzleX, muzzleY, fa, w.laser && w.cat !== 'Sniper' ? 700 : 1500, p.L);
        c2.strokeStyle = 'rgba(255,40,40,.55)'; c2.lineWidth = 1.2;
        c2.beginPath(); c2.moveTo(muzzleX, muzzleY); c2.lineTo(muzzleX + Math.cos(fa) * d, muzzleY + Math.sin(fa) * d); c2.stroke();
        c2.fillStyle = 'rgba(255,60,60,.9)'; c2.beginPath(); c2.arc(muzzleX + Math.cos(fa) * d, muzzleY + Math.sin(fa) * d, 2.5, 0, PI2); c2.fill();
      } else if (!w.flame) {
        const d = Math.min(140, castRay(muzzleX, muzzleY, fa, 140, p.L));
        c2.strokeStyle = p.rcMag > .02 ? 'rgba(255,170,80,.5)' : 'rgba(255,255,255,.22)'; c2.lineWidth = 1; c2.setLineDash([4, 6]);
        c2.beginPath(); c2.moveTo(muzzleX, muzzleY); c2.lineTo(muzzleX + Math.cos(fa) * d, muzzleY + Math.sin(fa) * d); c2.stroke(); c2.setLineDash([]);
      }
    }
    if (p.flash > 0) {
      const g = c2.createRadialGradient(p.x, p.y, 0, p.x, p.y, 90);
      g.addColorStop(0, 'rgba(255,210,120,.35)'); g.addColorStop(1, 'rgba(255,180,60,0)');
      c2.fillStyle = g; c2.beginPath(); c2.arc(p.x, p.y, 90, 0, PI2); c2.fill();
    }
    if (w && w.light) {      // cone da lanterna no chão
      const mxl = p.x + Math.cos(p.ang) * 22, myl = p.y + Math.sin(p.ang) * 22;
      c2.beginPath(); c2.moveTo(mxl, myl);
      for (let i = 0; i <= 14; i++) { const a = p.ang + (i / 14 - .5) * .8, d = Math.min(360, castRay(mxl, myl, a, 360, p.L)); c2.lineTo(mxl + Math.cos(a) * d, myl + Math.sin(a) * d); }
      c2.closePath(); const lg = c2.createRadialGradient(mxl, myl, 0, mxl, myl, 360); lg.addColorStop(0, 'rgba(255,246,200,.26)'); lg.addColorStop(1, 'rgba(255,246,200,0)');
      c2.globalCompositeOperation = 'lighter'; c2.fillStyle = lg; c2.fill(); c2.globalCompositeOperation = 'source-over';
    }
    const hasArmor = (p.armor.body && p.armor.body.dur > 0) || (p.armor.head && p.armor.head.dur > 0);
    const m = p.melee;
    if (MP.on && G.protT > 0) { c2.strokeStyle = 'rgba(143,220,255,.7)'; c2.lineWidth = 2; c2.setLineDash([4, 4]); c2.beginPath(); c2.arc(p.x, p.y, 17, 0, PI2); c2.stroke(); c2.setLineDash([]); }
    drawSoldier(c2, p.x, p.y, p.ang, { ...(MP.on ? mpLook(MP.myId) : PLAYER_LOOK), skin: true, vestId: LD.gear.body, helmId: LD.gear.head, backId: LD.gear.back, eyesId: LD.gear.eyes, legsId: LD.gear.legs, att: !p.melee && w ? LD.attach[w.id] : null, weapon: m ? m.w.id : (w ? w.id : null), flash: p.flash, fm: w && w.flashMul, recoil: p.recoil, walk: p.moving ? p.walk : 0, scale: 1, tint: G.hurtFlash > .7, wound: woundLevel(p), crawl: p.fx.crawl, swing: m ? clamp(m.t / m.dur, 0, 1) : 0 });
    if (m) {   // rastro do golpe
      const arc = m.w.arc, pr = clamp(m.t / m.dur, 0, 1), a0 = p.ang + arc / 2, a1 = p.ang + lerp(arc / 2, -arc / 2, pr);
      c2.strokeStyle = 'rgba(255,255,255,.5)'; c2.lineWidth = 5; c2.lineCap = 'round';
      c2.beginPath(); c2.arc(p.x, p.y, m.w.range * .8, Math.min(a0, a1), Math.max(a0, a1)); c2.stroke();
    }
    if (hasArmor) { c2.strokeStyle = 'rgba(143,220,255,.35)'; c2.lineWidth = 1.5; c2.beginPath(); c2.arc(p.x, p.y, 15, 0, PI2); c2.stroke(); }
    if (p.equipT > 0 && w) {
      const tot = w.eq || .6;
      c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillRect(p.x - 15, p.y - 26, 30, 5);
      c2.fillStyle = '#8fdcff'; c2.fillRect(p.x - 15, p.y - 26, 30 * clamp(1 - p.equipT / tot, 0, 1), 5);
    }
    if (p.healing) {
      const h = p.healing, hd = HMAP[h.id];
      c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillRect(p.x - 17, p.y - 34, 34, 6);
      c2.fillStyle = '#6fe07a'; c2.fillRect(p.x - 17, p.y - 34, 34 * clamp(h.t / h.total, 0, 1), 6);
      c2.font = '11px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'bottom'; c2.fillStyle = '#fff'; c2.fillText(hd.icon + ' ' + Math.max(0, h.total - h.t).toFixed(1) + 's', p.x, p.y - 36);
    }
    if (p.reloading && w) {
      const pr = 1 - p.reloadT / p.reloadTotal;
      c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillRect(p.x - 15, p.y - 26, 30, 5);
      c2.fillStyle = '#ffb020'; c2.fillRect(p.x - 15, p.y - 26, 30 * clamp(pr, 0, 1), 5);
    }
  }

  if (G.near && !p.dead) {
    const it = G.near;
    c2.strokeStyle = 'rgba(0,0,0,.55)'; c2.lineWidth = 6; c2.beginPath(); c2.arc(it.x, it.y, 22, 0, PI2); c2.stroke();
    c2.strokeStyle = '#7ddc5a'; c2.lineWidth = 4; c2.beginPath(); c2.arc(it.x, it.y, 22, -Math.PI / 2, -Math.PI / 2 + PI2 * clamp(it.prog / it.need, 0, 1)); c2.stroke();
  }

  // projéteis
  for (const b of bullets) {
    if (b.flame || !layerShown(b.L, b.x, b.y)) continue;
    if (b.rocket) {
      c2.save(); c2.translate(b.x, b.y); c2.rotate(Math.atan2(b.dy, b.dx));
      c2.fillStyle = '#4d5a34'; c2.fillRect(-9, -2.8, 14, 5.6);
      c2.fillStyle = '#8a2e1c'; c2.beginPath(); c2.moveTo(5, -3.5); c2.lineTo(11, 0); c2.lineTo(5, 3.5); c2.fill();
      c2.restore();
      continue;
    }
    const heavy = b.dmg > 70, mine = b.from === 'p' || b.friend;
    const len = mine ? (heavy ? 70 : b.dmg < 14 ? 16 : 30) : 22;
    const tx = b.x - b.dx * Math.min(len, b.dist + 6), ty = b.y - b.dy * Math.min(len, b.dist + 6);
    const g = c2.createLinearGradient(tx, ty, b.x, b.y);
    if (mine) { g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(1, heavy ? 'rgba(180,230,255,1)' : 'rgba(255,240,170,1)'); }
    else { g.addColorStop(0, 'rgba(255,90,60,0)'); g.addColorStop(1, 'rgba(255,120,80,1)'); }
    c2.strokeStyle = g; c2.lineWidth = heavy ? 2.6 : b.sup ? 1.2 : 2; c2.lineCap = 'round'; c2.globalAlpha = b.sup ? .55 : 1;
    c2.beginPath(); c2.moveTo(tx, ty); c2.lineTo(b.x, b.y); c2.stroke(); c2.globalAlpha = 1;
  }

  drawParticles(1);

  for (const f of flashes) {
    if (!layerShown(f.L, f.x, f.y)) continue;
    const a = f.life / f.max, r = f.r * (1.2 - a * .5);
    const g = c2.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, 'rgba(255,245,200,' + a + ')'); g.addColorStop(.5, 'rgba(255,160,50,' + a * .6 + ')'); g.addColorStop(1, 'rgba(255,100,20,0)');
    c2.globalCompositeOperation = 'lighter'; c2.fillStyle = g; c2.beginPath(); c2.arc(f.x, f.y, r, 0, PI2); c2.fill(); c2.globalCompositeOperation = 'source-over';
  }

  for (const m of mines) {
    if (!layerShown(m.L, m.x, m.y)) continue;
    c2.save(); c2.translate(m.x, m.y); c2.rotate(m.ang);
    c2.fillStyle = '#4a5238'; c2.fillRect(-3, -9, 6, 18); c2.fillStyle = '#2a2f20'; c2.fillRect(-3, -9, 2, 18);
    c2.fillStyle = m.arm > 0 ? '#ffb020' : (Math.sin(t * 6) > 0 ? '#ff3030' : '#661515'); c2.beginPath(); c2.arc(1, 0, 1.6, 0, PI2); c2.fill();
    c2.restore();
  }
  for (const f of flares) {
    if (!layerShown(f.L, f.x, f.y)) continue;
    const g = c2.createRadialGradient(f.x, f.y, 0, f.x, f.y, 70 + Math.sin(t * 20) * 6);
    g.addColorStop(0, 'rgba(255,120,100,.8)'); g.addColorStop(1, 'rgba(255,60,40,0)');
    c2.globalCompositeOperation = 'lighter'; c2.fillStyle = g; c2.beginPath(); c2.arc(f.x, f.y, 76, 0, PI2); c2.fill(); c2.globalCompositeOperation = 'source-over';
    c2.fillStyle = '#fff'; c2.beginPath(); c2.arc(f.x, f.y, 2.4, 0, PI2); c2.fill();
  }
  for (const f of fires) {
    if (!layerShown(f.L, f.x, f.y)) continue;
    const g = c2.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, 'rgba(255,170,50,.55)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    c2.globalCompositeOperation = 'lighter'; c2.fillStyle = g; c2.beginPath(); c2.arc(f.x, f.y, f.r, 0, PI2); c2.fill(); c2.globalCompositeOperation = 'source-over';
  }
  for (const s of smokes) {
    if (!layerShown(s.L, s.x, s.y)) continue;
    const a = Math.min(1, s.t / 3), g = c2.createRadialGradient(s.x, s.y, s.r * .2, s.x, s.y, s.r * 1.1);
    g.addColorStop(0, 'rgba(196,199,204,' + .93 * a + ')'); g.addColorStop(.7, 'rgba(180,183,188,' + .8 * a + ')'); g.addColorStop(1, 'rgba(170,173,178,0)');
    c2.fillStyle = g; c2.beginPath(); c2.arc(s.x, s.y, s.r * 1.1, 0, PI2); c2.fill();
  }

  // telhados, neblina de visão e efeitos de visão
  drawRoofs(cx, cy, pts);
  drawFog(cx, cy, pts);
  visionFx(cx, cy);

  c2.setTransform(S * dpr, 0, 0, S * dpr, -cx * S * dpr, -cy * S * dpr);
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  for (const tx of texts) {
    if (!layerShown(p.L, tx.x, tx.y) && false) continue;
    c2.globalAlpha = clamp(tx.life / tx.max * 1.5, 0, 1);
    c2.font = 'bold ' + tx.size + 'px sans-serif'; c2.strokeStyle = '#000'; c2.lineWidth = 3; c2.fillStyle = tx.color;
    c2.strokeText(tx.txt, tx.x, tx.y); c2.fillText(tx.txt, tx.x, tx.y);
  }
  c2.globalAlpha = 1;

  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawObjectiveArrow(cx, cy);
  if (!touchMode && G.state === 'play' && !p.dead) drawCrosshair();
}

function drawParticles(layer) {
  const c = ctx;
  for (const p of particles) {
    if (p.layer !== layer) continue;
    if (p.L !== -2 && !layerShown(p.L, p.x, p.y)) continue;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'fire' || p.kind === 'spark') {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size * (p.kind === 'spark' ? 1 : a + .3), 0, PI2); c.fill();
      c.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'smoke') {
      c.globalAlpha = a * .45; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size, 0, PI2); c.fill();
    } else if (p.kind === 'mag') {
      c.globalAlpha = Math.min(1, a * 4); c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = '#2b2e33'; c.fillRect(-p.size / 2, -2.2, p.size, 4.4); c.fillStyle = p.color; c.fillRect(-p.size / 2, -2.2, 2, 4.4); c.restore();
    } else if (p.kind === 'casing') {
      c.globalAlpha = Math.min(1, a * 3); c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-2, -1, 4, 2); c.restore();
    } else {
      c.globalAlpha = a; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size, 0, PI2); c.fill();
    }
  }
  c.globalAlpha = 1;
}

/* ---------- Visão: polígono visível, telhados, neblina ---------- */
// o inimigo é visto se qualquer parte do corpo estiver no campo de visão (não só o centro)
function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function seesEnemy(p, e, d, pts) {
  if (d >= VIS - 20) return false;
  if (hasLOS(p.x, p.y, e.x, e.y, p.L)) return true;
  const r = (e.r || 12) * .85, a = Math.atan2(e.y - p.y, e.x - p.x), nx = -Math.sin(a) * r, ny = Math.cos(a) * r;
  if (hasLOS(p.x, p.y, e.x + nx, e.y + ny, p.L) || hasLOS(p.x, p.y, e.x - nx, e.y - ny, p.L)) return true;
  // na borda de uma quina/janela: dentro do polígono de visão e a menos de ~30px do primeiro obstáculo
  return inPoly(pts, e.x, e.y) && d - castRay(p.x, p.y, a, d, p.L) < 30 && !smokeBlocks(p, e);
}
function smokeBlocks(p, e) {
  for (const s of smokes) {
    if (s.L !== p.L) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dd = dx * dx + dy * dy || 1;
    const t = clamp(((s.x - p.x) * dx + (s.y - p.y) * dy) / dd, 0, 1);
    if (Math.hypot(p.x + dx * t - s.x, p.y + dy * t - s.y) < s.r * .8) return true;
  }
  return false;
}
function visPoints() {
  const p = player, R = visRadius(), w = curW(), light = w && w.light, N = 240, pts = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * PI2;
    let rad = R;
    if (light && Math.abs(angDiff(a, p.ang)) < .5) rad = Math.max(rad, 560);
    const d = Math.min(rad, castRay(p.x, p.y, a, rad, p.L) + 10);
    pts.push(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  }
  return pts;
}
function drawRoofs(cx, cy, pts) {
  const p = player, inside = bldIdxAt(p.x, p.y);
  if (roofC.width !== vw || roofC.height !== vh) { roofC.width = vw; roofC.height = vh; }
  const r = roofX;
  r.setTransform(1, 0, 0, 1, 0, 0); r.clearRect(0, 0, vw, vh);
  r.setTransform(S, 0, 0, S, -cx * S, -cy * S);
  let any = false;
  blds.forEach((b, i) => {
    const target = inside === i ? 0 : 1;
    b.roofA += (target - b.roofA) * Math.min(1, G.dt * 9 + .02);
    if (b.roofA < .02) return;
    r.globalAlpha = b.roofA; r.drawImage(b.roofImg, b.x * T - b.roofO, b.y * T - b.roofO); any = true;
  });
  r.globalAlpha = 1;
  if (!any) return;
  // o que você enxerga (por janelas e portas abertas) atravessa o telhado
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.globalCompositeOperation = 'destination-out';
  const w = curW(), Rmax = Math.max(visRadius(), w && w.light ? 560 : 0), px = (p.x - cx) * S, py = (p.y - cy) * S;
  const g = r.createRadialGradient(px, py, Rmax * S * .1, px, py, Rmax * S);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.7, 'rgba(0,0,0,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  r.fillStyle = g; r.beginPath();
  for (let i = 0; i < pts.length; i += 2) { const x = (pts[i] - cx) * S, y = (pts[i + 1] - cy) * S; if (i === 0) r.moveTo(x, y); else r.lineTo(x, y); }
  r.closePath(); r.fill();
  r.globalCompositeOperation = 'source-over';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(roofC, 0, 0, vw, vh);
}
function drawFog(cx, cy, pts) {
  const k = .5, w = Math.ceil(vw * k), h = Math.ceil(vh * k);
  if (fogC.width !== w || fogC.height !== h) { fogC.width = w; fogC.height = h; }
  const f = fogX, p = player, wp = curW();
  const vm = G.visOn && p.visMode;
  // sombra suave: intensidade ajustável e olhos que se acostumam ao escuro
  const shm = clamp(SAVE.settings.shadow / 45, 0, 2.2);
  const nightBase = .8 * (1 - .3 * (G.adapt || 0));
  const A = clamp((vm === 'nv' ? .3 : vm === 'th' ? .42 : G.night ? nightBase : .4) * shm, 0, .96);
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, w, h);
  f.fillStyle = 'rgba(4,8,10,' + A + ')'; f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'destination-out';
  const px = (p.x - cx) * S * k, py = (p.y - cy) * S * k, Rr = Math.max(visRadius(), wp && wp.light ? 560 : 0) * S * k;
  const g = f.createRadialGradient(px, py, Rr * .12, px, py, Rr);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.4, 'rgba(0,0,0,.97)'); g.addColorStop(.62, 'rgba(0,0,0,.8)'); g.addColorStop(.8, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  f.fillStyle = g; f.beginPath();
  for (let i = 0; i < pts.length; i += 2) { const x = (pts[i] - cx) * S * k, y = (pts[i + 1] - cy) * S * k; if (i === 0) f.moveTo(x, y); else f.lineTo(x, y); }
  f.closePath(); f.fill();
  // clarões iluminam o escuro (disparos, explosões, fogo)
  const lamp = (x, y, r, a) => {
    const lx = (x - cx) * S * k, ly = (y - cy) * S * k, lr = r * S * k;
    const lg = f.createRadialGradient(lx, ly, 0, lx, ly, lr);
    lg.addColorStop(0, 'rgba(0,0,0,' + a + ')'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = lg; f.beginPath(); f.arc(lx, ly, lr, 0, PI2); f.fill();
  };
  if (p.flash > 0) lamp(p.x, p.y, 110, .9);
  for (const e of enemies) { if (!layerShown(e.L, e.x, e.y)) continue; if (e.flash > 0) lamp(e.x, e.y, 90, .8); if (e.burn > 0) lamp(e.x, e.y, 70, .7); }
  if (MP.on) for (const r of MP.remotes.values()) if (r.fl > 0 && !r.dead && layerShown(r.L, r.x, r.y)) lamp(r.x, r.y, 90, .8);
  for (const a of allies) if (a.flash > 0 && layerShown(a.L, a.x, a.y)) lamp(a.x, a.y, 80, .7);
  for (const fl of flashes) if (layerShown(fl.L, fl.x, fl.y)) lamp(fl.x, fl.y, fl.r * 1.6, 1);
  for (const b of bullets) if (b.flame && layerShown(b.L, b.x, b.y)) lamp(b.x, b.y, 70, .6);
  for (const fl of flares) if (layerShown(fl.L, fl.x, fl.y)) lamp(fl.x, fl.y, 280, 1);
  for (const fr of fires) if (layerShown(fr.L, fr.x, fr.y)) lamp(fr.x, fr.y, fr.r * 2.4, .9);
  f.globalCompositeOperation = 'source-over';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogC, 0, 0, vw, vh);
}

// visão noturna (verde com granulado) e térmica (cinza com corpos brilhantes)
function visionFx(cx, cy) {
  const p = player, c = ctx, vm = G.visOn && p.visMode;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.pulse > 0) { const g = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * .3, vw / 2, vh / 2, Math.max(vw, vh) * .72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,0,0,' + G.pulse * .3 + ')'); c.fillStyle = g; c.fillRect(0, 0, vw, vh); }
  if (G.flashT > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(1, G.flashT * .75) + ')'; c.fillRect(0, 0, vw, vh); }
  if (vm === 'nv') {
    c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(120,255,150)'; c.fillRect(0, 0, vw, vh);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(10,46,14,.38)'; c.fillRect(0, 0, vw, vh);
    c.globalCompositeOperation = 'overlay'; c.globalAlpha = .22;
    c.save(); c.translate(-Math.random() * 96, -Math.random() * 96); c.fillStyle = c.createPattern(noiseC, 'repeat'); c.fillRect(0, 0, vw + 96, vh + 96); c.restore();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const g = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * .35, vw / 2, vh / 2, Math.max(vw, vh) * .72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,12,0,.8)'); c.fillStyle = g; c.fillRect(0, 0, vw, vh);
  } else if (vm === 'th') {
    c.globalCompositeOperation = 'saturation'; c.fillStyle = '#808080'; c.fillRect(0, 0, vw, vh);
    c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(205,205,215)'; c.fillRect(0, 0, vw, vh);
    c.globalCompositeOperation = 'source-over';
  }
  // corpos quentes (térmica do óculos ou da mira)
  const tr = thermalRadius();
  if (tr > 0) {
    c.globalCompositeOperation = 'lighter';
    const blob = (x, y, r, a) => {
      const sx = (x - cx) * S, sy = (y - cy) * S, rr = r * S;
      const g = c.createRadialGradient(sx, sy, 0, sx, sy, rr);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(.45, 'rgba(255,170,70,' + a * .7 + ')'); g.addColorStop(1, 'rgba(255,90,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(sx, sy, rr, 0, PI2); c.fill();
    };
    for (const e of enemies) if (e.heat) blob(e.x, e.y, 22 * e.ty.scale, .95);
    for (const a of allies) if (!a.dead && layerShown(a.L, a.x, a.y) && Math.hypot(a.x - p.x, a.y - p.y) < tr + 60) blob(a.x, a.y, 20, .8);
    for (const e of enemies) if (e.burn > 0 && layerShown(e.L, e.x, e.y)) blob(e.x, e.y, 34, 1);
    for (const fl of flashes) blob(fl.x, fl.y, fl.r, fl.life / fl.max);
    c.globalCompositeOperation = 'source-over';
  }
  // ferimento grave na cabeça: visão turva
  if (pState(p, 'head') >= 2) {
    const g = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * .25, vw / 2, vh / 2, Math.max(vw, vh) * .7);
    g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, 'rgba(60,0,0,' + (pState(p, 'head') >= 3 ? .75 : .45) + ')'); c.fillStyle = g; c.fillRect(0, 0, vw, vh);
  }
}

function drawObjectiveArrow(cx, cy) {
  const target = objectiveTarget();
  if (!target) return;
  const sx = (target.x - cx) * S, sy = (target.y - cy) * S, m = 36;
  if (sx > m && sx < vw - m && sy > m + 40 && sy < vh - m - 70) return;
  const ccx = vw / 2, ccy = vh / 2, dx = sx - ccx, dy = sy - ccy;
  const k = Math.min((ccx - m) / Math.abs(dx || 1e-6), (ccy - m - 50) / Math.abs(dy || 1e-6));
  const ax = ccx + dx * k, ay = ccy + dy * k, a = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = target.col; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, -10); ctx.lineTo(-4, 0); ctx.lineTo(-9, 10); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

function drawCrosshair() {
  const w = curW(), sp = w && !w.melee ? w.spread * (player.walking ? .6 : 1) : .04;
  const r = 8 + (sp + (player.moving ? .04 : 0) + player.fx.aim) * 120 + player.rcMag * 220 + player.recoil * 4;
  const x = input.mx, y = input.my;
  ctx.strokeStyle = G.hitMark > 0 ? G.hitCol : 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r - 6, y); ctx.lineTo(x - r + 2, y); ctx.moveTo(x + r - 2, y); ctx.lineTo(x + r + 6, y);
  ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - r + 2); ctx.moveTo(x, y + r - 2); ctx.lineTo(x, y + r + 6);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, PI2); ctx.fill();
  if (G.hitMark > 0) {
    ctx.beginPath(); const d = 9;
    ctx.moveTo(x - d, y - d); ctx.lineTo(x - d / 2, y - d / 2); ctx.moveTo(x + d, y - d); ctx.lineTo(x + d / 2, y - d / 2);
    ctx.moveTo(x - d, y + d); ctx.lineTo(x - d / 2, y + d / 2); ctx.moveTo(x + d, y + d); ctx.lineTo(x + d / 2, y + d / 2); ctx.stroke();
  }
}

function drawMinimap() {
  const m = miniX;
  m.clearRect(0, 0, miniC.width, miniC.height);
  m.imageSmoothingEnabled = false;
  m.drawImage(miniStatic, 0, 0);
  if (MP.on) mpMinimap(m);
  if (G.mode !== 'survival' && G.mode !== 'mp') { const ex = extT.x * MINI_S, ey = extT.y * MINI_S; m.fillStyle = G.extractOpen ? '#7ddc5a' : 'rgba(220,100,80,.8)'; m.fillRect(ex - 3, ey - 3, 7, 7); }
  for (const it of pickups) if (it.type === 'intel') { m.fillStyle = '#ffd24a'; m.fillRect(it.x / T * MINI_S - 2, it.y / T * MINI_S - 2, 4, 4); }
  for (const it of interacts) if (!it.done) { m.fillStyle = it.type === 'charge' ? '#ff9a3a' : '#6fd8ff'; m.fillRect(it.x / T * MINI_S - 2, it.y / T * MINI_S - 2, 5, 5); }
  for (const a of allies) if (!a.dead && !a.bound) { m.fillStyle = '#6fe07a'; m.fillRect(a.x / T * MINI_S - 1.5, a.y / T * MINI_S - 1.5, 3.5, 3.5); }
  for (const e of enemies) if (e.visible || e.vip || e.heat) { m.fillStyle = e.vip ? '#ffd24a' : '#ff4a3a'; m.fillRect(e.x / T * MINI_S - 1.5, e.y / T * MINI_S - 1.5, e.vip ? 5 : 3.5, e.vip ? 5 : 3.5); }
  const p = player;
  m.save(); m.translate(p.x / T * MINI_S, p.y / T * MINI_S); m.rotate(p.ang);
  m.fillStyle = '#8fdcff'; m.beginPath(); m.moveTo(5, 0); m.lineTo(-3, -3.5); m.lineTo(-3, 3.5); m.closePath(); m.fill(); m.restore();
  m.strokeStyle = 'rgba(255,255,255,.35)'; m.lineWidth = 1;
  m.strokeRect(cam.x / T * MINI_S, cam.y / T * MINI_S, vw / S / T * MINI_S, vh / S / T * MINI_S);
  if (p.L >= 0) { m.fillStyle = 'rgba(255,211,106,.9)'; m.font = 'bold 9px sans-serif'; m.textAlign = 'left'; m.textBaseline = 'top'; m.fillText('2º ANDAR', 3, 3); }
}

/* =====================================================================
   ENTRADA
   ===================================================================== */
function setTouchMode(v) {
  if (touchMode === v) return;
  touchMode = v; document.body.classList.toggle('touch', v);
}
function releaseSticks() {
  for (const s of [sticks.move, sticks.aim]) { s.id = null; s.x = s.y = 0; s.el.classList.remove('on'); }
}
function setPaused(v) {
  if (v && G.state === 'play') { G.state = 'paused'; if (typeof syncShadowUI === 'function') syncShadowUI(); $('pauseScreen').classList.remove('hidden'); releaseSticks(); input.mouseDown = false; input.act = false; document.body.classList.remove('playing'); }
  else if (!v && G.state === 'paused') { G.state = 'play'; $('pauseScreen').classList.add('hidden'); document.body.classList.add('playing'); lastT = performance.now(); }
}
function cycleWeapon(dir) {
  const p = player;
  for (let k = 1; k <= 3; k++) { const i = (p.wi + dir * k + 6) % 3; if (p.slots[i]) { selectWeapon(i); break; } }
}

window.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'play') setPaused(true);
    else if (G.state === 'paused') setPaused(false);
    else if (G.state === 'inv' && invCtx === 'mission') closeInventory();
    else if (G.state === 'menu' && !$('arsenal').classList.contains('hidden')) closeArsenal();
    e.preventDefault(); return;
  }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Tab' || e.code === 'KeyI') {
    if (G.state === 'play') openInventory(); else if (G.state === 'inv' && invCtx === 'mission') closeInventory();
    e.preventDefault(); return;
  }
  if (G.state !== 'play') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 3) selectWeapon(n - 1); }
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyQ') selectWeapon(player.wi === 0 ? 1 : 0);
    else if (e.code === 'KeyF') quickMelee();
    else if (e.code === 'KeyN') toggleVision();
    else if (e.code === 'KeyB') cycleAmmoType();
    else if (e.code === 'KeyT') cycleThrowable();
    else if (e.code === 'KeyG') throwGrenade();
    else if (e.code === 'KeyH') useMed();
    else if (e.code === 'KeyX') cycleHeal();
    else if (e.code === 'KeyV') useRepair();
    else if (e.code === 'KeyC') toggleHold();
  }
  input.keys.add(e.code);
});
window.addEventListener('keyup', e => input.keys.delete(e.code));
window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; if (G.state === 'play' && !MP.on) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !MP.on) setPaused(true); });
window.addEventListener('wheel', e => {
  if (G.state !== 'play' || touchMode) return;
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
window.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  initAudio();
  if (e.pointerType === 'mouse') {
    setTouchMode(false);
    input.mx = e.clientX; input.my = e.clientY;
    if (e.button === 0) input.mouseDown = true;
    else if (e.button === 2) startReload();
    return;
  }
  setTouchMode(true);
  const s = e.clientX < vw / 2 ? sticks.move : sticks.aim;
  if (s.id !== null) return;
  s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
  s.el.style.left = s.ox + 'px'; s.el.style.top = s.oy + 'px';
  s.el.firstElementChild.style.transform = 'translate(0,0)';
  s.el.classList.add('on');
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignora */ }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { input.mx = e.clientX; input.my = e.clientY; return; }
  for (const s of [sticks.move, sticks.aim]) {
    if (s.id !== e.pointerId) continue;
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
    const max = 55, l = Math.hypot(dx, dy);
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    s.x = dx / max; s.y = dy / max;
    s.el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
});
function pointerEnd(e) {
  if (e.pointerType === 'mouse') { if (e.button === 0) input.mouseDown = false; return; }
  for (const s of [sticks.move, sticks.aim]) if (s.id === e.pointerId) { s.id = null; s.x = s.y = 0; s.el.classList.remove('on'); }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) input.mouseDown = false; });

function toggleMute() { muted = !muted; $('btnMute').textContent = muted ? '🔇' : '🔊'; }

/* =====================================================================
   LOOP PRINCIPAL
   ===================================================================== */
function resize() {
  vw = innerWidth; vh = innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  S = clamp(Math.min(vw, vh) / 640, .62, 1.35);
  if (player) clampCam();
}
window.addEventListener('resize', resize);

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (G.state === 'play' || (MP.on && (G.state === 'paused' || G.state === 'inv'))) update(dt);
  if (G.state === 'play' || G.state === 'paused' || G.state === 'inv' || G.state === 'over') {
    if (player) {
      const sp = mpSpec();
      if (sp) { const real = player, px = Object.create(real); px.x = sp.x; px.y = sp.y; px.L = sp.L; px.ang = sp.a; player = px; try { render(); } finally { player = real; } }
      else render();
      if (G.state === 'play') { updateHUD(); drawMinimap(); }
    }
  } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, vw, vh);
  }
}
function bootGame() {
  if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) setTouchMode(true);
  resize();
  requestAnimationFrame(frame);
}
