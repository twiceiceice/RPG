import * as THREE from './vendor/three.module.js';
import { LUMBER } from './forestry.js';

export class ForestryView {
  constructor(scene,camera,forest,definitions) {
    this.scene=scene;this.camera=camera;this.forest=forest;this.trees=new Map();this.logs=new Map();this.axis=new THREE.Vector3();
    const wood=new THREE.MeshStandardMaterial({color:0xd8b47b,roughness:1});
    const cut=new THREE.MeshStandardMaterial({color:0x806044,roughness:1});
    this.logGeometry=new THREE.BoxGeometry(.32,.28,.55);
    this.logMaterials=[cut,cut,cut,cut,wood,wood];
    const crackMaterial=new THREE.LineBasicMaterial({color:0x30261a});
    const cracksGeometry=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.15,.65,.28),new THREE.Vector3(.02,.85,.28),
      new THREE.Vector3(.02,.85,.28),new THREE.Vector3(-.06,1.03,.28),
      new THREE.Vector3(-.06,1.03,.28),new THREE.Vector3(.12,1.3,.28),
      new THREE.Vector3(.02,.85,.28),new THREE.Vector3(.18,.91,.28),
      new THREE.Vector3(-.06,1.03,.28),new THREE.Vector3(-.2,1.14,.28),
    ]);
    for(const def of definitions){
      const tree=forest.trees.find(t=>t.id===def.id);
      def.trunk.material=def.trunk.material.clone();
      const cracks=new THREE.Group();cracks.scale.setScalar(def.scale);def.root.add(cracks);
      for(let i=0;i<6;i++){const line=new THREE.LineSegments(cracksGeometry,crackMaterial);line.rotation.y=i*Math.PI/3;cracks.add(line);}
      const stump=new THREE.Mesh(new THREE.CylinderGeometry(.27*def.scale,.3*def.scale,.24*def.scale,6),[cut,wood,cut]);
      stump.position.set(def.x,def.y+.12*def.scale,def.z);stump.receiveShadow=true;scene.add(stump);
      const bar=new THREE.Group();scene.add(bar);
      const background=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.09),new THREE.MeshBasicMaterial({color:0x263a2b}));bar.add(background);
      const fill=new THREE.Mesh(new THREE.PlaneGeometry(1.27,.05),new THREE.MeshBasicMaterial({color:0xe5bd78}));fill.position.z=.01;bar.add(fill);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.31,.36,12),new THREE.MeshBasicMaterial({color:0xffd46e,side:THREE.DoubleSide}));
      ring.rotation.x=-Math.PI/2;ring.position.y=1;ring.scale.setScalar(def.scale);def.root.add(ring);
      this.trees.set(tree.id,{...def,tree,cracks,stump,bar,fill,ring});
    }
  }
  update(player) {
    for(const v of this.trees.values()){
      const t=v.tree;v.stump.visible=!t.alive;
      v.root.visible=t.alive||t.fall<LUMBER.fallSeconds;
      v.root.position.set(t.x,t.y,t.z);v.root.quaternion.identity();
      if(t.alive){
        const sway=Math.sin((.25-t.flash)*48)*t.flash*.24;
        this.axis.set(t.shakeZ,0,-t.shakeX).normalize();v.root.quaternion.setFromAxisAngle(this.axis,sway);
      }else{
        const progress=t.fall/LUMBER.fallSeconds;
        this.axis.set(t.fallZ,0,-t.fallX).normalize();v.root.quaternion.setFromAxisAngle(this.axis,Math.min(1.52,progress*progress*1.7));
        v.root.position.y-=Math.max(0,(progress-.72)/.28)*1.5;
      }
      v.trunk.material.emissive.setRGB(t.flash*.75,t.flash*.35,0);
      v.cracks.visible=t.alive&&(t.hp<t.maxHp||t.offBalance>0);
      v.cracks.scale.y=t.scale*(.65+.5*(1-t.hp/t.maxHp));
      v.ring.visible=t.alive&&t.offBalance>0;
      v.bar.visible=t.alive&&t.hp<t.maxHp&&Math.hypot(t.x-player.x,t.z-player.z)<22;
      v.bar.position.set(t.x,t.y+2.35,t.z);v.bar.quaternion.copy(this.camera.quaternion);
      v.fill.scale.x=t.hp/t.maxHp;v.fill.position.x=-.635*(1-t.hp/t.maxHp);v.fill.material.color.setHex(t.offBalance>0?0xffdc75:0xe5bd78);
    }
    const active=new Set(this.forest.drops.map(d=>d.id));
    for(const [id,object] of this.logs)if(!active.has(id)){this.scene.remove(object);this.logs.delete(id);}
    for(const drop of this.forest.drops){
      let object=this.logs.get(drop.id);
      if(!object){object=new THREE.Mesh(this.logGeometry,this.logMaterials);object.castShadow=true;this.logs.set(drop.id,object);this.scene.add(object);}
      object.position.set(drop.x,drop.y+Math.sin(drop.age*3+drop.id)*.055,drop.z);object.rotation.set(.14,drop.age+drop.id,.08);
      object.scale.setScalar(Math.min(1,drop.age*5));
    }
  }
}
