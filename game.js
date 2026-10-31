'use strict';

/* =====================================================================
   OPERAÇÃO TÁTICA — lógica do jogo (depende de data.js e world.js;
   desenho em render.js; interface em ui.js)
   ===================================================================== */

const canvas = $('game'), ctx = canvas.getContext('2d');

const G = {
  state: 'menu',            // menu | play | paused | inv | over
  mode: 'kill', level: 1, name: '', night: false, visOn: false,
  time: 0, dt: .016, kills: 0, shots: 0, hits: 0, heads: 0, earned: 0,
  shake: 0, hitMark: 0, hitCol: '#fff', hurtFlash: 0, kx: 0, ky: 0,
  objDone: 0, objTotal: 0, rescueNeed: 0, extractOpen: false, announced: false,
  endTimer: 0, won: false, reason: '',
  wave: 0, waveTarget: 8, waveState: 'break', waveTimer: 0,
  hold: false, near: null,
};
let SPOTS = [], BSPOTS = [];
let player, allies = [], enemies = [], bullets = [], grenades = [], charges = [], interacts = [];
let particles = [], decals = [], holes = [], pickups = [], texts = [], flashes = [], TARGETS = [];
let smokes = [], fires = [], flares = [], mines = [], BOTT = [];
let touchMode = false, VIS = BASE_VIS;
const cam = { x: 0, y: 0 };
let vw = innerWidth, vh = innerHeight, dpr = 1, S = 1;

const input = { keys: new Set(), mx: 0, my: 0, mouseDown: false, act: false };
const sticks = {
  move: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: $('stickMove') },
  aim:  { id: null, ox: 0, oy: 0, x: 0, y: 0, el: $('stickAim') },
};

/* =====================================================================
   ÁUDIO (sintetizado)
   ===================================================================== */
let AC = null, master = null, noiseBuf = null, muted = false, OUT = null, gunBus = null, revSend = null, gunOut = null, VOICES = 0, FORCE = false;
const VMAX = 64;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = .75;
    const lim = AC.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 5; lim.ratio.value = 8; lim.attack.value = .002; lim.release.value = .14;
    master.connect(lim); lim.connect(AC.destination);
    // barramento dos tiros: saturação (soco/estalo "estourado" de bodycam) + reverberação por convolução (eco de rua/prédio)
    gunBus = AC.createGain(); gunBus.gain.value = 2.1;
    const sh = AC.createWaveShaper(), cv = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(x * 3.4) * .95; }
    sh.curve = cv; sh.oversample = 'none';
    gunOut = AC.createGain(); gunOut.gain.value = 3.6 * gunVolume(); gunOut.connect(lim);
    gunBus.connect(sh); sh.connect(gunOut);
    const len = Math.floor(AC.sampleRate * 1.3), ir = AC.createBuffer(1, len, AC.sampleRate);
    for (let ch = 0; ch < 1; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { const t = i / AC.sampleRate; lp += ((Math.random() * 2 - 1) - lp) * (.55 - .4 * Math.min(1, t / 1.2)); d[i] = lp * Math.exp(-t * 3.6) * (1 + (i < 900 ? 1.5 : 0)); } }
    const conv = AC.createConvolver(); conv.buffer = ir;
    revSend = AC.createGain(); revSend.gain.value = .4;
    sh.connect(revSend); revSend.connect(conv); conv.connect(gunOut);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function noiseHit(dur, f0, f1, vol, delay = 0) {
  if (!AC || muted || (!FORCE && VOICES >= VMAX)) return;
  const t = AC.currentTime + delay;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = 'lowpass';
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(Math.max(.001, vol), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(OUT || master); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  VOICES++; s.onended = () => { VOICES--; };
}
// volume dos tiros (opção do jogador, 0..100%)
const gunVolume = () => clamp(((SAVE.settings && SAVE.settings.gunVol != null) ? SAVE.settings.gunVol : 100) / 100, 0, 1);
function applyGunVolume() { if (gunOut) gunOut.gain.value = 3.6 * gunVolume(); }
function noiseHP(dur, f, vol, delay = 0) {
  if (!AC || muted || (!FORCE && VOICES >= VMAX)) return;
  const t = AC.currentTime + delay;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f;
  const g = AC.createGain(); g.gain.setValueAtTime(Math.max(.001, vol), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(OUT || master); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  VOICES++; s.onended = () => { VOICES--; };
}
function tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
  if (!AC || muted || (!FORCE && VOICES >= VMAX)) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(Math.max(.001, vol), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(OUT || master); o.start(t); o.stop(t + dur + .03);
  VOICES++; o.onended = () => { VOICES--; };
}
const SFX = {
  pistol:  (v = 1) => { noiseHit(.09, 3500, 700, .35 * v); tone(220, 70, .07, .2 * v, 'square'); },
  smg:     (v = 1) => { noiseHit(.06, 3600, 700, .26 * v); tone(200, 70, .05, .14 * v, 'square'); },
  rifle:   (v = 1) => { noiseHit(.07, 3200, 600, .3 * v); tone(180, 60, .06, .18 * v, 'square'); },
  shotgun: (v = 1) => { noiseHit(.25, 2800, 250, .6 * v); tone(110, 40, .2, .35 * v, 'sawtooth'); },
  sniper:  (v = 1) => { noiseHit(.35, 4500, 150, .7 * v); tone(130, 35, .3, .4 * v, 'sawtooth'); },
  rpg:     (v = 1) => { noiseHit(.5, 1800, 150, .5 * v); tone(90, 40, .4, .3 * v, 'sawtooth'); },
  explosion: () => { noiseHit(.9, 1000, 50, 1); tone(70, 25, .7, .6, 'sine'); },
  enemyShot: v => { noiseHit(.06, 2500, 500, .2 * v); },
  hit:     () => tone(420, 150, .05, .14, 'square'),
  head:    () => { tone(1500, 1100, .09, .2, 'triangle'); tone(900, 600, .06, .12, 'square'); },
  kill:    () => tone(300, 80, .12, .2, 'sawtooth'),
  hurt:    () => tone(160, 60, .18, .35, 'sawtooth'),
  armor:   () => tone(900, 500, .06, .14, 'triangle'),
  reload:  () => { tone(900, 500, .03, .12, 'square'); tone(700, 400, .04, .12, 'square', .25); tone(1100, 600, .03, .14, 'square', .7); },
  pickup:  () => tone(500, 900, .12, .2),
  heal:    () => { tone(400, 700, .1, .2); tone(600, 900, .12, .2, 'sine', .1); },
  empty:   () => tone(300, 300, .03, .1, 'square'),
  throw:   () => noiseHit(.12, 900, 300, .2),
  beep:    () => tone(1200, 1200, .05, .12, 'square'),
  flame:   () => noiseHit(.14, 1400, 500, .22),
  magdrop: () => { tone(260, 120, .05, .16, 'square'); noiseHit(.04, 2500, 900, .12, .05); },
  shell:   () => { tone(700, 400, .03, .12, 'square'); tone(500, 300, .04, .1, 'square', .06); },
  spin:    () => tone(120, 200, .1, .1, 'sawtooth'),
  door:    () => { tone(180, 110, .1, .14, 'square'); noiseHit(.06, 900, 300, .1); },
  crate:   () => noiseHit(.14, 1600, 300, .3),
  glass:   () => { noiseHit(.25, 6000, 2000, .3); tone(2400, 1800, .08, .1, 'triangle'); },
  swing:   () => noiseHit(.1, 3000, 800, .14),
  melee:   () => { tone(200, 80, .08, .3, 'sawtooth'); noiseHit(.08, 1500, 400, .25); },
  stairs:  () => { tone(300, 340, .05, .1, 'square'); tone(320, 360, .05, .1, 'square', .1); },
  nv:      () => { tone(400, 1200, .15, .1, 'sine'); },
  beat:    () => { tone(70, 38, .14, .5, 'sine'); tone(62, 36, .14, .4, 'sine', .17); },
  swap:    () => { tone(500, 700, .05, .12, 'square'); },
};
const sfx = (n, v) => { if (SFX[n]) SFX[n](v); };

// Som de tiro sintetizado. Cada calibre tem seu timbre (pitch) e cada grupo de armas tem sua assinatura (ação, estampido, cauda).
// fator de tom por calibre: menor = mais grave e "pesado"
const SND_PITCH = {
  '.22': 1.7, '.32': 1.45, '.380': 1.32, '9mm': 1.22, '9x18': 1.2, '7.62x25': 1.28, '5.7': 1.5, '4.6': 1.5, '.45': .95, '10mm': 1.02, '.357': .95, '.44': .8, '.50AE': .7, '.50BW': .75,
  '5.56': 1.22, '5.45': 1.16, '5.8': 1.2, '.300': 1.0, '6mm': 1.12, '6.5g': 1.0, '7.62x39': .95, '7.92k': .95, '6.8': .9, '.30carb': 1.12, '.243': 1.06, '.308': .85, '6.5': .92,
  '7.62x54': .8, '7.92': .8, '.30-06': .78, '.30-30': .9, '.375': .7, '.338': .65, '.300WM': .7, '.408': .6, '.416': .58, '.50BMG': .5, '14.5': .45, '.45-70': .7, '9x39': 1.05, '.38sp': 1.0, '.357sig': 1.1, '6.5x55': .9,
  '12ga': .6, '12ga-slug': .55, '12ga-flech': .62, '12ga-dragon': .6, '12ga-rubber': .7, '12ga-frag': .5, '10ga': .5, '16ga': .66, '20ga': .72, '20ga-slug': .62, '.410': .92, '.410-slug': .8, '23mm': .4, '40mm': .5,
};
const SUBSONIC = new Set(['.22', '.32', '.380', '9mm', '9x18', '.45', '10mm', '9x39', '.357', '.44', '.50AE', '.45-70']);
const clack = (delay, f, vol) => { tone(f, f * .5, .03, vol, 'square', delay); noiseHP(.03, 3200, vol * .7, delay); };
const GS = { t: 0, full: 0, all: 0 };
function gunshot(w, v = 1, own = false) {
  const now = performance.now();
  if (now - GS.t > 120) { GS.t = now; GS.full = 0; GS.all = 0; }
  GS.all++;
  let lite = false;
  if (!own) {
    if (GS.full >= 3 || VOICES > 40) { if (v > .3 && GS.all <= 8) lite = true; else return; }   // muitos tiros ao mesmo tempo: só os mais próximos, em versão leve
    if (!lite) GS.full++;
  }
  FORCE = own;
  try { gunshot2(w, v, lite); } finally { OUT = null; FORCE = false; }
}
function gunshot2(w, v = 1, lite = false) {
  if (!AC || muted || !w) return;
  const C = CALIBERS[w.cal], grp = w.grp || '', cls = w.snd || 'rifle', mz = w.muzzle, len = w.len || 25;
  let pf = SND_PITCH[w.cal] || (C && C.fam ? .62 : 1);
  if (grp === 'Submetralhadoras' || grp === 'Pistolas automáticas') pf *= 1.08;
  const E = C ? C.dmg * (C.pel || 1) * .5 + (C.dmg || 10) * .5 : 20;
  const en = clamp(Math.log(E + 6) / Math.log(220), .22, 1.15);                     // "energia" do cartucho
  const indoor = player && bldIdxAt(player.x, player.y) >= 0;
  const sup = !!(w.sup || mz === 'a_sup');
  const brk = mz === 'a_brake' || mz === 'a_comp', fh = mz === 'a_flash', lb = mz === 'a_long';
  const near = clamp(v * 1.4, .15, 1);                                                // longe: perde o estalo agudo
  OUT = gunBus;
  if (sup) {
    // silenciado: sem estampido grave; fica agudo e fino ("pfft"/"thwip"), com a ação da arma em destaque
    const V = v * 1.9, sub = SUBSONIC.has(w.cal);
    revSend && (revSend.gain.value = indoor ? .45 : .18);
    noiseHP(.045 + .03 * en, 3000 * Math.sqrt(pf), (sub ? .6 : .85) * V * en);                  // sopro agudo
    if (lite) { tone(2000 * pf, 1000 * pf, .05, .26 * V, 'sine'); OUT = null; return; }
    noiseHit(.035, 10000, 3500, .4 * V * en);                                                    // chiado
    tone(2000 * pf, 1000 * pf, .05, .26 * V, 'sine');                                            // tom fino
    if (!sub) noiseHP(.012, 4200, .7 * V * near);                                                // estalo fino supersônico
    clack(.02, 1500 * pf, .3 * V);                                                               // ferrolho/ação
    if (cls === 'shotgun') clack(.3, 900, .25 * V);
    OUT = null; return;
  }
  const loud = (mz === 'a_brake' ? 1.25 : mz === 'a_comp' ? 1.14 : 1) * (fh ? .92 : 1) * (lb ? .95 : 1);
  const V = v * loud * 2.4;
  revSend && (revSend.gain.value = indoor ? .85 : (en > .62 ? .5 : .38));
  // estalo seco (onda de choque), sopro do disparo e estampido — tudo escalado pelo calibre
  noiseHP(.016 + .022 * en, (brk ? 2600 : 1900) * Math.pow(pf, .6), .95 * V * near);
  noiseHit(.07 + .13 * en, Math.min(9000, 4800 * pf) * (1 - len / 300), 380, .9 * V * en);
  const boomMul = grp === 'Revólveres' ? 1.25 : (grp === 'Fuzis de batalha' || grp === 'Atiradores designados' || grp === 'Snipers') ? 1.15 : 1;
  tone((150 * pf + 20) * (lb ? .85 : 1), 30, (.12 + .32 * en) / Math.sqrt(pf), .75 * V * en * boomMul, 'sine');
  if (lite) { revSend && (revSend.gain.value = .15); OUT = null; return; }
  tone(95 * pf, 28, .08 + .2 * en, .45 * V * en, 'triangle', .004);
  // assinatura de cada grupo
  if (cls === 'shotgun') { tone(80, 26, .4, .7 * V, 'sawtooth'); noiseHit(.3, 2400, 200, .55 * V); if (w.reloadType === 'shell' || w.delay > .5) { clack(.32, 700, .22 * V); clack(.42, 520, .2 * V); } }
  else if (grp === 'Pistolas' || grp === 'Pistolas automáticas') clack(.03, 2200, .16 * V);
  else if (grp === 'Revólveres') tone(70, 26, .25, .35 * V, 'sine', .01);
  else if (grp === 'Submetralhadoras') noiseHP(.05, 3200, .25 * V, .014);
  else if (grp === 'Metralhadoras') { tone(65, 30, .16, .4 * V, 'sine', .01); noiseHP(.04, 2600, .22 * V, .02); }
  else if (grp === 'Snipers' || grp === 'Rifles de alavanca') { if (w.reloadType === 'shell' || w.delay > .7) clack(grp === 'Snipers' ? .6 : .3, grp === 'Snipers' ? 900 : 1100, .25 * V); }
  if (cls === 'sniper' || pf < .62) tone(52, 22, .7, .5 * V * Math.min(1, en), 'sine', .02);                 // calibres enormes: sub-grave longo
  if (pf < .52) noiseHit(.5, 1400, 80, .4 * V, .03);
  // eco do ambiente: mais longo em tiros fortes e em lugares fechados
  noiseHit(.2 + en * .55, 1700, 90, .32 * V * en, .06);
  if (en > .62 || cls === 'sniper') noiseHit(.7, 1000, 70, .2 * V * en, .2);
  if (indoor) { noiseHit(.25, 2200, 200, .24 * V * en, .05); noiseHit(.35, 1300, 110, .17 * V * en, .13); }
  OUT = null;
}

/* =====================================================================
   PARTÍCULAS, DECALQUES E EFEITOS
   ===================================================================== */
// ver se algo na camada L deve aparecer para o jogador
const layerShown = (L, x, y) => !player || L === player.L || (player.L >= 0 && L === -1 && bldIdxAt(x, y) !== layerBld[player.L]);

function spawnPart(o) {
  const p = { life: .5, size: 2, drag: 1, grow: 0, layer: 1, g: 0, rot: 0, vr: 0, color: '#fff', kind: 'dot', vx: 0, vy: 0, L: -2 };
  Object.assign(p, o); p.max = p.life;
  particles.push(p);
  if (particles.length > 900) particles.shift();
}
function addDecal(d) { decals.push(d); if (decals.length > 700) decals.shift(); }
// respingo de sangue nas paredes (estilo CS2) e no chão, na direção do tiro; cresce com o dano
function bloodWall(x, y, ang, L, dmg, head) {
  const reach = clamp(90 + dmg * 2.4, 100, 340), c = Math.cos(ang), s = Math.sin(ang);
  const wd = castRay(x, y, ang, reach, L);
  if (wd < reach - 1) addDecal({ k: 'wsplat', x: x + c * wd, y: y + s * wd, ang, r: clamp(6 + dmg * .26, 7, 30), a: .88, L, s: Math.random() });
  const n = Math.min(6, 1 + ((dmg / 22) | 0));
  for (let i = 0; i < n; i++) { const d = rand(14, Math.max(16, Math.min(wd, reach))); addDecal({ k: 'blood', x: x + c * d + rand(-7, 7), y: y + s * d + rand(-7, 7), r: rand(2, 5.5), a: .6, L }); }
  const wb = castRay(x, y, ang + Math.PI, 80, L);                                  // respingo de entrada, se houver parede atrás
  if ((head || dmg > 40) && wb < 79) addDecal({ k: 'wsplat', x: x - c * wb, y: y - s * wb, ang: ang + Math.PI, r: clamp(5 + dmg * .12, 6, 16), a: .8, L, s: Math.random() });
}
// impulso do corpo: depende da força do tiro (dano + penetração)
function corpseKick(force, ang) {
  const sp = clamp(force * 3.6, 0, 720);
  return sp < 40 ? {} : { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, spin: rand(-7, 7) };
}
function moveCorpse(d, dt) {
  const sp = Math.hypot(d.vx, d.vy);
  if (sp < 12) { d.vx = d.vy = 0; return; }
  const steps = Math.max(1, Math.ceil(sp * dt / 6)), sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const nx = d.x + d.vx * sdt, ny = d.y + d.vy * sdt;
    if (solidF(Math.floor(nx / T), Math.floor(ny / T), d.L)) {
      if (sp > 150) addDecal({ k: 'wsplat', x: d.x, y: d.y, ang: Math.atan2(d.vy, d.vx), r: clamp(sp * .03, 6, 22), a: .85, L: d.L, s: Math.random() });
      d.vx = d.vy = 0; return;
    }
    d.x = nx; d.y = ny; d.trail = (d.trail || 0) + Math.hypot(d.vx, d.vy) * sdt;
    if (d.trail > 22) { d.trail = 0; addDecal({ k: 'blood', x: d.x + rand(-3, 3), y: d.y + rand(-3, 3), r: rand(2, 4.5), a: .55, L: d.L }); }
  }
  const k = Math.exp(-4.4 * dt); d.vx *= k; d.vy *= k; d.ang += (d.spin || 0) * dt * Math.min(1, sp / 260);
}
function addHole(x, y, L, k) { holes.push({ x, y, L, k }); if (holes.length > 500) holes.shift(); }
function addText(x, y, txt, color = '#fff', size = 13) { texts.push({ x, y, txt, color, size, life: .8, max: .8 }); }
function shake(v) { G.shake = Math.min(14, G.shake + v); }
const FIRE_COLS = ['#ffd24a', '#ff9a2a', '#ff6a1a', '#ffe28a'];
const pickFire = () => FIRE_COLS[(Math.random() * FIRE_COLS.length) | 0];

// sangue: respingo de entrada (pequeno), saída (grande, atrás) e poça
function bloodBurst(x, y, ang, n, L, exitBig) {
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-.6, .6), sp = rand(50, 260);
    spawnPart({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.25, .7), size: rand(1.4, 3.4), color: Math.random() < .5 ? '#a01818' : '#7a0f0f', drag: 5, layer: 0, L });
  }
  if (exitBig) for (let i = 0; i < 4; i++) addDecal({ k: 'blood', x: x + Math.cos(ang) * rand(10, 46), y: y + Math.sin(ang) * rand(10, 46), r: rand(2, 6), a: .7, L });
  if (Math.random() < .7) addDecal({ k: 'blood', x: x + Math.cos(ang) * rand(4, 24), y: y + Math.sin(ang) * rand(4, 24), r: rand(3, 8), a: .75, L });
}
function sparks(x, y, ang, color = '#ffd36a', n = 5) {
  for (let i = 0; i < n; i++) {
    const a = ang + Math.PI + rand(-.9, .9), sp = rand(60, 260);
    spawnPart({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.12, .3), size: rand(1, 2), color, drag: 4, kind: 'spark' });
  }
}
function impactFx(b, kind) {
  const ang = Math.atan2(b.dy, b.dx);
  if (kind === K.WALL || kind === K.BRICK) {
    sparks(b.x, b.y, ang, '#ffe08a', 4);
    for (let i = 0; i < 4; i++) { const a = ang + Math.PI + rand(-1, 1); spawnPart({ x: b.x, y: b.y, vx: Math.cos(a) * rand(20, 90), vy: Math.sin(a) * rand(20, 90), life: rand(.4, .9), size: rand(3, 6), grow: 6, color: 'rgba(190,190,180,1)', drag: 3, kind: 'smoke' }); }
  } else if (kind === K.CRATE || kind === K.DOOR || kind === K.PART || kind === K.WOODW) {
    for (let i = 0; i < 5; i++) { const a = ang + Math.PI + rand(-1, 1); spawnPart({ x: b.x, y: b.y, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(40, 160), life: rand(.3, .7), size: rand(1.5, 3), color: kind === K.PART ? '#d8d4c8' : '#b88a4c', drag: 3, kind: 'dot' }); }
  } else if (kind === K.TREE) sparks(b.x, b.y, ang, '#6fbf5e', 4);
}

function explode(x, y, radius, dmg, L) {
  sfx('explosion'); shake(11);
  flashes.push({ x, y, r: radius * 1.15, life: .35, max: .35, L });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, PI2), sp = rand(40, 340);
    spawnPart({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.3, .8), size: rand(5, 11), grow: -6, color: pickFire(), drag: 3.4, kind: 'fire' });
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(0, PI2), sp = rand(20, 150);
    spawnPart({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.8, 1.7), size: rand(8, 15), grow: 12, color: 'rgba(40,40,40,1)', drag: 1.6, kind: 'smoke' });
  }
  for (let i = 0; i < 12; i++) sparks(x, y, rand(0, PI2), '#ffcf70', 1);
  addDecal({ k: 'scorch', x, y, r: radius * .55, a: .55, L });

  const blast = (t, isPlayer) => {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d >= radius + t.r) return;
    if (isPlayer && MP.on) mpNoteHit(G.src);
    let f = 1 - d / (radius + t.r);
    if (t.L !== L) f *= .35; else if (!hasLOS(x, y, t.x, t.y, L)) f *= .35;
    blastHit(t, dmg * (.25 + .75 * f) * (isPlayer ? .5 * (t.blastMul || 1) : 1), Math.atan2(t.y - y, t.x - x));
  };
  if (!G.eSide) for (const e of enemies) if (!e.dead && !(MP.on && e.mpId != null && (G.src != null ? !mpHostile(G.src, e.mpId) : mpFriend(e.mpId)))) { if (e.mpId != null) e.lastW = 'boom'; blast(e, false); }
  for (const a of allies) { if (a.dead || a.bound) continue; const d = Math.hypot(a.x - x, a.y - y); if (d < radius + a.r) damageAlly(a, dmg * .5 * (1 - d / (radius + a.r)), Math.atan2(a.y - y, a.x - x)); }
  if (!player.dead && (!MP.on || mpHurtFrom(G.src))) blast(player, true);

  const tx0 = Math.floor((x - radius) / T), tx1 = Math.floor((x + radius) / T), ty0 = Math.floor((y - radius) / T), ty1 = Math.floor((y + radius) / T);
  const walls = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const wd = Math.hypot(tx * T + T / 2 - x, ty * T + T / 2 - y);
    if (wd > radius * .9) continue;
    const k = kindF(tx, ty, L);
    if (k === K.CRATE) destroyCrate(tx, ty, L);
    else if (k === K.WINDOW) breakWindow(tx, ty, L);
    else if (k === K.DOOR || k === K.DOOROPEN) breakDoor(tx, ty, L);
    else if (dmg >= 50 && WALL_HP[k] && castRay(x, y, Math.atan2(ty * T + T / 2 - y, tx * T + T / 2 - x), wd, L) >= wd - T * .8) walls.push([tx, ty, wd]);   // paredes expostas à explosão
  }
  for (const [wx, wy, wd] of walls) damageWall(wx, wy, L, dmg * Math.max(.3, 1 - wd / (radius * 1.1)));
  makeNoise(x, y, 800);
}

/* =====================================================================
   CORPO: partes, blindagem, sangramento (estilo War Thunder)
   ===================================================================== */
function makeParts(maxHp) {
  const parts = {};
  for (const k of PARTS) { const m = maxHp * PART_HP[k]; parts[k] = { hp: m, max: m }; }
  parts.org = {};
  for (const k in ORGANS) parts.org[k] = { hp: 100 };
  return parts;
}
const pState = (t, k) => stateOf(t.parts[k].hp / t.parts[k].max);
const vitalHp = t => Math.max(0, Math.min(t.parts.head.hp / t.parts.head.max, t.parts.torso.hp / t.parts.torso.max) * t.maxHp);

// sangramento de cada órgão por estado (1 lesionado, 2 grave, 3 destruído)
const ORG_BLEED = { heart: [0, .4, 1, 2], liver: [0, .6, 1.4, 2.2], kidneys: [0, .3, .8, 1.4], stomach: [0, .2, .6, 1.1], lungs: [0, .2, .5, 1], face: [0, .2, .4, .6], eyes: [0, .1, .2, .3], ribs: [0, 0, .2, .5], v: [0, .5, 1.1, 1.8], m: [0, .1, .25, .45] };
// efeitos dos ferimentos: mira, velocidade, sangramento, órgãos e ossos
function recalcFx(t) {
  const s = k => pState(t, k), O = t.parts.org, os = k => O ? orgState(O[k].hp) : 0;
  const lm = k => [1, 1, .85, .6, .3][s(k)];
  const legM = d => lm('leg' + d) * [1, .92, .55, .3][os('leg' + d + 'b')] * [1, .97, .85, .7][os('leg' + d + 'm')];
  let sp = Math.min((legM('L') + legM('R')) / 2, Math.min(legM('L'), legM('R')) + .35);
  sp *= [1, .93, .78, .6][os('lungs')] * [1, 1, .9, .9][os('heart')] * [1, .93, .93, .85][os('ribs')] * [1, .92, .6, .6][os('spine')] * [1, 1, .92, .85][os('kidneys')];
  let pain = O ? os('kidneys') * .006 + os('face') * .004 : 0;
  if (O) for (const k in O) if (ORGANS[k].bone && os(k) >= 2) pain += .008 * (os(k) - 1);
  if (t.numb > 0) pain *= .3;
  const armBone = os('armLb') >= 2 || os('armRb') >= 2, armBad = (os('armLb') >= 2) + (os('armRb') >= 2) + (os('armLm') >= 2) + (os('armRm') >= 2);
  t.fx = {
    aim: (s('armL') + s('armR')) * .012 + (s('head') >= 2 ? .02 : 0) + pain + [0, .006, .02, .03][os('lungs')] + [0, .02, .04, .05][os('brain')] + (os('armLb') >= 2 ? .02 * (os('armLb') - 1) : 0) + (os('armRb') >= 2 ? .02 * (os('armRb') - 1) : 0),
    armsDead: s('armL') === 4 && s('armR') === 4,
    oneArm: s('armL') === 4 || s('armR') === 4 || os('armLb') === 3 || os('armRb') === 3,
    speed: Math.max(.2, sp),
    crawl: (s('legL') === 4 && s('legR') === 4) || os('spine') === 3,
    reloadMul: 1 + armBad * .1 + (armBone ? .1 : 0),
    vis: [1, .85, .62, .4][os('eyes')],
    dizzy: [0, .12, .4, .6][os('brain')] + (os('skull') >= 2 ? .15 : 0),
    cough: os('lungs') >= 2,
  };
  let bl = 0;
  if (s('torso') >= 2) bl += 1.6 * (s('torso') - 1);
  if (s('head') >= 3) bl += 1.5;
  for (const k of ['armL', 'armR', 'legL', 'legR']) if (s(k) >= 2) bl += .7 * (s(k) - 1);
  if (O) for (const k in O) { const st = os(k); if (!st) continue; const tb = ORG_BLEED[k] || (k.endsWith('v') ? ORG_BLEED.v : k.endsWith('m') ? ORG_BLEED.m : null); if (tb) bl += tb[st]; }
  t.bleed = Math.min(7, bl);
  t.hp = vitalHp(t);
}
function healAll(t, frac) {
  for (const k of PARTS) {
    const P = t.parts[k];
    if (P.hp <= 0) { if (k === 'head' || k === 'torso') continue; P.hp = P.max * .18; }
    P.hp = Math.min(P.max, P.hp + P.max * frac);
  }
  if (t.parts.org) {
    for (const k in t.parts.org) { const c = t.parts.org[k]; if (c.hp <= 0 && (k === 'brain' || k === 'heart')) continue; c.hp = Math.min(100, c.hp + frac * 70 + (c.hp <= 0 ? 8 : 0)); }
    if (t.arrest > 0 && t.parts.org.heart.hp > 0) t.arrest = 0;
  }
  recalcFx(t);
}
// protege rosto/olhos/pernas conforme o equipamento
function protOf(t) {
  let h, e, l;
  if (t === player) { h = gearOf('head'); e = gearOf('eyes'); l = gearOf('legs'); }
  else { const q = t.eq || {}; h = q.head && GMAP[q.head]; e = q.eyes && GMAP[q.eyes]; l = q.legs && GMAP[q.legs]; }
  return { face: !!(h && h.face), eye: !!(e && e.protEye), legAbs: (l && l.legAbs) || 0 };
}
function organNotice(t, key, st) {
  const def = ORGANS[key];
  if (t !== player && st < 2) return;
  addText(t.x, t.y - t.r - 34, def.name.toUpperCase() + ': ' + (def.bone ? ORG_STATE_NAME_BONE : ORG_STATE_NAME)[st].toUpperCase(), ORG_COL[st], 11);
  if (t === player && st >= 2) { G.hurtFlash = Math.min(1, G.hurtFlash + .35); shake(4); }
}
// escolhe o órgão/osso atingido dentro da parte; retorna true se o golpe foi fatal (cérebro destruído)
function hitOrgans(t, part, d, o) {
  const O = t.parts.org, list = ORG_BY_PART[part];
  if (!O || !list) return false;
  const pr = protOf(t), sc = Math.min(1, 100 / Math.max(40, t.maxHp)), pen = o.pen || 0;
  const n = pen >= 2.5 && Math.random() < .4 ? 2 : 1;
  let dead = false;
  for (let i = 0; i < n; i++) {
    let tot = 0;
    const ws = list.map(k => { let w = ORGANS[k].w; if (k === 'eyes' && pr.eye) w *= .15; if ((k === 'eyes' || k === 'face') && pr.face) w *= .2; tot += w; return w; });
    let r = Math.random() * tot, key = list[0];
    for (let j = 0; j < list.length; j++) { r -= ws[j]; if (r <= 0) { key = list[j]; break; } }
    const c = O[key];
    let dm = d * ORGANS[key].m * sc * (.5 + Math.min(1, pen / 4) * .7) * (i ? .6 : 1);
    if (part === 'legL' || part === 'legR') dm *= 1 - pr.legAbs;
    if (dm < 2) continue;
    const before = orgState(c.hp);
    c.hp = Math.max(0, c.hp - dm);
    const after = orgState(c.hp);
    if (after > before) {
      organNotice(t, key, after);
      if (key === 'brain' && after === 3) dead = true;
      if (key === 'heart' && after === 3 && !(t.arrest > 0)) t.arrest = 7;
      if ((key === 'skull' || key === 'brain') && after >= 2) { if (t === player) t.conc = Math.max(t.conc || 0, 2.5); else t.stun = Math.max(t.stun || 0, 1.6); }
    }
  }
  return dead;
}

// onde a bala acertou (referencial do alvo: laterais = braços; resto sorteado)
function rollPart(t, bx, by, bias) {
  const rx = bx - t.x, ry = by - t.y;
  const lat = (rx * -Math.sin(t.ang) + ry * Math.cos(t.ang)) / t.r;
  if (Math.abs(lat) > .62) return lat < 0 ? 'armL' : 'armR';
  const r = Math.random(), hb = bias || 0;
  if (r < .16 + hb) return 'head';
  if (r < .66 + hb) return 'torso';
  return Math.random() < .5 ? 'legL' : 'legR';
}
function rollMeleePart() {
  const r = Math.random();
  return r < .2 ? 'head' : r < .7 ? 'torso' : r < .78 ? 'armL' : r < .86 ? 'armR' : r < .93 ? 'legL' : 'legR';
}

function armorAbsorb(t, part, dmg, pen) {
  if (t === player) {
    const slot = part === 'head' ? 'head' : (part === 'torso' || part === 'armL' || part === 'armR') ? 'body' : null;
    if (!slot) { const lg = (part === 'legL' || part === 'legR') && gearOf('legs'); return lg && lg.legAbs ? dmg * (1 - lg.legAbs) : dmg; }
    const a = t.armor[slot];
    if (!a || a.dur <= 0) return dmg;
    const def = GMAP[a.id];
    let abs = def.abs * (part === 'armL' || part === 'armR' ? .5 : 1);
    if (pen >= def.cls) abs *= clamp(1 - (pen - def.cls) * .3, .25, 1);
    const take = Math.min(dmg * abs, a.dur);
    a.dur -= take;
    sparks(t.x, t.y, rand(0, PI2), '#8fdcff', 2);
    return dmg - take;
  }
  const ty = t.ty;
  if ((part === 'legL' || part === 'legR') && ty.legAbs) return dmg * (1 - ty.legAbs);
  let abs = part === 'head' ? ty.helm : part === 'torso' ? ty.armor : (part === 'armL' || part === 'armR') ? ty.armor * .5 : 0;
  if (abs > 0) {
    if (pen >= ty.cls) abs *= clamp(1 - (pen - ty.cls) * .3, .25, 1);
    if (dmg * abs > 3) sparks(t.x, t.y, rand(0, PI2), '#8fdcff', 2);
    return dmg * (1 - abs);
  }
  return dmg;
}

const PART_LBL = { head: 'CABEÇA', torso: 'TRONCO', armL: 'BRAÇO', armR: 'BRAÇO', legL: 'PERNA', legR: 'PERNA' };
// aplica dano a uma parte; retorna true se o alvo morreu
function applyHit(t, part, dmg, o) {
  if (t.dead) return false;
  if (t === player && MP.on && G.protT > 0) return false;
  if (t.mpId != null) t.lastBy = G.src != null ? G.src : MP.myId;
  const P = t.parts[part];
  const d = armorAbsorb(t, part, dmg * PART_MUL[part], o.pen || 0);
  if (d <= .01) { if (t === player) sfx('armor'); return false; }
  const before = stateOf(P.hp / P.max);
  P.hp -= d;
  if (P.hp < 0) { const over = -P.hp; P.hp = 0; if (part !== 'head' && part !== 'torso') t.parts.torso.hp -= over * .35; }
  const after = stateOf(P.hp / P.max);
  t.showT = 3; t.lastPart = part;
  const orgDead = hitOrgans(t, part, d, o);
  recalcFx(t);
  { const ha = o.ang || 0, force = d * .6 + (o.pen || 0) * 14; t.lastAng = ha; t.lastForce = force; if (t === player) { G.lastAng = ha; G.lastForce = force; } if (d > 6) bloodWall(t.x, t.y, ha, t.L, d, part === 'head'); }

  // sangue e efeitos
  const ang = o.ang || 0, big = d > 18;
  bloodBurst(t.x, t.y, ang + Math.PI, 2, t.L, false);                        // entrada
  bloodBurst(t.x + Math.cos(ang) * 6, t.y + Math.sin(ang) * 6, ang, big ? 9 : 5, t.L, big);   // saída
  if (after > before && after >= 2) {
    addText(t.x, t.y - t.r - 18, PART_LBL[part] + ' ' + STATE_NAME[after].toUpperCase(), STATE_COL[after], 11);
    if (after === 4 && part !== 'head' && part !== 'torso') bloodBurst(t.x, t.y, rand(0, PI2), 14, t.L, true);
  }
  if (t.parts.head.hp <= 0 || t.parts.torso.hp <= 0 || orgDead) {
    if (t === player) die(ang); else killEnemy(t, ang, orgDead ? 'head' : part);
    return true;
  }
  if (t === player) { G.hurtFlash = Math.min(1, G.hurtFlash + d / 28); shake(2.5); sfx('hurt'); }
  return false;
}
function blastHit(t, dmg, ang) {
  const o = { pen: .6, ang };
  if (applyHit(t, 'torso', dmg * .6, o)) return;
  const limbs = ['armL', 'armR', 'legL', 'legR'].sort(() => Math.random() - .5);
  for (let i = 0; i < 2; i++) if (applyHit(t, limbs[i], dmg * .38, o)) return;
  if (Math.random() < .25) applyHit(t, 'head', dmg * .2, o);
}
function bleedTick(t, dt) {
  if (t.arrest > 0 && !t.dead) {
    t.arrest -= dt;
    if (t.arrest <= 0) { t.arrest = 0; if (t === player) die(0); else killEnemy(t, 0, 'torso'); return; }
  }
  if (t.bleed > 0 && !t.dead) {
    t.parts.torso.hp -= t.bleed * dt * (t.maxHp / 100) * .55;
    if (Math.random() < dt * 2.2 * Math.min(3, t.bleed)) addDecal({ k: 'blood', x: t.x + rand(-4, 4), y: t.y + rand(-4, 4), r: rand(1.5, 3.5), a: .65, L: t.L });
    if (Math.random() < dt * 6) spawnPart({ x: t.x, y: t.y, vx: rand(-15, 15), vy: rand(-15, 15), life: .4, size: 1.6, color: '#8a1010', drag: 4, layer: 0, L: t.L });
    t.hp = vitalHp(t);
    if (t.parts.torso.hp <= 0) { if (t === player) die(0); else killEnemy(t, 0, 'torso'); }
  }
}

/* =====================================================================
   JOGADOR
   ===================================================================== */
const gearOf = slot => LD.gear[slot] ? GMAP[LD.gear[slot]] : null;
const ammoCap = cal => Math.round(CALIBERS[cal].cap * (player ? player.capMul : 1));
const curSlot = () => player.slots[player.wi];
const curW = () => { const s = curSlot(); return s ? s.w : null; };
const poolOf = w => w.inf ? Infinity : (player.pool[w.cal] || 0);

// tudo que está carregando: armas (nas mãos e nas costas), acessórios, munição, equipamento e suprimentos
function playerKg(p) {
  let kg = 0;
  for (const sl of p.slots) if (sl) { kg += weaponKg(sl.id, LD.attach && LD.attach[sl.id]); if (!sl.w.melee && !sl.w.inf) kg += sl.mag * ammoKg(sl.cal); }
  for (const c in p.pool) kg += p.pool[c] * ammoKg(c);
  for (const s of ['head', 'body', 'legs', 'back', 'eyes']) { const gr = gearOf(s); if (gr) kg += gr.kg; }
  kg += p.cons.grenade * .45 + p.cons.med * .5 + p.cons.repair * .6;
  for (const k in p.thr) kg += p.thr[k] * .4;
  for (const k in p.hl) kg += p.hl[k] * .15;
  return kg;
}
function recalcPlayer() {
  const p = player;
  const legs = gearOf('legs'), back = gearOf('back'), eyes = gearOf('eyes'), head = gearOf('head'), body = gearOf('body');
  p.speedMul = 1 + (legs ? legs.spd : 0);
  p.capMul = back ? back.capMul : 1;
  p.consBonus = (back ? back.cons : 0) + (body && body.cons || 0);
  p.consCap = 4 + 2 * p.consBonus;
  p.visMode = eyes && eyes.mode || null;
  p.eyeVis = eyes && eyes.vis || 0;
  p.eyeThermal = eyes && eyes.thermal || 0;
  p.eyeZoom = eyes && eyes.zoom || 0;
  p.flashRes = eyes && eyes.flashRes || 0;
  p.blastMul = (1 - (head && head.blast || 0) * .35) * (1 - (body && body.blast || 0));
  if (!p.visMode) G.visOn = false;
  for (const cal in p.pool) p.pool[cal] = Math.min(p.pool[cal], ammoCap(cal));
  for (const k in p.cons) p.cons[k] = Math.min(p.cons[k], p.consCap);
}
// alcance de visão efetivo (à noite, sem visão noturna, enxerga pouco)
function visRadius() {
  const p = player;
  const fv = p.fx ? p.fx.vis : 1;
  if (G.visOn && p.visMode) return (BASE_VIS + p.eyeVis) * fv;
  return (G.night ? 330 : BASE_VIS) * fv;
}
const thermalRadius = () => Math.max(G.visOn ? player.eyeThermal : 0, (curW() && curW().thermalR) || 0);

function syncPlayerLoadout() {
  const p = player;
  for (let i = 0; i < 3; i++) {
    const id = LD.weapons[i] || null, cur = p.slots[i];
    if (cur && cur.id === id) { cur.w = effW(id, cur.cal); continue; }
    if (cur && !cur.w.melee && !cur.w.inf) p.pool[cur.w.cal] = Math.min(ammoCap(cur.w.cal), (p.pool[cur.w.cal] || 0) + cur.mag);
    if (id) {
      const w = effW(id);
      if (w.melee) p.slots[i] = { id, mag: 1, w, cal: null };
      else {
        const take = w.inf ? w.mag : Math.min(w.mag, p.pool[w.cal] || 0);
        if (!w.inf) p.pool[w.cal] = (p.pool[w.cal] || 0) - take;
        p.slots[i] = { id, mag: take, w, cal: w.cal };
      }
    } else p.slots[i] = null;
  }
  for (const slot of ['head', 'body']) {
    const id = LD.gear[slot], cur = p.armor[slot];
    if (cur && cur.id === id) continue;
    if (cur) p.durMap[cur.id] = cur.dur;
    p.armor[slot] = id ? { id, dur: p.durMap[id] != null ? p.durMap[id] : GMAP[id].dur } : null;
  }
  p.reloading = false;
  recalcPlayer();
  if (!p.slots[p.wi]) { const f = p.slots.findIndex(s => s); p.wi = f < 0 ? 0 : f; }
  if (typeof buildSlots === 'function') buildSlots();
}

function newPlayer() {
  const p = {
    x: spawnT.x * T + T / 2, y: spawnT.y * T + T / 2, r: 11, ang: -Math.PI / 4, L: -1,
    hp: 100, maxHp: 100, parts: makeParts(100), wi: 0, slots: [null, null, null], pool: {}, cons: { med: 2, grenade: 2, repair: 1 }, thr: { flash: 1, smoke: 1, molotov: 1, flare: 1, mine: 1 }, thrSel: 'frag',
    kg: 0, wMul: 1, loadT: 0, equipT: 0, healing: null, healSel: 'medkit', hl: { bandage: 2, painkiller: 1, adrenaline: 1, splint: 1, surgery: 0 }, regen: 0, adr: 0,
    armor: { head: null, body: null }, durMap: {}, cool: 0, reloading: false, reloadT: 0, flash: 0, recoil: 0,
    walk: 0, moving: false, dead: false, speed: 185 * PACE.player, gCd: 0, mCd: 0, speedMul: 1, capMul: 1, consBonus: 0, consCap: 4,
    visMode: null, eyeVis: 0, eyeThermal: 0,
    rcN: 0, rcMag: 0, rcOff: 0, rcPhase: Math.random() * 6, rcT: 0, burstLeft: 0, burstT: 0, spin: 0, kvx: 0, kvy: 0,
    reloadStage: 0, reloadTotal: 1, walking: false, lastFlame: 0, melee: null, stairCd: 0, bleed: 0, showT: 0, lastPart: 'torso', fx: null,
  };
  player = p;
  recalcFx(p);
  recalcPlayer();
  p.cons.med = Math.min(p.consCap, 2 + p.consBonus); p.cons.grenade = Math.min(p.consCap, 2 + p.consBonus); p.cons.repair = Math.min(p.consCap, 1 + p.consBonus);
  LD.weapons.forEach(id => {
    if (!id) return;
    const w = WMAP[id]; if (w.melee || w.inf) return;
    p.pool[w.cal] = Math.min(ammoCap(w.cal), (p.pool[w.cal] || 0) + w.mag * 4);
    // escopetas: um pacote de cada tipo de cartucho compatível (troque com a tecla B)
    if (w.fam) for (const c of SHELL_FAMILIES[w.fam]) if (c !== w.cal) p.pool[c] = Math.min(ammoCap(c), (p.pool[c] || 0) + CALIBERS[c].pack * (G.custom ? 3 : 1));
  });
  if (G.custom) { for (const k in p.thr) p.thr[k] = 3; p.cons.grenade = Math.min(p.consCap, 4); p.cons.med = Math.min(p.consCap, 4); for (const k in p.hl) p.hl[k] = k === 'surgery' ? 2 : 3; }
  syncPlayerLoadout();
  return p;
}
function die(ang) {
  const p = player;
  if (p.dead) return;
  p.dead = true; p.hp = 0;
  addDecal({ k: 'corpse', x: p.x, y: p.y, ang: p.ang, who: 'player', L: p.L, ...corpseKick(G.lastForce || 0, G.lastAng != null ? G.lastAng : (ang || 0)) });
  addDecal({ k: 'pool', x: p.x, y: p.y, r: 6, max: 20, a: .8, L: p.L });
  bloodBurst(p.x, p.y, ang || 0, 16, p.L, true);
  G.endTimer = 1.6; G.won = false;
  if (!G.reason) G.reason = 'Você foi abatido';
  if (MP.on) mpLocalDied();
}

function selectWeapon(i) {
  const p = player;
  if (!p || p.dead || G.state !== 'play' || i === p.wi || i < 0 || i >= 3 || !p.slots[i]) return;
  p.wi = i; p.reloading = false; p.burstLeft = 0; p.rcMag = 0; p.rcN = 0; p.rcOff = 0; p.spin = 0; p.healing = null;
  const ns = p.slots[i];
  p.equipT = ns.w.eq || .6; sfx('swap');
  if (!ns.w.melee && ns.mag === 0 && poolOf(ns.w) > 0) p.autoReload = true;     // arma vazia: carrega assim que estiver pronta
  p.cool = Math.max(p.cool, .2);
  showWeaponName(p.slots[i].w.name);
}
function startReload() {
  const p = player, sl = curSlot();
  if (!sl || p.reloading || p.dead || sl.w.melee) return;
  const w = sl.w;
  if (sl.mag >= w.mag || poolOf(w) <= 0) return;
  if (p.equipT > 0) { p.autoReload = true; return; }
  p.healing = null;
  p.reloading = true; p.burstLeft = 0;
  const slow = (p.fx.oneArm && w.slot === 'primary' ? 1.4 : 1) * (p.fx.reloadMul || 1);
  p.reloadT = w.reload * slow; p.reloadTotal = p.reloadT;
  p.reloadStage = w.reloadType === 'shell' ? 1 : 0;
  sfx(w.reloadType === 'shell' ? 'shell' : 'reload');
}
// estilo CS2: o carregador sai junto com as balas que sobraram nele
// estilo do carregador de cada arma
function magStyle(w) {
  const o = typeof w.shape === 'object' ? w.shape : {};
  if (w.shape === 'pistol') return w.grp === 'Pistolas automáticas' ? 'pistolx' : 'pistol';
  if (w.grp === 'Escopetas') return 'shotmag';
  if (w.shape === 'minigun') return 'drum';
  if (w.grp === 'Metralhadoras') return w.mag >= 70 ? (w.id === 'rpd' ? 'drum' : 'belt') : 'box';
  if (w.id === 'bizon') return 'helical';
  if (o.mag && w.mag >= 45) return 'drum';
  if (w.grp === 'Submetralhadoras') return 'smg';
  if (['7.62x39', '5.45', '7.92k', '5.8'].includes(w.cal) || o.wood) return 'ak';
  if (w.grp === 'Fuzis de batalha' || w.grp === 'Atiradores designados' || w.grp === 'Snipers') return 'box';
  return 'stanag';
}
const MAG_LEN = { pistol: 7, pistolx: 10, smg: 14, stanag: 14, ak: 15, box: 17, drum: 13, belt: 14, helical: 17, shotmag: 13 };
function dropMagazine() {
  const p = player, sl = curSlot(), w = sl.w;
  const lost = sl.mag;
  sl.mag = 0;
  const col = CALIBERS[w.cal].color;
  if (w.shape === 'revolver' || w.shape === 'dupla') {
    for (let i = 0; i < w.mag; i++) {
      const a = p.ang + Math.PI / 2 + rand(-1.2, 1.2);
      spawnPart({ x: p.x, y: p.y, vx: Math.cos(a) * rand(50, 150), vy: Math.sin(a) * rand(50, 150), life: 40, size: 2, color: col, cal: w.cal, drag: 4, kind: 'casing', rot: rand(0, PI2), vr: rand(-14, 14), layer: 0, L: p.L });
    }
  } else if (!w.flame) {
    const a = p.ang + Math.PI / 2 * (Math.random() < .5 ? 1 : -1) + rand(-.4, .4);
    spawnPart({ x: p.x, y: p.y, vx: Math.cos(a) * rand(70, 120), vy: Math.sin(a) * rand(70, 120), life: 40, size: MAG_LEN[magStyle(w)] || 10, color: col, ms: magStyle(w), mcol: typeof w.shape === 'object' ? w.shape.bc : '#2a2d31', wood: typeof w.shape === 'object' && !!w.shape.wood, drag: 5, kind: 'mag', rot: p.ang, vr: rand(-9, 9), layer: 0, L: p.L });
  }
  if (lost > 0) addText(p.x, p.y - 30, '-' + lost + ' balas', '#ff8a70', 12);
  sfx('magdrop');
}
// troca o tipo de cartucho (escopetas): devolve os cartuchos carregados e recarrega com o próximo tipo disponível
function cycleAmmoType() {
  const p = player;
  if (!p || p.dead || G.state !== 'play') return;
  const sl = curSlot();
  if (!sl || !sl.w.fam) return;
  const fam = SHELL_FAMILIES[sl.w.fam], opts = fam.filter(c => c === sl.cal || (p.pool[c] || 0) > 0);
  if (opts.length < 2) { addText(p.x, p.y - 26, 'SÓ HÁ UM TIPO DE CARTUCHO', '#ffb070', 11); return; }
  const next = opts[(opts.indexOf(sl.cal) + 1) % opts.length];
  p.pool[sl.cal] = Math.min(ammoCap(sl.cal), (p.pool[sl.cal] || 0) + sl.mag);
  sl.mag = 0; sl.cal = next; sl.w = effW(sl.id, next);
  p.reloading = false; sfx('swap');
  banner(CALIBERS[next].name.toUpperCase());
  startReload();
}
function finishReload() {
  const p = player, sl = curSlot(), w = sl.w;
  const take = Math.min(w.mag, poolOf(w));
  sl.mag = take; if (!w.inf) p.pool[w.cal] -= take;
  p.reloading = false;
}
function fallbackSlot() {
  return player.slots.findIndex((s, i) => s && i !== player.wi && !s.w.melee && (s.mag > 0 || poolOf(s.w) > 0));
}

function fireShot(w, sl) {
  const p = player;
  if (!G.infAmmo) sl.mag--;
  if (!w.flame) G.shots += w.pellets;
  const mult = (p.moving ? 1.35 * w.moveSpread : 1) * (p.walking ? .6 : 1);
  const base = p.ang + p.rcOff;                   // recuo desloca a direção real do tiro
  const n = w.flame ? 2 : w.pellets;
  const cal = CALIBERS[w.cal];
  const aimFx = p.fx.aim + (p.fx.oneArm && w.slot === 'primary' ? .06 : 0);
  const b0 = bullets.length;
  p.healing = null;
  if (MP.on) G.protT = 0;
  for (let i = 0; i < n; i++) {
    const a = base + (w.pellets > 1 ? (i / (w.pellets - 1) - .5) * w.spread * 2 + rand(-.03, .03) : rand(-1, 1) * (w.spread * mult + aimFx));
    bullets.push({
      x: p.x + Math.cos(p.ang) * 10, y: p.y + Math.sin(p.ang) * 10, dx: Math.cos(a), dy: Math.sin(a),
      speed: w.speed * (w.pellets > 1 || w.flame ? rand(.85, 1.05) : 1), dmg: w.dmg, range: w.range * (w.flame ? rand(.8, 1.1) : 1), dist: 0, from: 'p', L: p.L,
      id: w.id, mz: w.muzzle, pw: w.flame ? 99 : cal.pen + (w.ap || 0), rocket: !!w.rocket, radius: w.radius || 0, breaks: !!w.breaks, hit: null,
      sup: !!w.sup, flame: !!w.flame, inc: !!w.inc, stunS: w.stunS || 0, fragR: w.fragR || 0, tx: -1, ty: -1, col: cal.color,
    });
  }
  p.flash = (w.sup ? .03 : .07) * (w.flashMul || 1) + .01; p.recoil = 1;
  if (MP.on) mpSendShots(bullets.slice(b0));

  // recuo: padrão de spray que se acumula e desloca os próximos tiros
  const [step, max, freq] = w.rcv;
  p.rcT = 0; p.rcN++;
  p.rcMag = Math.min(max, p.rcMag + step * (w.bipod && !p.moving ? .6 : 1));
  p.rcOff = p.rcMag * Math.sin(p.rcN * freq + p.rcPhase);
  G.kx -= Math.cos(p.ang) * w.kick * 1.4; G.ky -= Math.sin(p.ang) * w.kick * 1.4;
  if (w.push) { p.kvx -= Math.cos(p.ang) * w.push * 60; p.kvy -= Math.sin(p.ang) * w.push * 60; }
  shake(w.kick * (p.walking ? .6 : 1));

  if (w.flame) { if (G.time - p.lastFlame > .12) { sfx('flame'); p.lastFlame = G.time; } }
  else if (w.rocket) sfx('rpg');
  else gunshot(w, 1, true);
  if (!w.rocket && !w.flame && w.shape !== 'revolver' && w.shape !== 'dupla') {
    const a = p.ang + Math.PI / 2 + rand(-.4, .4);
    spawnPart({ x: p.x + Math.cos(p.ang) * 8, y: p.y + Math.sin(p.ang) * 8, vx: Math.cos(a) * rand(60, 130), vy: Math.sin(a) * rand(60, 130), life: 1.4, size: 2, color: w.pellets > 1 ? '#d95a5a' : cal.color, cal: w.cal, drag: 4, kind: 'casing', rot: rand(0, PI2), vr: rand(-12, 12), layer: 0, L: p.L });
  } else if (w.rocket) {
    for (let i = 0; i < 8; i++) { const a = p.ang + Math.PI + rand(-.6, .6); spawnPart({ x: p.x, y: p.y, vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200), life: rand(.3, .6), size: rand(5, 9), grow: 8, color: 'rgba(150,150,150,1)', drag: 3, kind: 'smoke' }); }
  }
  makeNoise(p.x, p.y, w.noise * (p.walking ? .5 : 1));
  if (sl.mag === 0 && poolOf(w) > 0) p.autoReload = true;
}

function tryFire() {
  const p = player, sl = curSlot();
  if (!sl || p.dead || p.cool > 0 || p.burstLeft > 0 || p.melee || p.equipT > 0) return;
  if (MP.on && MP.phase === 'prep') return;
  const w = sl.w;
  if (w.melee) { tryMelee(w); return; }
  if (p.fx.armsDead) return;
  if (p.reloading) { if (w.reloadType === 'shell' && sl.mag > 0) p.reloading = false; else return; }
  if (sl.mag <= 0) {
    if (poolOf(w) > 0) startReload();
    else { sfx('empty'); p.cool = .25; const alt = fallbackSlot(); if (alt >= 0) selectWeapon(alt); addText(p.x, p.y - 26, 'SEM MUNIÇÃO', '#ff8a70', 12); }
    return;
  }
  if (w.spin && p.spin < .3) return;               // minigun precisa girar o cano
  fireShot(w, sl);
  p.cool = w.spin ? .3 + (w.delay - .3) * p.spin : w.delay;
  if (w.burst && sl.mag > 0) { p.burstLeft = w.burst - 1; p.burstT = w.bd; }
}

/* ---------- Corpo a corpo ---------- */
function tryMelee(w) {
  const p = player;
  if (p.cool > 0 || p.melee || p.dead || p.fx.armsDead || (MP.on && MP.phase === 'prep')) return;
  p.healing = null;
  p.melee = { t: 0, dur: w.swing, hit: false, w, ang: p.ang };
  p.cool = w.delay; sfx('swing');
}
function quickMelee() {
  const p = player;
  if (!p || p.dead || G.state !== 'play') return;
  const sl = p.slots[2];
  if (sl) tryMelee(sl.w);
}
// golpeia alvos no arco à frente
function meleeStrike(att, w, ang) {
  const hits = [];
  for (const e of enemies) {
    if (e.dead || e.L !== att.L || (MP.on && e.mpId != null && mpFriend(e.mpId))) continue;
    const d = Math.hypot(e.x - att.x, e.y - att.y);
    if (d > w.range + e.r) continue;
    if (e.mpId != null) e.lastW = w.id;
    if (Math.abs(angDiff(Math.atan2(e.y - att.y, e.x - att.x), ang)) > w.arc / 2 + Math.min(.6, e.r / Math.max(d, 1))) continue;
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  if (!w.sweep) hits.length = Math.min(1, hits.length);
  let any = false;
  for (const h of hits) {
    const e = h.e; any = true;
    const unaware = e.state !== 'attack';
    const behind = Math.abs(angDiff(e.ang, Math.atan2(att.y - e.y, att.x - e.x))) > 2;
    let dmg = w.dmg, part;
    if (behind && unaware) { dmg *= w.back || 3; part = Math.random() < .5 ? 'head' : 'torso'; addText(e.x, e.y - e.r - 24, 'ABATE SILENCIOSO', '#ffd24a', 12); }
    else part = rollMeleePart();
    const killed = applyHit(e, part, dmg, { pen: 3, ang });
    sfx('melee'); G.hitMark = .18; G.hitCol = part === 'head' ? '#ffd24a' : '#fff'; G.hits++;
    bloodBurst(e.x, e.y, ang, 8, e.L, true);
    if (!killed) {
      if (w.knock) { e.kvx = (e.kvx || 0) + Math.cos(ang) * w.knock * 4; e.kvy = (e.kvy || 0) + Math.sin(ang) * w.knock * 4; }
      if (w.stun) e.stun = Math.max(e.stun || 0, w.stun);
      if (e.state !== 'attack') { e.state = 'attack'; e.react = .4; e.mark = 1; e.markType = '!'; e.tgt = player; e.lastKnown = { x: player.x, y: player.y }; e.path = null; }
    }
  }
  // quebra obstáculos à frente (machados, marreta, pé de cabra)
  if (w.breaks) {
    for (const dd of [w.range * .6, w.range]) {
      const tx = Math.floor((att.x + Math.cos(ang) * dd) / T), ty = Math.floor((att.y + Math.sin(ang) * dd) / T), k = kindF(tx, ty, att.L);
      if (k === K.CRATE) { destroyCrate(tx, ty, att.L); any = true; break; }
      if (k === K.WINDOW) { breakWindow(tx, ty, att.L); any = true; break; }
      if (k === K.DOOR) { breakDoor(tx, ty, att.L); any = true; break; }
    }
  }
  if (MP.on && att === player) { G.protT = 0; mpMelee(w, ang); }
  makeNoise(att.x, att.y, any ? w.noise : w.noise * .3);
  if (any) shake(2);
}

function hurtPlayerBullet(b) {
  if (MP.on && b.owner != null) { if (mpFriend(b.owner)) return; G.lastHitBy = b.owner; G.lastHitW = b.id; G.lastHitT = G.time; }
  const part = rollPart(player, b.x, b.y);
  applyHit(player, part, b.dmg, { pen: b.pw, ang: Math.atan2(b.dy, b.dx) });
}

/* ---------- Suprimentos ---------- */
const healCount = (p, id) => id === 'medkit' ? p.cons.med : (p.hl[id] || 0);
function healNeed(p, id) {
  const O = p.parts.org, hurt = PARTS.some(k => p.parts[k].hp < p.parts[k].max * .98) || Object.keys(O).some(k => O[k].hp < 70);
  if (id === 'adrenaline') return p.adr <= 0 || p.arrest > 0;
  if (id === 'splint') return ['armL', 'armR', 'legL', 'legR'].some(k => p.parts[k].hp < p.parts[k].max * .7) || Object.keys(O).some(k => ORGANS[k].bone && O[k].hp < 70);
  if (id === 'painkiller') return hurt && p.regen <= 0;
  return hurt;
}
function cycleHeal() {
  const p = player;
  if (!p || p.dead || G.state !== 'play') return;
  const i = HEALS.findIndex(h => h.id === p.healSel);
  for (let k = 1; k <= HEALS.length; k++) { const h = HEALS[(i + k) % HEALS.length]; if (healCount(p, h.id) > 0) { p.healSel = h.id; break; } }
  sfx('swap'); banner(HMAP[p.healSel].icon + ' ' + HMAP[p.healSel].name.toUpperCase() + ' · ' + HMAP[p.healSel].time + 's');
}
// inicia o tratamento: cada item leva o seu tempo; atirar, golpear, arremessar ou trocar de arma interrompe
function useMed() {
  const p = player;
  if (!p || p.dead || G.state !== 'play') return;
  if (p.healing) { p.healing = null; addText(p.x, p.y - 26, 'INTERROMPIDO', '#ffb070', 11); return; }
  let id = p.healSel;
  if (healCount(p, id) <= 0) { const alt = HEALS.find(h => healCount(p, h.id) > 0 && healNeed(p, h.id)); if (!alt) { addText(p.x, p.y - 26, 'SEM ' + HMAP[id].name.toUpperCase(), '#ff8a70', 12); return; } id = p.healSel = alt.id; }
  if (!healNeed(p, id)) { addText(p.x, p.y - 26, id === 'adrenaline' ? 'JÁ ATIVA' : 'NADA A TRATAR', '#cfe8c8', 11); return; }
  p.reloading = false;
  p.healing = { id, t: 0, total: HMAP[id].time }; sfx('swap');
}
function finishHeal(p, id) {
  const P = p.parts, lift = (k, frac) => { if (P[k].hp > 0) P[k].hp = Math.min(P[k].max, P[k].hp + P[k].max * frac); };
  const O = P.org, fixO = (pred, to) => { for (const k in O) if (pred(k)) O[k].hp = Math.max(O[k].hp, to); };
  if (id === 'bandage') { for (const k of PARTS) { if (P[k].hp > 0 && P[k].hp < P[k].max * .56) P[k].hp = P[k].max * .56; else lift(k, .08); } fixO(k => !ORGANS[k].bone && k !== 'brain' && k !== 'heart' && k !== 'lungs', 70); }
  else if (id === 'painkiller') { p.regen = 10; p.numb = 40; }
  else if (id === 'adrenaline') { p.adr = 12; lift('torso', .12); lift('head', .12); if (p.arrest > 0) { p.arrest = 0; O.heart.hp = Math.max(O.heart.hp, 30); } }
  else if (id === 'splint') { for (const k of ['armL', 'armR', 'legL', 'legR']) { if (P[k].hp <= 0) P[k].hp = P[k].max * .5; else lift(k, .2); } fixO(k => ORGANS[k].bone && k !== 'spine' && k !== 'skull', 60); }
  else if (id === 'medkit') healAll(p, .5);
  else if (id === 'surgery') { for (const k of PARTS) if (P[k].hp > 0 || (k !== 'head' && k !== 'torso')) P[k].hp = P[k].max; fixO(k => k !== 'brain' || O.brain.hp > 0, 88); p.arrest = 0; }
  recalcFx(p);
  if (id === 'medkit') p.cons.med--; else p.hl[id]--;
  addText(p.x, p.y - 24, HMAP[id].name.toUpperCase() + ' APLICADO', '#8be36a', 12); sfx('heal');
  for (let i = 0; i < 10; i++) spawnPart({ x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), vx: rand(-20, 20), vy: rand(-60, -20), life: .8, size: 2.5, color: '#8be36a', kind: 'dot' });
  if (healCount(p, id) <= 0) { const nx = HEALS.find(h => healCount(p, h.id) > 0); if (nx) p.healSel = nx.id; }
}
function updateHeal(p, dt) {
  if (p.adr > 0) p.adr -= dt;
  if (p.conc > 0) p.conc -= dt;
  if (p.numb > 0) { p.numb -= dt; if (p.numb <= 0) recalcFx(p); }
  const fx = p.fx;
  if (fx && fx.dizzy > 0 && Math.random() < dt * 1.2) shake(2 + fx.dizzy * 5);
  if (fx && fx.cough && !p.walking) {
    p.coughT = (p.coughT == null ? rand(2, 4) : p.coughT) - dt;
    if (p.coughT <= 0) { p.coughT = rand(3.5, 7); makeNoise(p.x, p.y, 260); addText(p.x, p.y - 26, '*TOSSE*', '#d9857a', 11); bloodBurst(p.x, p.y, p.ang, 3, p.L, false); shake(3); }
  }
  if (p.regen > 0) { p.regen -= dt; for (const k of PARTS) { const Q = p.parts[k]; if (Q.hp > 0 && Q.hp < Q.max) Q.hp = Math.min(Q.max, Q.hp + Q.max * .03 * dt); } recalcFx(p); }
  const h = p.healing; if (!h) return;
  h.t += dt;
  if (Math.random() < dt * 8) spawnPart({ x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), vx: 0, vy: rand(-40, -15), life: .5, size: 2, color: '#8be36a', kind: 'dot' });
  if (h.t >= h.total) { p.healing = null; finishHeal(p, h.id); }
}
function useRepair() {
  const p = player;
  if (!p || p.dead || G.state !== 'play' || p.cons.repair <= 0) return;
  let any = false;
  for (const slot of ['head', 'body']) {
    const a = p.armor[slot];
    if (a) { const max = GMAP[a.id].dur; if (a.dur < max) { a.dur = Math.min(max, a.dur + max * .6); any = true; } }
  }
  if (!any) return;
  p.cons.repair--; addText(p.x, p.y - 24, 'COLETE REPARADO', '#8fdcff', 12); sfx('heal');
}
const thrCount = (p, id) => id === 'frag' ? p.cons.grenade : p.thr[id];
function cycleThrowable() {
  const p = player;
  if (!p || G.state !== 'play') return;
  const order = THROWABLES.map(t => t.id);
  const i = order.indexOf(p.thrSel);
  for (let k = 1; k <= order.length; k++) { const id = order[(i + k) % order.length]; if (thrCount(p, id) > 0) { p.thrSel = id; break; } }
  sfx('swap'); banner(TMAP[p.thrSel].name.toUpperCase());
}
function throwGrenade() {
  const p = player;
  if (!p || p.dead || G.state !== 'play' || p.gCd > 0 || p.fx.armsDead || (MP.on && MP.phase === 'prep')) return;
  const id = p.thrSel;
  if (thrCount(p, id) <= 0) { addText(p.x, p.y - 26, 'SEM ' + TMAP[id].short.toUpperCase(), '#ff8a70', 12); p.gCd = .4; return; }
  p.healing = null;
  if (id === 'mine') {
    const mn = { x: p.x + Math.cos(p.ang) * 16, y: p.y + Math.sin(p.ang) * 16, L: p.L, ang: p.ang, arm: 1.5, owner: MP.on ? MP.myId : undefined };
    mines.push(mn); if (MP.on) mpSendThrow(mn, true);
    p.thr.mine--; p.gCd = .8; sfx('crate'); addText(p.x, p.y - 24, 'MINA PLANTADA', '#ffb070', 12); return;
  }
  let dist = 300;
  if (!touchMode) dist = Math.hypot(cam.x + input.mx / S - p.x, cam.y + input.my / S - p.y);
  else if (sticks.aim.id !== null) dist = 120 + Math.min(1, Math.hypot(sticks.aim.x, sticks.aim.y)) * 320;
  dist = clamp(dist, 90, 440);
  const v = dist * 2.2;
  if (id === 'frag') p.cons.grenade--; else p.thr[id]--;
  p.gCd = .6; sfx('throw');
  const gr = { x: p.x + Math.cos(p.ang) * 14, y: p.y + Math.sin(p.ang) * 14, vx: Math.cos(p.ang) * v, vy: Math.sin(p.ang) * v, t: TMAP[id].fuse, kind: id, L: p.L, owner: MP.on ? MP.myId : undefined };
  grenades.push(gr);
  if (MP.on) { G.protT = 0; mpSendThrow(gr, false); }
}
function flashBang(g) {
  sfx('explosion'); flashes.push({ x: g.x, y: g.y, r: 150, life: .3, max: .3, L: g.L });
  if (!G.eSide) for (const e of enemies) {
    if (e.dead || e.L !== g.L) continue;
    const d = Math.hypot(e.x - g.x, e.y - g.y);
    if (d < 210 && hasLOS(g.x, g.y, e.x, e.y, g.L)) { e.stun = Math.max(e.stun, 3.8 * (1 - d / 280)); e.mark = 1.5; e.markType = '?'; }
  }
  const p = player;
  if (p.L === g.L) { const d = Math.hypot(p.x - g.x, p.y - g.y); if (d < 210 && hasLOS(g.x, g.y, p.x, p.y, g.L)) G.flashT = Math.max(G.flashT || 0, 3 * (1 - d / 280) * (1 - (p.flashRes || 0))); }
  makeNoise(g.x, g.y, 600);
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t -= dt;
    const dr = Math.exp(-2.2 * dt); g.vx *= dr; g.vy *= dr;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
    if (solidF(Math.floor(nx / T), Math.floor(g.y / T), g.L)) { g.vx *= -.5; nx = g.x; }
    if (solidF(Math.floor(nx / T), Math.floor(ny / T), g.L)) { g.vy *= -.5; ny = g.y; }
    g.x = nx; g.y = ny;
    if (g.t > 0) continue;
    grenades.splice(i, 1);
    G.src = g.owner; G.eSide = g.by === 'e' && g.owner == null;
    switch (g.kind) {
      case 'flash': flashBang(g); break;
      case 'smoke': smokes.push({ x: g.x, y: g.y, r: 72, t: 14, L: g.L }); sfx('throw'); break;
      case 'molotov': fires.push({ x: g.x, y: g.y, r: 62, t: 6.5, tick: 0, L: g.L, owner: g.owner, by: g.by }); sfx('glass'); makeNoise(g.x, g.y, 400); break;
      case 'flare': flares.push({ x: g.x, y: g.y, t: 25, L: g.L }); sfx('throw'); break;
      default: explode(g.x, g.y, 115, 115, g.L);
    }
    G.src = null; G.eSide = false;
  }
}
// fumaça, fogo, sinalizadores e minas
function updateThrowFx(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t -= dt;
    if (s.t <= 0) { smokes.splice(i, 1); continue; }
    if (Math.random() < dt * 22) spawnPart({ x: s.x + rand(-s.r, s.r) * .7, y: s.y + rand(-s.r, s.r) * .7, vx: rand(-10, 10), vy: rand(-10, 10), life: 2.6, size: rand(14, 24), grow: 4, color: 'rgba(200,200,205,1)', drag: 1, kind: 'smoke', L: s.L });
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t -= dt; f.tick -= dt;
    if (f.t <= 0) { fires.splice(i, 1); continue; }
    if (Math.random() < dt * 40) spawnPart({ x: f.x + rand(-f.r, f.r) * .8, y: f.y + rand(-f.r, f.r) * .8, vx: rand(-15, 15), vy: rand(-40, -10), life: rand(.3, .6), size: rand(5, 9), color: pickFire(), kind: 'fire', L: f.L });
    if (f.tick <= 0) {
      f.tick = .4;
      if (!f.by) for (const e of enemies) if (!e.dead && e.L === f.L && Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r) e.burn = Math.max(e.burn, 2.5);
      const p = player;
      if (!p.dead && p.L === f.L && Math.hypot(p.x - f.x, p.y - f.y) < f.r + p.r && (!MP.on || mpHurtFrom(f.owner))) { if (MP.on) mpNoteHit(f.owner, 'fire'); applyHit(p, ['torso', 'legL', 'legR', 'armL', 'armR'][(Math.random() * 5) | 0], 3.2, { pen: 9, ang: 0 }); }
      for (const a of allies) if (!a.dead && !a.bound && a.L === f.L && Math.hypot(a.x - f.x, a.y - f.y) < f.r + a.r) damageAlly(a, 4, 0);
    }
  }
  for (let i = flares.length - 1; i >= 0; i--) { flares[i].t -= dt; if (flares[i].t <= 0) flares.splice(i, 1); else if (Math.random() < dt * 14) spawnPart({ x: flares[i].x + rand(-4, 4), y: flares[i].y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-30, -5), life: .5, size: 2.5, color: '#ff6a5a', kind: 'spark', L: flares[i].L }); }
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i]; m.arm -= dt;
    if (m.arm > 0) continue;
    let trig = MP.on && mpMineTriggered(m);
    if (!trig) for (const e of enemies) {
      if (e.dead || e.L !== m.L) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) < 64 + e.r) { trig = true; break; }
    }
    if (trig) { G.src = m.owner; explode(m.x, m.y, 95, 170, m.L); G.src = null; mines.splice(i, 1); }
  }
}

function toggleHold() {
  if (G.state !== 'play' || !allies.some(a => a.kind === 'partner' && !a.dead)) return;
  G.hold = !G.hold;
  for (const a of allies) if (a.kind === 'partner') a.hold = { x: a.x, y: a.y };
  banner(G.hold ? 'PARCEIROS: MANTER POSIÇÃO' : 'PARCEIROS: SEGUIR');
}
function toggleVision() {
  const p = player;
  if (!p || p.dead || G.state !== 'play' || !p.visMode) return;
  G.visOn = !G.visOn; sfx('nv');
  banner(G.visOn ? (p.visMode === 'nv' ? (p.eyeThermal ? 'VISOR HÍBRIDO LIGADO' : 'VISÃO NOTURNA LIGADA') : p.visMode === 'zoom' ? 'BINÓCULOS: OLHE LONGE' : 'VISÃO TÉRMICA LIGADA') : 'VISÃO NORMAL');
}

// troca de andar ao pisar no centro de uma escada
function updateStairs(p, dt) {
  p.stairCd -= dt;
  if (p.stairCd > 0) return;
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), k = kindF(tx, ty, p.L);
  if (k !== K.STAIRUP && k !== K.STAIRDN) return;
  if (Math.hypot(p.x - (tx * T + T / 2), p.y - (ty * T + T / 2)) > 15) return;
  const bi = bldAt[ty * MW + tx], f = floorOfL(p.L);
  if (bi < 0) return;
  if (k === K.STAIRUP && f + 1 < blds[bi].floors) { p.L = layerOf(bi, f + 1); p.stairCd = .9; sfx('stairs'); banner((f + 2) + 'º ANDAR'); }
  else if (k === K.STAIRDN && f > 0) { p.L = layerOf(bi, f - 1); p.stairCd = .9; sfx('stairs'); banner(f === 1 ? 'TÉRREO' : f + 'º ANDAR'); }
}

function updatePlayer(dt) {
  const p = player;
  if (p.dead) return;
  p.cool -= dt; p.flash -= dt; p.recoil = Math.max(0, p.recoil - dt * 10); p.gCd -= dt; p.mCd -= dt; p.rcT += dt; p.equipT = Math.max(0, p.equipT - dt);
  updateHeal(p, dt); if (p.dead) return;
  p.showT = Math.max(0, p.showT - dt);
  if (p.kvx || p.kvy) { moveEntity(p, p.kvx * dt, p.kvy * dt); const dk = Math.exp(-dt * 10); p.kvx *= dk; p.kvy *= dk; if (Math.abs(p.kvx) + Math.abs(p.kvy) < 2) p.kvx = p.kvy = 0; }
  bleedTick(p, dt);
  if (p.dead) return;

  let mx = 0, my = 0;
  const k = input.keys;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx--;
  if (k.has('KeyD') || k.has('ArrowRight')) mx++;
  if (k.has('KeyW') || k.has('ArrowUp')) my--;
  if (k.has('KeyS') || k.has('ArrowDown')) my++;
  if (touchMode && sticks.move.id !== null) { mx = sticks.move.x; my = sticks.move.y; }
  let ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
  const w = curW();
  p.walking = !touchMode && (k.has('ShiftLeft') || k.has('ShiftRight'));
  p.loadT -= dt;
  if (p.loadT <= 0) { p.loadT = .25; p.kg = playerKg(p); p.wMul = loadMul(p.kg); }
  let sp = p.speed * p.wMul * p.speedMul * (p.walking ? .55 : 1) * p.fx.speed;
  if (w && w.spin && p.spin > .3) sp *= .6;
  if (p.adr > 0) sp *= 1.25;
  if (p.healing) sp *= .6;
  if (ml > .05) { moveEntity(p, mx * sp * dt, my * sp * dt); p.walk += ml * sp * dt * .12; }
  p.moving = ml > .05;
  updateStairs(p, dt);

  let wantFire = false;
  if (!touchMode) {
    const wx = cam.x + input.mx / S, wy = cam.y + input.my / S;
    p.ang = Math.atan2(wy - p.y, wx - p.x);
    wantFire = input.mouseDown || k.has('Space');
  } else {
    const a = sticks.aim, m = Math.hypot(a.x, a.y);
    if (a.id !== null && m > .2) {
      let ang = Math.atan2(a.y, a.x);
      if (m > .35) { ang = aimAssist(ang); wantFire = true; }
      p.ang = ang;
    } else if (p.moving) p.ang = turnToward(p.ang, Math.atan2(my, mx), dt * 10);
  }

  if (p.reloading) {
    p.reloadT -= dt;
    const rw = curW(), rs = curSlot();
    if (rw.reloadType === 'shell') {
      if (p.reloadT <= 0) {
        rs.mag++; if (!rw.inf) p.pool[rw.cal]--;
        if (rs.mag < rw.mag && poolOf(rw) > 0) { p.reloadT = rw.reload; sfx('shell'); } else p.reloading = false;
      }
    } else {
      if (p.reloadStage === 0 && p.reloadT <= p.reloadTotal * .62) { dropMagazine(); p.reloadStage = 1; }
      if (p.reloadT <= 0) finishReload();
    }
  }
  if (p.burstLeft > 0) {
    p.burstT -= dt;
    if (p.burstT <= 0) {
      const bs = curSlot(), bw = curW();
      if (bs && bs.mag > 0 && !p.reloading) { fireShot(bw, bs); p.burstLeft--; p.burstT = bw.bd; if (bs.mag === 0) p.burstLeft = 0; } else p.burstLeft = 0;
    }
  }
  if (w && w.spin) { if (wantFire && !p.reloading) { const before = p.spin; p.spin = Math.min(1, p.spin + dt / 1.1); if (before < .05) sfx('spin'); } else p.spin = Math.max(0, p.spin - dt * .9); } else p.spin = 0;
  if (w && !w.melee && p.rcMag > 0 && p.rcT > w.delay * 1.6) {
    p.rcMag = Math.max(0, p.rcMag - w.rcv[3] * dt);
    if (p.rcMag === 0) p.rcN = 0;
    p.rcOff = p.rcMag * Math.sin(p.rcN * w.rcv[2] + p.rcPhase);
  }
  if (p.autoReload && p.cool <= 0 && !p.reloading) { p.autoReload = false; startReload(); }
  if (p.melee) {
    const m = p.melee; m.t += dt;
    if (!m.hit && m.t >= m.dur * .45) { m.hit = true; meleeStrike(p, m.w, p.ang); }
    if (m.t >= m.dur) p.melee = null;
  }
  if (wantFire) tryFire();

  for (let i = pickups.length - 1; i >= 0; i--) {
    const it = pickups[i];
    if (it.L === p.L && Math.hypot(it.x - p.x, it.y - p.y) < 24 && collect(it)) { if (MP.on) mpPicked(it); pickups.splice(i, 1); }
  }
}

function aimAssist(ang) {
  const p = player, w = curW();
  if (!w || w.melee) return ang;
  let best = null, bd = .3;
  for (const e of enemies) {
    if (e.dead || !e.visible) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > w.range) continue;
    const a = Math.atan2(e.y - p.y, e.x - p.x), df = Math.abs(angDiff(a, ang));
    if (df < bd) { bd = df; best = a; }
  }
  return best === null ? ang : ang + angDiff(best, ang) * .75;
}

/* ---------- Itens, saque e coleta ---------- */
function ammoItems() {
  const eq = [...new Set(LD.weapons.filter(Boolean).map(id => WMAP[id]).filter(w => !w.inf && !w.melee).flatMap(w => w.fam ? SHELL_FAMILIES[w.fam] : [w.cal]))];
  const all = Object.keys(CALIBERS), used = new Set(), items = [];
  const n = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n * 3 && items.length < n; i++) {
    const cal = eq.length && (items.length === 0 || Math.random() < .4) ? eq[(Math.random() * eq.length) | 0] : all[(Math.random() * all.length) | 0];
    if (used.has(cal)) continue;
    used.add(cal);
    items.push({ cal, n: Math.max(1, Math.round(CALIBERS[cal].pack * rand(.6, 1.1))) });
  }
  return items;
}
function randomGear(boost) {
  const all = WEAPONS.filter(w => w.price > 0).concat(GEAR.filter(g => g.price > 0), ATTACH);
  const weights = all.map(it => (1 / (1 + it.price / (boost ? 2200 : 700))) * (SAVE.owned[it.id] ? 1 : 2.5));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < all.length; i++) { r -= weights[i]; if (r <= 0) return all[i].id; }
  return all[0].id;
}
const rndThr = () => ['frag', 'frag', 'flash', 'smoke', 'molotov', 'flare', 'mine'][(Math.random() * 7) | 0];
function dropPickup(x, y, forced, boost, L = -1) {
  if (!forced && Math.random() > (boost ? 1 : .32)) return;
  const r = Math.random();
  let it;
  if (boost) it = { type: 'gear', item: randomGear(true) };
  else if (r < .45) it = { type: 'ammo', items: ammoItems() };
  else if (r < .68) it = Math.random() < .4 ? { type: 'med' } : { type: 'heal', kind: ['bandage', 'bandage', 'painkiller', 'adrenaline', 'splint', 'surgery'][(Math.random() * 6) | 0] };
  else if (r < .82) it = { type: 'grenade', kind: rndThr() };
  else if (r < .92) it = { type: 'repair' };
  else it = { type: 'gear', item: randomGear(false) };
  it.x = x; it.y = y; it.t = Math.random() * 6; it.L = L;
  pickups.push(it);
}
const itemDef = id => WMAP[id] || GMAP[id] || AMAP[id];
const itemName = id => itemDef(id).name;
const itemPrice = id => itemDef(id).price;

function collect(it) {
  const p = player;
  if (it.type === 'med') {
    if (p.cons.med >= p.consCap) return false;
    p.cons.med++; addText(p.x, p.y - 24, '+KIT MÉDICO', '#8be36a', 13); sfx('pickup'); return true;
  }
  if (it.type === 'heal') {
    const h = HMAP[it.kind];
    if ((p.hl[it.kind] || 0) >= h.cap) return false;
    p.hl[it.kind] = (p.hl[it.kind] || 0) + 1; addText(p.x, p.y - 24, '+' + h.name.toUpperCase(), '#8be36a', 13); sfx('pickup'); return true;
  }
  if (it.type === 'grenade') {
    if (!it.kind) it.kind = ['frag', 'frag', 'flash', 'smoke', 'molotov', 'flare', 'mine'][(Math.random() * 7) | 0];
    const cnt = thrCount(p, it.kind);
    if (cnt >= p.consCap) return false;
    if (it.kind === 'frag') p.cons.grenade++; else p.thr[it.kind]++;
    addText(p.x, p.y - 24, '+' + TMAP[it.kind].short.toUpperCase(), '#ffd36a', 13); sfx('pickup'); return true;
  }
  if (it.type === 'repair') {
    if (p.cons.repair >= p.consCap) return false;
    p.cons.repair++; addText(p.x, p.y - 24, '+REPARO DE COLETE', '#8fdcff', 12); sfx('pickup'); return true;
  }
  if (it.type === 'ammo') {
    let got = 0, y = 24;
    for (const x of it.items) {
      const cap = ammoCap(x.cal), cur = p.pool[x.cal] || 0, add = Math.min(x.n, cap - cur);
      if (add <= 0) continue;
      p.pool[x.cal] = cur + add; x.n -= add; got++;
      addText(p.x, p.y - y, '+' + add + ' ' + CALIBERS[x.cal].name, CALIBERS[x.cal].color, 12); y += 13;
    }
    it.items = it.items.filter(x => x.n > 0);
    if (!got) return false;
    sfx('pickup');
    return it.items.length === 0;
  }
  if (it.type === 'gear') {
    if (SAVE.owned[it.item]) { const c = Math.round(itemPrice(it.item) * .25) + 40; G.earned += c; addText(p.x, p.y - 24, 'SUCATA +$' + c, '#ffd36a', 12); }
    else { SAVE.owned[it.item] = 1; writeSave(); banner('NOVO ITEM: ' + itemName(it.item).toUpperCase()); addText(p.x, p.y - 24, 'ADICIONADO AO ARSENAL', '#ffe066', 12); }
    sfx('pickup'); return true;
  }
  if (it.type === 'intel') {
    G.objDone++; addText(p.x, p.y - 24, 'DOCUMENTO ' + G.objDone + '/' + G.objTotal, '#ffe066', 13); sfx('pickup');
    if (G.objDone < G.objTotal) banner('DOCUMENTO COLETADO ' + G.objDone + '/' + G.objTotal);
    return true;
  }
  return false;
}

/* =====================================================================
   PARCEIROS E REFÉNS
   ===================================================================== */
function makeAlly(def, slot, x, y) {
  return {
    kind: 'partner', def, name: def.name, x, y, r: 12, ang: -Math.PI / 4, L: -1, hp: def.hp, maxHp: def.hp, abs: def.abs, wpn: def.wpn,
    slot, cool: rand(0, .5), flash: 0, hitT: 0, walk: 0, moving: false, path: null, pi: 0, repathT: 0, target: null,
    senseT: rand(0, .15), healT: 1, hold: null, dead: false, speed: def.speed * PACE.ally, moveAng: 0, bound: false, lx: x, ly: y, stuckT: 0, stairCd: 0,
  };
}
function makeHostage(x, y, n, L) {
  return {
    kind: 'hostage', def: null, name: 'Refém ' + n, x, y, r: 11, ang: rand(0, PI2), L: L == null ? -1 : L, hp: 60, maxHp: 60, abs: 0, wpn: null,
    slot: n, cool: 0, flash: 0, hitT: 0, walk: 0, moving: false, path: null, pi: 0, repathT: 0, target: null, senseT: 0, healT: 0,
    hold: null, dead: false, speed: 140 * PACE.ally, moveAng: 0, bound: true, lx: x, ly: y, stuckT: 0, stairCd: 0,
  };
}
function damageAlly(a, d, ang) {
  if (a.dead || a.bound) return;
  a.hp -= d * (1 - a.abs); a.hitT = .1;
  bloodBurst(a.x, a.y, ang, 5, a.L, false);
  if (a.hp <= 0) {
    a.dead = true; sfx('hurt');
    addDecal({ k: 'corpse', x: a.x, y: a.y, ang, who: a.kind, L: a.L });
    addDecal({ k: 'pool', x: a.x, y: a.y, r: 5, max: 16, a: .8, L: a.L });
    banner((a.kind === 'hostage' ? 'REFÉM MORTO: ' : 'PARCEIRO CAÍDO: ') + a.name.toUpperCase());
  }
}
function moveAllyTo(a, gx, gy, gL, speed, dt) {
  const d = Math.hypot(gx - a.x, gy - a.y);
  if (a.L === gL && d < 8) return;
  if (a.L === gL && d < 220 && hasLOS(a.x, a.y, gx, gy, a.L)) {
    moveEntity(a, (gx - a.x) / d * speed * dt, (gy - a.y) / d * speed * dt);
    a.moveAng = Math.atan2(gy - a.y, gx - a.x); a.walk += speed * dt * .12; a.moving = true; a.path = null; return;
  }
  a.repathT -= dt;
  if (!a.path || a.pi >= a.path.length || a.repathT <= 0) { pathTo(a, gx, gy, gL); a.repathT = .6; }
  followPath(a, speed, dt);
}
function allyShoot(a, w) {
  const acc = a.def.acc || 1.4, cal = CALIBERS[w.cal];
  for (let i = 0; i < w.pellets; i++) {
    const ang = a.ang + (w.pellets > 1 ? (i / (w.pellets - 1) - .5) * w.spread * 2 + rand(-.03, .03) : rand(-1, 1) * w.spread * acc);
    bullets.push({
      x: a.x + Math.cos(a.ang) * (a.r + 4), y: a.y + Math.sin(a.ang) * (a.r + 4), dx: Math.cos(ang), dy: Math.sin(ang),
      speed: w.speed, dmg: w.dmg * (a.def.dmg || .85), range: w.range, dist: 0, from: 'p', ally: true, L: a.L,
      id: w.id, pw: cal.pen + (w.ap || 0), rocket: false, radius: 0, breaks: false, hit: null, tx: -1, ty: -1, col: cal.color, sup: !!w.sup,
    });
  }
  a.flash = .06;
  gunshot(w, clamp(1.1 - Math.hypot(a.x - player.x, a.y - player.y) / 1600, .1, 1) * .8);
  makeNoise(a.x, a.y, w.noise * .7);
}

function updateAlly(a, dt) {
  if (a.dead) return;
  a.flash = Math.max(0, a.flash - dt); a.hitT = Math.max(0, a.hitT - dt); a.cool -= dt; a.moving = false;
  const p = player;
  const sameL = a.L === p.L;
  const dpl = sameL ? Math.hypot(p.x - a.x, p.y - a.y) : 999;

  let gx = p.x, gy = p.y;
  if (a.kind === 'partner' && !p.dead) {
    const ang = p.ang + Math.PI + (a.slot - 1) * .95;
    gx = p.x + Math.cos(ang) * 78; gy = p.y + Math.sin(ang) * 78;
    if (solidF(Math.floor(gx / T), Math.floor(gy / T), p.L) || !hasLOS(p.x, p.y, gx, gy, p.L)) { gx = p.x; gy = p.y; }
  } else if (a.kind === 'hostage') {
    const ang = p.ang + Math.PI + (a.slot - 2) * .8;
    gx = p.x + Math.cos(ang) * 60; gy = p.y + Math.sin(ang) * 60;
    if (solidF(Math.floor(gx / T), Math.floor(gy / T), p.L) || !hasLOS(p.x, p.y, gx, gy, p.L)) { gx = p.x; gy = p.y; }
  }

  if (a.kind === 'hostage') {
    if (a.bound || p.dead) return;
    if (!sameL || dpl > 70) moveAllyTo(a, gx, gy, p.L, dpl > 220 ? a.speed * 1.3 : a.speed, dt);
    else a.ang = turnToward(a.ang, p.ang, dt * 4);
    if (a.moving) a.ang = turnToward(a.ang, a.moveAng, dt * 8);
    return;
  }

  const w = WMAP[a.wpn];
  a.senseT -= dt;
  if (a.senseT <= 0) {
    a.senseT = .15 + Math.random() * .05;
    let best = null, bd = 1e9;
    const rng = w.range * .85;
    for (const e of enemies) {
      if (e.dead || !canView(a.L, e.L, e.x, e.y)) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < rng && d < bd && hasLOS(a.x, a.y, e.x, e.y, a.L)) { best = e; bd = d; }
    }
    a.target = best;
  }
  const tg = a.target && !a.target.dead ? a.target : null;

  if (a.def.heal) {
    a.healT -= dt;
    if (a.healT <= 0) {
      a.healT = 1.2;
      const fx = t => { for (let i = 0; i < 3; i++) spawnPart({ x: t.x + rand(-8, 8), y: t.y + rand(-8, 8), vx: 0, vy: -40, life: .7, size: 2.2, color: '#9dffb5' }); };
      if (!p.dead && sameL && dpl < 230 && PARTS.some(k => p.parts[k].hp < p.parts[k].max * .98)) { healAll(p, .08); fx(p); }
      for (const o of allies) if (o !== a && !o.dead && !o.bound && o.hp < o.maxHp && o.L === a.L && Math.hypot(o.x - a.x, o.y - a.y) < 200) { o.hp = Math.min(o.maxHp, o.hp + 7); fx(o); }
    }
  }

  const holdPos = G.hold && a.hold ? a.hold : null;
  const goal = holdPos || { x: gx, y: gy };
  const goalL = holdPos ? a.L : p.L;
  const gd = a.L === goalL ? Math.hypot(goal.x - a.x, goal.y - a.y) : 999;
  const leash = holdPos ? 70 : 300;

  if (tg) {
    const dist = Math.hypot(tg.x - a.x, tg.y - a.y), toT = Math.atan2(tg.y - a.y, tg.x - a.x);
    a.ang = turnToward(a.ang, toT, dt * 8);
    if (gd > leash) moveAllyTo(a, goal.x, goal.y, goalL, a.speed * 1.2, dt);
    else if (dist < a.def.pref - 70) { moveEntity(a, -Math.cos(toT) * a.speed * .7 * dt, -Math.sin(toT) * a.speed * .7 * dt); a.moving = true; a.walk += a.speed * .08 * dt; }
    else if (dist > a.def.pref + 80 && !holdPos) { moveEntity(a, Math.cos(toT) * a.speed * .6 * dt, Math.sin(toT) * a.speed * .6 * dt); a.moving = true; a.walk += a.speed * .07 * dt; }
    if (a.cool <= 0 && Math.abs(angDiff(toT, a.ang)) < .15 && dist < w.range) {
      allyShoot(a, w);
      a.cool = w.delay * (w.delay < .3 ? rand(1, 1.8) : rand(1.1, 1.4));
    }
  } else {
    if (gd > (holdPos ? 20 : 60)) moveAllyTo(a, goal.x, goal.y, goalL, dpl > 220 || !sameL ? a.speed * 1.35 : a.speed, dt);
    if (a.moving) a.ang = turnToward(a.ang, a.moveAng, dt * 8);
    else a.ang = turnToward(a.ang, p.dead ? a.ang : p.ang, dt * 3);
  }

  a.stuckT += dt;
  if (a.stuckT > .8) { if (a.moving && Math.hypot(a.x - a.lx, a.y - a.ly) < 6) { a.path = null; a.repathT = 0; } a.lx = a.x; a.ly = a.y; a.stuckT = 0; }
}

/* =====================================================================
   INIMIGOS
   ===================================================================== */
function foeFromKey(key) {
  if (key === 'boss') { const ld = rollFoe(1, ['ar', 'br', 'mg'], true); ld.boss = true; return ld; }
  if (key === 'heavy') return rollFoe(.8, ['mg', 'sg', 'ar']);
  if (key === 'rusher') return rollFoe(.2, ['ml']);
  return rollFoe(.35, G.types);
}
// src = equipamento sorteado (rollFoe) ou, por compatibilidade, 'boss' / 'heavy' / 'rusher'
function makeEnemy(src, x, y, L) {
  const ld = typeof src === 'string' ? foeFromKey(src) : src;
  const ty = foeTy(ld), mul = (1 + .07 * (G.level - 1)) * (G.hpMul || 1);
  if (ld.boss) Object.assign(ty, { hp: 650, r: 16, scale: 1.4, credit: 500, armor: Math.max(ty.armor, .45), helm: Math.max(ty.helm, .4), cls: Math.max(ty.cls, 3.5), color: '#6b1f2a', vest: '#3a0f16', helmet: '#240a0f', stripe: '#ffd24a' });
  const maxHp = ty.hp * mul, key = ld.boss ? 'boss' : 'foe';
  const e = {
    key, ty, ld, eq: { head: ld.gear.head, body: ld.gear.body, legs: ld.gear.legs, back: ld.gear.back, eyes: ld.gear.eyes, att: ld.attach[ty.weapon] || null },
    nadeN: ty.nades ? ty.nades.length + 1 : 0, x, y, r: ty.r, ang: rand(0, PI2), L: L == null ? -1 : L, hp: maxHp, maxHp, parts: makeParts(maxHp), vip: !!ld.boss,
    state: 'patrol', home: { x, y }, path: null, pi: 0, idle: rand(.3, 2.5), senseT: rand(0, .15),
    sees: false, tgt: null, react: 0, loseT: 0, lastKnown: null, burstLeft: 0, shotT: 0, pause: rand(.3, 1),
    strafeDir: Math.random() < .5 ? 1 : -1, strafeT: rand(1, 2), repathT: 0, walk: Math.random() * 6,
    moving: false, flash: 0, hitT: 0, mark: 0, markType: '', searchT: 0, moveAng: 0,
    lx: x, ly: y, stuckT: 0, visible: false, dead: false, showT: 0, lastPart: 'torso', kvx: 0, kvy: 0, stun: 0, mcd: 0, swing: 0, bleed: 0, stairCd: 0, burn: 0,
  };
  recalcFx(e);
  return e;
}
function pathTo(e, x, y, L) {
  const p = findPath(Math.floor(e.x / T), Math.floor(e.y / T), e.L, Math.floor(x / T), Math.floor(y / T), L == null ? e.L : L);
  e.path = p; e.pi = p && p.length > 1 ? 1 : (p ? p.length : 0);
}
function followPath(e, speed, dt) {
  if (!e.path || e.pi >= e.path.length) return false;
  const n = e.path[e.pi], nfl = (n / NT) | 0, ni = n - nfl * NT;
  const cfl = floorOfL(e.L);
  if (nfl !== cfl) { e.L = nfl ? layerOf(bldAt[ni], nfl) : -1; e.stairCd = .9; }
  const tx = (ni % MW) * T + T / 2, ty = ((ni / MW) | 0) * T + T / 2;
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 7) { e.pi++; return e.pi < e.path.length; }
  const mv = Math.min(speed * dt, d);
  moveEntity(e, dx / d * mv, dy / d * mv);
  e.moveAng = Math.atan2(dy, dx); e.walk += mv * .12; e.moving = true;
  return true;
}
function goSearch(e, pos, L) {
  if (!pos) { e.state = 'patrol'; return; }
  e.state = 'search'; e.searchT = rand(3, 5); e.mark = 1; e.markType = '?';
  pathTo(e, pos.x, pos.y, L);
}
function alertNearby(src) {
  for (const o of enemies) {
    if (o === src || o.dead || o.state === 'attack') continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) < 420) goSearch(o, src.lastKnown, src.tgt ? src.tgt.L : o.L);
  }
}
function makeNoise(x, y, radius) {
  for (const e of enemies) {
    if (e.dead || e.state === 'attack') continue;
    if (Math.hypot(e.x - x, e.y - y) < radius && !(e.state === 'search' && e.searchT > 2.5 && e.path))
      goSearch(e, { x: x + rand(-50, 50), y: y + rand(-50, 50) }, player ? player.L : -1);
  }
}
function patrolTo(e) {
  if (e.mpId != null && mpBotPatrol(e)) return;
  if (e.mpId != null && Math.random() < .65) { const hs = mpHumans().filter(h => !(mpTdm() && mpTargetTeam(h) === e.team)); if (hs.length) { const h = hs[(Math.random() * hs.length) | 0]; e.home = { x: h.x + rand(-140, 140), y: h.y + rand(-140, 140) }; } }
  const fl = floorOfL(e.L);
  for (let i = 0; i < 10; i++) {
    const tx = Math.floor(e.home.x / T) + Math.round(rand(-8, 8)), ty = Math.floor(e.home.y / T) + Math.round(rand(-8, 8));
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1 || !reachN[fl * NT + ty * MW + tx]) continue;
    pathTo(e, tx * T + T / 2, ty * T + T / 2, e.L);
    if (e.path) return;
  }
}

function updateEnemy(e, dt) {
  const ty = e.ty;
  e.flash = Math.max(0, e.flash - dt); e.hitT = Math.max(0, e.hitT - dt); e.mark = Math.max(0, e.mark - dt); e.showT = Math.max(0, e.showT - dt);
  e.moving = false;
  if (e.burn > 0) {
    e.burn -= dt; e.burnT = (e.burnT || 0) - dt;
    if (Math.random() < dt * 14) spawnPart({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-50, -20), life: .35, size: 4, color: pickFire(), kind: 'fire', L: e.L });
    if (e.burnT <= 0) { e.burnT = .25; applyHit(e, 'torso', 2.4, { pen: 9, ang: 0 }); if (e.dead) return; }
  }
  bleedTick(e, dt); if (e.dead) return;
  if (e.kvx || e.kvy) { moveEntity(e, e.kvx * dt, e.kvy * dt); const dk = Math.exp(-dt * 9); e.kvx *= dk; e.kvy *= dk; }
  if (e.stun > 0) { e.stun -= dt; return; }
  const fx = e.fx, spdMul = fx.speed;
  if (ty.heal) {
    e.healT = (e.healT == null ? rand(2, 4) : e.healT) - dt;
    if (e.healT <= 0) {
      e.healT = 5;
      let tgt = null;
      for (const o of enemies) if (o !== e && !o.dead && o.L === e.L && o.hp < o.maxHp * .75 && Math.hypot(o.x - e.x, o.y - e.y) < 170 && (!tgt || o.hp < tgt.hp)) tgt = o;
      if (!tgt && e.hp < e.maxHp * .5 && !e.selfHeal) { tgt = e; e.selfHeal = true; }
      if (tgt) { healAll(tgt, .4); addText(tgt.x, tgt.y - tgt.r - 14, '+ CURADO', '#8be36a', 11); sfx('heal'); }
    }
  }

  e.senseT -= dt;
  if (e.senseT <= 0) {
    e.senseT = .12 + Math.random() * .05;
    let best = null, bd = 1e9;
    for (const c of (e.mpId != null && BOTT.length ? TARGETS.concat(BOTT) : TARGETS)) {
      if (c === e) continue;
      if (e.mpId != null && !mpHostile(e.mpId, mpIdOf(c))) continue;
      if (!canView(e.L, c.L, c.x, c.y)) continue;
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      if (d >= ty.vision || d >= bd) continue;
      const inCone = e.state === 'patrol' ? Math.abs(angDiff(Math.atan2(c.y - e.y, c.x - e.x), e.ang)) < 1.05 : true;
      if ((inCone || d < 80) && hasLOS(e.x, e.y, c.x, c.y, e.L)) { best = c; bd = d; }
    }
    e.sees = !!best;
    if (best) {
      e.tgt = best; e.lastKnown = { x: best.x, y: best.y }; e.loseT = 0;
      if (e.state !== 'attack') { e.state = 'attack'; e.react = rand(.3, .55) * PACE.react; e.mark = 1; e.markType = '!'; e.path = null; alertNearby(e); }
    } else if (e.state === 'attack') {
      e.loseT += .14;
      if (e.loseT > 1.2) goSearch(e, e.lastKnown, e.tgt ? e.tgt.L : e.L);
    }
  }
  const tg = e.tgt && !e.tgt.dead ? e.tgt : null;
  if (e.state === 'attack' && !tg) { e.sees = false; goSearch(e, e.lastKnown, e.L); }
  const dx = tg ? tg.x - e.x : 0, dy = tg ? tg.y - e.y : 0, dist = Math.hypot(dx, dy), toT = Math.atan2(dy, dx);
  const spd = ty.speed * spdMul * PACE.enemy;

  if (e.state === 'patrol') {
    if (e.path && e.pi < e.path.length) { followPath(e, spd * (e.mpId != null && MP.cfg.gm === 'koth' ? .9 : .5), dt); e.ang = turnToward(e.ang, e.moveAng, dt * 4); }
    else {
      e.idle -= dt * (e.mpId != null && MP.cfg.gm === 'koth' ? 3 : 1); e.ang += Math.sin(G.time * .8 + e.walk) * dt * .6;
      if (e.idle <= 0) { e.idle = rand(1.5, 4); patrolTo(e); }
    }
  } else if (e.state === 'search') {
    if (e.path && e.pi < e.path.length) { followPath(e, spd, dt); e.ang = turnToward(e.ang, e.moveAng, dt * 6); }
    else {
      e.searchT -= dt; e.ang += dt * 1.6 * e.strafeDir;
      if (e.searchT <= 0) { e.state = 'patrol'; e.home = { x: e.x, y: e.y }; e.idle = 1; e.mark = .8; e.markType = '?'; e.path = null; }
    }
  } else if (e.state === 'attack') {
    if (ty.melee) {
      // invasor: corre até o alvo e golpeia
      e.mcd -= dt; e.swing = Math.max(0, e.swing - dt);
      if (tg) {
        if (e.L !== tg.L || dist > ty.mrange + tg.r - 4) {
          e.repathT -= dt;
          if (!e.path || e.pi >= e.path.length || e.repathT <= 0) { pathTo(e, tg.x, tg.y, tg.L); e.repathT = .4; }
          followPath(e, spd, dt);
          if (e.moving) e.ang = turnToward(e.ang, e.moveAng, dt * 10); else e.ang = turnToward(e.ang, toT, dt * 8);
        } else {
          e.ang = turnToward(e.ang, toT, dt * 10);
          if (e.mcd <= 0 && Math.abs(angDiff(toT, e.ang)) < .5) {
            e.mcd = ty.mdelay; e.swing = .25; sfx('melee');
            if (tg === player) { if (MP.on && e.mpId != null) { G.lastHitBy = e.mpId; G.lastHitW = ty.weapon; G.lastHitT = G.time; } applyHit(player, rollMeleePart(), ty.mdmg, { pen: 1, ang: toT }); }
            else if (tg.isRemote) mpBotMelee(e, tg, toT);
            else if (tg.mpId != null) { G.src = e.mpId; tg.lastW = ty.weapon; applyHit(tg, rollMeleePart(), ty.mdmg, { pen: 1, ang: toT }); G.src = null; }
            else damageAlly(tg, ty.mdmg, toT);
          }
        }
      }
    } else if (e.sees && tg) {
      e.ang = turnToward(e.ang, toT, dt * 5);
      e.react -= dt;
      if (dist > ty.pref + 70) {
        e.repathT -= dt;
        if (!e.path || e.pi >= e.path.length || e.repathT <= 0) { pathTo(e, tg.x, tg.y, tg.L); e.repathT = .5; }
        followPath(e, spd, dt);
      } else if (dist < ty.pref - 70) {
        moveEntity(e, -Math.cos(toT) * spd * .7 * dt, -Math.sin(toT) * spd * .7 * dt);
        e.moving = true; e.walk += spd * .7 * dt * .12;
      } else if (!fx.crawl) {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = rand(1, 2.2); }
        const sa = toT + Math.PI / 2 * e.strafeDir;
        moveEntity(e, Math.cos(sa) * spd * .5 * dt, Math.sin(sa) * spd * .5 * dt);
        e.moving = true; e.walk += spd * .5 * dt * .12;
      }
      if (ty.nades && e.nadeN > 0 && !fx.armsDead) {
        e.gcd = (e.gcd == null ? rand(2, 5) : e.gcd) - dt;
        if (e.gcd <= 0 && e.react <= 0 && dist > 130 && dist < 470) { enemyThrow(e, tg); e.gcd = rand(ty.gcd[0], ty.gcd[1]); }
      }
      if (!fx.armsDead && e.react <= 0 && Math.abs(angDiff(toT, e.ang)) < .25 && dist < ty.range) {
        if (e.burstLeft > 0) {
          e.shotT -= dt;
          if (e.shotT <= 0) {
            enemyShoot(e);
            e.burstLeft--; e.shotT = ty.bdelay * (fx.oneArm ? 1.5 : 1);
            if (e.burstLeft === 0) e.pause = rand(ty.pmin, ty.pmax) * 1.3;
          }
        } else { e.pause -= dt; if (e.pause <= 0) { e.burstLeft = ty.burst; e.shotT = 0; } }
      }
    } else if (e.lastKnown) {
      e.repathT -= dt;
      if ((!e.path || e.pi >= e.path.length) && e.repathT <= 0) { pathTo(e, e.lastKnown.x, e.lastKnown.y, tg ? tg.L : e.L); e.repathT = .5; }
      if (followPath(e, spd, dt)) e.ang = turnToward(e.ang, e.moveAng, dt * 6);
    }
  }

  e.stuckT += dt;
  if (e.stuckT > .8) {
    if (e.moving && Math.hypot(e.x - e.lx, e.y - e.ly) < 6) { e.path = null; e.repathT = 0; e.strafeDir *= -1; }
    e.lx = e.x; e.ly = e.y; e.stuckT = 0;
  }
}

function enemyShoot(e) {
  const ty = e.ty, n = ty.pellets || 1, made = [];
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? e.ang + (i / (n - 1) - .5) * ty.spread * 2 + rand(-.03, .03) : e.ang + (Math.random() - .5) * 2 * (ty.spread + e.fx.aim);
    const b = {
      x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), dx: Math.cos(a), dy: Math.sin(a),
      speed: ty.bspeed * PACE.bullet * (n > 1 ? rand(.9, 1.05) : 1), dmg: ty.dmg, range: ty.range + 150, dist: 0, from: 'e', L: e.L, pw: ty.pen, tx: -1, ty: -1, col: ty.rocket ? '#ffb050' : '#ff7a50',
      id: ty.weapon, mz: ty.w && ty.w.muzzle, owner: e.mpId, rocket: !!ty.rocket, radius: ty.rocketR || 0,
    };
    bullets.push(b); made.push(b);
  }
  e.flash = .06;
  const vol = clamp(1.15 - Math.hypot(e.x - player.x, e.y - player.y) / 1600, .1, 1);
  if (ty.rocket) sfx('rpg', vol); else gunshot(ty.w, vol * .9);
  if (MP.on && MP.isHost && e.mpId != null) mpSendShots(made, e.mpId);
}
// granadeiro arremessa granadas variadas no alvo
function enemyThrow(e, tg) {
  const kind = e.ty.nades[(Math.random() * e.ty.nades.length) | 0]; e.nadeN--;
  const dist = clamp(Math.hypot(tg.x - e.x, tg.y - e.y), 90, 440), a = Math.atan2(tg.y - e.y, tg.x - e.x) + rand(-.08, .08), v = dist * 2.2;
  const gr = { x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: TMAP[kind].fuse, kind, L: e.L, by: 'e', owner: e.mpId };
  grenades.push(gr); sfx('throw'); e.mark = 1; e.markType = '!';
  if (MP.on && MP.isHost && e.mpId != null) mpSendThrow(gr, false, e.mpId);
}
function dropLoot(e) {
  const ty = e.ty, ld = e.ld, w = ty.w;
  const put = o => pickups.push(Object.assign(o, { x: e.x + rand(-12, 12), y: e.y + rand(-12, 12), t: Math.random() * 6, L: e.L }));
  let any = false;
  if (!w.melee && Math.random() < .6) {
    const cal = w.fam ? SHELL_FAMILIES[w.fam][(Math.random() * SHELL_FAMILIES[w.fam].length) | 0] : w.cal;
    put({ type: 'ammo', items: [{ cal, n: Math.max(2, Math.round(CALIBERS[cal].pack * rand(.7, 1.3))) }] }); any = true;
  }
  if (ld.nades && Math.random() < .65) { put({ type: 'grenade', kind: ld.nades[0] }); any = true; }
  if (ld.heal && Math.random() < .7) { put({ type: 'med' }); any = true; }
  if (Math.random() < .1 + .18 * ld.power) { const pr = [ld.weapons[0], ld.weapons[1], ld.gear.body, ld.gear.head].filter(x => x && (WMAP[x] ? WMAP[x].price > 0 : GMAP[x] && GMAP[x].price > 0)); if (pr.length) { put({ type: 'gear', item: pr[(Math.random() * pr.length) | 0] }); any = true; } }
  if (!any) dropPickup(e.x, e.y, false, false, e.L);
}

function killEnemy(e, ang, part) {
  if (e.dead) return;
  if (e.mpId != null && MP.on) { e.dead = true; addDecal({ k: 'corpse', x: e.x, y: e.y, ang: ang + rand(-.5, .5), who: e.key, scale: e.ty.scale, L: e.L, ...corpseKick(e.lastForce || 0, e.lastAng != null ? e.lastAng : ang) }); addDecal({ k: 'pool', x: e.x, y: e.y, r: 6, max: rand(14, 22), a: .8, L: e.L }); bloodBurst(e.x, e.y, ang, 14, e.L, true); sfx('kill'); mpBotDied(e); return; }
  e.dead = true; G.kills++; G.earned += e.ty.credit; sfx('kill');
  if (part === 'head') G.heads++;
  addDecal({ k: 'corpse', x: e.x, y: e.y, ang: ang + rand(-.5, .5), who: e.key, scale: e.ty.scale, L: e.L, ...corpseKick(e.lastForce || 0, e.lastAng != null ? e.lastAng : ang) });
  addDecal({ k: 'pool', x: e.x, y: e.y, r: 6, max: rand(14, 22), a: .8, L: e.L });
  bloodBurst(e.x, e.y, ang, 14, e.L, true);
  if (e.vip) { dropPickup(e.x, e.y, true, true, e.L); banner('ALVO VIP ELIMINADO'); }
  else dropLoot(e);
}

/* =====================================================================
   PROJÉTEIS (penetração de materiais, partes do corpo)
   ===================================================================== */
function bulletTile(b, tx, ty) {
  const k = kindF(tx, ty, b.L), m = MAT[k];
  if (m.cost <= 0) return true;
  if (b.rocket) { explode(b.x - b.dx * 6, b.y - b.dy * 6, b.radius, b.dmg, b.L); return false; }
  if (b.fragR) { explode(b.x - b.dx * 6, b.y - b.dy * 6, b.fragR, b.dmg * 1.2, b.L); return false; }
  if (b.flame) return false;
  const pass = b.pw >= m.cost;
  if (k === K.WINDOW) breakWindow(tx, ty, b.L);
  if (k === K.CRATE) { if (b.breaks) destroyCrate(tx, ty, b.L); else hitCrate(tx, ty, b.L, b.dmg); }
  impactFx(b, k);
  addHole(b.x, b.y, b.L, k === K.WINDOW ? 'glass' : k === K.DOOR ? 'door' : 'wall');
  if (!pass) return false;
  b.pw -= m.cost; b.dmg *= Math.max(.25, 1 - .2 * m.cost);      // cada obstáculo atravessado tira parte do dano
  return true;
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let alive = true;
    G.src = (b.from === 'n' || b.owner != null) ? b.owner : null; G.eSide = b.from === 'e' && b.owner == null;
    const step = b.speed * dt, n = Math.max(1, Math.ceil(step / 8)), sd = step / n;
    for (let s = 0; s < n && alive; s++) {
      b.x += b.dx * sd; b.y += b.dy * sd; b.dist += sd;
      const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
      if (b.L >= 0 && bldAt[ty * MW + tx] !== layerBld[b.L]) b.L = -1;
      if (tx !== b.tx || ty !== b.ty) { b.tx = tx; b.ty = ty; if (!bulletTile(b, tx, ty)) { alive = false; break; } }
      if (b.from === 'p') {
        for (const e of enemies) {
          if (e.dead || e.L !== b.L || (b.hit && b.hit.includes(e)) || (MP.on && e.mpId != null && mpFriend(e.mpId))) continue;
          if (e.mpId != null) e.lastW = b.id;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + 2;
          if (dx * dx + dy * dy < rr * rr) {
            if (b.rocket) { explode(b.x, b.y, b.radius, b.dmg, b.L); alive = false; break; }
            if (b.fragR) { explode(b.x, b.y, b.fragR, b.dmg * 1.2, b.L); alive = false; break; }
            const ang = Math.atan2(b.dy, b.dx);
            if (b.flame) { applyHit(e, 'torso', b.dmg, { pen: 9, ang }); e.burn = 3.5; (b.hit || (b.hit = [])).push(e); }
            else {
              const part = rollPart(e, b.x, b.y, WMAP[b.id] && WMAP[b.id].spread < .02 ? .08 : 0);
              if (!b.ally) { G.hits++; G.hitMark = .15; G.hitCol = part === 'head' ? '#ffd24a' : part === 'torso' ? '#ffffff' : '#ff9a1f'; }
              const dealt = b.dmg * PART_MUL[part];
              const killed = applyHit(e, part, b.dmg, { pen: b.pw, ang });
              if (!killed) { if (b.inc) e.burn = Math.max(e.burn, 2.5); if (b.stunS) e.stun = Math.max(e.stun, b.stunS); }
              addText(e.x + rand(-6, 6), e.y - e.r - 6, Math.round(dealt), part === 'head' ? '#ffd24a' : '#fff', part === 'head' ? 14 : 12);
              sfx(part === 'head' ? 'head' : 'hit');
              if (!killed && (e.state === 'patrol' || e.state === 'search')) { e.state = 'attack'; e.react = .3; e.mark = 1; e.markType = '!'; e.lastKnown = { x: player.x, y: player.y }; e.tgt = player; e.path = null; e.loseT = 0; }
              b.pw -= 1.4; b.dmg *= .7; (b.hit || (b.hit = [])).push(e);
              if (b.pw <= 0) { alive = false; break; }
            }
          }
        }
        if (alive && MP.on && mpBulletVsRemotes(b)) alive = false;
      } else if (b.from === 'n') {
        // tiros de outros jogadores: o dano normal é decidido por quem atirou; só explosivos acertam aqui
        if ((b.rocket || b.fragR) && !player.dead && b.L === player.L) {
          const dx = player.x - b.x, dy = player.y - b.y, rr = player.r + 2;
          if (dx * dx + dy * dy < rr * rr) { explode(b.x, b.y, b.rocket ? b.radius : b.fragR, b.dmg, b.L); alive = false; }
        }
      } else {
        for (const t of TARGETS) {
          if (t.L !== b.L) continue;
          const dx = t.x - b.x, dy = t.y - b.y, rr = t.r + 2;
          if (dx * dx + dy * dy < rr * rr) {
            if (b.rocket) explode(b.x, b.y, b.radius, b.dmg, b.L);
            else if (t === player) hurtPlayerBullet(b);
            else if (t.isRemote) mpBotHit(t, b);
            else damageAlly(t, b.dmg, Math.atan2(b.dy, b.dx));
            alive = false; break;
          }
        }
        // balas de bots também acertam bots inimigos (conforme o modo)
        if (alive && b.owner != null && MP.on && BOTT.length) for (const e2 of BOTT) {
          if (e2.dead || e2.mpId === b.owner || e2.L !== b.L || !mpHostile(b.owner, e2.mpId)) continue;
          const dx = e2.x - b.x, dy = e2.y - b.y, rr = e2.r + 2;
          if (dx * dx + dy * dy >= rr * rr) continue;
          if (b.rocket) explode(b.x, b.y, b.radius, b.dmg, b.L);
          else { G.src = b.owner; e2.lastW = b.id; applyHit(e2, rollPart(e2, b.x, b.y), b.dmg, { pen: b.pw, ang: Math.atan2(b.dy, b.dx) }); G.src = b.owner; }
          alive = false; break;
        }
      }
      if (alive && b.dist >= b.range) {
        if (b.rocket) explode(b.x, b.y, b.radius, b.dmg, b.L);
        alive = false;
      }
    }
    if (b.flame && alive) spawnPart({ x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-30, 30), life: .28, size: 3 + b.dist * .035, color: pickFire(), drag: 2, kind: 'fire', L: b.L });
    if (b.rocket && alive) {
      spawnPart({ x: b.x - b.dx * 10, y: b.y - b.dy * 10, vx: rand(-20, 20), vy: rand(-20, 20), life: .6, size: 4, grow: 9, color: 'rgba(170,170,170,1)', drag: 2, kind: 'smoke' });
      spawnPart({ x: b.x - b.dx * 8, y: b.y - b.dy * 8, vx: 0, vy: 0, life: .15, size: 4, color: '#ffb030', kind: 'fire' });
    }
    G.src = null; G.eSide = false;
    if (!alive) bullets.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vr *= dr;
    if (p.grow) p.size = Math.max(.1, p.size + p.grow * dt);
    if ((p.kind === 'casing' || p.kind === 'mag') && solidF(Math.floor(p.x / T), Math.floor(p.y / T), p.L >= 0 ? p.L : -1)) { p.vx = p.vy = 0; }
  }
  for (const d of decals) {
    if (d.k === 'pool') { if (d.r < d.max) d.r += dt * 3.5; }
    else if (d.k === 'corpse' && (d.vx || d.vy)) moveCorpse(d, dt);
  }
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 26 * dt; if (t.life <= 0) texts.splice(i, 1); }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
}

/* =====================================================================
   OBJETIVOS E MODOS DE JOGO
   ===================================================================== */
function banner(text) {
  const b = $('banner');
  b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function updateInteract(dt) {
  const p = player;
  let near = null;
  if (!p.dead) {
    let bd = 48;
    for (const it of interacts) { if (it.done || it.L !== p.L) continue; const d = Math.hypot(it.x - p.x, it.y - p.y); if (d < bd) { bd = d; near = it; } }
  }
  G.near = near;
  const holding = input.act || input.keys.has('KeyE');
  for (const it of interacts) {
    if (it.done) continue;
    if (it === near && holding) { it.prog += dt; if (it.prog >= it.need) completeInteract(it); }
    else it.prog = Math.max(0, it.prog - dt * 1.5);
  }
}
function completeInteract(it) {
  it.done = true; G.objDone++; sfx('pickup');
  if (it.type === 'hostage') {
    it.ref.bound = false;
    banner('REFÉM LIBERTADO ' + G.objDone + '/' + G.objTotal);
  } else if (it.type === 'charge') {
    charges.push({ x: it.x, y: it.y, fuse: 8, L: it.L });
    makeNoise(it.x, it.y, 520);
    banner(G.objDone >= G.objTotal ? 'TODAS AS CARGAS PLANTADAS — FUJA!' : 'CARGA PLANTADA ' + G.objDone + '/' + G.objTotal);
  }
}
function updateCharges(dt) {
  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i], before = Math.ceil(c.fuse);
    c.fuse -= dt;
    if (Math.ceil(c.fuse) !== before && c.fuse > 0) sfx('beep');
    if (c.fuse <= 0) { explode(c.x, c.y, 160, 190, c.L); charges.splice(i, 1); }
  }
}

function objectiveTarget() {
  if (G.mode === 'mp') return MP.on ? mpObjTarget() : null;
  if (G.extractOpen) return { x: extT.x * T + T / 2, y: extT.y * T + T / 2, col: '#7ddc5a' };
  const near = list => { let best = null, bd = 1e9; for (const t of list) { const d = Math.hypot(t.x - player.x, t.y - player.y); if (d < bd) { bd = d; best = t; } } return best; };
  if (G.mode === 'intel') { const t = near(pickups.filter(i => i.type === 'intel')); return t && { x: t.x, y: t.y, col: '#ffd24a' }; }
  if (G.mode === 'rescue') { const t = near(interacts.filter(i => !i.done)); return t && { x: t.x, y: t.y, col: '#6fd8ff' }; }
  if (G.mode === 'sabotage') { const t = near(interacts.filter(i => !i.done)); return t && { x: t.x, y: t.y, col: '#ff9a3a' }; }
  if (G.mode === 'vip') { const t = enemies.find(e => e.vip); return t && { x: t.x, y: t.y, col: '#ff4a3a' }; }
  return null;
}
function objectiveText() {
  switch (G.mode) {
    case 'kill': return G.extractOpen ? 'Vá até a zona de extração (H)' : 'Elimine os hostis: ' + enemies.length + ' restantes';
    case 'intel': return G.extractOpen ? 'Vá até a zona de extração (H)' : 'Colete os documentos: ' + G.objDone + '/' + G.objTotal;
    case 'rescue': return G.extractOpen ? 'Escolte os reféns até a extração (H)' : 'Liberte os reféns: ' + G.objDone + '/' + G.objTotal;
    case 'sabotage': return G.extractOpen ? 'Fuja para a extração (H)!' : 'Plante as cargas: ' + G.objDone + '/' + G.objTotal;
    case 'vip': return G.extractOpen ? 'Alvo eliminado — vá à extração (H)' : 'Elimine o comandante inimigo';
    case 'sandbox': return 'Treino livre — ondas contínuas (Esc para sair)';
    case 'mp': return mpObjText();
    case 'timeattack': return 'Contra o relógio — ' + G.kills + '/' + G.target + ' abates · ' + fmtTime(Math.max(0, G.limit - G.time));
    case 'survival': return G.waveState === 'break' ? 'Onda ' + (G.wave + 1) + ' em ' + Math.ceil(G.waveTimer) + 's' : 'Onda ' + G.wave + '/' + G.waveTarget + ' — ' + enemies.length + ' restantes';
  }
  return '';
}

function nearFree(x, y, r) {
  for (let i = 0; i < 30; i++) {
    const tx = Math.floor((x + rand(-r, r)) / T), ty = Math.floor((y + rand(-r, r)) / T);
    if (tx > 0 && ty > 0 && tx < MW - 1 && ty < MH - 1 && grid0[ty * MW + tx] === 0) return { x: tx * T + T / 2, y: ty * T + T / 2 };
  }
  return { x, y };
}
const allowType = k => (!G.types || !G.types.length || G.types.includes(k)) ? k : G.types[(Math.random() * G.types.length) | 0];
// gera n inimigos sorteados longe do jogador (inclusive em outros andares)
function spawnFoes(n) {
  for (let i = 0; i < n; i++) {
    let s = null, sL = -1;
    if (BSPOTS.length && Math.random() < .3) { const bsp = BSPOTS[(Math.random() * BSPOTS.length) | 0]; if (bsp.u.length) { s = bsp.u[(Math.random() * bsp.u.length) | 0]; sL = s.L; } }
    if (!s) for (let k = 0; k < 40; k++) {
      const c = SPOTS[(Math.random() * SPOTS.length) | 0], px = c.x * T + T / 2, py = c.y * T + T / 2;
      if (Math.hypot(px - player.x, py - player.y) > 480 && (player.L >= 0 || !hasLOS(px, py, player.x, player.y, -1))) { s = c; break; }
    }
    if (!s) s = SPOTS[(Math.random() * SPOTS.length) | 0];
    const e = makeEnemy(rollFoe(clamp(.1 + .08 * (G.level - 1) + G.time / 400 + rand(-.1, .2), 0, 1), G.types), s.x * T + T / 2, s.y * T + T / 2, sL);
    enemies.push(e); goSearch(e, { x: player.x + rand(-80, 80), y: player.y + rand(-80, 80) }, player.L);
  }
}
function startWave() {
  G.wave++; G.waveState = 'fight';
  const n = G.mode === 'sandbox' && G.custom ? G.custom.enemies : Math.min(30, 4 + 2 * G.wave + G.level - 1);
  const hv = Math.min(.35, .03 * G.wave), sc = .22, ru = Math.min(.2, .03 * G.wave);
  for (let i = 0; i < n; i++) {
    let s = null, sL = -1;
    if (BSPOTS.length && Math.random() < .3) { const bsp = BSPOTS[(Math.random() * BSPOTS.length) | 0]; if (bsp.u.length) { s = bsp.u[(Math.random() * bsp.u.length) | 0]; sL = s.L; } }
    if (!s) for (let k = 0; k < 40; k++) {
      const c = SPOTS[(Math.random() * SPOTS.length) | 0];
      const px = c.x * T + T / 2, py = c.y * T + T / 2;
      if (Math.hypot(px - player.x, py - player.y) > 520 && (player.L >= 0 || !hasLOS(px, py, player.x, player.y, -1))) { s = c; break; }
    }
    if (!s) s = SPOTS[(Math.random() * SPOTS.length) | 0];
    const key = rollFoe(clamp(.1 + .06 * G.wave + .08 * (G.level - 1) + rand(-.1, .2), 0, 1), G.types);
    const e = makeEnemy(key, s.x * T + T / 2, s.y * T + T / 2, sL);
    enemies.push(e);
    goSearch(e, { x: player.x + rand(-80, 80), y: player.y + rand(-80, 80) }, player.L);
  }
  banner('ONDA ' + G.wave + '/' + G.waveTarget);
}
function supplyDrop() {
  const c = { x: player.x, y: player.y }, L = player.L;
  const put = o => { const s = L >= 0 ? { x: c.x + rand(-60, 60), y: c.y + rand(-60, 60) } : nearFree(c.x, c.y, 160); pickups.push(Object.assign({ x: s.x, y: s.y, t: 0, L }, o)); };
  put({ type: 'ammo', items: ammoItems() }); put({ type: 'ammo', items: ammoItems() });
  put({ type: 'med' }); put(Math.random() < .5 ? { type: 'grenade', kind: rndThr() } : { type: 'repair' });
  if (G.wave % 3 === 0) put({ type: 'gear', item: randomGear(G.wave >= 6) });
}

function checkObjectives(dt) {
  switch (G.mode) {
    case 'timeattack': {
      G.extractOpen = false; G.waveTimer -= dt;
      if (G.waveTimer <= 0 && enemies.length < Math.min(14, 5 + G.level * 2)) { spawnFoes(2); G.waveTimer = 2.2; }
      if (G.state === 'play' && (G.kills >= G.target || G.time >= G.limit)) { G.reason = G.kills >= G.target ? '' : 'Tempo esgotado'; endMission(G.kills >= G.target); return; }
      break;
    }
    case 'mp': G.extractOpen = false; break;
    case 'kill': G.extractOpen = enemies.length === 0; break;
    case 'intel': case 'sabotage': G.extractOpen = G.objDone >= G.objTotal; break;
    case 'vip': G.extractOpen = !enemies.some(e => e.vip); break;
    case 'sandbox':
      G.extractOpen = false;
      if (enemies.length === 0) { G.waveTimer -= dt; if (G.waveTimer <= 0) { startWave(); G.waveTimer = 5; } }
      break;
    case 'rescue': {
      G.extractOpen = G.objDone >= G.objTotal;
      const alive = allies.filter(a => a.kind === 'hostage' && !a.dead).length;
      if (alive < G.rescueNeed && !player.dead && G.state === 'play') { G.reason = 'Reféns demais perdidos'; endMission(false); return; }
      break;
    }
    case 'survival':
      G.extractOpen = false;
      if (G.waveState === 'break') { G.waveTimer -= dt; if (G.waveTimer <= 0) startWave(); }
      else if (enemies.length === 0) {
        G.earned += 60 + 15 * G.wave;
        if (G.wave >= G.waveTarget) { endMission(true); return; }
        G.waveState = 'break'; G.waveTimer = 9; supplyDrop(); banner('ONDA ' + G.wave + ' CONCLUÍDA');
      }
      break;
  }
  if (G.extractOpen && !G.announced) { G.announced = true; banner('ZONA DE EXTRAÇÃO LIBERADA'); sfx('pickup'); }
  if (G.extractOpen && !player.dead && player.L < 0 && Math.hypot(player.x - (extT.x * T + T / 2), player.y - (extT.y * T + T / 2)) < 52) endMission(true);
}

function startMission(mode, level, custom) {
  G.custom = custom || null; LD = custom ? SAVE.custom : SAVE;
  G.infAmmo = !!(custom && custom.infAmmo); G.hpMul = custom ? custom.hpMul : 1; G.types = custom ? custom.types : null;
  G.mode = mode; G.level = level;
  G.name = MISSION_NAMES[(level - 1 + MODES.findIndex(m => m.id === mode)) % MISSION_NAMES.length];
  G.time = 0; G.kills = 0; G.shots = 0; G.hits = 0; G.heads = 0; G.earned = 0; G.shake = 0; G.hurtFlash = 0; G.hitMark = 0; G.kx = G.ky = 0;
  G.objDone = 0; G.objTotal = 0; G.rescueNeed = 0; G.extractOpen = false; G.announced = false; G.endTimer = 0;
  G.wave = 0; G.waveState = 'break'; G.waveTimer = 6; G.hold = false; G.near = null; G.reason = ''; G.visOn = false;
  G.night = custom && custom.time !== 'random' ? custom.time === 'night' : Math.random() < .45;
  G.adapt = 0; G.flashT = 0; G.beatT = 0; G.pulse = 0;
  input.keys.clear(); input.act = false;

  const seed = custom && custom.seed != null ? custom.seed : Math.floor(Math.random() * 1e9);
  loadWorld(genWorld(seed));

  smokes = []; fires = []; flares = []; mines = [];
  enemies = []; allies = []; bullets = []; grenades = []; charges = []; interacts = []; particles = []; decals = []; holes = []; pickups = []; texts = []; flashes = [];
  player = null; newPlayer();

  if (mode !== 'mp') LD.squad.slice(0, MAX_SQUAD).forEach((id, i) => {
    const def = PMAP[id]; if (!def) return;
    const a = makeAlly(def, i, player.x + 30 + i * 22, player.y - 18 - i * 6);
    moveEntity(a, 0, 0); allies.push(a);
  });

  // multiplayer: tudo que é sorteado daqui em diante (posições, itens) sai igual para todos os jogadores
  const realRandom = Math.random;
  if (mode === 'mp') Math.random = mulberry32((seed ^ 0x5bd1e995) >>> 0);

  // posições alcançáveis (térreo) e por prédio (térreo + 2º andar)
  SPOTS = []; BSPOTS = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) if (reachN[y * MW + x] && grid0[y * MW + x] === 0) SPOTS.push({ x, y });
  const far = (s, d) => Math.hypot(s.x - spawnT.x, s.y - spawnT.y) > d;
  blds.forEach((b, bi) => {
    const g = [], u = [];
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
      const i = y * MW + x;
      if (reachN[i] && grid0[i] === 0) g.push({ x, y });
      for (let f = 1; f < b.floors; f++) if (reachN[f * NT + i] && gridF[f][i] === 0) u.push({ x, y, L: b.layers[f] });
    }
    if (g.length >= 6 && far(g[0], 12)) BSPOTS.push({ bi, g, u });
  });
  BSPOTS.sort(() => Math.random() - .5);
  const rnd = a => a[(Math.random() * a.length) | 0];
  const pickSpot = (list, d, avoid) => {
    for (let i = 0; i < 60; i++) {
      const s = rnd(list);
      if (!s || !far(s, d)) continue;
      if (avoid.some(a => Math.hypot(a.x - s.x, a.y - s.y) < 4)) continue;
      return s;
    }
    return rnd(list);
  };
  const nearL = (s, r, L) => {
    const fl = floorOfL(L), gg = gridF[fl];
    for (let i = 0; i < 30; i++) {
      const x = s.x + Math.round(rand(-r, r)), y = s.y + Math.round(rand(-r, r));
      if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && reachN[fl * NT + y * MW + x] && gg[y * MW + x] === 0 && (!fl || bldAt[y * MW + x] === layerBld[L])) return { x, y };
    }
    return s;
  };
  const hv = Math.min(.3, .06 + .04 * level), sc = .2, ru = Math.min(.18, .03 + .02 * level);
  const rollKey = () => rollFoe(clamp(.08 + .1 * (level - 1) + rand(-.1, .25), 0, 1), G.types);
  const cnt = def => (custom && custom.enemies >= 0) ? custom.enemies : def;
  const addE = (key, s, L) => { const e = makeEnemy(key, s.x * T + T / 2, s.y * T + T / 2, L); enemies.push(e); return e; };
  const placed = [];
  const addRandom = count => {
    for (let i = 0; i < count; i++) {
      const inside = BSPOTS.length && Math.random() < .65;
      if (inside) {
        const wantUp = Math.random() < .6, pl = wantUp ? BSPOTS.filter(b => b.u.length >= 4) : BSPOTS, bsp = rnd(pl.length ? pl : BSPOTS), up = wantUp && bsp.u.length >= 4;
        const s = rnd(up ? bsp.u : bsp.g); placed.push(s); addE(rollKey(), s, up ? s.L : -1);
      } else { const s = pickSpot(SPOTS, 15, placed); placed.push(s); addE(rollKey(), s, -1); }
    }
  };
  // pontos de interesse dentro de prédios (preferindo andares diferentes)
  const poi = (i, wantUp) => {
    if (!BSPOTS.length) return { s: pickSpot(SPOTS, 14, []), L: -1 };
    const pool = wantUp ? BSPOTS.filter(b => b.u.length >= 4) : BSPOTS;
    const bsp = (pool.length ? pool : BSPOTS)[i % (pool.length || BSPOTS.length)], up = wantUp && bsp.u.length >= 4;
    const s = rnd(up ? bsp.u : bsp.g);
    return { s, L: up ? s.L : -1 };
  };

  switch (mode) {
    case 'sandbox': G.waveTimer = 1; break;
    case 'mp': break;
    case 'timeattack': G.waveTimer = 1; G.limit = 180; G.target = 18 + 6 * level; break;
    case 'kill': addRandom(cnt(Math.min(28, 8 + 3 * (level - 1)))); break;
    case 'intel': {
      addRandom(cnt(Math.min(26, 8 + 2 * (level - 1))));
      G.objTotal = 3;
      for (let i = 0; i < 3; i++) {
        const q = poi(i, Math.random() < .55);
        pickups.push({ x: q.s.x * T + T / 2, y: q.s.y * T + T / 2, type: 'intel', t: Math.random() * 6, L: q.L });
        addE(rollKey(), nearL(q.s, 3, q.L), q.L);
      }
      break;
    }
    case 'rescue': {
      addRandom(cnt(Math.min(20, 6 + 2 * (level - 1))));
      G.objTotal = 3; G.rescueNeed = 2;
      for (let i = 0; i < 3; i++) {
        const q = poi(i, Math.random() < .55), h = makeHostage(q.s.x * T + T / 2, q.s.y * T + T / 2, i + 1, q.L);
        allies.push(h);
        interacts.push({ x: h.x, y: h.y, L: q.L, type: 'hostage', need: 2, prog: 0, done: false, ref: h });
        addE(rollKey(), nearL(q.s, 3, q.L), q.L); addE(rollKey(), nearL(q.s, 3, q.L), q.L);
      }
      break;
    }
    case 'sabotage': {
      addRandom(cnt(Math.min(22, 6 + 2 * (level - 1))));
      G.objTotal = 3;
      const used = [];
      for (let i = 0; i < 3; i++) {
        let s = null;
        for (let k = 0; k < 60; k++) { const c = rnd(SPOTS); if (far(c, 16) && Math.hypot(c.x - extT.x, c.y - extT.y) > 8 && used.every(u => Math.hypot(u.x - c.x, u.y - c.y) > 10)) { s = c; break; } }
        s = s || rnd(SPOTS);
        let sL = -1;
        if (BSPOTS.length && Math.random() < .5) { const q = poi(i * 3 + 1, true); if (q.L >= 0) { s = q.s; sL = q.L; } }
        used.push(s);
        interacts.push({ x: s.x * T + T / 2, y: s.y * T + T / 2, L: sL, type: 'charge', need: 3, prog: 0, done: false });
        addE(rollKey(), nearL(s, 3, sL), sL); addE(rollKey(), nearL(s, 3, sL), sL);
      }
      break;
    }
    case 'vip': {
      addRandom(cnt(Math.min(14, 5 + 2 * (level - 1))));
      const q = poi(0, Math.random() < .5), boss = addE('boss', q.s, q.L);
      for (let i = 0; i < Math.min(8, 4 + level); i++) addE(i % 3 === 2 ? 'heavy' : rollKey(), nearL(q.s, 4, q.L), q.L);
      boss.home = { x: boss.x, y: boss.y };
      break;
    }
    case 'survival': G.waveTarget = Math.min(20, 6 + 2 * level); break;
  }
  const put = (o, s, L = -1) => pickups.push(Object.assign({ x: s.x * T + T / 2, y: s.y * T + T / 2, t: Math.random() * 6, L }, o));
  const mpm = mode === 'mp';
  // itens espalhados também pelos andares de cima
  const anySpot = (d, avoid) => {
    if (BSPOTS.length && Math.random() < .6) { const wantUp = Math.random() < .7, pl = wantUp ? BSPOTS.filter(b => b.u.length >= 4) : BSPOTS, bsp = rnd(pl.length ? pl : BSPOTS), up = wantUp && bsp.u.length >= 4, s = rnd(up ? bsp.u : bsp.g); return { s, L: up ? s.L : -1 }; }
    return { s: pickSpot(SPOTS, d, avoid), L: -1 };
  };
  const putAny = (o, d) => { const q = anySpot(d, []); put(o, q.s, q.L); };
  for (let i = 0; i < (mpm ? 14 : 8); i++) putAny({ type: 'ammo', items: ammoItems() }, 8);
  for (let i = 0; i < (mpm ? 6 : 3); i++) putAny({ type: 'med' }, 10);
  for (let i = 0; i < (mpm ? 8 : 4); i++) putAny({ type: 'heal', kind: ['bandage', 'bandage', 'painkiller', 'adrenaline', 'splint', 'surgery'][(Math.random() * 6) | 0] }, 10);
  for (let i = 0; i < (mpm ? 4 : 3); i++) putAny({ type: 'grenade', kind: rndThr() }, 10);
  for (let i = 0; i < (mpm ? 4 : 1); i++) { const q = poi(3 + i, true); put({ type: 'gear', item: randomGear(false) }, q.s, q.L); }
  for (let i = 0; i < (mpm ? 3 : 1); i++) { const q = poi(4 + i, true); put({ type: 'ammo', items: ammoItems() }, q.s, q.L); }
  if (mpm) pickups.forEach((q, i) => { q.uid = i; });
  Math.random = realRandom;

  cam.x = player.x - vw / S / 2; cam.y = player.y - vh / S / 2;
  clampCam();

  G.state = 'play';
  document.body.classList.add('playing');
  hideAllOverlays();
  $('hud').classList.remove('hidden');
  $('missionName').textContent = 'Operação ' + G.name + ' — ' + MMAP[mode].name + (mode === 'mp' ? '' : ' · Nível ' + level) + (G.night ? ' · 🌙 Noite' : '');
  if (typeof buildSlots === 'function') buildSlots();
  if (typeof buildSquadHUD === 'function') buildSquadHUD();
  banner(MMAP[mode].desc.toUpperCase());
  lastT = performance.now();
}

function endMission(won) {
  if (G.state === 'over') return;
  G.state = 'over'; G.won = won;
  document.body.classList.remove('playing');
  releaseSticks(); input.mouseDown = false; input.act = false;
  const acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
  let earned = G.earned, bonus = 0;
  if (won) bonus = 250 + 60 * G.level; else earned = Math.floor(earned * .5);
  if (G.mode === 'survival') bonus = won ? 300 + 40 * G.level : 0;
  if (G.custom) { earned = 0; bonus = 0; }
  else {
    SAVE.credits += earned + bonus;
    if (won) SAVE.progress[G.mode] = Math.max(SAVE.progress[G.mode] || 0, G.level);
    if (G.mode === 'survival') SAVE.best.survival = Math.max(SAVE.best.survival || 0, won ? G.wave : Math.max(0, G.wave - 1));
    writeSave();
  }
  showEnd({
    won, reason: G.reason, mode: G.mode, level: G.level, time: G.time, kills: G.kills, heads: G.heads, acc, earned, bonus,
    wave: G.wave, partners: allies.filter(a => a.kind === 'partner' && a.dead).length,
  });
}

/* =====================================================================
   ATUALIZAÇÃO
   ===================================================================== */
function update(dt) {
  G.time += dt; G.dt = dt;
  TARGETS = [];
  if (!player.dead && !(MP.on && G.protT > 0)) TARGETS.push(player);
  BOTT = (MP.on && MP.botN) ? enemies.filter(b => b.mpId != null && !b.dead) : [];
  if (MP.on && MP.isHost && MP.botN) for (const r of MP.remotes.values()) if (!r.bot && !r.dead && !r.pr && !r.stale) TARGETS.push(r);
  for (const a of allies) if (!a.dead && !a.bound) TARGETS.push(a);

  updatePlayer(dt);
  for (const a of allies) updateAlly(a, dt);
  for (const e of enemies) if (!e.dead && !(MP.on && MP.phase === 'prep')) updateEnemy(e, dt);
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i]; if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j]; if (b.dead || b.L !== a.L) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = a.r + b.r;
      if (d < md && d > .01) { const push = (md - d) / 2; moveEntity(a, -dx / d * push, -dy / d * push); moveEntity(b, dx / d * push, dy / d * push); }
    }
  }
  updateDoors(dt, MP.on ? [player, ...allies, ...enemies, ...mpEnts()] : [player, ...allies, ...enemies]);
  if (MP.on) mpUpdate(dt);
  updateBullets(dt);
  updateGrenades(dt);
  updateThrowFx(dt);
  updateCharges(dt);
  updateInteract(dt);
  if (MP.on) mpAfter(dt);
  enemies = enemies.filter(e => !e.dead);
  updateParticles(dt);
  for (const it of pickups) it.t += dt;

  G.shake *= Math.exp(-dt * 9);
  { const kd = Math.exp(-dt * 8); G.kx *= kd; G.ky *= kd; }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.6);
  G.hitMark = Math.max(0, G.hitMark - dt);
  G.flashT = Math.max(0, (G.flashT || 0) - dt);
  if (G.night && !G.visOn) G.adapt = Math.min(1, (G.adapt || 0) + dt / 50);        // os olhos vão se acostumando ao escuro
  // tensão: coração acelera quando há inimigo atacando por perto
  let threat = 1e9;
  for (const e of enemies) if (e.state === 'attack' && e.sees) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < threat) threat = d; }
  G.beatT = (G.beatT || 0) - dt; G.pulse = Math.max(0, (G.pulse || 0) - dt * 1.6);
  if (threat < 520 && !player.dead && G.beatT <= 0) { sfx('beat'); G.pulse = 1; G.beatT = lerp(.55, 1.25, threat / 520); }

  checkObjectives(dt);
  if (G.state !== 'play') return;
  if (player.dead && !MP.on) { G.endTimer -= dt; if (G.endTimer <= 0) endMission(false); }
  updateCamera(dt);
}

function clampCam() {
  const w = vw / S, h = vh / S;
  cam.x = WORLD_W > w ? clamp(cam.x, 0, WORLD_W - w) : (WORLD_W - w) / 2;
  cam.y = WORLD_H > h ? clamp(cam.y, 0, WORLD_H - h) : (WORLD_H - h) / 2;
}
function updateCamera(dt) {
  const sp = mpSpec(), p = sp || player, w = vw / S, h = vh / S;
  let lx = 0, ly = 0;
  const bz = G.visOn && !sp && p.visMode === 'zoom';
  const wp = curW(), look = (wp && !wp.melee ? (wp.look || 1) : 1) * (bz ? p.eyeZoom : 1), long = bz || (wp && wp.range >= 1300);
  if (sp) { /* espectador: câmera centrada no aliado */ } else if (!touchMode) {
    const wx = cam.x + input.mx / S - p.x, wy = cam.y + input.my / S - p.y;
    const f = (long ? .6 : .25) * look, mx = (long ? 260 : 120) * look, d = Math.hypot(wx, wy);
    const k = d > 0 ? Math.min(d * f, mx) / d : 0;
    lx = wx * k; ly = wy * k;
  } else if (sticks.aim.id !== null) {
    const m = Math.min(1, Math.hypot(sticks.aim.x, sticks.aim.y)), L = (long ? 230 : 110) * look;
    lx = Math.cos(p.ang) * L * m; ly = Math.sin(p.ang) * L * m;
  }
  const tx = p.x + lx - w / 2, ty = p.y + ly - h / 2;
  const k = 1 - Math.exp(-dt * 7);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  clampCam();
}
