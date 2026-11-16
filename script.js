(function(){
"use strict";

const $ = id => document.getElementById(id);
const stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
// ===== Celular: detecção, desempenho automático e vibração =====
const IS_TOUCH = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : ("ontouchstart" in window);
if(IS_TOUCH) document.body.classList.add("touch");
let LOW = false, perfAcc = 0, perfN = 0, DPR = 1;
function perfTick(dt){
  if(LOW) return;
  perfAcc += dt; perfN++;
  if(perfN >= 90){ if(perfAcc / perfN > 0.024){ LOW = true; resize(); } perfAcc = 0; perfN = 0; }   // abaixo de ~40 quadros/s: modo leve
}
function buzz(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
const FX = () => LOW ? 0.4 : IS_TOUCH ? 0.7 : 1;                                                  // quantidade de partículas

const buf = document.createElement("canvas"), bx = buf.getContext("2d");

// ===== Mapa (# parede de servidor · . chão · P início) =====
const MAP = [
  "################",
  "#P.....#.......#",
  "#.##.#.#.####..#",
  "#.#..#...#.....#",
  "#.#.####.#.###.#",
  "#......#...#...#",
  "###.##.###.#.###",
  "#...#........#.#",
  "#.#.#.####.#.#.#",
  "#.#...#....#...#",
  "#.###.#.##.###.#",
  "#.....#..#.....#",
  "#.##.###.#.###.#",
  "#..#.....#...#.#",
  "#.....#.....#..#",
  "################",
];
const MW = MAP[0].length, MH = MAP.length;
const wall = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || MAP[Math.floor(y)][Math.floor(x)] === "#";
let START = {x:1.5, y:1.5};
MAP.forEach((row, y) => [...row].forEach((c, x) => { if(c === "P") START = {x:x + 0.5, y:y + 0.5}; }));

const FOV = 1.15;          // campo de visão (rad)
const LEVELS = 3;

let W = 0, H = 0, RW = 320, RH = 200, zbuf = [];
function resize(){
  const r = stage.getBoundingClientRect();
  const dpr = DPR = Math.min(LOW ? 1 : IS_TOUCH ? 1.5 : 2, window.devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  RW = Math.round(LOW ? Math.min(190, W * 0.5) : IS_TOUCH ? Math.min(280, Math.max(200, W * 0.6)) : Math.min(420, Math.max(240, W * 0.6)));
  RH = Math.round(RW * H / W);
  buf.width = RW; buf.height = RH;
  zbuf = new Float32Array(RW);
  if(state !== "play") draw();
}

// ===== Sprites desenhados uma vez =====
function makeSprite(fn){ const c = document.createElement("canvas"); c.width = c.height = 64; fn(c.getContext("2d")); return c; }
const SPR = {
  virus: makeSprite(g => {
    g.translate(32, 36);
    g.strokeStyle = "#1E8A45"; g.lineWidth = 4; g.lineCap = "round";
    for(let i = 0; i < 10; i++){ const a = i / 10 * 6.28; g.beginPath(); g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); g.stroke(); }
    g.fillStyle = "#4BE37A"; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill();
    g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(-7, -3, 5, 0, 7); g.arc(7, -3, 5, 0, 7); g.fill();
    g.fillStyle = "#0B3A1C"; g.beginPath(); g.arc(-7, -2, 2.4, 0, 7); g.arc(7, -2, 2.4, 0, 7); g.fill();
    g.strokeStyle = "#0B3A1C"; g.lineWidth = 2; g.beginPath(); g.moveTo(-13, -10); g.lineTo(-3, -7); g.moveTo(13, -10); g.lineTo(3, -7); g.stroke();
    g.beginPath(); g.arc(0, 11, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }),
  drone: makeSprite(g => {
    g.translate(32, 30);
    g.strokeStyle = "#CFE6FF"; g.lineWidth = 2;
    for(const s of [-1, 1]){ g.beginPath(); g.moveTo(s * 8, -4); g.lineTo(s * 22, -12); g.stroke(); g.fillStyle = "rgba(207,230,255,.6)"; g.beginPath(); g.ellipse(s * 22, -13, 9, 2, 0, 0, 7); g.fill(); }
    g.fillStyle = "#FF6B7D"; g.beginPath(); g.roundRect ? g.roundRect(-15, -9, 30, 18, 5) : g.rect(-15, -9, 30, 18); g.fill();
    g.fillStyle = "#3A0710"; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.fillStyle = "#FFC93C"; g.beginPath(); g.arc(0, 0, 2.5, 0, 7); g.fill();
  }),
  hacker: makeSprite(g => {
    g.translate(32, 34);
    g.fillStyle = "#22164A"; g.beginPath(); g.moveTo(-20, 28); g.lineTo(-19, -4); g.quadraticCurveTo(-18, -26, 0, -26); g.quadraticCurveTo(18, -26, 19, -4); g.lineTo(20, 28); g.closePath(); g.fill();
    g.strokeStyle = "#FF6B7D"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#0A0620"; g.beginPath(); g.ellipse(0, -4, 12, 13, 0, 0, 7); g.fill();
    g.fillStyle = "#4BE3A1"; g.fillRect(-8, -7, 5, 3); g.fillRect(3, -7, 5, 3);
  }),
  orb: makeSprite(g => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 14); gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(0.4, "#FF6B7D"); gr.addColorStop(1, "rgba(255,107,125,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  }),
};

// ===== Estado =====
let state = "start";
let pl, enemies, orbs, score, level, time, fireT, flash, hurtT, kick, bob, msg, msgT, killsTotal;
let best = 0, muted = false;
try{ best = +(localStorage.getItem("corredor3d-best") || 0) || 0; muted = localStorage.getItem("corredor3d-mute") === "1"; }catch(e){}
const rnd = (a, b) => a + Math.random() * (b - a);

function reset(){
  pl = {x:START.x, y:START.y, a:0, hp:5, inv:0};
  score = 0; level = 0; time = 0; fireT = 0; flash = 0; hurtT = 0; kick = 0; bob = 0; killsTotal = 0;
  nextLevel();
}
function nextLevel(){
  level++;
  pl.x = START.x; pl.y = START.y; pl.a = 0;
  enemies = []; orbs = [];
  const n = 3 + level * 3;
  const floor = [];
  MAP.forEach((row, y) => [...row].forEach((c, x) => { if(c !== "#" && Math.hypot(x + 0.5 - START.x, y + 0.5 - START.y) > 5) floor.push([x + 0.5, y + 0.5]); }));
  for(let i = 0; i < n; i++){
    const [x, y] = floor.splice(Math.floor(Math.random() * floor.length), 1)[0];
    const r = Math.random();
    const kind = level >= 2 && r < 0.25 ? "hacker" : r < 0.6 ? "virus" : "drone";
    const K = {virus:{hp:3, sp:0.9, size:0.7}, drone:{hp:2, sp:1.7, size:0.55}, hacker:{hp:4, sp:0.8, size:0.8}}[kind];
    enemies.push({kind, x, y, hp:K.hp, sp:K.sp * (1 + (level - 1) * 0.15), size:K.size, hit:0, t:rnd(0, 6), fire:rnd(1.5, 3), wander:rnd(0, 6.28), bite:0});
  }
  showMsg("NÍVEL " + level + " · elimine " + n + " invasores", 2.5);
}
function showMsg(t, s){ msg = t; msgT = s; }

// ===== Controles =====
const keys = {};
document.addEventListener("keydown", e => {
  if((state === "start" || state === "over") && (e.key === "Enter")){ e.preventDefault(); start(); return; }
  if(e.key === "p" || e.key === "P" || e.key === "Escape"){ if(state === "play") togglePause(); return; }
  keys[e.key.toLowerCase()] = true;
  if(state === "play" && (e.key === " " || e.key.startsWith("Arrow"))) e.preventDefault();
  if(state === "play" && e.key === " ") shoot();
});
document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

const touches = {};   // pointerId -> {side, ox, oy, x, y, lx, moved}
let lookDX = 0;
function pt(e){ const r = cv.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; }
cv.addEventListener("pointerdown", e => {
  if(state !== "play") return;
  if(e.pointerType === "mouse"){
    shoot();
    if(document.pointerLockElement !== cv && cv.requestPointerLock){ try{ const p = cv.requestPointerLock(); if(p && p.catch) p.catch(() => {}); }catch(err){} }
    return;
  }
  const p = pt(e);
  touches[e.pointerId] = {side:p.x < W * 0.45 ? "move" : "look", ox:p.x, oy:p.y, x:p.x, y:p.y, lx:p.x, moved:0};
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", e => {
  if(e.pointerType === "mouse"){ if(document.pointerLockElement === cv && state === "play") lookDX += e.movementX * 0.0035; return; }
  const t = touches[e.pointerId]; if(!t) return;
  const p = pt(e);
  if(t.side === "look"){ lookDX += (p.x - t.lx) * 0.009; t.moved += Math.abs(p.x - t.lx); t.lx = p.x; }
  t.x = p.x; t.y = p.y;
});
function endTouch(e){
  const t = touches[e.pointerId];
  if(t && t.side === "look" && t.moved < 12) shoot();   // toque rápido = tiro
  delete touches[e.pointerId];
}
cv.addEventListener("pointerup", endTouch);
cv.addEventListener("pointercancel", e => { delete touches[e.pointerId]; });
function moveStick(){
  for(const id in touches){
    const t = touches[id]; if(t.side !== "move") continue;
    const dx = t.x - t.ox, dy = t.y - t.oy, max = 60;
    return {x:Math.max(-1, Math.min(1, dx / max)), y:Math.max(-1, Math.min(1, dy / max)), t};
  }
  return null;
}

// botão de atirar (celular): segurar = tiro contínuo
let firing = false;
const fireBtn = $("btnFire");
fireBtn.addEventListener("pointerdown", e => { e.preventDefault(); firing = true; shoot(); fireBtn.setPointerCapture && fireBtn.setPointerCapture(e.pointerId); });
["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => fireBtn.addEventListener(ev, () => { firing = false; }));

// ===== Som =====
let ac = null;
function sfx(kind){
  if(muted) return;
  try{
    if(!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const S = {shot:["sawtooth",700,120,0.12,0.06], hit:["square",400,250,0.06,0.05], boom:["sawtooth",200,50,0.3,0.08],
               hurt:["sawtooth",160,50,0.4,0.12], orb:["sine",300,500,0.2,0.04], level:["triangle",440,990,0.5,0.08]}[kind];
    if(!S) return;
    o.type = S[0]; o.frequency.setValueAtTime(S[1], t); o.frequency.exponentialRampToValueAtTime(S[2], t + S[3]);
    g.gain.setValueAtTime(S[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + S[3]);
    o.start(t); o.stop(t + S[3] + 0.02);
  }catch(e){}
}
function setMuteUI(){ $("btnSound").textContent = muted ? "🔇" : "🔊"; $("btnSound").setAttribute("aria-label", muted ? "Som desligado" : "Som ligado"); }
$("btnSound").addEventListener("click", () => { muted = !muted; setMuteUI(); try{ localStorage.setItem("corredor3d-mute", muted ? "1" : "0"); }catch(e){} });

// ===== Tiro =====
function lineOfSight(x0, y0, x1, y1){
  const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 0.1);
  for(let i = 1; i < steps; i++){ const f = i / steps; if(wall(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false; }
  return true;
}
function shoot(){
  if(state !== "play" || fireT > 0) return;
  fireT = 0.28; flash = 0.08; kick = 1; sfx("shot");
  let bestE = null, bestD = Infinity;
  for(const e of enemies){
    const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.hypot(dx, dy);
    let diff = Math.atan2(dy, dx) - pl.a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const half = Math.atan2(e.size * 0.45, d) * (IS_TOUCH ? 1.7 : 1);   // ajuda na mira no celular
    if(Math.abs(diff) < half && d < bestD && lineOfSight(pl.x, pl.y, e.x, e.y)){ bestD = d; bestE = e; }
  }
  if(bestE){
    bestE.hp--; bestE.hit = 0.15; sfx("hit");
    if(bestE.hp <= 0){
      bestE.dead = true; killsTotal++; sfx("boom");
      score += {virus:30, drone:20, hacker:50}[bestE.kind];
      enemies = enemies.filter(e => !e.dead);
      if(!enemies.length) levelDone();
    }
  }
}
function levelDone(){
  score += 200 * level; sfx("level");
  if(level >= LEVELS){ win(); return; }
  showMsg("Nível " + level + " limpo! +" + (200 * level), 1.8);
  setTimeout(() => { if(state === "play"){ nextLevel(); } }, 1600);
}

// ===== Fluxo =====
function start(){
  reset(); state = "play";
  ["startScreen", "overScreen", "pauseScreen"].forEach(id => $(id).hidden = true); $("hud").hidden = false; fireBtn.hidden = false;
  last = performance.now();
  if(ac && ac.state === "suspended") ac.resume();
}
function togglePause(){
  if(state === "play"){ state = "pause"; $("pauseScreen").hidden = false; for(const k in keys) keys[k] = false; if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
  else if(state === "pause"){ state = "play"; $("pauseScreen").hidden = true; last = performance.now(); }
}
function finish(won){
  state = "over"; firing = false; fireBtn.hidden = true;
  if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  if(won) score += Math.max(0, Math.round(600 - time * 2)) + pl.hp * 100;
  const rec = score > best;
  if(rec){ best = score; try{ localStorage.setItem("corredor3d-best", String(best)); }catch(e){} }
  $("overTitle").textContent = won ? "Servidor limpo!" : "Você foi desconectado!";
  $("overTag").textContent = rec ? "Novo recorde" : won ? "Vitória" : "Fim de jogo";
  $("overNote").textContent = won ? "Você eliminou todos os " + killsTotal + " invasores. A rede da escola está segura!" : "Os invasores te pegaram no nível " + level + ". Tente de novo!";
  $("overScore").textContent = score.toLocaleString("pt-BR");
  $("overLevel").textContent = level + "/" + LEVELS;
  $("overTime").textContent = Math.floor(time) + "s";
  $("overBest").textContent = "Recorde: " + best.toLocaleString("pt-BR");
  setTimeout(() => { $("overScreen").hidden = false; $("btnAgain").focus({preventScroll:true}); }, won ? 300 : 700);
}
function win(){ finish(true); }
$("btnPlay").addEventListener("click", start);
$("btnAgain").addEventListener("click", start);
$("btnPause").addEventListener("click", togglePause);
$("btnResume").addEventListener("click", togglePause);
document.addEventListener("visibilitychange", () => { if(document.hidden && state === "play") togglePause(); });

function hurt(){
  if(pl.inv > 0) return;
  pl.hp--; pl.inv = 0.9; hurtT = 0.4; sfx("hurt"); buzz(90);
  if(pl.hp <= 0) finish(false);
}

// ===== Atualização =====
function tryMove(o, nx, ny, r){
  if(!wall(nx + Math.sign(nx - o.x) * r, o.y)) o.x = nx;
  if(!wall(o.x, ny + Math.sign(ny - o.y) * r)) o.y = ny;
}
function update(dt){
  time += dt;
  if(fireT > 0) fireT -= dt;
  if(flash > 0) flash -= dt;
  if(hurtT > 0) hurtT -= dt;
  if(pl.inv > 0) pl.inv -= dt;
  if(kick > 0) kick = Math.max(0, kick - dt * 6);
  if(msgT > 0) msgT -= dt;

  // girar
  let turn = 0;
  if(keys["arrowleft"] || keys["q"]) turn -= 1;
  if(keys["arrowright"] || keys["e"]) turn += 1;
  const st = moveStick();
  if(st && Math.abs(st.x) > 0.25) turn += (st.x - Math.sign(st.x) * 0.25) * 1.3;
  pl.a += turn * 2.4 * dt + lookDX; lookDX = 0;

  // andar
  let fw = 0, sd = 0;
  if(keys["w"] || keys["arrowup"]) fw += 1;
  if(keys["s"] || keys["arrowdown"]) fw -= 1;
  if(keys["a"]) sd -= 1;
  if(keys["d"]) sd += 1;
  if(st) fw += -st.y;
  fw = Math.max(-1, Math.min(1, fw)); sd = Math.max(-1, Math.min(1, sd));
  const sp = 3 * dt, ca = Math.cos(pl.a), sa = Math.sin(pl.a);
  const nx = pl.x + (ca * fw - sa * sd) * sp, ny = pl.y + (sa * fw + ca * sd) * sp;
  tryMove(pl, nx, ny, 0.22);
  if(fw || sd) bob += dt * 10;

  if(keys[" "] || firing) shoot();

  // inimigos
  for(const e of enemies){
    e.t += dt; if(e.hit > 0) e.hit -= dt; if(e.bite > 0) e.bite -= dt;
    const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy);
    const sees = d < 9 && lineOfSight(e.x, e.y, pl.x, pl.y);
    let vx, vy;
    if(sees){
      if(e.kind === "hacker" && d < 4){ vx = -dy / d; vy = dx / d; }   // anda de lado
      else { vx = dx / d; vy = dy / d; }
      if(e.kind === "hacker"){
        e.fire -= dt;
        if(e.fire <= 0){ e.fire = rnd(1.6, 2.6); orbs.push({x:e.x, y:e.y, vx:dx / d * 3.2, vy:dy / d * 3.2, life:4}); sfx("orb"); }
      }
    } else {
      e.wander += rnd(-1, 1) * dt * 2;
      vx = Math.cos(e.wander) * 0.5; vy = Math.sin(e.wander) * 0.5;
    }
    const ox = e.x, oy = e.y;
    tryMove(e, e.x + vx * e.sp * dt, e.y + vy * e.sp * dt, 0.25);
    if(!sees && e.x === ox && e.y === oy) e.wander += Math.PI / 2;
    if(d < 0.55 && e.kind !== "hacker"){ hurt(); if(state !== "play") return; }
  }
  for(const o of orbs){
    o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
    if(wall(o.x, o.y)) o.life = 0;
    if(Math.hypot(o.x - pl.x, o.y - pl.y) < 0.3){ o.life = 0; hurt(); if(state !== "play") return; }
  }
  orbs = orbs.filter(o => o.life > 0);

  $("hudScore").textContent = score.toLocaleString("pt-BR");
  $("hudLevel").textContent = level + "/" + LEVELS;
  $("hudLeft").textContent = enemies.length;
  $("hudLives").textContent = "❤".repeat(Math.max(0, pl.hp)) + "♡".repeat(Math.max(0, 5 - Math.max(0, pl.hp)));
}

// ===== Desenho 3D (raycasting) =====
function render3D(){
  // teto e chão
  let g = bx.createLinearGradient(0, 0, 0, RH / 2);
  g.addColorStop(0, "#04102F"); g.addColorStop(1, "#0E2C78");
  bx.fillStyle = g; bx.fillRect(0, 0, RW, RH / 2);
  g = bx.createLinearGradient(0, RH / 2, 0, RH);
  g.addColorStop(0, "#081A4D"); g.addColorStop(1, "#12347F");
  bx.fillStyle = g; bx.fillRect(0, RH / 2, RW, RH / 2);

  const dirX = Math.cos(pl.a), dirY = Math.sin(pl.a);
  const planeL = Math.tan(FOV / 2), plX = -dirY * planeL, plY = dirX * planeL;
  const proj = (RW / 2) / planeL;   // altura da parede proporcional à largura da tela
  for(let x = 0; x < RW; x++){
    const cam = 2 * x / RW - 1;
    const rdx = dirX + plX * cam, rdy = dirY + plY * cam;
    let mx = Math.floor(pl.x), my = Math.floor(pl.y);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let stx, sty, sdx, sdy, side = 0;
    if(rdx < 0){ stx = -1; sdx = (pl.x - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - pl.x) * ddx; }
    if(rdy < 0){ sty = -1; sdy = (pl.y - my) * ddy; } else { sty = 1; sdy = (my + 1 - pl.y) * ddy; }
    for(let i = 0; i < 64; i++){
      if(sdx < sdy){ sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
      if(wall(mx, my)) break;
    }
    const dist = side === 0 ? (mx - pl.x + (1 - stx) / 2) / rdx : (my - pl.y + (1 - sty) / 2) / rdy;
    zbuf[x] = dist;
    const h = proj / Math.max(0.05, dist);
    const top = (RH - h) / 2;
    let wx = side === 0 ? pl.y + dist * rdy : pl.x + dist * rdx; wx -= Math.floor(wx);
    const fog = Math.max(0.18, 1 - dist / 11);
    const glass = ((mx * 7 + my * 13) % 5) === 0;
    const base = glass ? [30, 80, 170] : [27, 60, 143];
    const shade = side ? 0.78 : 1;
    bx.fillStyle = "rgb(" + Math.round(base[0] * fog * shade) + "," + Math.round(base[1] * fog * shade) + "," + Math.round(base[2] * fog * shade) + ")";
    bx.fillRect(x, top, 1, h);
    // gavetas do rack e luzes
    const edge = wx < 0.04 || wx > 0.96;
    if(edge){ bx.fillStyle = "rgba(94,194,255," + (0.6 * fog).toFixed(2) + ")"; bx.fillRect(x, top, 1, h); }
    else if(h > 6 && !LOW){
      bx.fillStyle = "rgba(4,16,47," + (0.55 * fog).toFixed(2) + ")";
      for(let k = 0; k < 5; k++) bx.fillRect(x, top + h * (0.12 + k * 0.16), 1, h * 0.05);
      if(wx > 0.12 && wx < 0.18){
        for(let k = 0; k < 5; k++){
          const on = ((mx + my + k + Math.floor(time * 3)) % 4) !== 0;
          bx.fillStyle = on ? (glass ? "#4BE3A1" : "#5EC2FF") : "#12347F";
          bx.globalAlpha = fog; bx.fillRect(x, top + h * (0.2 + k * 0.16), 1, Math.max(1, h * 0.03)); bx.globalAlpha = 1;
        }
      }
    }
  }

  // sprites (inimigos e tiros), do mais longe para o mais perto
  const list = enemies.map(e => ({o:e, spr:SPR[e.kind], size:e.size, lift:e.kind === "drone" ? -0.12 + Math.sin(e.t * 3) * 0.05 : 0.08}))
    .concat(orbs.map(o => ({o, spr:SPR.orb, size:0.35, lift:0})));
  for(const s of list) s.d = Math.hypot(s.o.x - pl.x, s.o.y - pl.y);
  list.sort((a, b) => b.d - a.d);
  const inv = 1 / (plX * dirY - dirX * plY);
  for(const s of list){
    const sx = s.o.x - pl.x, sy = s.o.y - pl.y;
    const tx = inv * (dirY * sx - dirX * sy), ty = inv * (-plY * sx + plX * sy);
    if(ty <= 0.1) continue;
    const scrX = Math.floor((RW / 2) * (1 + tx / ty));
    const sh = Math.abs(proj / ty) * s.size, sw = sh;
    const cy = RH / 2 + (proj / ty) * s.lift + (proj / ty) * (0.5 - s.size / 2) * 0.6;
    const x0 = Math.floor(scrX - sw / 2), x1 = Math.floor(scrX + sw / 2);
    const fog = Math.max(0.3, 1 - ty / 12);
    bx.globalAlpha = fog;
    for(let x = Math.max(0, x0); x < Math.min(RW, x1); x++){
      if(ty >= zbuf[x]) continue;
      const tex = Math.floor((x - x0) / sw * 64);
      bx.drawImage(s.spr, tex, 0, 1, 64, x, cy - sh / 2, 1, sh);
    }
    if(s.o.hit > 0){ bx.globalAlpha = 0.5; bx.fillStyle = "#FFFFFF"; for(let x = Math.max(0, x0); x < Math.min(RW, x1); x++) if(ty < zbuf[x]) bx.fillRect(x, cy - sh / 2, 1, sh); }
    bx.globalAlpha = 1;
  }
}

function drawWeapon(){
  const s = Math.min(W, H);
  const bobX = Math.cos(bob) * s * 0.012, bobY = Math.abs(Math.sin(bob)) * s * 0.015;
  const x = W / 2 + bobX + s * 0.06, y = H - s * 0.02 + bobY + kick * s * 0.04;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "#12347F"; ctx.beginPath(); ctx.moveTo(-s * 0.09, 0); ctx.lineTo(-s * 0.05, -s * 0.22); ctx.lineTo(s * 0.05, -s * 0.22); ctx.lineTo(s * 0.11, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#CFE6FF"; ctx.fillRect(-s * 0.035, -s * 0.34, s * 0.07, s * 0.16);
  ctx.fillStyle = "#5EC2FF"; ctx.fillRect(-s * 0.045, -s * 0.36, s * 0.09, s * 0.035);
  ctx.fillStyle = "#4BE3A1"; ctx.fillRect(-s * 0.02, -s * 0.16, s * 0.04, s * 0.02);
  if(flash > 0){
    ctx.fillStyle = "rgba(255,201,60,.9)"; ctx.beginPath(); ctx.arc(0, -s * 0.38, s * 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(0, -s * 0.38, s * 0.022, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawMinimap(){
  const cell = Math.max(4, Math.min(8, Math.min(W, H) / 70)), mw = MW * cell, mh = MH * cell;
  const ox = W - mw - 12, oy = 70;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#061541"; ctx.fillRect(ox - 3, oy - 3, mw + 6, mh + 6);
  for(let y = 0; y < MH; y++) for(let x = 0; x < MW; x++) if(MAP[y][x] === "#"){ ctx.fillStyle = "#2A55B8"; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
  ctx.fillStyle = "#FF6B7D";
  for(const e of enemies){ ctx.beginPath(); ctx.arc(ox + e.x * cell, oy + e.y * cell, cell * 0.4, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(ox + pl.x * cell, oy + pl.y * cell, cell * 0.5, 0, 7); ctx.fill();
  ctx.strokeStyle = "#FFC93C"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox + pl.x * cell, oy + pl.y * cell); ctx.lineTo(ox + (pl.x + Math.cos(pl.a) * 1.6) * cell, oy + (pl.y + Math.sin(pl.a) * 1.6) * cell); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTouchUI(){
  for(const id in touches){
    const t = touches[id];
    if(t.side === "move"){
      ctx.strokeStyle = "rgba(94,194,255,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.ox, t.oy, 60, 0, 7); ctx.stroke();
      const dx = Math.max(-60, Math.min(60, t.x - t.ox)), dy = Math.max(-60, Math.min(60, t.y - t.oy));
      ctx.fillStyle = "rgba(94,194,255,.45)"; ctx.beginPath(); ctx.arc(t.ox + dx, t.oy + dy, 26, 0, 7); ctx.fill();
    }
  }
}

function draw(){
  if(!pl){ ctx.fillStyle = "#061541"; ctx.fillRect(0, 0, W, H); return; }
  render3D();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  if(state !== "start"){
    // mira
    const c = 12;
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - c, H / 2); ctx.lineTo(W / 2 - 4, H / 2); ctx.moveTo(W / 2 + 4, H / 2); ctx.lineTo(W / 2 + c, H / 2);
    ctx.moveTo(W / 2, H / 2 - c); ctx.lineTo(W / 2, H / 2 - 4); ctx.moveTo(W / 2, H / 2 + 4); ctx.lineTo(W / 2, H / 2 + c); ctx.stroke();
    drawWeapon();
    drawMinimap();
    if(state === "play") drawTouchUI();
    if(msgT > 0){
      ctx.globalAlpha = Math.min(1, msgT * 2);
      ctx.font = "900 " + Math.round(Math.min(W * 0.06, 34)) + "px Archivo, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "#061541"; ctx.strokeText(msg, W / 2, H * 0.3); ctx.fillStyle = "#FFFFFF"; ctx.fillText(msg, W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }
    if(time < 5 && state === "play" && ("ontouchstart" in window)){
      ctx.font = "700 13px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.textAlign = "center";
      ctx.fillText("← arraste aqui para andar", W * 0.22, H * 0.86);
      ctx.fillText("arraste aqui para girar →", W * 0.72, H * 0.62);
    }
  }
  if(hurtT > 0){ ctx.fillStyle = "rgba(255,107,125," + (hurtT).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
}

let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if(state === "play"){ update(dt); perfTick(dt); }
  if(state === "start"){ pl.a += dt * 0.25; time += dt; }
  if(state !== "pause") draw();
}

setMuteUI();
$("bestStart").textContent = "Recorde: " + best.toLocaleString("pt-BR");
new ResizeObserver(resize).observe(stage);
reset();
resize();
requestAnimationFrame(loop);
})();
