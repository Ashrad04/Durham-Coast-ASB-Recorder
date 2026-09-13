const CACHE='dca-pwa-shell-v2';
const SHELL=['/offline.html','/styles.css','/app.js','/privacy-ui.js','/ux-location.js','/draft-security.js','/home-link.js','/severity-privacy-fix.js','/map-controls.js','/compliance-ui.js','/pwa.js','/manifest.webmanifest','/app-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;
  if(url.pathname.startsWith('/api/')) return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('/offline.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>{
    const network=fetch(req).then(res=>{if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone))}return res}).catch(()=>cached);
    return cached||network;
  }));
});
