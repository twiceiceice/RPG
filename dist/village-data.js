export const VILLAGE = Object.freeze({ name:'솔바람 마을', x:26, z:15, halfX:15, halfZ:13, entry:{x:20,z:14}, interactionRange:2.9 });
export function inVillage(x,z,margin=0) { return Math.abs(x-VILLAGE.x)<=VILLAGE.halfX+margin && Math.abs(z-VILLAGE.z)<=VILLAGE.halfZ+margin; }
export function villageGroundBlend(x,z) {
  const edge=Math.max(Math.abs(x-VILLAGE.x)-VILLAGE.halfX,Math.abs(z-VILLAGE.z)-VILLAGE.halfZ);
  const t=Math.max(0,Math.min(1,edge/4)); return t*t*(3-2*t);
}
export const RESIDENTS = [
  {id:'mira',name:'미라',role:'목재 상인',x:20,z:11.6,color:0xc9904f,hat:0x775239,heading:0,shop:true,hello:'잘 마른 나무는 언제든 환영이야. 들판에서 모은 목재를 가져오면 골드로 바꿔 줄게.'},
  {id:'nari',name:'나리',role:'약초상',x:32,z:11.6,color:0x648c65,hat:0xe6cf9c,heading:0,shop:true,hello:'다시 모험을 떠나기 전에 물약을 챙겨요. H 키로 마시면 체력을 45 회복할 수 있어요.'},
  {id:'doyun',name:'도윤',role:'대장장이',x:34.1,z:19.6,color:0x586c83,hat:0x493d35,heading:Math.PI,shop:true,hello:'잘 만든 갑옷은 든든하지. 한 단계 보강할 때마다 받는 피해가 2씩 줄어들어. 세 번까지 맡겨 줘.'},
  {id:'bori',name:'보리',role:'여관 주인',x:24,z:21.6,color:0xa96c65,hat:0x513d36,heading:Math.PI,shop:true,hello:'어서 와요. 따뜻한 식사와 잠깐의 휴식이면 다시 기운이 날 거예요. 마을 안에서는 편히 쉬세요.'},
  {id:'jun',name:'준',role:'마을 주민',x:18,z:17,color:0xbaa75e,hat:0x6c4d32,heading:0,hello:'이 동네는 나무 향이 참 좋아. 벌목하다 얻은 목재는 미라에게 가져가 봐! 슬라임을 잡아도 골드를 얻을 수 있어.',route:[[18,17],[20,19],[24,18.5],[23,13.5]]},
  {id:'hari',name:'하리',role:'마을 경비',x:13,z:12,color:0x637c81,hat:0x485b62,heading:-Math.PI/2,hello:'솔바람 마을에 온 걸 환영해. 여기서는 무기를 쉬게 해도 좋아. 들판으로 돌아가려면 서쪽 문을 따라가면 돼.',route:[[13,12],[13,19],[17,19],[17,13]]},
];
