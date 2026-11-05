import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const notes=new Map([['p1','التقرير الأولي جاهز للمراجعة.'],['p2','تحديث البرنامج الزمني قيد الإعداد.'],['p3','المراسلات الفنية مكتملة.']]);
const projects=[['p1','تطوير مقر الإدارة','قيد التنفيذ'],['p2','تجديد مركز الخدمات','مراجعة'],['p3','تصميم مجمع هندسي','مكتمل']];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=(res,body,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);};
const snippet=v=>fs.readFileSync(path.join(root,({original:'htmz.html',dev:'htmz.dev.html',safe:'htmz.safe.html','safe-dev':'htmz.safe.dev.html'})[v]||'htmz.html'),'utf8');
const list=q=>'<section id="project-list"><h2>المشاريع</h2><ul class="projects">'+projects.filter(p=>p[1].includes(q)).map(p=>'<li><a href="/demo/project?id='+p[0]+'#project-detail" target="htmz">'+esc(p[1])+'</a><small>'+esc(p[2])+'</small></li>').join('')+'</ul></section>';
const detail=id=>{const p=projects.find(p=>p[0]===id)||projects[0];return '<section id="project-detail"><h2>'+esc(p[1])+'</h2><p class="muted">الحالة: '+esc(p[2])+'</p><nav class="tabs"><a href="/demo/tab?id='+p[0]+'&kind=summary#project-tab" target="htmz">الملخص</a><a href="/demo/tab?id='+p[0]+'&kind=tasks#project-tab" target="htmz">المهام</a></nav><div id="project-tab">اختر تبويبًا.</div><form method="post" action="/demo/note#project-detail" target="htmz"><input type="hidden" name="id" value="'+p[0]+'"><label>ملاحظات المشروع<textarea name="note" rows="3">'+esc(notes.get(p[0]))+'</textarea></label><button>حفظ الملاحظة</button></form><a href="/demo/error#project-detail" target="htmz">عرض خطأ الخادم</a></section>';};
const tab=(id,kind)=>'<div id="project-tab">'+(kind==='tasks'?'<h3>المهام</h3><ul><li>المراجعة الفنية</li><li>اعتماد المخططات</li></ul>':'<h3>الملخص</h3><p>لوحة معلومات المشروع التجريبي '+esc(id)+'.</p>')+'</div>';
function documentPage(variant,body,demo=false){return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>htmz laboratory</title>'+(demo?'<link rel="stylesheet" href="/demo.css">':'')+'</head><body>'+body+snippet(variant)+'</body></html>';}
function demo(variant){return documentPage(variant,'<main class="app"><header><div><small>htmz Engineering Lab</small><h1>إدارة المشاريع</h1><p>تطبيق واقعي مصغّر باستخدام HTML عادي وiframe مخفي.</p></div><div class="switch"><a href="/demo?variant=original">الأصل</a><a href="/demo?variant=safe">النسخة المحسّنة</a></div></header><div class="layout"><aside><form method="get" action="/demo/list#project-list" target="htmz"><label for="q">البحث عن مشروع</label><input id="q" name="q" placeholder="اكتب اسم المشروع"><button>بحث</button></form>'+list('')+'</aside><article>'+detail('p1')+'</article></div><footer><span id="busy" role="status" aria-live="polite"></span><span>بيانات اصطناعية - الخادم المحلي فقط</span></footer></main><script src="/feedback.js" defer></script>',true);}
async function handler(req,res,crossPort){const u=new URL(req.url,'http://localhost');const p=u.pathname;
 if(p==='/harness'){return send(res,documentPage(u.searchParams.get('variant')||'original','<a id="keyboard" href="/frag?name=keyboard#slot" target="htmz">Keyboard target</a><div id="slot">initial</div><div id="other">other initial</div><form id="getform" action="/frag#slot" method="get" target="htmz"><input name="name" value="GET worked"><button>GET</button></form><form id="postform" action="/submit#slot" method="post" target="htmz"><input name="note" value="POST worked"><button>POST</button></form>'));}
 if(p==='/frag'){const name=u.searchParams.get('name')||'updated',target=u.searchParams.get('target')||'slot';return send(res,'<div id="'+esc(target)+'" data-fragment="'+esc(name)+'">'+esc(name)+'<button type="button">interactive control</button></div>');}
 if(p==='/submit' && req.method==='POST'){let s='';for await(const ch of req)s+=ch;return send(res,'<div id="slot"><strong>'+esc(new URLSearchParams(s).get('note'))+'</strong></div>');}
 if(p==='/probe')return send(res,'<div id="slot">isolated HTML security probe</div><script>top.document.body.dataset.securityProbe="executed"</script>');
 if(p==='/empty')return send(res,'');
 if(p==='/error')return send(res,'<div id="slot" role="alert">HTTP 500 error fragment</div>',500);
 if(p==='/redirect')return send(res,'',302,{'Location':'/frag?name=redirected'});
 if(p==='/delay'){await new Promise(ok=>setTimeout(ok,Math.min(1500,Math.max(0,Number(u.searchParams.get('ms'))||0))));return send(res,'<div id="slot">'+esc(u.searchParams.get('name')||'delay')+'</div>');}
 if(p==='/cross')return send(res,'<div id="slot">cross-origin content</div>');
 if(p==='/csp')return send(res,documentPage(u.searchParams.get('variant')||'original','<div id="slot">CSP</div>'),200,{'Content-Security-Policy':"script-src 'self'"}); 
 if(p==='/demo')return send(res,demo(u.searchParams.get('variant')||'safe'));
 if(p==='/demo/list')return send(res,list(u.searchParams.get('q')||''));
 if(p==='/demo/project')return send(res,detail(u.searchParams.get('id')||'p1'));
 if(p==='/demo/tab')return send(res,tab(u.searchParams.get('id')||'p1',u.searchParams.get('kind')));
 if(p==='/demo/note' && req.method==='POST'){let s='';for await(const ch of req)s+=ch;const f=new URLSearchParams(s),id=f.get('id');if(notes.has(id))notes.set(id,(f.get('note')||'').slice(0,3000));return send(res,detail(id));}
 if(p==='/demo/error')return send(res,'<section id="project-detail" role="alert"><h2>تعذر إكمال الطلب (HTTP 500)</h2><p>هذا مثال على إظهار صفحة خطأ يعيدها الخادم. htmz لا يقرأ رمز HTTP.</p><a href="/demo/project?id=p1#project-detail" target="htmz">إعادة المحاولة</a></section>',500);
 if(p==='/demo.css')return send(res,fs.readFileSync(path.join(root,'demos','style.css'),'utf8'),200,{'Content-Type':'text/css; charset=utf-8'});
 if(p==='/feedback.js')return send(res,fs.readFileSync(path.join(root,'optional','feedback.js'),'utf8'),200,{'Content-Type':'text/javascript; charset=utf-8'});
 return send(res,'<h1>404</h1>',404);
}
export async function startServer(port=4177){const server=http.createServer((req,res)=>handler(req,res));await new Promise(ok=>server.listen(port,'127.0.0.1',ok));const secondary=http.createServer((req,res)=>send(res,'<div id="slot">foreign server</div>'));await new Promise(ok=>secondary.listen(0,'127.0.0.1',ok));return {base:'http://127.0.0.1:'+server.address().port,cross:'http://127.0.0.1:'+secondary.address().port,close:async()=>{await Promise.all([new Promise(ok=>server.close(ok)),new Promise(ok=>secondary.close(ok))]);}};}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){startServer(Number(process.env.PORT)||4177).then(s=>console.log('HTMZ demo: '+s.base+'/demo | cross-test: '+s.cross));}
