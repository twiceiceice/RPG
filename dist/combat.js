import { terrainHeight, overlaps, WORLD_RADIUS } from './movement.js';
import { Warrior } from './warrior.js';

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
  constructor(colliders=[]) {
    this.colliders=colliders;this.entities=[];this.arrows=[];this.events=[];
    this.weapon='sword';this.cooldown=0;this.swing=0;this.hp=100;this.invincible=0;
    this.drawing=false;this.charge=0;this.release=0;this.lastCharge=0;
    this.hurt=0;this.sinceHit=100;this.kills={rabbit:0,slime:0};this.time=0;this.nextArrow=1;
    this.criticalHits=0;this.lastHit=null;
    this.warrior=new Warrior(this);
    const rabbits=[[-3,2],[4,-2],[-5,-10],[10,-11],[-13,5],[12,10]];
    const slimes=[[4,-9],[-2,-17],[12,-22],[-14,-23],[20,-6]];
    for(const [kind,spots] of [['rabbit',rabbits],['slime',slimes]]) {
      spots.forEach(([x,z],i)=>this.entities.push({id:`${kind}-${i+1}`,kind,x,z,y:terrainHeight(x,z),homeX:x,homeZ:z,
        hp:kind==='rabbit'?24:72,maxHp:kind==='rabbit'?24:72,radius:kind==='rabbit'?.43:.72,height:kind==='rabbit'?.8:1.3,
        alive:true,respawn:0,heading:i*1.9,brain:1+i*.31,phase:i*2,hop:0,flash:0,windup:0,recovery:0,alert:false,moving:false,
        knockX:0,knockZ:0,stagger:0,offBalance:0,variant:i%3}));
    }
  }
  equip(weapon) {
    if(!['axe','sword','bow'].includes(weapon))throw new Error('Unknown weapon');
    if(weapon!==this.weapon)this.warrior.cancel();
    this.cancelDraw();this.weapon=weapon;this.swing=0;this.release=0;
  }
  restorePlayer() {
    this.cancelDraw();this.warrior.cancel(true);this.hp=100;this.invincible=2;this.hurt=0;this.sinceHit=100;this.cooldown=0;this.swing=0;this.release=0;
    this.arrows.length=0;this.lastHit=null;for(const e of this.entities){e.offBalance=0;e.windup=0;e.recovery=Math.max(e.recovery,1);}
  }
  unobstructed(a,b) { return !this.colliders.some(box=>{const t=segmentBox(a,b,box);return t!==null&&t<.99;}); }
  damageEntity(e,damage,dx,dz) {
    if(!e.alive||damage<=0)return;
    const critical=e.offBalance>0;
    if(critical){damage*=2;e.offBalance=0;this.criticalHits++;}
    e.hp=Math.max(0,e.hp-damage);e.flash=.18;e.knockX=dx*4;e.knockZ=dz*4;
    this.lastHit={targetId:e.id,damage,critical,time:this.time};
    this.events.push({type:'hit',id:e.id,x:e.x,y:e.y+e.height,z:e.z,damage,critical,kind:e.kind});
    if(e.hp===0){e.alive=false;e.offBalance=0;e.respawn=e.kind==='rabbit'?13:17;this.kills[e.kind]++;this.events.push({type:'defeat',id:e.id,kind:e.kind,x:e.x,y:e.y+.4,z:e.z});}
  }
  applyOffBalance(e,seconds) {
    if(!e.alive)return;
    e.offBalance=seconds;
    this.events.push({type:'off-balance',id:e.id,x:e.x,y:e.y+e.height,z:e.z});
  }
  beginDraw() {
    if(this.weapon!=='bow'||this.hp<=0||this.cooldown>0||this.drawing)return false;
    this.drawing=true;this.charge=0;this.release=0;return true;
  }
  cancelDraw() { this.drawing=false;this.charge=0; }
  releaseDraw(player,direction,aimPoint) {
    if(!this.drawing)return false;
    const charge=this.charge;this.cancelDraw();
    if(this.weapon!=='bow'||this.hp<=0||this.cooldown>0)return false;
    this.cooldown=.45;this.release=.24;this.lastCharge=charge;
    const horizontal=Math.hypot(direction.x,direction.z)||1;
    const dx=direction.x/horizontal,dz=direction.z/horizontal;
    const start={x:player.x+dz*.22,y:player.y+1.42,z:player.z-dx*.22};
    const target=aimPoint??{x:start.x+direction.x*40,y:start.y+(direction.y||0)*40,z:start.z+direction.z*40};
    const ax=target.x-start.x,ay=target.y-start.y,az=target.z-start.z,n=Math.hypot(ax,ay,az)||1;
    const speed=19+25*charge,damage=Math.round(24+36*charge);
    this.arrows.push({id:this.nextArrow++,x:start.x,y:start.y,z:start.z,vx:ax/n*speed,vy:ay/n*speed,vz:az/n*speed,damage,life:4});
    this.events.push({type:'shoot',charge});return true;
  }
  attack(player,direction) {
    if(this.weapon==='axe')return this.warrior.basicAttack(player,direction);
    if(this.weapon!=='sword'||this.hp<=0||this.cooldown>0)return false;
    const length=Math.hypot(direction.x,direction.z)||1;
    const dx=direction.x/length,dz=direction.z/length;
    if(this.weapon==='sword') {
      this.cooldown=.43;this.swing=.34;
      this.events.push({type:'swing',x:player.x,y:player.y+.9,z:player.z,dx,dz});
      for(const e of this.entities) {
        if(!e.alive)continue;
        const ex=e.x-player.x,ez=e.z-player.z,dist=Math.hypot(ex,ez);
        const centerY=e.y+e.hop+e.height*.5;
        if(dist>2.6+e.radius||Math.abs(centerY-(player.y+1))>1.45)continue;
        if(dist>.15&&(ex*dx+ez*dz)/dist<.35)continue;
        if(!this.unobstructed({x:player.x,y:player.y+1,z:player.z},{x:e.x,y:centerY,z:e.z}))continue;
        this.damageEntity(e,32,dx,dz);
      }
    }
    return true;
  }
  damagePlayer(amount) {
    if(this.hp<=0||this.invincible>0)return false;
    this.hp=Math.max(0,this.hp-amount);this.invincible=.65;this.hurt=.32;this.sinceHit=0;
    this.events.push({type:'hurt',damage:amount});
    if(this.hp===0){this.cancelDraw();this.warrior.cancel();this.events.push({type:'player-defeat'});}
    return true;
  }
  moveEntity(e,dx,dz) {
    for(const [axis,amount] of [['x',dx],['z',dz]]) {
      const old=e[axis];e[axis]+=amount;
      if(this.colliders.some(b=>e.y<b.top-.08&&e.y+e.height>b.bottom&&overlaps(e.x,e.z,b,e.radius))){e[axis]=old;e.heading+=.9;}
    }
    const d=Math.hypot(e.x,e.z);
    if(d>WORLD_RADIUS-3){e.x*=((WORLD_RADIUS-3)/d);e.z*=((WORLD_RADIUS-3)/d);e.heading+=Math.PI*.8;}
    e.y=terrainHeight(e.x,e.z);
  }
  update(dt,player) {
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.swing=Math.max(0,this.swing-dt);this.release=Math.max(0,this.release-dt);
    if(this.drawing)this.charge=Math.min(1,this.charge+dt/1.05);
    this.invincible=Math.max(0,this.invincible-dt);this.hurt=Math.max(0,this.hurt-dt);this.sinceHit+=dt;
    for(const e of this.entities)e.offBalance=Math.max(0,e.offBalance-dt);
    this.warrior.update(dt,player);
    if(this.hp>0&&this.sinceHit>6)this.hp=Math.min(100,this.hp+4*dt);
    for(const e of this.entities) {
      e.flash=Math.max(0,e.flash-dt);e.recovery=Math.max(0,e.recovery-dt);
      if(!e.alive){
        e.respawn-=dt;
        if(e.respawn<=0&&Math.hypot(e.homeX-player.x,e.homeZ-player.z)>(e.kind==='slime'?9:4)) {
          Object.assign(e,{x:e.homeX,z:e.homeZ,y:terrainHeight(e.homeX,e.homeZ),hp:e.maxHp,alive:true,windup:0,recovery:1,knockX:0,knockZ:0,hop:0,stagger:0,offBalance:0});
          this.events.push({type:'spawn',x:e.x,y:e.y,z:e.z,kind:e.kind});
        }
        continue;
      }
      if(e.stagger>0){e.stagger=Math.max(0,e.stagger-dt);e.hop=0;e.moving=false;this.moveEntity(e,e.knockX*dt,e.knockZ*dt);e.knockX*=Math.exp(-12*dt);e.knockZ*=Math.exp(-12*dt);continue;}
      const px=player.x-e.x,pz=player.z-e.z,distance=Math.hypot(px,pz),homeDistance=Math.hypot(e.homeX-e.x,e.homeZ-e.z);
      let speed=0;e.phase+=dt*(e.kind==='rabbit'?10:6);e.brain-=dt;
      if(e.kind==='rabbit') {
        e.alert=distance<5||e.flash>0;
        if(e.alert){e.heading=Math.atan2(-px,-pz);speed=4.0;}
        else if(homeDistance>11){e.heading=Math.atan2(e.homeX-e.x,e.homeZ-e.z);speed=1.15;}
        else {if(e.brain<=0){e.heading+=1.4+Math.sin(this.time+e.phase);e.brain=2.5;}speed=e.brain<1.5?.7:0;}
        e.hop=speed>0?Math.abs(Math.sin(e.phase))*(e.alert?.32:.12):0;
      } else {
        e.alert=this.hp>0&&distance<13&&Math.abs(player.y-e.y)<4;
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
      for(const b of this.colliders){const t=segmentBox(old,next,b);if(t!==null&&t<=nearest){nearest=t;blocked=true;}}
      const ground=terrainHeight(next.x,next.z);
      if(next.y<=ground){const t=clamp((old.y-ground)/(old.y-next.y||1),0,1);if(t<=nearest){nearest=t;blocked=true;}}
      for(const e of this.entities){
        if(!e.alive)continue;
        const t=segmentSphere(old,next,{x:e.x,y:e.y+e.hop+e.height*.5,z:e.z},e.kind==='rabbit'?.48:.78);
        if(t!==null&&t<nearest){nearest=t;hit=e;blocked=false;}
      }
      arrow.x=old.x+(next.x-old.x)*nearest;arrow.y=old.y+(next.y-old.y)*nearest;arrow.z=old.z+(next.z-old.z)*nearest;
      if(hit){const n=Math.hypot(arrow.vx,arrow.vz)||1;this.damageEntity(hit,arrow.damage,arrow.vx/n,arrow.vz/n);arrow.life=0;}
      else if(blocked){this.events.push({type:'impact',x:arrow.x,y:arrow.y,z:arrow.z});arrow.life=0;}
    }
    this.arrows=this.arrows.filter(a=>a.life>0);
  }
}
