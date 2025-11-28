import { supabase } from './supabase';

// MCP 도구 호출 정보
export interface ToolCallInfo {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

// 기존 인터페이스 유지
export interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  images?: string[]; // Storage에 저장된 이미지 URL 배열
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

// DB 테이블 타입
interface DbChatSession {
  id: string;
  title: string;
  created_at: number;
  updated_at: string;
}

interface DbMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  order_index: number;
  created_at: string;
  tool_calls?: ToolCallInfo[] | null;
  images?: string[] | null;
}

// 모든 세션 조회 (메시지 포함)
export async function getSessions(): Promise<ChatSession[]> {
  const { data: sessions, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching sessions:', sessionsError);
    return [];
  }

  if (!sessions || sessions.length === 0) {
    return [];
  }

  // 모든 메시지 조회
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .in('session_id', sessions.map(s => s.id))
    .order('order_index', { ascending: true });

  if (messagesError) {
    console.error('Error fetching messages:', messagesError);
  }

  // 세션별로 메시지 그룹화
  const messagesBySession = (messages || []).reduce((acc, msg: DbMessage) => {
    if (!acc[msg.session_id]) {
      acc[msg.session_id] = [];
    }
    const message: Message = {
      role: msg.role as "user" | "assistant",
      content: msg.content,
    };
    // tool_calls가 있으면 추가
    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      message.toolCalls = msg.tool_calls;
    }
    // images가 있으면 추가
    if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
      message.images = msg.images;
    }
    acc[msg.session_id].push(message);
    return acc;
  }, {} as Record<string, Message[]>);

  // ChatSession 형태로 변환
  return sessions.map((session: DbChatSession) => ({
    id: session.id,
    title: session.title,
    messages: messagesBySession[session.id] || [],
    createdAt: session.created_at,
  }));
}

// 새 세션 생성
export async function createSession(session: ChatSession): Promise<ChatSession | null> {
  const { error: sessionError } = await supabase
    .from('chat_sessions')
    .insert({
      id: session.id,
      title: session.title,
      created_at: session.createdAt,
    });

  if (sessionError) {
    console.error('Error creating session:', sessionError);
    return null;
  }

  return session;
}

// 세션 업데이트 (제목 및 메시지)
export async function updateSession(session: ChatSession): Promise<boolean> {
  // 세션 제목 업데이트
  const { error: sessionError } = await supabase
    .from('chat_sessions')
    .update({
      title: session.title,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (sessionError) {
    console.error('Error updating session:', sessionError);
    return false;
  }

  // 기존 메시지 삭제 후 새로 삽입 (간단한 동기화)
  const { error: deleteError } = await supabase
    .from('messages')
    .delete()
    .eq('session_id', session.id);

  if (deleteError) {
    console.error('Error deleting messages:', deleteError);
    return false;
  }

  if (session.messages.length > 0) {
    const messagesToInsert = session.messages.map((msg, index) => {
      const msgData: Record<string, unknown> = {
        session_id: session.id,
        role: msg.role,
        content: msg.content,
        order_index: index,
      };
      // toolCalls가 있으면 추가
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msgData.tool_calls = msg.toolCalls;
      }
      // images가 있으면 추가
      if (msg.images && msg.images.length > 0) {
        msgData.images = msg.images;
      }
      return msgData;
    });

    const { error: insertError } = await supabase
      .from('messages')
      .insert(messagesToInsert);

    if (insertError) {
      console.error('Error inserting messages:', insertError);
      return false;
    }
  }

  return true;
}

// 메시지 추가 (성능 최적화된 버전)
export async function addMessage(sessionId: string, message: Message, orderIndex: number): Promise<boolean> {
  const insertData: Record<string, unknown> = {
    session_id: sessionId,
    role: message.role,
    content: message.content,
    order_index: orderIndex,
  };
  
  // toolCalls가 있으면 추가
  if (message.toolCalls && message.toolCalls.length > 0) {
    insertData.tool_calls = message.toolCalls;
  }
  
  // images가 있으면 추가
  if (message.images && message.images.length > 0) {
    insertData.images = message.images;
  }

  const { error } = await supabase
    .from('messages')
    .insert(insertData);

  if (error) {
    console.error('Error adding message:', error);
    return false;
  }

  return true;
}

// 마지막 메시지 업데이트 (스트리밍용)
export async function updateLastMessage(
  sessionId: string, 
  content: string, 
  orderIndex: number, 
  toolCalls?: ToolCallInfo[],
  images?: string[]
): Promise<boolean> {
  const updateData: Record<string, unknown> = { content };
  
  // toolCalls가 있으면 추가
  if (toolCalls && toolCalls.length > 0) {
    updateData.tool_calls = toolCalls;
  }
  
  // images가 있으면 추가
  if (images && images.length > 0) {
    updateData.images = images;
  }

  const { error } = await supabase
    .from('messages')
    .update(updateData)
    .eq('session_id', sessionId)
    .eq('order_index', orderIndex);

  if (error) {
    console.error('Error updating message:', error);
    return false;
  }

  return true;
}

// 세션 제목 업데이트
export async function updateSessionTitle(sessionId: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating session title:', error);
    return false;
  }

  return true;
}

// 세션 삭제
export async function deleteSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('Error deleting session:', error);
    return false;
  }

  return true;
}

// Local Storage에서 DB로 마이그레이션
export async function migrateFromLocalStorage(): Promise<ChatSession[]> {
  const savedSessions = localStorage.getItem("chat-sessions");
  const legacyHistory = localStorage.getItem("chat-history");

  let sessionsToMigrate: ChatSession[] = [];

  if (savedSessions) {
    try {
      const parsedSessions = JSON.parse(savedSessions);
      if (Array.isArray(parsedSessions) && parsedSessions.length > 0) {
        sessionsToMigrate = parsedSessions;
      }
    } catch (e) {
      console.error("Failed to parse sessions from localStorage", e);
    }
  } else if (legacyHistory) {
    try {
      const messages = JSON.parse(legacyHistory);
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: messages.length > 0 ? messages[0].content.slice(0, 30) + "..." : "새로운 대화",
        messages,
        createdAt: Date.now(),
      };
      sessionsToMigrate = [newSession];
    } catch (e) {
      console.error("Failed to parse legacy history", e);
    }
  }

  if (sessionsToMigrate.length === 0) {
    return [];
  }

  // DB에 마이그레이션
  for (const session of sessionsToMigrate) {
    // 세션 생성
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        id: session.id,
        title: session.title,
        created_at: session.createdAt,
      });

    if (sessionError) {
      // 이미 존재하는 경우 건너뛰기
      if (sessionError.code === '23505') {
        console.log(`Session ${session.id} already exists, skipping`);
        continue;
      }
      console.error('Error migrating session:', sessionError);
      continue;
    }

    // 메시지 생성
    if (session.messages.length > 0) {
      const messagesToInsert = session.messages.map((msg, index) => {
        const msgData: Record<string, unknown> = {
          session_id: session.id,
          role: msg.role,
          content: msg.content,
          order_index: index,
        };
        // toolCalls가 있으면 추가
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msgData.tool_calls = msg.toolCalls;
        }
        // images가 있으면 추가
        if (msg.images && msg.images.length > 0) {
          msgData.images = msg.images;
        }
        return msgData;
      });

      const { error: messagesError } = await supabase
        .from('messages')
        .insert(messagesToInsert);

      if (messagesError) {
        console.error('Error migrating messages:', messagesError);
      }
    }
  }

  // 마이그레이션 완료 후 localStorage 클리어
  localStorage.removeItem("chat-sessions");
  localStorage.removeItem("chat-history");

  return sessionsToMigrate;
}

// Local Storage에 데이터가 있는지 확인
export function hasLocalStorageData(): boolean {
  return !!(localStorage.getItem("chat-sessions") || localStorage.getItem("chat-history"));
}

