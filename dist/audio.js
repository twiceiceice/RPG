// Original, procedural sounds. No audio downloads or third-party music requests.
export class GameAudio{
  constructor(storage=null){
    this.storage=storage;this.settings={enabled:true,music:.22,effects:.55};this.context=null;this.playing=false;this.nextBeat=0;this.beat=0;this.last={};this.available=true;
    try{const s=JSON.parse(storage?.getItem('windfield-audio-v1')??'null');if(s){if(typeof s.enabled==='boolean')this.settings.enabled=s.enabled;for(const k of ['music','effects'])if(Number.isFinite(s[k]))this.settings[k]=Math.max(0,Math.min(1,s[k]));}}catch{/* Audio preferences are optional. */}
  }
  async unlock(){
    try{
      if(!this.context){
        const Audio=window.AudioContext??window.webkitAudioContext;if(!Audio){this.available=false;return;}
        const c=this.context=new Audio(),compressor=c.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=5;compressor.connect(c.destination);
        this.master=c.createGain();this.master.gain.value=.65;this.master.connect(compressor);
        this.music=c.createGain();this.effects=c.createGain();this.music.connect(this.master);this.effects.connect(this.master);
        this.noise=c.createBuffer(1,c.sampleRate*.6,c.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
        this.timer=setInterval(()=>this.schedule(),100);
      }
      if(this.context.state==='suspended')await this.context.resume();this.apply();
    }catch{this.available=false;}
  }
  setPlaying(value){this.playing=value;this.apply();}
  set(key,value){if(key==='enabled')this.settings.enabled=!!value;else if(['music','effects'].includes(key)&&Number.isFinite(value))this.settings[key]=Math.max(0,Math.min(1,value));this.apply();try{this.storage?.setItem('windfield-audio-v1',JSON.stringify(this.settings));}catch{}}
  apply(){if(!this.context)return;const c=this.context,active=this.playing&&this.settings.enabled&&!document.hidden;this.music.gain.setTargetAtTime(active?this.settings.music:0,c.currentTime,.06);this.effects.gain.setTargetAtTime(active?this.settings.effects:0,c.currentTime,.035);if(!active)this.nextBeat=0;}
  tone(freq,start,duration,volume=.1,type='sine',bus=this.effects,end=freq){
    const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,start);osc.frequency.exponentialRampToValueAtTime(Math.max(25,end),start+duration);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(bus);osc.start(start);osc.stop(start+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  noiseSound(start,duration,volume,frequency,end=frequency){const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(frequency,start);filter.frequency.exponentialRampToValueAtTime(end,start+duration);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);source.connect(filter);filter.connect(gain);gain.connect(this.effects);source.start(start);source.stop(start+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};}
  schedule(){
    if(!this.context||this.context.state!=='running'||!this.playing||!this.settings.enabled||document.hidden)return;
    const c=this.context,step=60/84/2;if(!this.nextBeat||this.nextBeat<c.currentTime-.5)this.nextBeat=c.currentTime+.06;
    // A quiet 16-bar pentatonic phrase with space between plucked notes.
    const melody=[69,null,72,76,null,74,72,null,67,null,71,74,null,72,71,null,65,null,69,72,null,76,74,null,67,null,71,74,72,null,69,null];
    const roots=[45,43,41,43];
    while(this.nextBeat<c.currentTime+.22){const t=this.nextBeat,b=this.beat%128,n=melody[b%32],freq=m=>440*2**((m-69)/12);
      if(n!==null){this.tone(freq(n+(b>=64?-12:0)),t,.65,.12,'triangle',this.music);this.tone(freq(n+12),t,.32,.018,'sine',this.music);}
      if(b%8===0){const root=roots[Math.floor(b/8)%4];this.tone(freq(root),t,2.6,.10,'sine',this.music);this.tone(freq(root+7),t+.03,2.2,.035,'sine',this.music);}
      this.beat++;this.nextBeat+=step;
    }
  }
  event(event){
    if(!this.context||this.context.state!=='running'||!this.playing||!this.settings.enabled||document.hidden)return;
    const t=this.context.currentTime,skill=event.skill,type=event.type;
    const group=type==='hit'?'hit':type;if(t-(this.last[group]??-100)<(type==='hit'?.075:.025))return;this.last[group]=t;
    if(type==='warrior-start'){
      if(skill==='charge'){this.noiseSound(t,.34,.22,350,1900);this.tone(150,t,.24,.16,'triangle',this.effects,75);}
      if(skill==='slam')this.noiseSound(t+.25,.33,.18,500,1700);
      if(skill==='kick')this.noiseSound(t+.08,.28,.22,1800,320);
      if(skill==='sweep')this.noiseSound(t+.70,.40,.37,600,2500);
      if(skill==='slash')this.noiseSound(t+.1,.2,.20,2100,550);
      if(skill==='spin')this.tone(180,t,.5,.18,'triangle',this.effects,420);
    }else if(type==='swing')this.noiseSound(t,.21,.23,2300,600);
    else if(type==='warrior-impact'){if(skill==='slam'){this.tone(115,t,.38,.42,'sine',this.effects,30);this.noiseSound(t,.28,.38,450,80);}else if(skill==='kick'){this.tone(120,t,.22,.28,'triangle',this.effects,40);this.noiseSound(t,.16,.26,700,150);}else if(skill==='sweep'){this.tone(165,t,.24,.25,'triangle',this.effects,50);this.noiseSound(t,.26,.24,1600,300);}}
    else if(type==='shoot'){this.tone(520,t,.16,.23,'triangle',this.effects,130);this.noiseSound(t,.12,.12,3500,1200);}
    else if(type==='hit'&&event.source!=='ally'){this.noiseSound(t,.11,.14,event.kind==='tree'?450:900,150);if(event.critical)this.tone(1100,t,.18,.12,'triangle',this.effects,440);}
    else if(type==='spin-pulse')this.noiseSound(t,.20,.19,event.stage===2?1400:900,350);
    else if(type==='hurt')this.tone(95,t,.20,.24,'triangle',this.effects,40);
    else if(type==='tree-felled'){this.noiseSound(t,.5,.3,650,90);this.tone(110,t,.45,.15,'triangle',this.effects,35);}
    else if(type==='level-up'||type==='ultimate-ready'){[0,4,7,12].forEach((n,i)=>this.tone(440*2**(n/12),t+i*.11,.40,.12,'sine'));}
    else if(type==='build-place'||type==='build-remove'){this.noiseSound(t,.1,.17,350,150);this.tone(type==='build-place'?220:160,t,.12,.13,'triangle');}
    else if(type==='talent')this.tone(660,t,.23,.15,'sine',this.effects,880);
  }
  state(){return {...this.settings,available:this.available,unlocked:!!this.context,contextState:this.context?.state??'locked',playing:this.playing};}
  dispose(){clearInterval(this.timer);void this.context?.close();}
}
