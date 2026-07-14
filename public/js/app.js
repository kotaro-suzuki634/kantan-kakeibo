document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const input=document.querySelector('#text');if(input){input.value=button.dataset.example;input.focus();}}));
document.querySelectorAll('form[data-confirm]').forEach(form=>form.addEventListener('submit',event=>{if(!window.confirm(form.dataset.confirm))event.preventDefault();}));

const showEdit=document.querySelector('#show-edit');
if(showEdit)showEdit.addEventListener('click',()=>{document.querySelector('#quick-actions')?.classList.add('hidden');document.querySelector('#parsed-edit')?.classList.remove('hidden');syncCategoryForms();});

function syncCategoryForms(){
  document.querySelectorAll('form').forEach(form=>{
    const type=form.querySelector('[data-type-select]'),category=form.querySelector('[data-category-select]');if(!type||!category)return;
    const wanted=type.value;let selectedVisible=false;
    [...category.options].forEach(option=>{option.hidden=option.dataset.type!==wanted;option.disabled=option.hidden;if(option.selected&&!option.hidden)selectedVisible=true;});
    if(!selectedVisible){const first=[...category.options].find(option=>!option.hidden);if(first)first.selected=true;}
    const selected=category.options[category.selectedIndex],food=form.querySelector('[data-food-field]');
    if(food)food.hidden=!selected?.textContent.includes('食費');
  });
}
document.querySelectorAll('[data-type-select]').forEach(select=>select.addEventListener('change',syncCategoryForms));
document.querySelectorAll('[data-category-select]').forEach(select=>select.addEventListener('change',syncCategoryForms));
syncCategoryForms();

const calendar=document.querySelector('#calendar');
if(calendar){
  const [year,month]=calendar.dataset.month.split('-').map(Number),rows=JSON.parse(calendar.dataset.transactions),first=new Date(year,month-1,1).getDay(),days=new Date(year,month,0).getDate();
  const byDay={};rows.forEach(t=>{const key=String(t.transaction_date).slice(0,10);(byDay[key]??=[]).push(t);});
  for(let i=0;i<first;i++){const cell=document.createElement('div');cell.className='calendar-day blank';calendar.append(cell);}
  for(let day=1;day<=days;day++){
    const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,items=byDay[date]||[],expense=items.filter(t=>t.type==='expense'&&t.payment_status==='paid').reduce((s,t)=>s+Number(t.amount),0),unique=[...new Map(items.map(t=>[t.category,t])).values()];
    const cell=document.createElement('button');cell.type='button';cell.className='calendar-day';
    cell.innerHTML=`<span class="day-number">${day}</span>${items.length?`<span class="day-total">¥${expense.toLocaleString('ja-JP')}<br><small>${items.length}件</small></span><span class="day-icons">${unique.map(t=>`<i style="background:${t.category_color}">${escapeHtml(t.category_icon||t.category[0])}</i>`).join('')}</span>`:''}`;
    cell.addEventListener('click',()=>{document.querySelectorAll('.calendar-day.selected').forEach(x=>x.classList.remove('selected'));cell.classList.add('selected');const box=document.querySelector('#day-detail');box.innerHTML=`<div class="section-title"><h2>${month}月${day}日</h2><a href="/input">＋ 追加</a></div><div class="transaction-list">${items.length?items.map(t=>`<a class="transaction-item" href="/transactions/${t.id}"><span class="cat-icon" style="background:${t.category_color}">${escapeHtml(t.category_icon||t.category[0])}</span><div><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.category)}${t.payment_status==='scheduled'?' · 予定':''}</small></div><strong class="${t.type}">${t.type==='income'?'+':'−'}¥${Number(t.amount).toLocaleString('ja-JP')}</strong></a>`).join(''):'<div class="empty">この日の記録はありません。</div>'}</div>`;});
    calendar.append(cell);
  }
}
function escapeHtml(text){const e=document.createElement('div');e.textContent=text??'';return e.innerHTML;}
