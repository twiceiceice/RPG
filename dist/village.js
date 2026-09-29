import { terrainHeight, overlaps } from './movement.js';
import { VILLAGE, RESIDENTS, BUILDING_BLOCKS, inVillage } from './village-data.js';
import { Progression } from './progression.js';

const SAVE_KEY='windfield-village-v1';
const armorCosts=[20,35,50];
const integer=(value,fallback,max)=>Number.isFinite(value)?Math.min(max,Math.max(0,Math.floor(value))):fallback;
export class Village {
  constructor(combat,storage=null) {
    this.combat=combat;combat.village=this;this.storage=storage;this.storageAvailable=!!storage;
    this.gold=20;this.potions=1;this.armorLevel=0;this.potionCooldown=0;this.time=0;this.saveClock=0;this.lastSaved='';
    this.blocks={timber:0,stone:0,roof:0};this.structures=[];this.progression=new Progression(combat);
    this.raidWins={defense:0,assault:0};
    this.residents=RESIDENTS.map(n=>({...n,y:terrainHeight(n.x,n.z),step:0,moving:false,wait:1,routeIndex:0}));
    this.load();combat.armorLevel=this.armorLevel;combat.hp=combat.maxHp;
    for(const e of combat.entities)if(this.isSafe(e)){e.x=e.homeX=6;e.z=e.homeZ=18;e.y=terrainHeight(e.x,e.z);}
    this.save();
  }
  contains(position,margin=0) { return inVillage(position.x,position.z,margin); }
  isSafe(position,margin=0) { return this.contains(position,margin)&&!(this.raids?.active&&this.raids.mode==='defense'); }
  load() {
    try {
      const raw=this.storage?.getItem(SAVE_KEY);if(!raw)return;
      const data=JSON.parse(raw);if(!data||data.version!==1)return;
      this.gold=integer(data.gold,20,999999);this.potions=integer(data.potions,1,99);this.armorLevel=integer(data.armorLevel,0,3);
      this.combat.forestry.wood=integer(data.wood,0,99999);this.combat.forestry.level=integer(data.handleLevel,0,3);
      for(const key of Object.keys(this.blocks))this.blocks[key]=integer(data.blocks?.[key],0,99999);
      for(const key of Object.keys(this.raidWins))this.raidWins[key]=integer(data.raidWins?.[key],0,99999);
      this.progression.load(data.progression);this.structures=Array.isArray(data.structures)?data.structures.slice(0,600):[];
    } catch { this.storageAvailable=false; }
  }
  save() {
    const payload=JSON.stringify({version:1,gold:this.gold,potions:this.potions,armorLevel:this.armorLevel,wood:this.combat.forestry.wood,handleLevel:this.combat.forestry.level,blocks:this.blocks,raidWins:this.raidWins,progression:this.progression.serialize(),structures:this.structures});
    if(payload===this.lastSaved)return;
    try {if(this.storage){this.storage.setItem(SAVE_KEY,payload);this.storageAvailable=true;}this.lastSaved=payload;}
    catch {this.storageAvailable=false;}
  }
  nearest(player) {
    let nearest=null,distance=VILLAGE.interactionRange;
    for(const n of this.residents) {
      if(n.battle)continue;
      const d=Math.hypot(n.x-player.x,n.z-player.z);
      if(d>distance||Math.abs(n.y-player.y)>1.5||!this.combat.unobstructed({x:player.x,y:player.y+1.2,z:player.z},{x:n.x,y:n.y+1.2,z:n.z}))continue;
      nearest=n;distance=d;
    }
    return nearest;
  }
  interactionReason(npcId,player) {
    const n=this.residents.find(n=>n.id===npcId);
    if(!n)return '주민을 찾을 수 없어요.';
    if(this.raids?.active)return '전투가 끝나면 주민과 거래할 수 있어요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(this.combat.warrior.active||this.combat.warrior.planted||this.combat.drawing)return '동작을 마친 뒤 말을 걸어 주세요.';
    if(Math.hypot(n.x-player.x,n.z-player.z)>VILLAGE.interactionRange||Math.abs(n.y-player.y)>1.5)return '주민에게 조금 더 가까이 가세요.';
    if(!this.combat.unobstructed({x:player.x,y:player.y+1.2,z:player.z},{x:n.x,y:n.y+1.2,z:n.z}))return '주민이 보이는 곳에서 말을 걸어 주세요.';
    return null;
  }
  offers(npcId) {
    const wood=this.combat.forestry.wood;
    if(npcId==='mira')return [
      {id:'sell-wood',name:'목재 1개 판매',detail:'가방의 목재를 골드로 바꿔요.',price:'+2 골드',enabled:wood>=1,reason:'목재가 없어요.',icon:'wood'},
      {id:'sell-five',name:'목재 5개 판매',detail:'한 번에 다섯 개를 거래해요.',price:'+10 골드',enabled:wood>=5,reason:'목재 5개가 필요해요.',icon:'wood'},
      {id:'buy-wood',name:'목재 1개 구매',detail:'벌목 손잡이를 강화할 때도 쓸 수 있어요.',price:'4 골드',enabled:this.gold>=4&&wood<99999,reason:wood>=99999?'목재를 더 담을 수 없어요.':'골드가 부족해요.',icon:'wood'},
    ];
    if(npcId==='nari')return [{id:'buy-potion',name:'회복 물약',detail:'H 키로 사용 · 체력 +45 · 사용 간격 4초',price:'12 골드',enabled:this.gold>=12&&this.potions<99,reason:this.potions>=99?'물약을 더 담을 수 없어요.':'골드가 부족해요.',icon:'potion'}];
    if(npcId==='doyun')return [{id:'reinforce',name:`갑옷 보강 ${Math.min(3,this.armorLevel+1)}단계`,detail:`받는 피해 −${Math.min(3,this.armorLevel+1)*2} · 현재 ${this.armorLevel}/3단계`,price:this.armorLevel===3?'보강 완료':`${armorCosts[this.armorLevel]} 골드`,enabled:this.armorLevel<3&&this.gold>=armorCosts[this.armorLevel],reason:this.armorLevel===3?'최대로 보강했어요.':'골드가 부족해요.',icon:'armor'}];
    if(npcId==='bori')return [{id:'rest',name:'따뜻한 식사와 휴식',detail:'체력을 전부 회복해요.',price:'5 골드',enabled:this.gold>=5&&this.combat.hp<this.combat.maxHp,reason:this.combat.hp>=this.combat.maxHp?'이미 체력이 가득해요.':'골드가 부족해요.',icon:'rest'}];
    if(npcId==='hodu')return [
      ...Object.entries(BUILDING_BLOCKS).flatMap(([key,b])=>[
        {id:`buy-block-${key}`,block:key,category:'buy',name:`${b.name} 5개 구매`,detail:`${b.detail} · 보유 ${this.blocks[key]}개`,price:`${b.buy*5} 골드`,enabled:this.gold>=b.buy*5&&this.blocks[key]<=99994,reason:this.blocks[key]>99994?'블록을 더 담을 수 없어요.':'골드가 부족해요.',icon:b.icon},
        {id:`sell-block-${key}`,block:key,category:'sell',name:`${b.name} 5개 판매`,detail:`보유 ${this.blocks[key]}개 · 남는 자재를 골드로 바꿔요.`,price:`+${b.sell*5} 골드`,enabled:this.blocks[key]>=5&&this.gold<=999999-b.sell*5,reason:this.blocks[key]<5?`${b.name} 5개가 필요해요.`:'골드가 가득 찼어요.',icon:b.icon},
      ]),
      {id:'barter-timber',category:'barter',name:'목재 → 나무 블록',detail:`목재 2개로 나무 블록 5개 받기 · 목재 ${wood}개 보유`,price:'목재 2개',enabled:wood>=2&&this.blocks.timber<=99994,reason:wood<2?'목재 2개가 필요해요.':'블록을 더 담을 수 없어요.',icon:'timber'},
    ];
    return [];
  }
  trade(npcId,offerId,player) {
    const reason=this.interactionReason(npcId,player);if(reason)return {accepted:false,reason};
    const offer=this.offers(npcId).find(o=>o.id===offerId);
    if(!offer)return {accepted:false,reason:'이 주민은 그 물품을 거래하지 않아요.'};
    if(!offer.enabled)return {accepted:false,reason:offer.reason};
    let message;
    if(offerId==='sell-wood'||offerId==='sell-five'){const count=offerId==='sell-five'?5:1;this.combat.forestry.wood-=count;this.gold=Math.min(999999,this.gold+count*2);message=`목재 ${count}개 판매 · +${count*2} 골드`;}
    if(offerId==='buy-wood'){this.gold-=4;this.combat.forestry.wood++;message='목재 1개를 구매했어요.';}
    if(offerId==='buy-potion'){this.gold-=12;this.potions++;message='회복 물약 1개를 챙겼어요. H 키로 사용할 수 있어요.';}
    if(offerId==='reinforce'){this.gold-=armorCosts[this.armorLevel];this.armorLevel++;this.combat.armorLevel=this.armorLevel;message=`갑옷 ${this.armorLevel}단계 · 받는 피해 −${this.armorLevel*2}`;}
    if(offerId==='rest'){this.gold-=5;this.combat.hp=this.combat.maxHp;this.combat.hurt=0;message='식사를 마쳤어요. 체력을 모두 회복했어요.';}
    if(offer.block){
      const block=BUILDING_BLOCKS[offer.block],buying=offer.category==='buy';
      this.gold+=buying?-block.buy*5:block.sell*5;this.blocks[offer.block]+=buying?5:-5;
      message=`${block.name} 5개 ${buying?'구매':'판매'} · 보유 ${this.blocks[offer.block]}개`;
    }
    if(offerId==='barter-timber'){this.combat.forestry.wood-=2;this.blocks.timber+=5;message='목재 2개를 나무 블록 5개로 교환했어요.';}
    this.save();return {accepted:true,message};
  }
  usePotion() {
    if(this.combat.hp<=0)return {accepted:false,reason:'먼저 다시 일어나 주세요.'};
    if(this.combat.hp>=this.combat.maxHp)return {accepted:false,reason:'이미 체력이 가득해요.'};
    if(this.potions<=0)return {accepted:false,reason:'약초상 나리에게 물약을 구매할 수 있어요.'};
    if(this.potionCooldown>0)return {accepted:false,reason:`물약 재사용까지 ${this.potionCooldown.toFixed(1)}초`};
    const healed=Math.min(45,this.combat.maxHp-this.combat.hp);this.combat.hp+=healed;this.potions--;this.potionCooldown=4;this.save();
    return {accepted:true,message:`물약 사용 · 체력 +${Math.round(healed)}`};
  }
  rewardKill(entity) {
    const amount=entity.kind==='slime'?5:entity.kind==='rabbit'?3:0;if(!amount)return;
    this.gold=Math.min(999999,this.gold+amount);this.save();
    this.combat.events.push({type:'gold-earned',amount,x:entity.x,y:entity.y+2,z:entity.z});
  }
  travelReason(player) {
    if(this.raids?.active)return '전투 중에는 이동할 수 없어요. 전투 메뉴에서 철수할 수 있어요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(this.combat.tactics?.busy||this.combat.warrior.active||this.combat.warrior.planted||this.combat.drawing)return '동작을 마친 뒤 이동해 주세요.';
    if(this.combat.sinceHit<6||this.combat.entities.some(e=>e.alive&&e.kind==='slime'&&Math.hypot(e.x-player.x,e.z-player.z)<8))return '적에게서 벗어난 뒤 마을로 이동할 수 있어요.';
    return null;
  }
  update(dt,player) {
    this.time+=dt;this.potionCooldown=Math.max(0,this.potionCooldown-dt);this.saveClock+=dt;
    if(this.saveClock>1){this.saveClock=0;this.save();}
    for(const n of this.residents) {
      if(n.battle)continue;
      n.moving=false;
      if(Math.hypot(n.x-player.x,n.z-player.z)<3.4){n.heading=Math.atan2(player.x-n.x,player.z-n.z);continue;}
      if(!n.route)continue;
      n.wait=Math.max(0,n.wait-dt);if(n.wait>0)continue;
      const [x,z]=n.route[n.routeIndex],dx=x-n.x,dz=z-n.z,d=Math.hypot(dx,dz);
      if(d<.15){n.routeIndex=(n.routeIndex+1)%n.route.length;n.wait=1.8;continue;}
      const step=Math.min(d,dt*.82);n.heading=Math.atan2(dx,dz);n.moving=true;n.step+=step*6;
      for(const [axis,amount] of [['x',dx/d*step],['z',dz/d*step]]) {
        const old=n[axis];n[axis]+=amount;
        if(this.combat.colliders.some(b=>b.active!==false&&b.top>.3&&b.bottom<1.8&&overlaps(n.x,n.z,b,.27)))n[axis]=old;
      }
      n.y=terrainHeight(n.x,n.z);
    }
  }
  state(player) {
    return {name:VILLAGE.name,safe:this.isSafe(player),gold:this.gold,potions:this.potions,armorLevel:this.armorLevel,blocks:{...this.blocks},damageReduction:this.armorLevel*2,storageAvailable:this.storageAvailable,
      potionCooldown:+this.potionCooldown.toFixed(2),nearestNpc:this.nearest(player)?.id??null,
      residents:this.residents.map(n=>({id:n.id,name:n.name,role:n.role,x:+n.x.toFixed(2),z:+n.z.toFixed(2),shop:!!n.shop,offers:this.offers(n.id)}))};
  }
}
