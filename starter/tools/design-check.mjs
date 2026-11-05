// Small zero-dependency guard for the design system.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const css=fs.readFileSync(path.join(base,'design.css'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const marker='/* END TOKENS';
const at=css.indexOf(marker);
const errors=[];
if(at<0)errors.push('Missing end-of-tokens boundary.');
const tokens=css.slice(0,at).match(/--ds-[a-z0-9-]+(?=\s*:)/g)||[];
const refs=css.match(/var\((--ds-[a-z0-9-]+)/g)||[];
const known=new Set(tokens);
for(const ref of refs){const name=ref.slice(4);if(!known.has(name))errors.push('Undefined token: '+name);}
if(/#[\da-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css.slice(at)))errors.push('Hardcoded color outside tokens.');
if(/\bstyle\s*=/.test(html))errors.push('Inline styles are forbidden in app templates.');
if(/<script\b[^>]*>(?!\s*<\/script>)/.test(html))errors.push('Inline JS is forbidden in app templates.');
if(/@import\s+url/.test(css))errors.push('Remote CSS imports are forbidden.');
if(tokens.length<25)errors.push('Token coverage unexpectedly incomplete.');
// WCAG text-contrast smoke gate for the palette's common foreground/background pairs.
const colors=Object.fromEntries([...css.slice(0,at).matchAll(/(--ds-color-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m=>[m[1],m[2]]));
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const pairs=[['text','surface'],['muted','surface'],['primary','primary-soft'],['on-dark','header'],['success','success-soft'],['error','error-soft']];
const contrast=pairs.map(([fg,bg])=>{const a=luminance(colors['--ds-color-'+fg]),b=luminance(colors['--ds-color-'+bg]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)errors.push('Contrast below 4.5:1 for '+fg+' on '+bg);return {pair:fg+'/'+bg,ratio:+ratio.toFixed(2)};});
console.log(JSON.stringify({status:errors.length?'FAIL':'PASS',tokens:known.size,references:refs.length,contrast,errors},null,2));
if(errors.length)process.exitCode=1;
