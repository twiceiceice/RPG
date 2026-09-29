// 54 × 44m, up from 30 × 26m. The western gate stays on the battle route.
export const VILLAGE = Object.freeze({ name:'솔바람 마을', x:38, z:15, halfX:27, halfZ:22, entry:{x:20,z:14}, interactionRange:2.9 });
export const BUILD_PLOTS=[
  {id:'sunrise',name:'햇살 터',minX:47,maxX:59,minZ:-3,maxZ:9,entry:{x:45,z:5}},
  {id:'breeze',name:'바람 터',minX:47,maxX:59,minZ:22,maxZ:34,entry:{x:45,z:26}},
  {id:'pine',name:'솔향 터',minX:28,maxX:40,minZ:-5,maxZ:5,entry:{x:34,z:7}},
];
export function plotAt(x,z){return BUILD_PLOTS.find(p=>x>=p.minX&&x<p.maxX&&z>=p.minZ&&z<p.maxZ);}
export function inVillage(x,z,margin=0) { return Math.abs(x-VILLAGE.x)<=VILLAGE.halfX+margin && Math.abs(z-VILLAGE.z)<=VILLAGE.halfZ+margin; }
export function villageGroundBlend(x,z) {
  const edge=Math.max(Math.abs(x-VILLAGE.x)-VILLAGE.halfX,Math.abs(z-VILLAGE.z)-VILLAGE.halfZ);
  const t=Math.max(0,Math.min(1,edge/4)); return t*t*(3-2*t);
}
export const BUILDING_BLOCKS = Object.freeze({
  timber:{name:'나무 블록',short:'나무',buy:2,sell:1,detail:'벽과 바닥에 어울리는 나무 자재',icon:'timber'},
  stone:{name:'돌 블록',short:'돌',buy:3,sell:1,detail:'기초와 성벽에 어울리는 돌 자재',icon:'stone'},
  roof:{name:'지붕 블록',short:'지붕',buy:4,sell:2,detail:'지붕에 어울리는 붉은 자재',icon:'roof'},
});
export const RESIDENTS = [
  {id:'mira',name:'미라',role:'목재 상인',x:20,z:7.6,color:0xc9904f,hat:0x775239,heading:0,shop:true,hello:'잘 마른 나무는 언제든 환영이야. 들판에서 모은 목재를 가져오면 골드로 바꿔 줄게.'},
  {id:'nari',name:'나리',role:'약초상',x:32,z:11.6,color:0x648c65,hat:0xe6cf9c,heading:0,shop:true,hello:'다시 모험을 떠나기 전에 물약을 챙겨요. H 키로 마시면 체력을 45 회복할 수 있어요.'},
  {id:'doyun',name:'도윤',role:'대장장이',x:36,z:25.6,color:0x586c83,hat:0x493d35,heading:Math.PI,shop:true,hello:'잘 만든 갑옷은 든든하지. 한 단계 보강할 때마다 받는 피해가 2씩 줄어들어. 세 번까지 맡겨 줘.'},
  {id:'bori',name:'보리',role:'여관 주인',x:26,z:27.6,color:0xa96c65,hat:0x513d36,heading:Math.PI,shop:true,hello:'어서 와요. 따뜻한 식사와 잠깐의 휴식이면 다시 기운이 날 거예요. 마을 안에서는 편히 쉬세요.'},
  {id:'hodu',name:'호두',role:'건축 자재상',x:16,z:26.5,color:0xb68656,hat:0x746044,heading:Math.PI,shop:true,hello:'북쪽과 동쪽의 빈 터에 집을 지어 봐! K를 누르면 건축 모드야. 여기서 블록을 사거나 목재와 교환할 수 있어. 놓은 블록은 그대로 회수할 수 있지.'},
  {id:'jun',name:'준',role:'마을 주민',x:18,z:17,color:0xbaa75e,hat:0x6c4d32,heading:0,hello:'이 동네는 나무 향이 참 좋아. 벌목하다 얻은 목재는 미라에게 가져가 봐! 슬라임을 잡아도 골드를 얻을 수 있어.',route:[[18,17],[20,19],[24,18.5],[23,13.5]]},
  {id:'hari',name:'하리',role:'마을 경비',x:13,z:12,color:0x637c81,hat:0x485b62,heading:-Math.PI/2,hello:'솔바람 마을에 온 걸 환영해. 여기서는 무기를 쉬게 해도 좋아. 들판으로 돌아가려면 서쪽 문을 따라가면 돼.',route:[[13,12],[13,19],[17,19],[17,13]]},
  {id:'daon',name:'다온',role:'방패병',x:41,z:17,color:0x557c95,hat:0x708a9a,heading:0,hello:'넓어진 마을도 함께 지켜야지. 습격이 오면 내가 앞줄에 설게. 출정에도 함께 가자!',route:[[41,17],[43,21],[42,25],[40,20]]},
  {id:'roan',name:'로안',role:'전사',x:23,z:8,color:0xb87351,hat:0x5c473a,heading:0,hello:'전투는 함께할수록 든든해. P를 눌러 특성을 골라 봐. 나는 공격에도 방어에도 자신 있어.',route:[[23,8],[25,10],[29,10],[27,8]]},
  {id:'lua',name:'루아',role:'궁수',x:43,z:10,color:0x718857,hat:0x41654b,heading:Math.PI,hello:'빈 터 사이 길에서 주변을 살피고 있어. 전투가 시작되면 뒤에서 화살로 엄호할게.',route:[[43,10],[43,5],[43,0],[43,6]]},
];
