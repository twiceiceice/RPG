export const CAMP={name:'붉은발 야영지',x:-32,z:15,halfX:12,halfZ:12,entry:{x:-17,z:15}};
export const BEACON={x:21,z:15,maxHp:350};
const squad=(guards,warriors,archers)=>[...Array(guards).fill('guard'),...Array(warriors).fill('melee'),...Array(archers).fill('archer')];
export const RAID_WAVES={defense:[squad(3,6,3),squad(4,7,5),[...squad(3,3,3),'captain']],assault:[squad(3,4,3),squad(3,5,4),[...squad(2,2,2),'captain']]};
export const RAID_REWARDS={defense:{gold:100,timber:24,stone:14,roof:4},assault:{gold:150,timber:0,stone:25,roof:12}};
export const ALLY_ROLES={
  hari:{role:'방패병',style:'guard',maxHp:180,damage:17,range:1.9,interval:2,spot:[14,15]},
  doyun:{role:'전사',style:'melee',maxHp:135,damage:22,range:1.9,interval:2.3,spot:[16,12.8]},
  jun:{role:'전사',style:'melee',maxHp:115,damage:16,range:1.8,interval:2,spot:[16,17.2]},
  mira:{role:'궁수',style:'archer',maxHp:85,damage:13,range:9,interval:2.4,spot:[18.2,12.8]},
  hodu:{role:'궁수',style:'archer',maxHp:100,damage:15,range:9,interval:2.4,spot:[18.2,17.5]},
  nari:{role:'치유',style:'healer',maxHp:90,range:7,interval:3.2,heal:18,spot:[20,13.3]},
  bori:{role:'치유',style:'healer',maxHp:90,range:7,interval:4.5,heal:14,spot:[20,18.2]},
  daon:{role:'방패병',style:'guard',maxHp:195,damage:15,range:1.9,interval:2.2,spot:[14,18.4]},
  roan:{role:'전사',style:'melee',maxHp:145,damage:23,range:2,interval:2.3,spot:[15.5,11.6]},
  lua:{role:'궁수',style:'archer',maxHp:95,damage:16,range:10,interval:2.5,spot:[19,20]},
};
export const EXPEDITION=['hari','jun','hodu','nari','daon','roan','lua'];
export function inCamp(x,z,margin=0){return Math.abs(x-CAMP.x)<CAMP.halfX+margin&&Math.abs(z-CAMP.z)<CAMP.halfZ+margin;}
export function raidClearance(x,z){return inCamp(x,z,2)||(x>-20&&x<12&&Math.abs(z-15)<4.5);}
export function campGroundBlend(x,z){const d=Math.max(Math.abs(x-CAMP.x)-CAMP.halfX,Math.abs(z-CAMP.z)-CAMP.halfZ,0)/4;const t=Math.min(1,d);return t*t*(3-2*t);}
