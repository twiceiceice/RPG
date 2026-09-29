import {terrainHeight,overlaps} from './movement.js';

// A small shared grid routes combatants through gates and around houses.
// Movement still checks the live colliders, including regrowing trees.
export class RaidNavigation {
  constructor(colliders){this.colliders=colliders;this.minX=-47;this.minZ=-10;this.size=1;this.width=115;this.depth=51;this.rebuild();}
  clear(x,z,r=.38){const y=terrainHeight(x,z);return !this.colliders.some(b=>b.active!==false&&b.top>y+.27&&b.bottom<y+1.8&&overlaps(x,z,b,r));}
  rebuild(){this.grid=Array.from({length:this.width*this.depth},(_,i)=>this.clear(this.minX+i%this.width,this.minZ+Math.floor(i/this.width)));}
  direct(a,b){const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(d/.35);for(let i=1;i<=steps;i++)if(!this.clear(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps))return false;return true;}
  cell(p){let x=Math.round(p.x-this.minX),z=Math.round(p.z-this.minZ);x=Math.max(0,Math.min(this.width-1,x));z=Math.max(0,Math.min(this.depth-1,z));
    for(let r=0;r<=3;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const a=x+dx,b=z+dz;if(a>=0&&a<this.width&&b>=0&&b<this.depth&&this.grid[b*this.width+a])return b*this.width+a;}return null;}
  point(i){return {x:this.minX+i%this.width,z:this.minZ+Math.floor(i/this.width)};}
  path(from,to){
    const start=this.cell(from),end=this.cell(to);if(start===null||end===null)return [];
    const open=[start],cost=new Map([[start,0]]),previous=new Map(),closed=new Set(),goal=this.point(end);
    const heuristic=i=>{const p=this.point(i);return Math.hypot(goal.x-p.x,goal.z-p.z);};
    for(let count=0;open.length&&count<4200;count++){
      let best=0;for(let i=1;i<open.length;i++)if(cost.get(open[i])+heuristic(open[i])<cost.get(open[best])+heuristic(open[best]))best=i;
      const current=open.splice(best,1)[0];if(current===end){const path=[];let at=end;while(at!==start){path.unshift(this.point(at));at=previous.get(at);}return path;}
      closed.add(current);const x=current%this.width,z=Math.floor(current/this.width);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz,n=nz*this.width+nx;
        if(nx<0||nx>=this.width||nz<0||nz>=this.depth||closed.has(n)||!this.grid[n])continue;
        if(dx&&dz&&(!this.grid[z*this.width+nx]||!this.grid[nz*this.width+x]))continue;
        const next=cost.get(current)+(dx&&dz?Math.SQRT2:1);if(next>=(cost.get(n)??Infinity))continue;
        previous.set(n,current);cost.set(n,next);if(!open.includes(n))open.push(n);
      }
    }return [];
  }
  move(unit,goal,speed,dt){
    unit.navClock=(unit.navClock??0)-dt;let target=goal;
    if(unit.navClock<=0||!unit.navGoal||Math.hypot(goal.x-unit.navGoal.x,goal.z-unit.navGoal.z)>2){
      unit.navClock=.75;unit.navGoal={...goal};unit.path=this.direct(unit,goal)?[]:this.path(unit,goal);
    }
    while(unit.path?.length&&Math.hypot(unit.path[0].x-unit.x,unit.path[0].z-unit.z)<.28)unit.path.shift();
    if(unit.path?.length)target=unit.path[0];
    const dx=target.x-unit.x,dz=target.z-unit.z,d=Math.hypot(dx,dz);if(d<.08)return;
    unit.heading=Math.atan2(dx,dz);const step=Math.min(d,speed*dt),beforeX=unit.x,beforeZ=unit.z;
    if(this.clear(unit.x+dx/d*step,unit.z))unit.x+=dx/d*step;
    if(this.clear(unit.x,unit.z+dz/d*step))unit.z+=dz/d*step;
    const travelled=Math.hypot(unit.x-beforeX,unit.z-beforeZ);unit.moving=travelled>.0001;unit.step=(unit.step??0)+travelled*6;unit.y=terrainHeight(unit.x,unit.z);
    if(!unit.moving)unit.navClock=0;
  }
}
