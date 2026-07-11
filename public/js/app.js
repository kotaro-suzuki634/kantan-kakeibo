document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const input=document.querySelector('#text');if(input){input.value=button.dataset.example;input.focus();}}));
document.querySelectorAll('form[data-confirm]').forEach(form=>form.addEventListener('submit',event=>{if(!window.confirm(form.dataset.confirm))event.preventDefault();}));

const calendar=document.querySelector('#calendar');
if(calendar){
  const [year,month]=calendar.dataset.month.split('-').map(Number); const rows=JSON.parse(calendar.dataset.transactions); const first=new Date(year,month-1,1).getDay(); const days=new Date(year,month,0).getDate();
  const byDay={}; rows.forEach(t=>{const key=String(t.transaction_date).slice(0,10);(byDay[key]??=[]).push(t);});
  for(let i=0;i<first;i++){const cell=document.createElement('div');cell.className='calendar-day blank';calendar.append(cell);}
  for(let day=1;day<=days;day++){
    const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const items=byDay[date]||[];const expense=items.filter(t=>t.type==='expense'&&t.payment_status==='paid').reduce((s,t)=>s+Number(t.amount),0);
    const cell=document.createElement('button');cell.type='button';cell.className='calendar-day';cell.innerHTML=`<span class="day-number">${day}</span>${items.length?`<span class="day-total">¥${expense.toLocaleString('ja-JP')}<br><small>${items.length}件</small></span><span class="day-icons">${[...new Set(items.map(t=>t.category))].map(c=>`<i class="${c}">${c[0]}</i>`).join('')}</span>`:''}`;
    cell.addEventListener('click',()=>{document.querySelectorAll('.calendar-day.selected').forEach(x=>x.classList.remove('selected'));cell.classList.add('selected');const box=document.querySelector('#day-detail');box.innerHTML=`<div class="section-title"><h2>${month}月${day}日</h2><a href="/input">＋ 追加</a></div><div class="transaction-list">${items.length?items.map(t=>`<a class="transaction-item" href="/transactions/${t.id}"><span class="cat-icon ${t.category}">${t.category[0]}</span><div><b>${escapeHtml(t.title)}</b><small>${t.category}${t.payment_status==='scheduled'?' · 予定':''}</small></div><strong class="${t.type}">${t.type==='income'?'+':'−'}¥${Number(t.amount).toLocaleString('ja-JP')}</strong></a>`).join(''):'<div class="empty">この日の記録はありません。</div>'}</div>`;});calendar.append(cell);
  }
}
function escapeHtml(text){const e=document.createElement('div');e.textContent=text??'';return e.innerHTML;}
