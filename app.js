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
let tab='home'; let saved=new Set();
const screen=document.querySelector('#screen');
const dialog=document.querySelector('#detailDialog');
const toast=document.querySelector('#toast');

function urgencyLabel(u){return u==='urgent'?'緊急':u==='important'?'重要':'通常'}
function eventCard(e){return `<article class="event-card" data-id="${e.id}"><div class="event-top"><div><div class="kind">${e.icon} ${e.type}</div><h4>${e.title}</h4></div><span class="tag ${e.urgency}">${urgencyLabel(e.urgency)}</span></div><div class="meta"><span>◷ ${Number(e.date.slice(5,7))}/${Number(e.date.slice(8))} ${e.time}</span></div><div class="action">${e.action} ↗</div></article>`}
function home(){return `<div class="topline"><div class="brand">OshiNow</div><button class="round-btn" id="heartBtn">♥</button></div><section class="hero"><div class="eyebrow">YOUR OSHI, YOUR MOMENT</div><h1>今日も、推しのそばに。</h1><p>探さない。読まない。見逃さない。</p></section><section class="follow-card"><small>FOLLOWING</small><h2>原因は自分にある。</h2><p>グループ＋メンバー全員</p></section><div class="sample-note">🧪 サンプルモード：実際の告知ではありません</div><div class="segmented"><button class="active" id="allBtn">すべて</button><button id="savedBtn">保存した情報</button></div><div class="section-title"><div>▦</div><div><h3>今後の予定</h3><p>楽しみを、カレンダーに</p></div></div><div id="eventList" class="event-list">${SAMPLE_EVENTS.map(eventCard).join('')}</div>`}
function inbox(){return `<h1 class="page-title">通知</h1><p class="page-sub">大事なものだけ、短く。</p>${NOTICES.map(n=>`<div class="inbox-row"><div class="inbox-icon">${n.icon}</div><div><h4>${n.title}</h4><p>${n.body}</p></div>${n.unread?'<span class="dot"></span>':''}</div>`).join('')}<div class="setting-card"><h3>通知のテスト</h3><p class="page-sub">ホーム画面に追加したiPhoneでは、通知許可の動作確認ができます。</p><button class="primary" id="notifyTest">通知を試す</button></div>`}
function calendar(){const groups={}; for(const e of SAMPLE_EVENTS){(groups[e.date]??=[]).push(e)}; return `<h1 class="page-title">カレンダー</h1><p class="page-sub">出演・配信・発売・締切をまとめて確認。</p>${Object.entries(groups).sort().map(([d,es])=>`<section class="calendar-group"><div class="date-label">${d.replaceAll('-','/')}</div>${es.map(e=>`<div class="calendar-item" data-id="${e.id}"><div class="timebox">${e.time}</div><div><h4>${e.icon} ${e.title}</h4><p>${e.type} ・ ${urgencyLabel(e.urgency)}</p></div></div>`).join('')}</section>`).join('')}`}
function settings(){return `<h1 class="page-title">推し設定</h1><p class="page-sub">「原因は自分にある。」で動作確認中。</p><div class="setting-card"><div class="setting-row"><div><b>緊急通知</b><div class="page-sub" style="margin:3px 0 0">ライブ・締切・重要発表</div></div><input class="switch" type="checkbox" checked></div><div class="setting-row"><div><b>深夜通知</b><div class="page-sub" style="margin:3px 0 0">22時以降も通知</div></div><input class="switch" type="checkbox"></div><div class="setting-row"><div><b>予兆通知</b><div class="page-sub" style="margin:3px 0 0">「今から」「このあと」を検知</div></div><input class="switch" type="checkbox" checked></div></div><div class="setting-card"><h3>ホーム画面へ追加</h3><div class="install-box">iPhoneのSafariでこのページを開く → 共有ボタン →「ホーム画面に追加」。追加後にOshiNowを開くと、普通のアプリのように使えます。</div></div><div class="setting-card"><h3>通知について</h3><p class="page-sub">OneSignalを使った本番Push通知に対応しています。iPhoneではホーム画面に追加したOshiNowから通知を許可してください。</p><button class="secondary" id="notifyTest2">通知を試す</button></div>`}
function render(){screen.innerHTML=tab==='home'?home():tab==='inbox'?inbox():tab==='calendar'?calendar():settings(); bind();}
function bind(){document.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id))); document.querySelector('#notifyTest')?.addEventListener('click',testNotification); document.querySelector('#notifyTest2')?.addEventListener('click',testNotification); document.querySelector('#heartBtn')?.addEventListener('click',()=>showToast('推し設定を保存しました')); document.querySelector('#savedBtn')?.addEventListener('click',()=>{document.querySelector('#allBtn').classList.remove('active');document.querySelector('#savedBtn').classList.add('active');document.querySelector('#eventList').innerHTML=saved.size?[...saved].map(id=>eventCard(SAMPLE_EVENTS.find(e=>e.id===id))).join(''):'<div class="sample-note">保存した情報はまだありません</div>';bind()}); document.querySelector('#allBtn')?.addEventListener('click',()=>{render()})}
function openDetail(id){const e=SAMPLE_EVENTS.find(x=>x.id===id); if(!e)return; dialog.innerHTML=`<div class="detail-inner"><div class="detail-head"><div><div class="kind">${e.icon} ${e.type}</div><h2>${e.title}</h2></div><button class="close" aria-label="閉じる">×</button></div><div class="detail-grid"><div class="detail-box"><b>誰？</b>${e.who}</div><div class="detail-box"><b>何？</b>${e.what}</div><div class="detail-box"><b>いつ？</b>${e.when}</div><div class="detail-box"><b>すること</b>${e.todo}</div><div class="detail-box"><b>情報源</b>${e.source}</div></div><button class="primary" id="saveDetail">${saved.has(e.id)?'保存済み':'この情報を保存'}</button></div>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#saveDetail').onclick=()=>{saved.add(e.id);showToast('保存しました');dialog.close()};dialog.showModal()}
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

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{tab=btn.dataset.tab;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));render()}));
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.error))}
render();
