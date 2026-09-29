import * as THREE from './vendor/three.module.js';
import {terrainHeight} from './movement.js';

export class RaidBossView {
  constructor(scene,boss){this.scene=scene;this.boss=boss;this.shapes=new Map();}
  geometry(h,safe=false){
    let g;
    if(safe)g=new THREE.RingGeometry(0,h.inner-.25,64,8);
    else if(h.shape==='ring')g=new THREE.RingGeometry(h.inner,h.radius,72,16);
    else if(h.shape==='cone')g=new THREE.RingGeometry(0,h.radius,64,16,-Math.PI/2-h.halfAngle,2*h.halfAngle);
    else if(h.shape==='lane')g=new THREE.PlaneGeometry(h.width,h.length,4,36);
    else g=new THREE.RingGeometry(0,h.radius,64,8);
    g.rotateX(-Math.PI/2);if(h.dx!==undefined)g.rotateY(Math.atan2(h.dx,h.dz));
    const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i)+h.x,p.getZ(i)+h.z)+.07);
    p.needsUpdate=true;g.computeVertexNormals();return g;
  }
  outline(h){
    const paths=[],circle=r=>Array.from({length:73},(_,i)=>[Math.cos(i*Math.PI/36)*r,Math.sin(i*Math.PI/36)*r]);
    if(h.shape==='ring')paths.push(circle(h.inner),circle(h.radius));
    else if(h.shape==='lane'){const w=h.width/2,l=h.length/2;paths.push([[-w,-l],[w,-l],[w,l],[-w,l],[-w,-l]]);}
    else if(h.shape==='cone')paths.push([[0,0],...Array.from({length:65},(_,i)=>{const a=-h.halfAngle+i*h.halfAngle/32;return [Math.sin(a)*h.radius,Math.cos(a)*h.radius];}),[0,0]]);
    else paths.push(circle(h.radius));
    const angle=h.dx===undefined?0:Math.atan2(h.dx,h.dz),c=Math.cos(angle),s=Math.sin(angle),positions=[];
    const point=([x,z])=>{const rx=x*c+z*s,rz=z*c-x*s;return [rx,terrainHeight(h.x+rx,h.z+rz)+.095,rz];};
    for(const path of paths)for(let i=1;i<path.length;i++)positions.push(...point(path[i-1]),...point(path[i]));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));return g;
  }
  create(h){
    const root=new THREE.Group();root.position.set(h.x,0,h.z);this.scene.add(root);
    const material=new THREE.MeshBasicMaterial({color:0xff593f,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(this.geometry(h),material);root.add(mesh);
    const rim=new THREE.LineSegments(this.outline(h),new THREE.LineBasicMaterial({color:0xffb1a0,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));root.add(rim);
    if(h.shape==='ring'){const safe=new THREE.Mesh(this.geometry(h,true),new THREE.MeshBasicMaterial({color:0x57e5a7,transparent:true,opacity:.36,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));root.add(safe);}
    return {root,material,rim};
  }
  update(){
    const ids=new Set(this.boss.hazards.map(h=>h.id));
    for(const [id,v] of this.shapes)if(!ids.has(id)){v.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});v.root.removeFromParent();this.shapes.delete(id);}
    for(const h of this.boss.hazards){let v=this.shapes.get(h.id);if(!v){v=this.create(h);this.shapes.set(h.id,v);}const progress=Math.min(1,h.age/h.delay);
      v.material.color.setHex(h.fired?0xff8532:0xf24938);v.material.opacity=h.fired?.55+.10*Math.sin(h.age*14):.25+progress*.3;v.rim.material.opacity=h.fired?.95:.75+.25*Math.sin(progress*Math.PI/2);
    }
  }
}
