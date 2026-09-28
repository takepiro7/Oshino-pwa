const CACHE='oshinow-v2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
self.addEventListener('push',event=>{
  let data={title:'OshiNow',body:'推しの新着情報があります。',url:'./'};
  try{if(event.data)data={...data,...event.data.json()}}catch(_){data.body=event.data?.text()||data.body}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./icons/icon-192.png',badge:'./icons/icon-96.png',data:{url:data.url},tag:data.tag||'oshinow-push'}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||'./';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus'in w)return w.focus()}return clients.openWindow?clients.openWindow(url):undefined}))});
