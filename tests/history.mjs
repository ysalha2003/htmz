import fs from 'node:fs';
import {chromium,firefox,webkit} from 'playwright';
import {startServer} from '../tools/server.mjs';
const s=await startServer(0),data={date:new Date().toISOString(),note:'Browser back/forward behavior characterization; same URL may preserve iframe session entries without updating the top-level URL.',observations:[]};
const run=async(p,u)=>{await p.evaluate(h=>{let a=document.createElement('a');a.href=h;a.target='htmz';document.body.append(a);a.click();a.remove();},u);await p.waitForFunction(t=>document.querySelector('#slot')?.textContent.includes(t),new URL(u).searchParams.get('name'),{timeout:4000});};
try{
 for(const [name,engine] of Object.entries({chromium,firefox,webkit})){let browser;
  try{browser=await engine.launch(name==='chromium'?{channel:'chrome'}:{});const p=await browser.newPage();await p.goto(s.base+'/harness?variant=safe');const initial=p.url();
   await run(p,s.base+'/frag?name=one#slot');await run(p,s.base+'/frag?name=two#slot');
   const before=await p.locator('#slot').innerText();let afterBack,afterForward,err=null;
   try{await p.evaluate(()=>history.back());await p.waitForTimeout(450);afterBack=await p.locator('#slot').count()?await p.locator('#slot').first().innerText():'NO_SLOT';await p.evaluate(()=>history.forward());await p.waitForTimeout(450);afterForward=await p.locator('#slot').count()?await p.locator('#slot').first().innerText():'NO_SLOT';}
   catch(e){err=String(e.message).slice(0,400);}
   data.observations.push({browser:name,initialTopUrl:initial,finalTopUrl:p.url(),before,afterBack,afterForward,error:err});
   await p.close();
  }catch(e){data.observations.push({browser:name,environmentError:String(e.message).slice(0,400)});}
  finally{if(browser)await browser.close();}
 }
}finally{await s.close();}
fs.writeFileSync('evidence/history-observations.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data,null,2));