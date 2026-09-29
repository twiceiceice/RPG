import { terrainHeight, overlaps, WORLD_RADIUS } from './movement.js';
import { Warrior } from './warrior.js';
import { Forestry } from './forestry.js';
import { Tactics } from './tactics.js';
import { BATTLE, bowShot, guardedDamage } from './battle-rules.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function segmentSphere(a, b, center, radius) {
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const ox=a.x-center.x, oy=a.y-center.y, oz=a.z-center.z;
  const aa=dx*dx+dy*dy+dz*dz, bb=2*(ox*dx+oy*dy+oz*dz), cc=ox*ox+oy*oy+oz*oz-radius*radius;
  if(cc<=0) return 0;
  if(aa<1e-12) return null;
  const disc=bb*bb-4*aa*cc;
  if(disc<0) return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);
  return t>=0&&t<=1?t:null;
}
export function segmentBox(a,b,box) {
  let near=0,far=1;
  for(const [axis,lo,hi] of [['x',box.minX,box.maxX],['y',box.bottom,box.top],['z',box.minZ,box.maxZ]]) {
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-10) { if(a[axis]<lo||a[axis]>hi)return null; continue; }
    let t0=(lo-a[axis])/d,t1=(hi-a[axis])/d;
    if(t0>t1)[t0,t1]=[t1,t0]; near=Math.max(near,t0);far=Math.min(far,t1);
    if(near>far)return null;
  }
  return near;
}
export class Hunting {
  constructor(colliders=[],trees=[]) {
    this.colliders=colliders;this.entities=[];this.arrows=[];this.events=[];
    this.weapon='sword';this.cooldown=0;this.swing=0;this.hp=100;this.invincible=0;
    this.meleeInterval=2;this.meleeCooldown=0;
    this.drawing=false;this.charge=0;this.release=0;this.lastCharge=0;
    this.hurt=0;this.sinceHit=100;this.kills={rabbit:0,slime:0};this.time=0;this.nextArrow=1;
    this.criticalHits=0;this.lastHit=null;this.armorLevel=0;this.inSanctuary=false;
    this.autoAttackRecovery=false;this.meleeFacing=null;
    this.autoMelee={targetId:null,attacks:0};
    this.warrior=new Warrior(this);
    this.tactics=new Tactics(this);
    this.forestry=new Forestry(this,trees);
    const rabbits=[[-3,2],[4,-2],[-5,-10],[10,-11],[-13,5],[12,10]];
    const slimes=[[4,-9],[-2,-17],[12,-22],[-14,-23],[20,-6]];
    for(const [kind,spots] of [['rabbit',rabbits],['slime',slimes]]) {
      spots.forEach(([x,z],i)=>this.entities.push({id:`${kind}-${i+1}`,kind,x,z,y:terrainHeight(x,z),homeX:x,homeZ:z,
        hp:kind==='rabbit'?24:72,maxHp:kind==='rabbit'?24:72,radius:kind==='rabbit'?.43:.72,height:kind==='rabbit'?.8:1.3,
        alive:true,respawn:0,heading:i*1.9,brain:1+i*.31,phase:i*2,hop:0,flash:0,windup:0,recovery:0,alert:false,moving:false,
        knockX:0,knockZ:0,knockback:null,lastPush:null,stagger:0,offBalance:0,variant:i%3}));
    }
  }
  equip(weapon) {
    if(!['axe','sword','bow'].includes(weapon))throw new Error('Unknown weapon');
    if(weapon!==this.weapon)this.warrior.cancel();
    this.cancelDraw();this.weapon=weapon;this.swing=0;this.release=0;this.autoMelee.targetId=null;this.meleeFacing=null;
  }
  get maxHp(){return this.progression?.bonuses.maxHp??100;}
  get criticalMultiplier(){return this.progression?.bonuses.critical??2;}
  talentDamage(entity,damage,context){
    if(context.source==='ally')return damage;
    if(this.tactics.battlecry>0)damage*=BATTLE.battlecry.damage;
    if(!this.progression)return Math.round(damage);
    const p=this.progression,b=p.bonuses;damage*=b.damage;
    if(context.source==='slam')damage*=b.slam;
    if(context.source==='spin')damage*=b.spin;
    if(entity.kind!=='tree'&&entity.hp<=entity.maxHp*.3&&p.rank('execute'))damage*=1.25;
    return Math.max(1,Math.round(damage));
  }
  restorePlayer() {
    this.tactics.reset();
    this.cancelDraw();this.warrior.cancel(true);this.hp=this.maxHp;this.invincible=2;this.hurt=0;this.sinceHit=100;this.cooldown=0;this.swing=0;this.release=0;
    this.arrows.length=0;this.lastHit=null;for(const e of this.entities){e.offBalance=0;e.knockback=null;e.lastPush=null;e.hop=0;e.knockX=e.knockZ=0;e.windup=0;e.recovery=Math.max(e.recovery,1);}
    this.autoAttackRecovery=false;this.meleeFacing=null;this.autoMelee={targetId:null,attacks:0};
    this.meleeCooldown=0;
    for(const tree of this.forestry.trees){tree.offBalance=0;tree.flash=0;}
  }
  targets() { return this.entities.concat(this.forestry.trees); }
  unobstructed(a,b,ignore=null) { return !this.colliders.some(box=>{if(box===ignore||box.active===false)return false;const t=segmentBox(a,b,box);return t!==null&&t<.99;}); }
  damageEntity(e,damage,dx,dz,context={}) {
    damage=this.talentDamage(e,damage,context);
    if(e.kind==='tree')return this.forestry.damage(e,damage,dx,dz,context);
    if(!e.alive||damage<=0)return;
    if(e.dodge&&e.dodge.elapsed<BATTLE.evade.invulnerable)return {damage:0,critical:false,killed:false,evaded:true};
    if(e.raider){
      if(context.source==='kick'){if(e.boss)this.raids?.boss.interrupt(e);else{e.guardBroken=4;this.events.push({type:'guard-break',x:e.x,y:e.y+2,z:e.z});}}
      if(e.exposed>0)damage=Math.round(damage*1.4);
      const guard=guardedDamage(e,damage,dx,dz);damage=guard.damage;
      if(guard.blocked)this.events.push({type:'guard-block',x:e.x,y:e.y+2,z:e.z});
    }
    const critical=(!context.preserveOpening&&e.offBalance>0)||context.forceCritical===true;
    if(critical){damage=Math.round(damage*this.criticalMultiplier);e.offBalance=0;this.criticalHits++;}
    e.hp=Math.max(0,e.hp-damage);e.flash=.18;e.knockX=e.ccImmune?0:dx*4;e.knockZ=e.ccImmune?0:dz*4;
    this.lastHit={targetId:e.id,damage,critical,time:this.time,...context};
    this.events.push({type:'hit',id:e.id,x:e.x,y:e.y+e.height+e.hop,z:e.z,damage,critical,kind:e.kind,...context});
    if(e.hp===0){e.alive=false;e.offBalance=0;e.knockback=null;e.respawn=e.kind==='rabbit'?13:17;if(e.kind in this.kills)this.kills[e.kind]++;this.events.push({type:'defeat',id:e.id,kind:e.kind,x:e.x,y:e.y+.4,z:e.z});this.progression?.add(e.style==='captain'?'captain':e.kind);if(this.hp>0)this.hp=Math.min(this.maxHp,this.hp+(this.progression?.bonuses.healOnKill??0));this.village?.rewardKill(e);}
    return { damage, critical, killed: !e.alive };
  }
  applyOffBalance(e,seconds) {
    if(!e.alive)return;
    e.offBalance=seconds;
    this.events.push({type:'off-balance',id:e.id,kind:e.kind,x:e.x,y:e.y+(e.kind==='tree'?1.5:e.height),z:e.z});
  }
  launchEntity(e,dx,dz,power) {
    if(!e.alive||e.kind==='tree'||e.ccImmune)return;
    const length=Math.hypot(dx,dz)||1;
    e.knockX=e.knockZ=0;e.windup=0;e.stagger=power.duration+1.15;e.recovery=e.stagger;
    e.knockback={dx:dx/length,dz:dz/length,elapsed:0,...power};
    e.lastPush={power:power.id,requested:power.distance,travelled:0,blocked:false};
  }
  beginDraw() {
    if(this.tactics.busy||this.inSanctuary||this.weapon!=='bow'||this.hp<=0||this.cooldown>0||this.drawing)return false;
    this.drawing=true;this.charge=0;this.release=0;return true;
  }
  cancelDraw() { this.drawing=false;this.charge=0; }
  releaseDraw(player,direction,aimPoint) {
    if(!this.drawing)return false;
    const charge=this.charge;this.cancelDraw();
    if(this.village?.isSafe(player)||this.weapon!=='bow'||this.hp<=0||this.cooldown>0)return false;
    this.cooldown=.45;this.release=.24;this.lastCharge=charge;
    const horizontal=Math.hypot(direction.x,direction.z)||1;
    const dx=direction.x/horizontal,dz=direction.z/horizontal;
    const start={x:player.x+dz*.22,y:player.y+1.42,z:player.z-dx*.22};
    const target=aimPoint??{x:start.x+direction.x*40,y:start.y+(direction.y||0)*40,z:start.z+direction.z*40};
    const ax=target.x-start.x,ay=target.y-start.y,az=target.z-start.z,n=Math.hypot(ax,ay,az)||1;
    const {speed,damage}=bowShot(charge);
    this.arrows.push({id:this.nextArrow++,x:start.x,y:start.y,z:start.z,vx:ax/n*speed,vy:ay/n*speed,vz:az/n*speed,damage,life:4});
    this.events.push({type:'shoot',charge});return true;
  }
  attack(player,direction) {
    if(this.tactics.busy)return false;
    if(this.village?.isSafe(player))return false;
    if(this.weapon==='axe') {
      const attacked=this.warrior.basicAttack(player,direction);
      if(attacked)this.autoAttackRecovery=false;
      return attacked;
    }
    if(this.weapon!=='sword'||this.hp<=0||this.cooldown>0||this.meleeCooldown>1e-8)return false;
    const length=Math.hypot(direction.x,direction.z)||1;
    const dx=direction.x/length,dz=direction.z/length;
    if(this.weapon==='sword') {
      this.autoAttackRecovery=false;this.meleeFacing={x:dx,z:dz};
      this.cooldown=.43;this.swing=.34;this.meleeCooldown=this.meleeInterval;
      this.events.push({type:'swing',x:player.x,y:player.y+.9,z:player.z,dx,dz});
      for(const e of this.targets()) {
        if(!e.alive)continue;
        const ex=e.x-player.x,ez=e.z-player.z,dist=Math.hypot(ex,ez);
        const centerY=e.y+e.hop+e.height*.5;
        if(dist>2.6+e.radius||Math.abs(centerY-(player.y+1))>1.45)continue;
        if(dist>.15&&(ex*dx+ez*dz)/dist<.35)continue;
        if(!this.unobstructed({x:player.x,y:player.y+1,z:player.z},{x:e.x,y:centerY,z:e.z},e.collider))continue;
        this.damageEntity(e,32,dx,dz,{weapon:'sword'});
      }
    }
    return true;
  }
  autoAttack(player) {
    this.autoMelee.targetId=null;
    const w=this.warrior;
    if(this.tactics.busy || this.village?.isSafe(player) || this.hp<=0 || !player.grounded || !['axe','sword'].includes(this.weapon)
      || w.active || w.followup || w.queued || (w.combo.step>0 && w.combo.remaining>0))return false;
    const range=this.weapon==='axe'?2.7:2.6;
    let target=null,nearest=Infinity;
    // Only creatures initiate auto attack; passing a tree never starts logging.
    for(const e of this.entities) {
      if(!e.alive)continue;
      const distance=Math.hypot(e.x-player.x,e.z-player.z);
      const centerY=e.y+e.hop+e.height*.5;
      const inHeight=this.weapon==='axe'?Math.abs(e.y+e.hop-player.y)<=1.7:Math.abs(centerY-player.y-1)<=1.45;
      if(distance>range+e.radius || !inHeight || distance>=nearest)continue;
      const originY=player.y+(this.weapon==='axe'?.9:1),targetY=this.weapon==='axe'?e.y+e.hop+.6:centerY;
      if(!this.unobstructed({x:player.x,y:originY,z:player.z},{x:e.x,y:targetY,z:e.z}))continue;
      target=e;nearest=distance;
    }
    if(!target)return false;
    this.autoMelee.targetId=target.id;
    if(this.cooldown>0||this.meleeCooldown>1e-8)return false;
    const direction=nearest>1e-6?{x:(target.x-player.x)/nearest,z:(target.z-player.z)/nearest}:w.aimDirection??{x:0,z:1};
    const motion={vx:player.vx,vz:player.vz,jumpBuffer:player.jumpBuffer};
    if(!this.attack(player,direction))return false;
    this.autoAttackRecovery=true;this.autoMelee.attacks++;
    if(w.active?.id==='slash') {
      w.active.automatic=true;
      // Automatic melee should not stop walking or consume a pending jump.
      Object.assign(player,motion);
    }
    return true;
  }
  damagePlayer(amount) {
    if(this.tactics.invulnerable){this.tactics.dodged++;return false;}
    if(this.inSanctuary||this.hp<=0||this.invincible>0)return false;
    const bonuses=this.progression?.bonuses;amount=Math.max(1,Math.round((amount-this.armorLevel*2-(bonuses?.reduction??0))*(1-(bonuses?.mitigation??0))*(this.tactics.battlecry>0?BATTLE.battlecry.taken:1)));
    this.hp=Math.max(0,this.hp-amount);this.invincible=.65;this.hurt=.32;this.sinceHit=0;
    this.events.push({type:'hurt',damage:amount});
    if(this.hp===0){this.cancelDraw();this.warrior.cancel(false,true);this.events.push({type:'player-defeat'});}
    return true;
  }
  moveEntity(e,dx,dz) {
    if(e.kind==='tree')return;
    for(const [axis,amount] of [['x',dx],['z',dz]]) {
      const old=e[axis];e[axis]+=amount;
      if((!e.raider&&this.village?.contains(e,e.radius))||this.colliders.some(b=>b.active!==false&&e.y<b.top-.08&&e.y+e.height>b.bottom&&overlaps(e.x,e.z,b,e.radius))){e[axis]=old;e.heading+=.9;}
    }
    const d=Math.hypot(e.x,e.z);
    if(d>WORLD_RADIUS-3){e.x*=((WORLD_RADIUS-3)/d);e.z*=((WORLD_RADIUS-3)/d);e.heading+=Math.PI*.8;}
    e.y=terrainHeight(e.x,e.z);
  }
  update(dt,player) {
    this.inSanctuary=!!this.village?.isSafe(player);
    if(this.inSanctuary){
      this.cancelDraw();
      if(this.warrior.active||this.warrior.followup||this.warrior.queued||this.warrior.combo.step){this.warrior.cancel();player.vx=player.vz=0;}
      this.swing=0;this.autoMelee.targetId=null;
    }
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.swing=Math.max(0,this.swing-dt);this.release=Math.max(0,this.release-dt);
    this.tactics.update(dt);
    // The attack interval is independent of short swing recovery, so skills
    // remain responsive and cancelling a swing cannot reset basic-attack cadence.
    this.meleeCooldown=Math.max(0,this.meleeCooldown-dt);
    if(this.cooldown===0)this.autoAttackRecovery=false;
    if(this.drawing)this.charge=Math.min(1,this.charge+dt/1.05);
    this.invincible=Math.max(0,this.invincible-dt);this.hurt=Math.max(0,this.hurt-dt);this.sinceHit+=dt;
    for(const e of this.entities){e.offBalance=Math.max(0,e.offBalance-dt);e.guardBroken=Math.max(0,(e.guardBroken??0)-dt);}
    this.warrior.update(dt,player);
    this.forestry.update(dt,player);
    if(this.hp>0&&this.sinceHit>6)this.hp=Math.min(this.maxHp,this.hp+4*dt);
    for(const e of this.entities) {
      e.flash=Math.max(0,e.flash-dt);e.recovery=Math.max(0,e.recovery-dt);
      if(!e.alive){
        if(e.raider)continue;
        e.respawn-=dt;
        if(e.respawn<=0&&Math.hypot(e.homeX-player.x,e.homeZ-player.z)>(e.kind==='slime'?9:4)) {
          Object.assign(e,{x:e.homeX,z:e.homeZ,y:terrainHeight(e.homeX,e.homeZ),hp:e.maxHp,alive:true,windup:0,recovery:1,knockX:0,knockZ:0,knockback:null,lastPush:null,hop:0,stagger:0,offBalance:0});
          this.events.push({type:'spawn',x:e.x,y:e.y,z:e.z,kind:e.kind});
        }
        continue;
      }
      if(e.knockback){
        const k=e.knockback,oldProgress=k.elapsed/k.duration;
        k.elapsed=Math.min(k.duration,k.elapsed+dt);const progress=k.elapsed/k.duration;
        const travel=k.distance*((1-oldProgress)**3-(1-progress)**3);
        let moved=0;
        // Small collision steps keep even the strongest shove outside thin walls.
        const steps=Math.max(1,Math.ceil(travel/.12));
        for(let i=0;i<steps;i++){const x=e.x,z=e.z;this.moveEntity(e,k.dx*travel/steps,k.dz*travel/steps);moved+=Math.hypot(e.x-x,e.z-z);}
        e.lastPush.travelled+=moved;if(moved+1e-4<travel)e.lastPush.blocked=true;
        e.stagger=Math.max(0,e.stagger-dt);e.moving=false;e.hop=Math.sin(Math.PI*progress)*k.lift;
        if(progress>=1){e.knockback=null;e.hop=0;}
        continue;
      }
      if(e.stagger>0){e.stagger=Math.max(0,e.stagger-dt);e.hop=0;e.moving=false;this.moveEntity(e,e.knockX*dt,e.knockZ*dt);e.knockX*=Math.exp(-12*dt);e.knockZ*=Math.exp(-12*dt);continue;}
      if(e.raider){this.moveEntity(e,e.knockX*dt,e.knockZ*dt);e.knockX*=Math.exp(-12*dt);e.knockZ*=Math.exp(-12*dt);continue;}
      const px=player.x-e.x,pz=player.z-e.z,distance=Math.hypot(px,pz),homeDistance=Math.hypot(e.homeX-e.x,e.homeZ-e.z);
      let speed=0;e.phase+=dt*(e.kind==='rabbit'?10:6);e.brain-=dt;
      if(e.kind==='rabbit') {
        e.alert=distance<5||e.flash>0;
        if(e.alert){e.heading=Math.atan2(-px,-pz);speed=4.0;}
        else if(homeDistance>11){e.heading=Math.atan2(e.homeX-e.x,e.homeZ-e.z);speed=1.15;}
        else {if(e.brain<=0){e.heading+=1.4+Math.sin(this.time+e.phase);e.brain=2.5;}speed=e.brain<1.5?.7:0;}
        e.hop=speed>0?Math.abs(Math.sin(e.phase))*(e.alert?.32:.12):0;
      } else {
        e.alert=!this.inSanctuary&&this.hp>0&&distance<13&&Math.abs(player.y-e.y)<4;
        if(e.windup>0){
          e.windup=Math.max(0,e.windup-dt);e.hop=Math.sin((1-e.windup/.5)*Math.PI)*.7;
          if(e.windup===0){
            if(this.hp>0&&distance<2.2&&Math.abs(player.y-e.y)<1.6&&this.unobstructed({x:e.x,y:e.y+.65,z:e.z},{x:player.x,y:player.y+.7,z:player.z}))this.damagePlayer(12);
            e.recovery=1.1;
          }
        } else if(e.alert) {
          e.heading=Math.atan2(px,pz);
          if(distance>1.55)speed=2.0;
          else if(e.recovery<=0)e.windup=.5;
          e.hop=speed>0?Math.abs(Math.sin(e.phase))*.24:0;
        } else {
          if(homeDistance>7){e.heading=Math.atan2(e.homeX-e.x,e.homeZ-e.z);speed=.65;}
          else{if(e.brain<=0){e.heading+=1.7;e.brain=3.8;}speed=e.brain<2?.5:0;}
          e.hop=speed>0?Math.abs(Math.sin(e.phase))*.14:0;
        }
      }
      e.moving=speed>.05;
      this.moveEntity(e,(Math.sin(e.heading)*speed+e.knockX)*dt,(Math.cos(e.heading)*speed+e.knockZ)*dt);
      e.knockX*=Math.exp(-12*dt);e.knockZ*=Math.exp(-12*dt);
    }
    for(const arrow of this.arrows) {
      arrow.life-=dt;if(arrow.life<=0)continue;
      const old={x:arrow.x,y:arrow.y,z:arrow.z};
      const next={x:arrow.x+arrow.vx*dt,y:arrow.y+arrow.vy*dt,z:arrow.z+arrow.vz*dt};arrow.vy-=1.7*dt;
      let nearest=1,hit=null,blocked=false;
      for(const b of this.colliders){
        if(b.active===false)continue;
        const t=segmentBox(old,next,b);
        if(t!==null&&t<=nearest){nearest=t;hit=b.treeId?this.forestry.trees.find(e=>e.id===b.treeId&&e.alive)??null:null;blocked=!hit;}
      }
      const ground=terrainHeight(next.x,next.z);
      if(next.y<=ground){const t=clamp((old.y-ground)/(old.y-next.y||1),0,1);if(t<=nearest){nearest=t;blocked=true;hit=null;}}
      for(const e of this.entities){
        if(!e.alive)continue;
        const t=segmentSphere(old,next,{x:e.x,y:e.y+e.hop+e.height*.5,z:e.z},e.kind==='rabbit'?.48:.78);
        if(t!==null&&t<nearest){nearest=t;hit=e;blocked=false;}
      }
      arrow.x=old.x+(next.x-old.x)*nearest;arrow.y=old.y+(next.y-old.y)*nearest;arrow.z=old.z+(next.z-old.z)*nearest;
      if(hit){const n=Math.hypot(arrow.vx,arrow.vz)||1;this.damageEntity(hit,arrow.damage,arrow.vx/n,arrow.vz/n,{weapon:'bow'});arrow.life=0;}
      else if(blocked){this.events.push({type:'impact',x:arrow.x,y:arrow.y,z:arrow.z});arrow.life=0;}
    }
    this.arrows=this.arrows.filter(a=>a.life>0);
  }
}
