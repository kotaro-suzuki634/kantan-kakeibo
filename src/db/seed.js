require('dotenv').config();
const { pool } = require('./index');
const { initDatabase } = require('./init');

async function seed() {
  await initDatabase();
  const rows = [['家賃',55000,27],['携帯料金',4500,10]];
  for (const [name, amount, day] of rows) {
    await pool.query(`INSERT INTO fixed_costs(user_id,name,amount,category,billing_day,start_month,memo)
      SELECT 1,$1,$2,'固定費',$3,date_trunc('month',CURRENT_DATE)::date,'初期データ'
      WHERE NOT EXISTS (SELECT 1 FROM fixed_costs WHERE user_id=1 AND name=$1)`, [name,amount,day]);
  }
}
seed().then(()=>{console.log('初期データ作成完了');return pool.end();}).catch(e=>{console.error(e.message);process.exitCode=1;});
