import * as THREE from './vendor/three.module.js';
import { SPIN, warriorMotionTime } from './warrior.js';

const Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), midpoint = new THREE.Vector3();
const ease = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mix = THREE.MathUtils.lerp;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .52, ...extra });
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; parent.add(object); return object;
}
function box(parent, size, material, x, y, z) { return mesh(parent, new THREE.BoxGeometry(...size), material, x, y, z); }
function segment(object, a, b) {
  v.copy(b).sub(a); object.scale.y = v.length(); object.position.copy(midpoint.copy(a).add(b).multiplyScalar(.5));
  object.quaternion.setFromUnitVectors(Y, v.normalize());
}
function makeAxe() {
  const root = new THREE.Group();
  const steel = mat(0x779394, { metalness: .7, roughness: .28 }), edge = mat(0xdce6d8, { metalness: .7, roughness: .2 });
  const bronze = mat(0xd7984d, { metalness: .5 }), leather = mat(0x3c3028), wood = mat(0x574238);
  mesh(root, new THREE.CylinderGeometry(.045, .053, 1.56, 8), wood, 0, .78, 0);
  for (let i = 0; i < 7; i++) mesh(root, new THREE.CylinderGeometry(.058, .058, .065, 8), i % 2 ? bronze : leather, 0, .18 + i * .10, 0);
  mesh(root, new THREE.CylinderGeometry(.085, .06, .10, 8), bronze, 0, .03, 0);
  box(root, [.20, .32, .22], bronze, 0, 1.48, 0);
  for (const sign of [-1, 1]) {
    const shape = new THREE.Shape();
    [[.05,1.60],[.28,1.76],[.64,1.86],[.77,1.65],[.72,1.30],[.40,1.18],[.10,1.34]].forEach(([x,y],i)=>i?shape.lineTo(x*sign,y):shape.moveTo(x*sign,y));shape.closePath();
    const blade = mesh(root, new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelSize: .035, bevelThickness: .022, bevelSegments: 1, steps: 1 }), steel, 0, 0, -.06);
    const edgeShape = new THREE.Shape();
    [[.64,1.86],[.77,1.65],[.72,1.30],[.61,1.36],[.66,1.63],[.57,1.78]].forEach(([x,y],i)=>i?edgeShape.lineTo(x*sign,y):edgeShape.moveTo(x*sign,y));edgeShape.closePath();
    mesh(root, new THREE.ExtrudeGeometry(edgeShape, { depth: .15, bevelEnabled: false }), edge, 0, 0, -.075);
    blade.castShadow = true;
  }
  const rune = mat(0xffcc75, { emissive: 0xb64b16, emissiveIntensity: .38 });
  box(root, [.06, .14, .015], rune, 0, 1.51, .126);
  return root;
}

export class WarriorView {
  constructor(scene, camera, avatar, warrior) {
    this.scene = scene; this.camera = camera; this.avatar = avatar; this.warrior = warrior; this.effects = [];
    this.rig = new THREE.Group(); scene.add(this.rig);
    this.axe = makeAxe(); this.rig.add(this.axe);
    this.rotation = new THREE.Quaternion(); this.localRotation = new THREE.Quaternion(); this.euler = new THREE.Euler();
    this.bladeRoll = new THREE.Quaternion(); this.cameraRotation = new THREE.Quaternion();
    this.position = new THREE.Vector3(); this.handPoint = new THREE.Vector3();
    this.blendPosition = new THREE.Vector3(); this.blendRotation = new THREE.Quaternion();
    const metal = mat(0x354e54, { metalness: .48 }), trim = mat(0xd9a255, { metalness: .45 }), glove = mat(0x49392b);
    this.armor = new THREE.Group(); avatar.body.add(this.armor);
    box(this.armor, [.60,.54,.14], metal, 0, 1.23, .22);
    box(this.armor, [.10,.45,.025], trim, 0, 1.25, .304);
    for (const side of [-1,1]) {
      box(this.armor, [.31,.19,.37], metal, side*.38, 1.48, 0);
      box(this.armor, [.33,.055,.39], trim, side*.38, 1.57, 0);
    }
    this.arms = [-1,1].map(side => ({ side,
      upper: box(this.rig,[.21,1,.22],metal,0,0,0), fore: box(this.rig,[.18,1,.19],glove,0,0,0),
      hand: box(this.rig,[.17,.16,.18],glove,0,0,0), shoulder:new THREE.Vector3(), elbow:new THREE.Vector3(), end:new THREE.Vector3(),
    }));
    this.firstRig = new THREE.Group(); camera.add(this.firstRig);
    this.firstAxe = this.axe.clone(); this.firstRig.add(this.firstAxe);
    for (const y of [.35,.72]) box(this.firstAxe,[.16,.16,.17],glove,0,y,0);
    this.firstBoots = [-1,1].map(side=>box(this.firstRig,[.19,.23,.40],glove,side*.15,-.68,-.72));
    this.ringGeometry = new THREE.RingGeometry(.90,1,56);
    this.arcGeometry = new THREE.RingGeometry(.86,1,40,1,-1.40,2.80);
    this.trailSamples = []; this.trailGeometry = new THREE.BufferGeometry();
    this.trailVertices = new Float32Array(24*18);
    this.trailGeometry.setAttribute('position',new THREE.BufferAttribute(this.trailVertices,3));
    this.trail = new THREE.Mesh(this.trailGeometry,new THREE.MeshBasicMaterial({color:0xffdb8b,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false}));
    this.trail.frustumCulled=false;this.trail.visible=false;scene.add(this.trail);
    // A broad, layered cut follows the full skill arc; basic swings keep a short trail.
    this.sweepVfx = new THREE.Group(); scene.add(this.sweepVfx); this.sweepVfx.visible=false;
    this.sweepBands = [[1.9,4.18,0xffb348,.40],[3.94,4.3,0xfff1bd,.85],[3.55,3.66,0xffd77b,.55]].map(([inner,outer,color,opacity],i)=>{
      const band=mesh(this.sweepVfx,new THREE.RingGeometry(inner,outer,64,1,-1.93,3.86),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}),0,0,i*.025);
      band.castShadow=false;band.userData.opacity=opacity;return band;
    });
    this.spinVfx = new THREE.Group(); scene.add(this.spinVfx); this.spinVfx.visible = false;
    this.spinRings = Array.from({length:3},(_,i)=>{
      const ring = mesh(this.spinVfx,new THREE.RingGeometry(2.65+i*.12,SPIN.radius,64,1,0,Math.PI*1.45),new THREE.MeshBasicMaterial({color:0xffd782,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}),0,.35+i*.4,0);
      ring.rotation.x = -Math.PI/2; ring.castShadow=false; return ring;
    });
    this.windLines = Array.from({length:6},(_,i)=>{
      const points = Array.from({length:36},(_,j)=>{const p=j/35,r=SPIN.pullRadius-(SPIN.pullRadius-1.3)*p,angle=p*Math.PI*1.2;return new THREE.Vector3(Math.cos(angle)*r,.12+p*.95,Math.sin(angle)*r);});
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xb2fff1,transparent:true,opacity:.48,depthWrite:false}));
      line.rotation.y=i*Math.PI/3;this.spinVfx.add(line);return line;
    });
    this.rig.visible = this.firstRig.visible = this.armor.visible = false;
  }
  placeLocal(player, dx, dz, x, y, z, rx, ry, rz, roll = 0) {
    const angle = Math.atan2(dx,dz); this.rotation.setFromAxisAngle(Y,angle);
    this.axe.position.set(x,y,z).applyQuaternion(this.rotation).add(this.position.set(player.x,player.y,player.z));
    this.localRotation.setFromEuler(this.euler.set(rx,ry,rz,'YXZ'));
    this.bladeRoll.setFromAxisAngle(Y,roll);
    this.axe.quaternion.copy(this.rotation).multiply(this.localRotation).multiply(this.bladeRoll);
  }
  placePlanted(anchor, lift = 0) {
    // The blade plane follows the vertical chop; its sharpened outer edge bites
    // into the ground while the handle leans back toward the warrior.
    this.placeLocal({x:anchor.x,y:anchor.y,z:anchor.z},anchor.dx,anchor.dz,0,1.40+lift,-1.20,2.20,0,0,Math.PI/2);
  }
  update(dt, firstPerson, player, paused) {
    const w = this.warrior, avatar = this.avatar, equipped = w.combat.weapon === 'axe';
    this.armor.visible = equipped; this.rig.visible = equipped && !firstPerson; this.firstRig.visible = equipped && firstPerson;
    if (equipped) {
      avatar.arms.forEach(arm=>{arm.visible=false;});
      const a = w.active, id = a?.id, t = a ? a.elapsed/a.duration : 0, elapsed = warriorMotionTime(a);
      const angle = avatar.root.rotation.y, facing = w.facing(), dx = facing?.x ?? Math.sin(angle), dz = facing?.z ?? Math.cos(angle);
      const idle = () => this.placeLocal(player,dx,dz,-.20,.64,.30,.17,0,-.42,.20);
      idle();
      let flight = 0;
      if (id === 'charge') {
        avatar.body.rotation.x = .20; avatar.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*22+i*Math.PI)*.8;});
        this.placeLocal(player,dx,dz,-.35,.72,.2,-.3,0,-.70);
      } else if (id === 'slam') {
        const wind = ease(elapsed/.43), strike = Math.pow(THREE.MathUtils.clamp((elapsed-.43)/.21,0,1),2);
        if (elapsed < .64) this.placeLocal(player,dx,dz,mix(-.2,0,wind),mix(.64,1.40,wind),mix(.3,-.28,wind)+strike*.53,mix(.17,-.90,wind)+strike*3.10,0,mix(-.42,0,wind),mix(.20,Math.PI/2,wind));
        else if (a.anchor) this.placePlanted(a.anchor);
        avatar.body.position.y -= strike*.20; avatar.body.rotation.x = -.12*wind+.34*strike;
        avatar.legs.forEach((leg,i)=>{leg.rotation.x=(i?-.28:.16)*strike;});
      } else if (id === 'kick') {
        if (a.carriedAxe) this.placeLocal(player,dx,dz,-.32,.85,-.15,-.45,0,-.50);
        else this.placePlanted(a.anchor);
        flight = ease((elapsed-.12)/.15)*(1-ease((elapsed-.70)/.27));
        const crouch=Math.sin(Math.min(1,elapsed/.14)*Math.PI)*.16;
        avatar.body.position.y = -crouch+.09*flight;
        avatar.body.rotation.x = -.48*flight; avatar.body.rotation.z = -.14*flight;
        avatar.legs[0].rotation.x = -.88*flight; avatar.legs[1].rotation.x = -1.48*flight;
        avatar.legs[0].rotation.z = .17*flight; avatar.legs[1].rotation.z = -.07*flight;
      } else if (id === 'sweep') {
        const wind=ease(elapsed/.80), recall=ease((elapsed-.08)/.66);
        const swing=.5*ease((elapsed-.90)/.16)+.5*ease((elapsed-1.06)/.17), recover=ease((elapsed-1.26)/.39);
        const arc=-2.35+swing*4.70, drive=Math.sin(swing*Math.PI), brace=wind*(1-recover);
        // Extend both hands away from the chest and whip the blade through the front
        // at the damage frame, then carry the torso into a pronounced follow-through.
        this.placeLocal(player,dx,dz,mix(Math.sin(arc)*.48,-.2,recover),mix(.95+drive*.16,.64,recover),mix(.18+Math.cos(arc)*.32,.30,recover),mix(Math.PI/2,.17,recover),mix(arc,0,recover),mix(0,-.42,recover),.20*recover);
        if (elapsed < .74 && a.anchor) {
          // Bring the axe to the warrior so the combo keeps its forward momentum.
          this.blendPosition.copy(this.axe.position); this.blendRotation.copy(this.axe.quaternion);
          this.placePlanted(a.anchor,Math.sin(recall*Math.PI)*.60);
          this.axe.position.lerp(this.blendPosition,recall);this.axe.quaternion.slerp(this.blendRotation,recall);
        }
        avatar.body.rotation.y=mix(-1.35*wind+swing*3.65,0,recover);
        avatar.body.rotation.x=.20*brace+.14*drive;
        avatar.body.rotation.z=(-.20*wind+.38*swing)*(1-recover);
        avatar.body.position.y=-.23*brace+.10*drive;
        avatar.legs[0].rotation.x=(-.55+.90*swing)*brace;avatar.legs[1].rotation.x=(.35-.95*swing)*brace;
        avatar.legs[0].rotation.z=.17*brace;avatar.legs[1].rotation.z=-.17*brace;
      } else if (id === 'spin') {
        const turn=elapsed*Math.PI*5, wind=ease(elapsed/.14), settle=ease((elapsed-(a.duration-.14))/.14);
        const spinAngle=angle+turn;
        avatar.body.rotation.y=turn; avatar.body.position.y=-.12*wind*(1-settle); avatar.body.rotation.x=0;
        avatar.legs[0].rotation.x=.18;avatar.legs[1].rotation.x=-.18;
        avatar.legs[0].rotation.z=.13;avatar.legs[1].rotation.z=-.13;
        this.placeLocal(player,Math.sin(spinAngle),Math.cos(spinAngle),-.10,1.03,.42,Math.PI/2,-.6,0);
      } else if (id === 'slash') {
        const swing = Math.sin(t*Math.PI), arc = -1.2+ease(t)*2.4;
        this.placeLocal(player,dx,dz,-.15,.70+swing*.30,.30,mix(.17,1.40,swing),arc*swing,mix(-.42,0,swing));
      } else if (w.planted) {
        this.placePlanted(w.planted);
        if (!w.planted.kicked) { avatar.body.rotation.x = .15; avatar.body.position.y = -.10; }
      }
      avatar.root.updateMatrixWorld(true); this.axe.updateMatrixWorld(true);
      for (const arm of this.arms) {
        arm.shoulder.set(arm.side*.38,1.42,0); avatar.body.localToWorld(arm.shoulder);
        const restingGrip=arm.side<0?.72:.35;
        const grip = id === 'kick' && !a.carriedAxe ? arm.side<0?.08:.28 : restingGrip;
        arm.end.set(0,grip,0); this.axe.localToWorld(arm.end);
        // Release the planted handle after takeoff; do not stretch arms back to it.
        let free = id==='kick' && !a.carriedAxe ? ease((elapsed-.16)/.12) : 0;
        if ((id==='sweep'&&elapsed<.74)||(!a&&w.planted?.kicked)) free=ease((arm.end.distanceTo(arm.shoulder)-.85)/.50);
        if (free>0) {
          this.handPoint.set(arm.side*.48,1.08,-.18);avatar.body.localToWorld(this.handPoint);arm.end.lerp(this.handPoint,free);
        }
        arm.elbow.copy(arm.shoulder).lerp(arm.end,.48);
        arm.elbow.x += arm.side*.18*Math.cos(angle); arm.elbow.z -= arm.side*.18*Math.sin(angle); arm.elbow.y -= .10;
        segment(arm.upper,arm.shoulder,arm.elbow); segment(arm.fore,arm.elbow,arm.end);
        arm.hand.position.copy(arm.end); arm.hand.quaternion.copy(this.axe.quaternion);
      }
      this.firstAxe.visible=!(id==='kick'&&!a.carriedAxe&&elapsed>.23)&&!(id==='sweep'&&a.anchor&&elapsed<.52)&&!(!a&&w.planted?.kicked);
      this.firstAxe.scale.setScalar(.67); this.firstAxe.position.set(.25,-.68,-1.28);
      this.camera.getWorldQuaternion(this.cameraRotation);this.firstAxe.quaternion.copy(this.cameraRotation.invert()).multiply(this.axe.quaternion);
      if (id==='slam') this.firstAxe.position.set(.25*(1-ease(elapsed/.43)),-.68+ease(elapsed/.43)*.27,-1.34);
      if (id==='sweep') {
        const swing=.5*ease((elapsed-.90)/.16)+.5*ease((elapsed-1.06)/.17),recover=ease((elapsed-1.26)/.39);
        this.firstAxe.position.set(mix(.75-swing*1.5,.25,recover),mix(-.46-Math.sin(swing*Math.PI)*.10,-.68,recover),mix(-1.24-Math.sin(swing*Math.PI)*.32,-1.28,recover));
      }
      if (id==='spin') { this.firstAxe.position.set(Math.sin(elapsed*Math.PI*5)*.46,-.78,-1.36); this.firstAxe.scale.setScalar(.54); }
      this.firstBoots.forEach((boot,i)=>{boot.visible=id==='kick';boot.position.set((i?1:-1)*.20,-.70+flight*.64,-.68-flight*.40);boot.rotation.x=-flight*.45;});
    }
    const spin = w.active?.id === 'spin' ? w.active : null;
    this.spinVfx.visible = equipped && !!spin;
    if (spin) {
      this.spinVfx.position.set(player.x,player.y,player.z);this.spinVfx.rotation.y=spin.elapsed*Math.PI*4;
      const fade=Math.min(1,spin.elapsed/.12,(spin.duration-spin.elapsed)/.15), color=spin.stage===2?0x88f5e2:0xffd782;
      this.spinRings.forEach((ring,i)=>{ring.scale.setScalar(1+(w.combat.progression?.bonuses.spinRadius??0)/SPIN.radius);ring.rotation.z=i*2.1-spin.elapsed*(i+1);ring.material.color.setHex(color);ring.material.opacity=fade*(.25+i*.055);});
      this.windLines.forEach(line=>{const scale=1+(w.combat.progression?.bonuses.pullRadius??0)/SPIN.pullRadius;line.scale.set(scale,1,scale);line.visible=spin.stage===2;line.material.opacity=fade*.55;});
      this.trail.material.color.setHex(color);
    } else this.trail.material.color.setHex(0xffdb8b);
    const sweep=w.active?.id==='sweep'?w.active:null;
    this.sweepVfx.visible=equipped&&!!sweep&&warriorMotionTime(sweep)>.90&&warriorMotionTime(sweep)<1.46;
    if(this.sweepVfx.visible) {
      const elapsed=warriorMotionTime(sweep),cut=.5*ease((elapsed-.90)/.16)+.5*ease((elapsed-1.06)/.17);
      const fade=ease((elapsed-.90)/.06)*(1-ease((elapsed-1.23)/.23));
      this.sweepVfx.position.set(player.x,player.y+.96,player.z);
      this.sweepVfx.rotation.set(-Math.PI/2,0,Math.atan2(-sweep.dz,sweep.dx));
      this.sweepBands.forEach(band=>{band.material.opacity=band.userData.opacity*fade;band.geometry.setDrawRange(0,Math.ceil(cut*64)*6);});
    }
    this.trail.material.opacity=sweep?.72:.38;
    this.updateTrail(dt,paused,firstPerson,equipped);
    for (const e of this.effects) {
      if (!paused) e.life -= dt;
      const p=1-Math.max(0,e.life/e.total);e.object.scale.setScalar(e.radius*(.28+p*.72));
      e.object.material.opacity=(1-p)*.8;
      if(e.life<=0){this.scene.remove(e.object);e.object.material.dispose();}
    }
    this.effects=this.effects.filter(e=>e.life>0);
  }
  updateTrail(dt,paused,firstPerson,equipped) {
    const a=this.warrior.active,elapsed=warriorMotionTime(a);
    if(!paused){
      this.trailSamples=this.trailSamples.filter(s=>(s.life-=dt)>0);
      if(equipped&&(a?.id==='spin'||(a?.id==='slam'&&elapsed>.43&&elapsed<.69)||(a?.id==='sweep'&&elapsed>.90&&elapsed<1.30)||(a?.id==='slash'&&elapsed>.14&&elapsed<.42))){
        this.axe.updateMatrixWorld(true);
        this.trailSamples.push({outer:this.axe.localToWorld(new THREE.Vector3(-.72,1.65,0)),inner:this.axe.localToWorld(new THREE.Vector3(0,a?.id==='sweep'?.35:.85,0)),life:a?.id==='sweep'?.24:.17});
        if(this.trailSamples.length>24)this.trailSamples.shift();
      }
    }
    let n=0;
    for(let i=1;i<this.trailSamples.length;i++){
      const p=this.trailSamples[i-1],q=this.trailSamples[i];
      for(const point of [p.inner,p.outer,q.outer,p.inner,q.outer,q.inner]){this.trailVertices[n++]=point.x;this.trailVertices[n++]=point.y;this.trailVertices[n++]=point.z;}
    }
    this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.setDrawRange(0,n/3);
    this.trail.visible=equipped&&!firstPerson&&n>0;
  }
  effect(event) {
    const sweep=['sweep','slash'].includes(event.skill);
    const material=new THREE.MeshBasicMaterial({color:event.skill==='kick'?0xf8efd0:0xffbd62,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
    const object=new THREE.Mesh(sweep?this.arcGeometry:this.ringGeometry,material);
    object.rotation.x=-Math.PI/2; object.rotation.z=Math.atan2(-event.dz,event.dx);
    object.position.set(event.x,event.y+(sweep?.85:event.skill==='kick'?.7:.055),event.z);
    this.scene.add(object);
    this.effects.push({object,life:sweep?.34:.48,total:sweep?.34:.48,radius:event.skill==='slam'?2.35:event.skill==='sweep'?3.6:event.skill==='kick'?1.1:1.8});
  }
}
