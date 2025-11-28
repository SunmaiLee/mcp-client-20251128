import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';
import { ConnectRequest, ConnectResponse } from '@/lib/mcp/types';

export async function POST(req: NextRequest) {
  try {
    const body: ConnectRequest = await req.json();
    const { config } = body;

    if (!config || !config.id || !config.name || !config.transport) {
      return NextResponse.json<ConnectResponse>(
        { success: false, serverId: '', error: 'Invalid server configuration' },
        { status: 400 }
      );
    }

    const result = await mcpClientManager.connect(config);

    if (result.success) {
      return NextResponse.json<ConnectResponse>({
        success: true,
        serverId: config.id,
      });
    } else {
      return NextResponse.json<ConnectResponse>(
        { success: false, serverId: config.id, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ConnectResponse>(
      { success: false, serverId: '', error: errorMessage },
      { status: 500 }
    );
  }
}

