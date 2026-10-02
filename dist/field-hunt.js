import {Raids} from './raids.js';
import {FieldBoss} from './field-boss.js';
import {HUNTS} from './field-data.js';
import {MirrorBoss} from './mirror-boss.js';
import {RaidNavigation} from './raid-navigation.js';
import {ALLY_ROLES} from './raid-data.js';
import {terrainHeight} from './movement.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class FieldHunt extends Raids {
  constructor(combat,village){
    super(combat,village);this.mode='field';this.selected='varkan';
    this.bosses={varkan:new FieldBoss(this),lysea:new MirrorBoss(this)};this.boss=this.bosses.varkan;
    this.nav=new RaidNavigation(combat.colliders,{minX:-48,minZ:-60,width:116,depth:102});
  }
  get arena(){return HUNTS[this.selected];}
  get quest(){return this.selected==='lysea'?this.village.mirrorQuest:this.village.huntQuest;}
  select(id){
    if(!Object.hasOwn(HUNTS,id))return {accepted:false,reason:'토벌 대상을 다시 골라 주세요.'};
    if(this.active)return {accepted:false,reason:'토벌이 끝난 뒤 대상을 바꿀 수 있어요.'};
    if(this.selected!==id){this.cleanup();this.selected=id;this.boss=this.bosses[id];this.boss.clear();this.phase='idle';this.result=null;}
    return {accepted:true};
  }
  nearestArena(player){return Object.values(HUNTS).sort((a,b)=>distance(a,player)-distance(b,player))[0];}
  acceptQuest(player){
    if(this.quest.accepted)return {accepted:false,reason:'이미 받은 의뢰예요.'};
    if(!this.village.isSafe(player)||this.combat.hp<=0)return {accepted:false,reason:'B로 솔바람 마을에 돌아와 의뢰를 받아 주세요.'};
    this.quest.accepted=true;this.village.save();return {accepted:true,message:`${this.arena.questTitle} · ${this.arena.name}에서 ${this.arena.shortName} 토벌`};
  }
  startReason(mode,player){
    if(mode!=='field')return '야외 토벌을 골라 주세요.';
    if(this.active)return '이미 토벌 중이에요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(!this.quest.accepted)return 'B로 마을에 돌아가 J 의뢰를 받아 주세요.';
    if(distance(player,this.arena)>this.arena.radius)return `${this.arena.travelLabel}한 뒤 ${this.arena.shortName}에게 도전하세요.`;
    if(this.combat.tactics?.busy||this.combat.warrior.active||this.combat.warrior.planted||this.combat.drawing)return '동작을 마친 뒤 시작해 주세요.';
    if(this.combat.sinceHit<6)return '잠시 숨을 고른 뒤 시작해 주세요.';
    return null;
  }
  travelReason(player){return !this.quest.accepted?'마을에서 먼저 의뢰를 받아 주세요.':this.village.travelReason(player);}
  start(mode,player,companion='none'){
    const reason=this.startReason(mode,player);if(reason)return {accepted:false,reason};
    if(!['none','nari'].includes(companion))return {accepted:false,reason:'동행자를 다시 골라 주세요.'};
    this.cleanup();this.mode='field';this.phase='fighting';this.elapsed=0;this.result=null;this.order='fight';this.nav.rebuild();
    this.combat.cancelDraw();this.combat.inSanctuary=false;this.combat.autoMelee.targetId=null;
    const unit=this.spawnEnemy('captain',this.arena.x,this.arena.z);
    Object.assign(unit,{fieldBoss:true,name:this.arena.bossName,hp:this.arena.health,maxHp:this.arena.health,radius:this.selected==='lysea'?1.05:1.7,height:this.selected==='lysea'?3.5:2.9});this.boss.attach(unit);
    if(companion==='nari'){
      const n=this.village.residents.find(n=>n.id==='nari'),stats=ALLY_ROLES.nari,x=player.x+1,z=player.z+1;
      Object.assign(n,stats,{x,z,y:terrainHeight(x,z),battle:true,combatRole:'치유',hp:stats.maxHp,alive:true,moving:false,flash:0,swing:0,cooldown:0,windup:0,retreating:false,path:[],navClock:0,healCharges:3});this.skills.init(n);this.allies=[n];
    }
    return {accepted:true};
  }
  heal(unit,player,dt){
    if(unit.healCharges<=0||this.combat.hp>this.combat.maxHp*.55||this.combat.hp<=0)return false;
    if(distance(unit,player)>7||!this.visible(unit,player)){this.nav.move(unit,player,3,dt);return true;}
    if(unit.cooldown<=0){const amount=Math.min(24,this.combat.maxHp-this.combat.hp);this.combat.hp+=amount;unit.healCharges--;unit.cooldown=14;unit.swing=.5;this.combat.events.push({type:'ally-heal',x:player.x,y:player.y+2,z:player.z,amount});}return true;
  }
  update(dt,player){
    if(!this.active)return;this.elapsed+=dt;
    if(this.combat.hp<=0){this.finish(false,'쓰러졌어요. 준비를 마치고 다시 도전할 수 있어요.');return;}
    if(distance(player,this.arena)>this.arena.leash){this.finish(false,`${this.arena.name} 전장을 벗어나 토벌이 종료됐어요.`);return;}
    // Keep ambient wildlife out of an instanced-feeling outdoor encounter.
    for(const e of this.combat.entities)if(!e.raider&&e.alive&&distance(e,this.arena)<this.arena.radius+1){e.x=e.homeX=0;e.z=e.homeZ=-12;e.y=terrainHeight(e.x,e.z);e.alert=false;}
    this.boss.update(dt,player);
    for(let i=0;i<this.allies.length;i++)this.updateAlly(this.allies[i],i,dt,player);
    if(this.combat.hp<=0){this.finish(false,'쓰러졌어요. 준비를 마치고 다시 도전할 수 있어요.');return;}
    if(this.boss.unit&&!this.boss.unit.alive)this.finish(true);
  }
  award(reward){this.village.gold=Math.min(999999,this.village.gold+reward.gold);for(const k of ['timber','stone','roof'])this.village.blocks[k]=Math.min(99999,this.village.blocks[k]+reward[k]);}
  claimReason(player){
    const q=this.quest;
    if(!q.clears||q.rewardClaimed)return '완료한 첫 토벌 의뢰의 보상이 없어요.';
    if(this.active||!this.village.isSafe(player)||this.combat.hp<=0)return '마을로 돌아가 의뢰 보상을 받으세요.';
    return null;
  }
  claimReward(player){
    const reason=this.claimReason(player);if(reason)return {accepted:false,reason};
    this.quest.rewardClaimed=true;this.award(this.arena.firstReward);this.combat.progression?.add('fieldQuest');this.village.save();
    return {accepted:true,message:`${this.arena.shortName} 의뢰 완료 · ${this.arena.firstReward.gold} 골드 · 건축 자재 · 180 XP`};
  }
  finish(won,reason=''){
    if(!this.active)return;this.phase=won?'victory':'defeat';const q=this.quest,first=won&&q.clears===0,reward=won&&!first?{...this.arena.repeatReward}:null;
    if(won){q.clears=Math.min(99999,q.clears+1);q.bestTime=q.bestTime===null?this.elapsed:Math.min(q.bestTime,this.elapsed);if(reward)this.award(reward);this.village.save();}
    this.result={won,huntId:this.selected,name:this.arena.shortName,mode:'field',reason,reward,first,elapsed:+this.elapsed.toFixed(1),bossStats:{...this.boss.stats}};
    this.cleanup();this.combat.warrior.cancel();this.combat.cancelDraw();
    this.combat.events.push({type:'raid-result',message:won?(first?`${this.arena.shortName} 토벌 성공! 마을에서 첫 의뢰 보상을 받으세요.`:`${this.arena.shortName} 재토벌 · ${reward.gold} 골드와 돌 ${reward.stone}개 획득`):reason});
  }
  state(){return {huntId:this.selected,arena:this.arena.name,active:this.active,mode:'field',phase:this.phase,elapsed:+this.elapsed.toFixed(1),order:this.order,result:this.result,quest:{...this.quest},boss:this.boss.state(),allies:this.allies.map(a=>({id:a.id,name:a.name,alive:a.alive,health:Math.ceil(a.hp),maxHp:a.maxHp,healCharges:a.healCharges,avoiding:!!a.avoiding})),enemies:this.enemies.map(e=>({id:e.id,name:e.name,health:e.hp,alive:e.alive,x:e.x,z:e.z}))};}
}
