const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { query } = require('./db');
const { parseTransaction } = require('./services/parser');
const { budgetStatus, monthlyProjection } = require('./services/finance');
const { validateTransaction, FOOD_OPTIONS } = require('./services/transaction-validator');

const app = express();
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'..','views'));
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.urlencoded({extended:false,limit:'50kb'}));
app.use(express.json({limit:'50kb'}));
app.use(express.static(path.join(__dirname,'..','public')));
app.use(session({secret:process.env.SESSION_SECRET || 'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));

function monthBounds(value) {
  const m = /^\d{4}-\d{2}$/.test(value||'') ? value : new Date().toISOString().slice(0,7);
  return {month:m,start:`${m}-01`};
}
function positiveInt(value) { const n=Number(value); return Number.isInteger(n)&&n>0?n:null; }
function sendError(res,message,status=400){return res.status(status).render('error',{title:'入力エラー',status,message});}
function bool(value){return value==='on'||value==='true'||value==='1';}
function validColor(value){return /^#[0-9a-fA-F]{6}$/.test(value||'')?value:'#718078';}

app.get('/health',async(req,res)=>{try{const result=await query('SELECT NOW() AS now');res.json({status:'ok',database:'connected',time:result.rows[0].now});}catch(e){res.status(503).json({status:'error',database:'disconnected'});}});

app.use(async(req,res,next)=>{try{
  req.userId=1;res.locals.path=req.path;res.locals.foodOptions=FOOD_OPTIONS;res.locals.notice=req.session.notice;delete req.session.notice;
  const result=await query(`SELECT * FROM categories WHERE user_id=$1 AND is_active=TRUE ORDER BY type DESC,sort_order,name`,[req.userId]);
  req.categories=result.rows;res.locals.categories=result.rows;next();
}catch(e){next(e);}});

async function findCategory(userId,id,{activeOnly=true}={}) {
  const result=await query(`SELECT * FROM categories WHERE id=$1 AND user_id=$2 ${activeOnly?'AND is_active=TRUE':''}`,[id,userId]);
  return result.rows[0]||null;
}

async function ensureFixedCosts(userId, month) {
  await query(`INSERT INTO transactions(user_id,type,amount,title,merchant,category,category_id,food_necessity,transaction_date,original_text,classification_confidence,memo,is_fixed_cost,fixed_cost_id,payment_status)
    SELECT f.user_id,'expense',f.amount,f.name,f.name,f.category,f.category_id,NULL,
      (date_trunc('month',$2::date)+(LEAST(f.billing_day,EXTRACT(day FROM (date_trunc('month',$2::date)+interval '1 month - 1 day')))::int-1)*interval '1 day')::date,
      f.name || '（固定費予定）','high',f.memo,TRUE,f.id,'scheduled'
    FROM fixed_costs f WHERE f.user_id=$1 AND f.is_active=TRUE AND f.start_month <= $2::date
      AND (f.end_month IS NULL OR f.end_month >= $2::date)
    ON CONFLICT (fixed_cost_id,transaction_date) DO NOTHING`,[userId,`${month}-01`]);
}

app.get('/',async(req,res,next)=>{try{
  const {month,start}=monthBounds(req.query.month); await ensureFixedCosts(req.userId,month);
  const [userR, totalsR, categoryR, budgetsR, recentR, foodR] = await Promise.all([
    query('SELECT * FROM users WHERE id=$1',[req.userId]),
    query(`SELECT COALESCE(SUM(amount) FILTER(WHERE type='income' AND payment_status='paid'),0)::int income,
      COALESCE(SUM(amount) FILTER(WHERE type='expense' AND payment_status='paid'),0)::int spent,
      COALESCE(SUM(amount) FILTER(WHERE type='expense' AND category='固定費'),0)::int fixed
      FROM transactions WHERE user_id=$1 AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start]),
    query(`SELECT category,COALESCE(SUM(amount),0)::int amount FROM transactions WHERE user_id=$1 AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month' GROUP BY category`,[req.userId,start]),
    query(`SELECT b.*,COALESCE(c.name,b.category) category,COALESCE(c.color,'#718078') color FROM budget_settings b LEFT JOIN categories c ON c.id=b.category_id WHERE b.user_id=$1 ORDER BY COALESCE(c.sort_order,b.id)`,[req.userId]),
    query(`SELECT t.*,COALESCE(c.color,'#718078') category_color,COALESCE(c.icon,LEFT(t.category,1)) category_icon FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.user_id=$1 ORDER BY t.transaction_date DESC,t.id DESC LIMIT 6`,[req.userId]),
    query(`SELECT COALESCE(SUM(amount) FILTER(WHERE category='食費'),0)::int total,COALESCE(SUM(amount) FILTER(WHERE category='食費' AND food_necessity='削減可能'),0)::int reducible FROM transactions WHERE user_id=$1 AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start])
  ]);
  const user=userR.rows[0], totals=totalsR.rows[0], byCategory=Object.fromEntries(categoryR.rows.map(r=>[r.category,r.amount]));
  const baseIncome=totals.income||user.monthly_income, available=Math.max(0,baseIncome-user.saving_target), rate=available?Math.round(totals.spent/available*100):0;
  const now=new Date(), projection=monthlyProjection(totals.spent,month===now.toISOString().slice(0,7)?now.getDate():new Date(+month.slice(0,4),+month.slice(5),0).getDate(),new Date(+month.slice(0,4),+month.slice(5),0).getDate());
  const budgetRows=budgetsR.rows.filter(b=>b.category!=='貯金').map(b=>{const limit=b.fixed_amount||Math.round(baseIncome*Number(b.percentage)/100);const used=byCategory[b.category]||0;return {...b,limit,used,rate:limit?Math.round(used/limit*100):0};});
  let advice=`今月は${budgetStatus(rate).label}です。`;
  const hot=[...budgetRows].sort((a,b)=>b.rate-a.rate)[0]; if(hot&&hot.rate>=70) advice+=`${hot.category}に目安額の${hot.rate}%を使っています。`;
  if(projection>available) advice+=`今のペースでは月末に約${(projection-available).toLocaleString('ja-JP')}円超える可能性があります。`;
  if(foodR.rows[0].reducible>0) advice+=`削減可能な食費が${foodR.rows[0].reducible.toLocaleString('ja-JP')}円あります。`;
  res.render('dashboard',{title:'ホーム',month,user,totals,available,rate,status:budgetStatus(rate),projection,budgetRows,recent:recentR.rows,food:foodR.rows[0],advice});
}catch(e){next(e);}});

app.get('/input',(req,res)=>res.render('input',{title:'かんたん入力',parsed:null,text:'',editMode:false,errors:[]}));
app.post('/transactions/parse',async(req,res,next)=>{try{
  const text=String(req.body.text||'').trim();if(!text)return sendError(res,'入力文を入力してください。');
  const rules=(await query(`SELECT * FROM classification_rules WHERE user_id=$1 ORDER BY priority DESC,use_count DESC,COALESCE(corrected_at,created_at) DESC`,[req.userId])).rows;
  const parsed=parseTransaction(text,rules);if(!parsed.amount)return sendError(res,'金額を「680円」のように入力してください。');
  const category=req.categories.find(c=>c.name===parsed.category&&c.type===parsed.type) || req.categories.find(c=>c.name===(parsed.type==='income'?'収入':'その他'));
  parsed.categoryId=category?.id;parsed.category=category?.name||parsed.category;
  if(parsed.learnedRuleId) await query('UPDATE classification_rules SET use_count=use_count+1,updated_at=NOW() WHERE id=$1 AND user_id=$2',[parsed.learnedRuleId,req.userId]);
  if(req.xhr||String(req.get('accept')||'').includes('application/json'))return res.json(parsed);
  res.render('input',{title:'解析結果',parsed,text,editMode:false,errors:[]});
}catch(e){next(e);}});

async function registerTransaction(req,res,next,learnCorrection=false){try{
  const category=await findCategory(req.userId,Number(req.body.category_id));
  const checked=validateTransaction(req.body,category);
  if(checked.errors.length){const parsed={...checked.value,categoryId:Number(req.body.category_id)||null,transactionDate:req.body.transaction_date,originalText:req.body.original_text,foodNecessity:req.body.food_necessity,confidence:req.body.classification_confidence};return res.status(400).render('input',{title:'内容を確認',parsed,text:req.body.original_text||'',editMode:true,errors:checked.errors});}
  const v=checked.value;
  await query(`INSERT INTO transactions(user_id,type,amount,title,merchant,category,category_id,food_necessity,transaction_date,original_text,classification_confidence,memo,payment_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'paid')`,[req.userId,v.type,v.amount,v.title,v.merchant,v.category,v.categoryId,v.foodNecessity,v.transactionDate,v.originalText,v.confidence,v.memo]);
  const autoId=Number(req.body.auto_category_id)||null;
  if(learnCorrection&&autoId&&autoId!==v.categoryId){
    const keyword=(v.merchant||v.title).slice(0,120);
    await query(`INSERT INTO classification_rules(user_id,keyword,merchant,category,category_id,auto_category_id,corrected_category_id,original_text,food_necessity,priority,use_count,corrected_at)
      VALUES($1,$2,$3,$4,$5,$6,$5,$7,$8,100,0,NOW())`,[req.userId,keyword,v.merchant,v.category,v.categoryId,autoId,v.originalText,v.foodNecessity||'未判定']);
  }
  req.session.notice='この内容で登録しました';res.redirect('/input');
}catch(e){next(e);}}
app.post('/transactions',registerTransaction);
app.post('/transactions/register-edited',(req,res,next)=>registerTransaction(req,res,next,true));

app.get('/transactions',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);const result=await query(`SELECT t.*,COALESCE(c.color,'#718078') category_color,COALESCE(c.icon,LEFT(t.category,1)) category_icon FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.user_id=$1 AND t.transaction_date>=date_trunc('month',$2::date) AND t.transaction_date<date_trunc('month',$2::date)+interval '1 month' ORDER BY t.transaction_date DESC,t.id DESC`,[req.userId,start]);res.render('transactions',{title:'支出履歴',month,transactions:result.rows});}catch(e){next(e);}});
app.get('/transactions/:id',async(req,res,next)=>{try{const result=await query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);if(!result.rowCount)return sendError(res,'記録が見つかりません。',404);res.render('transaction-edit',{title:'記録を編集',transaction:result.rows[0],errors:[]});}catch(e){next(e);}});
app.post('/transactions/:id/update',async(req,res,next)=>{try{
  const old=(await query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2',[req.params.id,req.userId])).rows[0];if(!old)return sendError(res,'記録が見つかりません。',404);
  const category=await findCategory(req.userId,Number(req.body.category_id));const checked=validateTransaction(req.body,category);
  if(checked.errors.length)return res.status(400).render('transaction-edit',{title:'記録を編集',transaction:{...old,...req.body,category_id:Number(req.body.category_id)},errors:checked.errors});
  const v=checked.value;
  await query(`UPDATE transactions SET amount=$1,title=$2,merchant=$3,category=$4,category_id=$5,food_necessity=$6,transaction_date=$7,memo=$8,payment_status=$9,type=$10,updated_at=NOW() WHERE id=$11 AND user_id=$12`,[v.amount,v.title,v.merchant,v.category,v.categoryId,v.foodNecessity,v.transactionDate,v.memo,req.body.payment_status==='scheduled'?'scheduled':'paid',v.type,req.params.id,req.userId]);
  if(Number(old.category_id)!==v.categoryId){const keyword=(old.merchant||old.title).slice(0,120);await query(`INSERT INTO classification_rules(user_id,keyword,merchant,category,category_id,auto_category_id,corrected_category_id,original_text,food_necessity,priority,use_count,corrected_at) VALUES($1,$2,$3,$4,$5,$6,$5,$7,$8,100,0,NOW())`,[req.userId,keyword,old.merchant,v.category,v.categoryId,old.category_id,old.original_text,v.foodNecessity||'未判定']);}
  req.session.notice='記録を更新しました';res.redirect(`/transactions/${req.params.id}`);
}catch(e){next(e);}});
app.post('/transactions/:id/delete',async(req,res,next)=>{try{const result=await query('DELETE FROM transactions WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.userId]);if(!result.rowCount)return sendError(res,'記録が見つかりません。',404);req.session.notice='記録を削除しました';res.redirect('/transactions');}catch(e){next(e);}});

app.get('/calendar',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);await ensureFixedCosts(req.userId,month);const result=await query(`SELECT t.*,COALESCE(c.color,'#718078') category_color,COALESCE(c.icon,LEFT(t.category,1)) category_icon FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.user_id=$1 AND t.transaction_date>=date_trunc('month',$2::date) AND t.transaction_date<date_trunc('month',$2::date)+interval '1 month' ORDER BY t.transaction_date,t.id`,[req.userId,start]);res.render('calendar',{title:'カレンダー',month,transactions:result.rows});}catch(e){next(e);}});
app.get('/analysis',async(req,res,next)=>{try{const {month,start}=monthBounds(req.query.month);const [cats,food]=await Promise.all([query(`SELECT t.category,COALESCE(c.color,'#718078') color,SUM(t.amount)::int amount FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.user_id=$1 AND t.type='expense' AND t.payment_status='paid' AND t.transaction_date>=date_trunc('month',$2::date) AND t.transaction_date<date_trunc('month',$2::date)+interval '1 month' GROUP BY t.category,c.color ORDER BY amount DESC`,[req.userId,start]),query(`SELECT COALESCE(SUM(amount),0)::int total,COALESCE(SUM(amount) FILTER(WHERE food_necessity='必要支出'),0)::int necessary,COALESCE(SUM(amount) FILTER(WHERE food_necessity='削減可能'),0)::int reducible FROM transactions WHERE user_id=$1 AND category='食費' AND type='expense' AND payment_status='paid' AND transaction_date>=date_trunc('month',$2::date) AND transaction_date<date_trunc('month',$2::date)+interval '1 month'`,[req.userId,start])]);const f=food.rows[0];f.ratio=f.total?Math.round(f.reducible/f.total*100):0;res.render('analysis',{title:'月次分析',month,categoriesData:cats.rows,food:f});}catch(e){next(e);}});

app.get('/fixed-costs',async(req,res,next)=>{try{const result=await query('SELECT * FROM fixed_costs WHERE user_id=$1 ORDER BY is_active DESC,billing_day,name',[req.userId]);res.render('fixed-costs',{title:'固定費管理',fixedCosts:result.rows});}catch(e){next(e);}});
app.post('/fixed-costs',async(req,res,next)=>{try{const amount=positiveInt(req.body.amount),day=positiveInt(req.body.billing_day),category=await findCategory(req.userId,Number(req.body.category_id));if(!amount||!day||day>31||!category||category.type!=='expense'||!/^\d{4}-\d{2}$/.test(req.body.start_month||''))return sendError(res,'固定費の入力値を確認してください。');await query(`INSERT INTO fixed_costs(user_id,name,amount,category,category_id,billing_day,is_active,start_month,end_month,memo) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7::date,NULLIF($8,'')::date,$9)`,[req.userId,String(req.body.name||'').slice(0,120),amount,category.name,category.id,day,`${req.body.start_month}-01`,req.body.end_month?`${req.body.end_month}-01`:'',String(req.body.memo||'').slice(0,2000)]);req.session.notice='固定費を登録しました';res.redirect('/fixed-costs');}catch(e){next(e);}});
app.post('/fixed-costs/:id/update',async(req,res,next)=>{try{const amount=positiveInt(req.body.amount),day=positiveInt(req.body.billing_day),category=await findCategory(req.userId,Number(req.body.category_id));if(!amount||!day||day>31||!category||category.type!=='expense')return sendError(res,'固定費の入力値を確認してください。');await query(`UPDATE fixed_costs SET name=$1,amount=$2,category=$3,category_id=$4,billing_day=$5,is_active=$6,memo=$7,updated_at=NOW() WHERE id=$8 AND user_id=$9`,[String(req.body.name||'').slice(0,120),amount,category.name,category.id,day,bool(req.body.is_active),String(req.body.memo||'').slice(0,2000),req.params.id,req.userId]);req.session.notice='固定費を更新しました';res.redirect('/fixed-costs');}catch(e){next(e);}});
app.post('/fixed-costs/:id/delete',async(req,res,next)=>{try{await query('DELETE FROM fixed_costs WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);req.session.notice='固定費を削除しました';res.redirect('/fixed-costs');}catch(e){next(e);}});

app.get('/settings',async(req,res,next)=>{try{const [u,b]=await Promise.all([query('SELECT * FROM users WHERE id=$1',[req.userId]),query(`SELECT b.*,COALESCE(c.name,b.category) category,c.id category_id FROM budget_settings b LEFT JOIN categories c ON c.id=b.category_id WHERE b.user_id=$1 ORDER BY COALESCE(c.sort_order,b.id)`,[req.userId])]);const byId=Object.fromEntries(b.rows.filter(x=>x.category_id).map(x=>[x.category_id,x]));const budgets=req.categories.filter(c=>c.type==='expense'&&c.include_in_budget).map(c=>byId[c.id]||{category:c.name,category_id:c.id,percentage:0});res.render('settings',{title:'設定',user:u.rows[0],budgets});}catch(e){next(e);}});
app.post('/settings/income',async(req,res,next)=>{try{const income=Number(req.body.monthly_income),saving=Number(req.body.saving_target),payday=Number(req.body.payday);if(!Number.isInteger(income)||income<0||!Number.isInteger(saving)||saving<0||!Number.isInteger(payday)||payday<1||payday>31)return sendError(res,'設定値を確認してください。');await query('UPDATE users SET monthly_income=$1,payday=$2,saving_target=$3,updated_at=NOW() WHERE id=$4',[income,payday,saving,req.userId]);req.session.notice='収入設定を保存しました';res.redirect('/settings');}catch(e){next(e);}});
app.post('/settings/budgets',async(req,res,next)=>{try{for(const category of req.categories.filter(c=>c.type==='expense'&&c.include_in_budget)){const p=Number(req.body[`percentage_${category.id}`]);if(!Number.isFinite(p)||p<0||p>100)return sendError(res,'割合は0〜100で入力してください。');await query(`INSERT INTO budget_settings(user_id,category,category_id,percentage) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,category) DO UPDATE SET category_id=EXCLUDED.category_id,percentage=EXCLUDED.percentage,updated_at=NOW()`,[req.userId,category.name,category.id,p]);}req.session.notice='予算設定を保存しました';res.redirect('/settings');}catch(e){next(e);}});

app.get('/settings/categories',async(req,res,next)=>{try{const result=await query(`SELECT c.*,(SELECT COUNT(*) FROM transactions t WHERE t.category_id=c.id) transaction_count FROM categories c WHERE c.user_id=$1 ORDER BY c.type DESC,c.sort_order,c.name`,[req.userId]);res.render('categories',{title:'カテゴリー設定',categoryRows:result.rows});}catch(e){next(e);}});
app.post('/settings/categories',async(req,res,next)=>{try{const name=String(req.body.name||'').trim().slice(0,30),type=req.body.type==='income'?'income':'expense';if(!name)return sendError(res,'カテゴリー名を入力してください。');await query(`INSERT INTO categories(user_id,name,type,color,icon,is_default,is_active,include_in_budget,sort_order) VALUES($1,$2,$3,$4,$5,FALSE,TRUE,$6,$7)`,[req.userId,name,type,validColor(req.body.color),String(req.body.icon||'●').trim().slice(0,10)||'●',type==='expense'&&bool(req.body.include_in_budget),Number.isInteger(Number(req.body.sort_order))?Number(req.body.sort_order):100]);req.session.notice='カテゴリーを追加しました';res.redirect('/settings/categories');}catch(e){if(e.code==='23505')return sendError(res,'同じ名前のカテゴリーがあります。');next(e);}});
app.post('/settings/categories/:id/update',async(req,res,next)=>{try{const old=await findCategory(req.userId,Number(req.params.id),{activeOnly:false});if(!old)return sendError(res,'カテゴリーが見つかりません。',404);const name=old.is_default?old.name:String(req.body.name||'').trim().slice(0,30),type=old.is_default?old.type:(req.body.type==='income'?'income':'expense');if(!name)return sendError(res,'カテゴリー名を入力してください。');await query(`UPDATE categories SET name=$1,type=$2,color=$3,icon=$4,is_active=$5,include_in_budget=$6,sort_order=$7,updated_at=NOW() WHERE id=$8 AND user_id=$9`,[name,type,validColor(req.body.color),String(req.body.icon||'●').trim().slice(0,10)||'●',bool(req.body.is_active),type==='expense'&&bool(req.body.include_in_budget),Number.isInteger(Number(req.body.sort_order))?Number(req.body.sort_order):100,old.id,req.userId]);if(name!==old.name)for(const table of ['transactions','fixed_costs','budget_settings','classification_rules'])await query(`UPDATE ${table} SET category=$1 WHERE user_id=$2 AND category_id=$3`,[name,req.userId,old.id]);req.session.notice='カテゴリーを更新しました';res.redirect('/settings/categories');}catch(e){if(e.code==='23505')return sendError(res,'同じ名前のカテゴリーがあります。');next(e);}});
app.post('/settings/categories/:id/delete',async(req,res,next)=>{try{const category=await findCategory(req.userId,Number(req.params.id),{activeOnly:false});if(!category)return sendError(res,'カテゴリーが見つかりません。',404);if(category.is_default)return sendError(res,'基本カテゴリーは削除できません。停止して非表示にできます。');const used=await query(`SELECT (SELECT COUNT(*) FROM transactions WHERE category_id=$1)+(SELECT COUNT(*) FROM fixed_costs WHERE category_id=$1)+(SELECT COUNT(*) FROM budget_settings WHERE category_id=$1)+(SELECT COUNT(*) FROM classification_rules WHERE category_id=$1 OR corrected_category_id=$1) count`,[category.id]);if(Number(used.rows[0].count)>0){await query('UPDATE categories SET is_active=FALSE,updated_at=NOW() WHERE id=$1 AND user_id=$2',[category.id,req.userId]);req.session.notice='使用中のカテゴリーのため、削除せず停止しました';}else{await query('DELETE FROM categories WHERE id=$1 AND user_id=$2',[category.id,req.userId]);req.session.notice='カテゴリーを削除しました';}res.redirect('/settings/categories');}catch(e){next(e);}});

app.use((req,res)=>res.status(404).render('error',{title:'ページが見つかりません',status:404,message:'URLをご確認ください。'}));
app.use((err,req,res,next)=>{console.error(err.message);if(res.headersSent)return next(err);res.status(500).render('error',{title:'エラー',status:500,message:process.env.NODE_ENV==='production'?'処理中にエラーが発生しました。しばらくしてからお試しください。':err.message});});
module.exports = app;
