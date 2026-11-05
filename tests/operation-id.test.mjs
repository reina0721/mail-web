import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationId} from '../frontend/apps/web/src/host/operation-id.ts';
test('idempotency IDs remain valid UUIDs without the secure-context-only convenience method',()=>{
 const source={getRandomValues:array=>{array.forEach((_,index)=>array[index]=index);return array;}};
 assert.equal(operationId(source),'00010203-0405-4607-8809-0a0b0c0d0e0f');
 const random={getRandomValues:crypto.getRandomValues.bind(crypto)};
 const ids=new Set(Array.from({length:100},()=>operationId(random)));
 assert.equal(ids.size,100);
 for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
