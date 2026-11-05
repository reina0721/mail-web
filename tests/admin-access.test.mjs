import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptedBrowserRequest} from '../deploy/admin-access.mjs';
test('the SSH admin proxy rejects cross-origin writes, rebinding and open-proxy requests',()=>{
 const origin='http://127.0.0.1:4204',host='127.0.0.1:4204';
 assert.equal(acceptedBrowserRequest('GET','/api/v1/installation',{host},origin),true);
 assert.equal(acceptedBrowserRequest('PUT','/api/v1/installation/config',{host,origin},origin),true);
 assert.equal(acceptedBrowserRequest('PUT','/api/v1/installation/config',{host},origin),false);
 assert.equal(acceptedBrowserRequest('POST','/api/v1/auth/login',{host,origin:'https://attacker.example'},origin),false);
 assert.equal(acceptedBrowserRequest('GET','/',{host:'attacker.example:4204'},origin),false);
 assert.equal(acceptedBrowserRequest('GET','http://attacker.example/',{host},origin),false);
 assert.equal(acceptedBrowserRequest('GET','//attacker.example/',{host},origin),false);
});
