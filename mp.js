'use strict';

/* =====================================================================
   MULTIPLAYER ONLINE — partida PvP (todos contra todos / equipes)
   · WebRTC via PeerJS, topologia em estrela: o anfitrião repassa as mensagens
   · o mundo é gerado pela mesma semente em todos os clientes
   · quem atira decide o acerto e o alvo aplica o dano (colete, partes do corpo)
   · explosivos, granadas, minas e fogo são simulados em todos e só ferem o jogador local
   ===================================================================== */
const MP_MAX = 8, MP_SEND = 1 / 15, MP_RESPAWN = 4, MP_PROT = 2.5, MP_PK_RESPAWN = 40;
const MP_TEAMS = [
  { name: 'AZUL', color: '#5aa9ff', look: { body: '#3f6f98', vest: '#26425a', helmet: '#2d4e6e', stripe: '#8fdcff' } },
  { name: 'VERMELHO', color: '#ff6a5a', look: { body: '#9a3f36', vest: '#5a221c', helmet: '#6e2e26', stripe: '#ffb0a0' } },
];
const MP_STATE_HP = [1, .7, .42, .15, 0];
const mpNum = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
const mpR = v => Math.round(v * 10) / 10;
const mpEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MP_NO_NET = 'Não foi possível carregar a biblioteca de rede. Verifique a internet.';

const MP = {
  on: false, state: 'home',                       // home | connecting | creating | lobby
  peer: null, isHost: false, myId: 0, code: '',
  conns: new Map(), hostConn: null, nextId: 1,
  players: new Map(), remotes: new Map(), order: [],
  cfg: { gm: 'dm', kl: 15, tl: 8, night: false, seed: 0 },
  name: '', joinCode: '', status: '', ended: false,
  feed: [], respawns: [], teamScore: [0, 0],
  respawnT: 0, sendT: 0, hudT: 0, lastMsg: '',
};
try { const u = new URLSearchParams(location.search).get('sala'); if (u) MP.joinCode = u.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); } catch (_) { /* sem URL */ }

/* ---------- Auxiliares ---------- */
const mpTeamOf = id => { const p = MP.players.get(id); return p ? p.team : 0; };
const mpTdm = () => MP.cfg.gm === 'tdm';
const mpFriend = id => id != null && id !== MP.myId && mpTdm() && mpTeamOf(id) === mpTeamOf(MP.myId);
function mpLook(id) {
  if (mpTdm()) return MP_TEAMS[mpTeamOf(id) & 1].look;
  const i = Math.max(0, MP.order.indexOf(id)), h = (i * 47 + 12) % 360;
  return { body: `hsl(${h},42%,36%)`, vest: `hsl(${h},40%,22%)`, helmet: `hsl(${h},40%,28%)`, stripe: `hsl(${h},85%,72%)` };
}
const mpColor = id => mpTdm() ? MP_TEAMS[mpTeamOf(id) & 1].color : mpLook(id).stripe;
function mpLoad() { const c = SAVE.custom; return { weapons: c.weapons.slice(0, 3), attach: JSON.parse(JSON.stringify(c.attach || {})), gear: Object.assign({}, c.gear) }; }
function mpCleanLoad(l) {
  const out = { weapons: [null, null, null], attach: {}, gear: {} };
  if (!l || typeof l !== 'object') return out;
  if (Array.isArray(l.weapons)) l.weapons.slice(0, 3).forEach((id, i) => { if (WMAP[id]) out.weapons[i] = id; });
  if (l.attach && typeof l.attach === 'object') for (const id in l.attach) if (WMAP[id] && l.attach[id] && typeof l.attach[id] === 'object') { const a = {}; for (const s of ['muzzle', 'top', 'under']) if (AMAP[l.attach[id][s]]) a[s] = l.attach[id][s]; out.attach[id] = a; }
  if (l.gear && typeof l.gear === 'object') for (const s of ['head', 'body', 'legs', 'back', 'eyes']) if (GMAP[l.gear[s]]) out.gear[s] = l.gear[s];
  return out;
}
function mpSanName(s) { s = String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14); return s || 'Soldado'; }
function mpSetStatus(s) { MP.status = s; if (!$('mpScreen').classList.contains('hidden')) renderMp(); }

/* ---------- Rede ---------- */
function mpSend(m) {
  m.f = MP.myId;
  if (MP.isHost) { for (const c of MP.conns.values()) if (c.open) c.send(m); }
  else if (MP.hostConn && MP.hostConn.open) MP.hostConn.send(m);
}
function mpSendTo(id, m) {
  m.f = MP.myId; m.to = id;
  if (MP.isHost) { const c = MP.conns.get(id); if (c && c.open) c.send(m); }
  else if (MP.hostConn && MP.hostConn.open) MP.hostConn.send(m);
}
function mpClose() {
  MP.on = false; MP.state = 'home'; MP.ended = false;
  try { if (MP.peer) MP.peer.destroy(); } catch (_) { /* ignora */ }
  MP.peer = null; MP.hostConn = null; MP.conns.clear(); MP.players.clear(); MP.remotes.clear(); MP.order = []; MP.isHost = false; MP.code = ''; MP.myId = 0;
}
function mpLeave() { mpClose(); MP.status = ''; }

const mpRandCode = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[(Math.random() * a.length) | 0]; return s; };

function mpCreate() {
  if (typeof Peer === 'undefined') return mpSetStatus(MP_NO_NET);
  mpClose();
  MP.isHost = true; MP.myId = 0; MP.nextId = 1; MP.state = 'creating'; MP.status = 'Criando sala...'; renderMp();
  const attempt = n => {
    const code = mpRandCode(), peer = new Peer('optac-' + code);
    MP.peer = peer;
    peer.on('open', () => {
      MP.code = code; MP.state = 'lobby'; MP.status = '';
      MP.players.set(0, { id: 0, name: MP.name, team: 0, kills: 0, deaths: 0, load: mpLoad() });
      renderMp();
    });
    peer.on('connection', conn => mpHostAccept(conn));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* ignora */ } });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && n < 6) { try { peer.destroy(); } catch (_) { /* ignora */ } attempt(n + 1); return; }
      if (MP.state === 'creating') { mpClose(); mpSetStatus('Erro de rede: ' + e.type); }
    });
  };
  attempt(0);
}
function mpHostAccept(conn) {
  conn.on('data', m => mpHostRecv(conn, m));
  conn.on('close', () => mpHostDrop(conn));
  conn.on('error', () => mpHostDrop(conn));
}
function mpHostRecv(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (conn._pid != null) return;
    if (MP.on || MP.players.size >= MP_MAX) { conn.send({ t: 'full', why: MP.on ? 'A partida já começou.' : 'Sala cheia.' }); setTimeout(() => { try { conn.close(); } catch (_) { /* ignora */ } }, 400); return; }
    const id = MP.nextId++, t0 = [...MP.players.values()].filter(p => p.team === 0).length, t1 = MP.players.size - t0;
    conn._pid = id; MP.conns.set(id, conn);
    MP.players.set(id, { id, name: mpSanName(m.name), team: t0 <= t1 ? 0 : 1, kills: 0, deaths: 0, load: mpCleanLoad(m.load) });
    conn.send({ t: 'welcome', id });
    mpBroadcastLobby();
    return;
  }
  const id = conn._pid; if (id == null) return;
  m.f = id;
  if (m.to != null && m.to !== 0) { const c = MP.conns.get(m.to); if (c && c.open) c.send(m); return; }
  if (m.to == null) for (const [cid, c] of MP.conns) if (cid !== id && c.open) c.send(m);
  mpHandle(m);
}
function mpHostDrop(conn) {
  const id = conn._pid; if (id == null) return;
  conn._pid = null; MP.conns.delete(id);
  const p = MP.players.get(id); MP.players.delete(id); MP.remotes.delete(id);
  mpSend({ t: 'left', id });
  if (p && MP.on) mpFeed(`<b>${mpEsc(p.name)}</b> saiu da partida`);
  if (!MP.on) mpBroadcastLobby();
}
function mpBroadcastLobby() {
  mpSend({ t: 'lobby', players: [...MP.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team })), cfg: MP.cfg, code: MP.code });
  renderMp();
}
function mpJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return mpSetStatus('Digite o código da sala.');
  if (typeof Peer === 'undefined') return mpSetStatus(MP_NO_NET);
  mpClose();
  MP.isHost = false; MP.state = 'connecting'; MP.code = code; MP.status = 'Conectando à sala ' + code + '...'; renderMp();
  const peer = new Peer(); MP.peer = peer;
  const timer = setTimeout(() => { if (MP.state === 'connecting') { mpClose(); mpSetStatus('Tempo esgotado. Confira o código e a internet.'); } }, 15000);
  peer.on('open', () => {
    const conn = peer.connect('optac-' + code, { reliable: true });
    MP.hostConn = conn;
    conn.on('open', () => conn.send({ t: 'hello', name: MP.name, load: mpLoad() }));
    conn.on('data', m => mpGuestRecv(m));
    conn.on('close', () => { clearTimeout(timer); mpHostLost(); });
    conn.on('error', () => { /* o fechamento trata */ });
  });
  peer.on('error', e => {
    clearTimeout(timer);
    if (MP.state === 'connecting' || MP.state === 'lobby' || MP.on) { mpClose(); mpSetStatus(e.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.' : 'Erro de rede: ' + e.type); }
  });
}
function mpGuestRecv(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': MP.myId = m.id | 0; MP.state = 'lobby'; MP.status = ''; renderMp(); break;
    case 'full': mpClose(); mpSetStatus(String(m.why || 'Sala indisponível.')); break;
    case 'lobby': mpApplyLobby(m); break;
    case 'start': if (m.f === 0 || m.f == null) mpBegin(m.cfg, m.order); break;
    default: mpHandle(m);
  }
}
function mpApplyLobby(m) {
  if (!Array.isArray(m.players)) return;
  const next = new Map();
  for (const q of m.players.slice(0, MP_MAX)) {
    const id = q.id | 0, old = MP.players.get(id);
    next.set(id, { id, name: mpSanName(q.name), team: q.team ? 1 : 0, kills: old ? old.kills : 0, deaths: old ? old.deaths : 0, load: old ? old.load : mpCleanLoad(null) });
  }
  MP.players = next;
  if (m.cfg && typeof m.cfg === 'object') {
    MP.cfg.gm = m.cfg.gm === 'tdm' ? 'tdm' : 'dm';
    MP.cfg.kl = clamp(mpNum(m.cfg.kl, 15) | 0, 3, 100); MP.cfg.tl = clamp(mpNum(m.cfg.tl, 8) | 0, 1, 60); MP.cfg.night = !!m.cfg.night;
  }
  if (!MP.on) renderMp();
}
function mpHostLost() {
  if (MP.on) { mpFinish('host'); }
  else if (!$('mpScreen').classList.contains('hidden')) { mpClose(); mpSetStatus('O anfitrião fechou a sala.'); }
  else mpClose();
}

/* ---------- Mensagens de jogo ---------- */
function mpHandle(m) {
  const pl = MP.players.get(m.f);
  if (m.t === 'left') { if (m.f === 0) { const q = MP.players.get(m.id | 0); MP.players.delete(m.id | 0); MP.remotes.delete(m.id | 0); if (q && MP.on) mpFeed(`<b>${mpEsc(q.name)}</b> saiu da partida`); } return; }
  if (!pl) return;
  switch (m.t) {
    case 'load': pl.load = mpCleanLoad(m.load); break;
    case 'st': if (MP.on) mpOnState(m, pl); break;
    case 'sh': if (MP.on) mpOnShots(m, pl); break;
    case 'th': if (MP.on) mpOnThrow(m, pl); break;
    case 'hit': if (MP.on) mpOnHit(m); break;
    case 'dead': if (MP.on) mpOnDead(m, pl); break;
    case 'pk': if (MP.on) mpOnPick(m); break;
    case 'end': if (m.f === 0) mpFinish(m.r); break;
  }
}

function mpRemote(id) {
  let r = MP.remotes.get(id);
  if (!r) { r = { id, x: 0, y: 0, tx: 0, ty: 0, L: -1, a: 0, ta: 0, r: 11, w: null, hp: 100, dead: true, pr: false, cr: false, walk: 0, fl: 0, rec: 0, hitT: 0, showT: 0, lastPart: 'torso', init: false, vis: false, ps: [0, 0, 0, 0, 0, 0], parts: null }; MP.remotes.set(id, r); mpPartsOf(r); }
  return r;
}
function mpPartsOf(r) { const o = {}; PARTS.forEach((k, i) => { o[k] = { hp: MP_STATE_HP[r.ps[i]] || 0, max: 1 }; }); r.parts = o; }
function mpOnState(m) {
  const r = mpRemote(m.f);
  r.tx = mpNum(m.x); r.ty = mpNum(m.y); r.ta = mpNum(m.a); r.L = clamp(mpNum(m.L, -1) | 0, -1, Math.max(-1, blds.length - 1));
  if (!r.init || (r.dead && !m.d)) { r.x = r.tx; r.y = r.ty; r.a = r.ta; r.init = true; }
  r.w = WMAP[m.w] ? m.w : null; r.hp = mpNum(m.h); r.dead = !!m.d; r.pr = !!m.pr; r.cr = !!m.c;
  if (m.fl) r.fl = .06;
  if (typeof m.ps === 'string' && m.ps.length === 6) { r.ps = m.ps.split('').map(ch => clamp(+ch || 0, 0, 4)); mpPartsOf(r); }
}
function mpSendState() {
  const p = player, w = curW();
  mpSend({ t: 'st', x: mpR(p.x), y: mpR(p.y), L: p.L, a: +p.ang.toFixed(2), w: p.melee ? p.melee.w.id : (w ? w.id : null), h: Math.round(p.hp), d: p.dead ? 1 : 0, pr: G.protT > 0 ? 1 : 0, c: p.fx && p.fx.crawl ? 1 : 0, fl: p.flash > 0 ? 1 : 0, ps: PARTS.map(k => pState(p, k)).join('') });
}

// tiros: cada projétil vira um "fantasma" visual/destruidor nos outros clientes
function mpSendShots(list) {
  if (!list.length) return;
  mpSend({ t: 'sh', b: list.map(b => ({ x: mpR(b.x), y: mpR(b.y), dx: +b.dx.toFixed(3), dy: +b.dy.toFixed(3), s: Math.round(b.speed), d: Math.round(b.dmg), r: Math.round(b.range), L: b.L, pw: +b.pw.toFixed(2), id: b.id, ro: b.rocket ? 1 : 0, rad: b.radius || 0, br: b.breaks ? 1 : 0, sp: b.sup ? 1 : 0, fl: b.flame ? 1 : 0, i: b.inc ? 1 : 0, fr: b.fragR || 0, c: b.col })) });
}
function mpOnShots(m, pl) {
  if (!Array.isArray(m.b)) return;
  const r = mpRemote(m.f), friend = mpFriend(m.f);
  let first = null;
  for (const q of m.b.slice(0, 24)) {
    const w = WMAP[q.id]; if (!w) continue;
    const b = {
      x: mpNum(q.x), y: mpNum(q.y), dx: clamp(mpNum(q.dx), -1, 1), dy: clamp(mpNum(q.dy), -1, 1), speed: clamp(mpNum(q.s, 1000), 100, 4000), dmg: clamp(mpNum(q.d, 10), 0, 250),
      range: clamp(mpNum(q.r, 600), 50, 3000), dist: 0, from: 'n', owner: m.f, friend, L: clamp(mpNum(q.L, -1) | 0, -1, Math.max(-1, blds.length - 1)), id: q.id, pw: clamp(mpNum(q.pw), 0, 20),
      rocket: !!q.ro, radius: clamp(mpNum(q.rad), 0, 200), breaks: !!q.br, sup: !!q.sp, flame: !!q.fl, inc: !!q.i, stunS: 0, fragR: clamp(mpNum(q.fr), 0, 200), tx: -1, ty: -1, col: typeof q.c === 'string' ? q.c.slice(0, 16) : '#ff7a50', hit: null,
    };
    if (b.rocket && (!w.rocket)) b.rocket = false;
    bullets.push(b); if (!first) first = b;
  }
  if (first) {
    const w = WMAP[first.id], d = Math.hypot(first.x - player.x, first.y - player.y);
    r.fl = .06; r.rec = 1;
    if (d < 1400) sfx(w.snd || 'rifle', clamp(1.15 - d / 1100, .08, 1) * (w.sup ? .25 : 1));
  }
}

// tiro nosso contra jogadores remotos (quem atira decide o acerto)
function mpBulletVsRemotes(b) {
  for (const r of MP.remotes.values()) {
    if (r.dead || r.pr || r.L !== b.L || (b.hit && b.hit.includes(r)) || mpFriend(r.id)) continue;
    const dx = r.x - b.x, dy = r.y - b.y, rr = r.r + 2;
    if (dx * dx + dy * dy >= rr * rr) continue;
    (b.hit || (b.hit = [])).push(r);
    const ang = Math.atan2(b.dy, b.dx);
    if (b.rocket) { explode(b.x, b.y, b.radius, b.dmg, b.L); return true; }
    if (b.fragR) { explode(b.x, b.y, b.fragR, b.dmg * 1.2, b.L); return true; }
    const part = rollPart({ x: r.x, y: r.y, ang: r.a, r: r.r }, b.x, b.y, WMAP[b.id] && WMAP[b.id].spread < .02 ? .08 : 0);
    G.hits++; G.hitMark = .15; G.hitCol = part === 'head' ? '#ffd24a' : part === 'torso' ? '#ffffff' : '#ff9a1f';
    mpSendTo(r.id, { t: 'hit', p: part, d: Math.round(b.dmg * 10) / 10, pen: +b.pw.toFixed(2), a: +ang.toFixed(2), w: b.id });
    r.hitT = .1; r.showT = 3; r.lastPart = part;
    bloodBurst(r.x, r.y, ang, part === 'head' ? 8 : 4, r.L, false);
    addText(r.x + rand(-6, 6), r.y - r.r - 6, Math.round(b.dmg * PART_MUL[part]), part === 'head' ? '#ffd24a' : '#fff', part === 'head' ? 14 : 12);
    sfx(part === 'head' ? 'head' : 'hit');
    b.pw -= 1.4; b.dmg *= .7;
    if (b.pw <= 0) return true;
  }
  return false;
}
// golpe corpo a corpo contra jogadores remotos
function mpMelee(w, ang) {
  const p = player, list = [];
  for (const r of MP.remotes.values()) {
    if (r.dead || r.pr || r.L !== p.L || mpFriend(r.id)) continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d > w.range + r.r) continue;
    if (Math.abs(angDiff(Math.atan2(r.y - p.y, r.x - p.x), ang)) > w.arc / 2 + Math.min(.6, r.r / Math.max(d, 1))) continue;
    list.push({ r, d });
  }
  list.sort((a, b) => a.d - b.d);
  if (!w.sweep) list.length = Math.min(1, list.length);
  for (const { r } of list) {
    const behind = Math.abs(angDiff(r.a, Math.atan2(p.y - r.y, p.x - r.x))) > 2;
    let dmg = w.dmg, part;
    if (behind) { dmg *= w.back || 3; part = Math.random() < .5 ? 'head' : 'torso'; addText(r.x, r.y - r.r - 24, 'ABATE SILENCIOSO', '#ffd24a', 12); }
    else part = rollMeleePart();
    mpSendTo(r.id, { t: 'hit', p: part, d: dmg, pen: 3, a: +ang.toFixed(2), w: w.id, kb: w.knock || 0 });
    sfx('melee'); G.hitMark = .18; G.hitCol = part === 'head' ? '#ffd24a' : '#fff'; G.hits++;
    bloodBurst(r.x, r.y, ang, 8, r.L, true); r.hitT = .1; r.showT = 3; r.lastPart = part;
  }
}
// somos o alvo: aplica o dano que o atirador decidiu
function mpOnHit(m) {
  if (player.dead || G.protT > 0 || mpFriend(m.f)) return;
  const part = PARTS.includes(m.p) ? m.p : 'torso', a = mpNum(m.a);
  G.lastHitBy = m.f; G.lastHitW = WMAP[m.w] ? m.w : null; G.lastHitT = G.time;
  const kb = clamp(mpNum(m.kb), 0, 400);
  if (kb) { player.kvx += Math.cos(a) * kb * 4; player.kvy += Math.sin(a) * kb * 4; }
  applyHit(player, part, clamp(mpNum(m.d), 0, 400), { pen: clamp(mpNum(m.pen), 0, 12), ang: a });
}
// quem pode nos ferir com explosões/fogo (origem = id do dono)
function mpHurtFrom(src) {
  if (!MP.on) return true;
  if (G.protT > 0) return false;
  if (src == null || src === MP.myId) return true;
  return !mpFriend(src);
}
function mpNoteHit(src, w) { if (MP.on && src != null && src !== MP.myId) { G.lastHitBy = src; G.lastHitW = w || 'boom'; G.lastHitT = G.time; } }

// arremessáveis e minas
function mpSendThrow(g, mine) {
  if (mine) mpSend({ t: 'th', k: 'mine', x: mpR(g.x), y: mpR(g.y), a: +g.ang.toFixed(2), L: g.L });
  else mpSend({ t: 'th', k: g.kind, x: mpR(g.x), y: mpR(g.y), vx: Math.round(g.vx), vy: Math.round(g.vy), tt: +g.t.toFixed(2), L: g.L });
}
function mpOnThrow(m) {
  const L = clamp(mpNum(m.L, -1) | 0, -1, Math.max(-1, blds.length - 1));
  if (m.k === 'mine') { mines.push({ x: mpNum(m.x), y: mpNum(m.y), L, ang: mpNum(m.a), arm: 1.5, owner: m.f }); return; }
  if (!TMAP[m.k]) return;
  grenades.push({ x: mpNum(m.x), y: mpNum(m.y), vx: clamp(mpNum(m.vx), -1200, 1200), vy: clamp(mpNum(m.vy), -1200, 1200), t: clamp(mpNum(m.tt, 2), .1, 6), kind: m.k, L, owner: m.f });
  if (Math.hypot(mpNum(m.x) - player.x, mpNum(m.y) - player.y) < 900) sfx('throw');
}
// uma mina inimiga é detonada por quem passar perto dela (inclusive jogadores remotos)
function mpMineTriggered(m) {
  const near = (o, r) => Math.hypot(o.x - m.x, o.y - m.y) < 64 + r;
  if (!player.dead && m.owner !== MP.myId && m.L === player.L && near(player, player.r) && !mpFriend(m.owner)) return true;
  for (const r of MP.remotes.values()) if (!r.dead && r.id !== m.owner && r.L === m.L && near(r, r.r) && !(mpTdm() && mpTeamOf(r.id) === mpTeamOf(m.owner))) return true;
  return false;
}

// ---- pickups compartilhados ----
function mpPicked(it) {
  mpSend({ t: 'pk', u: it.uid });
  MP.respawns.push({ at: G.time + MP_PK_RESPAWN, it: Object.assign({}, it, { t: 0 }) });
}
function mpOnPick(m) {
  const i = pickups.findIndex(p => p.uid === (m.u | 0));
  if (i >= 0) { MP.respawns.push({ at: G.time + MP_PK_RESPAWN, it: Object.assign({}, pickups[i], { t: 0 }) }); pickups.splice(i, 1); }
}

/* ---------- Mortes, placar e fim de partida ---------- */
function mpFeed(html) { MP.feed.push({ html, t: 7 }); if (MP.feed.length > 6) MP.feed.shift(); mpRenderFeed(); }
function mpLocalDied() {
  const killer = (G.time - (G.lastHitT || -99) < 15) ? G.lastHitBy : null;
  const p = player;
  MP.respawnT = MP_RESPAWN;
  const m = { t: 'dead', v: MP.myId, k: killer == null ? null : killer, w: G.lastHitW || null, x: mpR(p.x), y: mpR(p.y), a: +p.ang.toFixed(2), L: p.L };
  mpSend(m);
  m.f = MP.myId; mpOnDead(m, MP.players.get(MP.myId));
  G.lastHitBy = null; G.lastHitT = -99;
}
function mpOnDead(m, vic) {
  if (!vic || m.v !== m.f) return;
  const killer = m.k != null ? MP.players.get(m.k | 0) : null;
  vic.deaths++;
  if (killer && killer !== vic && !(mpTdm() && killer.team === vic.team)) { killer.kills++; if (mpTdm()) MP.teamScore[killer.team & 1]++; if (killer.id === MP.myId) { G.kills++; sfx('kill'); banner('ABATEU ' + vic.name.toUpperCase()); } }
  else if (!killer || killer === vic) { vic.kills = Math.max(0, vic.kills - 1); if (mpTdm()) MP.teamScore[vic.team & 1] = Math.max(0, MP.teamScore[vic.team & 1] - 1); }
  const wn = m.w && WMAP[m.w] ? WMAP[m.w].name : (m.w === 'boom' ? 'explosão' : 'fogo/sangramento');
  const col = mpColor;
  mpFeed(killer && killer !== vic ? `<b style="color:${col(killer.id)}">${mpEsc(killer.name)}</b> <i>${mpEsc(wn)}</i> <b style="color:${col(vic.id)}">${mpEsc(vic.name)}</b>` : `<b style="color:${col(vic.id)}">${mpEsc(vic.name)}</b> <i>morreu</i>`);
  if (vic.id !== MP.myId) {
    const r = MP.remotes.get(vic.id);
    if (r) { r.dead = true; r.pr = false; }
    const x = mpNum(m.x), y = mpNum(m.y), L = clamp(mpNum(m.L, -1) | 0, -1, Math.max(-1, blds.length - 1));
    addDecal({ k: 'corpse', x, y, ang: mpNum(m.a), who: 'player', L });
    addDecal({ k: 'pool', x, y, r: 6, max: 20, a: .8, L });
    bloodBurst(x, y, mpNum(m.a), 14, L, true);
  }
  mpCheckWin();
}
function mpScore(p) { return p.kills; }
function mpCheckWin() {
  if (!MP.isHost || MP.ended) return;
  const kl = MP.cfg.kl;
  const hit = mpTdm() ? MP.teamScore.some(s => s >= kl) : [...MP.players.values()].some(p => p.kills >= kl);
  if (hit) { mpSend({ t: 'end', r: 'limit' }); mpFinish('limit'); }
}
function mpFinish(why) {
  if (MP.ended || !MP.on) return;
  MP.ended = true; MP.on = false;
  G.state = 'over'; document.body.classList.remove('playing');
  releaseSticks(); input.mouseDown = false; input.act = false;
  hideAllOverlays(); $('hud').classList.add('hidden');
  const list = [...MP.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const me = MP.players.get(MP.myId);
  let title, sub = '';
  if (why === 'host') { title = 'PARTIDA <span style="color:var(--bad)">ENCERRADA</span>'; sub = 'O anfitrião saiu da sala.'; }
  else if (mpTdm()) {
    const a = MP.teamScore[0], b = MP.teamScore[1], win = a === b ? -1 : (a > b ? 0 : 1);
    title = win < 0 ? 'EMPATE' : win === (me ? me.team : 0) ? '<span>VITÓRIA</span>' : 'DERROTA';
    sub = `AZUL ${a} × ${b} VERMELHO · ` + (why === 'time' ? 'tempo esgotado' : 'meta de abates');
  } else {
    const best = list[0];
    title = best && me && best.id === me.id ? '<span>VITÓRIA</span>' : 'FIM DA PARTIDA';
    sub = best ? `Vencedor: ${mpEsc(best.name)} (${best.kills} abates)` : '';
  }
  $('endTitle').innerHTML = title; $('endSub').innerHTML = sub;
  $('endStats').innerHTML = '<table class="sbtab"><tr><th>#</th><th>Jogador</th>' + (mpTdm() ? '<th>Equipe</th>' : '') + '<th>Abates</th><th>Mortes</th></tr>' +
    list.map((p, i) => `<tr class="${p.id === MP.myId ? 'me' : ''}"><td>${i + 1}</td><td style="color:${mpColor(p.id)}">${mpEsc(p.name)}</td>` + (mpTdm() ? `<td>${MP_TEAMS[p.team & 1].name}</td>` : '') + `<td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('') + '</table>';
  for (const id of ['btnNext', 'btnRetry', 'btnEndArsenal']) $(id).classList.add('hidden');
  $('btnMpLobby').classList.toggle('hidden', why === 'host');
  $('endScreen').classList.remove('hidden');
  if (why === 'host') { MP.state = 'home'; try { if (MP.peer) MP.peer.destroy(); } catch (_) { /* ignora */ } MP.peer = null; MP.hostConn = null; }
}

/* ---------- Início da partida ---------- */
function mpStartHost() {
  if (!MP.isHost || MP.state !== 'lobby' || MP.on) return;
  if (MP.players.size < 2 && !confirm('Você está sozinho na sala. Iniciar mesmo assim?')) return;
  const cfg = Object.assign({}, MP.cfg, { seed: Math.floor(Math.random() * 1e9) });
  const order = [...MP.players.keys()];
  mpSend({ t: 'start', cfg, order });
  mpBegin(cfg, order);
}
function mpBegin(cfg, order) {
  if (!cfg || !Array.isArray(order) || !order.includes(MP.myId)) return;
  MP.cfg = { gm: cfg.gm === 'tdm' ? 'tdm' : 'dm', kl: clamp(mpNum(cfg.kl, 15) | 0, 3, 100), tl: clamp(mpNum(cfg.tl, 8) | 0, 1, 60), night: !!cfg.night, seed: mpNum(cfg.seed) >>> 0 };
  MP.order = order.map(n => n | 0);
  for (const p of MP.players.values()) { p.kills = 0; p.deaths = 0; }
  MP.teamScore = [0, 0]; MP.feed = []; MP.remotes.clear(); MP.respawns = []; MP.ended = false; MP.respawnT = 0; MP.sendT = 0; MP.hudT = 0;
  G.lastHitBy = null; G.lastHitT = -99; G.lastHitW = null;
  MP.on = true;
  const o = SAVE.custom.opts;
  startMission('mp', 1, { mode: 'mp', mp: true, seed: MP.cfg.seed, time: MP.cfg.night ? 'night' : 'day', enemies: 0, level: 1, hpMul: 1, types: null, infAmmo: false, shadow: o.shadow, squad: [] });
  const me = MP.players.get(MP.myId); if (me) me.load = mpLoad();
  mpSend({ t: 'load', load: mpLoad() });
  const lay = mpSpawnLayout(MP.order.length), s = lay[Math.max(0, MP.order.indexOf(MP.myId))];
  mpPlace(s);
  G.protT = MP_PROT;
  mpBuildHud();
  mpRenderFeed();
  banner(mpTdm() ? 'EQUIPES — META ' + MP.cfg.kl + ' ABATES' : 'TODOS CONTRA TODOS — META ' + MP.cfg.kl + ' ABATES');
}
// pontos de nascimento espalhados (determinísticos: todos calculam igual)
function mpSpawnLayout(n) {
  const rng = mulberry32((MP.cfg.seed ^ 0x9e3779b1) >>> 0), out = [];
  for (let k = 0; k < n; k++) {
    let best = SPOTS[0], bd = -1;
    for (let i = 0; i < 40; i++) {
      const s = SPOTS[(rng() * SPOTS.length) | 0];
      const d = out.length ? Math.min(...out.map(o => Math.hypot(o.x - s.x, o.y - s.y))) : 99;
      if (d > bd) { bd = d; best = s; }
    }
    out.push(best);
  }
  return out;
}
function mpPlace(s) {
  player.x = s.x * T + T / 2; player.y = s.y * T + T / 2; player.L = -1; player.ang = rand(0, PI2);
  cam.x = player.x - vw / S / 2; cam.y = player.y - vh / S / 2; clampCam();
}
// renascimento: longe dos jogadores vivos
function mpRespawn() {
  newPlayer(); buildSlots();
  let best = SPOTS[0], bd = -1;
  for (let i = 0; i < 50; i++) {
    const s = SPOTS[(Math.random() * SPOTS.length) | 0], sx = s.x * T + T / 2, sy = s.y * T + T / 2;
    let d = 1e9; for (const r of MP.remotes.values()) if (!r.dead) d = Math.min(d, Math.hypot(r.x - sx, r.y - sy));
    if (d > bd) { bd = d; best = s; }
  }
  mpPlace(best);
  G.visOn = false; G.hurtFlash = 0; G.flashT = 0; G.protT = MP_PROT; G.endTimer = 0; G.reason = '';
  mpSendState();
}

/* ---------- Atualização por quadro ---------- */
function mpUpdate(dt) {
  G.protT = Math.max(0, (G.protT || 0) - dt);
  if (player.dead) { MP.respawnT -= dt; if (MP.respawnT <= 0) mpRespawn(); }
  MP.sendT -= dt;
  if (MP.sendT <= 0) { MP.sendT = MP_SEND; mpSendState(); }
  for (const r of MP.remotes.values()) {
    const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
    if (d > 260) { r.x = r.tx; r.y = r.ty; } else { const k = 1 - Math.exp(-dt * 16); r.x += dx * k; r.y += dy * k; r.walk += d * k * .12; }
    r.a += angDiff(r.ta, r.a) * (1 - Math.exp(-dt * 18));
    r.fl = Math.max(0, r.fl - dt); r.rec = Math.max(0, r.rec - dt * 10); r.hitT = Math.max(0, r.hitT - dt); r.showT = Math.max(0, r.showT - dt);
    if (!r.dead && !player.dead && r.L === player.L) {      // não atravessar o outro jogador
      const ox = player.x - r.x, oy = player.y - r.y, od = Math.hypot(ox, oy), md = player.r + r.r;
      if (od < md && od > .01) moveEntity(player, ox / od * (md - od) * .5, oy / od * (md - od) * .5);
    }
  }
  for (let i = MP.respawns.length - 1; i >= 0; i--) if (G.time >= MP.respawns[i].at) { pickups.push(MP.respawns[i].it); MP.respawns.splice(i, 1); }
  for (const f of MP.feed) f.t -= dt;
  if (MP.feed.length && MP.feed[0].t <= 0) { MP.feed.shift(); mpRenderFeed(); }
  if (MP.isHost && !MP.ended && G.time >= MP.cfg.tl * 60) { mpSend({ t: 'end', r: 'time' }); mpFinish('time'); return; }
  MP.hudT -= dt;
  if (MP.hudT <= 0) { MP.hudT = .25; mpUpdateHud(); }
}
const mpEnts = () => { const a = []; for (const r of MP.remotes.values()) if (!r.dead) a.push(r); return a; };

/* ---------- Desenho dos jogadores remotos ---------- */
function mpDraw(c, p, pts) {
  for (const r of MP.remotes.values()) {
    r.vis = false;
    if (r.dead || !r.init) continue;
    if (!layerShown(r.L, r.x, r.y)) continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    r.vis = canView(p.L, r.L, r.x, r.y) && seesEnemy(p, r, d, pts);
    if (!r.vis) { r.seenT = Math.max(0, (r.seenT || 0) - G.dt); if (r.seenT > 0 && canView(p.L, r.L, r.x, r.y) && d < VIS) r.vis = true; } else r.seenT = .22;
    if (!r.vis) continue;
    const pl = MP.players.get(r.id), ld = (pl && pl.load) || mpCleanLoad(null), look = mpLook(r.id), wd = r.w ? WMAP[r.w] : null;
    drawSoldier(c, r.x, r.y, r.a, { ...look, skin: true, vestId: ld.gear.body, helmId: ld.gear.head, backId: ld.gear.back, eyesId: ld.gear.eyes, legsId: ld.gear.legs, att: wd && !wd.melee ? ld.attach[wd.id] : null, weapon: r.w, flash: r.fl, recoil: r.rec, walk: r.walk, scale: 1, tint: r.hitT > 0, wound: woundLevel({ parts: r.parts }), crawl: r.cr });
    if (r.pr) { c.strokeStyle = 'rgba(143,220,255,.7)'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(r.x, r.y, 17, 0, PI2); c.stroke(); c.setLineDash([]); }
    const friend = mpFriend(r.id);
    if (friend || r.hp < 100) {
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(r.x - 13, r.y - 21, 26, 4);
      c.fillStyle = friend ? '#6fe07a' : '#e5533d'; c.fillRect(r.x - 13, r.y - 21, 26 * clamp(r.hp / 100, 0, 1), 4);
    }
    c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeStyle = '#000'; c.lineWidth = 3; c.fillStyle = mpColor(r.id);
    const nm = pl ? pl.name : '?';
    c.strokeText(nm, r.x, r.y - 28); c.fillText(nm, r.x, r.y - 28);
    if (r.showT > 0) {
      c.save(); c.globalAlpha = Math.min(1, r.showT);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(r.x + 18, r.y - 46, 30, 52);
      drawBodyDiagram(c, r.parts, r.x + 22, r.y - 43, 46, r.lastPart);
      c.restore();
    }
  }
}
function mpMinimap(m) {
  for (const r of MP.remotes.values()) {
    if (r.dead) continue;
    const friend = mpFriend(r.id);
    if (!friend && !r.vis) continue;
    m.fillStyle = friend ? '#6fe07a' : '#ff4a3a'; m.fillRect(r.x / T * MINI_S - 1.5, r.y / T * MINI_S - 1.5, 3.5, 3.5);
  }
}

/* ---------- HUD da partida ---------- */
function mpBuildHud() {
  $('mpBoard').classList.remove('hidden'); $('mpFeed').classList.remove('hidden');
}
function mpRenderFeed() { $('mpFeed').innerHTML = MP.feed.map(f => `<div>${f.html}</div>`).join(''); }
function mpTimeLeft() { return Math.max(0, MP.cfg.tl * 60 - G.time); }
function mpObjText() {
  const t = fmtTime(mpTimeLeft());
  if (mpTdm()) return `AZUL ${MP.teamScore[0]} × ${MP.teamScore[1]} VERMELHO · meta ${MP.cfg.kl} · ${t}`;
  return `Todos contra todos · meta ${MP.cfg.kl} abates · ${t}`;
}
function mpUpdateHud() {
  const list = [...MP.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const top = list.slice(0, 5);
  $('mpBoard').innerHTML = top.map(p => `<div class="${p.id === MP.myId ? 'me' : ''}"><i style="background:${mpColor(p.id)}"></i><span>${mpEsc(p.name)}</span><b>${p.kills}</b></div>`).join('');
  const rs = $('mpRespawn');
  if (player.dead) { rs.textContent = 'Você foi abatido — renascendo em ' + Math.max(1, Math.ceil(MP.respawnT)) + 's'; rs.classList.remove('hidden'); } else rs.classList.add('hidden');
}

/* ---------- Telas (lobby) ---------- */
function mpShowScreen() {
  G.state = 'menu'; LD = SAVE.custom; G.custom = null;
  hideAllOverlays(); $('hud').classList.add('hidden'); document.body.classList.remove('playing');
  $('mpScreen').classList.remove('hidden');
  if (!MP.name) MP.name = mpSanName((SAVE.settings && SAVE.settings.name) || 'Soldado' + (100 + ((Math.random() * 900) | 0)));
  renderMp();
}
function mpToMenu() { mpLeave(); MP.status = ''; showMenu(); }
function renderMp() {
  const root = $('mpBody'); if (!root) return;
  const keep = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
  let h = `<div class="ahead"><div class="atitle">🌐 MULTIPLAYER ONLINE</div><div class="credits sm">Tudo liberado · não afeta seus créditos</div></div>`;
  if (MP.state === 'lobby') {
    const url = location.origin && location.origin !== 'null' ? location.origin + location.pathname + '?sala=' + MP.code : '';
    h += `<div class="mpcode"><small>CÓDIGO DA SALA</small><b>${mpEsc(MP.code)}</b>${url ? `<button class="ghost sm" data-mp="copy" data-url="${mpEsc(url)}">copiar link</button>` : ''}</div>`;
    h += `<div class="mplist">` + [...MP.players.values()].map(p => `<div class="mprow"><i style="background:${mpTdm() ? MP_TEAMS[p.team & 1].color : '#8fdcff'}"></i><span>${mpEsc(p.name)}${p.id === 0 ? ' <em>anfitrião</em>' : ''}${p.id === MP.myId ? ' <em>você</em>' : ''}</span>${mpTdm() ? `<small>${MP_TEAMS[p.team & 1].name}</small>` : ''}${MP.isHost && mpTdm() ? `<button class="ghost sm" data-mp="team" data-id="${p.id}">trocar equipe</button>` : ''}</div>`).join('') + `</div>`;
    const dis = MP.isHost ? '' : ' disabled';
    h += `<div class="copts">
      <label>Modo<select id="mpGm"${dis}><option value="dm"${MP.cfg.gm === 'dm' ? ' selected' : ''}>☠ Todos contra todos</option><option value="tdm"${MP.cfg.gm === 'tdm' ? ' selected' : ''}>⚔ Equipes (Azul × Vermelho)</option></select></label>
      <label>Meta de abates<select id="mpKl"${dis}>${[5, 10, 15, 25, 40].map(v => `<option value="${v}"${MP.cfg.kl === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Duração<select id="mpTl"${dis}>${[3, 5, 8, 12, 20].map(v => `<option value="${v}"${MP.cfg.tl === v ? ' selected' : ''}>${v} min</option>`).join('')}</select></label>
      <label>Horário<select id="mpNight"${dis}><option value="0"${!MP.cfg.night ? ' selected' : ''}>☀ Dia</option><option value="1"${MP.cfg.night ? ' selected' : ''}>🌙 Noite</option></select></label>
    </div>`;
    h += `<div class="asum">Equipamento: <b>${SAVE.custom.weapons.filter(Boolean).map(id => WMAP[id].name).join(' · ')}</b>. Você nasce com proteção por ${MP_PROT}s e renasce ${MP_RESPAWN}s depois de cair. ${MP.isHost ? 'Quando todos entrarem, inicie a partida.' : 'Aguardando o anfitrião iniciar…'}</div>`;
    if (MP.status) h += `<div class="mpstatus">${mpEsc(MP.status)}</div>`;
    h += `<div class="row"><button class="ghost" data-mp="equip">⚙ EQUIPAMENTO</button>${MP.isHost ? `<button class="big" data-mp="start">INICIAR PARTIDA</button>` : ''}<button class="ghost" data-mp="leave">SAIR DA SALA</button></div>`;
  } else {
    const busy = MP.state === 'connecting' || MP.state === 'creating';
    h += `<div class="copts">
      <label>Seu nome<input id="mpName" maxlength="14" value="${mpEsc(MP.name)}"></label>
      <label>Código da sala<input id="mpCode" maxlength="8" placeholder="ex.: K7M2Q" value="${mpEsc(MP.joinCode)}" style="text-transform:uppercase"></label>
    </div>`;
    h += `<div class="row"><button class="big" data-mp="create"${busy ? ' disabled' : ''}>CRIAR SALA</button><button class="big" data-mp="join"${busy ? ' disabled' : ''}>ENTRAR NA SALA</button></div>`;
    if (MP.status) h += `<div class="mpstatus">${mpEsc(MP.status)}</div>`;
    h += `<div class="asum">Até ${MP_MAX} jogadores, direto entre navegadores (WebRTC). Quem cria a sala passa o <b>código</b> ou o link para os amigos. Cada um joga com o próprio equipamento, escolhido em “Equipamento”. Precisa de internet; em algumas redes corporativas a conexão pode ser bloqueada.</div>`;
    h += `<div class="row"><button class="ghost" data-mp="equip">⚙ EQUIPAMENTO</button><button class="ghost" data-mp="back">VOLTAR</button></div>`;
  }
  root.innerHTML = h;
  if (keep) { const el = $(keep); if (el && el.focus) { el.focus(); try { const v = el.value; el.value = ''; el.value = v; } catch (_) { /* ignora */ } } }
}
function mpCfgChanged() {
  MP.cfg.gm = $('mpGm').value === 'tdm' ? 'tdm' : 'dm'; MP.cfg.kl = +$('mpKl').value; MP.cfg.tl = +$('mpTl').value; MP.cfg.night = $('mpNight').value === '1';
  mpBroadcastLobby();
}
(function wireMp() {
  const root = $('mpBody');
  root.addEventListener('input', e => {
    if (e.target.id === 'mpName') { MP.name = mpSanName(e.target.value); try { SAVE.settings.name = MP.name; writeSave(); } catch (_) { /* ignora */ } }
    else if (e.target.id === 'mpCode') MP.joinCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  root.addEventListener('change', e => { if (MP.isHost && /^mp(Gm|Kl|Tl|Night)$/.test(e.target.id)) mpCfgChanged(); });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-mp]'); if (!b) return;
    initAudio();
    switch (b.dataset.mp) {
      case 'create': MP.name = mpSanName(($('mpName') || {}).value || MP.name); mpCreate(); break;
      case 'join': MP.name = mpSanName(($('mpName') || {}).value || MP.name); mpJoin(($('mpCode') || {}).value || MP.joinCode); break;
      case 'back': mpToMenu(); break;
      case 'leave': mpLeave(); renderMp(); break;
      case 'equip': $('mpScreen').classList.add('hidden'); openArsenal('mp'); break;
      case 'start': mpStartHost(); break;
      case 'team': { const p = MP.players.get(+b.dataset.id); if (p && MP.isHost) { p.team = p.team ? 0 : 1; mpBroadcastLobby(); } break; }
      case 'copy': try { navigator.clipboard.writeText(b.dataset.url); b.textContent = 'copiado!'; } catch (_) { b.textContent = b.dataset.url; } break;
    }
  });
  $('btnMulti').addEventListener('click', () => { initAudio(); if (MP.state === 'lobby') mpShowScreen(); else { MP.status = ''; mpShowScreen(); } });
  $('btnMpLobby').addEventListener('click', () => {
    $('endScreen').classList.add('hidden');
    if (MP.peer && MP.state === 'lobby') { mpShowScreen(); mpBroadcastLobby && MP.isHost && mpBroadcastLobby(); } else { showMenu(); }
  });
  window.addEventListener('load', () => { if (MP.joinCode) { try { mpShowScreen(); } catch (_) { /* ignora */ } } });
})();
