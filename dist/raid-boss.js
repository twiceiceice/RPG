import {terrainHeight} from './movement.js';

export const BOSS_PATTERNS = {
  cleave:{name:'전방 쓸기',hint:'보스의 옆이나 뒤로 피하세요',windup:1.8,damage:32},
  embers:{name:'쏟아지는 불씨',hint:'발밑의 원에서 벗어나세요 · 불길은 4초간 남아요',windup:2.1,damage:24},
  ring:{name:'바깥 고리',hint:'초록색 안쪽으로 들어가거나 고리 밖으로 피하세요',windup:2.2,damage:30},
  lanes:{name:'갈라지는 땅',hint:'세 줄의 바닥 사이 빈틈으로 이동하세요',windup:2,damage:28},
  horn:{name:'증원 나팔',hint:'2 내려찍기 → 3 날아차기로 차단! 성공하면 6초간 공격 기회',windup:3.8,damage:0},
};

// The renderer and damage checks use these same footprints. Ground attacks do
// not depend on the victim jumping or a visual mesh's bounding box.
export function inHazard(h,p,margin=0){
  const x=p.x-h.x,z=p.z-h.z,d=Math.hypot(x,z);
  if(h.shape==='circle')return d<=h.radius+margin;
  if(h.shape==='ring')return d>=h.inner-margin&&d<=h.radius+margin;
  if(h.shape==='cone')return d<=h.radius+margin&&(d<margin+.1||(x*h.dx+z*h.dz)/Math.max(.001,d)>=Math.cos(Math.min(Math.PI,h.halfAngle+Math.asin(Math.min(1,margin/Math.max(.001,d))))));
  if(h.shape==='lane')return Math.abs(x*h.dz-z*h.dx)<=h.width/2+margin&&Math.abs(x*h.dx+z*h.dz)<=h.length/2+margin;
  return false;
}

export class RaidBoss {
  constructor(raids){this.raids=raids;this.serial=0;this.clear();}
  clear(){this.unit=null;this.hazards=[];this.cast=null;this.phase=1;this.time=0;this.cooldown=2.5;this.patternIndex=0;this.pendingHorns=[];this.hitGrace=new Map();this.stats={patterns:0,interrupts:0,reinforcements:0,playerHits:0};this.enraged=false;}
  attach(unit){this.clear();this.unit=unit;unit.boss=true;unit.ccImmune=true;unit.exposed=0;this.raids.combat.events.push({type:'boss-warning',message:'붉은발 우두머리 · 붉은 바닥을 피하고 나팔을 끊으세요!',pattern:'arrival'});}
  addHazard(data,pattern){const h={id:++this.serial,age:0,delay:BOSS_PATTERNS[pattern].windup,life:.5,damage:BOSS_PATTERNS[pattern].damage,pattern,fired:false,nextTick:0,...data};this.hazards.push(h);return h;}
  begin(id,player){
    const u=this.unit,rule=BOSS_PATTERNS[id],d=Math.hypot(player.x-u.x,player.z-u.z),dx=d>.001?(player.x-u.x)/d:Math.sin(u.heading),dz=d>.001?(player.z-u.z)/d:Math.cos(u.heading);
    u.heading=Math.atan2(dx,dz);u.moving=false;u.windup=0;
    this.cast={id,elapsed:0,duration:rule.windup,dx,dz};this.stats.patterns++;
    if(id==='cleave')this.addHazard({shape:'cone',x:u.x,z:u.z,dx,dz,radius:9,halfAngle:Math.PI*.36},id);
    if(id==='ring')this.addHazard({shape:'ring',x:u.x,z:u.z,inner:4.2,radius:11.5},id);
    if(id==='embers'){
      const targets=[player,...this.raids.allies.filter(a=>a.alive).sort((a,b)=>Math.hypot(b.x-u.x,b.z-u.z)-Math.hypot(a.x-u.x,a.z-u.z))],spots=[];
      for(const t of targets){if(spots.some(p=>Math.hypot(p.x-t.x,p.z-t.z)<5.8))continue;spots.push({x:t.x,z:t.z});if(spots.length===(this.phase===3?4:3))break;}
      for(const p of spots)this.addHazard({...p,shape:'circle',radius:2.7,life:4.3,burn:8},id);
    }
    if(id==='lanes'){
      for(const offset of [-5,0,5])this.addHazard({shape:'lane',x:u.x+dz*offset,z:u.z-dx*offset,dx,dz,width:2.5,length:25},id);
    }
    this.raids.combat.events.push({type:'boss-warning',pattern:id,message:rule.name+' · '+rule.hint});
  }
  interrupt(unit){
    if(unit!==this.unit||this.cast?.id!=='horn')return false;
    this.cast=null;this.cooldown=6;unit.exposed=6;this.stats.interrupts++;
    this.raids.combat.events.push({type:'boss-warning',pattern:'interrupted',message:'나팔 차단! 증원 저지 · 6초간 보스가 받는 피해 +40%'});return true;
  }
  hit(h,target,amount){
    if(!inHazard(h,target)||Math.abs((target.y??0)-terrainHeight(target.x,target.z))>3)return;
    if((this.hitGrace.get(target.id)??0)>this.time)return;
    if(h.shape==='cone'&&!this.raids.visible({x:h.x,z:h.z,y:terrainHeight(h.x,h.z)},target))return;
    // Overlapping floor effects cannot stack into a one-frame kill.
    if(this.raids.hitAlly(target,amount,{ground:true,dx:0,dz:0})){
      this.hitGrace.set(target.id,this.time+.9);if(target.id==='player')this.stats.playerHits++;
    }
  }
  update(dt,player){
    const u=this.unit;if(!u)return;
    if(!u.alive){this.hazards=[];this.cast=null;return;}
    this.time+=dt;u.moving=false;u.exposed=Math.max(0,u.exposed-dt);u.stagger=0;u.knockback=null;u.knockX=u.knockZ=0;u.hop=0;
    const desired=u.hp/u.maxHp<=.35?3:u.hp/u.maxHp<=.65?2:1;
    while(this.phase<desired){this.phase++;this.pendingHorns.push(this.phase);}
    if(!this.enraged&&this.time>=150){this.enraged=true;this.raids.combat.events.push({type:'boss-warning',pattern:'enrage',message:'장기전 격노 · 예고 시간은 같지만 공격 사이 휴식이 짧아집니다!'});}
    if(this.cast){
      this.cast.elapsed+=dt;
      if(this.cast.elapsed>=this.cast.duration){
        if(this.cast.id==='horn'){
          this.raids.spawnReinforcements(u,this.phase);this.stats.reinforcements+=4;
          this.raids.combat.events.push({type:'boss-warning',pattern:'summon',message:'나팔이 울렸어요! 전투병 4명이 합류합니다.'});
        }
        this.cast=null;this.cooldown=this.enraged?1.1:this.phase===3?1.7:this.phase===2?2.2:2.8;
      }
    }else{
      this.cooldown=Math.max(0,this.cooldown-dt);
      if(this.cooldown<=0){
        if(this.pendingHorns.length){this.pendingHorns.shift();this.begin('horn',player);}
        else{const sequence=this.phase===1?['cleave','embers','ring']:['embers','cleave','lanes','ring'];this.begin(sequence[this.patternIndex++%sequence.length],player);}
      }else if(u.exposed<=0&&Math.hypot(player.x-u.x,player.z-u.z)>5.4)this.raids.nav.move(u,player,1.8,dt);
    }
    for(const h of this.hazards){
      h.age+=dt;
      if(!h.fired&&h.age>=h.delay){h.fired=true;h.nextTick=h.delay+1;for(const target of this.raids.friendlies(player))this.hit(h,target,h.damage);this.raids.combat.events.push({type:'boss-impact',x:h.x,y:terrainHeight(h.x,h.z),z:h.z});}
      if(h.fired&&h.burn&&h.age>=h.nextTick&&h.age<h.delay+h.life){h.nextTick+=1;for(const target of this.raids.friendlies(player))this.hit(h,target,h.burn);}
    }
    this.hazards=this.hazards.filter(h=>h.age<h.delay+h.life);
  }
  avoid(unit,index,dt){
    unit.avoiding=false;if(!unit.alive||unit.stagger>0||unit.dodge)return false;
    const threats=this.hazards.filter(h=>h.age>=.38+(index%4)*.12&&(!h.fired||h.burn));
    if(!threats.some(h=>inHazard(h,unit,.4))){unit.safeGoal=null;return false;}
    unit.evadeClock=(unit.evadeClock??0)-dt;
    if(!unit.safeGoal||unit.evadeClock<=0||threats.some(h=>inHazard(h,unit.safeGoal,.8))){
      unit.safeGoal=null;unit.evadeClock=.4;
      for(const radius of [2,4,6,9]){
        for(let i=0;i<16;i++){
          const angle=i*Math.PI/8+index*.31,p={x:unit.x+Math.cos(angle)*radius,z:unit.z+Math.sin(angle)*radius};
          if(!threats.some(h=>inHazard(h,p,.8))&&this.raids.nav.clear(p.x,p.z)&&this.raids.nav.direct(unit,p)){unit.safeGoal=p;break;}
        }if(unit.safeGoal)break;
      }
    }
    if(!unit.safeGoal)return false;
    unit.action=null;unit.followup=null;unit.windup=0;unit.avoiding=true;this.raids.nav.move(unit,unit.safeGoal,3.9,dt);return true;
  }
  state(){const u=this.unit;return !u?.alive?null:{name:u.name,health:Math.ceil(u.hp),maxHp:u.maxHp,phase:this.phase,enraged:this.enraged,time:+this.time.toFixed(1),exposed:+u.exposed.toFixed(1),cast:this.cast?{id:this.cast.id,name:BOSS_PATTERNS[this.cast.id].name,hint:BOSS_PATTERNS[this.cast.id].hint,remaining:+Math.max(0,this.cast.duration-this.cast.elapsed).toFixed(1),progress:this.cast.elapsed/this.cast.duration}:null,stats:{...this.stats},hazards:this.hazards.map(({id,shape,x,z,radius,inner,width,length,dx,dz,age,delay,life,pattern})=>({id,shape,x,z,radius,inner,width,length,dx,dz,remaining:+Math.max(0,delay-age).toFixed(1),active:age>=delay,pattern}))};}
}
