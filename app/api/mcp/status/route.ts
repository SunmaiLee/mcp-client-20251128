import { NextResponse } from 'next/server';
import { mcpClientManager } from '@/lib/mcp/client-manager';
import { GetAllServersResponse } from '@/lib/mcp/types';

// 모든 서버 상태 조회
export async function GET() {
  try {
    const servers = mcpClientManager.getAllServers();
    
    return NextResponse.json<GetAllServersResponse>({
      servers: servers.map(s => ({
        id: s.id,
        status: s.status,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

