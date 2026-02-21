import { useState, useEffect, useRef } from 'react';
import { Player } from '@cumor/shared';

interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  color: string;
  timestamp: number;
}

interface ChatPanelProps {
  socket: any;
  myId: string;
  players: Player[];
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatPanel({ socket, myId, players, isOpen, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      if (!isOpen) {
        setHasUnread(true);
      }
    };

    socket.on('chat_message', handleNewMessage);

    return () => {
      socket.off('chat_message', handleNewMessage);
    };
  }, [socket, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    socket.emit('send_chat_message', { text: inputText });
    setInputText("");
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`hidden md:block fixed bottom-4 left-4 z-50 p-3 rounded-full shadow-lg transition-all hover:scale-110 ${hasUnread ? 'bg-red-500 animate-bounce' : 'bg-slate-700 hover:bg-slate-600'}`}
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 h-96 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700">
        <span className="font-bold text-gray-200">Sohbet 💬</span>
        <button onClick={onToggle} className="text-gray-400 hover:text-white">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroller">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-xs mt-4">Sohbet henüz başlamadı...</div>
        )}
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === myId;
          return (
            <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] font-bold" style={{ color: msg.color }}>{msg.senderName}</span>
                <span className="text-[8px] text-gray-600">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-sm max-w-[85%] break-words ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-gray-200 rounded-bl-none'}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-2 border-t border-slate-700 bg-slate-800 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Mesaj yaz..."
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-bold">
          ➤
        </button>
      </form>
    </div>
  );
}
