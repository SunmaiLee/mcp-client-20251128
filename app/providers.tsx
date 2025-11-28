"use client";

import { MCPProvider } from "@/lib/mcp/context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <MCPProvider>{children}</MCPProvider>;
}

