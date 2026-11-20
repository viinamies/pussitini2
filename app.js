
(() => {
 const root=document.documentElement;
 const stored=localStorage.getItem('nh-theme')||'dark';
 root.dataset.theme=stored;
 const toggle=document.querySelector('[data-theme-toggle]');
 const menu=document.querySelector('.theme-menu');
 function paintThemeMenu(){if(!menu)return;menu.querySelectorAll('[data-theme-choice]').forEach(b=>{b.classList.toggle('selected',b.dataset.themeChoice===root.dataset.theme);const c=b.querySelector('.check');if(c)c.textContent=b.dataset.themeChoice===root.dataset.theme?'✓':''})}
 if(toggle&&menu){toggle.addEventListener('click',e=>{e.stopPropagation();menu.classList.toggle('open')});menu.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{root.dataset.theme=b.dataset.themeChoice;localStorage.setItem('nh-theme',root.dataset.theme);menu.classList.remove('open');paintThemeMenu()}));document.addEventListener('click',e=>{if(!menu.contains(e.target)&&!toggle.contains(e.target))menu.classList.remove('open')});paintThemeMenu()}
 const nav=document.querySelector('.nav-pill');if(nav){let ind=nav.querySelector('.nav-indicator');if(!ind){ind=document.createElement('i');ind.className='nav-indicator';nav.prepend(ind)}const links=[...nav.querySelectorAll('a')];function move(a){ind.style.width=a.offsetWidth+'px';ind.style.transform=`translateX(${a.offsetLeft-4}px)`}let active=links.find(a=>a.classList.contains('active'));if(active)move(active);links.forEach(a=>{a.addEventListener('mouseenter',()=>move(a));a.addEventListener('focus',()=>move(a))});nav.addEventListener('mouseleave',()=>{if(active)move(active)});window.addEventListener('resize',()=>{if(active)move(active)})}
 document.querySelectorAll('[data-demo]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector('.toast');if(t){t.textContent=el.dataset.demo||'This is a front-end demo. Connect a backend to enable this action.';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}}));
 document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');let val=btn.dataset.filter;document.querySelectorAll('[data-category]').forEach(card=>card.hidden=val!=='all'&&card.dataset.category!==val)}));
 const search=document.querySelector('[data-search]');if(search)search.addEventListener('input',()=>{let q=search.value.toLowerCase();document.querySelectorAll('[data-searchable]').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(q))});
 const form=document.querySelector('[data-ticket-form]');if(form)form.addEventListener('submit',e=>{e.preventDefault();const t=document.querySelector('.toast');t.textContent='Ticket form demo — connect authentication and a support backend to submit tickets.';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500)});
 const y=document.querySelector('[data-year]');if(y)y.textContent=new Date().getFullYear();
})();
