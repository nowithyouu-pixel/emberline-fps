// World building: turns MAP's boxes into three.js meshes with a canvas-painted
// ground texture, dusk lighting and a sky dome. Geometry is built once at boot;
// nothing here allocates during play.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9a7a52';
  g.fillRect(0, 0, 512, 512);
  // Sand mottling.
  for (let i = 0; i < 2600; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 4;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(125,98,66,0.25)' : 'rgba(190,155,105,0.22)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Worn tire tracks along the lanes.
  g.strokeStyle = 'rgba(90,70,45,0.35)';
  g.lineWidth = 9;
  for (const x of [70, 442]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  g.strokeStyle = 'rgba(90,70,45,0.22)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 512);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSiteTexture(letter) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(240,168,48,0.9)';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = 'rgba(240,168,48,0.9)';
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c2a878';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#a4542e';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 32);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const colliders = MAP.boxes;
  const shootables = [];

  // Sky: gradient dome + low sun disc, fog to match the horizon.
  const skyGeo = new THREE.SphereGeometry(180, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = clamp(vP.y / 120.0, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.65)), 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 120);

  // Lights: warm low sun with shadows + cool hemisphere fill.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-40, 55, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x8a6a45, 0.85));

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 50),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Shared materials and geometries: one box geometry, scaled per mesh.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 }),
    wallDark: new THREE.MeshStandardMaterial({ color: PALETTE.wallDark, roughness: 0.9 }),
    rust: new THREE.MeshStandardMaterial({ color: PALETTE.containerRust, roughness: 0.75, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ color: PALETTE.containerTeal, roughness: 0.75, metalness: 0.25 }),
    sand: new THREE.MeshStandardMaterial({ color: PALETTE.containerSand, roughness: 0.8, metalness: 0.15 }),
    crate: new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.9 }),
    crateDark: new THREE.MeshStandardMaterial({ color: PALETTE.crateDark, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.5, metalness: 0.6 }),
  };
  const stripeTex = makeStripeTexture();
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 });

  let tallIndex = 0;
  for (const b of colliders) {
    let mat = mats.wall;
    if (b.kind === 'crate') mat = (b.h > 2 ? mats.crateDark : mats.crate);
    if (b.kind === 'tall') {
      mat = [mats.rust, mats.teal, mats.sand][tallIndex % 3];
      tallIndex += 1;
    }
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.box = b;
    scene.add(mesh);
    shootables.push(mesh);
    // Hazard stripe cap on low crates so cover reads at a glance.
    if (b.kind === 'crate' && b.h < 2) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.06, b.d + 0.04), stripeMat);
      cap.position.set(b.x, b.h + 0.03, b.z);
      cap.receiveShadow = true;
      scene.add(cap);
    }
  }

  // Site floor markings: big A / B letters painted on the ground.
  for (const [letter, site] of Object.entries(MAP.sites)) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: makeSiteTexture(letter), transparent: true, depthWrite: false }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(site.x, 0.02, site.z);
    scene.add(mark);
    // Site beacon pole with a small amber lamp.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), mats.metal);
    pole.position.set(site.x + 4.5, 1.7, site.z + 4.5);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.accent }),
    );
    lamp.position.set(site.x + 4.5, 3.5, site.z + 4.5);
    scene.add(lamp);
    const lampLight = new THREE.PointLight(PALETTE.accent, 6, 9, 2);
    lampLight.position.set(site.x + 4.5, 3.4, site.z + 4.5);
    scene.add(lampLight);
  }

  // Perimeter floodlight poles along the south wall.
  for (const x of [-24, -8, 8, 24]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), mats.metalDark);
    pole.position.set(x, 2.6, 23);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), mats.metal);
    head.position.set(x, 5.2, 23);
    scene.add(head);
  }

  // Drifting dust motes: one Points cloud, animated by time in main.js.
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = -32 + Math.random() * 64;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 5;
    dustPos[i * 3 + 2] = -24 + Math.random() * 48;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xe8c890, size: 0.08, transparent: true, opacity: 0.5, sizeAttenuation: true,
  }));
  scene.add(dust);

  return { colliders, shootables, dust, sun };
}
