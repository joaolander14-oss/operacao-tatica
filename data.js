'use strict';

/* =====================================================================
   DADOS DO JOGO: tiles, calibres, armas, acessórios, equipamentos,
   parceiros, inimigos, modos e save
   ===================================================================== */

/* ---------- Constantes e utilidades ---------- */
const T = 40, MW = 52, MH = 52, NT = MW * MH;
const WORLD_W = MW * T, WORLD_H = MH * T;
const R_MAP = 1.5;
const BASE_VIS = 640;
const PI2 = Math.PI * 2;
// ritmo: jogo mais lento e tenso
const PACE = { player: .7, enemy: .68, ally: .74, react: 1.6, bullet: .85 };

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= PI2; while (d < -Math.PI) d += PI2; return d; };
const turnToward = (cur, target, step) => { const d = angDiff(target, cur); return Math.abs(d) <= step ? target : cur + Math.sign(d) * step; };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const fmtTime = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- Tiles e materiais ---------- */
// mv = bloqueia movimento · op = bloqueia a visão · cost = custo de penetração para balas
const K = { FLOOR: 0, WALL: 1, CRATE: 2, TREE: 3, WINDOW: 4, DOOR: 5, DOOROPEN: 6, STAIRUP: 7, STAIRDN: 8, PART: 9, WINBROKEN: 10, BRICK: 11, WOODW: 12 };
const MAT = [
  { mv: 0, op: 0, cost: 0,   name: 'piso' },
  { mv: 1, op: 1, cost: 4.2, name: 'concreto' },
  { mv: 1, op: 1, cost: 1.6, name: 'madeira' },
  { mv: 1, op: 1, cost: 2.2, name: 'tronco' },
  { mv: 1, op: 0, cost: .3,  name: 'vidro' },
  { mv: 1, op: 1, cost: 1.0, name: 'porta' },
  { mv: 0, op: 0, cost: 0,   name: 'porta aberta' },
  { mv: 0, op: 0, cost: 0,   name: 'escada' },
  { mv: 0, op: 0, cost: 0,   name: 'escada' },
  { mv: 1, op: 1, cost: 1.3, name: 'drywall' },
  { mv: 1, op: 0, cost: 0,   name: 'janela quebrada' },
  { mv: 1, op: 1, cost: 2.6, name: 'tijolo' },
  { mv: 1, op: 1, cost: 1.5, name: 'parede de madeira' },
];
const WALKABLE = [1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];   // para pathfinding (portas contam: abrem sozinhas)

/* ---------- Partes do corpo (estilo War Thunder) ---------- */
const PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
/* ---------- Órgãos e ossos: cada parte do corpo guarda os seus ---------- */
// w = chance de ser atingido dentro da parte; m = multiplicador do dano (integridade 0-100); bone = osso (fratura)
const ORGANS = {
  skull:   { part: 'head',  name: 'Crânio',      bone: true,  w: .26, m: 1.6 },
  brain:   { part: 'head',  name: 'Cérebro',     w: .2,  m: 2.4 },
  eyes:    { part: 'head',  name: 'Olhos',       w: .2,  m: 2.2 },
  face:    { part: 'head',  name: 'Face/Mandíbula', bone: true, w: .34, m: 1.8 },
  ribs:    { part: 'torso', name: 'Costelas',    bone: true,  w: .24, m: 1.5 },
  lungs:   { part: 'torso', name: 'Pulmões',     w: .17, m: 2 },
  heart:   { part: 'torso', name: 'Coração',     w: .08, m: 2.6 },
  liver:   { part: 'torso', name: 'Fígado',      w: .1,  m: 2 },
  kidneys: { part: 'torso', name: 'Rins',        w: .1,  m: 2 },
  stomach: { part: 'torso', name: 'Estômago',    w: .11, m: 1.7 },
  spine:   { part: 'torso', name: 'Coluna',      bone: true,  w: .08, m: 1.3 },
  armLb:   { part: 'armL',  name: 'Úmero/Rádio (esq.)', bone: true, w: .5,  m: 1.8 },
  armLv:   { part: 'armL',  name: 'Artéria do braço (esq.)', w: .2, m: 2 },
  armLm:   { part: 'armL',  name: 'Músculo do braço (esq.)', w: .3, m: 1.5 },
  armRb:   { part: 'armR',  name: 'Úmero/Rádio (dir.)', bone: true, w: .5,  m: 1.8 },
  armRv:   { part: 'armR',  name: 'Artéria do braço (dir.)', w: .2, m: 2 },
  armRm:   { part: 'armR',  name: 'Músculo do braço (dir.)', w: .3, m: 1.5 },
  legLb:   { part: 'legL',  name: 'Fêmur/Tíbia (esq.)', bone: true, w: .5,  m: 1.8 },
  legLv:   { part: 'legL',  name: 'Artéria femoral (esq.)', w: .2, m: 2.1 },
  legLm:   { part: 'legL',  name: 'Músculo da perna (esq.)', w: .3, m: 1.5 },
  legRb:   { part: 'legR',  name: 'Fêmur/Tíbia (dir.)', bone: true, w: .5,  m: 1.8 },
  legRv:   { part: 'legR',  name: 'Artéria femoral (dir.)', w: .2, m: 2.1 },
  legRm:   { part: 'legR',  name: 'Músculo da perna (dir.)', w: .3, m: 1.5 },
};
const ORG_BY_PART = {};
for (const k in ORGANS) (ORG_BY_PART[ORGANS[k].part] = ORG_BY_PART[ORGANS[k].part] || []).push(k);
// estado do órgão pela integridade (0-100)
const orgState = hp => hp <= 0 ? 3 : hp < 35 ? 2 : hp < 70 ? 1 : 0;
const ORG_STATE_NAME = ['Saudável', 'Lesionado', 'Grave', 'Destruído'];
const ORG_STATE_NAME_BONE = ['Íntegro', 'Trincado', 'Fraturado', 'Estilhaçado'];
const ORG_COL = ['#3ddc5a', '#e8e03a', '#ff7a1f', '#ff2a20'];

const PART_HP = { head: .5, torso: 1, armL: .55, armR: .55, legL: .65, legR: .65 };   // × vida máxima
const PART_MUL = { head: 2.4, torso: 1, armL: .65, armR: .65, legL: .75, legR: .75 };  // multiplicador de dano
const PART_NAME = { head: 'Cabeça', torso: 'Tronco', armL: 'Braço esq.', armR: 'Braço dir.', legL: 'Perna esq.', legR: 'Perna dir.' };
const STATE_COL = ['#3ddc5a', '#e8e03a', '#ff9a1f', '#ff3b30', '#16181a'];   // verde, amarelo, laranja, vermelho, preto (destruído)
const STATE_NAME = ['Intacto', 'Leve', 'Grave', 'Crítico', 'Destruído'];
const stateOf = r => r <= 0 ? 4 : r < .3 ? 3 : r < .55 ? 2 : r < .8 ? 1 : 0;

/* ---------- Calibres ---------- */
// dmg = dano base por projétil · pen = poder de penetração · cap = máximo carregado · pack = quanto uma caixa dá
const CALIBERS = {
  '.22':     { name: '.22 LR',        dmg: 9,   pen: .5,  cap: 150, pack: 40, color: '#d8d8b0' },
  '.380':    { name: '.380 ACP',      dmg: 14,  pen: .8,  cap: 120, pack: 24, color: '#e8d090' },
  '9mm':     { name: '9×19 mm',       dmg: 17,  pen: 1.1, cap: 180, pack: 30, color: '#e6c35c' },
  '.45':     { name: '.45 ACP',       dmg: 24,  pen: 1.2, cap: 120, pack: 24, color: '#e0a23c' },
  '10mm':    { name: '10 mm Auto',    dmg: 24,  pen: 1.5, cap: 90,  pack: 20, color: '#f0b060' },
  '.357':    { name: '.357 Magnum',   dmg: 40,  pen: 1.8, cap: 60,  pack: 12, color: '#f0d27a' },
  '.44':     { name: '.44 Magnum',    dmg: 44,  pen: 2.0, cap: 60,  pack: 10, color: '#ffd08a' },
  '.50AE':   { name: '.50 AE',        dmg: 56,  pen: 2.2, cap: 42,  pack: 7,  color: '#ffb48a' },
  '5.7':     { name: '5.7×28 mm',     dmg: 16,  pen: 1.8, cap: 200, pack: 40, color: '#9be0e0' },
  '4.6':     { name: '4.6×30 mm',     dmg: 15,  pen: 1.7, cap: 200, pack: 40, color: '#8ad0d0' },
  '5.56':    { name: '5.56 NATO',     dmg: 20,  pen: 2.2, cap: 240, pack: 40, color: '#8fd16a' },
  '5.45':    { name: '5.45×39 mm',    dmg: 21,  pen: 2.3, cap: 240, pack: 40, color: '#b6e07a' },
  '.300':    { name: '.300 Blackout', dmg: 26,  pen: 2.2, cap: 180, pack: 30, color: '#d0e08a' },
  '7.62x39': { name: '7.62×39 mm',    dmg: 28,  pen: 2.6, cap: 180, pack: 30, color: '#e07a4a' },
  '9x39':    { name: '9×39 mm',       dmg: 30,  pen: 2.4, cap: 100, pack: 20, color: '#a8c0ff' },
  '.308':    { name: '.308 Win',      dmg: 38,  pen: 3.2, cap: 600, pack: 40, color: '#e0905a' },
  '6.5':     { name: '6.5 Creedmoor', dmg: 40,  pen: 3.2, cap: 80,  pack: 15, color: '#c0e0ff' },
  '7.92':    { name: '7.92×57 mm',    dmg: 50,  pen: 3.4, cap: 200, pack: 30, color: '#d09060' },
  '7.62x54': { name: '7.62×54R',      dmg: 52,  pen: 3.6, cap: 200, pack: 30, color: '#d9684a' },
  '7.62x25': { name: '7.62×25 Tokarev', dmg: 18, pen: 1.7, cap: 210, pack: 35, color: '#e8b87a' },
  '.30carb': { name: '.30 Carbine',   dmg: 22,  pen: 1.7, cap: 210, pack: 30, color: '#d8c890' },
  '5.8':     { name: '5.8×42 mm',     dmg: 22,  pen: 2.5, cap: 240, pack: 40, color: '#a0e0a0' },
  '6mm':     { name: '6mm ARC',       dmg: 30,  pen: 2.7, cap: 160, pack: 25, color: '#c0e8a0' },
  '6.5g':    { name: '6.5 Grendel',   dmg: 33,  pen: 2.9, cap: 160, pack: 25, color: '#b0d8f0' },
  '7.92k':   { name: '7.92×33 Kurz',  dmg: 31,  pen: 2.5, cap: 180, pack: 30, color: '#d8a070' },
  '6.8':     { name: '6.8×51 Fury',   dmg: 40,  pen: 3.6, cap: 120, pack: 20, color: '#ffd070' },
  '.243':    { name: '.243 Win',      dmg: 36,  pen: 2.9, cap: 100, pack: 15, color: '#b0c8e0' },
  '.45-70':  { name: '.45-70 Govt',   dmg: 70,  pen: 2.7, cap: 40,  pack: 6,  color: '#ffb890' },
  '.300WM':  { name: '.300 Win Mag',  dmg: 88,  pen: 4.0, cap: 40,  pack: 6,  color: '#90c8ff' },
  '.32':     { name: '.32 ACP',       dmg: 12,  pen: .7,  cap: 150, pack: 30, color: '#e8e0a8' },
  '9x18':    { name: '9×18 mm',       dmg: 15,  pen: 1.0, cap: 180, pack: 30, color: '#e0c890' },
  '.30-30':  { name: '.30-30 Win',    dmg: 50,  pen: 2.4, cap: 80,  pack: 12, color: '#d8a878' },
  '.50BW':   { name: '.50 Beowulf',   dmg: 62,  pen: 2.7, cap: 40,  pack: 8,  color: '#ffa878' },
  '.375':    { name: '.375 H&H',      dmg: 100, pen: 3.8, cap: 36,  pack: 5,  color: '#a8c8ff' },
  '.416':    { name: '.416 Barrett',  dmg: 165, pen: 4.8, cap: 28,  pack: 4,  color: '#b8a8ff' },
  '14.5':    { name: '14.5×114 mm',   dmg: 230, pen: 6.0, cap: 20,  pack: 4,  color: '#d890ff' },
  '.38sp':   { name: '.38 Special',   dmg: 26,  pen: 1.4, cap: 90,  pack: 18, color: '#f0d8a0' },
  '.357sig': { name: '.357 SIG',      dmg: 28,  pen: 1.7, cap: 90,  pack: 15, color: '#e8c890' },
  '6.5x55':  { name: '6.5×55 Swedish', dmg: 44, pen: 3.3, cap: 80,  pack: 15, color: '#b8d8f0' },
  // escopetas: pel = projéteis por tiro · sf = fator de dispersão · inc = incendeia · stun = atordoa · frag = raio da explosão
  '12ga':        { name: '12 GA Chumbo',    tag: 'CHUMBO',  dmg: 11, pen: .6,  cap: 48, pack: 8, color: '#d95a5a', pel: 8,  sf: 1,   fam: 'g12' },
  '12ga-slug':   { name: '12 GA Slug',      tag: 'SLUG',    dmg: 88, pen: 2.8, cap: 30, pack: 5, color: '#ff9a7a', pel: 1,  sf: .12, fam: 'g12' },
  '12ga-flech':  { name: '12 GA Flechette', tag: 'FLECHETTE', dmg: 8, pen: 2.0, cap: 36, pack: 6, color: '#c8d0ff', pel: 10, sf: .45, fam: 'g12' },
  '12ga-dragon': { name: '12 GA Dragon',    tag: 'DRAGON',  dmg: 7,  pen: .5,  cap: 30, pack: 5, color: '#ffb040', pel: 6,  sf: .9,  fam: 'g12', inc: true },
  '12ga-rubber': { name: '12 GA Borracha',  tag: 'BORRACHA', dmg: 5, pen: .2,  cap: 36, pack: 6, color: '#8fd0ff', pel: 6,  sf: 1,   fam: 'g12', stun: 1.4 },
  '12ga-frag':   { name: '12 GA Explosiva', tag: 'EXPLOSIVA', dmg: 55, pen: 1, cap: 18, pack: 3, color: '#ff6a3a', pel: 1,  sf: .2,  fam: 'g12', frag: 55 },
  '10ga':        { name: '10 GA Magnum',    tag: 'MAGNUM',  dmg: 14, pen: .9,  cap: 30, pack: 5, color: '#e05a5a', pel: 12, sf: 1.1, fam: 'g10' },
  '16ga':        { name: '16 GA',           tag: 'CHUMBO',  dmg: 9,  pen: .55, cap: 40, pack: 7, color: '#e08a8a', pel: 9,  sf: 1,   fam: 'g16' },
  '20ga':        { name: '20 GA Chumbo',    tag: 'CHUMBO',  dmg: 8,  pen: .5,  cap: 50, pack: 10, color: '#e87a7a', pel: 6, sf: 1.05, fam: 'g20' },
  '20ga-slug':   { name: '20 GA Slug',      tag: 'SLUG',    dmg: 70, pen: 2.3, cap: 30, pack: 5, color: '#ffa8a8', pel: 1,  sf: .15, fam: 'g20' },
  '.410':        { name: '.410 Chumbo',     tag: 'CHUMBO',  dmg: 7,  pen: .4,  cap: 50, pack: 10, color: '#f0a8a8', pel: 5, sf: 1,   fam: 'g410' },
  '.410-slug':   { name: '.410 Slug',       tag: 'SLUG',    dmg: 42, pen: 1.4, cap: 40, pack: 8, color: '#ffc0a0', pel: 1,  sf: .2,  fam: 'g410' },
  '23mm':        { name: '23 mm Barricada', tag: 'BARRICADA', dmg: 100, pen: 3.2, cap: 18, pack: 3, color: '#ff8aff', pel: 1, sf: .2, fam: 'g23' },
  '.30-06':  { name: '.30-06',        dmg: 60,  pen: 3.6, cap: 40,  pack: 5,  color: '#a0d0ff' },
  '.338':    { name: '.338 Lapua',    dmg: 120, pen: 4.2, cap: 30,  pack: 5,  color: '#7fc4ff' },
  '.408':    { name: '.408 CheyTac',  dmg: 150, pen: 4.6, cap: 24,  pack: 4,  color: '#b0a0ff' },
  '.50BMG':  { name: '.50 BMG',       dmg: 200, pen: 5.5, cap: 20,  pack: 4,  color: '#c58aff' },
  'rocket':  { name: 'Foguete',       dmg: 140, pen: 9,   cap: 8,   pack: 2,  color: '#ff8a5a' },
  '40mm':    { name: '40 mm',         dmg: 95,  pen: 9,   cap: 24,  pack: 6,  color: '#9fe0c0' },
  'fuel':    { name: 'Combustível',   dmg: 5,   pen: 0,   cap: 300, pack: 80, color: '#ff9a3a' },
};

/* ---------- Armas ---------- */
// recuo [passo por tiro (rad), máximo (rad), frequência do padrão, recuperação (rad/s)]
const RC = {
  pistol: [.03, .09, 1.7, .5], mag: [.05, .11, 1.8, .4], smg: [.009, .07, 1.4, .55], ar: [.011, .11, 1.2, .4], low: [.008, .08, 1.2, .45], ak: [.017, .15, 1.0, .35],
  lmg: [.008, .11, .9, .3], dmr: [.03, .06, 1.5, .5], snp: [.05, .05, 1, .6], sg: [.04, .08, 1.3, .5], lvr: [.03, .07, 1.4, .45], gun: [.012, .16, 1.3, .35], none: [0, 0, 1, 1],
};
const SH = (st, b, bh, br, brh, bc, o) => Object.assign({ st, b, bh, br, brh, bc, sc: '#4a3a2a' }, o || {});
const W = o => Object.assign({ slot: 'primary', pellets: 1, push: 0, ap: 0, speedMod: 1, reloadType: 'mag', rc: 'ar', price: 0, speed: 1000, range: 640, noise: 450, kick: 1.5, spread: .05, bd: .06, dm: 1, att: true }, o);
const WEAPONS = [
  /* ===== SECUNDÁRIAS ===== */
  W({ id: 'm9', slot: 'secondary', grp: 'Pistolas', name: 'M9', cal: '9mm', dm: 1.35, inf: true, delay: .28, mag: 15, reload: 1.0, spread: .03, speed: 950, range: 640, len: 14, noise: 380, kick: 1.2, snd: 'pistol', rc: 'pistol', shape: 'pistol', desc: 'Confiável, munição infinita.' }),
  W({ id: 'glock17', slot: 'secondary', grp: 'Pistolas', name: 'Glock 17', cal: '9mm', dm: 1.25, delay: .22, mag: 17, reload: 1.0, spread: .035, speed: 950, range: 620, len: 14, noise: 380, kick: 1, snd: 'pistol', rc: 'pistol', price: 200, shape: 'pistol', desc: 'Pistola leve e rápida.' }),
  W({ id: 'makarov', slot: 'secondary', grp: 'Pistolas', name: 'Makarov', cal: '.380', dm: 1.35, delay: .3, mag: 8, reload: .9, spread: .035, speed: 850, range: 520, len: 13, noise: 340, kick: 1, snd: 'pistol', rc: 'pistol', price: 150, shape: 'pistol', desc: 'Simples e barata.' }),
  W({ id: 'm1911', slot: 'secondary', grp: 'Pistolas', name: 'M1911', cal: '.45', dm: 1.5, delay: .34, mag: 8, reload: 1.1, spread: .028, speed: 900, range: 640, len: 14, noise: 420, kick: 1.8, snd: 'pistol', rc: 'pistol', price: 250, shape: 'pistol', desc: 'Dano alto por tiro.' }),
  W({ id: 'g20', slot: 'secondary', grp: 'Pistolas', name: 'Glock 20', cal: '10mm', dm: 1.3, delay: .3, mag: 15, reload: 1.2, spread: .03, speed: 950, range: 680, len: 15, noise: 450, kick: 2.2, snd: 'pistol', rc: 'pistol', price: 450, shape: 'pistol', desc: '10 mm: mais pegada que a 9 mm.' }),
  W({ id: 'b93r', slot: 'secondary', grp: 'Pistolas', name: 'Beretta 93R', cal: '9mm', dm: 1, burst: 3, bd: .045, delay: .42, mag: 20, reload: 1.2, spread: .03, speed: 950, range: 620, len: 15, noise: 400, kick: 1.2, snd: 'pistol', rc: 'pistol', price: 550, shape: 'pistol', desc: 'Rajadas de 3 tiros.' }),
  W({ id: 'fiveseven', slot: 'secondary', grp: 'Pistolas', name: 'Five-seveN', cal: '5.7', dm: 1.25, delay: .18, mag: 20, reload: 1.3, spread: .03, speed: 1300, range: 700, len: 14, noise: 380, kick: .9, snd: 'pistol', rc: 'pistol', price: 650, shape: 'pistol', desc: '5.7 mm: atravessa colete leve.' }),
  W({ id: 'usps', slot: 'secondary', grp: 'Pistolas', name: 'USP Silenciada', cal: '.45', dm: 1.15, delay: .3, mag: 12, reload: 1.2, spread: .02, speed: 900, range: 600, len: 18, noise: 200, kick: .7, sup: true, snd: 'pistol', rc: 'pistol', price: 800, shape: 'pistol', desc: 'Quase inaudível.' }),
  W({ id: 'ruger', slot: 'secondary', grp: 'Pistolas', name: 'Ruger .22 Silenciada', cal: '.22', dm: 1.3, delay: .2, mag: 10, reload: 1.0, spread: .015, speed: 700, range: 480, len: 20, noise: 130, kick: .3, sup: true, snd: 'pistol', rc: 'pistol', price: 350, shape: 'pistol', desc: 'Fraca, mas silenciosa e precisa.' }),
  W({ id: 'g18', slot: 'secondary', grp: 'Pistolas automáticas', name: 'Glock 18', cal: '9mm', dm: .72, delay: .055, mag: 33, reload: 1.5, spread: .07, speed: 950, range: 520, len: 14, noise: 400, kick: .8, snd: 'smg', rc: 'gun', price: 400, shape: 'pistol', desc: 'Pistola de fogo contínuo.' }),
  W({ id: 'mac10', slot: 'secondary', grp: 'Pistolas automáticas', name: 'MAC-10', cal: '.45', dm: .75, delay: .06, mag: 30, reload: 1.6, spread: .09, speed: 900, range: 440, len: 15, noise: 480, kick: 1, snd: 'smg', rc: 'gun', price: 500, shape: 'pistol', desc: 'Cospe .45 em alta cadência.' }),
  W({ id: 'skorpion', slot: 'secondary', grp: 'Pistolas automáticas', name: 'Skorpion', cal: '.380', dm: .85, delay: .06, mag: 20, reload: 1.4, spread: .08, speed: 850, range: 440, len: 14, noise: 380, kick: .7, snd: 'smg', rc: 'gun', price: 450, shape: 'pistol', desc: 'Compacta, 20 tiros rápidos.' }),
  W({ id: 'python', slot: 'secondary', grp: 'Revólveres', name: 'Colt Python', cal: '.357', dm: 1.55, delay: .5, mag: 6, reload: 2.8, spread: .02, speed: 1100, range: 800, len: 17, noise: 520, kick: 3, push: 1.5, snd: 'pistol', rc: 'mag', price: 600, shape: 'revolver', desc: 'Revólver: derruba os cartuchos ao recarregar.' }),
  W({ id: 'model29', slot: 'secondary', grp: 'Revólveres', name: 'Magnum .44', cal: '.44', dm: 1.9, delay: .65, mag: 6, reload: 3.0, spread: .02, speed: 1100, range: 820, len: 19, noise: 600, kick: 4.5, push: 2.5, snd: 'pistol', rc: 'mag', price: 900, shape: 'revolver', desc: 'Revólver .44, dano brutal.' }),
  W({ id: 'deagle', slot: 'secondary', grp: 'Revólveres', name: 'Desert Eagle', cal: '.50AE', dm: 1.4, delay: .6, mag: 7, reload: 1.8, spread: .03, speed: 1100, range: 760, len: 18, noise: 560, kick: 4, push: 2.5, snd: 'pistol', rc: 'mag', price: 700, shape: 'pistol', desc: 'Canhão de mão. Recuo brutal.' }),

  W({ id: 'ppk', slot: 'secondary', grp: 'Pistolas', name: 'Walther PPK', cal: '.380', dm: 1.3, delay: .26, mag: 7, reload: .9, spread: .03, speed: 850, range: 480, len: 12, noise: 330, kick: .9, snd: 'pistol', rc: 'pistol', price: 220, shape: 'pistol', desc: 'Compacta e discreta.' }),
  W({ id: 'cz75', slot: 'secondary', grp: 'Pistolas', name: 'CZ 75', cal: '9mm', dm: 1.3, delay: .24, mag: 16, reload: 1.1, spread: .03, speed: 950, range: 640, len: 14, noise: 390, kick: 1.1, snd: 'pistol', rc: 'pistol', price: 320, shape: 'pistol', desc: 'Precisa e equilibrada.' }),
  W({ id: 'luger', slot: 'secondary', grp: 'Pistolas', name: 'Luger P08', cal: '9mm', dm: 1.4, delay: .32, mag: 8, reload: 1.2, spread: .025, speed: 950, range: 620, len: 15, noise: 400, kick: 1.3, snd: 'pistol', rc: 'pistol', price: 380, shape: 'pistol', desc: 'Clássica e precisa.' }),
  W({ id: 'fnx45', slot: 'secondary', grp: 'Pistolas', name: 'FNX-45', cal: '.45', dm: 1.4, delay: .28, mag: 15, reload: 1.2, spread: .03, speed: 900, range: 640, len: 15, noise: 440, kick: 1.6, snd: 'pistol', rc: 'pistol', price: 520, shape: 'pistol', desc: 'Pente de 15 em .45.' }),
  W({ id: 'tec9', slot: 'secondary', grp: 'Pistolas automáticas', name: 'TEC-9', cal: '9mm', dm: .75, delay: .07, mag: 32, reload: 1.6, spread: .085, speed: 900, range: 460, len: 14, noise: 420, kick: .9, snd: 'smg', rc: 'gun', price: 420, shape: 'pistol', desc: 'Cadência alta, precisão baixa.' }),
  W({ id: 'revolver38', slot: 'secondary', grp: 'Revólveres', name: 'Revólver .38', cal: '.357', dm: 1.1, delay: .4, mag: 6, reload: 2.4, spread: .025, speed: 1000, range: 720, len: 15, noise: 460, kick: 2.2, push: .8, snd: 'pistol', rc: 'mag', price: 300, shape: 'revolver', desc: 'Revólver leve, barato.' }),
  W({ id: 'judge', slot: 'secondary', grp: 'Revólveres', name: 'Taurus Judge', cal: '.410', fam: 'g410', pm: 1, dm: 1, delay: .55, mag: 5, reload: 2.8, spread: .14, speed: 900, range: 360, len: 17, noise: 540, kick: 3.5, push: 1.5, snd: 'shotgun', rc: 'mag', price: 850, shape: 'revolver', desc: 'Revólver que dispara cartuchos de escopeta (.410).' }),

  W({ id: 'tt33', slot: 'secondary', grp: 'Pistolas', name: 'Tokarev TT-33', cal: '7.62x25', dm: 1.35, delay: .26, mag: 8, reload: 1.0, spread: .03, speed: 1150, range: 640, len: 14, noise: 400, kick: 1.3, snd: 'pistol', rc: 'pistol', price: 260, shape: 'pistol', desc: 'Veloz e perfurante para uma pistola.' }),
  W({ id: 'c96', slot: 'secondary', grp: 'Pistolas', name: 'Mauser C96', cal: '7.62x25', dm: 1.1, burst: 3, bd: .05, delay: .42, mag: 10, reload: 1.4, spread: .035, speed: 1150, range: 640, len: 17, noise: 420, kick: 1.4, snd: 'pistol', rc: 'pistol', price: 600, shape: 'pistol', desc: 'Rajadas de 3 tiros com cabo de madeira.' }),

  W({ id: 'cz83', slot: 'secondary', grp: 'Pistolas', name: 'CZ 83', cal: '.32', dm: 1.3, delay: .22, mag: 15, reload: 1.0, spread: .035, speed: 850, range: 520, len: 13, noise: 340, kick: .8, snd: 'pistol', rc: 'pistol', price: 180, shape: 'pistol', desc: 'Leve, pente de 15 em .32.' }),
  W({ id: 'pm918', slot: 'secondary', grp: 'Pistolas', name: 'PM 9×18', cal: '9x18', dm: 1.35, delay: .27, mag: 8, reload: 1.0, spread: .035, speed: 900, range: 560, len: 13, noise: 360, kick: 1.1, snd: 'pistol', rc: 'pistol', price: 200, shape: 'pistol', desc: 'Pistola soviética clássica.' }),
  W({ id: 'aps', slot: 'secondary', grp: 'Pistolas automáticas', name: 'Stechkin APS', cal: '9x18', dm: .95, burst: 3, bd: .04, delay: .45, mag: 20, reload: 1.3, spread: .04, speed: 900, range: 560, len: 17, noise: 380, kick: 1, snd: 'pistol', rc: 'gun', price: 500, shape: 'pistol', desc: 'Rajadas de 3 tiros.' }),
  W({ id: 'vz61', slot: 'secondary', grp: 'Pistolas automáticas', name: 'Skorpion vz.61', cal: '.32', dm: 1, delay: .05, mag: 20, reload: 1.4, spread: .08, speed: 850, range: 440, len: 14, noise: 360, kick: .6, snd: 'smg', rc: 'gun', price: 400, shape: 'pistol', desc: 'Cadência altíssima em .32.' }),
  W({ id: 'anaconda', slot: 'secondary', grp: 'Revólveres', name: 'Colt Anaconda', cal: '.44', dm: 1.7, delay: .6, mag: 6, reload: 2.9, spread: .02, speed: 1100, range: 820, len: 18, noise: 580, kick: 4, push: 2.2, snd: 'pistol', rc: 'mag', price: 850, shape: 'revolver', desc: 'Revólver .44 de cano longo.' }),
  W({ id: 'sw460', slot: 'secondary', grp: 'Revólveres', name: 'S&W 460', cal: '.50BW', dm: 1.3, delay: .75, mag: 5, reload: 3.0, spread: .02, speed: 1150, range: 820, len: 19, noise: 640, kick: 5.2, push: 3.2, ap: .2, snd: 'pistol', rc: 'mag', price: 1300, shape: 'revolver', desc: '.50 Beowulf: coice e dano brutais.' }),

  W({ id: 'glock19', slot: 'secondary', grp: 'Pistolas', name: 'Glock 19', cal: '9mm', dm: 1.25, delay: .21, mag: 15, reload: .95, spread: .035, speed: 950, range: 620, len: 13, noise: 380, kick: 1, snd: 'pistol', rc: 'pistol', price: 230, shape: 'pistol', desc: 'Compacta e confiável.' }),
  W({ id: 'p226', slot: 'secondary', grp: 'Pistolas', name: 'SIG P226', cal: '9mm', dm: 1.3, delay: .24, mag: 15, reload: 1.0, spread: .028, speed: 950, range: 640, len: 14, noise: 390, kick: 1.1, snd: 'pistol', rc: 'pistol', price: 300, shape: 'pistol', desc: 'Precisa e robusta.' }),
  W({ id: 'usp', slot: 'secondary', grp: 'Pistolas', name: 'HK USP .45', cal: '.45', dm: 1.4, delay: .3, mag: 12, reload: 1.1, spread: .028, speed: 900, range: 640, len: 15, noise: 440, kick: 1.7, snd: 'pistol', rc: 'pistol', price: 420, shape: 'pistol', desc: '.45 com pente de 12.' }),
  W({ id: 'hp', slot: 'secondary', grp: 'Pistolas', name: 'Browning HP', cal: '9mm', dm: 1.3, delay: .26, mag: 13, reload: 1.1, spread: .03, speed: 930, range: 620, len: 14, noise: 390, kick: 1.1, snd: 'pistol', rc: 'pistol', price: 260, shape: 'pistol', desc: 'Clássica de 13 tiros.' }),
  W({ id: 'sig357', slot: 'secondary', grp: 'Pistolas', name: 'SIG P229 .357', cal: '.357sig', dm: 1.35, delay: .27, mag: 12, reload: 1.1, spread: .028, speed: 1050, range: 680, len: 14, noise: 440, kick: 1.6, snd: 'pistol', rc: 'pistol', price: 520, shape: 'pistol', desc: '.357 SIG: mais energia que a 9 mm.' }),
  W({ id: 'cz75a', slot: 'secondary', grp: 'Pistolas automáticas', name: 'CZ 75 Auto', cal: '9mm', dm: .8, delay: .065, mag: 26, reload: 1.4, spread: .075, speed: 950, range: 500, len: 15, noise: 400, kick: .9, snd: 'smg', rc: 'gun', price: 450, shape: 'pistol', desc: 'Versão de fogo contínuo.' }),
  W({ id: 'saa', slot: 'secondary', grp: 'Revólveres', name: 'Colt SAA .45', cal: '.45', dm: 1.5, delay: .55, mag: 6, reload: 3.2, spread: .022, speed: 900, range: 700, len: 16, noise: 520, kick: 2.8, push: 1.2, snd: 'pistol', rc: 'mag', price: 380, shape: 'revolver', desc: 'O revólver do velho oeste.' }),
  W({ id: 'sw500', slot: 'secondary', grp: 'Revólveres', name: 'S&W 500', cal: '.50AE', dm: 1.6, delay: .8, mag: 5, reload: 3.4, spread: .02, speed: 1150, range: 840, len: 20, noise: 720, kick: 6, push: 3.5, ap: .3, snd: 'pistol', rc: 'mag', price: 1500, shape: 'revolver', desc: 'O revólver mais potente do mundo.' }),
  W({ id: 'rev38', slot: 'secondary', grp: 'Revólveres', name: 'Taurus .38', cal: '.38sp', dm: 1.3, delay: .38, mag: 6, reload: 2.5, spread: .026, speed: 850, range: 560, len: 14, noise: 430, kick: 1.6, push: .6, snd: 'pistol', rc: 'mag', price: 160, shape: 'revolver', desc: 'Barato e confiável.' }),

  /* ===== PRIMÁRIAS: submetralhadoras ===== */
  W({ id: 'mp5', grp: 'Submetralhadoras', name: 'MP5', cal: '9mm', dm: .82, delay: .07, mag: 30, reload: 1.5, spread: .075, speed: 1050, range: 620, len: 23, noise: 430, kick: .9, speedMod: 1.03, snd: 'smg', rc: 'smg', price: 450, shape: SH(6, 14, 5.4, 8, 2, '#2a2a2a', { sc: '#222' }), desc: 'Cadência altíssima.' }),
  W({ id: 'mp5sd', grp: 'Submetralhadoras', name: 'MP5SD', cal: '9mm', dm: .76, delay: .08, mag: 30, reload: 1.6, spread: .06, speed: 950, range: 560, len: 26, noise: 200, kick: .8, sup: true, speedMod: 1.02, snd: 'smg', rc: 'smg', price: 1000, shape: SH(6, 14, 5.4, 8, 3.4, '#2a2a2a', { sc: '#222', sup: true }), desc: 'Silenciada para infiltração.' }),
  W({ id: 'uzi', grp: 'Submetralhadoras', name: 'Uzi', cal: '9mm', dm: .8, delay: .075, mag: 32, reload: 1.5, spread: .085, speed: 1000, range: 560, len: 20, noise: 440, kick: 1, speedMod: 1.03, snd: 'smg', rc: 'smg', price: 400, shape: SH(5, 13, 6, 6, 2, '#33363a', { sc: '#222' }), desc: 'Barata e compacta.' }),
  W({ id: 'bizon', grp: 'Submetralhadoras', name: 'PP-19 Bizon', cal: '9mm', dm: .8, delay: .085, mag: 64, reload: 2.4, spread: .08, speed: 1000, range: 560, len: 24, noise: 440, kick: .9, speedMod: 1, snd: 'smg', rc: 'smg', price: 600, shape: SH(5, 17, 6.4, 6, 2, '#33363a', { sc: '#222', mag: true }), desc: 'Pente helicoidal de 64 tiros.' }),
  W({ id: 'ump', grp: 'Submetralhadoras', name: 'UMP-45', cal: '.45', dm: .83, delay: .09, mag: 25, reload: 1.7, spread: .07, speed: 1000, range: 640, len: 24, noise: 470, kick: 1.3, snd: 'smg', rc: 'smg', price: 650, shape: SH(6, 15, 6, 7, 2.2, '#3a3a3a', { sc: '#2a2a2a' }), desc: '.45 com mais impacto.' }),
  W({ id: 'vector', grp: 'Submetralhadoras', name: 'Kriss Vector', cal: '.45', dm: .7, delay: .05, mag: 25, reload: 1.6, spread: .06, speed: 1000, range: 560, len: 22, noise: 460, kick: .6, speedMod: 1, snd: 'smg', rc: 'low', price: 1300, shape: SH(4, 16, 7, 4, 2.2, '#2d2d33', { sc: '#2d2d33' }), desc: 'Quase sem recuo vertical.' }),
  W({ id: 'mp7', grp: 'Submetralhadoras', name: 'MP7', cal: '4.6', dm: 1, delay: .075, mag: 40, reload: 1.7, spread: .055, speed: 1250, range: 640, len: 21, noise: 420, kick: .7, speedMod: 1.03, snd: 'smg', rc: 'low', price: 1000, shape: SH(5, 15, 5.4, 6, 2, '#33363a', { sc: '#222' }), desc: '4.6 mm perfurante, quase sem recuo.' }),
  W({ id: 'p90', grp: 'Submetralhadoras', name: 'P90', cal: '5.7', dm: .95, delay: .065, mag: 50, reload: 2.4, spread: .06, speed: 1300, range: 700, len: 22, noise: 430, kick: .7, snd: 'smg', rc: 'smg', price: 1100, shape: SH(3, 18, 7, 5, 2, '#2d3136', { sc: '#2d3136' }), desc: 'Pente de 50, perfura blindagem.' }),

  W({ id: 'ppsh', grp: 'Submetralhadoras', name: 'PPSh-41', cal: '7.62x25', dm: .85, delay: .055, mag: 71, reload: 2.8, spread: .09, speed: 1150, range: 560, len: 22, noise: 460, kick: 1, snd: 'smg', rc: 'smg', price: 700, shape: SH(8, 15, 6, 8, 2.4, '#3a2d20', { sc: '#6a4524', wood: true, mag: true }), desc: 'Tambor de 71 tiros em 7.62×25.' }),

  W({ id: 'sten', grp: 'Submetralhadoras', name: 'Sten', cal: '9mm', dm: .85, delay: .1, mag: 32, reload: 1.8, spread: .09, speed: 900, range: 500, len: 24, noise: 440, kick: .9, speedMod: 1.03, snd: 'smg', rc: 'smg', price: 350, shape: SH(0, 16, 4, 12, 2.2, '#2a2a2a', { sc: '#2a2a2a' }), desc: 'Barata e simples.' }),
  W({ id: 'mp40', grp: 'Submetralhadoras', name: 'MP 40', cal: '9mm', dm: .85, delay: .105, mag: 32, reload: 1.8, spread: .08, speed: 920, range: 520, len: 25, noise: 440, kick: .9, speedMod: 1.02, snd: 'smg', rc: 'smg', price: 500, shape: SH(6, 14, 5, 8, 2, '#2a2a2a', { sc: '#6a4524' }), desc: 'Clássica submetralhadora de 9 mm.' }),
  W({ id: 'thompson', grp: 'Submetralhadoras', name: 'Thompson M1928', cal: '.45', dm: .85, delay: .09, mag: 50, reload: 2.6, spread: .08, speed: 900, range: 560, len: 26, noise: 480, kick: 1.4, speedMod: .98, snd: 'smg', rc: 'smg', price: 900, shape: SH(7, 15, 6, 9, 2.4, '#2d2d2d', { sc: '#6a4524', wood: true, mag: true }), desc: 'Tambor de 50 em .45.' }),
  W({ id: 'mp9', grp: 'Submetralhadoras', name: 'B&T MP9', cal: '9mm', dm: .78, delay: .06, mag: 30, reload: 1.4, spread: .08, speed: 1000, range: 480, len: 17, noise: 420, kick: .8, speedMod: 1.04, snd: 'smg', rc: 'smg', price: 850, shape: SH(4, 12, 5, 5, 2, '#2d3136', { sc: '#2d3136' }), desc: 'Compacta e muito rápida.' }),
  W({ id: 'evo3', grp: 'Submetralhadoras', name: 'Scorpion EVO 3', cal: '9mm', dm: .85, delay: .075, mag: 30, reload: 1.5, spread: .06, speed: 1000, range: 600, len: 22, noise: 430, kick: .8, speedMod: 1.02, snd: 'smg', rc: 'low', price: 750, shape: SH(5, 15, 5.4, 8, 2, '#33363a', { sc: '#33363a' }), desc: 'Estável e versátil.' }),
  W({ id: 'kedr', grp: 'Submetralhadoras', name: 'PP-91 Kedr', cal: '9x18', dm: .85, delay: .07, mag: 30, reload: 1.5, spread: .09, speed: 950, range: 480, len: 17, noise: 400, kick: .8, speedMod: 1.03, snd: 'smg', rc: 'smg', price: 450, shape: SH(4, 11, 5, 5, 2, '#33363a', { sc: '#33363a' }), desc: 'Compacta soviética em 9×18.' }),

  W({ id: 'mpx', grp: 'Submetralhadoras', name: 'SIG MPX', cal: '9mm', dm: .85, delay: .07, mag: 30, reload: 1.5, spread: .055, speed: 1050, range: 600, len: 21, noise: 430, kick: .8, snd: 'smg', rc: 'low', price: 1000, shape: SH(4, 14, 5.6, 7, 2, '#2d3136', { sc: '#2d3136' }), desc: 'Estável e precisa.' }),
  W({ id: 'ump9', grp: 'Submetralhadoras', name: 'UMP-9', cal: '9mm', dm: .85, delay: .085, mag: 30, reload: 1.6, spread: .06, speed: 1000, range: 600, len: 23, noise: 420, kick: .9, snd: 'smg', rc: 'smg', price: 600, shape: SH(6, 15, 6, 7, 2, '#3a3a3a', { sc: '#2a2a2a' }), desc: 'Leve e controlável.' }),
  W({ id: 'sterling', grp: 'Submetralhadoras', name: 'Sterling', cal: '9mm', dm: .88, delay: .1, mag: 34, reload: 1.8, spread: .07, speed: 950, range: 560, len: 25, noise: 430, kick: .9, snd: 'smg', rc: 'smg', price: 380, shape: SH(6, 16, 4.6, 8, 2, '#33363a', { sc: '#33363a' }), desc: 'Clássica britânica.' }),
  W({ id: 'owen', grp: 'Submetralhadoras', name: 'Owen Gun', cal: '9mm', dm: .9, delay: .105, mag: 33, reload: 2.0, spread: .075, speed: 900, range: 520, len: 25, noise: 440, kick: 1, snd: 'smg', rc: 'smg', price: 350, shape: SH(5, 15, 5, 9, 2, '#3a3a2a', { sc: '#6a4524', wood: true }), desc: 'Rústica australiana, muito confiável.' }),
  W({ id: 'k7', grp: 'Submetralhadoras', name: 'K7 Silenciada', cal: '9mm', dm: .8, delay: .095, mag: 30, reload: 1.7, spread: .055, speed: 900, range: 520, len: 26, noise: 200, sup: true, kick: .7, snd: 'smg', rc: 'smg', price: 1100, shape: SH(5, 15, 5.4, 8, 3.4, '#2a2a2a', { sc: '#2a2a2a', sup: true }), desc: 'Silenciada de fábrica.' }),

  /* ===== PRIMÁRIAS: fuzis de assalto ===== */
  W({ id: 'ar15', grp: 'Fuzis de assalto', name: 'AR-15', cal: '5.56', dm: .95, delay: .1, mag: 30, reload: 1.7, spread: .055, speed: 1250, range: 900, len: 31, noise: 520, kick: 1.6, speedMod: .97, snd: 'rifle', rc: 'ar', shape: SH(8, 18, 6, 12, 2.4, '#2c2f33'), desc: 'Automático equilibrado.' }),
  W({ id: 'm4a1', grp: 'Fuzis de assalto', name: 'M4A1', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.6, spread: .045, speed: 1280, range: 900, len: 30, noise: 520, kick: 1.3, speedMod: .98, snd: 'rifle', rc: 'low', price: 700, shape: SH(8, 17, 6, 11, 2.4, '#2c2f33'), desc: 'Recuo controlável, ótimo para acessórios.' }),
  W({ id: 'g36', grp: 'Fuzis de assalto', name: 'G36', cal: '5.56', dm: 1, delay: .095, mag: 30, reload: 1.7, spread: .05, speed: 1250, range: 900, len: 30, noise: 520, kick: 1.4, speedMod: .98, snd: 'rifle', rc: 'low', price: 850, shape: SH(8, 20, 6.4, 8, 2.4, '#3a3d40', { sc: '#3a3d40' }), desc: 'Preciso e estável.' }),
  W({ id: 'aug', grp: 'Fuzis de assalto', name: 'Steyr AUG', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.8, spread: .035, speed: 1280, range: 950, len: 28, noise: 500, kick: 1.2, speedMod: .98, snd: 'rifle', rc: 'low', price: 1000, shape: SH(2, 22, 6.4, 6, 2.4, '#3b4a34', { sc: '#3b4a34', scope: true }), desc: 'Bullpup com mira embutida.' }),
  W({ id: 'famas', grp: 'Fuzis de assalto', name: 'FAMAS', cal: '5.56', dm: 1, burst: 3, bd: .05, delay: .34, mag: 25, reload: 1.8, spread: .04, speed: 1250, range: 900, len: 28, noise: 520, kick: 1.5, speedMod: .98, snd: 'rifle', rc: 'ar', price: 800, shape: SH(8, 20, 6.4, 8, 2.4, '#34383c'), desc: 'Rajadas de 3 tiros precisas.' }),
  W({ id: 'ak74', grp: 'Fuzis de assalto', name: 'AK-74', cal: '5.45', dm: 1.05, delay: .1, mag: 30, reload: 1.8, spread: .06, speed: 1300, range: 900, len: 31, noise: 540, kick: 1.7, speedMod: .97, snd: 'rifle', rc: 'ar', price: 750, shape: SH(8, 18, 5.6, 13, 2.4, '#2d2a24', { sc: '#5a3a1c', wood: true }), desc: 'Recuo mais suave que o AK-47.' }),
  W({ id: 'ak47', grp: 'Fuzis de assalto', name: 'AK-47', cal: '7.62x39', dm: 1, delay: .12, mag: 30, reload: 1.9, spread: .08, speed: 1200, range: 900, len: 31, noise: 580, kick: 2.2, speedMod: .96, snd: 'rifle', rc: 'ak', price: 900, shape: SH(8, 18, 5.6, 13, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Muito dano, recuo forte.' }),
  W({ id: 'acr', grp: 'Fuzis de assalto', name: 'ACR .300', cal: '.300', dm: 1, delay: .1, mag: 30, reload: 1.7, spread: .05, speed: 1250, range: 900, len: 31, noise: 540, kick: 1.5, speedMod: .97, snd: 'rifle', rc: 'low', price: 1300, shape: SH(8, 18, 6.4, 12, 2.6, '#5a5238', { sc: '#4a4430' }), desc: '.300 Blackout contra alvos blindados.' }),

  W({ id: 'm16a4', grp: 'Fuzis de assalto', name: 'M16A4', cal: '5.56', dm: 1.02, burst: 3, bd: .05, delay: .3, mag: 30, reload: 1.8, spread: .028, speed: 1350, range: 1000, len: 34, noise: 520, kick: 1.3, speedMod: .96, snd: 'rifle', rc: 'ar', price: 650, shape: SH(8, 20, 6, 14, 2.4, '#2c2f33'), desc: 'Rajadas de 3 tiros e longo alcance.' }),
  W({ id: 'hk416', grp: 'Fuzis de assalto', name: 'HK416', cal: '5.56', dm: 1, delay: .085, mag: 30, reload: 1.6, spread: .04, speed: 1300, range: 920, len: 30, noise: 510, kick: 1.2, speedMod: .98, snd: 'rifle', rc: 'low', price: 1250, shape: SH(8, 17, 6, 11, 2.4, '#2a2a2c'), desc: 'Sistema de pistão: estável e confiável.' }),
  W({ id: 'scarl', grp: 'Fuzis de assalto', name: 'SCAR-L', cal: '5.56', dm: 1, delay: .092, mag: 30, reload: 1.7, spread: .045, speed: 1280, range: 900, len: 30, noise: 520, kick: 1.4, speedMod: .97, snd: 'rifle', rc: 'low', price: 1100, shape: SH(8, 19, 6.4, 11, 2.4, '#6a5d3e', { sc: '#5a5238' }), desc: 'Versão leve do SCAR em 5.56.' }),
  W({ id: 'tavor', grp: 'Fuzis de assalto', name: 'TAR-21', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.7, spread: .035, speed: 1280, range: 900, len: 25, noise: 520, kick: 1.2, speedMod: 1, snd: 'rifle', rc: 'low', price: 1150, shape: SH(2, 22, 6.8, 5, 2.4, '#34383c', { sc: '#34383c' }), desc: 'Bullpup compacto e ágil.' }),
  W({ id: 'f2000', grp: 'Fuzis de assalto', name: 'FN F2000', cal: '5.56', dm: 1, delay: .085, mag: 30, reload: 1.8, spread: .028, speed: 1300, range: 950, len: 26, noise: 500, kick: 1.1, speedMod: .98, snd: 'rifle', rc: 'low', price: 1500, shape: SH(2, 24, 7, 4, 2.4, '#3b4a34', { sc: '#3b4a34', scope: true }), desc: 'Bullpup futurista com mira embutida.' }),
  W({ id: 'l85', grp: 'Fuzis de assalto', name: 'L85A2', cal: '5.56', dm: 1, delay: .1, mag: 30, reload: 1.9, spread: .04, speed: 1280, range: 920, len: 26, noise: 520, kick: 1.4, speedMod: .97, snd: 'rifle', rc: 'ar', price: 950, shape: SH(2, 22, 6.4, 6, 2.4, '#3a3d2a', { sc: '#3a3d2a', scope: true }), desc: 'Bullpup britânico com luneta.' }),
  W({ id: 'galil', grp: 'Fuzis de assalto', name: 'IMI Galil', cal: '5.56', dm: 1, delay: .1, mag: 35, reload: 1.8, spread: .06, speed: 1250, range: 900, len: 30, noise: 540, kick: 1.8, speedMod: .96, snd: 'rifle', rc: 'ak', price: 800, shape: SH(8, 18, 5.6, 12, 2.4, '#34383c', { sc: '#2d2d2d' }), desc: 'Robusto, pente de 35.' }),
  W({ id: 'sg550', grp: 'Fuzis de assalto', name: 'SIG SG 550', cal: '5.56', dm: 1.05, delay: .1, mag: 30, reload: 1.8, spread: .028, speed: 1350, range: 1000, len: 31, noise: 520, kick: 1.4, speedMod: .96, snd: 'rifle', rc: 'low', price: 1300, shape: SH(8, 20, 6, 12, 2.4, '#3a3a3a', { sc: '#3a3a3a', scope: true }), desc: 'Suíço, muito preciso.' }),
  W({ id: 'qbz95', grp: 'Fuzis de assalto', name: 'QBZ-95', cal: '5.8', dm: 1.05, delay: .09, mag: 30, reload: 1.8, spread: .045, speed: 1300, range: 900, len: 26, noise: 520, kick: 1.4, speedMod: 1, snd: 'rifle', rc: 'ar', price: 900, shape: SH(2, 21, 6.4, 6, 2.4, '#3a4430', { sc: '#3a4430' }), desc: 'Bullpup em 5.8×42.' }),
  W({ id: 'qbz191', grp: 'Fuzis de assalto', name: 'QBZ-191', cal: '5.8', dm: 1.05, delay: .085, mag: 30, reload: 1.6, spread: .04, speed: 1320, range: 920, len: 30, noise: 520, kick: 1.2, speedMod: .98, snd: 'rifle', rc: 'low', price: 1200, shape: SH(8, 18, 6.2, 11, 2.4, '#3a3d40'), desc: 'Moderno, estável e modular.' }),
  W({ id: 'ak12', grp: 'Fuzis de assalto', name: 'AK-12', cal: '5.45', dm: 1.05, delay: .09, mag: 30, reload: 1.7, spread: .045, speed: 1320, range: 920, len: 31, noise: 540, kick: 1.4, speedMod: .97, snd: 'rifle', rc: 'low', price: 1250, shape: SH(8, 18, 5.8, 12, 2.6, '#2d2d2d', { sc: '#2d2d2d' }), desc: 'AK moderno com recuo domado.' }),
  W({ id: 'an94', grp: 'Fuzis de assalto', name: 'AN-94 Abakan', cal: '5.45', dm: 1.05, burst: 2, bd: .04, delay: .22, mag: 30, reload: 1.9, spread: .028, speed: 1350, range: 950, len: 32, noise: 540, kick: 1.2, speedMod: .96, snd: 'rifle', rc: 'low', price: 1500, shape: SH(8, 19, 6, 12, 2.6, '#2d2a24', { sc: '#3a3a2a' }), desc: 'Rajada de 2 tiros quase simultâneos.' }),
  W({ id: 'akm', grp: 'Fuzis de assalto', name: 'AKM', cal: '7.62x39', dm: 1, delay: .115, mag: 30, reload: 1.9, spread: .075, speed: 1200, range: 880, len: 31, noise: 580, kick: 2.1, speedMod: .96, snd: 'rifle', rc: 'ak', price: 850, shape: SH(8, 18, 5.6, 13, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Rústico e potente.' }),
  W({ id: 'ak103', grp: 'Fuzis de assalto', name: 'AK-103', cal: '7.62x39', dm: 1, delay: .11, mag: 30, reload: 1.8, spread: .065, speed: 1220, range: 900, len: 31, noise: 580, kick: 2, speedMod: .96, snd: 'rifle', rc: 'ak', price: 1000, shape: SH(8, 18, 5.6, 13, 2.4, '#2d2a24', { sc: '#2d2a24' }), desc: 'AK em polímero, 7.62×39.' }),
  W({ id: 'vz58', grp: 'Fuzis de assalto', name: 'Vz. 58', cal: '7.62x39', dm: 1, delay: .12, mag: 30, reload: 1.8, spread: .06, speed: 1220, range: 900, len: 30, noise: 560, kick: 1.9, speedMod: .97, snd: 'rifle', rc: 'ar', price: 850, shape: SH(8, 18, 5.4, 13, 2.4, '#34383c', { sc: '#6a4524', wood: true }), desc: 'Checo, leve e preciso.' }),
  W({ id: 'mcx', grp: 'Fuzis de assalto', name: 'SIG MCX', cal: '.300', dm: 1, delay: .09, mag: 30, reload: 1.6, spread: .04, speed: 1250, range: 900, len: 29, noise: 520, kick: 1.3, speedMod: .98, snd: 'rifle', rc: 'low', price: 1400, shape: SH(8, 17, 6, 10, 2.4, '#2d2d33', { sc: '#2d2d33' }), desc: '.300 Blackout modular.' }),
  W({ id: 'honeybadger', grp: 'Fuzis de assalto', name: 'Honey Badger', cal: '.300', dm: .95, delay: .095, mag: 30, reload: 1.6, spread: .045, speed: 950, range: 760, len: 26, noise: 240, kick: 1.1, sup: true, speedMod: 1, snd: 'smg', rc: 'low', price: 1900, shape: SH(5, 15, 6, 8, 3.6, '#2d2d2d', { sc: '#2d2d2d', sup: true }), desc: 'PDW silenciada em .300.' }),
  W({ id: 'groza', grp: 'Fuzis de assalto', name: 'OTs-14 Groza', cal: '9x39', dm: 1, delay: .09, mag: 20, reload: 1.7, spread: .05, speed: 1000, range: 800, len: 25, noise: 520, kick: 1.3, speedMod: 1, snd: 'rifle', rc: 'low', price: 1500, shape: SH(2, 21, 6.6, 6, 2.4, '#3b3f34', { sc: '#3b3f34' }), desc: 'Bullpup com 9×39 subsônico.' }),
  W({ id: 'asval', grp: 'Fuzis de assalto', name: 'AS Val', cal: '9x39', dm: 1, delay: .09, mag: 20, reload: 1.7, spread: .04, speed: 900, range: 800, len: 26, noise: 240, kick: 1, sup: true, speedMod: 1, snd: 'smg', rc: 'low', price: 2000, shape: SH(7, 16, 5.4, 8, 3.6, '#2d3a2a', { sc: '#2d3a2a', sup: true }), desc: 'Fuzil silenciado integrado.' }),
  W({ id: 'xm7', grp: 'Fuzis de assalto', name: 'XM7', cal: '6.8', dm: 1, delay: .11, mag: 20, reload: 1.8, spread: .035, speed: 1500, range: 1050, len: 31, noise: 600, kick: 1.8, speedMod: .95, snd: 'rifle', rc: 'low', price: 2400, shape: SH(8, 18, 6.4, 12, 2.6, '#5a5238', { sc: '#4a4430', scope: true }), desc: '6.8×51: perfura blindagem pesada.' }),
  W({ id: 'ar6mm', grp: 'Fuzis de assalto', name: 'AR-15 6mm ARC', cal: '6mm', dm: 1, delay: .1, mag: 30, reload: 1.7, spread: .04, speed: 1350, range: 950, len: 31, noise: 540, kick: 1.3, speedMod: .97, snd: 'rifle', rc: 'low', price: 1000, shape: SH(8, 18, 6, 12, 2.4, '#2c2f33'), desc: 'AR com 6mm ARC: dano e alcance.' }),
  W({ id: 'grendel', grp: 'Fuzis de assalto', name: 'AR 6.5 Grendel', cal: '6.5g', dm: 1, delay: .105, mag: 25, reload: 1.8, spread: .035, speed: 1400, range: 1000, len: 31, noise: 560, kick: 1.5, speedMod: .96, snd: 'rifle', rc: 'ar', price: 1150, shape: SH(8, 18, 6, 12, 2.4, '#34383c'), desc: '6.5 Grendel: alcance de DMR.' }),
  W({ id: 'stg44', grp: 'Fuzis de assalto', name: 'StG 44', cal: '7.92k', dm: 1, delay: .105, mag: 30, reload: 1.9, spread: .07, speed: 1200, range: 860, len: 30, noise: 580, kick: 2, speedMod: .96, snd: 'rifle', rc: 'ak', price: 1100, shape: SH(8, 18, 5.4, 12, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'O primeiro fuzil de assalto.' }),
  W({ id: 'm1carbine', grp: 'Fuzis de assalto', name: 'M2 Carbine', cal: '.30carb', dm: 1, delay: .09, mag: 30, reload: 1.6, spread: .06, speed: 1050, range: 700, len: 24, noise: 440, kick: 1.1, speedMod: 1.02, snd: 'rifle', rc: 'smg', price: 600, shape: SH(8, 14, 5, 10, 2, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Carabina leve da Segunda Guerra.' }),

  W({ id: 'm27', grp: 'Fuzis de assalto', name: 'HK M27 IAR', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.7, spread: .034, speed: 1350, range: 980, len: 31, noise: 510, kick: 1.2, speedMod: .97, snd: 'rifle', rc: 'low', price: 1350, shape: SH(8, 18, 6, 11, 2.4, '#3a3d40'), desc: 'Fuzil automático de esquadra, muito estável.' }),
  W({ id: 'cz805', grp: 'Fuzis de assalto', name: 'CZ 805 Bren', cal: '5.56', dm: 1, delay: .092, mag: 30, reload: 1.7, spread: .04, speed: 1300, range: 920, len: 30, noise: 520, kick: 1.3, speedMod: .98, snd: 'rifle', rc: 'low', price: 1100, shape: SH(8, 18, 6.2, 11, 2.4, '#34383c', { sc: '#34383c' }), desc: 'Modular e equilibrado.' }),
  W({ id: 'ar57', grp: 'Fuzis de assalto', name: 'AR-57', cal: '5.7', dm: .95, delay: .07, mag: 50, reload: 2.2, spread: .05, speed: 1400, range: 760, len: 28, noise: 440, kick: .8, speedMod: 1, snd: 'rifle', rc: 'low', price: 1700, shape: SH(8, 17, 6.4, 10, 2.4, '#2d2d33', { sc: '#2d2d33', mag: true }), desc: 'Pente de 50 em 5.7×28.' }),
  W({ id: 'beowulf', grp: 'Fuzis de assalto', name: 'AR .50 Beowulf', cal: '.50BW', dm: 1, delay: .13, mag: 15, reload: 1.9, spread: .05, speed: 1000, range: 700, len: 28, noise: 600, kick: 3, speedMod: .94, snd: 'rifle', rc: 'gun', price: 1600, shape: SH(8, 17, 6.4, 9, 3, '#2c2f33'), desc: '.50 Beowulf: curto alcance, impacto enorme.' }),

  W({ id: 'sig553', grp: 'Fuzis de assalto', name: 'SIG 553', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.7, spread: .042, speed: 1280, range: 920, len: 29, noise: 520, kick: 1.3, speedMod: .98, snd: 'rifle', rc: 'low', price: 1050, shape: SH(8, 17, 6, 10, 2.4, '#3a3d40', { sc: '#3a3d40' }), desc: 'Suíço e confiável.' }),
  W({ id: 'ak74m', grp: 'Fuzis de assalto', name: 'AK-74M', cal: '5.45', dm: 1.05, delay: .095, mag: 30, reload: 1.7, spread: .05, speed: 1300, range: 920, len: 31, noise: 540, kick: 1.5, snd: 'rifle', rc: 'ar', price: 800, shape: SH(8, 18, 5.8, 12, 2.6, '#2d2d2d', { sc: '#2d2d2d' }), desc: 'AK-74 modernizado.' }),
  W({ id: 'aks74u', grp: 'Fuzis de assalto', name: 'AKS-74U', cal: '5.45', dm: 1, delay: .07, mag: 30, reload: 1.6, spread: .07, speed: 1100, range: 640, len: 22, noise: 580, kick: 1.5, snd: 'rifle', rc: 'ak', price: 900, shape: SH(6, 15, 5.4, 6, 2.2, '#2d2a24', { sc: '#6a4524', wood: true }), desc: 'Carabina curta de cadência altíssima.' }),
  W({ id: 'mk18', grp: 'Fuzis de assalto', name: 'Mk 18 CQBR', cal: '5.56', dm: .98, delay: .08, mag: 30, reload: 1.5, spread: .05, speed: 1150, range: 700, len: 24, noise: 560, kick: 1.4, speedMod: 1, snd: 'rifle', rc: 'low', price: 1000, shape: SH(8, 15, 6, 6, 2.4, '#2c2f33'), desc: 'AR curto para combate em ambientes fechados.' }),
  W({ id: 'fnc', grp: 'Fuzis de assalto', name: 'FN FNC', cal: '5.56', dm: 1, delay: .09, mag: 30, reload: 1.7, spread: .05, speed: 1250, range: 900, len: 30, noise: 530, kick: 1.4, snd: 'rifle', rc: 'ar', price: 850, shape: SH(8, 18, 5.8, 11, 2.4, '#34383c'), desc: 'Belga, robusto.' }),
  W({ id: 'xm8', grp: 'Fuzis de assalto', name: 'XM8', cal: '5.56', dm: 1, delay: .085, mag: 30, reload: 1.6, spread: .045, speed: 1270, range: 900, len: 27, noise: 500, kick: 1.2, snd: 'rifle', rc: 'low', price: 1300, shape: SH(7, 17, 6.4, 8, 2.4, '#5a5f66', { sc: '#5a5f66' }), desc: 'Futurista e leve.' }),
  W({ id: 'ak15', grp: 'Fuzis de assalto', name: 'AK-15', cal: '7.62x39', dm: 1, delay: .1, mag: 30, reload: 1.7, spread: .055, speed: 1250, range: 900, len: 31, noise: 580, kick: 1.9, snd: 'rifle', rc: 'ak', price: 1300, shape: SH(8, 18, 5.8, 12, 2.6, '#2d2d2d', { sc: '#2d2d2d' }), desc: 'AK moderno em 7.62×39.' }),
  W({ id: 'rk95', grp: 'Fuzis de assalto', name: 'Valmet RK 95', cal: '7.62x39', dm: 1, delay: .11, mag: 30, reload: 1.8, spread: .055, speed: 1220, range: 900, len: 31, noise: 570, kick: 1.9, snd: 'rifle', rc: 'ak', price: 900, shape: SH(8, 18, 5.6, 12, 2.4, '#34383c', { sc: '#34383c' }), desc: 'Finlandês, muito resistente.' }),

  /* ===== PRIMÁRIAS: fuzis de batalha e atiradores designados ===== */
  W({ id: 'scar', grp: 'Fuzis de batalha', name: 'SCAR-H', cal: '.308', dm: .95, delay: .13, mag: 20, reload: 2.0, spread: .06, speed: 1500, range: 1000, len: 32, noise: 620, kick: 2.6, speedMod: .94, snd: 'rifle', rc: 'gun', price: 1500, shape: SH(8, 19, 6.4, 12, 2.6, '#5a5238', { sc: '#4a4430' }), desc: '.308 pesado e potente.' }),
  W({ id: 'hk417', grp: 'Fuzis de batalha', name: 'HK417', cal: '.308', dm: 1.05, delay: .12, mag: 20, reload: 2.0, spread: .05, speed: 1550, range: 1050, len: 32, noise: 620, kick: 2.4, speedMod: .94, snd: 'rifle', rc: 'gun', price: 1600, shape: SH(8, 19, 6.4, 12, 2.6, '#3a3d40', { sc: '#3a3d40' }), desc: 'Batalha estável com .308.' }),
  W({ id: 'g3', grp: 'Fuzis de batalha', name: 'G3', cal: '.308', dm: 1.1, delay: .13, mag: 20, reload: 2.1, spread: .07, speed: 1500, range: 1000, len: 32, noise: 640, kick: 3, speedMod: .93, snd: 'rifle', rc: 'ak', price: 1100, shape: SH(8, 19, 5.6, 12, 2.4, '#3a3a2a', { sc: '#4a4030' }), desc: 'Clássico, forte e instável.' }),
  W({ id: 'fal', grp: 'Fuzis de batalha', name: 'FN FAL', cal: '.308', dm: 1.05, delay: .125, mag: 20, reload: 2.0, spread: .065, speed: 1500, range: 1000, len: 33, noise: 630, kick: 2.8, speedMod: .94, snd: 'rifle', rc: 'gun', price: 1300, shape: SH(8, 19, 6, 12, 2.6, '#3a3a2a', { sc: '#3a3a2a' }), desc: 'O braço armado do Ocidente: forte e rebelde.' }),
  W({ id: 'm1a', grp: 'Fuzis de batalha', name: 'M1A Socom', cal: '.308', dm: 1.1, delay: .2, mag: 20, reload: 2.0, spread: .025, speed: 1650, range: 1150, len: 33, noise: 650, kick: 2.6, speedMod: .94, snd: 'rifle', rc: 'dmr', price: 1400, shape: SH(8, 19, 5.6, 12, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Semi-automático preciso em .308.' }),
  W({ id: 'ar10', grp: 'Fuzis de batalha', name: 'AR-10', cal: '.308', dm: 1, delay: .11, mag: 20, reload: 1.9, spread: .05, speed: 1550, range: 1050, len: 33, noise: 620, kick: 2.3, speedMod: .95, snd: 'rifle', rc: 'gun', price: 1700, shape: SH(8, 19, 6.4, 13, 2.6, '#2c2f33'), desc: 'O avô do AR-15, em .308.' }),
  W({ id: 'sig716', grp: 'Fuzis de batalha', name: 'SIG 716', cal: '.308', dm: 1, delay: .115, mag: 20, reload: 1.9, spread: .05, speed: 1550, range: 1050, len: 33, noise: 620, kick: 2.4, speedMod: .94, snd: 'rifle', rc: 'gun', price: 1600, shape: SH(8, 19, 6.4, 12, 2.6, '#33363a'), desc: 'Pistão curto em .308.' }),
  W({ id: 'cetme', grp: 'Fuzis de batalha', name: 'CETME', cal: '.308', dm: .95, delay: .11, mag: 20, reload: 2.0, spread: .09, speed: 1450, range: 950, len: 32, noise: 640, kick: 3, speedMod: .94, snd: 'rifle', rc: 'ak', price: 900, shape: SH(8, 19, 5.6, 12, 2.4, '#3a3a2a', { sc: '#4a4030' }), desc: 'Rápido e bruto; difícil de segurar.' }),
  W({ id: 'ak308', grp: 'Fuzis de batalha', name: 'AK-308', cal: '.308', dm: 1.05, delay: .12, mag: 20, reload: 1.9, spread: .075, speed: 1500, range: 1000, len: 32, noise: 640, kick: 2.8, speedMod: .94, snd: 'rifle', rc: 'ak', price: 1500, shape: SH(8, 18, 5.8, 13, 2.6, '#2d2a24', { sc: '#2d2a24' }), desc: 'AK em .308 Winchester.' }),
  W({ id: 'rfb', grp: 'Fuzis de batalha', name: 'Kel-Tec RFB', cal: '.308', dm: 1.15, delay: .14, mag: 20, reload: 2.0, spread: .03, speed: 1600, range: 1100, len: 28, noise: 640, kick: 2.5, speedMod: .95, snd: 'rifle', rc: 'dmr', price: 1800, shape: SH(2, 24, 7, 4, 2.6, '#34383c', { sc: '#34383c' }), desc: 'Bullpup semi-automático .308.' }),
  W({ id: 'bar', grp: 'Fuzis de batalha', name: 'BAR M1918', cal: '.30-06', dm: .65, delay: .12, mag: 20, reload: 2.4, spread: .075, speed: 1500, range: 1000, len: 38, noise: 700, kick: 3.4, speedMod: .88, snd: 'rifle', rc: 'ak', price: 1400, shape: SH(9, 19, 5.8, 15, 2.6, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Fuzil automático pesado da Grande Guerra.' }),
  W({ id: 'fg42', grp: 'Fuzis de batalha', name: 'FG 42', cal: '7.92', dm: .6, delay: .085, mag: 20, reload: 2.2, spread: .1, speed: 1450, range: 950, len: 32, noise: 700, kick: 2.6, speedMod: .92, snd: 'rifle', rc: 'ak', price: 2100, shape: SH(5, 19, 5.6, 12, 2.4, '#3a3a2a', { sc: '#4a4030' }), desc: '7.92 em cadência de metralhadora.' }),
  W({ id: 'mcxspear', grp: 'Fuzis de batalha', name: 'SIG MCX Spear', cal: '6.8', dm: 1, delay: .12, mag: 20, reload: 1.8, spread: .04, speed: 1550, range: 1050, len: 31, noise: 620, kick: 2, speedMod: .95, snd: 'rifle', rc: 'gun', price: 2600, shape: SH(8, 18, 6.4, 12, 2.6, '#6a5d3e', { sc: '#5a5238' }), desc: '6.8×51: o novo padrão de batalha.' }),
  W({ id: 'sks', grp: 'Fuzis de batalha', name: 'SKS', cal: '7.62x39', dm: 1.1, delay: .2, mag: 10, reload: 1.8, spread: .03, speed: 1250, range: 950, len: 32, noise: 580, kick: 1.9, speedMod: .97, snd: 'rifle', rc: 'dmr', price: 500, shape: SH(9, 17, 5, 13, 2.2, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Semi-auto simples e barato.' }),
  W({ id: 'svt40', grp: 'Fuzis de batalha', name: 'SVT-40', cal: '7.62x54', dm: 1, delay: .22, mag: 10, reload: 1.9, spread: .03, speed: 1700, range: 1200, len: 36, noise: 700, kick: 3.2, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 1100, shape: SH(9, 18, 5.4, 15, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Semi-automático soviético em 7.62×54R.' }),

  W({ id: 'scar20', grp: 'Atiradores designados', name: 'SCAR-20S', cal: '.308', dm: 1.4, delay: .26, mag: 20, reload: 2.0, spread: .009, speed: 2000, range: 1500, len: 36, noise: 650, kick: 2.4, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 2400, shape: SH(9, 20, 6.2, 14, 2.5, '#5a5238', { sc: '#4a4430', scope: true }), desc: 'DMR semi-auto de precisão.' }),
  W({ id: 'm39', grp: 'Atiradores designados', name: 'Mk 39 EMR', cal: '.308', dm: 1.35, delay: .28, mag: 20, reload: 2.0, spread: .01, speed: 2000, range: 1450, len: 36, noise: 640, kick: 2.5, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 2200, shape: SH(9, 20, 6, 14, 2.4, '#33363a', { sc: '#33363a', scope: true }), desc: 'Atirador designado de esquadra.' }),

  W({ id: 'g3sg1', grp: 'Atiradores designados', name: 'HK G3SG/1', cal: '.308', dm: 1.35, delay: .28, mag: 20, reload: 2.1, spread: .011, speed: 2000, range: 1450, len: 36, noise: 650, kick: 2.6, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 2000, shape: SH(9, 20, 5.8, 14, 2.4, '#3a3a2a', { sc: '#3a3a2a', scope: true }), desc: 'Semi-auto de precisão em .308.' }),
  W({ id: 'psg1', grp: 'Atiradores designados', name: 'HK PSG-1', cal: '.308', dm: 1.5, delay: .34, mag: 20, reload: 2.2, spread: .006, speed: 2100, range: 1600, len: 38, noise: 650, kick: 2.2, speedMod: .9, snd: 'rifle', rc: 'dmr', price: 2800, shape: SH(10, 20, 6.4, 14, 2.5, '#2d3136', { sc: '#2d3136', scope: true }), desc: 'Atirador de elite semiautomático.' }),
  W({ id: 'mk12', grp: 'Atiradores designados', name: 'Mk 12 SPR', cal: '5.56', dm: 1.35, delay: .2, mag: 20, reload: 1.8, spread: .012, speed: 1600, range: 1250, len: 35, noise: 560, kick: 1.5, speedMod: .95, snd: 'rifle', rc: 'dmr', price: 1700, shape: SH(8, 19, 6, 14, 2.4, '#2c2f33', { sc: '#2c2f33', scope: true }), desc: 'AR de precisão em 5.56.' }),

  W({ id: 'm14', grp: 'Atiradores designados', name: 'M14 DMR', cal: '.308', dm: 1.37, delay: .32, mag: 10, reload: 2.0, spread: .012, speed: 1900, range: 1400, len: 36, noise: 650, kick: 2.8, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 1200, shape: SH(9, 20, 5.6, 14, 2.4, '#3a2d20', { sc: '#6a4524', scope: true }), desc: 'Semi-auto de longo alcance.' }),
  W({ id: 'sr25', grp: 'Atiradores designados', name: 'SR-25', cal: '6.5', dm: 1.2, delay: .28, mag: 20, reload: 2.1, spread: .01, speed: 2000, range: 1500, len: 36, noise: 640, kick: 2.4, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 1900, shape: SH(9, 20, 5.6, 14, 2.4, '#2d3136', { sc: '#2d3136', scope: true }), desc: '6.5 Creedmoor, rápido e preciso.' }),
  W({ id: 'garand', grp: 'Atiradores designados', name: 'M1 Garand', cal: '.30-06', dm: 1, delay: .25, mag: 8, reload: 1.8, spread: .02, speed: 1800, range: 1300, len: 33, noise: 700, kick: 2.8, speedMod: .94, snd: 'rifle', rc: 'dmr', price: 800, shape: SH(9, 18, 5.4, 14, 2.4, '#3a2d20', { sc: '#6a4524', wood: true }), desc: '8 tiros potentes (.30-06).' }),
  W({ id: 'g43', grp: 'Atiradores designados', name: 'Gewehr 43', cal: '7.92', dm: 1.4, delay: .35, mag: 10, reload: 2.0, spread: .015, speed: 1900, range: 1400, len: 36, noise: 690, kick: 3, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 1300, shape: SH(9, 19, 5.4, 15, 2.4, '#3a2d20', { sc: '#6a4524', wood: true, scope: true }), desc: 'Semi-auto 7.92 com luneta.' }),
  W({ id: 'svd', grp: 'Atiradores designados', name: 'SVD Dragunov', cal: '7.62x54', dm: 1.5, delay: .5, mag: 10, reload: 2.4, spread: .008, speed: 2200, range: 1700, len: 40, noise: 700, kick: 3.4, speedMod: .9, snd: 'sniper', rc: 'dmr', price: 1700, shape: SH(9, 20, 5.2, 18, 2.2, '#3a2d20', { sc: '#6a4524', wood: true, scope: true }), desc: 'Alcance e penetração.' }),
  W({ id: 'vss', grp: 'Atiradores designados', name: 'VSS Vintorez', cal: '9x39', dm: 1.33, delay: .13, mag: 20, reload: 1.9, spread: .02, speed: 900, range: 900, len: 34, noise: 230, kick: 1.2, sup: true, speedMod: .97, snd: 'smg', rc: 'gun', price: 1900, shape: SH(8, 18, 5.4, 10, 3.6, '#2d3a2a', { sc: '#2d3a2a', scope: true, sup: true }), desc: 'Silenciado, subsônico, preciso.' }),

  W({ id: 'm110', grp: 'Atiradores designados', name: 'M110 SASS', cal: '.308', dm: 1.45, delay: .26, mag: 20, reload: 2.1, spread: .008, speed: 2000, range: 1500, len: 36, noise: 650, kick: 2.4, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 2300, shape: SH(9, 20, 6.2, 14, 2.5, '#2d3136', { sc: '#2d3136', scope: true }), desc: 'DMR semi-auto com luneta.' }),
  W({ id: 'ebr', grp: 'Atiradores designados', name: 'Mk 14 EBR', cal: '.308', dm: 1.1, delay: .13, mag: 20, reload: 2.0, spread: .03, speed: 1750, range: 1300, len: 36, noise: 650, kick: 2.8, speedMod: .93, snd: 'rifle', rc: 'gun', price: 2100, shape: SH(9, 20, 5.8, 14, 2.4, '#2d3136', { sc: '#33363a', scope: true }), desc: 'Seleção de fogo em .308.' }),
  W({ id: 'g28', grp: 'Atiradores designados', name: 'HK G28', cal: '.308', dm: 1.4, delay: .27, mag: 20, reload: 2.0, spread: .009, speed: 2000, range: 1500, len: 36, noise: 640, kick: 2.3, speedMod: .93, snd: 'rifle', rc: 'dmr', price: 2500, shape: SH(9, 20, 6.2, 14, 2.4, '#3a3d40', { sc: '#3a3d40', scope: true }), desc: 'Preciso e controlável.' }),
  W({ id: 'mini14', grp: 'Atiradores designados', name: 'Ruger Mini-14', cal: '5.56', dm: 1.2, delay: .18, mag: 20, reload: 1.8, spread: .02, speed: 1500, range: 1100, len: 34, noise: 520, kick: 1.5, speedMod: .97, snd: 'rifle', rc: 'dmr', price: 700, shape: SH(9, 17, 5, 13, 2.2, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Semi-auto leve em 5.56.' }),

  W({ id: 'trg42', grp: 'Snipers', name: 'Sako TRG-42', cal: '.338', dm: 1.05, delay: 1.3, mag: 5, reload: 2.2, spread: .001, speed: 3000, range: 2000, len: 42, noise: 800, kick: 5, push: 1, ap: .1, speedMod: .88, snd: 'sniper', rc: 'snp', price: 3000, shape: SH(9, 17, 6, 25, 2.4, '#3a3d40', { sc: '#3a3d40', scope: true }), desc: '.338 Lapua: atravessa paredes de casa e de prédio.' }),
  W({ id: 'l96', grp: 'Snipers', name: 'AI L96', cal: '.308', dm: 2.0, delay: .85, mag: 10, reload: 2.2, spread: .003, speed: 2400, range: 1800, len: 41, noise: 740, kick: 3.5, push: 1, speedMod: .91, snd: 'sniper', rc: 'snp', price: 1600, shape: SH(9, 17, 5.6, 22, 2.4, '#34402f', { sc: '#2d3a2a', scope: true }), desc: 'Ferrolho .308 com pente de 10.' }),
  W({ id: 'sv98', grp: 'Snipers', name: 'SV-98', cal: '7.62x54', dm: 1.4, delay: .9, mag: 10, reload: 2.2, spread: .003, speed: 2300, range: 1750, len: 42, noise: 740, kick: 3.6, push: 1, speedMod: .91, snd: 'sniper', rc: 'snp', price: 1500, shape: SH(9, 17, 5.6, 24, 2.4, '#2d3a2a', { sc: '#2d3a2a', scope: true }), desc: '7.62×54R com pente de 10.' }),
  W({ id: 'cz550', grp: 'Snipers', name: 'CZ 550 .375', cal: '.375', dm: 1, delay: 1.0, mag: 5, reload: .55, reloadType: 'shell', spread: .004, speed: 2300, range: 1700, len: 40, noise: 760, kick: 5, push: 1.5, ap: .2, speedMod: .9, snd: 'sniper', rc: 'snp', price: 1800, shape: SH(9, 17, 5.4, 22, 2.6, '#3a2d20', { sc: '#6a4524', wood: true, scope: true }), desc: '.375 H&H: atravessa paredes de casa.' }),
  W({ id: 'm99', grp: 'Snipers', name: 'Barrett M99', cal: '.416', dm: 1, delay: 1.5, mag: 5, reload: 2.8, spread: 0, speed: 3300, range: 2200, len: 46, noise: 900, kick: 7, push: 3, ap: .3, breaks: true, speedMod: .82, snd: 'sniper', rc: 'snp', price: 3600, shape: SH(10, 22, 6.4, 24, 3.2, '#4a4a40', { sc: '#3a3a30', scope: true }), desc: '.416: atravessa paredes de prédio e quebra obstáculos.' }),
  W({ id: 'ptrs', grp: 'Snipers', name: 'PTRS-41', cal: '14.5', dm: 1, delay: 1.0, mag: 5, reload: 3.2, spread: .004, speed: 3400, range: 2100, len: 52, noise: 980, kick: 8.5, push: 4, ap: .5, breaks: true, speedMod: .75, snd: 'sniper', rc: 'snp', price: 3800, shape: SH(10, 22, 6, 28, 3.6, '#3a3a30', { sc: '#3a3a30' }), desc: 'Antimaterial 14.5×114: perfura quase tudo.' }),

  W({ id: 'l115', grp: 'Snipers', name: 'AI L115A3', cal: '.338', dm: 1.1, delay: 1.15, mag: 5, reload: 2.2, spread: .001, speed: 3000, range: 2000, len: 42, noise: 800, kick: 5, push: 1, ap: .1, speedMod: .88, snd: 'sniper', rc: 'snp', price: 2800, shape: SH(9, 17, 6, 25, 2.4, '#34402f', { sc: '#2d3a2a', scope: true }), desc: 'Sniper britânico em .338.' }),
  W({ id: 'hecate', grp: 'Snipers', name: 'PGM Hécate II', cal: '.50BMG', dm: 1.1, delay: 1.0, mag: 7, reload: 3.2, spread: .003, speed: 3400, range: 2200, len: 47, noise: 960, kick: 7.5, push: 3, ap: .4, breaks: true, speedMod: .78, snd: 'sniper', rc: 'snp', price: 3400, shape: SH(10, 22, 6.6, 24, 3.6, '#3a3a30', { sc: '#3a3a30', scope: true }), desc: 'Antimaterial de ferrolho com pente de 7.' }),
  W({ id: 'xm2010', grp: 'Snipers', name: 'XM2010', cal: '.300WM', dm: 1.2, delay: 1.0, mag: 5, reload: 2.2, spread: .002, speed: 2900, range: 2000, len: 41, noise: 780, kick: 4.4, push: 1.2, ap: .3, speedMod: .9, snd: 'sniper', rc: 'snp', price: 2600, shape: SH(9, 17, 5.8, 24, 2.4, '#5a5238', { sc: '#4a4430', scope: true }), desc: '.300 Win Mag: atravessa paredes de casa.' }),
  W({ id: 'enfield', grp: 'Snipers', name: 'Lee-Enfield', cal: '.308', dm: 1.7, delay: .7, mag: 10, reload: 2.2, spread: .006, speed: 2200, range: 1700, len: 41, noise: 740, kick: 3.4, push: 1, speedMod: .92, snd: 'sniper', rc: 'snp', price: 650, shape: SH(9, 17, 5, 22, 2.2, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Ferrolho rápido de 10 tiros.' }),

  /* ===== PRIMÁRIAS: metralhadoras ===== */
  W({ id: 'm249', grp: 'Metralhadoras', name: 'M249 SAW', cal: '5.56', dm: .85, delay: .075, mag: 100, reload: 4.0, spread: .09, speed: 1200, range: 850, len: 35, noise: 560, kick: 1.5, speedMod: .84, snd: 'rifle', rc: 'lmg', price: 1800, shape: SH(9, 18, 7, 16, 3, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Pente de 100. Pesada.' }),
  W({ id: 'rpk', grp: 'Metralhadoras', name: 'RPK-74', cal: '5.45', dm: .95, delay: .09, mag: 75, reload: 3.4, spread: .08, speed: 1300, range: 880, len: 36, noise: 560, kick: 1.5, speedMod: .88, snd: 'rifle', rc: 'lmg', price: 1500, shape: SH(8, 18, 5.6, 18, 2.8, '#2d2a24', { sc: '#5a3a1c', wood: true, mag: true }), desc: 'Metralhadora leve com tambor.' }),
  W({ id: 'pkm', grp: 'Metralhadoras', name: 'PKM', cal: '7.62x54', dm: .5, delay: .09, mag: 100, reload: 4.6, spread: .1, speed: 1350, range: 900, len: 36, noise: 640, kick: 2.2, speedMod: .8, snd: 'rifle', rc: 'ak', price: 2200, shape: SH(9, 20, 7, 16, 3, '#3a3a2a', { sc: '#4a3a2a', mag: true }), desc: 'Fogo de supressão pesado.' }),
  W({ id: 'm60', grp: 'Metralhadoras', name: 'M60', cal: '.308', dm: .75, delay: .1, mag: 100, reload: 4.8, spread: .1, speed: 1400, range: 950, len: 37, noise: 660, kick: 2.3, speedMod: .78, snd: 'rifle', rc: 'ak', price: 2000, shape: SH(9, 20, 7, 17, 3, '#2a2d2a', { sc: '#3a3a2a', mag: true }), desc: '.308 cadenciado e pesado.' }),
  W({ id: 'mg42', grp: 'Metralhadoras', name: 'MG42', cal: '7.92', dm: .55, delay: .048, mag: 50, reload: 3.8, spread: .12, speed: 1300, range: 850, len: 36, noise: 680, kick: 1.4, speedMod: .8, snd: 'rifle', rc: 'lmg', price: 2800, shape: SH(9, 20, 7, 17, 3, '#3a3a30', { sc: '#3a3a30', mag: true }), desc: 'Cadência absurda.' }),

  W({ id: 'mg3', grp: 'Metralhadoras', name: 'MG3', cal: '.308', dm: .55, delay: .055, mag: 120, reload: 5, spread: .11, speed: 1400, range: 900, len: 37, noise: 700, kick: 1.8, speedMod: .78, snd: 'rifle', rc: 'lmg', price: 2600, shape: SH(9, 20, 7, 17, 3, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Cadência altíssima em .308.' }),
  W({ id: 'negev', grp: 'Metralhadoras', name: 'IWI Negev', cal: '5.56', dm: .8, delay: .07, mag: 150, reload: 5.2, spread: .09, speed: 1250, range: 850, len: 34, noise: 560, kick: 1.3, speedMod: .85, snd: 'rifle', rc: 'lmg', price: 2300, shape: SH(8, 18, 7, 15, 3, '#33363a', { sc: '#33363a', mag: true }), desc: 'Pente de 150 em 5.56.' }),
  W({ id: 'rpd', grp: 'Metralhadoras', name: 'RPD', cal: '7.62x39', dm: .75, delay: .09, mag: 100, reload: 4.4, spread: .09, speed: 1250, range: 850, len: 35, noise: 600, kick: 1.6, speedMod: .86, snd: 'rifle', rc: 'lmg', price: 1500, shape: SH(8, 18, 6.4, 15, 2.8, '#3a2d20', { sc: '#6a4524', wood: true, mag: true }), desc: 'Metralhadora leve de fita.' }),
  W({ id: 'bren', grp: 'Metralhadoras', name: 'Bren', cal: '.308', dm: .8, delay: .11, mag: 30, reload: 2.6, spread: .05, speed: 1450, range: 1000, len: 37, noise: 660, kick: 2.2, speedMod: .88, snd: 'rifle', rc: 'dmr', price: 1700, shape: SH(8, 19, 6.4, 17, 2.8, '#3a3a2a', { sc: '#3a3a2a', mag: true }), desc: 'Precisa para uma metralhadora; pente de 30.' }),

  W({ id: 'ultimax', grp: 'Metralhadoras', name: 'Ultimax 100', cal: '5.56', dm: .82, delay: .085, mag: 100, reload: 4.4, spread: .075, speed: 1200, range: 820, len: 34, noise: 540, kick: 1.1, speedMod: .88, snd: 'rifle', rc: 'lmg', price: 1700, shape: SH(8, 17, 7, 15, 2.8, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Leve e controlável, pente de 100.' }),
  W({ id: 'm240', grp: 'Metralhadoras', name: 'M240', cal: '.308', dm: .75, delay: .09, mag: 100, reload: 4.8, spread: .1, speed: 1400, range: 950, len: 38, noise: 660, kick: 2.2, snd: 'rifle', rc: 'ak', price: 2300, shape: SH(9, 20, 7, 18, 3, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Cadência firme em .308.' }),
  W({ id: 'hk21', grp: 'Metralhadoras', name: 'HK21', cal: '.308', dm: .78, delay: .08, mag: 80, reload: 4.2, spread: .09, speed: 1400, range: 900, len: 36, noise: 650, kick: 2, snd: 'rifle', rc: 'lmg', price: 1900, shape: SH(9, 19, 7, 16, 3, '#3a3d40', { sc: '#3a3d40', mag: true }), desc: 'Metralhadora leve alemã.' }),
  W({ id: 'dp27', grp: 'Metralhadoras', name: 'DP-27', cal: '7.62x54', dm: .6, delay: .1, mag: 47, reload: 3.6, spread: .09, speed: 1300, range: 880, len: 37, noise: 660, kick: 1.9, snd: 'rifle', rc: 'lmg', price: 1100, shape: SH(8, 18, 5.6, 16, 2.8, '#3a2d20', { sc: '#6a4524', wood: true, mag: true }), desc: 'Pente de prato com 47 tiros.' }),

  /* ===== PRIMÁRIAS: escopetas (aceitam vários tipos de cartucho: tecla B) ===== */
  W({ id: 'spas', grp: 'Escopetas', name: 'SPAS-12', cal: '12ga', fam: 'g12', pm: 1, dm: 1.15, delay: .85, mag: 6, reload: .5, reloadType: 'shell', spread: .19, speed: 1000, range: 400, len: 32, noise: 560, kick: 4, push: 1.5, speedMod: .95, snd: 'shotgun', rc: 'sg', shape: SH(8, 12, 6, 20, 4, '#2c2f33', { sc: '#5b3b1f', pump: true }), desc: 'Carrega cartucho a cartucho.' }),
  W({ id: 'rem870', grp: 'Escopetas', name: 'Remington 870', cal: '12ga', fam: 'g12', pm: 1, dm: 1.1, delay: .9, mag: 6, reload: .5, reloadType: 'shell', spread: .18, speed: 1000, range: 420, len: 30, noise: 560, kick: 3.8, push: 1.4, speedMod: .96, snd: 'shotgun', rc: 'sg', price: 350, shape: SH(8, 11, 5.6, 19, 3.6, '#2c2f33', { sc: '#6a4524', pump: true, wood: true }), desc: 'Pump clássica e confiável.' }),
  W({ id: 'moss500', grp: 'Escopetas', name: 'Mossberg 500', cal: '12ga', fam: 'g12', pm: 1, dm: 1.1, delay: .85, mag: 8, reload: .5, reloadType: 'shell', spread: .18, speed: 1000, range: 420, len: 31, noise: 560, kick: 3.8, push: 1.4, speedMod: .95, snd: 'shotgun', rc: 'sg', price: 400, shape: SH(8, 12, 5.8, 20, 3.6, '#2a2d30', { sc: '#33363a', pump: true }), desc: 'Pump com 8 cartuchos.' }),
  W({ id: 'm1014', grp: 'Escopetas', name: 'Benelli M4', cal: '12ga', fam: 'g12', pm: 1, dm: 1, delay: .35, mag: 7, reload: .45, reloadType: 'shell', spread: .17, speed: 1000, range: 400, len: 30, noise: 560, kick: 3.5, push: 1.5, speedMod: .95, snd: 'shotgun', rc: 'sg', price: 900, shape: SH(8, 13, 6, 18, 4, '#2c2f33', { sc: '#2c2f33' }), desc: 'Semi-automática.' }),
  W({ id: 'ksg', grp: 'Escopetas', name: 'Kel-Tec KSG', cal: '12ga', fam: 'g12', pm: 1, dm: 1, delay: .75, mag: 14, reload: .5, reloadType: 'shell', spread: .18, speed: 1000, range: 400, len: 28, noise: 560, kick: 3.5, push: 1.5, speedMod: .96, snd: 'shotgun', rc: 'sg', price: 1000, shape: SH(2, 18, 7, 12, 4, '#33363a', { sc: '#33363a', pump: true }), desc: 'Dois tubos, 14 cartuchos.' }),
  W({ id: 'mossberg', grp: 'Escopetas', name: 'Mossberg 590 Slug', cal: '12ga-slug', fam: 'g12', pm: 1, dm: 1, ap: .2, delay: .8, mag: 6, reload: .5, reloadType: 'shell', spread: .12, speed: 1100, range: 800, len: 32, noise: 600, kick: 4.5, push: 2, speedMod: .95, snd: 'shotgun', rc: 'sg', price: 600, shape: SH(8, 12, 6, 20, 3.4, '#2c2f33', { sc: '#5b3b1f', pump: true }), desc: 'Já vem com slug: alcance e penetração.' }),
  W({ id: 'saiga12', grp: 'Escopetas', name: 'Saiga-12', cal: '12ga', fam: 'g12', pm: 1, dm: 1, delay: .24, mag: 8, reload: 2.4, spread: .17, speed: 1000, range: 400, len: 31, noise: 580, kick: 3.4, push: 1.2, speedMod: .93, snd: 'shotgun', rc: 'gun', price: 1100, shape: SH(8, 17, 6.4, 13, 3.8, '#3a3a2a', { sc: '#4a3a2a', mag: true }), desc: 'Semi-auto com carregador (derruba o pente ao recarregar).' }),
  W({ id: 'usas12', grp: 'Escopetas', name: 'USAS-12', cal: '12ga', fam: 'g12', pm: 1, dm: .95, delay: .16, mag: 10, reload: 2.8, spread: .18, speed: 1000, range: 380, len: 32, noise: 600, kick: 3.2, push: 1.2, speedMod: .88, snd: 'shotgun', rc: 'gun', price: 1700, shape: SH(8, 18, 7, 14, 4, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Automática de combate.' }),
  W({ id: 'striker', grp: 'Escopetas', name: 'Striker', cal: '12ga', fam: 'g12', pm: 1, dm: 1, delay: .22, mag: 12, reload: 3.2, spread: .18, speed: 1000, range: 380, len: 26, noise: 580, kick: 3, push: 1, speedMod: .92, snd: 'shotgun', rc: 'gun', price: 1600, shape: 'revolver', desc: 'Tambor de 12 cartuchos.' }),
  W({ id: 'aa12', grp: 'Escopetas', name: 'AA-12', cal: '12ga', fam: 'g12', pm: .75, dm: .9, delay: .2, mag: 20, reload: 2.6, spread: .17, speed: 1000, range: 380, len: 30, noise: 580, kick: 3, push: 1, speedMod: .9, snd: 'shotgun', rc: 'gun', price: 1500, shape: SH(8, 14, 6.5, 16, 4, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Escopeta automática.' }),
  W({ id: 'dupla', grp: 'Escopetas', name: 'Calibre 12 Dupla', cal: '12ga', fam: 'g12', pm: 1.25, dm: 1.1, delay: .12, mag: 2, reload: 2.2, spread: .2, speed: 950, range: 330, len: 28, noise: 600, kick: 6, push: 3.5, snd: 'shotgun', rc: 'sg', price: 500, shape: 'dupla', desc: 'Dois canos, duas descargas.' }),
  W({ id: 'coach', grp: 'Escopetas', name: 'Coach Gun .20', cal: '20ga', fam: 'g20', pm: 1.3, dm: 1, delay: .14, mag: 2, reload: 2.0, spread: .19, speed: 950, range: 340, len: 26, noise: 560, kick: 5, push: 3, snd: 'shotgun', rc: 'sg', price: 350, shape: 'dupla', desc: 'Dupla leve de calibre 20.' }),
  W({ id: 'canoserrado', grp: 'Escopetas', name: 'Cano Serrado .20', cal: '20ga', fam: 'g20', pm: 2, dm: 1, delay: .1, mag: 2, reload: 2.0, spread: .3, speed: 900, range: 240, len: 18, noise: 580, kick: 5, push: 3, speedMod: 1.02, snd: 'shotgun', rc: 'sg', price: 400, shape: 'dupla', desc: 'Curta, dispersão enorme.' }),
  W({ id: 'ithaca', grp: 'Escopetas', name: 'Ithaca 37 (16GA)', cal: '16ga', fam: 'g16', pm: 1, dm: 1, delay: .8, mag: 4, reload: .5, reloadType: 'shell', spread: .17, speed: 1000, range: 400, len: 30, noise: 540, kick: 3.2, push: 1.2, snd: 'shotgun', rc: 'sg', price: 500, shape: SH(8, 11, 5.6, 19, 3.4, '#2c2f33', { sc: '#6a4524', pump: true, wood: true }), desc: 'Calibre 16, equilibrada.' }),
  W({ id: 'win1887', grp: 'Escopetas', name: 'Winchester 1887 (10GA)', cal: '10ga', fam: 'g10', pm: 1, dm: 1, delay: .8, mag: 5, reload: .6, reloadType: 'shell', spread: .22, speed: 1000, range: 380, len: 32, noise: 640, kick: 6.5, push: 3, speedMod: .9, snd: 'shotgun', rc: 'sg', price: 1300, shape: SH(8, 13, 5.4, 19, 4.4, '#3a3a3a', { sc: '#6a4524', wood: true }), desc: 'Calibre 10: a escopeta mais pesada.' }),
  W({ id: 'tfm410', grp: 'Escopetas', name: 'Pump .410', cal: '.410', fam: 'g410', pm: 1, dm: 1, delay: .7, mag: 5, reload: .45, reloadType: 'shell', spread: .15, speed: 950, range: 380, len: 28, noise: 480, kick: 2, push: .6, snd: 'shotgun', rc: 'sg', price: 300, shape: SH(7, 11, 5, 17, 3, '#2c2f33', { sc: '#6a4524', pump: true }), desc: 'Leve e barata.' }),
  W({ id: 'ks23', grp: 'Escopetas', name: 'KS-23', cal: '23mm', fam: 'g23', pm: 1, dm: 1, delay: 1.1, mag: 3, reload: .7, reloadType: 'shell', spread: .12, speed: 1000, range: 700, len: 32, noise: 800, kick: 8, push: 4, speedMod: .82, breaks: true, snd: 'shotgun', rc: 'sg', price: 2200, shape: SH(8, 14, 7, 18, 5.6, '#3a3a2a', { sc: '#3a3a2a', pump: true }), desc: 'Carabina de 23 mm: quebra portas e blindagem.' }),

  W({ id: 'spas15', grp: 'Escopetas', name: 'SPAS-15', cal: '12ga', fam: 'g12', pm: 1, dm: 1, delay: .3, mag: 6, reload: 2.3, spread: .17, speed: 1000, range: 400, len: 30, noise: 560, kick: 3.4, push: 1.4, speedMod: .94, snd: 'shotgun', rc: 'sg', price: 1300, shape: SH(8, 13, 6, 18, 4, '#2c2f33', { sc: '#2c2f33', mag: true }), desc: 'Semi-auto com carregador.' }),
  W({ id: 'supernova', grp: 'Escopetas', name: 'Benelli Supernova', cal: '12ga', fam: 'g12', pm: 1, dm: 1.05, delay: .8, mag: 4, reload: .5, reloadType: 'shell', spread: .18, speed: 1000, range: 400, len: 30, noise: 560, kick: 3.6, push: 1.4, snd: 'shotgun', rc: 'sg', price: 450, shape: SH(7, 12, 5.8, 19, 3.6, '#2a2d30', { sc: '#33363a', pump: true }), desc: 'Pump moderna e resistente.' }),
  W({ id: 'jackhammer', grp: 'Escopetas', name: 'Pancor Jackhammer', cal: '12ga', fam: 'g12', pm: .85, dm: .95, delay: .17, mag: 10, reload: 2.9, spread: .17, speed: 1000, range: 370, len: 30, noise: 600, kick: 3.2, push: 1.2, speedMod: .9, snd: 'shotgun', rc: 'gun', price: 1900, shape: SH(5, 17, 7, 12, 4, '#2a2d2a', { sc: '#2a2d2a', mag: true }), desc: 'Automática com tambor de 10.' }),

  /* ===== PRIMÁRIAS: snipers e especiais ===== */
  W({ id: 'mosin', grp: 'Snipers', name: 'Mosin-Nagant', cal: '7.62x54', dm: 1.5, delay: 1.0, mag: 5, reload: .6, reloadType: 'shell', spread: .006, speed: 2300, range: 1700, len: 40, noise: 760, kick: 4, push: 1, speedMod: .92, snd: 'sniper', rc: 'snp', price: 450, shape: SH(9, 18, 5, 22, 2.2, '#3a2d20', { sc: '#6a4524', wood: true }), desc: 'Ferrolho barato e potente.' }),
  W({ id: 'r700', grp: 'Snipers', name: 'Remington 700', cal: '.308', dm: 2.2, delay: .9, mag: 5, reload: .55, reloadType: 'shell', spread: .004, speed: 2400, range: 1800, len: 41, noise: 740, kick: 4, push: 1, speedMod: .91, snd: 'sniper', rc: 'snp', price: 700, shape: SH(9, 17, 5.4, 22, 2.4, '#3a3a3a', { sc: '#3a3a3a', scope: true }), desc: 'Ferrolho .308 com luneta.' }),
  W({ id: 'kar98', grp: 'Snipers', name: 'Kar98k', cal: '.30-06', dm: 1.8, delay: .95, mag: 5, reload: .55, reloadType: 'shell', spread: .004, speed: 2600, range: 1800, len: 40, noise: 760, kick: 4.5, push: 1, speedMod: .92, snd: 'sniper', rc: 'snp', price: 900, shape: SH(9, 18, 5, 22, 2.2, '#3a2d20', { sc: '#6a4524', wood: true, scope: true }), desc: 'Ferrolho: cartucho a cartucho.' }),
  W({ id: 'awm', grp: 'Snipers', name: 'AWM', cal: '.338', dm: 1.1, delay: 1.2, mag: 5, reload: 2.3, spread: 0, speed: 3000, range: 2000, len: 41, noise: 800, kick: 5, push: 1, speedMod: .88, snd: 'sniper', rc: 'snp', shape: SH(9, 16, 6, 25, 2.4, '#34402f', { sc: '#2d3a2a', scope: true }), desc: 'Penetra paredes finas. Laser de mira.' }),
  W({ id: 'm200', grp: 'Snipers', name: 'CheyTac M200', cal: '.408', dm: 1, delay: 1.4, mag: 7, reload: 2.6, spread: 0, speed: 3200, range: 2200, len: 44, noise: 880, kick: 6, push: 2, speedMod: .85, snd: 'sniper', rc: 'snp', price: 3200, shape: SH(10, 20, 6, 26, 2.8, '#33363a', { sc: '#33363a', scope: true }), desc: '.408: precisão extrema, atravessa concreto.' }),
  W({ id: 'm82', grp: 'Snipers', name: 'Barrett M82', cal: '.50BMG', dm: 1.15, delay: 1.6, mag: 5, reload: 3.0, spread: 0, speed: 3400, range: 2200, len: 46, noise: 950, kick: 8, push: 3, ap: .4, breaks: true, speedMod: .8, snd: 'sniper', rc: 'snp', price: 2600, shape: SH(10, 22, 6.6, 22, 3.6, '#4a4a40', { sc: '#3a3a30', scope: true }), desc: 'Atravessa quase tudo e quebra caixas.' }),
  W({ id: 'howa', grp: 'Snipers', name: 'Rifle de Caça .243', cal: '.243', dm: 1.6, delay: .85, mag: 5, reload: .55, reloadType: 'shell', spread: .004, speed: 2300, range: 1700, len: 40, noise: 700, kick: 3, push: .8, speedMod: .94, snd: 'sniper', rc: 'snp', price: 500, shape: SH(9, 17, 5.2, 22, 2.2, '#3a3a3a', { sc: '#6a4524', wood: true, scope: true }), desc: 'Leve e rápido de manejar.' }),
  W({ id: 'm24', grp: 'Snipers', name: 'M24 SWS', cal: '.300WM', dm: 1.2, ap: .3, delay: 1.0, mag: 5, reload: .55, reloadType: 'shell', spread: .002, speed: 2800, range: 2000, len: 41, noise: 780, kick: 4.6, push: 1.2, speedMod: .9, snd: 'sniper', rc: 'snp', price: 2400, shape: SH(9, 17, 5.6, 24, 2.4, '#34402f', { sc: '#2d3a2a', scope: true }), desc: '.300 Win Mag: atravessa paredes.' }),
  W({ id: 'winchester', grp: 'Rifles de alavanca', name: 'Winchester 1894', cal: '.44', dm: 1.1, delay: .5, mag: 8, reload: .4, reloadType: 'shell', spread: .02, speed: 1300, range: 1000, len: 30, noise: 560, kick: 2.6, push: .8, snd: 'rifle', rc: 'lvr', price: 700, shape: SH(8, 14, 5, 18, 2.6, '#3a3a3a', { sc: '#6a4524', wood: true }), desc: 'Alavanca rápida, cartucho a cartucho.' }),
  W({ id: 'marlin', grp: 'Rifles de alavanca', name: 'Marlin .45-70', cal: '.45-70', dm: 1, delay: .75, mag: 6, reload: .45, reloadType: 'shell', spread: .025, speed: 1200, range: 900, len: 30, noise: 640, kick: 3.4, push: 1.4, snd: 'rifle', rc: 'lvr', price: 900, shape: SH(8, 14, 5, 17, 2.8, '#3a3a3a', { sc: '#6a4524', wood: true }), desc: 'Alavanca pesada: derruba qualquer um.' }),


  /* ===== PRIMÁRIAS: lançadores e pesadas ===== */
  W({ id: 'rpg', grp: 'Lançadores', name: 'RPG-7', cal: 'rocket', dm: 1, delay: 1.4, mag: 1, reload: 2.4, spread: 0, speed: 560, range: 1100, len: 39, noise: 700, kick: 6, push: 3, speedMod: .85, rocket: true, radius: 125, snd: 'rpg', rc: 'none', shape: 'rpg', att: false, desc: 'Explosão em área. Cuidado!' }),
  W({ id: 'm72', grp: 'Lançadores', name: 'M72 LAW', cal: 'rocket', dm: .85, delay: 1.2, mag: 1, reload: 3.2, spread: 0, speed: 720, range: 1000, len: 34, noise: 680, kick: 4, push: 2, speedMod: .92, rocket: true, radius: 110, snd: 'rpg', rc: 'none', price: 1200, shape: 'rpg', att: false, desc: 'Foguete leve e mais rápido.' }),
  W({ id: 'm79', grp: 'Lançadores', name: 'M79', cal: '40mm', dm: 1, delay: .9, mag: 1, reload: 1.8, spread: 0, speed: 700, range: 900, len: 26, noise: 600, kick: 4, push: 2, speedMod: .92, rocket: true, radius: 85, snd: 'rpg', rc: 'none', price: 1400, shape: 'm79', att: false, desc: 'Lança-granadas leve.' }),
  W({ id: 'mgl', grp: 'Lançadores', name: 'MGL-6', cal: '40mm', dm: .85, delay: .45, mag: 6, reload: 4.0, spread: 0, speed: 650, range: 850, len: 28, noise: 600, kick: 3, push: 1.5, speedMod: .85, rocket: true, radius: 80, snd: 'rpg', rc: 'none', price: 2800, shape: 'mgl', att: false, desc: 'Tambor de 6 granadas.' }),
  W({ id: 'at4', grp: 'Lançadores', name: 'AT4', cal: 'rocket', dm: 1.1, delay: 1.4, mag: 1, reload: 3.4, spread: 0, speed: 700, range: 1100, len: 40, noise: 760, kick: 5, push: 2.5, speedMod: .9, rocket: true, radius: 140, snd: 'rpg', rc: 'none', price: 1600, shape: 'rpg', att: false, desc: 'Antitanque leve: grande raio de explosão.' }),
  W({ id: 'panzerfaust', grp: 'Lançadores', name: 'Panzerfaust 3', cal: 'rocket', dm: 1.25, delay: 1.5, mag: 1, reload: 3.8, spread: 0, speed: 500, range: 950, len: 44, noise: 780, kick: 6, push: 3, speedMod: .85, rocket: true, radius: 150, breaks: true, snd: 'rpg', rc: 'none', price: 2000, shape: 'rpg', att: false, desc: 'Foguete lento, devastador contra paredes.' }),
  W({ id: 'm203', grp: 'Lançadores', name: 'M203 Isolado', cal: '40mm', dm: 1.1, delay: .8, mag: 1, reload: 1.6, spread: 0, speed: 750, range: 950, len: 24, noise: 620, kick: 3.5, push: 1.5, speedMod: .94, rocket: true, radius: 90, snd: 'rpg', rc: 'none', price: 1300, shape: 'm79', att: false, desc: 'Lança-granadas de 40 mm leve.' }),
  W({ id: 'minigun', grp: 'Armas pesadas', name: 'Minigun', cal: '.308', dm: .53, spin: true, delay: .04, mag: 300, reload: 6.5, spread: .12, speed: 1400, range: 800, len: 36, noise: 700, kick: 1, speedMod: .65, snd: 'rifle', rc: 'lmg', price: 3600, shape: 'minigun', att: false, desc: 'Gire o cano; depois vira uma serra.' }),
  W({ id: 'kord', grp: 'Armas pesadas', name: 'Kord 14.5', cal: '14.5', dm: .55, delay: .1, mag: 80, reload: 7, spread: .1, speed: 1700, range: 1100, len: 44, noise: 900, kick: 3, push: 1.5, ap: .3, breaks: true, speedMod: .6, snd: 'sniper', rc: 'lmg', price: 4200, shape: 'minigun', att: false, desc: 'Metralhadora pesada: atravessa paredes. Muito lenta.' }),
  W({ id: 'flame', grp: 'Armas pesadas', name: 'Lança-chamas', cal: 'fuel', dm: 1, flame: true, delay: .045, mag: 100, reload: 3.0, spread: .09, speed: 420, range: 190, len: 30, noise: 400, kick: .3, speedMod: .85, snd: 'flame', rc: 'none', price: 2000, shape: 'flame', att: false, desc: 'Incendeia alvos (dano contínuo).' }),
  W({ id: 'lever3030', grp: 'Rifles de alavanca', name: 'Winchester .30-30', cal: '.30-30', dm: 1, delay: .5, mag: 7, reload: .4, reloadType: 'shell', spread: .02, speed: 1350, range: 1000, len: 30, noise: 580, kick: 2.4, push: .7, snd: 'rifle', rc: 'lvr', price: 600, shape: SH(8, 14, 5, 18, 2.6, '#3a3a3a', { sc: '#6a4524', wood: true }), desc: 'A carabina do velho oeste.' }),

  /* ===== CORPO A CORPO ===== */
  // range/arc em px/rad · swing = duração da animação · back = multiplicador de golpe pelas costas
  W({ id: 'knife', slot: 'melee', grp: 'Corpo a corpo', name: 'Faca Tática', melee: true, dmg: 38, range: 34, arc: 1.2, delay: .38, swing: .2, back: 4, len: 16, noise: 0, speedMod: 1.06, price: 0, shape: 'knife', att: false, desc: 'Rápida e silenciosa. Golpe pelas costas mata.' }),
  W({ id: 'knuckles', slot: 'melee', grp: 'Corpo a corpo', name: 'Soco Inglês', melee: true, dmg: 24, range: 26, arc: 1.0, delay: .22, swing: .13, back: 2.5, stun: .6, len: 8, noise: 30, speedMod: 1.05, price: 200, shape: 'knuckles', att: false, desc: 'Muito rápido; atordoa.' }),
  W({ id: 'baton', slot: 'melee', grp: 'Corpo a corpo', name: 'Cassetete', melee: true, dmg: 28, range: 36, arc: 1.2, delay: .4, swing: .2, back: 3, stun: 1.2, knock: 120, len: 22, noise: 40, speedMod: 1.03, price: 250, shape: 'bat', att: false, desc: 'Atordoa quem acerta.' }),
  W({ id: 'machete', slot: 'melee', grp: 'Corpo a corpo', name: 'Facão', melee: true, dmg: 55, range: 40, arc: 1.7, delay: .55, swing: .26, back: 4, sweep: true, len: 28, noise: 60, price: 400, shape: 'machete', att: false, desc: 'Golpe em arco que atinge vários.' }),
  W({ id: 'bat', slot: 'melee', grp: 'Corpo a corpo', name: 'Taco de Beisebol', melee: true, dmg: 34, range: 42, arc: 1.6, delay: .6, swing: .28, back: 3, stun: 1.4, knock: 260, len: 30, noise: 70, price: 300, shape: 'bat', att: false, desc: 'Empurra e atordoa.' }),
  W({ id: 'crowbar', slot: 'melee', grp: 'Corpo a corpo', name: 'Pé de Cabra', melee: true, dmg: 46, range: 38, arc: 1.2, delay: .55, swing: .24, back: 3.5, breaks: true, len: 26, noise: 80, price: 500, shape: 'crowbar', att: false, desc: 'Quebra caixas, portas e janelas.' }),
  W({ id: 'tomahawk', slot: 'melee', grp: 'Corpo a corpo', name: 'Machadinha', melee: true, dmg: 72, range: 38, arc: 1.1, delay: .7, swing: .3, back: 4, breaks: true, len: 24, noise: 70, price: 700, shape: 'axe', att: false, desc: 'Dano alto e quebra obstáculos.' }),
  W({ id: 'spear', slot: 'melee', grp: 'Corpo a corpo', name: 'Lança', melee: true, dmg: 58, range: 58, arc: .7, delay: .6, swing: .22, back: 4, len: 44, noise: 40, speedMod: 1, price: 900, shape: 'katana', att: false, desc: 'Longo alcance, golpe estreito.' }),
  W({ id: 'fireaxe', slot: 'melee', grp: 'Corpo a corpo', name: 'Machado de Bombeiro', melee: true, dmg: 90, range: 40, arc: 1.4, delay: .85, swing: .32, back: 4, breaks: true, knock: 200, len: 30, noise: 90, speedMod: .96, price: 1000, shape: 'axe', att: false, desc: 'Pesado: quebra portas e caixas.' }),
  W({ id: 'kukri', slot: 'melee', grp: 'Corpo a corpo', name: 'Kukri', melee: true, dmg: 52, range: 36, arc: 1.5, delay: .46, swing: .22, back: 5, sweep: true, len: 22, noise: 50, speedMod: 1.04, price: 600, shape: 'machete', att: false, desc: 'Lâmina curva, rápida e letal.' }),
  W({ id: 'mace', slot: 'melee', grp: 'Corpo a corpo', name: 'Maça', melee: true, dmg: 76, range: 38, arc: 1.4, delay: .8, swing: .3, back: 3, stun: 1.8, knock: 280, len: 28, noise: 100, speedMod: .94, price: 800, shape: 'sledge', att: false, desc: 'Atordoa e empurra.' }),
  W({ id: 'katana', slot: 'melee', grp: 'Corpo a corpo', name: 'Katana', melee: true, dmg: 64, range: 48, arc: 1.9, delay: .42, swing: .22, back: 5, sweep: true, len: 36, noise: 50, speedMod: 1.03, price: 1800, shape: 'katana', att: false, desc: 'Longa, rápida e letal.' }),
  W({ id: 'sledge', slot: 'melee', grp: 'Corpo a corpo', name: 'Marreta', melee: true, dmg: 130, range: 44, arc: 1.5, delay: 1.1, swing: .4, back: 3, breaks: true, knock: 320, stun: 1.6, len: 34, noise: 120, speedMod: .9, price: 1200, shape: 'sledge', att: false, desc: 'Devastadora e lenta.' }),
];
// tempo para sacar/equipar a arma ao trocar (s)
const EQUIP = { 'Pistolas': .35, 'Pistolas automáticas': .4, 'Revólveres': .45, 'Submetralhadoras': .5, 'Fuzis de assalto': .65, 'Fuzis de batalha': .8, 'Atiradores designados': .85, 'Metralhadoras': 1.2, 'Escopetas': .7, 'Snipers': 1.1, 'Rifles de alavanca': .6, 'Lançadores': 1.2, 'Armas pesadas': 1.8, 'Corpo a corpo': .25 };
// peso (kg) por categoria; algumas armas têm peso próprio
const WKG_GRP = { 'Pistolas': .9, 'Pistolas automáticas': 1.3, 'Revólveres': 1.2, 'Submetralhadoras': 2.9, 'Fuzis de assalto': 3.5, 'Fuzis de batalha': 4.5, 'Atiradores designados': 5.2, 'Metralhadoras': 8, 'Escopetas': 3.4, 'Snipers': 6, 'Rifles de alavanca': 3.2, 'Lançadores': 6.5, 'Armas pesadas': 16, 'Corpo a corpo': .5 };
const WKG_OVR = { minigun: 21, kord: 28, ptrs: 17, m82: 14, m99: 12.5, m200: 14, awm: 7, mg42: 11.5, m249: 7.5, pkm: 8.4, m60: 10.5, mg3: 11.5, negev: 7.5, rpd: 7, bren: 10, flame: 15, rpg: 6.3, m72: 2.5, m79: 2.7, mgl: 5.3,
  mp7: 1.9, p90: 2.6, mp9: 1.4, vector: 2.7, mp5: 2.5, uzi: 3.5, knife: .35, knuckles: .2, baton: .5, machete: .8, bat: 1, crowbar: 1.6, tomahawk: .9, katana: 1.1, sledge: 5.5, dupla: 3.2, coach: 2.8, canoserrado: 1.8, ks23: 4.2, win1887: 3.8 };
WEAPONS.forEach(w => { w.kg = WKG_OVR[w.id] != null ? WKG_OVR[w.id] : +(WKG_GRP[w.grp] * Math.min(1.25, Math.max(.9, .8 + (w.len || 25) / 120))).toFixed(1); });
WEAPONS.forEach(w => {
  w.eq = EQUIP[w.grp] || .6;
  if (!w.melee) {
    w.dmg = Math.round(CALIBERS[w.cal].dmg * w.dm);
    if (w.fam) { w.sp0 = w.spread; w.pellets = Math.max(1, Math.round(CALIBERS[w.cal].pel * (w.pm || 1))); w.spread = w.sp0 * CALIBERS[w.cal].sf; }
  }
  w.rcv = RC[w.rc] || RC.none;
});
const SHELL_FAMILIES = {};
for (const c in CALIBERS) if (CALIBERS[c].fam) (SHELL_FAMILIES[CALIBERS[c].fam] = SHELL_FAMILIES[CALIBERS[c].fam] || []).push(c);
const WMAP = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const WSLOT = { primary: 0, secondary: 1, melee: 2 };

/* ---------- Acessórios (cano, parte superior, parte inferior) ---------- */
const ATT_SLOTS = { muzzle: 'Boca do cano', top: 'Parte superior', under: 'Parte inferior' };
const ATTACH = [
  { id: 'a_sup',    slot: 'muzzle', name: 'Silenciador',           price: 600, mod: { noise: .45, dmg: .93, range: .9, sup: 1 }, desc: 'Abafa bastante o disparo (ainda se ouve), mas perde dano e alcance.' },
  { id: 'a_flash',  slot: 'muzzle', name: 'Quebra-Chamas',         price: 250, mod: { flash: .3, noise: .9 }, desc: 'Esconde o clarão do disparo e abafa um pouco o estampido.' },
  { id: 'a_comp',   slot: 'muzzle', name: 'Compensador',           price: 350, mod: { rcStep: .75, rcMax: .85, noise: 1.12 }, desc: 'Reduz o recuo, mas o estampido fica mais estalado e alto.' },
  { id: 'a_brake',  slot: 'muzzle', name: 'Freio de Boca',         price: 400, mod: { kick: .7, push: .6, rcStep: .88, noise: 1.2 }, desc: 'Menos coice e empurrão; o disparo fica bem mais alto.' },
  { id: 'a_long',   slot: 'muzzle', name: 'Cano Longo',            price: 700, mod: { range: 1.2, speed: 1.12, dmg: 1.06, spread: .9, speedMod: -.04, noise: .93 }, desc: 'Mais alcance, dano e precisão; mais pesado e com som mais grave.' },
  { id: 'a_choke',  slot: 'muzzle', name: 'Choke Fechado',         price: 300, mod: { spread: .6, range: 1.15 }, only: 'shotgun', desc: 'Concentra o chumbo da escopeta.' },
  { id: 'a_red',    slot: 'top',    name: 'Mira Red Dot',          price: 300, mod: { spread: .88 }, desc: 'Mira rápida e precisa.' },
  { id: 'a_holo',   slot: 'top',    name: 'Mira Holográfica',      price: 450, mod: { spread: .85, rcStep: .95 }, desc: 'Boa precisão e leve estabilidade.' },
  { id: 'a_scope3', slot: 'top',    name: 'Luneta 3x',             price: 700, mod: { spread: .78, look: 1.5, speedMod: -.02 }, desc: 'A câmera avança mais para onde você mira.' },
  { id: 'a_scope6', slot: 'top',    name: 'Luneta 6x',             price: 1100, mod: { spread: .65, look: 2.4, speedMod: -.05 }, desc: 'Visão de longo alcance.' },
  { id: 'a_thermal',slot: 'top',    name: 'Mira Térmica',          price: 1800, mod: { spread: .85, look: 1.3, thermalR: 320 }, desc: 'Mostra inimigos quentes ao redor.' },
  { id: 'a_grip',   slot: 'under',  name: 'Empunhadura Vertical',  price: 300, mod: { rcStep: .82, rcMax: .9 }, desc: 'Controla o recuo.' },
  { id: 'a_angled', slot: 'under',  name: 'Empunhadura Angular',   price: 300, mod: { rcStep: .92, reload: .92, speedMod: .01 }, desc: 'Recarga e manejo mais rápidos.' },
  { id: 'a_laser',  slot: 'under',  name: 'Laser',                 price: 350, mod: { spread: .9, moveSpread: .7, laser: 1 }, desc: 'Precisão em movimento; mostra o laser.' },
  { id: 'a_light',  slot: 'under',  name: 'Lanterna',              price: 350, mod: { light: 1 }, desc: 'Ilumina um cone à frente no escuro.' },
  { id: 'a_bipod',  slot: 'under',  name: 'Bipé',                  price: 500, mod: { bipod: 1 }, desc: 'Recuo menor quando parado.' },
];
const AMAP = Object.fromEntries(ATTACH.map(a => [a.id, a]));
const PISTOL_NO = ['a_scope3', 'a_scope6', 'a_long', 'a_bipod', 'a_thermal', 'a_grip', 'a_angled'];
const attachOk = (w, a) => !!w.att && (!a.only || w.pellets > 1) && !(w.slot === 'secondary' && PISTOL_NO.includes(a.id));

// estatísticas efetivas de uma arma com seus acessórios (e o tipo de cartucho carregado, nas escopetas)
function effW(id, cal) {
  const w = WMAP[id], e = Object.assign({}, w);
  e.base = w; e.look = 1; e.flashMul = 1; e.thermalR = 0; e.moveSpread = 1; e.fragR = 0; e.inc = false; e.stunS = 0; e.muzzle = null;
  if (w.melee) return e;
  let bd = w.dmg, bs = w.spread;
  if (w.fam) {
    const c = cal && SHELL_FAMILIES[w.fam].includes(cal) ? cal : w.cal, C = CALIBERS[c];
    e.cal = c; e.pellets = Math.max(1, Math.round(C.pel * (w.pm || 1)));
    bd = Math.round(C.dmg * w.dm); bs = w.sp0 * C.sf;
    e.fragR = C.frag || 0; e.inc = !!C.inc; e.stunS = C.stun || 0;
  }
  const at = (LD.attach && LD.attach[id]) || {};
  const m = { noise: 1, dmg: 1, range: 1, speed: 1, spread: 1, kick: 1, push: 1, rcStep: 1, rcMax: 1, reload: 1, look: 1, flash: 1, moveSpread: 1 };
  for (const s of ['muzzle', 'top', 'under']) {
    const a = at[s] && AMAP[at[s]];
    if (!a || !attachOk(w, a)) continue;
    if (s === 'muzzle') e.muzzle = a.id;
    for (const k in a.mod) {
      if (k === 'speedMod') e.speedMod += a.mod[k];
      else if (k === 'sup' || k === 'laser' || k === 'light' || k === 'bipod') e[k] = true;
      else if (k === 'thermalR') e.thermalR = Math.max(e.thermalR, a.mod[k]);
      else m[k] *= a.mod[k];
    }
  }
  e.dmg = Math.round(bd * m.dmg); e.noise = w.noise * m.noise; e.range = w.range * m.range; e.speed = w.speed * m.speed;
  e.spread = bs * m.spread; e.kick = w.kick * m.kick; e.push = w.push * m.push; e.reload = w.reload * m.reload;
  e.rcv = [w.rcv[0] * m.rcStep, w.rcv[1] * m.rcMax, w.rcv[2], w.rcv[3]];
  e.look = m.look; e.flashMul = m.flash; e.moveSpread = m.moveSpread;
  e.sup = !!(w.sup || e.sup);
  return e;
}

/* ---------- Itens arremessáveis ---------- */
const THROWABLES = [
  { id: 'frag',    name: 'Granada de Fragmentação', short: 'Frag',     icon: '💣', fuse: 1.8, desc: 'Explosão em área.' },
  { id: 'flash',   name: 'Granada Atordoante',      short: 'Atordoante', icon: '⚡', fuse: 1.3, desc: 'Cega e atordoa quem está por perto.' },
  { id: 'smoke',   name: 'Granada de Fumaça',       short: 'Fumaça',   icon: '☁️', fuse: .8,  desc: 'Bloqueia a linha de visão por 14 s.' },
  { id: 'molotov', name: 'Coquetel Molotov',        short: 'Molotov',  icon: '🔥', fuse: .9,  desc: 'Cria uma poça de fogo.' },
  { id: 'flare',   name: 'Sinalizador',             short: 'Sinalizador', icon: '🔆', fuse: .7, desc: 'Ilumina uma área por 25 s.' },
  { id: 'mine',    name: 'Mina Claymore',           short: 'Mina',     icon: '⛓️', fuse: 0,   desc: 'Plante: explode quando inimigos passam.' },
];
const TMAP = Object.fromEntries(THROWABLES.map(t => [t.id, t]));

/* ---------- Equipamentos de proteção e utilidades ---------- */
// cls = classe de blindagem: projéteis com penetração menor são totalmente absorvidos
const GEAR = [
  { id: 'h_light',  slot: 'head', name: 'Capacete Leve',      abs: .2,  dur: 40,  cls: 1.5, w: 0,    price: 150,  desc: 'Absorve 20%. Classe 1.5.' },
  { id: 'h_mich',   slot: 'head', name: 'Capacete Balístico', abs: .35, dur: 80,  cls: 2.5, w: .01,  price: 500,  desc: 'Absorve 35%. Classe 2.5.' },
  { id: 'h_heavy',  slot: 'head', name: 'Capacete Pesado',    abs: .5,  dur: 130, cls: 3.5, w: .03,  price: 1100, desc: 'Absorve 50%. Classe 3.5.' },
  { id: 'v_light',  slot: 'body', name: 'Colete Leve',        abs: .3,  dur: 60,  cls: 1.5, w: .02,  price: 0,    desc: 'Absorve 30%. Classe 1.5.' },
  { id: 'v_med',    slot: 'body', name: 'Colete Tático',      abs: .45, dur: 110, cls: 2.5, w: .04,  price: 600,  desc: 'Absorve 45%. Classe 2.5.' },
  { id: 'v_heavy',  slot: 'body', name: 'Colete Pesado',      abs: .6,  dur: 180, cls: 3.5, w: .08,  price: 1400, desc: 'Absorve 60%. Classe 3.5.' },
  { id: 'v_plate',  slot: 'body', name: 'Placa de Cerâmica',  abs: .72, dur: 260, cls: 4.8, w: .12,  price: 2600, desc: 'Absorve 72%. Classe 4.8. Pesada.' },
  { id: 'b_tac',    slot: 'legs', name: 'Botas Táticas',      spd: .06, price: 300,  desc: '+6% de velocidade.' },
  { id: 'b_run',    slot: 'legs', name: 'Botas de Corrida',   spd: .12, price: 800,  desc: '+12% de velocidade.' },
  { id: 'h_cap',     slot: 'head', name: 'Boné Tático',        abs: .06, dur: 15,  cls: .8,  price: 80,   col: '#3b4a2a', desc: 'Quase sem proteção, mas não pesa nada.' },
  { id: 'h_pasgt',   slot: 'head', name: 'Capacete PASGT',     abs: .3,  dur: 70,  cls: 2,   price: 380,  col: '#55603f', desc: 'Kevlar clássico. Absorve 30%. Classe 2.' },
  { id: 'h_ops',     slot: 'head', name: 'Capacete Ops-Core',  abs: .4,  dur: 95,  cls: 2.8, price: 750,  col: '#6a5d45', desc: 'Leve e de corte alto. Absorve 40%. Classe 2.8.' },
  { id: 'h_riot',    slot: 'head', name: 'Capacete Antitumulto', abs: .45, dur: 120, cls: 2.2, price: 700, col: '#1e2a3a', face: 1, desc: 'Viseira protege o rosto e os olhos. Absorve 45%.' },
  { id: 'h_ceramic', slot: 'head', name: 'Capacete Cerâmico',  abs: .58, dur: 150, cls: 4.2, price: 1700, col: '#6d7377', desc: 'Placas cerâmicas. Absorve 58%. Classe 4.2.' },
  { id: 'h_eod',     slot: 'head', name: 'Capacete EOD',       abs: .65, dur: 220, cls: 4.6, price: 2800, col: '#3a3a3a', face: 1, blast: .5, desc: 'Rosto protegido e -50% de dano de explosão na cabeça.' },
  { id: 'v_conc',    slot: 'body', name: 'Colete Dissimulado', abs: .18, dur: 40,  cls: 1.2, price: 200,  col: '#20252b', desc: 'Fino e silencioso. Absorve 18%.' },
  { id: 'v_assault', slot: 'body', name: 'Colete de Assalto',  abs: .55, dur: 160, cls: 3.2, price: 1200, col: '#6a4f3a', cons: 1, desc: 'Bolsos extras: +1 suprimento. Absorve 55%.' },
  { id: 'v_iiia',    slot: 'body', name: 'Colete Nível IIIA',  abs: .5,  dur: 130, cls: 3,   price: 900,  col: '#3d4a52', desc: 'Para armas curtas e médias. Absorve 50%.' },
  { id: 'v_carrier', slot: 'body', name: 'Porta-Placas',       abs: .66, dur: 220, cls: 4.2, price: 2000, col: '#5b5a3c', cons: 1, desc: 'Placas frontais e traseiras. Absorve 66%.' },
  { id: 'v_eod',     slot: 'body', name: 'Traje Antibomba',    abs: .7,  dur: 300, cls: 3.8, price: 3200, col: '#3d4a3a', blast: .6, desc: 'Muito pesado. -60% de dano de explosão.' },
  { id: 'v_iv',      slot: 'body', name: 'Placa Nível IV',     abs: .8,  dur: 320, cls: 5.5, price: 3600, col: '#a0a6ad', desc: 'Para fuzis. Absorve 80%. Extremamente pesada.' },
  { id: 'b_work',    slot: 'legs', name: 'Coturno Militar',    spd: .03, legAbs: .1, price: 200,  col: '#2e2218', desc: '+3% de velocidade e -10% de dano nas pernas.' },
  { id: 'b_steel',   slot: 'legs', name: 'Botas Reforçadas',   spd: -.02, legAbs: .3, price: 700, col: '#4b4b4f', desc: '-30% de dano nas pernas e ossos mais resistentes.' },
  { id: 'b_sprint',  slot: 'legs', name: 'Tênis de Atleta',    spd: .18, price: 1500, col: '#e8d233', desc: '+18% de velocidade.' },
  { id: 'b_exo',     slot: 'legs', name: 'Botas Hidráulicas',  spd: .24, legAbs: .15, price: 2800, col: '#2f6f9f', desc: '+24% de velocidade e -15% de dano nas pernas.' },
  { id: 'e_goggle',  slot: 'eyes', name: 'Óculos Balísticos',  vis: 0, protEye: 1, flashRes: .55, price: 250, col: '#c9d6df', desc: 'Protegem os olhos de estilhaços e reduzem o clarão da atordoante.' },
  { id: 'bino',      slot: 'eyes', name: 'Binóculos',          vis: 120, mode: 'zoom', zoom: 2.4, price: 500, col: '#2a2d31', desc: 'Tecla N: enxerga bem mais longe na direção da mira.' },
  { id: 'th_lite',   slot: 'eyes', name: 'Térmica Compacta',   vis: 40, mode: 'th', thermal: 260, price: 1200, col: '#ff9a3a', desc: 'Visão térmica de curto alcance (tecla N).' },
  { id: 'nvg3',      slot: 'eyes', name: 'Óculos Noturnos Gen3', vis: 260, mode: 'nv', price: 1500, col: '#7dff9a', desc: 'Visão noturna de alta qualidade (+260 de alcance).' },
  { id: 'hybrid',    slot: 'eyes', name: 'Visor Híbrido',      vis: 200, mode: 'nv', thermal: 220, price: 2600, col: '#b4ff7d', desc: 'Visão noturna com detecção térmica por perto (tecla N).' },
  { id: 'r_pulse',  slot: 'radio', name: 'Rádio de Pulso',      radioRange: 450,   radioCh: 4,  price: 0,    desc: 'Curto alcance e só 4 canais. Leve.' },
  { id: 'r_walkie', slot: 'radio', name: 'Walkie-Talkie',       radioRange: 900,   radioCh: 8,  price: 400,  desc: 'Alcance médio e 8 canais.' },
  { id: 'r_tac',    slot: 'radio', name: 'Rádio Tático',        radioRange: 1800,  radioCh: 16, price: 900,  desc: 'Bom alcance e 16 canais.' },
  { id: 'r_vhf',    slot: 'radio', name: 'Rádio VHF de Mochila', radioRange: 3600, radioCh: 40, price: 1800, desc: 'Longo alcance e 40 canais. Pesado.' },
  { id: 'r_sat',    slot: 'radio', name: 'Rádio Satelital',     radioRange: 99999, radioCh: 99, price: 3200, desc: 'Alcance do mapa inteiro e 99 canais.' },
  { id: 'bp_s',     slot: 'back', name: 'Mochila Pequena',    capMul: 1,   cons: 0, price: 0,    desc: 'Capacidade padrão.' },
  { id: 'bp_m',     slot: 'back', name: 'Mochila Média',      capMul: 1.4, cons: 1, price: 450,  desc: '+40% munição, +2 suprimentos.' },
  { id: 'bp_l',     slot: 'back', name: 'Mochila Grande',     capMul: 1.8, cons: 2, price: 1000, desc: '+80% munição, +4 suprimentos.' },
  { id: 'nvg',      slot: 'eyes', name: 'Óculos Noturnos',    vis: 180, mode: 'nv', price: 800,  desc: 'Visão noturna verde (tecla N). +180 de alcance.' },
  { id: 'thermal',  slot: 'eyes', name: 'Visão Térmica',      vis: 60,  mode: 'th', thermal: 380, price: 1800, desc: 'Visão térmica (tecla N): corpos quentes brilham, mesmo atrás de paredes.' },
];
const GMAP = Object.fromEntries(GEAR.map(g => [g.id, g]));
/* ---------- Peso carregado (mão + costas) e velocidade ---------- */
const GKG = { h_light: .5, h_mich: 1.4, h_heavy: 3.2, v_light: 2, v_med: 5, v_heavy: 9, v_plate: 13, b_tac: 1.2, b_run: .8, bp_s: 1, bp_m: 2, bp_l: 3.4, nvg: .6, thermal: 1.3,
  h_cap: .1, h_pasgt: 1.5, h_ops: 1.1, h_riot: 2.4, h_ceramic: 3.6, h_eod: 6, v_conc: 1, v_assault: 7, v_iiia: 5.5, v_carrier: 10, v_eod: 20, v_iv: 16,
  b_work: 1.4, b_steel: 2.4, b_sprint: .6, b_exo: 3.5, e_goggle: .2, bino: .5, th_lite: .8, nvg3: .7, hybrid: 1.5,
  r_pulse: .2, r_walkie: .4, r_tac: .8, r_vhf: 2.2, r_sat: 3.5 };
GEAR.forEach(g => { g.kg = GKG[g.id] || 0; });
const ATT_KG = { a_sup: .5, a_flash: .15, a_comp: .2, a_brake: .25, a_long: .7, a_choke: .2, a_red: .2, a_holo: .3, a_scope3: .6, a_scope6: .9, a_thermal: 1.1, a_grip: .25, a_angled: .2, a_laser: .2, a_light: .2, a_bipod: .6 };
// massa de uma munição (kg)
function ammoKg(cal) {
  const c = CALIBERS[cal];
  if (!c) return .01;
  if (cal === 'rocket') return .9;
  if (cal === '40mm') return .22;
  if (cal === 'fuel') return .004;
  if (c.fam) return cal === '10ga' ? .05 : cal === '23mm' ? .09 : .036;
  return .005 + c.dmg * .00022;
}
function weaponKg(id, att) {
  let kg = WMAP[id].kg;
  if (att) for (const s of ['muzzle', 'top', 'under']) if (att[s] && ATT_KG[att[s]] && AMAP[att[s]] && attachOk(WMAP[id], AMAP[att[s]])) kg += ATT_KG[att[s]];
  return kg;
}
const LOAD_FREE = 8;                                                       // até aqui não há penalidade
const loadMul = kg => Math.max(.5, Math.min(1, 1 / (1 + Math.max(0, kg - LOAD_FREE) * .024)));
// carga de um loadout "inicial" (4 carregadores por arma + suprimentos padrão), para o arsenal
function loadoutKg(ld) {
  let kg = 0;
  for (const id of ld.weapons) if (id) {
    const w = WMAP[id]; kg += weaponKg(id, ld.attach && ld.attach[id]);
    if (!w.melee && !w.inf) kg += w.mag * 5 * ammoKg(w.cal);
  }
  for (const s of ['head', 'body', 'legs', 'back', 'eyes', 'radio']) if (ld.gear[s]) kg += GMAP[ld.gear[s]].kg;
  return kg + 2 * .45 + 2 * .5 + .6 + 4 * .15;
}
const SLOT_NAMES = { head: 'Capacete', body: 'Colete', legs: 'Botas', back: 'Mochila', eyes: 'Óculos', radio: 'Rádio' };

/* ---------- Parceiros ---------- */
const PARTNERS = [
  { id: 'p_rifle',  name: 'Cabo Falcão',   role: 'Fuzileiro',   wpn: 'ar15', hp: 110, abs: .3,  speed: 150, pref: 270, acc: 1.3, dmg: .9,  color: '#9dffb5', price: 0,    desc: 'Soldado versátil com fuzil.' },
  { id: 'p_medic',  name: 'Sgt. Hélio',    role: 'Médico',      wpn: 'mp5',  hp: 90,  abs: .25, speed: 155, pref: 210, acc: 1.5, dmg: .85, color: '#ffffff', heal: true, price: 900,  desc: 'Cura você e a equipe continuamente.' },
  { id: 'p_sniper', name: 'Ten. Lince',    role: 'Atirador',    wpn: 'awm',  hp: 80,  abs: .2,  speed: 140, pref: 430, acc: 1,   dmg: .85, color: '#7fd4ff', price: 1100, desc: 'Elimina alvos a longa distância.' },
  { id: 'p_gunner', name: 'Sd. Urso',      role: 'Metralhador', wpn: 'm249', hp: 170, abs: .45, speed: 120, pref: 300, acc: 1.4, dmg: .8,  color: '#ffd36a', price: 1300, desc: 'Resistente, com fogo de supressão.' },
  { id: 'p_breach', name: 'Cabo Trovão',   role: 'Assalto',     wpn: 'spas', hp: 130, abs: .4,  speed: 165, pref: 110, acc: 1,   dmg: 1,   color: '#ff9a7a', price: 1000, desc: 'Escopeta para combate próximo.' },
];
const PMAP = Object.fromEntries(PARTNERS.map(p => [p.id, p]));
const MAX_SQUAD = 3;

/* ---------- Inimigos ---------- */
// armor = fração absorvida no tronco/braços · helm = na cabeça · cls = classe (penetração menor é absorvida)
const ETYPES = {
  soldier: { label: 'Soldado', hp: 60,  speed: 108, r: 12, dmg: 9,  pen: 2.2, burst: 3, bdelay: .14,  pmin: .9,  pmax: 1.6, spread: .07, range: 600, vision: 560, pref: 300, bspeed: 640, color: '#8a3b2c', vest: '#4a2a22', helmet: '#5a322b', stripe: '#d44a35', weapon: 'ar15', scale: 1,    credit: 25,  armor: .1,  helm: .15, cls: 1.5 },
  scout:   { label: 'Batedor', hp: 38,  speed: 150, r: 11, dmg: 6,  pen: 1.1, burst: 5, bdelay: .085, pmin: .6,  pmax: 1.1, spread: .12, range: 380, vision: 520, pref: 170, bspeed: 600, color: '#9a7222', vest: '#5a4418', helmet: '#715822', stripe: '#f0b43a', weapon: 'mp5',  scale: .95,  credit: 20,  armor: 0,   helm: 0,   cls: 0 },
  heavy:   { label: 'Pesado',  hp: 200, speed: 72,  r: 15, dmg: 12, pen: 2.6, burst: 7, bdelay: .1,   pmin: 1.3, pmax: 2.0, spread: .1,  range: 620, vision: 540, pref: 340, bspeed: 620, color: '#5a3d6b', vest: '#2e2238', helmet: '#3a2c47', stripe: '#b36ad0', weapon: 'm249', scale: 1.25, credit: 60,  armor: .4,  helm: .3,  cls: 3 },
  boss:    { label: 'Comandante', hp: 650, speed: 88, r: 16, dmg: 15, pen: 3, burst: 8, bdelay: .08, pmin: 1.0, pmax: 1.6, spread: .08, range: 660, vision: 640, pref: 300, bspeed: 700, color: '#6b1f2a', vest: '#3a0f16', helmet: '#240a0f', stripe: '#ffd24a', weapon: 'ak47', scale: 1.4,  credit: 500, armor: .45, helm: .4,  cls: 3.5 },
  rusher:  { label: 'Invasor', hp: 55,  speed: 178, r: 12, dmg: 0,  pen: 0, melee: true, mdmg: 22, mrange: 34, mdelay: .75, burst: 0, bdelay: 1, pmin: 1, pmax: 1, spread: 0, range: 0, vision: 520, pref: 20, bspeed: 0, color: '#7a4a2a', vest: '#4a2c18', helmet: '#5a3a20', stripe: '#e0e0e0', weapon: 'machete', scale: 1, credit: 30, armor: 0, helm: 0, cls: 0 },
};
ETYPES.sniper = { label: 'Sniper', hp: 45, speed: 88, r: 11, dmg: 38, pen: 3.8, burst: 1, bdelay: 1, pmin: 1.8, pmax: 2.8, spread: .012, range: 1100, vision: 900, pref: 700, bspeed: 1700, color: '#3a4a30', vest: '#26331f', helmet: '#2c3a24', stripe: '#9ad86a', weapon: 'r700', scale: 1, credit: 55, armor: 0, helm: 0, cls: 0, laser: true, drop: 'sniper' };
ETYPES.shotgunner = { label: 'Escopeteiro', hp: 80, speed: 104, r: 12, dmg: 7, pellets: 7, pen: .8, burst: 2, bdelay: .5, pmin: 1.2, pmax: 2, spread: .24, range: 300, vision: 500, pref: 130, bspeed: 820, color: '#7a3a3a', vest: '#4a2424', helmet: '#5a2c2c', stripe: '#ff7a5a', weapon: 'spas', scale: 1.05, credit: 35, armor: .15, helm: .1, cls: 1, drop: 'shell' };
ETYPES.grenadier = { label: 'Granadeiro', hp: 90, speed: 92, r: 12, dmg: 8, pen: 1.8, burst: 3, bdelay: .16, pmin: 1.3, pmax: 2.2, spread: .09, range: 520, vision: 560, pref: 330, bspeed: 620, color: '#4a5a34', vest: '#2e3a20', helmet: '#37452a', stripe: '#ffb030', weapon: 'm79', scale: 1.05, credit: 45, armor: .2, helm: .2, cls: 2, nades: ['frag', 'frag', 'molotov', 'flash', 'smoke'], gcd: [5, 9], drop: 'grenade' };
ETYPES.medic = { label: 'Médico', hp: 55, speed: 116, r: 11, dmg: 6, pen: 1.2, burst: 4, bdelay: .12, pmin: .9, pmax: 1.5, spread: .09, range: 420, vision: 520, pref: 240, bspeed: 620, color: '#d8d8d4', vest: '#b8b8b0', helmet: '#e8e8e4', stripe: '#d83a3a', weapon: 'mp7', scale: .98, credit: 40, armor: .05, helm: 0, cls: 0, heal: true, drop: 'med' };
ETYPES.rocketeer = { label: 'Antitanque', hp: 100, speed: 80, r: 13, dmg: 85, pen: 3, burst: 1, bdelay: 1, pmin: 3, pmax: 4.5, spread: .03, range: 900, vision: 640, pref: 450, bspeed: 520, color: '#5a4a2a', vest: '#3a2e18', helmet: '#463a20', stripe: '#ff8a3a', weapon: 'rpg', scale: 1.1, credit: 70, armor: .2, helm: .15, cls: 2, rocket: true, rocketR: 100, drop: 'rocket' };
ETYPES.commando = { label: 'Comando', hp: 120, speed: 118, r: 12, dmg: 14, pen: 3.2, burst: 4, bdelay: .1, pmin: .8, pmax: 1.3, spread: .05, range: 700, vision: 640, pref: 300, bspeed: 700, color: '#2a2a30', vest: '#16161a', helmet: '#1c1c22', stripe: '#8fdcff', weapon: 'scar', scale: 1.05, credit: 80, armor: .3, helm: .3, cls: 3, drop: 'elite' };
const EXTRA_TYPES = ['sniper', 'shotgunner', 'grenadier', 'medic', 'rocketeer', 'commando'];
/* ---------- Inimigos sorteados: arma + equipamento (o visual muda como no jogador) ---------- */
const FOE_CATS = [
  ['pist', 'Pistolas e revólveres', ['Pistolas', 'Pistolas automáticas', 'Revólveres']],
  ['smg', 'Submetralhadoras', ['Submetralhadoras']],
  ['ar', 'Fuzis de assalto', ['Fuzis de assalto']],
  ['br', 'Fuzis de batalha e designados', ['Fuzis de batalha', 'Atiradores designados']],
  ['mg', 'Metralhadoras', ['Metralhadoras']],
  ['sg', 'Escopetas', ['Escopetas']],
  ['sn', 'Snipers e rifles de alavanca', ['Snipers', 'Rifles de alavanca']],
  ['la', 'Lançadores (foguetes)', ['Lançadores']],
  ['ml', 'Só corpo a corpo', ['Corpo a corpo']],
];
const ALL_TYPES = FOE_CATS.map(c => [c[0], c[1]]);
const FOE_PAL = [
  ['#8a3b2c', '#4a2a22', '#5a322b'], ['#6a5a3a', '#3a3020', '#4a4028'], ['#4a5a3a', '#2a3a22', '#33452c'], ['#5a5f66', '#2e3236', '#3a3f44'],
  ['#7a4a2a', '#4a2c18', '#5a3a20'], ['#5a3d6b', '#2e2238', '#3a2c47'], ['#9a7222', '#5a4418', '#715822'], ['#2a2a30', '#16161a', '#1c1c22'],
];
const FOE_STRIPE = ['#d44a35', '#ff9a3a', '#f0b43a', '#e8e8e8', '#ff6a8a'];
const FOE_TIERS = { head: [null, 'h_cap', 'h_light', 'h_pasgt', 'h_mich', 'h_ops', 'h_riot', 'h_heavy', 'h_ceramic'], body: [null, 'v_conc', 'v_light', 'v_med', 'v_iiia', 'v_assault', 'v_heavy', 'v_carrier', 'v_plate', 'v_iv'], legs: [null, 'b_work', 'b_tac', 'b_steel', 'b_run', 'b_sprint'], back: ['bp_s', 'bp_m', 'bp_l'], eyes: [null, 'e_goggle', 'bino', 'nvg', 'th_lite', 'nvg3', 'thermal', 'hybrid'] };
// [distância preferida, alcance máximo, visão] por categoria de arma
const FOE_ARCH = {
  'Pistolas': [190, 420, 520], 'Pistolas automáticas': [180, 400, 520], 'Revólveres': [200, 480, 520], 'Submetralhadoras': [200, 480, 520], 'Fuzis de assalto': [300, 640, 560],
  'Fuzis de batalha': [360, 760, 600], 'Atiradores designados': [460, 900, 720], 'Metralhadoras': [340, 700, 540], 'Escopetas': [130, 330, 500], 'Snipers': [700, 1100, 900],
  'Rifles de alavanca': [280, 650, 560], 'Lançadores': [450, 900, 640], 'Corpo a corpo': [20, 0, 520], 'Armas pesadas': [340, 700, 540],
};
// sorteia arma, acessórios, proteção e suprimentos; power (0..1) = quão bem equipado
function rollFoe(power, cats, boss) {
  const rnd = a => a[(Math.random() * a.length) | 0];
  power = Math.max(0, Math.min(1, power));
  let grps = FOE_CATS.filter(c => (cats || []).includes(c[0])).flatMap(c => c[2]);
  if (!grps.length) grps = FOE_CATS.flatMap(c => c[2]);
  const cap = 500 + power * 4500;
  const pool = WEAPONS.filter(w => grps.includes(w.grp) && !w.flame && w.id !== 'minigun' && w.id !== 'kord');
  const wts = pool.map(w => (w.price <= cap ? 1 : .05) / (1 + w.price / (300 + power * 2500)));
  let r = Math.random() * wts.reduce((a, b) => a + b, 0), pick = pool[0] || WMAP.ar15;
  for (let i = 0; i < pool.length; i++) { r -= wts[i]; if (r <= 0) { pick = pool[i]; break; } }
  const weapons = [null, null, null];
  weapons[pick.slot === 'primary' ? 0 : pick.slot === 'secondary' ? 1 : 2] = pick.id;
  const attach = {};
  if (pick.att) {
    const at = {};
    for (const s of ['muzzle', 'top', 'under']) {
      if (Math.random() > .3 + .35 * power) continue;
      const opts = ATTACH.filter(a => a.slot === s && a.id !== 'a_thermal' && attachOk(pick, a));
      if (opts.length) at[s] = rnd(opts).id;
    }
    attach[pick.id] = at;
  }
  const gear = {};
  for (const s in FOE_TIERS) { const l = FOE_TIERS[s]; gear[s] = l[Math.floor(Math.random() * Math.min(l.length, 1 + power * (l.length - 1) + .999))]; }
  if (boss) Object.assign(gear, { head: 'h_heavy', body: 'v_plate', legs: 'b_tac', back: 'bp_l', eyes: 'nvg' });
  const nades = Math.random() < .28 + .25 * power ? Array.from({ length: 1 + ((Math.random() * 3) | 0) }, () => rnd(['frag', 'frag', 'flash', 'smoke', 'molotov'])) : null;
  return { weapons, attach, gear, nades, heal: Math.random() < .2, power, boss: !!boss };
}
// estatísticas de combate do inimigo a partir da arma e do equipamento
function foeTy(ld) {
  const id = ld.weapons[0] || ld.weapons[1] || ld.weapons[2];
  const saveLD = LD; LD = { attach: ld.attach || {}, weapons: ld.weapons, gear: ld.gear };
  const w = effW(id); LD = saveLD;
  const gk = s => ld.gear[s] ? GMAP[ld.gear[s]] : null, head = gk('head'), body = gk('body'), legs = gk('legs');
  let kg = weaponKg(id, ld.attach[id]);
  for (const s in ld.gear) if (ld.gear[s]) kg += GMAP[ld.gear[s]].kg;
  const melee = !!w.melee;
  if (!melee) kg += w.mag * 3 * ammoKg(w.cal);
  let speed = 125 * loadMul(kg + 1) * (1 + (legs ? legs.spd : 0));
  if (melee) speed = Math.max(speed * 1.35, 150);
  const [pref, rng, vis] = FOE_ARCH[w.grp] || FOE_ARCH['Fuzis de assalto'];
  const bk = body ? body.kg : 0, r = 11 + (bk >= 9 ? 2.5 : bk >= 5 ? 1 : 0) + (w.grp === 'Metralhadoras' ? 1 : 0);
  const pal = FOE_PAL[(Math.random() * FOE_PAL.length) | 0];
  const ty = {
    hp: 55 + ((Math.random() * 20) | 0) + Math.round(bk * 1.5), speed, r, scale: r / 12, weapon: id, w,
    color: pal[0], vest: pal[1], helmet: pal[2], stripe: FOE_STRIPE[(Math.random() * FOE_STRIPE.length) | 0],
    armor: body ? body.abs : 0, helm: head ? head.abs : 0, legAbs: legs && legs.legAbs || 0, cls: Math.max(body ? body.cls : 0, head ? head.cls : 0),
    credit: 18 + Math.round((w.price || 0) / 45), vision: vis, pref, laser: w.grp === 'Snipers' || !!w.laser, nades: ld.nades, gcd: [6, 10], heal: ld.heal,
  };
  if (ld.attach[id] && (ld.attach[id].top === 'a_scope3' || ld.attach[id].top === 'a_scope6')) ty.vision = Math.round(vis * 1.15);
  if (melee) {
    Object.assign(ty, { melee: true, mdmg: Math.max(10, Math.round(w.dmg * .5)), mrange: Math.max(30, (w.range || 34) * .85), mdelay: Math.max(.6, (w.delay || .5) * 1.3), burst: 0, bdelay: 1, pmin: 1, pmax: 1, spread: 0, range: 0, dmg: 0, pen: 0, bspeed: 0 });
    return ty;
  }
  const grp = w.grp, c = CALIBERS[w.cal];
  let burst, bdelay, pmin, pmax;
  if (w.rocket) { burst = 1; bdelay = 1; pmin = 2.6; pmax = 4; }
  else if (w.burst) { burst = w.burst; bdelay = w.bd || .05; pmin = .9; pmax = 1.6; }
  else if (w.delay < .3) { burst = Math.max(2, Math.min(8, Math.round(.42 / w.delay))); bdelay = Math.max(w.delay * 1.25, .08); pmin = grp === 'Metralhadoras' ? 1.2 : .8; pmax = grp === 'Metralhadoras' ? 2 : 1.5; }
  else { burst = w.pellets > 1 && w.delay < .6 ? 2 : 1; bdelay = Math.max(w.delay, .3); pmin = Math.max(.9, w.delay * .9); pmax = Math.max(1.6, w.delay * 1.7); if (grp === 'Snipers') { pmin = Math.max(pmin, 1.6); pmax = Math.max(pmax, 2.6); } }
  Object.assign(ty, {
    burst, bdelay, pmin, pmax, pellets: Math.min(12, w.pellets || 1), pen: c.pen + (w.ap || 0), bspeed: w.speed,
    dmg: w.rocket ? Math.round(w.dmg * .6) : Math.max(3, Math.round(w.dmg * .52)),
    spread: w.pellets > 1 ? Math.min(.3, w.spread + .03) : Math.min(.22, .02 + w.spread * 1.5),
    range: Math.max(260, Math.min(w.range * .9, rng)), rocket: !!w.rocket, rocketR: w.radius ? Math.round(w.radius * .85) : 0,
  });
  return ty;
}
/* ---------- Itens de cura (cada um com seu tempo de uso) ---------- */
const HEALS = [
  { id: 'bandage',    name: 'Bandagem',       icon: '🩹', time: 2.2, cap: 6, desc: 'Rápida: estanca sangramentos e cura um pouco de tudo.' },
  { id: 'painkiller', name: 'Analgésico',     icon: '💊', time: 2.8, cap: 4, desc: 'Regeneração lenta de todas as partes por 10 s.' },
  { id: 'adrenaline', name: 'Adrenalina',     icon: '💉', time: 1.4, cap: 3, desc: 'Quase instantânea: +25% de velocidade por 12 s e cura leve.' },
  { id: 'splint',     name: 'Tala',           icon: '🦴', time: 4,   cap: 3, desc: 'Recupera braços e pernas destruídos (50%).' },
  { id: 'medkit',     name: 'Kit Médico',     icon: '✚',  time: 5.5, cap: 4, desc: 'Cura 50% de todas as partes.' },
  { id: 'surgery',    name: 'Kit Cirúrgico',  icon: '🧰', time: 9,   cap: 2, desc: 'Demorado: cura tudo por completo, até membros destruídos.' },
];
const HMAP = Object.fromEntries(HEALS.map(h => [h.id, h]));
const PLAYER_LOOK = { body: '#3f6f98', vest: '#26425a', helmet: '#2d4e6e', stripe: '#8fdcff' };

/* ---------- Modos de jogo ---------- */
const MODES = [
  { id: 'kill',     name: 'Eliminação',    icon: '☠',  desc: 'Elimine todos os hostis e chegue à extração.' },
  { id: 'intel',    name: 'Documentos',    icon: '📄', desc: 'Roube 3 documentos secretos nos prédios.' },
  { id: 'rescue',   name: 'Resgate',       icon: '🛟', desc: 'Liberte 3 reféns e escolte-os até a extração.' },
  { id: 'sabotage', name: 'Sabotagem',     icon: '💣', desc: 'Plante cargas em 3 alvos e fuja antes da explosão.' },
  { id: 'vip',      name: 'Alvo VIP',      icon: '🎯', desc: 'Elimine o comandante inimigo e escape.' },
  { id: 'survival', name: 'Sobrevivência', icon: '🌊', desc: 'Resista a ondas cada vez maiores de inimigos.' },
  { id: 'sandbox',  name: 'Treino livre',  icon: '🎮', desc: 'Sem objetivo: inimigos surgem em ondas contínuas.', hidden: true },
  { id: 'mp',       name: 'Multiplayer',   icon: '🌐', desc: 'Partida online contra outros jogadores.', hidden: true },
  { id: 'timeattack', name: 'Contra o Relógio', icon: '⏱', desc: 'Elimine o máximo de hostis em 3 minutos.' },
];
const MMAP = Object.fromEntries(MODES.map(m => [m.id, m]));
const MISSION_NAMES = ['FALCÃO NEGRO', 'LANÇA SILENCIOSA', 'TEMPESTADE DE AÇO', 'CORVO NOTURNO', 'ESCUDO DE FERRO', 'VÍBORA', 'SOMBRA VERMELHA', 'TROVÃO'];

/* ---------- Progresso salvo ---------- */
const SAVE_KEY = 'operacao_tatica_v4';
const DEFAULT_CUSTOM = () => ({
  weapons: ['ar15', 'm9', 'knife'], attach: {}, gear: { head: 'h_mich', body: 'v_med', legs: 'b_tac', back: 'bp_m', eyes: null, radio: 'r_tac' }, squad: ['p_rifle'],
  opts: { mode: 'kill', time: 'random', enemies: 10, level: 1, hpMul: 1, types: FOE_CATS.map(c => c[0]), infAmmo: false, shadow: 40 },
});
function defaultSave() {
  return {
    credits: 3000,
    owned: { m9: 1, ar15: 1, spas: 1, awm: 1, rpg: 1, knife: 1, v_light: 1, bp_s: 1, p_rifle: 1 },
    weapons: ['ar15', 'm9', 'knife'],   // [primária, secundária, corpo a corpo]
    attach: {},                          // { armaId: { muzzle, top, under } }
    gear: { head: null, body: 'v_light', legs: null, back: 'bp_s', eyes: null },
    squad: ['p_rifle'],
    progress: {}, best: {}, mode: 'kill',
    custom: DEFAULT_CUSTOM(), settings: { shadow: 45 },
  };
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.owned) return Object.assign(defaultSave(), s); } catch (e) { /* sem save */ }
  return defaultSave();
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignora */ } }
const SAVE = loadSave();
if (!SAVE.custom) SAVE.custom = DEFAULT_CUSTOM();
if (!SAVE.settings) SAVE.settings = { shadow: 45 };
if (SAVE.custom.opts && !SAVE.custom.opts.v7) { SAVE.custom.opts.v7 = 1; SAVE.custom.opts.types = FOE_CATS.map(c => c[0]); }
if (SAVE.custom.gear && !SAVE.custom.vRadio) { SAVE.custom.vRadio = 1; if (!SAVE.custom.gear.radio) SAVE.custom.gear.radio = 'r_tac'; }
let LD = SAVE;   // loadout ativo (campanha ou partida personalizada)
