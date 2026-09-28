import * as THREE from './vendor/three.module.js';
import { Movement } from './movement.js';
import { createEnvironment, createAvatar } from './environment.js';

const $ = id => document.getElementById(id);
const world = $('world'), loading = $('loading');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  loading.textContent = '3D 화면을 열 수 없어요. 브라우저의 그래픽 가속을 켜고 다시 열어 주세요.';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
world.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .08, 220);
const environment = createEnvironment(scene);
const avatar = createAvatar(scene);
const player = new Movement(environment.colliders);
const coarsePointer = matchMedia('(pointer:coarse)').matches;
const keys = new Set();
let started = false, paused = true, locked = false, firstPerson = false;
let yaw = .16, pitch = .29, cameraDistance = 7.4, phase = 0, previousTime = 0, accumulator = 0;
let touchX = 0, touchZ = 0, touchSprint = false, dragging = null, toastTimer;
const focus = new THREE.Vector3(), desired = new THREE.Vector3(), offset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const input = { x: 0, z: 0, sprint: false };

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function clearInput() { keys.clear(); touchX = touchZ = 0; dragging = null; $('stick').style.transform = ''; }
function capturePointer(element, pointerId) {
  // Embedded browsers can reject capture while pointer lock is changing.
  try { element.setPointerCapture(pointerId); } catch { /* Dragging still works inside the play area. */ }
}
function setPaused(value) {
  paused = value; clearInput(); accumulator = 0;
  $('resume').hidden = !value || !started || $('help-dialog').open;
  if (value && document.pointerLockElement) document.exitPointerLock();
}
async function lockMouse() {
  if (coarsePointer || document.pointerLockElement) return;
  try {
    if (!renderer.domElement.requestPointerLock) throw new Error('unsupported');
    await renderer.domElement.requestPointerLock();
  } catch {
    notify('마우스를 누른 채 움직여 둘러보세요. Q · E 키로도 회전할 수 있어요.');
  }
}
function play() {
  started = true; setPaused(false); $('welcome').hidden = true;
  world.focus({ preventScroll: true }); void lockMouse();
}
function setView(mode) {
  firstPerson = mode === 'first';
  $('view-label').textContent = firstPerson ? '1인칭' : '3인칭';
  $('view-button').setAttribute('aria-label', `${firstPerson ? '1인칭' : '3인칭'} 사용 중, 시점 전환`);
  $('crosshair').hidden = !firstPerson; avatar.root.visible = !firstPerson;
  updateCamera(1, true);
}
function resetPosition() {
  player.reset(); yaw = .16; pitch = .29; clearInput();
  updateCamera(1, true); updateHUD(); notify('시작의 들판으로 돌아왔어요.');
}
$('play-button').addEventListener('click', play);
$('resume-button').addEventListener('click', play);
$('view-button').addEventListener('click', () => { setView(firstPerson ? 'third' : 'first'); world.focus(); });
$('reset-button').addEventListener('click', resetPosition);
$('help-button').addEventListener('click', () => {
  $('help-dialog').showModal(); setPaused(true);
});
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('close', () => { $('resume').hidden = !started; });
document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked; locked = document.pointerLockElement === renderer.domElement;
  document.querySelector('.mouse-guide').textContent = locked ? '마우스 시점 · Esc 쉬기' : '마우스 드래그 · 시점';
  if (wasLocked && !locked) setPaused(true);
});
document.addEventListener('pointerlockerror', () => {
  if (started && !paused) notify('마우스 드래그 또는 Q · E 키로 둘러보세요.');
});
document.addEventListener('keydown', event => {
  if ($('help-dialog').open) return;
  if (event.code === 'Escape') { if (started && !locked) setPaused(!paused); return; }
  if (event.code === 'Enter' && !started) { play(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyV') setView(firstPerson ? 'third' : 'first');
  if (event.code === 'KeyR') resetPosition();
  if (!started || paused) return;
  keys.add(event.code);
  if (event.code === 'Space') player.jump();
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { if (started) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });
function look(dx, dy) {
  yaw -= dx * .0027;
  pitch = THREE.MathUtils.clamp(pitch + dy * .0024, firstPerson ? -1.25 : -.2, 1.25);
}
document.addEventListener('mousemove', event => { if (locked && !paused) look(event.movementX, event.movementY); });
world.addEventListener('contextmenu', event => event.preventDefault());
world.addEventListener('pointerdown', event => {
  if (!started || paused || locked) return;
  dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, type: event.pointerType, button: event.button };
  capturePointer(world, event.pointerId); world.focus();
});
world.addEventListener('pointermove', event => {
  if (locked || paused || !dragging || event.pointerId !== dragging.id) return;
  const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
  dragging.moved += Math.abs(dx) + Math.abs(dy); look(dx, dy);
  dragging.x = event.clientX; dragging.y = event.clientY;
});
window.addEventListener('pointerup', event => {
  if (!dragging || event.pointerId !== dragging.id) return;
  const click = dragging.moved < 5 && dragging.type === 'mouse' && dragging.button === 0;
  dragging = null;
  if (world.hasPointerCapture(event.pointerId)) world.releasePointerCapture(event.pointerId);
  if (click) void lockMouse();
});
world.addEventListener('pointercancel', () => { dragging = null; });
world.addEventListener('wheel', event => {
  event.preventDefault();
  if (firstPerson && event.deltaY > 0) { cameraDistance = 2.5; setView('third'); }
  else if (!firstPerson) {
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * .008, 1.5, 13);
    if (cameraDistance <= 1.5) setView('first');
  }
}, { passive: false });

// Touch uses the same motion state and collision solver as keyboard input.
const joystick = $('joystick'); let stickPointer = null;
function moveStick(event) {
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy), scale = Math.min(36, length) / (length || 1);
  touchX = dx * scale / 36; touchZ = dy * scale / 36;
  $('stick').style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
joystick.addEventListener('pointerdown', event => {
  if (!started || paused) return;
  stickPointer = event.pointerId; capturePointer(joystick, event.pointerId); moveStick(event);
});
joystick.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) moveStick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, () => {
  stickPointer = null; touchX = touchZ = 0; $('stick').style.transform = '';
});
$('touch-jump').addEventListener('pointerdown', event => { event.preventDefault(); if (started && !paused) player.jump(); });
$('touch-run').addEventListener('click', () => { touchSprint = !touchSprint; $('touch-run').setAttribute('aria-pressed', String(touchSprint)); });
function updateInput(dt) {
  if (keys.has('KeyQ')) yaw += 1.8 * dt;
  if (keys.has('KeyE')) yaw -= 1.8 * dt;
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchX;
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - touchZ;
  input.x = sideways * Math.cos(yaw) - forward * Math.sin(yaw);
  input.z = -sideways * Math.sin(yaw) - forward * Math.cos(yaw);
  input.sprint = touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight');
}
function safeCameraPosition(target, candidate) {
  offset.copy(candidate).sub(target);
  const length = offset.length();
  if (length < .01) return;
  raycaster.set(target, offset.multiplyScalar(1 / length));
  raycaster.far = length + .25;
  const hit = raycaster.intersectObjects(environment.cameraSurfaces, false)[0];
  if (hit && hit.distance < length + .22) candidate.copy(target).addScaledVector(offset, Math.max(.15, hit.distance - .28));
}
function updateCamera(dt, immediate = false) {
  if (firstPerson) {
    camera.position.set(player.x, player.y + 1.76, player.z);
    desired.set(player.x - Math.sin(yaw) * Math.cos(pitch), player.y + 1.76 - Math.sin(pitch), player.z - Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(desired); return;
  }
  focus.set(player.x, player.y + 1.22, player.z);
  desired.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cameraDistance).add(focus);
  safeCameraPosition(focus, desired);
  if (immediate) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.exp(-14 * dt));
  safeCameraPosition(focus, camera.position);
  camera.lookAt(focus);
}
function animateAvatar(dt, time) {
  const speed = Math.hypot(player.vx, player.vz);
  avatar.root.position.set(player.x, player.y, player.z);
  if (speed > .15) {
    const angle = Math.atan2(player.vx, player.vz);
    const delta = Math.atan2(Math.sin(angle - avatar.root.rotation.y), Math.cos(angle - avatar.root.rotation.y));
    avatar.root.rotation.y += delta * (1 - Math.exp(-16 * dt));
  }
  if (!paused) phase += dt * speed * 2.3;
  const stride = Math.min(speed / 6, .85);
  avatar.body.position.y = player.grounded ? Math.abs(Math.sin(phase)) * .045 * stride : .035;
  avatar.body.rotation.z = player.grounded ? Math.sin(phase * .5) * .02 * stride : 0;
  avatar.legs.forEach((leg, i) => { leg.rotation.x = player.grounded ? Math.sin(phase + i * Math.PI) * stride : (i === 0 ? -.5 : .3); });
  avatar.arms.forEach((arm, i) => { arm.rotation.x = player.grounded ? -Math.sin(phase + i * Math.PI) * stride * .7 : -.75; arm.rotation.z = (i === 0 ? 1 : -1) * (.05 + Math.sin(time * 1.6) * .025); });
}
function updateHUD() {
  $('coordinates').textContent = `${player.x.toFixed(0)} / ${(-player.z).toFixed(0)}`;
  const speed = Math.hypot(player.vx, player.vz);
  $('motion-state').textContent = paused && started ? '잠시 쉬는 중' : !player.grounded ? (player.vy > 0 ? '뛰어오르는 중' : '내려오는 중') : speed > 6 ? '달리는 중' : speed > .2 ? '걷는 중' : '가만히 서 있는 중';
}
let hudTime = 0;
function frame(milliseconds) {
  const time = milliseconds * .001, dt = Math.min(time - (previousTime || time), .08); previousTime = time;
  if (!paused) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      updateInput(1 / 120); player.update(1 / 120, input); accumulator -= 1 / 120;
    }
  }
  animateAvatar(dt, time); updateCamera(dt);
  environment.clouds.forEach((cloud, i) => { cloud.position.x += dt * (.15 + i * .01); if (cloud.position.x > 110) cloud.position.x = -110; });
  environment.sunlight.position.set(player.x - 28, 42, player.z + 22);
  environment.sunlight.target.position.set(player.x, 0, player.z);
  if (time - hudTime > .12) { updateHUD(); hudTime = time; }
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault(); setPaused(true); loading.textContent = '그래픽 연결이 끊겼어요. 새로고침하면 다시 시작할 수 있어요.'; loading.hidden = false;
});
updateCamera(1, true); animateAvatar(0, 0); renderer.render(scene, camera);
loading.hidden = true; $('welcome').hidden = false;
requestAnimationFrame(frame);

// Optional WebMCP support: these call the same actions as the visible controls.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const state = () => ({
    position: { x: +player.x.toFixed(3), y: +player.y.toFixed(3), z: +player.z.toFixed(3) },
    grounded: player.grounded, view: firstPerson ? 'first' : 'third',
    paused, started,
  });
  const validateEmpty = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error('Expected an empty object.');
  };
  const tools = [
    { name: 'get_player_state', title: '캐릭터 상태 확인', description: 'Read the current position, camera perspective and play state.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) { validateEmpty(input); return state(); } },
    { name: 'set_camera_view', title: '1·3인칭 선택', description: 'Switch between first-person and third-person camera, matching the V control.',
      inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['first', 'third'] } }, required: ['view'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !['first', 'third'].includes(input.view) || Object.keys(input).some(k => k !== 'view')) throw new Error('view must be first or third.');
        setView(input.view); return state();
      } },
    { name: 'reset_player_position', title: '시작 위치로 돌아가기', description: 'Return the character to the starting field and stop movement, matching the R control.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); resetPosition(); return state(); } },
  ];
  for (const tool of tools) {
    try { void Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Browsers without the proposed API still play normally. */ }
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
