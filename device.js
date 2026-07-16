const DEVICE_TOKEN_KEY = 'kiraDeviceToken';

function getCookie(name){
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}
function setCookie(name, value, days){
  const d = new Date();
  d.setTime(d.getTime() + days*24*60*60*1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}
function deleteCookie(name){
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
}

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open('kiraDB', 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbGet(key){
  try{
    const db2 = await idbOpen();
    return new Promise(resolve=>{
      const tx = db2.transaction('kv','readonly');
      const r = tx.objectStore('kv').get(key);
      r.onsuccess = ()=> resolve(r.result ?? null);
      r.onerror = ()=> resolve(null);
    });
  }catch(e){ return null; }
}
async function idbSet(key, value){
  try{
    const db2 = await idbOpen();
    return new Promise(resolve=>{
      const tx = db2.transaction('kv','readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> resolve(false);
    });
  }catch(e){ return false; }
}

function generateToken(){
  if(crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

/* Lee el token combinando las 3 fuentes (localStorage, cookie, IndexedDB) y las sincroniza entre sí */
async function getDeviceToken(){
  const ls = localStorage.getItem(DEVICE_TOKEN_KEY);
  const ck = getCookie(DEVICE_TOKEN_KEY);
  const idb = await idbGet(DEVICE_TOKEN_KEY);
  const token = ls || ck || idb || null;
  if(token) await setDeviceToken(token);
  return token;
}

async function setDeviceToken(token){
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  setCookie(DEVICE_TOKEN_KEY, token, 1825);
  await idbSet(DEVICE_TOKEN_KEY, token);
}

async function clearDeviceToken(){
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  deleteCookie(DEVICE_TOKEN_KEY);
  await idbSet(DEVICE_TOKEN_KEY, null);
}

/* Busca en Firestore a qué usuario pertenece este dispositivo */
async function resolveUsernameFromDevice(){
  const token = await getDeviceToken();
  if(!token) return null;
  try{
    const doc = await db.collection('devices').doc(token).get();
    return doc.exists ? doc.data().username : null;
  }catch(e){ return null; }
}

/* Crea (o renueva) el vínculo dispositivo → usuario */
async function linkDeviceToUser(username){
  let token = await getDeviceToken();
  if(!token){
    token = generateToken();
    await setDeviceToken(token);
  }
  await db.collection('devices').doc(token).set({ username, createdAt: Date.now() });
  return token;
}
