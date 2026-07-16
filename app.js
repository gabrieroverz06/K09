const USER_KEY = 'kiraUsername';

function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const defaultConfig = {
  bgColor: '#000000',
  images: [],
  texts: [{ id:'default-text', content: 'kira kg', x: 90, y: 380, size: 32, color: '#ffffff', fontFamily:'inherit' }]
};

function migrateConfig(data){
  if(data.images && data.texts) return { bgColor: data.bgColor ?? defaultConfig.bgColor, images: data.images, texts: data.texts };
  const images = data.image && data.image.src ? [{ id:'img-legacy', ...data.image }] : [];
  const texts = data.text ? [{ id:'text-legacy', fontFamily:'inherit', ...data.text }] : [];
  return { bgColor: data.bgColor ?? defaultConfig.bgColor, images, texts };
}

const defaultUI = {
  topBar: { text: 'kira kg', bgColor: '#87CEEB', textColor: '#000000', height: 56 },
  bottomBar: { bgColor: '#87CEEB', height: 60 }
};

const defaultProfileStyle = {
  bgColor: '#ffffff',
  username: { fontFamily: 'inherit', fontSize: 24, color: '#111318', x: 0, y: 0 },
  bio: { fontFamily: 'inherit', fontSize: 14, color: '#111318', x: 0, y: 0 },
  avatar: { src: '', size: 84, x: 0, y: 0, borderColor: '#87CEEB', zoom: 100, posX: 50, posY: 50 },
  followBtn: { color: '#87CEEB', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 },
  messageBtn: { color: '#e4e6eb', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 }
};

/* ---------------- CACHÉS EN VIVO (alimentadas por Firestore) ---------------- */
let usersCache = {};
let postsCache = [];
let followsCache = {};
let stylesCache = {};
let conversationsCache = {};
let loadingConfigCache = defaultConfig;
let uiConfigCache = defaultUI;

let usersReady = false;
let usersReadyResolvers = [];
function usersReadyPromise(){
  if(usersReady) return Promise.resolve();
  return new Promise(res => usersReadyResolvers.push(res));
}

function mergeUI(p){
  return { topBar:{...defaultUI.topBar, ...(p.topBar||{})}, bottomBar:{...defaultUI.bottomBar, ...(p.bottomBar||{})} };
}

function styleFor(user){
  const s = stylesCache[user] || {};
  return {
    bgColor: s.bgColor ?? defaultProfileStyle.bgColor,
    username: {...defaultProfileStyle.username, ...(s.username||{})},
    bio: {...defaultProfileStyle.bio, ...(s.bio||{})},
    avatar: {...defaultProfileStyle.avatar, ...(s.avatar||{})},
    followBtn: {...defaultProfileStyle.followBtn, ...(s.followBtn||{})},
    messageBtn: {...defaultProfileStyle.messageBtn, ...(s.messageBtn||{})}
  };
}

function userExists(name){ return !!usersCache[name]; }
function registerUser(name){ db.collection('users').doc(name).set({ bio:'', joinedAt: Date.now() }, {merge:true}); }

function avatarFor(username){
  const s = stylesCache[username];
  if(s && s.avatar && s.avatar.src) return s.avatar.src;
  return 'https://i.pravatar.cc/150?u=' + encodeURIComponent(username);
}

/* ---------------- ESCUCHAS EN TIEMPO REAL ---------------- */
function initFirestoreListeners(){
  db.collection('config').doc('loading').onSnapshot(doc=>{
    loadingConfigCache = doc.exists ? migrateConfig(doc.data()) : defaultConfig;
    applyLoadingScreen();
  });

  db.collection('config').doc('ui').onSnapshot(doc=>{
    uiConfigCache = doc.exists ? mergeUI(doc.data()) : defaultUI;
    applyUI();
  });

  db.collection('users').onSnapshot(snap=>{
    usersCache = {};
    snap.forEach(d=> usersCache[d.id] = d.data());
    usersReady = true;
    usersReadyResolvers.forEach(r=>r());
    usersReadyResolvers = [];

    const dev = getUsername();
    if(dev && !userExists(dev) && document.getElementById('app').style.display !== 'none'){
      localStorage.removeItem(USER_KEY);
      clearDeviceToken().then(()=> location.reload());
      return;
    }
    if(document.getElementById('view-search').classList.contains('active')){
      renderSearchResults(document.getElementById('searchInput').value.trim());
    }
    if(document.getElementById('app').style.display !== 'none'){
      renderFeed();
      if(currentProfileUser) renderProfileTab();
    }
  });

  db.collection('posts').orderBy('createdAt').onSnapshot(snap=>{
    postsCache = [];
    snap.forEach(d=> postsCache.push({ id:d.id, ...d.data() }));
    renderFeed();
    renderStories();
    if(currentProfileUser) renderProfileTab();
    if(document.getElementById('commentModal').classList.contains('open')) renderComments();
  });

  db.collection('follows').onSnapshot(snap=>{
    followsCache = {};
    snap.forEach(d=> followsCache[d.id] = d.data().following || []);
    if(currentProfileUser) refreshProfileStats();
  });

  db.collection('profileStyles').onSnapshot(snap=>{
    stylesCache = {};
    snap.forEach(d=> stylesCache[d.id] = d.data());
    if(currentProfileUser) applyProfileStyle(currentProfileUser);
    renderStories();
    renderFeed();
  });

  db.collection('conversations').onSnapshot(snap=>{
    conversationsCache = {};
    snap.forEach(d=> conversationsCache[d.id] = d.data());
    updateMessageBadge();
    if(document.getElementById('chatView').style.display === 'flex'){
      renderChatMessages();
      markConversationRead(currentChatUser);
    }
    if(document.getElementById('convListWrap').style.display !== 'none') renderConversationList();
  });
}
initFirestoreListeners();

/* ---------------- PANTALLA DE CARGA ---------------- */
function applyLoadingScreen(){
  const cfg = loadingConfigCache;
  const screen = document.getElementById('loadingScreen');
  screen.style.background = cfg.bgColor;
  screen.innerHTML = '';
  (cfg.images||[]).forEach(img=>{
    if(!img.src) return;
    const el = document.createElement('img');
    el.src = img.src;
    el.style.position = 'absolute';
    el.style.left = img.x + 'px'; el.style.top = img.y + 'px';
    el.style.width = img.width + 'px'; el.style.height = img.height + 'px';
    screen.appendChild(el);
  });
  (cfg.texts||[]).forEach(t=>{
    const el = document.createElement('div');
    el.textContent = t.content;
    el.style.position = 'absolute';
    el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
    el.style.fontSize = t.size + 'px';
    el.style.color = t.color;
    el.style.fontFamily = t.fontFamily || 'inherit';
    el.style.fontWeight = '700';
    el.style.whiteSpace = 'pre';
    screen.appendChild(el);
  });
}

function applyUI(){
  const ui = uiConfigCache;
  const topbar = document.getElementById('topbarEl');
  const bottombar = document.getElementById('bottombarEl');
  const logo = document.getElementById('logoText');
  topbar.style.background = ui.topBar.bgColor;
  topbar.style.minHeight = ui.topBar.height + 'px';
  logo.textContent = ui.topBar.text;
  logo.style.color = ui.topBar.textColor;
  bottombar.style.background = ui.bottomBar.bgColor;
  bottombar.style.minHeight = ui.bottomBar.height + 'px';
  document.documentElement.style.setProperty('--topbar-h', ui.topBar.height + 'px');
  document.documentElement.style.setProperty('--bottombar-h', ui.bottomBar.height + 'px');
}

function hideLoadingScreen(){
  const screen = document.getElementById('loadingScreen');
  screen.style.transition = 'opacity .4s ease';
  screen.style.opacity = '0';
  setTimeout(()=>{ screen.style.display = 'none'; checkUserGate(); }, 400);
}
setTimeout(hideLoadingScreen, 2200);

/* ---------------- USUARIO (una cuenta por dispositivo, verificada contra Firestore) ---------------- */
function getUsername(){ return localStorage.getItem(USER_KEY); }

async function checkUserGate(){
  await usersReadyPromise();
  const existing = getUsername();

  const boundUser = await resolveUsernameFromDevice();

  if(boundUser && userExists(boundUser)){
    localStorage.setItem(USER_KEY, boundUser);
    startApp();
    return;
  }
  if(boundUser && !userExists(boundUser)){
    await clearDeviceToken();
    localStorage.removeItem(USER_KEY);
  }

  if(existing && userExists(existing)){
    startApp();
  }else{
    if(existing && !userExists(existing)) localStorage.removeItem(USER_KEY);
    document.getElementById('userGate').style.display = 'flex';
  }
}

document.getElementById('usernameBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('usernameInput');
  const err = document.getElementById('usernameError');
  const name = input.value.trim();
  if(!name){ err.textContent = 'Escribe un nombre de usuario'; return; }
  if(!/^[a-zA-Z0-9_.]{3,20}$/.test(name)){ err.textContent = 'Usa solo letras, números, puntos o guiones bajos (3-20)'; return; }

  try{
    await usersReadyPromise();
    if(userExists(name)){ err.textContent = 'Ese usuario ya existe, elige otro'; return; }

    const bound = await resolveUsernameFromDevice();
    if(bound && userExists(bound) && bound !== name){
      err.textContent = `Este dispositivo ya tiene una cuenta creada (${bound}).`;
      return;
    }

    await db.collection('users').doc(name).set({ bio:'', joinedAt: Date.now() }, {merge:true});
    await linkDeviceToUser(name);

    localStorage.setItem(USER_KEY, name);
    document.getElementById('userGate').style.display = 'none';
    startApp();
  }catch(e){
    console.error(e);
    err.textContent = 'Error al crear la cuenta: ' + e.message;
  }
});
document.getElementById('usernameInput').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('usernameBtn').click(); });

function startApp(){
  document.getElementById('app').style.display = 'block';
  renderStories();
  renderFeed();
  showUserProfile(getUsername());
  initNotificationsListener();
}

/* ---------------- FEED ---------------- */
function renderStories(){
  const row = document.getElementById('storiesRow');
  const names = [...new Set(postsCache.map(p=>p.user))];
  row.innerHTML = names.map(n=>`<div class="story" data-user="${n}"><img src="${avatarFor(n)}"><span>${n}</span></div>`).join('');
  row.querySelectorAll('.story').forEach(s=> s.addEventListener('click', ()=>{ showUserProfile(s.dataset.user); showView('account'); }));
}

function renderFeed(){
  const feed = document.getElementById('feed');
  const own = getUsername();
  const savedIds = (usersCache[own] && usersCache[own].savedPosts) || [];
  const posts = postsCache.slice().reverse();
  feed.innerHTML = posts.map(p=>{
    const likedBy = p.likedBy || [];
    const liked = own && likedBy.includes(own);
    const saved = own && savedIds.includes(p.id);
    const commentCount = (p.comments || []).length;
    const savedCount = Object.values(usersCache).filter(u=>(u.savedPosts||[]).includes(p.id)).length;

    let mediaHtml;
    if(p.type === 'text' && p.textPost){
      const tp = p.textPost;
      mediaHtml = `<div class="text-post" style="background:${tp.bgColor}; color:${tp.color}; font-family:${tp.fontFamily||'inherit'}; font-size:${tp.fontSize||22}px;">${escapeHtml(tp.content)}</div>`;
    }else{
      const images = (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []);
      mediaHtml = `<div class="post-carousel" data-id="${p.id}">
        <div class="carousel-track">${images.map(src=>`<img src="${src}">`).join('')}</div>
        ${images.length>1 ? `<div class="carousel-dots">${images.map((_,i)=>`<span class="dot ${i===0?'active':''}"></span>`).join('')}</div>` : ''}
      </div>`;
    }

    return `
    <article class="post" data-id="${p.id}">
      <div class="post-header" data-user="${p.user}">
        <img src="${avatarFor(p.user)}">
        <b>${p.user}</b>
      </div>
      ${mediaHtml}
      <div class="post-actions">
        <button class="like-btn ${liked?'liked':''}" data-id="${p.id}">
          <svg viewBox="0 0 24 24"><path d="M20.8 4.6c-1.8-1.8-4.7-1.8-6.5 0L12 6.9l-2.3-2.3c-1.8-1.8-4.7-1.8-6.5 0-1.8 1.8-1.8 4.7 0 6.5L12 20.8l8.8-8.8c1.8-1.8 1.8-4.7 0-6.5z"></path></svg>
        </button>
        <button class="comment-btn" data-id="${p.id}"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
        <button class="share-btn" data-id="${p.id}"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
        <button class="save-btn ${saved?'saved':''}" data-id="${p.id}"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>
      </div>
      <div class="post-stats">${likedBy.length} me gusta · ${savedCount} guardado(s)</div>
      <div class="post-caption"><b>${escapeHtml(p.user)}</b>${escapeHtml(p.caption)}</div>
      ${commentCount>0 ? `<div class="post-comment-count" data-id="${p.id}">Ver ${commentCount} comentario(s)</div>` : ''}
    </article>`;
  }).join('');

  feed.querySelectorAll('.carousel-track').forEach(track=>{
    track.addEventListener('scroll', ()=>{
      const dots = track.parentElement.querySelectorAll('.dot');
      if(!dots.length) return;
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d,i)=> d.classList.toggle('active', i===idx));
    });
  });

  feed.querySelectorAll('.like-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const own = getUsername();
      const post = postsCache.find(p=>p.id===id);
      const likedBy = post.likedBy || [];
      const ref = db.collection('posts').doc(id);
      if(likedBy.includes(own)){
        ref.update({ likedBy: firebase.firestore.FieldValue.arrayRemove(own) });
      }else{
        ref.update({ likedBy: firebase.firestore.FieldValue.arrayUnion(own) });
        addNotification(post.user, 'like', own, { postId:id });
      }
    });
  });
  feed.querySelectorAll('.save-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleSave(btn.dataset.id));
  });
  feed.querySelectorAll('.comment-btn, .post-comment-count').forEach(el=>{
    el.addEventListener('click', ()=> openComments(el.dataset.id));
  });
  feed.querySelectorAll('.share-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openShare(btn.dataset.id));
  });
  feed.querySelectorAll('.post-header').forEach(h=> h.addEventListener('click', ()=>{ showUserProfile(h.dataset.user); showView('account'); }));
}

function toggleSave(postId){
  const own = getUsername();
  const saved = (usersCache[own] && usersCache[own].savedPosts) || [];
  const ref = db.collection('users').doc(own);
  if(saved.includes(postId)){
    ref.update({ savedPosts: firebase.firestore.FieldValue.arrayRemove(postId) });
  }else{
    ref.update({ savedPosts: firebase.firestore.FieldValue.arrayUnion(postId) });
    const post = postsCache.find(p=>p.id===postId);
    if(post) addNotification(post.user, 'save', own, { postId });
  }
}

/* ---------------- COMENTARIOS ---------------- */
let currentCommentPostId = null;

function openComments(postId){
  currentCommentPostId = postId;
  renderComments();
  document.getElementById('commentModal').classList.add('open');
}

function renderComments(){
  const post = postsCache.find(p=>p.id===currentCommentPostId);
  const comments = (post && post.comments) || [];
  const list = document.getElementById('commentList');
  list.innerHTML = comments.length
    ? comments.slice().sort((a,b)=>a.time-b.time).map(c=>`<div class="comment-item"><b>${escapeHtml(c.user)}</b> ${escapeHtml(c.text)}</div>`).join('')
    : '<div class="empty-state">Sé el primero en comentar.</div>';
}

document.getElementById('commentSend').addEventListener('click', ()=>{
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if(!text || !currentCommentPostId) return;
  const post = postsCache.find(p=>p.id===currentCommentPostId);
  const own = getUsername();
  db.collection('posts').doc(currentCommentPostId).update({
    comments: firebase.firestore.FieldValue.arrayUnion({ user: own, text, time: Date.now() })
  });
  if(post) addNotification(post.user, 'comment', own, { postId: currentCommentPostId, text });
  input.value = '';
});
document.getElementById('commentInput').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('commentSend').click(); });
document.getElementById('closeComments').addEventListener('click', ()=> document.getElementById('commentModal').classList.remove('open'));

/* ---------------- COMPARTIR ---------------- */
let currentSharePostId = null;

function openShare(postId){
  currentSharePostId = postId;
  document.getElementById('shareUserSearch').value = '';
  renderShareUsers('');
  document.getElementById('shareModal').classList.add('open');
}

function renderShareUsers(query){
  const own = getUsername();
  const list = document.getElementById('shareUserList');
  const users = Object.keys(usersCache).filter(u=> u!==own && (!query || u.toLowerCase().includes(query.toLowerCase())));
  if(users.length === 0){ list.innerHTML = '<div class="empty-state">No hay usuarios.</div>'; return; }
  list.innerHTML = users.map(u=>`
    <div class="search-item">
      <img src="${avatarFor(u)}">
      <div><b>${u}</b></div>
      <button class="send-share-btn" data-user="${u}" style="margin-left:auto;">Enviar</button>
    </div>
  `).join('');
  list.querySelectorAll('.send-share-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> sendSharedPost(btn.dataset.user));
  });
}
document.getElementById('shareUserSearch').addEventListener('input', e=> renderShareUsers(e.target.value.trim()));

function sendSharedPost(toUser){
  const own = getUsername();
  const post = postsCache.find(p=>p.id===currentSharePostId);
  if(!post) return;
  const key = convKey(own, toUser);
  db.collection('conversations').doc(key).set({
    messages: firebase.firestore.FieldValue.arrayUnion({
      from: own, text: '📎 Publicación compartida', time: Date.now(),
      sharedPost: { id: post.id, img: post.img, caption: post.caption||'', user: post.user }
    })
  }, {merge:true});
  addNotification(toUser, 'share', own, { postId: post.id });
  document.getElementById('shareModal').classList.remove('open');
}

document.getElementById('shareToAll').addEventListener('click', ()=>{
  if(!currentSharePostId) return;
  const own = getUsername();
  db.collection('posts').doc(currentSharePostId).update({ sharedBy: firebase.firestore.FieldValue.arrayUnion(own) });
  const post = postsCache.find(p=>p.id===currentSharePostId);
  if(post) addNotification(post.user, 'share', own, { postId: currentSharePostId });
  document.getElementById('shareModal').classList.remove('open');
});

document.getElementById('shareExternal').addEventListener('click', ()=>{
  const post = postsCache.find(p=>p.id===currentSharePostId);
  const shareData = { title:'kira kg', text:(post&&post.caption)||'Mira esta publicación en kira kg', url: location.href };
  if(navigator.share){
    navigator.share(shareData).catch(()=>{});
  }else{
    navigator.clipboard.writeText(location.href).then(()=> alert('Enlace copiado al portapapeles.'));
  }
});

document.getElementById('closeShare').addEventListener('click', ()=> document.getElementById('shareModal').classList.remove('open'));

/* ---------------- NAVEGACIÓN ---------------- */
function showView(name){
  document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
}
document.querySelectorAll('.nav-btn[data-view]').forEach(btn=> btn.addEventListener('click', ()=>{
  if(btn.dataset.view==='account') showUserProfile(getUsername());
  if(btn.dataset.view==='video' && document.getElementById('videoMundial').style.display !== 'none') renderVideoMundial();
  showView(btn.dataset.view);
}));

/* ---------------- MODAL NUEVA PUBLICACIÓN ---------------- */
function resizeImageFile(file, maxDim, quality){
  maxDim = maxDim || 900; quality = quality || 0.75;
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

const modal = document.getElementById('createModal');
let newPostMode = 'image';

document.getElementById('btnPlus').addEventListener('click', ()=> modal.classList.add('open'));
document.getElementById('cancelPost').addEventListener('click', ()=> modal.classList.remove('open'));

document.getElementById('modeImageBtn').addEventListener('click', ()=>{
  newPostMode = 'image';
  document.getElementById('modeImageBtn').classList.add('active');
  document.getElementById('modeTextBtn').classList.remove('active');
  document.getElementById('imagePostFields').style.display = 'block';
  document.getElementById('textPostFields').style.display = 'none';
});
document.getElementById('modeTextBtn').addEventListener('click', ()=>{
  newPostMode = 'text';
  document.getElementById('modeTextBtn').classList.add('active');
  document.getElementById('modeImageBtn').classList.remove('active');
  document.getElementById('textPostFields').style.display = 'block';
  document.getElementById('imagePostFields').style.display = 'none';
});

document.getElementById('confirmPost').addEventListener('click', async ()=>{
  const caption = document.getElementById('newPostCaption').value.trim();
  const btn = document.getElementById('confirmPost');
  btn.disabled = true;

  try{
    if(newPostMode === 'text'){
      const content = document.getElementById('newPostTextContent').value.trim();
      if(!content){ alert('Escribe un texto para publicar.'); return; }
      await db.collection('posts').add({
        user: getUsername(),
        type: 'text',
        textPost: {
          content,
          fontFamily: document.getElementById('newPostFont').value,
          fontSize: Number(document.getElementById('newPostFontSize').value) || 22,
          color: document.getElementById('newPostTextColor').value,
          bgColor: document.getElementById('newPostBgColor').value
        },
        caption: caption || '',
        likedBy: [], comments: [], sharedBy: [],
        createdAt: Date.now()
      });
    }else{
      const fileInput = document.getElementById('newPostFile');
      const urlInput = document.getElementById('newPostUrl');
      const images = [];

      if(fileInput.files && fileInput.files.length){
        for(const file of Array.from(fileInput.files)){
          const dataUrl = await resizeImageFile(file, 900, 0.75);
          images.push(dataUrl);
        }
      }
      const url = urlInput.value.trim();
      if(url) images.push(url);
      if(images.length === 0) images.push('https://picsum.photos/seed/'+Date.now()+'/600/600');

      await db.collection('posts').add({
        user: getUsername(),
        type: 'image',
        images,
        caption: caption || '',
        likedBy: [], comments: [], sharedBy: [],
        createdAt: Date.now()
      });

      fileInput.value=''; urlInput.value='';
    }
    document.getElementById('newPostCaption').value='';
    document.getElementById('newPostTextContent').value='';
    modal.classList.remove('open');
  }catch(e){
    console.error(e);
    alert('No se pudo publicar: ' + e.message);
  }finally{
    btn.disabled = false;
  }
});

/* ---------------- BUSCADOR ---------------- */
document.getElementById('btnSearch').addEventListener('click', ()=>{
  showView('search');
  document.getElementById('searchInput').value = '';
  renderSearchResults('');
  document.getElementById('searchInput').focus();
});
function renderSearchResults(query){
  const results = document.getElementById('searchResults');
  const users = Object.keys(usersCache);
  const filtered = query ? users.filter(u=>u.toLowerCase().includes(query.toLowerCase())) : users;
  if(filtered.length===0){ results.innerHTML = '<div class="empty-state">No se encontraron usuarios.</div>'; return; }
  results.innerHTML = filtered.map(u=>{
    const count = postsCache.filter(x=>x.user===u).length;
    return `<div class="search-item" data-user="${u}"><img src="${avatarFor(u)}"><div><b>${u}</b><span>${count} publicación(es)</span></div></div>`;
  }).join('');
  results.querySelectorAll('.search-item').forEach(item=> item.addEventListener('click', ()=>{
    showUserProfile(item.dataset.user);
    showView('account');
  }));
}
document.getElementById('searchInput').addEventListener('input', e=> renderSearchResults(e.target.value.trim()));
document.getElementById('btnBell').addEventListener('click', ()=>{
  document.getElementById('notifModal').classList.add('open');
  renderNotifications();
  markNotificationsRead();
});
document.getElementById('closeNotifs').addEventListener('click', ()=> document.getElementById('notifModal').classList.remove('open'));

/* ---------------- NOTIFICACIONES ---------------- */
let notificationsCache = [];
let globalVideosCache = [];

function openYoutubeComments(videoId, container){
  container.innerHTML = `
    <div class="empty-state">Los comentarios se muestran directamente en YouTube.</div>
    <button class="yt-real-comment-btn" data-video="${videoId}">Ver y comentar en YouTube</button>
  `;
  container.querySelector('.yt-real-comment-btn').addEventListener('click', ()=>{
    window.open('https://www.youtube.com/watch?v=' + videoId, '_blank');
  });
}

function addNotification(toUser, type, fromUser, extra = {}){
  if(!toUser || toUser === fromUser) return;
  db.collection('notifications').add({ toUser, type, fromUser, time: Date.now(), read:false, ...extra });
}

function markNotificationsRead(){
  const unread = notificationsCache.filter(n=>!n.read);
  unread.forEach(n=> db.collection('notifications').doc(n.id).update({ read:true }));
}

function initNotificationsListener(){
  db.collection('notifications').where('toUser','==',getUsername()).onSnapshot(snap=>{
    notificationsCache = [];
    snap.forEach(d=> notificationsCache.push({ id:d.id, ...d.data() }));
    notificationsCache.sort((a,b)=> b.time - a.time);
    updateBellBadge();
    if(document.getElementById('notifModal').classList.contains('open')) renderNotifications();
  });

  db.collection('globalVideos').orderBy('createdAt','desc').onSnapshot(snap=>{
    globalVideosCache = [];
    snap.forEach(d=> globalVideosCache.push({ id:d.id, ...d.data() }));
    if(document.getElementById('videoMundial').style.display !== 'none') renderVideoMundial();
    if(document.getElementById('videoLocal').style.display !== 'none') renderVideoLocal();
  });
}

function updateBellBadge(){
  const badge = document.getElementById('bellBadge');
  const n = notificationsCache.filter(x=>!x.read).length;
  if(n>0){ badge.textContent = n>99?'99+':n; badge.style.display='flex'; }
  else badge.style.display='none';
}

function renderNotifications(){
  const list = document.getElementById('notifList');
  if(notificationsCache.length === 0){
    list.innerHTML = '<div class="empty-state">No tienes notificaciones.</div>';
    return;
  }
  list.innerHTML = notificationsCache.map(n=>{
    const from = escapeHtml(n.fromUser);
    let text = '';
    if(n.type==='follow') text = `<b>${from}</b> empezó a seguirte`;
    else if(n.type==='like') text = `<b>${from}</b> le dio like a tu publicación`;
    else if(n.type==='comment') text = `<b>${from}</b> comentó: ${escapeHtml(n.text)}`;
    else if(n.type==='message') text = `<b>${from}</b> te envió un mensaje`;
    else if(n.type==='share') text = `<b>${from}</b> te compartió una publicación`;
    else if(n.type==='save') text = `<b>${from}</b> guardó tu publicación`;
    else text = `<b>${from}</b> interactuó contigo`;
    return `<div class="notif-item" data-from="${n.fromUser}" data-type="${n.type}">
      <img src="${avatarFor(n.fromUser)}">
      <div class="notif-text">${text}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.notif-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      const type = item.dataset.type;
      const from = item.dataset.from;
      document.getElementById('notifModal').classList.remove('open');
      if(type==='message'){ openConversation(from); }
      else { showUserProfile(from); showView('account'); }
    });
  });
}

/* ---------------- PERFIL ---------------- */
let currentProfileUser = null;
let currentTab = 'posts';

function applyProfileStyle(user){
  const s = styleFor(user);
  document.getElementById('view-account').style.background = s.bgColor;

  const nameEl = document.getElementById('profileName');
  nameEl.style.fontFamily = s.username.fontFamily;
  nameEl.style.fontSize = s.username.fontSize + 'px';
  nameEl.style.color = s.username.color;
  nameEl.style.transform = `translate(${s.username.x}px, ${s.username.y}px)`;

  const bioEl = document.getElementById('profileBio');
  bioEl.style.fontFamily = s.bio.fontFamily;
  bioEl.style.fontSize = s.bio.fontSize + 'px';
  bioEl.style.color = s.bio.color;
  bioEl.style.transform = `translate(${s.bio.x}px, ${s.bio.y}px)`;

  const avatarEl = document.getElementById('profileAvatar');
  avatarEl.style.backgroundImage = `url("${avatarFor(user)}")`;
  avatarEl.style.backgroundSize = s.avatar.zoom + '%';
  avatarEl.style.backgroundPosition = `${s.avatar.posX}% ${s.avatar.posY}%`;
  avatarEl.style.width = s.avatar.size + 'px';
  avatarEl.style.height = s.avatar.size + 'px';
  avatarEl.style.borderColor = s.avatar.borderColor;
  avatarEl.style.transform = `translate(${s.avatar.x}px, ${s.avatar.y}px)`;

  const followBtn = document.getElementById('followBtn');
  followBtn.style.background = s.followBtn.color;
  followBtn.style.color = s.followBtn.textColor;
  followBtn.style.fontFamily = s.followBtn.fontFamily;
  followBtn.style.transform = `translate(${s.followBtn.x}px, ${s.followBtn.y}px)`;

  const msgBtn = document.getElementById('messageBtn');
  msgBtn.style.background = s.messageBtn.color;
  msgBtn.style.color = s.messageBtn.textColor;
  msgBtn.style.fontFamily = s.messageBtn.fontFamily;
  msgBtn.style.transform = `translate(${s.messageBtn.x}px, ${s.messageBtn.y}px)`;
}

function countFollowers(target){ return Object.values(followsCache).filter(list=>list.includes(target)).length; }
function countFollowing(user){ return (followsCache[user]||[]).length; }

function refreshProfileStats(){
  if(!currentProfileUser) return;
  document.getElementById('statFollowers').textContent = countFollowers(currentProfileUser);
  document.getElementById('statFollowing').textContent = countFollowing(currentProfileUser);
  if(currentProfileUser !== getUsername()){
    const following = (followsCache[getUsername()]||[]).includes(currentProfileUser);
    const followBtn = document.getElementById('followBtn');
    followBtn.textContent = following ? 'Siguiendo' : 'Seguir';
    followBtn.classList.toggle('following', following);
  }
}

function showUserProfile(user){
  if(!userExists(user)) return;
  currentProfileUser = user;
  const isOwn = user === getUsername();
  const posts = postsCache.filter(p=>p.user===user);

  document.getElementById('profileName').textContent = user;
  document.getElementById('profileBio').textContent = (usersCache[user] && usersCache[user].bio) || '';

  document.getElementById('statVideos').textContent = 0;
  document.getElementById('statPosts').textContent = posts.length;

  document.getElementById('brushBtn').style.display = isOwn ? 'flex' : 'none';
  document.getElementById('profileActions').style.display = isOwn ? 'none' : 'flex';

  refreshProfileStats();
  applyProfileStyle(user);
  renderProfileTab();
}

document.getElementById('followBtn').addEventListener('click', ()=>{
  if(!currentProfileUser || currentProfileUser===getUsername()) return;
  const own = getUsername();
  const following = (followsCache[own]||[]).includes(currentProfileUser);
  const ref = db.collection('follows').doc(own);
  if(following){
    ref.set({ following: firebase.firestore.FieldValue.arrayRemove(currentProfileUser) }, {merge:true});
  }else{
    ref.set({ following: firebase.firestore.FieldValue.arrayUnion(currentProfileUser) }, {merge:true});
    addNotification(currentProfileUser, 'follow', own);
  }
});

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    renderProfileTab();
  });
});

function thumbFor(p){
  if(p.type==='text' && p.textPost){
    return `<div class="grid-text-thumb" style="background:${p.textPost.bgColor}; color:${p.textPost.color};">${escapeHtml((p.textPost.content||'').slice(0,40))}</div>`;
  }
  const src = (p.images && p.images[0]) || p.img || '';
  return `<img src="${src}">`;
}

function renderProfileTab(){
  const content = document.getElementById('profileContent');
  if(currentTab==='posts'){
    const posts = postsCache.filter(p=>p.user===currentProfileUser);
    content.innerHTML = posts.length ? `<div class="content-grid">${posts.map(thumbFor).join('')}</div>` : '<div class="empty-state">Aún no hay publicaciones.</div>';
  }else if(currentTab==='videos'){
    content.innerHTML = '<div class="empty-state">Aún no hay videos publicados.</div>';
  }else if(currentTab==='saved'){
    if(currentProfileUser !== getUsername()){
      content.innerHTML = '<div class="empty-state">Este contenido es privado.</div>';
    }else{
      const savedIds = (usersCache[currentProfileUser] && usersCache[currentProfileUser].savedPosts) || [];
      const saved = postsCache.filter(p=>savedIds.includes(p.id));
      content.innerHTML = saved.length ? `<div class="content-grid">${saved.map(thumbFor).join('')}</div>` : '<div class="empty-state">No hay contenido guardado.</div>';
    }
  }else{
    const shared = postsCache.filter(p=>(p.sharedBy||[]).includes(currentProfileUser));
    content.innerHTML = shared.length ? `<div class="content-grid">${shared.map(thumbFor).join('')}</div>` : '<div class="empty-state">No hay contenido compartido.</div>';
  }
}

/* ---------------- MENSAJERÍA ---------------- */
function convKey(a,b){ return [a,b].sort().join('_'); }

function conversationPartners(own){
  const list = [];
  Object.keys(conversationsCache).forEach(k=>{
    const parts = k.split('_');
    if(parts.length!==2) return;
    const [a,b] = parts;
    if(a===own || b===own){
      const partner = (a===own && b===own) ? own : (a===own ? b : a);
      const msgs = conversationsCache[k].messages || [];
      const lastTime = msgs.length ? msgs[msgs.length-1].time : 0;
      list.push({ partner, lastTime, lastMsg: msgs.length ? msgs[msgs.length-1].text : '' });
    }
  });
  list.sort((x,y)=> y.lastTime - x.lastTime);
  return list;
}

function unreadCountFor(own, partner){
  const data = conversationsCache[convKey(own, partner)];
  if(!data) return 0;
  const lastRead = (data.lastRead && data.lastRead[own]) || 0;
  return (data.messages || []).filter(m=> m.from!==own && m.time>lastRead).length;
}

function updateMessageBadge(){
  const own = getUsername();
  if(!own) return;
  let total = 0;
  conversationPartners(own).forEach(c=>{ total += unreadCountFor(own, c.partner); });
  const badge = document.getElementById('msgBadge');
  if(total>0){ badge.textContent = total>99?'99+':total; badge.style.display='flex'; }
  else badge.style.display='none';
}

async function markConversationRead(partner){
  if(!partner) return;
  const own = getUsername();
  const key = convKey(own, partner);

  if(!conversationsCache[key]) conversationsCache[key] = { messages: [], lastRead: {} };
  if(!conversationsCache[key].lastRead) conversationsCache[key].lastRead = {};
  conversationsCache[key].lastRead[own] = Date.now();
  updateMessageBadge();
  if(document.getElementById('convListWrap').style.display !== 'none') renderConversationList();

  const ref = db.collection('conversations').doc(key);
  try{
    await ref.update({ [`lastRead.${own}`]: Date.now() });
  }catch(e){
    await ref.set({ lastRead: { [own]: Date.now() } }, { merge: true });
  }
}

function showConversationList(){
  document.getElementById('convListWrap').style.display = 'block';
  document.getElementById('chatView').style.display = 'none';
  renderConversationList();
}

function renderConversationList(){
  const own = getUsername();
  const list = document.getElementById('convList');
  const convs = conversationPartners(own);
  if(convs.length === 0){
    list.innerHTML = '<div class="empty-state">No tienes conversaciones todavía.</div>';
    return;
  }
  list.innerHTML = convs.map(c=>{
    const unread = unreadCountFor(own, c.partner);
    return `
    <div class="conv-item" data-user="${c.partner}">
      <img src="${avatarFor(c.partner)}">
      <div class="conv-info">
        <b>${c.partner === own ? c.partner + ' (tú)' : c.partner}</b>
        <span>${escapeHtml((c.lastMsg||'').slice(0,40))}</span>
      </div>
      ${unread>0 ? `<span class="badge conv-badge">${unread>99?'99+':unread}</span>` : ''}
    </div>
  `;}).join('');
  list.querySelectorAll('.conv-item').forEach(item=>{
    item.addEventListener('click', ()=> openConversation(item.dataset.user));
  });
}

let currentChatUser = null;

function openConversation(otherUser){
  const own = getUsername();
  currentChatUser = otherUser;
  document.getElementById('chatAvatar').src = avatarFor(otherUser);
  document.getElementById('chatUser').textContent = otherUser === own ? otherUser + ' (tú)' : otherUser;
  showView('message');
  document.getElementById('convListWrap').style.display = 'none';
  document.getElementById('chatView').style.display = 'flex';
  renderChatMessages();
  markConversationRead(otherUser);
}

function renderChatMessages(){
  const own = getUsername();
  const data = conversationsCache[convKey(own, currentChatUser)];
  const messages = (data && data.messages) || [];
  const box = document.getElementById('chatMessages');
  if(messages.length === 0){
    box.innerHTML = '<div class="empty-state">Aún no hay mensajes. ¡Envía el primero!</div>';
  }else{
    box.innerHTML = messages.slice().sort((a,b)=>a.time-b.time).map(m=>{
      if(m.sharedPost){
        return `<div class="chat-bubble ${m.from===own?'mine':'theirs'} shared-post-bubble">
          <img src="${m.sharedPost.img}">
          <div><b>${escapeHtml(m.sharedPost.user)}</b><span>${escapeHtml((m.sharedPost.caption||'').slice(0,60))}</span></div>
        </div>`;
      }
      return `<div class="chat-bubble ${m.from===own ? 'mine' : 'theirs'}">${escapeHtml(m.text)}</div>`;
    }).join('');
  }
  box.scrollTop = box.scrollHeight;
}

document.getElementById('backToList').addEventListener('click', showConversationList);
document.getElementById('messageBtn').addEventListener('click', ()=>{
  if(currentProfileUser) openConversation(currentProfileUser);
});
document.querySelector('.nav-btn[data-view="message"]').addEventListener('click', showConversationList);

document.getElementById('chatSend').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChatMessage(); });

function sendChatMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text || !currentChatUser) return;
  const own = getUsername();
  const key = convKey(own, currentChatUser);
  db.collection('conversations').doc(key).set({
    messages: firebase.firestore.FieldValue.arrayUnion({ from: own, text, time: Date.now() })
  }, {merge:true});
  addNotification(currentChatUser, 'message', own, { text });
  input.value = '';
}

/* ---------------- VIDEOS: MUNDIAL / LOCAL ---------------- */
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

function currentVideoTab(){
  const btn = document.querySelector('.video-tab-btn.active');
  return btn ? btn.dataset.vtab : 'mundial';
}

const addVideoModal = document.getElementById('addVideoModal');
document.getElementById('btnAddVideo').addEventListener('click', ()=>{
  const tab = currentVideoTab();
  document.getElementById('addVideoTitle').textContent = tab === 'mundial' ? 'Agregar video por URL (Mundial)' : 'Subir video desde tu dispositivo (Local)';
  document.getElementById('addVideoUrlField').style.display = tab === 'mundial' ? 'block' : 'none';
  document.getElementById('addVideoFileField').style.display = tab === 'local' ? 'block' : 'none';
  document.getElementById('userNewVideoUrl').value = '';
  document.getElementById('userNewVideoFile').value = '';
  document.getElementById('userVideoError').textContent = '';
  addVideoModal.classList.add('open');
});
document.getElementById('cancelAddVideo').addEventListener('click', ()=> addVideoModal.classList.remove('open'));

document.getElementById('confirmAddVideo').addEventListener('click', async ()=>{
  const err = document.getElementById('userVideoError');
  const btn = document.getElementById('confirmAddVideo');
  const tab = currentVideoTab();
  err.textContent = '';

  if(tab === 'mundial'){
    const url = document.getElementById('userNewVideoUrl').value.trim();
    const videoId = extractYoutubeId(url);
    if(!videoId){ err.textContent = 'No se pudo reconocer el video. Pega el enlace completo de YouTube.'; return; }
    try{
      await db.collection('globalVideos').doc(videoId).set({
        type: 'youtube', videoId, title: '', user: getUsername(),
        likedBy: [], savedBy: [], comments: [], createdAt: Date.now()
      }, {merge:true});
      addVideoModal.classList.remove('open');
    }catch(e){
      err.textContent = 'Error al agregar: ' + e.message;
    }
  }else{
    const fileInput = document.getElementById('userNewVideoFile');
    const file = fileInput.files && fileInput.files[0];
    if(!file){ err.textContent = 'Elige un video de tu dispositivo.'; return; }
    if(file.size > 60 * 1024 * 1024){ err.textContent = 'El video es muy pesado (máx. 60MB).'; return; }

    btn.disabled = true;
    err.textContent = 'Subiendo video...';
    try{
      const path = 'videos/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const ref = storage.ref().child(path);
      await ref.put(file);
      const url = await ref.getDownloadURL();

      const docRef = await db.collection('globalVideos').add({
        type: 'local', storageUrl: url, storagePath: path, title: '', user: getUsername(),
        likedBy: [], savedBy: [], comments: [], createdAt: Date.now()
      });
      addVideoModal.classList.remove('open');
    }catch(e){
      err.textContent = 'Error al subir: ' + e.message;
    }finally{
      btn.disabled = false;
    }
  }
});

document.querySelectorAll('.video-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.video-tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.vtab;
    document.getElementById('videoMundial').style.display = tab==='mundial' ? 'block' : 'none';
    document.getElementById('videoLocal').style.display = tab==='local' ? 'block' : 'none';
    if(tab==='mundial') renderVideoMundial();
    if(tab==='local') renderVideoLocal();
  });
});

function renderVideoCard(v){
  const own = getUsername();
  const likedBy = v.likedBy || [];
  const savedBy = v.savedBy || [];
  const liked = own && likedBy.includes(own);
  const saved = own && savedBy.includes(own);
  const commentCount = (v.comments || []).length;
  const isLocal = v.type === 'local';

  const mediaHtml = isLocal
    ? `<video src="${v.storageUrl}" controls playsinline preload="metadata"></video>`
    : `<iframe
        src="https://www.youtube.com/embed/${v.videoId}?rel=0&modestbranding=1&playsinline=1"
        title="${(v.title||'').replace(/"/g,'&quot;')}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>`;

  const iconsHtml = isLocal ? `
        <button class="video-like-btn ${liked?'liked':''}" data-id="${v.id}">
          <svg viewBox="0 0 24 24"><path d="M20.8 4.6c-1.8-1.8-4.7-1.8-6.5 0L12 6.9l-2.3-2.3c-1.8-1.8-4.7-1.8-6.5 0-1.8 1.8-1.8 4.7 0 6.5L12 20.8l8.8-8.8c1.8-1.8 1.8-4.7 0-6.5z"></path></svg>
          <span>${likedBy.length}</span>
        </button>
        <button class="video-save-btn ${saved?'saved':''}" data-id="${v.id}">
          <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button class="video-share-btn" data-id="${v.id}">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
        <button class="video-comments-btn" data-id="${v.id}">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>${commentCount}</span>
        </button>
  ` : `
        <button class="video-share-btn" data-id="${v.id}">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
  `;

  return `
    <div class="video-entry">
    <div class="video-item">
      ${mediaHtml}
      <div class="video-side-icons">${iconsHtml}</div>
      <div class="video-caption">Publicado por <b>${escapeHtml(v.user||'desconocido')}</b>${v.title ? ' · '+escapeHtml(v.title) : ''}</div>
    </div>
    ${isLocal ? `<div class="yt-comments" id="video-comments-${v.id}" style="display:none;"></div>` : ''}
    </div>`;
}

function attachVideoCardEvents(wrap){
  const own = getUsername();

  wrap.querySelectorAll('.video-like-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const v = globalVideosCache.find(x=>x.id===id);
      const likedBy = v.likedBy || [];
      const ref = db.collection('globalVideos').doc(id);
      if(likedBy.includes(own)){
        ref.update({ likedBy: firebase.firestore.FieldValue.arrayRemove(own) });
      }else{
        ref.update({ likedBy: firebase.firestore.FieldValue.arrayUnion(own) });
        if(v.user) addNotification(v.user, 'like', own, { videoId: id });
      }
    });
  });

  wrap.querySelectorAll('.video-save-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const v = globalVideosCache.find(x=>x.id===id);
      const savedBy = v.savedBy || [];
      const ref = db.collection('globalVideos').doc(id);
      if(savedBy.includes(own)){
        ref.update({ savedBy: firebase.firestore.FieldValue.arrayRemove(own) });
      }else{
        ref.update({ savedBy: firebase.firestore.FieldValue.arrayUnion(own) });
        if(v.user) addNotification(v.user, 'save', own, { videoId: id });
      }
    });
  });

  wrap.querySelectorAll('.video-share-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const v = globalVideosCache.find(x=>x.id===btn.dataset.id);
      const url = v.type === 'local' ? v.storageUrl : ('https://www.youtube.com/watch?v=' + v.videoId);
      if(navigator.share){
        navigator.share({ title: v.title || 'Video', url }).catch(()=>{});
      }else{
        navigator.clipboard.writeText(url).then(()=> alert('Enlace copiado al portapapeles.'));
      }
    });
  });

  wrap.querySelectorAll('.video-comments-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const container = document.getElementById('video-comments-' + id);
      const open = container.style.display !== 'none';
      container.style.display = open ? 'none' : 'block';
      if(!open) renderVideoComments(id, container);
    });
  });
}

function renderVideoComments(id, container){
  const v = globalVideosCache.find(x=>x.id===id);
  const comments = (v && v.comments) || [];
  container.innerHTML = (comments.length
    ? comments.map(c=>`<div class="yt-comment"><img src="${avatarFor(c.user)}"><div><b>${escapeHtml(c.user)}</b><span>${escapeHtml(c.text)}</span></div></div>`).join('')
    : '<div class="empty-state">Sé el primero en comentar.</div>'
  ) + `<div class="yt-comment-input-row">
        <input type="text" class="yt-comment-input" placeholder="Escribe un comentario...">
        <button class="yt-comment-send">Enviar</button>
      </div>`;

  container.querySelector('.yt-comment-send').addEventListener('click', ()=>{
    const input = container.querySelector('.yt-comment-input');
    const text = input.value.trim();
    if(!text) return;
    const own = getUsername();
    db.collection('globalVideos').doc(id).update({
      comments: firebase.firestore.FieldValue.arrayUnion({ user: own, text, time: Date.now() })
    });
    if(v && v.user) addNotification(v.user, 'comment', own, { videoId: id, text });
    input.value = '';
  });
}

function renderVideoMundial(){
  const wrap = document.getElementById('videoMundial');
  const items = globalVideosCache.filter(v => v.type === 'youtube' || !v.type);
  if(items.length === 0){
    wrap.innerHTML = '<div class="empty-state">Aún no hay videos agregados en Mundial.</div>';
    return;
  }
  wrap.innerHTML = items.map(renderVideoCard).join('');
  attachVideoCardEvents(wrap);
}

function renderVideoLocal(){
  const wrap = document.getElementById('videoLocal');
  const items = globalVideosCache.filter(v => v.type === 'local');
  if(items.length === 0){
    wrap.innerHTML = '<div class="empty-state">Aún no hay videos locales. Sube uno con el botón "+ Video".</div>';
    return;
  }
  wrap.innerHTML = items.map(renderVideoCard).join('');
  attachVideoCardEvents(wrap);
}

/* ---------------- ANIMACIÓN TIPO DOCK EN LA BARRA INFERIOR ---------------- */
(function initDock(){
  const dock = document.getElementById('bottombarEl');
  const items = Array.from(dock.querySelectorAll('.nav-btn'));
  const baseSize = 22;
  const magnifySize = 34;
  const distance = 90;

  function reset(){
    items.forEach(btn=>{
      btn.style.transform = 'translateY(0) scale(1)';
      const svg = btn.querySelector('svg');
      svg.style.width = baseSize + 'px';
      svg.style.height = baseSize + 'px';
    });
  }

  dock.addEventListener('mousemove', e=>{
    items.forEach(btn=>{
      const rect = btn.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - center);
      const t = Math.max(0, 1 - dist / distance);
      const size = baseSize + (magnifySize - baseSize) * t;
      const lift = t * 10;
      const svg = btn.querySelector('svg');
      svg.style.width = size + 'px';
      svg.style.height = size + 'px';
      btn.style.transform = `translateY(${-lift}px)`;
    });
  });

  dock.addEventListener('mouseleave', reset);
  reset();
})();
