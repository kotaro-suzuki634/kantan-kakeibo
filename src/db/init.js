require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

const DEFAULT_CATEGORIES = [
  ['食費','expense','#ee9b43','食',true,10],
  ['交通費','expense','#4f8dd6','交',true,20],
  ['生活費','expense','#59a878','生',true,30],
  ['趣味','expense','#8c6ac2','趣',true,40],
  ['固定費','expense','#7c8781','固',true,50],
  ['その他','expense','#718078','他',false,60],
  ['収入','income','#3c8d6a','収',false,70]
];

async function initDatabase() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(`INSERT INTO users (id, name) VALUES (1, 'デモユーザー') ON CONFLICT (id) DO NOTHING`);

  for (const [name,type,color,icon,includeInBudget,sortOrder] of DEFAULT_CATEGORIES) {
    await pool.query(`INSERT INTO categories(user_id,name,type,color,icon,is_default,is_active,include_in_budget,sort_order)
      VALUES(1,$1,$2,$3,$4,TRUE,TRUE,$5,$6)
      ON CONFLICT(user_id,name) DO UPDATE SET is_default=TRUE`,
      [name,type,color,icon,includeInBudget,sortOrder]);
  }

  for (const table of ['transactions','fixed_costs','budget_settings','classification_rules']) {
    await pool.query(`UPDATE ${table} x SET category_id=c.id FROM categories c
      WHERE x.user_id=c.user_id AND x.category=c.name AND x.category_id IS NULL`);
  }

  const defaults = [['固定費',40],['食費',20],['交通費',10],['生活費',10],['趣味',10],['貯金',10]];
  for (const [category, percentage] of defaults) {
    const result = await pool.query(`INSERT INTO budget_settings (user_id, category, category_id, percentage)
      VALUES (1,$1,(SELECT id FROM categories WHERE user_id=1 AND name=$2),$3)
      ON CONFLICT (user_id,category) DO UPDATE SET category_id=COALESCE(budget_settings.category_id,EXCLUDED.category_id)
      RETURNING id`, [category, category, percentage]);
    if (!result.rowCount) throw new Error('予算設定の初期化に失敗しました');
  }
}

if (require.main === module) initDatabase().then(() => { console.log('DB初期化完了'); return pool.end(); }).catch((e) => { console.error(e.message); process.exitCode=1; });
module.exports = { initDatabase, DEFAULT_CATEGORIES };
