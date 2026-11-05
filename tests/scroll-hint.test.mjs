import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasContentBelow,scrollStep} from '../frontend/apps/web/src/host/scroll-metrics.ts';
test('scroll affordance respects the two-pixel bottom tolerance',()=>{
 assert.equal(hasContentBelow(1000,500,0),true);
 assert.equal(hasContentBelow(1000,500,497),true);
 assert.equal(hasContentBelow(1000,500,498),false);
 assert.equal(hasContentBelow(1000,500,500),false);
 assert.equal(hasContentBelow(1000,500,520),false);
});
test('no cue for hidden, loading, empty or short content',()=>{
 assert.equal(hasContentBelow(1000,0,0),false);
 assert.equal(hasContentBelow(1000,500,0,false),false);
 assert.equal(hasContentBelow(0,500,0),false);
 assert.equal(hasContentBelow(499,500,0),false);
 assert.equal(hasContentBelow(NaN,500,0),false);
});
test('negative touch overscroll and resize are handled',()=>{
 assert.equal(hasContentBelow(501,500,-20),false);
 assert.equal(hasContentBelow(1000,500,-20),true);
 assert.equal(hasContentBelow(1000,1000,0),false);
 assert.equal(scrollStep(500),400);
 assert.equal(scrollStep(0),0);
});
