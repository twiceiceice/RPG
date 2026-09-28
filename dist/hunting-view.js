import * as THREE from './vendor/three.module.js';

const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...extra});
const unitY=new THREE.Vector3(0,1,0);
function add(parent,geometry,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function box(parent,size,mat,x,y,z){return add(parent,new THREE.BoxGeometry(...size),mat,x,y,z);}
function sphere(parent,r,mat,x,y,z){return add(parent,new THREE.SphereGeometry(r,12,8),mat,x,y,z);}

export function makeSword(){
  const g=new THREE.Group(),steel=material(0xdce9e7,{metalness:.55,roughness:.27}),gold=material(0xe3bc5c,{metalness:.3});
  box(g,[.075,.20,.075],material(0x5b4238),0,.04,0);
  box(g,[.30,.07,.11],gold,0,-.07,0);
  box(g,[.11,.74,.048],steel,0,-.46,0);
  const tip=add(g,new THREE.ConeGeometry(.078,.18,4),steel,0,-.92,0);tip.rotation.z=Math.PI;
  sphere(g,.063,gold,0,.17,0);
  return g;
}
export function makeBow(){
  const g=new THREE.Group(),wood=material(0x95613e),binding=material(0xe1bd6c);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.64,0),new THREE.Vector3(.26,-.32,0),new THREE.Vector3(.32,0,0),new THREE.Vector3(.26,.32,0),new THREE.Vector3(0,.64,0)]);
  add(g,new THREE.TubeGeometry(curve,20,.042,6,false),wood);
  box(g,[.10,.23,.08],binding,.32,0,0);
  add(g,new THREE.CylinderGeometry(.007,.007,1.28,4),material(0xe9e6cf));
  g.rotation.y=-Math.PI/2;
  return g;
}
function makeArrow(){
  const g=new THREE.Group();
  add(g,new THREE.CylinderGeometry(.018,.018,.72,5),material(0xa07746));
  add(g,new THREE.ConeGeometry(.055,.14,4),material(0xb5cbc6,{metalness:.45}),0,.42,0);
  box(g,[.10,.15,.012],material(0xe6e3c9),0,-.30,0);
  box(g,[.012,.15,.10],material(0xe6e3c9),0,-.30,0);
  return g;
}
function rabbit(){
  const g=new THREE.Group(),fur=material(0xf0e9d6),pink=material(0xdba99c),dark=material(0x283832);
  const body=sphere(g,.36,fur,0,.35,0);body.scale.set(.85,.95,1.27);
  const head=sphere(g,.23,fur,0,.65,.28);head.scale.set(.88,1,1);
  const ears=[];
  for(const sign of [-1,1]){
    const ear=new THREE.Group();ear.position.set(sign*.12,.81,.21);ear.rotation.z=sign*-.10;g.add(ear);
    const outer=sphere(ear,.13,fur,0,.18,0);outer.scale.set(.57,2.25,.58);
    const inside=sphere(ear,.09,pink,0,.20,.065);inside.scale.set(.5,2,.3);ears.push(ear);
    sphere(g,.037,dark,sign*.13,.71,.45);
    const foot=sphere(g,.12,fur,sign*.24,.12,.13);foot.scale.set(.8,.65,1.6);
    const back=sphere(g,.18,fur,sign*.24,.19,-.23);back.scale.set(1,1,1.3);
  }
  sphere(g,.14,fur,0,.39,-.47);sphere(g,.043,pink,0,.61,.5);
  return {g,materials:[fur,pink],ears};
}
function slime(variant){
  const colors=[0x63bc79,0x6eb6d4,0xa894d6],g=new THREE.Group();
  const jelly=material(colors[variant],{roughness:.34,metalness:.04}),eye=material(0x173d38),shine=material(0xd2f0c7);
  const body=sphere(g,.75,jelly,0,.51,0);body.scale.set(1,.77,1);
  for(const sign of [-1,1]){const e=sphere(g,.065,eye,sign*.23,.64,.66);e.scale.set(.8,1.3,.5);}
  const mouth=sphere(g,.073,eye,0,.43,.727);mouth.scale.set(1,.35,.25);
  const sparkle=sphere(g,.16,shine,-.26,.87,.38);sparkle.scale.set(.8,.5,.13);
  return {g,materials:[jelly],body};
}
export class HuntingView{
  constructor(scene,camera,avatar,hunting,environment){
    this.scene=scene;this.camera=camera;this.hunting=hunting;this.environment=environment;
    this.creatures=new Map();this.projectiles=new Map();this.effects=[];this.proxies=[];
    this.ray=new THREE.Raycaster();this.direction=new THREE.Vector3();
    this.sparkGeometry=new THREE.IcosahedronGeometry(.065,0);
    this.sparkMaterials={rabbit:material(0xf2dfba),slime:material(0x9feaa7),impact:material(0xf1d581)};
    this.arrowTemplate=makeArrow();
    for(const e of hunting.entities){
      const root=new THREE.Group();scene.add(root);
      const look=e.kind==='rabbit'?rabbit():slime(e.variant);root.add(look.g);
      const bar=new THREE.Group();scene.add(bar);
      add(bar,new THREE.PlaneGeometry(1.05,.085),new THREE.MeshBasicMaterial({color:0x233f36}));
      const fill=add(bar,new THREE.PlaneGeometry(.99,.046),new THREE.MeshBasicMaterial({color:e.kind==='rabbit'?0xe9d99a:0x9bea92}),0,0,.005);
      const proxy=add(root,new THREE.SphereGeometry(e.kind==='rabbit'?.48:.78,8,6),new THREE.MeshBasicMaterial({visible:false}),0,e.height*.5,0);
      proxy.userData.entityId=e.id;this.proxies.push(proxy);
      this.creatures.set(e.id,{root,bar,fill,proxy,...look});
    }
    this.heldSword=makeSword();this.heldSword.position.set(0,-.50,.045);avatar.arms[1].add(this.heldSword);
    this.heldBow=makeBow();this.heldBow.position.set(0,-.47,.1);avatar.arms[0].add(this.heldBow);
    this.firstRig=new THREE.Group();camera.add(this.firstRig);scene.add(camera);
    this.firstSword=makeSword();this.firstSword.rotation.z=Math.PI-.18;this.firstSword.position.set(.46,-.52,-.85);this.firstRig.add(this.firstSword);
    this.firstBow=makeBow();this.firstBow.position.set(-.42,-.20,-.82);this.firstBow.scale.setScalar(.8);this.firstRig.add(this.firstBow);
    this.firstArrow=makeArrow();this.firstArrow.quaternion.setFromUnitVectors(unitY,new THREE.Vector3(0,0,-1));this.firstArrow.position.set(-.17,-.20,-.86);this.firstRig.add(this.firstArrow);
    this.heldBow.visible=this.firstBow.visible=this.firstArrow.visible=false;
  }
  aim(){
    this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.direction);this.ray.set(this.camera.position,this.direction);this.ray.far=85;
    const live=this.proxies.filter(p=>this.hunting.entities.find(e=>e.id===p.userData.entityId)?.alive);
    const hit=this.ray.intersectObjects([...this.environment.cameraSurfaces,...live],false)[0];
    return {point:hit?hit.point.clone():this.camera.position.clone().addScaledVector(this.direction,70),direction:this.direction.clone(),entity:hit?.object.userData.entityId};
  }
  particleBurst(event){
    const material=this.sparkMaterials[event.kind]??this.sparkMaterials.impact;
    for(let i=0;i<(event.type==='defeat'?16:6);i++){
      const object=new THREE.Mesh(this.sparkGeometry,material);object.position.set(event.x,event.y,event.z);this.scene.add(object);
      const angle=i*2.399;
      this.effects.push({object,life:.6,total:.6,vx:Math.cos(angle)*(1.5+i*.05),vy:1.3+(i%4)*.35,vz:Math.sin(angle)*(1.5+i*.05)});
    }
  }
  swingEffect(event){
    const m=new THREE.MeshBasicMaterial({color:0xffe6ad,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false});
    const object=new THREE.Mesh(new THREE.RingGeometry(1.25,1.65,24,1,-1.1,2.2),m);
    object.rotation.x=-Math.PI/2;object.rotation.z=Math.atan2(-event.dz,event.dx);
    object.position.set(event.x+event.dx*.5,event.y,event.z+event.dz*.5);this.scene.add(object);
    this.effects.push({object,life:.18,total:.18,arc:true});
  }
  update(dt,firstPerson,avatar,paused){
    for(const e of this.hunting.entities){
      const v=this.creatures.get(e.id);v.root.visible=e.alive;v.proxy.visible=e.alive;
      v.root.position.set(e.x,e.y,e.z);v.root.rotation.y=e.heading;v.g.position.y=e.hop;v.proxy.position.y=e.height*.5+e.hop;
      if(e.kind==='slime'){
        const squash=e.windup>0?1-Math.sin(e.windup/.5*Math.PI)*.22:1+Math.sin(e.phase)*.06;
        v.g.scale.set(1/Math.sqrt(squash),squash,1/Math.sqrt(squash));
      }else v.ears.forEach((ear,i)=>{ear.rotation.x=Math.sin(e.phase*.5+i)*.12;});
      for(const m of v.materials)m.emissive.setScalar(e.flash>0?e.flash*2.6:0);
      v.bar.visible=e.alive&&(e.hp<e.maxHp||e.alert)&&Math.hypot(e.x-this.camera.position.x,e.z-this.camera.position.z)<28;
      v.bar.position.set(e.x,e.y+e.height+.45+e.hop,e.z);v.bar.quaternion.copy(this.camera.quaternion);
      v.fill.scale.x=e.hp/e.maxHp;v.fill.position.x=-.495*(1-e.hp/e.maxHp);
    }
    const active=new Set(this.hunting.arrows.map(a=>a.id));
    for(const [id,object] of this.projectiles)if(!active.has(id)){this.scene.remove(object);this.projectiles.delete(id);}
    for(const a of this.hunting.arrows){
      let object=this.projectiles.get(a.id);
      if(!object){object=this.arrowTemplate.clone();this.projectiles.set(a.id,object);this.scene.add(object);}
      object.position.set(a.x,a.y,a.z);object.quaternion.setFromUnitVectors(unitY,new THREE.Vector3(a.vx,a.vy,a.vz).normalize());
    }
    for(const effect of this.effects){
      if(!paused)effect.life-=dt;
      const ratio=Math.max(0,effect.life/effect.total);
      if(effect.arc){effect.object.material.opacity=ratio*.72;effect.object.scale.setScalar(1+(1-ratio)*.18);}
      else if(!paused){effect.object.position.x+=effect.vx*dt;effect.object.position.y+=effect.vy*dt;effect.object.position.z+=effect.vz*dt;effect.vy-=6*dt;effect.object.scale.setScalar(ratio);}
      if(effect.life<=0){this.scene.remove(effect.object);if(effect.arc){effect.object.geometry.dispose();effect.object.material.dispose();}}
    }
    this.effects=this.effects.filter(e=>e.life>0);
    const bow=this.hunting.weapon==='bow';
    this.heldSword.visible=!bow;this.heldBow.visible=bow;this.firstRig.visible=firstPerson;
    this.firstSword.visible=!bow;this.firstBow.visible=this.firstArrow.visible=bow;
    const swing=this.hunting.swing>0?Math.sin((1-this.hunting.swing/.34)*Math.PI):0;
    if(!bow&&swing>0){avatar.arms[1].rotation.x=-1.4+swing*1.8;avatar.arms[1].rotation.z=-.2-swing*.8;}
    if(bow){avatar.arms[0].rotation.x=-1.25;avatar.arms[1].rotation.x=-1.05;avatar.arms[1].rotation.z=-.5+this.hunting.draw;}
    this.firstSword.rotation.z=Math.PI-.18+swing*1.3;this.firstSword.position.x=.46-swing*.42;
    this.firstBow.rotation.z=this.hunting.draw*.2;this.firstArrow.position.z=-.86+this.hunting.draw*.8;
  }
}
