(() => {
  const $ = id => document.getElementById(id);
  const say = (id, text) => { const el=$(id); if(el) el.textContent=text; };
  const toast = text => { const el=$('toast'); if(el){el.textContent=text;el.classList.add('show');} };
  const url=window.SUPABASE_URL, key=window.SUPABASE_ANON_KEY;
  if(!url || !key || !window.supabase || url.includes('YOUR_') || key.includes('YOUR_')) {
    say('auth-message','Supabase is not configured. Check supabase-config.js and reload.');
    say('ticket-message','Supabase is not configured. Check supabase-config.js.');
    return;
  }
  const client=window.supabase.createClient(url,key);
  window.NH_SUPABASE=client;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mode='login';
  const form=$('auth-form');
  function setMode(next){
    mode=next;
    $('tab-login')?.classList.toggle('active',mode==='login');
    $('tab-register')?.classList.toggle('active',mode==='register');
    if($('username-wrap')) $('username-wrap').hidden=mode!=='register';
    if($('password')) $('password').autocomplete=mode==='login'?'current-password':'new-password';
    if($('auth-submit')) $('auth-submit').textContent=mode==='login'?'Sign in':'Create account';
    say('auth-message',mode==='login'?'Sign in with your email and password.':'Choose a username and a password of at least 8 characters.');
  }
  $('tab-login')?.addEventListener('click',()=>setMode('login'));
  $('tab-register')?.addEventListener('click',()=>setMode('register'));
  async function showAccount(user){
    if(!user)return;
    if($('auth-panel')) $('auth-panel').hidden=true;
    if($('account-panel')) $('account-panel').hidden=false;
    if($('ticket-history')) $('ticket-history').hidden=false;
    say('welcome','Welcome, '+(user.user_metadata?.username||'member'));
    say('account-email',user.email||'');
    const box=$('my-tickets');
    if(box){
      const {data,error}=await client.from('tickets').select('id,subject,department,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
      if(error) box.innerHTML='<div class="panel-pad">'+esc(error.message)+'</div>';
      else box.innerHTML=data?.length?data.map(t=>`<div class="topic"><div class="topic-main"><strong>${esc(t.subject)}</strong><span>${esc(t.department)} · ${new Date(t.created_at).toLocaleString()}</span></div><span class="tag">${esc(t.status)}</span></div>`).join(''):'<div class="panel-pad muted small">You have not submitted any tickets yet.</div>';
    }
    const {data:admin}=await client.rpc('is_admin');
    if(admin===true && $('admin-link')) $('admin-link').hidden=false;
  }
  if(form) form.addEventListener('submit',async e=>{
    e.preventDefault(); const btn=$('auth-submit'); btn.disabled=true;
    try{
      const email=$('email').value.trim(), password=$('password').value;
      let result;
      if(mode==='register'){
        const username=$('username').value.trim();
        if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new Error('Username must be 3–24 characters: letters, numbers or underscores.');
        result=await client.auth.signUp({email,password,options:{data:{username},emailRedirectTo:location.origin+location.pathname}});
      }else result=await client.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      if(mode==='register'&&!result.data.session) say('auth-message','Account created. Check your email for a verification link, then return here to sign in.');
      else if(result.data.user) await showAccount(result.data.user);
    }catch(err){say('auth-message',err.message||'Authentication failed.');}
    finally{btn.disabled=false;}
  });
  $('forgot-password')?.addEventListener('click',async()=>{
    const email=$('email')?.value.trim(); if(!email){say('auth-message','Enter your email first.');return;}
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    say('auth-message',error?error.message:'If the address is registered, a password reset email will arrive.');
  });
  $('sign-out')?.addEventListener('click',async()=>{await client.auth.signOut();location.reload();});
  client.auth.onAuthStateChange((_event,session)=>{if(session?.user) showAccount(session.user);});
  client.auth.getSession().then(({data,error})=>{
    if(error){say('auth-message',error.message);return;}
    if(data.session?.user) showAccount(data.session.user);
    else {if($('auth-panel')) $('auth-panel').hidden=false;}
  });

  const ticketForm=$('ticket-form');
  if(ticketForm) {
    (async()=>{const {data}=await client.auth.getSession();if(!data.session){say('ticket-message','Please sign in before submitting a ticket.');}})();
    ticketForm.addEventListener('submit',async e=>{
      e.preventDefault(); const btn=ticketForm.querySelector('button[type=submit]');btn.disabled=true;
      try{
        const {data,error:sessionError}=await client.auth.getUser();
        if(sessionError) throw sessionError;
        if(!data.user){say('ticket-message','Please sign in first. Redirecting to your account…');setTimeout(()=>location.href='account.html',700);return;}
        const payload={user_id:data.user.id,department:$('department').value,subject:$('subject').value.trim(),body:$('message').value.trim()};
        const {error}=await client.from('tickets').insert(payload);
        if(error) throw error;
        ticketForm.reset();say('ticket-message','Ticket submitted successfully. You can follow it from My account.');
      }catch(err){say('ticket-message',err.message||'Could not submit ticket.');}
      finally{btn.disabled=false;}
    });
  }

  const adminList=$('admin-tickets');
  if(adminList)(async()=>{
    const {data:{user}}=await client.auth.getUser();
    if(!user){adminList.innerHTML='<div class="panel-pad">Please sign in first. <a href="account.html">Go to account</a>.</div>';return;}
    const {data:ok,error:adminErr}=await client.rpc('is_admin');
    if(adminErr||!ok){adminList.innerHTML='<div class="panel-pad">You do not have administrator access.</div>';return;}
    let current=null,filter='all',tickets=[];
    async function load(){
      const {data,error}=await client.from('tickets').select('id,subject,department,status,created_at,user_id').order('created_at',{ascending:false});
      if(error){adminList.innerHTML='<div class="panel-pad">'+esc(error.message)+'</div>';return;}
      tickets=data||[];render();
    }
    function render(){
      const rows=tickets.filter(t=>filter==='all'||t.status===filter);
      adminList.innerHTML=rows.length?rows.map(t=>`<button class="topic" data-id="${t.id}" style="width:100%;text-align:left;background:transparent;color:inherit;border:0"><div class="topic-main"><strong>${esc(t.subject)}</strong><span>${esc(t.department)} · ${new Date(t.created_at).toLocaleString()}</span></div><span class="tag">${esc(t.status)}</span></button>`).join(''):'<div class="panel-pad muted small">No tickets in this view.</div>';
      adminList.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openTicket(b.dataset.id));
    }
    async function openTicket(id){
      current=id;const t=tickets.find(x=>x.id===id);if(!t)return;
      $('ticket-detail').hidden=false;say('detail-subject',t.subject);say('detail-meta',t.department+' · '+t.status);
      const {data:full,error}=await client.from('tickets').select('body').eq('id',id).single();say('detail-body',error?error.message:full.body);
      const {data:replies,error:re}=await client.from('ticket_messages').select('id,message,is_admin,created_at').eq('ticket_id',id).order('created_at');
      $('replies').innerHTML=replies?.length?replies.map(r=>`<div class="panel-pad"><b>${r.is_admin?'Support':'User'}</b><p>${esc(r.message)}</p><span class="muted small">${new Date(r.created_at).toLocaleString()}</span></div>`).join(''):'<div class="panel-pad muted small">No replies yet.</div>';
      if(re)$('replies').textContent=re.message;
      $('ticket-status').value=t.status;
    }
    $('admin-refresh')?.addEventListener('click',load);
    document.querySelectorAll('[data-admin-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-admin-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');filter=b.dataset.adminFilter;render();});
    $('close-detail')?.addEventListener('click',()=>$('ticket-detail').hidden=true);
    $('reply-form')?.addEventListener('submit',async e=>{
      e.preventDefault();if(!current)return;const message=$('reply-text').value.trim();if(!message)return;
      const {error}=await client.from('ticket_messages').insert({ticket_id:current,user_id:user.id,message,is_admin:true});
      if(error){toast(error.message);return;}$('reply-text').value='';await openTicket(current);toast('Reply sent.');
    });
    $('save-status')?.addEventListener('click',async()=>{
      if(!current)return;const {error}=await client.from('tickets').update({status:$('ticket-status').value}).eq('id',current);
      if(error){toast(error.message);return;}await load();await openTicket(current);toast('Ticket status updated.');
    });
    await load();
  })();
})();