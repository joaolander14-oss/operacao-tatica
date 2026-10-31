'use strict';

/* =====================================================================
   INTERFACE: HUD, menu, arsenal/inventário (categorias e personalização),
   telas de fim
   ===================================================================== */

let invCtx = 'base';                       // 'base' (menu) | 'mission' (durante a partida)
const ars = { tab: 'weapons', cat: 'Todas', custom: null, gslot: 'head' };
let slotEls = [];

const GEAR_ICON = { head: '⛑️', body: '🦺', legs: '🥾', back: '🎒', eyes: '🥽', radio: '📻' };
const OVERLAYS = ['menu', 'arsenal', 'endScreen', 'pauseScreen', 'customScreen', 'mpScreen'];
function hideAllOverlays() { OVERLAYS.forEach(id => $(id).classList.add('hidden')); }
const SLOT_LABEL = ['PRIM.', 'SEC.', 'CORPO'];

/* ---------- Ícones de armas ---------- */
function drawWeaponIcon(cv, id) {
  const c = cv.getContext('2d'), w = WMAP[id];
  const BK = { rpg: 13, pistol: 2, revolver: 2, m79: 7, dupla: 8, minigun: 9, flame: 8, mgl: 7, knife: 3, knuckles: 2, bat: 3, machete: 3, crowbar: 3, axe: 3, katana: 4, sledge: 3 };
  const back = typeof w.shape === 'string' ? (BK[w.shape] || 3) : (w.shape.st || 6) + 1;
  const len = w.melee ? w.len + 4 : w.len;
  const k = Math.min(3.2, (cv.width - 8) / (len + back + 3));
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.shadowColor = 'rgba(255,255,255,.75)'; c.shadowBlur = 3;
  c.translate(4 + back * k, cv.height / 2); c.scale(k, k);
  drawGun(c, id, LD.attach && LD.attach[id]);
}
function paintIcons(root) {
  root.querySelectorAll('canvas[data-wid]').forEach(cv => drawWeaponIcon(cv, cv.dataset.wid));
}

/* ---------- HUD ---------- */
function showWeaponName(name) {
  const el = $('wname');
  el.textContent = name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showWeaponName.t); showWeaponName.t = setTimeout(() => el.classList.remove('show'), 1100);
}
function buildSlots() {
  const bar = $('weapons');
  bar.innerHTML = ''; slotEls = [];
  for (let i = 0; i < 3; i++) {
    const sl = player && player.slots[i];
    const d = document.createElement('div'); d.className = 'slot' + (sl ? '' : ' none');
    d.innerHTML = `<span class="key">${i + 1}</span><span class="wn">${sl ? sl.w.name : ''}</span><canvas width="96" height="36"${sl ? ` data-wid="${sl.id}"` : ''}></canvas><span class="ammo"></span>`;
    d.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); initAudio(); selectWeapon(i); });
    bar.appendChild(d);
    slotEls.push({ el: d, ammo: d.querySelector('.ammo'), txt: '' });
  }
  paintIcons(bar);
}
function buildSquadHUD() {
  const box = $('squad');
  box.innerHTML = '';
  allies.filter(a => a.kind === 'partner').forEach(a => {
    const d = document.createElement('div'); d.className = 'sq';
    d.innerHTML = `<span style="color:${a.def.color}">${a.def.role}</span><div class="sqbar"><i></i></div>`;
    a._el = d; a._bar = d.querySelector('i'); box.appendChild(d);
  });
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
const bodyCv = $('bodyHud'), bodyX = bodyCv.getContext('2d'), armCv = $('armHud'), armX = armCv.getContext('2d');
/* ---------- Ficha médica: órgãos, ossos e defesa ---------- */
let medOpen = false, medT = 0;
function toggleMed(v) {
  medOpen = v != null ? v : !medOpen;
  $('medPanel').classList.toggle('hidden', !medOpen);
  if (medOpen) { medT = 0; updateMedPanel(); }
}
function updateMedPanel() {
  const p = player; if (!p) return;
  const now = performance.now();
  if (now - medT < 200) return; medT = now;
  const bc = $('medBody').getContext('2d'), ac = $('medArm').getContext('2d');
  bc.clearRect(0, 0, 170, 270); ac.clearRect(0, 0, 170, 270);
  drawBodyDiagram(bc, p.parts, 14, 10, 230, p.showT > 0 ? p.lastPart : null, true);
  drawOrganDots(bc, p.parts.org, 14 + 230 * .31, 10, 230, true);
  drawArmorDiagram(ac, p, 14, 10, 230);
  const rows = [];
  for (const k in p.parts.org) {
    const st = orgState(p.parts.org[k].hp);
    if (st) rows.push(`<div class="o"><span>${ORGANS[k].bone ? '🦴' : '🫀'} ${ORGANS[k].name}</span><b style="color:${ORG_COL[st]}">${(ORGANS[k].bone ? ORG_STATE_NAME_BONE : ORG_STATE_NAME)[st]} · ${Math.round(p.parts.org[k].hp)}%</b></div>`);
  }
  const fx = p.fx, notes = [];
  if (p.arrest > 0) notes.push('💔 Parada cardíaca: ' + Math.ceil(p.arrest) + 's (adrenalina ou cirurgia)');
  if (p.bleed > 0) notes.push('🩸 Sangramento ' + p.bleed.toFixed(1) + '/s (bandagem estanca vasos e músculos)');
  if (fx.cough) notes.push('😮‍💨 Pulmão ferido: tosse e denuncia sua posição');
  if (fx.crawl) notes.push('🚫 Coluna/pernas: só consegue rastejar');
  else if (fx.speed < .95) notes.push('🦵 Velocidade ' + Math.round(fx.speed * 100) + '% (ossos/músculos das pernas, pulmões)');
  if (fx.vis < 1) notes.push('👁 Visão reduzida a ' + Math.round(fx.vis * 100) + '%');
  if (fx.dizzy > 0) notes.push('😵 Tontura e visão turva (cérebro/crânio)');
  if (fx.reloadMul > 1) notes.push('✋ Recarga ' + Math.round((fx.reloadMul - 1) * 100) + '% mais lenta (braços feridos)');
  if (p.numb > 0) notes.push('💊 Analgésico: dor reduzida por ' + Math.ceil(p.numb) + 's');
  const arm = ['head', 'body', 'legs', 'eyes'].map(s => { const g = gearOf(s), a = p.armor[s]; return g ? `<div class="o"><span>${GEAR_ICON[s]} ${g.name}</span><b>${a ? Math.ceil(a.dur) + ' / ' + g.dur : g.legAbs ? Math.round(g.legAbs * 100) + '% menos dano nas pernas' : g.desc.split('.')[0]}</b></div>` : ''; }).join('');
  $('medList').innerHTML = '<h4>ÓRGÃOS E OSSOS</h4>' + (rows.join('') || '<div class="ok">Tudo saudável.</div>') + (notes.length ? '<h4>EFEITOS</h4>' + notes.map(n => `<div>${n}</div>`).join('') : '') + '<h4>DEFESA</h4>' + (arm || '<div>Sem equipamento.</div>');
}
$('medClose').addEventListener('click', () => toggleMed(false));
bodyCv.addEventListener('click', () => toggleMed());
armCv.addEventListener('click', () => toggleMed());
function updateHUD() {
  const p = player;
  if (hudCache.mp !== MP.on) { hudCache.mp = MP.on; for (const id of ['mpBoard', 'mpFeed']) $(id).classList.toggle('hidden', !MP.on); if (!MP.on) $('mpRespawn').classList.add('hidden'); }
  const pct = clamp(p.hp / p.maxHp * 100, 0, 100);
  $('hpFill').style.width = pct + '%';
  $('hpFill').classList.toggle('low', pct < 30);
  setText('hpText', Math.ceil(p.hp));
  let dur = 0, max = 0;
  for (const s of ['head', 'body']) { const a = p.armor[s]; if (a) { dur += a.dur; max += GMAP[a.id].dur; } }
  $('arFill').style.width = (max ? dur / max * 100 : 0) + '%';
  setText('arText', max ? Math.ceil(dur) + ' / ' + max : 'SEM COLETE');
  setText('kills', G.kills);
  setText('timer', fmtTime(G.time));
  setText('objText', objectiveText());
  $('objText').classList.toggle('done', G.extractOpen);
  setText('loadTag', '⚖ ' + p.kg.toFixed(1) + ' kg · ' + Math.round(p.wMul * p.speedMul * 100) + '%');
  setText('floorTag', (p.L >= 0 ? (floorOfL(p.L) + 1) + 'º ANDAR' : 'TÉRREO') + (G.night ? ' · 🌙' : ''));
  $('bleedTag').classList.toggle('hidden', !(p.bleed > 0));

  // silhueta de dano (verde → amarelo → laranja → vermelho → preto)
  bodyX.clearRect(0, 0, bodyCv.width, bodyCv.height);
  drawBodyDiagram(bodyX, p.parts, 4, 2, 92, p.showT > 0 ? p.lastPart : null);
  armX.clearRect(0, 0, armCv.width, armCv.height);
  drawArmorDiagram(armX, p, 4, 2, 92);
  $('arrestTag').classList.toggle('hidden', !(p.arrest > 0));
  if (p.arrest > 0) setText('arrestTag', '💔 PARADA CARDÍACA ' + Math.ceil(p.arrest) + 's · adrenalina/cirurgia');
  const dz = Math.max(p.fx.dizzy || 0, Math.min(1, (p.conc || 0) / 2));
  const blur = dz > .05 ? 'blur(' + (dz * 2.2).toFixed(1) + 'px)' : '';
  if (hudCache.blur !== blur) { hudCache.blur = blur; $('game').style.filter = blur; }
  if (medOpen) updateMedPanel();
  {
    const rg = MP.on && radioGear(), rt = $('radioTag');
    $('btnRadio').classList.toggle('hidden', !rg);
    $('btnRadio').classList.toggle('hold', RADIO.lastTx);
    rt.classList.toggle('hidden', !MP.on);
    if (MP.on) {
      const ch = radioCh(), hs = RADIO.hear.map(id => { const q = MP.players.get(id); return q ? q.name : '?'; });
      setText('radioTag', rg ? '📻 CANAL ' + ch + ' · ' + radioFreq(ch) + (RADIO.lastTx ? ' · 🎙 TRANSMITINDO' : '') + (hs.length ? ' · 🔊 ' + hs.join(', ') : '') : '📻 sem rádio');
      rt.classList.toggle('tx', RADIO.lastTx); rt.classList.toggle('rx', hs.length > 0);
    }
    if (RADIO.open) radioPanel();
  }

  slotEls.forEach((s, i) => {
    const sl = p.slots[i];
    if (!sl) return;
    const w = sl.w;
    const txt = w.melee ? '—' : (G.infAmmo ? '∞' : sl.mag) + ' / ' + (w.inf || G.infAmmo ? '∞' : (p.pool[w.cal] || 0)) + (w.fam ? ' · ' + CALIBERS[w.cal].tag : '');
    if (s.txt !== txt) { s.txt = txt; s.ammo.textContent = txt; }
    s.el.classList.toggle('active', i === p.wi);
    s.el.classList.toggle('equipping', i === p.wi && p.equipT > 0);
    s.el.classList.toggle('empty', !w.melee && sl.mag === 0 && !w.inf && !(p.pool[w.cal] > 0));
  });

  const tsel = TMAP[p.thrSel];
  setText('cGren', thrCount(p, p.thrSel)); setText('cMed', healCount(p, p.healSel)); setText('cRep', p.cons.repair);
  if (hudCache.thrIcon !== tsel.icon) { hudCache.thrIcon = tsel.icon; $('btnGren').firstElementChild.textContent = tsel.icon; $('btnGren').title = tsel.name + ' (G)'; }
  $('btnGren').classList.toggle('off', thrCount(p, p.thrSel) <= 0);
  const csl = curSlot(); $('btnAmmo').classList.toggle('hidden', !(csl && csl.w.fam));
  const hsel = HMAP[p.healSel];
  if (hudCache.hIcon !== hsel.id) { hudCache.hIcon = hsel.id; $('btnMed').firstElementChild.textContent = hsel.icon; $('btnMed').title = hsel.name + ' · ' + hsel.time + 's (H usa, X troca)'; }
  $('btnMed').classList.toggle('off', healCount(p, p.healSel) <= 0 || !healNeed(p, p.healSel));
  $('btnMed').classList.toggle('hold', !!p.healing);
  $('btnRep').classList.toggle('off', p.cons.repair <= 0);
  const hasSquad = allies.some(a => a.kind === 'partner' && !a.dead);
  $('btnCmd').classList.toggle('hidden', !hasSquad);
  $('btnCmd').classList.toggle('hold', G.hold);
  $('btnVis').classList.toggle('hidden', !p.visMode);
  $('btnVis').classList.toggle('hold', G.visOn);
  $('btnVis').firstElementChild.textContent = p.visMode === 'th' ? '🔥' : p.visMode === 'zoom' ? '🔭' : '👁';

  for (const a of allies) if (a._bar) { a._bar.style.width = (a.dead ? 0 : clamp(a.hp / a.maxHp * 100, 0, 100)) + '%'; a._el.classList.toggle('dead', a.dead); }

  const near = G.near, pr = $('prompt');
  const ptxt = near ? (near.type === 'hostage' ? 'Segure ' + (touchMode ? 'AÇÃO' : '[E]') + ': libertar refém' : near.type === 'plant' ? 'Segure ' + (touchMode ? 'AÇÃO' : '[E]') + ': plantar a bomba' : near.type === 'defuse' ? 'Segure ' + (touchMode ? 'AÇÃO' : '[E]') + ': desarmar a bomba' : 'Segure ' + (touchMode ? 'AÇÃO' : '[E]') + ': plantar carga') : '';
  if (hudCache.prompt !== ptxt) { hudCache.prompt = ptxt; pr.textContent = ptxt; pr.classList.toggle('hidden', !ptxt); }
  $('btnAct').classList.toggle('hidden', !(near && touchMode));

  const hf = $('hitFlash'), o = clamp(Math.max(G.hurtFlash, p.bleed > 0 ? .1 + .06 * Math.sin(G.time * 4) : 0) + (G.pulse || 0) * .1, 0, 1);
  if (hf._o !== o) { hf._o = o; hf.style.opacity = o; }
}

/* ---------- Menu principal ---------- */
function levelFor(mode) { return (SAVE.progress[mode] || 0) + 1; }
function showMenu() {
  LD = SAVE; G.custom = null;
  G.state = 'menu'; toggleMed(false); $('game').style.filter = ''; hudCache.blur = '';
  document.body.classList.remove('playing');
  hideAllOverlays();
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderMenu();
}
function renderMenu() {
  $('menuCredits').textContent = SAVE.credits;
  $('modeGrid').innerHTML = MODES.filter(m => !m.hidden).map(m => {
    const info = m.id === 'survival' ? 'Recorde: onda ' + (SAVE.best.survival || 0) : 'Nível ' + levelFor(m.id);
    return `<div class="mode${SAVE.mode === m.id ? ' sel' : ''}" data-mode="${m.id}"><span class="ico">${m.icon}</span><b>${m.name}</b><small>${m.desc}</small><em>${info}</em></div>`;
  }).join('');
  const ws = LD.weapons.filter(Boolean).map(id => WMAP[id].name).join(' · ');
  const sq = LD.squad.map(id => PMAP[id] && PMAP[id].role).filter(Boolean).join(', ') || 'sem parceiros';
  const g = ['head', 'body', 'legs', 'back', 'eyes', 'radio'].map(s => LD.gear[s] ? GMAP[LD.gear[s]].name : null).filter(Boolean).join(' · ') || 'sem equipamento';
  $('menuLoadout').innerHTML = `<div><b>Armas:</b> ${ws}</div><div><b>Proteção:</b> ${g}</div><div><b>Esquadrão:</b> ${sq}</div>`;
}
$('modeGrid').addEventListener('click', e => {
  const m = e.target.closest('.mode'); if (!m) return;
  SAVE.mode = m.dataset.mode; writeSave(); renderMenu();
});

/* ---------- Arsenal / Inventário ---------- */
const isOwned = id => invCtx === 'custom' || invCtx === 'mp' || !!SAVE.owned[id] || (invCtx === 'mission' && !!G.custom);
function openArsenal(ctxName) {
  invCtx = ctxName;
  if (ctxName === 'base' || ctxName === 'custom' || ctxName === 'mp') { hideAllOverlays(); G.state = 'menu'; }
  LD = ctxName === 'custom' || ctxName === 'mp' ? SAVE.custom : (ctxName === 'mission' && G.custom ? SAVE.custom : SAVE);
  ars.custom = null;
  $('arsenal').classList.remove('hidden');
  renderArsenal();
}
function closeArsenal() {
  $('arsenal').classList.add('hidden');
  if (invCtx === 'base') showMenu(); else if (invCtx === 'custom') showCustom(); else if (invCtx === 'mp') mpShowScreen();
}
function openInventory() {
  if (G.state !== 'play' && G.state !== 'paused') return;
  if (MP.on && MP.cfg.gm === 'gungame') { banner('GUN GAME: SEM INVENTÁRIO'); return; }
  $('pauseScreen').classList.add('hidden');
  releaseSticks(); input.mouseDown = false; input.act = false; input.keys.clear();
  G.state = 'inv'; document.body.classList.remove('playing');
  openArsenal('mission');
}
function closeInventory() {
  if (G.state !== 'inv') return;
  $('arsenal').classList.add('hidden');
  G.state = 'play'; document.body.classList.add('playing'); lastT = performance.now();
}

const bar = (v, max) => `<span class="sbar"><i style="width:${clamp(v / max * 100, 3, 100)}%"></i></span>`;
function weaponTags(w) {
  const t = ['⚖ ' + w.kg + ' kg'];
  if (w.inf) t.push('Munição ∞');
  if (w.melee) { if (w.sweep) t.push('Golpe em arco'); if (w.stun) t.push('Atordoa'); if (w.knock) t.push('Empurra'); if (w.breaks) t.push('Quebra obstáculos'); t.push('Pelas costas ×' + w.back); if (w.noise <= 40) t.push('Silenciosa'); return t; }
  if (w.burst) t.push('Rajada ×' + w.burst);
  if (w.spin) t.push('Spin-up');
  if (w.flame) t.push('Chamas');
  if (w.sup) t.push('Silenciada');
  const pen = CALIBERS[w.cal].pen + (w.ap || 0);
  if (pen >= MAT[K.WALL].cost) t.push('Atravessa concreto');
  else if (pen >= MAT[K.BRICK].cost) t.push('Atravessa paredes de casa');
  else if (pen >= MAT[K.WOODW].cost) t.push('Atravessa madeira');
  if (w.breaks) t.push('Quebra caixas');
  if (w.rocket) t.push('Explosiva');
  if (w.pellets > 1) t.push('Chumbo ×' + w.pellets);
  if (w.fam) t.push(SHELL_FAMILIES[w.fam].length > 1 ? SHELL_FAMILIES[w.fam].length + ' tipos de cartucho (B)' : 'Cartucho ' + CALIBERS[w.cal].tag);
  if (w.reloadType === 'shell') t.push('Cartucho a cartucho');
  else if (w.shape === 'revolver' || w.shape === 'dupla') t.push('Ejeta cartuchos');
  if (w.push >= 2) t.push('Empurra');
  return t;
}
function weaponDps(w) {
  if (w.melee) return w.dmg / w.delay;
  const per = w.dmg * w.pellets * (w.flame ? 2 : 1);
  return w.burst ? per * w.burst / w.delay : per / w.delay;
}
function weaponCard(w) {
  const owned = isOwned(w.id), eq = LD.weapons[WSLOT[w.slot]] === w.id;
  let tag;
  if (eq) tag = '<span class="tag on">Equipada</span>';
  else if (owned) tag = '<span class="tag">Equipar</span>';
  else tag = invCtx === 'base' ? `<span class="tag buy${SAVE.credits >= w.price ? '' : ' no'}">💰 ${w.price}</span>` : '<span class="tag lock">Bloqueada</span>';
  const slotName = { primary: 'Primária', secondary: 'Secundária', melee: 'Corpo a corpo' }[w.slot];
  let meta, stats;
  if (w.melee) {
    meta = `${w.grp} · ${slotName}`;
    stats = `<label>Dano</label>${bar(w.dmg, 140)}<label>Cadência</label>${bar(1 / w.delay, 4.5)}<label>Alcance</label>${bar(w.range, 50)}`;
  } else {
    const cal = CALIBERS[w.cal];
    meta = `${w.grp} · <span style="color:${cal.color}">${cal.name}</span>`;
    stats = `<label>Dano</label>${bar(w.dmg * w.pellets * (w.flame ? 2 : 1), 240)}<label>DPS</label>${bar(weaponDps(w), 300)}<label>Alcance</label>${bar(w.range, 2200)}<label>Recuo</label>${bar(w.rcv[1] + w.kick * .01, .2)}<label>Penetração</label>${bar(cal.pen + (w.ap || 0), 6)}`;
  }
  const cust = owned && w.att ? `<button class="wrench" data-act="custom" data-id="${w.id}" title="Personalizar">🔧</button>` : '';
  return `<div class="card${eq ? ' eq' : ''}${owned ? '' : ' locked'}" data-act="wpn" data-id="${w.id}">${cust}
    <canvas width="120" height="40" data-wid="${w.id}"></canvas>
    <b>${w.name}</b><small>${meta}</small>
    <div class="stats">${stats}</div>
    <div class="chips">${weaponTags(w).map(t => `<span>${t}</span>`).join('')}</div>
    <small class="d">${w.desc}${w.melee ? '' : ' Pente ' + w.mag + '.'}</small>${tag}</div>`;
}
function gearCard(g) {
  const owned = isOwned(g.id), eq = LD.gear[g.slot] === g.id;
  let tag;
  if (eq) tag = '<span class="tag on">Equipado</span>';
  else if (owned) tag = '<span class="tag">Equipar</span>';
  else tag = invCtx === 'base' ? `<span class="tag buy${SAVE.credits >= g.price ? '' : ' no'}">💰 ${g.price}</span>` : '<span class="tag lock">Bloqueado</span>';
  return `<div class="card gear${eq ? ' eq' : ''}${owned ? '' : ' locked'}" data-act="gear" data-id="${g.id}"><span class="gi">${GEAR_ICON[g.slot]}</span><b>${g.name}</b><small class="d">${g.desc}</small>${tag}</div>`;
}
function partnerCard(pt) {
  const owned = isOwned(pt.id), inSq = LD.squad.includes(pt.id), w = WMAP[pt.wpn];
  let tag;
  if (inSq) tag = '<span class="tag on">No esquadrão</span>';
  else if (owned) tag = '<span class="tag">Adicionar</span>';
  else tag = `<span class="tag buy${SAVE.credits >= pt.price ? '' : ' no'}">💰 ${pt.price}</span>`;
  return `<div class="card${inSq ? ' eq' : ''}${owned ? '' : ' locked'}" data-act="partner" data-id="${pt.id}"><span class="gi" style="color:${pt.color}">👤</span><b>${pt.name}</b>
    <small>${pt.role} · ${w.name}</small><div class="stats"><label>Vida</label>${bar(pt.hp, 180)}<label>Blindagem</label>${bar(pt.abs, .5)}<label>Velocidade</label>${bar(pt.speed, 170)}</div>
    <small class="d">${pt.desc}</small>${tag}</div>`;
}
function attachCard(a, wid) {
  const at = (LD.attach[wid] || {}), eq = at[a.slot] === a.id, owned = isOwned(a.id);
  let tag;
  if (eq) tag = '<span class="tag on">Instalado</span>';
  else if (owned) tag = '<span class="tag">Instalar</span>';
  else tag = invCtx === 'base' ? `<span class="tag buy${SAVE.credits >= a.price ? '' : ' no'}">💰 ${a.price}</span>` : '<span class="tag lock">Bloqueado</span>';
  return `<div class="card att${eq ? ' eq' : ''}${owned ? '' : ' locked'}" data-act="att" data-id="${a.id}" data-w="${wid}"><b>${a.name}</b><small class="d">${a.desc}</small>${tag}</div>`;
}

// painel de personalização de uma arma
function customHtml(id) {
  const w = WMAP[id], e = effW(id), cal = CALIBERS[w.cal];
  const row = (label, base, eff, fmt, goodLow) => {
    const diff = eff - base, cls = Math.abs(diff) < 1e-6 ? '' : ((diff < 0) === !!goodLow ? 'up' : 'down');
    return `<tr><td>${label}</td><td>${fmt(base)}</td><td class="${cls}">${fmt(eff)}</td></tr>`;
  };
  const f0 = v => Math.round(v), f2 = v => v.toFixed(2);
  let h = `<div class="custom"><div class="chead"><button class="ghost sm" data-act="cback">← Voltar</button><canvas width="120" height="40" data-wid="${id}"></canvas><div><b>${w.name}</b><small>${w.grp} · ${cal.name}</small></div></div>
    <table class="atable"><tr><th>Atributo</th><th>Base</th><th>Com acessórios</th></tr>
    ${row('Dano por projétil', w.dmg, e.dmg, f0)}
    ${row('Alcance', w.range, e.range, f0)}
    ${row('Velocidade da bala', w.speed, e.speed, f0)}
    ${row('Dispersão', w.spread, e.spread, v => v.toFixed(3), true)}
    ${row('Recuo por tiro (rad)', w.rcv[0], e.rcv[0], v => v.toFixed(3), true)}
    ${row('Recuo máximo (rad)', w.rcv[1], e.rcv[1], v => v.toFixed(3), true)}
    ${row('Ruído', w.noise, e.noise, f0, true)}
    ${row('Recarga (s)', w.reload, e.reload, f2, true)}
    ${row('Penetração', cal.pen + (w.ap || 0), cal.pen + (w.ap || 0), f2)}
    </table><div class="cols">`;
  for (const slot in ATT_SLOTS) {
    const list = ATTACH.filter(a => a.slot === slot && attachOk(w, a));
    h += `<div class="col"><h4>${ATT_SLOTS[slot]}</h4>` + (list.length ? list.map(a => attachCard(a, id)).join('') : '<small class="d">Não compatível.</small>') + '</div>';
  }
  return h + '</div></div>';
}

function loadInfo() { const kg = invCtx === 'mission' && player ? playerKg(player) : loadoutKg(LD); return { kg, mul: loadMul(kg) }; }
function weaponGroups() { const g = []; for (const w of WEAPONS) if (!g.includes(w.grp)) g.push(w.grp); return g; }

function renderArsenal() {
  const base = invCtx !== 'mission', free = invCtx === 'custom' || invCtx === 'mp';
  const tabs = [['weapons', 'ARMAS'], ['gear', 'PROTEÇÃO'], ['partners', 'PARCEIROS'], ['supply', base ? 'MUNIÇÃO' : 'SUPRIMENTOS']];
  let html = `<div class="ahead"><div class="atitle">${base ? 'ARSENAL' : 'INVENTÁRIO'}</div>${free ? '<div class="credits sm">Tudo liberado · não gasta créditos</div>' : base ? `<div class="credits">💰 <b>${SAVE.credits}</b></div>` : '<div class="credits sm">Missão em pausa</div>'}</div>
    <div class="tabs">${tabs.map(t => `<button data-tab="${t[0]}" class="${ars.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div><div class="abody">`;

  if (ars.tab === 'weapons' && ars.custom) {
    html += customHtml(ars.custom);
  } else if (ars.tab === 'weapons') {
    const slotBox = (i, label) => {
      const id = LD.weapons[i], w = id && WMAP[id];
      return `<div class="loadslot${w ? '' : ' empty'}"><span class="key">${i + 1}</span><small>${label}</small>${w ? `<canvas width="96" height="34" data-wid="${id}"></canvas><b>${w.name}</b>` : '<b>vazio</b>'}${w && w.att ? `<button class="ghost sm" data-act="custom" data-id="${id}">🔧</button>` : ''}${w ? `<button class="ghost sm" data-act="clearslot" data-i="${i}">remover</button>` : ''}</div>`;
    };
    { const li = loadInfo(); html += `<div class="asum">⚖ Carga ${invCtx === 'mission' ? 'atual' : 'inicial'}: <b>${li.kg.toFixed(1)} kg</b> (armas, acessórios, munição, proteção e suprimentos) · velocidade <b>${Math.round(li.mul * 100)}%</b>. O peso de tudo que você carrega conta, não só da arma na mão: armas leves quase não atrapalham; metralhadoras e armas pesadas reduzem bastante.</div>`; }
    html += '<div class="aslots two">' + slotBox(0, 'PRIMÁRIA') + slotBox(1, 'SECUNDÁRIA') + slotBox(2, 'CORPO A CORPO') + '</div>';
    html += '<div class="chips cats">' + ['Todas', ...weaponGroups()].map(g => `<button data-cat="${g}" class="${ars.cat === g ? 'on' : ''}">${g}</button>`).join('') + '</div>';
    const list = WEAPONS.filter(w => ars.cat === 'Todas' || w.grp === ars.cat);
    const sections = [['primary', 'Armas primárias'], ['secondary', 'Pistolas (secundária)'], ['melee', 'Corpo a corpo']];
    for (const [slot, title] of sections) {
      const ws = list.filter(w => w.slot === slot);
      if (ws.length) html += `<h4>${title}</h4><div class="agrid">` + ws.map(weaponCard).join('') + '</div>';
    }
  } else if (ars.tab === 'gear') {
    html += '<div class="aslots">' + Object.keys(SLOT_NAMES).map(s => {
      const g = gearOf(s);
      return `<button class="aslot${ars.gslot === s ? ' sel' : ''}" data-gslot="${s}"><span class="gi2">${GEAR_ICON[s]}</span><small>${SLOT_NAMES[s]}: ${g ? g.name : '—'}</small></button>`;
    }).join('') + `<button class="ghost sm" data-act="cleargear">Remover ${SLOT_NAMES[ars.gslot].toLowerCase()}</button></div>`;
    const head = gearOf('head'), body = gearOf('body'), legs = gearOf('legs'), back = gearOf('back');
    const li = loadInfo(), sp = Math.round(li.mul * (1 + (legs ? legs.spd : 0)) * 100);
    html += `<div class="asum">Absorção: capacete <b>${head ? Math.round(head.abs * 100) : 0}%</b> · colete <b>${body ? Math.round(body.abs * 100) : 0}%</b> · Peso <b>${li.kg.toFixed(1)} kg</b> · Velocidade <b>${sp}%</b> · Munição <b>x${back ? back.capMul : 1}</b>. O capacete protege a cabeça; o colete, o tronco e (metade) os braços. As pernas só são protegidas por botas reforçadas.</div>`;
    html += '<div class="agrid">' + GEAR.filter(g => g.slot === ars.gslot).map(gearCard).join('') + '</div>';
  } else if (ars.tab === 'partners') {
    html += `<div class="asum">Esquadrão: <b>${LD.squad.length}/${MAX_SQUAD}</b>${base ? '' : ' — altere o esquadrão antes da missão'}. Parceiros seguem você, atacam inimigos visíveis e podem ser mandados ficar parados (tecla C).</div>`;
    html += '<div class="agrid">' + PARTNERS.map(partnerCard).join('') + '</div>';
  } else {
    html += '<div class="asum">Cada calibre causa seu próprio dano e tem seu poder de penetração (madeira, drywall, portas e concreto). Ao recarregar, o carregador é jogado fora com as balas que sobraram. Caixas de munição trazem vários calibres.</div><table class="atable"><tr><th>Calibre</th><th>Dano</th><th>Penetr.</th><th>Armas</th><th>' + (base ? 'Máx.' : 'Atual / Máx.') + '</th></tr>';
    const cap = c => Math.round(CALIBERS[c].cap * (base ? (gearOf('back') ? gearOf('back').capMul : 1) : player.capMul));
    for (const cal in CALIBERS) {
      const used = LD.weapons.filter(id => id && !WMAP[id].melee && (WMAP[id].cal === cal || (WMAP[id].fam && CALIBERS[cal].fam === WMAP[id].fam))).map(id => WMAP[id].name);
      const have = !base && (player.pool[cal] || 0) > 0, C = CALIBERS[cal];
      html += `<tr class="${used.length || have ? '' : 'dim'}"><td style="color:${C.color}">${C.name}</td><td>${C.dmg}</td><td>${C.pen}</td><td>${used.join(', ') || '—'}</td><td>${base ? cap(cal) : (player.pool[cal] || 0) + ' / ' + cap(cal)}</td></tr>`;
    }
    html += '</table>';
    if (!base) {
      const c = player.cons;
      html += `<div class="aslots cons2">${HEALS.map(h => `<button class="ghost" data-act="use" data-u="h:${h.id}" title="${h.desc}">${h.icon} ${h.name} (${healCount(player, h.id)}) · ${h.time}s${player.healSel === h.id ? ' ✔' : ''}</button>`).join('')}<button class="ghost" data-act="use" data-u="gren">💣 Granada (${c.grenade}) [G]</button><button class="ghost" data-act="use" data-u="rep">🛡 Reparo de Colete (${c.repair}) [V]</button></div>`;
    } else html += `<div class="asum">Cada operação começa com 4 carregadores por arma, kits médicos e granadas conforme a mochila.</div>`;
  }
  html += `</div><div class="afoot"><button id="btnArsClose" class="big">${base ? 'CONCLUIR' : 'VOLTAR À MISSÃO'}</button></div>`;
  const body = $('arsBody'), keep = body.querySelector('.abody');
  const st = keep ? keep.scrollTop : 0;
  body.innerHTML = html;
  const nb = body.querySelector('.abody'); if (nb) nb.scrollTop = st;
  paintIcons(body);
  $('btnArsClose').addEventListener('click', () => { if (invCtx !== 'mission') closeArsenal(); else closeInventory(); });
}

function applyLoadoutChange() {
  writeSave();
  if (invCtx === 'mission' && player) syncPlayerLoadout();
  renderArsenal();
}
function flash(msg) { const t = $('arsToast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function tryBuy(id, price) {
  if (isOwned(id)) return true;
  if (invCtx !== 'base') { flash('Compre itens no Arsenal, fora da missão.'); return false; }
  if (SAVE.credits < price) { flash('Créditos insuficientes (' + price + ').'); return false; }
  SAVE.credits -= price; SAVE.owned[id] = 1; sfx('pickup'); flash('Comprado!'); return true;
}

$('arsBody').addEventListener('click', e => {
  initAudio();
  const tab = e.target.closest('[data-tab]');
  if (tab) { ars.tab = tab.dataset.tab; ars.custom = null; renderArsenal(); return; }
  const ct = e.target.closest('[data-cat]');
  if (ct) { ars.cat = ct.dataset.cat; renderArsenal(); return; }
  const gs = e.target.closest('[data-gslot]');
  if (gs) { ars.gslot = gs.dataset.gslot; renderArsenal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;

  if (act === 'custom') { e.stopPropagation(); ars.custom = id; ars.tab = 'weapons'; renderArsenal(); return; }
  if (act === 'cback') { ars.custom = null; renderArsenal(); return; }
  if (act === 'att') {
    const a = AMAP[id], wid = el.dataset.w;
    if (!tryBuy(id, a.price)) { renderArsenal(); return; }
    const at = LD.attach[wid] || (LD.attach[wid] = {});
    at[a.slot] = at[a.slot] === id ? null : id;
    applyLoadoutChange(); return;
  }
  if (act === 'wpn') {
    if (!tryBuy(id, WMAP[id].price)) { renderArsenal(); return; }
    LD.weapons[WSLOT[WMAP[id].slot]] = id;
    applyLoadoutChange();
  } else if (act === 'clearslot') {
    const i = +el.dataset.i;
    if (LD.weapons.filter(Boolean).length <= 1) { flash('Mantenha ao menos uma arma.'); return; }
    LD.weapons[i] = null; applyLoadoutChange();
  } else if (act === 'gear') {
    const g = GMAP[id];
    if (!tryBuy(id, g.price)) { renderArsenal(); return; }
    LD.gear[g.slot] = id; applyLoadoutChange();
  } else if (act === 'cleargear') {
    LD.gear[ars.gslot] = null; applyLoadoutChange();
  } else if (act === 'partner') {
    if (invCtx === 'mission') { flash('Altere o esquadrão antes da missão.'); return; }
    const pt = PMAP[id];
    if (!isOwned(id)) { if (!tryBuy(id, pt.price)) { renderArsenal(); return; } }
    const i = LD.squad.indexOf(id);
    if (i >= 0) LD.squad.splice(i, 1);
    else if (LD.squad.length < MAX_SQUAD) LD.squad.push(id);
    else flash('Esquadrão cheio (' + MAX_SQUAD + ').');
    applyLoadoutChange();
  } else if (act === 'use') {
    const uu = el.dataset.u;
    if (uu.startsWith('h:')) { player.healSel = uu.slice(2); flash(HMAP[uu.slice(2)].name + ' selecionado — use com H durante a missão.'); }
    else if (uu === 'med') useMed(); else if (el.dataset.u === 'gren') flash('Jogue granadas durante a missão (tecla G).'); else useRepair();
    renderArsenal();
  }
});

/* ---------- Partida personalizada ---------- */
const CUSTOM_MODES = MODES.filter(m => m.id !== 'mp').map(m => [m.id, m.icon + ' ' + m.name]);
function showCustom() {
  G.state = 'menu'; LD = SAVE.custom; G.custom = null;
  hideAllOverlays(); $('hud').classList.add('hidden');
  $('customScreen').classList.remove('hidden');
  renderCustom();
}
function renderCustom() {
  const o = SAVE.custom.opts, types = ALL_TYPES;
  const ws = SAVE.custom.weapons.filter(Boolean).map(id => WMAP[id].name).join(' · ');
  $('customBody').innerHTML = `<div class="ahead"><div class="atitle">PARTIDA PERSONALIZADA</div><div class="credits sm">Tudo liberado · não afeta seus créditos nem progresso</div></div>
  <div class="copts">
    <label>Modo de jogo<select id="oMode">${CUSTOM_MODES.map(m => `<option value="${m[0]}"${o.mode === m[0] ? ' selected' : ''}>${m[1]}</option>`).join('')}</select></label>
    <label>Horário<select id="oTime"><option value="day"${o.time === 'day' ? ' selected' : ''}>☀ Dia</option><option value="night"${o.time === 'night' ? ' selected' : ''}>🌙 Noite</option><option value="random"${o.time === 'random' ? ' selected' : ''}>🎲 Aleatório</option></select></label>
    <label>Inimigos: <b id="oEnV">${o.enemies}</b><input type="range" id="oEn" min="0" max="40" value="${o.enemies}"></label>
    <label>Nível de dificuldade: <b id="oLvV">${o.level}</b><input type="range" id="oLv" min="1" max="10" value="${o.level}"></label>
    <label>Vida dos inimigos<select id="oHp">${[.5, 1, 2, 3].map(v => `<option value="${v}"${o.hpMul === v ? ' selected' : ''}>×${v}</option>`).join('')}</select></label>
    <label>Intensidade da sombra: <b id="oShV">${o.shadow}%</b><input type="range" id="oSh" min="0" max="100" value="${o.shadow}"></label>
    <fieldset class="full"><legend>Armas dos inimigos (sorteadas, com equipamento aleatório)</legend>${types.map(t => `<label class="chk"><input type="checkbox" data-type="${t[0]}"${o.types.includes(t[0]) ? ' checked' : ''}> ${t[1]}</label>`).join('')}
      <label class="chk"><input type="checkbox" id="oInf"${o.infAmmo ? ' checked' : ''}> Munição infinita</label></fieldset>
    <div class="full asum"><b>Equipamento:</b> ${ws} · Esquadrão: ${SAVE.custom.squad.length}/${MAX_SQUAD}. Todas as armas, acessórios, coletes, parceiros e itens estão liberados.</div>
  </div>
  <div class="row"><button id="btnCEquip" class="ghost">⚙ ARMAS, ACESSÓRIOS E EQUIPAMENTO</button><button id="btnCStart" class="big">INICIAR PARTIDA</button><button id="btnCBack" class="ghost">VOLTAR</button></div>`;
  const q = id => $(id);
  const sync = () => {
    o.mode = q('oMode').value; o.time = q('oTime').value; o.enemies = +q('oEn').value; o.level = +q('oLv').value; o.hpMul = +q('oHp').value; o.shadow = +q('oSh').value;
    o.infAmmo = q('oInf').checked;
    o.types = [...document.querySelectorAll('[data-type]')].filter(c => c.checked).map(c => c.dataset.type);
    if (!o.types.length) o.types = ['ar'];
    SAVE.settings.shadow = o.shadow;
    q('oEnV').textContent = o.enemies; q('oLvV').textContent = o.level; q('oShV').textContent = o.shadow + '%';
    writeSave();
  };
  $('customBody').querySelectorAll('input,select').forEach(el => el.addEventListener('input', sync));
  q('btnCEquip').addEventListener('click', () => { initAudio(); $('customScreen').classList.add('hidden'); openArsenal('custom'); });
  q('btnCBack').addEventListener('click', showMenu);
  q('btnCStart').addEventListener('click', () => { initAudio(); sync(); startMission(o.mode, o.level, Object.assign({}, o)); });
}

/* ---------- Fim de missão ---------- */
function showEnd(r) {
  hideAllOverlays();
  $('hud').classList.add('hidden');
  const surv = r.mode === 'survival';
  $('endTitle').innerHTML = r.won ? '<span>MISSÃO</span> CUMPRIDA' : 'MISSÃO <span style="color:var(--bad)">FALHOU</span>';
  $('endSub').textContent = MMAP[r.mode].name + ' · Nível ' + r.level + (r.reason && !r.won ? ' — ' + r.reason : '');
  $('endStats').innerHTML =
    (surv ? `<div><small>Ondas</small><b>${r.won ? r.wave : Math.max(0, r.wave - 1)}</b></div>` : `<div><small>Tempo</small><b>${fmtTime(r.time)}</b></div>`) +
    `<div><small>Hostis abatidos</small><b>${r.kills}</b></div>` +
    `<div><small>Tiros na cabeça</small><b>${r.heads}</b></div>` +
    `<div><small>Precisão</small><b>${r.acc}%</b></div>` +
    (G.custom ? '' : `<div><small>Créditos</small><b>+${r.earned + r.bonus}</b></div>`) +
    (r.partners ? `<div><small>Parceiros perdidos</small><b>${r.partners}</b></div>` : '');
  $('btnNext').classList.toggle('hidden', !r.won || !!G.custom);
  $('btnRetry').classList.toggle('hidden', r.won && !G.custom);
  $('btnEndArsenal').classList.remove('hidden'); $('btnMpLobby').classList.add('hidden');
  $('endScreen').classList.remove('hidden');
}

/* ---------- Botões ---------- */
const stopEv = e => { e.preventDefault(); e.stopPropagation(); };
const hit = (id, fn) => $(id).addEventListener('pointerdown', e => { stopEv(e); initAudio(); fn(); });
hit('btnReload', () => { if (G.state === 'play') startReload(); });
hit('btnSwap', () => { if (G.state === 'play') cycleWeapon(1); });
hit('btnMeleeT', quickMelee);
hit('btnGren', throwGrenade);
hit('btnThr', cycleThrowable);
hit('btnAmmo', cycleAmmoType);
hit('btnMed', useMed);
hit('btnHeal', cycleHeal);
hit('btnRep', useRepair);
hit('btnCmd', toggleHold);
hit('btnVis', toggleVision);
{ const b = $('btnRadio'); b.addEventListener('pointerdown', e => { e.preventDefault(); radioPtt(true); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => radioPtt(false)); }
$('btnAct').addEventListener('pointerdown', e => { stopEv(e); input.act = true; });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('btnAct').addEventListener(ev, () => { input.act = false; }));
$('btnPause').addEventListener('click', () => setPaused(true));
$('btnInv').addEventListener('click', openInventory);
$('btnMute').addEventListener('click', toggleMute);
$('btnStart').addEventListener('click', () => { initAudio(); startMission(SAVE.mode, levelFor(SAVE.mode)); });
$('btnArsenal').addEventListener('click', () => { initAudio(); openArsenal('base'); });
$('btnCustom').addEventListener('click', () => { initAudio(); showCustom(); });
$('btnNext').addEventListener('click', () => { initAudio(); startMission(G.mode, G.level + 1); });
$('btnRetry').addEventListener('click', () => { initAudio(); if (G.custom) startMission(G.custom.mode, G.custom.level, G.custom); else startMission(G.mode, G.level); });
$('btnEndArsenal').addEventListener('click', () => { openArsenal('base'); });
$('btnMenu').addEventListener('click', () => { if (MP.peer) mpLeave(); showMenu(); });
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnPauseInv').addEventListener('click', openInventory);
$('btnQuit').addEventListener('click', () => { releaseSticks(); if (MP.peer) mpLeave(); showMenu(); });

/* ---------- Sombra ajustável ---------- */
const shR = $('shadowRange');
function syncShadowUI() {
  shR.value = SAVE.settings.shadow; $('shadowVal').textContent = SAVE.settings.shadow + '%';
  const gv = Math.round(gunVolume() * 100);
  $('gunRange').value = gv; $('gunVal').textContent = gv + '%'; $('gunRange2').value = gv; $('gunVal2').textContent = gv + '%';
}
const setGunVol = v => { SAVE.settings.gunVol = +v; applyGunVolume(); syncShadowUI(); writeSave(); };
['gunRange', 'gunRange2'].forEach(id => $(id).addEventListener('input', e => { setGunVol(e.target.value); if (AC && !muted) gunshot(WMAP.ak47, 1); }));
shR.addEventListener('input', () => { SAVE.settings.shadow = +shR.value; $('shadowVal').textContent = shR.value + '%'; writeSave(); });
syncShadowUI();
$('pauseScreen').addEventListener('transitionend', syncShadowUI);
const origPause = setPaused;

/* ---------- Início ---------- */
bootGame();
showMenu();
window.__game = { G, SAVE, input, sticks, cam, get S() { return S; }, get player() { return player; }, get enemies() { return enemies; }, get allies() { return allies; }, get blds() { return blds; }, get pickups() { return pickups; }, get bullets() { return bullets; }, interacts: () => interacts, startMission, selectWeapon, tryFire, endMission, openInventory, closeInventory };
