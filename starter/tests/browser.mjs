// Real-browser contract checks for two independently implemented backends.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {chromium, firefox, webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engines={chromium,firefox,webkit};
const checks=[];
function record(backend,browser,name,ok,error=''){checks.push({backend,browser,name,status:ok?'PASS':'FAIL',error});}
async function startBackend(name){
  const args=name==='node'?['backends/node/server.mjs']:['backends/python/server.py'];
  const child=spawn(name==='node'?process.execPath:'python',args,{cwd:root,env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';
  const base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Backend start timeout '+name+': '+log.slice(0,600))),10000);
    const reader=chunk=>{log+=String(chunk);const match=log.match(/HTMZ_STARTER_READY (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}};
    child.stdout.on('data',reader);child.stderr.on('data',c=>{log+=String(c)});
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('exit',n=>{clearTimeout(timer);reject(Error('Backend terminated '+n+': '+log))});
  });
  return {base,child};
}
const waitText=(page,selector,text)=>page.waitForFunction(({selector,text})=>(document.querySelector(selector)?.textContent||'').includes(text),{selector,text},{timeout:4500});
const probe=async(name,engine,backend,base)=>{
  const browser=await engine.launch({headless:true});
  report.versions[name]=browser.version();
  const context=await browser.newContext({viewport:{width:1280,height:840}});
  const page=await context.newPage();
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  async function test(title,fn){try{await fn();record(backend,name,title,true);}catch(e){record(backend,name,title,false,String(e.message).slice(0,500));}}
  try{
    await test('design gallery served with shared CSS',async()=>{
      const response=await page.goto(base+'/design-system.html');
      if(response.status()!==200)throw Error('design gallery status '+response.status());
      if(!await page.locator('h1').textContent().then(t=>t.includes('نظام التصميم')))throw Error('design heading missing');
      if(await page.locator('.ds-card').count()!==2)throw Error('component gallery incomplete');
    });
    await test('SSR and strict CSP',async()=>{
      const response=await page.goto(base+'/');
      if(response.status()!==200)throw Error('status '+response.status());
      const csp=response.headers()['content-security-policy'];
      if(!csp.includes("script-src 'self'")||csp.includes('unsafe-inline'))throw Error('CSP unsafe');
      if(await page.locator('#project-list li').count()!==3)throw Error('SSR project list incomplete');
      if(!await page.locator('#project-panel form').count())throw Error('No SSR form');
    });
    await test('linked project fragments',async()=>{
      await page.locator('#project-list a[href*="P-102"]').click();
      await waitText(page,'#project-panel h2','تحديث مركز الخدمات');
      if(!await page.locator('#project-panel').isVisible())throw Error('panel hidden');
    });
    await test('tabs and managed focus',async()=>{
      await page.locator('#project-panel a[href*="view=tasks"]').click();
      await waitText(page,'#project-tab','المهام الأساسية');
      const focused=await page.evaluate(()=>document.activeElement?.textContent);
      if(!focused.includes('المهام الأساسية'))throw Error('focus not managed');
    });
    await test('GET search',async()=>{
      await page.locator('#project-search').fill('تصميم');
      await page.locator('.ds-search button').click();
      await page.waitForFunction(()=>document.querySelectorAll('#project-list li').length===1 && document.querySelector('#project-list')?.textContent.includes('تصميم مبنى المكاتب'));
      if(await page.locator('#project-list li').count()!==1)throw Error('wrong search count');
    });
    await test('POST notes saves and escapes HTML',async()=>{
      const payload='<img src=x onerror=alert(1)> ملاحظة';
      await page.locator('#project-panel textarea').fill(payload);
      await page.locator('#project-panel button').click();
      await waitText(page,'#project-panel','تم حفظ الملاحظة بنجاح');
      const note=await page.locator('#project-panel textarea').inputValue();
      if(note!==payload)throw Error('round-trip mismatch');
      if(await page.locator('#project-panel img').count())throw Error('HTML injection');
    });
    await test('CSRF rejects forged write',async()=>{
      const response=await context.request.post(base+'/notes',{headers:{Origin:base},form:{csrf:'wrong',id:'P-102',note:'forged'}});
      if(response.status()!==403)throw Error('CSRF status '+response.status());
    });
    await test('foreign Origin rejected with valid CSRF token',async()=>{
      const token=await page.locator('#project-panel input[name=csrf]').inputValue();
      const response=await context.request.post(base+'/notes',{headers:{Origin:'https://untrusted.invalid'},form:{csrf:token,id:'P-102',note:'should not write'}});
      if(response.status()!==403)throw Error('foreign Origin accepted');
    });
    await test('strict CSP blocks injected inline script',async()=>{
      await page.evaluate(()=>{
        const s=document.createElement('script');s.textContent='document.body.dataset.cspBypass="true"';document.body.append(s);
      });
      if(await page.evaluate(()=>document.body.dataset.cspBypass))throw Error('CSP bypass');
    });
    await test('explicit foreign origin rejected',async()=>{
      const token=await page.locator('#project-panel input[name=csrf]').inputValue();
      const response=await context.request.post(base+'/notes',{headers:{Origin:'https://example.org'},form:{csrf:token,id:'P-102',note:'test write'}});
      if(response.status()!==403)throw Error('origin check failed');
    });
    await test('non-ASCII CSRF rejected without server error',async()=>{
      const response=await context.request.post(base+'/notes',{
        headers:{Origin:base},
        form:{csrf:'invalid-⚠',id:'P-102',note:'test'}
      });
      if(response.status()!==403)throw Error('unexpected CSRF response '+response.status());
    });
    await test('server validation returns 422 fragment',async()=>{
      const token=await page.locator('#project-panel input[name=csrf]').inputValue();
      const response=await context.request.post(base+'/notes',{headers:{Origin:base},form:{csrf:token,id:'P-102',note:''}});
      if(response.status()!==422)throw Error('validation status '+response.status());
      const body=await response.text();if(!body.includes('id="project-panel"')||!body.includes('role="alert"'))throw Error('invalid fragment');
    });
    await test('contract mismatch is rejected safely',async()=>{
      await page.evaluate(u=>{const a=document.createElement('a');a.target='htmz';a.href=u;a.click();},base+'/projects#project-panel');
      await waitText(page,'#ds-status','لم يكتمل التحديث');
      if(!await page.locator('#project-panel textarea').count())throw Error('main panel overwritten on bad fragment');
    });
    await test('missing URL fragment shows failure state',async()=>{
      await page.evaluate(u=>{
        const a=document.createElement('a');a.target='htmz';a.href=u;a.click();
      },base+'/projects');
      await waitText(page,'#ds-status','لم يكتمل التحديث');
      if(!await page.locator('#project-panel form').count())throw Error('main panel changed');
    });
    await test('invalid fragment ID cannot replace content',async()=>{
      await page.evaluate(u=>{const a=document.createElement('a');a.target='htmz';a.href=u;a.click();},base+'/projects#%5B');
      await page.waitForTimeout(220);
      if(!await page.locator('#project-panel textarea').count())throw Error('invalid fragment replaced panel');
    });
    await test('missing project returns 404 fragment',async()=>{
      await page.goto(base+'/');
      await page.evaluate(u=>{const a=document.createElement('a');a.target='htmz';a.href=u;a.click();},base+'/project?id=unknown#project-panel');
      await waitText(page,'#project-panel','المشروع غير موجود');
      if(await page.locator('#project-panel').getAttribute('data-result')!=='error')throw Error('missing error result');
    });
    await test('mobile viewport and RTL',async()=>{
      await page.goto(base+'/');
      await page.setViewportSize({width:390,height:844});
      if(await page.locator('html').getAttribute('dir')!=='rtl')throw Error('wrong direction');
      if(!await page.locator('#project-panel').isVisible())throw Error('panel not visible');
      const width=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      if(width>2)throw Error('horizontal overflow '+width);
    });
    await test('no uncaught JS exception',async()=>{
      if(pageErrors.length)throw Error(pageErrors.join(' | ').slice(0,300));
    });
    if(backend==='node'&&name==='chromium'){
      await page.setViewportSize({width:1280,height:840});
      await page.goto(base+'/');
      await page.screenshot({path:path.join(root,'evidence-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(root,'evidence-mobile.png'),fullPage:true});
    }
  }finally{await context.close();await browser.close();}
};
const report={date:new Date().toISOString(),results:[],counts:{pass:0,fail:0},versions:{}};
try {
  for(const backend of ['node','python']){
    const server=await startBackend(backend);
    try{
      for(const [name,engine] of Object.entries(engines)){
        try{await probe(name,engine,backend,server.base);}
        catch(e){record(backend,name,'browser-launch/environment',false,String(e.message).slice(0,500));}
      }
    }finally{server.child.kill();}
  }
}finally{
  report.results=checks;report.counts.pass=checks.filter(x=>x.status==='PASS').length;report.counts.fail=checks.filter(x=>x.status==='FAIL').length;
  fs.writeFileSync(path.join(root,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({counts:report.counts,failures:checks.filter(x=>x.status==='FAIL'),evidence:'browser-results.json'},null,2));
}
if(report.counts.fail)process.exitCode=1;
