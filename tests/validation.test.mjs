import test from 'node:test';
import assert from 'node:assert/strict';
import {localUrl,validateTargets,validateAction} from '../server/validation.mjs';
test('local targets reject remote hosts, credentials, protocols and control API',()=>{
  for(const url of ['https://example.com','http://localhost.evil.test','http://user:pass@localhost:4000','file:///etc/passwd','http://127.0.0.1:4321/api/session'])assert.throws(()=>localUrl(url,4321));
  assert.equal(localUrl('http://localhost:3000',4321),'http://localhost:3000/');
  assert.equal(localUrl('http://127.0.0.1:4321/fixtures/a',4321),'http://127.0.0.1:4321/fixtures/a');
});
test('two or three named targets only',()=>{
  assert.throws(()=>validateTargets([],4321));
  assert.throws(()=>validateTargets(Array(4).fill({url:'http://localhost:3000'}),4321));
  assert.equal(validateTargets([{url:'http://localhost:3000'},{url:'http://localhost:3001'}],4321)[1].name,'Variant 2');
});
test('actions have bounded inputs and known roles',()=>{
  assert.throws(()=>validateAction({kind:'fill',target:{role:'textbox',name:'Title'},value:'x'.repeat(4001)}));
  assert.throws(()=>validateAction({kind:'press',value:'Control+L'}));
  assert.throws(()=>validateAction({kind:'click',target:{role:'script',name:'x'}}));
  assert.equal(validateAction({kind:'press',value:'Enter'}).value,'Enter');
});
