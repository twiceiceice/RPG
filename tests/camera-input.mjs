import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Exercise the production menu and input handlers with asynchronous pointer-lock events.
const source=readFileSync(new URL('../dist/game.js',import.meta.url),'utf8');
const names=['setPaused','lockMouse','resumeFromMenu','closeMenu','play','openBattle','startBattle','look'];
const functions=names.map(n=>source.match(new RegExp('(?:async )?function '+n+'\\([^]*?\\n}'))[0]).join('\n');
const handlers=source.slice(source.indexOf("document.addEventListener('pointerlockchange'"),source.indexOf("document.addEventListener('keydown', event"));
const move=source.match(/document\.addEventListener\('mousemove', event[^]*?\n}\);/)[0];
let count=0;
function setup({coarse=false,deny=false}={}){
  const elements=new Map(),listeners=new Map(),events=[];let requests=0,focus=true;
  function element(id){if(!elements.has(id))elements.set(id,{hidden:true,open:false,textContent:'',focus(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
  const document={hidden:false,pointerLockElement:null,hasFocus:()=>focus,querySelector:()=>element('mouse-guide'),addEventListener(type,fn){listeners.set(type,fn);},exitPointerLock(){events.push(()=>{document.pointerLockElement=null;listeners.get('pointerlockchange')();});}};
  const canvas={requestPointerLock(){requests++;if(deny)return Promise.reject(new Error('denied'));events.push(()=>{document.pointerLockElement=canvas;listeners.get('pointerlockchange')();});return Promise.resolve();}};
  const context=vm.createContext({document,renderer:{domElement:canvas},coarsePointer:coarse,$:element,world:element('world'),audio:{unlock:async()=>{},setPlaying(){}},hunting:{hp:100},player:{},avatar:{root:{rotation:{}}},raids:{nearestArena:()=>({x:999,z:999,radius:1}),start:mode=>({accepted:['field'].includes(mode)})},THREE:{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},notify(){},clearInput(){},updateHUD(){},updateCamera(){},animateAvatar(){},renderBattle(){},toggleBuild(){},menuOpen:()=>[...elements.values()].some(e=>e.open),cancelBowDraw(){}});
  vm.runInContext('let started=true,paused=false,locked=false,firstPerson=false,releasingMouse=false,requestingMouse=false,buildingMode=false,accumulator=0,yaw=0,pitch=.3,cameraDistance=7,impactPause=0,drawOwner=null,dragging=null,mouseDrawPosition=null;\n'+functions+'\n'+handlers+'\n'+move,context);
  return {context,document,canvas,element,run:code=>vm.runInContext(code,context),emit:(type,e={})=>listeners.get(type)?.(e),flush(){while(events.length)events.shift()();},get requests(){return requests;},set focus(v){focus=v;}};
}
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
await test('field hunt restores mouse-only camera movement after the menu releases it',async()=>{
  for(const mode of ['field']){const s=setup();await s.run('lockMouse()');s.flush();s.run('openBattle()');s.flush();assert.equal(s.run('locked'),false);s.run(`startBattle('${mode}')`);await Promise.resolve();s.flush();assert.equal(s.run('locked'),true);assert.equal(s.run('paused'),false);const yaw=s.run('yaw');s.emit('mousemove',{movementX:100,movementY:5});assert.ok(s.run('yaw')<yaw-.26);assert.equal(s.requests,2);}
});
await test('closing the menu through its button resumes; an intentional delayed release cannot pause that resume',async()=>{
  const s=setup();await s.run('lockMouse()');s.flush();s.run('openBattle()');s.flush();s.run("closeMenu('battle-dialog')");await Promise.resolve();s.flush();assert.equal(s.run('locked'),true);assert.equal(s.run('paused'),false);
  s.run('setPaused(true);setPaused(false)');s.flush();assert.equal(s.run('paused'),false);
});
await test('Escape/unexpected unlock pauses without automatically grabbing the mouse again',async()=>{
  const s=setup();await s.run('lockMouse()');s.flush();s.document.pointerLockElement=null;s.emit('pointerlockchange');assert.equal(s.run('paused'),true);assert.equal(s.requests,1);const yaw=s.run('yaw');s.emit('mousemove',{movementX:100,movementY:0});assert.equal(s.run('yaw'),yaw);
});
await test('late lock completion after pause is immediately released',async()=>{
  const s=setup();await s.run('lockMouse()');s.run('setPaused(true)');s.flush();assert.equal(s.document.pointerLockElement,null);assert.equal(s.run('paused'),true);
});
await test('denied pointer lock leaves play and keyboard/drag fallback available',async()=>{
  const s=setup({deny:true});await s.run('lockMouse()');assert.equal(s.run('paused'),false);assert.equal(s.run('requestingMouse'),false);assert.equal(s.run('locked'),false);s.run('look(100,0)');assert.equal(s.run('yaw'),-.27);
});
await test('touch browsers, hidden tabs and another open menu never request a mouse grab',async()=>{
  const touch=setup({coarse:true});await touch.run('lockMouse()');assert.equal(touch.requests,0);
  for(const inactive of ['hidden','focus','menu']){const s=setup();s.run('setPaused(true)');if(inactive==='hidden')s.document.hidden=true;if(inactive==='focus')s.focus=false;if(inactive==='menu')s.element('audio-dialog').open=true;s.run('resumeFromMenu()');assert.equal(s.requests,0);assert.equal(s.run('paused'),true);}
});
console.log(`${count} camera input checks passed`);
