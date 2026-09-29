import * as THREE from './vendor/three.module.js';
import {terrainHeight} from './movement.js';
import {CAMP,BEACON,ALLY_ROLES} from './raid-data.js';
const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.82});
const wood=mat(0x664932),steel=mat(0xb8c4bf),dark=mat(0x353d36),red=mat(0xa04d42),gold=mat(0xd7ae62);
function box(parent,m,x,y,z,w,h,d){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function label(text,color='#fbe1b1'){
  const c=document.createElement('canvas');c.width=384;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='rgba(24,36,32,.88)';ctx.beginPath();ctx.roundRect(2,2,380,76,15);ctx.fill();ctx.font='bold 29px sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,42);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));sprite.scale.set(3.2,.67,1);return sprite;
}
function flag(parent,x,z,color,caption){
  const y=terrainHeight(x,z);box(parent,wood,x,y+1.6,z,.16,3.2,.16);const cloth=box(parent,mat(color),x+.65,y+2.6,z,1.3,.8,.07);
  if(caption){const name=label(caption);name.position.set(x,y+4.1,z);parent.add(name);}
  return cloth;
}
export function createRaidScenery(scene,environment){
  const root=new THREE.Group();scene.add(root);
  const solid=(x,z,w,h,d,m=wood)=>{const y=terrainHeight(x,z),object=box(root,m,x,y+h/2,z,w,h,d);environment.colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,bottom:y,top:y+h});environment.cameraSurfaces.push(object);return object;};
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(22,21),mat(0x8b8760));floor.rotation.x=-Math.PI/2;floor.position.set(CAMP.x,.025,CAMP.z);floor.receiveShadow=true;root.add(floor);
  for(const z of [7,23]){
    solid(-36,z,5,1.8,3.8,mat(0x715e49));
    const roof=box(root,red,-36,2.25,z,5.6,1.2,4.4);environment.cameraSurfaces.push(roof);
    box(root,dark,-33.46,.85,z,.05,1.7,1.5);
    for(const side of [-1,1])solid(-39,z+side*2.3,.2,3,.2);
  }
  for(let z=5;z<=25;z+=2)solid(-43,z,.45,2.1,.45);
  for(const z of [5,25])for(let x=-42;x<-21;x+=2)solid(x,z,.45,1.7,.45);
  for(const z of [11,19]){solid(-21,z,.35,3.5,.35);flag(root,-21,z,0xac5146);}
  for(const [x,z] of [[-40,15],[-30,7],[-30,23]]){solid(x,z,1.1,1.1,1.1);box(root,gold,x,1.13,z,1.12,.1,.16);}
  flag(root,-36,15,0xa9483d,CAMP.name);
  const beacon=flag(root,BEACON.x,BEACON.z,0x73b5b0,'마을 수호 깃발');
  return {root,beacon};
}
function weapon(style){
  const root=new THREE.Group();
  if(style==='archer'){
    const limb=box(root,wood,0,-.1,.25,.08,1,.08);limb.rotation.x=.2;
    box(root,gold,0,.37,.36,.06,.08,.32);box(root,gold,0,-.57,.15,.06,.08,.32);
    box(root,mat(0xe4d9b3),0,-.1,.42,.012,1,.012);
  }else if(style==='healer'){box(root,wood,0,-.2,0,.065,1.6,.065);box(root,mat(0x8ee6b1),0,.7,0,.26,.26,.26);}
  else{box(root,wood,0,-.26,0,.10,.7,.1);box(root,steel,0,-.93,0,.16,.8,.07);box(root,gold,0,-.54,0,.40,.08,.14);}
  return root;
}
function healthBar(scene){
  const root=new THREE.Group();scene.add(root);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.10),new THREE.MeshBasicMaterial({color:0x24342e}));root.add(back);
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(1,.06),new THREE.MeshBasicMaterial({color:0x95d1b6}));fill.position.z=.01;root.add(fill);return {root,fill};
}
function fighter(scene,e){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);scene.add(root);
  const coat=mat(e.style==='captain'?0x653e36:0x9c5948),skin=mat(0xbb9775);const scale=e.style==='captain'?1.2:1;
  body.scale.setScalar(scale);box(body,coat,0,1.05,0,.6,.7,.4);box(body,wood,0,.78,0,.65,.12,.43);box(body,skin,0,1.62,0,.45,.45,.42);box(body,dark,0,1.87,0,.51,.17,.48);
  for(const side of [-1,1])box(body,dark,side*.1,1.65,.217,.05,.06,.02);
  if(e.style==='captain'){box(body,gold,0,1.99,0,.53,.08,.44);for(const side of [-1,1])box(body,steel,side*.47,1.43,0,.32,.24,.5);}
  const arms=[],legs=[];
  for(const s of [-1,1]){const arm=new THREE.Group();body.add(arm);arm.position.set(s*.4,1.4,0);box(arm,coat,0,-.24,0,.23,.55,.25);box(arm,skin,0,-.55,0,.20,.14,.22);arms.push(arm);const leg=new THREE.Group();body.add(leg);leg.position.set(s*.17,.77,0);box(leg,dark,0,-.38,0,.25,.75,.3);legs.push(leg);}
  const held=weapon(e.style);held.position.y=-.5;arms[1].add(held);
  const name=label(e.name,'#ffd3b4');name.position.y=3.1;root.add(name);
  const proxy=new THREE.Mesh(new THREE.SphereGeometry(.68,8,6),new THREE.MeshBasicMaterial({visible:false}));proxy.position.y=e.height*.5;proxy.userData.entityId=e.id;root.add(proxy);
  const telegraph=new THREE.Mesh(new THREE.RingGeometry(e.style==='captain'?2.6:1.4,e.style==='captain'?3:1.7,32),new THREE.MeshBasicMaterial({color:0xf17c52,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));telegraph.rotation.x=-Math.PI/2;scene.add(telegraph);
  return {root,body,arms,legs,coat,name,proxy,telegraph,bar:healthBar(scene)};
}
function disposeObject(root){root.traverse(o=>{o.geometry?.dispose();if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if([wood,steel,dark,red,gold].includes(m))continue;m.map?.dispose();m.dispose();}}});root.removeFromParent();}
export class RaidView {
  constructor(scene,camera,raids,villageView,huntingView,scenery){
    Object.assign(this,{scene,camera,raids,villageView,huntingView,scenery});this.enemies=new Map();this.friends=new Map();
    for(const [id,a] of villageView.actors){const held=weapon(ALLY_ROLES[id].style);held.position.y=-.45;a.arms[1].add(held);held.visible=false;
      const shield=box(a.arms[0],mat(0x638b80),0,-.30,.17,.55,.7,.12);shield.visible=false;
      const battleName=label(raids.village.residents.find(n=>n.id===id).name,'#bce6c8');battleName.position.y=2.65;battleName.scale.set(1.25,.26,1);battleName.visible=false;a.root.add(battleName);
      this.friends.set(id,{held,shield,battleName,bar:healthBar(scene)});
    }
    const linesGeometry=new THREE.BufferGeometry();linesGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6144),3));linesGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(6144),3));linesGeometry.setDrawRange(0,0);
    this.lines=new THREE.LineSegments(linesGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85}));this.lines.frustumCulled=false;scene.add(this.lines);
    this.beaconBar=healthBar(scene);
  }
  bar(view,unit,friendly){view.root.visible=!!unit.alive;view.root.position.set(unit.x,unit.y+(unit.height??1.9)+.3+(unit.hop??0),unit.z);view.root.quaternion.copy(this.camera.quaternion);const fraction=Math.max(0,unit.hp/unit.maxHp);view.fill.scale.x=fraction;view.fill.position.x=-.5*(1-fraction);view.fill.material.color.setHex(friendly?0x9fd7b2:unit.offBalance>0?0xffd875:0xe59c7a);}
  pose(a,n){
    const stride=n.moving?Math.sin(n.step)*.65:0;for(let i=0;i<2;i++){a.legs[i].rotation.x=stride*(i?1:-1);a.arms[i].rotation.x=stride*(i?-1:1)*.65;}
    if(n.windup>0)a.arms[1].rotation.x=-2.4;
    if(n.swing>0)a.arms[1].rotation.x=-2.2+(1-n.swing/.32)*3;
    if(n.style==='archer'&&(n.windup>0||n.swing>0)){a.arms[0].rotation.x=-1.2;a.arms[1].rotation.x=-1.5;}
    a.body.rotation.z=n.alive?0:Math.PI/2;a.body.position.y=n.alive?(n.hop??0):.15;
    if(n.offBalance>0)a.body.rotation.z=Math.sin(this.raids.elapsed*13)*.2;
    if(n.knockback)a.body.rotation.x=Math.sin(n.knockback.elapsed/n.knockback.duration*Math.PI)*-1.2;else a.body.rotation.x=0;
  }
  update(){
    const ids=new Set(this.raids.enemies.map(e=>e.id));
    for(const [id,v] of this.enemies)if(!ids.has(id)){this.huntingView.proxies=this.huntingView.proxies.filter(p=>p!==v.proxy);disposeObject(v.root);disposeObject(v.bar.root);disposeObject(v.telegraph);this.enemies.delete(id);}
    for(const e of this.raids.enemies){
      let v=this.enemies.get(e.id);if(!v){v=fighter(this.scene,e);this.enemies.set(e.id,v);this.huntingView.proxies.push(v.proxy);}
      v.root.visible=e.alive;v.root.position.set(e.x,e.y,e.z);v.root.rotation.y=e.heading;this.pose(v,e);v.coat.emissive.setScalar(e.flash>0?.35:0);this.bar(v.bar,e,false);
      v.proxy.position.y=e.height*.5+e.hop;v.name.visible=e.style==='captain';v.name.scale.set(2.25,.47,1);v.telegraph.visible=e.alive&&e.windup>0;v.telegraph.position.set(e.x,e.y+.045,e.z);
      v.telegraph.material.opacity=.3+.5*Math.sin(this.raids.elapsed*18)**2;
    }
    for(const n of this.raids.village.residents){const v=this.friends.get(n.id),a=this.villageView.actors.get(n.id);v.held.visible=!!n.battle;v.battleName.visible=!!n.battle;v.shield.visible=n.battle&&n.style==='guard';v.bar.root.visible=!!n.battle;if(n.battle){a.title.visible=false;this.pose(a,n);this.bar(v.bar,n,true);if(!n.alive){v.bar.root.visible=true;v.bar.fill.scale.x=0;}}else{a.body.rotation.z=0;a.body.rotation.x=0;}}
    const positions=[],colors=[];
    for(const t of this.raids.trails){positions.push(t.from.x,t.from.y,t.from.z,t.to.x,t.to.y,t.to.z);const c=new THREE.Color(t.heal?0x9ef9ab:t.friendly?0xbce8d5:0xffa36b);for(let i=0;i<2;i++)colors.push(c.r,c.g,c.b);}
    const count=Math.min(positions.length,6144),p=this.lines.geometry.attributes.position,c=this.lines.geometry.attributes.color;p.array.set(positions.slice(0,count));c.array.set(colors.slice(0,count));p.needsUpdate=c.needsUpdate=true;this.lines.geometry.setDrawRange(0,count/3);
    const defense=this.raids.active&&this.raids.mode==='defense';this.beaconBar.root.visible=defense;if(defense)this.bar(this.beaconBar,this.raids.beacon,true);
    this.scenery.beacon.material.color.setHex(defense?0xdfb45b:0x73b5b0);
  }
}
