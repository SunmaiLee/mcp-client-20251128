"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, User, Bot, Plus, MessageSquare, Trash2, Menu, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import {
  ChatSession,
  Message,
  getSessions,
  createSession,
  updateSession,
  deleteSession as deleteSessionFromDb,
  addMessage,
  updateLastMessage,
  updateSessionTitle,
  migrateFromLocalStorage,
  hasLocalStorageData,
} from "@/lib/chat-service";

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default width (72 * 4)
  const [isResizing, setIsResizing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Initialize and Load from Supabase (with Local Storage migration)
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Load sidebar width from localStorage (UI preference only)
        const savedSidebarWidth = localStorage.getItem("sidebar-width");
        if (savedSidebarWidth) {
          setSidebarWidth(parseInt(savedSidebarWidth));
        }

        // Check if there's data to migrate from Local Storage
        if (hasLocalStorageData()) {
          console.log("Migrating data from Local Storage to Supabase...");
          await migrateFromLocalStorage();
          console.log("Migration complete!");
        }

        // Load sessions from Supabase
        const dbSessions = await getSessions();
        
        if (dbSessions.length > 0) {
          setSessions(dbSessions);
          setCurrentSessionId(dbSessions[0].id);
        } else {
          // Create new chat if no sessions exist
          await createNewChatAsync();
        }
      } catch (error) {
        console.error("Error initializing data:", error);
        // Fallback: create a new chat
        await createNewChatAsync();
      } finally {
        setIsInitializing(false);
      }
    };

    initializeData();
  }, []);

  // Save sidebar width (UI preference - still uses localStorage)
  useEffect(() => {
    localStorage.setItem("sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  // Handle resizing
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      const newWidth = mouseMoveEvent.clientX;
      if (newWidth >= 200 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, currentSessionId]);

  const createNewChatAsync = async () => {
    const newSession: ChatSession = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      title: "새로운 대화",
      messages: [],
      createdAt: Date.now(),
    };
    
    // Save to Supabase
    await createSession(newSession);
    
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const createNewChat = () => {
    createNewChatAsync();
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // Delete from Supabase
    await deleteSessionFromDb(id);
    
    const updatedSessions = sessions.filter((s) => s.id !== id);
    setSessions(updatedSessions);
    
    if (updatedSessions.length === 0) {
      createNewChat();
    } else if (currentSessionId === id) {
      setCurrentSessionId(updatedSessions[0].id);
    }
  };

  const getCurrentSession = () => {
    return sessions.find((s) => s.id === currentSessionId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentSessionId) return;

    const userMessage: Message = { role: "user", content: input };
    const currentSession = getCurrentSession();
    const currentMessageCount = currentSession?.messages.length || 0;
    const isFirstMessage = currentMessageCount === 0;
    const newTitle = isFirstMessage ? input.slice(0, 30) : currentSession?.title || "새로운 대화";
    
    // Update local state first for immediate UI response
    setSessions((prev) => prev.map(session => {
      if (session.id === currentSessionId) {
        const updatedMessages = [...session.messages, userMessage];
        return { ...session, messages: updatedMessages, title: newTitle };
      }
      return session;
    }));

    // Save user message to Supabase
    await addMessage(currentSessionId, userMessage, currentMessageCount);
    
    // Update title if first message
    if (isFirstMessage) {
      await updateSessionTitle(currentSessionId, newTitle);
    }

    setInput("");
    setIsLoading(true);

    try {
      const currentMessages = currentSession?.messages || [];
      const requestMessages = [...currentMessages, userMessage];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
      });

      if (!response.ok) throw new Error("Network response was not ok");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: Message = { role: "assistant", content: "" };
      const assistantMessageIndex = currentMessageCount + 1;

      // Add empty assistant message to Supabase first
      await addMessage(currentSessionId, assistantMessage, assistantMessageIndex);

      setSessions((prev) => prev.map(session => {
        if (session.id === currentSessionId) {
          return { ...session, messages: [...session.messages, assistantMessage] };
        }
        return session;
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage.content += chunk;

        setSessions((prev) => prev.map(session => {
          if (session.id === currentSessionId) {
            const newMessages = [...session.messages];
            newMessages[newMessages.length - 1] = { ...assistantMessage };
            return { ...session, messages: newMessages };
          }
          return session;
        }));
      }

      // Update final assistant message in Supabase
      await updateLastMessage(currentSessionId, assistantMessage.content, assistantMessageIndex);

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." };
      
      setSessions((prev) => prev.map(session => {
        if (session.id === currentSessionId) {
           return { 
             ...session, 
             messages: [...session.messages, errorMessage] 
           };
        }
        return session;
      }));
      
      // Save error message to Supabase
      await addMessage(currentSessionId, errorMessage, currentMessageCount + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const currentSession = getCurrentSession();

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        ref={sidebarRef}
        style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px' }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 border-r border-slate-800 transition-[width] duration-300 ease-in-out md:relative shadow-xl overflow-hidden flex-shrink-0",
          !isSidebarOpen && "md:w-0 p-0 border-0"
        )}
      >
        <div className="flex flex-col h-full p-4 w-full">
          {/* Sidebar Header */}
          <div className="mb-6 flex items-center gap-3 px-2 mt-2 min-w-max">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Bot className="text-white w-6 h-6" />
            </div>
            <div className="overflow-hidden">
              <h2 className="text-white font-bold text-lg tracking-tight truncate">AI 친구</h2>
              <p className="text-xs text-slate-400 font-medium truncate">나만의 스마트한 비서</p>
            </div>
          </div>

          <button 
            onClick={createNewChat}
            className="flex items-center gap-3 w-full p-3.5 mb-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 group min-w-max overflow-hidden"
          >
            <div className="bg-white/20 p-1 rounded-lg group-hover:rotate-90 transition-transform duration-300 shrink-0">
              <Plus size={18} />
            </div>
            <span className="font-semibold truncate">새로운 대화 시작</span>
          </button>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="px-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-max">
              최근 대화
            </div>
            {sessions.map((session) => (
              <div 
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border border-transparent min-w-max w-full",
                  currentSessionId === session.id 
                    ? "bg-slate-800 text-white border-slate-700 shadow-md" 
                    : "hover:bg-slate-800/50 hover:text-slate-200 text-slate-400"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <MessageSquare size={18} className={cn("shrink-0", currentSessionId === session.id ? "text-blue-400" : "text-slate-500")} />
                  <span className="truncate text-sm font-medium block w-full">
                    {session.title}
                  </span>
                </div>
                <button
                  onClick={(e) => deleteChat(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all shrink-0"
                  title="대화 삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4 border-t border-slate-800 text-xs text-center text-slate-500 min-w-max">
            &copy; 2024 AI Friend Client
          </div>
        </div>

        {/* Resizer Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-50"
          onMouseDown={startResizing}
        />
      </aside>

      {/* Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative bg-white dark:bg-gray-950">
        {/* Header */}
        <header className="h-16 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur z-10 sticky top-0">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 md:hidden shrink-0">
               <Bot className="w-6 h-6 text-blue-500" />
               <span className="font-bold text-lg">AI 친구</span>
            </div>
            <div className="hidden md:block min-w-0">
              <h1 className="text-lg font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-200 truncate">
                {currentSession?.title || "대화"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Optional Header Actions */}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
          <div className="max-w-4xl mx-auto space-y-8 pb-4">
            {!currentSession || currentSession.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <Sparkles className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">무엇을 도와드릴까요?</h3>
                <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
                  궁금한 내용을 물어보거나, 코드를 작성해달라고 요청해보세요.
                  AI 친구가 친절하게 답변해드립니다.
                </p>
              </div>
            ) : (
              currentSession.messages.map((msg, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-4 items-start animate-in slide-in-from-bottom-2 duration-300",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 border",
                    msg.role === "user" 
                      ? "bg-indigo-100 border-indigo-200 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400" 
                      : "bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400"
                  )}>
                    {msg.role === "user" ? <User size={20} strokeWidth={2.5} /> : <Bot size={20} strokeWidth={2.5} />}
                  </div>
                  
                  <div
                    className={cn(
                      "max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm relative group transition-all",
                      msg.role === "user"
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-tr-none hover:shadow-md border-0"
                        : "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-tl-none w-full overflow-hidden hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-800">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="AI 친구에게 메시지 보내기..."
                className="w-full p-4 pr-14 pl-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm group-hover:shadow-md placeholder:text-gray-400 text-base"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-white transition-all shadow-sm flex items-center justify-center",
                  !input.trim() || isLoading
                    ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-500 dark:text-gray-500"
                    : "bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-blue-500/20"
                )}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={18} strokeWidth={2.5} />
                )}
              </button>
            </form>
            <p className="text-xs text-center text-gray-400 mt-3 font-medium">
              AI는 실수를 할 수 있습니다. 중요한 정보는 확인이 필요합니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
