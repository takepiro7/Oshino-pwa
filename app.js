const OSHI_PROFILES = {
  genjibu:{name:'原因は自分にある。',subtitle:'グループ＋メンバー全員'},
  ebidan:{name:'EBiDAN',subtitle:'EBiDAN公式情報'}
}
let EBIDAN_GROUPS = [
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

let ARTIST_CATALOG = EBIDAN_GROUPS.map(g=>({
  id:g.key==='genjibu'?'genjibu':'ebidan:'+g.key,
  key:g.key,
  name:g.name,
  network:'EBiDAN',
  provider:'ebidan',
  monitoring:'active'
}));
const DISPLAY_FILTERS = [
  {key:'live',name:'ライブ・イベント',types:['ライブ','イベント']},
  {key:'media',name:'出演・配信',types:['出演','配信','配信予兆']},
  {key:'release',name:'発売・キャンペーン',types:['発売','発売日','キャンペーン']},
  {key:'deadline',name:'締切',types:['締切']},
  {key:'birthday',name:'誕生日',types:['誕生日']},
  {key:'other',name:'その他',types:['予定']}
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
const legacyOshi=localStorage.getItem('oshinow_oshi')||'genjibu';
const storedGroupsRaw=localStorage.getItem('oshinow_ebidan_groups');
let selectedEbidanGroups=new Set();
if(storedGroupsRaw){
  try{
    const storedGroups=JSON.parse(storedGroupsRaw);
    if(Array.isArray(storedGroups))selectedEbidanGroups=new Set(storedGroups);
  }catch(_){}
}else if(legacyOshi==='genjibu'){
  selectedEbidanGroups=new Set(['genjibu']);
}else{
  selectedEbidanGroups=new Set(EBIDAN_GROUPS.map(g=>g.key));
}
let customArtists=[];
try{
  const stored=JSON.parse(localStorage.getItem('oshinow_custom_artists')||'[]');
  if(Array.isArray(stored))customArtists=stored.filter(x=>x&&x.name);
}catch(_){}
let notifyUrgent=localStorage.getItem('oshinow_notify_urgent')!=='0';
let notifyPrediction=localStorage.getItem('oshinow_notify_prediction')!=='0';
let selectedDisplayFilters=new Set(DISPLAY_FILTERS.map(f=>f.key));
try{const stored=JSON.parse(localStorage.getItem('oshinow_display_filters'));if(Array.isArray(stored)){const valid=new Set(DISPLAY_FILTERS.map(f=>f.key));selectedDisplayFilters=new Set(stored.filter(k=>valid.has(k)))}}catch(_){}
const screen=document.querySelector('#screen');
const dialog=document.querySelector('#detailDialog');
const toast=document.querySelector('#toast');

function urgencyLabel(u){return u==='urgent'?'緊急':u==='important'?'重要':'通常'}
function displayFilterKey(type){const f=DISPLAY_FILTERS.find(x=>x.types.includes(type));return f?f.key:'other'}
function displayFilterPicker(){
  const all=selectedDisplayFilters.size===DISPLAY_FILTERS.length;
  return `<div class="setting-card"><div class="group-title-row"><div><h3>表示する情報</h3><p class="page-sub" style="margin:4px 0 0">ホーム・通知・カレンダーに出す種類を選べます。</p></div><button class="group-all" id="filterAllBtn">${all?'全解除':'全選択'}</button></div><div class="group-grid">${DISPLAY_FILTERS.map(f=>`<button class="group-choice ${selectedDisplayFilters.has(f.key)?'active':''}" data-display-filter="${f.key}">${f.name}</button>`).join('')}</div></div>`;
}
function artistIdForKey(key){return key==='genjibu'?'genjibu':'ebidan:'+key}
function groupKeyForArtistId(id){return id==='genjibu'?'genjibu':id.startsWith('ebidan:')?id.slice(7):null}
function monitoredArtists(){return ARTIST_CATALOG.filter(x=>selectedEbidanGroups.has(x.key))}
function activeEvents(){
  const base=LIVE_EVENTS.length?LIVE_EVENTS:SAMPLE_EVENTS;
  return base.filter(e=>{
    if(!selectedDisplayFilters.has(displayFilterKey(e.type)))return false;
    if(e.oshi==='genjibu')return selectedEbidanGroups.has('genjibu');
    if(e.oshi!=='ebidan')return false;
    if(Array.isArray(e.group_keys)&&e.group_keys.length)return e.group_keys.some(k=>selectedEbidanGroups.has(k));
    if(e.group_key)return selectedEbidanGroups.has(e.group_key);
    return selectedEbidanGroups.size>0;
  });
}
function currentOshi(){
  const active=monitoredArtists();
  const pending=customArtists.length;
  if(active.length===1&&pending===0)return {name:active[0].name,subtitle:'公式情報を監視中'};
  if(active.length===0&&pending===0)return {name:'推しを追加してください',subtitle:'推し設定から追加できます'};
  const total=active.length+pending;
  return {name:total+'組フォロー中',subtitle:'監視中 '+active.length+' ・ 準備中 '+pending};
}
function updatedLabel(){if(!EVENTS_UPDATED_AT)return '';const d=new Date(EVENTS_UPDATED_AT);if(Number.isNaN(d.getTime()))return '';return ` ・ ${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}更新`}
function currentOshiSubtitle(){return currentOshi().subtitle}
function followedArtistsPanel(){
  const active=monitoredArtists();
  const activeRows=active.map(x=>`<div class="follow-row"><div><b>${x.name}</b><span class="status-ok">監視中</span></div><button class="mini-remove" data-follow-remove="${x.id}">解除</button></div>`).join('');
  const pendingRows=customArtists.map(x=>`<div class="follow-row"><div><b>${x.name}</b><span class="status-pending">監視準備中</span>${x.official_url?`<small>${x.official_url}</small>`:''}</div><button class="mini-remove" data-custom-remove="${x.id}">削除</button></div>`).join('');
  return `<div class="setting-card"><div class="group-title-row"><div><h3>フォロー中</h3><p class="page-sub" style="margin:4px 0 0">監視中 ${active.length} ・ 準備中 ${customArtists.length}</p></div></div><div class="follow-list">${activeRows||pendingRows?'':''}${activeRows}${pendingRows}${(!activeRows&&!pendingRows)?'<div class="empty-follow">まだ推しが登録されていません</div>':''}</div></div>`;
}
function artistSearchPanel(){
  return `<div class="setting-card"><h3>推しを追加</h3><p class="page-sub" style="margin:4px 0 12px">EBiDAN所属は公式一覧から自動更新されます。</p><input class="artist-input" id="artistSearch" placeholder="アーティスト名を検索" autocomplete="off"><div id="artistSearchResults" class="artist-results"></div><div class="custom-add"><h4>一覧にないアーティスト</h4><input class="artist-input" id="customArtistName" placeholder="例：Snow Man"><input class="artist-input" id="customArtistUrl" placeholder="公式サイトURL（任意）" inputmode="url"><button class="secondary" id="customArtistAdd">追加候補として登録</button><p class="pending-help">EBiDAN外はまず「監視準備中」で登録します。自動監視の接続ができると「監視中」に切り替わります。</p></div></div>`;
}
function renderArtistSearch(query=''){
  const box=document.querySelector('#artistSearchResults');if(!box)return;
  const q=query.trim().toLowerCase();
  const rows=ARTIST_CATALOG.filter(x=>!selectedEbidanGroups.has(x.key)&&(!q||x.name.toLowerCase().includes(q))).slice(0,20);
  const emptyMessage=q?'該当する自動監視対応アーティストはありません':'追加できるEBiDANアーティストはありません';
  box.innerHTML=rows.length?rows.map(x=>`<div class="artist-result"><div><b>${x.name}</b><small>${x.network||''} ・ 自動監視対応</small></div><button class="artist-add" data-artist-add="${x.id}">追加</button></div>`).join(''):`<div class="empty-follow">${emptyMessage}</div>`;
  document.querySelectorAll('[data-artist-add]').forEach(el=>el.addEventListener('click',()=>{const key=groupKeyForArtistId(el.dataset.artistAdd);if(!key)return;selectedEbidanGroups.add(key);saveFollowedGroups();syncOshiTag();render()}));
}
function saveFollowedGroups(){localStorage.setItem('oshinow_ebidan_groups',JSON.stringify([...selectedEbidanGroups]));localStorage.setItem('oshinow_oshi','ebidan')}
function eventCard(e){return `<article class="event-card" data-id="${e.id}"><div class="event-top"><div><div class="kind">${e.icon} ${e.type}</div><h4>${e.title}</h4></div><span class="tag ${e.urgency}">${urgencyLabel(e.urgency)}</span></div><div class="meta"><span>◷ ${Number(e.date.slice(5,7))}/${Number(e.date.slice(8))} ${e.time}</span>${e.group_name?`<span>・ ${e.group_name}</span>`:''}</div><div class="action">${e.action} ↗</div></article>`}
function home(){return `<div class="topline"><div class="brand">OshiNow</div><button class="round-btn" id="heartBtn">♥</button></div><section class="hero"><div class="eyebrow">YOUR OSHI, YOUR MOMENT</div><h1>今日も、推しのそばに。</h1><p>探さない。読まない。見逃さない。</p></section><section class="follow-card"><small>FOLLOWING</small><h2>${currentOshi().name}</h2><p>${currentOshiSubtitle()}</p></section><div class="sample-note">${LIVE_EVENTS.length?'✓ 公式情報を自動更新中'+updatedLabel():'🧪 サンプルモード：実際の告知ではありません'}</div><div class="segmented"><button class="active" id="allBtn">すべて</button><button id="savedBtn">保存した情報</button></div><div class="section-title"><div>▦</div><div><h3>今後の予定</h3><p>楽しみを、カレンダーに</p></div></div><div id="eventList" class="event-list">${activeEvents().length?activeEvents().slice(0,12).map(eventCard).join(''):'<div class="sample-note">現在表示できる予定はありません</div>'}</div>`}
function inbox(){
  const important=activeEvents().filter(e=>e.urgency==='urgent'||e.urgency==='important').slice(0,8);
  const rows=important.length?important.map(e=>`<div class="inbox-row" data-id="${e.id}"><div class="inbox-icon">${e.icon}</div><div><h4>${e.title}</h4><p>${e.when} ・ ${e.action}</p></div><span class="dot"></span></div>`).join(''):'<div class="sample-note">現在、重要な通知対象はありません</div>';
  return `<h1 class="page-title">通知</h1><p class="page-sub">${currentOshi().name}の大事な情報をまとめます。</p>${rows}<div class="setting-card"><h3>通知のテスト</h3><p class="page-sub">Push通知が届く状態か、この端末で確認できます。</p><button class="primary" id="notifyTest">通知を試す</button></div>`;
}
function calendar(){const groups={}; for(const e of activeEvents()){(groups[e.date]??=[]).push(e)}; const body=Object.keys(groups).length?Object.entries(groups).sort().map(([d,es])=>`<section class="calendar-group"><div class="date-label">${d.replaceAll('-','/')}</div>${es.map(e=>`<div class="calendar-item" data-id="${e.id}"><div class="timebox">${e.time}</div><div><h4>${e.icon} ${e.title}</h4><p>${e.group_name?e.group_name+' ・ ':''}${e.type} ・ ${urgencyLabel(e.urgency)}</p></div></div>`).join('')}</section>`).join(''):'<div class="sample-note">現在表示できる予定はありません</div>'; return `<h1 class="page-title">カレンダー</h1><p class="page-sub">${currentOshi().name}の出演・配信・発売・締切を確認。</p>${body}`}
function settings(){return `<h1 class="page-title">推し設定</h1><p class="page-sub">推しは複数登録できます。EBiDAN所属は公式カタログから選択できます。</p>${followedArtistsPanel()}${artistSearchPanel()}${displayFilterPicker()}<div class="setting-card"><div class="setting-row"><div><b>緊急通知</b><div class="page-sub" style="margin:3px 0 0">締切・重要発表など</div></div><input class="switch" id="urgentSwitch" type="checkbox" ${notifyUrgent?'checked':''}></div><div class="setting-row"><div><b>配信予兆通知</b><div class="page-sub" style="margin:3px 0 0">「今から」「このあと」「生配信」を検知</div></div><input class="switch" id="predictionSwitch" type="checkbox" ${notifyPrediction?'checked':''}></div></div><div class="setting-card"><h3>通知について</h3><p class="page-sub">「監視中」の推しだけPush通知の対象です。「監視準備中」はまだ通知されません。</p><button class="secondary" id="notifyTest2">通知を試す</button></div>`}
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
  await OneSignal.User.addTag('oshi',selectedEbidanGroups.size?'ebidan':'none');
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
function bind(){
  document.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id)));
  document.querySelectorAll('[data-follow-remove]').forEach(el=>el.addEventListener('click',()=>{const key=groupKeyForArtistId(el.dataset.followRemove);if(key){selectedEbidanGroups.delete(key);saveFollowedGroups();syncOshiTag();render()}}));
  document.querySelectorAll('[data-custom-remove]').forEach(el=>el.addEventListener('click',()=>{customArtists=customArtists.filter(x=>x.id!==el.dataset.customRemove);localStorage.setItem('oshinow_custom_artists',JSON.stringify(customArtists));render()}));
  const search=document.querySelector('#artistSearch');if(search){renderArtistSearch('');search.addEventListener('input',e=>renderArtistSearch(e.target.value))}
  document.querySelector('#customArtistAdd')?.addEventListener('click',()=>{const name=document.querySelector('#customArtistName')?.value.trim();const official_url=document.querySelector('#customArtistUrl')?.value.trim()||'';if(!name){showToast('アーティスト名を入力してください');return}if(ARTIST_CATALOG.some(x=>x.name.toLowerCase()===name.toLowerCase())){showToast('自動監視対応の一覧から追加できます');return}if(customArtists.some(x=>x.name.toLowerCase()===name.toLowerCase())){showToast('すでに追加済みです');return}const id='custom:'+Date.now().toString(36);customArtists.push({id,name,official_url,status:'pending'});localStorage.setItem('oshinow_custom_artists',JSON.stringify(customArtists));showToast(name+'を追加候補に登録しました');render()});
  document.querySelectorAll('[data-display-filter]').forEach(el=>el.addEventListener('click',()=>{const key=el.dataset.displayFilter;if(selectedDisplayFilters.has(key))selectedDisplayFilters.delete(key);else selectedDisplayFilters.add(key);localStorage.setItem('oshinow_display_filters',JSON.stringify([...selectedDisplayFilters]));render()}));
  document.querySelector('#filterAllBtn')?.addEventListener('click',()=>{if(selectedDisplayFilters.size===DISPLAY_FILTERS.length)selectedDisplayFilters.clear();else selectedDisplayFilters=new Set(DISPLAY_FILTERS.map(f=>f.key));localStorage.setItem('oshinow_display_filters',JSON.stringify([...selectedDisplayFilters]));render()});
  document.querySelector('#urgentSwitch')?.addEventListener('change',e=>{notifyUrgent=e.target.checked;localStorage.setItem('oshinow_notify_urgent',notifyUrgent?'1':'0');syncOshiTag();showToast('緊急通知設定を保存しました')});
  document.querySelector('#predictionSwitch')?.addEventListener('change',e=>{notifyPrediction=e.target.checked;localStorage.setItem('oshinow_notify_prediction',notifyPrediction?'1':'0');syncOshiTag();showToast('予兆通知設定を保存しました')});
  document.querySelector('#notifyTest')?.addEventListener('click',testNotification);document.querySelector('#notifyTest2')?.addEventListener('click',testNotification);
  document.querySelector('#heartBtn')?.addEventListener('click',()=>{tab='settings';document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='settings'));render()});
  document.querySelector('#savedBtn')?.addEventListener('click',()=>{document.querySelector('#allBtn').classList.remove('active');document.querySelector('#savedBtn').classList.add('active');document.querySelector('#eventList').innerHTML=saved.size?[...saved].map(id=>activeEvents().find(e=>e.id===id)).filter(Boolean).map(eventCard).join(''):'<div class="sample-note">保存した情報はまだありません</div>';bind()});
  document.querySelector('#allBtn')?.addEventListener('click',()=>render());
}
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

async function loadArtistCatalog(){
  try{
    const res=await fetch('./data/artists.json?ts='+Date.now(),{cache:'no-store'});
    if(!res.ok)return;
    const data=await res.json();
    if(!Array.isArray(data.artists)||!data.artists.length)return;
    ARTIST_CATALOG=data.artists.filter(x=>x&&x.key&&x.name);
    const oldByKey=new Map(EBIDAN_GROUPS.map(g=>[g.key,g]));
    EBIDAN_GROUPS=ARTIST_CATALOG.map(x=>({key:x.key,name:x.name,aliases:(oldByKey.get(x.key)?.aliases)||[x.name]}));
    const valid=new Set(EBIDAN_GROUPS.map(g=>g.key));
    selectedEbidanGroups=new Set([...selectedEbidanGroups].filter(k=>valid.has(k)));
    render();
  }catch(e){console.error('OshiNow artist catalog load failed',e)}
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
        const start=new Date(e.date+'T00:00:00');
        const end=new Date((e.end_date||e.date)+'T23:59:59');
        return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end>=today;
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
loadArtistCatalog();
loadLiveEvents();
setTimeout(openNoticeFromUrl,150);
