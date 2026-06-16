const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Inizializza Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============ API ROUTES ============

// Crea una nuova chat
app.post('/api/chat/create', async (req, res) => {
  const { code, username, created_at } = req.body;
  
  try {
    // Verifica se il codice esiste già
    const { data: existing, error: checkError } = await supabase
      .from('chats')
      .select('code')
      .eq('code', code)
      .single();
    
    if (existing) {
      return res.status(400).json({ error: 'Code already exists' });
    }
    
    // Inserisci la nuova chat
    const { data, error } = await supabase
      .from('chats')
      .insert([
        { 
          code: code, 
          created_at: created_at, 
          activated: false, 
          users: [username],
          pinned_msg_id: null
        }
      ])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, chat: data });
  } catch (err) {
    console.error('Create chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unisciti a una chat
app.post('/api/chat/join', async (req, res) => {
  const { code, username } = req.body;
  
  try {
    // Recupera la chat
    const { data: chat, error: fetchError } = await supabase
      .from('chats')
      .select('*')
      .eq('code', code)
      .single();
    
    if (fetchError || !chat) {
      return res.status(404).json({ error: 'Code not found' });
    }
    
    // Verifica scadenza (24 ore se non attivata)
    const age = Date.now() - chat.created_at;
    if (!chat.activated && age > 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'Code expired' });
    }
    
    // Aggiungi utente se non presente
    let users = chat.users || [];
    if (!users.includes(username)) {
      users.push(username);
    }
    
    // Attiva se almeno 2 utenti
    const activated = chat.activated || (users.length >= 2);
    
    // Aggiorna la chat
    const { data: updatedChat, error: updateError } = await supabase
      .from('chats')
      .update({ 
        users: users, 
        activated: activated 
      })
      .eq('code', code)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    res.json({ success: true, chat: updatedChat });
  } catch (err) {
    console.error('Join chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Elimina una chat (solo il creatore)
app.delete('/api/chat/:code', async (req, res) => {
  const { code } = req.params;
  const { username } = req.body;
  
  try {
    // Recupera la chat
    const { data: chat, error: fetchError } = await supabase
      .from('chats')
      .select('*')
      .eq('code', code)
      .single();
    
    if (fetchError || !chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Verifica che l'utente sia il creatore (primo utente nella lista)
    const isOwner = chat.users && chat.users[0] === username;
    if (!isOwner) {
      return res.status(403).json({ error: 'Only chat creator can delete this chat' });
    }
    
    // Elimina la chat (i messaggi verranno eliminati in cascata)
    const { error: deleteError } = await supabase
      .from('chats')
      .delete()
      .eq('code', code);
    
    if (deleteError) throw deleteError;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recupera i messaggi di una chat
app.get('/api/messages/:code', async (req, res) => {
  const { code } = req.params;
  
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_code', code)
      .order('time', { ascending: true });
    
    if (error) throw error;
    
    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Modifica un messaggio
app.put('/api/message/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { newText, username, chatCode } = req.body;
  
  try {
    // Recupera il messaggio
    const { data: msg, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();
    
    if (fetchError || !msg) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (msg.sender !== username) {
      return res.status(403).json({ error: 'Only message author can edit' });
    }
    
    const originalText = msg.original_text || msg.text;
    const history = msg.history || [];
    history.push({ type: 'edited', text: msg.text, time: Date.now() });
    
    // Aggiorna il messaggio
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        text: newText,
        edited: true,
        original_text: originalText,
        history: history
      })
      .eq('id', messageId);
    
    if (updateError) throw updateError;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Edit message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Elimina un messaggio
app.delete('/api/message/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { username, chatCode } = req.body;
  
  try {
    // Recupera il messaggio
    const { data: msg, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();
    
    if (fetchError || !msg) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (msg.sender !== username) {
      return res.status(403).json({ error: 'Only message author can delete' });
    }
    
    const originalText = msg.original_text || msg.text;
    const history = msg.history || [];
    history.push({ type: 'deleted', text: msg.text, time: Date.now() });
    
    // Aggiorna il messaggio (soft delete)
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        deleted: true,
        original_text: originalText,
        history: history,
        text: '[deleted]'
      })
      .eq('id', messageId);
    
    if (updateError) throw updateError;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pin messaggio
app.post('/api/chat/:code/pin', async (req, res) => {
  const { code } = req.params;
  const { messageId } = req.body;
  
  try {
    const { error } = await supabase
      .from('chats')
      .update({ pinned_msg_id: messageId })
      .eq('code', code);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Pin message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unpin messaggio
app.delete('/api/chat/:code/pin', async (req, res) => {
  const { code } = req.params;
  
  try {
    const { error } = await supabase
      .from('chats')
      .update({ pinned_msg_id: null })
      .eq('code', code);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Unpin message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Rotta per servire il frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvia il server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
