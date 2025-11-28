"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, User, Bot, Plus, MessageSquare, Trash2, Menu, Sparkles, Server, Wrench, ChevronDown, ChevronUp, Code2, ArrowRight, Image as ImageIcon, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { useMCP } from "@/lib/mcp/context";
import Link from "next/link";
import {
  ChatSession,
  Message,
  ToolCallInfo,
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

// Base64 이미지 감지 및 추출 함수
interface ImageData {
  base64: string;
  mimeType: string;
}

function extractBase64Images(result: unknown): ImageData[] {
  const images: ImageData[] = [];
  
  const checkValue = (value: unknown) => {
    if (typeof value === 'string') {
      // data:image/... 형식 체크
      const dataUrlMatch = value.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (dataUrlMatch) {
        images.push({ mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] });
        return;
      }
      
      // 순수 base64 문자열 체크 (긴 문자열이면서 base64 패턴)
      if (value.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(value.slice(0, 100))) {
        // PNG 시그니처: iVBORw0KGgo
        if (value.startsWith('iVBORw0KGgo')) {
          images.push({ mimeType: 'image/png', base64: value });
          return;
        }
        // JPEG 시그니처: /9j/
        if (value.startsWith('/9j/')) {
          images.push({ mimeType: 'image/jpeg', base64: value });
          return;
        }
        // GIF 시그니처: R0lGOD
        if (value.startsWith('R0lGOD')) {
          images.push({ mimeType: 'image/gif', base64: value });
          return;
        }
        // WebP 시그니처: UklGR
        if (value.startsWith('UklGR')) {
          images.push({ mimeType: 'image/webp', base64: value });
          return;
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(checkValue);
    } else if (value && typeof value === 'object') {
      // MCP 표준 이미지 응답 형식 체크
      const obj = value as Record<string, unknown>;
      if (obj.type === 'image' && typeof obj.data === 'string') {
        const mimeType = typeof obj.mimeType === 'string' ? obj.mimeType : 'image/png';
        images.push({ mimeType, base64: obj.data });
        return;
      }
      // content 배열 안의 이미지 체크 (MCP 표준)
      if (Array.isArray(obj.content)) {
        obj.content.forEach((item: unknown) => {
          if (item && typeof item === 'object') {
            const contentItem = item as Record<string, unknown>;
            if (contentItem.type === 'image' && typeof contentItem.data === 'string') {
              const mimeType = typeof contentItem.mimeType === 'string' ? contentItem.mimeType : 'image/png';
              images.push({ mimeType, base64: contentItem.data });
            }
          }
        });
        return;
      }
      Object.values(obj).forEach(checkValue);
    }
  };
  
  // JSON 문자열인 경우 파싱
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      checkValue(parsed);
    } catch {
      checkValue(result);
    }
  } else {
    checkValue(result);
  }
  
  return images;
}

// 이미지 다운로드 함수 (base64용)
function downloadBase64Image(base64: string, mimeType: string, filename: string) {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// URL 이미지 다운로드 함수
async function downloadUrlImage(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    // 폴백: 새 탭에서 열기
    window.open(url, '_blank');
  }
}

// 이미지 결과 표시 컴포넌트 (base64용)
function ImageResultDisplay({ images, toolName }: { images: ImageData[], toolName: string }) {
  return (
    <div className="space-y-3">
      {images.map((img, idx) => (
        <div key={idx} className="relative group">
          <div className="rounded-xl overflow-hidden border-2 border-pink-200 dark:border-pink-800/50 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 p-2">
            <div className="flex items-center gap-2 mb-2 text-xs text-pink-600 dark:text-pink-400">
              <ImageIcon size={14} />
              <span className="font-medium">생성된 이미지 {images.length > 1 ? `(${idx + 1}/${images.length})` : ''}</span>
            </div>
            <img
              src={`data:${img.mimeType};base64,${img.base64}`}
              alt={`Generated by ${toolName}`}
              className="w-full max-w-lg rounded-lg shadow-lg mx-auto"
              style={{ maxHeight: '400px', objectFit: 'contain' }}
            />
            <div className="flex justify-center mt-2">
              <button
                onClick={() => downloadBase64Image(img.base64, img.mimeType, `${toolName}-${Date.now()}.${img.mimeType.split('/')[1]}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/30 hover:bg-pink-200 dark:hover:bg-pink-800/40 rounded-lg transition-colors"
              >
                <Download size={14} />
                다운로드
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// URL 이미지 표시 컴포넌트 (Storage URL용)
function UrlImageDisplay({ urls }: { urls: string[] }) {
  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2 text-xs font-medium text-pink-600 dark:text-pink-400">
        <ImageIcon size={14} />
        <span>생성된 이미지 ({urls.length}개)</span>
      </div>
      {urls.map((url, idx) => (
        <div key={idx} className="relative group">
          <div className="rounded-xl overflow-hidden border-2 border-pink-200 dark:border-pink-800/50 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 p-2">
            <img
              src={url}
              alt={`Generated image ${idx + 1}`}
              className="w-full max-w-lg rounded-lg shadow-lg mx-auto"
              style={{ maxHeight: '400px', objectFit: 'contain' }}
            />
            <div className="flex justify-center mt-2">
              <button
                onClick={() => downloadUrlImage(url, `image-${Date.now()}-${idx}.png`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/30 hover:bg-pink-200 dark:hover:bg-pink-800/40 rounded-lg transition-colors"
              >
                <Download size={14} />
                다운로드
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// AI 응답 생성 중 로딩 인디케이터
function LoadingIndicator() {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex gap-4 items-start animate-in slide-in-from-bottom-2 duration-300">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 border bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400">
        <Bot size={20} strokeWidth={2.5} />
      </div>
      
      <div className="max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-tl-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-gray-600 dark:text-gray-300 font-medium">
              AI가 답변을 생성하고 있습니다{dots}
            </span>
          </div>
        </div>
        
        {/* 로딩 애니메이션 바 */}
        <div className="mt-3 space-y-2">
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full animate-pulse" 
                 style={{ width: '60%', animation: 'loading-bar 1.5s ease-in-out infinite' }} />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>MCP 도구를 사용하는 경우 더 오래 걸릴 수 있습니다</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// MCP 도구 호출 정보 표시 컴포넌트
function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const formatResult = (result: unknown): string => {
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return result;
      }
    }
    return JSON.stringify(result, null, 2);
  };

  // 결과에서 이미지 제외한 나머지 데이터 표시
  const formatResultWithoutImages = (result: unknown): string => {
    const sanitize = (value: unknown): unknown => {
      if (typeof value === 'string') {
        // 긴 base64 문자열 감지 및 대체
        if (value.length > 200 && /^[A-Za-z0-9+/]+=*$/.test(value.slice(0, 100))) {
          return '[Base64 이미지 데이터]';
        }
        if (value.startsWith('data:image/')) {
          return '[Base64 이미지 데이터]';
        }
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(sanitize);
      }
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.type === 'image' && obj.data) {
          return { ...obj, data: '[Base64 이미지 데이터]' };
        }
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          result[k] = sanitize(v);
        }
        return result;
      }
      return value;
    };
    
    let parsed = result;
    if (typeof result === 'string') {
      try {
        parsed = JSON.parse(result);
      } catch {
        parsed = result;
      }
    }
    
    return JSON.stringify(sanitize(parsed), null, 2);
  };

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-violet-600 dark:text-violet-400 mb-2">
        <Wrench size={14} />
        <span>MCP 도구 호출 ({toolCalls.length}개)</span>
      </div>
      {toolCalls.map((call, index) => {
        const images = extractBase64Images(call.result);
        const hasImages = images.length > 0;
        
        return (
          <div 
            key={index} 
            className={cn(
              "rounded-xl border overflow-hidden",
              hasImages 
                ? "border-pink-200 dark:border-pink-800/50 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20"
                : "border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20"
            )}
          >
            {/* Header - 항상 표시 */}
            <button
              onClick={() => toggleExpand(index)}
              className={cn(
                "w-full flex items-center justify-between p-3 transition-colors",
                hasImages 
                  ? "hover:bg-pink-100/50 dark:hover:bg-pink-800/20"
                  : "hover:bg-violet-100/50 dark:hover:bg-violet-800/20"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  hasImages 
                    ? "bg-pink-500/10 dark:bg-pink-500/20"
                    : "bg-violet-500/10 dark:bg-violet-500/20"
                )}>
                  {hasImages ? (
                    <ImageIcon size={16} className="text-pink-600 dark:text-pink-400" />
                  ) : (
                    <Code2 size={16} className="text-violet-600 dark:text-violet-400" />
                  )}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-semibold",
                      hasImages 
                        ? "text-pink-700 dark:text-pink-300"
                        : "text-violet-700 dark:text-violet-300"
                    )}>
                      {call.toolName}
                    </span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      hasImages
                        ? "bg-pink-200/50 dark:bg-pink-700/30 text-pink-600 dark:text-pink-400"
                        : "bg-violet-200/50 dark:bg-violet-700/30 text-violet-600 dark:text-violet-400"
                    )}>
                      {call.serverName}
                    </span>
                    {hasImages && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500 text-white font-medium">
                        🖼️ 이미지
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                    {Object.entries(call.arguments || {}).length > 0 ? (
                      <>
                        <span className={hasImages ? "text-pink-500" : "text-violet-500"}>→</span>
                        {Object.entries(call.arguments).slice(0, 2).map(([key, value], i) => (
                          <span key={key}>
                            {i > 0 && ", "}
                            <span className="text-gray-600 dark:text-gray-300">{key}</span>
                            <span className="text-gray-400">=</span>
                            <span className="text-emerald-600 dark:text-emerald-400">&quot;{String(value).slice(0, 30)}{String(value).length > 30 ? '...' : ''}&quot;</span>
                          </span>
                        ))}
                        {Object.entries(call.arguments).length > 2 && <span>...</span>}
                      </>
                    ) : (
                      <span className="text-gray-400">매개변수 없음</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ 완료
                </span>
                {expandedIndex === index ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </div>
            </button>

            {/* 이미지가 있으면 항상 표시 */}
            {hasImages && (
              <div className="px-3 pb-3">
                <ImageResultDisplay images={images} toolName={call.toolName} />
              </div>
            )}

            {/* 확장된 상세 정보 */}
            {expandedIndex === index && (
              <div className={cn(
                "border-t p-3 space-y-3 bg-white/50 dark:bg-gray-900/50",
                hasImages 
                  ? "border-pink-200 dark:border-pink-800/50"
                  : "border-violet-200 dark:border-violet-800/50"
              )}>
                {/* 매개변수 */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    <ArrowRight size={12} />
                    <span>입력 매개변수</span>
                  </div>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 rounded-lg p-2.5 overflow-x-auto text-gray-700 dark:text-gray-300 font-mono">
                    {Object.keys(call.arguments || {}).length > 0 
                      ? JSON.stringify(call.arguments, null, 2)
                      : "{ }"}
                  </pre>
                </div>

                {/* 결과 */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">
                    <ArrowRight size={12} />
                    <span>결과값 {hasImages && '(이미지 데이터 제외)'}</span>
                  </div>
                  <pre className="text-xs bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-2.5 overflow-x-auto text-emerald-700 dark:text-emerald-300 font-mono max-h-48">
                    {hasImages ? formatResultWithoutImages(call.result) : formatResult(call.result)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
  
  // MCP 상태
  const { connectedCount, servers } = useMCP();

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

      const contentType = response.headers.get("Content-Type") || "";
      const assistantMessageIndex = currentMessageCount + 1;

      // JSON 응답인 경우 (MCP 도구 호출 정보 포함)
      if (contentType.includes("application/json")) {
        const jsonData = await response.json();
        
        // toolCalls에서 이미지 추출 및 Storage 업로드
        let uploadedImageUrls: string[] = [];
        if (jsonData.toolCalls && Array.isArray(jsonData.toolCalls)) {
          const allImages: Array<{ base64: string; mimeType: string }> = [];
          
          for (const toolCall of jsonData.toolCalls) {
            const images = extractBase64Images(toolCall.result);
            for (const img of images) {
              allImages.push(img);
            }
          }
          
          // 이미지가 있으면 Storage에 업로드
          if (allImages.length > 0) {
            try {
              const uploadResponse = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  images: allImages,
                  sessionId: currentSessionId,
                  messageIndex: assistantMessageIndex,
                }),
              });
              
              if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json();
                uploadedImageUrls = uploadResult.urls || [];
              }
            } catch (uploadError) {
              console.error('Failed to upload images:', uploadError);
            }
          }
        }
        
        const assistantMessage: Message = { 
          role: "assistant", 
          content: jsonData.content,
          toolCalls: jsonData.toolCalls,
          images: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
        };

        // Add assistant message to Supabase
        await addMessage(currentSessionId, assistantMessage, assistantMessageIndex);

        setSessions((prev) => prev.map(session => {
          if (session.id === currentSessionId) {
            return { ...session, messages: [...session.messages, assistantMessage] };
          }
          return session;
        }));
      } else {
        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage: Message = { role: "assistant", content: "" };

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
      }

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

          {/* MCP Status in Sidebar */}
          <Link
            href="/mcp"
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all border min-w-max",
              connectedCount > 0
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800"
            )}
          >
            <Server size={18} className={connectedCount > 0 ? "text-emerald-400" : "text-slate-500"} />
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">MCP 서버</div>
              <div className="text-xs opacity-70 truncate">
                {connectedCount > 0 
                  ? `${connectedCount}개 연결됨` 
                  : servers.length > 0 
                    ? `${servers.length}개 등록됨`
                    : "서버 없음"}
              </div>
            </div>
            {connectedCount > 0 && (
              <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                {connectedCount}
              </span>
            )}
          </Link>

          <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-center text-slate-500 min-w-max">
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
            {/* MCP Status */}
            <Link
              href="/mcp"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                connectedCount > 0
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              )}
              title="MCP 서버 관리"
            >
              <Server size={16} />
              <span className="hidden sm:inline">MCP</span>
              {connectedCount > 0 && (
                <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {connectedCount}
                </span>
              )}
            </Link>
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
                      <>
                        {/* MCP 도구 호출 정보 표시 */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <ToolCallsDisplay toolCalls={msg.toolCalls} />
                        )}
                        {/* Storage에 저장된 이미지 URL 표시 */}
                        {msg.images && msg.images.length > 0 && (
                          <UrlImageDisplay urls={msg.images} />
                        )}
                        <MarkdownRenderer content={msg.content} />
                      </>
                    ) : (
                      <div className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {/* 로딩 인디케이터 */}
            {isLoading && <LoadingIndicator />}
            
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
