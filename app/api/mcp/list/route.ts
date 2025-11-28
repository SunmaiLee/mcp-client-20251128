import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';
import { ListRequest, ListResponse } from '@/lib/mcp/types';

export async function POST(req: NextRequest) {
  try {
    const body: ListRequest = await req.json();
    const { serverId, type } = body;

    if (!serverId || !type) {
      return NextResponse.json<ListResponse>(
        { success: false, error: 'Server ID and type are required' },
        { status: 400 }
      );
    }

    let result;
    switch (type) {
      case 'tools':
        result = await mcpClientManager.listTools(serverId);
        break;
      case 'prompts':
        result = await mcpClientManager.listPrompts(serverId);
        break;
      case 'resources':
        result = await mcpClientManager.listResources(serverId);
        break;
      default:
        return NextResponse.json<ListResponse>(
          { success: false, error: 'Invalid type. Must be tools, prompts, or resources' },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json<ListResponse>({
        success: true,
        data: result.tools || result.prompts || result.resources,
      });
    } else {
      return NextResponse.json<ListResponse>(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ListResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

