'use strict';

/* =====================================================================
   MODOS EXTRAS ONLINE: Gun Game · Rei da Colina · Cooperativo (ondas)
   (o anfitrião conduz; os clientes aplicam as mesmas mensagens)
   ===================================================================== */
const GG_LADDER = ['m9', 'python', 'deagle', 'uzi', 'mp5', 'p90', 'ak74', 'm4a1', 'ak47', 'spas', 'scar', 'm14', 'awm', 'm249', 'knife'];
const KOTH_R = 75, KOTH_MOVE = 70, COOP_BETWEEN = 8, COOP_MAXBOTS = 12;
const mpVal = p => MP.cfg.gm === 'gungame' ? (p.lvl || 0) : MP.cfg.gm === 'koth' ? Math.round(p.pts || 0) : p.kills;
const mpValLabel = () => MP.cfg.gm === 'gungame' ? 'Nível' : MP.cfg.gm === 'koth' ? 'Pontos' : 'Abates';

/* ---------- Início ---------- */
function mpExtraBegin() {
  const g = MP.cfg.gm;
  for (const p of MP.players.values()) { p.lvl = 0; p.pts = 0; }
  MP.hill = 0; MP.hillT = G.time; MP.ptsT = 0; MP.wave = 0; MP.wst = ''; MP.waveT = 0;
  if (g === 'gungame') {
    MP.ggLD = { weapons: [null, null, 'knife'], attach: {}, gear: Object.assign({}, SAVE.custom.gear), squad: [] };
    ggApply(0);
  } else if (g === 'koth') {
    mpPickSites(); MP.hill = 0;
  } else if (g === 'coop') {
    MP.botN = 99;
    for (const [id, p] of [...MP.players]) if (p.bot) MP.players.delete(id);
    MP.order = [...MP.players.keys()];
  }
}

/* ---------- Gun Game ---------- */
function ggApply(lvl) {
  const id = GG_LADDER[Math.min(lvl, GG_LADDER.length - 1)], w = WMAP[id], L = MP.ggLD;
  L.weapons = [null, null, 'knife'];
  const idx = w.melee ? 2 : (w.slot === 'primary' ? 0 : 1);
  L.weapons[idx] = id;
  LD = L;
  if (!w.melee && !w.inf) player.pool[w.cal] = Math.max(player.pool[w.cal] || 0, w.mag * 6);
  syncPlayerLoadout(); buildSlots();
  player.wi = idx; player.equipT = w.eq || .6; player.reloading = false; player.cool = .3;
  showWeaponName(w.name);
}
function ggOnKill(killer, vic, wid) {
  if (killer && killer !== vic) {
    killer.lvl = (killer.lvl || 0) + 1;
    if (killer.id === MP.myId && killer.lvl < GG_LADDER.length) { ggApply(killer.lvl); banner('NÍVEL ' + (killer.lvl + 1) + '/' + GG_LADDER.length + ' — ' + WMAP[GG_LADDER[killer.lvl]].name.toUpperCase()); }
    if (wid === 'knife' && vic) { vic.lvl = Math.max(0, (vic.lvl || 0) - 1); if (vic.id === MP.myId) { ggApply(vic.lvl); banner('HUMILHAÇÃO: VOCÊ PERDEU UM NÍVEL'); } }
  } else if (vic) { vic.lvl = Math.max(0, (vic.lvl || 0) - 1); if (vic.id === MP.myId) ggApply(vic.lvl); }
}

/* ---------- Rei da Colina ---------- */
function kothTick(dt) {
  const S = MP.sites[MP.hill || 0]; if (!S) return;
  const inside = [];
  const chk = (o, id) => { if (o.L < 0 && Math.hypot(o.x - S.x, o.y - S.y) < KOTH_R) inside.push(id); };
  if (!player.dead) chk(player, MP.myId);
  for (const r of MP.remotes.values()) if (!r.dead && !r.stale && !r.bot) chk(r, r.id);
  for (const e of enemies) if (e.mpId != null && !e.dead) chk(e, e.mpId);
  MP.hillOcc = inside.length;
  if (inside.length === 1) { const p = MP.players.get(inside[0]); if (p) p.pts = (p.pts || 0) + dt; }
  MP.ptsT = (MP.ptsT || 0) - dt;
  if (MP.ptsT <= 0) { MP.ptsT = 1; const l = {}; for (const p of MP.players.values()) l[p.id] = Math.round((p.pts || 0) * 10) / 10; mpSend({ t: 'pts', l, h: MP.hill, o: MP.hillOcc }); }
  if (G.time - MP.hillT > KOTH_MOVE) { MP.hill = ((MP.hill || 0) + 1) % MP.sites.length; MP.hillT = G.time; mpSend({ t: 'pts', l: {}, h: MP.hill, o: 0 }); banner('A COLINA MUDOU DE LUGAR'); }
  const goal = MP.cfg.kl * 8;
  if ([...MP.players.values()].some(p => (p.pts || 0) >= goal)) { mpSend({ t: 'end', r: 'limit' }); mpFinish('limit'); }
}
function mpOnPts(m) {
  if (m.l && typeof m.l === 'object') for (const id in m.l) { const p = MP.players.get(+id); if (p) p.pts = mpNum(m.l[id]); }
  if (m.h != null && (m.h | 0) !== MP.hill) { MP.hill = (m.h | 0) % Math.max(1, MP.sites.length); MP.hillT = G.time; banner('A COLINA MUDOU DE LUGAR'); }
  MP.hillOcc = m.o | 0;
}

/* ---------- Cooperativo: ondas de bots contra todos os humanos ---------- */
function coopTick(dt) {
  if (MP.wave === 0) { if (G.time > 4) coopStart(1); return; }
  const el = G.time - MP.waveT, alive = enemies.some(e => e.mpId != null && !e.dead);
  if (MP.wst === 'live') {
    if (!alive && el > 3) { MP.wst = 'between'; MP.waveT = G.time; mpSend({ t: 'wave', n: MP.wave, st: 'between' }); coopOnWave(MP.wave, 'between'); }
  } else if (MP.wst === 'between' && el >= COOP_BETWEEN) coopStart(MP.wave + 1);
}
function coopStart(n) {
  const total = MP.cfg.rounds * 2;
  if (n > total) { mpSend({ t: 'end', r: 'limit' }); mpFinish('limit'); return; }
  const humans = 1 + [...MP.remotes.values()].filter(r => !r.bot).length, cnt = Math.min(COOP_MAXBOTS, 2 + n + humans * 2);
  for (const [id, p] of [...MP.players]) if (p.bot) MP.players.delete(id);
  for (const id of [...MP.remotes.keys()]) { const r = MP.remotes.get(id); if (r && r.bot) MP.remotes.delete(id); }
  enemies.length = 0;
  const list = [];
  for (let i = 0; i < cnt; i++) {
    const id = 100 + i, foe = rollFoe(.12 + .07 * n + Math.random() * .1, null);
    const p = { id, name: 'Hostil ' + (i + 1), team: 1, kills: 0, deaths: 0, load: mpCleanLoad(foe), foe, bot: true };
    MP.players.set(id, p); list.push({ id, name: p.name, load: p.load });
    mpSpawnBot(p, null);
  }
  MP.order = [...MP.players.keys()];
  MP.wave = n; MP.wst = 'live'; MP.waveT = G.time;
  mpSend({ t: 'bl', l: list }); mpSend({ t: 'wave', n, st: 'live' }); coopOnWave(n, 'live');
}
function mpOnBotList(m) {
  if (!Array.isArray(m.l)) return;
  for (const [id, p] of [...MP.players]) if (p.bot) MP.players.delete(id);
  for (const id of [...MP.remotes.keys()]) { const r = MP.remotes.get(id); if (r && r.bot) MP.remotes.delete(id); }
  for (const it of m.l.slice(0, 16)) { const id = it.id | 0; if (id >= 100) MP.players.set(id, { id, name: mpSanName(it.name, 24), team: 1, kills: 0, deaths: 0, load: mpCleanLoad(it.load), bot: true }); }
  MP.order = [...MP.players.keys()];
}
function coopOnWave(n, st) {
  MP.wave = n; MP.wst = st; MP.waveT = G.time;
  if (st === 'live') banner('ONDA ' + n + '/' + MP.cfg.rounds * 2 + ' — ELIMINE OS HOSTIS');
  else {
    banner('ONDA ' + n + ' CONCLUÍDA — SUPRIMENTOS REPOSTOS');
    if (!player.dead) { healAll(player, .7); for (const k in player.pool) player.pool[k] = Math.min(ammoCap(k), (player.pool[k] || 0) + CALIBERS[k].pack * 2); player.cons.med = Math.min(player.consCap, player.cons.med + 1); }
    else MP.respawnT = Math.min(MP.respawnT, 1);
  }
}

/* ---------- Ticks, texto ---------- */
function mpHostTick2(dt) {
  if (!MP.isHost || MP.ended) return;
  const g = MP.cfg.gm;
  if (g === 'koth') kothTick(dt);
  else if (g === 'coop') coopTick(dt);
}
function mpObjText2() {
  const g = MP.cfg.gm, t = fmtTime(mpTimeLeft());
  if (g === 'gungame') { const me = MP.players.get(MP.myId), l = me ? me.lvl || 0 : 0; return `Gun Game · nível ${l + 1}/${GG_LADDER.length} · ${WMAP[GG_LADDER[Math.min(l, GG_LADDER.length - 1)]].name} · ${t}`; }
  if (g === 'koth') { const me = MP.players.get(MP.myId); return `Rei da Colina · você ${Math.round(me ? me.pts || 0 : 0)}/${MP.cfg.kl * 8} pts · ${MP.hillOcc === 1 ? 'colina dominada' : MP.hillOcc > 1 ? 'colina disputada' : 'colina livre'} · ${t}`; }
  const left = [...MP.remotes.values()].filter(r => r.bot && !r.dead).length + enemies.filter(e => e.mpId != null && !e.dead).length;
  return `Cooperativo · onda ${Math.max(1, MP.wave)}/${MP.cfg.rounds * 2} · ${MP.wst === 'between' ? 'próxima onda em ' + Math.max(0, Math.ceil(COOP_BETWEEN - (G.time - MP.waveT))) + 's' : 'hostis restantes: ' + left}`;
}
