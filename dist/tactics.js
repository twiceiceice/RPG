import {BATTLE} from './battle-rules.js';

export class Tactics {
  constructor(combat){this.combat=combat;this.reset();}
  reset(){this.dodge=null;this.battlecry=0;this.stagger=0;this.cooldowns={evade:0,battlecry:0};this.executions={evade:0,battlecry:0};this.dodged=0;}
  get busy(){return !!this.dodge||this.stagger>0;}
  get invulnerable(){return !!this.dodge&&this.dodge.elapsed<BATTLE.evade.invulnerable;}
  reason(id,player){
    if(!Object.hasOwn(this.cooldowns,id))return '알 수 없는 전투 기술이에요.';
    if(this.combat.hp<=0)return '먼저 다시 일어나 주세요.';
    if(this.cooldowns[id]>0)return `${BATTLE[id].name} 재사용까지 ${this.cooldowns[id].toFixed(1)}초`;
    if(id==='battlecry'&&this.combat.village?.isSafe(player))return '마을 밖이나 습격 중에 사용할 수 있어요.';
    if(this.busy)return '회피와 경직이 끝나면 사용할 수 있어요.';
    if(id==='evade'&&!player.grounded)return '땅에 발을 딛은 뒤 회피해 주세요.';
    return null;
  }
  request(id,player,direction){
    const reason=this.reason(id,player);if(reason)return {accepted:false,reason};
    this.cooldowns[id]=BATTLE[id].cooldown;this.executions[id]++;
    if(id==='evade'){
      const length=Math.hypot(direction.x,direction.z)||1;
      this.dodge={elapsed:0,dx:direction.x/length,dz:direction.z/length};
      this.combat.warrior.cancel();this.combat.cancelDraw();this.combat.swing=0;this.combat.autoMelee.targetId=null;
      player.vx=player.vz=0;player.jumpBuffer=0;
    }else this.battlecry=BATTLE.battlecry.duration;
    this.combat.events.push({type:id,x:player.x,y:player.y,z:player.z});
    return {accepted:true};
  }
  movement(input){if(this.dodge)input.forcedVelocity={x:this.dodge.dx*BATTLE.evade.speed,z:this.dodge.dz*BATTLE.evade.speed};else if(this.stagger>0)input.forcedVelocity={x:0,z:0};}
  update(dt){
    for(const id in this.cooldowns)this.cooldowns[id]=Math.max(0,this.cooldowns[id]-dt);
    this.battlecry=Math.max(0,this.battlecry-dt);this.stagger=Math.max(0,this.stagger-dt);
    if(this.dodge){this.dodge.elapsed+=dt;if(this.dodge.elapsed>=BATTLE.evade.duration)this.dodge=null;}
    if(this.combat.hp<=0){this.dodge=null;this.battlecry=0;this.stagger=0;}
  }
  state(){return {evading:!!this.dodge,invulnerable:this.invulnerable,stagger:+this.stagger.toFixed(2),battlecry:+this.battlecry.toFixed(2),cooldowns:Object.fromEntries(Object.entries(this.cooldowns).map(([k,v])=>[k,+v.toFixed(2)])),executions:{...this.executions},dodged:this.dodged};}
}
