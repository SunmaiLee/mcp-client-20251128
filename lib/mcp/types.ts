// MCP 서버 설정 타입 정의

export type TransportType = 'stdio' | 'http' | 'sse';

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpConfig {
  url: string;
}

export interface SseConfig {
  url: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: TransportType;
  config: StdioConfig | HttpConfig | SseConfig;
}

// MCP 서버 연결 상태
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPServerState {
  config: MCPServerConfig;
  status: ConnectionStatus;
  error?: string;
}

// MCP 기능 타입
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPCapabilities {
  tools: MCPTool[];
  prompts: MCPPrompt[];
  resources: MCPResource[];
}

// API 요청/응답 타입
export interface ConnectRequest {
  config: MCPServerConfig;
}

export interface ConnectResponse {
  success: boolean;
  serverId: string;
  error?: string;
}

export interface DisconnectRequest {
  serverId: string;
}

export interface DisconnectResponse {
  success: boolean;
  error?: string;
}

export interface ListRequest {
  serverId: string;
  type: 'tools' | 'prompts' | 'resources';
}

export interface ListResponse {
  success: boolean;
  data?: MCPTool[] | MCPPrompt[] | MCPResource[];
  error?: string;
}

export interface ExecuteToolRequest {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ExecuteToolResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface GetPromptRequest {
  serverId: string;
  promptName: string;
  arguments?: Record<string, string>;
}

export interface GetPromptResponse {
  success: boolean;
  messages?: Array<{
    role: string;
    content: { type: string; text?: string };
  }>;
  error?: string;
}

export interface ReadResourceRequest {
  serverId: string;
  uri: string;
}

export interface ReadResourceResponse {
  success: boolean;
  contents?: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
  error?: string;
}

// 모든 서버 상태 조회
export interface GetAllServersResponse {
  servers: Array<{
    id: string;
    status: ConnectionStatus;
  }>;
}

