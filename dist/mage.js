import {overlaps,terrainHeight,WORLD_RADIUS,PLAYER_HEIGHT} from './movement.js';

export const MAGE_SKILLS=[
  {id:'fireball',key:'1',name:'화염구',cooldown:1.5,damage:24,cast:.8,detail:'0.8초 영창 · 서리 표식을 터뜨리면 잔불 +1'},
  {id:'frost',key:'2',name:'서리창',cooldown:4,damage:10,detail:'즉시 발사 · 6초 서리 표식 · 일반 적 둔화'},
  {id:'ring',key:'3',name:'서리 고리',cooldown:10,damage:12,detail:'주변 4.5m에 서리 표식 · 일반 적 1.6초 속박'},
  {id:'flare',key:'4',name:'불꽃 쇄도',cooldown:.7,damage:34,detail:'잔불 1개로 즉시 발사 · 이동 중 사용'},
  {id:'surge',key:'5',name:'원소 해방',cooldown:0,detail:'궁극기 100 소비 · 8초간 화염구 즉시 시전'},
];
export const MAGE_TACTICS={blink:{name:'점멸',cooldown:6},barrier:{name:'얼음 방벽',cooldown:18}};
const rules=Object.fromEntries(MAGE_SKILLS.map(s=>[s.id,s]));
const origin=p=>({x:p.x,y:p.y+1.35,z:p.z});
const center=e=>({x:e.x,y:e.y+(e.hop??0)+e.height*.5,z:e.z});
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

export class Mage {
  constructor(combat){this.combat=combat;this.nextBolt=1;this.reset();}
  reset(){
    this.cast=null;this.projectiles=[];this.embers=0;this.charge=0;this.surge=0;this.shield=0;this.shieldTime=0;this.blinkTime=0;this.recovery=0;this.pose=0;
    this.cooldowns=Object.fromEntries([...MAGE_SKILLS.map(s=>s.id),'blink','barrier','bolt'].map(id=>[id,0]));
    this.tutorial=0;this.lastSpell=null;
    for(const e of this.combat.entities){e.frostMark=0;e.frozen=0;e.slowed=0;}
  }
  cancel(){this.cast=null;}
  clearCombat(){this.cancel();this.projectiles=[];this.surge=0;this.shield=0;this.shieldTime=0;}
  get equipped(){return this.combat.classId==='mage'&&this.combat.weapon==='staff';}
  get bonuses(){return this.combat.progression?.bonuses??{};}
  reason(id,player){
    if(!this.equipped)return '마법사로 전직하고 지팡이를 들어 주세요.';
    if(!rules[id]&&!MAGE_TACTICS[id]&&id!=='bolt')return '알 수 없는 주문이에요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(this.combat.village?.isSafe(player))return '마을 밖에서 마법을 사용할 수 있어요.';
    if(this.combat.tactics.busy||this.blinkTime>0)return '회피와 경직이 끝나면 사용할 수 있어요.';
    if(this.cooldowns[id]>1e-8)return `${(rules[id]??MAGE_TACTICS[id])?.name??'마력탄'} 재사용까지 ${this.cooldowns[id].toFixed(1)}초`;
    if(!['blink','barrier'].includes(id)&&(this.cast||this.recovery>1e-8))return '현재 주문이 끝나면 사용할 수 있어요.';
    if(id==='fireball'&&this.surge<=0&&(!player.grounded||Math.hypot(player.vx,player.vz)>.25))return '잠깐 멈춰 화염구를 영창하세요.';
    if(id==='blink'&&!player.grounded)return '땅에 발을 딛은 뒤 점멸하세요.';
    if(id==='flare'&&this.embers===0)return '2 서리창 → 1 화염구로 잔불을 모으세요.';
    if(id==='surge'&&this.charge<100)return `원소 해방 ${this.charge}/100 · 주문을 적중시켜 충전하세요.`;
    return null;
  }
  request(id,player,direction={x:0,y:0,z:-1},aimPoint){
    const reason=this.reason(id,player);if(reason)return {accepted:false,reason};
    if(id==='blink'){this.blink(player,direction);return {accepted:true};}
    if(id==='barrier'){
      this.cancel();this.shield=30+(this.bonuses.mageShield??0);this.shieldTime=8;this.cooldowns.barrier=18;
      this.combat.events.push({type:'mage-barrier',...origin(player)});return {accepted:true};
    }
    if(id==='surge'){
      this.charge=0;this.surge=8+(this.bonuses.mageSurge??0);this.cooldowns.fireball=0;this.recovery=.2;
      this.combat.events.push({type:'mage-surge',...origin(player)});return {accepted:true};
    }
    if(id==='fireball'&&this.surge<=0){
      this.cast={elapsed:0,duration:.8,direction:{...direction},aimPoint:aimPoint?{...aimPoint}:null,origin:{x:player.x,z:player.z}};
      player.vx=player.vz=0;this.combat.events.push({type:'mage-cast',skill:id,...origin(player)});return {accepted:true};
    }
    this.release(id,player,direction,aimPoint);return {accepted:true};
  }
  setAim(direction,aimPoint){if(this.cast){this.cast.direction={...direction};this.cast.aimPoint=aimPoint?{...aimPoint}:null;}}
  movement(input,player){if(this.cast&&(Math.hypot(input.x,input.z)>.05||player.jumpBuffer>0||!player.grounded))this.cancel();}
  blink(player,direction){
    this.cancel();const n=Math.hypot(direction.x,direction.z)||1,dx=direction.x/n,dz=direction.z/n,start={...origin(player)};
    for(let i=0;i<50;i++){
      const x=player.x+dx*.1,z=player.z+dz*.1,y=terrainHeight(x,z);
      if(Math.hypot(x,z)>WORLD_RADIUS||Math.abs(y-player.y)>.3||this.combat.colliders.some(b=>b.active!==false&&y<b.top-.04&&y+PLAYER_HEIGHT>b.bottom+.01&&overlaps(x,z,b)))break;
      player.x=x;player.z=z;player.y=y;
    }
    player.vx=player.vz=0;player.jumpBuffer=0;this.blinkTime=.25;this.cooldowns.blink=6;this.recovery=.15;
    this.combat.events.push({type:'mage-blink',...start,end:origin(player)});
  }
  release(id,player,direction,aimPoint){
    this.cancel();this.lastSpell=id;this.pose=.35;this.recovery=id==='bolt'?.3:.4;
    this.cooldowns[id]=id==='bolt'?.55:id==='fireball'&&this.surge>0?.85:rules[id].cooldown;
    if(id==='flare'){this.embers--;this.tutorial=Math.max(this.tutorial,3);}
    if(id==='ring'){
      let charged=false;
      for(const e of this.combat.targets()){
        if(!e.alive||e.mirrorProjection||e.kind==='tree'||Math.hypot(e.x-player.x,e.z-player.z)>4.5+e.radius||Math.abs(e.y-player.y)>2||!this.combat.unobstructed(origin(player),center(e),e.collider))continue;
        const result=this.combat.damageEntity(e,12,0,0,{source:'mage-ring',weapon:'staff'});
        if(result?.damage>0){this.mark(e,true);if(!charged){this.gain(6);charged=true;}}
      }
      this.combat.events.push({type:'mage-ring',x:player.x,y:player.y+.08,z:player.z});return;
    }
    const from=origin(player),point=aimPoint??{x:from.x+direction.x*12,y:from.y+(direction.y??0)*12,z:from.z+direction.z*12};
    const n=length(from,point)||1,dir={x:(point.x-from.x)/n,y:(point.y-from.y)/n,z:(point.z-from.z)/n};
    // Modest aim assistance chooses by aim angle, never by whether a mirror is real.
    let target=null,best=.985;
    for(const e of this.combat.targets()){
      if(!e.alive)continue;const c=center(e),d=length(from,c);if(d>12+e.radius||d<.1)continue;
      const dot=((c.x-from.x)*dir.x+(c.y-from.y)*dir.y+(c.z-from.z)*dir.z)/d;
      if(dot>best&&this.combat.unobstructed(from,c,e.collider)){target=c;best=dot;}
    }
    if(target){const d=length(from,target);dir.x=(target.x-from.x)/d;dir.y=(target.y-from.y)/d;dir.z=(target.z-from.z)/d;}
    this.projectiles.push({id:this.nextBolt++,skill:id,...from,dx:dir.x,dy:dir.y,dz:dir.z,remaining:12,speed:id==='frost'?26:20,damage:id==='bolt'?6:rules[id].damage});
    this.combat.events.push({type:'mage-shoot',skill:id,...from});
  }
  mark(e,root=false){
    if(!e.alive||e.kind==='tree'||e.mirrorProjection)return;
    e.frostMark=6+(this.bonuses.mageFrost??0);
    if(!e.ccImmune&&!e.boss){e.slowed=3;if(root){e.frozen=1.6;e.windup=0;e.action=null;}}
    this.tutorial=Math.max(this.tutorial,1);
  }
  gain(amount){
    if(this.surge>0)return;
    const before=this.charge;this.charge=Math.min(100,this.charge+amount);
    if(before<100&&this.charge===100)this.combat.events.push({type:'mage-ready'});
  }
  hit(bolt,e){
    const shatter=bolt.skill==='fireball'&&e.frostMark>0;
    const damage=bolt.damage*(bolt.skill==='fireball'?(this.bonuses.mageFire??1):bolt.skill==='flare'?(this.bonuses.mageFlare??1):1);
    const result=this.combat.damageEntity(e,damage,bolt.dx,bolt.dz,{source:'mage-'+bolt.skill,weapon:'staff',forceCritical:shatter});
    if(!result?.damage)return;
    this.gain(bolt.skill==='bolt'?1:bolt.skill==='frost'?6:8);
    if(bolt.skill==='frost')this.mark(e);
    if(shatter){
      e.frostMark=0;this.embers=Math.min(2,this.embers+1);this.tutorial=Math.max(this.tutorial,2);this.gain(6);
      this.combat.events.push({type:'mage-shatter',...center(e),embers:this.embers});
    }
  }
  absorb(amount){
    const absorbed=Math.min(amount,this.shield);this.shield-=absorbed;
    if(absorbed>0)this.combat.events.push({type:'mage-absorb',amount:absorbed});
    return amount-absorbed;
  }
  update(dt,player){
    for(const e of this.combat.entities)for(const key of ['frostMark','frozen','slowed'])e[key]=Math.max(0,(e[key]??0)-dt);
    for(const id in this.cooldowns)this.cooldowns[id]=Math.max(0,this.cooldowns[id]-dt);
    for(const key of ['surge','shieldTime','blinkTime','recovery','pose'])this[key]=Math.max(0,this[key]-dt);
    if(this.shieldTime===0)this.shield=0;
    if(!this.equipped||this.combat.hp<=0||this.combat.inSanctuary){this.clearCombat();return;}
    if(this.cast){
      if(!player.grounded||Math.hypot(player.vx,player.vz)>.25||Math.hypot(player.x-this.cast.origin.x,player.z-this.cast.origin.z)>.06||this.combat.tactics.busy)this.cancel();
      else {this.cast.elapsed+=dt;if(this.cast.elapsed>=this.cast.duration){const c=this.cast;this.release('fireball',player,c.direction,c.aimPoint);}}
    }
    for(const bolt of this.projectiles){
      const travel=Math.min(bolt.remaining,bolt.speed*dt),to={x:bolt.x+bolt.dx*travel,y:bolt.y+bolt.dy*travel,z:bolt.z+bolt.dz*travel};
      const hit=this.combat.traceSpell(bolt,to);
      bolt.x+=(to.x-bolt.x)*hit.t;bolt.y+=(to.y-bolt.y)*hit.t;bolt.z+=(to.z-bolt.z)*hit.t;bolt.remaining-=travel;
      if(hit.entity||hit.blocked){if(hit.entity)this.hit(bolt,hit.entity);bolt.remaining=0;this.combat.events.push({type:'mage-impact',skill:bolt.skill,x:bolt.x,y:bolt.y,z:bolt.z});}
    }
    this.projectiles=this.projectiles.filter(b=>b.remaining>1e-8);
  }
  state(){return {embers:this.embers,charge:this.charge,surge:+this.surge.toFixed(2),shield:this.shield,shieldTime:+this.shieldTime.toFixed(2),casting:this.cast?{elapsed:+this.cast.elapsed.toFixed(2),duration:this.cast.duration}:null,projectiles:this.projectiles.length,tutorial:this.tutorial,cooldowns:Object.fromEntries(Object.entries(this.cooldowns).map(([k,v])=>[k,+v.toFixed(2)]))};}
}
