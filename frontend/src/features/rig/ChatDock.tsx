import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, AlertCircle, Compass, RefreshCw, HelpCircle, FileText } from "lucide-react";
import { useUIActionBus } from "@/lib/uiActionBus";
import { sendChat } from "./chatService";
import { ConfirmTripCard } from "./ConfirmTripCard";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  isStreaming?: boolean;
  citations?: Array<{
    source: string;
    page_range: string;
    title?: string;
    snippet: string;
  }>;
  pendingConfirm?: any;
}

export const ChatDock: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Rig here, dispatcher on duty. Let me know if you need to plot a compliant haul, export log sheets, or clarify any HOS rules. Ready for route parameters or guidelines questions, driver. 10-4."
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Zustand store triggers
  const { setCurrentPlan, setActiveLogDay, setPdfDownloadUrl } = useUIActionBus();

  // Session thread ID
  const [threadId] = useState(() => {
    const saved = sessionStorage.getItem("rig_thread_id");
    if (saved) return saved;
    const newId = `thread_${Math.random().toString(36).substring(2, 11)}`;
    sessionStorage.setItem("rig_thread_id", newId);
    return newId;
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when message arrives
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const addMessage = (sender: "user" | "bot", text: string, extra?: Partial<Message>) => {
    const id = `msg_${Math.random().toString(36).substring(2, 11)}`;
    setMessages(prev => [...prev, { id, sender, text, ...extra }]);
    return id;
  };

  const handleSend = async (textToSend: string, isConfirm: boolean = false) => {
    if (!textToSend.trim() && !isConfirm) return;

    setError(null);
    setLoading(true);

    if (!isConfirm) {
      addMessage("user", textToSend);
      setMessage("");
    } else {
      // Add visual confirmation note in chat and remove the pending confirm card from state
      setMessages(prev => prev.filter(m => !m.pendingConfirm));
      addMessage("user", "CONFIRM_TRIP: Parameters approved.");
    }

    // Set up assistant message skeleton (loading indicator).
    const assistantMsgId = addMessage("bot", "", { isStreaming: true });

    try {
      const resp = await sendChat({
        message: isConfirm ? "" : textToSend,
        thread_id: threadId,
        confirm: isConfirm,
      });

      // Apply UI actions from the tools the agent ran.
      let downloadNote = "";
      for (const action of resp.ui_actions) {
        if (action.type === "RENDER_TRIP") {
          setCurrentPlan(action.payload);
        } else if (action.type === "SHOW_LOG_SHEET") {
          if (action.payload?.day_requested) setActiveLogDay(action.payload.day_requested);
        } else if (action.type === "OFFER_DOWNLOAD") {
          setPdfDownloadUrl(action.payload.download_url);
          downloadNote = `\n\n[Download Logs PDF](${action.payload.download_url}) (expires in 15 minutes).`;
        }
      }

      const hasRenderTrip = resp.ui_actions.some((a) => a.type === "RENDER_TRIP");
      const replyText =
        resp.reply ||
        (hasRenderTrip
          ? "Compliance route plotted! I've loaded it onto your map and drawn the ELD log grids. Scroll down to review, driver."
          : resp.needs_confirmation
            ? "Got your route parameters. Review the details below to confirm the dispatch, driver:"
            : "10-4.");

      setMessages(prev => {
        let next = prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                text: replyText + downloadNote,
                citations: resp.citations.length ? resp.citations : m.citations,
              }
            : m
        );
        // Append the confirmation card if the agent is asking to confirm a trip.
        if (resp.needs_confirmation) {
          next = [
            ...next,
            {
              id: `confirm_${Date.now()}`,
              sender: "bot" as const,
              text: "",
              pendingConfirm: resp.needs_confirmation,
            },
          ];
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
    } finally {
      setLoading(false);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isStreaming: false } : m));
    }
  };

  const handleStarterChip = (query: string) => {
    handleSend(query);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Toggle Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-green text-black transition-all shadow-glow hover:scale-105 active:scale-95 group"
          title="Open Rig AI Copilot"
        >
          <span className="gps-fix absolute -inset-0.5 rounded-full border border-green/30" />
          <MessageSquare size={22} className="transition-transform group-hover:rotate-6" />
        </button>
      )}

      {/* Chat window sheet */}
      {isOpen && (
        <div className="panel chat-dock-panel flex h-[550px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-hairline bg-[#050505] shadow-[0_0_25px_rgba(34,197,94,0.15)] animate-in fade-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="relative border-b border-hairline bg-panel px-4 py-3 flex items-center justify-between">
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-green/30 to-transparent animate-scanline" />
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden border border-green/40 shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                <img src="/rig_ai_avatar.jpg" alt="Rig AI Avatar" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green rounded-full border-[1.5px] border-panel shadow-[0_0_5px_rgba(34,197,94,0.8)] animate-pulse" />
              </div>
              <div>
                <h3 className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-white">
                  RIG AI COPILOT
                </h3>
                <span className="font-mono text-[0.6rem] uppercase tracking-wider text-gray-dim">
                  Telemetry Active · Thread: {threadId}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-gray hover:bg-white/5 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                {/* Text Bubble */}
                {m.text && (
                  <div className={`flex gap-2 max-w-[95%] ${m.sender === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {m.sender === "bot" && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden border border-green/40 shadow-[0_0_10px_rgba(34,197,94,0.3)] mt-auto mb-1">
                        <img src="/rig_ai_avatar.jpg" alt="Rig AI" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div
                      className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.sender === "user"
                          ? "bg-green text-black font-medium rounded-br-sm shadow-sm"
                          : "bg-panel border border-hairline text-gray-light rounded-bl-sm shadow-sm"
                      }`}
                    >
                      {m.sender === "bot" ? (
                        <div className="react-markdown-container">
                          <ReactMarkdown
                            components={{
                              strong: ({node, ...props}) => <strong className="text-white font-semibold drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" {...props} />,
                              a: ({node, ...props}) => <a className="text-green hover:text-green-bright hover:drop-shadow-[0_0_5px_rgba(34,197,94,0.5)] transition-all underline decoration-green/30 underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />,
                              p: ({node, ...props}) => <p className="my-1.5" {...props} />,
                              ul: ({node, ...props}) => <ul className="my-1.5 pl-5 list-disc marker:text-green/60" {...props} />,
                              ol: ({node, ...props}) => <ol className="my-1.5 pl-5 list-decimal marker:text-green/60" {...props} />,
                              li: ({node, ...props}) => <li className="my-0.5" {...props} />,
                              code: ({node, ...props}) => <code className="bg-void px-1.5 py-0.5 rounded-md text-green font-mono text-[0.8em] border border-hairline shadow-inner" {...props} />,
                              h1: ({node, ...props}) => <h1 className="text-lg font-bold text-white mt-4 mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]" {...props} />,
                              h2: ({node, ...props}) => <h2 className="text-base font-bold text-white mt-3 mb-1.5" {...props} />,
                              h3: ({node, ...props}) => <h3 className="text-sm font-bold text-white mt-2 mb-1" {...props} />,
                              blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-green/50 pl-3 my-2 text-gray-light italic" {...props} />,
                            }}
                          >
                            {m.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span style={{ whiteSpace: "pre-line" }}>{m.text}</span>
                      )}
                      {m.isStreaming && (
                        <span className="inline-block w-1.5 h-3 ml-1 bg-green/80 animate-pulse rounded-sm" />
                      )}
                    </div>
                  </div>
                )}

                {/* Confirm Trip Custom Card */}
                {m.pendingConfirm && (
                  <ConfirmTripCard
                    params={m.pendingConfirm}
                    onConfirm={() => handleSend("", true)}
                    onCancel={() => {
                      setMessages(prev => prev.filter(msg => msg.id !== m.id));
                    }}
                    disabled={loading}
                  />
                )}

                {/* Citations List */}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[85%]">
                    {m.citations.map((c, i) => {
                      const citationLabel = c.source === "fmcsa-hos-guide" 
                        ? `FMCSA p. ${c.page_range}` 
                        : "App FAQ";
                      return (
                        <div
                          key={i}
                          className="group relative cursor-help rounded-full border border-hairline bg-void/50 px-2 py-0.5 font-mono text-[0.65rem] text-green hover:border-green/50 transition-colors"
                          title={c.snippet}
                        >
                          <span className="flex items-center gap-1">
                            <FileText size={10} />
                            {citationLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2 bg-danger/10 border-t border-b border-danger/25 px-4 py-2 text-xs text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Starter Chips */}
          {messages.length === 1 && !loading && (
            <div className="px-4 py-2 flex flex-col gap-1.5 border-t border-hairline bg-panel/30">
              <span className="font-mono text-[0.6rem] uppercase tracking-wider text-gray-dim">Suggested prompts</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["HOS 14-Hour Rule", "Explain the 14-hour on-duty rule.", HelpCircle],
                    ["Plan Trip", "Plan Dallas to Chicago, pickup Tulsa, 22 hrs cycle.", Compass],
                    ["34h Restart", "When is a 34-hour restart scheduled?", RefreshCw]
                  ] as [string, string, React.ComponentType<any>][]
                ).map(([label, query, Icon]) => (
                  <button
                    key={label}
                    onClick={() => handleStarterChip(query)}
                    className="flex items-center gap-1 rounded-full border border-hairline bg-panel px-2.5 py-1 font-mono text-[0.65rem] text-gray hover:border-green/50 hover:text-white transition-colors"
                  >
                    <Icon size={10} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Box */}
          <div className="border-t border-hairline bg-panel p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(message);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                placeholder="Ask Rig about route parameters or rules..."
                className="flex-1 rounded border border-hairline bg-void px-3 py-2 font-mono text-sm text-white placeholder-gray-dim focus:border-green/50 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !message.trim()}
                className="flex h-9 w-9 items-center justify-center rounded bg-green text-black hover:bg-green-bright transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Send size={14} />
              </button>
            </form>
            <div className="mt-2 text-center font-mono text-[0.55rem] tracking-wider text-gray-dim uppercase">
              Informational dispatch tool · Coded on Gemini
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
