export const FIELD = {name:'천둥잠 분지',travelLabel:'천둥잠 분지로 이동',x:-32,z:15,radius:18,leash:25,entry:{x:-19,z:15},bossName:'폭풍뿔 바르칸',health:2400};
export const VARKAN_RULES = Object.freeze({armorReduction:.25,exposure:8,burnDamage:10});
export const STONES = [
  {id:'east',name:'동쪽 공명석',x:-24,z:15},
  {id:'north',name:'북쪽 공명석',x:-36,z:8.1},
  {id:'south',name:'남쪽 공명석',x:-36,z:21.9},
];
export const FIELD_PATTERNS = {
  sweep:{name:'뿔 휩쓸기',hint:'앞쪽 부채꼴 밖으로 · 옆과 뒤가 안전해요',windup:2.2,damage:20},
  brand:{name:'번개 낙인',hint:'낙인을 가장자리로 옮기고, 원이 멈추면 벗어나세요',windup:4,damage:20},
  pulse:{name:'울림의 파동',hint:'안쪽 폭발 → 터진 안쪽으로 이동 · 바깥 고리가 이어져요',windup:3.9,damage:22},
  resonance:{name:'공명석 과부하',hint:'빛나는 공명석에 내 번개 원을 겹치세요 · 원이 멈추면 빠져나오세요',windup:6.3,damage:20},
};
export const FIRST_HUNT_REWARD = {gold:80,timber:12,stone:8,roof:4};
export const REPEAT_HUNT_REWARD = {gold:12,timber:0,stone:2,roof:0};
export const newHuntQuest = () => ({accepted:false,clears:0,rewardClaimed:false,bestTime:null});

export const MIRROR_FIELD = {name:'월영 회랑',travelLabel:'월영 회랑으로 이동',x:-18,z:-36,radius:17,leash:24,entry:{x:-5,z:-36},bossName:'거울 마녀 리세아',health:2200};
export const MIRROR_PILLARS = [
  {id:'west',x:-25,z:-36}, {id:'north',x:-14.5,z:-42.06}, {id:'south',x:-14.5,z:-29.94},
];
export const MIRROR_PATTERNS = {
  curtain:{name:'접히는 장막',hint:'보라색 띠 사이의 빈 통로로 이동하세요',windup:3.5,damage:14},
  gaze:{name:'만월의 응시',hint:'검은 기둥 뒤로! 리세아와 나 사이에 기둥을 두세요',windup:4.5,damage:18},
  waltz:{name:'시계바늘 왈츠',hint:'회전 방향으로 함께 이동 · 보라색 광선에 닿지 마세요',windup:7.2,damage:10},
  masquerade:{name:'거울무도회',hint:'검은 그림자가 있는 분신을 공격하세요 · 점선 원은 가짜',windup:16,damage:18},
  shard:{name:'깨진 거울',hint:'가짜 분신! 남은 파편의 원을 벗어나세요',windup:1.6,damage:12},
};
export const HUNTS = {
  varkan:{id:'varkan',...FIELD,shortName:'바르칸',title:'잠든 폭풍을 깨우다',questTitle:'서쪽의 이상 기후 조사',startLabel:'바르칸 깨우기',intro:'서쪽 고분에 번개가 내리기 시작했다. 돌갑옷 아래 잠든 야수를 찾아, 번개를 공명석에 유도하고 드러난 약점을 노리자.',guideTitle:'번개로 돌갑옷을 깨세요',guide:[['뿔 휩쓸기','앞쪽 부채꼴을 피해 옆과 뒤에서 공격.'],['번개 낙인','따라오는 원을 가장자리로 유도. 원이 멈추면 벗어나기. 보라색 잔류 번개도 매초 피해를 주니 계속 피하기.'],['울림의 파동','안쪽이 먼저 폭발. 터진 안쪽으로 들어가 바깥 고리 피하기.'],['공명석 과부하','평소 돌갑옷으로 받는 피해 25% 감소. 빛나는 공명석에 번개 원을 겹치면 갑옷이 깨지고 8초간 받는 피해 +40%.']],exposure:VARKAN_RULES.exposure,firstReward:FIRST_HUNT_REWARD,repeatReward:REPEAT_HUNT_REWARD},
  lysea:{id:'lysea',...MIRROR_FIELD,shortName:'리세아',title:'거울 뒤의 진짜 얼굴',questTitle:'월영 회랑의 실종된 그림자',startLabel:'리세아에게 도전',intro:'북서쪽 회랑에 달빛을 닮은 가면이 떠돈다. 검은 기둥으로 마녀의 시선을 끊고, 거울 속에서 유일하게 그림자를 가진 진짜를 찾아라.',guideTitle:'숨고, 움직이고, 진짜를 찾으세요',guide:[['접히는 장막','일직선의 띠가 순서대로 폭발. 띠 사이 빈 통로에 서기.'],['만월의 응시','검은 기둥 뒤 청록색 구역에 숨기. 리세아와 나 사이에 기둥이 있어야 안전.'],['시계바늘 왈츠','2.4초 예고 뒤 광선이 회전. 화살표 방향으로 함께 이동.'],['거울무도회','검은 그림자가 있는 분신을 직접 공격. 점선 원의 가짜는 파편을 남김. 성공하면 본체가 7초간 약점 노출.']],exposure:7,firstReward:{gold:90,timber:6,stone:12,roof:6},repeatReward:{gold:14,timber:0,stone:2,roof:0}},
};
