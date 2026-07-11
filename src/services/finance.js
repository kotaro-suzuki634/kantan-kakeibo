function budgetStatus(rate) {
  if (rate >= 100) return {key:'over',label:'予算超過'};
  if (rate >= 90) return {key:'danger',label:'使いすぎ注意'};
  if (rate >= 70) return {key:'warning',label:'少し注意'};
  return {key:'good',label:'余裕あり'};
}
function monthlyProjection(spent, day, daysInMonth) { return day > 0 ? Math.round(spent / day * daysInMonth) : spent; }
module.exports = { budgetStatus, monthlyProjection };
