import * as THREE from './vendor/three.module.js';
export class BuildingView{
  constructor(scene,camera,environment,building){
    Object.assign(this,{scene,camera,environment,building});this.meshes=new Map();this.revision=-1;this.ray=new THREE.Raycaster();this.ray.far=22;this.candidate=null;this.removeId=null;
    this.geometry=new THREE.BoxGeometry(1,1,1);this.materials=Object.fromEntries(Object.entries({timber:0x96704a,stone:0x979b94,roof:0xab6650}).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:.88})]));
    this.ghost=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color:0xa5e4b3,transparent:true,opacity:.35,depthWrite:false}));this.ghost.scale.setScalar(1.015);this.ghost.visible=false;scene.add(this.ghost);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(this.geometry),new THREE.LineBasicMaterial({color:0xffe3a1}));this.outline.scale.setScalar(1.01);this.outline.visible=false;scene.add(this.outline);this.sync();
  }
  sync(){if(this.revision===this.building.revision)return;this.revision=this.building.revision;
    for(const [id,m] of this.meshes)if(!this.building.blocks.has(id)){m.removeFromParent();const i=this.environment.cameraSurfaces.indexOf(m);if(i>=0)this.environment.cameraSurfaces.splice(i,1);this.meshes.delete(id);}
    for(const [id,b] of this.building.blocks)if(!this.meshes.has(id)){const m=new THREE.Mesh(this.geometry,this.materials[b.type]);m.position.set(b.x+.5,b.y+.5,b.z+.5);m.castShadow=m.receiveShadow=true;m.userData={buildId:id,collider:b.collider};this.scene.add(m);this.meshes.set(id,m);this.environment.cameraSurfaces.push(m);}
  }
  update(enabled,type,player){
    this.sync();this.ghost.visible=this.outline.visible=false;this.candidate=null;this.removeId=null;if(!enabled)return;
    this.ray.setFromCamera({x:0,y:0},this.camera);
    const hit=this.ray.intersectObjects(this.environment.cameraSurfaces,false).find(h=>h.object.userData.collider?.active!==false);if(!hit)return;
    this.removeId=hit.object.userData.buildId??null;
    if(this.removeId){this.outline.position.copy(hit.object.position);this.outline.visible=true;}
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld),point=hit.point.clone().addScaledVector(normal,.015);
    this.candidate={x:Math.floor(point.x),y:Math.max(0,Math.floor(point.y)),z:Math.floor(point.z),type};
    this.reason=this.building.reason(this.candidate,player);this.ghost.position.set(this.candidate.x+.5,this.candidate.y+.5,this.candidate.z+.5);this.ghost.material.color.setHex(this.reason?0xe58f78:0xa5e4b3);this.ghost.visible=true;
  }
}
