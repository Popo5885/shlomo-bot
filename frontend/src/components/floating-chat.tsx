'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot'; text: string }>>([
    { role: 'bot', text: 'שלום! אני העוזר הדיגיטלי של שלמה פופוביץ שירותי אוטומציה לעסקים. איך אפשר לעזור?' },
  ]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim() || loading) return;
    const userMsg = message.trim();
    setMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      // Submit as feature request
      await api.post('/api/client/feature-requests', {
        title: userMsg,
        description: `Submitted via chat widget`,
      });
      setMessages(prev => [
        ...prev,
        { role: 'bot', text: `הבקשה "${userMsg.slice(0, 50)}..." נשלחה בהצלחה! הצוות שלנו יטפל בה בהקדם.` },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'bot', text: 'אירעה שגיאה בשליחת הבקשה. נסה שוב מאוחר יותר.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-blue-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 transition-shadow"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-6 z-50 w-80 overflow-hidden rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl"
            dir="rtl"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-500 to-blue-600 p-4">
              <h3 className="font-bold text-white text-sm">עוזר דיגיטלי</h3>
              <p className="text-xs text-white/70 mt-0.5">שלמה פופוביץ שירותי אוטומציה לעסקים</p>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-3 space-y-2">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-violet-500/20 text-violet-100'
                        : 'bg-white/10 text-gray-200'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-end">
                  <div className="bg-white/10 rounded-xl px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-3 flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="כתוב בקשה או שאלה..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500/50"
              />
              <button
                onClick={sendMessage}
                disabled={!message.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500 text-white disabled:opacity-50 hover:bg-violet-600 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
