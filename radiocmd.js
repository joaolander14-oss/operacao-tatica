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
];
const CMAP = Object.fromEntries(CMDS.map(c => [c.k, c]));
// o que fazer primeiro quando a frase tem várias palavras (mais específico antes)
const CMD_ORDER = ['report', 'retreat', 'defend', 'hold', 'follow', 'attack', 'goto'];
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
    c.strokeStyle = q.k === 'defend' ? '#6fc3ff' : '#ffd24a'; c.lineWidth = 2.4;
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
  near.forEach((a, i) => {
    cmdSetPartner(a, k, pt);
    const line = k === 'report' ? cmdReport(a) : cmdRnd(CMAP[k].say);
    setTimeout(() => { if (!a.dead) radioSay(a.name, line); }, 450 + i * 1100);
  });
}
function cmdSetPartner(a, k, pt) {
  if (k === 'follow') { a.order = null; G.hold = false; }
  else if (k === 'hold') a.order = { k, x: a.x, y: a.y, L: a.L };
  else if (k === 'goto' || k === 'defend') a.order = { k, x: pt.x, y: pt.y, L: pt.L };
  else if (k === 'attack') a.order = { k };
  else if (k === 'retreat') a.order = { k, until: G.time + 7 };
  if (k !== 'report') { a.path = null; a.repathT = 0; }
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
  const names = [];
  bots.forEach(e => {
    cmdSetBot(e, k, pt, fromId);
    if (names.length < 2) names.push((MP.players.get(e.mpId) || {}).name || 'Bot');
  });
  const lines = names.map((n, i) => k === 'report' ? [n, cmdBotReport(bots[i])] : [n, cmdRnd(CMAP[k].say)]);
  if (!lines.length) lines.push(['Rádio', 'Sem sinal: nenhum bot aliado ao alcance.']);
  if (fromId === MP.myId) lines.forEach((l, i) => setTimeout(() => radioSay(l[0], l[1]), 450 + i * 1000));
  else mpSendTo(fromId, { t: 'cr', l: lines });
}
function cmdSetBot(e, k, pt, by) {
  if (k === 'report') return;
  e.order = k === 'follow' ? { k, by } : k === 'hold' ? { k, x: e.x, y: e.y, L: e.L } : (k === 'goto' || k === 'defend') ? { k, x: pt.x, y: pt.y, L: pt.L } : k === 'attack' ? { k } : { k, by, until: G.time + 7 };
  e.path = null; e.idle = 0; if (e.state !== 'attack') e.state = 'patrol';
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
  if (od.k === 'follow' || od.k === 'retreat') {
    if (!who || who.dead) { e.order = null; return false; }
    x = who.x + rand(-70, 70); y = who.y + rand(-70, 70); L = who.L;
    if (e.L === L && Math.hypot(e.x - who.x, e.y - who.y) < 90) { e.path = null; return true; }
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
        if (!done) { radioFeedLine('Você', '"' + alts[0].transcript + '"', true); radioFeedLine('Rádio', 'Não entendi a ordem. Tente: seguir, ficar, atacar, ir até lá, defender, recuar, reportar.', false); }
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
  if (CMD.open) el.innerHTML = '<div class="medHead"><b>📻 ORDENS POR RÁDIO</b><button id="cmdClose">✕</button></div>' + CMDS.map((c, i) => `<button class="cmd" data-cmd="${c.k}"><span>${c.icon}</span><b>${i + 1}</b> ${c.name}${c.pin ? ' <small>(no ponto marcado)</small>' : ''}</button>`).join('') + `<div class="cmdHint">Ou segure <b>Y</b> e diga: "seguir", "ficar", "atacar", "ir até lá", "defender", "recuar", "reportar". Falando para os ${cmdListening()}. <small>O reconhecimento de voz do navegador pode enviar o áudio ao serviço dele.</small></div>`;
}
function cmdPick(i) {
  const c = CMDS[i]; if (!c) return;
  toggleCmd(false); cmdIssue(c.k, null);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-cmd]');
  if (b) { toggleCmd(false); cmdIssue(b.dataset.cmd, null); return; }
  if (e.target.id === 'cmdClose') toggleCmd(false);
});
