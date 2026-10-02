import * as THREE from './vendor/three.module.js';
import {terrainHeight} from './movement.js';
import {FIELD,STONES} from './field-data.js';
import {RaidBossView} from './raid-boss-view.js';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.86,...extra});
function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function rock(parent,material,x,y,z,sx,sy,sz){const m=mesh(parent,new THREE.IcosahedronGeometry(1,1),material,x,y,z);m.scale.set(sx,sy,sz);return m;}
export function groundRing(inner,outer,x,z,color,opacity){
  const g=new THREE.RingGeometry(inner,outer,96,5);g.rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(x+p.getX(i),z+p.getZ(i))+.025);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}));m.position.set(x,0,z);return m;
}
export function createFieldScenery(scene){
  const root=new THREE.Group();scene.add(root);
  root.add(groundRing(0,17,FIELD.x,FIELD.z,0x536570,.38));
  root.add(groundRing(17.7,18,FIELD.x,FIELD.z,0xb5c8c5,.58));
  root.add(groundRing(10.8,11,FIELD.x,FIELD.z,0x9aacb6,.32));
  const stone=mat(0x5a6976),pale=mat(0x82919a);
  // Small, walkable rubble frames the encounter without trapping a dodge.
  for(let i=0;i<22;i++){const a=i*Math.PI*2/22,x=FIELD.x+Math.cos(a)*16,z=FIELD.z+Math.sin(a)*16;rock(root,i%3?pale:stone,x,terrainHeight(x,z)+.16,z,.6+(i%3)*.18,.26,.42).rotation.y=a;}
  const stones=new Map();
  for(const s of STONES){
    const g=new THREE.Group();g.position.set(s.x,terrainHeight(s.x,s.z),s.z);root.add(g);
    rock(g,stone,0,.2,0,.95,.3,.95);
    const crystalMat=mat(0x7d96a8,{emissive:0x183952,emissiveIntensity:.3,metalness:.2}),crystal=mesh(g,new THREE.OctahedronGeometry(.7),crystalMat,0,1.15,0);crystal.scale.set(.65,1.55,.65);crystal.rotation.z=.16;
    const rune=groundRing(1.55,1.7,s.x,s.z,0x8edff2,.5);root.add(rune);
    const beam=mesh(g,new THREE.CylinderGeometry(.14,.65,7,12,1,true),new THREE.MeshBasicMaterial({color:0x92eeff,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}),0,3.5,0);beam.visible=false;
    stones.set(s.id,{root:g,crystal,material:crystalMat,rune,beam});
  }
  return {root,stones};
}
export function createVarkan(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const hide=mat(0x344553),shell=mat(0x697687,{metalness:.1}),edge=mat(0xa6b6c7),hornMat=mat(0xb9d8e2,{emissive:0x39788b,emissiveIntensity:.3}),glow=mat(0xacf4ff,{emissive:0x5ddeff,emissiveIntensity:2});
  rock(body,hide,0,1.52,0,1.22,.9,1.75);
  for(let i=0;i<5;i++){const plate=rock(body,i%2?shell:edge,0,2.1-i*.055,.95-i*.55,1.16,.49,.52);plate.rotation.x=-.15;}
  const head=new THREE.Group();head.position.set(0,1.9,1.55);body.add(head);
  rock(head,hide,0,-.05,.4,.82,.64,.82);rock(head,shell,0,.35,.2,.9,.35,.75);rock(head,edge,0,-.27,.96,.56,.24,.35);
  for(const sign of [-1,1]){
    rock(head,glow,sign*.62,.03,.91,.13,.095,.06);
    const points=[[sign*.58,.28,.35],[sign*1.12,.65,.62],[sign*1.2,1.15,.95],[sign*.82,1.8,1.27]].map(p=>new THREE.Vector3(...p));
    const curve=new THREE.CatmullRomCurve3(points);mesh(head,new THREE.TubeGeometry(curve,14,.16,6,false),hornMat);
    const tip=mesh(head,new THREE.ConeGeometry(.18,.65,6),hornMat,sign*.72,1.96,1.34);tip.rotation.z=sign*.38;
  }
  const legs=[];
  for(const x of [-.86,.86])for(const z of [-1.1,1.07]){const leg=new THREE.Group();leg.position.set(x,1.37,z);body.add(leg);rock(leg,hide,0,-.45,0,.35,.71,.37);rock(leg,shell,0,-.18,0,.42,.39,.43);rock(leg,edge,0,-1.14,.18,.37,.19,.53);legs.push(leg);}
  const tail=mesh(body,new THREE.ConeGeometry(.3,1.7,6),shell,0,1.2,-2);tail.rotation.x=-1.8;
  const electricity=new THREE.BufferGeometry();electricity.setAttribute('position',new THREE.BufferAttribute(new Float32Array(27),3));
  const arc=new THREE.Line(electricity,new THREE.LineBasicMaterial({color:0xb9f8ff,transparent:true,opacity:.8,toneMapped:false}));head.add(arc);
  return {root,body,head,legs,arc,glow,hide};
}
export class FieldHazards extends RaidBossView {
  create(h){
    const v=super.create(h),safe=v.root.children[2];if(safe){safe.geometry.dispose();safe.material.dispose();safe.removeFromParent();}
    if(h.trackUntil){
      const points=[];for(let i=0;i<9;i++)points.push(new THREE.Vector3(i===0||i===8?0:Math.sin(i*3.7)*.4,terrainHeight(h.x,h.z)+i*1.1,Math.cos(i*2.1)*.15));
      v.bolt=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xd2f8ff,transparent:true,opacity:1,toneMapped:false}));v.bolt.visible=false;v.root.add(v.bolt);
    }
    v.x=h.x;v.z=h.z;return v;
  }
  update(){
    super.update();
    for(const h of this.boss.hazards){const v=this.shapes.get(h.id);if(v.x!==h.x||v.z!==h.z){
      // Reuse buffers while a mark tracks. Reproject both fill and rim onto
      // the terrain instead of leaving a flat warning below a hillside.
      const dx=h.x-v.x,dz=h.z-v.z;
      for(const object of [v.root.children[0],v.rim]){const p=object.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+h.x,z=p.getZ(i)+h.z;p.setY(i,p.getY(i)+terrainHeight(x,z)-terrainHeight(x-dx,z-dz));}p.needsUpdate=true;object.geometry.computeBoundingSphere();}
      v.root.position.set(h.x,0,h.z);v.x=h.x;v.z=h.z;
    }
      const tracking=h.trackUntil&&!h.locked;
      v.material.color.setHex(h.fired?(h.burn?0xb54cf2:0xffe2a1):tracking?0x47bddf:h.pattern==='pulse'?0xea9861:0xfb5669);
      v.rim.material.color.setHex(tracking?0xc1faff:0xffe5bd);
      if(h.fired)v.material.opacity=.42;
      if(v.bolt){v.bolt.visible=h.fired&&h.age-h.delay<.24;v.bolt.material.opacity=Math.max(0,1-(h.age-h.delay)/.24);}
    }
  }
}
export class FieldHuntView {
  constructor(scene,hunt,huntingView,scenery){
    this.hunt=hunt;this.boss=hunt.bosses?.varkan??hunt.boss;this.scenery=scenery;this.look=createVarkan();scene.add(this.look.root);this.hazards=new FieldHazards(scene,this.boss);this.time=0;
    const proxy=mesh(this.look.root,new THREE.SphereGeometry(1.7,12,8),new THREE.MeshBasicMaterial({visible:false}),0,1.45,0);this.proxy=proxy;huntingView.proxies.push(proxy);
  }
  update(dt=1/60){
    this.time+=dt;const u=this.boss.unit,active=!!u?.alive,v=this.look,t=this.time,exposed=active&&u.exposed>0,cast=this.boss.cast;
    v.root.position.set(active?u.x:FIELD.x,terrainHeight(active?u.x:FIELD.x,active?u.z:FIELD.z),active?u.z:FIELD.z);v.root.rotation.y=active?u.heading:Math.PI/2;
    this.proxy.userData.entityId=active?u.id:null;this.proxy.visible=active;
    const collapse=exposed?-.82:0,stomp=cast?.id==='pulse'?.12*Math.sin(cast.elapsed/cast.duration*Math.PI*4):0;v.body.position.y=collapse+stomp+(active?.03: .06)*Math.sin(t*1.8);v.body.rotation.z=exposed?.13:0;
    v.head.rotation.x=exposed?.34:!active?.17:cast?.id==='sweep'?-.32*Math.sin(Math.min(1,cast.elapsed/cast.duration)*Math.PI/2):cast?.id==='pulse'?-.22:0;
    v.head.rotation.y=cast?.id==='sweep'?Math.sin(cast.elapsed/cast.duration*Math.PI)*-.4:0;
    v.legs.forEach((leg,i)=>{leg.rotation.x=exposed?.55:active&&u.moving?Math.sin(u.step+(i===0||i===3?0:Math.PI))*.35:0;});
    v.hide.emissive.setHex(active&&u.flash>0?0x6b8698:0x000000);v.glow.emissiveIntensity=exposed?.3:active?2: .6;
    const p=v.arc.geometry.attributes.position;for(let i=0;i<9;i++)p.setXYZ(i,-.82+i*.205,1.72+Math.sin(t*21+i*4.3)*(i===0||i===8?0:.16),1.27);p.needsUpdate=true;v.arc.geometry.computeBoundingSphere();v.arc.visible=!exposed;v.arc.material.opacity=active?.8:.22;
    for(const s of this.boss.stones){const a=this.scenery.stones.get(s.id);a.material.emissiveIntensity=s.charged?2.3: .2;a.material.color.setHex(s.broken?0x48525a:s.charged?0x9ff0ff:0x7d96a8);a.crystal.scale.y=s.broken?.35:1.55;a.crystal.position.y=s.broken?.35:1.15;a.beam.visible=s.charged;a.rune.material.opacity=s.charged?.9:.35;a.rune.rotation.y=0;a.crystal.rotation.y=t*(s.charged?.6:.05);}
    this.hazards.update();
  }
}
