import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {HUNTS} from '../dist/field-data.js';
import {inHazard} from '../dist/raid-boss.js';
import {createEnvironment} from '../dist/environment.js';
import {createMirrorScenery} from '../dist/mirror-view.js';
import * as THREE from '../dist/vendor/three.module.js';

for(const id of ['varkan','lysea']){
  const scene=new THREE.Scene(),env=createEnvironment(scene);createMirrorScenery(scene,env);
  const h=new Hunting(env.colliders),p=new Movement(env.colliders),v=new Village(h),r=new FieldHunt(h,v),field=HUNTS[id],dt=1/120;
  h.entities=[];Object.assign(p,{x:20,z:15,y:0});h.chooseClass('mage',p);r.select(id);r.acceptQuest(p);Object.assign(p,{...field.entry,y:0});assert.ok(r.start('field',p).accepted);
  let goal={...field.entry},route=[],decision=0,shatters=0,blinks=0,surges=0,lastCast;
  for(let time=0;time<600&&r.active;time+=dt){
    const b=r.boss,u=b.unit,target=b.projections?.find(e=>e.alive&&e.realMirror)??u,d=Math.hypot(target.x-p.x,target.z-p.z)||1;
    const point={x:target.x,y:target.y+target.height*.5,z:target.z},dir={x:(target.x-p.x)/d,y:0,z:(target.z-p.z)/d};
    h.mage.setAim(dir,point);
    if(decision--<=0){
      decision=12;
      const mark=b.hazards.find(a=>a.trackUntil&&!a.fired),stone=b.stones?.find(a=>a.charged),flash=b.hazards.find(a=>a.requiresCover&&!a.fired);
      const threats=b.hazards.filter(a=>!a.requiresCover&&(a.fired?a.burn:a.delay-a.age<2.05)&&!(a.trackUntil&&!a.locked));
      const dangerAt=(pos,margin=.55)=>threats.some(a=>inHazard(a,pos,margin)||(a.rotationSpeed&&inHazard({...a,dx:Math.sin(Math.atan2(a.dx,a.dz)+.5*a.rotationSpeed),dz:Math.cos(Math.atan2(a.dx,a.dz)+.5*a.rotationSpeed)},pos,margin)));
      if(flash)goal=b.coverGoal(p);
      else if(mark&&!mark.locked){
        const dist=Math.hypot(p.x-field.x,p.z-field.z)||1;
        goal=stone?{x:stone.x,z:stone.z}:{x:field.x+(p.x-field.x)/dist*13,z:field.z+(p.z-field.z)/dist*13};
      }else{
        const candidates=[];
        for(const radius of [3,5,7,9,11])for(let a=0;a<32;a++){
          const x=target.x+Math.cos(a*Math.PI/16)*radius,z=target.z+Math.sin(a*Math.PI/16)*radius;
          if(Math.hypot(x-field.x,z-field.z)>field.radius-1||!r.nav.clear(x,z,.55)||dangerAt({x,z}))continue;
          candidates.push({x,z,score:Math.hypot(x-p.x,z-p.z)+Math.abs(radius-7)*.25});
        }
        goal=candidates.sort((a,b)=>a.score-b.score)[0]??goal;
      }
      route=r.nav.direct(p,goal)?[]:r.nav.path(p,goal);
      const danger=!!flash||dangerAt(p,.3),moving=Math.hypot(goal.x-p.x,goal.z-p.z)>.4;
      if(danger&&Math.hypot(goal.x-p.x,goal.z-p.z)>2&&r.nav.direct(p,goal))h.mage.request('blink',p,{x:goal.x-p.x,z:goal.z-p.z});
      if(h.hp<75&&h.mage.shield===0)h.mage.request('barrier',p,dir);
      if(d<12&&!target.mirrorVeiled&&!h.mage.cast&&h.unobstructed({x:p.x,y:p.y+1.35,z:p.z},point)){
        const spell=u.exposed>0&&h.mage.charge===100?'surge':h.mage.embers>0&&(moving||danger||h.mage.embers===2)?'flare':target.frostMark<=0&&h.mage.cooldowns.frost===0?'frost':!moving&&!danger&&h.mage.cooldowns.fireball===0?'fireball':'bolt';
        h.mage.request(spell,p,dir,point);
      }
      if(h.hp<35&&v.potions)v.usePotion();
      if(process.argv.includes('--trace')&&lastCast!==b.cast?.id){console.log(id,time.toFixed(1),b.cast?.id,h.hp,u.hp,h.mage.embers,b.stats);lastCast=b.cast?.id;}
    }
    while(route.length&&Math.hypot(route[0].x-p.x,route[0].z-p.z)<.35)route.shift();
    const step=route[0]??goal,dist=Math.hypot(step.x-p.x,step.z-p.z),input={x:dist>.25?(step.x-p.x)/dist:0,z:dist>.25?(step.z-p.z)/dist:0,sprint:false};
    h.mage.movement(input,p);p.update(dt,input);h.update(dt,p);r.update(dt,p);v.update(dt,p);
    for(const e of h.events){if(e.type==='mage-shatter')shatters++;if(e.type==='mage-blink')blinks++;if(e.type==='mage-surge')surges++;}h.events=[];
  }
  assert.equal(r.result?.won,true,`${id} mage solo completion`);assert.ok(shatters>3);assert.ok(surges>0);
  if(id==='varkan')assert.ok(r.result.bossStats.stoneBreaks>=2);
  else {assert.ok(r.result.bossStats.coverSuccess>=1);assert.ok(r.result.bossStats.mirrorBreaks>=2);}
  console.log(`PASS mage solo ${id} with collision, movement, casts and boss mechanics (${r.result.elapsed}s, ${shatters} shatters, ${blinks} blinks, ${surges} surges)`);
  h.restorePlayer();Object.assign(p,{...field.entry,y:0,vx:0,vz:0,vy:0});assert.ok(r.start('field',p).accepted);
  for(let t=0;t<400&&r.active;t+=dt){p.update(dt,{x:0,z:0});h.update(dt,p);r.update(dt,p);h.events=[];}
  assert.equal(r.result?.won,false);console.log(`PASS idle mage cannot ignore ${id} mechanics`);
}
