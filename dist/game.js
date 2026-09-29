import * as THREE from './vendor/three.module.js';
import { Movement, terrainHeight } from './movement.js';
import { createEnvironment, createAvatar } from './environment.js';
import { Hunting } from './combat.js';
import { HuntingView } from './hunting-view.js';
import { WARRIOR_SKILLS } from './warrior.js';
import { WarriorView } from './warrior-view.js';
import { ForestryView } from './forestry-view.js';
import { Village } from './village.js';
import { VILLAGE, BUILDING_BLOCKS, BUILD_PLOTS, plotAt } from './village-data.js';
import { createVillageScenery, VillageView } from './village-view.js';
import { Raids } from './raids.js';
import { createRaidScenery, RaidView } from './raid-view.js';
import { TALENTS, TALENT_BRANCHES } from './progression.js';
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
const raidScenery=createRaidScenery(scene,environment);
const avatar = createAvatar(scene);
const player = new Movement(environment.colliders);
const hunting = new Hunting(environment.colliders, environment.trees);
const forestry = hunting.forestry;
let localSave=null;try{localSave=window.localStorage;}catch{/* Private browsing may disable storage. */}
const village=new Village(hunting,localSave);
const progression=village.progression;
const audio=new GameAudio(localSave);
const building=new Building(village,environment.colliders);
const buildingView=new BuildingView(scene,camera,environment,building);
const villageView=new VillageView(scene,camera,village);
const forestryView = new ForestryView(scene,camera,forestry,environment.trees);
const huntingView = new HuntingView(scene, camera, avatar, hunting, environment);
const raids=new Raids(hunting,village);
const raidView=new RaidView(scene,camera,raids,villageView,huntingView,raidScenery);
const warrior = hunting.warrior;
const warriorView = new WarriorView(scene, camera, avatar, warrior);
const battleAura=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),new THREE.MeshBasicMaterial({color:0xffc363,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));battleAura.rotation.x=-Math.PI/2;battleAura.visible=false;scene.add(battleAura);
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
  const result=hunting.tactics.request(id,player,tacticDirection(direction));
  if(result.accepted){if(id==='evade')clearDrawOwner();else notify('전투 함성 · 6초간 피해 +35% · 받는 피해 −25%');}else notify(result.reason);
  updateHUD();return result;
}
function updateTacticsHUD(){
  const t=hunting.tactics;
  for(const id of ['evade','battlecry']){const button=$('tactic-'+id),active=id==='evade'?!!t.dodge:t.battlecry>0,seconds=t.cooldowns[id];button.classList.toggle('active',active);button.disabled=!started||paused||buildingMode||!!t.reason(id,player);button.style.setProperty('--cooldown',`${seconds/BATTLE[id].cooldown*100}%`);$('tactic-state-'+id).textContent=active?(id==='evade'?'회피 중':`${t.battlecry.toFixed(1)}초 강화`):seconds>0?`${seconds.toFixed(1)}초`:'준비';}
  $('tactics-status').textContent=t.stagger>0?'경직 · 잠시 후 행동 가능':t.battlecry>0?'공격 +35% · 받는 피해 −25%':'F 이동 방향으로 회피 · 6 중요한 순간에 함성';
}
function talentReason(reset=false){
  if(hunting.hp<=0)return '먼저 다시 일어나 주세요.';
  if(raids.active||hunting.tactics.busy||hunting.sinceHit<6||warrior.active||warrior.planted||hunting.drawing)return '전투와 동작을 마친 뒤 특성을 골라 주세요.';
  if(reset&&!village.isSafe(player))return '마을 안에서 무료로 다시 고를 수 있어요.';
  return null;
}
function learnTalent(id){const reason=talentReason();const result=reason?{accepted:false,reason}:progression.learn(id);renderTalents();$('talent-message').textContent=result.message??result.reason;updateHUD();return result;}
function resetTalents(){const reason=talentReason(true);const result=reason?{accepted:false,reason}:progression.reset();renderTalents();$('talent-message').textContent=result.message??result.reason;updateHUD();return result;}
function renderTalents(){
  const s=progression.state();$('talent-level').textContent=`레벨 ${s.level} / 10`;$('talent-xp').textContent=s.required?`${s.current} / ${s.required} XP`:'최고 레벨 달성';$('talent-points').textContent=`남은 포인트 ${s.points}`;
  const tree=$('talent-tree');tree.replaceChildren();
  for(const branch of TALENT_BRANCHES){
    const column=document.createElement('section');column.className='talent-branch';column.style.setProperty('--branch-color',branch.color);
    const heading=document.createElement('h3');heading.textContent=branch.name;const detail=document.createElement('p');detail.className='branch-detail';detail.textContent=branch.detail;column.append(heading,detail);
    for(const t of TALENTS.filter(t=>t.branch===branch.id)){
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
function updateGrowthHUD(){const s=progression.state();$('player-level').textContent=`Lv. ${s.level} 전사`;$('xp-meter').max=s.required||1;$('xp-meter').value=s.required?s.current:1;$('xp-value').textContent=s.required?`${s.current} / ${s.required} XP`:'최고 레벨';$('talent-badge').hidden=s.points===0;$('talent-badge').textContent=s.points;
  if(buildingMode){for(const k of Object.keys(BUILDING_BLOCKS))$('build-'+k).textContent=village.blocks[k];$('build-count').textContent=`${building.blocks.size} / 600 블록`;$('build-title').textContent=plotAt(player.x,player.z)?.name??'나의 건축 부지';$('build-hint').textContent=buildingView.candidate?buildingView.reason??'초록색 칸 · 좌클릭으로 설치할 수 있어요.':'화면 가운데 조준점을 건축 부지에 맞춰 주세요.';}
}
function clearInput() { cancelBowDraw(); warrior.queued = null; keys.clear(); touchX = touchZ = 0; dragging = null; $('stick').style.transform = ''; }
function capturePointer(element, pointerId) {
  // Embedded browsers can reject capture while pointer lock is changing.
  try { element.setPointerCapture(pointerId); } catch { /* Dragging still works inside the play area. */ }
}
function setPaused(value) {
  paused = value; clearInput(); accumulator = 0;
  $('resume').hidden = !value || !started || menuOpen() || hunting.hp <= 0;
  audio.setPlaying(!value&&started);
  if (value && document.pointerLockElement) document.exitPointerLock();
}
async function lockMouse() {
  if (coarsePointer || document.pointerLockElement) return;
  try {
    if (!renderer.domElement.requestPointerLock) throw new Error('unsupported');
    await renderer.domElement.requestPointerLock();
  } catch {
    notify('우클릭 드래그로 시점 회전 · 1~4 연계 · 5 궁극기 · 좌클릭 기본 공격');
  }
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
  hunting.restorePlayer(); avatar.root.rotation.y = Math.PI;
  hunting.inSanctuary=false;
  impactPause = 0;
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
  $('weapon-hint').textContent = axe ? '2초마다 자동 공격 · 1~5 기술' : bow ? '좌클릭 꾹 당기기 · 놓으면 발사' : '2초마다 자동 공격 · 좌클릭 직접 베기';
  $('warrior-hud').hidden = !axe;
  $('touch-attack').textContent = bow ? '당기기' : '공격';
  $('touch-attack').setAttribute('aria-label', bow ? '누르고 활 당기기, 놓으면 발사' : axe ? '도끼 기본 공격' : '칼로 공격');
  if (bow && pitch > .10) pitch = .08;
  updateCamera(1, true); world.focus({ preventScroll: true });
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
  updateCamera(1,true);animateAvatar(0,0);updateHUD();world.focus({preventScroll:true});
  notify('솔바람 마을 · 가까운 주민에게 E로 대화해 보세요.');return {accepted:true};
}
function usePotion() {
  const result=!started||paused?{accepted:false,reason:'플레이를 이어 간 뒤 물약을 사용해 주세요.'}:village.usePotion();
  notify(result.message??result.reason);updateHUD();return result;
}
function renderBattle(){
  for(const mode of ['defense','assault'])$('start-'+mode).disabled=!!raids.startReason(mode,player);
  const r=raids.result;$('battle-result').hidden=!r;
  if(r)$('battle-result').textContent=r.won?`${r.mode==='defense'?'방어 성공':'야영지 정리 완료'} · +${r.reward.gold} 골드 · ${r.mode==='defense'?'나무 10 · 돌 5':'돌 10 · 지붕 5'} 블록`:`전투 종료 · ${r.reason} 주민들은 모두 회복했어요.`;
  $('battle-reason').textContent=raids.active?'전투 진행 중 · 메뉴를 닫으면 계속됩니다.':raids.startReason('defense',player)??`준비 완료 · 방어 ${village.raidWins.defense}승 / 출정 ${village.raidWins.assault}승 · 시작하면 8초간 준비해요.`;
  $('retreat-button').hidden=!raids.active;
}
function openBattle(){
  if(menuOpen())return {accepted:false,reason:'열린 메뉴를 먼저 닫아 주세요.'};
  renderBattle();if(!$('battle-dialog').open)$('battle-dialog').showModal();setPaused(true);return {accepted:true};
}
function startBattle(mode){
  if(!$('battle-dialog').open)return {accepted:false,reason:'J 전투 메뉴를 먼저 열어 주세요.'};
  const result=raids.start(mode,player);if(!result.accepted){notify(result.reason);renderBattle();return result;}
  if(buildingMode)toggleBuild(false);
  started=true;$('welcome').hidden=true;$('crosshair').hidden=false;$('battle-dialog').close();setPaused(false);
  yaw=Math.PI/2;pitch=.34;cameraDistance=10;avatar.root.rotation.y=-Math.PI/2;impactPause=0;
  updateCamera(1,true);animateAvatar(0,0);updateHUD();world.focus({preventScroll:true});return result;
}
function rallyResidents(){
  const result=!started||paused?{accepted:false,reason:'플레이를 이어 가 주세요.'}:raids.toggleOrder();notify(result.message??result.reason);updateHUD();return result;
}
function updateRaidHUD(){
  $('raid-hud').hidden=!raids.active;document.body.classList.toggle('raid-active',raids.active);
  if(!raids.active)return;
  const s=raids.state();$('raid-mode').textContent=s.mode==='defense'?'솔바람 마을 방어':'붉은발 야영지 공격';$('raid-wave').textContent=s.mode==='defense'?`${s.wave} / 2차`:'원정대';
  $('raid-objective').textContent=s.phase==='preparing'?`전투 시작까지 ${Math.ceil(s.timer)}초 · 자리 잡기`:s.phase==='interval'?`다음 습격까지 ${Math.ceil(s.timer)}초`:`남은 적 ${s.remaining}명 · ${s.mode==='defense'?'수호 깃발을 지키세요':'대장과 부하를 처치하세요'}`;
  $('beacon-status').hidden=s.mode!=='defense';$('beacon-health').value=s.beaconHp;$('beacon-value').textContent=s.beaconHp;
  $('rally-button').textContent=s.order==='fight'?'G  내게 모이기':'G  다시 교전하기';$('rally-button').setAttribute('aria-pressed',String(s.order==='rally'));
  const list=$('raid-allies');list.replaceChildren();
  for(const a of s.allies){const row=document.createElement('div');row.className='raid-ally'+(a.alive?'':' down');const name=document.createElement('span');name.textContent=`${a.name} · ${a.skills.skill?BATTLE[a.skills.skill].name:a.skills.battlecry>0?'함성':a.role}`;const hp=document.createElement('progress');hp.max=a.maxHp;hp.value=a.health;hp.setAttribute('aria-label',`${a.name} 체력 ${a.health}/${a.maxHp}`);const status=document.createElement('small');status.textContent=a.alive?(a.retreating?'후퇴':`${a.health}`):'쓰러짐';row.append(name,hp,status);list.append(row);}
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
$('talents-button').addEventListener('click',openTalents);$('close-talents').addEventListener('click',()=>$('talents-dialog').close());$('reset-talents').addEventListener('click',resetTalents);
$('audio-button').addEventListener('click',openAudio);$('close-audio').addEventListener('click',()=>$('audio-dialog').close());
for(const id of ['talents-dialog','audio-dialog'])$(id).addEventListener('close',()=>{setPaused(!started||document.hidden||!document.hasFocus()||menuOpen());updateHUD();world.focus({preventScroll:true});});
$('audio-enabled').addEventListener('change',()=>{audio.set('enabled',$('audio-enabled').checked);renderAudio();});
for(const key of ['music','effects'])$(key+'-volume').addEventListener('input',()=>{audio.set(key,Number($(key+'-volume').value)/100);renderAudio();});
$('build-button').addEventListener('click',()=>toggleBuild());$('build-close').addEventListener('click',()=>toggleBuild(false));$('plot-travel').addEventListener('click',()=>travelToPlot());
for(const b of document.querySelectorAll('[data-material]'))b.addEventListener('click',()=>{selectMaterial(b.dataset.material);world.focus({preventScroll:true});});
$('place-block').addEventListener('click',()=>{buildAction();world.focus({preventScroll:true});});$('remove-block').addEventListener('click',()=>{buildAction(true);world.focus({preventScroll:true});});
$('sword-button').addEventListener('click', () => equipWeapon('sword'));
$('bow-button').addEventListener('click', () => equipWeapon('bow'));
$('axe-button').addEventListener('click', () => equipWeapon('axe'));
$('upgrade-handle').addEventListener('click', () => { upgradeHandle();world.focus({preventScroll:true}); });
for (const skill of WARRIOR_SKILLS) $('skill-' + skill.id).addEventListener('click', () => { useWarriorSkill(skill.id); world.focus({ preventScroll: true }); });
for(const id of ['evade','battlecry'])$('tactic-'+id).addEventListener('click',()=>{useTactic(id);world.focus({preventScroll:true});});
$('revive-button').addEventListener('click', () => { resetPosition(); play(); });
$('play-button').addEventListener('click', play);
$('village-button').addEventListener('click',travelToVillage);
$('village-start').addEventListener('click',travelToVillage);
$('battle-button').addEventListener('click',openBattle);
$('close-battle').addEventListener('click',()=>$('battle-dialog').close());
$('battle-dialog').addEventListener('close',()=>{setPaused(document.hidden||!document.hasFocus());updateHUD();world.focus({preventScroll:true});});
for(const mode of ['defense','assault'])$('start-'+mode).addEventListener('click',()=>startBattle(mode));
$('rally-button').addEventListener('click',()=>{rallyResidents();world.focus({preventScroll:true});});
$('retreat-button').addEventListener('click',()=>{raids.abort();$('battle-dialog').close();hunting.sinceHit=100;hunting.warrior.cancel();travelToVillage();});
$('potion-button').addEventListener('click',()=>{usePotion();world.focus({preventScroll:true});});
$('interact-prompt').addEventListener('click',()=>openResident());
$('close-trade').addEventListener('click',()=>$('trade-dialog').close());
for(const category of ['buy','sell','barter'])$('trade-'+category).addEventListener('click',()=>{tradeCategory=category;renderTrade();});
$('trade-dialog').addEventListener('close',()=>{talkingTo=null;setPaused(document.hidden||!document.hasFocus());updateHUD();world.focus({preventScroll:true});});
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
  if (started && !paused) notify('우클릭 드래그 또는 Q · E로 시점 회전 · 1~4 연계 · 5 궁극기');
});
document.addEventListener('keydown', event => {
  if (menuOpen()) return;
  // Let focused controls keep their native Enter/Space/arrow behavior.
  if(event.target.closest?.('button,input,select,textarea')&&['Enter','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))return;
  if (event.code === 'Escape') { if (started && !locked && hunting.hp > 0) setPaused(!paused); return; }
  if (event.code === 'Enter' && !started) { event.preventDefault();play(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if(event.code==='KeyP'){event.preventDefault();openTalents();return;}
  if(event.code==='KeyK'){event.preventDefault();toggleBuild();return;}
  if (event.code === 'KeyV') setView(firstPerson ? 'third' : 'first');
  if (event.code === 'KeyR') resetPosition();
  if (event.code === 'KeyZ') equipWeapon('axe');
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
  const skill = WARRIOR_SKILLS.find(s => event.code === 'Digit' + s.key);
  if (skill) { event.preventDefault(); useWarriorSkill(skill.id); return; }
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
    const bow = hunting.weapon === 'bow'||buildingMode;
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
  } else if (hunting.weapon === 'bow') {
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
  const nearbyOpening=hunting.targets().find(e=>e.alive&&e.offBalance>0&&Math.hypot(e.x-player.x,e.z-player.z)<18);
  $('critical-opening').hidden = !started || !nearbyOpening;
  if(nearbyOpening)$('critical-opening').textContent=`✦ ${nearbyOpening.kind==='tree'?'금이 간 나무':'비틀거리는 적'} · 다음 적중은 치명타 ×${hunting.criticalMultiplier}`;
  const a = warrior.active;
  const progress = a ? a.elapsed / a.duration : 0;
  const elapsed = a?.elapsed ?? 0;
  const phaseLabels = {
    charge: '돌파', slam: elapsed < .43 ? '날 세우기' : elapsed < .64 ? '내려찍기' : '도끼 고정',
    kick: elapsed < .14 ? '도약' : elapsed < .70 ? '날아차기' : '착지',
    sweep: elapsed < .52 ? '끌어오기' : elapsed < .90 ? '몸 틀기' : elapsed < 1.26 ? '크게 베기' : '마무리',
    spin: `${a?.stage ?? 1}단계 · ${Math.max(0,(a?.duration ?? 0)-elapsed).toFixed(1)}초`,
  };
  const ready = warrior.ultimate.ready, combo = warrior.combo, spinning = a?.id === 'spin';
  $('ultimate-info').classList.toggle('ready', ready); $('ultimate-info').classList.toggle('empowered', spinning && a.stage===2);
  $('ultimate-charge').max = spinning ? a.duration : 4;
  $('ultimate-charge').value = spinning ? a.duration-elapsed : ready ? 4 : combo.step;
  $('ultimate-charge').setAttribute('aria-label', spinning ? '회전베기 남은 시간' : '궁극기 연계 진행');
  $('ultimate-status').textContent = spinning ? `${a.stage}단계 ${a.stage===2?'흡입 회전':'회전베기'} · ${(a.duration-elapsed).toFixed(1)}초${a.extended>0?` · +${a.extended.toFixed(2)}초`:''}`
    : ready ? '궁극기 준비 완료 · 5 회전베기' : combo.step ? `연계 ${combo.step}/4 적중 · 다음 ${combo.step+1}${combo.remaining>0?` · ${combo.remaining.toFixed(1)}초`:''}`
    : combo.failure ? `${combo.failure} · 1번부터 다시` : '궁극기 연계 · 1 → 2 → 3 → 4 적중';
  for (const skill of WARRIOR_SKILLS) {
    const button = $('skill-' + skill.id), remaining = warrior.cooldowns[skill.id];
    const needsAxe = ['kick','sweep'].includes(skill.id) && !warrior.planted;
    const usedKick = skill.id === 'kick' && warrior.planted?.kicked;
    const recoverFirst = ['charge','slam'].includes(skill.id) && warrior.planted;
    const active = a?.id === skill.id, queued = warrior.queued?.id === skill.id;
    button.classList.toggle('active', active); button.classList.toggle('queued', queued);
    button.classList.toggle('unavailable', remaining > 0 || needsAxe || usedKick || recoverFirst || (skill.id==='spin'&&!ready&&!active));
    button.classList.toggle('ready', skill.id==='spin' && ready);button.classList.toggle('empowered', active && spinning && a.stage===2);
    button.style.setProperty('--cooldown', `${skill.cooldown ? remaining / skill.cooldown * 100 : 0}%`);
    $('skill-state-' + skill.id).textContent = active ? phaseLabels[skill.id] : queued ? '다음 동작' : skill.id==='spin' ? ready ? '사용 가능' : `${combo.step}/4 적중` : remaining > 0 ? `${remaining.toFixed(1)}초` : usedKick ? '4번으로 마무리' : recoverFirst ? '도끼 회수 후' : needsAxe ? '내려찍기 후' : '준비';
  }
  const name = WARRIOR_SKILLS.find(s => s.id === a?.id)?.name;
  $('combo-title').textContent = a?.id === 'kick' && a.kickPower ? `날아차기 · ${a.kickPower.name} · ${a.kickPower.damage} 피해 / ${a.kickPower.distance}m 밀침` : name ?? (a?.id === 'slash' ? '기본 베기' : warrior.planted ? warrior.planted.kicked ? '뒤에 남은 도끼로 마무리' : '도끼가 박혔어요' : '양손 도끼 전사');
  $('combo-hint').textContent = warrior.queued ? `${WARRIOR_SKILLS.find(s=>s.id===warrior.queued.id).name} 예약됨${['kick','sweep'].includes(warrior.queued.id)?' · 발동 전 시점으로 방향 선택':''}`
    : a ? { charge: '2 내려찍기를 미리 눌러 이어 가세요', slam: '3 날아차기 또는 4 가로베기로 연계', kick: '앞으로 날아차기 → 4 가로베기로 마무리', sweep: elapsed < .52 ? '현재 위치에서 도끼를 끌어오기' : elapsed < .90 ? '낮게 버티고 크게 몸 틀기' : '온몸으로 휘두르는 넓은 가로베기', slash: a.automatic ? '근접 자동 공격 · 기술 입력이 우선해요' : '기본 공격 중', spin: a.stage===2 ? `끌어당기는 중 · 연속 ${a.streak}/3 · 다음 치명타까지 ${3-a.streak}회` : `연속 ${a.streak}/3 적중 → 흡입 강화 · WASD 이동` }[a.id]
    : warrior.planted ? `${warrior.planted.kicked ? '4 가로베기' : '3 날아차기 → 4 가로베기'} · 시점으로 방향 선택 · ${warrior.planted.remaining.toFixed(1)}초`
    : '1 돌진 → 2 내려찍기 → 3 날아차기 → 4 가로베기';
  $('combo-progress').style.width = `${a ? a.elapsed / a.duration * 100 : warrior.planted ? warrior.planted.remaining / (3.4+progression.bonuses.combo) * 100 : 0}%`;
}
function updateHUD() {
  updateTacticsHUD();
  updateGrowthHUD();
  updateRaidHUD();
  const safe=village.isSafe(player),near=village.nearest(player);
  $('place-name').textContent=raids.active?(raids.mode==='defense'?'솔바람 마을 · 교전 중':'붉은발 야영지'):safe?VILLAGE.name:'시작의 들판';
  $('gold-count').textContent=village.gold;
  $('potion-button').textContent=village.potionCooldown>0?`물약 ${village.potionCooldown.toFixed(1)}초`:`H 물약 ${village.potions}`;
  $('potion-button').disabled=!started||paused||hunting.hp<=0||hunting.hp>=hunting.maxHp||village.potions<1||village.potionCooldown>0;
  $('village-status').textContent=raids.active?'J 전투 메뉴 · G 주민 지시':safe?'솔바람 마을 · J 방어와 출정':`솔바람 마을 ${Math.round(Math.hypot(player.x-VILLAGE.entry.x,player.z-VILLAGE.entry.z))}m · B 이동`;
  $('village-status').classList.toggle('safe',safe);
  $('interact-prompt').hidden=buildingMode||raids.active||!started||paused||!near||hunting.hp<=0;
  if(near)$('interact-label').textContent=`${near.name} · ${near.shop?'거래하기':'대화하기'}`;
  $('coordinates').textContent = `${player.x.toFixed(0)} / ${(-player.z).toFixed(0)}`;
  const speed = Math.hypot(player.vx, player.vz);
  $('motion-state').textContent = paused && started ? '잠시 쉬는 중' : !player.grounded ? (player.vy > 0 ? '뛰어오르는 중' : '내려오는 중') : speed > 6 ? '달리는 중' : speed > .2 ? '걷는 중' : '가만히 서 있는 중';
  const hp = Math.ceil(hunting.hp);
  $('health-value').textContent = `${hp} / ${hunting.maxHp}`;
  $('health-fill').style.width = `${hp/hunting.maxHp*100}%`; $('health-meter').setAttribute('aria-valuenow', String(hp));$('health-meter').setAttribute('aria-valuemax',String(hunting.maxHp));
  $('health-fill').style.background = hp < 30 ? '#ed9984' : '#b3dc94';
  $('rabbit-count').textContent = hunting.kills.rabbit; $('slime-count').textContent = hunting.kills.slime;
  const automatic=!!(hunting.autoAttackRecovery || hunting.autoMelee.targetId),melee=hunting.weapon!=='bow';
  $('auto-attack-status').textContent=!melee?'활 · 직접 조준해 발사':paused?'근접 자동 공격 · 대기':warrior.planted||(warrior.active&&warrior.active.id!=='slash')||warrior.combo.remaining>0?'자동 공격 · 기술 연계 대기':automatic?'근접 자동 공격 중':'근접 자동 공격 · 적 접근 시';
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
  $('warrior-hud').hidden=buildingMode||safe;
  $('soldier-hint').hidden=!target?.raider;
  if(target?.raider){const role=SOLDIER_ROLES[soldierRole(target)];$('soldier-hint').textContent=target.battlecry>0?'전투 함성 중 · 강화가 끝날 때까지 거리 벌리기':target.guardBroken>0?'방패 무너짐 · 공격 기회!':`${role.name} · ${target.action?BATTLE[target.action.id].name+' 준비 · ':''}${role.hint}`;}
  if(safe){$('combo-title').textContent='솔바람 마을 · 안전 지역';$('combo-hint').textContent='주민 가까이 E 대화 · H 물약 · 서쪽 문으로 들판';for(const s of WARRIOR_SKILLS)$('skill-'+s.id).classList.add('unavailable');}
}
function handleCombatEvents() {
  for (const event of hunting.events.splice(0)) {
    audio.event(event);
    if(event.type==='soldier-impact'&&event.skill!=='shot')warriorView.effect(event);
    if(event.type==='guard-break'||event.type==='guard-block'){const el=document.createElement('span');el.className='damage-number guard-feedback';el.textContent=event.type==='guard-break'?'방패 무너짐':'정면 방어';$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(event.x,event.y,event.z),life:.65});}
    if(event.type==='xp-earned'){const el=document.createElement('span');el.className='damage-number xp-reward';el.textContent=`+${event.amount} XP`;$('combat-fx').appendChild(el);floatingHits.push({el,position:new THREE.Vector3(player.x+.6,player.y+2.6,player.z),life:1.1});}
    if(event.type==='level-up'){notify(`레벨 ${event.level}! 체력 회복 · P에서 특성 ${event.points}점 선택`);if($('talents-dialog').open)renderTalents();}
    if(event.type==='raid-notice')notify(event.message);
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
    } else if (event.type === 'ultimate-ready') notify('4연계 성공! 5번 회전베기를 사용할 수 있어요.');
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
function combatFeedback(dt) {
  if (!paused) hitFeedback = Math.max(0, hitFeedback - dt);
  $('crosshair').classList.toggle('hit', hitFeedback > 0);
  $('damage-flash').style.opacity = String(hunting.hurt * 2);
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
  animateAvatar(dt, time); forestryView.update(player);villageView.update(player);updateCamera(dt);raidView.update();buildingView.update(buildingMode&&!paused,buildMaterial,player);
  handleCombatEvents(); huntingView.update(dt, firstPerson, avatar, paused); warriorView.update(dt, firstPerson, player, paused); combatFeedback(dt);
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
renderAudio();equipWeapon('axe'); forestryView.update(player);villageView.update(player);updateHUD();updateCamera(1, true); animateAvatar(0, 0); huntingView.update(0, firstPerson, avatar, true); warriorView.update(0, firstPerson, player, true); renderer.render(scene, camera);
loading.hidden = true; $('welcome').hidden = false;
requestAnimationFrame(frame);

// Optional WebMCP support: these call the same actions as the visible controls.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const state = () => ({
    position: { x: +player.x.toFixed(3), y: +player.y.toFixed(3), z: +player.z.toFixed(3) },
    grounded: player.grounded, view: firstPerson ? 'first' : 'third',
    paused, started, health: Math.ceil(hunting.hp), maxHealth:hunting.maxHp, weapon: hunting.weapon, kills: { ...hunting.kills },
    progression:progression.state(),audio:audio.state(),building:{enabled:buildingMode,material:buildMaterial,...building.state(),candidate:buildingView.candidate,placementReason:buildingView.reason??null},
    bow: { drawing: hunting.drawing, charge: +hunting.charge.toFixed(3), arrowsInFlight: hunting.arrows.length, shotsFired: hunting.nextArrow - 1, lastShotCharge: hunting.lastCharge },
    warrior: warrior.state(),tactics:hunting.tactics.state(),
    forestry: forestry.state(player),
    village:{...village.state(player),talkingTo},
    raids:raids.state(),
    combat: { criticalHits: hunting.criticalHits, lastHit: hunting.lastHit ? { ...hunting.lastHit } : null,
      autoMelee: { enabled:hunting.weapon!=='bow',...hunting.autoMelee,intervalSeconds:hunting.meleeInterval,cooldown:+hunting.meleeCooldown.toFixed(3),attacking:!!(hunting.autoAttackRecovery&&(warrior.active?.id==='slash'||hunting.swing>0)) } },
    creatures: hunting.entities.map(e => ({id:e.id,kind:e.kind,health:e.hp,alive:e.alive,offBalanceSeconds:+e.offBalance.toFixed(2),knockback:e.knockback?{power:e.knockback.id,progress:+(e.knockback.elapsed/e.knockback.duration).toFixed(2)}:null,lastPush:e.lastPush?{...e.lastPush,travelled:+e.lastPush.travelled.toFixed(2)}:null,position:{x:+e.x.toFixed(2),y:+(e.y+e.hop).toFixed(2),z:+e.z.toFixed(2)}})),
  });
  const validateEmpty = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error('Expected an empty object.');
  };
  const tools = [
    {name:'use_tactical_skill',title:'회피 또는 전투 함성',description:'Use the visible F dodge or 6 battle cry. Dodge follows held movement or the camera direction, cancels the current attack, keeps an already prepared ultimate, and has a four-second cooldown. Battle cry lasts six seconds with +35% outgoing and -25% incoming damage; cooldown thirty seconds. Paused play and build mode reject both. Direction matches WASD relative to the camera.',inputSchema:{type:'object',properties:{skill:{type:'string',enum:['evade','battlecry']},direction:{type:'string',enum:['movement','forward','back','left','right']}},required:['skill'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!['evade','battlecry'].includes(input.skill)||Object.keys(input).some(k=>!['skill','direction'].includes(k))||(input.direction&&!['movement','forward','back','left','right'].includes(input.direction)))throw new Error('Choose evade or battlecry and a movement direction.');const r=useTactic(input.skill,input.direction);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'open_talents',title:'전사 특성 열기',description:'Open the same P talent tree visible in the game. Pauses play.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=openTalents();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'learn_talent',title:'특성 배우기',description:'Spend one earned point in the open talent tree. Uses the same level, prerequisite and combat restrictions as the visible buttons.',inputSchema:{type:'object',properties:{talent:{type:'string',enum:TALENTS.map(t=>t.id)}},required:['talent'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!$('talents-dialog').open||!input||Object.keys(input).some(k=>k!=='talent'))throw new Error('Open the talent tree first.');const r=learnTalent(input.talent);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'set_build_mode',title:'건축 모드 전환',description:'Use the same K build mode. Only available in the peaceful village after play begins.',inputSchema:{type:'object',properties:{enabled:{type:'boolean'}},required:['enabled'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.enabled!=='boolean'||Object.keys(input).some(k=>k!=='enabled'))throw new Error('Choose enabled.');const r=toggleBuild(input.enabled);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'travel_to_build_plot',title:'건축 부지로 이동',description:'Use the visible build panel plot selector and travel button. Requires build mode, no combat and closed dialogs.',inputSchema:{type:'object',properties:{plot:{type:'string',enum:BUILD_PLOTS.map(p=>p.id)}},required:['plot'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!buildingMode||!input||Object.keys(input).some(k=>k!=='plot'))throw new Error('Open build mode first.');const r=travelToPlot(input.plot);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'place_aimed_block',title:'블록 설치',description:'Place one selected inventory block at the current green aim preview, matching left click. Checks plot limits, range, occupancy and support.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=buildAction();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'recover_aimed_block',title:'블록 회수',description:'Recover the player-built block currently aimed at, returning exactly one block to inventory. Matches right click.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=buildAction(true);if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'open_battle_menu',title:'방어와 출정 메뉴',description:'Open the visible J battle menu and pause the game. Battles start in the village.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validateEmpty(input);const r=openBattle();if(!r.accepted)throw new Error(r.reason);return state();}},
    {name:'start_village_battle',title:'방어 또는 출정 시작',description:'Use the open battle menu to start defense (two waves with ten residents) or assault (seven volunteers against six camp enemies). Requires village proximity, living player and no active attack. Moves everyone to the visible battle staging position, then gives eight preparation seconds. Matches the two battle menu buttons.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['defense','assault']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!['defense','assault'].includes(input.mode)||Object.keys(input).some(k=>k!=='mode'))throw new Error('Choose defense or assault.');const r=startBattle(input.mode);if(!r.accepted)throw new Error(r.reason);return state();}},
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
    { name: 'equip_weapon', title: '도끼·칼·활 장착', description: 'Equip the two-handed axe, sword or bow, matching Z, X, C and the visible weapon buttons. Switching cancels a planted axe and any active skill.',
      inputSchema: { type: 'object', properties: { weapon: { type: 'string', enum: ['axe', 'sword', 'bow'] } }, required: ['weapon'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !['axe', 'sword', 'bow'].includes(input.weapon) || Object.keys(input).some(k => k !== 'weapon')) throw new Error('weapon must be axe, sword or bow.');
        equipWeapon(input.weapon); return state();
      } },
    { name: 'attack_with_weapon', title: '기본 근접 공격', description: 'Swing the equipped axe or sword, matching left click. F is dodge. For a bow use begin_bow_draw then release_bow_draw. Requires active play and a ready weapon.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { validateEmpty(input); if (!attack()) throw new Error('Equip a ready axe or sword and resume play. Recover a planted axe with skill 4. For the bow, begin and release a draw.'); return { attacked: true, weapon: hunting.weapon }; } },
    { name: 'use_warrior_skill', title: '전사 기술 사용', description: 'Use an equipped-axe skill: 1 charge, 2 slam, 3 kick, 4 sweep, 5 spin ultimate. Kick and sweep need the planted axe and lock their travel and hit direction to the current camera heading when each skill actually starts, including queued follow-ups. Turning during the previous skill redirects only the next kick or sweep; charge and slam keep their existing direction rules. The planted axe stays at its original world anchor. Kick leaps forward, rolling light/medium/strong PRD power: 18/26/36 damage, 3/4.5/6m knockback. Targets become off balance for one double-damage hit within 4 seconds. Sweep recalls the axe without retreating and lunges forward. Landing charge, slam, kick, sweep in order stores one spin. Misses, wrong order, weapon switching, axe retrieval, or waiting over 3 seconds after a skill ends break an unfinished combo. Rejected inputs and ordinary damage do not; dodging or a heavy skill stagger cancels an unfinished combo, while a prepared ultimate stays stored. Spin lasts 2.5s, hits all directions every .25s, and allows movement. Every third consecutive connected pulse is 2x critical; the first such pulse upgrades to stage 2, pulling nearby visible enemies inward. A missed pulse resets the streak. Critical pulses add .25s once each, kills add .5s each, total duration caps at 4s. No damage or pull through walls. Trees also accept the same attacks, combo and spin hits. Kick cracks trees for the next critical without moving them; stage 2 pulls dropped wood. Felling a tree gives the same spin duration bonus as a defeat. One valid follow-up may be queued. Returns actual state; actions advance in real time.',
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
