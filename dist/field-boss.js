import {RaidBoss} from './raid-boss.js';
import {terrainHeight} from './movement.js';
import {FIELD,STONES,FIELD_PATTERNS,VARKAN_RULES} from './field-data.js';

// Shares collision footprints and NPC avoidance with the combat system, but
// owns its encounter schedule. No waves, reinforcements, or kick interrupt.
export class FieldBoss extends RaidBoss {
  clear(){
    super.clear();this.stones=STONES.map(s=>({...s,charged:false,broken:false}));
    this.stats={patterns:0,stoneBreaks:0,missedStones:0,playerHits:0};this.pendingResonance=false;
  }
  attach(unit){
    this.clear();this.unit=unit;unit.boss=true;unit.ccImmune=true;unit.exposed=0;unit.stoneArmor=VARKAN_RULES.armorReduction;
    this.notice('arrival','돌갑옷으로 받는 피해 25% 감소 · 공명석에 번개를 유도해 약점을 드러내세요');
  }
  notice(pattern,message){this.raids.combat.events.push({type:'boss-warning',pattern,message});}
  addHazard(data,pattern){
    const rule=FIELD_PATTERNS[pattern];const h={id:++this.serial,age:0,delay:rule.windup,life:.5,damage:rule.damage,source:rule.name,burnSource:'잔류 번개',pattern,fired:false,nextTick:0,...data};this.hazards.push(h);return h;
  }
  mark(player,pattern='brand'){
    return this.addHazard({shape:'circle',x:player.x,z:player.z,radius:2.4,trackUntil:pattern==='resonance'?4.8:2.5,locked:false,life:8,burn:VARKAN_RULES.burnDamage},pattern);
  }
  begin(id,player){
    const u=this.unit,rule=FIELD_PATTERNS[id],d=Math.hypot(player.x-u.x,player.z-u.z)||1,dx=(player.x-u.x)/d,dz=(player.z-u.z)/d;
    u.heading=Math.atan2(dx,dz);u.moving=false;
    this.cast={id,elapsed:0,duration:rule.windup};this.stats.patterns++;
    if(id==='sweep')this.addHazard({shape:'cone',x:u.x,z:u.z,dx,dz,radius:6.7,halfAngle:.95},id);
    if(id==='brand')this.mark(player);
    if(id==='pulse'){
      this.addHazard({shape:'circle',x:u.x,z:u.z,radius:4.5,delay:2.2},id);
      this.addHazard({shape:'ring',x:u.x,z:u.z,inner:4.5,radius:10,delay:3.9},id);
      if(this.phase===3)this.mark(player); // Only this final-phase pair overlaps.
    }
    if(id==='resonance'){
      // Clear old pools so the route to the objective is always available.
      this.hazards=[];for(const stone of this.stones){stone.charged=false;stone.broken=false;}
      const stone=[...this.stones].sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
      stone.charged=true;this.mark(player,id);
      this.notice(id,`${stone.name} 활성화! 내 번개를 공명석에 유도하세요`);return;
    }
    this.notice(id,rule.name+' · '+rule.hint);
  }
  interrupt(){return false;}
  breakStone(stone){
    stone.charged=false;stone.broken=true;this.stats.stoneBreaks++;
    this.hazards=[];this.cast=null;this.unit.exposed=VARKAN_RULES.exposure;this.cooldown=VARKAN_RULES.exposure+.8;
    this.notice('exposed','돌갑옷 파괴! 8초간 받는 피해 +40% · 준비한 기술로 몰아치세요!');
  }
  update(dt,player){
    const u=this.unit;if(!u)return;if(!u.alive){this.hazards=[];this.cast=null;return;}
    this.time+=dt;u.moving=false;u.exposed=Math.max(0,u.exposed-dt);u.stagger=0;u.knockback=null;u.knockX=u.knockZ=0;u.hop=0;
    const desired=u.hp/u.maxHp<=.35?3:u.hp/u.maxHp<=.65?2:1;
    if(desired>this.phase){this.phase=desired;this.pendingResonance=true;}
    if(!this.cast){
      this.cooldown=Math.max(0,this.cooldown-dt);
      if(this.cooldown<=0){
        const sequence=['sweep','brand','pulse','resonance'];
        const id=this.pendingResonance?'resonance':sequence[this.patternIndex++%sequence.length];
        this.pendingResonance=false;this.begin(id,player);
      }else if(u.exposed<=0&&Math.hypot(player.x-u.x,player.z-u.z)>4.6){
        // Keep the beast in the basin, even when the player kites at the edge.
        const d=Math.hypot(player.x-FIELD.x,player.z-FIELD.z)||1,k=Math.min(1,4.8/d);
        this.raids.nav.move(u,{x:FIELD.x+(player.x-FIELD.x)*k,z:FIELD.z+(player.z-FIELD.z)*k},1.5,dt);
      }
    }
    if(this.cast)this.cast.elapsed+=dt;
    for(const h of [...this.hazards]){
      h.age+=dt;
      if(h.trackUntil&&!h.fired){
        if(h.age<h.trackUntil){h.x=player.x;h.z=player.z;}
        else if(!h.locked){h.locked=true;this.notice('lock',h.pattern==='resonance'?'번개 위치 고정 · 공명석 위에 겹쳤다면 떨어질 때까지 기다리세요':'번개 위치 고정 · 지금 원 밖으로 이동!');}
      }
      if(!h.fired&&h.age>=h.delay){
        h.fired=true;h.nextTick=h.delay+1;
        if(h.pattern==='resonance'){
          // The mark centre must land on the rune, not merely graze its edge.
          const stone=this.stones.find(s=>s.charged&&Math.hypot(s.x-h.x,s.z-h.z)<=2.1);
          if(stone){this.breakStone(stone);this.raids.combat.events.push({type:'boss-impact',x:stone.x,y:terrainHeight(stone.x,stone.z),z:stone.z});return;}
          this.stats.missedStones++;for(const s of this.stones)s.charged=false;
          this.notice('miss','공명석에 닿지 않았어요 · 남은 번개를 피하고 다음 기회를 노리세요');
        }
        for(const target of this.raids.friendlies(player))this.hit(h,target,h.damage);
        this.raids.combat.events.push({type:'boss-impact',x:h.x,y:terrainHeight(h.x,h.z),z:h.z});
      }
      if(h.fired&&h.burn&&h.age>=h.nextTick&&h.age<h.delay+h.life){h.nextTick+=1;for(const target of this.raids.friendlies(player))this.hit(h,target,h.burn,true);}
    }
    this.hazards=this.hazards.filter(h=>h.age<h.delay+h.life);
    if(this.cast&&this.cast.elapsed>=this.cast.duration){this.cast=null;this.cooldown=this.phase===3?2.3:3;}
  }
  state(){
    const u=this.unit;if(!u?.alive)return null;const cast=this.cast,mark=this.hazards.find(h=>h.trackUntil&&!h.fired),stone=this.stones.find(s=>s.charged);
    let hint=cast?FIELD_PATTERNS[cast.id].hint:'';
    if(mark)hint=mark.locked?'원이 멈췄어요 · 번개가 떨어지기 전에 밖으로!':stone?`${stone.name}으로 이동 · 내 번개 원을 공명석 중심에 겹치세요`:'내 번개가 따라와요 · 가장자리로 유도하세요';
    return {name:u.name,health:Math.ceil(u.hp),maxHp:u.maxHp,phase:this.phase,time:+this.time.toFixed(1),exposed:+u.exposed.toFixed(1),
      armorReduction:u.exposed>0?0:u.stoneArmor,
      cast:cast?{id:cast.id,name:FIELD_PATTERNS[cast.id].name,hint,remaining:+Math.max(0,cast.duration-cast.elapsed).toFixed(1),progress:cast.elapsed/cast.duration}:null,
      stats:{...this.stats},stones:this.stones.map(s=>({...s})),hazards:this.hazards.map(h=>({...h,remaining:+Math.max(0,h.delay-h.age).toFixed(1),active:h.fired}))};
  }
}
