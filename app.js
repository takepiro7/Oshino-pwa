const OSHI_PROFILES = {
  genjibu:{name:'原因は自分にある。',subtitle:'グループ＋メンバー全員'},
  ebidan:{name:'EBiDAN',subtitle:'EBiDAN公式情報'}
}
const EBIDAN_GROUPS = [
  {key:'bullettrain',name:'超特急'},
  {key:'milk',name:'M!LK'},
  {key:'superdragon',name:'SUPER★DRAGON'},
  {key:'sakurashimeji',name:'Sakurashimeji'},
  {key:'onenonly',name:'ONE N’ ONLY'},
  {key:'genjibu',name:'原因は自分にある。'},
  {key:'buddiis',name:'BUDDiiS'},
  {key:'icex',name:'ICEx'},
  {key:'lienel',name:'Lienel'},
  {key:'iiondo',name:'iiONDO'}
]
const SAMPLE_EVENTS = [
  {id:'e1',type:'ライブ',icon:'🎤',title:'グループライブ',date:'2026-09-26',time:'22:09',urgency:'normal',action:'会場・開演時刻を確認する',who:'原因は自分にある。',what:'グループライブ',when:'9/26 22:09',todo:'公式情報で詳細を確認',source:'サンプルデータ'},
  {id:'e2',type:'発売日',icon:'💿',title:'ニューシングル発売',date:'2026-09-28',time:'22:09',urgency:'normal',action:'商品情報を見る',who:'原因は自分にある。',what:'ニューシングル発売',when:'9/28',todo:'購入・特典情報を確認',source:'サンプルデータ'},
  {id:'e3',type:'配信予兆',icon:'🔴',title:'「このあとインスタ集合」投稿を検知',date:'2026-09-25',time:'21:30',urgency:'urgent',action:'Instagramを確認する',who:'原因は自分にある。',what:'Instagram Liveの可能性',when:'まもなく',todo:'Instagramを開いて確認',source:'予兆サンプル'},
  {id:'e4',type:'締切',icon:'⏰',title:'FC先行申込 締切',date:'2026-09-27',time:'23:59',urgency:'important',action:'申込ページを確認する',who:'原因は自分にある。',what:'FC先行申込締切',when:'9/27 23:59',todo:'期限までに申し込む',source:'サンプルデータ'}
]
const NOTICES = [
  {icon:'🔴',title:'インスタライブの可能性あり',body:'「このあとインスタ集合」という投稿を検知しました。',unread:true},
  {icon:'⏰',title:'締切まであと2日',body:'FC先行申込は9/27 23:59まで。',unread:true},
  {icon:'💿',title:'発売日を登録しました',body:'ニューシングル発売をカレンダーへ追加しました。',unread:true}
]
let tab='home'; let saved=new Set(JSON.parse(localStorage.getItem('oshinow_saved')||'[]')); let LIVE_EVENTS=[]; let EVENTS_UPDATED_AT=null;
let selectedOshi=localStorage.getItem('oshinow_oshi')||'genjibu';
let selectedEbidanGroups=new Set(EBIDAN_GROUPS.map(g=>g.key));
let notifyUrgent=localStorage.getItem('oshinow_notify_urgent')!=='0';
let notifyPrediction=localStorage.getItem('oshinow_notify_prediction')!=='0';
try{
  const storedGroups=JSON.parse(localStorage.getItem('oshinow_ebidan_groups'));
  if(Array.isArray(storedGroups)){
    const valid=new Set(EBIDAN_GROUPS.map(g=>g.key));
    selectedEbidanGroups=new Set(storedGroups.filter(k=>valid.has(k)));
  }
}catch(_){}
const screen=document.querySelector('#screen');
const dialog=document.querySelector('#detailDialog');
const toast=document.querySelector('#toast');

function urgencyLabel(u){return u==='urgent'?'緊急':u==='important'?'重要':'通常'}
function activeEvents(){
  const base=LIVE_EVENTS.length?LIVE_EVENTS:SAMPLE_EVENTS;
  return base.filter(e=>{
    if((e.oshi||'genjibu')!==selectedOshi)return false;
    if(selectedOshi!=='ebidan')return true;
    if(!e.group_key)return true;
    return selectedEbidanGroups.has(e.group_key);
  });
}
function currentOshi(){return OSHI_PROFILES[selectedOshi]||OSHI_PROFILES.genjibu}
function updatedLabel(){if(!EVENTS_UPDATED_AT)return '';const d=new Date(EVENTS_UPDATED_AT);if(Number.isNaN(d.getTime()))return '';return ` ・ ${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}更新`}
function currentOshiSubtitle(){
  if(selectedOshi!=='ebidan')return currentOshi().subtitle;
  if(selectedEbidanGroups.size===EBIDAN_GROUPS.length)return '全10グループ';
  if(selectedEbidanGroups.size===0)return 'EBiDAN全体のお知らせのみ';
  if(selectedEbidanGroups.size===1){
    const g=EBIDAN_GROUPS.find(x=>selectedEbidanGroups.has(x.key));
    return g?g.name:'1グループ選択中';
  }
  return selectedEbidanGroups.size+'グループ選択中';
}
function ebidanGroupPicker(){
  const all=selectedEbidanGroups.size===EBIDAN_GROUPS.length;
  return `<div class="setting-card"><div class="group-title-row"><div><h3>EBiDANグループ</h3><p class="page-sub" style="margin:4px 0 0">表示・通知したいグループを複数選べます。</p></div><button class="group-all" id="groupAllBtn">${all?'全解除':'全選択'}</button></div><div class="group-grid">${EBIDAN_GROUPS.map(g=>`<button class="group-choice ${selectedEbidanGroups.has(g.key)?'active':''}" data-ebidan-group="${g.key}">${g.name}</button>`).join('')}</div></div>`;
}
function eventCard(e){return `<article class="event-card" data-id="${e.id}"><div class="event-top"><div><div class="kind">${e.icon} ${e.type}</div><h4>${e.title}</h4></div><span class="tag ${e.urgency}">${urgencyLabel(e.urgency)}</span></div><div class="meta"><span>◷ ${Number(e.date.slice(5,7))}/${Number(e.date.slice(8))} ${e.time}</span>${e.group_name?`<span>・ ${e.group_name}</span>`:''}</div><div class="action">${e.action} ↗</div></article>`}
function home(){return `<div class="topline"><div class="brand">OshiNow</div><button class="round-btn" id="heartBtn">♥</button></div><section class="hero"><div class="eyebrow">YOUR OSHI, YOUR MOMENT</div><h1>今日も、推しのそばに。</h1><p>探さない。読まない。見逃さない。</p></section><section class="follow-card"><small>FOLLOWING</small><h2>${currentOshi().name}</h2><p>${currentOshiSubtitle()}</p></section><div class="sample-note">${LIVE_EVENTS.length?'✓ 公式情報を自動更新中'+updatedLabel():'🧪 サンプルモード：実際の告知ではありません'}</div><div class="segmented"><button class="active" id="allBtn">すべて</button><button id="savedBtn">保存した情報</button></div><div class="section-title"><div>▦</div><div><h3>今後の予定</h3><p>楽しみを、カレンダーに</p></div></div><div id="eventList" class="event-list">${activeEvents().length?activeEvents().map(eventCard).join(''):'<div class="sample-note">現在表示できる予定はありません</div>'}</div>`}
function inbox(){
  const important=activeEvents().filter(e=>e.urgency==='urgent'||e.urgency==='important').slice(0,8);
  const rows=important.length?important.map(e=>`<div class="inbox-row" data-id="${e.id}"><div class="inbox-icon">${e.icon}</div><div><h4>${e.title}</h4><p>${e.when} ・ ${e.action}</p></div><span class="dot"></span></div>`).join(''):'<div class="sample-note">現在、重要な通知対象はありません</div>';
  return `<h1 class="page-title">通知</h1><p class="page-sub">${currentOshi().name}の大事な情報をまとめます。</p>${rows}<div class="setting-card"><h3>通知のテスト</h3><p class="page-sub">Push通知が届く状態か、この端末で確認できます。</p><button class="primary" id="notifyTest">通知を試す</button></div>`;
}
function calendar(){const groups={}; for(const e of activeEvents()){(groups[e.date]??=[]).push(e)}; const body=Object.keys(groups).length?Object.entries(groups).sort().map(([d,es])=>`<section class="calendar-group"><div class="date-label">${d.replaceAll('-','/')}</div>${es.map(e=>`<div class="calendar-item" data-id="${e.id}"><div class="timebox">${e.time}</div><div><h4>${e.icon} ${e.title}</h4><p>${e.group_name?e.group_name+' ・ ':''}${e.type} ・ ${urgencyLabel(e.urgency)}</p></div></div>`).join('')}</section>`).join(''):'<div class="sample-note">現在表示できる予定はありません</div>'; return `<h1 class="page-title">カレンダー</h1><p class="page-sub">${currentOshi().name}の出演・配信・発売・締切を確認。</p>${body}`}
function settings(){return `<h1 class="page-title">推し設定</h1><p class="page-sub">見たい推しを選ぶと、表示とPush通知が切り替わります。</p><div class="setting-card"><h3>推しを選ぶ</h3><div class="oshi-picker"><button class="oshi-choice ${selectedOshi==='genjibu'?'active':''}" data-oshi="genjibu"><b>原因は自分にある。</b><span>グループ＋メンバー全員</span></button><button class="oshi-choice ${selectedOshi==='ebidan'?'active':''}" data-oshi="ebidan"><b>EBiDAN</b><span>EBiDAN全体の公式情報</span></button></div></div>${selectedOshi==='ebidan'?ebidanGroupPicker():''}<div class="setting-card"><div class="setting-row"><div><b>緊急通知</b><div class="page-sub" style="margin:3px 0 0">締切・重要発表など</div></div><input class="switch" id="urgentSwitch" type="checkbox" ${notifyUrgent?'checked':''}></div><div class="setting-row"><div><b>配信予兆通知</b><div class="page-sub" style="margin:3px 0 0">「今から」「このあと」「生配信」を検知</div></div><input class="switch" id="predictionSwitch" type="checkbox" ${notifyPrediction?'checked':''}></div></div><div class="setting-card"><h3>ホーム画面へ追加</h3><div class="install-box">iPhoneのSafariでこのページを開く → 共有ボタン →「ホーム画面に追加」。追加後にOshiNowを開くと、普通のアプリのように使えます。</div></div><div class="setting-card"><h3>通知について</h3><p class="page-sub">選択中の推しに合わせてPush通知を振り分けます。変更後は数秒その画面を開いたままにしてください。</p><button class="secondary" id="notifyTest2">通知を試す</button></div>`}
function openNoticeFromUrl(){
  const params=new URLSearchParams(window.location.search);
  const notice=params.get('notice');
  if(!notice)return;

  const title=params.get('title')||'OshiNow 通知';
  const what=params.get('what')||'新しい情報があります';
  const when=params.get('when')||'';
  const action=params.get('action')||'詳細を確認';
  const source=params.get('source')||'OshiNow';
  const link=params.get('link')||'';

  dialog.innerHTML=`<div class="detail-inner">
    <div class="detail-head">
      <div><div class="kind">🔔 通知</div><h2>${title}</h2></div>
      <button class="close" aria-label="閉じる">×</button>
    </div>
    <div class="detail-grid">
      <div class="detail-box"><b>何？</b>${what}</div>
      ${when?`<div class="detail-box"><b>いつ？</b>${when}</div>`:''}
      <div class="detail-box"><b>すること</b>${action}</div>
      <div class="detail-box"><b>情報源</b>${source}</div>
    </div>
    ${link?'<button class="primary" id="openNoticeSource">公式情報を開く</button>':''}
  </div>`;
  dialog.querySelector('.close').onclick=()=>dialog.close();
  dialog.querySelector('#openNoticeSource')?.addEventListener('click',()=>window.open(link,'_blank','noopener'));
  dialog.showModal();

  const clean=window.location.pathname+window.location.hash;
  window.history.replaceState({},'',clean);
}

function render(){screen.innerHTML=tab==='home'?home():tab==='inbox'?inbox():tab==='calendar'?calendar():settings(); bind();}
async function applyPushTags(OneSignal){
  await OneSignal.User.addTag('oshi',selectedOshi);
  const tags={};
  EBIDAN_GROUPS.forEach(g=>{tags['group_'+g.key]=selectedEbidanGroups.has(g.key)?'1':'0'});
  tags.notify_urgent=notifyUrgent?'1':'0';
  tags.notify_prediction=notifyPrediction?'1':'0';
  if(typeof OneSignal.User.addTags==='function'){
    await OneSignal.User.addTags(tags);
  }else{
    for(const [key,value] of Object.entries(tags))await OneSignal.User.addTag(key,value);
  }
}
function syncOshiTag(){
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(async function(OneSignal){
    try{
      await applyPushTags(OneSignal);
      console.log('OshiNow: push preference synced',selectedOshi,[...selectedEbidanGroups]);
    }catch(e){
      console.error('OshiNow: failed to sync push preference',e);
    }
  });
}
function bind(){document.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id))); document.querySelectorAll('[data-oshi]').forEach(el=>el.addEventListener('click',()=>{selectedOshi=el.dataset.oshi;localStorage.setItem('oshinow_oshi',selectedOshi);syncOshiTag();showToast(currentOshi().name+'に切り替えました');render()})); document.querySelectorAll('[data-ebidan-group]').forEach(el=>el.addEventListener('click',()=>{const key=el.dataset.ebidanGroup;if(selectedEbidanGroups.has(key))selectedEbidanGroups.delete(key);else selectedEbidanGroups.add(key);localStorage.setItem('oshinow_ebidan_groups',JSON.stringify([...selectedEbidanGroups]));syncOshiTag();render()})); document.querySelector('#groupAllBtn')?.addEventListener('click',()=>{if(selectedEbidanGroups.size===EBIDAN_GROUPS.length)selectedEbidanGroups.clear();else selectedEbidanGroups=new Set(EBIDAN_GROUPS.map(g=>g.key));localStorage.setItem('oshinow_ebidan_groups',JSON.stringify([...selectedEbidanGroups]));syncOshiTag();render()}); document.querySelector('#urgentSwitch')?.addEventListener('change',e=>{notifyUrgent=e.target.checked;localStorage.setItem('oshinow_notify_urgent',notifyUrgent?'1':'0');syncOshiTag();showToast('緊急通知設定を保存しました')}); document.querySelector('#predictionSwitch')?.addEventListener('change',e=>{notifyPrediction=e.target.checked;localStorage.setItem('oshinow_notify_prediction',notifyPrediction?'1':'0');syncOshiTag();showToast('予兆通知設定を保存しました')}); document.querySelector('#notifyTest')?.addEventListener('click',testNotification); document.querySelector('#notifyTest2')?.addEventListener('click',testNotification); document.querySelector('#heartBtn')?.addEventListener('click',()=>showToast('推し設定を保存しました')); document.querySelector('#savedBtn')?.addEventListener('click',()=>{document.querySelector('#allBtn').classList.remove('active');document.querySelector('#savedBtn').classList.add('active');document.querySelector('#eventList').innerHTML=saved.size?[...saved].map(id=>activeEvents().find(e=>e.id===id)).filter(Boolean).map(eventCard).join(''):'<div class="sample-note">保存した情報はまだありません</div>';bind()}); document.querySelector('#allBtn')?.addEventListener('click',()=>{render()})}
function openDetail(id){const e=activeEvents().find(x=>x.id===id); if(!e)return; dialog.innerHTML=`<div class="detail-inner"><div class="detail-head"><div><div class="kind">${e.icon} ${e.type}</div><h2>${e.title}</h2></div><button class="close" aria-label="閉じる">×</button></div><div class="detail-grid"><div class="detail-box"><b>誰？</b>${e.who}</div><div class="detail-box"><b>何？</b>${e.what}</div><div class="detail-box"><b>いつ？</b>${e.when}</div><div class="detail-box"><b>すること</b>${e.todo}</div><div class="detail-box"><b>情報源</b>${e.source}</div></div><button class="primary" id="saveDetail">${saved.has(e.id)?'保存済み':'この情報を保存'}</button>${e.url?'<button class="secondary" id="openEventSource" style="margin-top:10px">公式情報を開く</button>':''}</div>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#saveDetail').onclick=()=>{saved.add(e.id);localStorage.setItem('oshinow_saved',JSON.stringify([...saved]));showToast('保存しました');dialog.close()};dialog.querySelector('#openEventSource')?.addEventListener('click',()=>window.open(e.url,'_blank','noopener'));dialog.showModal()}
function showToast(msg){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}
const ONESIGNAL_APP_ID='d40f1748-dbb5-472a-aaa1-5178eb3ed064';
window.OneSignalDeferred=window.OneSignalDeferred||[];
window.OneSignalDeferred.push(async function(OneSignal){
  try{
    await OneSignal.init({
      appId:ONESIGNAL_APP_ID,
      serviceWorkerPath:'/Oshino-pwa/onesignal/OneSignalSDKWorker.js',
      serviceWorkerParam:{scope:'/Oshino-pwa/onesignal/'},
      notifyButton:{enable:false}
    });
    await OneSignal.Notifications.setDefaultUrl('https://takepiro7.github.io/Oshino-pwa/');
    try{await applyPushTags(OneSignal)}catch(e){console.error('OshiNow: initial oshi tags failed',e)}
    window.OshiNowOneSignal=OneSignal;
    console.log('OshiNow: OneSignal initialized');
  }catch(e){
    console.error('OshiNow: OneSignal init failed',e);
  }
});

async function testNotification(){
  try{
    if(!('Notification'in window)){showToast('この端末は通知APIに未対応です');return}
    const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
    if(!standalone&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){
      showToast('iPhoneはホーム画面のOshiNowから通知をONにしてください');
      return;
    }
    const ok=await new Promise((resolve)=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;resolve(Notification.permission==='granted')}},5000);
      window.OneSignalDeferred.push(async function(OneSignal){
        try{
          if(!OneSignal.Notifications.isPushSupported()){
            if(!settled){settled=true;clearTimeout(timer);resolve(false)}
            return;
          }
          await OneSignal.Notifications.requestPermission();
          const granted=OneSignal.Notifications.permission===true||OneSignal.Notifications.permissionNative==='granted'||Notification.permission==='granted';
          if(!settled){settled=true;clearTimeout(timer);resolve(granted)}
        }catch(e){
          console.error(e);
          if(!settled){settled=true;clearTimeout(timer);resolve(Notification.permission==='granted')}
        }
      });
    });
    if(!ok){showToast('通知が許可されませんでした');return}
    syncOshiTag();
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification('OshiNow 通知テスト',{
      body:'OneSignal登録と端末通知の動作確認です。',
      icon:'./icons/icon-192.png',
      badge:'./icons/icon-96.png',
      tag:'oshinow-test'
    });
    showToast('通知をONにしました');
  }catch(e){
    console.error(e);
    showToast('通知テストに失敗しました');
  }
}

async function loadLiveEvents(){
  try{
    const res=await fetch('./data/events.json?ts='+Date.now(),{cache:'no-store'});
    if(!res.ok)return;
    const data=await res.json();
    if(Array.isArray(data.events)){
      EVENTS_UPDATED_AT=data.updated_at||null;
      const today=new Date();
      today.setHours(0,0,0,0);
      LIVE_EVENTS=data.events.filter(e=>{
        const d=new Date(e.date+'T00:00:00');
        return !Number.isNaN(d.getTime()) && d>=new Date(today.getTime()-7*86400000);
      });
      render();
    }
  }catch(e){
    console.error('OshiNow events load failed',e);
  }
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{tab=btn.dataset.tab;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));render()}));
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.error))}
render();
loadLiveEvents();
setTimeout(openNoticeFromUrl,150);
