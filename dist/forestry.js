import { terrainHeight } from './movement.js';

export const LUMBER = Object.freeze({ regrowSeconds:60, fallSeconds:1.15, pickupRadius:3, upgradeCosts:[12,24,36], bonusPerLevel:.15 });

export class Forestry {
  constructor(combat, definitions=[]) {
    this.combat=combat; this.wood=0; this.level=0; this.felled=0; this.collected=0; this.drops=[]; this.nextDrop=1;
    this.trees=definitions.map(t=>({id:t.id,kind:'tree',x:t.x,y:t.y,z:t.z,scale:t.scale,collider:t.collider,
      hp:t.scale>=1.2?200:160,maxHp:t.scale>=1.2?200:160,radius:.3*t.scale,height:2.8*t.scale,
      alive:true,hop:0,offBalance:0,flash:0,fall:0,respawn:0,fallX:0,fallZ:1,shakeX:0,shakeZ:1}));
  }
  get bonus() { return this.level*LUMBER.bonusPerLevel; }
  get cost() { return LUMBER.upgradeCosts[this.level]??null; }
  upgrade() {
    if(this.combat.hp<=0)return {accepted:false,reason:'먼저 다시 일어나 주세요.'};
    if(this.cost===null)return {accepted:false,reason:'손잡이를 최대로 강화했어요.'};
    if(this.wood<this.cost)return {accepted:false,reason:`목재 ${this.cost-this.wood}개가 더 필요해요.`};
    const cost=this.cost;this.wood-=cost;this.level++;
    this.combat.events.push({type:'lumber-upgrade',level:this.level,bonus:Math.round(this.bonus*100)});
    return {accepted:true,cost,level:this.level};
  }
  damage(tree,damage,dx,dz,context={}) {
    if(!tree.alive||damage<=0)return;
    const critical=tree.offBalance>0||context.forceCritical===true;
    const efficiency=(context.weapon??this.combat.weapon)==='axe'?1+this.bonus:.5;
    damage=Math.max(1,Math.round(damage*efficiency*(critical?this.combat.criticalMultiplier:1)));
    if(critical){tree.offBalance=0;this.combat.criticalHits++;}
    tree.hp=Math.max(0,tree.hp-damage);tree.flash=.25;tree.shakeX=dx;tree.shakeZ=dz;
    this.combat.lastHit={targetId:tree.id,damage,critical,time:this.combat.time,...context};
    this.combat.events.push({type:'hit',id:tree.id,kind:'tree',x:tree.x,y:tree.y+1.6,z:tree.z,damage,critical,...context});
    if(tree.hp===0){
      tree.alive=false;tree.offBalance=0;tree.collider.active=false;tree.fall=0;tree.respawn=LUMBER.regrowSeconds;
      const length=Math.hypot(dx,dz)||1;tree.fallX=dx/length;tree.fallZ=dz/length;
      const wood=(tree.scale>=1.2?6:4)+(critical?2:0);
      tree.reward=wood;tree.dropPending=true;this.felled++;
      this.combat.progression?.add('tree');
      this.combat.events.push({type:'tree-felled',id:tree.id,x:tree.x,y:tree.y+.6,z:tree.z,wood,bonus:critical?2:0});
    }
    return {damage,critical,killed:!tree.alive};
  }
  spawnWood(tree) {
    // One log represents one piece of wood, with deterministic scattering.
    for(let i=0;i<tree.reward;i++){
      const angle=i*2.399,spread=.6+(i%3)*.32;
      const x=tree.x+Math.cos(angle)*spread,z=tree.z+Math.sin(angle)*spread;
      this.drops.push({id:this.nextDrop++,x,y:terrainHeight(x,z)+.2,z,age:0,value:1,treeId:tree.id});
    }
  }
  update(dt,player) {
    for(const t of this.trees){
      t.flash=Math.max(0,t.flash-dt);t.offBalance=Math.max(0,t.offBalance-dt);
      if(t.alive)continue;
      t.fall=Math.min(LUMBER.fallSeconds,t.fall+dt);t.respawn=Math.max(0,t.respawn-dt);
      if(t.dropPending&&t.fall>=.55){t.dropPending=false;this.spawnWood(t);}
      if(t.respawn===0&&Math.hypot(t.x-player.x,t.z-player.z)>5
        &&!this.combat.entities.some(e=>e.alive&&Math.hypot(e.x-t.x,e.z-t.z)<e.radius+t.radius+.3)){
        Object.assign(t,{alive:true,hp:t.maxHp,fall:0,flash:0,offBalance:0});t.collider.active=true;
        this.combat.events.push({type:'tree-regrow',id:t.id,x:t.x,y:t.y,z:t.z});
      }
    }
    let collected=0;
    const spin=this.combat.warrior.active;
    const radius=spin?.id==='spin'&&spin.stage===2?6:LUMBER.pickupRadius;
    for(const drop of this.drops){
      drop.age+=dt;
      if(this.combat.hp<=0||drop.age<.3)continue;
      const dx=player.x-drop.x,dz=player.z-drop.z,distance=Math.hypot(dx,dz);
      if(distance>radius||Math.abs(player.y-terrainHeight(drop.x,drop.z))>1.8
        ||!this.combat.unobstructed({x:drop.x,y:drop.y+.35,z:drop.z},{x:player.x,y:player.y+.65,z:player.z}))continue;
      const step=Math.min(distance,(spin?.stage===2?11:8)*dt);
      drop.x+=dx/(distance||1)*step;drop.z+=dz/(distance||1)*step;drop.y=terrainHeight(drop.x,drop.z)+.2;
      if(distance<.6){drop.taken=true;collected+=drop.value;}
    }
    if(collected){this.wood+=collected;this.collected+=collected;this.combat.events.push({type:'wood-collected',amount:collected,x:player.x,y:player.y+2,z:player.z});}
    this.drops=this.drops.filter(d=>!d.taken);
  }
  state(player) {
    return {wood:this.wood,handleLevel:this.level,bonusPercent:Math.round(this.bonus*100),nextUpgradeCost:this.cost,felled:this.felled,collected:this.collected,
      drops:this.drops.map(d=>({id:d.id,x:+d.x.toFixed(2),z:+d.z.toFixed(2),wood:d.value})),
      trees:this.trees.filter(t=>Math.hypot(t.x-player.x,t.z-player.z)<24).map(t=>({id:t.id,x:+t.x.toFixed(2),z:+t.z.toFixed(2),health:t.hp,maxHealth:t.maxHp,alive:t.alive,crackedSeconds:+t.offBalance.toFixed(2),regrowSeconds:t.alive?0:+t.respawn.toFixed(1)}))};
  }
}
