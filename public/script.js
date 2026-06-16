// ============ SUPABASE CONFIGURATION ============
const SUPABASE_URL = 'https://tuoprogetto.supabase.co'; // SOSTITUISCI CON LA TUA URL
const SUPABASE_ANON_KEY = 'tua_chiave_anon'; // SOSTITUISCI CON LA TUA CHIAVE

// ============ STATE ============
let state = {
  username: '',
  theme: 'neon-blue',
  chats: {},
  currentChat: null,
  pinnedMsg: null,
  ctxMsgId: null
};

// ============ SUPABASE CLIENT ============
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let supabaseChannel = null;

// ============ GIPHY ============
const GIPHY_API_KEY = 'nQZpPuDPbkDrDOKgjfFxNVApiC63OxyN';
let giphyCache = {};

// ============ IMAGE VIEWER ============
let currentViewerImage = null;

function openImageViewer(imageUrl) {
  currentViewerImage = imageUrl;
  const viewer = document.getElementById('image-viewer');
  const img = document.getElementById('viewer-image');
  img.src = imageUrl;
  img.classList.remove('zoomed');
  viewer.classList.add('active');
}

function closeImageViewer() {
  document.getElementById('image-viewer').classList.remove('active');
}

function toggleZoom(e) {
  e.stopPropagation();
  const img = document.getElementById('viewer-image');
  img.classList.toggle('zoomed');
}

// ============ TOOLBAR ============
function toggleToolbarAndOpenKeyboard() {
  const input = document.getElementById('chat-input');
  if (input) {
    input.focus();
    input.click();
  }
}

function addEmoji(emoji) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value += emoji;
    input.focus();
    autoResize(input);
  }
}

// ============ INIT ============
function init() {
  loadState();
  if (!state.username) {
    state.username = genUsername();
  }
  applyTheme(state.theme);
  buildThemeGrid();
  buildParticles();
  renderRecentChats();
  updateSettingsUI();
  updateStorageInfo();
  saveState();
}

function loadState() {
  try {
    const s = localStorage.getItem('chatcaj_state');
    if (s) {
      const parsed = JSON.parse(s);
      Object.assign(state, parsed);
    }
  } catch(e) {}
  cleanExpiredChats();
}

function saveState() {
  try {
    localStorage.setItem('chatcaj_state', JSON.stringify(state));
  } catch(e) {}
}

function cleanExpiredChats() {
  const now = Date.now();
  for (const code in state.chats) {
    const chat = state.chats[code];
    if (!chat.activated) {
      const age = now - chat.created;
      if (age > 24 * 60 * 60 * 1000) {
        delete state.chats[code];
      }
    }
  }
}

// ============ USERNAME ============
function genUsername() {
  const n = Math.floor(100000 + Math.random() * 899999);
  const existing = Object.values(state.chats || {})
    .flatMap(c => c.users || []);
  if (existing.includes('Guest#' + n)) return genUsername();
  return 'Guest#' + n;
}

// ============ SCREENS ============
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  if (name === 'settings') updateSettingsUI();
  if (name === 'home') renderRecentChats();
}

// ============ THEMES ============
const THEMES = [
  { id: 'neon-blue',    name: 'Neon Blue',    colors: ['#0d0f14','#3b82f6','#60a5fa'] },
  { id: 'neon-purple',  name: 'Neon Purple',  colors: ['#0d0b14','#a855f7','#c084fc'] },
  { id: 'cyberpunk',    name: 'Cyberpunk',    colors: ['#0a0a0a','#f0ff00','#faff4d'] },
  { id: 'liquid-glass', name: 'Liquid Glass', colors: ['#05080f','#38bdf8','#7dd3fc'] },
  { id: 'matrix',       name: 'Matrix',       colors: ['#000a00','#00ff41','#39ff14'] },
  { id: 'ocean',        name: 'Ocean Blue',   colors: ['#040d18','#0ea5e9','#38bdf8'] },
  { id: 'midnight',     name: 'Midnight',     colors: ['#000000','#6366f1','#818cf8'] },
  { id: 'rose',         name: 'Rose Pink',    colors: ['#0f0509','#f43f5e','#fb7185'] },
  { id: 'sunset',       name: 'Sunset',       colors: ['#0f0800','#f97316','#fb923c'] },
  { id: 'white',        name: 'Pure White',   colors: ['#f8fafc','#3b82f6','#60a5fa'] },
];

function buildThemeGrid() {
  const grid = document.getElementById('theme-grid');
  grid.innerHTML = THEMES.map(t => `
    <div class="theme-swatch ${state.theme === t.id ? 'active' : ''}"
      style="background: linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]}, ${t.colors[2]})"
      onclick="applyTheme('${t.id}', true)" title="${t.name}">
      <span>${t.name}</span>
    </div>
  `).join('');
}

function applyTheme(id, save) {
  state.theme = id;
  document.body.setAttribute('data-theme', id);
  if (save) {
    buildThemeGrid();
    saveState();
  }
}

// ============ PARTICLES ============
function buildParticles() {
  const container = document.getElementById('particles');
  container.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      animation-duration: ${4 + Math.random() * 8}s;
      animation-delay: ${Math.random() * 8}s;
      opacity: 0;
      width: ${1 + Math.random() * 2}px;
      height: ${1 + Math.random() * 2}px;
    `;
    container.appendChild(p);
  }
}

// ============ NEW CHAT ============
let currentCode = null;

function openNewChat() {
  currentCode = genCode();
  const now = Date.now();
  
  fetch('/api/chat/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      code: currentCode, 
      username: state.username, 
      created_at: now 
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      state.chats[currentCode] = {
        created: now,
        activated: false,
        users: [state.username],
        messages: [],
        pinnedMsg: null
      };
      saveState();
      
      document.getElementById('new-code').textContent = currentCode;
      document.getElementById('new-code-expire').textContent = 'Expires in 24 hours if unused';
      openModal('modal-new-chat');
    } else {
      showToast('Error creating chat: ' + data.error, 'error');
    }
  })
  .catch(err => {
    console.error('Create chat error:', err);
    showToast('Failed to create chat. Server error.', 'error');
  });
}

function genCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (state.chats[code]) return genCode();
  return code;
}

function copyCode() {
  navigator.clipboard.writeText(currentCode).then(() => showToast('Code copied!', 'success'));
}

// ============ JOIN CHAT ============
function openJoinChat() {
  document.getElementById('join-code-input').value = '';
  document.getElementById('join-error').classList.remove('show');
  openModal('modal-join-chat');
  setTimeout(() => document.getElementById('join-code-input').focus(), 200);
}

function formatJoinCode(input) {
  input.value = input.value.replace(/\D/g,'').slice(0,6);
}

function joinCodeKey(e) {
  if (e.key === 'Enter') joinChat();
}

function joinChat() {
  const code = document.getElementById('join-code-input').value.trim();
  const errEl = document.getElementById('join-error');

  if (code === '121110') {
    closeModal('modal-join-chat');
    renderDashboard();
    showScreen('dashboard');
    return;
  }

  if (code.length !== 6) {
    errEl.textContent = 'Please enter a 6-digit code.';
    errEl.classList.add('show'); 
    return;
  }

  fetch('/api/chat/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      code: code, 
      username: state.username 
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      if (data.error === 'Code expired') {
        errEl.textContent = 'This code has expired.';
      } else if (data.error === 'Code not found') {
        errEl.textContent = 'Code not found. Check the code and try again.';
      } else {
        errEl.textContent = data.error;
      }
      errEl.classList.add('show');
    } else {
      errEl.classList.remove('show');
      closeModal('modal-join-chat');
      
      if (!state.chats[code]) {
        state.chats[code] = {
          created: data.chat.created_at,
          activated: data.chat.activated,
          users: data.chat.users,
          messages: [],
          pinnedMsg: null
        };
        saveState();
      }
      
      enterChat(code, false);
    }
  })
  .catch(err => {
    console.error('Join chat error:', err);
    errEl.textContent = 'Error connecting to server. Please try again.';
    errEl.classList.add('show');
  });
}

// ============ GIPHY FUNCTIONS ============
function openGiphyModal() {
  openModal('modal-giphy');
  searchGiphy();
}

async function searchGiphy() {
  const query = document.getElementById('giphy-search').value || 'funny';
  
  const grid = document.getElementById('giphy-grid');
  if (grid) grid.innerHTML = '<div style="text-align:center;padding:20px">⏳ Loading GIFs...</div>';
  
  if (giphyCache[query]) {
    renderGiphyGrid(giphyCache[query]);
    return;
  }
  
  try {
    const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`);
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      giphyCache[query] = data.data;
      renderGiphyGrid(data.data);
    } else {
      if (grid) grid.innerHTML = '<div style="text-align:center;padding:20px">No GIFs found. Try another search.</div>';
    }
  } catch(e) {
    console.error('GIPHY error:', e);
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:20px">❌ Error loading GIFs. Check API key.</div>';
  }
}

function renderGiphyGrid(gifs) {
  const grid = document.getElementById('giphy-grid');
  if (!grid) return;
  
  grid.innerHTML = gifs.map(gif => {
    const gifUrl = gif.images?.fixed_height?.url || gif.images?.original?.url;
    return `<img src="${gifUrl}" class="giphy-img" onclick="sendSticker('${gifUrl}')">`;
  }).join('');
}

function sendSticker(imageUrl) {
  if (!imageUrl) {
    showToast('Error loading GIF', 'error');
    return;
  }
  
  const msg = {
    id: msgId(),
    type: 'sticker',
    sender: state.username,
    text: imageUrl,
    time: Date.now(),
    edited: false,
    deleted: false
  };
  
  sendMessageToSupabase(msg);
  closeModal('modal-giphy');
}

// ============ FILE SHARING ============
function sendFile(input) {
  const file = input.files[0];
  if (!file || !state.currentChat) return;
  
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image too large (max 2MB)', 'error');
    input.value = '';
    return;
  }
  
  showToast('📤 Sending image...', 'success');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > 800) {
          height = (height * 800) / width;
          width = 800;
        }
        if (height > 800) {
          width = (width * 800) / height;
          height = 800;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        const msg = {
          id: msgId(),
          type: 'image',
          sender: state.username,
          text: compressedDataUrl,
          time: Date.now(),
          edited: false,
          deleted: false
        };
        
        sendMessageToSupabase(msg);
        showToast('✅ Image sent!', 'success');
      };
      img.src = e.target.result;
    } else {
      const msg = {
        id: msgId(),
        type: 'file',
        sender: state.username,
        text: e.target.result,
        fileName: file.name,
        fileSize: file.size,
        time: Date.now(),
        edited: false,
        deleted: false
      };
      
      sendMessageToSupabase(msg);
      showToast('📎 File sent!', 'success');
    }
  };
  reader.onerror = function() {
    showToast('Error reading file', 'error');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// ============ SUPABASE MESSAGE FUNCTIONS ============
async function sendMessageToSupabase(message) {
  if (!state.currentChat) return;
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          id: message.id,
          chat_code: state.currentChat,
          type: message.type || 'msg',
          sender: message.sender,
          text: message.text,
          time: message.time || Date.now(),
          edited: false,
          deleted: false
        }
      ]);
    
    if (error) {
      console.error('Supabase insert error:', error);
      showToast('Error sending message', 'error');
    }
  } catch (err) {
    console.error('Send message error:', err);
    showToast('Error sending message', 'error');
  }
}

async function loadMessagesFromSupabase(code) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_code', code)
      .order('time', { ascending: true });
    
    if (error) {
      console.error('Load messages error:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Load messages error:', err);
    return [];
  }
}

// ============ AVATAR FUNCTIONS ============
function getAvatarColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#3b82f6','#8b5cf6','#ec4899','#10b981','#f59e0b','#ef4444','#06b6d4','#84cc16'];
  return colors[Math.abs(hash) % colors.length];
}

function msgId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
}

// ============ SUPABASE REALTIME ============
function subscribeToChat(code) {
  // Unsubscribe from previous channel
  if (supabaseChannel) {
    supabaseChannel.unsubscribe();
    supabaseChannel = null;
  }
  
  // Create new channel
  supabaseChannel = supabase
    .channel(`chat:${code}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `chat_code=eq.${code}`
    }, (payload) => {
      const newMessage = payload.new;
      // Aggiungi il messaggio alla chat locale
      const chat = state.chats[code];
      if (chat && state.currentChat === code) {
        // Verifica che il messaggio non sia già presente (evita duplicati)
        if (!chat.messages.find(m => m.id === newMessage.id)) {
          chat.messages.push(newMessage);
          saveState();
          renderMessages();
          scrollToBottom();
        }
      } else if (chat) {
        if (!chat.messages.find(m => m.id === newMessage.id)) {
          chat.messages.push(newMessage);
          saveState();
        }
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages'
    }, (payload) => {
      const updatedMessage = payload.new;
      const chat = state.chats[code];
      if (chat) {
        const index = chat.messages.findIndex(m => m.id === updatedMessage.id);
        if (index !== -1) {
          chat.messages[index] = updatedMessage;
          saveState();
          if (state.currentChat === code) {
            renderMessages();
          }
        }
      }
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'messages'
    }, (payload) => {
      // Gestisci eliminazione se necessario
      const chat = state.chats[code];
      if (chat) {
        const index = chat.messages.findIndex(m => m.id === payload.old.id);
        if (index !== -1) {
          chat.messages[index].deleted = true;
          chat.messages[index].text = '[deleted]';
          saveState();
          if (state.currentChat === code) {
            renderMessages();
          }
        }
      }
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Subscribed to chat:', code);
      }
      if (err) {
        console.error('Subscription error:', err);
      }
    });
}

// ============ ENTER CHAT ============
async function enterChat(code, isCreator) {
  closeModal('modal-new-chat');
  const chat = state.chats[code];
  if (!chat) return;

  if (!isCreator && !chat.activated) {
    chat.activated = true;
  }

  if (!chat.users.includes(state.username)) {
    chat.users.push(state.username);
  }

  saveState();
  state.currentChat = code;

  document.getElementById('chat-code-badge').textContent = code;
  const subEl = document.getElementById('chat-header-sub');

  if (chat.activated) {
    subEl.textContent = chat.users.length + ' member' + (chat.users.length !== 1 ? 's' : '') + ' · Permanent';
  } else {
    subEl.textContent = 'Waiting for someone to join... (24h)';
  }

  state.pinnedMsg = chat.pinnedMsg || null;
  updatePinBar();
  renderUsersBar();
  
  // Carica i messaggi da Supabase
  const messages = await loadMessagesFromSupabase(code);
  chat.messages = messages;
  saveState();
  renderMessages();

  if (isCreator && chat.messages.length === 0) {
    addSystemMsg(code, 'Chat created. Share code ' + code + ' to invite someone.');
  } else if (!isCreator && chat.messages.filter(m => m.type === 'system' && m.text.includes('joined')).length === 0) {
    addSystemMsg(code, state.username + ' joined the chat.');
    saveState();
    renderMessages();
  }

  // Iscriviti al canale Realtime per questa chat
  subscribeToChat(code);
  
  showScreen('chat');
}

function addSystemMsg(code, text) {
  const chat = state.chats[code];
  if (!chat) return;
  const msg = { id: msgId(), type: 'system', text, time: Date.now() };
  chat.messages.push(msg);
  // Salva il messaggio di sistema su Supabase
  supabase
    .from('messages')
    .insert([{
      id: msg.id,
      chat_code: code,
      type: 'system',
      sender: 'system',
      text: text,
      time: msg.time
    }])
    .then(({ error }) => {
      if (error) console.error('Error saving system message:', error);
    });
}

// ============ MESSAGES ============
function renderMessages() {
  const chat = state.chats[state.currentChat];
  if (!chat) return;
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';

  let lastDate = null;
  chat.messages.forEach(msg => {
    const d = new Date(msg.time);
    const dateStr = d.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const div = document.createElement('div');
      div.className = 'msg-day-divider';
      div.textContent = dateStr;
      container.appendChild(div);
    }
    container.appendChild(buildMsgEl(msg));
  });

  container.scrollTop = container.scrollHeight;
}

function buildMsgEl(msg) {
  if (msg.type === 'system') {
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center;font-size:0.75rem;color:var(--text3);padding:6px 0;font-style:italic;';
    div.textContent = msg.text;
    return div;
  }

  const isOwn = msg.sender === state.username;
  const time = new Date(msg.time).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const isPinned = state.pinnedMsg === msg.id;
  const avatarColor = getAvatarColor(msg.sender);

  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap' + (isOwn ? ' own' : '');
  wrap.dataset.msgId = msg.id;

  let messageContent = '';
  if (msg.type === 'image') {
    messageContent = `<img src="${msg.text}" class="msg-image" onclick="event.stopPropagation(); openImageViewer('${msg.text}')">`;
  } else if (msg.type === 'sticker') {
    messageContent = `<img src="${msg.text}" class="msg-sticker">`;
  } else if (msg.type === 'file') {
    messageContent = `<a href="${msg.text}" download="${msg.fileName}" style="color:var(--accent)">📎 ${msg.fileName}</a>`;
  } else {
    messageContent = `<div class="msg-text">${msg.deleted ? 'This message has been deleted.' : escHtml(msg.text)}</div>`;
  }

  let statusTags = '';
  if (isPinned) statusTags += '<span class="msg-status-tag pinned">📌 pinned</span>';
  if (msg.edited) statusTags += '<span class="msg-status-tag edited">edited</span>';
  if (msg.deleted) statusTags += '<span class="msg-status-tag deleted">deleted</span>';

  wrap.innerHTML = `
    <div class="msg-avatar default-avatar" style="background:${avatarColor}">
      <img src="https://i.ibb.co/xS69XxwL/sprofilo.png" alt="profile" style="width:24px;height:24px;border-radius:50%">
    </div>
    <div class="msg-group">
      ${!isOwn ? `<div class="msg-sender">${escHtml(msg.sender)}</div>` : ''}
      <div class="msg-bubble-row">
        <div class="msg-bubble${msg.deleted ? ' msg-deleted' : ''}">
          ${messageContent}
          <div class="edit-area" id="edit-area-${msg.id}"></div>
          <div class="edit-btns" id="edit-btns-${msg.id}">
            <button class="btn btn-xs btn-primary" onclick="saveEdit('${msg.id}')">Save</button>
            <button class="btn btn-xs btn-ghost" onclick="cancelEdit('${msg.id}')">Cancel</button>
          </div>
        </div>
        ${isOwn ? `<button class="msg-delete-btn" onclick="deleteOwnMessage('${msg.id}')" title="Delete message">
          <img src="https://i.ibb.co/8LgTNpvH/12461936.png" alt="delete" style="width:20px;height:20px">
        </button>` : ''}
      </div>
      <div class="msg-meta">
        <span class="msg-time">${time}</span>
        ${statusTags}
      </div>
    </div>
  `;

  return wrap;
}

function deleteOwnMessage(msgId) {
  if (!state.currentChat) return;
  const chat = state.chats[state.currentChat];
  const msg = chat?.messages.find(m => m.id === msgId);
  if (!msg) return;
  if (msg.sender !== state.username) {
    showToast('You can only delete your own messages', 'error');
    return;
  }
  
  if (confirm('Delete this message?')) {
    // Aggiorna su Supabase
    supabase
      .from('messages')
      .update({
        deleted: true,
        text: '[deleted]'
      })
      .eq('id', msgId)
      .then(({ error }) => {
        if (error) {
          console.error('Delete message error:', error);
          showToast('Error deleting message', 'error');
        } else {
          // Aggiorna localmente
          msg.deleted = true;
          msg.text = '[deleted]';
          saveState();
          renderMessages();
          showToast('Message deleted', 'success');
        }
      });
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}

// ============ SEND MESSAGE ============
function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !state.currentChat) return;

  const msg = {
    id: msgId(),
    type: 'msg',
    sender: state.username,
    text: text.substring(0, 500),
    time: Date.now(),
    edited: false,
    deleted: false,
    originalText: null,
    history: []
  };
  
  sendMessageToSupabase(msg);
  
  input.value = '';
  input.style.height = 'auto';
}

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

// ============ EDIT MESSAGE ============
function startEdit(msgId) {
  const chat = state.chats[state.currentChat];
  const msg = chat?.messages.find(m => m.id === msgId);
  if (!msg) return;

  const areaEl = document.getElementById('edit-area-' + msgId);
  const btnsEl = document.getElementById('edit-btns-' + msgId);
  if (!areaEl || !btnsEl) return;

  areaEl.style.display = 'block';
  areaEl.className = 'edit-area';
  areaEl.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.value = msg.text;
  ta.style.cssText = 'width:100%;background:var(--bg3);border:1px solid var(--accent);border-radius:8px;padding:6px 10px;color:var(--text);font-size:0.88rem;font-family:var(--font);resize:none;outline:none;min-height:60px;';
  areaEl.appendChild(ta);
  btnsEl.style.display = 'flex';
  setTimeout(() => ta.focus(), 50);
}

function saveEdit(msgId) {
  const chat = state.chats[state.currentChat];
  const msg = chat?.messages.find(m => m.id === msgId);
  if (!msg) return;

  const areaEl = document.getElementById('edit-area-' + msgId);
  const ta = areaEl?.querySelector('textarea');
  if (!ta) return;

  const newText = ta.value.trim();
  if (!newText) return;

  if (!msg.originalText) msg.originalText = msg.text;
  msg.history = msg.history || [];
  msg.history.push({ type: 'edited', text: msg.text, time: Date.now() });

  msg.text = newText;
  msg.edited = true;

  const btnsEl = document.getElementById('edit-btns-' + msgId);
  if (areaEl) areaEl.style.display = 'none';
  if (btnsEl) btnsEl.style.display = 'none';

  // Aggiorna su Supabase
  supabase
    .from('messages')
    .update({
      text: newText,
      edited: true,
      original_text: msg.originalText,
      history: msg.history
    })
    .eq('id', msgId)
    .then(({ error }) => {
      if (error) {
        console.error('Edit message error:', error);
        showToast('Error editing message', 'error');
      } else {
        saveState();
        renderMessages();
        showToast('Message edited', 'success');
      }
    });
}

function cancelEdit(msgId) {
  const areaEl = document.getElementById('edit-area-' + msgId);
  const btnsEl = document.getElementById('edit-btns-' + msgId);
  if (areaEl) areaEl.style.display = 'none';
  if (btnsEl) btnsEl.style.display = 'none';
}

// ============ PIN BAR ============
function updatePinBar() {
  const bar = document.getElementById('pin-bar');
  if (!state.pinnedMsg || !state.currentChat) {
    bar.classList.remove('has-pin');
    return;
  }
  const chat = state.chats[state.currentChat];
  const msg = chat?.messages.find(m => m.id === state.pinnedMsg);
  if (!msg) {
    bar.classList.remove('has-pin');
    return;
  }
  bar.classList.add('has-pin');
  let preview = msg.text;
  if (msg.type === 'image') preview = '📷 Image';
  else if (msg.type === 'sticker') preview = '🎨 Sticker';
  else if (msg.type === 'file') preview = '📎 File';
  document.getElementById('pin-bar-text').textContent = (msg.sender || '') + ': ' + (preview || 'Pinned message');
}

function unpinMessage() {
  if (state.currentChat) {
    state.chats[state.currentChat].pinnedMsg = null;
  }
  state.pinnedMsg = null;
  saveState();
  updatePinBar();
  renderMessages();
}

// ============ USERS BAR ============
function renderUsersBar() {
  const bar = document.getElementById('chat-users-bar');
  const chat = state.chats[state.currentChat];
  if (!chat) { bar.innerHTML = ''; return; }

  bar.innerHTML = chat.users.map(u => `
    <div class="chat-user-chip ${u === state.username ? 'self' : ''}">
      ${u === state.username ? '● ' : ''}${escHtml(u)}
    </div>
  `).join('');
}

// ============ LEAVE CHAT ============
function leaveChat() {
  // Unsubscribe from Supabase channel
  if (supabaseChannel) {
    supabaseChannel.unsubscribe();
    supabaseChannel = null;
  }
  state.currentChat = null;
  state.pinnedMsg = null;
  showScreen('home');
  renderRecentChats();
}

// ============ DELETE CHAT ============
function deleteCurrentChat() {
  if (!state.currentChat) return;
  
  const chat = state.chats[state.currentChat];
  const isOwner = chat.users && chat.users[0] === state.username;
  
  if (!isOwner) {
    showToast('❌ Only the chat creator can delete this chat', 'error');
    return;
  }
  
  if (confirm('⚠️ Delete this chat permanently? All messages will be lost. This cannot be undone.')) {
    fetch(`/api/chat/${state.currentChat}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.username })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Unsubscribe from channel
        if (supabaseChannel) {
          supabaseChannel.unsubscribe();
          supabaseChannel = null;
        }
        delete state.chats[state.currentChat];
        saveState();
        state.currentChat = null;
        showToast('Chat deleted successfully', 'success');
        showScreen('home');
        renderRecentChats();
      } else {
        showToast('Error deleting chat: ' + data.error, 'error');
      }
    })
    .catch(err => {
      console.error('Delete chat error:', err);
      showToast('Failed to delete chat', 'error');
    });
  }
}

// ============ CHAT INFO ============
function showChatInfo() {
  if (!state.currentChat) return;
  const chat = state.chats[state.currentChat];
  if (!chat) return;
  const status = chat.activated ? 'Permanent (activated)' : 'Pending (24h expiry)';
  const created = new Date(chat.created).toLocaleString();
  
  const isOwner = chat.users && chat.users[0] === state.username;
  
  const msgCount = chat.messages.filter(m => m.type === 'msg').length;
  const imgCount = chat.messages.filter(m => m.type === 'image').length;
  const stickerCount = chat.messages.filter(m => m.type === 'sticker').length;
  
  document.getElementById('chat-info-text').innerHTML =
    `<strong>Code:</strong> ${state.currentChat}<br>
     <strong>Status:</strong> ${status}<br>
     <strong>Created:</strong> ${created}<br>
     <strong>Messages:</strong> ${msgCount} 💬<br>
     <strong>Images:</strong> ${imgCount} 📷<br>
     <strong>Stickers:</strong> ${stickerCount} 🎨`;
     
  document.getElementById('chat-info-users').innerHTML =
    '<div style="margin-top:12px"><strong style="font-size:0.82rem;color:var(--text3)">MEMBERS</strong><div class="dash-users" style="margin-top:8px">' +
    chat.users.map(u => `<div class="dash-user-pill"><span class="dot"></span>${escHtml(u)}</div>`).join('') + '</div></div>';
  
  const deleteBtn = document.getElementById('delete-chat-btn');
  if (deleteBtn) {
    deleteBtn.style.display = isOwner ? 'flex' : 'none';
  }
  
  openModal('modal-chat-info');
}

// ============ RECENT CHATS ============
function renderRecentChats() {
  const list = document.getElementById('recent-chats-list');
  const wrap = document.getElementById('recent-chats-wrap');
  const codes = Object.keys(state.chats);
  if (!codes.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = codes.slice(-5).reverse().map(code => {
    const chat = state.chats[code];
    const msgCount = chat.messages.filter(m => m.type === 'msg').length;
    return `
      <div class="recent-item" onclick="enterChat('${code}', false)">
        <div>
          <div class="recent-item-code">${code}</div>
          <div class="recent-item-info">${msgCount} messages</div>
        </div>
        <span class="recent-item-arrow">→</span>
      </div>
    `;
  }).join('');
}

// ============ SETTINGS ============
function updateSettingsUI() {
  document.getElementById('settings-username').textContent = state.username;
  updateStorageInfo();
  buildThemeGrid();
}

function updateStorageInfo() {
  try {
    let total = 0;
    for (const k in localStorage) {
      if (localStorage.hasOwnProperty(k)) total += localStorage[k].length;
    }
    document.getElementById('storage-info').textContent = (total / 1024).toFixed(1) + ' KB used locally';
  } catch(e) {}
}

function openChangeName() {
  showScreen('404');
}

function clearAllData() {
  if (confirm('Delete all chats and messages? This cannot be undone.')) {
    state.chats = {};
    state.currentChat = null;
    saveState();
    showToast('All data cleared', 'success');
    renderRecentChats();
  }
}

// ============ DASHBOARD ============
function renderDashboard() {
  const query = (document.getElementById('dash-search')?.value || '').toLowerCase();
  const container = document.getElementById('dash-content');
  const codes = Object.keys(state.chats);

  if (!codes.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px">No chats found in local storage.</div>';
    return;
  }

  let html = '';

  codes.filter(code => {
    if (!query) return true;
    const chat = state.chats[code];
    return code.includes(query) || chat.users.some(u => u.toLowerCase().includes(query));
  }).forEach(code => {
    const chat = state.chats[code];
    const status = chat.activated ? 'active' : (Date.now() - chat.created > 24*60*60*1000 ? 'expired' : 'pending');
    const statusLabel = status === 'active' ? '● Active' : status === 'expired' ? '● Expired' : '⏳ Pending';
    const msgCount = chat.messages.filter(m => m.type === 'msg').length;
    const created = new Date(chat.created).toLocaleString();

    const editedMsgs = chat.messages.filter(m => m.edited && m.history?.some(h => h.type === 'edited'));
    const deletedMsgs = chat.messages.filter(m => m.deleted && m.originalText);

    html += `
      <div class="dash-chat-item">
        <div class="dash-chat-top">
          <span class="dash-chat-code">${code}</span>
          <span class="dash-chat-status ${status}">${statusLabel}</span>
          <span style="flex:1"></span>
          <button class="btn btn-sm btn-primary" onclick="enterChat('${code}', false)">Open →</button>
        </div>
        <div class="dash-chat-meta">Created: ${created} · ${msgCount} messages</div>
        <div class="dash-users">
          ${chat.users.map(u => `<div class="dash-user-pill"><span class="dot"></span>${escHtml(u)}</div>`).join('')}
        </div>
    `;

    if (editedMsgs.length > 0) {
      html += `
        <div class="dash-msg-log">
          <div class="dash-msg-log-header">✏️ Edited Messages (${editedMsgs.length})</div>
          ${editedMsgs.map(m => {
            const editHistory = m.history.filter(h => h.type === 'edited');
            return `
              <div class="dash-msg-entry">
                <div class="dash-msg-user">👤 ${escHtml(m.sender)}</div>
                ${editHistory.map(h => `<div class="dash-msg-original">Original: "${escHtml(h.text)}"</div><div class="dash-msg-arrow">↓</div>`).join('')}
                <div class="dash-msg-modified">Current: "${escHtml(m.text)}"</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (deletedMsgs.length > 0) {
      html += `
        <div class="dash-msg-log" style="margin-top:8px">
          <div class="dash-msg-log-header">🗑️ Deleted Messages (${deletedMsgs.length})</div>
          ${deletedMsgs.map(m => `
            <div class="dash-msg-entry">
              <div class="dash-msg-user">👤 ${escHtml(m.sender)}</div>
              <div class="dash-msg-original">Original: "${escHtml(m.originalText)}"</div>
              <div class="dash-msg-arrow">↓</div>
              <div class="dash-msg-deleted-text">Status: Deleted</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += '</div>';
  });

  container.innerHTML = html || '<div style="text-align:center;color:var(--text3);padding:40px">No chats match your search.</div>';
}

// ============ MODALS ============
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ============ TOAST ============
let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 2200);
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function onMessageInput() {
  // Non più necessario per socket.io, ma mantenuto per compatibilità
  // Il typing sarà gestito da Supabase in futuro se necessario
}

// ============ STYLE FOR DELETE BUTTON ============
const style = document.createElement('style');
style.textContent = `
  .msg-delete-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    margin-left: 4px;
  }
  .msg-delete-btn img {
    width: 18px;
    height: 18px;
  }
  .msg-bubble-row:hover .msg-delete-btn,
  .msg-delete-btn.active {
    opacity: 1;
  }
  @media (max-width: 768px) {
    .msg-delete-btn {
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// ============ START ============
init();
