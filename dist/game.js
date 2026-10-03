import * as THREE from './vendor/three.module.js';
import { Movement, terrainHeight } from './movement.js';
import { createEnvironment, createAvatar } from './environment.js';
import { Hunting } from './combat.js';
import { PlayerFeedback } from './player-feedback.js';
import { HuntingView } from './hunting-view.js';
import { WARRIOR_SKILLS, warriorMotionTime, ULTIMATE_CHARGE } from './warrior.js';
import { WarriorView } from './warrior-view.js';
import { MAGE_SKILLS, MAGE_TACTICS } from './mage.js';
import { MageView } from './mage-view.js';
import { ForestryView } from './forestry-view.js';
import { Village } from './village.js';
import { VILLAGE, BUILDING_BLOCKS, BUILD_PLOTS, plotAt } from './village-data.js';
import { createVillageScenery, VillageView } from './village-view.js';
import { FieldHunt } from './field-hunt.js';
import { createFieldScenery, FieldHuntView } from './field-view.js';
import { HUNTS } from './field-data.js';
import {createMirrorScenery,MirrorHuntView} from './mirror-view.js';
import { TALENTS } from './progression.js';
import { GameAudio } from './audio.js';
import { Building } from './building.js';
import { BuildingView } from './building-view.js';
import { BATTLE, SOLDIER_ROLES, soldierRole } from './battle-rules.js';

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
createVillageScenery(scene,environment);
const raidScenery=createFieldScenery(scene);
const mirrorScenery=createMirrorScenery(scene,environment);
const avatar = createAvatar(scene);
const player = new Movement(environment.colliders);
const hunting = new Hunting(environment.colliders, environment.trees);
const forestry = hunting.forestry;
let localSave=null;try{localSave=window.localStorage;}catch{/* Private browsing may disable storage. */}
const village=new Village(hunting,localSave);
const playerFeedback=new PlayerFeedback(hunting.hp,hunting.maxHp);
const progression=village.progression;
const audio=new GameAudio(localSave);
const building=new Building(village,environment.colliders);
const buildingView=new BuildingView(scene,camera,environment,building);
const villageView=new VillageView(scene,camera,village);
const forestryView = new ForestryView(scene,camera,forestry,environment.trees);
const huntingView = new HuntingView(scene, camera, avatar, hunting, environment);
const raids=new FieldHunt(hunting,village);
const raidView=new FieldHuntView(scene,raids,huntingView,raidScenery);
const mirrorView=new MirrorHuntView(scene,raids,huntingView,mirrorScenery);
const warrior = hunting.warrior;
const warriorView = new WarriorView(scene, camera, avatar, warrior);
const mage=hunting.mage;
const mageView=new MageView(scene,camera,avatar,mage);
const warriorButtonTitles=WARRIOR_SKILLS.map(s=>$('skill-'+s.id).title);
const battleAura=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),new THREE.MeshBasicMaterial({color:0xffc363,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));battleAura.rotation.x=-Math.PI/2;battleAura.visible=false;scene.add(battleAura);
const coarsePointer = matchMedia('(pointer:coarse)').matches;
const keys = new Set();
let started = false, paused = true, locked = false, firstPerson = false;
let releasingMouse = false, requestingMouse = false;
let yaw = .16, pitch = .29, cameraDistance = 7.4, phase = 0, previousTime = 0, accumulator = 0;
let touchX = 0, touchZ = 0, touchSprint = false, dragging = null, toastTimer;
let drawOwner = null, mouseDrawPosition = null, touchDrawPointer = null;
const focus = new THREE.Vector3(), desired = new THREE.Vector3(), offset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const input = { x: 0, z: 0, sprint: false };
const floatingHits = [];
let woodReceipt = null;
let hitFeedback = 0;
let cameraShake = 0, impactPause = 0;
let talkingTo=null,tradeCategory='buy';
let buildingMode=false,buildMaterial='timber';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function menuOpen(){return !!document.querySelector('dialog[open]');}
function tacticDirection(choice='movement'){
  let sideways=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touchX;
  let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))-touchZ;
  if(choice!=='movement'){sideways=choice==='right'?1:choice==='left'?-1:0;forward=choice==='back'?-1:choice==='forward'?1:0;}
  if(Math.hypot(sideways,forward)<.1)forward=1;
  return {x:sideways*Math.cos(yaw)-forward*Math.sin(yaw),z:-sideways*Math.sin(yaw)-forward*Math.cos(yaw)};
}
function useTactic(id,direction='movement'){
  if(!started||paused||menuOpen()||buildingMode)return {accepted:false,reason:'건축과 메뉴를 닫고 플레이를 이어 가 주세요.'};
  if(hunting.classId==='mage')return useMageSkill(id==='evade'?'blink':'barrier',direction);
  const result=hunting.tactics.request(id,player,tacticDirection(direction));
  if(result.accepted){if(id==='evade')clearDrawOwner();else notify('전투 함성 · 6초간 피해 +35% · 받는 피해 −25%');}else notify(result.reason);
  updateHUD();return result;
}
function updateTacticsHUD(){
  if(hunting.classId==='mage'){
    for(const [id,spell] of [['evade','blink'],['battlecry','barrier']]){const b=$('tactic-'+id),s=MAGE_TACTICS[spell];b.querySelector('strong').textContent=s.name;b.title=spell==='blink'?'F · 이동 방향으로 5m 점멸 · 벽과 기둥 앞에서 멈춤 · 6초 재사용':'6 · 8초간 피해 30 흡수 · 18초 재사용';b.disabled=!started||paused||buildingMode||!!mage.reason(spell,player);b.classList.toggle('active',spell==='barrier'?mage.shield>0:mage.blinkTime>0);b.style.setProperty('--cooldown',`${mage.cooldowns[spell]/s.cooldown*100}%`);$('tactic-state-'+id).textContent=spell==='barrier'&&mage.shield>0?`흡수 ${mage.shield}`:mage.cooldowns[spell]>0?`${mage.cooldowns[spell].toFixed(1)}초`:'준비';}
    $('tactics-status').textContent='F 점멸 · 6 얼음 방벽';return;
  }
  const t=hunting.tactics;
  $('tactic-evade').querySelector('strong').textContent='회피';$('tactic-battlecry').querySelector('strong').textContent='전투 함성';
  $('tactic-evade').title='F · 이동 방향으로 회피 · 재사용 4초';$('tactic-battlecry').title='6 · 6초간 피해 +35% · 받는 피해 −25%';
  for(const id of ['evade','battlecry']){const button=$('tactic-'+id),active=id==='evade'?!!t.dodge:t.battlecry>0,seconds=t.cooldowns[id];button.classList.toggle('active',active);button.disabled=!started||paused||buildingMode||!!t.reason(id,player);button.style.setProperty('--cooldown',`${seconds/BATTLE[id].cooldown*100}%`);$('tactic-state-'+id).textContent=active?(id==='evade'?'회피 중':`${t.battlecry.toFixed(1)}초 강화`):seconds>0?`${seconds.toFixed(1)}초`:'준비';}
  $('tactics-status').textContent=t.stagger>0?'경직 · 잠시 후 행동 가능':t.battlecry>0?'공격 +35% · 받는 피해 −25%':'F 이동 방향으로 회피 · 6 중요한 순간에 함성';
}
function talentReason(reset=false){
  if(hunting.hp<=0)return '먼저 다시 일어나 주세요.';
  if(raids.active||hunting.tactics.busy||hunting.sinceHit<6||warrior.active||warrior.planted||hunting.drawing||mage.cast||mage.projectiles.length)return '전투와 동작을 마친 뒤 특성을 골라 주세요.';
  if(reset&&!village.isSafe(player))return '마을 안에서 무료로 다시 고를 수 있어요.';
  return null;
}
function learnTalent(id){const reason=talentReason();const result=reason?{accepted:false,reason}:progression.learn(id);renderTalents();$('talent-message').textContent=result.message??result.reason;updateHUD();return result;}
function resetTalents(){const reason=talentReason(true);const result=reason?{accepted:false,reason}:progression.reset();renderTalents();$('talent-message').textContent=result.message??result.reason;updateHUD();return result;}
function renderTalents(){
  const s=progression.state();$('talent-level').textContent=`레벨 ${s.level} / 10`;$('talent-xp').textContent=s.required?`${s.current} / ${s.required} XP`:'최고 레벨 달성';$('talent-points').textContent=`남은 포인트 ${s.points}`;
  const tree=$('talent-tree');tree.replaceChildren();
  $('talents-eyebrow').textContent=(hunting.classId==='mage'?'마법사의 성장':'전사의 성장')+' · 최대 10레벨';
  for(const branch of progression.branches){
    const column=document.createElement('section');column.className='talent-branch';column.style.setProperty('--branch-color',branch.color);
    const heading=document.createElement('h3');heading.textContent=branch.name;const detail=document.createElement('p');detail.className='branch-detail';detail.textContent=branch.detail;column.append(heading,detail);
    for(const t of progression.talents.filter(t=>t.branch===branch.id)){
      const rank=progression.rank(t.id),reason=talentReason()??progression.reason(t.id),card=document.createElement('button');card.className='talent-node'+(rank?' learned':'')+(reason?' locked':' available');card.disabled=!!reason;card.title=reason??`${t.name} 배우기 · 1점`;card.setAttribute('aria-label',`${t.name} ${rank}/${t.max} · ${t.description}${reason?' · '+reason:' · 배우기'}`);
      const icon=document.createElement('span');icon.className='talent-icon';icon.textContent=t.icon;icon.setAttribute('aria-hidden','true');
      const content=document.createElement('span');content.className='talent-content';const name=document.createElement('strong');name.textContent=t.name;const desc=document.createElement('span');desc.textContent=t.description;const note=document.createElement('small');note.textContent=rank===t.max?'모두 배움':s.level<t.level?`${t.level}레벨에 열림`:t.parent&&!progression.rank(t.parent)?'위 특성 1점 필요':reason??'클릭해서 배우기';content.append(name,desc,note);
      const count=document.createElement('b');count.className='talent-rank';count.textContent=`${rank}/${t.max}`;card.append(icon,content,count);card.addEventListener('click',()=>learnTalent(t.id));column.append(card);
    }
    tree.append(column);
  }
  $('reset-talents').disabled=!!talentReason(true)||s.spent===0;$('reset-talents').title=talentReason(true)??'골드 소모 없이 포인트 반환';$('talent-message').textContent=talentReason()??'배운 특성은 바로 적용돼요.';
}
function openTalents(){if(menuOpen())return {accepted:false,reason:'열린 메뉴를 먼저 닫아 주세요.'};renderTalents();$('talents-dialog').showModal();setPaused(true);return {accepted:true};}
function renderClasses(){
  const safe=village.isSafe(player)&&hunting.hp>0&&!raids.active&&hunting.sinceHit>=6;
  for(const b of document.querySelectorAll('[data-class-choice]')){b.setAttribute('aria-pressed',String(b.dataset.classChoice===hunting.classId));b.disabled=!safe||b.dataset.classChoice===hunting.classId;}
  $('class-message').textContent=safe?'레벨·재산은 공유하고 특성은 직업별로 보관해요. 전직하면 전투 자원은 비워집니다.':'B로 솔바람 마을에 돌아와 무료로 전직하세요.';
  $('class-travel').hidden=safe;
}
function openClasses(){if(menuOpen())return;renderClasses();$('class-dialog').showModal();setPaused(true);}
function chooseClass(id){
  const result=hunting.chooseClass(id,player);
  if(result.accepted){clearInput();equipWeapon(hunting.weapon);playerFeedback.reset(hunting.hp,hunting.maxHp);updateHUD();notify(id==='mage'?'서리불꽃 마법사 · 2 서리창 → 1 화염구 → 4 불꽃 쇄도':'양손 도끼 전사로 돌아왔어요.');}
  else notify(result.reason);
  if($('class-dialog').open)renderClasses();return result;
}
function renderAudio(){for(const key of ['music','effects']){const value=Math.round(audio.settings[key]*100);$(key+'-volume').value=value;$(key+'-volume-value').textContent=value+'%';}$('audio-enabled').checked=audio.settings.enabled;$('audio-button').setAttribute('aria-label',audio.settings.enabled?'소리 설정 · 켜짐':'소리 설정 · 꺼짐');$('audio-button').textContent=audio.settings.enabled?'♫':'♪';$('audio-status').textContent=audio.available?'플레이 중 음악이 흐릅니다. 잠시 쉬거나 다른 탭으로 이동하면 소리도 쉬어요.':'이 브라우저에서는 소리를 시작하지 못했어요. 게임은 계속할 수 있습니다.';}
function openAudio(){if(menuOpen())return;renderAudio();$('audio-dialog').showModal();setPaused(true);}
function toggleBuild(value=!buildingMode){
  if(value&&(!started||!village.isSafe(player)||hunting.hp<=0||menuOpen())){const reason='B로 마을에 온 뒤 K를 눌러 주세요. 전투 중에는 건축을 쉬어요.';notify(reason);return {accepted:false,reason};}
  buildingMode=value;document.body.classList.toggle('building',value);$('build-hud').hidden=!value;$('build-button').setAttribute('aria-pressed',String(value));clearInput();
  if(value){hunting.warrior.cancel();setPaused(false);notify('부지로 이동한 뒤 초록색 칸에 블록을 놓으세요.');}
  updateHUD();world.focus({preventScroll:true});return {accepted:true};
}
function selectMaterial(type){if(!Object.hasOwn(BUILDING_BLOCKS,type))return;buildMaterial=type;for(const b of document.querySelectorAll('[data-material]'))b.setAttribute('aria-pressed',String(b.dataset.material===type));}
function travelToPlot(id=$('plot-select').value){
  const plot=BUILD_PLOTS.find(p=>p.id===id),reason=village.travelReason(player);if(!plot||reason||menuOpen()){const r={accepted:false,reason:reason??'열린 메뉴를 닫고 건축 부지를 골라 주세요.'};notify(r.reason);return r;}
  Object.assign(player,{x:plot.entry.x,z:plot.entry.z,y:0,vx:0,vz:0,vy:0,grounded:true,jumpBuffer:0});started=true;$('welcome').hidden=true;$('crosshair').hidden=false;setPaused(false);toggleBuild(true);
  $('plot-select').value=id;yaw=plot.id==='pine'?0:-Math.PI/2;pitch=.45;cameraDistance=7;avatar.root.rotation.y=yaw+Math.PI;updateCamera(1,true);animateAvatar(0,0);updateHUD();notify(`${plot.name} · K 건축 종료 · 호두에게 자재 구매`);return {accepted:true};
}
function buildAction(remove=false){
  if(!buildingMode||paused)return {accepted:false,reason:'K 건축 모드를 켜고 플레이를 이어 가세요.'};
  buildingView.update(true,buildMaterial,player);const result=remove?building.remove(buildingView.removeId,player):buildingView.candidate?building.place(buildingView.candidate,player):{accepted:false,reason:'건축 부지의 바닥이나 놓은 블록을 바라봐 주세요.'};
  if(result.accepted){audio.event({type:remove?'build-remove':'build-place'});buildingView.sync();}else notify(result.reason);updateHUD();return result;
}
function updateGrowthHUD(){const s=progression.state();$('player-level').textContent=`Lv. ${s.level} ${hunting.classId==='mage'?'마법사':'전사'}`;$('class-weapon').textContent=hunting.classId==='mage'?'서리 · 불꽃':'양손 무기';$('xp-meter').max=s.required||1;$('xp-meter').value=s.required?s.current:1;$('xp-value').textContent=s.required?`${s.current} / ${s.required} XP`:'최고 레벨';$('talent-badge').hidden=s.points===0;$('talent-badge').textContent=s.points;
  if(buildingMode){for(const k of Object.keys(BUILDING_BLOCKS))$('build-'+k).textContent=village.blocks[k];$('build-count').textContent=`${building.blocks.size} / 600 블록`;$('build-title').textContent=plotAt(player.x,player.z)?.name??'나의 건축 부지';$('build-hint').textContent=buildingView.candidate?buildingView.reason??'초록색 칸 · 좌클릭으로 설치할 수 있어요.':'화면 가운데 조준점을 건축 부지에 맞춰 주세요.';}
}
function clearInput() { cancelBowDraw(); mage.cancel(); warrior.queued = null; keys.clear(); touchX = touchZ = 0; dragging = null; $('stick').style.transform = ''; }
function capturePointer(element, pointerId) {
  // Embedded browsers can reject capture while pointer lock is changing.
  try { element.setPointerCapture(pointerId); } catch { /* Dragging still works inside the play area. */ }
}
function setPaused(value) {
  paused = value; clearInput(); accumulator = 0;
  $('resume').hidden = !value || !started || menuOpen() || hunting.hp <= 0;
  audio.setPlaying(!value&&started);
  if (value && document.pointerLockElement) { releasingMouse = true; document.exitPointerLock(); }
}
async function lockMouse() {
  if (coarsePointer || document.pointerLockElement || requestingMouse || paused || menuOpen()) return;
  requestingMouse = true;
  try {
    if (!renderer.domElement.requestPointerLock) throw new Error('unsupported');
    await renderer.domElement.requestPointerLock();
  } catch {
    notify('우클릭 드래그로 시점 회전 · 1~5 기술 · 좌클릭 기본 공격');
  } finally { requestingMouse = false; }
}
function resumeFromMenu() {
  if (!started || hunting.hp <= 0 || document.hidden || !document.hasFocus() || menuOpen()) return;
  setPaused(false); updateHUD(); world.focus({preventScroll:true}); void lockMouse();
}
function closeMenu(id) {
  $(id).close(); resumeFromMenu();
}
function play() {
  void audio.unlock();
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
  if(buildingMode)toggleBuild(false);
  raids.abort();if($('battle-dialog').open)$('battle-dialog').close();
  if($('trade-dialog').open)$('trade-dialog').close();
  const reviving = hunting.hp <= 0;
  player.reset(); yaw = .16; pitch = .29; clearInput();
  hunting.restorePlayer();hunting.events.length=0;playerFeedback.reset(hunting.hp,hunting.maxHp);cameraShake=0;avatar.root.rotation.y = Math.PI;
  hunting.inSanctuary=false;
  impactPause = 0;
  $('defeat').hidden = true;
  if (reviving && started) setPaused(false);
  updateCamera(1, true); updateHUD(); notify('시작 위치에서 체력을 회복했어요.');
}
function equipWeapon(weapon) {
  if((weapon==='staff')!==(hunting.classId==='mage')){notify('직업 메뉴 L에서 마을 전직을 이용하세요.');return false;}
  cancelBowDraw();
  if (warrior.active && weapon !== hunting.weapon) player.vx = player.vz = 0;
  hunting.equip(weapon);
  document.body.dataset.weapon = weapon;
  document.body.dataset.class=hunting.classId;
  $('warrior-hud').setAttribute('aria-label',hunting.classId==='mage'?'마법사 기술':'전사 기술');
  for(const id of ['axe-button','sword-button','bow-button'])$(id).hidden=hunting.classId==='mage';
  $('staff-button').hidden=hunting.classId!=='mage';
  world.setAttribute('aria-label',hunting.classId==='mage'?'3D 들판. WASD 이동, 1 화염구, 2 서리창, 3 서리 고리, 4 불꽃 쇄도, 5 원소 해방, F 점멸, 6 얼음 방벽. 좌클릭 마력탄, V 시점 전환.':'3D 들판. WASD 이동, 1 돌진, 2 내려찍기, 3 날아차기, 4 가로베기, 5 회전베기, F 회피, 6 함성. 좌클릭 기본 공격, V 시점 전환.');
  WARRIOR_SKILLS.forEach((s,i)=>{const shown=hunting.classId==='mage'?MAGE_SKILLS[i]:s,b=$('skill-'+s.id);b.querySelector('strong').textContent=shown.name;b.setAttribute('aria-label',`${shown.key} ${shown.name}`);b.title=hunting.classId==='mage'?`${shown.key} · ${shown.detail}`:warriorButtonTitles[i];});
  const bow = weapon === 'bow', axe = weapon === 'axe';
  for (const [id, selected] of [['axe-button', axe], ['sword-button', weapon === 'sword'], ['bow-button', bow]]) {
    $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected));
  }
  $('weapon-name').textContent = weapon==='staff'?'서리불꽃 지팡이':axe ? '양손 도끼' : bow ? '들판의 활' : '여행자의 칼';
  $('weapon-hint').textContent = axe ? '2초마다 자동 공격 · 1~5 기술' : bow ? '좌클릭 꾹 당기기 · 놓으면 발사' : '2초마다 자동 공격 · 좌클릭 직접 베기';
  $('warrior-hud').hidden = !axe&&weapon!=='staff';
  $('touch-attack').textContent = bow ? '당기기' : '공격';
  $('touch-attack').setAttribute('aria-label', bow ? '누르고 활 당기기, 놓으면 발사' : axe ? '도끼 기본 공격' : '칼로 공격');
  if(weapon==='staff'){$('weapon-hint').textContent='2 서리 → 1 화염 → 이동하며 4 잔불';$('touch-attack').textContent='마력탄';$('touch-attack').setAttribute('aria-label','마력탄 발사');}
  if (bow && pitch > .10) pitch = .08;
  if(weapon==='staff'){pitch=.04;cameraDistance=7.4;}
  updateCamera(1, true); world.focus({ preventScroll: true });
  return true;
}
function attack() {
  if(buildingMode)return buildAction().accepted;
  if (!started || paused || hunting.hp <= 0) return false;
  if(village.isSafe(player)){notify('마을은 안전 지역이에요. 서쪽 문을 나가면 전투할 수 있어요.');return false;}
  const aim = huntingView.aim();
  const attacked = hunting.attack(player, { x: -Math.sin(yaw), y: aim.direction.y, z: -Math.cos(yaw) }, aim.point);
  if (attacked) avatar.root.rotation.y = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  else if (hunting.weapon === 'axe' && warrior.planted && !warrior.active) notify('3번 날아차기 또는 4번 가로베기로 이어 가세요.');
  return attacked;
}
function useWarriorSkill(skill, showHint = true) {
  if(buildingMode)return {accepted:false,reason:'K로 건축을 마친 뒤 기술을 사용하세요.'};
  const result = !started || paused ? { accepted: false, reason: '플레이를 시작하거나 이어 가세요.' }
    : warrior.request(skill, player, { x: -Math.sin(yaw), z: -Math.cos(yaw) });
  if (!result.accepted && showHint) notify(result.reason);
  if (result.accepted) updateWarriorHUD();
  return result;
}
function useMageSkill(skill,direction='movement'){
  if(!started||paused||menuOpen()||buildingMode)return {accepted:false,reason:'메뉴와 건축을 닫고 플레이를 이어 가세요.'};
  const aim=huntingView.aim(),dir=skill==='blink'?tacticDirection(direction):{x:-Math.sin(yaw),y:aim.direction.y,z:-Math.cos(yaw)};
  const result=mage.request(skill,player,dir,aim.point);
  if(!result.accepted)notify(result.reason);else avatar.root.rotation.y=Math.atan2(-Math.sin(yaw),-Math.cos(yaw));
  updateHUD();return result;
}
function upgradeHandle() {
  const result = !started ? {accepted:false,reason:'플레이를 먼저 시작해 주세요.'} : forestry.upgrade();
  if(!result.accepted)notify(result.reason);
  village.save();updateHUD();if(talkingTo)renderTrade();return result;
}
function travelToVillage() {
  const reason=menuOpen()?'열린 메뉴를 먼저 닫아 주세요.':village.travelReason(player);
  if(reason){notify(reason);return {accepted:false,reason};}
  Object.assign(player,{x:VILLAGE.entry.x,z:VILLAGE.entry.z,y:terrainHeight(VILLAGE.entry.x,VILLAGE.entry.z),vx:0,vz:0,vy:0,grounded:true,jumpBuffer:0});
  hunting.inSanctuary=true;hunting.autoMelee.targetId=null;hunting.swing=0;impactPause=0;
  started=true;setPaused(false);$('welcome').hidden=true;$('crosshair').hidden=false;
  yaw=-.42;pitch=.34;cameraDistance=9;avatar.root.rotation.y=Math.PI-.42;
  updateCamera(1,true);animateAvatar(0,0);updateHUD();world.focus({preventScroll:true});void lockMouse();
  notify('솔바람 마을 · J 토벌 의뢰 · 가까운 주민에게 E 대화');return {accepted:true};
}
function usePotion() {
  const result=!started||paused?{accepted:false,reason:'플레이를 이어 간 뒤 물약을 사용해 주세요.'}:village.usePotion();
  notify(result.message??result.reason);updateHUD();return result;
}
function selectHunt(id){
  if(!$('battle-dialog').open)return {accepted:false,reason:'J 토벌 의뢰를 먼저 열어 주세요.'};
  const result=raids.select(id);if(!result.accepted)notify(result.reason);renderBattle();updateHUD();return result;
}
function renderBattle(){
  const q=raids.quest,a=raids.arena;
  for(const button of document.querySelectorAll('[data-hunt]')){button.disabled=raids.active;button.setAttribute('aria-pressed',String(button.dataset.hunt===raids.selected));}
  $('battle-dialog').classList.toggle('mirror-journal',raids.selected==='lysea');
  $('battle-title').textContent=a.title;$('hunt-intro').textContent=a.intro;
  $('quest-status').textContent=q.rewardClaimed?`조사 완료 · 누적 ${q.clears}회 토벌${q.bestTime?` · 최고 ${Math.floor(q.bestTime/60)}분 ${Math.floor(q.bestTime%60)}초`:''}`:q.clears?`${a.shortName} 토벌 완료 · 마을에 보고하세요`:q.accepted?`진행 중 · ${a.name}의 ${a.shortName} 토벌`:'새 의뢰 · '+a.questTitle;
  $('accept-hunt').hidden=q.accepted;$('accept-hunt').disabled=!village.isSafe(player)||hunting.hp<=0;
  $('travel-hunt').textContent=a.travelLabel;$('travel-hunt').disabled=!!raids.travelReason(player);
  $('start-hunt').textContent=a.startLabel;$('start-hunt').disabled=!!raids.startReason('field',player);
  $('claim-hunt').hidden=!q.clears||q.rewardClaimed;$('claim-hunt').disabled=!!raids.claimReason(player);$('hunt-companion').disabled=raids.active;
  const reward=a.firstReward;$('hunt-first-reward').textContent=`${reward.gold} 골드 · 나무 ${reward.timber} · 돌 ${reward.stone} · 지붕 ${reward.roof} · 180 XP`;
  $('hunt-repeat-reward').textContent=`${a.shortName} 처치마다 150 XP · 두 번째부터 ${a.repeatReward.gold} 골드와 돌 ${a.repeatReward.stone}개`;
  $('hunt-guide-title').textContent='공략 수첩 · '+a.guideTitle;const guide=$('hunt-guide-list');guide.replaceChildren();
  for(const [name,description] of a.guide){const item=document.createElement('li'),label=document.createElement('strong');label.textContent=name;item.append(label,document.createTextNode(' — '+description));guide.append(item);}
  $('hunt-footnote').textContent=(raids.selected==='lysea'?'분신은 경험치를 주지 않으며 발차기로 무도회를 건너뛸 수 없어요. 진짜를 놓쳐도 기둥 뒤에서 마지막 응시를 피하고 다시 도전할 수 있어요. 마지막 단계에는 광선이 두 줄로 늘어납니다.':'공명석을 놓쳐도 다시 기회가 옵니다. 마지막 단계에는 파동과 낙인이 겹칩니다.')+' 체력 65%·35%에 패턴 강화. 전장을 크게 벗어나면 토벌 종료. 두 의뢰의 첫 보상은 각각 한 번, 주간 대기 없이 반복 도전할 수 있어요.';
  const r=raids.result;$('battle-result').hidden=!r;
  if(r){const mechanics=raids.selected==='lysea'?`진짜 발견 ${r.bossStats.mirrorBreaks}회 · 엄폐 ${r.bossStats.coverSuccess}회`:`공명석 파괴 ${r.bossStats.stoneBreaks}회`;
    $('battle-result').textContent=(r.won?`토벌 성공 · ${Math.floor(r.elapsed/60)}분 ${Math.floor(r.elapsed%60)}초 · ${r.first?'마을에서 첫 의뢰 보상을 받으세요':r.reward.gold+' 골드 · 돌 '+r.reward.stone+'개'}`:r.reason)+` · ${mechanics} · 피격 ${r.bossStats.playerHits}회`;}
  $('battle-reason').textContent=raids.active?'토벌 진행 중 · 메뉴를 닫으면 계속됩니다.':!q.accepted?'마을에서 선택한 의뢰를 받은 뒤 이동하세요.':q.clears&&!q.rewardClaimed?'마을로 돌아가 첫 의뢰 보상을 받아 주세요.':raids.startReason('field',player)??'준비 완료 · '+a.startLabel;
  $('retreat-button').hidden=false;$('retreat-button').disabled=hunting.hp<=0;$('retreat-button').textContent=raids.active?'토벌 중단 · 마을로 철수':'마을로 돌아가기';
}
function openBattle(){
  if(menuOpen())return {accepted:false,reason:'열린 메뉴를 먼저 닫아 주세요.'};
  const nearby=raids.nearestArena(player);if(!raids.active&&Math.hypot(player.x-nearby.x,player.z-nearby.z)<=nearby.radius)raids.select(nearby.id);
  renderBattle();if(!$('battle-dialog').open)$('battle-dialog').showModal();setPaused(true);return {accepted:true};
}
function startBattle(mode='field'){
  if(!$('battle-dialog').open)return {accepted:false,reason:'J 토벌 의뢰를 먼저 열어 주세요.'};
  const result=raids.start(mode,player,$('hunt-companion').value||'none');if(!result.accepted){notify(result.reason);renderBattle();return result;}
  if(buildingMode)toggleBuild(false);
  started=true;$('welcome').hidden=true;$('crosshair').hidden=false;$('battle-dialog').close();setPaused(false);
  yaw=Math.PI/2;pitch=raids.selected==='lysea'?.28:.52;cameraDistance=raids.selected==='lysea'?14.5:12;avatar.root.rotation.y=-Math.PI/2;impactPause=0;
  if(hunting.classId==='mage'){pitch=.04;cameraDistance=7.4;}
  updateCamera(1,true);animateAvatar(0,0);updateHUD();world.focus({preventScroll:true});void lockMouse();return result;
}
function questAction(action){
  if(!$('battle-dialog').open)return {accepted:false,reason:'J 토벌 의뢰를 먼저 열어 주세요.'};
  const result=action==='accept'?raids.acceptQuest(player):raids.claimReward(player);notify(result.message??result.reason);renderBattle();updateHUD();return result;
}
function travelToHunt(){
  const reason=!$('battle-dialog').open?'J 토벌 의뢰를 먼저 열어 주세요.':raids.travelReason(player);
  if(reason){notify(reason);return {accepted:false,reason};}
  if(buildingMode)toggleBuild(false);
  const area=raids.arena;
  Object.assign(player,{x:area.entry.x,z:area.entry.z,y:terrainHeight(area.entry.x,area.entry.z),vx:0,vz:0,vy:0,grounded:true,jumpBuffer:0});
  hunting.inSanctuary=false;hunting.autoMelee.targetId=null;started=true;$('welcome').hidden=true;$('crosshair').hidden=false;
  yaw=Math.PI/2;pitch=raids.selected==='lysea'?.28:.48;cameraDistance=raids.selected==='lysea'?14.5:12;avatar.root.rotation.y=-Math.PI/2;
  if(hunting.classId==='mage'){pitch=.04;cameraDistance=7.4;}
  $('battle-dialog').close();setPaused(false);updateCamera(1,true);animateAvatar(0,0);updateHUD();world.focus({preventScroll:true});void lockMouse();
  notify(raids.arena.name+' · J 의뢰에서 '+raids.arena.startLabel+(hunting.classId==='mage'?' · F 점멸':' · F 회피'));return {accepted:true};
}
function rallyResidents(){
  const result=!started||paused?{accepted:false,reason:'플레이를 이어 가 주세요.'}:raids.toggleOrder();notify(result.message??result.reason);updateHUD();return result;
}
function updateRaidHUD(){
  $('raid-hud').hidden=!raids.active;document.body.classList.toggle('raid-active',raids.active);
  const boss=raids.boss.state();$('boss-hud').hidden=!raids.active||!boss;document.body.classList.toggle('boss-active',raids.active&&!!boss);
  const nearby=raids.nearestArena(player);$('hunt-prompt').hidden=!started||raids.active||menuOpen()||hunting.hp<=0||Math.hypot(player.x-nearby.x,player.z-nearby.z)>nearby.radius;
  $('hunt-prompt').textContent='J '+nearby.bossName+' · 토벌 준비 →';document.body.classList.toggle('mirror-active',raids.active&&raids.selected==='lysea');
  if(boss){$('boss-name').textContent=boss.name;$('boss-phase').textContent=`${boss.phase}단계`+(boss.armorReduction?` · 돌갑옷 −${Math.round(boss.armorReduction*100)}%`:boss.exposed>0?' · 약점 +40%':'');$('boss-health').max=boss.maxHp;$('boss-health').value=boss.health;$('boss-health-text').textContent=`${boss.health} / ${boss.maxHp}`;
    $('boss-cast-name').textContent=boss.cast?.name??(boss.exposed>0?(raids.selected==='lysea'?'진짜 발견 · 본체 노출':'공명석 파괴 · 약점 노출'):'숨 고르기 · 공격 기회');$('boss-cast-time').textContent=boss.cast?`${boss.cast.remaining.toFixed(1)}초`:boss.exposed>0?`${boss.exposed.toFixed(1)}초`:'';$('boss-cast').value=boss.cast?.progress??(boss.exposed/raids.arena.exposure);
    const openingHint=hunting.classId==='mage'?'2 서리창 → 1 화염구 · 잔불과 원소 해방으로 몰아치세요':'6 함성 → 2→3→4 긴 연계 → 5 회전베기';
    $('boss-hud').classList.toggle('interruptible',boss.exposed>0);$('boss-hint').textContent=boss.cast?.hint??(boss.exposed>0?openingHint:raids.selected==='lysea'?'기둥 위치를 확인하며 공격 · 다음 주문에 대비하세요':boss.hazards.some(h=>h.active&&h.burn)?'보라색 잔류 번개는 매초 피해 · 원 밖으로 나와 공격하세요':'돌갑옷으로 받는 피해 25% 감소 · 공명석에 번개를 유도하세요');}
  if(!raids.active)return;
  $('raid-mode').textContent=raids.arena.name+' · 야외 토벌';$('raid-wave').textContent=`${Math.floor(raids.elapsed/60)}:${String(Math.floor(raids.elapsed%60)).padStart(2,'0')}`;
  $('raid-objective').textContent=raids.selected==='lysea'?`진짜 발견 ${boss?.stats.mirrorBreaks??0}회 · 엄폐 ${boss?.stats.coverSuccess??0}회`:`공명석 ${boss?.stats.stoneBreaks??0}회 파괴 · 자동 회복 없음`;
  const a=raids.allies[0];$('raid-allies').textContent=a?(a.alive?`나리 · 체력 ${Math.ceil(a.hp)} · 치유 ${a.healCharges}/3회 남음`:'나리 휴식 중 · 혼자서도 계속할 수 있어요'):`단독 토벌 · F ${hunting.classId==='mage'?'점멸':'회피'} / H 물약`;
  $('rally-button').hidden=!a;$('rally-button').textContent=raids.order==='fight'?'G 나리 집결':'G 나리 동행';
}
function renderTrade(message='') {
  const npc=village.residents.find(n=>n.id===talkingTo);if(!npc)return;
  $('trade-dialog').classList.toggle('building-shop',npc.id==='hodu');
  const focusedOffer=document.activeElement?.dataset.offer;
  $('resident-name').textContent=npc.name;$('resident-role').textContent=npc.role;$('resident-hello').textContent=npc.hello;
  $('resident-portrait').textContent=npc.name.slice(0,1);$('resident-portrait').style.setProperty('--resident-color',`#${npc.color.toString(16).padStart(6,'0')}`);
  $('trade-inventory').textContent=`${village.gold} 골드 · 목재 ${forestry.wood} · 물약 ${village.potions} · 갑옷 ${village.armorLevel}/3`;
  $('trade-blocks').textContent='건축 블록 · '+Object.entries(BUILDING_BLOCKS).map(([k,b])=>`${b.short} ${village.blocks[k]}`).join(' · ');
  $('trade-tabs').hidden=npc.id!=='hodu';$('block-storage-note').hidden=npc.id!=='hodu';
  for(const tab of ['buy','sell','barter'])$('trade-'+tab).setAttribute('aria-pressed',String(tab===tradeCategory));
  const list=$('trade-offers');list.replaceChildren();
  for(const offer of village.offers(npc.id)) {
    if(npc.id==='hodu'&&offer.category!==tradeCategory)continue;
    const row=document.createElement('div');row.className='trade-offer';
    const icon=document.createElement('span');icon.className=`offer-icon ${offer.icon}`;icon.textContent={wood:'▰',potion:'✚',armor:'◇',rest:'☕',timber:'▧',stone:'▦',roof:'▰'}[offer.icon];icon.setAttribute('aria-hidden','true');
    const details=document.createElement('div'),name=document.createElement('strong'),hint=document.createElement('span');name.textContent=offer.name;hint.textContent=offer.detail;details.append(name,hint);
    const button=document.createElement('button');button.dataset.offer=offer.id;button.textContent=offer.price;button.disabled=!offer.enabled;button.title=offer.enabled?offer.name:offer.reason;button.setAttribute('aria-label',`${offer.name} · ${offer.price}`);button.addEventListener('click',()=>tradeWithResident(offer.id));
    row.append(icon,details,button);list.append(row);
  }
  if(!list.children.length){const p=document.createElement('p');p.className='resident-tip';p.textContent='서쪽 문 밖으로는 사냥터가, 광장 주변으로는 상점과 여관이 있어요. 마을을 천천히 둘러보세요.';list.append(p);}
  $('trade-message').textContent=message||'골드와 소지품은 거래하는 즉시 저장돼요.';
  if(!village.storageAvailable)$('trade-message').textContent=message?`${message} (저장 불가 · 이번 플레이에서만 유지)`:'이 브라우저에서는 저장할 수 없어 이번 플레이에서만 유지돼요.';
  if(focusedOffer){const next=[...list.querySelectorAll('button')].find(b=>b.dataset.offer===focusedOffer&&!b.disabled);(next??$('close-trade')).focus({preventScroll:true});}
}
function openResident(id=village.nearest(player)?.id) {
  const reason=!started||paused?'플레이를 이어 간 뒤 주민에게 말을 걸어 주세요.':village.interactionReason(id,player);
  if(reason){notify(reason);return {accepted:false,reason};}
  talkingTo=id;tradeCategory='buy';renderTrade();$('trade-dialog').showModal();setPaused(true);$('interact-prompt').hidden=true;return {accepted:true};
}
function tradeWithResident(offerId) {
  if(!$('trade-dialog').open||!talkingTo)return {accepted:false,reason:'먼저 가까운 상인과 대화해 주세요.'};
  const result=village.trade(talkingTo,offerId,player);if(talkingTo==='hodu'){const offer=village.offers(talkingTo).find(o=>o.id===offerId);if(offer)tradeCategory=offer.category;}renderTrade(result.message??result.reason);updateHUD();return result;
}
function beginBowDraw(owner) {
  if(buildingMode)return false;
  if (!started || paused || village.isSafe(player) || drawOwner || !hunting.beginDraw()) return false;
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
const unlockAudio=()=>{if(!audio.context||audio.context.state==='suspended')void audio.unlock();};
document.addEventListener('pointerdown',unlockAudio,{capture:true});document.addEventListener('keydown',unlockAudio,{capture:true});
$('talents-button').addEventListener('click',openTalents);$('close-talents').addEventListener('click',()=>closeMenu('talents-dialog'));$('reset-talents').addEventListener('click',resetTalents);
$('audio-button').addEventListener('click',openAudio);$('close-audio').addEventListener('click',()=>closeMenu('audio-dialog'));
$('class-button').addEventListener('click',openClasses);$('close-class').addEventListener('click',()=>closeMenu('class-dialog'));
for(const b of document.querySelectorAll('[data-class-choice]'))b.addEventListener('click',()=>{if(chooseClass(b.dataset.classChoice).accepted)closeMenu('class-dialog');});
$('class-travel').addEventListener('click',()=>{$('class-dialog').close();if(travelToVillage().accepted)openClasses();});
$('mage-start').addEventListener('click',()=>{if(travelToVillage().accepted)chooseClass('mage');});
$('staff-button').addEventListener('click',()=>equipWeapon('staff'));
for(const id of ['talents-dialog','audio-dialog','battle-dialog','trade-dialog','help-dialog','class-dialog']) {
  // Escape releases the mouse intentionally; closing with the button resumes in that gesture.
  $(id).addEventListener('cancel',()=>setPaused(true));
  $(id).addEventListener('close',()=>{if(id==='trade-dialog')talkingTo=null;$('resume').hidden=!paused||!started||menuOpen()||hunting.hp<=0;updateHUD();world.focus({preventScroll:true});});
}
$('audio-enabled').addEventListener('change',()=>{audio.set('enabled',$('audio-enabled').checked);renderAudio();});
for(const key of ['music','effects'])$(key+'-volume').addEventListener('input',()=>{audio.set(key,Number($(key+'-volume').value)/100);renderAudio();});
$('build-button').addEventListener('click',()=>toggleBuild());$('build-close').addEventListener('click',()=>toggleBuild(false));$('plot-travel').addEventListener('click',()=>travelToPlot());
for(const b of document.querySelectorAll('[data-material]'))b.addEventListener('click',()=>{selectMaterial(b.dataset.material);world.focus({preventScroll:true});});
$('place-block').addEventListener('click',()=>{buildAction();world.focus({preventScroll:true});});$('remove-block').addEventListener('click',()=>{buildAction(true);world.focus({preventScroll:true});});
$('sword-button').addEventListener('click', () => equipWeapon('sword'));
$('bow-button').addEventListener('click', () => equipWeapon('bow'));
$('axe-button').addEventListener('click', () => equipWeapon('axe'));
$('upgrade-handle').addEventListener('click', () => { upgradeHandle();world.focus({preventScroll:true}); });
for (const [i,skill] of WARRIOR_SKILLS.entries()) $('skill-' + skill.id).addEventListener('click', () => { if(hunting.classId==='mage')useMageSkill(MAGE_SKILLS[i].id);else useWarriorSkill(skill.id); world.focus({ preventScroll: true }); });
for(const id of ['evade','battlecry'])$('tactic-'+id).addEventListener('click',()=>{useTactic(id);world.focus({preventScroll:true});});
$('revive-button').addEventListener('click', () => { resetPosition(); play(); });
$('play-button').addEventListener('click', play);
$('village-button').addEventListener('click',travelToVillage);
$('village-start').addEventListener('click',travelToVillage);
$('battle-button').addEventListener('click',openBattle);
$('close-battle').addEventListener('click',()=>closeMenu('battle-dialog'));
$('start-hunt').addEventListener('click',()=>startBattle('field'));
$('accept-hunt').addEventListener('click',()=>questAction('accept'));
$('claim-hunt').addEventListener('click',()=>questAction('claim'));
$('travel-hunt').addEventListener('click',travelToHunt);
$('hunt-prompt').addEventListener('click',openBattle);
for(const button of document.querySelectorAll('[data-hunt]'))button.addEventListener('click',()=>selectHunt(button.dataset.hunt));
$('rally-button').addEventListener('click',()=>{rallyResidents();world.focus({preventScroll:true});});
$('retreat-button').addEventListener('click',()=>{raids.abort();$('battle-dialog').close();hunting.sinceHit=100;hunting.warrior.cancel();travelToVillage();});
$('potion-button').addEventListener('click',()=>{usePotion();world.focus({preventScroll:true});});
$('interact-prompt').addEventListener('click',()=>openResident());
$('close-trade').addEventListener('click',()=>closeMenu('trade-dialog'));
for(const category of ['buy','sell','barter'])$('trade-'+category).addEventListener('click',()=>{tradeCategory=category;renderTrade();});
$('resume-button').addEventListener('click', play);
$('view-button').addEventListener('click', () => { setView(firstPerson ? 'third' : 'first'); world.focus(); });
$('reset-button').addEventListener('click', resetPosition);
$('help-button').addEventListener('click', () => {
  $('help-dialog').showModal(); setPaused(true);
});
$('close-help').addEventListener('click', () => closeMenu('help-dialog'));
document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked; locked = document.pointerLockElement === renderer.domElement;
  const intentionalRelease = releasingMouse; releasingMouse = false;
  document.querySelector('.mouse-guide').textContent = locked ? '마우스 시점 · Esc 쉬기' : '우클릭 드래그 · 시점';
  if (locked && paused) { releasingMouse=true; document.exitPointerLock(); }
  else if (wasLocked && !locked && !intentionalRelease) setPaused(true);
});
document.addEventListener('pointerlockerror', () => {
  if (started && !paused) notify('우클릭 드래그 또는 Q · E로 시점 회전 · 1~5 기술');
});
document.addEventListener('keydown', event => {
  if (menuOpen()) return;
  // Let focused controls keep their native Enter/Space/arrow behavior.
  if(event.target.closest?.('button,input,select,textarea')&&['Enter','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))return;
  if (event.code === 'Escape') { if (started && !locked && hunting.hp > 0) { if(paused)play();else setPaused(true); } return; }
  if (event.code === 'Enter' && !started) { event.preventDefault();play(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if(event.code==='KeyP'){event.preventDefault();openTalents();return;}
  if(event.code==='KeyL'){event.preventDefault();openClasses();return;}
  if(event.code==='KeyK'){event.preventDefault();toggleBuild();return;}
  if (event.code === 'KeyV') setView(firstPerson ? 'third' : 'first');
  if (event.code === 'KeyR') resetPosition();
  if (event.code === 'KeyZ') equipWeapon(hunting.classId==='mage'?'staff':'axe');
  if (event.code === 'KeyX') equipWeapon('sword');
  if (event.code === 'KeyC') equipWeapon('bow');
  if (event.code === 'KeyT') {event.preventDefault();upgradeHandle();return;}
  if (event.code === 'KeyB') {event.preventDefault();travelToVillage();return;}
  if (event.code === 'KeyJ') {event.preventDefault();openBattle();return;}
  if (!started || paused) return;
  if(buildingMode&&['Digit1','Digit2','Digit3'].includes(event.code)){event.preventDefault();selectMaterial(['timber','stone','roof'][Number(event.code.slice(-1))-1]);return;}
  if(event.code==='KeyH'){event.preventDefault();usePotion();return;}
  if(event.code==='KeyG'){event.preventDefault();rallyResidents();return;}
  if(event.code==='KeyF'){event.preventDefault();if(buildingMode)buildAction();else useTactic('evade');return;}
  if(event.code==='Digit6'){event.preventDefault();useTactic('battlecry');return;}
  if(event.code==='KeyE'&&!buildingMode&&village.nearest(player)){event.preventDefault();openResident();return;}
  const skill = (hunting.classId==='mage'?MAGE_SKILLS:WARRIOR_SKILLS).find(s => event.code === 'Digit' + s.key);
  if (skill) { event.preventDefault(); if(hunting.classId==='mage')useMageSkill(skill.id);else useWarriorSkill(skill.id); return; }
  keys.add(event.code);
  if (event.code === 'Space') player.jump();
});
document.addEventListener('keyup', event => {
  keys.delete(event.code);
});
window.addEventListener('blur', () => { if (started) setPaused(true); });
window.addEventListener('pagehide',()=>village.save());
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
  if (buildingMode||event.button !== 0 || hunting.weapon !== 'bow') return;
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
  if (!buildingMode&&event.pointerType === 'mouse' && event.button === 0 && hunting.weapon === 'bow') return;
  if (locked) { if(buildingMode&&event.button===2)buildAction(true);else if (event.button === 0) attack(); return; }
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
  const recover=buildingMode&&dragging.moved<5&&dragging.button===2;
  dragging = null;
  if (world.hasPointerCapture(event.pointerId)) world.releasePointerCapture(event.pointerId);
  if (click) attack();
  if (recover) buildAction(true);
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
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * .008, 1.5, 16);
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
  if(buildingMode){buildAction();return;}
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
  warrior.setAim({ x:-Math.sin(yaw),z:-Math.cos(yaw) });
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchX;
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - touchZ;
  input.x = sideways * Math.cos(yaw) - forward * Math.sin(yaw);
  input.z = -sideways * Math.sin(yaw) - forward * Math.cos(yaw);
  input.sprint = touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight');
  mage.movement(input,player);
  if(mage.cast){const aim=huntingView.aim();mage.setAim({x:-Math.sin(yaw),y:aim.direction.y,z:-Math.cos(yaw)},aim.point);}
  warrior.movement(input, player);
  hunting.tactics.movement(input);
}
function safeCameraPosition(target, candidate) {
  offset.copy(candidate).sub(target);
  const length = offset.length();
  if (length < .01) return;
  raycaster.set(target, offset.multiplyScalar(1 / length));
  raycaster.far = length + .25;
  const hit = raycaster.intersectObjects(environment.cameraSurfaces.filter(o=>o.userData.collider?.active!==false), false)[0];
  if (hit && hit.distance < length + .22) candidate.copy(target).addScaledVector(offset, Math.max(.15, hit.distance - .28));
}
function updateCamera(dt, immediate = false) {
  if (firstPerson) {
    camera.position.set(player.x, player.y + 1.76, player.z);
    desired.set(player.x - Math.sin(yaw) * Math.cos(pitch), player.y + 1.76 - Math.sin(pitch), player.z - Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(desired); return;
  }
  focus.set(player.x, player.y + 1.22, player.z);
  const action = warrior.active, widen = !reduceMotion && action ? action.id==='spin' ? Math.min(1,action.elapsed/.2,(action.duration-action.elapsed)/.2)*1.3 : ['kick','sweep'].includes(action.id) ? Math.sin(action.elapsed/action.duration*Math.PI)*(action.id==='sweep'?1.25:.85) : 0 : 0;
  desired.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cameraDistance + widen).add(focus);
    const bow = ['bow','staff'].includes(hunting.weapon)||buildingMode;
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
    const facing = warrior.facing(); avatar.root.rotation.y = Math.atan2(facing.x, facing.z);
  } else if (hunting.swing > 0 && hunting.meleeFacing) {
    avatar.root.rotation.y = Math.atan2(hunting.meleeFacing.x,hunting.meleeFacing.z);
  } else if (hunting.weapon === 'bow'||hunting.weapon==='staff') {
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
  if(hunting.classId==='mage'){updateMageHUD();return;}
  const nearbyOpening=hunting.targets().find(e=>e.alive&&e.offBalance>0&&Math.hypot(e.x-player.x,e.z-player.z)<18);
  $('critical-opening').hidden = !started || !nearbyOpening;
  if(nearbyOpening)$('critical-opening').textContent=`✦ ${nearbyOpening.kind==='tree'?'금이 간 나무':'비틀거리는 적'} · 다음 적중은 치명타 ×${hunting.criticalMultiplier}`;
  const a = warrior.active;
  const progress = a ? a.elapsed / a.duration : 0;
  const elapsed = warriorMotionTime(a);
  const phaseLabels = {
    charge: '돌파', slam: elapsed < .43 ? '날 세우기' : elapsed < .64 ? '내려찍기' : '도끼 고정',
    kick: elapsed < .14 ? '도약' : elapsed < .70 ? '날아차기' : '착지',
    sweep: elapsed < .52 ? '끌어오기' : elapsed < .90 ? '몸 틀기' : elapsed < 1.26 ? '크게 베기' : '마무리',
    spin: `${a?.stage ?? 1}단계 · ${Math.max(0,(a?.duration ?? 0)-elapsed).toFixed(1)}초`,
  };
  const ready = warrior.ultimate.ready, combo = warrior.combo, spinning = a?.id === 'spin', charge=warrior.ultimate.charge;
  const gain=warrior.ultimate.lastGain,recentGain=gain&&hunting.time-gain.time<1.8;
  $('ultimate-info').classList.toggle('ready', ready); $('ultimate-info').classList.toggle('empowered', spinning && a.stage===2);
  $('ultimate-charge').max = spinning ? a.duration : ULTIMATE_CHARGE.max;
  $('ultimate-charge').value = spinning ? a.duration-elapsed : charge;
  $('ultimate-charge').setAttribute('aria-label', spinning ? '회전베기 남은 시간' : '궁극기 충전');
  $('ultimate-status').textContent = spinning ? `${a.stage}단계 ${a.stage===2?'흡입 회전':'회전베기'} · ${(a.duration-elapsed).toFixed(1)}초${a.extended>0?` · +${a.extended.toFixed(2)}초`:''}`
    : ready ? '궁극기 100/100 · 5 회전베기 준비' : `궁극기 ${charge}/100${recentGain?` · ${gain.route==='long'?'긴 마무리':gain.route==='short'?'짧은 마무리':'적중'} +${gain.amount}`:combo.failure&&charge>0?' · 연계가 끊겨도 충전 유지':charge>0?' · 모은 충전은 유지돼요':' · 짧게 두 번 / 길게 한 번'}`;
  for (const skill of WARRIOR_SKILLS) {
    const button = $('skill-' + skill.id), remaining = warrior.cooldowns[skill.id];
    button.disabled=false;
    const needsAxe = ['kick','sweep'].includes(skill.id) && !warrior.followup;
    const usedKick = skill.id === 'kick' && warrior.followup?.kicked;
    const recoverFirst = ['charge','slam'].includes(skill.id) && warrior.planted;
    const active = a?.id === skill.id, queued = warrior.queued?.id === skill.id;
    button.classList.toggle('active', active); button.classList.toggle('queued', queued);
    button.classList.toggle('unavailable', remaining > 0 || needsAxe || usedKick || recoverFirst || (skill.id==='spin'&&!ready&&!active));
    button.classList.toggle('ready', skill.id==='spin' && ready);button.classList.toggle('empowered', active && spinning && a.stage===2);
    button.style.setProperty('--cooldown', `${skill.cooldown ? remaining / skill.cooldown * 100 : 0}%`);
    $('skill-state-' + skill.id).textContent = active ? phaseLabels[skill.id] : queued ? '다음 동작' : skill.id==='spin' ? ready ? '사용 가능' : `${charge}/100` : remaining > 0 ? `${remaining.toFixed(1)}초` : usedKick ? '4번으로 마무리' : recoverFirst ? '도끼 회수 후' : needsAxe ? '내려찍기 후' : '준비';
  }
  const name = WARRIOR_SKILLS.find(s => s.id === a?.id)?.name;
  $('combo-title').textContent = a?.id === 'kick' && a.kickPower ? `날아차기 · ${a.kickPower.name} · ${a.kickPower.damage} 피해 / ${a.kickPower.distance}m 밀침` : name ?? (a?.id === 'slash' ? '기본 베기' : warrior.planted ? warrior.planted.kicked ? '뒤에 남은 도끼로 마무리' : '도끼가 박혔어요' : '양손 도끼 전사');
  $('combo-hint').textContent = warrior.queued ? `${WARRIOR_SKILLS.find(s=>s.id===warrior.queued.id).name} 예약됨${['kick','sweep'].includes(warrior.queued.id)?' · 발동 전 시점으로 방향 선택':''}`
    : a ? { charge: '2 내려찍기를 미리 눌러 이어 가세요', slam: '3 날아차기 또는 4 가로베기로 연계', kick: '앞으로 날아차기 → 4 가로베기로 마무리', sweep: elapsed < .52 ? '현재 위치에서 도끼를 끌어오기' : elapsed < .90 ? '낮게 버티고 크게 몸 틀기' : '온몸으로 휘두르는 넓은 가로베기', slash: a.automatic ? '근접 자동 공격 · 기술 입력이 우선해요' : '기본 공격 중', spin: a.stage===2 ? `끌어당기는 중 · 연속 ${a.streak}/3 · 다음 치명타까지 ${3-a.streak}회` : `연속 ${a.streak}/3 적중 → 흡입 강화 · WASD 이동` }[a.id]
    : warrior.planted ? `${warrior.planted.kicked ? '4로 긴 연계 마무리' : '4 짧게 마무리 / 3→4 길게 공격'} · ${warrior.planted.remaining.toFixed(1)}초`
    : warrior.carried ? `${warrior.carried.kicked ? '4 가로베기' : '4 짧게 / 3→4 길게'} · 회피 후 연계 · ${warrior.carried.remaining.toFixed(1)}초`
    : '2→4 +50 · 2→3→4 +100 · 1은 접근';
  $('combo-progress').style.width = `${a ? a.elapsed / a.duration * 100 : warrior.planted ? warrior.planted.remaining / (3.4+progression.bonuses.combo) * 100 : 0}%`;
}
function updateMageHUD(){
  const ready=mage.charge===100;
  $('critical-opening').hidden=true;$('ultimate-info').classList.toggle('ready',ready);$('ultimate-info').classList.toggle('empowered',mage.surge>0);
  $('ultimate-status').textContent=`잔불 ${'●'.repeat(mage.embers)}${'○'.repeat(2-mage.embers)} · ${mage.surge>0?`원소 해방 ${mage.surge.toFixed(1)}초`:ready?'5 원소 해방 준비':`원소 ${mage.charge}/100`}${mage.shield>0?` · 방벽 ${mage.shield}`:''}`;
  $('ultimate-charge').max=mage.surge>0?8+progression.bonuses.mageSurge:100;$('ultimate-charge').value=mage.surge>0?mage.surge:mage.charge;$('ultimate-charge').setAttribute('aria-label',mage.surge>0?'원소 해방 남은 시간':'원소 해방 충전');
  const tips=['2 서리창으로 적에게 표식을 남기세요','1 화염구로 서리 표식을 터뜨리세요','잔불 준비! 이동하면서 4 불꽃 쇄도','2 서리 → 1 화염 · 위험할 때 F 점멸 / 4 잔불'];
  $('combo-title').textContent='서리불꽃 마법사';$('combo-hint').textContent=mage.cast?`화염구 영창 ${(mage.cast.duration-mage.cast.elapsed).toFixed(1)}초 · 이동하면 취소`:tips[mage.tutorial];
  $('combo-progress').style.width=`${mage.cast?mage.cast.elapsed/mage.cast.duration*100:0}%`;
  MAGE_SKILLS.forEach((s,i)=>{const old=WARRIOR_SKILLS[i].id,b=$('skill-'+old),cd=mage.cooldowns[s.id],reason=mage.reason(s.id,player),active=s.id==='fireball'&&!!mage.cast||s.id==='surge'&&mage.surge>0;
    b.disabled=!started||paused||buildingMode||!!reason;b.classList.toggle('active',active);b.classList.remove('queued');b.classList.toggle('unavailable',!!reason);b.classList.toggle('ready',s.id==='surge'&&ready||s.id==='flare'&&mage.embers>0);b.classList.toggle('empowered',s.id==='surge'&&mage.surge>0);b.style.setProperty('--cooldown',`${s.cooldown?cd/s.cooldown*100:0}%`);
    $('skill-state-'+old).textContent=active?(s.id==='fireball'?'영창 중':`${mage.surge.toFixed(1)}초`):cd>0?`${cd.toFixed(1)}초`:s.id==='flare'?`잔불 ${mage.embers}/2`:s.id==='surge'?ready?'사용 가능':`${mage.charge}/100`:s.id==='fireball'&&Math.hypot(player.vx,player.vz)>.25&&mage.surge<=0?'멈춰서 영창':'준비';
  });
}
function updateHUD() {
  updateTacticsHUD();
  updateGrowthHUD();
  updateRaidHUD();
  const safe=village.isSafe(player),near=village.nearest(player);
  const nearby=raids.nearestArena(player);
  $('place-name').textContent=Math.hypot(player.x-nearby.x,player.z-nearby.z)<nearby.leash?nearby.name:safe?VILLAGE.name:'시작의 들판';
  $('gold-count').textContent=village.gold;
  $('potion-button').textContent=village.potionCooldown>0?`물약 ${village.potionCooldown.toFixed(1)}초`:`H 물약 ${village.potions}`;
  $('potion-button').disabled=!started||paused||hunting.hp<=0||hunting.hp>=hunting.maxHp||village.potions<1||village.potionCooldown>0;
  $('village-status').textContent=raids.active?'J 토벌 의뢰 · 전장을 벗어나면 전투 종료':safe?'솔바람 마을 · J 토벌 의뢰':`${nearby.name} ${Math.round(Math.hypot(player.x-nearby.x,player.z-nearby.z))}m · J 의뢰 / B 마을`;
  $('village-status').classList.toggle('safe',safe);
  $('interact-prompt').hidden=buildingMode||raids.active||!started||paused||!near||hunting.hp<=0;
  if(near)$('interact-label').textContent=`${near.name} · ${near.shop?'거래하기':'대화하기'}`;
  $('coordinates').textContent = `${player.x.toFixed(0)} / ${(-player.z).toFixed(0)}`;
  const speed = Math.hypot(player.vx, player.vz);
  $('motion-state').textContent = paused && started ? '잠시 쉬는 중' : !player.grounded ? (player.vy > 0 ? '뛰어오르는 중' : '내려오는 중') : speed > 6 ? '달리는 중' : speed > .2 ? '걷는 중' : '가만히 서 있는 중';
  updateHealthHUD();
  $('rabbit-count').textContent = hunting.kills.rabbit; $('slime-count').textContent = hunting.kills.slime;
  const automatic=!!(hunting.autoAttackRecovery || hunting.autoMelee.targetId),melee=['axe','sword'].includes(hunting.weapon);
  $('auto-attack-status').textContent=hunting.weapon==='staff'?'좌클릭 마력탄 · 이동 중 발사':!melee?'활 · 직접 조준해 발사':paused?'근접 자동 공격 · 대기':warrior.planted||(warrior.active&&warrior.active.id!=='slash')||(warrior.combo.step<4&&warrior.combo.remaining>0)?'자동 공격 · 기술 연계 대기':automatic?'근접 자동 공격 중':'근접 자동 공격 · 적 접근 시';
  $('auto-attack-status').classList.toggle('attacking',melee&&automatic&&!paused);
  if(safe)$('auto-attack-status').textContent='안전 지역 · 무기를 쉬게 해요';
  $('wood-count').textContent=forestry.wood;
  $('block-counts').textContent=Object.entries(BUILDING_BLOCKS).map(([k,b])=>`${b.short} ${village.blocks[k]}`).join(' · ');
  $('handle-state').textContent=`벌목 +${Math.round(forestry.bonus*100)}% · ${forestry.level}/3`;
  $('upgrade-handle').disabled=!started||hunting.hp<=0||forestry.cost===null||forestry.wood<forestry.cost;
  $('upgrade-handle').textContent=forestry.cost===null?'손잡이 강화 완료':`T 손잡이 강화 · 목재 ${forestry.cost}`;
  $('lumber-hint').textContent=forestry.felled===0?'나무도 1~5 기술로 벨 수 있어요':`나무 ${forestry.felled}그루 · 근처 목재 자동 줍기`;
  const aim = huntingView.aim();
  const target = hunting.targets().find(e => e.id === aim.entity && e.alive);
  $('target-info').hidden = !target || !started;
  $('crosshair').classList.toggle('on-target', !!target);
  if (target) { $('target-name').textContent = target.name??(target.kind==='tree'?(target.scale>=1.2?'굵은 소나무':'소나무'):target.kind === 'rabbit' ? '들토끼' : ['초록 슬라임', '파랑 슬라임', '보라 슬라임'][target.variant]); $('target-health').textContent = `${target.hp} / ${target.maxHp}`; $('target-opening').hidden = target.offBalance <= 0; $('target-opening').textContent=`${target.kind==='tree'?'균열':'비틀거림'} · 다음 적중 ${hunting.criticalMultiplier}배`; }
  updateWarriorHUD();
  if(target&&target.frostMark>0){$('target-opening').hidden=false;$('target-opening').textContent=`서리 ${target.frostMark.toFixed(1)}초 · 1 화염구로 파열`;}
  $('warrior-hud').hidden=buildingMode||safe;
  $('soldier-hint').hidden=!target?.raider||target.fieldBoss;
  if(target?.raider&&!target.fieldBoss){const role=SOLDIER_ROLES[soldierRole(target)];$('soldier-hint').textContent=target.battlecry>0?'전투 함성 중 · 강화가 끝날 때까지 거리 벌리기':target.guardBroken>0?'방패 무너짐 · 공격 기회!':`${role.name} · ${target.action?BATTLE[target.action.id].name+' 준비 · ':''}${role.hint}`;}
  if(safe){$('combo-title').textContent='솔바람 마을 · 안전 지역';$('combo-hint').textContent='주민 가까이 E 대화 · H 물약 · 서쪽 문으로 들판';for(const s of WARRIOR_SKILLS)$('skill-'+s.id).classList.add('unavailable');}
}
function handleCombatEvents() {
  for (const event of hunting.events.splice(0)) {
    audio.event(event);
    if(event.type.startsWith('mage-')){
      mageView.effect(event);
      if(event.type==='mage-ready')notify('원소 해방 준비! 5번으로 8초간 화염구를 즉시 시전하세요.');
      if(event.type==='mage-shatter'||event.type==='mage-absorb'){
        const el=document.createElement('span');el.className='damage-number mage-feedback';el.textContent=event.type==='mage-shatter'?'서리 파열 · 잔불 +1':`방벽 흡수 ${event.amount}`;$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(event.x??player.x,event.y??player.y+2.2,event.z??player.z),life:.9});
      }
    }
    if(event.type==='soldier-impact'&&event.skill!=='shot')warriorView.effect(event);
    if(event.type==='guard-break'||event.type==='guard-block'){const el=document.createElement('span');el.className='damage-number guard-feedback';el.textContent=event.type==='guard-break'?'방패 무너짐':'정면 방어';$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(event.x,event.y,event.z),life:.65});}
    if(event.type==='xp-earned'){const el=document.createElement('span');el.className='damage-number xp-reward';el.textContent=`+${event.amount} XP`;$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(player.x+.6,player.y+2.6,player.z),life:1.1});}
    if(event.type==='level-up'){notify(`레벨 ${event.level}! 체력 회복 · P에서 특성 ${event.points}점 선택`);if($('talents-dialog').open)renderTalents();}
    if(event.type==='raid-notice'||(event.type==='boss-warning'&&['arrival','exposed','miss'].includes(event.pattern)))notify(event.message);
    else if(event.type==='hurt'){
      playerFeedback.hit(event);
      if(!reduceMotion)cameraShake=Math.max(cameraShake,.07);
    }
    else if(event.type==='boss-impact'){huntingView.particleBurst({...event,kind:'impact'});if(!reduceMotion)cameraShake=Math.max(cameraShake,.035);}
    else if(event.type==='raid-result'){notify(event.message);if(hunting.hp>0)openBattle();}
    else if(event.type==='ally-heal'||event.type==='ally-hit'){
      const el=document.createElement('span');el.className='damage-number '+(event.type==='ally-heal'?'ally-heal':'ally-damage');el.textContent=event.type==='ally-heal'?`+${event.amount}`:`−${event.damage}`;$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(event.x,event.y,event.z),life:.7});
    }else if (event.type === 'hit') {
      if(event.source!=='ally')hitFeedback = event.critical ? .3 : .18;
      const el = document.createElement('span'); el.className = event.critical ? 'damage-number critical' : event.kickPower ? `damage-number kick-${event.kickPower}` : 'damage-number'; el.textContent = event.critical ? `치명타 ${event.damage}` : event.kickPower ? `${event.powerName} · ${event.damage}` : event.damage; $('combat-fx').appendChild(el);
      floatingHits.push({ el, position: new THREE.Vector3(event.x, event.y + .25, event.z), life: event.critical ? 1.15 : .85 });
      huntingView.particleBurst(event.critical ? { ...event, kind: 'impact' } : event);
    } else if (event.type === 'off-balance') {
      const el = document.createElement('span'); el.className = 'damage-number off-balance'; el.textContent = event.kind==='tree'?`균열 · 다음 공격 ${hunting.criticalMultiplier}배`:'비틀거림'; $('combat-fx').appendChild(el);
      floatingHits.push({ el, position: new THREE.Vector3(event.x, event.y + .8, event.z), life: 1 });
    } else if (event.type === 'warrior-impact') {
      warriorView.effect(event); huntingView.particleBurst({ ...event, y: event.y + .2, kind: 'impact' });
      impactPause = Math.max(impactPause,event.skill==='slam'?.075:event.skill==='kick'?(event.kickPower==='strong'?.10:.055):event.skill==='sweep'?.095:0);
      if (!reduceMotion) cameraShake = event.skill === 'slam' ? .13 : event.skill==='kick' ? event.kickPower==='strong'?.15:.09 : event.skill==='sweep'?.18:.032;
    } else if (event.type === 'ultimate-ready') notify('궁극기 충전 완료! 원하는 순간 5번 회전베기를 쓰세요.');
    else if (event.type === 'spin-stage') { notify('회전베기 2단계 · 주변 적을 끌어당겨요!'); if(!reduceMotion) cameraShake=.07; }
    else if (event.type === 'spin-pulse' && event.extension>0) {
      const el=document.createElement('span');el.className='damage-number spin-extension';el.textContent=`+${event.extension.toFixed(2)}초`;$('combat-fx').appendChild(el);
      floatingHits.push({el,position:new THREE.Vector3(event.x+.7,event.y+2.6,event.z),life:.6});
    } else if(event.type==='tree-felled') {
      huntingView.particleBurst({...event,type:'defeat',kind:'tree'});
      if(!reduceMotion)cameraShake=Math.max(cameraShake,.07);
      notify(`나무를 베었어요 · 목재 ${event.wood}개${event.bonus?' (치명타 보너스 +2)':''}`);
    } else if(event.type==='gold-earned') {
      const el=document.createElement('span');el.className='damage-number gold-reward';el.textContent=`+${event.amount} 골드`;$('combat-fx').appendChild(el);
      floatingHits.push({el,position:new THREE.Vector3(event.x,event.y+.3,event.z),life:1.1});
    } else if(event.type==='wood-collected') {
      village.save();
      if(woodReceipt&&woodReceipt.life>0){woodReceipt.amount+=event.amount;woodReceipt.life=.9;}
      else {
        const el=document.createElement('span');el.className='damage-number wood-reward';$('combat-fx').appendChild(el);
        woodReceipt={el,position:new THREE.Vector3(event.x+.7,event.y+.4,event.z),life:.9,amount:event.amount};floatingHits.push(woodReceipt);
      }
      woodReceipt.el.textContent=`목재 +${woodReceipt.amount}`;
    } else if(event.type==='lumber-upgrade')notify(`손잡이 ${event.level}단계 · 도끼 벌목 피해 +${event.bonus}%`);
    else if (event.type === 'swing') huntingView.swingEffect(event);
    else if (['defeat', 'impact', 'spawn'].includes(event.type)) huntingView.particleBurst(event);
    else if (event.type === 'player-defeat') { setPaused(true); $('defeat').hidden = false; $('resume').hidden = true; }
  }
}
function updateHealthHUD() {
  const hp=Math.ceil(hunting.hp),max=hunting.maxHp;
  playerFeedback.update(0,hunting.hp,max);const low=playerFeedback.lowHealth;
  $('health-value').textContent=`${hp} / ${max}`;
  $('health-fill').style.width=`${hunting.hp/max*100}%`;
  $('health-loss').style.width=`${Math.min(max,Math.max(hunting.hp,playerFeedback.trailHealth))/max*100}%`;
  $('health-meter').setAttribute('aria-valuenow',String(hp));$('health-meter').setAttribute('aria-valuemax',String(max));
  $('health-fill').style.background=low?'#f28b7d':'#b3dc94';
  $('health-state').textContent=low?'위험':'체력';
  const vitals=$('health-meter').closest('.vitals');
  vitals.classList.toggle('low-health',low);vitals.classList.toggle('taking-hit',playerFeedback.flash>0&&!paused);
  const notice=playerFeedback.notice;
  const receipt=notice?`−${notice.damage} · ${notice.source}`:low?(village.potions>0?(village.potionCooldown>0?'체력 위험 · 물약 재사용 대기':'체력 위험 · H 물약'):'체력 위험 · 공격을 피하세요'):'';
  if($('health-receipt').textContent!==receipt){$('health-receipt').textContent=receipt;$('health-receipt').title=receipt;}
}
function combatFeedback(dt) {
  if (!paused) hitFeedback = Math.max(0, hitFeedback - dt);
  $('crosshair').classList.toggle('hit', hitFeedback > 0);
  playerFeedback.update(paused?0:dt,hunting.hp,hunting.maxHp);updateHealthHUD();
  const notice=playerFeedback.notice;
  $('incoming-hit').hidden=!notice||notice.remaining<=0||paused||!started;
  if(notice){$('incoming-amount').textContent=`−${notice.damage}`;$('incoming-source').textContent=notice.source;$('incoming-hit').style.opacity=String(Math.min(1,notice.remaining/.3));}
  $('damage-flash').style.opacity=String(paused?0:reduceMotion?playerFeedback.flash/.52*.22:Math.min(1,playerFeedback.flash/.2)*.8);
  $('cooldown-fill').style.width = `${Math.max(0, 1 - (hunting.weapon === 'bow' ? hunting.cooldown / .45 : hunting.meleeCooldown / hunting.meleeInterval)) * 100}%`;
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
    const held = Math.min(impactPause,dt); impactPause -= held;
    accumulator += dt - held;
    while (accumulator >= 1 / 120) {
      updateInput(1 / 120); player.update(1 / 120, input); hunting.update(1 / 120, player); raids.update(1 / 120,player); village.update(1 / 120,player); hunting.autoAttack(player); accumulator -= 1 / 120;
      if (hunting.hp <= 0) break;
    }
  }
  animateAvatar(dt, time); forestryView.update(player);villageView.update(player);updateCamera(dt);raidView.update(dt);mirrorView.update(dt);buildingView.update(buildingMode&&!paused,buildMaterial,player);
  handleCombatEvents(); huntingView.update(dt, firstPerson, avatar, paused); warriorView.update(dt, firstPerson, player, paused); mageView.update(dt,firstPerson,player,paused);combatFeedback(dt);
  battleAura.visible=hunting.tactics.battlecry>0&&hunting.hp>0;battleAura.position.set(player.x,player.y+.045,player.z);battleAura.scale.setScalar(1.4+Math.sin(hunting.time*8)*.08);
  if(hunting.tactics.dodge){const d=hunting.tactics.dodge;avatar.root.rotation.y=Math.atan2(d.dx,d.dz);if(!firstPerson){avatar.body.rotation.x=d.elapsed/BATTLE.evade.duration*Math.PI*2;avatar.body.position.y=.2;}}
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
renderAudio();equipWeapon(hunting.classId==='mage'?'staff':'axe'); forestryView.update(player);villageView.update(player);updateHUD();updateCamera(1, true); animateAvatar(0, 0); huntingView.update(0, firstPerson, avatar, true); warriorView.update(0, firstPerson, player, true);mageView.update(0,firstPerson,player,true); renderer.render(scene, camera);
loading.hidden = true; $('welcome').hidden = false;
requestAnimationFrame(frame);

// Optional WebMCP support: these call the same actions as the visible controls.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const state = () => ({
    position: { x: +player.x.toFixed(3), y: +player.y.toFixed(3), z: +player.z.toFixed(3) },
    grounded: player.grounded, view: firstPerson ? 'first' : 'third',
    camera: {yaw:+yaw.toFixed(4),pitch:+pitch.toFixed(4),mouseLocked:locked},
    paused, started, health: Math.ceil(hunting.hp), maxHealth:hunting.maxHp, weapon: hunting.weapon, kills: { ...hunting.kills },
    progression:progression.state(),audio:audio.state(),building:{enabled:buildingMode,material:buildMaterial,...building.state(),candidate:buildingView.candidate,placementReason:buildingView.reason??null},
    bow: { drawing: hunting.drawing, charge: +hunting.charge.toFixed(3), arrowsInFlight: hunting.arrows.length, shotsFired: hunting.nextArrow - 1, lastShotCharge: hunting.lastCharge },
    classId:hunting.classId,mage:mage.state(),warrior: warrior.state(),tactics:hunting.tactics.state(),
    forestry: forestry.state(player),
    village:{...village.state(player),talkingTo},
    raids:raids.state(),
    combat: { criticalHits: hunting.criticalHits, lastHit: hunting.lastHit ? { ...hunting.lastHit } : null,
      autoMelee: { enabled:['axe','sword'].includes(hunting.weapon),...hunting.autoMelee,intervalSeconds:hunting.meleeInterval,cooldown:+hunting.meleeCooldown.toFixed(3),attacking:!!(hunting.autoAttackRecovery&&(warrior.active?.id==='slash'||hunting.swing>0)) } },
    creatures: hunting.entities.map(e => ({id:e.id,kind:e.kind,health:e.hp,alive:e.alive,offBalanceSeconds:+e.offBalance.toFixed(2),knockback:e.knockback?{power:e.knockback.id,progress:+(e.knockback.elapsed/e.knockback.duration).toFixed(2)}:null,lastPush:e.lastPush?{...e.lastPush,travelled:+e.lastPush.travelled.toFixed(2)}:null,position:{x:+e.x.toFixed(2),y:+(e.y+e.hop).toFixed(2),z:+e.z.toFixed(2)}})),
  });
  const validateEmpty = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error('Expected an empty object.');
  };
  const tools = [
    {name:'select_character_class',title:'전사 또는 마법사 전직',description:'Choose warrior or frostfire mage while safely in the village, matching the L class menu. Shares level and wealth, saves separate talents, clears combat resources without healing.',inputSchema:{type:'object',properties:{classId:{type:'string',enum:['warrior','mage']}},required:['classId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='classId'))throw new Error('Choose classId.');const r=chooseClass(input.classId);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'use_mage_skill',title:'마법사 주문 사용',description:'Use the same mage controls: fireball (1, stationary 0.8s cast; movement cancels for free), frost (2, frost mark), ring (3, nearby frost and ordinary-enemy root), flare (4, spend one stored ember), surge (5, spend 100 charge for instant fireballs), blink (F, collision checked), barrier (6, absorb damage). Frost then fireball grants one ember, up to two, preserved while moving. Aim follows the camera; range 12m; walls block spells. Requires active unpaused mage play.',inputSchema:{type:'object',properties:{skill:{type:'string',enum:[...MAGE_SKILLS.map(s=>s.id),'blink','barrier']},direction:{type:'string',enum:['movement','forward','back','left','right']}},required:['skill'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||![...MAGE_SKILLS.map(s=>s.id),'blink','barrier'].includes(input.skill)||Object.keys(input).some(k=>!['skill','direction'].includes(k))||(input.direction&&!['movement','forward','back','left','right'].includes(input.direction)))throw new Error('Choose mage skill and optional direction.');const r=useMageSkill(input.skill,input.direction);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'use_tactical_skill',title:'회피 또는 전투 함성',description:'Use the visible F dodge or 6 battle cry. Dodge follows held movement or the camera direction, cancels the current animation but preserves landed combo steps and a prepared ultimate, pauses the combo timer with at least two seconds after landing, allows one queued skill, and has a four-second cooldown. Battle cry lasts six seconds with +35% outgoing and -25% incoming damage; cooldown thirty seconds. Paused play and build mode reject both. Direction matches WASD relative to the camera.',inputSchema:{type:'object',properties:{skill:{type:'string',enum:['evade','battlecry']},direction:{type:'string',enum:['movement','forward','back','left','right']}},required:['skill'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!['evade','battlecry'].includes(input.skill)||Object.keys(input).some(k=>!['skill','direction'].includes(k))||(input.direction&&!['movement','forward','back','left','right'].includes(input.direction)))throw new Error('Choose evade or battlecry and a movement direction.');const r=useTactic(input.skill,input.direction);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'open_talents',title:'전사 특성 열기',description:'Open the same P talent tree visible in the game. Pauses play.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=openTalents();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'learn_talent',title:'특성 배우기',description:'Spend one earned point in the open talent tree. Uses the same level, prerequisite and combat restrictions as the visible buttons.',inputSchema:{type:'object',properties:{talent:{type:'string',enum:TALENTS.map(t=>t.id)}},required:['talent'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!$('talents-dialog').open||!input||Object.keys(input).some(k=>k!=='talent'))throw new Error('Open the talent tree first.');const r=learnTalent(input.talent);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'set_build_mode',title:'건축 모드 전환',description:'Use the same K build mode. Only available in the peaceful village after play begins.',inputSchema:{type:'object',properties:{enabled:{type:'boolean'}},required:['enabled'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.enabled!=='boolean'||Object.keys(input).some(k=>k!=='enabled'))throw new Error('Choose enabled.');const r=toggleBuild(input.enabled);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'travel_to_build_plot',title:'건축 부지로 이동',description:'Use the visible build panel plot selector and travel button. Requires build mode, no combat and closed dialogs.',inputSchema:{type:'object',properties:{plot:{type:'string',enum:BUILD_PLOTS.map(p=>p.id)}},required:['plot'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!buildingMode||!input||Object.keys(input).some(k=>k!=='plot'))throw new Error('Open build mode first.');const r=travelToPlot(input.plot);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'place_aimed_block',title:'블록 설치',description:'Place one selected inventory block at the current green aim preview, matching left click. Checks plot limits, range, occupancy and support.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=buildAction();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'recover_aimed_block',title:'블록 회수',description:'Recover the player-built block currently aimed at, returning exactly one block to inventory. Matches right click.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=buildAction(true);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'open_hunt_journal',title:'토벌 의뢰 열기',description:'Open the visible J hunt journal and pause play.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=openBattle();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'select_field_hunt',title:'토벌 대상 선택',description:'Choose Varkan or Lysea in the open J journal. Each has its own arena, quest, rewards and records. Unavailable during a hunt. Lysea uses pillar cover, rotating beams and shadow-bearing mirror doubles.',inputSchema:{type:'object',properties:{boss:{type:'string',enum:['varkan','lysea']}},required:['boss'],additionalProperties:false},execute(input){if(!input||!['varkan','lysea'].includes(input.boss)||Object.keys(input).some(k=>k!=='boss'))throw new Error('Choose varkan or lysea.');const r=selectHunt(input.boss);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'accept_field_quest',title:'선택한 토벌 의뢰 받기',description:'Accept the first outdoor boss quest from the open journal while in the village.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){validateEmpty(input);const r=questAction('accept');if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'travel_to_field_boss',title:'선택한 보스 지역으로 이동',description:'Travel using the open journal. Requires accepted quest and no active combat or skill. Arrives in the selected boss arena; does not start combat.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){validateEmpty(input);const r=travelToHunt();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'start_field_hunt',title:'선택한 보스에게 도전',description:'Start the outdoor boss directly using the open hunt journal, while in the basin. Choose solo or Nari with three limited heals. Same rules as the visible button.',inputSchema:{type:'object',properties:{companion:{type:'string',enum:['none','nari']}},required:['companion'],additionalProperties:false},execute(input){if(!input||!['none','nari'].includes(input.companion)||Object.keys(input).some(k=>k!=='companion'))throw new Error('Choose none or nari.');$('hunt-companion').value=input.companion;const r=startBattle('field');if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'claim_hunt_reward',title:'첫 토벌 의뢰 보상',description:'Claim the one-time quest reward in the village with the journal open after defeating the selected boss.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){validateEmpty(input);const r=questAction('claim');if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'rally_residents',title:'주민 집결 또는 교전',description:'Toggle G between rallying near the player and fighting nearby enemies. Requires an active unpaused battle. Matches the visible resident command button.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=rallyResidents();if(!r.accepted)throw new Error(r.reason);return state();}},
    { name: 'get_player_state', title: '캐릭터 상태 확인', description: 'Read player, combat, warrior and forestry state: wood inventory, handle upgrade, nearby trees with health, cracks and regrowth, and dropped wood. Includes combo progress, ultimate readiness, spin statistics, creatures and autoMelee attack count. While playing, axe and sword automatically attack the nearest living creature within their normal melee reach and unobstructed height. Auto swings preserve movement and give way to skill inputs; auto attack waits during skills, planted-axe follow-ups and unfinished combo windows. Trees do not initiate auto attacks; bows remain manual.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) { validateEmpty(input); return state(); } },
    { name:'travel_to_village',title:'솔바람 마을로 이동',description:'Go to the village square, matching B and the village button. Requires no active attack, planted axe, recent damage or nearby hostile slime. Also starts play from the welcome screen.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=travelToVillage();if(!r.accepted)throw new Error(r.reason);return state();}},
    { name:'talk_to_resident',title:'주민과 대화',description:'Open the dialogue of a nearby unobstructed resident within 2.9m, matching E. Read resident ids from get_player_state. Pauses combat and movement during dialogue.',inputSchema:{type:'object',properties:{resident:{type:'string'}},required:['resident'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.resident!=='string'||Object.keys(input).some(k=>k!=='resident'))throw new Error('resident must be an id.');const r=openResident(input.resident);if(!r.accepted)throw new Error(r.reason);return state();}},
    { name:'trade_with_resident',title:'상인과 거래',description:'Use an offer displayed in the currently open resident dialogue. Read offer ids from get_player_state. Checks proximity, stock and price on every transaction.',inputSchema:{type:'object',properties:{offer:{type:'string'}},required:['offer'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.offer!=='string'||Object.keys(input).some(k=>k!=='offer'))throw new Error('offer must be an id.');const r=tradeWithResident(input.offer);if(!r.accepted)throw new Error(r.reason);return {...r,...state()};}},
    { name:'use_healing_potion',title:'회복 물약 사용',description:'Use one owned potion to restore up to 45 HP, matching H. Requires active play, missing HP and a 4 second cooldown.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=usePotion();if(!r.accepted)throw new Error(r.reason);return {...r,...state()};}},
    { name: 'upgrade_axe_handle', title: '벌목 손잡이 강화', description: 'Spend collected wood to improve axe damage against trees only, matching T and the visible upgrade button. Costs 12, 24, 36 wood; each level adds 15%, maximum 45%. Requires play to have started and a living player. Gold, potions, armor, wood and handle upgrades save in this browser and survive page reload when storage is available.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){validateEmpty(input);const result=upgradeHandle();if(!result.accepted)throw new Error(result.reason);return {...result,forestry:forestry.state(player)};} },
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
    { name: 'equip_weapon', title: '직업 무기 장착', description: 'Equip axe, sword or bow as warrior, or staff as mage, matching the visible weapon buttons. Change class only in the village with the L menu. Switching warrior weapons cancels a planted axe and any active skill.',
      inputSchema: { type: 'object', properties: { weapon: { type: 'string', enum: ['axe', 'sword', 'bow','staff'] } }, required: ['weapon'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !['axe', 'sword', 'bow','staff'].includes(input.weapon) || Object.keys(input).some(k => k !== 'weapon')) throw new Error('Choose axe, sword, bow or staff.');
        if(!equipWeapon(input.weapon))throw new Error('Choose the matching class in the village first.'); return state();
      } },
    { name: 'attack_with_weapon', title: '기본 공격 또는 마력탄', description: 'Match left click: swing an axe or sword, or fire a staff magic bolt while moving. For a bow use begin_bow_draw then release_bow_draw. Requires active play and a ready weapon.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); if (!attack()) throw new Error('Equip a ready axe or sword and resume play. Recover a planted axe with skill 4. For the bow, begin and release a draw.'); return { attacked: true, weapon: hunting.weapon }; } },
    { name: 'use_warrior_skill', title: '전사 기술 사용', description: 'Use an equipped-axe skill: 1 charge, 2 slam, 3 kick, 4 sweep, 5 spin ultimate. Kick and sweep need the planted axe or a follow-up carried through dodge/brief stagger and lock their travel and hit direction to the current camera heading when each skill actually starts, including queued follow-ups. Turning during the previous skill redirects only the next kick or sweep; charge and slam keep their existing direction rules. The planted axe stays at its original world anchor. Kick leaps forward, rolling light/medium/strong PRD power: 18/26/36 damage, 3/4.5/6m knockback. Targets become off balance for one double-damage hit within 4 seconds. Sweep recalls the axe without retreating and lunges forward. Successful hits charge a 0–100 ultimate meter once per cast, never per target: charge +10, slam/kick/sweep +20 each. A connected slam → sweep adds a +10 finish bonus (50 total); slam → kick → sweep adds +40 (100 total). Charge is optional for approaching distant targets. At 100, one spin is stored until used. Misses, wrong order, weapon switching, axe retrieval, or waiting over 3 seconds after a skill ends break an unfinished combo. Rejected inputs and ordinary damage do not; dodge or brief stagger preserves landed steps, freezes the timer during the interruption, and allows one buffered skill. Dodge grants at least two seconds afterward. The axe is retrieved and either a held-axe sweep or kick can continue after slam. Cancelling before impact permits a retry; misses never earn credit. Heavy stagger of at least .65 seconds cancels an unfinished combo, while all earned charge stays stored. Misses, timeouts, movement, weapon changes and ordinary cancellations never remove earned charge. Spin consumption, death, R and page reload reset it; spin itself does not charge the meter. The four player animations total 3.2 seconds; enemy warning times are unchanged. Spin lasts 2.5s, hits all directions every .25s, and allows movement. Every third consecutive connected pulse is 2x critical; the first such pulse upgrades to stage 2, pulling nearby visible enemies inward. A missed pulse resets the streak. Critical pulses add .25s once each, kills add .5s each, total duration caps at 4s. No damage or pull through walls. Trees also accept the same attacks, combo and spin hits. Kick cracks trees for the next critical without moving them; stage 2 pulls dropped wood. Felling a tree gives the same spin duration bonus as a defeat. One valid follow-up may be queued. Returns actual state; actions advance in real time.',
      inputSchema: { type: 'object', properties: { skill: { type: 'string', enum: ['charge','slam','kick','sweep','spin'] } }, required: ['skill'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !WARRIOR_SKILLS.some(s=>s.id===input.skill) || Object.keys(input).some(k=>k!=='skill')) throw new Error('skill must be charge, slam, kick, sweep or spin.');
        const result = useWarriorSkill(input.skill, false); if (!result.accepted) throw new Error(result.reason); return { ...result, ...state() };
      } },
    { name: 'begin_bow_draw', title: '활 당기기', description: 'Begin holding the equipped bow, matching left mouse down. Hold up to 1.05 seconds for full power. Does not fire until release_bow_draw.',
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
