// Tests the generator without touching other projects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const kit=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=path.resolve(kit,'../..');
const dest=path.join(lab,'generated','qa-'+crypto.randomBytes(6).toString('hex'));
const slug=path.basename(dest);
const script=path.join(kit,'tools/create-app.mjs');
const invoke=()=>spawnSync(process.execPath,[script,slug,dest,'بوابة اختبار'],{encoding:'utf8'});
let checks=0;
try{
  const first=invoke();
  if(first.status!==0)throw Error('create failed: '+first.stderr);
  checks++;
  const index=fs.readFileSync(path.join(dest,'public/index.html'),'utf8');
  if(!index.includes('بوابة اختبار'))throw Error('generated identity is missing');
  checks++;
  const pkg=JSON.parse(fs.readFileSync(path.join(dest,'package.json'),'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(dest,'package-lock.json'),'utf8'));
  if(pkg.name!==slug || lock.name!==slug)throw Error('package identity is inconsistent');
  checks++;
  for(const rel of ['backends/node/server.mjs','backends/python/server.py','public/design.css','public/kit.js','docs/CONTRACT-AR.md','START_HERE.md']){
    if(!fs.existsSync(path.join(dest,rel)))throw Error('generated file missing: '+rel);
  }
  checks++;
  const stat=fs.statSync(path.join(dest,'public/index.html')).size;
  const second=invoke();
  if(second.status===0||fs.statSync(path.join(dest,'public/index.html')).size!==stat)throw Error('generator overwrote a project');
  checks++;
  const guide=fs.readFileSync(path.join(dest,'START_HERE.md'),'utf8');
  if(!guide.includes(dest)||!guide.includes('\n'))throw Error('generated guide invalid');
  checks++;
  console.log(JSON.stringify({status:'PASS',checks,slug,verified:'generator, locale, manifests, files, no-overwrite, guide'},null,2));
} catch(e) {
  console.error('SCAFFOLD FAIL: '+String(e.stack||e));
  process.exitCode=1;
} finally {
  if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true}); // only folder created by this test
}
