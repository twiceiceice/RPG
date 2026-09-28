export const KICK_POWER = {
  light: { id: 'light', name: '약', damage: 18, distance: 3, duration: .62, lift: .28 },
  medium: { id: 'medium', name: '중', damage: 26, distance: 4.5, duration: .74, lift: .58 },
  strong: { id: 'strong', name: '강', damage: 36, distance: 6, duration: .86, lift: .95 },
};

// With chance min(1, C * attempts), the expected wait is the sum of survival
// probabilities. Solve C so the long-run rate, rather than the first roll, is p.
function incrementFor(rate) {
  let low = 0, high = rate;
  for (let iteration = 0; iteration < 48; iteration++) {
    const c = (low + high) / 2;
    let survival = 1, expectedWait = 1;
    for (let n = 1; survival > 1e-12; n++) {
      survival *= 1 - Math.min(1, c * n); expectedWait += survival;
    }
    if (1 / expectedWait < rate) low = c; else high = c;
  }
  return (low + high) / 2;
}
class PseudoRandomRoll {
  constructor(rate) { this.increment = incrementFor(rate); this.misses = 0; }
  roll(random) {
    const success = random() < Math.min(1, this.increment * (this.misses + 1));
    this.misses = success ? 0 : this.misses + 1;
    return success;
  }
}
export class KickPower {
  constructor(random = Math.random) {
    this.random = random;
    this.strong = new PseudoRandomRoll(.25);
    this.medium = new PseudoRandomRoll(.60);
  }
  // Roll once per connected kick, shared by every target of that kick.
  roll() {
    if (this.strong.roll(this.random)) return KICK_POWER.strong;
    return this.medium.roll(this.random) ? KICK_POWER.medium : KICK_POWER.light;
  }
}
