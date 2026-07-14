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
test('セブンは食費かつ削減可能',()=>{const p=parseTransaction('セブンでお昼 680円',[],now);assert.equal(p.category,'食費');assert.equal(p.foodNecessity,'削減可能');});
test('昨日の日付と店名を抽出',()=>{const p=parseTransaction('昨日コンビニでお菓子300円',[],now);assert.equal(p.transactionDate,'2026-07-10');assert.equal(p.merchant,'コンビニ');});
test('修正履歴を優先',()=>assert.equal(parseTransaction('謎カフェ 500円',[{keyword:'謎カフェ',category:'趣味',food_necessity:'未判定'}],now).category,'趣味'));
test('店名の修正履歴をキーワードより優先',()=>{const p=parseTransaction('スタバで勉強 600円',[{id:1,keyword:'勉強',category:'趣味'},{id:2,merchant:'スタバ',category:'生活費'}],now);assert.equal(p.category,'生活費');assert.equal(p.learnedRuleId,2);});
test('日付指定を抽出',()=>assert.equal(parseTransaction('7月10日に大戸屋で1280円',[],now).transactionDate,'2026-07-10'));
test('分類できない内容はその他',()=>assert.equal(parseTransaction('謎の買い物 100円',[],now).category,'その他'));
test('予算判定と予測',()=>{assert.equal(budgetStatus(92).label,'使いすぎ注意');assert.equal(monthlyProjection(10000,10,30),30000);});
