// Blast visuals: an HDR fireball that swells and fades, a ground shockwave
// ring, a flash of light, plus particle bursts and a scorch splat.
import * as THREE from 'three';

export class Explosions {
  constructor(scene, fx, burnMap) {
    this.scene = scene;
    this.fx = fx;
    this.burnMap = burnMap;
    this.items = [];
    this.ballGeo = new THREE.IcosahedronGeometry(1, 2);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.light = new THREE.PointLight(0xffa050, 0, 50, 1.4);
    scene.add(this.light);
    this.lightT = 0;
  }

  spawn(x, z, radius, { color = 0xffa040, steam = false } = {}) {
    const ballMat = new THREE.MeshBasicMaterial({
      color: steam ? 0xe8f4ff : color,
      transparent: true,
      blending: steam ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    ballMat.color.multiplyScalar(steam ? 1 : 3.2);
    const ball = new THREE.Mesh(this.ballGeo, ballMat);
    ball.position.set(x, radius * 0.25, z);
    ball.renderOrder = 13;
    const ringMat = new THREE.MeshBasicMaterial({
      color: steam ? 0xffffff : 0xffc080,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ringMat.color.multiplyScalar(steam ? 0.8 : 2.2);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(x, 0.15, z);
    ring.renderOrder = 13;
    this.scene.add(ball, ring);
    this.items.push({ ball, ring, t: 0, dur: 0.9, radius, steam });
    const s = Math.max(0.4, radius * 0.22);
    if (steam) {
      this.fx.steam(x, radius * 0.2, z, s * 2.2, 40);
    } else {
      this.fx.burst(x, 0.3, z, s, Math.min(90, 26 + radius * 2));
      this.burnMap.add(x, z, radius * 0.9, 1, 1);
    }
    this.light.position.set(x, radius * 0.6 + 1, z);
    this.light.distance = radius * 6 + 10;
    this.light.intensity = steam ? 0 : 40 + radius * radius * 4;
    this.light.color.set(steam ? 0xffffff : 0xffa050);
    this.lightT = 0.5;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt / it.dur;
      const t = it.t;
      if (t >= 1) {
        this.scene.remove(it.ball, it.ring);
        it.ball.material.dispose();
        it.ring.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      it.ball.scale.setScalar(it.radius * (0.25 + e * 0.75));
      it.ball.material.opacity = (1 - t) * (it.steam ? 0.7 : 1);
      it.ring.scale.setScalar(it.radius * (0.2 + e * 1.5));
      it.ring.material.opacity = (1 - t) * 0.8;
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.exp(-dt * 7);
      if (this.lightT <= 0) this.light.intensity = 0;
    }
  }
}
