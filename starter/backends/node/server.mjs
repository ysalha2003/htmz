// Reference backend: Node.js built-ins only. Same HTML contract as Python adapter.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public');
const projects = JSON.parse(fs.readFileSync(path.join(root, 'projects.json'), 'utf8'));
const template = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const sessions = new Map(); // Demo only: replace with real auth + persistent session store.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self'; frame-ancestors 'self'";
const headers = {'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':csp,
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'SAMEORIGIN', 'Cache-Control':'no-store'};
const projectById = id => projects.find(p => p.id === id);
const list = query => {
  const q = String(query || '').trim().slice(0, 100).toLocaleLowerCase();
  const entries = projects.filter(p => p.title.toLocaleLowerCase().includes(q));
  return '<section id="project-list" aria-label="نتائج البحث"><h2>قائمة المشاريع</h2>' +
    (entries.length ? '<ul class="ds-project-list">' + entries.map(p =>
      '<li><a href="/project?id='+encodeURIComponent(p.id)+'#project-panel" target="htmz">'+esc(p.title)+'</a><small>'+esc(p.status)+'</small></li>'
    ).join('')+'</ul>' : '<p class="ds-empty">لا توجد مشاريع مطابقة.</p>')+'</section>';
};
const tab = (project, view) => '<div id="project-tab" class="ds-panel" data-focus-on-swap>' +
  (view === 'tasks' ? '<h3 tabindex="-1" data-focus>المهام الأساسية</h3><ul>'+project.tasks.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>'
    : '<h3 tabindex="-1" data-focus>ملخص المشروع</h3><p class="ds-muted">مثال يوضح استبدال أجزاء HTML من الخادم دون JavaScript لتوليد الواجهة.</p>')+'</div>';
const panel = (project, session, options={}) => {
  const note = options.note ?? session.notes[project.id] ?? project.note;
  const notice = options.error ? '<div class="ds-alert ds-alert-error" role="alert">'+esc(options.error)+'</div>'
    : options.saved ? '<div class="ds-alert ds-alert-success" role="status">تم حفظ الملاحظة بنجاح.</div>' : '';
  return '<section id="project-panel" class="ds-card" data-focus-on-swap data-result="'+(options.error?'error':'ok')+'">' +
    '<div class="ds-detail-title"><h2 tabindex="-1" data-focus>'+esc(project.title)+'</h2><span class="ds-pill">'+esc(project.status)+'</span></div>' +
    '<nav class="ds-tabs" aria-label="أقسام المشروع"><a href="/tab?id='+encodeURIComponent(project.id)+'&view=overview#project-tab" target="htmz">نظرة عامة</a>' +
    '<a href="/tab?id='+encodeURIComponent(project.id)+'&view=tasks#project-tab" target="htmz">المهام</a></nav>' +
    '<div class="ds-section">'+tab(project, 'overview')+'</div><section class="ds-section" aria-label="ملاحظات المشروع"><h3>الملاحظات</h3>'+notice+
    '<form action="/notes#project-panel" method="post" target="htmz" class="ds-note-form">' +
    '<input type="hidden" name="csrf" value="'+esc(session.csrf)+'"><input type="hidden" name="id" value="'+esc(project.id)+'">' +
    '<label>وصف مختصر<textarea name="note" maxlength="300" rows="4" required>'+esc(note)+'</textarea></label>' +
    '<button class="ds-button" type="submit">حفظ الملاحظة</button></form></section></section>';
};
function send(res, status, html, extra={}) {res.writeHead(status, {...headers, ...extra});res.end(html);}
function errorFragment(message, status, res) {send(res,status,'<section id="project-panel" class="ds-card" data-focus-on-swap data-result="error"><h2 tabindex="-1" data-focus>تعذّر تنفيذ الطلب</h2><p class="ds-alert ds-alert-error" role="alert">'+esc(message)+'</p></section>');}
function loadSession(req, res, create=false) {
  const cookie = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('htmz_sid='))?.slice(9);
  if(cookie && sessions.has(cookie)) return sessions.get(cookie);
  if(!create) return null;
  const id=crypto.randomBytes(24).toString('hex');
  const session={csrf:crypto.randomBytes(24).toString('hex'), notes:{}};
  sessions.set(id,session);
  res.setHeader('Set-Cookie','htmz_sid='+id+'; HttpOnly; SameSite=Lax; Path=/'+(process.env.PUBLIC_ORIGIN?.startsWith('https://')?'; Secure':''));
  return session;
}
async function handler(req,res) {
  const url=new URL(req.url,'http://localhost'), p=url.pathname;
  if(req.method==='GET' && p==='/design-system.html') return send(res,200,fs.readFileSync(path.join(publicDir,'design-system.html')));
  if(req.method==='GET' && (p==='/design.css'||p==='/runtime.js')){
    const name=p.slice(1), type=p.endsWith('.css')?'text/css':'text/javascript';
    return send(res,200,fs.readFileSync(path.join(publicDir,name)),{'Content-Type':type+'; charset=utf-8'});
  }
  if(req.method==='GET' && p==='/'){
    const session=loadSession(req,res,true);
    return send(res,200,template.replace('{{PROJECT_LIST}}',list(''))
      .replace('{{PROJECT_PANEL}}',panel(projects[0],session)));
  }
  const session=loadSession(req,res);
  if(!session) return errorFragment('انتهت الجلسة؛ حدّث الصفحة.',403,res);
  if(req.method==='GET' && p==='/projects') return send(res,200,list(url.searchParams.get('q')));
  if(req.method==='GET' && p==='/project'){
    const project=projectById(url.searchParams.get('id'));
    return project?send(res,200,panel(project,session)):errorFragment('المشروع غير موجود.',404,res);
  }
  if(req.method==='GET' && p==='/tab'){
    const project=projectById(url.searchParams.get('id'));
    if(!project) return send(res,404,'<div id="project-tab" data-result="error">المشروع غير موجود.</div>');
    return send(res,200,tab(project,url.searchParams.get('view')));
  }
  if(req.method==='POST' && p==='/notes'){
    const expected=process.env.PUBLIC_ORIGIN || 'http://'+req.headers.host;
    // Forms adopted from an iframe may send Origin: null. Require the session-bound CSRF token below;
    // reject explicit foreign origins and Fetch Metadata cross-site signals.
    if((req.headers.origin && req.headers.origin!==expected && req.headers.origin!=='null') ||
       (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) return errorFragment('مصدر الطلب غير مسموح.',403,res);
    let body=''; for await(const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>16384) return errorFragment('حجم النموذج كبير.',413,res);}
    const data=new URLSearchParams(body);
    if(data.get('csrf')!==session.csrf) return errorFragment('رمز حماية النموذج غير صالح.',403,res);
    const project=projectById(data.get('id'));
    if(!project) return errorFragment('المشروع غير موجود.',404,res);
    const note=data.get('note')||'';
    if(!note.trim()||note.length>300) return send(res,422,panel(project,session,{note,error:'الملاحظة مطلوبة ويجب ألا تتجاوز 300 حرف.'}));
    session.notes[project.id]=note;
    return send(res,200,panel(project,session,{saved:true}));
  }
  return send(res,404,'<!doctype html><html lang="ar" dir="rtl"><body><h1>404</h1></body></html>');
}
const port=Number(process.env.PORT ?? 4188);
const server=http.createServer((req,res)=>handler(req,res).catch(error=>{console.error('request failed',error.name);if(!res.headersSent)errorFragment('خطأ داخلي.',500,res);else res.end();}));
server.listen(port,'127.0.0.1',()=>console.log('HTMZ_STARTER_READY http://127.0.0.1:'+server.address().port));
