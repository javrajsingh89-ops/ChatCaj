-- ============ SCHEMA DATABASE PER CHATCAJ ============
-- Questo file verrà eseguito da Supabase durante la migrazione iniziale.
-- Data di creazione: 2026-01-16

-- Crea la tabella per le chat
CREATE TABLE IF NOT EXISTS chats (
  code VARCHAR(6) PRIMARY KEY,
  created_at BIGINT NOT NULL,
  activated BOOLEAN DEFAULT false,
  users TEXT[] DEFAULT '{}',
  pinned_msg_id TEXT
);

-- Crea la tabella per i messaggi
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

-- Crea indici per performance
CREATE INDEX IF NOT EXISTS idx_messages_chat_code ON messages(chat_code);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(time DESC);
CREATE INDEX IF NOT EXISTS idx_chats_activated ON chats(activated);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);

-- Abilita Realtime per le tabelle (necessario per Supabase Realtime)
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE chats REPLICA IDENTITY FULL;

-- Inserisci un messaggio di benvenuto (opzionale)
INSERT INTO chats (code, created_at, activated, users) 
VALUES ('000000', EXTRACT(EPOCH FROM NOW()) * 1000, true, '{"Benvenuto"}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO messages (id, chat_code, type, sender, text, time) 
VALUES ('msg_welcome', '000000', 'system', 'Benvenuto', 'ChatCaj è online! Inizia a chattare con tutti 🎉', EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;
