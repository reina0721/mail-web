import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../backend/src');
const failures=[];
for(const name of ['main','account','registration','policy','mail','bootstrap','installation']){
 const source=fs.readFileSync(path.join(root,name+'.rs'),'utf8').replace(/#\[cfg\(test\)\]\s*mod tests\s*\{[\s\S]*$/,'');
 if(/sqlx::(?:query|query_scalar|query_as|SqlitePool|migrate)\b|\.begin_with\(|\.db\.begin\(/.test(source))failures.push(name);
}
const migrations=path.resolve(root,'../migrations');
if(fs.readdirSync(migrations).some(name=>name.endsWith('.sql')))failures.push('migrations must be scoped to an engine');
if(failures.length)throw Error('Persistence boundary violations: '+failures.join(', '));
console.log('SQLite persistence and engine-specific migration boundaries passed.');
