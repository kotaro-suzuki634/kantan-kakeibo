const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTransaction } = require('../src/services/transaction-validator');

const food={id:1,name:'食費',type:'expense',is_active:true};
const income={id:2,name:'収入',type:'income',is_active:true};
const base={type:'expense',amount:'680',title:'お昼',merchant:'セブン',transaction_date:'2026-07-11',food_necessity:'削減可能'};

test('編集した支出を検証して正規化できる',()=>{const r=validateTransaction(base,food);assert.deepEqual(r.errors,[]);assert.equal(r.value.amount,680);assert.equal(r.value.foodNecessity,'削減可能');});
test('金額は正の整数だけ受け付ける',()=>assert.match(validateTransaction({...base,amount:'-1'},food).errors.join(' '),/1円以上/));
test('存在しないカテゴリーを拒否する',()=>assert.match(validateTransaction(base,null).errors.join(' '),/カテゴリー/));
test('停止中カテゴリーを拒否する',()=>assert.match(validateTransaction(base,{...food,is_active:false}).errors.join(' '),/カテゴリー/));
test('収支区分とカテゴリー種別の不一致を拒否する',()=>assert.match(validateTransaction(base,income).errors.join(' '),/収支区分/));
test('食費以外では食費判定を保存しない',()=>{const r=validateTransaction({...base,type:'income'},income);assert.equal(r.value.foodNecessity,null);});
test('内容か店名のどちらかは必須',()=>assert.match(validateTransaction({...base,title:'',merchant:''},food).errors.join(' '),/内容または店名/));
test('不正な日付を拒否する',()=>assert.match(validateTransaction({...base,transaction_date:'bad'},food).errors.join(' '),/日付/));
