import React, { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles } from "lucide-react";
import type { TripSummary } from "@/lib/api";

export function AiChatbotAvatar({ summary }: { summary: TripSummary }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showThought, setShowThought] = useState(true);
  const [messages, setMessages] = useState([
    { role: "ai", content: `I've analyzed your trip. It's fully compliant! You have a total of ${summary.drivingHrs.toFixed(1)} driving hours and ${summary.onDutyHrs.toFixed(1)} on-duty hours across ${summary.days} days.` },
    { role: "ai", content: `The routing incorporates ${summary.restarts} restarts. Would you like me to optimize your break times?` }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const newMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: "ai", content: "That's an interesting point. Let me check the FMCSA compliance rules... Yes, that perfectly aligns with the guidelines!" }]);
    }, 1500);
  };

  return (
    <div className="relative z-50">
      {/* Avatar Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowThought(false);
        }}
        className="group relative flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-hairline bg-panel/80 backdrop-blur-md transition-all duration-500 ease-out hover:border-green/50 hover:bg-green/10 hover:shadow-[0_0_15px_rgba(0,255,102,0.15)]"
      >
        <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-green/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <img src="/rig_ai_avatar.jpg" alt="AI" className="relative z-10 h-full w-full rounded-lg object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        
        {/* Unread indicator */}
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green text-[0.5rem] font-bold text-black shadow-[0_0_8px_rgba(0,255,102,0.6)] animate-pulse">
          2
        </span>
      </button>

      {/* Thought Bubble */}
      {showThought && !isOpen && (
        <div className="absolute right-0 top-[52px] w-64 rounded-xl border border-hairline bg-panel/95 p-3.5 text-xs text-gray-dim shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowThought(false); }}
            className="absolute right-2 top-2 rounded-full p-1 text-gray-dim transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={12} />
          </button>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Sparkles size={14} className="text-green" /> 
            AI Insight
          </div>
          <p className="leading-relaxed">
            I've analyzed your trip layout. Click to see my breakdown on the compliance timing and suggestions for optimal rest stops!
          </p>
          {/* pointer arrow */}
          <div className="absolute -top-1.5 right-[15px] h-3 w-3 rotate-45 border-l border-t border-hairline bg-panel/95"></div>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="absolute right-0 top-[52px] flex h-[400px] w-[340px] flex-col overflow-hidden rounded-xl border border-hairline bg-panel/95 shadow-[0_10px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in fade-in zoom-in-95 slide-in-from-top-4">
          <div className="flex items-center justify-between border-b border-hairline bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-green/30 bg-green/10 text-green shadow-[0_0_10px_rgba(0,255,102,0.1)]">
                <img src="/rig_ai_avatar.jpg" alt="AI" className="h-full w-full object-cover" />
              </div>
              <div>
                <span className="block text-sm font-bold tracking-wide text-white">HAULR Copilot</span>
                <span className="block font-mono text-[0.65rem] font-medium tracking-widest text-green uppercase">Online</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="rounded-lg p-1.5 text-gray transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div 
                  className={`relative max-w-[85%] px-3.5 py-2.5 text-[0.8rem] leading-relaxed shadow-sm ${
                    m.role === 'user' 
                    ? 'rounded-2xl rounded-tr-sm bg-green text-black' 
                    : 'rounded-2xl rounded-tl-sm border border-hairline bg-white/5 text-gray-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                <div className="relative max-w-[85%] rounded-2xl rounded-tl-sm border border-hairline bg-white/5 px-4 py-3.5 shadow-sm">
                  <div className="flex gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-dim animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-dim animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-dim animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-hairline bg-black/40 p-3">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your route..."
                className="w-full rounded-full border border-hairline bg-white/5 py-2 pl-4 pr-10 text-[0.8rem] text-white placeholder-gray-dim outline-none transition-all focus:border-green/50 focus:bg-white/10"
              />
              <button 
                type="submit" 
                disabled={!input.trim()}
                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-green text-black transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <Send size={12} className="-ml-0.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
