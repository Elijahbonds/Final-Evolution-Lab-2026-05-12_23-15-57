// KIT-FIT: the repeated-runs bar (KIT-FIT-PLAN §10.1a / §11). node scripts/probes/kit-fit/bar.cjs <out-dir> <phase0-name> <piece-name> <control-subject>
// reads <out-dir>/<name>-<tier>-<round>.json matrices written by rig.mts (NAME=<name>-<tier>-<round>)
// the repeated-runs bar: dir, A-prefix (phase 0), B-prefix (piece), control subject
const fs=require('fs');const [dir,A,B,ctl]=process.argv.slice(2);
const load=(p,t)=>fs.readdirSync(dir).filter(f=>f.startsWith(`${p}-${t}-`)&&f.endsWith('.json')).map(f=>{const S={};for(const x of JSON.parse(fs.readFileSync(`${dir}/${f}`)).filter(c=>c.screen.poke!=null)){const s=S[x.subject]??={skin:0,flicker:0,tops:0,shorts:0,shoes:0};s.skin+=x.screen.poke;s.flicker+=x.screen.flipsGarment||0;for(const k of['tops','shorts','shoes'])s[k]+=x.screen.pokeBySlot?.[k]??0;}return S;});
let all=true;
for(const t of['desktop','mobile']){const a=load(A,t),b=load(B,t);if(!a.length)continue;
 const cv=k=>[...a,...b].map(r=>r[ctl]?.[k]).filter(v=>v!=null);const band=k=>{const v=cv(k);return Math.max(...v)-Math.min(...v);};
 console.log(`-- ${t}: ${a.length} runs vs ${b.length}; control ${ctl} spread: skin ${band('skin')} flicker ${band('flicker')} shorts ${band('shorts')} shoes ${band('shoes')} tops ${band('tops')}`);
 for(const s of Object.keys(a[0])){if(s===ctl)continue;const row=[];let ok=true;
  for(const k of['skin','tops','flicker','shorts','shoes']){const va=a.map(r=>r[s][k]),vb=b.map(r=>r[s][k]);const ma=Math.max(...va),mb=Math.max(...vb);
   const tol=(k==='skin'||k==='tops')?0:band(k);const pass=mb<=ma+tol;ok&&=pass;row.push(`${k} ${va.join('/')} → ${vb.join('/')}${pass?'':' ✗'}`);}
  all&&=ok;console.log(`${ok?'PASS':'FAIL'} ${s}\n     ${row.join('\n     ')}`);}}
console.log(all?'BAR: PASS':'BAR: FAIL');
