import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';

// Integration check against the production export, so an omitted stylesheet
// cannot leave apparently configured recipes with no executable keyframes.
test('production CSS includes the keyframes consumed by application recipes',async()=>{
 const root=new URL('../',import.meta.url);
 const chunkDir=new URL('frontend/apps/web/out/_next/static/chunks/',root);
 const files=(await readdir(chunkDir)).filter(name=>name.endsWith('.css'));
 assert.ok(files.length,'Build the production export before running this check');
 const css=(await Promise.all(files.map(name=>readFile(new URL(name,chunkDir),'utf8')))).join('\n');
 const defined=new Set([...css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)].map(match=>match[1]));
 const consumers=['frontend/packages/ui-adapter/src/styles.css','frontend/apps/web/src/app/workspace-motion.css'];
 const recipes=(await Promise.all(consumers.map(file=>readFile(new URL(file,root),'utf8')))).join('\n');
 const names=new Set(recipes.match(/\b(?:content-(?:fade-(?:in|out)|rise-in)|feedback-exit|media-ready)\b/g));
 assert.ok(names.size>=5,'Expected the shared content and feedback recipes');
 for(const name of names)assert.ok(defined.has(name),`Missing executable keyframes: ${name}`);
});
