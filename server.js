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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
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
    // Drop tables if exist (clean slate)
    await pool.query(`
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS chats;
    `);
    
    // Create chats table
    await pool.query(`
      CREATE TABLE chats (
        code VARCHAR(6) PRIMARY KEY,
        created_at BIGINT NOT NULL,
        activated BOOLEAN DEFAULT false,
        users TEXT[] DEFAULT '{}',
        pinned_msg_id TEXT
      )
    `);
    
    // Create messages table with correct foreign key
    await pool.query(`
      CREATE TABLE messages (
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
      )
    `);
    
    console.log('✅ Database initialized with correct schema');
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
    console.error('GET chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new chat
app.post('/api/chat/create', async (req, res) => {
  const { code, username, created_at } = req.body;
  try {
    await pool.query(
      'INSERT INTO chats (code, created_at, activated, users) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
      [code, created_at, false, [username]]
    );
    res.json({ success: true, code });
  } catch (err) {
    console.error('Create chat error:', err);
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
    
    const updatedChat = await pool.query('SELECT * FROM chats WHERE code = $1', [code]);
    res.json({ success: true, chat: updatedChat.rows[0] });
  } catch (err) {
    console.error('Join chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete chat
app.delete('/api/chat/:code', async (req, res) => {
  const { code } = req.params;
  const { username } = req.body;
  
  try {
    const chat = await pool.query('SELECT * FROM chats WHERE code = $1', [code]);
    if (chat.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const chatData = chat.rows[0];
    const isOwner = chatData.users && chatData.users[0] === username;
    
    if (!isOwner) {
      return res.status(403).json({ error: 'Only chat creator can delete this chat' });
    }
    
    await pool.query('DELETE FROM chats WHERE code = $1', [code]);
    
    io.to(code).emit('chat deleted', { code, by: username });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat error:', err);
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
    console.log(`📢 ${username} joined chat ${code}`);
    
    try {
      // Send message history
      const messages = await pool.query(
        'SELECT * FROM messages WHERE chat_code = $1 ORDER BY time ASC',
        [code]
      );
      socket.emit('chat history', messages.rows);
      
      // Notify others
      socket.to(code).emit('user joined', username);
      
      // Update user list
      const chat = await pool.query('SELECT users FROM chats WHERE code = $1', [code]);
      if (chat.rows[0]) {
        io.to(code).emit('users update', chat.rows[0].users || []);
      }
    } catch (err) {
      console.error('Join chat socket error:', err);
    }
  });
  
  socket.on('new message', async (data) => {
    const { chatCode, message } = data;
    console.log(`📝 New message in ${chatCode} from ${message.sender}`);
    
    try {
      await pool.query(
        `INSERT INTO messages (id, chat_code, type, sender, text, time, edited, deleted) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [message.id, chatCode, message.type, message.sender, message.text, message.time, false, false]
      );
      
      // Broadcast to everyone in the room
      io.to(chatCode).emit('message received', message);
    } catch (err) {
      console.error('Save message error:', err);
      socket.emit('error', { message: 'Failed to save message' });
    }
  });
  
  socket.on('edit message', async ({ chatCode, messageId, newText, username }) => {
    try {
      await pool.query('UPDATE messages SET text = $1, edited = true WHERE id = $2', [newText, messageId]);
      io.to(chatCode).emit('message edited', { messageId, newText, username });
    } catch (err) {
      console.error('Edit error:', err);
    }
  });
  
  socket.on('delete message', async ({ chatCode, messageId, username }) => {
    try {
      await pool.query('UPDATE messages SET deleted = true, text = $1 WHERE id = $2', ['[deleted]', messageId]);
      io.to(chatCode).emit('message deleted', { messageId, username });
    } catch (err) {
      console.error('Delete error:', err);
    }
  });
  
  socket.on('pin message', async ({ chatCode, messageId }) => {
    try {
      await pool.query('UPDATE chats SET pinned_msg_id = $1 WHERE code = $2', [messageId, chatCode]);
      io.to(chatCode).emit('message pinned', messageId);
    } catch (err) {
      console.error('Pin error:', err);
    }
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

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
