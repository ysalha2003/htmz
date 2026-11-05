import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {startServer} from '../tools/server.mjs';
const server=await startServer(0);
const browser=await chromium.launch({channel:'chrome',headless:true});
const stats={date:new Date().toISOString(),engine:'Chrome (installed)',method:'Sequential real-browser navigations through a local HTTP server; elapsed includes Playwright control, iframe, network, and DOM. Do not interpret as isolated JavaScript execution cost.',runs:[]};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
try{
 for(const variant of ['original','safe','safe','original']){
  const page=await browser.newPage();let requests=0;page.on('request',r=>{if(r.url().includes('/frag?name=BENCH'))requests++;});
  const startup=[];
  for(let i=0;i<6;i++){const a=performance.now();await page.goto(server.base+'/harness?variant='+variant);startup.push(performance.now()-a);}
  const elapsed=[];
  for(let i=0;i<25;i++){
   const label='BENCH'+variant+i;
   const t=performance.now();
   await page.evaluate(h=>{const a=document.createElement('a');a.target='htmz';a.href=h;document.body.append(a);a.click();a.remove();},server.base+'/frag?name='+label+'#slot');
   await page.waitForFunction(t=>document.querySelector('#slot')?.textContent.includes(t),label,{timeout:4500});
   elapsed.push(performance.now()-t);
  }
  stats.runs.push({variant,initialMedianMs:+median(startup).toFixed(2),fragmentMedianMs:+median(elapsed).toFixed(2),fragmentMinMs:+Math.min(...elapsed).toFixed(2),fragmentMaxMs:+Math.max(...elapsed).toFixed(2),requests,initialMs:startup,fragmentMs:elapsed});
  await page.close();
 }
}finally{await browser.close();await server.close();}
stats.size={};
for(const [key,file] of [['original','htmz.html'],['safe','htmz.safe.html'],['optionalIndicator','optional/feedback.js']]){const b=fs.readFileSync(file);stats.size[key]={rawBytes:b.byteLength,gzipBytes:gzipSync(b).byteLength};}
fs.writeFileSync('evidence/benchmark-results.json',JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({size:stats.size,runs:stats.runs.map(({variant,initialMedianMs,fragmentMedianMs,requests})=>({variant,initialMedianMs,fragmentMedianMs,requests})),source:'evidence/benchmark-results.json'},null,2));