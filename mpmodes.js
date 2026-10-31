'use strict';

/* =====================================================================
   MODOS ATAQUE × DEFESA (online): "Bomba" e "Zona"
   · rounds com fase de preparo, as equipes trocam de lado na metade
   · Bomba: atacantes plantam (segurar E) e defensores desarmam; sem renascer dentro do round
   · Zona: atacantes capturam a zona; defensores seguram; todos renascem
   · o anfitrião conduz a máquina de estados; todos aplicam as mesmas mensagens
   ===================================================================== */
const MPR = { PREP: 6, END: 5, BOMB: 120, ZONE: 150, FUSE: 35, PLANT: 3.5, DEFUSE: 6, CAPT: 20, SITE_R: 44, ZONE_R: 70 };

/* ---------- Pontos do mapa ---------- */
function mpPickSites() {
  const rng = mulberry32((MP.cfg.seed ^ 0x2545f491) >>> 0), cands = [];
  blds.forEach(b => {
    let best = null, bd = 1e9;
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
      const i = y * MW + x;
      if (!reachN[i] || grid0[i] !== 0) continue;
      const d = Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2));
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) cands.push(best);
  });
  const far = cands.filter(c => Math.hypot(c.x - spawnT.x, c.y - spawnT.y) > 20);
  const pool = (far.length >= 2 ? far : cands.length >= 2 ? cands : SPOTS.map(s => ({ x: s.x, y: s.y }))).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const want = MP.cfg.gm === 'bomb' ? 2 : MP.cfg.gm === 'koth' ? 4 : 1, sites = [pool[0]];
  while (sites.length < want) sites.push(pool.find(c => !sites.includes(c) && sites.every(s => Math.hypot(c.x - s.x, c.y - s.y) > 10)) || pool.find(c => !sites.includes(c)) || pool[0]);
  MP.sites = sites.map((s, i) => ({ x: s.x * T + T / 2, y: s.y * T + T / 2, tx: s.x, ty: s.y, name: MP.cfg.gm === 'bomb' ? 'AB'[i] : MP.cfg.gm === 'koth' ? 'H' : 'Z' }));
}
function mpBuildPools() {
  const near = (tx, ty, d) => SPOTS.filter(s => Math.hypot(s.x - tx, s.y - ty) < d);
  let atk = near(spawnT.x, spawnT.y, 8); if (atk.length < 8) atk = near(spawnT.x, spawnT.y, 15);
  let def = SPOTS.filter(s => MP.sites.some(S => Math.hypot(s.x - S.tx, s.y - S.ty) < 10)); if (def.length < 8) def = SPOTS;
  MP.pools = [def, atk];
}
// posições de início de cada jogador no round (iguais em todos os clientes)
function mpRoundLayout(n) {
  const rng = mulberry32((MP.cfg.seed ^ Math.imul(n, 0x9e3779b1)) >>> 0), out = new Map();
  for (let side = 0; side < 2; side++) {
    const pool = MP.pools[side], used = [];
    for (const id of MP.order.filter(i => mpSide(i) === side)) {
      let best = pool[0], bd = -1;
      for (let i = 0; i < 40; i++) {
        const s = pool[(rng() * pool.length) | 0], d = used.length ? Math.min(...used.map(o => Math.hypot(o.x - s.x, o.y - s.y))) : 99;
        if (d > bd) { bd = d; best = s; }
      }
      used.push(best); out.set(id, best);
    }
  }
  return out;
}

/* ---------- Rounds ---------- */
function mpOnRound(m) {
  if (!MP.on || !mpRounds()) { MP.pendingRnd = m; return; }
  const w = Array.isArray(m.w) ? [m.w[0] | 0, m.w[1] | 0] : MP.teamScore;
  if (m.st === 'prep') { MP.teamScore = w; mpRoundReset(m.n | 0, m.sw ? 1 : 0); }
  else if (m.st === 'live') { MP.phase = 'live'; MP.phaseT = G.time; G.protT = 0; banner('VALENDO!'); sfx('pickup'); }
  else if (m.st === 'end') {
    MP.phase = 'end'; MP.phaseT = G.time; MP.teamScore = w; G.protT = Math.max(G.protT || 0, 30);
    const win = m.win ? 1 : 0, mine = (MP.players.get(MP.myId) || {}).team === win;
    banner((mine ? 'ROUND VENCIDO — ' : 'ROUND PERDIDO — ') + String(m.why || '').toUpperCase());
    mpFeed(`Round ${MP.round}: <b>TIME ${win + 1}</b> venceu (${mpEsc(String(m.why || '').slice(0, 40))})`);
  }
}
function mpRoundReset(n, sw) {
  MP.round = n; MP.swap = sw; MP.phase = 'prep'; MP.phaseT = G.time; MP.bomb = null; MP.cap = 0; MP.prog = 0; MP.capIn = [0, 0];
  bullets.length = 0; grenades.length = 0; smokes.length = 0; fires.length = 0; flares.length = 0; mines.length = 0; charges.length = 0; particles.length = 0;
  decals = decals.filter(d => d.k !== 'corpse' && d.k !== 'pool');
  MP.sideN = [0, 0];
  for (const p of MP.players.values()) p.alive = true;
  for (const id of MP.order) if (MP.players.has(id)) MP.sideN[mpSide(id)]++;
  for (const r of MP.remotes.values()) { r.dead = false; r.init = false; r.pr = true; }
  newPlayer(); buildSlots();
  const lay = mpRoundLayout(n);
  mpPlace(lay.get(MP.myId) || SPOTS[0]);
  G.visOn = false; G.hurtFlash = 0; G.flashT = 0; G.endTimer = 0; G.reason = ''; G.protT = 99; MP.respawnT = 0;
  if (MP.isHost) {
    enemies.length = 0; MP.botRespawns = [];
    for (const id of MP.order) { const p = MP.players.get(id); if (p && p.bot) mpSpawnBot(p, lay.get(id)); }
  }
  mpSendState();
  const atk = mpSide(MP.myId) === 1, bomb = MP.cfg.gm === 'bomb';
  banner(`ROUND ${n}/${MP.cfg.rounds} — ` + (atk ? (bomb ? 'ATAQUE: plante a bomba em A ou B (segure E)' : 'ATAQUE: capture a zona') : (bomb ? 'DEFESA: impeça a plantagem e desarme a bomba' : 'DEFESA: segure a zona')));
}
function mpRoundStartHost(n) {
  const sw = n > Math.ceil(MP.cfg.rounds / 2) ? 1 : 0;
  const m = { t: 'rnd', st: 'prep', n, sw, w: MP.teamScore.slice() };
  mpSend(m); mpOnRound(m);
}
function mpEndRound(side, why) {
  const team = side ^ MP.swap;
  MP.teamScore[team]++;
  const m = { t: 'rnd', st: 'end', n: MP.round, w: MP.teamScore.slice(), win: team, why };
  mpSend(m); mpOnRound(m);
}
function mpNextRound() {
  const total = MP.cfg.rounds, w = MP.teamScore;
  if (MP.round >= total || Math.max(w[0], w[1]) > total / 2) { mpSend({ t: 'end', r: 'limit' }); mpFinish('limit'); return; }
  mpRoundStartHost(MP.round + 1);
}
function mpAlive(side) { let n = 0; for (const p of MP.players.values()) if (mpSide(p.id) === side && p.alive !== false) n++; return n; }
function mpRoundResult(el) {
  const b = MP.bomb, [dn, an] = MP.sideN;
  if (MP.cfg.gm === 'bomb') {
    if (b && b.defused) return { side: 0, why: 'bomba desarmada' };
    if (b && !b.defused && G.time - b.at >= MPR.FUSE) return { side: 1, why: 'bomba explodiu' };
    if (mpAlive(0) === 0 && dn > 0) return { side: 1, why: 'defensores eliminados' };
    if (mpAlive(1) === 0 && an > 0 && !b) return { side: 0, why: 'atacantes eliminados' };
    if (!b && el >= MPR.BOMB) return { side: 0, why: 'tempo esgotado' };
  } else {
    if (MP.cap >= 100) return { side: 1, why: 'zona capturada' };
    if (el >= MPR.ZONE) return { side: 0, why: 'zona defendida' };
  }
  return null;
}
// só o anfitrião: conduz fases, objetivos dos bots e condições de vitória
function mpHostTick(dt) {
  if (!MP.isHost || MP.ended) return;
  if (MP.round === 0) { if (G.time > 2.5) mpRoundStartHost(1); return; }
  const el = G.time - MP.phaseT;
  if (MP.phase === 'prep') { if (el >= MPR.PREP) { const m = { t: 'rnd', st: 'live', n: MP.round }; mpSend(m); mpOnRound(m); } return; }
  if (MP.phase === 'end') { if (el >= MPR.END) mpNextRound(); return; }
  if (MP.phase !== 'live') return;
  if (MP.cfg.gm === 'zone') mpZoneTick(dt);
  mpBotObjectives(dt);
  const r = mpRoundResult(el);
  if (r) mpEndRound(r.side, r.why);
}
function mpZoneTick(dt) {
  const S = MP.sites[0]; if (!S) return;
  let a = 0, d = 0;
  const cnt = (o, id) => { if (o.L >= 0 || Math.hypot(o.x - S.x, o.y - S.y) > MPR.ZONE_R) return; if (mpSide(id) === 1) a++; else d++; };
  if (!player.dead) cnt(player, MP.myId);
  for (const r of MP.remotes.values()) if (!r.dead && !r.bot) cnt(r, r.id);
  for (const e of enemies) if (e.mpId != null && !e.dead) cnt(e, e.mpId);
  if (a > 0 && d === 0) MP.cap = Math.min(100, MP.cap + dt * (100 / MPR.CAPT) * Math.min(2, 1 + .3 * (a - 1)));
  else if (d > 0 && a === 0) MP.cap = Math.max(0, MP.cap - dt * (100 / 30));
  MP.capIn = [d, a];
  MP.capSendT = (MP.capSendT || 0) - dt;
  if (MP.capSendT <= 0) { MP.capSendT = .4; mpSend({ t: 'cap', v: Math.round(MP.cap * 10) / 10, i: [d, a] }); }
}

/* ---------- Bomba ---------- */
function mpDoPlant(s) { if (MP.phase !== 'live' || MP.bomb || !MP.sites[s]) return; mpSend({ t: 'obj', k: 'plant', s }); mpApplyPlant(s); }
function mpDoDefuse() { if (!MP.bomb || MP.bomb.defused) return; mpSend({ t: 'obj', k: 'defuse' }); mpApplyDefuse(); }
function mpApplyPlant(s) {
  const S = MP.sites[s | 0];
  if (!S || MP.phase !== 'live' || MP.bomb || MP.cfg.gm !== 'bomb') return;
  MP.bomb = { x: S.x, y: S.y, s: s | 0, at: G.time, defused: false };
  charges.push({ x: S.x, y: S.y, fuse: MPR.FUSE, L: -1, mp: true });
  banner('BOMBA PLANTADA NO PONTO ' + S.name + ' — DEFENSORES, DESARMEM!'); sfx('beep');
}
function mpApplyDefuse() {
  if (!MP.bomb || MP.bomb.defused) return;
  MP.bomb.defused = true; charges = charges.filter(c => !c.mp);
  banner('BOMBA DESARMADA'); sfx('pickup');
}
// jogador humano: segurar E perto do ponto/bomba
function mpAfter(dt) {
  if (!mpRounds() || MP.phase !== 'live' || player.dead || player.L >= 0) { MP.prog = 0; return; }
  const side = mpSide(MP.myId), holding = input.act || input.keys.has('KeyE');
  let tgt = null, need = 0, type = null;
  if (MP.cfg.gm === 'bomb') {
    if (side === 1 && !MP.bomb) MP.sites.forEach((S, i) => { if (Math.hypot(player.x - S.x, player.y - S.y) < MPR.SITE_R) { tgt = S; need = MPR.PLANT; type = 'plant'; MP.tsite = i; } });
    else if (side === 0 && MP.bomb && !MP.bomb.defused && Math.hypot(player.x - MP.bomb.x, player.y - MP.bomb.y) < 42) { tgt = MP.bomb; need = MPR.DEFUSE; type = 'defuse'; }
  }
  if (!tgt) { MP.prog = 0; return; }
  MP.prog = holding ? MP.prog + dt : Math.max(0, MP.prog - dt * 1.5);
  G.near = { x: tgt.x, y: tgt.y, prog: MP.prog, need, type };
  if (MP.prog >= need) { MP.prog = 0; if (type === 'plant') mpDoPlant(MP.tsite); else mpDoDefuse(); }
}

/* ---------- Bots com objetivo ---------- */
function mpBotObjective(e) {
  if (!MP.sites.length) return null;
  if (MP.cfg.gm === 'koth') return MP.sites[MP.hill || 0];
  if (MP.cfg.gm === 'zone') return MP.sites[0];
  if (MP.bomb && !MP.bomb.defused) return MP.bomb;
  return MP.sites[(e.site || 0) % MP.sites.length];
}
function mpBotPatrol(e) {
  if (!((mpRounds() && MP.phase === 'live') || MP.cfg.gm === 'koth')) return false;
  const o = mpBotObjective(e);
  if (!o || (MP.cfg.gm !== 'koth' && Math.random() < .2)) return false;
  pathTo(e, o.x + rand(-28, 28), o.y + rand(-28, 28), -1);
  return !!e.path;
}
function mpBotObjectives(dt) {
  for (const e of enemies) {
    if (e.mpId == null || e.dead) continue;
    const o = mpBotObjective(e);
    if (!o || e.state === 'attack' || e.L >= 0 || Math.hypot(e.x - o.x, e.y - o.y) > 60) { e.objT = 0; continue; }
    e.objT = (e.objT || 0) + dt;
    if (MP.cfg.gm !== 'bomb') continue;
    const side = mpSide(e.mpId);
    if (side === 1 && !MP.bomb && e.objT >= MPR.PLANT) mpDoPlant((e.site || 0) % MP.sites.length);
    else if (side === 0 && MP.bomb && !MP.bomb.defused && e.objT >= MPR.DEFUSE) mpDoDefuse();
  }
}

/* ---------- Espectador (quem cai na Bomba assiste a um aliado) ---------- */
function mpSpecTarget() {
  const my = mpSide(MP.myId); let best = null;
  const consider = (o, id) => { const pr = mpSide(id) === my ? 0 : 1; if (!best || pr < best.pr) best = { pr, x: o.x, y: o.y, L: o.L, a: o.a != null ? o.a : (o.ang || 0) }; };
  for (const r of MP.remotes.values()) if (!r.dead && r.init) consider(r, r.id);
  for (const e of enemies) if (e.mpId != null && !e.dead) consider(e, e.mpId);
  return best;
}
const mpSpec = () => (MP.on && MP.cfg.gm === 'bomb' && player && player.dead && MP.respawnT > 30) ? mpSpecTarget() : null;

/* ---------- Desenho, seta de objetivo e texto ---------- */
function mpDrawSites(c) {
  const t = G.time, zone = MP.cfg.gm !== 'bomb', koth = MP.cfg.gm === 'koth';
  for (const S of (koth ? [MP.sites[MP.hill || 0]].filter(Boolean) : MP.sites)) {
    const R = koth ? KOTH_R : zone ? MPR.ZONE_R : MPR.SITE_R, col = zone ? (MP.cap > 0 ? '255,100,80' : '255,210,90') : '255,200,60';
    c.save(); c.translate(S.x, S.y);
    c.fillStyle = `rgba(${col},${.1 + .05 * Math.sin(t * 3)})`; c.beginPath(); c.arc(0, 0, R, 0, PI2); c.fill();
    c.strokeStyle = `rgba(${col},.8)`; c.lineWidth = 3; c.setLineDash([10, 8]); c.rotate(t * .4); c.beginPath(); c.arc(0, 0, R, 0, PI2); c.stroke(); c.setLineDash([]); c.rotate(-t * .4);
    if (MP.cfg.gm === 'zone' && MP.cap > 0) { c.strokeStyle = '#ff6a5a'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, R - 6, -Math.PI / 2, -Math.PI / 2 + PI2 * MP.cap / 100); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.88)'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4;
    c.strokeText(S.name, 0, 2); c.fillText(S.name, 0, 2);
    c.restore();
  }
}
function mpObjTarget() {
  if (MP.cfg.gm === 'koth') { const S = MP.sites[MP.hill || 0]; return S && !player.dead ? { x: S.x, y: S.y, col: '#ffd24a' } : null; }
  if (!mpRounds() || !MP.sites.length || player.dead) return null;
  const atk = mpSide(MP.myId) === 1;
  if (MP.cfg.gm === 'bomb' && MP.bomb && !MP.bomb.defused) return { x: MP.bomb.x, y: MP.bomb.y, col: atk ? '#ff9a3a' : '#6fd8ff' };
  let best = null, bd = 1e9;
  for (const S of MP.sites) { const d = Math.hypot(S.x - player.x, S.y - player.y); if (d < bd) { bd = d; best = S; } }
  return best && { x: best.x, y: best.y, col: atk ? '#ff6a5a' : '#6fd8ff' };
}
function mpRoundText() {
  const role = mpSide(MP.myId) === 1 ? '⚔ ATAQUE' : '🛡 DEFESA', el = G.time - MP.phaseT;
  let st = 'Aguardando início…';
  if (MP.phase === 'prep') st = 'Preparar ' + Math.max(0, Math.ceil(MPR.PREP - el)) + 's';
  else if (MP.phase === 'end') st = 'Fim do round';
  else if (MP.phase === 'live') {
    const left = fmtTime(Math.max(0, (MP.cfg.gm === 'zone' ? MPR.ZONE : MPR.BOMB) - el));
    if (MP.bomb) st = MP.bomb.defused ? 'Bomba desarmada' : '💣 ' + Math.max(0, Math.ceil(MPR.FUSE - (G.time - MP.bomb.at))) + 's';
    else st = MP.cfg.gm === 'zone' ? 'Zona ' + Math.round(MP.cap) + '% · ' + left : left;
  }
  return `Round ${Math.max(1, MP.round)}/${MP.cfg.rounds} · TIME 1 ${MP.teamScore[0]} × ${MP.teamScore[1]} TIME 2 · ${role} · ${st}`;
}
