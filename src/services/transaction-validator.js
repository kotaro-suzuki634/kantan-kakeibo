const FOOD_OPTIONS = ['必要支出','削減可能','未判定'];

function validateTransaction(body, category) {
  const errors = [];
  const amount = Number(body.amount);
  const type = body.type === 'income' ? 'income' : 'expense';
  const title = String(body.title || '').trim().slice(0,160);
  const merchant = String(body.merchant || '').trim().slice(0,120);
  const date = String(body.transaction_date || '');
  if (!Number.isInteger(amount) || amount <= 0) errors.push('金額は1円以上の整数で入力してください。');
  if (!title && !merchant) errors.push('内容または店名を入力してください。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.push('日付を正しく入力してください。');
  if (!category || !category.is_active) errors.push('利用できるカテゴリーを選択してください。');
  else if (category.type !== type) errors.push('収支区分に合うカテゴリーを選択してください。');
  const foodNecessity = category?.name === '食費' && FOOD_OPTIONS.includes(body.food_necessity) ? body.food_necessity : null;
  return { errors, value: { type, amount, title: title || merchant, merchant: merchant || null, transactionDate: date,
    categoryId: category?.id || null, category: category?.name || '', foodNecessity,
    memo:String(body.memo || '').slice(0,2000), originalText:String(body.original_text || '').slice(0,1000),
    confidence:['high','medium','low'].includes(body.classification_confidence) ? body.classification_confidence : 'low' } };
}

module.exports = { validateTransaction, FOOD_OPTIONS };
