// Zero-dependency scaffolder. Copies the starter; never overwrites a destination.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const slug=process.argv[2];
if(!slug || slug==='--help'){
  console.log('Usage: node tools/create-app.mjs <slug> [destination-path] [display-name]');
  process.exit(slug?0:1);
}
if(!/^[a-z][a-z0-9-]{1,39}$/.test(slug)){
  console.error('Slug must be 2–40 lowercase ASCII letters, digits or hyphens; start with a letter.');
  process.exit(1);
}
const destination=path.resolve(process.argv[3] || path.join(source,'..','..','generated',slug));
if(destination===source || destination.startsWith(source+path.sep)){
  console.error('Destination must be outside this starter source to prevent recursive copying.');
  process.exit(1);
}
if(fs.existsSync(destination)){
  console.error('Destination already exists. Nothing changed: '+destination);
  process.exit(1);
}
const displayName=(process.argv[4] || slug).slice(0,90);
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const excluded=new Set(['node_modules','__pycache__','.git','browser-results.json',
  'evidence-desktop.png','evidence-mobile.png','debug.mjs']);
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.mkdirSync(destination); // Atomic reservation: never merge into an existing project.
fs.cpSync(source,destination,{recursive:true,filter:p=>!path.relative(source,p).split(path.sep).some(part=>excluded.has(part))});
for(const filename of ['index.html','design-system.html']){
  const file=path.join(destination,'public',filename);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('HTMZ Kit',esc(displayName)));
}
const pkg=path.join(destination,'package.json');
const info=JSON.parse(fs.readFileSync(pkg,'utf8'));info.name=slug;
fs.writeFileSync(pkg,JSON.stringify(info,null,2)+'\n');
const lockFile=path.join(destination,'package-lock.json');
if(fs.existsSync(lockFile)){
  const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));
  lock.name=slug;if(lock.packages?.[''])lock.packages[''].name=slug;
  fs.writeFileSync(lockFile,JSON.stringify(lock,null,2)+'\n');
}
const guide = [
  '# '+displayName,
  '',
  'تم إنشاء هذا التطبيق بشكل مستقل بواسطة HTMZ Kit. لا يلزم تثبيت حزم لتشغيل الخادم.',
  '',
  '## التشغيل من PowerShell',
  'cd '+destination,
  'node backends/node/server.mjs',
  '',
  'أو في نافذة مستقلة:',
  'cd '+destination,
  'python backends/python/server.py',
  '',
  'Node: http://127.0.0.1:4188/',
  'Python: http://127.0.0.1:4189/',
  '',
  'لتعديل التصميم: public/design.css وpublic/index.html. طبقة التحسين: public/kit.js (العقد في docs/CONTRACT-AR.md).',
  'لتعديل بيانات التجربة: projects.json.',
  'للاختبارات والتفاصيل: README.md وdocs/PRODUCTION-CHECKLIST-AR.md.',
  'تنبيه: قبل الإنتاج يجب إضافة تسجيل دخول حقيقي وقاعدة بيانات دائمة ونظام جلسات وآلية نسخ احتياطي.',
  ''
].join('\n');
fs.writeFileSync(path.join(destination,'START_HERE.md'),guide);
console.log(JSON.stringify({status:'CREATED',path:destination,slug,displayName,
  node:'node backends/node/server.mjs',python:'python backends/python/server.py'},null,2));
