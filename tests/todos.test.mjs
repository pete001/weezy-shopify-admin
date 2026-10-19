import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTodos,todoProgress,todoFilter,checked} from '../extensions/app-images/src/todos.mjs';

const charm=(id,extra={})=>({id,handle:id,title:id,reviewed:true,appHidden:false,appCategory:'charms',cutoutImageURL:null,appStory:null,...extra});
const products=[
 charm('a',{cutoutImageURL:'https://cdn.shopify.com/s/files/a.png',appStory:'A story'}),
 charm('b'),charm('c',{appStory:'Another'}),
 charm('hidden',{appHidden:true}),
 {...charm('ear'),appCategory:'earrings'},
 {...charm('new'),reviewed:false},
];

test('a product to-do counts only what it covers: visible charms, not hidden ones or earrings', () => {
 const cutout=todoProgress('cutout',products);
 assert.equal(cutout.total,4);
 assert.equal(cutout.done,1);
 assert.deepEqual(cutout.left.map(p=>p.id),['b','c','new']);
 assert.deepEqual(products.filter(todoFilter('story')).map(p=>p.id),['b','new']);
 assert.deepEqual(products.filter(todoFilter('review')).map(p=>p.id),['new']);
});

test('the To do list puts waiting customers first, links each to its filtered list and says when it is done', () => {
 const sets=[{id:'ok',name:'Ok',enabled:true,member_handles:['a','b','c']},{id:'short',name:'Short',enabled:true,member_handles:['a']},{id:'off',name:'Off',enabled:false,member_handles:[]}];
 const todos=buildTodos({products,sets,pending:2});
 assert.deepEqual(todos.map(t=>t.id),['purchases','sets','cutout','story','review']);
 assert.equal(todos[0].title,'2 purchases waiting for review');
 assert.equal(todos[1].title,'1 set needs attention');
 assert.equal(todos[1].total,2);
 assert.equal(todos[2].title,'3 charms need a cut-out');
 assert.equal(todos[2].href,'/images?todo=cutout');
 assert.equal(todos[3].href,'/stories?todo=story');
 assert.equal(todos[4].title,'1 product to check for the app');
 const done=buildTodos({products:[charm('a',{cutoutImageURL:'x',appStory:'y'})],sets:[],pending:0});
 assert.deepEqual(done.map(t=>[t.id,t.count]),[['purchases',0],['sets',0],['cutout',0],['story',0],['review',0]]);
 assert.equal(done[2].title,'Every charm has a cut-out');
});

test('finish photos come from the service check, with its progress and when it ran', () => {
 const now=Date.parse('2026-10-19T10:00:00Z');
 const [card]=buildTodos({finishes:{checkedAt:'2026-10-19T09:48:00Z',finishes:40,missing:7,needing:[]}});
 assert.equal(card.id,'finishes');assert.equal(card.title,'7 finishes need a photo');
 assert.equal(card.href,'/finishes?todo=finish');assert.equal(card.done,33);assert.equal(card.total,40);
 assert.equal(checked('2026-10-19T09:48:00Z',now),'12 minutes ago');assert.equal(checked('2026-10-19T09:59:30Z',now),'just now');
 assert.equal(buildTodos({finishes:{finishes:5,missing:0}})[0].title,'Every finish has its photo');
});

test('nothing loaded yet means nothing to show', () => {
 assert.deepEqual(buildTodos({}),[]);
 assert.deepEqual(buildTodos({pending:0}).map(t=>t.id),['purchases']);
});
