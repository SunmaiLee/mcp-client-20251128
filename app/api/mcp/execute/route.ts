import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';
import {
  ExecuteToolRequest,
  ExecuteToolResponse,
  GetPromptRequest,
  GetPromptResponse,
  ReadResourceRequest,
  ReadResourceResponse,
} from '@/lib/mcp/types';

// Tool 실행
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const body = await req.json();

    switch (action) {
      case 'tool': {
        const { serverId, toolName, arguments: args } = body as ExecuteToolRequest;

        if (!serverId || !toolName) {
          return NextResponse.json<ExecuteToolResponse>(
            { success: false, error: 'Server ID and tool name are required' },
            { status: 400 }
          );
        }

        const result = await mcpClientManager.callTool(serverId, toolName, args);
        
        if (result.success) {
          return NextResponse.json<ExecuteToolResponse>({
            success: true,
            result: result.result,
          });
        } else {
          return NextResponse.json<ExecuteToolResponse>(
            { success: false, error: result.error },
            { status: 500 }
          );
        }
      }

      case 'prompt': {
        const { serverId, promptName, arguments: args } = body as GetPromptRequest;

        if (!serverId || !promptName) {
          return NextResponse.json<GetPromptResponse>(
            { success: false, error: 'Server ID and prompt name are required' },
            { status: 400 }
          );
        }

        const result = await mcpClientManager.getPrompt(serverId, promptName, args);
        
        if (result.success) {
          return NextResponse.json<GetPromptResponse>({
            success: true,
            messages: result.messages as GetPromptResponse['messages'],
          });
        } else {
          return NextResponse.json<GetPromptResponse>(
            { success: false, error: result.error },
            { status: 500 }
          );
        }
      }

      case 'resource': {
        const { serverId, uri } = body as ReadResourceRequest;

        if (!serverId || !uri) {
          return NextResponse.json<ReadResourceResponse>(
            { success: false, error: 'Server ID and URI are required' },
            { status: 400 }
          );
        }

        const result = await mcpClientManager.readResource(serverId, uri);
        
        if (result.success) {
          return NextResponse.json<ReadResourceResponse>({
            success: true,
            contents: result.contents as ReadResourceResponse['contents'],
          });
        } else {
          return NextResponse.json<ReadResourceResponse>(
            { success: false, error: result.error },
            { status: 500 }
          );
        }
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use ?action=tool|prompt|resource' },
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

