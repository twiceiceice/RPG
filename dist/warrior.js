import { terrainHeight } from './movement.js';
import { KickPower } from './kick-power.js';

export const WARRIOR_SKILLS = [
  { id: 'charge', key: '1', name: '돌진', detail: '전방으로 돌파', duration: .52, cooldown: 4 },
  { id: 'slam', key: '2', name: '내려찍기', detail: '날을 세워 땅에 내려찍기', duration: 1.08, cooldown: 3.5 },
  { id: 'kick', key: '3', name: '날아차기', detail: '도끼를 짚고 앞으로 날아차기', duration: 1.14, cooldown: 1.2 },
  { id: 'sweep', key: '4', name: '가로베기', detail: '도끼를 끌어와 크게 가로베기', duration: 1.65, cooldown: 1.8 },
];
const skillById = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, s]));
const followups = { charge: ['slam'], slam: ['kick', 'sweep'], kick: ['sweep'], sweep: [], slash: [] };

export class Warrior {
  constructor(combat) {
    this.combat = combat; this.cooldowns = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, 0]));
    this.active = null; this.planted = null; this.queued = null; this.lastSkill = null;
    this.kickPower = new KickPower(); this.lastKick = null;
    this.executions = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, 0]));
  }
  cancel(resetCooldowns = false) {
    this.active = null; this.planted = null; this.queued = null;
    if (resetCooldowns) { for (const id in this.cooldowns) this.cooldowns[id] = 0; this.lastKick = null; }
  }
  reason(id, player) {
    if (!skillById[id]) return '알 수 없는 기술이에요.';
    if (this.combat.hp <= 0) return '먼저 다시 일어나 주세요.';
    if (this.combat.weapon !== 'axe') return 'Z 키로 양손 도끼를 들어 주세요.';
    if (!player.grounded) return '땅에 발을 딛은 뒤 사용해 주세요.';
    if (this.cooldowns[id] > 0) return `${skillById[id].name} 재사용까지 ${this.cooldowns[id].toFixed(1)}초`;
    if (this.combat.cooldown > 0) return '기본 공격이 끝나면 사용할 수 있어요.';
    if (['kick', 'sweep'].includes(id) && !this.planted) return '2번 내려찍기로 먼저 도끼를 박아 주세요.';
    if (id === 'kick' && this.planted?.kicked) return '4번 가로베기로 도끼를 뽑아 마무리하세요.';
    if (['charge', 'slam'].includes(id) && this.planted) return '4번 가로베기로 도끼를 먼저 뽑아 주세요.';
    return null;
  }
  request(id, player, direction) {
    if (!skillById[id]) return { accepted: false, reason: '알 수 없는 기술이에요.' };
    if (this.active) {
      if (this.combat.hp > 0 && !this.queued && followups[this.active.id].includes(id) && this.cooldowns[id] === 0) {
        this.queued = { id, direction: { ...direction } };
        return { accepted: true, queued: true };
      }
      return { accepted: false, reason: this.queued ? '다음 기술이 이미 예약되어 있어요.' : '현재 동작이 끝나면 사용할 수 있어요.' };
    }
    const reason = this.reason(id, player);
    if (reason) return { accepted: false, reason };
    this.start(id, player, direction); return { accepted: true, queued: false };
  }
  start(id, player, direction) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    const facing = this.planted ? { x: this.planted.dx, z: this.planted.dz } : { x: direction.x / length, z: direction.z / length };
    const skill = skillById[id];
    this.active = { id, elapsed: 0, duration: skill?.duration ?? .58, dx: facing.x, dz: facing.z, hit: false, hitIds: new Set(), stopped: false,
      origin: { x: player.x, y: player.y, z: player.z }, launched: false, kickPower: null,
      anchor: this.planted ? { ...this.planted } : null };
    this.lastSkill = id;
    if (skill) { this.cooldowns[id] = skill.cooldown; this.executions[id]++; }
    player.vx = player.vz = 0; player.jumpBuffer = 0;
    this.combat.events.push({ type: 'warrior-start', skill: id, x: player.x, y: player.y, z: player.z, dx: facing.x, dz: facing.z });
  }
  basicAttack(player, direction) {
    if (this.active || this.planted || this.combat.cooldown > 0 || this.combat.hp <= 0) return false;
    this.start('slash', player, direction); this.combat.cooldown = .62; return true;
  }
  movement(input, player) {
    input.forcedVelocity = null;
    if (this.active) {
      const a = this.active;
      let speed = a.id === 'charge' && a.elapsed < .36 && !a.stopped ? 18 : 0;
      if (a.id === 'kick' && a.elapsed >= .14 && a.elapsed < .66) speed = 6.2;
      if (a.id === 'sweep' && a.elapsed >= .76 && a.elapsed < 1.17) speed = 4.5;
      input.forcedVelocity = { x: a.dx * speed, z: a.dz * speed };
    } else if (this.planted) {
      // Walking or jumping retrieves the axe without creating an attack.
      if (Math.hypot(input.x, input.z) > .1 || player.jumpBuffer > 0) this.planted = null;
      else input.forcedVelocity = { x: 0, z: 0 };
    }
  }
  hitArea(player, { x = player.x, z = player.z, radius, damage, cone = -.2, knock = 3, stagger = .3, offBalance = 0, kick = false }) {
    const a = this.active, combat = this.combat; let hits = 0;
    for (const e of combat.entities) {
      if (!e.alive || a.hitIds.has(e.id)) continue;
      const ex = e.x - player.x, ez = e.z - player.z, distance = Math.hypot(ex, ez);
      if (Math.hypot(e.x - x, e.z - z) > radius + e.radius || Math.abs(e.y + e.hop - player.y) > 1.7) continue;
      if (distance > .15 && (ex * a.dx + ez * a.dz) / distance < cone) continue;
      if (!combat.unobstructed({ x: player.x, y: player.y + .9, z: player.z }, { x: e.x, y: e.y + .6 + e.hop, z: e.z })) continue;
      if (kick && !a.kickPower) {
        a.kickPower = this.kickPower.roll();
        this.lastKick = { ...a.kickPower, targetId: e.id, time: combat.time };
      }
      const context = kick ? { source: 'kick', kickPower: a.kickPower.id, powerName: a.kickPower.name } : {};
      a.hitIds.add(e.id); combat.damageEntity(e, kick ? a.kickPower.damage : damage, a.dx, a.dz, context);
      if (offBalance > 0) combat.applyOffBalance(e, offBalance);
      e.knockX = a.dx * knock; e.knockZ = a.dz * knock; e.stagger = stagger; e.windup = 0; e.recovery = Math.max(e.recovery, stagger);
      if (kick) combat.launchEntity(e, a.dx, a.dz, a.kickPower);
      hits++;
    }
    return hits;
  }
  impact(player, skill, x = player.x, z = player.z) {
    const a = this.active;
    this.combat.events.push({ type: 'warrior-impact', skill, x, y: terrainHeight(x,z), z, dx: a.dx, dz: a.dz, kickPower: a.kickPower?.id, powerName: a.kickPower?.name });
  }
  update(dt, player) {
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (this.combat.hp <= 0 || this.combat.weapon !== 'axe') { this.cancel(); return; }
    if (!this.active) {
      if (this.planted) { this.planted.remaining -= dt; if (this.planted.remaining <= 0) this.planted = null; }
      return;
    }
    const a = this.active; a.elapsed = Math.min(a.duration, a.elapsed + dt);
    if (a.id === 'kick') {
      if (!a.launched && a.elapsed >= .14) { a.launched = true; player.vy = 7.2; player.grounded = false; }
      if (a.elapsed >= .25 && a.elapsed <= .64) {
        const hits = this.hitArea(player, { radius: 1.65, damage: 18, cone: .12, stagger: 1.5, offBalance: 4, kick: true });
        if (hits && !a.hit) { a.hit = true; this.impact(player, 'kick', player.x + a.dx, player.z + a.dz); }
      }
      if (this.planted) { this.planted.kicked = true; this.planted.remaining = 3.4; }
    }
    if (a.id === 'sweep' && a.elapsed >= .74) this.planted = null;
    if (a.id === 'charge' && a.elapsed < .4 && !a.stopped) {
      if (this.hitArea(player, { radius: 1.2, damage: 8, cone: .4, knock: 1, stagger: .65 })) {
        a.stopped = true; this.impact(player, 'charge');
      }
    }
    const impactTime = { slam: .64, sweep: 1.06, slash: .26 }[a.id];
    if (!a.hit && impactTime !== undefined && a.elapsed >= impactTime) {
      a.hit = true;
      if (a.id === 'slam') {
        let reach = 1.45;
        const origin = { x: player.x, y: player.y + .5, z: player.z };
        while (reach > .2 && !this.combat.unobstructed(origin, { x: player.x + a.dx * (reach+.25), y: player.y + .5, z: player.z + a.dz * (reach+.25) })) reach = Math.max(.2,reach-.15);
        const x = player.x + a.dx * reach, z = player.z + a.dz * reach;
        this.planted = { x, y: Math.max(player.y, terrainHeight(x, z)), z, dx: a.dx, dz: a.dz, remaining: 3.4, kicked: false };
        a.anchor = { ...this.planted };
        this.hitArea(player, { x, z, radius: 1.65, damage: 26, cone: -.1, knock: .6, stagger: 1.65 }); this.impact(player, 'slam', x, z);
      } else if (a.id === 'sweep') {
        this.hitArea(player, { radius: 4.3, damage: 38, cone: -.35, knock: 9, stagger: .9 }); this.impact(player, 'sweep'); this.planted = null;
      } else {
        this.hitArea(player, { radius: 2.7, damage: 24, cone: .25 }); this.impact(player, 'slash');
      }
    }
    if (a.elapsed >= a.duration) {
      this.active = null;
      const queued = this.queued; this.queued = null;
      if (queued && !this.reason(queued.id, player)) this.start(queued.id, player, queued.direction);
    }
  }
  state() {
    return { class: 'warrior', activeSkill: this.active?.id ?? null, progress: this.active ? +(this.active.elapsed / this.active.duration).toFixed(3) : 0,
      axePlanted: !!this.planted, followupSeconds: this.planted ? +this.planted.remaining.toFixed(2) : 0, kicked: !!this.planted?.kicked,
      axeAnchor: this.planted ? { x: +this.planted.x.toFixed(2), y: +this.planted.y.toFixed(2), z: +this.planted.z.toFixed(2) } : null,
      lastKick: this.lastKick ? { ...this.lastKick } : null,
      queuedSkill: this.queued?.id ?? null, cooldowns: Object.fromEntries(Object.entries(this.cooldowns).map(([id, value]) => [id, +value.toFixed(2)])), executions: { ...this.executions } };
  }
}
