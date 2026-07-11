const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { query } = require('./db');
const { parseTransaction } = require('./services/parser');
const { budgetStatus, monthlyProjection } = require('./services/finance');

const app = express();
const categories = ['食費','交通費','生活費','趣味','固定費','その他','収入'];
const foodOptions = ['必要支出','削減可能','未判定'];
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'..','views'));
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.urlencoded({extended:false,limit:'50kb'}));
app.use(express.json({limit:'50kb'}));
app.use(express.static(path.join(__dirname,'..','public')));
app.use(session({secret:process.env.SESSION_SECRET || 'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));
app.use((req,res,next)=>{req.userId=1;res.locals.path=req.path;res.locals.categories=categories;res.locals.foodOptions=foodOptions;res.locals.notice=req.session.notice;delete req.session.notice;next();});

function monthBounds(value) {
  const m = /^\d{4}-\d{2}$/.test(value||'') ? value : new Date().toISOString().slice(0,7);
  return {month:m,start:`${m}-01`};
}
function positiveInt(value) { const n=Number(value); return Number.isInteger(n)&&n>0?n:null; }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value||'') ? value : null; }
function sendError(res,message,status=400){return res.status(status).render('error',{title:'入力エラー',status,message});}

async function ensureFixedCosts(userId, month) {
  await query(`INSERT INTO transactions(user_id,type,amount,title,merchant,category,food_necessity,transaction_date,original_text,classification_confidence,memo,is_fixed_cost,fixed_cost_id,payment_status)
    SELECT f.user_id,'expense',f.amount,f.name,f.name,f.category,'未判定',
      (date_trunc('month',$2::date)+(LEAST(f.billing_day,EXTRACT(day FROM (date_trunc('month',$2::date)+interval '1 month - 1 day')))::int-1)*interval '1 day')::date,
      f.name || '（固定費予定）','high',f.memo,TRUE,f.id,'scheduled'
    FROM fixed_costs f WHERE f.user_id=$1 AND f.is_active=TRUE AND f.start_month <= $2::date
      AND (f.end_month IS NULL OR f.end_month >= $2::date)
    ON CONFLICT (fixed_cost_id,transaction_date) DO NOTHING`,[userId,`${month}-01`]);
}

app.get('/health',async(req,res)=>{try{const result=await query('SELECT NOW() AS now');res.json({status:'ok',database:'connected',time:result.rows[0].now});}catch(e){res.status(503).json({status:'error',database:'disconnected'});}});

app.get('/',async(req,res,next)=>{try{
  const {month,start}=monthBounds(req.query.month); await ensureFixedCosts(req.userId,month);
  const [userR, totalsR, categoryR, budgetsR, recentR, foodR] = await Promise.all([
    query('SELECT * FROM users WHERE id=$1',[req.userId]),
    query(`SELECT COALESCE(SUM(amount) FILTER(WHERE type='income' AND payment_status='paid'),0)::int income,
      COALESCE(SUM(amount) FILTER(WHERE type='expense' AND payment_status='paid'),0)::int spent,
      COALESCE(SUM(amount) FILTER(WHERE type='expense' AND category='固定費'),0)::int fixed
      FROM transactions WHERE user_id=$1 AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start]),
    query(`SELECT category,COALESCE(SUM(amount),0)::int amount FROM transactions WHERE user_id=$1 AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month' GROUP BY category`,[req.userId,start]),
    query('SELECT * FROM budget_settings WHERE user_id=$1 ORDER BY id',[req.userId]),
    query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC,id DESC LIMIT 6',[req.userId]),
    query(`SELECT COALESCE(SUM(amount) FILTER(WHERE category='食費'),0)::int total,COALESCE(SUM(amount) FILTER(WHERE category='食費' AND food_necessity='削減可能'),0)::int reducible FROM transactions WHERE user_id=$1 AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start])
  ]);
  const user=userR.rows[0], totals=totalsR.rows[0], byCategory=Object.fromEntries(categoryR.rows.map(r=>[r.category,r.amount]));
  const baseIncome=totals.income||user.monthly_income, available=Math.max(0,baseIncome-user.saving_target), rate=available?Math.round(totals.spent/available*100):0;
  const now=new Date(), projection=monthlyProjection(totals.spent,month===now.toISOString().slice(0,7)?now.getDate():new Date(+month.slice(0,4),+month.slice(5),0).getDate(),new Date(+month.slice(0,4),+month.slice(5),0).getDate());
  const budgetRows=budgetsR.rows.filter(b=>b.category!=='貯金').map(b=>{const limit=b.fixed_amount||Math.round(baseIncome*Number(b.percentage)/100);const used=byCategory[b.category]||0;return {...b,limit,used,rate:limit?Math.round(used/limit*100):0};});
  let advice=`今月は${budgetStatus(rate).label}です。`;
  const hot=budgetRows.sort((a,b)=>b.rate-a.rate)[0]; if(hot&&hot.rate>=70) advice+=`${hot.category}に目安額の${hot.rate}%を使っています。`;
  if(projection>available) advice+=`今のペースでは月末に約${(projection-available).toLocaleString('ja-JP')}円超える可能性があります。`;
  if(foodR.rows[0].reducible>0) advice+=`削減可能な食費が${foodR.rows[0].reducible.toLocaleString('ja-JP')}円あります。`;
  res.render('dashboard',{title:'ホーム',month,user,totals,available,rate,status:budgetStatus(rate),projection,budgetRows,recent:recentR.rows,food:foodR.rows[0],advice});
}catch(e){next(e);}});

app.get('/input',(req,res)=>res.render('input',{title:'かんたん入力',parsed:null,text:''}));
app.post('/transactions/parse',async(req,res,next)=>{try{const text=String(req.body.text||'').trim();if(!text)return sendError(res,'入力文を入力してください。');const rules=(await query('SELECT * FROM classification_rules WHERE user_id=$1 ORDER BY priority DESC',[req.userId])).rows;const parsed=parseTransaction(text,rules);if(!parsed.amount)return sendError(res,'金額を「680円」のように入力してください。');if(req.accepts('json')==='json')return res.json(parsed);res.render('input',{title:'解析結果',parsed,text});}catch(e){next(e);}});
app.post('/transactions',async(req,res,next)=>{try{
  const amount=positiveInt(req.body.amount),date=validDate(req.body.transaction_date),category=categories.includes(req.body.category)?req.body.category:'その他';
  if(!amount||!date)return sendError(res,'金額と日付を正しく入力してください。');
  const type=req.body.type==='income'||category==='収入'?'income':'expense';
  await query(`INSERT INTO transactions(user_id,type,amount,title,merchant,category,food_necessity,transaction_date,original_text,classification_confidence,memo,payment_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paid')`,[req.userId,type,amount,String(req.body.title||'支出').slice(0,160),String(req.body.merchant||'').slice(0,120)||null,category,foodOptions.includes(req.body.food_necessity)?req.body.food_necessity:'未判定',date,String(req.body.original_text||'').slice(0,1000),String(req.body.classification_confidence||'low').slice(0,10),String(req.body.memo||'').slice(0,2000)]);
  req.session.notice='この内容で登録しました';res.redirect('/input');
}catch(e){next(e);}});

app.get('/transactions',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);const result=await query(`SELECT * FROM transactions WHERE user_id=$1 AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month' ORDER BY transaction_date DESC,id DESC`,[req.userId,start]);res.render('transactions',{title:'支出履歴',month,transactions:result.rows});}catch(e){next(e);}});
app.get('/transactions/:id',async(req,res,next)=>{try{const result=await query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);if(!result.rowCount)return sendError(res,'記録が見つかりません。',404);res.render('transaction-edit',{title:'記録を編集',transaction:result.rows[0]});}catch(e){next(e);}});
app.post('/transactions/:id/update',async(req,res,next)=>{try{
  const old=(await query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2',[req.params.id,req.userId])).rows[0];if(!old)return sendError(res,'記録が見つかりません。',404);
  const amount=positiveInt(req.body.amount),date=validDate(req.body.transaction_date),category=categories.includes(req.body.category)?req.body.category:'その他';if(!amount||!date)return sendError(res,'入力値を確認してください。');
  await query(`UPDATE transactions SET amount=$1,title=$2,merchant=$3,category=$4,food_necessity=$5,transaction_date=$6,memo=$7,payment_status=$8,type=$9,updated_at=NOW() WHERE id=$10 AND user_id=$11`,[amount,String(req.body.title||'支出').slice(0,160),String(req.body.merchant||'').slice(0,120)||null,category,foodOptions.includes(req.body.food_necessity)?req.body.food_necessity:'未判定',date,String(req.body.memo||'').slice(0,2000),req.body.payment_status==='scheduled'?'scheduled':'paid',category==='収入'?'income':'expense',req.params.id,req.userId]);
  if(old.category!==category){const keyword=(old.merchant||old.title).slice(0,120);await query(`INSERT INTO classification_rules(user_id,keyword,merchant,category,food_necessity,priority) VALUES($1,$2,$3,$4,$5,100)`,[req.userId,keyword,old.merchant,category,req.body.food_necessity||'未判定']);}
  req.session.notice='記録を更新しました';res.redirect(`/transactions/${req.params.id}`);
}catch(e){next(e);}});
app.post('/transactions/:id/delete',async(req,res,next)=>{try{const result=await query('DELETE FROM transactions WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.userId]);if(!result.rowCount)return sendError(res,'記録が見つかりません。',404);req.session.notice='記録を削除しました';res.redirect('/transactions');}catch(e){next(e);}});

app.get('/calendar',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);await ensureFixedCosts(req.userId,month);const result=await query(`SELECT * FROM transactions WHERE user_id=$1 AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month' ORDER BY transaction_date,id`,[req.userId,start]);res.render('calendar',{title:'カレンダー',month,transactions:result.rows});}catch(e){next(e);}});
app.get('/analysis',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);const [cats,food]=await Promise.all([query(`SELECT category,SUM(amount)::int amount FROM transactions WHERE user_id=$1 AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month' GROUP BY category ORDER BY amount DESC`,[req.userId,start]),query(`SELECT COALESCE(SUM(amount),0)::int total,COALESCE(SUM(amount) FILTER(WHERE food_necessity='必要支出'),0)::int necessary,COALESCE(SUM(amount) FILTER(WHERE food_necessity='削減可能'),0)::int reducible FROM transactions WHERE user_id=$1 AND category='食費' AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start])]);const f=food.rows[0];f.ratio=f.total?Math.round(f.reducible/f.total*100):0;res.render('analysis',{title:'月次分析',month,categoriesData:cats.rows,food:f});}catch(e){next(e);}});

app.get('/fixed-costs',async(req,res,next)=>{try{const result=await query('SELECT * FROM fixed_costs WHERE user_id=$1 ORDER BY is_active DESC,billing_day,name',[req.userId]);res.render('fixed-costs',{title:'固定費管理',fixedCosts:result.rows});}catch(e){next(e);}});
app.post('/fixed-costs',async(req,res,next)=>{try{const amount=positiveInt(req.body.amount),day=positiveInt(req.body.billing_day);if(!amount||!day||day>31||!/^\d{4}-\d{2}$/.test(req.body.start_month||''))return sendError(res,'固定費の入力値を確認してください。');await query(`INSERT INTO fixed_costs(user_id,name,amount,category,billing_day,is_active,start_month,end_month,memo) VALUES($1,$2,$3,$4,$5,TRUE,$6::date,NULLIF($7,'')::date,$8)`,[req.userId,String(req.body.name||'').slice(0,120),amount,categories.includes(req.body.category)?req.body.category:'固定費',day,`${req.body.start_month}-01`,req.body.end_month?`${req.body.end_month}-01`:'',String(req.body.memo||'').slice(0,2000)]);req.session.notice='固定費を登録しました';res.redirect('/fixed-costs');}catch(e){next(e);}});
app.post('/fixed-costs/:id/update',async(req,res,next)=>{try{const amount=positiveInt(req.body.amount),day=positiveInt(req.body.billing_day);if(!amount||!day||day>31)return sendError(res,'固定費の入力値を確認してください。');await query(`UPDATE fixed_costs SET name=$1,amount=$2,category=$3,billing_day=$4,is_active=$5,memo=$6,updated_at=NOW() WHERE id=$7 AND user_id=$8`,[String(req.body.name||'').slice(0,120),amount,categories.includes(req.body.category)?req.body.category:'固定費',day,req.body.is_active==='on',String(req.body.memo||'').slice(0,2000),req.params.id,req.userId]);req.session.notice='固定費を更新しました';res.redirect('/fixed-costs');}catch(e){next(e);}});
app.post('/fixed-costs/:id/delete',async(req,res,next)=>{try{await query('DELETE FROM fixed_costs WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);req.session.notice='固定費を削除しました';res.redirect('/fixed-costs');}catch(e){next(e);}});

app.get('/settings',async(req,res,next)=>{try{const [u,b]=await Promise.all([query('SELECT * FROM users WHERE id=$1',[req.userId]),query('SELECT * FROM budget_settings WHERE user_id=$1 ORDER BY id',[req.userId])]);res.render('settings',{title:'設定',user:u.rows[0],budgets:b.rows});}catch(e){next(e);}});
app.post('/settings/income',async(req,res,next)=>{try{const income=Number(req.body.monthly_income),saving=Number(req.body.saving_target),payday=Number(req.body.payday);if(!Number.isInteger(income)||income<0||!Number.isInteger(saving)||saving<0||!Number.isInteger(payday)||payday<1||payday>31)return sendError(res,'設定値を確認してください。');await query('UPDATE users SET monthly_income=$1,payday=$2,saving_target=$3,updated_at=NOW() WHERE id=$4',[income,payday,saving,req.userId]);req.session.notice='収入設定を保存しました';res.redirect('/settings');}catch(e){next(e);}});
app.post('/settings/budgets',async(req,res,next)=>{try{for(const category of ['固定費','食費','交通費','生活費','趣味','貯金']){const p=Number(req.body[`percentage_${category}`]);if(!Number.isFinite(p)||p<0||p>100)return sendError(res,'割合は0〜100で入力してください。');await query(`INSERT INTO budget_settings(user_id,category,percentage) VALUES($1,$2,$3) ON CONFLICT(user_id,category) DO UPDATE SET percentage=EXCLUDED.percentage,updated_at=NOW()`,[req.userId,category,p]);}req.session.notice='予算設定を保存しました';res.redirect('/settings');}catch(e){next(e);}});

app.use((req,res)=>res.status(404).render('error',{title:'ページが見つかりません',status:404,message:'URLをご確認ください。'}));
app.use((err,req,res,next)=>{console.error(err.message);if(res.headersSent)return next(err);res.status(500).render('error',{title:'エラー',status:500,message:process.env.NODE_ENV==='production'?'処理中にエラーが発生しました。しばらくしてからお試しください。':err.message});});
module.exports = app;

