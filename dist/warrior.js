import { terrainHeight } from './movement.js';
import { KickPower } from './kick-power.js';

export const SPIN = Object.freeze({ duration: 2.5, maxDuration: 4, interval: .25, radius: 3.2, pullRadius: 6, pullSpeed: 6, damage: 8, empoweredDamage: 10, criticalExtension: .25, killExtension: .5 });
const comboOrder = ['charge', 'slam', 'kick', 'sweep'];
const aimsOnStart = id => id === 'kick' || id === 'sweep';
export const WARRIOR_SKILLS = [
  { id: 'charge', key: '1', name: '돌진', detail: '전방으로 돌파', duration: .52, cooldown: 4 },
  { id: 'slam', key: '2', name: '내려찍기', detail: '날을 세워 땅에 내려찍기', duration: 1.08, cooldown: 3.5 },
  { id: 'kick', key: '3', name: '날아차기', detail: '도끼를 짚고 앞으로 날아차기', duration: 1.14, cooldown: 1.2 },
  { id: 'sweep', key: '4', name: '가로베기', detail: '도끼를 끌어와 크게 가로베기', duration: 1.65, cooldown: 1.8 },
  { id: 'spin', key: '5', name: '회전베기', detail: '4연계 적중으로 여는 궁극기', duration: SPIN.duration, cooldown: 0 },
];
const skillById = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, s]));
const followups = { charge: ['slam'], slam: ['kick', 'sweep'], kick: ['sweep'], sweep: ['spin'], slash: [], spin: [] };

export class Warrior {
  constructor(combat) {
    this.combat = combat; this.cooldowns = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, 0]));
    this.active = null; this.planted = null; this.queued = null; this.lastSkill = null;
    this.aimDirection = null;
    this.kickPower = new KickPower(); this.lastKick = null;
    this.combo = { step: 0, remaining: 0, failure: null };
    this.ultimate = { ready: false, lastSpin: null };
    this.executions = Object.fromEntries(WARRIOR_SKILLS.map(s => [s.id, 0]));
  }
  cancel(resetCooldowns = false, clearUltimate = false) {
    this.breakCombo('연계 중단');
    this.active = null; this.planted = null; this.queued = null;
    if (resetCooldowns || clearUltimate) this.ultimate.ready = false;
    if (resetCooldowns) { for (const id in this.cooldowns) this.cooldowns[id] = 0; this.lastKick = null; this.ultimate.lastSpin = null; this.combo.failure = null; }
  }
  reason(id, player) {
    if(this.combat.village?.isSafe(player))return '마을에서는 무기를 쉬게 해 주세요. 서쪽 문을 나가면 전투할 수 있어요.';
    if (!skillById[id]) return '알 수 없는 기술이에요.';
    if (this.combat.hp <= 0) return '먼저 다시 일어나 주세요.';
    if (this.combat.weapon !== 'axe') return 'Z 키로 양손 도끼를 들어 주세요.';
    if (!player.grounded) return '땅에 발을 딛은 뒤 사용해 주세요.';
    if (id === 'spin' && !this.ultimate.ready) return '1 → 2 → 3 → 4를 모두 적중시키면 회전베기가 열려요.';
    if (this.cooldowns[id] > 0) return `${skillById[id].name} 재사용까지 ${this.cooldowns[id].toFixed(1)}초`;
    if (this.combat.cooldown > 0 && !this.combat.autoAttackRecovery) return '기본 공격이 끝나면 사용할 수 있어요.';
    if (['kick', 'sweep'].includes(id) && !this.planted) return '2번 내려찍기로 먼저 도끼를 박아 주세요.';
    if (id === 'kick' && this.planted?.kicked) return '4번 가로베기로 도끼를 뽑아 마무리하세요.';
    if (['charge', 'slam'].includes(id) && this.planted) return '4번 가로베기로 도끼를 먼저 뽑아 주세요.';
    return null;
  }
  request(id, player, direction) {
    if(this.combat.village?.isSafe(player))return {accepted:false,reason:this.reason(id,player)};
    if (!skillById[id]) return { accepted: false, reason: '알 수 없는 기술이에요.' };
    this.setAim(direction);
    // A deliberate skill takes priority over an automatic swing, even mid-swing.
    if (this.active?.id === 'slash' && this.active.automatic) {
      const reason = this.reason(id, player);
      if (reason) return { accepted: false, reason };
      this.active = null; this.combat.cooldown = 0; this.combat.autoAttackRecovery = false;
      this.start(id, player, direction); return { accepted: true, queued: false };
    }
    if (this.active) {
      if (this.combat.hp > 0 && !this.queued && followups[this.active.id].includes(id) && this.cooldowns[id] === 0 && (id !== 'spin' || this.ultimate.ready)) {
        this.queued = { id, direction: { ...direction } };
        return { accepted: true, queued: true };
      }
      return { accepted: false, reason: this.queued ? '다음 기술이 이미 예약되어 있어요.' : '현재 동작이 끝나면 사용할 수 있어요.' };
    }
    const reason = this.reason(id, player);
    if (reason) return { accepted: false, reason };
    if (this.combat.autoAttackRecovery) { this.combat.cooldown = 0; this.combat.autoAttackRecovery = false; }
    this.start(id, player, direction); return { accepted: true, queued: false };
  }
  setAim(direction) {
    const length = Math.hypot(direction.x,direction.z);
    if (Number.isFinite(length) && length > 1e-6) this.aimDirection = { x:direction.x/length,z:direction.z/length };
  }
  facing() {
    if (this.active) return { x:this.active.dx,z:this.active.dz };
    if (this.planted) return this.planted.facing ?? { x:this.planted.dx,z:this.planted.dz };
    return null;
  }
  start(id, player, direction) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    const facing = this.planted && !aimsOnStart(id) ? { x: this.planted.dx, z: this.planted.dz } : { x: direction.x / length, z: direction.z / length };
    const skill = skillById[id];
    this.active = { id, elapsed: 0, duration: skill?.duration ?? .58, dx: facing.x, dz: facing.z, hit: false, hitIds: new Set(), stopped: false,
      origin: { x: player.x, y: player.y, z: player.z }, launched: false, kickPower: null,
      anchor: this.planted ? { ...this.planted } : null };
    // Keep the axe's world anchor intact while the warrior turns for a follow-up.
    if (this.planted && aimsOnStart(id)) this.planted.facing = { ...facing };
    if (id === 'spin') {
      this.active.duration+=this.combat.progression?.bonuses.spinDuration??0;
      this.ultimate.ready = false; this.planted = null; this.combo = { step: 0, remaining: 0, failure: null };
      Object.assign(this.active, { stage: 1, nextPulse: SPIN.interval, streak: 0, pulses: 0, hits: 0, criticalPulses: 0, kills: 0, extended: 0 });
      this.ultimate.lastSpin = null;
    } else if (comboOrder.includes(id) && !this.ultimate.ready) {
      if (id === 'charge') this.combo = { step: 0, remaining: 0, failure: null };
      this.active.comboEligible = id === comboOrder[this.combo.step];
      if (this.active.comboEligible) this.combo.remaining = 0;
      else this.breakCombo('기술 순서가 바뀌었어요');
    }
    this.lastSkill = id;
    if (skill) { this.cooldowns[id] = skill.cooldown; this.executions[id]++; }
    player.vx = player.vz = 0; player.jumpBuffer = 0;
    this.combat.events.push({ type: 'warrior-start', skill: id, x: player.x, y: player.y, z: player.z, dx: facing.x, dz: facing.z });
  }
  breakCombo(reason) {
    const hadProgress = (this.combo.step > 0 || this.active?.comboEligible) && !this.ultimate.ready;
    this.combo.step = 0; this.combo.remaining = 0;
    if (hadProgress) { this.combo.failure = reason; this.combat.events.push({ type: 'combo-break', reason }); }
  }
  recordComboHit() {
    const a = this.active;
    if (!a.comboEligible || a.comboCounted || this.ultimate.ready) return;
    a.comboCounted = true; this.combo.step++; this.combo.failure = null;
    if (this.combo.step === comboOrder.length) {
      this.ultimate.ready = true; this.combo.remaining = 0;
      this.combat.events.push({ type: 'ultimate-ready' });
    }
  }
  spinTargets(player, radius) {
    return this.combat.targets().filter(e => e.alive && Math.hypot(e.x-player.x,e.z-player.z) <= radius+e.radius
      && Math.abs(e.y+e.hop-player.y) < 1.8
      && this.combat.unobstructed({x:player.x,y:player.y+.9,z:player.z},{x:e.x,y:e.y+e.hop+.6,z:e.z},e.collider));
  }
  updateSpin(dt, player) {
    const a = this.active, combat = this.combat;
    if (a.stage === 2) for (const e of this.spinTargets(player, SPIN.pullRadius+(combat.progression?.bonuses.pullRadius??0))) {
      if(e.kind==='tree')continue;
      const dx=player.x-e.x,dz=player.z-e.z,distance=Math.hypot(dx,dz);
      const travel=Math.min(Math.max(0,distance-1.1),SPIN.pullSpeed*dt);
      const steps=Math.max(1,Math.ceil(travel/.12));
      for(let i=0;i<steps;i++) combat.moveEntity(e,dx/(distance||1)*travel/steps,dz/(distance||1)*travel/steps);
      e.knockX=e.knockZ=0;e.knockback=null;e.hop=0;e.windup=0;e.stagger=Math.max(e.stagger,dt+.02);e.recovery=Math.max(e.recovery,.15);
    }
    while (a.nextPulse <= a.elapsed + 1e-8 && a.nextPulse <= a.duration + 1e-8) {
      a.nextPulse += SPIN.interval; a.pulses++;
      const targets = this.spinTargets(player, SPIN.radius+(combat.progression?.bonuses.spinRadius??0));
      if (!targets.length) { a.streak = 0; continue; }
      const guaranteedCritical = a.streak === 2;
      let critical = false, kills = 0;
      for (const e of targets) {
        const dx=e.x-player.x,dz=e.z-player.z,length=Math.hypot(dx,dz)||1;
        const result=combat.damageEntity(e,a.stage===2?SPIN.empoweredDamage:SPIN.damage,dx/length,dz/length,{source:'spin',forceCritical:guaranteedCritical});
        critical ||= result.critical; if(result.killed) kills++;
        if(e.kind!=='tree'){e.knockX=e.knockZ=0;e.windup=0;e.stagger=Math.max(e.stagger,.18);}
      }
      a.hits += targets.length; a.kills += kills;
      a.streak = guaranteedCritical ? 0 : a.streak+1;
      if (guaranteedCritical && a.stage === 1) {
        a.stage=2; combat.events.push({type:'spin-stage',stage:2});
      }
      if (critical) a.criticalPulses++;
      const extension = Math.min(SPIN.maxDuration+(combat.progression?.bonuses.spinCap??0)-a.duration,(critical?SPIN.criticalExtension:0)+kills*SPIN.killExtension);
      a.duration += extension; a.extended += extension;
      combat.events.push({type:'spin-pulse',x:player.x,y:player.y,z:player.z,stage:a.stage,critical,extension});
    }
    this.ultimate.lastSpin = { stage:a.stage, duration:a.duration, hits:a.hits, criticalPulses:a.criticalPulses, kills:a.kills, extended:a.extended };
  }
  basicAttack(player, direction) {
    if(this.combat.village?.isSafe(player))return false;
    if (this.active || this.planted || this.combat.cooldown > 0 || this.combat.meleeCooldown > 1e-8 || this.combat.hp <= 0) return false;
    this.start('slash', player, direction); this.combat.cooldown = .62; this.combat.meleeCooldown = this.combat.meleeInterval; return true;
  }
  movement(input, player) {
    input.forcedVelocity = null;
    if (this.active) {
      const a = this.active;
      if (a.id === 'slash' && a.automatic) return;
      if (a.id === 'spin') {
        const length = Math.max(1, Math.hypot(input.x,input.z));
        input.forcedVelocity = { x: input.x/length*3.4, z: input.z/length*3.4 }; return;
      }
      let speed = a.id === 'charge' && a.elapsed < .36 && !a.stopped ? 27 : 0;
      if (a.id === 'kick' && a.elapsed >= .14 && a.elapsed < .66) speed = 6.2;
      if (a.id === 'sweep' && a.elapsed >= .76 && a.elapsed < 1.17) {
        speed = 4.5;
        // Keep a close kicked target in front instead of lunging through it.
        for (const e of this.spinTargets(player, 3)) {
          const x=e.x-player.x,z=e.z-player.z,forward=x*a.dx+z*a.dz,side=Math.abs(x*a.dz-z*a.dx);
          if (forward>=0 && side<1.4+e.radius) speed=Math.min(speed,Math.max(0,(forward-.9-e.radius)*12));
        }
      }
      input.forcedVelocity = { x: a.dx * speed, z: a.dz * speed };
    } else if (this.planted) {
      // Walking or jumping retrieves the axe without creating an attack.
      if (Math.hypot(input.x, input.z) > .1 || player.jumpBuffer > 0) { this.planted = null; this.breakCombo('도끼를 회수했어요'); }
      else input.forcedVelocity = { x: 0, z: 0 };
    }
  }
  hitArea(player, { x = player.x, z = player.z, radius, damage, cone = -.2, knock = 3, stagger = .3, offBalance = 0, kick = false }) {
    const a = this.active, combat = this.combat; let hits = 0;
    for (const e of combat.targets()) {
      if (!e.alive || a.hitIds.has(e.id)) continue;
      const ex = e.x - player.x, ez = e.z - player.z, distance = Math.hypot(ex, ez);
      if (Math.hypot(e.x - x, e.z - z) > radius + e.radius || Math.abs(e.y + e.hop - player.y) > 1.7) continue;
      if (distance > .15 && (ex * a.dx + ez * a.dz) / distance < cone) continue;
      if (!combat.unobstructed({ x: player.x, y: player.y + .9, z: player.z }, { x: e.x, y: e.y + .6 + e.hop, z: e.z }, e.collider)) continue;
      if (kick && !a.kickPower) {
        a.kickPower = this.kickPower.roll();
        this.lastKick = { ...a.kickPower, targetId: e.id, time: combat.time };
      }
      const context = kick ? { source: 'kick', kickPower: a.kickPower.id, powerName: a.kickPower.name } : {source:a.id};
      a.hitIds.add(e.id); combat.damageEntity(e, kick ? a.kickPower.damage : damage, a.dx, a.dz, context);
      if (offBalance > 0) combat.applyOffBalance(e, offBalance);
      if(e.kind!=='tree'){e.knockX = a.dx * knock; e.knockZ = a.dz * knock; e.stagger = stagger; e.windup = 0; e.recovery = Math.max(e.recovery, stagger);}
      if (kick) combat.launchEntity(e, a.dx, a.dz, a.kickPower);
      hits++;
    }
    if (hits) this.recordComboHit();
    return hits;
  }
  impact(player, skill, x = player.x, z = player.z) {
    const a = this.active;
    this.combat.events.push({ type: 'warrior-impact', skill, x, y: terrainHeight(x,z), z, dx: a.dx, dz: a.dz, kickPower: a.kickPower?.id, powerName: a.kickPower?.name });
  }
  update(dt, player) {
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (this.combat.hp <= 0 || this.combat.weapon !== 'axe') { this.cancel(false, this.combat.hp <= 0); return; }
    if (this.combo.remaining > 0) {
      this.combo.remaining = Math.max(0, this.combo.remaining-dt);
      if (this.combo.remaining === 0) this.breakCombo('연계 시간이 지났어요');
    }
    if (!this.active) {
      if (this.planted) { this.planted.remaining -= dt; if (this.planted.remaining <= 0) { this.planted = null; this.breakCombo('도끼를 회수했어요'); } }
      return;
    }
    const a = this.active; a.elapsed = Math.min(a.duration, a.elapsed + dt);
    if (a.id === 'spin') this.updateSpin(dt, player);
    if (a.id === 'kick') {
      if (!a.launched && a.elapsed >= .14) { a.launched = true; player.vy = 7.2; player.grounded = false; }
      if (a.elapsed >= .25 && a.elapsed <= .64) {
        const hits = this.hitArea(player, { radius: 1.65, damage: 18, cone: .12, stagger: 1.5, offBalance: 4, kick: true });
        if (hits && !a.hit) { a.hit = true; this.impact(player, 'kick', player.x + a.dx, player.z + a.dz); }
      }
      if (this.planted) { this.planted.kicked = true; this.planted.remaining = 3.4+(this.combat.progression?.bonuses.combo??0); }
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
        this.planted = { x, y: Math.max(player.y, terrainHeight(x, z)), z, dx: a.dx, dz: a.dz, remaining: 3.4+(this.combat.progression?.bonuses.combo??0), kicked: false };
        a.anchor = { ...this.planted };
        this.hitArea(player, { x, z, radius: 1.65, damage: 39, cone: -.1, knock: .6, stagger: 1.65 }); this.impact(player, 'slam', x, z);
      } else if (a.id === 'sweep') {
        this.hitArea(player, { radius: 4.3, damage: 38, cone: -.35, knock: 9, stagger: .9 }); this.impact(player, 'sweep'); this.planted = null;
      } else {
        this.hitArea(player, { radius: 2.7, damage: 24, cone: .25 }); this.impact(player, 'slash');
      }
    }
    if (a.elapsed >= a.duration) {
      if (a.comboEligible && !a.comboCounted) this.breakCombo('공격이 빗나갔어요');
      else if (a.comboCounted && !this.ultimate.ready) this.combo.remaining = 3+(this.combat.progression?.bonuses.combo??0);
      this.active = null;
      const queued = this.queued; this.queued = null;
      if (queued && !this.reason(queued.id, player)) {
        const direction = aimsOnStart(queued.id) ? this.aimDirection ?? queued.direction : queued.direction;
        this.start(queued.id, player, direction);
      }
    }
  }
  state() {
    return { class: 'warrior', activeSkill: this.active?.id ?? null, progress: this.active ? +(this.active.elapsed / this.active.duration).toFixed(3) : 0,
      facing: this.facing(),
      axePlanted: !!this.planted, followupSeconds: this.planted ? +this.planted.remaining.toFixed(2) : 0, kicked: !!this.planted?.kicked,
      axeAnchor: this.planted ? { x: +this.planted.x.toFixed(2), y: +this.planted.y.toFixed(2), z: +this.planted.z.toFixed(2) } : null,
      lastKick: this.lastKick ? { ...this.lastKick } : null,
      combo: { step: this.ultimate.ready ? 4 : this.combo.step, nextSkill: this.ultimate.ready ? null : comboOrder[this.combo.step], remaining: +this.combo.remaining.toFixed(2), failure: this.combo.failure },
      ultimate: { ready: this.ultimate.ready, active: this.active?.id==='spin', stage: this.active?.id==='spin'?this.active.stage:0,
        remaining: this.active?.id==='spin'?+(this.active.duration-this.active.elapsed).toFixed(2):0,
        streak: this.active?.id==='spin'?this.active.streak:0, lastSpin: this.ultimate.lastSpin ? {...this.ultimate.lastSpin} : null },
      queuedSkill: this.queued?.id ?? null, cooldowns: Object.fromEntries(Object.entries(this.cooldowns).map(([id, value]) => [id, +value.toFixed(2)])), executions: { ...this.executions } };
  }
}
