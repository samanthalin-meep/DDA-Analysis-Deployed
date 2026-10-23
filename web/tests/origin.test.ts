import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestOrigin,requireSameOrigin} from '../lib/session';
test('accepts the browser host when Next uses an internal development hostname',()=>{
  const request=new Request('http://0.0.0.0:3011/api/desktop',{headers:{Host:'localhost:3011',Origin:'http://localhost:3011'}});
  assert.equal(requestOrigin(request),'http://localhost:3011');
});
test('rejects another host, port, or protocol before a session mutation',()=>{
  for(const origin of ['https://other.example','https://app.example:444','http://app.example','null']){
    assert.throws(()=>requireSameOrigin(new Request('https://app.example/api/desktop',{headers:{Host:'app.example',Origin:origin}})));
  }
});
