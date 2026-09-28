import * as THREE from './vendor/three.module.js';
import { terrainHeight } from './movement.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .95, ...extra });
const grass = mat(0x728f42), bark = mat(0x79614a), stone = mat(0x91a098);
const pine = [mat(0x326e51), mat(0x3c7b56), mat(0x538757)];
function mesh(geometry, material, x, y, z, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
  parent.add(object); return object;
}
export function createEnvironment(scene) {
  const colliders = [], cameraSurfaces = [];
  let seed = 47;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  scene.background = new THREE.Color(0xb1d6d7);
  scene.fog = new THREE.Fog(0xb1d6d7, 48, 128);
  scene.add(new THREE.HemisphereLight(0xdceeff, 0x788b4b, 2.1));
  const sunlight = new THREE.DirectionalLight(0xffe4b0, 3.3);
  sunlight.position.set(-28, 42, 22); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: .5, far: 120 });
  sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.00015;
  scene.add(sunlight, sunlight.target);

  const groundGeometry = new THREE.PlaneGeometry(180, 180, 150, 150);
  groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const deepGrass = new THREE.Color(0x688b4b), lightGrass = new THREE.Color(0x91a957), pathColor = new THREE.Color(0xbcb080);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, terrainHeight(x, z));
    const c = deepGrass.clone().lerp(lightGrass, .5 + .27 * Math.sin(x * .3) * Math.cos(z * .19) + random() * .14);
    const path = Math.abs(x - Math.sin(z * .08) * 3.5);
    c.lerp(pathColor, (1 - THREE.MathUtils.smoothstep(path, 1.5, 3.5)) * .7);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); groundGeometry.computeVertexNormals();
  const ground = mesh(groundGeometry, mat(0xffffff, { vertexColors: true }), 0, 0, 0, scene);
  ground.castShadow = false; cameraSurfaces.push(ground);

  function block(x, z, width, height, depth, bottom = terrainHeight(x, z), color = stone) {
    const object = mesh(new THREE.BoxGeometry(width, height, depth), color, x, bottom + height / 2, z, scene);
    colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, bottom, top: bottom + height });
    cameraSurfaces.push(object); return object;
  }
  // The stone steps and old gate give movement, jump height and scale a purpose.
  for (let i = 0; i < 5; i++) block(-8, -5 - i * 2, 3.2, .42 + i * .48, 2.1, 0, mat(i % 2 ? 0x929d90 : 0xa1aa98));
  block(-8, -15, 4.2, 2.34, 3.1, 0);
  block(1, -23, 1.35, 5.4, 1.5);
  block(7, -23, 1.35, 5.4, 1.5);
  block(4, -23, 7.8, 1.1, 1.8, terrainHeight(4, -23) + 5.4);
  const trim = mat(0xc4ceb1);
  block(1, -23, 1.75, .22, 1.9, terrainHeight(1, -23) + 4.55, trim);
  block(7, -23, 1.75, .22, 1.9, terrainHeight(7, -23) + 4.55, trim);

  const treeTrunk = new THREE.CylinderGeometry(.18, .29, 2.8, 6);
  const crown = new THREE.ConeGeometry(1.65, 3.6, 7);
  const treeSpots = [];
  for (let i = 0; i < 85; i++) {
    const angle = random() * Math.PI * 2, radius = 13 + random() * 61;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (Math.abs(x - Math.sin(z * .08) * 3.5) < 6 || (x < -4 && x > -12 && z < 0 && z > -20)) continue;
    const scale = .8 + random() * .75, y = terrainHeight(x, z);
    const trunk = mesh(treeTrunk, bark, x, y + 1.4 * scale, z, scene); trunk.scale.setScalar(scale);
    for (let level = 0; level < 3; level++) {
      const foliage = mesh(crown, pine[(i + level) % pine.length], x, y + (3 + level * 1.05) * scale, z, scene);
      foliage.scale.setScalar(scale * (1 - level * .19)); foliage.rotation.y = i;
    }
    colliders.push({ minX: x - .25 * scale, maxX: x + .25 * scale, minZ: z - .25 * scale, maxZ: z + .25 * scale, bottom: y, top: y + 5 * scale });
    cameraSurfaces.push(trunk); treeSpots.push({ x, z });
  }

  for (let i = 0; i < 24; i++) {
    const a = random() * Math.PI * 2, r = 15 + random() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainHeight(x, z);
    if (Math.abs(x) < 7) continue;
    const size = .55 + random() * 1.0;
    const rock = mesh(new THREE.DodecahedronGeometry(size, 0), mat(i % 2 ? 0x7d8b80 : 0x9ca792), x, y + size * .3, z, scene);
    rock.scale.set(1.1, .8, 1); rock.rotation.set(random() * .5, random() * 6, 0);
    colliders.push({ minX: x - size * .65, maxX: x + size * .65, minZ: z - size * .6, maxZ: z + size * .6, bottom: y, top: y + size * .85 });
    cameraSurfaces.push(rock);
  }

  // Instanced ground cover keeps the field inexpensive to render.
  const dummy = new THREE.Object3D();
  const blade = new THREE.ConeGeometry(.055, .38, 3);
  const blades = new THREE.InstancedMesh(blade, grass, 2600);
  for (let i = 0; i < 2600; i++) {
    const x = (random() - .5) * 135, z = (random() - .5) * 135;
    const nearPath = Math.abs(x - Math.sin(z * .08) * 3.5) < 2.7;
    dummy.position.set(x, terrainHeight(x, z) + .16, z);
    dummy.rotation.set(0, random() * 6, (random() - .5) * .2);
    dummy.scale.setScalar(nearPath ? .08 : .7 + random() * .8); dummy.updateMatrix(); blades.setMatrixAt(i, dummy.matrix);
  }
  blades.receiveShadow = true; scene.add(blades);
  const flowerGeometry = new THREE.IcosahedronGeometry(.105, 0);
  for (const [color, count] of [[0xe6cf79, 150], [0xb9a2d8, 180]]) {
    const flowers = new THREE.InstancedMesh(flowerGeometry, mat(color), count);
    for (let i = 0; i < count; i++) {
      const x = (random() - .5) * 70, z = (random() - .5) * 65;
      dummy.position.set(x, terrainHeight(x, z) + .23, z); dummy.rotation.set(0, random() * 6, 0); dummy.scale.set(1, .7, 1); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix);
    }
    scene.add(flowers);
  }
  for (let i = 0; i < 17; i++) {
    const a = i / 17 * Math.PI * 2;
    const mountain = mesh(new THREE.ConeGeometry(17 + random() * 14, 15 + random() * 28, 5), mat(i % 2 ? 0x73948d : 0x87a49b), Math.cos(a) * 106, 5, Math.sin(a) * 106, scene);
    mountain.rotation.y = random() * 4; mountain.castShadow = false;
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf0f5e9, transparent: true, opacity: .8 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const part = mesh(new THREE.IcosahedronGeometry(3.5, 1), cloudMat, j * 3, random() * 1.2, 0, cloud);
      part.scale.set(1.5, .45 + random() * .2, .8); part.castShadow = false;
    }
    cloud.position.set((random() - .5) * 170, 27 + random() * 17, (random() - .5) * 170); scene.add(cloud); clouds.push(cloud);
  }
  return { colliders, cameraSurfaces, sunlight, clouds };
}

export function createAvatar(scene) {
  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  const jacket = mat(0xce673e), trousers = mat(0x344943), boots = mat(0x433d35), skin = mat(0xe4b686), pack = mat(0x716645);
  mesh(new THREE.BoxGeometry(.56, .65, .35), jacket, 0, 1.17, 0, body);
  mesh(new THREE.BoxGeometry(.57, .09, .37), pack, 0, .89, 0, body);
  mesh(new THREE.BoxGeometry(.41, .25, .17), pack, 0, 1.27, -.25, body);
  mesh(new THREE.BoxGeometry(.38, .42, .18), mat(0x829076), 0, 1.22, -.28, body);
  mesh(new THREE.BoxGeometry(.37, .39, .36), skin, 0, 1.72, .015, body);
  mesh(new THREE.BoxGeometry(.42, .15, .42), mat(0x4e5841), 0, 1.94, -.02, body);
  mesh(new THREE.BoxGeometry(.44, .04, .18), mat(0x4e5841), 0, 1.885, .21, body);
  const eyes = mat(0x34392e);
  mesh(new THREE.BoxGeometry(.035, .045, .01), eyes, -.085, 1.75, .20, body);
  mesh(new THREE.BoxGeometry(.035, .045, .01), eyes, .085, 1.75, .20, body);
  const scarf = mesh(new THREE.BoxGeometry(.44, .11, .40), mat(0xe4cb74), 0, 1.5, 0, body);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .38, 1.42, 0); body.add(arm);
    mesh(new THREE.BoxGeometry(.19, .46, .21), jacket, 0, -.19, 0, arm);
    mesh(new THREE.BoxGeometry(.17, .17, .19), skin, 0, -.49, 0, arm); arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .16, .87, 0); body.add(leg);
    mesh(new THREE.BoxGeometry(.22, .56, .24), trousers, 0, -.27, 0, leg);
    mesh(new THREE.BoxGeometry(.25, .18, .37), boots, 0, -.70, .07, leg); legs.push(leg);
  }
  root.rotation.y = Math.PI;
  return { root, body, arms, legs, scarf };
}
