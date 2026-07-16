function genId(){ return 'el_' + Math.random().toString(36).slice(2,9); }

function resizeImageFile(file, maxDim, quality){
  maxDim = maxDim || 700;
  quality = quality || 0.75;
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w > h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const defaultConfig = {
  bgColor: '#000000',
  images: [],
  texts: [{ id:'default-text', content: 'kira kg', x: 90, y: 380, size: 32, color: '#ffffff', fontFamily:'inherit' }]
};

const defaultUI = {
  topBar: { text: 'kira kg', bgColor: '#87CEEB', textColor: '#000000', height: 56 },
  bottomBar: { bgColor: '#87CEEB', height: 60 }
};

async function loadConfig(){
  const doc = await db.collection('config').doc('loading').get();
  if(!doc.exists) return JSON.parse(JSON.stringify(defaultConfig));
  const data = doc.data();
  if(data.images && data.texts){
    return { bgColor: data.bgColor ?? defaultConfig.bgColor, images: data.images, texts: data.texts };
  }
  const images = data.image && data.image.src ? [{ id: genId(), ...data.image }] : [];
  const texts = data.text ? [{ id: genId(), fontFamily:'inherit', ...data.text }] : [];
  return { bgColor: data.bgColor ?? defaultConfig.bgColor, images, texts };
}
function saveConfig(cfg){ return db.collection('config').doc('loading').set(cfg); }

async function loadUI(){
  const doc = await db.collection('config').doc('ui').get();
  if(!doc.exists) return JSON.parse(JSON.stringify(defaultUI));
  const p = doc.data();
  return { topBar:{...defaultUI.topBar,...(p.topBar||{})}, bottomBar:{...defaultUI.bottomBar,...(p.bottomBar||{})} };
}
function saveUI(ui){ return db.collection('config').doc('ui').set(ui); }

/* ---------------- LOGIN (Firebase Authentication real) ---------------- */
const loginScreen = document.getElementById('loginScreen');
const editorScreen = document.getElementById('editorScreen');
const emailInput = document.getElementById('emailInput');
const passInput = document.getElementById('passInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

async function tryLogin(){
  loginError.textContent = '';
  loginBtn.disabled = true;
  try{
    const cred = await firebase.auth().signInWithEmailAndPassword(emailInput.value.trim(), passInput.value);
    const adminDoc = await db.collection('admins').doc(cred.user.uid).get();
    if(!adminDoc.exists){
      await firebase.auth().signOut();
      loginError.textContent = 'Esta cuenta no tiene permisos de administrador.';
      return;
    }
    loginScreen.style.display = 'none';
    editorScreen.style.display = 'block';
    initEditor();
  }catch(e){
    loginError.textContent = 'Correo o contraseña incorrectos.';
  }finally{
    loginBtn.disabled = false;
  }
}
loginBtn.addEventListener('click', tryLogin);
passInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });
emailInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });

/* ---------------- EDITOR PANTALLA DE CARGA ---------------- */
let cfg = JSON.parse(JSON.stringify(defaultConfig));
let ui = JSON.parse(JSON.stringify(defaultUI));

async function initEditor(){
  cfg = await loadConfig();
  ui = await loadUI();
  document.getElementById('bgColor').value = cfg.bgColor;
  document.getElementById('bgColor').oninput = e=>{ cfg.bgColor = e.target.value; updatePreview(); };
  renderImagesList();
  renderTextsList();
  updatePreview();
  fillUIForm();
  updateUIPreview();
  attachUIEvents();

  document.getElementById('addImageBtn').onclick = ()=>{
    cfg.images.push({ id: genId(), src:'', x:60, y:60, width:150, height:150 });
    renderImagesList();
    updatePreview();
  };
  document.getElementById('addTextBtn').onclick = ()=>{
    cfg.texts.push({ id: genId(), content:'Nuevo texto', x:60, y:60, size:24, color:'#ffffff', fontFamily:'inherit' });
    renderTextsList();
    updatePreview();
  };

  document.getElementById('saveBtn').onclick = async ()=>{
    const errBox = document.getElementById('saveError');
    errBox.textContent = '';
    try{
      await saveConfig(cfg);
      alert('Cambios guardados. Se reflejarán en la pantalla pública.');
    }catch(e){
      console.error(e);
      errBox.textContent = 'Error al guardar: ' + e.message + '. Si subiste una imagen muy grande, prueba con otra más pequeña.';
    }
  };

  document.getElementById('resetBtn').onclick = ()=>{
    if(confirm('¿Restablecer a los valores por defecto?')){
      cfg = JSON.parse(JSON.stringify(defaultConfig));
      renderImagesList();
      renderTextsList();
      updatePreview();
    }
  };

  renderUsersList();
  initVideosManager();
}

function fontOptionsHtml(selected){
  const fonts = [
    ['inherit','Predeterminada'], ['Arial, sans-serif','Arial'], ['Georgia, serif','Georgia'],
    ["'Courier New', monospace",'Courier New'], ["'Comic Sans MS', cursive",'Comic Sans MS'],
    ['Verdana, sans-serif','Verdana'], ["'Times New Roman', serif",'Times New Roman']
  ];
  return fonts.map(f=>`<option value="${f[0]}" ${f[0]===selected?'selected':''}>${f[1]}</option>`).join('');
}

function renderImagesList(){
  const wrap = document.getElementById('imagesList');
  if(cfg.images.length === 0){
    wrap.innerHTML = '<p style="font-size:13px; color:var(--muted);">Aún no hay imágenes agregadas.</p>';
    return;
  }
  wrap.innerHTML = cfg.images.map((img,i)=>`
    <div class="element-card">
      <div class="element-card-header"><b>Imagen ${i+1}</b><button type="button" class="remove-el-btn" data-id="${img.id}" data-kind="image">Eliminar</button></div>
      <label>Subir desde el ordenador<input type="file" accept="image/*" class="img-file" data-id="${img.id}"></label>
      <label>...o URL<input type="text" class="img-url" data-id="${img.id}" value="${(img.src && !img.src.startsWith('data:')) ? img.src : ''}" placeholder="https://..."></label>
      <div class="row-2">
        <label>Ancho (px)<input type="number" class="img-width" data-id="${img.id}" value="${img.width}"></label>
        <label>Alto (px)<input type="number" class="img-height" data-id="${img.id}" value="${img.height}"></label>
      </div>
      <div class="row-2">
        <label>Posición X<input type="number" class="img-x" data-id="${img.id}" value="${img.x}"></label>
        <label>Posición Y<input type="number" class="img-y" data-id="${img.id}" value="${img.y}"></label>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.img-file').forEach(inp=>{
    inp.onchange = async e=>{
      const file = e.target.files[0];
      if(!file) return;
      const dataUrl = await resizeImageFile(file, 700, 0.75);
      const item = cfg.images.find(x=>x.id===inp.dataset.id);
      item.src = dataUrl;
      updatePreview();
    };
  });
  wrap.querySelectorAll('.img-url').forEach(inp=>{
    inp.oninput = e=>{ cfg.images.find(x=>x.id===inp.dataset.id).src = e.target.value.trim(); updatePreview(); };
  });
  wrap.querySelectorAll('.img-width').forEach(inp=>{
    inp.oninput = e=>{ cfg.images.find(x=>x.id===inp.dataset.id).width = Number(e.target.value)||1; updatePreview(); };
  });
  wrap.querySelectorAll('.img-height').forEach(inp=>{
    inp.oninput = e=>{ cfg.images.find(x=>x.id===inp.dataset.id).height = Number(e.target.value)||1; updatePreview(); };
  });
  wrap.querySelectorAll('.img-x').forEach(inp=>{
    inp.oninput = e=>{ cfg.images.find(x=>x.id===inp.dataset.id).x = Number(e.target.value)||0; updatePreview(); };
  });
  wrap.querySelectorAll('.img-y').forEach(inp=>{
    inp.oninput = e=>{ cfg.images.find(x=>x.id===inp.dataset.id).y = Number(e.target.value)||0; updatePreview(); };
  });
  wrap.querySelectorAll('.remove-el-btn[data-kind="image"]').forEach(btn=>{
    btn.onclick = ()=>{
      cfg.images = cfg.images.filter(x=>x.id!==btn.dataset.id);
      renderImagesList();
      updatePreview();
    };
  });
}

function renderTextsList(){
  const wrap = document.getElementById('textsList');
  if(cfg.texts.length === 0){
    wrap.innerHTML = '<p style="font-size:13px; color:var(--muted);">Aún no hay textos agregados.</p>';
    return;
  }
  wrap.innerHTML = cfg.texts.map((t,i)=>`
    <div class="element-card">
      <div class="element-card-header"><b>Texto ${i+1}</b><button type="button" class="remove-el-btn" data-id="${t.id}" data-kind="text">Eliminar</button></div>
      <label>Contenido<input type="text" class="text-content" data-id="${t.id}" value="${t.content}"></label>
      <label>Tipo de letra
        <select class="text-font" data-id="${t.id}">${fontOptionsHtml(t.fontFamily)}</select>
      </label>
      <div class="row-2">
        <label>Tamaño (px)<input type="number" class="text-size" data-id="${t.id}" value="${t.size}"></label>
        <label>Color<input type="color" class="text-color" data-id="${t.id}" value="${t.color}"></label>
      </div>
      <div class="row-2">
        <label>Posición X<input type="number" class="text-x" data-id="${t.id}" value="${t.x}"></label>
        <label>Posición Y<input type="number" class="text-y" data-id="${t.id}" value="${t.y}"></label>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.text-content').forEach(inp=>{
    inp.oninput = e=>{ cfg.texts.find(x=>x.id===inp.dataset.id).content = e.target.value; updatePreview(); };
  });
  wrap.querySelectorAll('.text-font').forEach(sel=>{
    sel.onchange = e=>{ cfg.texts.find(x=>x.id===sel.dataset.id).fontFamily = e.target.value; updatePreview(); };
  });
  wrap.querySelectorAll('.text-size').forEach(inp=>{
    inp.oninput = e=>{ cfg.texts.find(x=>x.id===inp.dataset.id).size = Number(e.target.value)||1; updatePreview(); };
  });
  wrap.querySelectorAll('.text-color').forEach(inp=>{
    inp.oninput = e=>{ cfg.texts.find(x=>x.id===inp.dataset.id).color = e.target.value; updatePreview(); };
  });
  wrap.querySelectorAll('.text-x').forEach(inp=>{
    inp.oninput = e=>{ cfg.texts.find(x=>x.id===inp.dataset.id).x = Number(e.target.value)||0; updatePreview(); };
  });
  wrap.querySelectorAll('.text-y').forEach(inp=>{
    inp.oninput = e=>{ cfg.texts.find(x=>x.id===inp.dataset.id).y = Number(e.target.value)||0; updatePreview(); };
  });
  wrap.querySelectorAll('.remove-el-btn[data-kind="text"]').forEach(btn=>{
    btn.onclick = ()=>{
      cfg.texts = cfg.texts.filter(x=>x.id!==btn.dataset.id);
      renderTextsList();
      updatePreview();
    };
  });
}

function updatePreview(){
  const screen = document.getElementById('previewScreen');
  screen.style.background = cfg.bgColor;
  screen.innerHTML = '';

  cfg.images.forEach(img=>{
    if(!img.src) return;
    const el = document.createElement('img');
    el.src = img.src;
    el.className = 'draggable';
    el.dataset.id = img.id; el.dataset.type = 'image';
    el.style.position = 'absolute';
    el.style.left = img.x + 'px'; el.style.top = img.y + 'px';
    el.style.width = img.width + 'px'; el.style.height = img.height + 'px';
    screen.appendChild(el);
    bindDragForElement(el);
  });

  cfg.texts.forEach(t=>{
    const el = document.createElement('div');
    el.textContent = t.content;
    el.className = 'draggable';
    el.dataset.id = t.id; el.dataset.type = 'text';
    el.style.position = 'absolute';
    el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
    el.style.fontSize = t.size + 'px';
    el.style.color = t.color;
    el.style.fontFamily = t.fontFamily || 'inherit';
    el.style.fontWeight = '700';
    el.style.whiteSpace = 'pre';
    screen.appendChild(el);
    bindDragForElement(el);
  });
}

/* ---------------- EDITOR PANTALLA PRINCIPAL (barras) ---------------- */
function fillUIForm(){
  document.getElementById('topText').value = ui.topBar.text;
  document.getElementById('topColor').value = ui.topBar.bgColor;
  document.getElementById('topTextColor').value = ui.topBar.textColor;
  document.getElementById('topHeight').value = ui.topBar.height;

  document.getElementById('bottomColor').value = ui.bottomBar.bgColor;
  document.getElementById('bottomHeight').value = ui.bottomBar.height;
}

function updateUIPreview(){
  const top = document.getElementById('uiPreviewTop');
  const bottom = document.getElementById('uiPreviewBottom');
  const text = document.getElementById('uiPreviewText');

  top.style.background = ui.topBar.bgColor;
  top.style.height = ui.topBar.height + 'px';
  text.textContent = ui.topBar.text;
  text.style.color = ui.topBar.textColor;

  bottom.style.background = ui.bottomBar.bgColor;
  bottom.style.height = ui.bottomBar.height + 'px';
}

function attachUIEvents(){
  document.getElementById('topText').oninput = e=>{ ui.topBar.text = e.target.value; updateUIPreview(); };
  document.getElementById('topColor').oninput = e=>{ ui.topBar.bgColor = e.target.value; updateUIPreview(); };
  document.getElementById('topTextColor').oninput = e=>{ ui.topBar.textColor = e.target.value; updateUIPreview(); };
  document.getElementById('topHeight').oninput = e=>{ ui.topBar.height = Number(e.target.value)||56; updateUIPreview(); };

  document.getElementById('bottomColor').oninput = e=>{ ui.bottomBar.bgColor = e.target.value; updateUIPreview(); };
  document.getElementById('bottomHeight').oninput = e=>{ ui.bottomBar.height = Number(e.target.value)||60; updateUIPreview(); };

  document.getElementById('saveUiBtn').onclick = async ()=>{
    await saveUI(ui);
    alert('Cambios guardados. Se reflejarán en la pantalla pública.');
  };

  document.getElementById('resetUiBtn').onclick = ()=>{
    if(confirm('¿Restablecer a los valores por defecto?')){
      ui = JSON.parse(JSON.stringify(defaultUI));
      fillUIForm();
      updateUIPreview();
    }
  };
}

/* ---------------- ARRASTRAR ELEMENTOS EN LA VISTA PREVIA ---------------- */
let dragging = null, dragOffX = 0, dragOffY = 0;

function bindDragForElement(el){
  el.addEventListener('mousedown', e=>startDrag(el,e));
  el.addEventListener('touchstart', e=>startDrag(el,e), {passive:false});
}
function startDrag(el, e){
  dragging = el;
  const rect = el.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  dragOffX = point.clientX - rect.left;
  dragOffY = point.clientY - rect.top;
  e.preventDefault();
}
function onDragMove(e){
  if(!dragging) return;
  const screen = document.getElementById('previewScreen');
  const screenRect = screen.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  let x = point.clientX - screenRect.left - dragOffX;
  let y = point.clientY - screenRect.top - dragOffY;
  x = Math.max(0, Math.min(x, screenRect.width - dragging.offsetWidth));
  y = Math.max(0, Math.min(y, screenRect.height - dragging.offsetHeight));
  dragging.style.left = x + 'px';
  dragging.style.top = y + 'px';

  const id = dragging.dataset.id;
  if(dragging.dataset.type === 'image'){
    const item = cfg.images.find(i=>i.id===id);
    item.x = Math.round(x); item.y = Math.round(y);
    const xi = document.querySelector(`.img-x[data-id="${id}"]`); if(xi) xi.value = item.x;
    const yi = document.querySelector(`.img-y[data-id="${id}"]`); if(yi) yi.value = item.y;
  }else{
    const item = cfg.texts.find(i=>i.id===id);
    item.x = Math.round(x); item.y = Math.round(y);
    const xi = document.querySelector(`.text-x[data-id="${id}"]`); if(xi) xi.value = item.x;
    const yi = document.querySelector(`.text-y[data-id="${id}"]`); if(yi) yi.value = item.y;
  }
}
function endDrag(){ dragging = null; }
window.addEventListener('mousemove', onDragMove);
window.addEventListener('touchmove', onDragMove, {passive:false});
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);

/* ---------------- GESTIÓN DE USUARIOS ---------------- */
function avatarFor(u){ return 'https://i.pravatar.cc/100?u=' + encodeURIComponent(u); }

function renderUsersList(){
  db.collection('users').onSnapshot(snap=>{
    const list = document.getElementById('usersList');
    const names = [];
    snap.forEach(d=> names.push(d.id));
    if(names.length===0){
      list.innerHTML = '<div class="empty-state">Aún no hay usuarios registrados.</div>';
      return;
    }
    list.innerHTML = names.map(n=>`
      <div class="user-row">
        <img src="${avatarFor(n)}">
        <b>${n}</b>
        <button data-user="${n}">Eliminar</button>
      </div>
    `).join('');

    list.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const name = btn.dataset.user;
        if(!confirm(`¿Eliminar por completo la cuenta "${name}"? Se borrarán sus publicaciones y ajustes.`)) return;
        deleteUser(name);
      });
    });
  });
}

async function deleteUser(name){
  await db.collection('users').doc(name).delete();
  await db.collection('profileStyles').doc(name).delete();
  await db.collection('avatarGallery').doc(name).delete();
  await db.collection('follows').doc(name).delete();

  const postsSnap = await db.collection('posts').where('user','==',name).get();
  const batchDeletes = [];
  postsSnap.forEach(d => batchDeletes.push(d.ref.delete()));
  await Promise.all(batchDeletes);

  const followsSnap = await db.collection('follows').get();
  const followUpdates = [];
  followsSnap.forEach(d=>{
    const following = d.data().following || [];
    if(following.includes(name)){
      followUpdates.push(d.ref.update({ following: firebase.firestore.FieldValue.arrayRemove(name) }));
    }
  });
  await Promise.all(followUpdates);

  const devicesSnap = await db.collection('devices').where('username','==',name).get();
  const deviceDeletes = [];
  devicesSnap.forEach(d => deviceDeletes.push(d.ref.delete()));
  await Promise.all(deviceDeletes);

  const allPostsSnap = await db.collection('posts').get();
  const postUpdates = [];
  allPostsSnap.forEach(d=>{
    const data = d.data();
    const patch = {};
    if((data.likedBy||[]).includes(name)) patch.likedBy = firebase.firestore.FieldValue.arrayRemove(name);
    if((data.sharedBy||[]).includes(name)) patch.sharedBy = firebase.firestore.FieldValue.arrayRemove(name);
    if((data.savedBy||[]).includes(name)) patch.savedBy = firebase.firestore.FieldValue.arrayRemove(name);
    if((data.comments||[]).some(c=>c.user===name)) patch.comments = (data.comments||[]).filter(c=>c.user!==name);
    if(Object.keys(patch).length) postUpdates.push(d.ref.update(patch));
  });
  await Promise.all(postUpdates);

  const convSnap = await db.collection('conversations').get();
  const convDeletes = [];
  convSnap.forEach(d=>{ if(d.id.split('_').includes(name)) convDeletes.push(d.ref.delete()); });
  await Promise.all(convDeletes);

  const notifToSnap = await db.collection('notifications').where('toUser','==',name).get();
  const notifFromSnap = await db.collection('notifications').where('fromUser','==',name).get();
  const notifDeletes = [];
  notifToSnap.forEach(d=> notifDeletes.push(d.ref.delete()));
  notifFromSnap.forEach(d=> notifDeletes.push(d.ref.delete()));
  await Promise.all(notifDeletes);
}

/* ---------------- GESTIÓN DE VIDEOS "MUNDIAL" ---------------- */
function extractYoutubeId(input){
  input = input.trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  ];
  for(const re of patterns){
    const m = input.match(re);
    if(m) return m[1];
  }
  return null;
}

function initVideosManager(){
  document.getElementById('addVideoBtn').onclick = async ()=>{
    const err = document.getElementById('videoError');
    err.textContent = '';
    const url = document.getElementById('newVideoUrl').value.trim();
    const title = document.getElementById('newVideoTitle').value.trim();
    const videoId = extractYoutubeId(url);
    if(!videoId){ err.textContent = 'No se pudo reconocer el video. Pega el enlace completo de YouTube.'; return; }
    try{
      await db.collection('globalVideos').doc(videoId).set({
        type: 'youtube', videoId, title, user: 'admin',
        likedBy: [], savedBy: [], comments: [], createdAt: Date.now()
      }, {merge:true});
      document.getElementById('newVideoUrl').value = '';
      document.getElementById('newVideoTitle').value = '';
    }catch(e){
      err.textContent = 'Error al agregar: ' + e.message;
    }
  };

  db.collection('globalVideos').orderBy('createdAt','desc').onSnapshot(snap=>{
    const list = document.getElementById('globalVideosList');
    const videos = [];
    snap.forEach(d=> videos.push({ id:d.id, ...d.data() }));
    if(videos.length === 0){
      list.innerHTML = '<div class="empty-state">Aún no hay videos agregados.</div>';
      return;
    }
    list.innerHTML = videos.map(v=>{
      const thumb = v.type === 'local'
        ? (v.storageUrl || '')
        : `https://img.youtube.com/vi/${v.videoId}/default.jpg`;
      return `
      <div class="user-row">
        ${v.type === 'local' ? `<video src="${thumb}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;"></video>` : `<img src="${thumb}">`}
        <b>${v.title || (v.type==='local' ? '(video local)' : v.videoId)} — ${v.user||'?'}</b>
        <button data-id="${v.id}" data-storage="${v.storagePath||''}">Eliminar</button>
      </div>
    `;
    }).join('');
    list.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('¿Eliminar este video?')) return;
        await db.collection('globalVideos').doc(btn.dataset.id).delete();
        if(btn.dataset.storage){
          try{ await storage.ref().child(btn.dataset.storage).delete(); }catch(e){}
        }
      });
    });
  });
}
