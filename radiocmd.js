'use strict';

/* =====================================================================
   COMANDOS DE RÁDIO PARA BOTS ALIADOS
   - parceiros da campanha / partida personalizada e bots do seu time no online
   - por voz: segure Y e fale (reconhecimento de voz do navegador) ou use o menu (tecla Z)
   - precisa de rádio equipado; só responde quem estiver dentro do alcance do rádio
   ===================================================================== */
const CMDS = [
  { k: 'follow', name: 'Seguir-me', icon: '👣', re: /\b(segu\w*|sig[ao]m?|vem|venha\w*|comigo|junto)\b/, say: ['Positivo, seguindo!', 'Na sua cola!', 'Copiado, te acompanho.'] },
  { k: 'hold', name: 'Ficar aqui', icon: '✋', re: /\b(fica\w*|parad\w*|parem|aguard\w*|espera\w*|segur\w+ (a )?posicao)\b/, say: ['Posição mantida.', 'Aguardando aqui.', 'Parado, câmbio.'] },
  { k: 'goto', name: 'Ir até lá', icon: '📍', pin: true, re: /\b(vai|vao|va|ir|mova\w*|move\w*|desloc\w*|posicion\w*)\b/, say: ['A caminho!', 'Indo pro ponto.', 'Me movendo, câmbio.'] },
  { k: 'defend', name: 'Defender lá', icon: '🛡️', pin: true, re: /\b(defend\w*|proteg\w*|guard\w*|cobr\w+ (aquel\w+|la))\b/, say: ['Defendendo o ponto!', 'Pode deixar, seguro a posição.', 'Ponto guardado.'] },
  { k: 'attack', name: 'Atacar', icon: '⚔️', re: /\b(ataca\w*|ataque\w*|avanc\w*|elimin\w*|fogo|pra cima)\b/, say: ['Atacando!', 'Avançando, fogo!', 'Vamos pra cima!'] },
  { k: 'retreat', name: 'Recuar', icon: '↩️', re: /\b(recu\w*|volt\w*|retir\w*|retraia\w*|abort\w*)\b/, say: ['Recuando!', 'Voltando pra você!', 'Retirada, câmbio.'] },
  { k: 'report', name: 'Reportar', icon: '📋', re: /\b(relat\w*|report\w*|status|situacao|como (esta|vai|estao)|informe\w*)\b/, say: [''] },
  { k: 'cover', name: 'Cobrir-me', icon: '🧍', re: /\b(cubr\w*|cobertura|reagrup\w*|(me|a mim) (prote\w*|cobr\w*)|(prote\w*|cobr\w*) (me|a mim))\b/, say: ['Cobrindo você!', 'Fico no seu pé.', 'Na sua cobertura.'] },
  { k: 'suppress', name: 'Fogo de supressão', icon: '💥', pin: true, re: /\b(supress\w*|suprim\w*|metralh\w*|fogo de cobertura|atir\w+ (la|ali|aquele)|dispar\w+ (la|ali))\b/, say: ['Fogo de supressão!', 'Metralhando o ponto!', 'Cobrindo com fogo!'] },
  { k: 'grenade', name: 'Granada lá', icon: '💣', pin: true, re: /\b(granada|frag|explosiv\w*|joga\w* (uma )?bomba)\b/, say: ['Granada saindo!', 'Fogo na toca!', 'Lançando!'] },
  { k: 'flank', name: 'Flanquear', icon: '↪️', pin: true, re: /\b(flanq\w*|contorn\w*|pelo (lado|flanco))\b/, say: ['Flanqueando!', 'Contornando pelo lado.', 'Pelo flanco, câmbio.'] },
  { k: 'smoke', name: 'Fumaça lá', icon: '☁️', pin: true, re: /\b(fumaca|cortina|fumegen\w*)\b/, say: ['Fumaça lançada!', 'Cortina de fumaça!', 'Fumaça no ponto!'] },
  { k: 'heal', name: 'Médico: curar', icon: '✚', re: /\b(cura\w*|curativo|medic\w*|primeiros socorros|trata\w*)\b/, say: ['Curando você!', 'Segura aí, vou tratar!', 'Médico a caminho!'] },
  { k: 'ceasefire', name: 'Cessar fogo', icon: '🤫', re: /\b(cessar\w*|cessem|segur\w+ o fogo|nao atir\w*|silencio|sem tiro\w*|discret\w*|furtiv\w*)\b/, say: ['Cessar fogo, só reajo se atacado.', 'Fogo contido.', 'Em silêncio, câmbio.'] },
  { k: 'free', name: 'Liberar fogo', icon: '🔓', re: /\b(liber\w+|atirar a vontade|fogo livre)\b/, say: ['Fogo liberado!', 'Liberado, câmbio.', 'Atirando à vontade!'] },
];
const CMAP = Object.fromEntries(CMDS.map(c => [c.k, c]));
// o que fazer primeiro quando a frase tem várias palavras (mais específico antes)
const CMD_ORDER = ['report', 'free', 'ceasefire', 'smoke', 'grenade', 'heal', 'flank', 'suppress', 'cover', 'retreat', 'defend', 'hold', 'follow', 'attack', 'goto'];
const CMD = { open: false, pin: null, noRec: false, rec: null, heard: '', lastCall: 0, voice: null };
const cmdRnd = a => a[(Math.random() * a.length) | 0];
const cmdNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
function cmdParse(text) {
  const t = cmdNorm(text);
  for (const k of CMD_ORDER) if (CMAP[k].re.test(t)) return k;
  return null;
}

/* ---------- Onde o jogador está apontando ---------- */
function cmdAimPoint() {
  const p = player;
  if (!touchMode) return { x: cam.x + input.mx / S, y: cam.y + input.my / S, L: p.L };
  return { x: p.x + Math.cos(p.ang) * 280, y: p.y + Math.sin(p.ang) * 280, L: p.L };
}
function cmdAddPing(k, pt) {
  G.pings = (G.pings || []).filter(q => q.k !== k);
  G.pings.push({ k, x: pt.x, y: pt.y, L: pt.L, t0: G.time });
}
function drawPings(c) {
  if (!G.pings || !G.pings.length) return;
  G.pings = G.pings.filter(q => G.time - q.t0 < 14);
  for (const q of G.pings) {
    if (q.L !== player.L) continue;
    const a = clamp(1 - (G.time - q.t0 - 10) / 4, 0, 1), pulse = (G.time * 1.6) % 1;
    c.save(); c.translate(q.x, q.y); c.globalAlpha = a;
    c.strokeStyle = q.k === 'defend' ? '#6fc3ff' : q.k === 'grenade' || q.k === 'suppress' ? '#ff7a5a' : q.k === 'smoke' ? '#cfd8dc' : '#ffd24a'; c.lineWidth = 2.4;
    c.beginPath(); c.arc(0, 0, 14 + pulse * 22, 0, PI2); c.stroke();
    c.beginPath(); c.arc(0, 0, 9, 0, PI2); c.stroke();
    c.font = '15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(CMAP[q.k].icon, 0, -26);
    c.restore();
  }
}

/* ---------- Falas pelo rádio (texto + voz sintetizada) ---------- */
function radioFeedLine(who, text, mine) {
  const box = document.getElementById('radioFeed'); if (!box) return;
  const d = document.createElement('div');
  d.className = mine ? 'me' : '';
  d.innerHTML = '<b></b><span></span>'; d.firstChild.textContent = '📻 ' + who + ': '; d.lastChild.textContent = text;
  box.appendChild(d);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 7000);
}
function radioSpeak(who, text) {
  if (!window.speechSynthesis || SAVE.settings.botVoice === false) return;
  try {
    if (!CMD.voice) { const vs = speechSynthesis.getVoices(); CMD.voice = vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang)) || null; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; if (CMD.voice) u.voice = CMD.voice;
    let h = 0; for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) % 997;
    u.rate = 1.12; u.pitch = .7 + (h % 9) * .1; u.volume = clamp(.9 * radioVol(), 0, 1);
    speechSynthesis.speak(u);
  } catch (_) { /* sem voz */ }
}
function radioSay(who, text) {
  radioFeedLine(who, text, false);
  if (typeof radioClick === 'function') radioClick(true);
  radioSpeak(who, text);
}

/* ---------- Emitir um comando ---------- */
function cmdIssue(k, heard) {
  const c = CMAP[k]; if (!c || !player || player.dead || G.state !== 'play') return;
  if (!radioGear()) { banner('SEM RÁDIO — EQUIPE UM NO ARSENAL'); return; }
  const pt = c.pin ? (CMD.pin || cmdAimPoint()) : null;
  radioFeedLine('Você', (heard ? '"' + heard + '"' : c.name) + (c.pin ? ' (ponto marcado)' : ''), true);
  if (c.pin) cmdAddPing(k, pt);
  if (MP.on) {
    if (MP.isHost) cmdApplyMp(k, pt, MP.myId); else mpSendTo(0, { t: 'cmd', k, x: pt ? mpR(pt.x) : 0, y: pt ? mpR(pt.y) : 0, L: pt ? pt.L : -1 });
  } else cmdApplySp(k, pt);
}
function cmdListening() { return MP.on ? 'aliados' : 'parceiros'; }

// campanha / partida personalizada: parceiros com ordens individuais
function cmdApplySp(k, pt) {
  const ps = allies.filter(a => a.kind === 'partner' && !a.dead), range = radioRange();
  if (!ps.length) { radioFeedLine('Rádio', 'Você não tem parceiros vivos.', false); return; }
  const near = ps.filter(a => range >= 90000 || (a.L === player.L ? Math.hypot(a.x - player.x, a.y - player.y) : 1e9) <= range || Math.hypot(a.x - player.x, a.y - player.y) <= range * .6);
  if (!near.length) { radioFeedLine('Rádio', 'Sem sinal: os parceiros estão fora do alcance.', false); return; }
  if (k === 'grenade' || k === 'smoke') { cmdThrowSp(near, k, pt); return; }
  near.forEach((a, i) => {
    const over = cmdSetPartner(a, k, pt, i);
    const line = over || (k === 'report' ? cmdReport(a) : cmdRnd(CMAP[k].say));
    setTimeout(() => { if (!a.dead) radioSay(a.name, line); }, 450 + i * 1100);
  });
}
// devolve uma fala própria quando o parceiro não pode cumprir a ordem
function cmdSetPartner(a, k, pt, i) {
  if (k === 'follow') { a.order = null; G.hold = false; }
  else if (k === 'hold') a.order = { k, x: a.x, y: a.y, L: a.L };
  else if (k === 'goto' || k === 'defend') a.order = { k, x: pt.x, y: pt.y, L: pt.L };
  else if (k === 'attack') a.order = { k };
  else if (k === 'retreat') a.order = { k, until: G.time + 7 };
  else if (k === 'cover') a.order = { k };
  else if (k === 'suppress') a.order = { k, x: a.x, y: a.y, L: a.L, px: pt.x, py: pt.y, until: G.time + 8 };
  else if (k === 'flank') { const q = cmdFlankPoint(player, pt, i || 0); a.order = { k: 'goto', x: q.x, y: q.y, L: pt.L }; }
  else if (k === 'heal') { if (!a.def.heal) return 'Não sou o médico!'; a.order = { k, until: G.time + 10 }; }
  else if (k === 'ceasefire') a.order = { k };
  else if (k === 'free') { if (a.order && a.order.k === 'ceasefire') a.order = null; }
  if (k !== 'report') { a.path = null; a.repathT = 0; }
  return null;
}
// ponto de flanco: ao lado do alvo, alternando esquerda/direita
function cmdFlankPoint(from, pt, i) {
  const a0 = Math.atan2(pt.y - from.y, pt.x - from.x), side = i % 2 ? 1 : -1, off = 190 + 60 * ((i / 2) | 0);
  const q = { x: pt.x + Math.cos(a0 + Math.PI / 2 * side) * off, y: pt.y + Math.sin(a0 + Math.PI / 2 * side) * off };
  return solidF(Math.floor(q.x / T), Math.floor(q.y / T), pt.L) ? { x: pt.x, y: pt.y } : q;
}
// o parceiro mais perto do ponto lança a granada
function cmdThrowSp(near, k, pt) {
  const kind = k === 'smoke' ? 'smoke' : 'frag';
  const all = near.map(a => ({ a, d: a.L === pt.L ? Math.hypot(pt.x - a.x, pt.y - a.y) : 1e9 })).sort((x, y) => x.d - y.d);
  const c = all.find(q => (q.a.gUntil || 0) <= G.time) || all[0], a = c.a;
  const say = t => setTimeout(() => { if (!a.dead) radioSay(a.name, t); }, 450);
  if (c.d > 470) { say('Longe demais para lançar!'); return; }
  if ((a.gUntil || 0) > G.time) { say('Ainda estou pegando outra granada!'); return; }
  a.gUntil = G.time + 9;
  const d = clamp(c.d, 90, 440), ang = Math.atan2(pt.y - a.y, pt.x - a.x), v = d * 2.2;
  grenades.push({ x: a.x + Math.cos(ang) * 14, y: a.y + Math.sin(ang) * 14, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, t: TMAP[kind].fuse, kind, L: a.L, by: 'a' });
  sfx('throw'); say(cmdRnd(CMAP[k].say));
}
function cmdReport(a) {
  let n = 0;
  for (const e of enemies) if (!e.dead && canView(a.L, e.L, e.x, e.y) && Math.hypot(e.x - a.x, e.y - a.y) < 650 && hasLOS(a.x, a.y, e.x, e.y, a.L)) n++;
  const hp = Math.round(a.hp / a.maxHp * 100), st = a.order ? ({ hold: 'segurando posição', goto: 'a caminho', defend: 'defendendo o ponto', attack: 'em ataque', retreat: 'recuando' })[a.order.k] : 'te acompanhando';
  return `${hp}% de vida, ${st}. ${n ? n + (n > 1 ? ' hostis à vista!' : ' hostil à vista!') : 'Área limpa.'}`;
}
// o parceiro mais próximo do inimigo vivo (usado pela ordem de ataque)
function cmdNearestFoe(a) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - a.x, e.y - a.y) + (e.L === a.L ? 0 : 260);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// multiplayer: o anfitrião aplica as ordens aos bots do mesmo time do comandante
const MP_BOT_RADIO = 2400;
function cmdApplyMp(k, pt, fromId) {
  if (!MP.isHost || !mpTdm()) { if (fromId === MP.myId) radioFeedLine('Rádio', 'Neste modo não há bots aliados.', false); return; }
  const who = fromId === MP.myId ? player : MP.remotes.get(fromId);
  if (!who) return;
  const myRange = fromId === MP.myId ? radioRange() : Math.min(99999, (who.rr | 0) || 0);
  const range = Math.min(myRange >= 90000 ? 1e9 : myRange, MP_BOT_RADIO);
  const bots = enemies.filter(e => e.mpId != null && !e.dead && !mpHostile(fromId, e.mpId) && (e.L === who.L ? Math.hypot(e.x - who.x, e.y - who.y) : Math.hypot(e.x - who.x, e.y - who.y) * 1.4) <= range);
  const nm = e => (MP.players.get(e.mpId) || {}).name || 'Bot';
  let lines = [];
  if (k === 'grenade' || k === 'smoke') {
    const kind = k === 'smoke' ? 'smoke' : 'frag';
    const cand = bots.filter(e => e.ty.nades && e.nadeN > 0 && e.ty.nades.includes(kind) && e.L === pt.L).sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y))[0];
    if (cand && Math.hypot(cand.x - pt.x, cand.y - pt.y) <= 470) { cmdBotThrow(cand, kind, pt); lines.push([nm(cand), cmdRnd(CMAP[k].say)]); }
    else if (cand) lines.push([nm(cand), 'Longe demais para lançar!']);
    else if (bots.length) lines.push([nm(bots[0]), kind === 'smoke' ? 'Estou sem fumaça!' : 'Estou sem granadas!']);
  } else if (k === 'heal') {
    if (bots.length) lines.push([nm(bots[0]), 'Não tenho kit médico, câmbio.']);
  } else {
    bots.forEach((e, i) => {
      cmdSetBot(e, k, pt, fromId, i);
      if (lines.length < 2) lines.push([nm(e), k === 'report' ? cmdBotReport(e) : cmdRnd(CMAP[k].say)]);
    });
  }
  if (!lines.length) lines.push(['Rádio', 'Sem sinal: nenhum bot aliado ao alcance.']);
  if (fromId === MP.myId) lines.forEach((l, i) => setTimeout(() => radioSay(l[0], l[1]), 450 + i * 1000));
  else mpSendTo(fromId, { t: 'cr', l: lines });
}
function cmdSetBot(e, k, pt, by, i) {
  if (k === 'report') return;
  const o = k === 'follow' || k === 'cover' || k === 'ceasefire' ? { k, by } : k === 'hold' ? { k, x: e.x, y: e.y, L: e.L } : (k === 'goto' || k === 'defend') ? { k, x: pt.x, y: pt.y, L: pt.L } : k === 'attack' ? { k } : k === 'retreat' ? { k, by, until: G.time + 7 } : null;
  if (k === 'flank') { const who = by === MP.myId ? player : MP.remotes.get(by), q = cmdFlankPoint(who || e, pt, i || 0); e.order = { k: 'goto', x: q.x, y: q.y, L: pt.L }; }
  else if (k === 'suppress') { e.order = null; e.path = null; goSearch(e, pt, pt.L); return; }
  else if (k === 'free') { if (e.order && e.order.k === 'ceasefire') e.order = null; return; }
  else e.order = o;
  e.path = null; e.idle = 0; if (e.state !== 'attack') e.state = 'patrol';
}
function cmdBotThrow(e, kind, pt) {
  const i = e.ty.nades.indexOf(kind); e.ty.nades.splice(i, 1); e.nadeN--;
  const dist = clamp(Math.hypot(pt.x - e.x, pt.y - e.y), 90, 440), a = Math.atan2(pt.y - e.y, pt.x - e.x), v = dist * 2.2;
  const gr = { x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: TMAP[kind].fuse, kind, L: e.L, by: 'e', owner: e.mpId };
  grenades.push(gr); sfx('throw');
  if (MP.on && MP.isHost) mpSendThrow(gr, false, e.mpId);
}
function cmdBotReport(e) {
  const hp = Math.round(e.hp / e.maxHp * 100);
  return `${hp}% de vida. ${e.state === 'attack' ? 'Em combate!' : 'Sem contato.'}`;
}
function cmdOnReply(m) {
  if (!Array.isArray(m.l)) return;
  m.l.slice(0, 3).forEach((l, i) => { if (Array.isArray(l)) setTimeout(() => radioSay(mpSanName(l[0], 24), String(l[1] || '').slice(0, 90)), 450 + i * 1000); });
}
function mpOnCmd(m, pl) {
  if (!MP.isHost || !pl || !CMAP[m.k]) return;
  cmdApplyMp(m.k, CMAP[m.k].pin ? { x: clamp(mpNum(m.x), 0, WORLD_W), y: clamp(mpNum(m.y), 0, WORLD_H), L: clamp(mpNum(m.L, -1) | 0, -1, mpLmax()) } : null, m.f);
}

// movimento de um bot do multiplayer que recebeu ordem (chamado em patrolTo); true = já decidiu
function botOrderMove(e) {
  const od = e.order; if (!od) return false;
  if (od.until && G.time > od.until) { e.order = null; return false; }
  const who = od.by != null ? (od.by === MP.myId ? player : MP.remotes.get(od.by)) : null;
  e.idle = rand(.5, 1.1);
  if (od.k === 'attack') return false;
  if (od.k === 'hold') { e.path = null; return true; }
  let x = od.x, y = od.y, L = od.L;
  if (od.k === 'follow' || od.k === 'retreat' || od.k === 'cover' || od.k === 'ceasefire') {
    if (!who || who.dead) { e.order = null; return false; }
    const sp = od.k === 'cover' ? 40 : 70;
    x = who.x + rand(-sp, sp); y = who.y + rand(-sp, sp); L = who.L;
    if (e.L === L && Math.hypot(e.x - who.x, e.y - who.y) < sp + 25) { e.path = null; return true; }
  } else if (e.L === L && Math.hypot(e.x - x, e.y - y) < 40) { e.path = null; return true; }
  pathTo(e, x, y, L);
  return !!e.path;
}

/* ---------- Voz: reconhecimento de fala (Chrome/Edge) ---------- */
const CMD_SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function cmdAlliesExist() {
  if (MP.on) return mpTdm() && enemies.some(e => e.mpId != null && !e.dead && !mpHostile(MP.myId, e.mpId)) || (!MP.isHost && mpTdm());
  return allies.some(a => a.kind === 'partner' && !a.dead);
}
// o reconhecedor fica aberto entre um aperto e outro (o navegador só pergunta o microfone ao abrir) e só vale enquanto segura Y
function cmdStopListen() {
  clearTimeout(CMD.idleT); CMD.idleT = 0;
  if (CMD.rec) { const r = CMD.rec; CMD.rec = null; try { r.stop(); } catch (_) { /* ignora */ } }
}
function cmdListen(on) {
  CMD.holding = !!on;
  if (!on) { CMD.releaseT = performance.now(); return; }
  if (!cmdAlliesExist()) return;
  if (!CMD_SR) { if (!CMD.noRec) { CMD.noRec = true; banner('SEM RECONHECIMENTO DE VOZ NESTE NAVEGADOR — USE O MENU (Z)'); } return; }
  clearTimeout(CMD.idleT); CMD.idleT = setTimeout(cmdStopListen, 150000);   // fecha após 2,5 min sem uso (apaga o ícone de microfone)
  if (location.protocol === 'file:' && !CMD.fileWarn) {
    CMD.fileWarn = true;
    radioFeedLine('Rádio', 'O jogo está aberto como arquivo local: o navegador pergunta o microfone a cada abertura e não lembra a resposta. Abra pelo link do GitHub Pages (ou localhost) e marque "Sempre permitir".', false);
  }
  if (CMD.rec) return;
  try {
    const r = new CMD_SR(); CMD.rec = r;
    r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 4; r.continuous = true;
    r.onresult = e => {
      for (let n = e.resultIndex; n < e.results.length; n++) {
        if (!e.results[n].isFinal) continue;
        if (!(CMD.holding || performance.now() - (CMD.releaseT || 0) < 3500)) continue;   // fala fora do botão é ignorada
        const alts = e.results[n];
        let done = false;
        for (let i = 0; i < alts.length && !done; i++) { const k = cmdParse(alts[i].transcript); if (k) { cmdIssue(k, alts[i].transcript); done = true; } }
        if (!done) { radioFeedLine('Você', '"' + alts[0].transcript + '"', true); radioFeedLine('Rádio', 'Não entendi a ordem. Tente: seguir, ficar, atacar, ir até lá, defender, recuar, reportar, cobre-me, supressão, granada, fumaça, flanquear, cura, cessar fogo.', false); }
      }
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { banner('LIBERE O MICROFONE PARA DAR ORDENS POR VOZ'); if (CMD.rec === r) CMD.rec = null; } };
    r.onend = () => { if (CMD.rec === r) CMD.rec = null; };   // volta a abrir no próximo aperto de Y
    r.start();
  } catch (_) { CMD.rec = null; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) cmdStopListen(); });

/* ---------- Menu de ordens (tecla Z) ---------- */
function toggleCmd(v) {
  if (v == null && !CMD.open) { if (!player || player.dead || G.state !== 'play') return; if (!radioGear()) { banner('SEM RÁDIO — EQUIPE UM NO ARSENAL'); return; } CMD.pin = cmdAimPoint(); }
  CMD.open = v != null ? v : !CMD.open;
  const el = document.getElementById('cmdPanel'); if (!el) return;
  el.classList.toggle('hidden', !CMD.open);
  if (CMD.open) el.innerHTML = '<div class="medHead"><b>📻 ORDENS POR RÁDIO</b><button id="cmdClose">✕</button></div>' + '<div class="cmdGrid">' + CMDS.map((c, i) => `<button class="cmd" data-cmd="${c.k}"><span>${c.icon}</span><b>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</b> ${c.name}${c.pin ? ' <small>(ponto)</small>' : ''}</button>`).join('') + '</div>' + `<div class="cmdHint">Teclas 1 a 9 e 0, clique, ou segure <b>Y</b> e diga: "seguir", "ficar", "atacar", "ir até lá", "defender", "recuar", "reportar", "cobre-me", "supressão", "granada", "fumaça", "flanquear", "cura", "cessar fogo", "liberar fogo". Falando para os ${cmdListening()}. <small>O reconhecimento de voz do navegador pode enviar o áudio ao serviço dele.</small></div>`;
}
function cmdPick(i) {
  if (i < 0) i = 9;
  const c = CMDS[i]; if (!c) return;
  toggleCmd(false); cmdIssue(c.k, null);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-cmd]');
  if (b) { toggleCmd(false); cmdIssue(b.dataset.cmd, null); return; }
  if (e.target.id === 'cmdClose') toggleCmd(false);
});
