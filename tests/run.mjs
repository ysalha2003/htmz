import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright';
import {startServer} from '../tools/server.mjs';
const variant=(process.argv.find(s=>s.startsWith('--variant='))||'--variant=original').split('=')[1];
const names=(process.argv.find(s=>s.startsWith('--browsers='))||'--browsers=chromium,firefox,webkit').split('=')[1].split(',');
const server=await startServer(0);
const output={variant,started:new Date().toISOString(),upstreamSha:'941cd22426e138e1897f9f3bc78992066c079cf6',browsers:{}};
const navigate=async(p,url)=>p.evaluate(h=>{let a=document.createElement('a');a.href=h;a.target='htmz';document.body.append(a);a.click();a.remove();},server.base+url);
const verify=async(p,s,t)=>p.waitForFunction(({s,t})=>(document.querySelector(s)?.textContent||'').includes(t),{s,t},{timeout:4500});
const wait=p=>p.waitForTimeout(170);
const checks=[
 ['fragment swap',async p=>{await navigate(p,'/frag?name=ALPHA#slot');await verify(p,'#slot','ALPHA');}],
 ['independent zones',async p=>{await navigate(p,'/frag?name=A#slot');await verify(p,'#slot','A');await navigate(p,'/frag?name=B&target=other#other');await verify(p,'#other','B');assert.match(await p.locator('#slot').innerText(),/A/);}],
 ['GET form',async p=>{await p.locator('#getform button').click();await verify(p,'#slot','GET worked');}],
 ['POST form',async p=>{await p.locator('#postform button').click();await verify(p,'#slot','POST worked');}],
 ['repeat requests',async p=>{await navigate(p,'/frag?name=FIRST#slot');await verify(p,'#slot','FIRST');await navigate(p,'/frag?name=SECOND#slot');await verify(p,'#slot','SECOND');}],
 ['missing target',async p=>{await navigate(p,'/frag?name=NONE#missing');await wait(p);assert.equal(await p.locator('#slot').innerText(),'initial');}],
 ['no URL hash',async p=>{await navigate(p,'/frag?name=NONE');await wait(p);assert.equal(await p.locator('#slot').innerText(),'initial');}],
 ['invalid selector does not crash',async p=>{await navigate(p,'/frag?name=NONE#%5B');await wait(p);assert.equal(await p.locator('#slot').innerText(),'initial');}],
 ['empty response deletes zone',async p=>{await navigate(p,'/empty#slot');await p.locator('#slot').waitFor({state:'detached',timeout:4500});}],
 ['HTTP 500 error markup',async p=>{await navigate(p,'/error#slot');await verify(p,'#slot','HTTP 500');}],
 ['server redirect',async p=>{await navigate(p,'/redirect#slot');await verify(p,'#slot','redirected');}],
 ['rapid navigation',async p=>{await navigate(p,'/delay?ms=350&name=OLD#slot');await navigate(p,'/frag?name=NEW#slot');await verify(p,'#slot','NEW');await p.waitForTimeout(520);assert.match(await p.locator('#slot').innerText(),/NEW/);}],
 ['transplanted controls',async p=>{await navigate(p,'/frag?name=BUTTON#slot');await verify(p,'#slot','BUTTON');assert.equal(await p.locator('#slot button').count(),1);}],
 ['parent location remains unchanged',async p=>{const u=p.url();await navigate(p,'/frag?name=HISTORY#slot');await verify(p,'#slot','HISTORY');assert.equal(p.url(),u);}],
 ['keyboard Enter',async p=>{await p.locator('#keyboard').focus();await p.keyboard.press('Enter');await verify(p,'#slot','keyboard');}],
 ['unrelated focused input retained',async p=>{await p.locator('#getform input').focus();await navigate(p,'/frag?name=FOCUS#slot');await verify(p,'#slot','FOCUS');assert.equal(await p.evaluate(()=>document.activeElement.closest('form')?.id),'getform');}],
 ['cross-origin navigation does not crash',async p=>{await p.evaluate(u=>{document.querySelector('iframe[name=htmz]').src=u+'/cross#slot'},server.cross);await p.waitForTimeout(400);assert.equal(await p.locator('#slot').innerText(),'initial');}],
 ['mobile viewport',async p=>{await p.setViewportSize({width:390,height:844});await navigate(p,'/frag?name=MOBILE#slot');await verify(p,'#slot','MOBILE');assert(await p.locator('#slot').isVisible());}],
 ['CSP limitation characterized',async p=>{await p.goto(server.base+'/csp?variant='+variant);await navigate(p,'/frag?name=BLOCKED#slot');await wait(p);assert.equal(await p.locator('#slot').innerText(),'CSP');}]
];
try{
 for(const name of names){
  const entry={version:null,launchError:null,tests:[]};output.browsers[name]=entry;let browser;
  try{const opts={headless:true};if(name==='chromium')opts.channel='chrome';browser=await ({chromium,firefox,webkit})[name].launch(opts);entry.version=browser.version();}
  catch(e){entry.launchError=String(e.message).slice(0,900);continue;}
  for(const [name2,check] of checks){
   const context=await browser.newContext(),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));let status='PASS',failure='';
   const start=Date.now();
   try{await page.goto(server.base+'/harness?variant='+variant);await check(page);if(errors.length&&name2!=='CSP limitation characterized')throw Error('Uncaught error: '+errors.join(' | '));}
   catch(e){status='FAIL';failure=String(e.message).slice(0,750);}
   entry.tests.push({name:name2,status,elapsedMs:Date.now()-start,failure,pageErrors:errors});
   await context.close();
  }
  await browser.close();
 }
} finally{await server.close();}
const counts={PASS:0,FAIL:0,ENVIRONMENT:0};
for(const b of Object.values(output.browsers)){if(b.launchError)counts.ENVIRONMENT++;for(const t of b.tests)counts[t.status]++;}
output.counts=counts;output.finished=new Date().toISOString();
fs.mkdirSync('evidence',{recursive:true});
const file='evidence/'+({original:'baseline',safe:'improved',dev:'original-dev','safe-dev':'improved-dev'}[variant]||variant)+'-browser-results.json';
fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({variant,counts,browsers:Object.fromEntries(Object.entries(output.browsers).map(([n,b])=>[n,{version:b.version,launchError:b.launchError,failures:b.tests.filter(t=>t.status==='FAIL').map(t=>({name:t.name,error:t.failure.slice(0,200)}))}])),file},null,2));
if(counts.FAIL||counts.ENVIRONMENT)process.exitCode=1;