import * as THREE from './vendor/three.module.js';
import { terrainHeight } from './movement.js';
import { VILLAGE, BUILD_PLOTS } from './village-data.js';

const material=color=>new THREE.MeshStandardMaterial({color,roughness:.92});
const timber=material(0x66503c),plaster=material(0xe2cfa0),stone=material(0x93958a),dark=material(0x373e38);
const glass=new THREE.MeshStandardMaterial({color:0xffda82,emissive:0xcc862f,emissiveIntensity:.45,roughness:.6});
const cube=new THREE.BoxGeometry(1,1,1);
function box(parent,mat,x,y,z,w,h,d) {
  const m=new THREE.Mesh(cube,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
}
function label(text,sub='',color='#f2e5bf') {
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=sub?132:80;
  const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(30,49,42,.88)';ctx.beginPath();ctx.roundRect(4,4,376,canvas.height-8,18);ctx.fill();
  ctx.textAlign='center';ctx.fillStyle=color;ctx.font='bold 35px system-ui, sans-serif';ctx.fillText(text,192,52);
  if(sub){ctx.fillStyle='#cad7bc';ctx.font='25px system-ui, sans-serif';ctx.fillText(sub,192,98);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(sub?2.3:3,sub?.79:.625,1);return sprite;
}
export function createVillageScenery(scene,environment) {
  const root=new THREE.Group();root.name='솔바람 마을';scene.add(root);
  function solid(mat,x,y,z,w,h,d) {
    const m=box(root,mat,x,y+h/2,z,w,h,d),b={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,bottom:y,top:y+h};
    m.userData.collider=b;environment.colliders.push(b);environment.cameraSurfaces.push(m);return m;
  }
  function road(ax,az,bx,bz,width) {
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),segments=Math.ceil(length/.6),verts=[];
    for(let i=0;i<=segments;i++)for(const side of [-1,1]) {
      const t=i/segments,x=ax+dx*t+dz/length*width/2*side,z=az+dz*t-dx/length*width/2*side;verts.push(x,terrainHeight(x,z)+.026,z);
    }
    const indices=[];for(let i=0;i<segments;i++){let a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xc3b181,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;root.add(m);
  }
  road(2,8,13,15,2.8);road(13,15,62,15,5.5);road(20,3,20,29,3.5);road(32,7,32,29,3.5);road(15,25,42,25,3.5);road(43,-3,43,33,3.5);road(22,7,44,7,3);road(43,19,61,19,2.5);
  const plaza=new THREE.Mesh(new THREE.CylinderGeometry(6.4,6.4,.045,12),material(0xb6ae8a));plaza.position.set(26,.03,16);plaza.receiveShadow=true;root.add(plaza);
  for(let i=0;i<12;i++){const a=i*Math.PI/6,p=box(root,stone,26+Math.sin(a)*6.5,.04,16+Math.cos(a)*6.5,1.55,.09,.34);p.rotation.y=a;}
  function house(x,z,w,d,roofColor,front=1,sign='') {
    solid(stone,x,0,z,w+.25,.35,d+.25);solid(plaster,x,.35,z,w,3.2,d);
    const fz=z+front*(d/2+.04);
    for(const side of [-1,1])for(const end of [-1,1])box(root,timber,x+side*(w/2-.12),1.96,z+end*(d/2+.035),.25,3.2,.24);
    for(const y of [.62,3.35])box(root,timber,x,y,fz,w,.18,.15);
    box(root,timber,x,1.36,fz,.98,2.05,.15);box(root,dark,x,1.45,fz+front*.09,.73,1.77,.08);box(root,glass,x+.25,1.25,fz+front*.16,.09,.09,.07);
    for(const side of [-1,1]) {
      box(root,timber,x+side*w*.32,2.05,fz,1.22,1.27,.18);box(root,glass,x+side*w*.32,2.05,fz+front*.10,1.02,1.08,.03);
      box(root,timber,x+side*w*.32,2.05,fz+front*.14,.09,1.15,.05);box(root,timber,x+side*w*.32,2.05,fz+front*.14,1.08,.1,.05);
      box(root,timber,x+side*w*.32,1.31,fz+front*.24,1.37,.26,.46);
      for(let i=0;i<4;i++)box(root,material(i%2?0xca875d:0x688453),x+side*w*.32-.45+i*.3,1.56,fz+front*.24,.23,.25,.25);
    }
    const roof=material(roofColor),rise=1.72,half=w/2+.55,angle=Math.atan2(rise,half);
    for(const side of [-1,1]){const m=box(root,roof,x+side*half/2,3.55+rise/2,z,Math.hypot(half,rise)+.12,.26,d+1.1);m.rotation.z=-side*angle;environment.cameraSurfaces.push(m);}
    for(let level=0;level<6;level++)box(root,timber,x,3.5+level*.26,z,w*(1-level/6),.28,d);
    box(root,stone,x+w*.3,4.8,z-d*.15,.66,2,.7);box(root,dark,x+w*.3,5.85,z-d*.15,.84,.18,.87);
    if(sign){const s=label(sign);s.position.set(x,3.13,fz+front*.32);s.scale.multiplyScalar(.77);root.add(s);}
    solid(stone,x,0,fz+front*.37,1.75,.18,.72);
  }
  house(17,1,5.2,4.8,0x9b6045,1,'목재 상점');house(37.5,10,5.6,5,0x557d72,1,'나리의 약초');
  house(37,31,6,5,0x505c65,-1,'대장간');house(26,32,7,5,0xa8694c,-1,'솔바람 여관');house(16,30,5,4,0x7b8352,-1,'호두의 건축 자재');
  function stall(x,z,color) {
    for(const a of [-1,1])for(const b of [-1,1])box(root,timber,x+a*1.42,1.15,z+b*.58,.14,2.3,.14);
    solid(timber,x,0,z,2.85,.83,1.06);
    const stripe=material(color);for(let i=0;i<6;i++){const m=box(root,i%2?plaster:stripe,x-1.36+i*.54,2.36,z,.55,.14,1.8);m.rotation.x=.1;}
  }
  stall(20,5.65,0xa97445);stall(32,9.65,0x6a9471);
  for(let i=0;i<5;i++)box(root,timber,19.1+i*.42,1,5.65,.32,.27,.83);
  for(let i=0;i<6;i++){box(root,material(i%2?0xb97186:0x70a69d),31+i*.37,1.04,9.65,.23,.38,.27);box(root,timber,31+i*.37,1.29,9.65,.13,.12,.15);}
  solid(dark,39,0,26.3,1.35,.55,.9);solid(stone,39,.55,26.3,1.65,.35,.65);box(root,dark,39.75,.8,26.3,.65,.18,.4);
  solid(stone,41,0,31,1.45,1.4,1.3);box(root,material(0xd57c31),41,.6,30.31,.91,.74,.1);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,m=box(root,stone,26+Math.sin(a),.53,16+Math.cos(a),.87,1.02,.35);m.rotation.y=a;environment.cameraSurfaces.push(m);}
  environment.colliders.push({minX:24.8,maxX:27.2,minZ:14.8,maxZ:17.2,bottom:0,top:1.05});
  const water=new THREE.Mesh(new THREE.CircleGeometry(.92,16),material(0x588d96));water.rotation.x=-Math.PI/2;water.position.set(26,.68,16);root.add(water);
  for(const side of [-1,1])box(root,timber,26+side*1.27,1.65,16,.19,3.3,.23);
  box(root,timber,26,3.15,16,2.9,.23,.24);const canopy=box(root,material(0x4c736d),26,3.43,16,3.45,.24,2.5);environment.cameraSurfaces.push(canopy);
  box(root,timber,26,2.23,16,.035,1.85,.035);box(root,timber,26,1.38,16,.4,.35,.4);
  function fence(ax,az,bx,bz,gap=false) {
    const length=Math.hypot(bx-ax,bz-az),parts=Math.ceil(length/2.5);
    for(let i=0;i<=parts;i++){const t=i/parts,x=ax+(bx-ax)*t,z=az+(bz-az)*t;if(gap&&z>11.2&&z<18.8)continue;solid(timber,x,0,z,.2,1.4,.2);}
    for(let i=0;i<parts;i++){const t=(i+.5)/parts,x=ax+(bx-ax)*t,z=az+(bz-az)*t;if(gap&&z>11.2&&z<18.8)continue;
      const w=bx===ax?.13:length/parts,d=bx===ax?length/parts:.13;solid(timber,x,.48,z,w,.14,d);solid(timber,x,.98,z,w,.14,d);}
  }
  fence(11,-7,65,-7);fence(65,-7,65,37);fence(11,37,65,37);fence(11,-7,11,37,true);
  solid(timber,11,0,11.6,.48,3.8,.48);solid(timber,11,0,18.4,.48,3.8,.48);box(root,timber,11,3.63,15,.6,.45,7.8);
  const welcome=label(VILLAGE.name,'주민과 여행자의 쉼터');welcome.position.set(10.85,3.9,15);welcome.scale.set(3.8,1.31,1);root.add(welcome);
  function lamp(x,z){solid(timber,x,0,z,.18,2.6,.18);box(root,dark,x,2.62,z,.48,.12,.48);box(root,glass,x,2.92,z,.34,.48,.34);box(root,dark,x,3.22,z,.52,.15,.52);}
  lamp(14,11);lamp(14,19.8);lamp(23,12);lamp(29,21);lamp(41,14);lamp(44,31);lamp(44,-4);lamp(61,17);
  for(const [x,z] of [[15,10.3],[17,10.1],[36,11],[37.3,11.2],[38,22.2]]){solid(timber,x,0,z,.85,.8,.85);box(root,plaster,x,.81,z,.92,.06,.14);}
  for(const [x,z,mat] of [[19,29,timber],[19,30.4,stone],[19,31.8,material(0xaa6750)]]){solid(mat,x,0,z,.85,.85,.85);solid(mat,x,.85,z,.65,.65,.65);}
  for(const [x,z] of [[22,17],[30,17]]){solid(timber,x,0,z,1.5,.5,.48);box(root,timber,x,.88,z+.24,1.5,.65,.12);}
  const plotMaterial=material(0x91a56d),borderMaterial=material(0xc9c69b);
  for(const p of BUILD_PLOTS){
    const w=p.maxX-p.minX,d=p.maxZ-p.minZ,x=(p.minX+p.maxX)/2,z=(p.minZ+p.maxZ)/2;
    box(root,plotMaterial,x,.016,z,w,.02,d).castShadow=false;
    for(const edge of [-1,1]){box(root,borderMaterial,x,.035,z+edge*d/2,w,.035,.07);box(root,borderMaterial,x+edge*w/2,.035,z,.07,.035,d);}
    for(const sx of [p.minX,p.maxX])for(const sz of [p.minZ,p.maxZ])box(root,timber,sx,.30,sz,.12,.60,.12);
    const sign=label(p.name,`${w} × ${d} · K 건축`, '#ecdfa5');sign.position.set(p.entry.x,1.35,p.entry.z-1);root.add(sign);
    // The plot border is visual only, so players can walk in from every side.
  }
  return root;
}

export class VillageView {
  constructor(scene,camera,village) {
    this.camera=camera;this.village=village;this.actors=new Map();
    for(const npc of village.residents) {
      const root=new THREE.Group(),body=new THREE.Group();scene.add(root);root.add(body);
      const coat=material(npc.color),hat=material(npc.hat),skin=material(0xe1b887),boots=material(0x48493b);
      box(body,coat,0,1.06,0,.55,.65,.33);box(body,timber,0,.81,0,.58,.11,.36);box(body,skin,0,1.61,0,.43,.47,.4);box(body,hat,0,1.89,0,.5,.15,.46);
      if(npc.shop)box(body,hat,0,1.83,0,.67,.09,.59);
      for(const s of [-1,1])box(body,dark,s*.095,1.64,.206,.055,.055,.02);
      const arms=[],legs=[];
      for(const side of [-1,1]){
        const arm=new THREE.Group();arm.position.set(side*.37,1.31,0);body.add(arm);box(arm,coat,0,-.21,0,.18,.44,.23);box(arm,skin,0,-.47,0,.18,.16,.21);arms.push(arm);
        const leg=new THREE.Group();leg.position.set(side*.15,.75,0);body.add(leg);box(leg,boots,0,-.33,0,.21,.68,.26);box(leg,dark,0,-.66,.035,.25,.16,.36);legs.push(leg);
      }
      const title=label(npc.name,npc.role,npc.shop?'#ffe0a1':'#e1e9cb');title.position.y=2.63;root.add(title);this.actors.set(npc.id,{root,body,arms,legs,title});
    }
  }
  update(player) {
    for(const n of this.village.residents){
      const a=this.actors.get(n.id);a.root.position.set(n.x,n.y,n.z);a.root.rotation.y=n.heading;
      const stride=n.moving?Math.sin(n.step)*.5:0;a.legs[0].rotation.x=stride;a.legs[1].rotation.x=-stride;a.arms[0].rotation.x=-stride*.7;a.arms[1].rotation.x=stride*.7;
      a.body.position.y=n.moving?Math.abs(Math.sin(n.step))*.035:Math.sin(this.village.time*1.6+n.x)*.008;
      const distance=Math.hypot(n.x-player.x,n.z-player.z),cameraDistance=Math.hypot(n.x-this.camera.position.x,n.y+2.63-this.camera.position.y,n.z-this.camera.position.z);
      // Keep nearby nameplates readable without covering the character or square.
      const size=cameraDistance*.18*720/window.innerHeight;a.title.scale.set(size,size*132/384,1);
      a.title.visible=!n.battle&&distance<26&&cameraDistance>2;a.title.material.opacity=Math.min(1,(26-distance)/6);
      a.body.rotation.z=n.battle&&!n.alive?Math.PI/2:0;
    }
  }
}
