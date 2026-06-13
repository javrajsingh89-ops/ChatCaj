/* FIX per mobile - barra input sempre visibile */
@media (max-width: 768px) {
  .chat-input-area {
    padding: 8px 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  
  .chat-input-wrap {
    padding: 8px 12px;
  }
  
  #chat-input {
    font-size: 16px; /* Previene zoom automatico su iOS */
  }
  
  .send-btn {
    width: 44px;
    height: 44px;
  }
  
  .chat-messages {
    padding: 12px;
    padding-bottom: 20px;
  }
}
