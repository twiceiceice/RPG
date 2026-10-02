import * as THREE from './vendor/three.module.js';
import {MIRROR_FIELD as FIELD,MIRROR_PILLARS as PILLARS} from './field-data.js';
import {mirrorPillarColliders} from './mirror-boss.js';
import {RaidBossView} from './raid-boss-view.js';
import {groundRing} from './field-view.js';
import {terrainHeight} from './movement.js';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.55,...extra});
function mesh(root,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.receiveShadow=true;root.add(m);return m;}

export function createMirrorScenery(scene,environment){
  const root=new THREE.Group();scene.add(root);
  root.add(groundRing(0,FIELD.radius,FIELD.x,FIELD.z,0x4d456b,.67));
  for(const radius of [4,10.5,16.8])root.add(groundRing(radius-.09,radius+.09,FIELD.x,FIELD.z,0xd5c3ed,.55));
  const dark=mat(0x282c42,{metalness:.35}),edge=mat(0x9688b8,{metalness:.5}),glass=mat(0xd6c9ef,{emissive:0x8663ca,emissiveIntensity:.45,metalness:.4});
  const covers=[];
  for(const [i,p] of PILLARS.entries()){
    const g=new THREE.Group();g.position.set(p.x,0,p.z);root.add(g);
    const column=mesh(g,new THREE.BoxGeometry(1.5,3.8,1.5),dark,0,1.9,0);column.castShadow=true;
    mesh(g,new THREE.BoxGeometry(1.8,.22,1.8),edge,0,.11,0);
    const crystal=mesh(g,new THREE.OctahedronGeometry(.5),glass,0,4.05,0);crystal.scale.set(.7,1.4,.7);
    for(const sign of [-1,1])mesh(g,new THREE.BoxGeometry(.06,3.1,.07),glass,sign*.5,2,.756);
    const collider=mirrorPillarColliders()[i];column.userData.collider=collider;environment.colliders.push(collider);environment.cameraSurfaces.push(column);
    const d=Math.hypot(p.x-FIELD.x,p.z-FIELD.z),x=p.x+(p.x-FIELD.x)/d*2.3,z=p.z+(p.z-FIELD.z)/d*2.3;
    const safe=groundRing(0,.78,x,z,0x56edc8,.55);safe.position.y=.1;safe.visible=false;root.add(safe);covers.push(safe);
  }
  // Broken mirror shards form a visual frame; they do not obstruct dodging.
  for(let i=0;i<16;i++){const a=i*Math.PI/8,x=FIELD.x+Math.cos(a)*16,z=FIELD.z+Math.sin(a)*16,m=mesh(root,new THREE.OctahedronGeometry(.6),i%2?dark:edge,x,.22,z);m.scale.set(1.4,.5,.8);m.rotation.y=a;}
  return {root,covers};
}

export function createLysea(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const cloth=mat(0x322b59,{side:THREE.DoubleSide}),lining=mat(0x8b77bd,{metalness:.25}),ivory=mat(0xe2e1ef,{metalness:.2}),ink=mat(0x131b32),light=mat(0xb9f0ec,{emissive:0x64c7cc,emissiveIntensity:1.2}),silver=mat(0xbfb0db,{metalness:.65});
  mesh(body,new THREE.CylinderGeometry(.36,1.05,2.15,9,1,true),cloth,0,1.55,0);
  mesh(body,new THREE.CylinderGeometry(.3,.67,1.95,9,1,true),lining,0,1.58,0);
  const ribbons=[];
  for(let i=0;i<6;i++){const a=i*Math.PI/3,strip=mesh(body,new THREE.ConeGeometry(.24,1.45,3),silver,Math.sin(a)*.81,.83,Math.cos(a)*.81);strip.rotation.z=Math.PI;strip.rotation.y=a;strip.rotation.x=.2;ribbons.push(strip);}
  mesh(body,new THREE.OctahedronGeometry(.45),lining,0,2.65,0).scale.set(1.3,.75,.7);
  const mask=mesh(body,new THREE.SphereGeometry(.5,12,10),ivory,0,3.15,.08);mask.scale.set(.85,1.1,.47);
  for(const side of [-1,1]){mesh(body,new THREE.BoxGeometry(.075,.2,.035),ink,side*.16,3.23,.302).rotation.z=side*-.2;mesh(body,new THREE.BoxGeometry(.035,.12,.04),light,side*.16,3.19,.325);}
  mesh(body,new THREE.OctahedronGeometry(.18),light,0,2.42,.4);
  const halo=mesh(body,new THREE.TorusGeometry(.95,.055,6,48,Math.PI*1.7),silver,0,3.1,-.3);halo.rotation.z=.45;
  for(const side of [-1,1]){const crown=mesh(body,new THREE.ConeGeometry(.16,.9,5),silver,side*.4,3.89,0);crown.rotation.z=side*-.42;}
  const arms=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.6,2.55,0);body.add(arm);
    const sleeve=mesh(arm,new THREE.CylinderGeometry(.15,.34,.85,7,1,true),cloth,side*.2,-.25,0);sleeve.rotation.z=side*.58;
    mesh(arm,new THREE.SphereGeometry(.14,8,6),ivory,side*.41,-.55,.15);arms.push(arm);
  }
  const satellites=[];
  for(let i=0;i<4;i++){const m=mesh(body,new THREE.OctahedronGeometry(.28),light);m.scale.set(.65,1.6,.3);satellites.push(m);}
  return {root,body,halo,arms,ribbons,satellites,light,cloth};
}

class MirrorHazards extends RaidBossView {
  create(h){
    const v=super.create(h);v.heading=Math.atan2(h.dx??0,h.dz??1);
    if(h.rotationSpeed){
      const arrow=mesh(v.root,new THREE.ConeGeometry(.28,.8,3),new THREE.MeshBasicMaterial({color:0xffe6ff,toneMapped:false}),Math.sin(v.heading)*6,.19,Math.cos(v.heading)*6);arrow.rotation.set(0,v.heading,-Math.PI/2);v.arrow=arrow;
    }
    return v;
  }
  update(){
    super.update();
    for(const h of this.boss.hazards){const v=this.shapes.get(h.id);
      v.material.color.setHex(h.fired?0xe695de:0xa96ade);v.rim.material.color.setHex(0xf0c9ff);
      v.material.opacity=h.requiresCover?.12:h.fired?.52:.22+Math.min(1,h.age/h.delay)*.2;
      if(h.rotationSpeed)v.root.rotation.y=Math.atan2(h.dx,h.dz)-v.heading;
    }
  }
}
export class MirrorHuntView {
  constructor(scene,hunt,huntingView,scenery){
    this.boss=hunt.bosses.lysea;this.scenery=scenery;this.time=0;this.look=createLysea();scene.add(this.look.root);this.hazards=new MirrorHazards(scene,this.boss);
    const proxy=look=>{const p=mesh(look.root,new THREE.SphereGeometry(1.05,10,8),new THREE.MeshBasicMaterial({visible:false}),0,1.75,0);huntingView.proxies.push(p);return p;};
    this.proxy=proxy(this.look);
    this.projections=Array.from({length:3},()=>{
      const look=createLysea();scene.add(look.root);look.root.visible=false;
      const shadow=mesh(look.root,new THREE.CircleGeometry(1.3,40),new THREE.MeshBasicMaterial({color:0x131326,transparent:true,opacity:.9,depthWrite:false}),0,.13,0);shadow.rotation.x=-Math.PI/2;
      const dotted=new THREE.Group();look.root.add(dotted);
      for(let i=0;i<12;i++){const dash=mesh(dotted,new THREE.RingGeometry(1.15,1.3,3,1,i*Math.PI/6,.15),new THREE.MeshBasicMaterial({color:0xe0bbff,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}),0,.12,0);dash.rotation.x=-Math.PI/2;}
      return {look,shadow,dotted,proxy:proxy(look)};
    });
  }
  animate(look,time,cast,exposed=false){
    look.body.position.y=exposed?-.35: .22+Math.sin(time*1.8)*.16;look.body.rotation.z=exposed?.22:Math.sin(time)*.025;
    look.halo.rotation.z=time*.25;look.arms.forEach((a,i)=>{a.rotation.z=(i?1:-1)*(cast?.id==='gaze'?1.15:.35+Math.sin(time*1.6)*.1);});
    look.satellites.forEach((s,i)=>{const a=time*.6+i*Math.PI/2;s.position.set(Math.cos(a)*1.32,2.3+Math.sin(a*2)*.35,Math.sin(a)*.8);s.rotation.y=a;});
    look.ribbons.forEach((r,i)=>r.rotation.x=.2+Math.sin(time*2+i)*.08);
  }
  update(dt=1/60){
    this.time+=dt;const b=this.boss,u=b.unit,active=!!u?.alive,t=this.time;
    this.look.root.position.set(FIELD.x,terrainHeight(FIELD.x,FIELD.z),FIELD.z);this.look.root.rotation.y=active?u.heading:Math.PI/2;this.look.root.visible=!u?.mirrorVeiled;
    this.proxy.userData.entityId=active&&!u.mirrorVeiled?u.id:null;this.proxy.visible=active&&!u.mirrorVeiled;
    this.animate(this.look,t,b.cast,active&&u.exposed>0);this.look.light.emissiveIntensity=active&&u.flash>0?3:1.2;
    for(let i=0;i<3;i++){
      const p=this.projections[i],e=b.projections[i];p.look.root.visible=!!e?.alive;p.proxy.userData.entityId=e?.alive?e.id:null;
      if(!e?.alive)continue;p.look.root.position.set(e.x,e.y,e.z);p.look.root.rotation.y=u.heading;p.shadow.visible=e.realMirror;p.dotted.visible=!e.realMirror;this.animate(p.look,t+i*.25,b.cast);
    }
    const showCover=b.hazards.some(h=>h.requiresCover&&!h.fired);for(const s of this.scenery.covers)s.visible=showCover;
    this.hazards.update();
  }
}
