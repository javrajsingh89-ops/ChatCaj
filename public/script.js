const socket = io();

let currentUsername = null;
let messageSound = new Audio('/notification.mp3'); // Optional

// DOM elements - usa gli ID che già hai nel tuo HTML
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const usersList = document.getElementById('users-list');
const typingIndicator = document.getElementById('typing-indicator');
const onlineCount = document.getElementById('online-count');
const currentUserSpan = document.getElementById('current-user');

let typingTimeout = null;

// Login
loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (username.length < 2) {
    alert('Il nome utente deve avere almeno 2 caratteri');
    return;
  }
  
  currentUsername = username;
  currentUserSpan.textContent = username;
  socket.emit('user join', username);
  
  loginScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  messageInput.focus();
});

// Press Enter to login
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

// Send message
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  
  socket.emit('chat message', {
    username: currentUsername,
    text: text
  });
  
  messageInput.value = '';
  messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Typing indicator
messageInput.addEventListener('input', () => {
  socket.emit('typing', currentUsername);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop typing');
  }, 1000);
});

// Receive chat history
socket.on('chat history', (messages) => {
  messagesDiv.innerHTML = '';
  messages.forEach(msg => addMessageToDOM(msg.username, msg.text, msg.timestamp, msg.username === currentUsername));
  scrollToBottom();
});

// Receive new message
socket.on('chat message', (data) => {
  addMessageToDOM(data.username, data.text, data.timestamp, data.username === currentUsername);
  if (data.username !== currentUsername) {
    messageSound.play().catch(e => console.log('Audio play failed'));
  }
  scrollToBottom();
});

// System messages (user joined/left)
socket.on('system message', (data) => {
  addSystemMessage(data.text);
  scrollToBottom();
});

// Update users list
socket.on('users list', (users) => {
  updateUsersList(users);
  onlineCount.textContent = users.length;
});

// Typing indicator
socket.on('user typing', (username) => {
  if (username !== currentUsername) {
    typingIndicator.textContent = `${username} sta scrivendo...`;
    typingIndicator.style.display = 'block';
    
    setTimeout(() => {
      if (typingIndicator.textContent === `${username} sta scrivendo...`) {
        typingIndicator.style.display = 'none';
      }
    }, 2000);
  }
});

socket.on('user stop typing', () => {
  typingIndicator.style.display = 'none';
});

// Error handling
socket.on('error', (data) => {
  console.error('Socket error:', data);
  alert('Errore: ' + data.message);
});

// Helper functions
function addMessageToDOM(username, text, timestamp, isCurrentUser) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isCurrentUser ? 'message-out' : 'message-in'}`;
  
  const time = new Date(timestamp).toLocaleTimeString();
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <strong>${escapeHtml(username)}</strong>
      <small>${time}</small>
    </div>
    <div class="message-text">${escapeHtml(text)}</div>
  `;
  
  messagesDiv.appendChild(messageDiv);
}

function addSystemMessage(text) {
  const systemDiv = document.createElement('div');
  systemDiv.className = 'system-message';
  systemDiv.textContent = text;
  messagesDiv.appendChild(systemDiv);
}

function updateUsersList(users) {
  usersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.innerHTML = `
      <span class="user-status online"></span>
      <span>${escapeHtml(user.username)}</span>
    `;
    usersList.appendChild(li);
  });
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make sure your chat screen starts hidden
window.addEventListener('load', () => {
  chatScreen.style.display = 'none';
  console.log('ChatCaj ready!');
});
