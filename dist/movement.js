// Units are metres and seconds. Rendering and input are deliberately separate.
import { villageGroundBlend } from './village-data.js';
export const WORLD_RADIUS = 70;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_HEIGHT = 1.85;
export function terrainHeight(x, z) {
  const outside = Math.min(1, Math.max(0, (Math.hypot(x, z) - 15) / 24));
  return (Math.sin(x * .075) * 1.8 + Math.cos(z * .085) * 1.3 + Math.sin((x + z) * .13) * .55) * outside * villageGroundBlend(x,z);
}
export function overlaps(x, z, box, radius = PLAYER_RADIUS) {
  const px = Math.max(box.minX, Math.min(x, box.maxX));
  const pz = Math.max(box.minZ, Math.min(z, box.maxZ));
  return Math.hypot(x - px, z - pz) < radius;
}
export class Movement {
  constructor(colliders = []) { this.colliders = colliders; this.reset(); }
  reset() {
    this.x = 0; this.z = 8; this.y = terrainHeight(0, 8);
    this.vx = this.vz = this.vy = 0; this.grounded = true;
    this.coyote = .1; this.jumpBuffer = 0; this.travelled = 0;
  }
  jump() { this.jumpBuffer = .14; }
  moveAxis(axis, amount) {
    this[axis] += amount;
    for (const box of this.colliders) {
      if (box.active === false) continue;
      if (this.y >= box.top - .04 || this.y + PLAYER_HEIGHT <= box.bottom + .01) continue;
      if (!overlaps(this.x, this.z, box)) continue;
      if (this.grounded && box.top - this.y <= .26) { this.y = box.top; continue; }
      if (axis === 'x') {
        const dz = this.z - Math.max(box.minZ, Math.min(this.z, box.maxZ));
        const reach = Math.sqrt(Math.max(0, PLAYER_RADIUS ** 2 - dz ** 2));
        this.x = amount > 0 ? box.minX - reach : box.maxX + reach;
        this.vx = 0;
      } else {
        const dx = this.x - Math.max(box.minX, Math.min(this.x, box.maxX));
        const reach = Math.sqrt(Math.max(0, PLAYER_RADIUS ** 2 - dx ** 2));
        this.z = amount > 0 ? box.minZ - reach : box.maxZ + reach;
        this.vz = 0;
      }
    }
  }
  update(dt, input) {
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? .1 : Math.max(0, this.coyote - dt);
    const magnitude = Math.hypot(input.x, input.z);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const speed = input.sprint ? 8.6 : 4.7;
    const blend = 1 - Math.exp(-(this.grounded ? 18 : 7) * dt);
    if (input.forcedVelocity) {
      this.vx = input.forcedVelocity.x; this.vz = input.forcedVelocity.z; this.jumpBuffer = 0;
    } else {
      this.vx += (input.x * scale * speed - this.vx) * blend;
      this.vz += (input.z * scale * speed - this.vz) * blend;
    }
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = 8.2; this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
    }
    const oldX = this.x, oldZ = this.z, oldY = this.y;
    if (Math.abs(this.vx) > .0001) this.moveAxis('x', this.vx * dt);
    if (Math.abs(this.vz) > .0001) this.moveAxis('z', this.vz * dt);
    const distance = Math.hypot(this.x, this.z);
    if (distance > WORLD_RADIUS) { this.x *= WORLD_RADIUS / distance; this.z *= WORLD_RADIUS / distance; }
    this.travelled += Math.hypot(this.x - oldX, this.z - oldZ);
    this.vy -= 22 * dt;
    let nextY = this.y + this.vy * dt;
    let floor = terrainHeight(this.x, this.z);
    for (const box of this.colliders) {
      if (box.active === false) continue;
      if (!overlaps(this.x, this.z, box, PLAYER_RADIUS * .92)) continue;
      if (this.vy <= 0 && this.y >= box.top - .06) floor = Math.max(floor, box.top);
      if (this.vy > 0 && oldY + PLAYER_HEIGHT <= box.bottom && nextY + PLAYER_HEIGHT >= box.bottom) {
        nextY = box.bottom - PLAYER_HEIGHT; this.vy = 0;
      }
    }
    if (nextY <= floor || (this.grounded && this.vy <= 0 && nextY - floor < .23)) {
      this.y = floor; this.vy = 0; this.grounded = true;
    } else { this.y = nextY; this.grounded = false; }
    if (!Number.isFinite(this.y) || this.y < -20) this.reset();
  }
}
