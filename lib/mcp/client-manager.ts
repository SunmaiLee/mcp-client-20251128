import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  MCPServerConfig,
  ConnectionStatus,
  MCPTool,
  MCPPrompt,
  MCPResource,
  StdioConfig,
  HttpConfig,
  SseConfig,
} from './types';

interface ManagedClient {
  client: Client;
  config: MCPServerConfig;
  status: ConnectionStatus;
  error?: string;
}

/**
 * MCP Client 싱글톤 매니저
 * 서버 사이드에서 여러 MCP 서버 연결을 관리합니다.
 */
class MCPClientManager {
  private static instance: MCPClientManager;
  private clients: Map<string, ManagedClient> = new Map();

  private constructor() {}

  static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  /**
   * MCP 서버에 연결
   */
  async connect(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    // 이미 연결된 경우 먼저 연결 해제
    if (this.clients.has(config.id)) {
      await this.disconnect(config.id);
    }

    const managedClient: ManagedClient = {
      client: new Client({
        name: `mcp-client-${config.id}`,
        version: '1.0.0',
      }),
      config,
      status: 'connecting',
    };

    this.clients.set(config.id, managedClient);

    try {
      const transport = await this.createTransport(config);
      await managedClient.client.connect(transport);
      
      managedClient.status = 'connected';
      this.clients.set(config.id, managedClient);
      
      console.log(`[MCP] Connected to server: ${config.name} (${config.id})`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      managedClient.status = 'error';
      managedClient.error = errorMessage;
      this.clients.set(config.id, managedClient);
      
      console.error(`[MCP] Failed to connect to server: ${config.name}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Transport 생성
   */
  private async createTransport(config: MCPServerConfig) {
    switch (config.transport) {
      case 'stdio': {
        const stdioConfig = config.config as StdioConfig;
        return new StdioClientTransport({
          command: stdioConfig.command,
          args: stdioConfig.args,
          env: stdioConfig.env,
        });
      }
      case 'http': {
        const httpConfig = config.config as HttpConfig;
        return new StreamableHTTPClientTransport(new URL(httpConfig.url));
      }
      case 'sse': {
        const sseConfig = config.config as SseConfig;
        return new SSEClientTransport(new URL(sseConfig.url));
      }
      default:
        throw new Error(`Unsupported transport type: ${config.transport}`);
    }
  }

  /**
   * MCP 서버 연결 해제
   */
  async disconnect(serverId: string): Promise<{ success: boolean; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient) {
      return { success: false, error: 'Server not found' };
    }

    try {
      await managedClient.client.close();
      this.clients.delete(serverId);
      console.log(`[MCP] Disconnected from server: ${serverId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MCP] Failed to disconnect from server: ${serverId}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 서버 연결 상태 조회
   */
  getStatus(serverId: string): ConnectionStatus {
    const managedClient = this.clients.get(serverId);
    return managedClient?.status ?? 'disconnected';
  }

  /**
   * 모든 연결된 서버 상태 조회
   */
  getAllServers(): Array<{ id: string; status: ConnectionStatus; name: string }> {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      status: client.status,
      name: client.config.name,
    }));
  }

  /**
   * Tools 목록 조회
   */
  async listTools(serverId: string): Promise<{ success: boolean; tools?: MCPTool[]; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.listTools();
      const tools: MCPTool[] = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
      return { success: true, tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Prompts 목록 조회
   */
  async listPrompts(serverId: string): Promise<{ success: boolean; prompts?: MCPPrompt[]; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.listPrompts();
      const prompts: MCPPrompt[] = result.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
      }));
      return { success: true, prompts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Resources 목록 조회
   */
  async listResources(serverId: string): Promise<{ success: boolean; resources?: MCPResource[]; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.listResources();
      const resources: MCPResource[] = result.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
      return { success: true, resources };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Tool 실행
   */
  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.callTool({
        name: toolName,
        arguments: args,
      });
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Prompt 가져오기
   */
  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<{ success: boolean; messages?: unknown[]; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.getPrompt({
        name: promptName,
        arguments: args,
      });
      return { success: true, messages: result.messages };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Resource 읽기
   */
  async readResource(
    serverId: string,
    uri: string
  ): Promise<{ success: boolean; contents?: unknown[]; error?: string }> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status !== 'connected') {
      return { success: false, error: 'Server not connected' };
    }

    try {
      const result = await managedClient.client.readResource({ uri });
      return { success: true, contents: result.contents };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 연결된 모든 서버의 Tools 가져오기 (채팅용)
   */
  async getAllTools(): Promise<Array<{ serverId: string; serverName: string; tools: MCPTool[] }>> {
    const allTools: Array<{ serverId: string; serverName: string; tools: MCPTool[] }> = [];

    for (const [serverId, managedClient] of this.clients.entries()) {
      if (managedClient.status === 'connected') {
        const result = await this.listTools(serverId);
        if (result.success && result.tools) {
          allTools.push({
            serverId,
            serverName: managedClient.config.name,
            tools: result.tools,
          });
        }
      }
    }

    return allTools;
  }
}

// 싱글톤 인스턴스 export
export const mcpClientManager = MCPClientManager.getInstance();

