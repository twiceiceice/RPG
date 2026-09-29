import {BUILD_PLOTS,BUILDING_BLOCKS,plotAt} from './village-data.js';
import {overlaps} from './movement.js';

const key=b=>`${b.x},${b.y},${b.z}`;
const valid=b=>b&&Object.hasOwn(BUILDING_BLOCKS,b.type)&&[b.x,b.y,b.z].every(Number.isInteger)&&b.y>=0&&b.y<8&&!!plotAt(b.x+.5,b.z+.5);
export class Building{
  constructor(village,colliders){
    this.village=village;village.building=this;this.colliders=colliders;this.blocks=new Map();this.revision=0;
    for(const b of village.structures.slice(0,600))if(valid(b)&&!this.blocks.has(key(b))){const clean={type:b.type,x:b.x,y:b.y,z:b.z};if(!this.intersects(clean))this.insert(clean);}
    this.persist();
  }
  box(b){return {minX:b.x,maxX:b.x+1,minZ:b.z,maxZ:b.z+1,bottom:b.y,top:b.y+1,buildId:key(b),active:true};}
  intersects(b){const box=this.box(b);return this.colliders.some(c=>c.active!==false&&box.minX<c.maxX-.001&&box.maxX>c.minX+.001&&box.minZ<c.maxZ-.001&&box.maxZ>c.minZ+.001&&box.bottom<c.top-.001&&box.top>c.bottom+.001);}
  insert(b){const collider=this.box(b);this.blocks.set(key(b),{...b,collider});this.colliders.push(collider);this.revision++;}
  persist(){this.village.structures=Array.from(this.blocks.values(),({x,y,z,type})=>({x,y,z,type}));this.village.save();}
  reason(b,player){
    if(this.village.raids?.active)return '전투가 끝난 뒤 건축해 주세요.';
    if(this.village.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(!valid(b))return '표시된 건축 부지 안에 8층까지 지을 수 있어요.';
    if(Math.hypot(b.x+.5-player.x,b.z+.5-player.z)>7||Math.abs(b.y+.5-player.y)>7)return '7m 안으로 가까이 다가가세요.';
    if(this.blocks.size>=600)return '마을에는 최대 600개까지 놓을 수 있어요.';
    if(this.village.blocks[b.type]<1)return '자재가 없어요. 호두에게 구매하거나 교환하세요.';
    if(this.intersects(b))return '다른 건물이나 블록과 겹쳐요.';
    const c=this.box(b);
    if(player.y<c.top&&player.y+1.85>c.bottom&&overlaps(player.x,player.z,c,.42))return '내가 서 있는 자리에는 놓을 수 없어요.';
    if(this.village.residents.some(n=>n.y<c.top&&n.y+1.9>c.bottom&&overlaps(n.x,n.z,c,.45)))return '주민이 지나간 뒤 놓아 주세요.';
    if(b.y>0&&![[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>this.blocks.has(key({x:b.x+x,y:b.y+y,z:b.z+z}))))return '바닥이나 다른 블록에 이어서 놓아 주세요.';
    if(!this.village.combat.unobstructed({x:player.x,y:player.y+1.5,z:player.z},{x:b.x+.5,y:b.y+.5,z:b.z+.5}))return '블록이 보이는 쪽으로 이동해 주세요.';
    return null;
  }
  place(b,player){const reason=this.reason(b,player);if(reason)return {accepted:false,reason};this.village.blocks[b.type]--;this.insert({...b});this.persist();return {accepted:true,message:`${BUILDING_BLOCKS[b.type].short} 블록 설치`};}
  remove(id,player){
    const b=this.blocks.get(id);if(!b)return {accepted:false,reason:'직접 놓은 블록을 바라봐 주세요.'};
    if(this.village.raids?.active||this.village.combat.hp<=0)return {accepted:false,reason:'전투가 끝난 뒤 회수해 주세요.'};
    if(Math.hypot(b.x+.5-player.x,b.z+.5-player.z)>7||Math.abs(b.y+.5-player.y)>7)return {accepted:false,reason:'7m 안으로 가까이 다가가세요.'};
    if(!this.village.combat.unobstructed({x:player.x,y:player.y+1.5,z:player.z},{x:b.x+.5,y:b.y+.5,z:b.z+.5},b.collider))return {accepted:false,reason:'블록이 보이는 쪽으로 이동해 주세요.'};
    if(this.village.blocks[b.type]>=99999)return {accepted:false,reason:'가방의 블록을 먼저 사용해 주세요.'};
    this.colliders.splice(this.colliders.indexOf(b.collider),1);this.blocks.delete(id);this.village.blocks[b.type]++;this.revision++;this.persist();return {accepted:true,message:`${BUILDING_BLOCKS[b.type].short} 블록 회수 · 자재 반환`};
  }
  state(){return {placed:this.blocks.size,limit:600,maxHeight:8,plots:BUILD_PLOTS.map(p=>({...p})),structures:this.village.structures};}
}
