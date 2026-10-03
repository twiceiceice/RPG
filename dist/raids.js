import {terrainHeight} from './movement.js';
import {segmentSphere,segmentBox} from './combat.js';
import {inVillage,RESIDENTS} from './village-data.js';
import {CAMP,BEACON,ALLY_ROLES,EXPEDITION,RAID_WAVES,RAID_REWARDS} from './raid-data.js';
import {RaidNavigation} from './raid-navigation.js';
import {SoldierSkills} from './raid-skills.js';
import {BATTLE,bowShot,guardedDamage} from './battle-rules.js';
import {RaidBoss} from './raid-boss.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class Raids {
  constructor(combat,village){
    this.combat=combat;this.village=village;combat.raids=this;village.raids=this;
    this.nav=new RaidNavigation(combat.colliders);this.phase='idle';this.mode=null;this.wave=0;this.timer=0;this.elapsed=0;this.order='fight';this.enemies=[];this.allies=[];this.bolts=[];this.trails=[];this.serial=0;this.result=null;
    this.skills=new SoldierSkills(this);this.boss=new RaidBoss(this);
    this.beacon={...BEACON,id:'beacon',y:terrainHeight(BEACON.x,BEACON.z),hp:BEACON.maxHp,alive:true,height:2};
  }
  get active(){return ['preparing','fighting','interval'].includes(this.phase);}
  startReason(mode,player){
    if(!['defense','assault'].includes(mode))return '전투 종류를 골라 주세요.';
    if(this.active)return '이미 전투가 진행 중이에요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(!inVillage(player.x,player.z))return 'B로 마을에 돌아와 출발 준비를 해 주세요.';
    if(this.combat.tactics?.busy||this.combat.warrior.active||this.combat.warrior.planted||this.combat.drawing)return '동작을 마친 뒤 준비해 주세요.';
    if(this.combat.sinceHit<6)return '잠시 숨을 고른 뒤 준비해 주세요.';
    return null;
  }
  start(mode,player){
    const reason=this.startReason(mode,player);if(reason)return {accepted:false,reason};
    this.cleanup();this.mode=mode;this.phase='preparing';this.wave=1;this.timer=8;this.elapsed=0;this.order='fight';this.result=null;
    this.beacon.hp=this.beacon.maxHp;this.beacon.alive=true;this.nav.rebuild();
    const spot=mode==='defense'?{x:13.5,z:15}:CAMP.entry;
    Object.assign(player,{x:spot.x,z:spot.z,y:terrainHeight(spot.x,spot.z),vx:0,vz:0,vy:0,grounded:true,jumpBuffer:0});
    this.combat.cancelDraw();this.combat.inSanctuary=false;this.combat.autoMelee.targetId=null;
    const participants=this.village.residents.filter(n=>mode==='defense'||EXPEDITION.includes(n.id));
    this.allies=participants.map((n,i)=>{
      const stats=ALLY_ROLES[n.id],x=mode==='defense'?stats.spot[0]:spot.x+1.6+Math.floor(i/2)*1.25,z=mode==='defense'?stats.spot[1]:spot.z+(i%2?2:-2);
      Object.assign(n,stats,{x,z,y:terrainHeight(x,z),combatRole:stats.role,battle:true,hp:stats.maxHp,alive:true,flash:0,swing:0,cooldown:i*.25,windup:0,target:null,moving:false,retreating:false,path:[],navClock:0});
      this.skills.init(n,i);return n;
    });
    this.combat.events.push({type:'raid-notice',message:mode==='defense'?'습격 경보! 주민 10명과 서쪽 문을 지켜요.':`주민 ${participants.length}명과 출정했어요. 8초 뒤 야영지를 공격합니다.`});
    return {accepted:true};
  }
  toggleOrder(){if(!this.active)return {accepted:false,reason:'전투 중에 주민에게 지시할 수 있어요.'};this.order=this.order==='fight'?'rally':'fight';for(const a of this.allies){a.windup=0;a.action=null;a.followup=null;a.navClock=0;}return {accepted:true,message:this.order==='rally'?'주민들이 내게 모여요. 가까운 적에게만 대응합니다.':'교전 명령 · 주민들이 주변 적과 싸웁니다.'};}
  spawnWave(){
    const difficulty=1+Math.min(3,this.village.raidWins[this.mode])*.08;
    const kinds=RAID_WAVES[this.mode][this.wave-1];
    kinds.forEach((style,i)=>{
      const x=this.mode==='assault'?(style==='captain'?-34:-25-Math.floor(i/5)*4):(style==='captain'?2:-1-Math.floor(i/5)*2.3);
      const z=style==='captain'?15:15+(i%5-2)*2.5;
      const e=this.spawnEnemy(style,x,z,difficulty,i);if(style==='captain')this.boss.attach(e);
    });
    this.phase='fighting';this.combat.events.push({type:'raid-notice',message:`${this.wave}/3차 ${this.mode==='defense'?'습격':'진격'} · ${kinds.length}명${this.wave===3?' · 우두머리 등장!':''}`});
  }
  spawnEnemy(style,x,z,difficulty=1,index=0){
    const boss=style==='captain',radius=boss?.68:.4;
    if(!this.nav.clear(x,z,radius)){const cell=this.nav.cell({x,z});if(cell!==null)({x,z}=this.nav.point(cell));}
    const maxHp=Math.round((boss?(this.mode==='defense'?2800:3200):style==='guard'?180:style==='archer'?92:132)*difficulty);
    const e={id:`raider-${++this.serial}`,kind:'raider',raider:true,boss,ccImmune:boss,style,power:difficulty,name:boss?'붉은발 우두머리 · 바르칸':style==='guard'?'붉은발 방패병':style==='archer'?'붉은발 궁수':'붉은발 전사',x,z,y:terrainHeight(x,z),homeX:x,homeZ:z,
      hp:maxHp,maxHp,alive:true,radius,height:boss?3.1:1.9,heading:Math.PI/2,hop:0,flash:0,windup:0,recovery:1+index*.2,stagger:0,offBalance:0,knockX:0,knockZ:0,knockback:null,lastPush:null,step:0,variant:0,moving:false,alert:true,
      damage:Math.round((style==='archer'?15:18)*difficulty),range:style==='archer'?10:1.9,interval:2.2};
    this.skills.init(e,index);this.enemies.push(e);this.combat.entities.push(e);return e;
  }
  spawnReinforcements(unit,phase){
    const styles=phase===3?['guard','guard','archer','archer']:['melee','melee','archer','archer'];
    styles.forEach((style,i)=>this.spawnEnemy(style,this.mode==='defense'?-3:-28,10+i*3,unit.power,i));
  }
  regroup(){
    for(const a of this.allies){a.alive=true;a.hp=Math.min(a.maxHp,Math.max(a.hp,a.maxHp*.35)+a.maxHp*.2);a.retreating=false;a.windup=0;this.skills.init(a);}
    this.combat.hp=Math.min(this.combat.maxHp,this.combat.hp+this.combat.maxHp*.25);
    this.enemies=this.enemies.filter(e=>e.alive);this.combat.entities=this.combat.entities.filter(e=>!e.raider||e.alive);this.bolts=[];this.boss.clear();
  }
  visible(a,b){return Math.abs((a.y??0)-(b.y??0))<3&&this.combat.unobstructed({x:a.x,y:(a.y??0)+1,z:a.z},{x:b.x,y:(b.y??0)+1,z:b.z});}
  playerTarget(player){return {id:'player',...player,hp:this.combat.hp,maxHp:this.combat.maxHp,alive:this.combat.hp>0};}
  friendlies(player){return [...this.allies.filter(a=>a.alive),this.playerTarget(player)];}
  hitAlly(target,amount,context={}){
    if(target.id==='player'){
      const hit=this.combat.damagePlayer(amount,{source:context.source??BATTLE[context.skill]?.name??'적의 공격'});
      if(hit&&context.stagger&&this.combat.hp>0){this.combat.tactics.stagger=Math.max(this.combat.tactics.stagger,context.stagger);this.combat.warrior.interrupt(context.stagger>=.65);this.combat.mage.cancel();this.combat.cancelDraw();}
      return hit;
    }
    if(!target.alive)return false;
    if(target.dodge&&target.dodge.elapsed<BATTLE.evade.invulnerable)return false;
    const guard=guardedDamage(target,Math.max(1,amount-(target.style==='guard'&&!context.ground?4:0)),context.dx??0,context.dz??0),damage=guard.damage;target.hp=Math.max(0,target.hp-damage);target.flash=.22;
    if(context.stagger){target.stagger=Math.max(target.stagger??0,context.stagger);target.windup=0;}
    this.combat.events.push({type:'ally-hit',x:target.x,y:target.y+2,z:target.z,damage});
    if(target.hp===0){target.alive=false;target.windup=0;target.moving=false;this.combat.events.push({type:'raid-notice',message:target.id==='beacon'?'마을 깃발이 쓰러졌어요.':`${target.name} 쓰러짐 · 전투 후 회복`});}
    return true;
  }
  shoot(from,to,friendly){
    const start={x:from.x,y:from.y+1.3,z:from.z},dx=to.x-start.x,dy=(to.y??0)+.9-start.y,dz=to.z-start.z,len=Math.hypot(dx,dy,dz)||1,{speed}=bowShot(.35);
    this.bolts.push({...start,vx:dx/len*speed,vy:dy/len*speed,vz:dz/len*speed,life:1.6,friendly,gravity:1.7,damage:Math.round(from.damage*(from.battlecry>0?BATTLE.battlecry.damage:1))});
  }
  strike(unit,target,player,friendly){
    unit.swing=.32;if(!target?.alive)return;
    if(distance(unit,target)>unit.range+.55||!this.visible(unit,target))return;
    if(unit.style==='archer'){this.shoot(unit,target,friendly);return;}
    const amount=Math.round(unit.damage*(unit.battlecry>0?BATTLE.battlecry.damage:1)),d=distance(unit,target)||1,context={dx:(target.x-unit.x)/d,dz:(target.z-unit.z)/d,source:`${unit.name}의 공격`};
    if(friendly){this.combat.damageEntity(target,amount,context.dx,context.dz,{source:'ally',preserveOpening:true});}
    else if(unit.style==='captain'){
      // The red circle previews a short cleave that can be dodged or interrupted by a kick.
      for(const a of [...this.friendlies(player),...(this.mode==='defense'?[this.beacon]:[])])if(distance(unit,a)<3&&this.visible(unit,a))this.hitAlly(a,amount,context);
    }else this.hitAlly(target,amount,context);
  }
  heal(unit,player,dt){
    const friends=this.friendlies(player).filter(a=>a.hp<a.maxHp&&distance(unit,a)<11).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
    const target=friends[0];if(!target)return false;
    if(distance(unit,target)>unit.range||!this.visible(unit,target)){this.nav.move(unit,target,2.8,dt);return true;}
    if(unit.cooldown<=0){
      const amount=Math.min(unit.heal,target.maxHp-target.hp);if(target.id==='player')this.combat.hp+=amount;else target.hp+=amount;
      unit.cooldown=unit.interval;unit.swing=.5;unit.heading=Math.atan2(target.x-unit.x,target.z-unit.z);
      this.trails.push({from:{x:unit.x,y:unit.y+1.3,z:unit.z},to:{x:target.x,y:target.y+1.1,z:target.z},life:.5,heal:true});
      this.combat.events.push({type:'ally-heal',x:target.x,y:target.y+2,z:target.z,amount:Math.round(amount)});
    }return true;
  }
  updateAlly(a,index,dt,player){
    a.moving=false;a.cooldown=Math.max(0,a.cooldown-dt);a.flash=Math.max(0,a.flash-dt);a.swing=Math.max(0,a.swing-dt);
    const avoiding=this.boss.avoid(a,index,dt);if(this.skills.tick(a,dt,player,true)||!a.alive||avoiding)return;
    const anchor=this.mode==='defense'&&this.order==='fight'?{x:a.spot[0],z:a.spot[1]}:{x:player.x+Math.cos(index*2.4)*2.3,z:player.z+Math.sin(index*2.4)*2.3};
    if(a.hp<a.maxHp*.25)a.retreating=true;else if(a.hp>a.maxHp*.55)a.retreating=false;
    if(a.retreating){a.windup=0;const rear=this.mode==='defense'?{x:20,z:18}:anchor;if(distance(a,rear)>1)this.nav.move(a,rear,3.1,dt);if(a.style==='healer')this.heal(a,player,dt);return;}
    if(a.style==='healer'&&this.heal(a,player,dt))return;
    const leash=this.order==='rally'?3.5:14;
    const target=this.enemies.filter(e=>e.alive&&distance(e,anchor)<leash+3&&distance(e,a)<leash).sort((b,c)=>distance(a,b)-distance(a,c))[0];
    if(a.style!=='healer'&&target){
      if(a.windup>0){a.windup=Math.max(0,a.windup-dt);if(a.windup===0){this.strike(a,this.enemies.find(e=>e.id===a.target),player,true);a.cooldown=a.interval;}return;}
      if(this.skills.choose(a,target,player,true))return;
      a.heading=Math.atan2(target.x-a.x,target.z-a.z);
      if(distance(a,target)>a.range||!this.visible(a,target))this.nav.move(a,target,3,dt);
      else if(a.cooldown<=0){a.windup=.4;a.target=target.id;}
    }else{a.windup=0;if(distance(a,anchor)>.7)this.nav.move(a,anchor,3,dt);}
  }
  updateEnemy(e,dt,player){
    if(e.boss)return;
    e.moving=false;e.swing=Math.max(0,(e.swing??0)-dt);if(e.frozen>0&&!e.ccImmune)return;if(e.slowed>0&&!e.ccImmune)dt*=.5;if(this.skills.tick(e,dt,player,false)||!e.alive||e.knockback||e.stagger>0)return;
    const friends=this.friendlies(player);
    if(this.mode==='defense')friends.push(this.beacon);
    const nearby=friends.filter(a=>a.alive).sort((a,b)=>distance(e,a)-distance(e,b));
    const target=nearby[0];if(!target)return;
    if(e.windup>0){e.windup=Math.max(0,e.windup-dt);if(e.windup===0){this.strike(e,friends.find(a=>a.id===e.target),player,false);e.recovery=e.interval;}return;}
    if(this.skills.choose(e,target,player,false))return;
    e.heading=Math.atan2(target.x-e.x,target.z-e.z);
    if(distance(e,target)>e.range||!this.visible(e,target))this.nav.move(e,target,e.style==='captain'?2:2.5,dt);
    else if(e.recovery<=0){e.windup=e.style==='captain'?.95:.65;e.target=target.id;}
  }
  updateBolts(dt,player){
    for(const b of this.bolts){
      b.life-=dt;if(b.life<=0)continue;const next={x:b.x+b.vx*dt,y:b.y+b.vy*dt,z:b.z+b.vz*dt};let nearest=1,hit=null,blocked=false;
      for(const box of this.combat.colliders){if(box.active===false)continue;const t=segmentBox(b,next,box);if(t!==null&&t<=nearest){nearest=t;blocked=true;}}
      const targets=b.friendly?this.enemies:this.friendlies(player).concat(this.mode==='defense'?[this.beacon]:[]);
      for(const a of targets){if(!a.alive)continue;const t=segmentSphere(b,next,{x:a.x,y:a.y+.9+(a.hop??0),z:a.z},a.id==='beacon'?.65:.5);if(t!==null&&t<nearest){nearest=t;blocked=false;hit=a;}}
      this.trails.push({from:{x:b.x,y:b.y,z:b.z},to:{x:b.x+(next.x-b.x)*nearest,y:b.y+(next.y-b.y)*nearest,z:b.z+(next.z-b.z)*nearest},life:.13,friendly:b.friendly});
      if(hit){const length=Math.hypot(b.vx,b.vz)||1;if(b.friendly)this.combat.damageEntity(hit,b.damage,b.vx/length,b.vz/length,{source:'ally',preserveOpening:true});else this.hitAlly(hit,b.damage,{dx:b.vx/length,dz:b.vz/length,source:'적의 화살'});b.life=0;}
      b.vy-=(b.gravity??0)*dt;
      if(blocked||next.y<terrainHeight(next.x,next.z))b.life=0;Object.assign(b,next);
    }this.bolts=this.bolts.filter(b=>b.life>0);
  }
  separate(dt){
    const units=[...this.allies,...this.enemies].filter(a=>a.alive&&!a.boss&&!a.knockback&&!(a.stagger>0));
    for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
      const a=units[i],b=units[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),gap=.72;if(d>=gap)continue;
      const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0,push=Math.min((gap-d)*.5,dt*.9);
      for(const [unit,sign] of [[a,-1],[b,1]]){const x=unit.x+nx*push*sign,z=unit.z+nz*push*sign;if(this.nav.clear(x,z)){unit.x=x;unit.z=z;unit.y=terrainHeight(x,z);}}
    }
  }
  update(dt,player){
    for(const t of this.trails)t.life-=dt;this.trails=this.trails.filter(t=>t.life>0);
    if(!this.active)return;this.elapsed+=dt;
    if(this.combat.hp<=0){this.finish(false,'전투에서 쓰러졌어요.');return;}
    if(this.mode==='defense'&&!this.beacon.alive){this.finish(false,'마을 깃발을 지키지 못했어요.');return;}
    if(this.elapsed>480){this.finish(false,'8분이 지나 주민들과 철수했어요.');return;}
    const center=this.mode==='defense'?BEACON:CAMP;
    if(distance(player,center)>48){this.finish(false,'전장을 벗어나 철수했어요.');return;}
    this.boss.update(dt,player);
    for(let i=0;i<this.allies.length;i++)this.updateAlly(this.allies[i],i,dt,player);
    if(this.phase==='preparing'||this.phase==='interval'){this.timer-=dt;if(this.timer<=0)this.spawnWave();}
    for(const e of this.enemies)this.updateEnemy(e,dt,player);
    this.separate(dt);
    this.updateBolts(dt,player);
    // A last projectile may land in the same step as the final enemy's defeat.
    // Defeat takes priority over a victory payout in that step.
    if(this.combat.hp<=0){this.finish(false,'전투에서 쓰러졌어요.');return;}
    if(this.mode==='defense'&&!this.beacon.alive){this.finish(false,'마을 깃발을 지키지 못했어요.');return;}
    if(this.phase==='fighting'&&this.enemies.every(e=>!e.alive)){
      if(this.wave<RAID_WAVES[this.mode].length){this.regroup();this.wave++;this.timer=10;this.phase='interval';this.combat.events.push({type:'raid-notice',message:`전열 정비 · 체력 일부 회복 · 10초 뒤 ${this.wave===3?'우두머리 등장':this.wave+'차 병력 도착'}`});}
      else this.finish(true);
    }
  }
  finish(won,reason=''){
    if(!this.active)return;
    const mode=this.mode;this.phase=won?'victory':'defeat';const reward=won?{...RAID_REWARDS[mode]}:null;
    if(reward){this.village.gold=Math.min(999999,this.village.gold+reward.gold);for(const key of ['timber','stone','roof'])this.village.blocks[key]=Math.min(99999,this.village.blocks[key]+reward[key]);this.village.raidWins[mode]++;this.combat.progression?.add(mode);this.village.save();}
    this.result={won,mode,reason,reward,bossStats:this.boss.unit?{...this.boss.stats}:null};this.cleanup();this.combat.warrior.cancel();this.combat.cancelDraw();
    this.combat.events.push({type:'raid-result',message:won?`${mode==='defense'?'마을 방어':'야영지 공격'} 성공! +${reward.gold} 골드 · 건축 자재 획득`:reason+' 주민들은 모두 마을로 돌아왔어요.'});
  }
  abort(){if(this.active)this.finish(false,'전투를 중단했어요.');}
  cleanup(){
    this.boss.clear();
    this.combat.entities=this.combat.entities.filter(e=>!e.raider);this.enemies=[];this.bolts=[];this.trails=[];
    for(const a of this.allies){const original=RESIDENTS.find(n=>n.id===a.id);Object.assign(a,{...original,x:original.x,z:original.z,y:terrainHeight(original.x,original.z),alive:true,hp:a.maxHp,battle:false,moving:false,windup:0,swing:0,step:0,wait:1,routeIndex:0,path:[]});this.skills.init(a);}
    this.allies=[];
  }
  state(){return {active:this.active,mode:this.mode,phase:this.phase,wave:this.wave,totalWaves:3,timer:Math.max(0,+this.timer.toFixed(1)),order:this.order,remaining:this.enemies.filter(e=>e.alive).length,beaconHp:Math.ceil(this.beacon.hp),wins:{...this.village.raidWins},result:this.result,boss:this.boss.state(),
    allies:this.allies.map(a=>({id:a.id,name:a.name,role:a.combatRole,health:Math.ceil(a.hp),maxHp:a.maxHp,alive:a.alive,retreating:a.retreating,avoiding:a.avoiding,x:+a.x.toFixed(2),z:+a.z.toFixed(2),skills:this.skills.state(a)})),enemies:this.enemies.map(e=>({id:e.id,name:e.name,health:e.hp,alive:e.alive,boss:!!e.boss,x:e.x,z:e.z,skills:this.skills.state(e)}))};}
}
