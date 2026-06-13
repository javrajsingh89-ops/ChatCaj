const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        code VARCHAR(6) PRIMARY KEY,
        created_at BIGINT NOT NULL,
        activated BOOLEAN DEFAULT false,
        users TEXT[] DEFAULT '{}',
        pinned_msg_id TEXT
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_code VARCHAR(6) REFERENCES chats(code) ON DELETE CASCADE,
        type VARCHAR(10) DEFAULT 'msg',
        sender VARCHAR(50),
        text TEXT,
        time BIGINT,
        edited BOOLEAN DEFAULT false,
        deleted BOOLEAN DEFAULT false,
        original_text TEXT,
        history TEXT[]
      );
    `);
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('Database init error:', err.message);
  }
};
initDatabase();

// ============ API ROUTES ============

// Get chat by code
app.get('/api/chat/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const chat = await pool.query('SELECT * FROM chats WHERE code = $1', [code]);
    if (chat.rows.length === 0) return res.status(404).json({ error: 'Chat not found' });
    
    const messages = await pool.query('SELECT * FROM messages WHERE chat_code = $1 ORDER BY time ASC', [code]);
    res.json({ chat: chat.rows[0], messages: messages.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new chat
app.post('/api/chat/create', async (req, res) => {
  const { code, username, created_at } = req.body;
  try {
    await pool.query(
      'INSERT INTO chats (code, created_at, activated, users) VALUES ($1, $2, $3, $4)',
      [code, created_at, false, [username]]
    );
    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join chat
app.post('/api/chat/join', async (req, res) => {
  const { code, username } = req.body;
  try {
    const chat = await pool.query('SELECT * FROM chats WHERE code = $1', [code]);
    if (chat.rows.length === 0) return res.status(404).json({ error: 'Code not found' });
    
    const chatData = chat.rows[0];
    const age = Date.now() - chatData.created_at;
    
    if (!chatData.activated && age > 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'Code expired' });
    }
    
    let users = chatData.users || [];
    if (!users.includes(username)) users.push(username);
    
    const activated = chatData.activated || (users.length >= 2);
    
    await pool.query(
      'UPDATE chats SET users = $1, activated = $2 WHERE code = $3',
      [users, activated, code]
    );
    
    res.json({ success: true, chat: { ...chatData, users, activated } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  let currentRoom = null;
  let currentUsername = null;
  
  socket.on('join chat', async ({ code, username }) => {
    currentRoom = code;
    currentUsername = username;
    socket.join(code);
    
    // Send existing messages
    const messages = await pool.query(
      'SELECT * FROM messages WHERE chat_code = $1 ORDER BY time ASC',
      [code]
    );
    socket.emit('chat history', messages.rows);
    
    // Notify others
    socket.to(code).emit('user joined', username);
    
    // Update user list
    const chat = await pool.query('SELECT users FROM chats WHERE code = $1', [code]);
    io.to(code).emit('users update', chat.rows[0]?.users || []);
  });
  
  socket.on('new message', async (data) => {
    const { chatCode, message } = data;
    try {
      await pool.query(
        'INSERT INTO messages (id, chat_code, type, sender, text, time, edited, deleted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [message.id, chatCode, message.type, message.sender, message.text, message.time, false, false]
      );
      io.to(chatCode).emit('message received', message);
    } catch (err) {
      console.error('Save message error:', err);
    }
  });
  
  socket.on('edit message', async ({ chatCode, messageId, newText, username }) => {
    try {
      const msg = await pool.query('SELECT * FROM messages WHERE id = $1 AND chat_code = $2', [messageId, chatCode]);
      if (msg.rows.length === 0) return;
      
      const originalText = msg.rows[0].original_text || msg.rows[0].text;
      const history = msg.rows[0].history || [];
      history.push({ type: 'edited', text: msg.rows[0].text, time: Date.now() });
      
      await pool.query(
        'UPDATE messages SET text = $1, edited = true, original_text = $2, history = $3 WHERE id = $4',
        [newText, originalText, history, messageId]
      );
      io.to(chatCode).emit('message edited', { messageId, newText, username });
    } catch (err) {
      console.error('Edit error:', err);
    }
  });
  
  socket.on('delete message', async ({ chatCode, messageId, username }) => {
    try {
      const msg = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
      if (msg.rows.length === 0) return;
      
      const originalText = msg.rows[0].original_text || msg.rows[0].text;
      const history = msg.rows[0].history || [];
      history.push({ type: 'deleted', text: msg.rows[0].text, time: Date.now() });
      
      await pool.query(
        'UPDATE messages SET deleted = true, original_text = $1, history = $2, text = $3 WHERE id = $4',
        [originalText, history, '[deleted]', messageId]
      );
      io.to(chatCode).emit('message deleted', { messageId, username });
    } catch (err) {
      console.error('Delete error:', err);
    }
  });
  
  socket.on('pin message', async ({ chatCode, messageId }) => {
    await pool.query('UPDATE chats SET pinned_msg_id = $1 WHERE code = $2', [messageId, chatCode]);
    io.to(chatCode).emit('message pinned', messageId);
  });
  
  socket.on('typing', ({ chatCode, username }) => {
    socket.to(chatCode).emit('user typing', username);
  });
  
  socket.on('stop typing', ({ chatCode }) => {
    socket.to(chatCode).emit('user stop typing');
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    if (currentRoom && currentUsername) {
      io.to(currentRoom).emit('user left', currentUsername);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
