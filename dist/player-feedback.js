// Presentation state only: this never changes health, immunity or action timing.
export class PlayerFeedback {
  constructor(health, maxHealth) { this.reset(health, maxHealth); }
  reset(health, maxHealth) {
    this.health=health;this.maxHealth=maxHealth;this.trailHealth=health;
    this.trailHold=0;this.flash=0;this.notice=null;
  }
  hit(event) {
    if(event.damage<=0)return;
    this.trailHealth=Math.max(this.trailHealth,event.healthBefore);
    this.trailHold=.6;this.flash=.52;
    this.health=event.health;this.maxHealth=event.maxHealth;
    // Regeneration leaves fractional HP; keep the readout short and never show a real hit as zero.
    const damage=Math.max(.1,Math.round(event.damage*10)/10);
    this.notice={damage,source:event.source,remaining:1.4,receiptRemaining:4};
  }
  update(dt, health, maxHealth) {
    // Healing and stat changes must not leave a false damage segment behind.
    if(health>this.health||maxHealth!==this.maxHealth){this.trailHealth=health;this.trailHold=0;}
    this.health=health;this.maxHealth=maxHealth;
    const decay=Math.max(0,dt-this.trailHold);
    this.trailHold=Math.max(0,this.trailHold-dt);
    this.trailHealth=Math.max(health,this.trailHealth-decay*maxHealth*.8);
    this.flash=Math.max(0,this.flash-dt);
    if(this.notice){
      this.notice.remaining=Math.max(0,this.notice.remaining-dt);
      this.notice.receiptRemaining=Math.max(0,this.notice.receiptRemaining-dt);
      if(this.notice.receiptRemaining===0)this.notice=null;
    }
  }
  get lowHealth(){return this.health>0&&this.health/this.maxHealth<=.3;}
}
