import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { streamTurn } from './stream.mjs';

function processFixture() {
  const child = new EventEmitter(); child.stdout = new PassThrough();
  const requests = [];
  const event = (method, params) => child.stdout.write(JSON.stringify({method,params}) + '\n');
  child.stdin = new Writable({write(chunk, _encoding, next) {
    const message = JSON.parse(chunk.toString()); requests.push(message);
    if (message.id && message.method) queueMicrotask(() => child.stdout.write(JSON.stringify({id:message.id,result:message.method==='thread/start'?{thread:{id:'thread-1'}}:{}})+'\n'));
    next();
  }});
  child.stdin.on('finish', () => child.emit('close',0));
  return {child,requests,event};
}
test('real deltas arrive before turn completion; completed message does not duplicate text',async()=>{
  const {child,requests,event}=processFixture(), chunks=[],report={answer:'',completedTurns:0,failed:false};
  await streamTurn(child,{model:'gpt-6.1-sol',effort:'high'},'review',report,text=>chunks.push(text),()=>assert.fail('unexpected stop'));
  assert.equal(requests.find(r=>r.method==='thread/start').params.ephemeral,true);
  assert.equal(requests.find(r=>r.method==='turn/start').params.input[0].text,'review');
  event('item/started',{item:{id:'a',type:'agentMessage',phase:'final_answer'}});
  event('item/agentMessage/delta',{itemId:'a',delta:'市场'});
  event('item/agentMessage/delta',{itemId:'a',delta:'承压'});
  assert(chunks.includes('市场'));assert.equal(report.completedTurns,0);assert.equal(report.answer,'市场承压');
  event('item/completed',{item:{id:'a',type:'agentMessage',phase:'final_answer',text:'市场承压'}});
  event('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:100,cachedInputTokens:30,outputTokens:20,reasoningOutputTokens:5}}});
  event('turn/completed',{turn:{status:'completed'}});
  assert.equal(report.answer,'市场承压');assert.equal(report.completedTurns,1);assert.equal(report.usage.output_tokens,20);
});
test('tool attempts are stopped and failed/interrupted turns are not completed',async()=>{
  for(const type of ['commandExecution','mcpToolCall','webSearch','fileChange']) {
    const {child,event}=processFixture(), report={answer:'',completedTurns:0,failed:false};let stops=0;
    await streamTurn(child,{model:'gpt-6.1-sol',effort:'high'},'review',report,()=>{},()=>{stops++;});
    event('item/started',{item:{id:'tool',type}});assert.equal(report.toolAttempt,true);assert.equal(stops,1);
    event('turn/completed',{turn:{status:'interrupted'}});assert.equal(report.completedTurns,0);assert.equal(report.failed,true);
  }
});
