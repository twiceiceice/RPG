export const MAX_LEVEL=10;
export const XP_STEPS=[60,100,150,210,280,360,450,550,660];
export const XP_REWARDS={rabbit:12,slime:24,tree:18,raider:30,captain:150,defense:320,assault:420,fieldQuest:180};
export const TALENT_BRANCHES=[{id:'arms',name:'힘찬 일격',detail:'한 번의 공격을 더 묵직하게',color:'#efb16d'},{id:'defense',name:'든든한 전사',detail:'오래 버티며 마을을 지켜요',color:'#8ac5b4'},{id:'storm',name:'바람의 춤',detail:'연계를 이어 회전베기를 강화',color:'#b9b0ef'}];
export const TALENTS=[
  {id:'power',branch:'arms',row:0,name:'단단한 손아귀',icon:'✦',max:2,level:1,description:'모든 공격 피해 +6% / +12%'},
  {id:'slam',branch:'arms',row:1,name:'무거운 도끼',icon:'↓',max:2,level:3,parent:'power',description:'내려찍기 피해 +10% / +20%'},
  {id:'execute',branch:'arms',row:2,name:'마지막 일격',icon:'⚔',max:1,level:5,parent:'slam',description:'체력 30% 이하인 적에게 피해 +25%'},
  {id:'critical',branch:'arms',row:3,name:'결정타',icon:'✧',max:1,level:8,parent:'execute',description:'치명타 피해가 2배에서 2.3배로 증가'},
  {id:'vitality',branch:'defense',row:0,name:'튼튼한 몸',icon:'♥',max:2,level:1,description:'최대 체력 +12 / +24'},
  {id:'guard',branch:'defense',row:1,name:'단단한 자세',icon:'▣',max:2,level:3,parent:'vitality',description:'받는 피해 1 / 2 감소 · 갑옷과 합산'},
  {id:'recovery',branch:'defense',row:2,name:'다시 한 걸음',icon:'+',max:1,level:5,parent:'guard',description:'적 처치 시 체력 5 회복 · 주민의 처치도 인정'},
  {id:'bulwark',branch:'defense',row:3,name:'마을의 버팀목',icon:'◆',max:1,level:8,parent:'recovery',description:'최대 체력 +25 · 받는 피해 추가 8% 감소'},
  {id:'flow',branch:'storm',row:0,name:'여유로운 연계',icon:'⌁',max:2,level:1,description:'연계 대기와 도끼 고정 시간 +0.5 / +1초'},
  {id:'spin',branch:'storm',row:1,name:'거센 회전',icon:'↻',max:2,level:3,parent:'flow',description:'회전베기 피해 +10% / +20%'},
  {id:'vortex',branch:'storm',row:2,name:'넓은 소용돌이',icon:'◎',max:1,level:5,parent:'spin',description:'회전 공격 반경 +0.6m · 흡입 반경 +1.5m'},
  {id:'tempest',branch:'storm',row:3,name:'끝나지 않는 춤',icon:'✺',max:1,level:8,parent:'vortex',description:'회전 기본 시간 3초 · 연장 상한 5초'},
];
const cap=XP_STEPS.reduce((sum,n)=>sum+n,0);
export const MAGE_BRANCHES=[{id:'arms',name:'타오르는 불꽃',detail:'서리 파열과 화염구를 강화',color:'#f4af78'},{id:'defense',name:'얼음의 수호',detail:'체력과 방어를 든든하게',color:'#8acbdc'},{id:'storm',name:'원소의 흐름',detail:'표식·잔불·방벽을 강화',color:'#b9b0ef'}];
const mageNames={power:['불꽃의 이해','모든 공격 피해 +6% / +12%'],slam:['뜨거운 핵','화염구 피해 +10% / +20%'],execute:['꺼지지 않는 불씨','체력 30% 이하인 적에게 피해 +25%'],critical:['빙화 공명','서리 파열과 치명타 피해 2배 → 2.3배'],vitality:['얼음의 생명','최대 체력 +12 / +24'],guard:['결정 피부','받는 피해 1 / 2 감소 · 갑옷과 합산'],recovery:['온기의 순환','적 처치 시 체력 5 회복'],bulwark:['겨울의 수호','최대 체력 +25 · 받는 피해 추가 8% 감소'],flow:['오래 남는 서리','서리 표식 지속 +1 / +2초'],spin:['응축된 잔불','불꽃 쇄도 피해 +10% / +20%'],vortex:['겹겹의 방벽','얼음 방벽 흡수량 +15'],tempest:['깨어난 원소','원소 해방 지속 +2초']};
export const MAGE_TALENTS=TALENTS.map(t=>({...t,name:mageNames[t.id][0],description:mageNames[t.id][1]}));
export class Progression{
  constructor(combat){this.combat=combat;combat.progression=this;this.xp=0;this.classRanks={warrior:{},mage:{}};}
  get ranks(){return this.classRanks[this.combat.classId==='mage'?'mage':'warrior'];}
  set ranks(value){this.classRanks[this.combat.classId==='mage'?'mage':'warrior']=value;}
  get talents(){return this.combat.classId==='mage'?MAGE_TALENTS:TALENTS;}
  get branches(){return this.combat.classId==='mage'?MAGE_BRANCHES:TALENT_BRANCHES;}
  get level(){let xp=this.xp,level=1;for(const need of XP_STEPS){if(xp<need)break;xp-=need;level++;}return level;}
  get spent(){return Object.values(this.ranks).reduce((n,v)=>n+v,0);}
  get points(){return this.level-this.spent;}
  rank(id){return this.ranks[id]??0;}
  get bonuses(){return {damage:1+.06*this.rank('power'),slam:1+.1*this.rank('slam'),spin:1+.1*this.rank('spin'),critical:2+.3*this.rank('critical'),maxHp:100+(this.level-1)*4+this.rank('vitality')*12+this.rank('bulwark')*25,reduction:this.rank('guard'),mitigation:this.rank('bulwark')*.08,healOnKill:this.rank('recovery')*5,combo:this.rank('flow')*.5,spinRadius:this.rank('vortex')*.6,pullRadius:this.rank('vortex')*1.5,spinDuration:this.rank('tempest')*.5,spinCap:this.rank('tempest'),mageFire:1+.1*this.rank('slam'),mageFlare:1+.1*this.rank('spin'),mageFrost:this.rank('flow'),mageShield:this.rank('vortex')*15,mageSurge:this.rank('tempest')*2};}
  reason(id){const t=this.talents.find(t=>t.id===id);if(!t)return '알 수 없는 특성이에요.';if(this.rank(id)>=t.max)return '이미 끝까지 배운 특성이에요.';if(this.level<t.level)return `${t.level}레벨에 열려요.`;if(t.parent&&!this.rank(t.parent))return '바로 위 특성을 1점 이상 배워 주세요.';if(this.points<1)return '레벨을 올리면 특성 포인트를 얻어요.';return null;}
  learn(id){const reason=this.reason(id);if(reason)return {accepted:false,reason};const oldMax=this.combat.maxHp;this.ranks[id]=this.rank(id)+1;this.combat.hp=Math.min(this.combat.maxHp,this.combat.hp+this.combat.maxHp-oldMax);this.combat.village?.save();return {accepted:true,message:`${this.talents.find(t=>t.id===id).name} ${this.rank(id)}단계 습득`};}
  reset(){this.ranks={};this.combat.hp=Math.min(this.combat.hp,this.combat.maxHp);this.combat.village?.save();return {accepted:true,message:'특성을 초기화했어요. 포인트를 다시 골라 보세요.'};}
  add(source){const reward=XP_REWARDS[source]??0;if(!reward||this.level>=MAX_LEVEL)return 0;const oldLevel=this.level,amount=Math.min(reward,cap-this.xp);this.xp+=amount;this.combat.events.push({type:'xp-earned',amount});if(this.level>oldLevel){if(this.combat.hp>0)this.combat.hp=this.combat.maxHp;this.combat.events.push({type:'level-up',level:this.level,points:this.points});}this.combat.village?.save();return amount;}
  load(data){
    this.xp=Number.isFinite(data?.xp)?Math.max(0,Math.min(cap,Math.floor(data.xp))):0;const active=this.combat.classId;
    for(const [id,source] of [['warrior',data?.ranks],['mage',data?.mageRanks]]){this.combat.classId=id;this.ranks={};for(const t of this.talents){const rank=Math.min(t.max,Math.max(0,Math.floor(Number(source?.[t.id])||0)));for(let i=0;i<rank&&!this.reason(t.id);i++)this.ranks[t.id]=this.rank(t.id)+1;}}
    this.combat.classId=active;
  }
  serialize(){return {xp:this.xp,ranks:{...this.classRanks.warrior},mageRanks:{...this.classRanks.mage}};}
  state(){const level=this.level,base=XP_STEPS.slice(0,level-1).reduce((n,v)=>n+v,0);return {...this.serialize(),ranks:{...this.ranks},classId:this.combat.classId,level,maxLevel:MAX_LEVEL,points:this.points,spent:this.spent,current:level===MAX_LEVEL?0:this.xp-base,required:XP_STEPS[level-1]??0,bonuses:this.bonuses};}
}
