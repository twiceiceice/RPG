import {terrainHeight} from './movement.js';
import {BATTLE,SOLDIER_ROLES,soldierRole,inAttackArea,bowShot} from './battle-rules.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export class SoldierSkills {
  constructor(raids){this.raids=raids;}
  init(unit,index=0){Object.assign(unit,{action:null,dodge:null,battlecry:0,guardBroken:0,stagger:0,hop:0,followup:null,skillUses:{},skillCooldowns:Object.fromEntries(Object.keys(BATTLE).map(id=>[id,id==='charge'||id==='shot'?index*.35:0]))});}
  move(unit,dx,dz){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));let travelled=0;
    for(let i=0;i<steps;i++){
      const x=unit.x+dx/steps,z=unit.z+dz/steps;
      if(!this.raids.nav.clear(x,z,unit.radius??.4))break;
      travelled+=Math.hypot(x-unit.x,z-unit.z);unit.x=x;unit.z=z;
    }
    unit.y=terrainHeight(unit.x,unit.z);unit.moving=travelled>.0001;unit.step=(unit.step??0)+travelled*2.5;return travelled;
  }
  targets(friendly,player){return friendly?this.raids.enemies.filter(e=>e.alive):this.raids.friendlies(player).concat(this.raids.mode==='defense'&&this.raids.beacon.alive?[this.raids.beacon]:[]);}
  start(unit,id,target,friendly){
    if(unit.skillCooldowns[id]>0||unit.action||unit.dodge||unit.stagger>0||unit.knockback)return false;
    if(!friendly&&id!=='battlecry'&&this.raids.enemies.filter(e=>e.action).length>=2)return false;
    const rule=BATTLE[id],d=distance(unit,target)||1,dx=(target.x-unit.x)/d,dz=(target.z-unit.z)/d;
    unit.skillCooldowns[id]=rule.cooldown;unit.skillUses[id]=(unit.skillUses[id]??0)+1;unit.windup=0;
    if(id==='battlecry'){unit.battlecry=rule.duration;this.raids.combat.events.push({type:'soldier-buff',x:unit.x,y:unit.y,z:unit.z,friendly});return true;}
    if(id==='evade'){unit.dodge={elapsed:0,dx:-dx,dz:-dz};unit.followup=null;return true;}
    unit.heading=Math.atan2(dx,dz);unit.moving=false;
    unit.action={id,elapsed:0,delay:id==='charge'?.65:0,dx,dz,x:unit.x,z:unit.z,aim:{x:target.x,y:(target.y??0)+.9,z:target.z},hit:false,hitIds:new Set(),stopped:false,friendly};
    return true;
  }
  choose(unit,target,player,friendly){
    if(!SOLDIER_ROLES[soldierRole(unit)])return false;
    const role=soldierRole(unit),d=distance(unit,target),ready=(friendly?unit.cooldown:unit.recovery)<=0;
    if(role!=='archer'&&unit.battlecry<=0&&(unit.hp<unit.maxHp*.6||this.targets(friendly,player).filter(t=>distance(unit,t)<4).length>=2))this.start(unit,'battlecry',target,friendly);
    if(role==='archer'&&d<3.2&&this.start(unit,'evade',target,friendly))return true;
    if(!ready||!this.raids.visible(unit,target))return false;
    if(unit.followup==='sweep'){
      unit.followup=null;if(d<5&&this.start(unit,'sweep',target,friendly))return true;
    }
    if(role==='archer')return d<=BATTLE.shot.range&&this.start(unit,'shot',target,friendly);
    if(role==='warrior'&&d<3.2&&this.start(unit,'slam',target,friendly))return true;
    if(d>3&&d<9&&this.raids.nav.direct(unit,target)&&this.start(unit,'charge',target,friendly))return true;
    return false;
  }
  hit(unit,player,shape){
    const a=unit.action,rule=BATTLE[a.id];let hits=0;
    for(const target of this.targets(a.friendly,player)){
      if(a.hitIds.has(target.id)||!inAttackArea(unit,{x:a.dx,z:a.dz},target,shape)||!this.raids.visible(unit,target))continue;
      a.hitIds.add(target.id);
      const base=rule.damage*(a.friendly?.6:.55)*(unit.power??1)*(unit.battlecry>0?BATTLE.battlecry.damage:1);
      let accepted;
      if(a.friendly){
        const result=this.raids.combat.damageEntity(target,Math.round(base),a.dx,a.dz,{source:'ally',skill:a.id,preserveOpening:true});accepted=!!result&&!result.evaded;
        if(accepted&&target.alive&&!target.ccImmune){target.stagger=Math.max(target.stagger,Math.min(rule.stagger,.7));target.windup=0;}
      }else accepted=this.raids.hitAlly(target,Math.round(base),{dx:a.dx,dz:a.dz,skill:a.id,stagger:Math.min(rule.stagger,.35)});
      if(accepted)hits++;
    }
    if(hits||a.id!=='charge')this.raids.combat.events.push({type:'soldier-impact',skill:a.id,x:shape.x??unit.x,y:unit.y,z:shape.z??unit.z,dx:a.dx,dz:a.dz,friendly:a.friendly});
    return hits;
  }
  shoot(unit){
    const a=unit.action,start={x:unit.x,y:unit.y+1.42,z:unit.z},dx=a.aim.x-start.x,dy=a.aim.y-start.y,dz=a.aim.z-start.z,n=Math.hypot(dx,dy,dz)||1,{speed,damage}=bowShot(1);
    this.raids.bolts.push({...start,vx:dx/n*speed,vy:dy/n*speed,vz:dz/n*speed,life:2,friendly:a.friendly,gravity:1.7,damage:Math.round(damage*.4*(unit.power??1)*(unit.battlecry>0?BATTLE.battlecry.damage:1))});
    this.raids.combat.events.push({type:'soldier-impact',skill:'shot',x:unit.x,y:unit.y,z:unit.z,friendly:a.friendly});unit.swing=.32;
  }
  tick(unit,dt,player,friendly){
    if(!unit.skillCooldowns)this.init(unit);
    for(const id in unit.skillCooldowns)unit.skillCooldowns[id]=Math.max(0,unit.skillCooldowns[id]-dt);
    unit.battlecry=Math.max(0,unit.battlecry-dt);
    if(!unit.alive){unit.action=null;unit.dodge=null;unit.followup=null;unit.battlecry=0;return true;}
    if(friendly){unit.guardBroken=Math.max(0,unit.guardBroken-dt);unit.stagger=Math.max(0,unit.stagger-dt);}
    if(unit.stagger>0||unit.knockback){unit.action=null;unit.dodge=null;unit.followup=null;unit.windup=0;return true;}
    if(unit.dodge){const d=unit.dodge;this.move(unit,d.dx*BATTLE.evade.speed*dt,d.dz*BATTLE.evade.speed*dt);d.elapsed+=dt;if(d.elapsed>=BATTLE.evade.duration)unit.dodge=null;return true;}
    const a=unit.action;if(!a)return false;unit.moving=false;a.elapsed+=dt;
    const rule=BATTLE[a.id],time=a.elapsed-a.delay;
    if(time<0)return true;
    if(a.id==='charge'&&time<rule.moveTime&&!a.stopped){
      const travel=rule.speed*dt;if(this.move(unit,a.dx*travel,a.dz*travel)+.0001<travel)a.stopped=true;
      if(this.hit(unit,player,rule))a.stopped=true;
    }
    if(a.id==='shot'&&!a.hit&&time>=rule.duration){a.hit=true;this.shoot(unit);}
    if((a.id==='slam'||a.id==='sweep')&&!a.hit&&time>=rule.impact){
      a.hit=true;unit.swing=.32;this.hit(unit,player,{...rule,x:unit.x+a.dx*(rule.offset??0),z:unit.z+a.dz*(rule.offset??0)});
    }
    if(time>=rule.duration){unit.action=null;unit.cooldown=unit.recovery=a.id==='slam'?.25:1.1;if(a.id==='slam')unit.followup='sweep';}
    return true;
  }
  state(unit){return {role:soldierRole(unit),skill:unit.action?.id??null,preparing:!!unit.action&&!unit.action.hit,battlecry:+(unit.battlecry??0).toFixed(2),guardBroken:+(unit.guardBroken??0).toFixed(2),evading:!!unit.dodge,uses:{...unit.skillUses},cooldowns:{...unit.skillCooldowns}};}
}
