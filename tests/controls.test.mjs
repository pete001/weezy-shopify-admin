import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Window} from '@remote-dom/polyfill';

Window.setGlobal(new Window());
const {h,render}=await import('preact');
const source=readFileSync(new URL('../extensions/app-images/src/Controls.tsx',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll("from 'preact'",`from '${import.meta.resolve('preact')}'`);
const {Button,Clickable,TextField,SearchField,Checkbox}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('remote controls added after initial render deliver repeated clicks to current handlers',()=>{
 for(const Control of [Button,Clickable]){
  const root=document.createElement('div');document.body.appendChild(root);
  let order=['first','second'],calls=0;
  function draw(show){render(h('s-stack',{},show?h(Control,{onClick:()=>{calls++;order.reverse();draw(true);}},order[0]):null),root);}
  draw(false);draw(true);
  const button=root.firstChild.firstChild;
  button.dispatchEvent(new Event('click'));assert.equal(calls,1);assert.equal(order[0],'second');
  button.dispatchEvent(new Event('click'));assert.equal(calls,2);assert.equal(order[0],'first');
  render(null,root);root.remove();
 }
});

test('remote text, search and checkbox events deliver current values after rerender',()=>{
 for(const [Control,eventName,property,value] of [[TextField,'input','value','New set'],[SearchField,'input','value','Charm'],[Checkbox,'change','checked',true]]){
  const root=document.createElement('div');document.body.appendChild(root);let result,revision=0;
  const handler=e=>{result=[e.currentTarget[property],revision];};
  render(h(Control,{[eventName==='input'?'onInput':'onChange']:handler}),root);
  root.firstChild[property]=value;root.firstChild.dispatchEvent(new Event(eventName));assert.deepEqual(result,[value,0]);
  revision=1;render(h(Control,{[eventName==='input'?'onInput':'onChange']:e=>{result=['replacement',e.currentTarget[property]];}}),root);
  root.firstChild.dispatchEvent(new Event(eventName));assert.deepEqual(result,['replacement',value]);
  render(null,root);root.remove();
 }
});
