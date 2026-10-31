'use strict';

/* =====================================================================
   RÁDIO: voz por microfone entre jogadores da mesma frequência
   - segure Y para falar (o microfone só é pedido na 1ª vez e fica mudo fora do botão)
   - [ e ] mudam a frequência; U abre o painel do rádio
   - quem está na mesma frequência e dentro do alcance (o menor entre os dois rádios) escuta
   - a voz viaja direto entre os navegadores (PeerJS/WebRTC), o anfitrião só informa os endereços
   ===================================================================== */
const RADIO = { ctx: null, dst: null, silent: null, mic: null, track: null, ptt: false, asking: false, lastTx: false, calls: new Map(), rx: new Map(), err: '', hear: [], open: false, noiseBuf: null, panelT: 0 };
const radioGear = () => { const g = typeof gearOf === 'function' && LD && LD.gear ? gearOf('radio') : null; return g && g.radioCh ? g : null; };
const radioMaxCh = () => { const g = radioGear(); return g ? g.radioCh : 0; };
const radioRange = () => { const g = radioGear(); return g ? g.radioRange : 0; };
const radioCh = () => { const m = radioMaxCh(); return m ? clamp(Math.round(SAVE.settings.radioCh || 1), 1, m) : 0; };
const radioFreq = ch => (144 + ch * .025).toFixed(3) + ' MHz';
const radioVol = () => (SAVE.settings.radioVol == null ? 100 : SAVE.settings.radioVol) / 100;
const radioRangeText = r => r >= 90000 ? 'mapa inteiro' : r + ' px';

function radioAC() {
  if (!RADIO.ctx) {
    try {
      RADIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
      RADIO.dst = RADIO.ctx.createMediaStreamDestination(); RADIO.silent = RADIO.dst.stream;
      const n = RADIO.ctx.sampleRate * 2, b = RADIO.ctx.createBuffer(1, n, RADIO.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      RADIO.noiseBuf = b;
    } catch (e) { RADIO.err = 'Áudio indisponível'; RADIO.ctx = null; }
  }
  if (RADIO.ctx && RADIO.ctx.state === 'suspended') RADIO.ctx.resume();
  return RADIO.ctx;
}
// estalo do botão do rádio
function radioClick(up = true) {
  const c = radioAC(); if (!c) return;
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = up ? 1700 : 1100;
  g.gain.setValueAtTime(.05 * radioVol(), t); g.gain.exponentialRampToValueAtTime(.0001, t + .08);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + .09);
}

/* ---------- Microfone ---------- */
async function radioMic() {
  if (RADIO.track) return true;
  if (RADIO.asking) return false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { RADIO.err = 'Microfone indisponível (precisa de HTTPS).'; return false; }
  RADIO.asking = true;
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    RADIO.mic = st; RADIO.track = st.getAudioTracks()[0]; RADIO.track.enabled = false;
    for (const c of RADIO.calls.values()) radioSwap(c);
    RADIO.err = ''; return true;
  } catch (e) { RADIO.err = 'Microfone bloqueado: libere nas permissões do navegador.'; return false; }
  finally { RADIO.asking = false; }
}
function radioSwap(call) {
  try { const s = call.peerConnection.getSenders().find(x => x.track && x.track.kind === 'audio'); if (s) s.replaceTrack(RADIO.track); } catch (_) { /* ignora */ }
}
function radioTxOn() { return !!(RADIO.ptt && RADIO.track && radioGear() && player && !player.dead && MP.on); }
function radioPtt(on) {
  if (!MP.on) { if (on && G.state === 'play') banner('O RÁDIO FUNCIONA NO MULTIPLAYER ONLINE'); return; }
  if (on) {
    if (!radioGear()) { banner('SEM RÁDIO — EQUIPE UM NO ARSENAL'); return; }
    if (player.dead) return;
    radioAC();
    if (!RADIO.track) {
      RADIO.ptt = true;
      radioMic().then(ok => { if (!ok) { RADIO.ptt = false; if (RADIO.err) banner(RADIO.err); } else radioApply(); });
      return;
    }
  }
  RADIO.ptt = on; radioApply();
}
function radioApply() {
  const on = radioTxOn();
  if (RADIO.track) RADIO.track.enabled = on;
  if (on !== RADIO.lastTx) { RADIO.lastTx = on; radioClick(on); if (MP.on && player) mpSendState(); }
}

/* ---------- Ligações de voz ---------- */
function radioStart() {
  if (!MP.on || !MP.peer || typeof Peer === 'undefined') return;
  radioAC();
  for (const p of MP.players.values()) if (!p.bot && p.id !== MP.myId && p.pid && MP.myId < p.id && !RADIO.calls.has(p.id)) radioCall(p);
}
function radioCall(p) {
  try { radioWire(MP.peer.call(p.pid, RADIO.mic || RADIO.silent, { metadata: { id: MP.myId } }), p.id); } catch (_) { /* ignora */ }
}
function radioOnCall(call) {
  const p = [...MP.players.values()].find(q => !q.bot && q.pid && q.pid === call.peer);
  if (!p) { try { call.close(); } catch (_) { /* ignora */ } return; }
  radioAC();
  try { call.answer(RADIO.mic || RADIO.silent); radioWire(call, p.id); } catch (_) { /* ignora */ }
}
function radioWire(call, id) {
  RADIO.calls.set(id, call);
  call.on('stream', st => radioAttach(id, st));
  call.on('close', () => radioDrop(id));
  call.on('error', () => radioDrop(id));
  if (RADIO.track) radioSwap(call);
}
function radioAttach(id, st) {
  radioDrop(id, true);
  const c = radioAC(); if (!c) return;
  const a = new Audio(); a.srcObject = st; a.muted = true; if (a.play) a.play().catch(() => { /* ignora */ });   // mantém o fluxo ativo
  const src = c.createMediaStreamSource(st), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), sh = c.createWaveShaper(), g = c.createGain(), ng = c.createGain(), nz = c.createBufferSource();
  hp.type = 'highpass'; hp.frequency.value = 420; lp.type = 'lowpass'; lp.frequency.value = 3100;
  const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 2.2); }
  sh.curve = k;
  g.gain.value = 0; ng.gain.value = 0;
  src.connect(hp); hp.connect(lp); lp.connect(sh); sh.connect(g); g.connect(c.destination);
  nz.buffer = RADIO.noiseBuf; nz.loop = true; nz.connect(ng); ng.connect(c.destination); nz.start();
  RADIO.rx.set(id, { a, src, g, ng, nz, on: false });
}
function radioDrop(id, keepCall) {
  const x = RADIO.rx.get(id);
  if (x) { try { x.nz.stop(); x.src.disconnect(); x.g.disconnect(); x.ng.disconnect(); x.a.pause(); x.a.srcObject = null; } catch (_) { /* ignora */ } RADIO.rx.delete(id); }
  if (!keepCall) { const c = RADIO.calls.get(id); RADIO.calls.delete(id); if (c) { try { c.close(); } catch (_) { /* ignora */ } } }
}
function radioStop() {
  for (const id of [...RADIO.calls.keys(), ...RADIO.rx.keys()]) radioDrop(id);
  RADIO.ptt = false; RADIO.lastTx = false; RADIO.hear = [];
  if (RADIO.mic) { for (const t of RADIO.mic.getTracks()) { try { t.stop(); } catch (_) { /* ignora */ } } }
  RADIO.mic = null; RADIO.track = null;
  toggleRadioPanel(false);
}

/* ---------- Recepção: quem eu escuto agora ---------- */
function radioTick() {
  if (!MP.on || !RADIO.ctx) return;
  if (RADIO.track && RADIO.track.enabled !== radioTxOn()) radioApply();
  const my = radioCh(), myR = radioRange(), now = RADIO.ctx.currentTime, vol = radioVol(), hear = [];
  for (const [id, x] of RADIO.rx) {
    const r = MP.remotes.get(id); let q = 0;
    if (r && my && r.rtx && !r.dead && r.rc === my) {
      const range = Math.min(r.rr || 0, myR);
      if (range > 0) { const d = Math.hypot(r.x - player.x, r.y - player.y); if (range >= 90000 || d <= range) q = range >= 90000 ? 1 : 1 - clamp((d / range - .55) / .45, 0, 1) * .8; }
    }
    x.g.gain.setTargetAtTime(q > 0 ? (.35 + .55 * q) * vol : 0, now, .04);
    x.ng.gain.setTargetAtTime(q > 0 ? ((1 - q) * .12 + .012) * vol : 0, now, .04);
    if (q > 0) hear.push(id);
    if ((q > 0) !== x.on) { x.on = q > 0; if (x.on) radioClick(true); }
  }
  RADIO.hear = hear;
}

/* ---------- Canal e painel ---------- */
function radioSetCh(n) {
  const m = radioMaxCh(); if (!m) { if (G.state === 'play') banner('SEM RÁDIO — EQUIPE UM NO ARSENAL'); return; }
  SAVE.settings.radioCh = clamp(Math.round(n), 1, m); writeSave(); radioClick(true);
  if (G.state === 'play') banner('📻 CANAL ' + radioCh() + ' · ' + radioFreq(radioCh()));
  if (MP.on) mpSendState();
  RADIO.panelT = 0;
}
const radioStep = d => radioSetCh(radioCh() + d);
function toggleRadioPanel(v) {
  RADIO.open = v != null ? v : !RADIO.open;
  const el = document.getElementById('radioPanel'); if (el) el.classList.toggle('hidden', !RADIO.open);
  if (RADIO.open) { RADIO.panelT = 0; radioPanel(); }
}
function radioPanel() {
  if (!RADIO.open) return;
  const now = performance.now(); if (now - RADIO.panelT < 250) return; RADIO.panelT = now;
  const g = radioGear(), el = document.getElementById('radioBody'); if (!el) return;
  if (!g) { el.innerHTML = '<div>Você não tem rádio equipado. Escolha um na aba <b>Proteção → Rádio</b> do Arsenal.</div>'; return; }
  const ch = radioCh(), peers = [];
  if (MP.on) {
    for (const r of MP.remotes.values()) { const pl = MP.players.get(r.id); if (pl && !pl.bot && r.rc === ch) peers.push(pl.name + (r.rtx ? ' 🎙' : '')); }
  }
  const mic = RADIO.track ? '<span class="ok">microfone pronto</span>' : RADIO.err ? '<span class="bad">' + RADIO.err + '</span>' : 'o microfone será pedido ao falar pela primeira vez';
  el.innerHTML = `<div class="rname">${g.name}</div>
    <div class="rfreq"><button data-rd="-10">«</button><button data-rd="-1">‹</button><div><b>CANAL ${ch}</b><small>${radioFreq(ch)} · de 1 a ${g.radioCh}</small></div><button data-rd="1">›</button><button data-rd="10">»</button></div>
    <div class="rinfo">Alcance: ${radioRangeText(g.radioRange)} (vale o menor entre os dois rádios)</div>
    <div class="rinfo">Segure <b>Y</b> para falar · <b>[</b> e <b>]</b> trocam o canal · ${mic}</div>
    <div class="rrow"><label>Volume do rádio <input type="range" id="radioVol" min="0" max="150" value="${Math.round(radioVol() * 100)}"></label><button id="radioTest">🎙 Testar microfone</button></div>
    <h4>NO SEU CANAL</h4><div class="rinfo">${MP.on ? (peers.length ? peers.join(', ') : 'ninguém além de você') : 'o rádio só funciona em partidas online'}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rd]');
  if (b) { radioStep(+b.dataset.rd); return; }
  if (e.target.id === 'radioTest') { radioAC(); radioMic().then(ok => { if (!ok && RADIO.err) banner(RADIO.err); RADIO.panelT = 0; radioPanel(); }); }
  if (e.target.id === 'radioClose') toggleRadioPanel(false);
  if (e.target.id === 'radioTag') toggleRadioPanel();
});
document.addEventListener('input', e => { if (e.target.id === 'radioVol') { SAVE.settings.radioVol = +e.target.value; writeSave(); } });
document.addEventListener('change', e => { if (e.target.id === 'radioVol') e.target.blur(); });
