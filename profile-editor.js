const USER_KEY = 'kiraUsername';

const defaultProfileStyle = {
  bgColor: '#ffffff',
  username: { fontFamily: 'inherit', fontSize: 24, color: '#111318', x: 0, y: 0 },
  bio: { fontFamily: 'inherit', fontSize: 14, color: '#111318', x: 0, y: 0 },
  avatar: { src: '', size: 84, x: 0, y: 0, borderColor: '#87CEEB', zoom: 100, posX: 50, posY: 50 },
  followBtn: { color: '#87CEEB', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 },
  messageBtn: { color: '#e4e6eb', textColor: '#000000', fontFamily: 'inherit', x: 0, y: 0 }
};

function getUsername(){ return localStorage.getItem(USER_KEY); }

function mergeStyle(s){
  return {
    bgColor: s.bgColor ?? defaultProfileStyle.bgColor,
    username: {...defaultProfileStyle.username, ...(s.username||{})},
    bio: {...defaultProfileStyle.bio, ...(s.bio||{})},
    avatar: {...defaultProfileStyle.avatar, ...(s.avatar||{})},
    followBtn: {...defaultProfileStyle.followBtn, ...(s.followBtn||{})},
    messageBtn: {...defaultProfileStyle.messageBtn, ...(s.messageBtn||{})}
  };
}

(async function init(){
  let username = getUsername();

  if(!username){
    username = await resolveUsernameFromDevice();
    if(username) localStorage.setItem(USER_KEY, username);
  }

  if(!username){
    document.getElementById('noUserScreen').style.display = 'flex';
    document.getElementById('editorScreen').style.display = 'none';
    return;
  }

  let userDoc;
  try{
    userDoc = await db.collection('users').doc(username).get();
  }catch(e){
    console.error('Error al verificar la cuenta:', e);
    document.getElementById('noUserScreen').style.display = 'flex';
    document.querySelector('#noUserScreen h2').textContent = 'Error de conexión';
    document.querySelector('#noUserScreen p').textContent = 'No se pudo verificar tu cuenta: ' + e.message;
    document.getElementById('editorScreen').style.display = 'none';
    return;
  }

  if(!userDoc.exists){
    document.getElementById('noUserScreen').style.display = 'flex';
    document.getElementById('editorScreen').style.display = 'none';
    return;
  }

  const styleDoc = await db.collection('profileStyles').doc(username).get();
  let style = mergeStyle(styleDoc.exists ? styleDoc.data() : {});
  let bio = (userDoc.data() && userDoc.data().bio) || '';

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
    const el = document.getElementById('avatarGallery');
    if(gallery.length === 0){
      el.innerHTML = '<div class="empty-state" style="padding:10px 0;">Aún no tienes fotos guardadas.</div>';
      return;
    }
    el.innerHTML = gallery.map(src=>`<img src="${src}" class="gallery-thumb ${src===style.avatar.src?'selected':''}" data-src="${src}">`).join('');
    el.querySelectorAll('.gallery-thumb').forEach(img=>{
      img.addEventListener('click', ()=>{
        style.avatar.src = img.dataset.src;
        style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
        document.getElementById('avatarUrl').value = '';
        fillAvatarNumbers();
        updatePreview();
        renderGallery();
      });
    });
  }

  function fillAvatarNumbers(){
    document.getElementById('avatarZoom').value = style.avatar.zoom;
  }

  function fillForm(){
    document.getElementById('bgColor').value = style.bgColor;
    document.getElementById('userFont').value = style.username.fontFamily;
    document.getElementById('userSize').value = style.username.fontSize;
    document.getElementById('userColor').value = style.username.color;
    document.getElementById('userX').value = style.username.x;
    document.getElementById('userY').value = style.username.y;

    document.getElementById('bioContent').value = bio;
    document.getElementById('bioFont').value = style.bio.fontFamily;
    document.getElementById('bioSize').value = style.bio.fontSize;
    document.getElementById('bioColor').value = style.bio.color;
    document.getElementById('bioX').value = style.bio.x;
    document.getElementById('bioY').value = style.bio.y;

    document.getElementById('avatarUrl').value = (style.avatar.src && !style.avatar.src.startsWith('data:')) ? style.avatar.src : '';
    document.getElementById('avatarSize').value = style.avatar.size;
    document.getElementById('avatarColor').value = style.avatar.borderColor;
    document.getElementById('avatarX').value = style.avatar.x;
    document.getElementById('avatarY').value = style.avatar.y;
    fillAvatarNumbers();

    document.getElementById('followColor').value = style.followBtn.color;
    document.getElementById('followTextColor').value = style.followBtn.textColor;
    document.getElementById('followFont').value = style.followBtn.fontFamily;
    document.getElementById('followX').value = style.followBtn.x;
    document.getElementById('followY').value = style.followBtn.y;

    document.getElementById('msgColor').value = style.messageBtn.color;
    document.getElementById('msgTextColor').value = style.messageBtn.textColor;
    document.getElementById('msgFont').value = style.messageBtn.fontFamily;
    document.getElementById('msgX').value = style.messageBtn.x;
    document.getElementById('msgY').value = style.messageBtn.y;

    renderGallery();
  }

  function updatePreview(){
    document.getElementById('preview').style.background = style.bgColor;

    const pName = document.getElementById('pName');
    pName.textContent = username;
    pName.style.fontFamily = style.username.fontFamily;
    pName.style.fontSize = style.username.fontSize + 'px';
    pName.style.color = style.username.color;
    pName.style.transform = `translate(${style.username.x}px, ${style.username.y}px)`;

    const pBio = document.getElementById('pBio');
    pBio.textContent = bio;
    pBio.style.fontFamily = style.bio.fontFamily;
    pBio.style.fontSize = style.bio.fontSize + 'px';
    pBio.style.color = style.bio.color;
    pBio.style.transform = `translate(${style.bio.x}px, ${style.bio.y}px)`;

    const pAvatar = document.getElementById('pAvatar');
    pAvatar.style.backgroundImage = `url("${currentAvatarSrc()}")`;
    pAvatar.style.backgroundSize = style.avatar.zoom + '%';
    pAvatar.style.backgroundPosition = `${style.avatar.posX}% ${style.avatar.posY}%`;
    pAvatar.style.width = style.avatar.size + 'px';
    pAvatar.style.height = style.avatar.size + 'px';
    pAvatar.style.borderColor = style.avatar.borderColor;
    pAvatar.style.transform = `translate(${style.avatar.x}px, ${style.avatar.y}px)`;

    const pFollow = document.getElementById('pFollow');
    pFollow.style.background = style.followBtn.color;
    pFollow.style.color = style.followBtn.textColor;
    pFollow.style.fontFamily = style.followBtn.fontFamily;
    pFollow.style.transform = `translate(${style.followBtn.x}px, ${style.followBtn.y}px)`;

    const pMsg = document.getElementById('pMsg');
    pMsg.style.background = style.messageBtn.color;
    pMsg.style.color = style.messageBtn.textColor;
    pMsg.style.fontFamily = style.messageBtn.fontFamily;
    pMsg.style.transform = `translate(${style.messageBtn.x}px, ${style.messageBtn.y}px)`;
  }

  function attachEvents(){
    document.getElementById('bgColor').oninput = e=>{ style.bgColor = e.target.value; updatePreview(); };

    document.getElementById('userFont').onchange = e=>{ style.username.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('userSize').oninput = e=>{ style.username.fontSize = Number(e.target.value)||24; updatePreview(); };
    document.getElementById('userColor').oninput = e=>{ style.username.color = e.target.value; updatePreview(); };
    document.getElementById('userX').oninput = e=>{ style.username.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('userY').oninput = e=>{ style.username.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('bioContent').oninput = e=>{ bio = e.target.value; updatePreview(); };
    document.getElementById('bioFont').onchange = e=>{ style.bio.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('bioSize').oninput = e=>{ style.bio.fontSize = Number(e.target.value)||14; updatePreview(); };
    document.getElementById('bioColor').oninput = e=>{ style.bio.color = e.target.value; updatePreview(); };
    document.getElementById('bioX').oninput = e=>{ style.bio.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('bioY').oninput = e=>{ style.bio.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('avatarFile').onchange = e=>{
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ev=>{
        style.avatar.src = ev.target.result;
        style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
        addToGallery(ev.target.result);
        document.getElementById('avatarUrl').value = '';
        fillAvatarNumbers();
        updatePreview();
      };
      reader.readAsDataURL(file);
    };
    document.getElementById('avatarUrl').oninput = e=>{
      const val = e.target.value.trim();
      style.avatar.src = val;
      style.avatar.posX = 50; style.avatar.posY = 50; style.avatar.zoom = 100;
      fillAvatarNumbers();
      updatePreview();
    };
    document.getElementById('avatarUrl').onblur = e=>{
      const val = e.target.value.trim();
      if(val) addToGallery(val);
    };

    document.getElementById('avatarSize').oninput = e=>{ style.avatar.size = Number(e.target.value)||84; updatePreview(); };
    document.getElementById('avatarColor').oninput = e=>{ style.avatar.borderColor = e.target.value; updatePreview(); };
    document.getElementById('avatarX').oninput = e=>{ style.avatar.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('avatarY').oninput = e=>{ style.avatar.y = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('avatarZoom').oninput = e=>{ style.avatar.zoom = Number(e.target.value)||100; updatePreview(); };

    document.getElementById('followColor').oninput = e=>{ style.followBtn.color = e.target.value; updatePreview(); };
    document.getElementById('followTextColor').oninput = e=>{ style.followBtn.textColor = e.target.value; updatePreview(); };
    document.getElementById('followFont').onchange = e=>{ style.followBtn.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('followX').oninput = e=>{ style.followBtn.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('followY').oninput = e=>{ style.followBtn.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('msgColor').oninput = e=>{ style.messageBtn.color = e.target.value; updatePreview(); };
    document.getElementById('msgTextColor').oninput = e=>{ style.messageBtn.textColor = e.target.value; updatePreview(); };
    document.getElementById('msgFont').onchange = e=>{ style.messageBtn.fontFamily = e.target.value; updatePreview(); };
    document.getElementById('msgX').oninput = e=>{ style.messageBtn.x = Number(e.target.value)||0; updatePreview(); };
    document.getElementById('msgY').oninput = e=>{ style.messageBtn.y = Number(e.target.value)||0; updatePreview(); };

    document.getElementById('saveBtn').onclick = async ()=>{
      await db.collection('profileStyles').doc(username).set(style);
      await db.collection('users').doc(username).update({ bio });
      alert('Perfil guardado.');
    };

    document.getElementById('resetBtn').onclick = ()=>{
      if(confirm('¿Restablecer tu perfil a los valores por defecto?')){
        style = JSON.parse(JSON.stringify(defaultProfileStyle));
        fillForm();
        updatePreview();
      }
    };

    attachAvatarDrag();
  }

  function attachAvatarDrag(){
    const el = document.getElementById('pAvatar');
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
})();
