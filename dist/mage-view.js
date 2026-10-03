import * as THREE from './vendor/three.module.js';
const mat=(color,emissive=0)=>new THREE.MeshStandardMaterial({color,roughness:.55,emissive,emissiveIntensity:.7});
function add(parent,geometry,material,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
function staff(){
  const root=new THREE.Group(),wood=mat(0x354852),gold=mat(0xeac286),ice=mat(0xb8f6ff,0x267aab);
  add(root,new THREE.CylinderGeometry(.035,.05,1.8,7),wood,0,.9);
  for(const y of [.1,.65,1.5,1.8])add(root,new THREE.CylinderGeometry(.072,.072,.09,7),gold,0,y);
  add(root,new THREE.TorusGeometry(.19,.025,5,12),gold,0,1.91);
  const gem=add(root,new THREE.OctahedronGeometry(.16),ice,0,1.93);gem.scale.y=1.6;
  return root;
}
export class MageView {
  constructor(scene,camera,avatar,mage){
    this.scene=scene;this.camera=camera;this.avatar=avatar;this.mage=mage;this.bolts=new Map();this.marks=new Map();this.effects=[];
    this.costume=new THREE.Group();avatar.body.add(this.costume);
    const cloth=mat(0x375872),trim=mat(0xd5c399),lining=mat(0x739ba9);
    add(this.costume,new THREE.BoxGeometry(.6,.59,.4),cloth,0,1.16,0);
    const cape=add(this.costume,new THREE.CylinderGeometry(.22,.46,.9,4,1,true),cloth,0,1.07,-.22);cape.rotation.y=Math.PI/4;cape.scale.z=.4;
    add(this.costume,new THREE.BoxGeometry(.62,.07,.43),trim,0,.89,0);
    add(this.costume,new THREE.ConeGeometry(.36,.65,6),cloth,0,2.16,-.02);
    add(this.costume,new THREE.CylinderGeometry(.39,.39,.055,8),lining,0,1.9,-.02);
    this.held=staff();this.held.position.set(.48,.3,.25);this.held.rotation.z=-.12;this.costume.add(this.held);
    this.crystal=add(this.costume,new THREE.OctahedronGeometry(.12),mat(0xa5eaff,0x20748c),-.48,1.29,.28);
    this.embers=[0,1].map(()=>add(this.costume,new THREE.IcosahedronGeometry(.115,0),mat(0xffd796,0xf27024)));
    this.first=new THREE.Group();camera.add(this.first);
    this.firstStaff=staff();this.firstStaff.position.set(.48,-.92,-1);this.firstStaff.scale.setScalar(.64);this.firstStaff.rotation.z=-.18;this.first.add(this.firstStaff);
    this.firstCrystal=add(this.first,new THREE.OctahedronGeometry(.09),mat(0xb5efff,0x307b9a),-.35,-.2,-.8);
    this.firstEmbers=[0,1].map((_,i)=>add(this.first,new THREE.IcosahedronGeometry(.05),mat(0xffce91,0xfb7832),-.42+i*.13,-.08,-.85));
    this.shield=add(scene,new THREE.IcosahedronGeometry(1.13,1),new THREE.MeshBasicMaterial({color:0x8fdbef,transparent:true,opacity:.22,wireframe:true,depthWrite:false}));
    this.boltGeometry=new THREE.OctahedronGeometry(.13);
    this.materials={bolt:mat(0xccbaff,0x6653b2),frost:mat(0xa4eaff,0x398aac),fireball:mat(0xffcd80,0xf17028),flare:mat(0xffaa63,0xf16a28)};
    this.markGeometry=new THREE.TorusGeometry(.26,.025,4,16);
    this.markMaterial=new THREE.MeshBasicMaterial({color:0xacdeff});
  }
  effect(e){
    if(!['mage-impact','mage-shatter','mage-ring','mage-blink'].includes(e.type))return;
    const ring=e.type==='mage-ring'||e.type==='mage-blink',ice=['mage-ring','mage-blink','mage-shatter'].includes(e.type)||e.skill==='frost';
    const object=add(this.scene,ring?new THREE.RingGeometry(.85,1,40):new THREE.IcosahedronGeometry(.35,0),new THREE.MeshBasicMaterial({color:ice?0xa7e6fa:0xffbf7b,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}),e.x,e.y,e.z);
    if(ring)object.rotation.x=-Math.PI/2;
    this.effects.push({object,life:.4,total:.4,radius:e.type==='mage-ring'?4.5:ring?.8:1.3});
    if(e.end)this.effect({type:'mage-impact',skill:'frost',...e.end});
  }
  update(dt,firstPerson,player,paused){
    const m=this.mage,active=m.equipped,time=m.combat.time;
    if(this.wasActive!==active){this.avatar.jacket.color.setHex(active?0x375872:0xce673e);this.wasActive=active;}
    this.costume.visible=active;this.first.visible=active&&firstPerson;
    const narrow=this.camera.aspect<.8;
    this.firstStaff.position.set(narrow?.12:.48,narrow?-.72:-.92,-1);this.firstStaff.scale.setScalar(narrow?.52:.64);this.firstStaff.rotation.z=narrow?-.03:-.18;
    this.firstCrystal.position.x=narrow?-.13:-.35;this.firstCrystal.scale.setScalar(narrow?.75:1);
    this.firstEmbers.forEach((e,i)=>{e.position.x=narrow?-.14+i*.085:-.42+i*.13;e.scale.setScalar(narrow?.7:1);});
    if(active){
      this.avatar.arms[1].rotation.x=-.5-(m.cast?.elapsed??0)*.5-m.pose;
      this.avatar.arms[0].rotation.x=-1.15-m.pose;
      this.held.rotation.x=m.cast?-.25-Math.sin(time*9)*.04:-m.pose*.5;
      this.crystal.rotation.y=time;this.crystal.scale.setScalar(m.cast?1.4:1);
      this.firstStaff.rotation.x=m.cast?-.12:Math.sin(m.pose*9)*.12;
      this.firstCrystal.rotation.y=time;
      this.embers.forEach((e,i)=>{e.visible=i<m.embers;const a=time*1.5+i*Math.PI;e.position.set(Math.cos(a)*.7,1.65+Math.sin(a*2)*.08,Math.sin(a)*.45);});
      this.firstEmbers.forEach((e,i)=>{e.visible=i<m.embers;e.rotation.y=time;});
    }
    this.shield.visible=active&&m.shield>0&&!firstPerson;this.shield.position.set(player.x,player.y+1,player.z);
    const live=new Set(m.projectiles.map(b=>b.id));
    for(const [id,mesh] of this.bolts)if(!live.has(id)){this.scene.remove(mesh);this.bolts.delete(id);}
    for(const b of m.projectiles){let mesh=this.bolts.get(b.id);if(!mesh){mesh=add(this.scene,this.boltGeometry,this.materials[b.skill]);this.bolts.set(b.id,mesh);}mesh.position.set(b.x,b.y,b.z);mesh.scale.setScalar(b.skill==='flare'?1.6:b.skill==='fireball'?1.3:1);mesh.rotation.set(time*12,time*8,0);}
    const marked=new Set();
    for(const e of m.combat.entities){if(!active||!e.alive||e.frostMark<=0)continue;marked.add(e.id);let mark=this.marks.get(e.id);if(!mark){mark=add(this.scene,this.markGeometry,this.markMaterial);this.marks.set(e.id,mark);}mark.position.set(e.x,e.y+(e.hop??0)+e.height+.35,e.z);mark.quaternion.copy(this.camera.quaternion);}
    for(const [id,mesh] of this.marks)if(!marked.has(id)){this.scene.remove(mesh);this.marks.delete(id);}
    for(const e of this.effects){if(!paused)e.life-=dt;const p=1-Math.max(0,e.life/e.total);e.object.scale.setScalar(e.radius*(.2+p*.8));e.object.material.opacity=(1-p)*.65;if(e.life<=0){this.scene.remove(e.object);e.object.geometry.dispose();e.object.material.dispose();}}
    this.effects=this.effects.filter(e=>e.life>0);
  }
}
