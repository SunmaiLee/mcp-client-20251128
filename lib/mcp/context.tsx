"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  MCPServerConfig,
  ConnectionStatus,
  MCPTool,
  MCPPrompt,
  MCPResource,
  ConnectResponse,
  DisconnectResponse,
  ListResponse,
  ExecuteToolResponse,
  GetPromptResponse,
  ReadResourceResponse,
} from './types';

// localStorage 키
const STORAGE_KEY = 'mcp-servers';
const CONNECTED_SERVERS_KEY = 'mcp-connected-servers';

interface MCPServerState {
  config: MCPServerConfig;
  status: ConnectionStatus;
  error?: string;
}

interface MCPContextType {
  // 서버 상태
  servers: MCPServerState[];
  
  // 서버 관리
  addServer: (config: MCPServerConfig) => void;
  removeServer: (serverId: string) => void;
  updateServer: (config: MCPServerConfig) => void;
  
  // 연결 관리
  connectServer: (serverId: string) => Promise<boolean>;
  disconnectServer: (serverId: string) => Promise<boolean>;
  
  // 기능 조회
  listTools: (serverId: string) => Promise<MCPTool[]>;
  listPrompts: (serverId: string) => Promise<MCPPrompt[]>;
  listResources: (serverId: string) => Promise<MCPResource[]>;
  
  // 기능 실행
  executeTool: (serverId: string, toolName: string, args?: Record<string, unknown>) => Promise<unknown>;
  getPrompt: (serverId: string, promptName: string, args?: Record<string, string>) => Promise<unknown>;
  readResource: (serverId: string, uri: string) => Promise<unknown>;
  
  // Import/Export
  exportConfig: () => string;
  importConfig: (jsonString: string) => boolean;
  
  // 연결된 서버 수
  connectedCount: number;
  
  // 상태 동기화
  syncStatus: () => Promise<void>;
}

const MCPContext = createContext<MCPContextType | null>(null);

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<MCPServerState[]>([]);

  // 서버 자동 재연결 함수
  const reconnectServer = useCallback(async (config: MCPServerConfig): Promise<boolean> => {
    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const result = await response.json();
      return result.success;
    } catch {
      return false;
    }
  }, []);

  // localStorage에서 서버 설정 로드 및 자동 재연결
  useEffect(() => {
    const initializeServers = async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedConnected = localStorage.getItem(CONNECTED_SERVERS_KEY);
      
      if (saved) {
        try {
          const configs: MCPServerConfig[] = JSON.parse(saved);
          const previouslyConnected: string[] = savedConnected ? JSON.parse(savedConnected) : [];
          
          // 먼저 모든 서버를 disconnected 상태로 설정
          setServers(configs.map(config => ({
            config,
            status: 'disconnected' as ConnectionStatus,
          })));
          
          // 서버 측 현재 연결 상태 확인
          try {
            const response = await fetch('/api/mcp/status');
            const result = await response.json();
            
            const serverConnectedIds = new Set(
              result.servers?.filter((s: { status: string }) => s.status === 'connected').map((s: { id: string }) => s.id) || []
            );
            
            // 이미 연결된 서버는 상태만 업데이트, 아닌 서버는 재연결 시도
            for (const config of configs) {
              if (serverConnectedIds.has(config.id)) {
                // 이미 서버 측에서 연결됨
                setServers(prev => prev.map(s => 
                  s.config.id === config.id ? { ...s, status: 'connected' } : s
                ));
              } else if (previouslyConnected.includes(config.id)) {
                // 이전에 연결되어 있었으면 자동 재연결 시도
                console.log(`[MCP] Auto-reconnecting server: ${config.name}`);
                setServers(prev => prev.map(s => 
                  s.config.id === config.id ? { ...s, status: 'connecting' } : s
                ));
                
                const success = await reconnectServer(config);
                setServers(prev => prev.map(s => 
                  s.config.id === config.id 
                    ? { ...s, status: success ? 'connected' : 'disconnected' } 
                    : s
                ));
                
                if (success) {
                  console.log(`[MCP] Auto-reconnected: ${config.name}`);
                } else {
                  console.log(`[MCP] Auto-reconnect failed: ${config.name}`);
                }
              }
            }
          } catch (syncError) {
            console.log('Server status sync error, trying reconnect:', syncError);
            
            // API 에러 시에도 이전 연결된 서버는 재연결 시도
            for (const config of configs) {
              if (previouslyConnected.includes(config.id)) {
                console.log(`[MCP] Auto-reconnecting server: ${config.name}`);
                setServers(prev => prev.map(s => 
                  s.config.id === config.id ? { ...s, status: 'connecting' } : s
                ));
                
                const success = await reconnectServer(config);
                setServers(prev => prev.map(s => 
                  s.config.id === config.id 
                    ? { ...s, status: success ? 'connected' : 'disconnected' } 
                    : s
                ));
              }
            }
          }
        } catch (e) {
          console.error('Failed to load MCP servers from localStorage:', e);
        }
      }
    };
    
    initializeServers();
  }, [reconnectServer]);

  // localStorage에 서버 설정 저장
  const saveToStorage = useCallback((serverStates: MCPServerState[]) => {
    const configs = serverStates.map(s => s.config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  }, []);

  // 연결된 서버 목록 저장
  const saveConnectedServers = useCallback((serverStates: MCPServerState[]) => {
    const connectedIds = serverStates
      .filter(s => s.status === 'connected')
      .map(s => s.config.id);
    localStorage.setItem(CONNECTED_SERVERS_KEY, JSON.stringify(connectedIds));
  }, []);

  // 서버 추가
  const addServer = useCallback((config: MCPServerConfig) => {
    setServers(prev => {
      const newServers = [...prev, { config, status: 'disconnected' as ConnectionStatus }];
      saveToStorage(newServers);
      return newServers;
    });
  }, [saveToStorage]);

  // 서버 삭제
  const removeServer = useCallback((serverId: string) => {
    setServers(prev => {
      const newServers = prev.filter(s => s.config.id !== serverId);
      saveToStorage(newServers);
      return newServers;
    });
  }, [saveToStorage]);

  // 서버 업데이트
  const updateServer = useCallback((config: MCPServerConfig) => {
    setServers(prev => {
      const newServers = prev.map(s => 
        s.config.id === config.id ? { ...s, config } : s
      );
      saveToStorage(newServers);
      return newServers;
    });
  }, [saveToStorage]);

  // 서버 연결
  const connectServer = useCallback(async (serverId: string): Promise<boolean> => {
    const server = servers.find(s => s.config.id === serverId);
    if (!server) return false;

    // 상태 업데이트: connecting
    setServers(prev => prev.map(s => 
      s.config.id === serverId ? { ...s, status: 'connecting' as ConnectionStatus, error: undefined } : s
    ));

    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: server.config }),
      });

      const result: ConnectResponse = await response.json();

      setServers(prev => {
        const newServers = prev.map(s => 
          s.config.id === serverId 
            ? { ...s, status: result.success ? 'connected' as ConnectionStatus : 'error' as ConnectionStatus, error: result.error } 
            : s
        );
        // 연결 성공 시 연결 상태 저장
        if (result.success) {
          saveConnectedServers(newServers);
        }
        return newServers;
      });

      return result.success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setServers(prev => prev.map(s => 
        s.config.id === serverId ? { ...s, status: 'error', error: errorMessage } : s
      ));
      return false;
    }
  }, [servers, saveConnectedServers]);

  // 서버 연결 해제
  const disconnectServer = useCallback(async (serverId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/mcp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });

      const result: DisconnectResponse = await response.json();

      if (result.success) {
        setServers(prev => {
          const newServers = prev.map(s => 
            s.config.id === serverId ? { ...s, status: 'disconnected' as ConnectionStatus, error: undefined } : s
          );
          // 연결 해제 시 연결 상태 저장
          saveConnectedServers(newServers);
          return newServers;
        });
      }

      return result.success;
    } catch (error) {
      console.error('Disconnect error:', error);
      return false;
    }
  }, [saveConnectedServers]);

  // Tools 조회
  const listTools = useCallback(async (serverId: string): Promise<MCPTool[]> => {
    try {
      const response = await fetch('/api/mcp/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, type: 'tools' }),
      });

      const result: ListResponse = await response.json();
      return result.success ? (result.data as MCPTool[]) || [] : [];
    } catch (error) {
      console.error('List tools error:', error);
      return [];
    }
  }, []);

  // Prompts 조회
  const listPrompts = useCallback(async (serverId: string): Promise<MCPPrompt[]> => {
    try {
      const response = await fetch('/api/mcp/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, type: 'prompts' }),
      });

      const result: ListResponse = await response.json();
      return result.success ? (result.data as MCPPrompt[]) || [] : [];
    } catch (error) {
      console.error('List prompts error:', error);
      return [];
    }
  }, []);

  // Resources 조회
  const listResources = useCallback(async (serverId: string): Promise<MCPResource[]> => {
    try {
      const response = await fetch('/api/mcp/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, type: 'resources' }),
      });

      const result: ListResponse = await response.json();
      return result.success ? (result.data as MCPResource[]) || [] : [];
    } catch (error) {
      console.error('List resources error:', error);
      return [];
    }
  }, []);

  // Tool 실행
  const executeTool = useCallback(async (
    serverId: string, 
    toolName: string, 
    args?: Record<string, unknown>
  ): Promise<unknown> => {
    try {
      const response = await fetch('/api/mcp/execute?action=tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, toolName, arguments: args }),
      });

      const result: ExecuteToolResponse = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.result;
    } catch (error) {
      console.error('Execute tool error:', error);
      throw error;
    }
  }, []);

  // Prompt 가져오기
  const getPrompt = useCallback(async (
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<unknown> => {
    try {
      const response = await fetch('/api/mcp/execute?action=prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, promptName, arguments: args }),
      });

      const result: GetPromptResponse = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.messages;
    } catch (error) {
      console.error('Get prompt error:', error);
      throw error;
    }
  }, []);

  // Resource 읽기
  const readResource = useCallback(async (serverId: string, uri: string): Promise<unknown> => {
    try {
      const response = await fetch('/api/mcp/execute?action=resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, uri }),
      });

      const result: ReadResourceResponse = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.contents;
    } catch (error) {
      console.error('Read resource error:', error);
      throw error;
    }
  }, []);

  // 설정 내보내기
  const exportConfig = useCallback((): string => {
    const configs = servers.map(s => s.config);
    return JSON.stringify(configs, null, 2);
  }, [servers]);

  // 설정 가져오기
  const importConfig = useCallback((jsonString: string): boolean => {
    try {
      const configs: MCPServerConfig[] = JSON.parse(jsonString);
      if (!Array.isArray(configs)) return false;
      
      const newServers = configs.map(config => ({
        config,
        status: 'disconnected' as ConnectionStatus,
      }));
      
      setServers(newServers);
      saveToStorage(newServers);
      return true;
    } catch (e) {
      console.error('Failed to import config:', e);
      return false;
    }
  }, [saveToStorage]);

  // 서버 상태 동기화
  const syncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/mcp/status');
      const result = await response.json();
      
      if (result.servers) {
        setServers(prev => prev.map(s => {
          const serverStatus = result.servers.find((rs: { id: string; status: ConnectionStatus }) => rs.id === s.config.id);
          return serverStatus 
            ? { ...s, status: serverStatus.status }
            : { ...s, status: 'disconnected' };
        }));
      }
    } catch (error) {
      console.error('Sync status error:', error);
    }
  }, []);

  // 연결된 서버 수
  const connectedCount = servers.filter(s => s.status === 'connected').length;

  const value: MCPContextType = {
    servers,
    addServer,
    removeServer,
    updateServer,
    connectServer,
    disconnectServer,
    listTools,
    listPrompts,
    listResources,
    executeTool,
    getPrompt,
    readResource,
    exportConfig,
    importConfig,
    connectedCount,
    syncStatus,
  };

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (!context) {
    throw new Error('useMCP must be used within an MCPProvider');
  }
  return context;
}

