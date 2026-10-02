import {RaidBoss,inHazard} from './raid-boss.js';
import {MIRROR_FIELD as FIELD,MIRROR_PILLARS as PILLARS,MIRROR_PATTERNS as PATTERNS} from './field-data.js';
import {terrainHeight} from './movement.js';

export function mirrorPillarColliders(){return PILLARS.map(p=>({minX:p.x-.75,maxX:p.x+.75,minZ:p.z-.75,maxZ:p.z+.75,bottom:0,top:3.8,active:true,mirrorPillar:p.id}));}

// A stationary caster: terrain cover, moving beams, and target recognition.
// Illusions are encounter props, never ordinary enemies or a source of XP.
export class MirrorBoss extends RaidBoss {
  clear(){
    if(this.projections)this.removeProjections();
    if(this.unit)this.unit.mirrorVeiled=false;
    super.clear();this.projections=[];this.mirrorCycle=0;this.pendingMirror=false;
    this.stats={patterns:0,mirrorBreaks:0,falseMirrors:0,missedMirrors:0,coverSuccess:0,playerHits:0};
  }
  notice(pattern,message){this.raids.combat.events.push({type:'boss-warning',pattern,message});}
  attach(unit){this.clear();this.unit=unit;unit.boss=true;unit.ccImmune=true;unit.exposed=0;unit.mirrorVeiled=false;this.notice('arrival','리세아가 나타났어요 · 기둥 뒤로 숨고, 그림자가 있는 진짜를 찾으세요');}
  addHazard(data,pattern){const rule=PATTERNS[pattern],h={id:++this.serial,age:0,delay:rule.windup,life:.4,damage:rule.damage,pattern,fired:false,nextTick:0,...data};this.hazards.push(h);return h;}
  removeProjections(){
    for(const e of this.projections??[]){e.alive=false;e.hp=0;}
    if(this.raids?.combat)this.raids.combat.entities=this.raids.combat.entities.filter(e=>!e.mirrorProjection);
    if(this.raids?.enemies)this.raids.enemies=this.raids.enemies.filter(e=>!e.mirrorProjection);
    this.projections=[];
  }
  makeProjections(){
    this.removeProjections();const real=(this.mirrorCycle++ + this.phase)%3;
    // Projection sockets alternate with pillars, keeping each approachable.
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,x=FIELD.x+Math.cos(angle)*6.4,z=FIELD.z+Math.sin(angle)*6.4;
      const e=this.raids.spawnEnemy('melee',x,z,1,i);
      Object.assign(e,{mirrorProjection:true,realMirror:i===real,name:'거울 분신',style:'projection',boss:false,ccImmune:true,fieldBoss:true,radius:.85,height:3,hp:1,maxHp:1});this.projections.push(e);
    }
  }
  begin(id,player){
    const u=this.unit,rule=PATTERNS[id];this.cast={id,elapsed:0,duration:rule.windup};this.stats.patterns++;
    if(id==='curtain'){
      const turn=this.patternIndex%2?0:Math.PI/2,dx=Math.sin(turn),dz=Math.cos(turn);
      for(const [i,offset] of [-6,0,6].entries())this.addHazard({shape:'lane',x:u.x+dz*offset,z:u.z-dx*offset,dx,dz,width:2.6,length:32,delay:2.1+i*.6},id);
    }
    if(id==='gaze')this.addHazard({shape:'circle',x:u.x,z:u.z,radius:26,requiresCover:true},id);
    if(id==='waltz'){
      const angle=Math.atan2(player.x-u.x,player.z-u.z)-.65;
      for(let i=0;i<(this.phase===3?2:1);i++)this.addHazard({shape:'cone',x:u.x,z:u.z,radius:22,halfAngle:.09,dx:Math.sin(angle+i*Math.PI),dz:Math.cos(angle+i*Math.PI),angle:angle+i*Math.PI,rotationSpeed:.62,delay:2.4,life:4.8,burn:10,tickInterval:.45},id);
    }
    if(id==='masquerade'){
      this.hazards=[];u.mirrorVeiled=true;this.makeProjections();
      // No damage overlaps the recognition window. A missed solve is a
      // readable, nonlethal pulse, and the next cycle offers another try.
    }
    this.notice(id,rule.name+' · '+rule.hint);
  }
  interrupt(){return false;}
  hitProjection(e,damage){
    if(!e.alive||this.cast?.id!=='masquerade'||!this.projections.includes(e))return {damage:0,critical:false,killed:false};
    e.alive=false;e.hp=0;e.offBalance=0;e.knockback=null;
    this.raids.combat.events.push({type:'boss-impact',x:e.x,y:e.y+1,z:e.z});
    if(e.realMirror){
      this.stats.mirrorBreaks++;this.removeProjections();this.unit.mirrorVeiled=false;this.unit.exposed=7;this.cast=null;this.hazards=[];this.cooldown=7.8;
      this.notice('exposed','진짜를 찾았어요! 본체가 7초간 노출 · 함성과 연계로 공격하세요');
    }else{
      this.stats.falseMirrors++;this.addHazard({shape:'circle',x:e.x,z:e.z,radius:2.6},'shard');this.notice('miss','가짜 거울이 깨졌어요 · 파편을 피하고 검은 그림자를 찾으세요');
    }
    return {damage:1,critical:false,killed:false};
  }
  covered(target){return !this.raids.visible(this.unit,target);}
  coverGoal(target){
    const u=this.unit;return PILLARS.map(p=>{const d=Math.hypot(p.x-u.x,p.z-u.z)||1;return {x:p.x+(p.x-u.x)/d*2.3,z:p.z+(p.z-u.z)/d*2.3};}).filter(p=>this.raids.nav.clear(p.x,p.z)).sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z))[0];
  }
  hit(h,target,amount){
    if(h.requiresCover&&inHazard(h,target)&&this.covered(target)){if(target.id==='player')this.stats.coverSuccess++;return;}
    super.hit(h,target,amount);
  }
  avoid(unit,index,dt){
    const flash=this.hazards.find(h=>h.requiresCover&&!h.fired&&h.age>.5);
    if(flash&&unit.alive&&!unit.dodge){
      const goal=this.coverGoal(unit);if(goal&&!this.covered(unit)){unit.action=null;unit.windup=0;unit.avoiding=true;this.raids.nav.move(unit,goal,3.9,dt);return true;}
      // Hold cover until the flash has passed instead of following the player.
      if(this.covered(unit)){unit.avoiding=true;unit.moving=false;return true;}
    }
    return super.avoid(unit,index,dt);
  }
  update(dt,player){
    const u=this.unit;if(!u)return;if(!u.alive){this.hazards=[];this.cast=null;this.removeProjections();return;}
    this.time+=dt;u.moving=false;u.heading=Math.atan2(player.x-u.x,player.z-u.z);u.exposed=Math.max(0,u.exposed-dt);u.stagger=0;u.knockback=null;u.knockX=u.knockZ=0;u.hop=0;
    const phase=u.hp/u.maxHp<=.35?3:u.hp/u.maxHp<=.65?2:1;
    if(phase>this.phase){this.phase=phase;this.pendingMirror=true;}
    if(!this.cast){this.cooldown=Math.max(0,this.cooldown-dt);if(this.cooldown<=0){const id=this.pendingMirror?'masquerade':['curtain','gaze','waltz','masquerade'][this.patternIndex++%4];this.pendingMirror=false;this.begin(id,player);}}
    if(this.cast){
      this.cast.elapsed+=dt;
      if(this.cast.elapsed>=this.cast.duration){
        const missed=this.cast.id==='masquerade';
        if(missed){
          this.stats.missedMirrors++;u.mirrorVeiled=false;this.removeProjections();this.addHazard({shape:'circle',x:u.x,z:u.z,radius:26,delay:3.5,requiresCover:true},'gaze');
          this.notice('miss','무도회가 끝났어요 · 기둥 뒤로 숨으세요! 다음 무도회에 다시 도전');
        }
        this.cast=null;this.cooldown=missed?4.0:this.phase===3?2.6:3.2;
      }
    }
    for(const h of this.hazards){
      h.age+=dt;
      if(h.rotationSpeed&&h.age>=h.delay){const a=h.angle+(h.age-h.delay)*h.rotationSpeed;h.dx=Math.sin(a);h.dz=Math.cos(a);}
      if(!h.fired&&h.age>=h.delay){h.fired=true;h.nextTick=h.delay+(h.tickInterval??1);for(const t of this.raids.friendlies(player))this.hit(h,t,h.damage);this.raids.combat.events.push({type:'boss-impact',x:h.x,y:terrainHeight(h.x,h.z),z:h.z});}
      if(h.fired&&h.burn&&h.age>=h.nextTick&&h.age<h.delay+h.life){h.nextTick+=h.tickInterval??1;for(const t of this.raids.friendlies(player))this.hit(h,t,h.burn);}
    }
    this.hazards=this.hazards.filter(h=>h.age<h.delay+h.life);
  }
  state(){
    const u=this.unit;if(!u?.alive)return null;const c=this.cast,afterGaze=this.hazards.find(h=>h.requiresCover&&!h.fired);
    const cast=c?{id:c.id,name:PATTERNS[c.id].name,hint:c.id==='waltz'&&c.elapsed>2.4?'광선 회전 중 · 화살표 방향으로 함께 움직이세요':PATTERNS[c.id].hint,remaining:+Math.max(0,c.duration-c.elapsed).toFixed(1),progress:c.elapsed/c.duration}:afterGaze?{id:'gaze',name:'무도회의 마지막 응시',hint:PATTERNS.gaze.hint,remaining:+Math.max(0,afterGaze.delay-afterGaze.age).toFixed(1),progress:afterGaze.age/afterGaze.delay}:null;
    return {name:u.name,health:Math.ceil(u.hp),maxHp:u.maxHp,phase:this.phase,time:+this.time.toFixed(1),exposed:+u.exposed.toFixed(1),veiled:!!u.mirrorVeiled,cast,stats:{...this.stats},projections:this.projections.filter(e=>e.alive).map(e=>({id:e.id,x:e.x,z:e.z,hasShadow:e.realMirror})),hazards:this.hazards.map(h=>({...h,remaining:+Math.max(0,h.delay-h.age).toFixed(1),active:h.fired}))};
  }
}
