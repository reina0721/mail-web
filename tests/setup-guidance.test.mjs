import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeStalwart} from '../frontend/apps/web/src/host/stalwart-origin.ts';

test('service origins preserve HTTPS ports without accepting credentials or unrelated paths',()=>{
 assert.equal(normalizeStalwart('mail.example.com:8443'),'https://mail.example.com:8443');
 assert.equal(normalizeStalwart('https://mail.example.com/admin/'),'https://mail.example.com');
 assert.equal(normalizeStalwart('https://mail.example.com/account'),'https://mail.example.com');
 for(const value of ['http://mail.example.com','https://user:key@mail.example.com','https://mail.example.com/jmap/','https://mail.example.com/?token=secret','javascript:alert(1)','https://mail.example.com/#secret'])assert.equal(normalizeStalwart(value),'');
});

test('every contextual setup tutorial link has a real GitHub anchor',async()=>{
 const doc=await readFile(new URL('../docs/stalwart-setup.md',import.meta.url),'utf8');
 const editor=await readFile(new URL('../frontend/apps/web/src/features/installation-editor.tsx',import.meta.url),'utf8');
 const topics=[...editor.matchAll(/help\('([\w-]+)'\)/g)].map(m=>m[1]);
 assert.ok(topics.length>=10);
 for(const topic of topics)assert.ok(doc.includes(`id="${topic}"`),`Missing tutorial destination: ${topic}`);
 for(const identity of ['Secret','Key ID','账号 ID','安装管理令牌','API Keys','MTA Hook','Turnstile'])assert.ok(doc.includes(identity));
});
