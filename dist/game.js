import * as THREE from './vendor/three.module.js';
import { Movement } from './movement.js';
import { createEnvironment, createAvatar } from './environment.js';
import { Hunting } from './combat.js';
import { HuntingView } from './hunting-view.js';
import { WARRIOR_SKILLS } from './warrior.js';
import { WarriorView } from './warrior-view.js';

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
const hunting = new Hunting(environment.colliders);
const huntingView = new HuntingView(scene, camera, avatar, hunting, environment);
const warrior = hunting.warrior;
const warriorView = new WarriorView(scene, camera, avatar, warrior);
const coarsePointer = matchMedia('(pointer:coarse)').matches;
const keys = new Set();
let started = false, paused = true, locked = false, firstPerson = false;
let yaw = .16, pitch = .29, cameraDistance = 7.4, phase = 0, previousTime = 0, accumulator = 0;
let touchX = 0, touchZ = 0, touchSprint = false, dragging = null, toastTimer;
let drawOwner = null, mouseDrawPosition = null, touchDrawPointer = null;
const focus = new THREE.Vector3(), desired = new THREE.Vector3(), offset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const input = { x: 0, z: 0, sprint: false };
const floatingHits = [];
let hitFeedback = 0;
let cameraShake = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function clearInput() { cancelBowDraw(); warrior.queued = null; keys.clear(); touchX = touchZ = 0; dragging = null; $('stick').style.transform = ''; }
function capturePointer(element, pointerId) {
  // Embedded browsers can reject capture while pointer lock is changing.
  try { element.setPointerCapture(pointerId); } catch { /* Dragging still works inside the play area. */ }
}
function setPaused(value) {
  paused = value; clearInput(); accumulator = 0;
  $('resume').hidden = !value || !started || $('help-dialog').open || hunting.hp <= 0;
  if (value && document.pointerLockElement) document.exitPointerLock();
}
async function lockMouse() {
  if (coarsePointer || document.pointerLockElement) return;
  try {
    if (!renderer.domElement.requestPointerLock) throw new Error('unsupported');
    await renderer.domElement.requestPointerLock();
  } catch {
    notify('우클릭 드래그로 시점 회전 · 1~4 전사 기술 · 좌클릭 기본 공격');
  }
}
function play() {
  if (hunting.hp <= 0) return;
  started = true; setPaused(false); $('welcome').hidden = true;
  $('crosshair').hidden = false;
  world.focus({ preventScroll: true }); void lockMouse();
}
function setView(mode) {
  firstPerson = mode === 'first';
  $('view-label').textContent = firstPerson ? '1인칭' : '3인칭';
  $('view-button').setAttribute('aria-label', `${firstPerson ? '1인칭' : '3인칭'} 사용 중, 시점 전환`);
  $('crosshair').hidden = !started; avatar.root.visible = !firstPerson;
  updateCamera(1, true);
}
function resetPosition() {
  const reviving = hunting.hp <= 0;
  player.reset(); yaw = .16; pitch = .29; clearInput();
  hunting.restorePlayer(); avatar.root.rotation.y = Math.PI;
  $('defeat').hidden = true;
  if (reviving && started) setPaused(false);
  updateCamera(1, true); updateHUD(); notify('시작 위치에서 체력을 회복했어요.');
}
function equipWeapon(weapon) {
  cancelBowDraw();
  if (warrior.active && weapon !== hunting.weapon) player.vx = player.vz = 0;
  hunting.equip(weapon);
  document.body.dataset.weapon = weapon;
  const bow = weapon === 'bow', axe = weapon === 'axe';
  for (const [id, selected] of [['axe-button', axe], ['sword-button', weapon === 'sword'], ['bow-button', bow]]) {
    $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected));
  }
  $('weapon-name').textContent = axe ? '양손 도끼' : bow ? '들판의 활' : '여행자의 칼';
  $('weapon-hint').textContent = axe ? '좌클릭 / F 기본 공격 · 1~4 기술' : bow ? '좌클릭 / F 꾹 당기기 · 놓으면 발사' : '클릭 / F · 가까이서 베기';
  $('warrior-hud').hidden = !axe;
  $('touch-attack').textContent = bow ? '당기기' : '공격';
  $('touch-attack').setAttribute('aria-label', bow ? '누르고 활 당기기, 놓으면 발사' : axe ? '도끼 기본 공격' : '칼로 공격');
  if (bow && pitch > .10) pitch = .08;
  updateCamera(1, true); world.focus({ preventScroll: true });
}
function attack() {
  if (!started || paused || hunting.hp <= 0) return false;
  const aim = huntingView.aim();
  const attacked = hunting.attack(player, { x: -Math.sin(yaw), y: aim.direction.y, z: -Math.cos(yaw) }, aim.point);
  if (attacked) avatar.root.rotation.y = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  else if (hunting.weapon === 'axe' && warrior.planted && !warrior.active) notify('3번 날아차기 또는 4번 가로베기로 이어 가세요.');
  return attacked;
}
function useWarriorSkill(skill, showHint = true) {
  const result = !started || paused ? { accepted: false, reason: '플레이를 시작하거나 이어 가세요.' }
    : warrior.request(skill, player, { x: -Math.sin(yaw), z: -Math.cos(yaw) });
  if (!result.accepted && showHint) notify(result.reason);
  if (result.accepted) updateWarriorHUD();
  return result;
}
function beginBowDraw(owner) {
  if (!started || paused || drawOwner || !hunting.beginDraw()) return false;
  drawOwner = owner;
  return true;
}
function clearDrawOwner() {
  drawOwner = null; mouseDrawPosition = null;
  const pointer = touchDrawPointer; touchDrawPointer = null;
  if (pointer !== null && $('touch-attack').hasPointerCapture(pointer)) $('touch-attack').releasePointerCapture(pointer);
}
function cancelBowDraw() { clearDrawOwner(); hunting.cancelDraw(); }
function releaseBowDraw(owner) {
  if (drawOwner !== owner) return false;
  clearDrawOwner();
  if (!started || paused || hunting.hp <= 0) { hunting.cancelDraw(); return false; }
  // Aim at release, so the player can track a moving target while drawing.
  updateCamera(1, true);
  const aim = huntingView.aim();
  return hunting.releaseDraw(player, { x: -Math.sin(yaw), y: aim.direction.y, z: -Math.cos(yaw) }, aim.point);
}
$('sword-button').addEventListener('click', () => equipWeapon('sword'));
$('bow-button').addEventListener('click', () => equipWeapon('bow'));
$('axe-button').addEventListener('click', () => equipWeapon('axe'));
for (const skill of WARRIOR_SKILLS) $('skill-' + skill.id).addEventListener('click', () => { useWarriorSkill(skill.id); world.focus({ preventScroll: true }); });
$('revive-button').addEventListener('click', () => { resetPosition(); play(); });
$('play-button').addEventListener('click', play);
$('resume-button').addEventListener('click', play);
$('view-button').addEventListener('click', () => { setView(firstPerson ? 'third' : 'first'); world.focus(); });
$('reset-button').addEventListener('click', resetPosition);
$('help-button').addEventListener('click', () => {
  $('help-dialog').showModal(); setPaused(true);
});
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('close', () => { $('resume').hidden = !started || hunting.hp <= 0; });
document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked; locked = document.pointerLockElement === renderer.domElement;
  document.querySelector('.mouse-guide').textContent = locked ? '마우스 시점 · Esc 쉬기' : '우클릭 드래그 · 시점';
  if (wasLocked && !locked) setPaused(true);
});
document.addEventListener('pointerlockerror', () => {
  if (started && !paused) notify('우클릭 드래그 또는 Q · E로 시점 회전 · 1~4 전사 기술');
});
document.addEventListener('keydown', event => {
  if ($('help-dialog').open) return;
  if (event.code === 'Escape') { if (started && !locked && hunting.hp > 0) setPaused(!paused); return; }
  if (event.code === 'Enter' && !started) { play(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyV') setView(firstPerson ? 'third' : 'first');
  if (event.code === 'KeyR') resetPosition();
  if (event.code === 'KeyZ') equipWeapon('axe');
  if (event.code === 'KeyX') equipWeapon('sword');
  if (event.code === 'KeyC') equipWeapon('bow');
  if (!started || paused) return;
  const skill = WARRIOR_SKILLS.find(s => event.code === 'Digit' + s.key);
  if (skill) { event.preventDefault(); useWarriorSkill(skill.id); return; }
  keys.add(event.code);
  if (event.code === 'Space') player.jump();
  if (event.code === 'KeyF') { if (hunting.weapon === 'bow') beginBowDraw('keyboard'); else attack(); }
});
document.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'KeyF') releaseBowDraw('keyboard');
});
window.addEventListener('blur', () => { if (started) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });
function look(dx, dy) {
  yaw -= dx * .0027;
  pitch = THREE.MathUtils.clamp(pitch + dy * .0024, firstPerson ? -1.25 : -.2, 1.25);
}
document.addEventListener('mousemove', event => {
  if (paused) return;
  if (locked) look(event.movementX, event.movementY);
  if (drawOwner !== 'mouse') return;
  if (!(event.buttons & 1)) { cancelBowDraw(); return; }
  if (!locked && !dragging && mouseDrawPosition) look(event.clientX - mouseDrawPosition.x, event.clientY - mouseDrawPosition.y);
  mouseDrawPosition = { x: event.clientX, y: event.clientY };
});
world.addEventListener('contextmenu', event => event.preventDefault());
// Mouse up is separate from pointer up: releasing left must fire even if right is still held.
world.addEventListener('mousedown', event => {
  if (event.button !== 0 || hunting.weapon !== 'bow') return;
  event.preventDefault(); world.focus({ preventScroll: true });
  if (beginBowDraw('mouse')) mouseDrawPosition = { x: event.clientX, y: event.clientY };
});
window.addEventListener('mouseup', event => {
  if (event.button === 0) releaseBowDraw('mouse');
  if (dragging?.type === 'mouse' && dragging.button === event.button && event.button !== 0) {
    const id = dragging.id; dragging = null;
    if (world.hasPointerCapture(id)) world.releasePointerCapture(id);
  }
});
world.addEventListener('pointerdown', event => {
  if (!started || paused) return;
  if (event.pointerType === 'mouse' && event.button === 0 && hunting.weapon === 'bow') return;
  if (locked) { if (event.button === 0) attack(); return; }
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
  if (event.pointerId === touchDrawPointer) { releaseBowDraw(`touch:${event.pointerId}`); return; }
  if (!dragging || event.pointerId !== dragging.id) return;
  const click = dragging.moved < 5 && dragging.type === 'mouse' && dragging.button === 0;
  dragging = null;
  if (world.hasPointerCapture(event.pointerId)) world.releasePointerCapture(event.pointerId);
  if (click) attack();
});
window.addEventListener('pointercancel', event => {
  if (event.pointerId === touchDrawPointer || (event.pointerType === 'mouse' && drawOwner === 'mouse')) cancelBowDraw();
  if (dragging?.id === event.pointerId) dragging = null;
});
world.addEventListener('lostpointercapture', event => { if (dragging?.id === event.pointerId) dragging = null; });
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
$('touch-attack').addEventListener('pointerdown', event => {
  event.preventDefault();
  if (hunting.weapon !== 'bow') { attack(); return; }
  if (beginBowDraw(`touch:${event.pointerId}`)) {
    touchDrawPointer = event.pointerId; capturePointer($('touch-attack'), event.pointerId);
  }
});
$('touch-attack').addEventListener('lostpointercapture', event => { if (event.pointerId === touchDrawPointer) cancelBowDraw(); });
$('touch-run').addEventListener('click', () => { touchSprint = !touchSprint; $('touch-run').setAttribute('aria-pressed', String(touchSprint)); });
function updateInput(dt) {
  if (keys.has('KeyQ')) yaw += 1.8 * dt;
  if (keys.has('KeyE')) yaw -= 1.8 * dt;
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchX;
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - touchZ;
  input.x = sideways * Math.cos(yaw) - forward * Math.sin(yaw);
  input.z = -sideways * Math.sin(yaw) - forward * Math.cos(yaw);
  input.sprint = touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight');
  warrior.movement(input, player);
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
    const a = warrior.active, lift = a?.id === 'kick' ? Math.sin(a.elapsed/a.duration*Math.PI)*.34 : 0;
    camera.position.set(player.x, player.y + 1.76 + lift, player.z);
    desired.set(player.x - Math.sin(yaw) * Math.cos(pitch), player.y + 1.76 + lift - Math.sin(pitch), player.z - Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(desired); return;
  }
  focus.set(player.x, player.y + 1.22, player.z);
  desired.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cameraDistance).add(focus);
  const bow = hunting.weapon === 'bow';
  if (bow) { focus.y += .22; desired.y += .22; desired.x += Math.cos(yaw) * .68; desired.z -= Math.sin(yaw) * .68; }
  safeCameraPosition(focus, desired);
  if (immediate) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.exp(-14 * dt));
  safeCameraPosition(focus, camera.position);
  if (bow) camera.lookAt(camera.position.x - Math.sin(yaw) * Math.cos(pitch) * 30, camera.position.y - Math.sin(pitch) * 30, camera.position.z - Math.cos(yaw) * Math.cos(pitch) * 30);
  else camera.lookAt(focus);
}
function animateAvatar(dt, time) {
  const speed = Math.hypot(player.vx, player.vz);
  avatar.root.position.set(player.x, player.y, player.z);
  avatar.body.position.x = avatar.body.position.z = 0; avatar.body.rotation.x = avatar.body.rotation.y = 0;
  avatar.legs.forEach(leg => { leg.rotation.z = 0; });
  if (warrior.active || warrior.planted) {
    const facing = warrior.active ?? warrior.planted; avatar.root.rotation.y = Math.atan2(facing.dx, facing.dz);
  } else if (hunting.weapon === 'bow' || hunting.swing > 0) {
    avatar.root.rotation.y = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  } else if (speed > .15) {
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
function updateWarriorHUD() {
  $('critical-opening').hidden = !started || !hunting.entities.some(e => e.alive && e.offBalance > 0 && Math.hypot(e.x - player.x, e.z - player.z) < 18);
  const a = warrior.active;
  const progress = a ? a.elapsed / a.duration : 0;
  const phaseLabels = {
    charge: '돌파', slam: progress < .35 ? '들어올리기' : progress < .56 ? '내려찍기' : '도끼 고정',
    kick: progress < .38 ? '도약' : progress < .68 ? '발차기' : '착지',
    sweep: progress < .23 ? '뽑기' : progress < .73 ? '가로 베기' : '마무리',
  };
  for (const skill of WARRIOR_SKILLS) {
    const button = $('skill-' + skill.id), remaining = warrior.cooldowns[skill.id];
    const needsAxe = ['kick','sweep'].includes(skill.id) && !warrior.planted;
    const usedKick = skill.id === 'kick' && warrior.planted?.kicked;
    const recoverFirst = ['charge','slam'].includes(skill.id) && warrior.planted;
    const active = a?.id === skill.id, queued = warrior.queued?.id === skill.id;
    button.classList.toggle('active', active); button.classList.toggle('queued', queued);
    button.classList.toggle('unavailable', remaining > 0 || needsAxe || usedKick || recoverFirst);
    button.style.setProperty('--cooldown', `${remaining / skill.cooldown * 100}%`);
    $('skill-state-' + skill.id).textContent = active ? phaseLabels[skill.id] : queued ? '다음 동작' : remaining > 0 ? `${remaining.toFixed(1)}초` : usedKick ? '4번으로 마무리' : recoverFirst ? '도끼 회수 후' : needsAxe ? '내려찍기 후' : '준비';
  }
  const name = WARRIOR_SKILLS.find(s => s.id === a?.id)?.name;
  $('combo-title').textContent = name ?? (a?.id === 'slash' ? '기본 베기' : warrior.planted ? '도끼가 박혔어요' : '양손 도끼 전사');
  $('combo-hint').textContent = warrior.queued ? `${WARRIOR_SKILLS.find(s=>s.id===warrior.queued.id).name} 예약됨`
    : a ? { charge: '2 내려찍기를 미리 눌러 이어 가세요', slam: '3 날아차기 또는 4 가로베기로 연계', kick: '4 가로베기를 미리 눌러 마무리', sweep: '도끼를 뽑으며 전방을 크게 베기', slash: '기본 공격 중' }[a.id]
    : warrior.planted ? `${warrior.planted.kicked ? '4 가로베기' : '3 날아차기 → 4 가로베기'} · ${warrior.planted.remaining.toFixed(1)}초 안에 연계`
    : '1 돌진 → 2 내려찍기 → 3 날아차기 → 4 가로베기';
  $('combo-progress').style.width = `${a ? a.elapsed / a.duration * 100 : warrior.planted ? warrior.planted.remaining / 3.4 * 100 : 0}%`;
}
function updateHUD() {
  $('coordinates').textContent = `${player.x.toFixed(0)} / ${(-player.z).toFixed(0)}`;
  const speed = Math.hypot(player.vx, player.vz);
  $('motion-state').textContent = paused && started ? '잠시 쉬는 중' : !player.grounded ? (player.vy > 0 ? '뛰어오르는 중' : '내려오는 중') : speed > 6 ? '달리는 중' : speed > .2 ? '걷는 중' : '가만히 서 있는 중';
  const hp = Math.ceil(hunting.hp);
  $('health-value').textContent = `${hp} / 100`;
  $('health-fill').style.width = `${hp}%`; $('health-meter').setAttribute('aria-valuenow', String(hp));
  $('health-fill').style.background = hp < 30 ? '#ed9984' : '#b3dc94';
  $('rabbit-count').textContent = hunting.kills.rabbit; $('slime-count').textContent = hunting.kills.slime;
  const aim = huntingView.aim();
  const target = hunting.entities.find(e => e.id === aim.entity && e.alive);
  $('target-info').hidden = !target || !started;
  $('crosshair').classList.toggle('on-target', !!target);
  if (target) { $('target-name').textContent = target.kind === 'rabbit' ? '들토끼' : ['초록 슬라임', '파랑 슬라임', '보라 슬라임'][target.variant]; $('target-health').textContent = `${target.hp} / ${target.maxHp}`; $('target-opening').hidden = target.offBalance <= 0; }
  updateWarriorHUD();
}
function handleCombatEvents() {
  for (const event of hunting.events.splice(0)) {
    if (event.type === 'hit') {
      hitFeedback = event.critical ? .3 : .18;
      const el = document.createElement('span'); el.className = event.critical ? 'damage-number critical' : 'damage-number'; el.textContent = event.critical ? `치명타 ${event.damage}` : event.damage; $('combat-fx').appendChild(el);
      floatingHits.push({ el, position: new THREE.Vector3(event.x, event.y + .25, event.z), life: event.critical ? 1.15 : .85 });
      huntingView.particleBurst(event.critical ? { ...event, kind: 'impact' } : event);
    } else if (event.type === 'off-balance') {
      const el = document.createElement('span'); el.className = 'damage-number off-balance'; el.textContent = '비틀거림'; $('combat-fx').appendChild(el);
      floatingHits.push({ el, position: new THREE.Vector3(event.x, event.y + .8, event.z), life: 1 });
    } else if (event.type === 'warrior-impact') {
      warriorView.effect(event); huntingView.particleBurst({ ...event, y: event.y + .2, kind: 'impact' });
      if (!reduceMotion) cameraShake = event.skill === 'slam' ? .065 : .032;
    } else if (event.type === 'swing') huntingView.swingEffect(event);
    else if (['defeat', 'impact', 'spawn'].includes(event.type)) huntingView.particleBurst(event);
    else if (event.type === 'player-defeat') { setPaused(true); $('defeat').hidden = false; $('resume').hidden = true; }
  }
}
function combatFeedback(dt) {
  if (!paused) hitFeedback = Math.max(0, hitFeedback - dt);
  $('crosshair').classList.toggle('hit', hitFeedback > 0);
  $('damage-flash').style.opacity = String(hunting.hurt * 2);
  $('cooldown-fill').style.width = `${Math.max(0, 1 - hunting.cooldown / (hunting.weapon === 'bow' ? .45 : hunting.weapon === 'axe' ? .62 : .43)) * 100}%`;
  const charge = Math.round(hunting.charge * 100);
  $('bow-charge').hidden = !hunting.drawing || paused;
  $('bow-charge').classList.toggle('ready', charge === 100);
  $('charge-meter').setAttribute('aria-valuenow', String(charge));
  $('charge-fill').style.width = `${charge}%`;
  $('charge-label').textContent = charge === 100 ? '가득 당김 · 놓으면 발사' : `당기는 중 ${charge}% · 놓으면 발사`;
  $('crosshair').classList.toggle('drawing', hunting.drawing);
  $('crosshair').classList.toggle('charged', hunting.drawing && charge === 100);
  for (let i = floatingHits.length - 1; i >= 0; i--) {
    const hit = floatingHits[i]; if (!paused) { hit.life -= dt; hit.position.y += dt * .8; }
    const point = hit.position.clone().project(camera);
    hit.el.style.left = `${(point.x + 1) * innerWidth / 2}px`; hit.el.style.top = `${(1 - point.y) * innerHeight / 2}px`;
    hit.el.style.opacity = String(point.z > 1 ? 0 : Math.min(1, hit.life * 2));
    if (hit.life <= 0) { hit.el.remove(); floatingHits.splice(i, 1); }
  }
}
let hudTime = 0;
function frame(milliseconds) {
  const time = milliseconds * .001, dt = Math.min(time - (previousTime || time), .08); previousTime = time;
  if (!paused) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      updateInput(1 / 120); player.update(1 / 120, input); hunting.update(1 / 120, player); accumulator -= 1 / 120;
      if (hunting.hp <= 0) break;
    }
  }
  animateAvatar(dt, time); updateCamera(dt);
  handleCombatEvents(); huntingView.update(dt, firstPerson, avatar, paused); warriorView.update(dt, firstPerson, player, paused); combatFeedback(dt);
  if (!paused) { cameraShake *= Math.exp(-18 * dt); camera.position.x += Math.sin(time * 61) * cameraShake; camera.position.y += Math.cos(time * 47) * cameraShake * .65; }
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
equipWeapon('axe'); updateCamera(1, true); animateAvatar(0, 0); huntingView.update(0, firstPerson, avatar, true); warriorView.update(0, firstPerson, player, true); renderer.render(scene, camera);
loading.hidden = true; $('welcome').hidden = false;
requestAnimationFrame(frame);

// Optional WebMCP support: these call the same actions as the visible controls.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const state = () => ({
    position: { x: +player.x.toFixed(3), y: +player.y.toFixed(3), z: +player.z.toFixed(3) },
    grounded: player.grounded, view: firstPerson ? 'first' : 'third',
    paused, started, health: Math.ceil(hunting.hp), weapon: hunting.weapon, kills: { ...hunting.kills },
    bow: { drawing: hunting.drawing, charge: +hunting.charge.toFixed(3), arrowsInFlight: hunting.arrows.length, shotsFired: hunting.nextArrow - 1, lastShotCharge: hunting.lastCharge },
    warrior: warrior.state(),
    combat: { criticalHits: hunting.criticalHits, lastHit: hunting.lastHit ? { ...hunting.lastHit } : null },
    creatures: hunting.entities.map(e => ({id:e.id,kind:e.kind,health:e.hp,alive:e.alive,offBalanceSeconds:+e.offBalance.toFixed(2),position:{x:+e.x.toFixed(2),y:+e.y.toFixed(2),z:+e.z.toFixed(2)}})),
  });
  const validateEmpty = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error('Expected an empty object.');
  };
  const tools = [
    { name: 'get_player_state', title: '캐릭터 상태 확인', description: 'Read current position, camera, combat and play state. Includes each creature’s remaining off-balance seconds, critical hit count and the last successful hit.',
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
    { name: 'equip_weapon', title: '도끼·칼·활 장착', description: 'Equip the two-handed axe, sword or bow, matching Z, X, C and the visible weapon buttons. Switching cancels a planted axe and any active skill.',
      inputSchema: { type: 'object', properties: { weapon: { type: 'string', enum: ['axe', 'sword', 'bow'] } }, required: ['weapon'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !['axe', 'sword', 'bow'].includes(input.weapon) || Object.keys(input).some(k => k !== 'weapon')) throw new Error('weapon must be axe, sword or bow.');
        equipWeapon(input.weapon); return state();
      } },
    { name: 'attack_with_weapon', title: '기본 근접 공격', description: 'Swing the equipped axe or sword, matching click or F. For a bow use begin_bow_draw then release_bow_draw. Requires active play and a ready weapon.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); if (!attack()) throw new Error('Equip a ready axe or sword and resume play. Recover a planted axe with skill 4. For the bow, begin and release a draw.'); return { attacked: true, weapon: hunting.weapon }; } },
    { name: 'use_warrior_skill', title: '전사 기술 사용', description: 'Use an equipped-axe skill, matching keys 1 charge, 2 slam, 3 kick, 4 sweep. Kick and sweep require the axe planted by slam. Kick leaves surviving targets off balance for 4 seconds: the next hit on each target deals double damage once. One valid follow-up can be queued during the current skill. Returns acceptance and actual state; animation and impact advance in real time.',
      inputSchema: { type: 'object', properties: { skill: { type: 'string', enum: ['charge','slam','kick','sweep'] } }, required: ['skill'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !WARRIOR_SKILLS.some(s=>s.id===input.skill) || Object.keys(input).some(k=>k!=='skill')) throw new Error('skill must be charge, slam, kick or sweep.');
        const result = useWarriorSkill(input.skill, false); if (!result.accepted) throw new Error(result.reason); return { ...result, ...state() };
      } },
    { name: 'begin_bow_draw', title: '활 당기기', description: 'Begin holding the equipped bow, matching left mouse down or F down. Hold up to 1.05 seconds for full power. Does not fire until release_bow_draw.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); if (!beginBowDraw('tool')) throw new Error('Equip a ready bow and resume play. A draw must not already be active.'); return state(); } },
    { name: 'release_bow_draw', title: '활 놓아 발사', description: 'Release a draw started by begin_bow_draw. Fires one arrow toward the current aim with speed and damage based on hold duration.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); if (!releaseBowDraw('tool')) throw new Error('Begin drawing the bow first; switching weapons or pausing cancels the draw.'); return state(); } },
  ];
  for (const tool of tools) {
    try { void Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Browsers without the proposed API still play normally. */ }
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
