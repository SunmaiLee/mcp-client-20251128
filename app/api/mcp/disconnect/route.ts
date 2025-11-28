import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';
import { DisconnectRequest, DisconnectResponse } from '@/lib/mcp/types';

export async function POST(req: NextRequest) {
  try {
    const body: DisconnectRequest = await req.json();
    const { serverId } = body;

    if (!serverId) {
      return NextResponse.json<DisconnectResponse>(
        { success: false, error: 'Server ID is required' },
        { status: 400 }
      );
    }

    const result = await mcpClientManager.disconnect(serverId);

    if (result.success) {
      return NextResponse.json<DisconnectResponse>({ success: true });
    } else {
      return NextResponse.json<DisconnectResponse>(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<DisconnectResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

