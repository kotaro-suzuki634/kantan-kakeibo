require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function initDatabase() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(`INSERT INTO users (id, name) VALUES (1, 'デモユーザー') ON CONFLICT (id) DO NOTHING`);
  const defaults = [['固定費',40],['食費',20],['交通費',10],['生活費',10],['趣味',10],['貯金',10]];
  for (const [category, percentage] of defaults) {
    await pool.query(`INSERT INTO budget_settings (user_id, category, percentage) VALUES (1,$1,$2) ON CONFLICT (user_id,category) DO NOTHING`, [category, percentage]);
  }
}

if (require.main === module) initDatabase().then(() => { console.log('DB初期化完了'); return pool.end(); }).catch((e) => { console.error(e.message); process.exitCode=1; });
module.exports = { initDatabase };

