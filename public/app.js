const categories = {
  'Vehicles / off-road use': ['Off-road motorcycle', 'Quad / ATV', '4x4 / car', 'Vehicle on beach or dunes', 'Dangerous / nuisance driving', 'Other vehicle issue'],
  'Camping / fires': ['Unauthorised camping', 'Open fire / bonfire', 'BBQ in unsuitable location', 'Abandoned camp', 'Other'],
  'Fly-tipping / waste': ['Fly-tipping', 'Littering', 'Commercial waste', 'Hazardous waste', 'Other'],
  'Vandalism / damage': ['Gate / barrier damage', 'Signage damage', 'Path / furniture damage', 'Building / structure damage', 'Graffiti', 'Other criminal damage'],
  'Environmental damage': ['Dune damage', 'Grassland / vegetation damage', 'Wildlife disturbance', 'Pollution / discharge', 'Tree / scrub damage', 'Other habitat damage'],
  'Unauthorised access': ['Restricted vehicle access', 'Trespass / prohibited access', 'Forced entry / broken barrier', 'Other'],
  'Dog-related issue': ['Dog fouling', 'Dog out of control', 'Wildlife disturbance by dog', 'Livestock interaction', 'Other'],
  'Public order / threatening behaviour': ['Threatening / abusive behaviour', 'Harassment', 'Disorder / nuisance gathering', 'Other'],
  'Substance misuse': ['Drug-related activity', 'Alcohol-related disorder', 'Discarded paraphernalia', 'Other'],
  'Other': ['Other incident']
};

const icons = ['🚙','🔥','🗑','🛠','🌿','⛔','🐕','⚠','◌','…'];
let accessCode = sessionStorage.getItem('dca_access') || '';
let profile = JSON.parse(localStorage.getItem('dca_profile') || 'null') || { name:'', org:'' };
let config = { protected:false };
let incidents = [];
let entryMap, entryMarker, recordsMap, recordLayer;
let selectedCategory = '';
let entryLocation = null;
let evidence = [];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function apiFetch(url, options={}) {
  options.headers = { ...(options.headers||{}), 'x-access-code':accessCode };
  if (options.body && !options.headers['Content-Type']) options.headers['Content-Type']='application/json';
  const r = await fetch(url, options);
  if (r.status===401) { showLogin('Access code incorrect or no longer valid.'); throw new Error('Access denied'); }
  return r;
}

function showLogin(message='') {
  $('loginName').value = profile.name || '';
  $('loginOrg').value = profile.org || '';
  $('loginCode').value = accessCode;
  $('accessCodeWrap').classList.toggle('hidden', !config.protected);
  $('loginMsg').textContent = message;
  $('loginOverlay').classList.remove('hidden');
}

function initials(name) {
  return (name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || '?';
}

async function login() {
  const name=$('loginName').value.trim(), org=$('loginOrg').value.trim();
  if (!name || !org) { $('loginMsg').textContent='Enter your name and organisation.'; return; }
  accessCode = config.protected ? $('loginCode').value : '';
  try {
    const r=await apiFetch('/api/incidents');
    if (!r.ok) throw new Error('Could not sign in');
    profile={name,org};
    localStorage.setItem('dca_profile',JSON.stringify(profile));
    sessionStorage.setItem('dca_access',accessCode);
    $('profileInitials').textContent=initials(name);
    $('loginOverlay').classList.add('hidden');
    incidents=(await r.json()).incidents||[];
    renderAll();
  } catch(e) { if(e.message!=='Access denied') $('loginMsg').textContent=e.message; }
}

function nav(name) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='log') setTimeout(()=>entryMap?.invalidateSize(),100);
  if(name==='records') { loadIncidents().then(()=>setTimeout(()=>recordsMap?.invalidateSize(),100)); }
}

function setupCategories() {
  const grid=$('categoryGrid'), filter=$('filterCategory');
  Object.keys(categories).forEach((cat,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='category-btn'; b.dataset.category=cat;
    b.innerHTML=`<span>${icons[i]}</span>${esc(cat)}`;
    b.onclick=()=>selectCategory(cat);
    grid.appendChild(b);
    filter.add(new Option(cat,cat));
  });
}

function selectCategory(cat) {
  selectedCategory=cat;
  document.querySelectorAll('.category-btn').forEach(b=>b.classList.toggle('active',b.dataset.category===cat));
  $('subcategory').innerHTML='<option value="">Select subcategory</option>' + categories[cat].map(x=>`<option>${esc(x)}</option>`).join('');
  checkDuplicates();
}

function localDateTime(d=new Date()) {
  const z=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function setupMaps() {
  entryMap=L.map('entryMap').setView([54.76,-1.29],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(entryMap);
  entryMap.on('click',e=>setEntryLocation(e.latlng.lat,e.latlng.lng,null,true));

  recordsMap=L.map('recordsMap').setView([54.76,-1.29],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(recordsMap);
  recordLayer=L.layerGroup().addTo(recordsMap);
}

function setEntryLocation(lat,lng,accuracy=null,pan=false) {
  entryLocation={latitude:lat,longitude:lng,accuracy_m:accuracy};
  if(!entryMarker) {
    entryMarker=L.marker([lat,lng],{draggable:true}).addTo(entryMap);
    entryMarker.on('dragend',e=>{const p=e.target.getLatLng();setEntryLocation(p.lat,p.lng,null,false)});
  } else entryMarker.setLatLng([lat,lng]);
  if(pan) entryMap.setView([lat,lng],Math.max(entryMap.getZoom(),15));
  $('coordText').textContent=`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  $('accuracyText').textContent=accuracy?`GPS ±${Math.round(accuracy)} m`:'Manual location';
  checkDuplicates();
}

function getGPS() {
  if(!navigator.geolocation){$('gpsStatus').textContent='GPS is not supported by this browser.';return;}
  $('gpsStatus').textContent='Getting location…'; $('gpsBtn').disabled=true;
  navigator.geolocation.getCurrentPosition(pos=>{
    setEntryLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy,true);
    $('gpsStatus').textContent=`GPS acquired (±${Math.round(pos.coords.accuracy)} m)`; $('gpsBtn').disabled=false;
  },err=>{
    $('gpsStatus').textContent=err.code===1?'Location permission denied. Allow location in your browser settings, or tap the map manually.':'Could not get GPS. Tap the map manually.';
    $('gpsBtn').disabled=false;
  },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}

function haversine(a,b) {
  const R=6371000, rad=x=>x*Math.PI/180;
  const dLat=rad(b.latitude-a.latitude), dLon=rad(b.longitude-a.longitude);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}

function checkDuplicates() {
  const box=$('duplicateWarning'); box.classList.add('hidden');
  if(!entryLocation||!selectedCategory) return;
  const t=new Date($('occurredAt').value||Date.now()).getTime();
  const matches=incidents.filter(i=>i.category===selectedCategory && Math.abs(new Date(i.occurred_at).getTime()-t)<=6*3600000 && haversine(entryLocation,{latitude:Number(i.latitude),longitude:Number(i.longitude)})<=300).slice(0,3);
  if(matches.length){box.innerHTML=`<strong>Possible related / duplicate incident${matches.length>1?'s':''}</strong><br>${matches.map(m=>`${esc(m.incident_ref)} · ${esc(m.site||'No site')} · ${new Date(m.occurred_at).toLocaleString()}`).join('<br>')}<br><small>If this is the same event, consider linking the reference rather than creating an unrelated duplicate.</small>`;box.classList.remove('hidden');}
}

async function fileToData(file) {
  return new Promise((resolve,reject)=>{
    const img=new Image(), reader=new FileReader();
    reader.onload=e=>{img.onload=()=>{
      let w=img.width,h=img.height,max=1280;if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r)}
      const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
      resolve({name:file.name,type:'image/jpeg',data:c.toDataURL('image/jpeg',.74)});
    };img.onerror=reject;img.src=e.target.result}; reader.onerror=reject; reader.readAsDataURL(file);
  });
}

async function previewPhotos() {
  const files=[...$('photos').files].slice(0,3); evidence=[]; $('photoPreview').innerHTML='';
  for(const f of files){try{const e=await fileToData(f);evidence.push(e);const im=new Image();im.src=e.data;$('photoPreview').appendChild(im)}catch{}}
}

function payload() {
  return {
    reporter_name:profile.name, reporter_org:profile.org,
    occurred_at:$('occurredAt').value, time_precision:$('timePrecision').value,
    source_type:$('sourceType').value, category:selectedCategory, subcategory:$('subcategory').value,
    severity:$('severity').value, description:$('description').value,
    site:$('site').value, location_description:$('locationDescription').value,
    latitude:entryLocation?.latitude, longitude:entryLocation?.longitude, accuracy_m:entryLocation?.accuracy_m,
    location_precision:$('locationPrecision').value,
    people_at_risk:$('peopleAtRisk').checked, environmental_damage:$('environmentalDamage').checked,
    habitat_affected:$('habitatAffected').value, infrastructure_damage:$('infrastructureDamage').checked,
    designated_site_impact:$('designatedSiteImpact').checked, vehicle_involved:$('vehicleInvolved').checked,
    vehicle_registration:$('vehicleRegistration').value, vehicle_description:$('vehicleDescription').value,
    identifiable_person_details:$('personDetails').value, sensitive_notes:$('sensitiveNotes').value,
    evidence_json:evidence, police_ref:$('policeRef').value, partner_ref:$('partnerRef').value,
    lead_org:$('leadOrg').value, assigned_to:$('assignedTo').value, status:$('status').value,
    follow_up_required:$('followUpRequired').checked, follow_up_date:$('followUpDate').value,
    linked_incident_ref:$('linkedIncidentRef').value, tags:$('tags').value
  };
}

async function saveIncident(e) {
  e.preventDefault(); $('formMsg').textContent='';
  if(!selectedCategory){$('formMsg').textContent='Select an incident category.';return}
  if(!$('description').value.trim()){$('formMsg').textContent='Add a brief incident description.';return}
  if(!entryLocation){$('formMsg').textContent='Set the incident location using GPS or the map.';return}
  $('saveBtn').disabled=true;$('saveBtn').textContent='Saving…';
  try{
    const r=await apiFetch('/api/incidents',{method:'POST',body:JSON.stringify(payload())});const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Could not save incident');
    $('formMsg').textContent=`Saved as ${data.incident.incident_ref}`;
    await loadIncidents();
    setTimeout(()=>{resetForm();nav('dashboard')},900);
  }catch(err){$('formMsg').textContent=err.message}finally{$('saveBtn').disabled=false;$('saveBtn').textContent='Save incident'}
}

function resetForm() {
  $('incidentForm').reset(); selectedCategory=''; evidence=[]; entryLocation=null;
  document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('active'));
  $('subcategory').innerHTML='<option value="">Select category first</option>';
  $('occurredAt').value=localDateTime(); $('severity').value='Medium'; $('timePrecision').value='Exact'; $('locationPrecision').value='Exact point'; $('sourceType').value='Staff / partner observation'; $('status').value='New';
  $('leadOrg').value=profile.org||''; $('vehicleFields').classList.add('hidden');$('followUpDateWrap').classList.add('hidden');$('photoPreview').innerHTML='';$('formMsg').textContent='';$('duplicateWarning').classList.add('hidden');$('coordText').textContent='No location selected';$('accuracyText').textContent='';
  if(entryMarker){entryMap.removeLayer(entryMarker);entryMarker=null}
}

function incidentCard(i) {
  const closed=i.status==='Closed';
  return `<article class="incident-card" data-id="${i.id}"><div><span class="incident-ref">${esc(i.incident_ref)}</span><div class="incident-title">${esc(i.category)}${i.subcategory?' · '+esc(i.subcategory):''}</div><div class="incident-meta"><span>${esc(i.site||'Unspecified site')}</span><span>•</span><span>${new Date(i.occurred_at).toLocaleString()}</span><span>•</span><span>${esc(i.reporter_org)}</span></div></div><div><span class="badge ${esc(i.severity||'').toLowerCase()}">${esc(i.severity)}</span><br><span class="badge ${closed?'':'open'}" style="margin-top:5px">${esc(i.status)}</span></div></article>`;
}

function renderAll(){renderDashboard();renderRecords()}
function renderDashboard(){
  const now=Date.now(); $('statTotal').textContent=incidents.length;
  $('statOpen').textContent=incidents.filter(i=>i.status!=='Closed').length;
  $('statHigh').textContent=incidents.filter(i=>['High','Critical'].includes(i.severity)).length;
  $('stat30').textContent=incidents.filter(i=>now-new Date(i.occurred_at).getTime()<=30*86400000).length;
  $('recentList').innerHTML=incidents.length?incidents.slice(0,5).map(incidentCard).join(''):'<div class="empty-state">No incidents logged yet.</div>';
  bindCards($('recentList'));
}

function renderRecords(){
  $('recordCount').textContent=`${incidents.length} incident${incidents.length===1?'':'s'}`;
  $('recordsList').innerHTML=incidents.length?incidents.map(incidentCard).join(''):'<div class="empty-state">No incidents match these filters.</div>';
  bindCards($('recordsList'));
  if(!recordLayer)return;recordLayer.clearLayers();
  const points=[];
  incidents.forEach(i=>{const lat=Number(i.latitude),lng=Number(i.longitude);if(Number.isFinite(lat)&&Number.isFinite(lng)){points.push([lat,lng]);const m=L.marker([lat,lng]).addTo(recordLayer);m.bindPopup(`<strong>${esc(i.incident_ref)}</strong><br>${esc(i.category)}<br>${esc(i.site||'')}`);m.on('click',()=>openIncident(i.id))}});
  if(points.length){const bounds=L.latLngBounds(points);recordsMap.fitBounds(bounds.pad(.12),{maxZoom:14})}
}
function bindCards(el){el.querySelectorAll('.incident-card').forEach(c=>c.onclick=()=>openIncident(c.dataset.id))}

async function loadIncidents(){
  const p=new URLSearchParams();
  [['q','filterQ'],['status','filterStatus'],['category','filterCategory'],['from','filterFrom'],['to','filterTo']].forEach(([k,id])=>{const v=$(id)?.value?.trim();if(v)p.set(k,v)});
  const r=await apiFetch('/api/incidents?'+p); if(!r.ok)return; incidents=(await r.json()).incidents||[]; renderAll();
}

async function openIncident(id){
  const i=incidents.find(x=>x.id===id);if(!i)return;
  let actions=[];try{const r=await apiFetch(`/api/incidents/${id}/actions`);if(r.ok)actions=(await r.json()).actions||[]}catch{}
  const d=$('drawerContent');
  d.innerHTML=`<span class="incident-ref">${esc(i.incident_ref)}</span><h2>${esc(i.category)}</h2><p>${esc(i.description)}</p><div class="detail-grid">
    ${detail('Status',i.status)}${detail('Severity',i.severity)}${detail('Occurred',new Date(i.occurred_at).toLocaleString())}${detail('Site',i.site||'—')}${detail('Recorded by',`${i.reporter_name} · ${i.reporter_org}`)}${detail('Source',i.source_type||'—')}${detail('Lead organisation',i.lead_org||'—')}${detail('Assigned to',i.assigned_to||'—')}${detail('Police ref',i.police_ref||'—')}${detail('Partner ref',i.partner_ref||'—')}${detail('Linked incident',i.linked_incident_ref||'—')}${detail('Environmental impact',i.habitat_affected||'—')}
  </div>${i.evidence_json?.length?`<h3>Evidence</h3><div class="photo-preview">${i.evidence_json.map(e=>`<img src="${e.data}" alt="Incident evidence">`).join('')}</div>`:''}
  <p class="privacy-note">Restricted personal and vehicle-identifying fields are not shown in the general incident view.</p>
  <h3>Actions and updates</h3><div class="timeline">${actions.length?actions.map(a=>`<div class="timeline-item"><strong>${esc(a.action_type||'Update')}</strong><div>${esc(a.note)}</div><small>${new Date(a.action_at).toLocaleString()} · ${esc(a.action_by)} · ${esc(a.organisation)}${a.status_after?' · '+esc(a.status_after):''}</small></div>`).join(''):'<div class="timeline-item muted">No follow-up actions recorded yet.</div>'}</div>
  <div class="form-card"><h3>Add update</h3><div class="two-col"><label>Action type<select id="actionType"><option>Site visit</option><option>Reported to partner</option><option>Enforcement action</option><option>Repair / works</option><option>Evidence added</option><option>Monitoring update</option><option>Other</option></select></label><label>Status after<select id="actionStatus"><option value="">No status change</option><option>Reviewed</option><option>Assigned</option><option>Action in progress</option><option>Monitoring</option><option>Closed</option></select></label></div><label>Update<textarea id="actionNote" rows="3"></textarea></label><button class="primary" id="addActionBtn">Add update</button><p id="actionMsg" class="message"></p></div>`;
  $('detailDrawer').classList.remove('hidden');
  $('addActionBtn').onclick=()=>addAction(id);
}
function detail(k,v){return `<div class="detail-item"><span>${esc(k)}</span>${esc(v)}</div>`}

async function addAction(id){
  const note=$('actionNote').value.trim();if(!note){$('actionMsg').textContent='Add an update note.';return}
  const body={action_by:profile.name,organisation:profile.org,action_type:$('actionType').value,note,status_after:$('actionStatus').value};
  const r=await apiFetch(`/api/incidents/${id}/actions`,{method:'POST',body:JSON.stringify(body)});const data=await r.json();
  if(!r.ok){$('actionMsg').textContent=data.error||'Could not save update';return}
  await loadIncidents();openIncident(id);
}

async function exportData(kind){
  const p=new URLSearchParams();[['q','filterQ'],['status','filterStatus'],['category','filterCategory'],['from','filterFrom'],['to','filterTo']].forEach(([k,id])=>{const v=$(id).value.trim();if(v)p.set(k,v)});
  const r=await apiFetch(`/api/export.${kind}?${p}`);if(!r.ok)return;const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=kind==='csv'?'durham-coast-asb-incidents.csv':'durham-coast-asb-incidents.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function init(){
  setupCategories();setupMaps();$('occurredAt').value=localDateTime();
  try{config=await (await fetch('/api/config')).json()}catch{}
  $('profileInitials').textContent=initials(profile.name);
  if(profile.name&&profile.org){try{const r=await apiFetch('/api/incidents');if(r.ok){incidents=(await r.json()).incidents||[];renderAll()}else showLogin()}catch{showLogin()}}else showLogin();
}

document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
$('loginBtn').onclick=login;$('profileBtn').onclick=()=>showLogin();$('gpsBtn').onclick=getGPS;$('photos').onchange=previewPhotos;
$('vehicleInvolved').onchange=e=>$('vehicleFields').classList.toggle('hidden',!e.target.checked);
$('followUpRequired').onchange=e=>$('followUpDateWrap').classList.toggle('hidden',!e.target.checked);
$('incidentForm').onsubmit=saveIncident;$('resetBtn').onclick=resetForm;$('applyFilters').onclick=loadIncidents;
$('csvBtn').onclick=()=>exportData('csv');$('geoBtn').onclick=()=>exportData('geojson');
$('occurredAt').onchange=checkDuplicates;
document.querySelectorAll('[data-close-drawer]').forEach(x=>x.onclick=()=>$('detailDrawer').classList.add('hidden'));
init();
