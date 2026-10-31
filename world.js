'use strict';

/* =====================================================================
   MUNDO: mapa, prédios e casas (andares, escadas, portas, janelas, telhados),
   colisão, visão, pathfinding e desenho do cenário
   Camadas: L = -1 térreo/exterior · L >= 0 = 2º andar do prédio de índice L
   ===================================================================== */

let grid0 = new Uint8Array(NT), grid1 = new Uint8Array(NT), ftype = new Uint8Array(NT), bldAt = new Int8Array(NT).fill(-1);
let blds = [], doors = [], reachN = new Uint8Array(2 * NT), spawnT = { x: 4, y: MH - 5 }, extT = { x: MW - 5, y: 4 };

const mapC = document.createElement('canvas'), mapX = mapC.getContext('2d');
const map1C = document.createElement('canvas'), map1X = map1C.getContext('2d');
const miniStatic = document.createElement('canvas'), miniStaticX = miniStatic.getContext('2d');
const MINI_S = 2;
miniStatic.width = MW * MINI_S; miniStatic.height = MH * MINI_S;

/* ---------- Consulta de tiles ---------- */
function kindF(tx, ty, L) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return K.WALL;
  const i = ty * MW + tx;
  return (L >= 0 && bldAt[i] === L) ? grid1[i] : grid0[i];
}
const solidF = (tx, ty, L) => MAT[kindF(tx, ty, L)].mv === 1;
const bldIdxAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? -1 : bldAt[ty * MW + tx]; };
const has2F = b => b >= 0 && blds[b].floors === 2;
// visão entre camadas: quem está no 2º andar enxerga o exterior (pelas janelas); o térreo não enxerga o 2º andar
const canView = (viewL, tgtL, x, y) => tgtL === viewL || (viewL >= 0 && tgtL === -1 && bldIdxAt(x, y) !== viewL);

/* ---------- Colisão círculo × tiles ---------- */
function moveEntity(e, dx, dy) {
  e.x += dx; e.y += dy;
  const r = e.r, L = e.L;
  for (let pass = 0; pass < 2; pass++) {
    const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T);
    const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidF(tx, ty, L)) continue;
      const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
      const ox = e.x - cx, oy = e.y - cy, d2 = ox * ox + oy * oy;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), push = r - d; e.x += ox / d * push; e.y += oy / d * push; }
        else {
          const l = e.x - tx * T, rr = tx * T + T - e.x, t = e.y - ty * T, b = ty * T + T - e.y, m = Math.min(l, rr, t, b);
          if (m === l) e.x = tx * T - r; else if (m === rr) e.x = tx * T + T + r; else if (m === t) e.y = ty * T - r; else e.y = ty * T + T + r;
        }
      }
    }
  }
}

/* ---------- Raycast (DDA): distância até o primeiro tile opaco ---------- */
function castRay(x, y, ang, maxD, L) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let tx = Math.floor(x / T), ty = Math.floor(y / T);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDX = dx === 0 ? Infinity : Math.abs(T / dx), tDY = dy === 0 ? Infinity : Math.abs(T / dy);
  let tMX = dx === 0 ? Infinity : ((dx > 0 ? (tx + 1) * T - x : x - tx * T) / Math.abs(dx));
  let tMY = dy === 0 ? Infinity : ((dy > 0 ? (ty + 1) * T - y : y - ty * T) / Math.abs(dy));
  let t = 0;
  while (t < maxD) {
    if (tMX < tMY) { t = tMX; tMX += tDX; tx += stepX; } else { t = tMY; tMY += tDY; ty += stepY; }
    if (t >= maxD) return maxD;
    if (MAT[kindF(tx, ty, L)].op) return t;
  }
  return maxD;
}
function hasLOS(x1, y1, x2, y2, L) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  if (castRay(x1, y1, Math.atan2(dy, dx), d, L) < d - 1) return false;
  if (typeof smokes !== 'undefined') for (const s of smokes) {      // nuvens de fumaça bloqueiam a visão
    if (s.L !== L) continue;
    const t = clamp(((s.x - x1) * dx + (s.y - y1) * dy) / (d * d), 0, 1);
    if (Math.hypot(x1 + dx * t - s.x, y1 + dy * t - s.y) < s.r * .8) return false;
  }
  return true;
}

/* ---------- Pathfinding em 2 camadas (térreo = 0, 2º andar = 1) ---------- */
const PQ = new Int32Array(2 * NT), PREV = new Int32Array(2 * NT), SEEN = new Uint32Array(2 * NT);
let stamp = 0;
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

function passAt(g0, g1, bAt, bl, fl, i) {
  if (fl === 0) return WALKABLE[g0[i]] === 1;
  const b = bAt[i];
  return b >= 0 && bl[b].floors === 2 && WALKABLE[g1[i]] === 1;
}
// BFS genérico; goal < 0 → percorre tudo (usado para alcançabilidade)
function bfsNodes(g0, g1, bAt, bl, start, goal, outReach) {
  stamp++;
  let h = 0, t = 0;
  PQ[t++] = start; SEEN[start] = stamp; PREV[start] = -1;
  if (outReach) outReach[start] = 1;
  while (h < t) {
    const c = PQ[h++];
    if (c === goal) break;
    const fl = c >= NT ? 1 : 0, i = c - fl * NT, cx = i % MW, cy = (i / MW) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = DX8[k], dy = DY8[k], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const ni = ny * MW + nx, n = fl * NT + ni;
      if (SEEN[n] === stamp || !passAt(g0, g1, bAt, bl, fl, ni)) continue;
      if (dx !== 0 && dy !== 0 && (!passAt(g0, g1, bAt, bl, fl, cy * MW + nx) || !passAt(g0, g1, bAt, bl, fl, ny * MW + cx))) continue;
      SEEN[n] = stamp; PREV[n] = c; PQ[t++] = n; if (outReach) outReach[n] = 1;
    }
    const kind = (fl ? g1 : g0)[i];
    if (kind === K.STAIRUP || kind === K.STAIRDN) {
      const n = (1 - fl) * NT + i;
      if (SEEN[n] !== stamp && passAt(g0, g1, bAt, bl, 1 - fl, i)) { SEEN[n] = stamp; PREV[n] = c; PQ[t++] = n; if (outReach) outReach[n] = 1; }
    }
  }
}
function findPath(sx, sy, sL, tx, ty, tL) {
  const sf = sL >= 0 ? 1 : 0, tf = tL >= 0 ? 1 : 0;
  const si = sy * MW + sx, ti = ty * MW + tx;
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0 || sx >= MW || tx >= MW || sy >= MH || ty >= MH) return null;
  if (!passAt(grid0, grid1, bldAt, blds, tf, ti) || !passAt(grid0, grid1, bldAt, blds, sf, si)) return null;
  const s = sf * NT + si, goal = tf * NT + ti;
  bfsNodes(grid0, grid1, bldAt, blds, s, goal, null);
  if (SEEN[goal] !== stamp) return null;
  const path = [];
  for (let c = goal; c !== -1; c = PREV[c]) path.push(c);
  return path.reverse();
}

/* =====================================================================
   GERAÇÃO DO MUNDO
   ===================================================================== */
function genWorld(seed) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rnd = mulberry32(seed + attempt * 7919);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const shuffle = a => a.sort(() => rnd() - .5);
    const g0 = new Uint8Array(NT), g1 = new Uint8Array(NT), f0 = new Uint8Array(NT), bAt = new Int8Array(NT).fill(-1);
    const idx = (x, y) => y * MW + x;
    const dl = [], bl = [];
    for (let x = 0; x < MW; x++) { g0[idx(x, 0)] = K.WALL; g0[idx(x, MH - 1)] = K.WALL; }
    for (let y = 0; y < MH; y++) { g0[idx(0, y)] = K.WALL; g0[idx(MW - 1, y)] = K.WALL; }
    for (let i = 0; i < 16; i++) {
      const cx = ri(2, MW - 3), cy = ri(2, MH - 3), rr = ri(2, 5);
      for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++)
        if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && Math.hypot(x - cx, y - cy) < rr - rnd() * 1.2) f0[idx(x, y)] = 2;
    }
    const sp = { x: 4, y: MH - 5 }, ex = { x: MW - 5, y: 4 };
    const spaceFree = (x, y, w, h, m) => bl.every(b => x - m >= b.x + b.w || x + w + m <= b.x || y - m >= b.y + b.h || y + h + m <= b.y);

    // janelas ao longo do perímetro (evita portas vizinhas)
    const placeWindows = (g, b, step) => {
      const sides = [
        { n: b.w - 2, at: i => idx(b.x + 1 + i, b.y), nb: 1 },
        { n: b.w - 2, at: i => idx(b.x + 1 + i, b.y + b.h - 1), nb: 1 },
        { n: b.h - 2, at: i => idx(b.x, b.y + 1 + i), nb: MW },
        { n: b.h - 2, at: i => idx(b.x + b.w - 1, b.y + 1 + i), nb: MW },
      ];
      for (const s of sides) for (let i = ri(0, 1); i < s.n; i += step) {
        const t = s.at(i);
        if (!isWallK(g[t]) || g[t - s.nb] === K.DOOR || g[t + s.nb] === K.DOOR) continue;
        g[t] = K.WINDOW;
      }
    };

    for (let tries = 0; tries < 500 && bl.length < 12; tries++) {
      const mr = rnd(), model = mr < .3 ? 'office' : mr < .5 ? 'casa' : mr < .63 ? 'cabana' : mr < .75 ? 'bangalo' : mr < .86 ? 'galpao' : mr < .95 ? 'sobrado' : 'garagem';
      const office = model === 'office', two = office || model === 'sobrado', wide = office || model === 'galpao' || model === 'garagem';
      const SZ = { office: [9, 13, 7, 10], casa: [6, 8, 5, 7], cabana: [5, 6, 5, 6], bangalo: [8, 10, 6, 8], galpao: [10, 13, 6, 8], sobrado: [7, 9, 6, 8], garagem: [5, 6, 4, 5] }[model];
      const wallK = office ? K.WALL : (model === 'cabana' || model === 'galpao') ? K.WOODW : K.BRICK;
      const w = ri(SZ[0], SZ[1]), h = ri(SZ[2], SZ[3]), x = ri(3, MW - w - 3), y = ri(3, MH - h - 3);
      if (x < 14 && y + h > MH - 14) continue;
      if (x + w > MW - 14 && y < 14) continue;
      if (!spaceFree(x, y, w, h, 3)) continue;
      const b = { x, y, w, h, kind: office ? 'office' : 'house', model, floors: two ? 2 : 1, roofA: 1, stairs: null };
      const bi = bl.length; bl.push(b);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const edge = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1;
        g0[idx(xx, yy)] = edge ? wallK : K.FLOOR; f0[idx(xx, yy)] = wide ? 1 : 3; bAt[idx(xx, yy)] = bi;
      }
      // portas externas
      const dw = wide ? 2 : 1;
      for (const s of shuffle([0, 1, 2, 3]).slice(0, ri(1, 2))) {
        if (s < 2) { const dx = ri(x + 1, x + w - 1 - dw), dy = s === 0 ? y : y + h - 1; for (let k = 0; k < dw; k++) { g0[idx(dx + k, dy)] = K.DOOR; dl.push({ idx: idx(dx + k, dy), fl: 0, open: false, t: 0 }); } }
        else { const dy = ri(y + 1, y + h - 1 - dw), dx = s === 2 ? x : x + w - 1; for (let k = 0; k < dw; k++) { g0[idx(dx, dy + k)] = K.DOOR; dl.push({ idx: idx(dx, dy + k), fl: 0, open: false, t: 0 }); } }
      }
      placeWindows(g0, b, 3);

      // divisórias de drywall com porta
      let px = null, py = null;
      const partition = (g, floorIdx, vertical) => {
        if (vertical) {
          const p = x + Math.floor(w / 2) + (floorIdx ? ri(-1, 1) : 0);
          for (let yy = y + 1; yy < y + h - 1; yy++) g[idx(p, yy)] = K.PART;
          const gy = ri(y + 1, y + h - 2); g[idx(p, gy)] = K.DOOR; dl.push({ idx: idx(p, gy), fl: floorIdx, open: false, t: 0 });
          return p;
        }
        const p = y + Math.floor(h / 2);
        for (let xx = x + 1; xx < x + w - 1; xx++) g[idx(xx, p)] = K.PART;
        const gx = ri(x + 1, x + w - 2); g[idx(gx, p)] = K.DOOR; dl.push({ idx: idx(gx, p), fl: floorIdx, open: false, t: 0 });
        return p;
      };
      if (model === 'cabana' || model === 'galpao' || model === 'garagem') { /* ambiente único */ } else if (w >= 10) px = partition(g0, 0, true); else if (h >= 8 || (w >= 7 && !office)) { if (w >= 7 && !office && h < 8) px = partition(g0, 0, true); else py = partition(g0, 0, false); }

      // escada (apenas prédios): dois tiles lado a lado
      if (two) {
        for (let k = 0; k < 40 && !b.stairs; k++) {
          const sx = ri(x + 2, x + w - 4), sy = ri(y + 2, y + h - 3);
          if (px !== null && (Math.abs(sx - px) <= 1 || Math.abs(sx + 1 - px) <= 1)) continue;
          if (py !== null && Math.abs(sy - py) <= 1) continue;
          b.stairs = { x: sx, y: sy };
        }
        if (!b.stairs) b.floors = 1;
      }
      const nearStairs = (cx, cy) => b.stairs && cx >= b.stairs.x - 1 && cx <= b.stairs.x + 2 && Math.abs(cy - b.stairs.y) <= 1;
      for (let k = 0, nc = model === 'galpao' ? ri(4, 8) : model === 'garagem' ? ri(1, 2) : ri(1, 3); k < nc; k++) {
        const cx = ri(x + 2, x + w - 3), cy = ri(y + 2, y + h - 3);
        if (px !== null && Math.abs(cx - px) <= 1) continue;
        if (py !== null && Math.abs(cy - py) <= 1) continue;
        if (nearStairs(cx, cy)) continue;
        if (g0[idx(cx, cy)] === K.FLOOR) g0[idx(cx, cy)] = K.CRATE;
      }

      // 2º andar
      if (b.floors === 2) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
          const edge = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1;
          g1[idx(xx, yy)] = edge ? wallK : K.FLOOR;
        }
        placeWindows(g1, b, 3);
        let px1 = null, py1 = null;
        if (px !== null) py1 = partition(g1, 1, false); else px1 = partition(g1, 1, true);
        for (let k = 0, nc = ri(1, 3); k < nc; k++) {
          const cx = ri(x + 2, x + w - 3), cy = ri(y + 2, y + h - 3);
          if (px1 !== null && Math.abs(cx - px1) <= 1) continue;
          if (py1 !== null && Math.abs(cy - py1) <= 1) continue;
          if (nearStairs(cx, cy)) continue;
          if (g1[idx(cx, cy)] === K.FLOOR) g1[idx(cx, cy)] = K.CRATE;
        }
        // a partição do 2º andar não pode cruzar a escada
        for (const t of [idx(b.stairs.x, b.stairs.y), idx(b.stairs.x + 1, b.stairs.y)]) { g0[t] = K.STAIRUP; g1[t] = K.STAIRDN; }
        for (const dxy of [[-1, 0], [2, 0], [0, 1], [1, 1], [0, -1], [1, -1]]) {
          const t = idx(b.stairs.x + dxy[0], b.stairs.y + dxy[1]);
          if (g1[t] === K.PART) g1[t] = K.FLOOR;
          if (g0[t] === K.PART) g0[t] = K.FLOOR;
        }
      }
    }

    // obstáculos externos
    const inBld = (x, y, m) => bl.some(b => x >= b.x - m && x < b.x + b.w + m && y >= b.y - m && y < b.y + b.h + m);
    for (let i = 0; i < 80; i++) {
      const x = ri(2, MW - 3), y = ri(2, MH - 3);
      const kind = rnd() < .6 ? K.TREE : K.CRATE, n = ri(1, 3);
      for (let k = 0; k < n; k++) {
        const xx = x + ri(-1, 1), yy = y + ri(-1, 1);
        if (xx < 1 || yy < 1 || xx > MW - 2 || yy > MH - 2 || inBld(xx, yy, 2)) continue;
        if (Math.hypot(xx - sp.x, yy - sp.y) < 6 || Math.hypot(xx - ex.x, yy - ex.y) < 6) continue;
        g0[idx(xx, yy)] = kind;
      }
    }
    for (const p of [sp, ex]) for (let y = p.y - 2; y <= p.y + 2; y++) for (let x = p.x - 2; x <= p.x + 2; x++) { g0[idx(x, y)] = K.FLOOR; f0[idx(x, y)] = p === ex ? 1 : 2; }

    // alcançabilidade
    const rc = new Uint8Array(2 * NT);
    bfsNodes(g0, g1, bAt, bl, idx(sp.x, sp.y), -1, rc);
    if (!rc[idx(ex.x, ex.y)]) continue;
    const okB = bl.filter(b => { for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) if (rc[idx(x, y)]) return true; return false; });
    if (okB.length < 6) continue;
    return { g0, g1, f0, bAt, bl, dl, rc, sp, ex };
  }
  // fallback: arena aberta
  const g0 = new Uint8Array(NT), g1 = new Uint8Array(NT), f0 = new Uint8Array(NT), bAt = new Int8Array(NT).fill(-1);
  for (let x = 0; x < MW; x++) { g0[x] = 1; g0[(MH - 1) * MW + x] = 1; }
  for (let y = 0; y < MH; y++) { g0[y * MW] = 1; g0[y * MW + MW - 1] = 1; }
  const rc = new Uint8Array(2 * NT), sp = { x: 4, y: MH - 5 }, ex = { x: MW - 5, y: 4 };
  bfsNodes(g0, g1, bAt, [], sp.y * MW + sp.x, -1, rc);
  return { g0, g1, f0, bAt, bl: [], dl: [], rc, sp, ex };
}

/* =====================================================================
   DESENHO DO CENÁRIO (pré-renderizado)
   ===================================================================== */
const in2F = (x, y) => { if (x < 0 || y < 0 || x >= MW || y >= MH) return false; const b = bldAt[y * MW + x]; return b >= 0 && blds[b].floors === 2; };
const tileK = (x, y, fl) => (x < 0 || y < 0 || x >= MW || y >= MH) ? 0 : fl ? (in2F(x, y) ? grid1[y * MW + x] : 0) : grid0[y * MW + x];
const isWallK = k => k === K.WALL || k === K.BRICK || k === K.WOODW;
const wallish = k => k === K.WALL || k === K.BRICK || k === K.WOODW || k === K.WINDOW || k === K.DOOR || k === K.PART || k === K.WINBROKEN || k === K.DOOROPEN;

function drawFloorTile(c, x, y, fl) {
  const px = x * T, py = y * T, h = hash(x, y);
  const f = fl ? 5 : ftype[y * MW + x];
  if (f === 1) {
    c.fillStyle = h < .5 ? '#7c7e77' : '#82847d'; c.fillRect(px, py, T, T);
    c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = 1; c.strokeRect(px + .5, py + .5, T - 1, T - 1);
    c.fillStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 4; i++) c.fillRect(px + hash(x * 7 + i, y) * 36, py + hash(x, y * 7 + i) * 36, 2, 2);
  } else if (f === 2) {
    c.fillStyle = h < .5 ? '#7a6444' : '#806a48'; c.fillRect(px, py, T, T);
    c.fillStyle = 'rgba(0,0,0,.14)';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(px + hash(x * 5 + i, y) * 38 + 1, py + hash(x, y * 5 + i) * 38 + 1, 1.3 + hash(i, x + y) * 1.4, 0, PI2); c.fill(); }
  } else if (f === 3) {          // piso de madeira (casas)
    c.fillStyle = h < .5 ? '#a47a4a' : '#9b7244'; c.fillRect(px, py, T, T);
    c.strokeStyle = 'rgba(60,30,10,.35)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(px, py + i * 10 + .5); c.lineTo(px + T, py + i * 10 + .5); c.stroke(); }
    c.beginPath(); c.moveTo(px + 12 + (y % 3) * 8, py); c.lineTo(px + 12 + (y % 3) * 8, py + 10); c.stroke();
  } else if (f === 5) {          // carpete do 2º andar
    c.fillStyle = h < .5 ? '#5a6a7a' : '#566676'; c.fillRect(px, py, T, T);
    c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 6; i++) c.fillRect(px + hash(x * 3 + i, y) * 38, py + hash(x, y * 3 + i) * 38, 2, 2);
    c.strokeStyle = 'rgba(0,0,0,.1)'; c.strokeRect(px + .5, py + .5, T - 1, T - 1);
  } else {
    c.fillStyle = ['#4a6b38', '#4e703b', '#476734'][(h * 3) | 0]; c.fillRect(px, py, T, T);
    c.strokeStyle = 'rgba(20,50,20,.35)'; c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const bx = px + hash(x * 11 + i, y) * 38 + 1, by = py + hash(x, y * 11 + i) * 36 + 3;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 1.5, by - 4); c.stroke();
    }
  }
}

function drawSolidTile(c, x, y, kind, fl) {
  const px = x * T, py = y * T;
  const horiz = wallish(tileK(x - 1, y, fl)) && wallish(tileK(x + 1, y, fl));
  const bm = bldAt[y * MW + x] >= 0 && blds[bldAt[y * MW + x]] ? blds[bldAt[y * MW + x]].model : 'office';
  const wallBase = () => {
    const wood = bm === 'cabana' || bm === 'galpao', brick = !wood && bm !== 'office';
    c.fillStyle = wood ? '#6a4a28' : brick ? '#6b3a2a' : '#5b5f65'; c.fillRect(px, py, T, T);
    c.fillStyle = wood ? '#a57a48' : brick ? '#9a5a40' : '#6f747b'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
  };
  if (kind === K.WALL) {
    wallBase();
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px + 2, py + T / 2); c.lineTo(px + T - 2, py + T / 2);
    const off = (x + y) % 2 ? 12 : 26;
    c.moveTo(px + off, py + 2); c.lineTo(px + off, py + T / 2);
    c.moveTo(px + T - off, py + T / 2); c.lineTo(px + T - off, py + T - 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(px + 2, py + 2, T - 4, 2);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px + 2, py + T - 4, T - 4, 2);
  } else if (kind === K.BRICK) {
    wallBase();
    c.strokeStyle = 'rgba(40,15,8,.5)'; c.lineWidth = 1; c.beginPath();
    const rh = (T - 4) / 4;
    for (let r = 0; r < 4; r++) {
      const yy = py + 2 + r * rh; if (r) { c.moveTo(px + 2, yy); c.lineTo(px + T - 2, yy); }
      for (let xx = px + 2 + ((r + x + y) % 2 ? 10 : 0) + 10; xx < px + T - 2; xx += 20) { c.moveTo(xx, yy); c.lineTo(xx, yy + rh); }
    }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(px + 2, py + 2, T - 4, 2);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px + 2, py + T - 4, T - 4, 2);
  } else if (kind === K.WOODW) {
    wallBase();
    c.strokeStyle = 'rgba(50,28,8,.55)'; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < 4; i++) { c.moveTo(px + 2, py + 2 + i * 9); c.lineTo(px + T - 2, py + 2 + i * 9); }
    c.stroke();
    c.fillStyle = 'rgba(40,20,5,.5)'; for (let i = 0; i < 4; i++) { c.fillRect(px + 5, py + 6 + i * 9, 1.6, 1.6); c.fillRect(px + T - 7, py + 6 + i * 9, 1.6, 1.6); }
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(px + 2, py + 2, T - 4, 2);
  } else if (kind === K.CRATE) {
    c.fillStyle = '#5e4220'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
    c.fillStyle = '#a97f40'; c.fillRect(px + 5, py + 5, T - 10, T - 10);
    c.strokeStyle = '#6e4e26'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px + 5, py + 5); c.lineTo(px + T - 5, py + T - 5); c.moveTo(px + T - 5, py + 5); c.lineTo(px + 5, py + T - 5); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px + 5, py + T / 2); c.lineTo(px + T - 5, py + T / 2); c.stroke();
  } else if (kind === K.TREE) {
    const ox = (hash(x, y) - .5) * 4, oy = (hash(y, x) - .5) * 4;
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(px + T / 2 + 5, py + T / 2 + 6, 21, 0, PI2); c.fill();
    c.fillStyle = '#245226'; c.beginPath(); c.arc(px + T / 2 + ox, py + T / 2 + oy, 21, 0, PI2); c.fill();
    c.fillStyle = '#2f6e31'; c.beginPath(); c.arc(px + T / 2 + ox - 3, py + T / 2 + oy - 3, 15, 0, PI2); c.fill();
    c.fillStyle = '#4a9448'; c.beginPath(); c.arc(px + T / 2 + ox - 6, py + T / 2 + oy - 6, 6, 0, PI2); c.fill();
  } else if (kind === K.WINDOW || kind === K.WINBROKEN) {
    wallBase();
    const gx = horiz ? px + 3 : px + 12, gy = horiz ? py + 12 : py + 3, gw = horiz ? T - 6 : 16, gh = horiz ? 16 : T - 6;
    if (kind === K.WINDOW) {
      c.fillStyle = '#7fb6d8'; c.fillRect(gx, gy, gw, gh);
      c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(gx + 2, gy + 2, horiz ? gw * .45 : 4, horiz ? 3 : gh * .45);
      c.strokeStyle = '#2a2d31'; c.lineWidth = 2; c.strokeRect(gx, gy, gw, gh);
      c.beginPath(); if (horiz) { c.moveTo(gx + gw / 2, gy); c.lineTo(gx + gw / 2, gy + gh); } else { c.moveTo(gx, gy + gh / 2); c.lineTo(gx + gw, gy + gh / 2); } c.stroke();
    } else {
      c.fillStyle = '#1b1f23'; c.fillRect(gx, gy, gw, gh);
      c.fillStyle = '#9fd0ea';
      for (let i = 0; i < 4; i++) { const sx = gx + hash(x + i, y) * gw, sy = gy + hash(x, y + i) * gh; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 5, sy + 2); c.lineTo(sx + 1, sy + 6); c.closePath(); c.fill(); }
      c.strokeStyle = '#2a2d31'; c.lineWidth = 2; c.strokeRect(gx, gy, gw, gh);
    }
  } else if (kind === K.DOOR) {
    if (horiz) { c.fillStyle = '#8a5a2b'; c.fillRect(px + 1, py + 11, T - 2, 18); c.strokeStyle = '#4a2e12'; c.lineWidth = 2; c.strokeRect(px + 1, py + 11, T - 2, 18); c.fillStyle = '#e0c070'; c.beginPath(); c.arc(px + T - 8, py + T / 2, 2, 0, PI2); c.fill(); }
    else { c.fillStyle = '#8a5a2b'; c.fillRect(px + 11, py + 1, 18, T - 2); c.strokeStyle = '#4a2e12'; c.lineWidth = 2; c.strokeRect(px + 11, py + 1, 18, T - 2); c.fillStyle = '#e0c070'; c.beginPath(); c.arc(px + T / 2, py + T - 8, 2, 0, PI2); c.fill(); }
  } else if (kind === K.DOOROPEN) {
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px, py, T, T);
    c.fillStyle = '#8a5a2b'; c.strokeStyle = '#4a2e12'; c.lineWidth = 2;
    if (horiz) { c.fillRect(px + 1, py + 2, 5, T - 4); c.strokeRect(px + 1, py + 2, 5, T - 4); }
    else { c.fillRect(px + 2, py + 1, T - 4, 5); c.strokeRect(px + 2, py + 1, T - 4, 5); }
  } else if (kind === K.PART) {
    c.fillStyle = '#9a968a'; c.fillRect(px, py, T, T);
    c.fillStyle = '#b9b4a6'; c.fillRect(px + 3, py + 3, T - 6, T - 6);
    c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1; c.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
  } else if (kind === K.STAIRUP || kind === K.STAIRDN) {
    c.fillStyle = '#6c6a64'; c.fillRect(px, py, T, T);
    c.strokeStyle = '#3a3935'; c.lineWidth = 2;
    for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(px, py + i * 6.6); c.lineTo(px + T, py + i * 6.6); c.stroke(); }
    c.fillStyle = kind === K.STAIRUP ? '#ffd36a' : '#8fdcff'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(kind === K.STAIRUP ? '▲' : '▼', px + T / 2, py + T / 2 + 1);
  }
}

function redrawRegion(x0, y0, x1, y1, fl) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(MW - 1, x1); y1 = Math.min(MH - 1, y1);
  const c = fl ? map1X : mapX;
  c.save(); c.beginPath(); c.rect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); c.clip();
  if (fl) c.clearRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!fl || in2F(x, y)) drawFloorTile(c, x, y, fl);
  if (!fl) {
    c.fillStyle = 'rgba(0,0,0,.3)';
    for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) { const k = tileK(x, y, 0); if (k === K.WALL || k === K.BRICK || k === K.WOODW || k === K.CRATE || k === K.PART) c.fillRect(x * T + 4, y * T + 5, T, T); }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = tileK(x, y, fl); if (k) drawSolidTile(c, x, y, k, fl); }
  c.restore();
}
function miniTile(x, y) {
  const k = grid0[y * MW + x], f = ftype[y * MW + x];
  miniStaticX.fillStyle = k === K.WALL ? '#a3a9b0' : k === K.BRICK ? '#a0614a' : k === K.WOODW ? '#a57a48' : k === K.CRATE ? '#b08a4a' : k === K.TREE ? '#1f5a26' : (k === K.WINDOW || k === K.WINBROKEN) ? '#7fb6d8' : k === K.DOOR || k === K.DOOROPEN ? '#8a5a2b' : k === K.PART ? '#8a867a' : (k === K.STAIRUP) ? '#ffd36a' : f === 1 ? '#5a5d56' : f === 2 ? '#5a4d34' : f === 3 ? '#7a5a38' : '#33452b';
  miniStaticX.fillRect(x * MINI_S, y * MINI_S, MINI_S, MINI_S);
}

// telhado: casas com telhas, prédios com laje plana e equipamentos
function makeRoof(b, seed) {
  const cv = document.createElement('canvas'), W = b.w * T, H = b.h * T, o = 8;
  cv.width = W + o * 2; cv.height = H + o * 2;
  const c = cv.getContext('2d'), r = mulberry32(seed);
  if (b.kind === 'house') {
    const mdl = b.model || 'casa';
    const col = mdl === 'cabana' ? '#5a4030' : mdl === 'galpao' ? '#6a7480' : mdl === 'bangalo' ? '#8a7a5c' : mdl === 'sobrado' ? '#4a525c' : mdl === 'garagem' ? '#7a6a58' : ['#8a3f2e', '#6b4a3a', '#7a4a2a', '#5a4a52'][Math.floor(r() * 4)];
    c.fillStyle = col; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    for (let y = 6; y < cv.height; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke(); for (let x = (y / 9 % 2) * 8; x < cv.width; x += 16) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 9); c.stroke(); } }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, cv.height / 2 - 2, cv.width, 4);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, cv.height / 2 + 2, cv.width, 3);
    c.fillStyle = '#4a4440'; c.fillRect(cv.width * .7, cv.height * .25, 14, 14);   // chaminé
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 2; c.strokeRect(1, 1, cv.width - 2, cv.height - 2);
  } else {
    c.fillStyle = '#6a6e73'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#7b8086'; c.fillRect(6, 6, cv.width - 12, cv.height - 12);
    c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1;
    for (let x = 30; x < cv.width; x += 30) { c.beginPath(); c.moveTo(x, 6); c.lineTo(x, cv.height - 6); c.stroke(); }
    for (let i = 0; i < 3; i++) {   // ar-condicionado
      const x = 20 + r() * (cv.width - 80), y = 20 + r() * (cv.height - 70);
      c.fillStyle = '#9aa0a6'; c.fillRect(x, y, 36, 24); c.fillStyle = '#5a5f64'; c.beginPath(); c.arc(x + 18, y + 12, 8, 0, PI2); c.fill();
    }
    c.strokeStyle = '#4a4e53'; c.lineWidth = 4; c.strokeRect(2, 2, cv.width - 4, cv.height - 4);
  }
  // sombra suave nas bordas
  const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
  c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  b.roofImg = cv; b.roofO = o;
}

function loadWorld(m) {
  grid0 = m.g0; grid1 = m.g1; ftype = m.f0; bldAt = m.bAt; blds = m.bl; doors = m.dl; reachN = m.rc; spawnT = m.sp; extT = m.ex;
  blds.forEach((b, i) => makeRoof(b, 1000 + i * 17));
  mapC.width = map1C.width = Math.round(WORLD_W * R_MAP); mapC.height = map1C.height = Math.round(WORLD_H * R_MAP);
  mapX.setTransform(R_MAP, 0, 0, R_MAP, 0, 0); map1X.setTransform(R_MAP, 0, 0, R_MAP, 0, 0);
  redrawRegion(0, 0, MW - 1, MH - 1, 0);
  if (blds.some(b => b.floors === 2)) redrawRegion(0, 0, MW - 1, MH - 1, 1);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) miniTile(x, y);
}

/* ---------- Mudanças dinâmicas ---------- */
const setTile = (tx, ty, L, k) => { const i = ty * MW + tx; if (L >= 0 && bldAt[i] === L) grid1[i] = k; else grid0[i] = k; };
function refreshTile(tx, ty, L) {
  const fl = (L >= 0 && bldAt[ty * MW + tx] === L) ? 1 : 0;
  redrawRegion(tx - 1, ty - 1, tx + 1, ty + 1, fl);
  if (!fl) miniTile(tx, ty);
}
function destroyCrate(tx, ty, L) {
  setTile(tx, ty, L, K.FLOOR); refreshTile(tx, ty, L);
  decals.push({ k: 'debris', x: tx * T + T / 2, y: ty * T + T / 2, L, a: 1 });
  if (!MP.on && Math.random() < .5) dropPickup(tx * T + T / 2, ty * T + T / 2, true, false, L);
  for (let i = 0; i < 10; i++) spawnPart({ x: tx * T + T / 2, y: ty * T + T / 2, vx: rand(-160, 160), vy: rand(-160, 160), life: rand(.4, .9), size: rand(2, 4), color: '#a97f40', drag: 3, kind: 'dot' });
  sfx('crate');
}
function breakWindow(tx, ty, L) {
  setTile(tx, ty, L, K.WINBROKEN); refreshTile(tx, ty, L);
  for (let i = 0; i < 12; i++) spawnPart({ x: tx * T + T / 2, y: ty * T + T / 2, vx: rand(-200, 200), vy: rand(-200, 200), life: rand(.4, 1), size: rand(1, 2.5), color: '#bfe4f5', drag: 3, kind: 'spark', layer: 1 });
  sfx('glass');
}
function breakDoor(tx, ty, L) {
  setTile(tx, ty, L, K.DOOROPEN); refreshTile(tx, ty, L);
  const i = ty * MW + tx; const d = doors.findIndex(q => q.idx === i && ((q.fl === 1) === (L >= 0 && bldAt[i] === L))); if (d >= 0) doors.splice(d, 1);
  for (let k = 0; k < 8; k++) spawnPart({ x: tx * T + T / 2, y: ty * T + T / 2, vx: rand(-160, 160), vy: rand(-160, 160), life: rand(.4, .8), size: rand(2, 3.5), color: '#8a5a2b', drag: 3, kind: 'dot' });
  sfx('crate');
}

// portas abrem sozinhas quando alguém se aproxima e fecham depois de um tempo
function updateDoors(dt, ents) {
  for (const d of doors) {
    const tx = d.idx % MW, ty = (d.idx / MW) | 0, cx = tx * T + T / 2, cy = ty * T + T / 2;
    const g = d.fl ? grid1 : grid0;
    if (g[d.idx] !== K.DOOR && g[d.idx] !== K.DOOROPEN) continue;
    let near = false, inside = false;
    for (const e of ents) {
      if (e.dead || (e.bound)) continue;
      if (((e.L >= 0) ? 1 : 0) !== d.fl || (d.fl && e.L !== bldAt[d.idx])) continue;
      const ax = Math.abs(e.x - cx), ay = Math.abs(e.y - cy);
      if (ax < T / 2 + e.r + 14 && ay < T / 2 + e.r + 14) near = true;
      if (ax < T / 2 + e.r && ay < T / 2 + e.r) inside = true;
    }
    if (near) { d.t = 0; if (g[d.idx] === K.DOOR) { g[d.idx] = K.DOOROPEN; refreshTile(tx, ty, d.fl ? bldAt[d.idx] : -1); sfx('door'); } }
    else if (g[d.idx] === K.DOOROPEN) {
      d.t += dt;
      if (d.t > 2.2 && !inside) { g[d.idx] = K.DOOR; refreshTile(tx, ty, d.fl ? bldAt[d.idx] : -1); }
    }
  }
}
