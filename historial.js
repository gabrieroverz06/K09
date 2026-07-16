function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const loginScreen = document.getElementById('loginScreen');
const historialScreen = document.getElementById('historialScreen');
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
    historialScreen.style.display = 'block';
    initHistorial();
  }catch(e){
    loginError.textContent = 'Correo o contraseña incorrectos.';
  }finally{
    loginBtn.disabled = false;
  }
}
loginBtn.addEventListener('click', tryLogin);
passInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });
emailInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });

function avatarFor(u){ return 'https://i.pravatar.cc/100?u=' + encodeURIComponent(u); }
function formatDate(ts){
  if(!ts) return 'Fecha desconocida';
  return new Date(ts).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' });
}

function initHistorial(){
  db.collection('users').onSnapshot(snap=>{
    const list = document.getElementById('accountsList');
    const accounts = [];
    snap.forEach(d=> accounts.push({ username:d.id, ...d.data() }));
    accounts.sort((a,b)=> (b.joinedAt||0) - (a.joinedAt||0));

    if(accounts.length === 0){
      list.innerHTML = '<div class="empty-state">Aún no hay cuentas registradas.</div>';
      return;
    }

    list.innerHTML = accounts.map(a=>`
      <div class="user-row" data-user="${a.username}" style="cursor:pointer;">
        <img src="${avatarFor(a.username)}">
        <div style="flex:1;">
          <b>${a.username}</b>
          <div style="font-size:12px; color:var(--muted);">Creada: ${formatDate(a.joinedAt)}</div>
        </div>
        <button class="delete-account-btn" data-user="${a.username}">Eliminar</button>
      </div>
    `).join('');

    list.querySelectorAll('.user-row').forEach(row=>{
      row.addEventListener('click', (e)=>{
        if(e.target.classList.contains('delete-account-btn')) return;
        showAccountDetail(row.dataset.user);
      });
    });
    list.querySelectorAll('.delete-account-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const name = btn.dataset.user;
        if(!confirm(`¿Eliminar por completo la cuenta "${name}"? Se borrarán sus publicaciones, videos y ajustes.`)) return;
        deleteUser(name);
      });
    });
  });
}

/* ---------------- DETALLE DE CUENTA ---------------- */
let currentDetailUser = null;
let currentDetailTab = 'posts';

function showAccountDetail(username){
  currentDetailUser = username;
  currentDetailTab = 'posts';
  document.getElementById('accountsListWrap').style.display = 'none';
  document.getElementById('accountDetailWrap').style.display = 'block';
  document.getElementById('detailUsername').textContent = username;

  db.collection('users').doc(username).get().then(doc=>{
    const joined = doc.exists ? doc.data().joinedAt : null;
    document.getElementById('detailJoined').textContent = 'Cuenta creada: ' + formatDate(joined);
  });

  document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.htab==='posts'));
  renderDetailContent();
}

document.getElementById('backToAccounts').addEventListener('click', ()=>{
  document.getElementById('accountsListWrap').style.display = 'block';
  document.getElementById('accountDetailWrap').style.display = 'none';
  currentDetailUser = null;
});

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentDetailTab = btn.dataset.htab;
    renderDetailContent();
  });
});

async function renderDetailContent(){
  const content = document.getElementById('detailContent');

  if(currentDetailTab === 'profile'){
    await renderProfileEditor(currentDetailUser);
    return;
  }

  content.innerHTML = '<div class="empty-state">Cargando...</div>';

  if(currentDetailTab === 'posts'){
    const snap = await db.collection('posts').where('user','==',currentDetailUser).get();
    const posts = [];
    snap.forEach(d=> posts.push({ id:d.id, ...d.data() }));
    posts.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

    if(posts.length === 0){
      content.innerHTML = '<div class="empty-state">Esta cuenta no tiene publicaciones.</div>';
      return;
    }
    content.innerHTML = posts.map(p=>{
      const thumb = p.type === 'text' ? '' : ((p.images && p.images[0]) || p.img || '');
      return `
      <div class="user-row">
        ${thumb ? `<img src="${thumb}">` : `<div style="width:38px;height:38px;border-radius:6px;background:#eee;"></div>`}
        <div style="flex:1;">
          <b>${p.caption ? escapeHtml(p.caption.slice(0,40)) : (p.type==='text' ? escapeHtml((p.textPost&&p.textPost.content||'').slice(0,40)) : '(sin descripción)')}</b>
          <div style="font-size:12px; color:var(--muted);">${formatDate(p.createdAt)}</div>
        </div>
        <button class="delete-item-btn" data-col="posts" data-id="${p.id}">Eliminar</button>
      </div>`;
    }).join('');
    attachDeleteItemEvents();

  }else{
    const snap = await db.collection('globalVideos').where('user','==',currentDetailUser).get();
    const videos = [];
    snap.forEach(d=> videos.push({ id:d.id, ...d.data() }));
    videos.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

    if(videos.length === 0){
      content.innerHTML = '<div class="empty-state">Esta cuenta no ha agregado videos.</div>';
      return;
    }
    content.innerHTML = videos.map(v=>`
      <div class="user-row">
        ${v.type==='local'
          ? `<video src="${v.storageUrl||''}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;"></video>`
          : `<img src="https://img.youtube.com/vi/${v.videoId}/default.jpg">`}
        <div style="flex:1;">
          <b>${v.type==='local' ? 'Video local' : ('YouTube: ' + escapeHtml(v.title || v.videoId))}</b>
          <div style="font-size:12px; color:var(--muted);">${formatDate(v.createdAt)}</div>
        </div>
        <button class="delete-item-btn" data-col="globalVideos" data-id="${v.id}" data-storage="${v.storagePath||''}">Eliminar</button>
      </div>
    `).join('');
    attachDeleteItemEvents();
  }
}

function attachDeleteItemEvents(){
  document.querySelectorAll('.delete-item-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar este elemento?')) return;
      await db.collection(btn.dataset.col).doc(btn.dataset.id).delete();
      if(btn.dataset.storage){
        try{ await storage.ref().child(btn.dataset.storage).delete(); }catch(e){}
      }
      renderDetailContent();
    });
  });
}

/* ---------------- BORRADO COMPLETO DE CUENTA (en cascada) ---------------- */
async function deleteUser(name){
  await db.collection('users').doc(name).delete();
  await db.collection('profileStyles').doc(name).delete();
  await db.collection('avatarGallery').doc(name).delete();
  await db.collection('follows').doc(name).delete();

  const postsSnap = await db.collection('posts').where('user','==',name).get();
  await Promise.all(postsSnap.docs.map(d=>d.ref.delete()));

  const videosSnap = await db.collection('globalVideos').where('user','==',name).get();
  await Promise.all(videosSnap.docs.map(async d=>{
    const data = d.data();
    await d.ref.delete();
    if(data.storagePath){
      try{ await storage.ref().child(data.storagePath).delete(); }catch(e){}
    }
  }));

  const followsSnap = await db.collection('follows').get();
  await Promise.all(followsSnap.docs.map(d=>{
    const following = d.data().following || [];
    if(following.includes(name)) return d.ref.update({ following: firebase.firestore.FieldValue.arrayRemove(name) });
  }).filter(Boolean));

  const devicesSnap = await db.collection('devices').where('username','==',name).get();
  await Promise.all(devicesSnap.docs.map(d=>d.ref.delete()));

  const allPostsSnap = await db.collection('posts').get();
  await Promise.all(allPostsSnap.docs.map(d=>{
    const data = d.data();
    const patch = {};
    if((data.likedBy||[]).includes(name)) patch.likedBy = firebase.firestore.FieldValue.arrayRemove(name);
    if((data.sharedBy||[]).includes(name)) patch.sharedBy = firebase.firestore.FieldValue.arrayRemove(name);
    if((data.comments||[]).some(c=>c.user===name)) patch.comments = (data.comments||[]).filter(c=>c.user!==name);
    return Object.keys(patch).length ? d.ref.update(patch) : null;
  }).filter(Boolean));

  const convSnap = await db.collection('conversations').get();
  await Promise.all(convSnap.docs.filter(d=> d.id.split('_').includes(name)).map(d=>d.ref.delete()));

  const notifToSnap = await db.collection('notifications').where('toUser','==',name).get();
  const notifFromSnap = await db.collection('notifications').where('fromUser','==',name).get();
  await Promise.all([...notifToSnap.docs, ...notifFromSnap.docs].map(d=>d.ref.delete()));
}

/* ---------------- EDITOR DE PERFIL (para cualquier cuenta) ---------------- */
const defaultProfileStyle = {
  bgColor: '#ffffff',
  username: { fontFamily: 'inherit', fontSize: 24, color: '#111318', x: 0, y: 0 },
  bio: { fontFamily: 'inherit', fontSize: 14, color: '#111318', x: 0, y: 0 },
  avatar: { src: '', size: 84, x: 0, y: 0, borderColor: '#87CEEB', zoom: 100, posX: 50, posY: 50 },
  followBtn: { color: '#87CEEB', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 },
  messageBtn: { color: '#e4e6eb', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 }
};

function mergeProfileStyle(s){
  return {
    bgColor: s.bgColor ?? defaultProfileStyle.bgColor,
    username: {...defaultProfileStyle.username, ...(s.username||{})},
    bio: {...defaultProfileStyle.bio, ...(s.bio||{})},
    avatar: {...defaultProfileStyle.avatar, ...(s.avatar||{})},
    followBtn: {...defaultProfileStyle.followBtn, ...(s.followBtn||{})},
    messageBtn: {...defaultProfileStyle.messageBtn, ...(s.messageBtn||{})}
  };
}

function fontOptionsHtml(selected){
  const fonts = [
    ['inherit','Predeterminada'], ['Arial, sans-serif','Arial'], ['Georgia, serif','Georgia'],
    ["'Courier New', monospace",'Courier New'], ["'Comic Sans MS', cursive",'Comic Sans MS'],
    ['Verdana, sans-serif','Verdana'], ["'Times New Roman', serif",'Times New Roman']
  ];
  return fonts.map(f=>`<option value="${f[0]}" ${f[0]===selected?'selected':''}>${f[1]}</option>`).join('');
}

function profileEditorHtml(){
  return `
    <div class="editor-grid">
      <div class="editor-panel">
        <fieldset>
          <legend>Fondo</legend>
          <label>Color de fondo del perfil <input type="color" id="h-bgColor"></label>
        </fieldset>

        <fieldset>
          <legend>Nombre de usuario</legend>
          <label>Tipo de letra <select id="h-userFont"></select></label>
          <div class="row-2">
            <label>Tamaño (px)<input type="number" id="h-userSize" min="10" max="60"></label>
            <label>Color de letra<input type="color" id="h-userColor"></label>
          </div>
          <div class="row-2">
            <label>Posición X<input type="number" id="h-userX"></label>
            <label>Posición Y<input type="number" id="h-userY"></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Descripción</legend>
          <label>Texto<input type="text" id="h-bioContent" placeholder="Descripción..."></label>
          <label>Tipo de letra <select id="h-bioFont"></select></label>
          <div class="row-2">
            <label>Tamaño (px)<input type="number" id="h-bioSize" min="8" max="40"></label>
            <label>Color de letra<input type="color" id="h-bioColor"></label>
          </div>
          <div class="row-2">
            <label>Posición X<input type="number" id="h-bioX"></label>
            <label>Posición Y<input type="number" id="h-bioY"></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Foto de perfil</legend>
          <label>Subir desde el ordenador<input type="file" id="h-avatarFile" accept="image/*"></label>
          <label>...o URL de imagen<input type="text" id="h-avatarUrl" placeholder="https://..."></label>
          <label>Fotos guardadas de este usuario</label>
          <div id="h-avatarGallery" class="avatar-gallery"></div>
          <div class="row-2">
            <label>Tamaño (px)<input type="number" id="h-avatarSize" min="30" max="200"></label>
            <label>Color de borde<input type="color" id="h-avatarColor"></label>
          </div>
          <div class="row-2">
            <label>Posición X<input type="number" id="h-avatarX"></label>
            <label>Posición Y<input type="number" id="h-avatarY"></label>
          </div>
          <label>Zoom de la foto<input type="range" id="h-avatarZoom" min="100" max="300" value="100"></label>
          <p style="font-size:12px; color:var(--muted); margin:0;">Arrastra la foto dentro del círculo de la vista previa para acomodarla.</p>
        </fieldset>

        <fieldset>
          <legend>Botón Seguir</legend>
          <label>Color de fondo<input type="color" id="h-followColor"></label>
          <label>Color de letra<input type="color" id="h-followTextColor"></label>
          <label>Tipo de letra <select id="h-followFont"></select></label>
          <div class="row-2">
            <label>Posición X<input type="number" id="h-followX"></label>
            <label>Posición Y<input type="number" id="h-followY"></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Botón Mensaje</legend>
          <label>Color de fondo<input type="color" id="h-msgColor"></label>
          <label>Color de letra<input type="color" id="h-msgTextColor"></label>
          <label>Tipo de letra <select id="h-msgFont"></select></label>
          <div class="row-2">
            <label>Posición X<input type="number" id="h-msgX"></label>
            <label>Posición Y<input type="number" id="h-msgY"></label>
          </div>
        </fieldset>

        <div class="editor-actions">
          <button id="h-saveBtn" class="primary">Guardar cambios</button>
          <button id="h-resetBtn">Restablecer</button>
        </div>
      </div>

      <div class="editor-preview-wrap">
        <p class="preview-label">Vista previa</p>
        <div id="h-preview" class="profile-header preview-profile">
          <div class="profile-top">
            <div id="h-pAvatar" class="profile-avatar-lg avatar-bg avatar-draggable"></div>
            <div class="profile-name-lg" id="h-pName">usuario</div>
          </div>
          <div class="profile-actions">
            <button id="h-pFollow" class="profile-btn">Seguir</button>
            <button id="h-pMsg" class="profile-btn">Mensaje</button>
          </div>
          <div class="profile-stats-row">
            <div><b>0</b><span>Seguidores</span></div>
            <div><b>0</b><span>Seguidos</span></div>
            <div><b>0</b><span>Videos</span></div>
            <div><b>0</b><span>Publicaciones</span></div>
          </div>
          <div class="profile-bio" id="h-pBio"></div>
        </div>
      </div>
    </div>
  `;
}

async function renderProfileEditor(username){
  const content = document.getElementById('detailContent');
  content.innerHTML = profileEditorHtml();

  ['h-userFont','h-bioFont','h-followFont','h-msgFont'].forEach(id=>{
    document.getElementById(id).innerHTML = fontOptionsHtml('inherit');
  });

  const styleDoc = await db.collection('profileStyles').doc(username).get();
  let style = mergeProfileStyle(styleDoc.exists ? styleDoc.data() : {});
  const userDoc = await db.collection('users').doc(username).get();
  let bio = (userDoc.exists && userDoc.data().bio) || '';

  const galleryDoc = await db.collection('avatarGallery').doc(username).get();
  let gallery = galleryDoc.exists ? (galleryDoc.data().images || []) : [];

  function avatarFallback(u){ return 'https://i.pravatar.cc/150?u=' + encodeURIComponent(u); }
  function currentAvatarSrc(){ return style.avatar.src || avatarFallback(username); }

  async function addToGallery(src){
    if(!gallery.includes(src)){
      gallery.unshift(src);
      gallery = gallery.slice(0, 12);
      await db.collection('avatarGallery').doc(username).set({ images: gallery });
    }
    renderGallery();
  }

  function renderGallery(){
    const el = document.getElementById('h-avatarGallery');
    if(gallery.length === 0){
      el.innerHTML = '<div class="empty-state" style="padding:10px 0;">Este usuario no tiene fotos guardadas.</div>';
      return;
    }
    el.innerHTML = gallery.map(src=>`<img src="${src}" class="gallery-thumb ${src===style.avatar.src?'selected':''}" data-src="${src}">`).join('');
    el.querySelectorAll('.gallery-thumb').forEach(img=>{
      img.addEventListener('click', ()=>{
        style.avatar.src = img.dataset.src;
        style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
        document.getElementById('h-avatarUrl').value = '';
        document.getElementById('h-avatarZoom').value = 100;
        updatePreview();
        renderGallery();
      });
    });
  }

  function fillForm(){
    document.getElementById('h-bgColor').value = style.bgColor;
    document.getElementById('h-userFont').value = style.username.fontFamily;
    document.getElementById('h-userSize').value = style.username.fontSize;
    document.getElementById('h-userColor').value = style.username.color;
    document.getElementById('h-userX').value = style.username.x;
    document.getElementById('h-userY').value = style.username.y;

    document.getElementById('h-bioContent').value = bio;
    document.getElementById('h-bioFont').value = style.bio.fontFamily;
    document.getElementById('h-bioSize').value = style.bio.fontSize;
    document.getElementById('h-bioColor').value = style.bio.color;
    document.getElementById('h-bioX').value = style.bio.x;
    document.getElementById('h-bioY').value = style.bio.y;

    document.getElementById('h-avatarUrl').value = (style.avatar.src && !style.avatar.src.startsWith('data:')) ? style.avatar.src : '';
    document.getElementById('h-avatarSize').value = style.avatar.size;
    document.getElementById('h-avatarColor').value = style.avatar.borderColor;
    document.getElementById('h-avatarX').value = style.avatar.x;
    document.getElementById('h-avatarY').value = style.avatar.y;
    document.getElementById('h-avatarZoom').value = style.avatar.zoom;

    document.getElementById('h-followColor').value = style.followBtn.color;
    document.getElementById('h-followTextColor').value = style.followBtn.textColor;
    document.getElementById('h-followFont').value = style.followBtn.fontFamily;
    document.getElementById('h-followX').value = style.followBtn.x;
    document.getElementById('h-followY').value = style.followBtn.y;

    document.getElementById('h-msgColor').value = style.messageBtn.color;
    document.getElementById('h-msgTextColor').value = style.messageBtn.textColor;
    document.getElementById('h-msgFont').value = style.messageBtn.fontFamily;
    document.getElementById('h-msgX').value = style.messageBtn.x;
    document.getElementById('h-msgY').value = style.messageBtn.y;

    renderGallery();
  }

  function updatePreview(){
    document.getElementById('h-preview').style.background = style.bgColor;

    const pName = document.getElementById('h-pName');
    pName.textContent = username;
    pName.style.fontFamily = style.username.fontFamily;
    pName.style.fontSize = style.username.fontSize + 'px';
    pName.style.color = style.username.color;
    pName.style.transform = `translate(${style.username.x}px, ${style.username.y}px)`;

    const pBio = document.getElementById('h-pBio');
    pBio.textContent = bio;
    pBio.style.fontFamily = style.bio.fontFamily;
    pBio.style.fontSize = style.bio.fontSize + 'px';
    pBio.style.color = style.bio.color;
    pBio.style.transform = `translate(${style.bio.x}px, ${style.bio.y}px)`;

    const pAvatar = document.getElementById('h-pAvatar');
    pAvatar.style.backgroundImage = `url("${currentAvatarSrc()}")`;
    pAvatar.style.backgroundSize = style.avatar.zoom + '%';
    pAvatar.style.backgroundPosition = `${style.avatar.posX}% ${style.avatar.posY}%`;
    pAvatar.style.width = style.avatar.size + 'px';
    pAvatar.style.height = style.avatar.size + 'px';
    pAvatar.style.borderColor = style.avatar.borderColor;
    pAvatar.style.transform = `translate(${style.avatar.x}px, ${style.avatar.y}px)`;

    const pFollow = document.getElementById('h-pFollow');
    pFollow.style.background = style.followBtn.color;
    pFollow.style.color = style.followBtn.textColor;
    pFollow.style.fontFamily = style.followBtn.fontFamily;
    pFollow.style.transform = `translate(${style.followBtn.x}px, ${style.followBtn.y}px)`;

    const pMsg = document.getElementById('h-pMsg');
    pMsg.style.background = style.messageBtn.color;
    pMsg.style.color = style.messageBtn.textColor;
    pMsg.style.fontFamily = style.messageBtn.fontFamily;
    pMsg.style.transform = `translate(${style.messageBtn.x}px, ${style.messageBtn.y}px)`;
  }

  function attachEvents(){
    document.getElementById('h-bgColor').oninput = e=>{ style.bgColor = e.target.value; updatePreview(); };

    document.getElementById('h-userFont').onchange = e=>{ style.username.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('h-userSize').oninput = e=>{ style.username.fontSize = Number(e.target.value)||24; updatePreview(); };
    document.getElementById('h-userColor').oninput = e=>{ style.username.color = e.target.value; updatePreview(); };
    document.getElementById('h-userX').oninput = e=>{ style.username.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-userY').oninput = e=>{ style.username.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('h-bioContent').oninput = e=>{ bio = e.target.value; updatePreview(); };
    document.getElementById('h-bioFont').onchange = e=>{ style.bio.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('h-bioSize').oninput = e=>{ style.bio.fontSize = Number(e.target.value)||14; updatePreview(); };
    document.getElementById('h-bioColor').oninput = e=>{ style.bio.color = e.target.value; updatePreview(); };
    document.getElementById('h-bioX').oninput = e=>{ style.bio.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-bioY').oninput = e=>{ style.bio.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('h-avatarFile').onchange = e=>{
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ev=>{
        style.avatar.src = ev.target.result;
        style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
        addToGallery(ev.target.result);
        document.getElementById('h-avatarUrl').value = '';
        document.getElementById('h-avatarZoom').value = 100;
        updatePreview();
      };
      reader.readAsDataURL(file);
    };
    document.getElementById('h-avatarUrl').oninput = e=>{
      const val = e.target.value.trim();
      style.avatar.src = val;
      style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
      document.getElementById('h-avatarZoom').value = 100;
      updatePreview();
    };
    document.getElementById('h-avatarUrl').onblur = e=>{
      const val = e.target.value.trim();
      if(val) addToGallery(val);
    };

    document.getElementById('h-avatarSize').oninput = e=>{ style.avatar.size = Number(e.target.value)||84; updatePreview(); };
    document.getElementById('h-avatarColor').oninput = e=>{ style.avatar.borderColor = e.target.value; updatePreview(); };
    document.getElementById('h-avatarX').oninput = e=>{ style.avatar.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-avatarY').oninput = e=>{ style.avatar.y = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-avatarZoom').oninput = e=>{ style.avatar.zoom = Number(e.target.value)||100; updatePreview(); };

    document.getElementById('h-followColor').oninput = e=>{ style.followBtn.color = e.target.value; updatePreview(); };
    document.getElementById('h-followTextColor').oninput = e=>{ style.followBtn.textColor = e.target.value; updatePreview(); };
    document.getElementById('h-followFont').onchange = e=>{ style.followBtn.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('h-followX').oninput = e=>{ style.followBtn.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-followY').oninput = e=>{ style.followBtn.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('h-msgColor').oninput = e=>{ style.messageBtn.color = e.target.value; updatePreview(); };
    document.getElementById('h-msgTextColor').oninput = e=>{ style.messageBtn.textColor = e.target.value; updatePreview(); };
    document.getElementById('h-msgFont').onchange = e=>{ style.messageBtn.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('h-msgX').oninput = e=>{ style.messageBtn.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('h-msgY').oninput = e=>{ style.messageBtn.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('h-saveBtn').onclick = async ()=>{
      await db.collection('profileStyles').doc(username).set(style);
      await db.collection('users').doc(username).update({ bio });
      alert('Perfil de "'+username+'" guardado.');
    };

    document.getElementById('h-resetBtn').onclick = ()=>{
      if(confirm(`¿Restablecer el perfil de "${username}" a los valores por defecto?`)){
        style = JSON.parse(JSON.stringify(defaultProfileStyle));
        fillForm();
        updatePreview();
      }
    };

    attachAvatarDrag();
  }

  function attachAvatarDrag(){
    const el = document.getElementById('h-pAvatar');
    let dragging = false, startX = 0, startY = 0, startPosX = 50, startPosY = 50;

    function start(e){
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      startX = p.clientX; startY = p.clientY;
      startPosX = style.avatar.posX; startPosY = style.avatar.posY;
      e.preventDefault();
    }
    function move(e){
      if(!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;
      const size = style.avatar.size || 84;
      style.avatar.posX = Math.max(0, Math.min(100, startPosX - (dx / size) * 100));
      style.avatar.posY = Math.max(0, Math.min(100, startPosY - (dy / size) * 100));
      updatePreview();
    }
    function end(){ dragging = false; }

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, {passive:false});
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
  }

  fillForm();
  updatePreview();
  attachEvents();
}
