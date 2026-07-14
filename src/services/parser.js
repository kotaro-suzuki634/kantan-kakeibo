const categoryWords = {
  '収入': ['給料','給与','バイト代','収入','振込','賞与'],
  '固定費': ['家賃','通信費','携帯','保険','光熱費','netflix','amazon prime','ジム','奨学金','定期券'],
  '交通費': ['電車','バス','タクシー','suica','pasmo','jr','東急','地下鉄','運賃','駐車場'],
  '生活費': ['洗剤','ティッシュ','日用品','薬局','ドラッグストア','スーパー','衣服','美容院','病院','amazon'],
  '趣味': ['映画','ゲーム','ライブ','旅行','飲み会','カラオケ','グッズ','サブスク','遊び'],
  '食費': ['コンビニ','セブン','ファミマ','ローソン','大戸屋','マック','カフェ','スタバ','昼食','夕食','朝食','ランチ','飲み物','お菓子','食事','学食','水']
};
const merchants = ['コンビニ','セブン','ファミマ','ローソン','大戸屋','マック','スタバ','Amazon','Netflix','JR','東急'];
const reducible = ['カフェ','スタバ','お菓子','コンビニ','セブン','ファミマ','ローソン','デリバリー','深夜','飲み会','ぜいたく'];
const necessary = ['朝食','昼食','夕食','ランチ','スーパー','食材','水','学食','大戸屋'];

function parseDate(text, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/昨日/.test(text)) date.setDate(date.getDate()-1);
  else if (/一昨日/.test(text)) date.setDate(date.getDate()-2);
  else {
    const full = text.match(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/);
    const short = text.match(/(?<!\d)(\d{1,2})月(\d{1,2})日/);
    if (full) date.setFullYear(+full[1], +full[2]-1, +full[3]);
    else if (short) date.setFullYear(now.getFullYear(), +short[1]-1, +short[2]);
  }
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function extractAmount(text) {
  const matches = [...text.matchAll(/(?:¥|￥)?\s*([0-9０-９][0-9０-９,，]*)\s*(?:円|えん)?/g)];
  const match = matches.reverse().find(m => /円|えん|¥|￥/.test(m[0])) || matches.at(-1);
  return match ? Number(match[1].replace(/[０-９]/g,c=>String('０１２３４５６７８９'.indexOf(c))).replace(/[,，]/g,'')) : null;
}

function baseClassification(text) {
  const lower = text.toLowerCase();
  for (const category of ['収入','固定費','交通費','生活費','趣味','食費']) {
    const hits = categoryWords[category].filter(word => lower.includes(word.toLowerCase()));
    if (hits.length) return { category, confidence: hits.length > 1 ? 'high' : 'medium', matchedKeyword: hits[0] };
  }
  return { category:'その他', confidence:'low', matchedKeyword:null };
}

function findMerchant(text) {
  return merchants.find(m=>text.toLowerCase().includes(m.toLowerCase())) || (text.match(/^(.{1,20}?)(?:で|から|\s|　)/)?.[1] || null);
}

function parseTransaction(text, learnedRules = [], now = new Date()) {
  const original = String(text || '').trim();
  const amount = extractAmount(original);
  let classified = baseClassification(original);
  const merchant = findMerchant(original);
  // Exact merchant corrections are stronger than keyword corrections.
  const learned = learnedRules.find(r => r.merchant && merchant && r.merchant.toLowerCase()===merchant.toLowerCase())
    || learnedRules.find(r => r.keyword && original.toLowerCase().includes(r.keyword.toLowerCase()));
  if (learned) classified = { category: learned.category, confidence:'high', matchedKeyword:learned.keyword };
  const type = classified.category === '収入' ? 'income' : 'expense';
  let foodNecessity = '未判定';
  if (classified.category === '食費') {
    if (learned?.food_necessity && learned.food_necessity !== '未判定') foodNecessity=learned.food_necessity;
    else if (reducible.some(w=>original.includes(w))) foodNecessity='削減可能';
    else if (necessary.some(w=>original.includes(w))) foodNecessity='必要支出';
  }
  const cleaned = original.replace(/(?:¥|￥)?\s*[0-9０-９][0-9０-９,，]*\s*(?:円|えん)?/g,'').replace(/(昨日|一昨日|今日|本日|\d{1,2}月\d{1,2}日(?:に)?)/g,'').replace(/(?:で|に)\s*$/,'').trim();
  return { amount, title: merchant || cleaned || '支出', merchant, category:classified.category, transactionDate:parseDate(original,now), originalText:original, type, foodNecessity, confidence: classified.confidence, memo: cleaned, learnedRuleId: learned?.id || null };
}

module.exports = { parseTransaction, parseDate, extractAmount, baseClassification };
