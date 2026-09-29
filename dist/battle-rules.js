// Player, allied soldiers and enemy soldiers share these combat rules.
export const BATTLE = Object.freeze({
  charge:{name:'돌진',duration:.52,cooldown:4,damage:8,radius:1.2,cone:.4,knock:1,stagger:.65,speed:27,moveTime:.36},
  slam:{name:'내려찍기',duration:1.08,cooldown:3.5,impact:.64,damage:39,radius:1.65,offset:1.45,cone:-.1,knock:.6,stagger:1.65},
  sweep:{name:'가로베기',duration:1.65,cooldown:1.8,impact:1.06,damage:38,radius:4.3,cone:-.35,knock:9,stagger:.9},
  shot:{name:'조준 사격',duration:1.05,cooldown:2.5,range:18},
  evade:{name:'회피',duration:.42,cooldown:4,speed:9,invulnerable:.28},
  battlecry:{name:'전투 함성',duration:6,cooldown:30,damage:1.35,taken:.75},
});
export const SOLDIER_ROLES=Object.freeze({
  guard:{name:'방패병',hint:'정면 방어 · 옆/뒤를 노리거나 날아차기로 방패 무너뜨리기',skills:['charge','battlecry']},
  warrior:{name:'전사',hint:'내려찍기 → 가로베기 · 예고 범위 밖으로 회피 후 반격',skills:['charge','slam','sweep','battlecry']},
  archer:{name:'궁수',hint:'조준선 고정 후 사격 · 옆으로 회피하고 돌진으로 접근',skills:['shot','evade']},
});
export function soldierRole(unit){return unit.style==='captain'||unit.style==='melee'?'warrior':unit.style;}
export function bowShot(charge){charge=Math.max(0,Math.min(1,charge));return {speed:19+25*charge,damage:Math.round(24+36*charge)};}
export function inAttackArea(origin,facing,target,shape){
  const x=shape.x??origin.x,z=shape.z??origin.z,dx=target.x-origin.x,dz=target.z-origin.z,d=Math.hypot(dx,dz);
  return Math.hypot(target.x-x,target.z-z)<=shape.radius+(target.radius??.4)
    &&Math.abs((target.y??0)+(target.hop??0)-(origin.y??0))<=1.7
    &&(d<=.15||(dx*facing.x+dz*facing.z)/d>=(shape.cone??-.2));
}
export function guardedDamage(unit,damage,dx,dz){
  const front=-(dx*Math.sin(unit.heading)+dz*Math.cos(unit.heading))/(Math.hypot(dx,dz)||1);
  const blocked=unit.style==='guard'&&!(unit.guardBroken>0)&&!(unit.stagger>0)&&!unit.knockback&&!unit.action&&front>.45;
  return {damage:Math.max(1,Math.round(damage*(unit.battlecry>0?BATTLE.battlecry.taken:1)*(blocked?.35:1))),blocked};
}
