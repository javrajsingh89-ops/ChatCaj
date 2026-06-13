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
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables if not exists
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        is_online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
};
initDatabase();

// API Routes
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY timestamp ASC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, is_online FROM users ORDER BY username'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New user connected:', socket.id);
  
  let currentUsername = null;
  
  // User joins chat
  socket.on('user join', async (username) => {
    currentUsername = username;
    
    try {
      // Add or update user in database
      await pool.query(
        'INSERT INTO users (username, is_online, last_seen) VALUES ($1, true, NOW()) ON CONFLICT (username) DO UPDATE SET is_online = true, last_seen = NOW()',
        [username]
      );
      
      // Send last 50 messages to new user
      const messages = await pool.query(
        'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50'
      );
      socket.emit('chat history', messages.rows.reverse());
      
      // Broadcast updated user list to everyone
      const users = await pool.query('SELECT username, is_online FROM users WHERE is_online = true');
      io.emit('users list', users.rows);
      
      // Announce new user
      io.emit('system message', { 
        text: `${username} è entrato nella chat`,
        timestamp: new Date()
      });
      
    } catch (err) {
      console.error('Error in user join:', err);
    }
  });
  
  // Handle new message
  socket.on('chat message', async (data) => {
    try {
      const { username, text } = data;
      
      // Save to database
      const result = await pool.query(
        'INSERT INTO messages (username, text, timestamp) VALUES ($1, $2, NOW()) RETURNING *',
        [username, text]
      );
      
      // Broadcast to all users
      io.emit('chat message', {
        id: result.rows[0].id,
        username: username,
        text: text,
        timestamp: result.rows[0].timestamp
      });
      
    } catch (err) {
      console.error('Error saving message:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // User is typing
  socket.on('typing', (username) => {
    socket.broadcast.emit('user typing', username);
  });
  
  // User stops typing
  socket.on('stop typing', () => {
    socket.broadcast.emit('user stop typing');
  });
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('🔌 User disconnected:', socket.id);
    
    if (currentUsername) {
      try {
        // Mark user as offline
        await pool.query(
          'UPDATE users SET is_online = false, last_seen = NOW() WHERE username = $1',
          [currentUsername]
        );
        
        // Update user list for everyone
        const users = await pool.query('SELECT username, is_online FROM users WHERE is_online = true');
        io.emit('users list', users.rows);
        
        // Announce user left
        io.emit('system message', {
          text: `${currentUsername} ha lasciato la chat`,
          timestamp: new Date()
        });
        
      } catch (err) {
        console.error('Error in disconnect:', err);
      }
    }
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
