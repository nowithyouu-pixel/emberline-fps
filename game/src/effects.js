// Effects: tracers, impact puffs, blood, smoke, muzzle flash and the viewmodel
// gun. All pools are pre-allocated; the hot loop never creates objects.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 320;

export function createEffects(scene) {
  // --- Tracers: thin glowing lines, pooled.
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) tracers.push({ life: 0, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 });

  // --- Particles: one Points cloud, pooled. Kinds: spark, dust, blood, smoke, fire.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ life: 0, max: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 0.14, grav: 0, grow: 0 });
    pPos[i * 3 + 1] = -100;
  }
  let pCursor = 0;

  // --- Muzzle flash: a small point light + sprite quad on the camera.
  const flashLight = new THREE.PointLight(0xffc36b, 0, 9, 2);
  scene.add(flashLight);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flashQuad.visible = false;
  scene.add(flashQuad);

  function spawnParticle(x, y, z, vx, vy, vz, life, r, g, b, grav = 0, grow = 0) {
    const p = parts[pCursor];
    pCursor = (pCursor + 1) % MAX_PARTICLES;
    p.life = life;
    p.max = life;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.r = r; p.g = g; p.b = b;
    p.grav = grav;
    p.grow = grow;
  }

  function burst(x, y, z, n, color, speed, life, grav = -4) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      spawnParticle(
        x, y, z,
        Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + speed * 0.3, Math.sin(a) * Math.cos(e) * s,
        life * (0.6 + Math.random() * 0.7), c.r, c.g, c.b, grav,
      );
    }
  }

  return {
    tracer(x1, y1, z1, x2, y2, z2, color = 0xffd27a) {
      let slot = tracers.find((t) => t.life <= 0);
      if (!slot) slot = tracers[0];
      slot.life = 0.09;
      slot.x1 = x1; slot.y1 = y1; slot.z1 = z1;
      slot.x2 = x2; slot.y2 = y2; slot.z2 = z2;
      tracerMat.color.setHex(color);
    },
    impact(x, y, z, nx, ny, nz) {
      burst(x, y, z, 10, 0xd8c090, 2.2, 0.5, -6);
      burst(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, 5, 0xffc36b, 3.2, 0.22, -2);
    },
    blood(x, y, z) { burst(x, y, z, 14, 0x8a1a1a, 2.4, 0.6, -7); },
    smokePuff(x, y, z, big = false) {
      const n = big ? 26 : 10;
      for (let i = 0; i < n; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (big ? 1.6 : 0.7);
        spawnParticle(
          x + Math.cos(a) * r, y + Math.random() * 0.8, z + Math.sin(a) * r,
          (Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4,
          big ? 2.2 : 1.1, 0.62, 0.6, 0.58, 0.4, 1,
        );
      }
    },
    explosion(x, y, z) {
      burst(x, y + 0.4, z, 60, 0xff7a2a, 7, 0.9, -3);
      burst(x, y + 0.6, z, 30, 0xffd27a, 4, 0.6, -1);
      burst(x, y, z, 24, 0x3a332c, 3, 1.6, 1.2);
      flashLight.position.set(x, y + 1, z);
      flashLight.intensity = 60;
    },
    muzzle(camera, weaponKind) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const tip = camera.position.clone().addScaledVector(dir, 0.9);
      tip.y -= 0.12;
      flashLight.position.copy(tip);
      flashLight.intensity = weaponKind === 'sniper' ? 26 : 14;
      flashQuad.position.copy(tip);
      flashQuad.lookAt(camera.position);
      flashQuad.visible = true;
      flashMat.opacity = 0.9;
      flashMat.rotation = Math.random() * Math.PI;
    },
    step(dt) {
      // Tracers fade fast.
      for (let i = 0; i < MAX_TRACERS; i += 1) {
        const t = tracers[i];
        if (t.life > 0) {
          t.life -= dt;
          tracerPos[i * 6] = t.x1; tracerPos[i * 6 + 1] = t.y1; tracerPos[i * 6 + 2] = t.z1;
          tracerPos[i * 6 + 3] = t.x2; tracerPos[i * 6 + 4] = t.y2; tracerPos[i * 6 + 5] = t.z2;
        } else {
          tracerPos[i * 6 + 1] = -100;
          tracerPos[i * 6 + 4] = -100;
        }
      }
      tracerGeo.attributes.position.needsUpdate = true;
      tracerMat.opacity = 0.9;
      // Particles integrate.
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy += p.grav * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.02 && p.grav < 0) { p.y = 0.02; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
          const f = Math.max(0, p.life / p.max);
          pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
          const fade = p.grow > 0 ? 0.35 + 0.4 * (1 - f) : f;
          pCol[i * 3] = p.r * fade; pCol[i * 3 + 1] = p.g * fade; pCol[i * 3 + 2] = p.b * fade;
        } else {
          pPos[i * 3 + 1] = -100;
          pCol[i * 3] = 0; pCol[i * 3 + 1] = 0; pCol[i * 3 + 2] = 0;
        }
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
      if (flashMat.opacity > 0) {
        flashMat.opacity = Math.max(0, flashMat.opacity - dt * 9);
        if (flashMat.opacity === 0) flashQuad.visible = false;
      }
    },
  };
}

// Viewmodel: a low-poly gun built from boxes, parented to the camera. It bobs
// with movement, kicks on fire and dips while reloading — all cheap transforms.
export function createViewmodel(camera, scene) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.7 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.5), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.36);
  const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.09), grip);
  gripMesh.position.set(0, -0.13, 0.12);
  gripMesh.rotation.x = 0.25;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), metal);
  mag.position.set(0, -0.12, -0.05);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accent);
  sight.position.set(0, 0.08, -0.1);
  group.add(body, barrel, gripMesh, mag, sight);
  group.position.set(0.24, -0.22, -0.45);
  camera.add(group);
  scene.add(camera);

  let bobPhase = 0;
  let kick = 0;
  let reloadDip = 0;
  return {
    group,
    kick(amount) { kick = Math.min(0.09, kick + amount); },
    setReloading(value) { reloadDip = value ? 1 : 0; },
    step(dt, speed, firing, reloading) {
      bobPhase += dt * (4 + speed * 1.6);
      const bob = Math.min(1, speed / 5) * 0.011;
      kick = Math.max(0, kick - dt * 0.55);
      const dipTarget = reloading ? 1 : 0;
      reloadDip += (dipTarget - reloadDip) * Math.min(1, dt * 8);
      group.position.set(
        0.24 + Math.sin(bobPhase) * bob,
        -0.22 + Math.abs(Math.cos(bobPhase)) * bob * 0.8 - reloadDip * 0.12,
        -0.45 + kick,
      );
      group.rotation.x = kick * 2.2 + reloadDip * 0.5;
      group.rotation.z = Math.sin(bobPhase) * bob * 0.4;
    },
  };
}
