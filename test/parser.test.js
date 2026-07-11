const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTransaction } = require('../src/services/parser');
const { budgetStatus, monthlyProjection } = require('../src/services/finance');

const now = new Date(2026,6,11);
test('指定された自然文を分類できる',()=>{
  const cases=[
    ['セブンでお昼 680円','食費',680],['スタバ 550円','食費',550],['日吉から渋谷 電車 230円','交通費',230],
    ['Amazonで洗剤 1200円','生活費',1200],['映画 2000円','趣味',2000],['給料 120000円','収入',120000]
  ];
  for(const [text,category,amount] of cases){const p=parseTransaction(text,[],now);assert.equal(p.category,category);assert.equal(p.amount,amount);}
});
test('スタバは削減可能',()=>assert.equal(parseTransaction('スタバ 550円',[],now).foodNecessity,'削減可能'));
test('昨日の日付を抽出',()=>assert.equal(parseTransaction('昨日コンビニでお菓子300円',[],now).transactionDate,'2026-07-10'));
test('修正履歴を優先',()=>assert.equal(parseTransaction('謎カフェ 500円',[{keyword:'謎カフェ',category:'趣味',food_necessity:'未判定'}],now).category,'趣味'));
test('予算判定と予測',()=>{assert.equal(budgetStatus(92).label,'使いすぎ注意');assert.equal(monthlyProjection(10000,10,30),30000);});
