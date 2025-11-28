import { GoogleGenAI, FunctionCallingConfigMode, Type } from "@google/genai";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import { MCPTool } from "@/lib/mcp/types";

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenAI({ apiKey });

// MCP Tool 스키마를 Gemini Function Declaration으로 변환
function convertMCPToolToFunctionDeclaration(
  tool: MCPTool,
  serverId: string,
  serverName: string
) {
  // inputSchema의 properties를 Gemini Type으로 변환
  const inputSchema = tool.inputSchema || {};
  const properties = (inputSchema as Record<string, unknown>).properties as
    | Record<string, { type?: string; description?: string }>
    | undefined;
  const required = (inputSchema as Record<string, unknown>).required as
    | string[]
    | undefined;

  const convertedProperties: Record<string, unknown> = {};

  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const propType = value?.type?.toUpperCase() || "STRING";
      convertedProperties[key] = {
        type: Type[propType as keyof typeof Type] || Type.STRING,
        description: value?.description || "",
      };
    }
  }

  return {
    name: `${serverId}__${tool.name}`, // 서버 ID와 도구 이름 결합
    description: `[${serverName}] ${tool.description || tool.name}`,
    parameters: {
      type: Type.OBJECT,
      properties: convertedProperties,
      required: required || [],
    },
  };
}

// 모든 연결된 MCP 서버의 도구를 가져와 Function Declaration으로 변환
async function getMCPFunctionDeclarations() {
  const allTools = await mcpClientManager.getAllTools();
  const declarations = [];
  const toolMap: Record<string, { serverId: string; toolName: string }> = {};

  for (const { serverId, serverName, tools } of allTools) {
    for (const tool of tools) {
      const declaration = convertMCPToolToFunctionDeclaration(
        tool,
        serverId,
        serverName
      );
      declarations.push(declaration);
      toolMap[declaration.name] = { serverId, toolName: tool.name };
    }
  }

  return { declarations, toolMap };
}

// MCP 도구 호출 실행
async function executeMCPToolCall(
  functionName: string,
  args: Record<string, unknown>,
  toolMap: Record<string, { serverId: string; toolName: string }>
) {
  const toolInfo = toolMap[functionName];
  if (!toolInfo) {
    return { error: `Unknown tool: ${functionName}` };
  }

  const result = await mcpClientManager.callTool(
    toolInfo.serverId,
    toolInfo.toolName,
    args
  );

  if (result.success) {
    return result.result;
  } else {
    return { error: result.error };
  }
}

// 시스템 프롬프트 생성
function generateSystemPrompt(hasMCPTools: boolean, toolDescriptions: string[]) {
  let prompt = `당신은 친절하고 유능한 AI 어시스턴트입니다. 한국어로 대화하며, 정확하고 도움이 되는 정보를 제공합니다.`;
  
  if (hasMCPTools && toolDescriptions.length > 0) {
    prompt += `

중요: 당신은 다음과 같은 도구들에 접근할 수 있습니다:
${toolDescriptions.join('\n')}

다음 상황에서는 반드시 해당 도구를 사용하세요:
- 현재 시간, 날짜를 물어볼 때 → 시간 관련 도구 사용
- 타임존 변환이 필요할 때 → 시간 변환 도구 사용
- 실시간 정보가 필요한 질문에는 항상 관련 도구를 먼저 호출하세요

도구 호출 결과를 받은 후, 사용자에게 친절하고 자연스럽게 결과를 설명해주세요.
절대로 도구가 있는데도 추측하거나 과거 지식으로 대답하지 마세요.`;
  }
  
  return prompt;
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!apiKey) {
      return new Response("GEMINI_API_KEY is not set", { status: 500 });
    }

    // MCP 도구 가져오기
    const { declarations, toolMap } = await getMCPFunctionDeclarations();
    const hasMCPTools = declarations.length > 0;
    
    // 디버깅 로그
    console.log(`[Chat API] MCP Tools available: ${hasMCPTools}, count: ${declarations.length}`);
    if (declarations.length > 0) {
      console.log(`[Chat API] Tool declarations:`, declarations.map(d => d.name));
    }
    
    // 도구 설명 목록 생성
    const toolDescriptions = declarations.map(d => `- ${d.name}: ${d.description}`);
    
    // 시스템 프롬프트 생성
    const systemPrompt = generateSystemPrompt(hasMCPTools, toolDescriptions);

    // 메시지 변환 (시스템 프롬프트 포함)
    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model", 
        parts: [{ text: "네, 알겠습니다. 도구를 활용하여 정확한 정보를 제공하겠습니다." }],
      },
      ...messages.map(
        (m: { role: string; content: string; toolResults?: unknown[] }) => {
          if (m.role === "tool") {
            // 도구 결과 메시지
            return {
              role: "user",
              parts: [
                {
                  functionResponse: {
                    name: "tool_result",
                    response: { result: m.content },
                  },
                },
              ],
            };
          }
          return {
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          };
        }
      ),
    ];

    // MCP 도구가 있으면 Function Calling 사용, 없으면 일반 스트리밍
    if (hasMCPTools) {
      // Function Calling 모드
      let currentContents = contents;
      let finalResponse = "";
      let iterations = 0;
      const maxIterations = 5; // 무한 루프 방지
      
      // 도구 호출 정보 수집
      const toolCallsInfo: Array<{
        serverName: string;
        toolName: string;
        arguments: Record<string, unknown>;
        result: unknown;
      }> = [];

      // 서버 이름 맵 생성
      const allTools = await mcpClientManager.getAllTools();
      const serverNameMap: Record<string, string> = {};
      for (const { serverId, serverName } of allTools) {
        serverNameMap[serverId] = serverName;
      }

      while (iterations < maxIterations) {
        iterations++;

        console.log(`[Chat API] Iteration ${iterations}, sending request with ${declarations.length} tools`);
        
        const response = await client.models.generateContent({
          model: "gemini-2.0-flash-001",
          contents: currentContents,
          config: {
            tools: [{ functionDeclarations: declarations }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          },
        });

        console.log(`[Chat API] Response received, functionCalls:`, response.functionCalls?.length || 0);
        console.log(`[Chat API] Response text preview:`, response.text?.substring(0, 100));

        // Function Call 확인
        if (response.functionCalls && response.functionCalls.length > 0) {
          const functionResponses = [];

          for (const call of response.functionCalls) {
            console.log(`[MCP] Calling tool: ${call.name}`, call.args);

            const result = await executeMCPToolCall(
              call.name || "",
              (call.args as Record<string, unknown>) || {},
              toolMap
            );

            console.log(`[MCP] Tool result:`, result);

            // 도구 호출 정보 저장
            const toolInfo = toolMap[call.name || ""];
            if (toolInfo) {
              toolCallsInfo.push({
                serverName: serverNameMap[toolInfo.serverId] || toolInfo.serverId,
                toolName: toolInfo.toolName,
                arguments: (call.args as Record<string, unknown>) || {},
                result: result,
              });
            }

            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { result: JSON.stringify(result) },
              },
            });
          }

          // 도구 응답 추가
          currentContents = [
            ...currentContents,
            {
              role: "model",
              parts: response.functionCalls.map((call) => ({
                functionCall: {
                  name: call.name,
                  args: call.args,
                },
              })),
            },
            {
              role: "user",
              parts: functionResponses,
            },
          ];
        } else {
          // 최종 텍스트 응답
          finalResponse = response.text || "";
          break;
        }
      }

      // 도구 호출 정보가 있으면 JSON 형식으로 응답
      if (toolCallsInfo.length > 0) {
        const responseData = {
          content: finalResponse,
          toolCalls: toolCallsInfo,
        };
        
        return new Response(JSON.stringify(responseData), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }

      // 도구 호출이 없으면 일반 텍스트 응답
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(finalResponse));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    } else {
      // MCP 도구 없음 - 일반 스트리밍 응답
      const response = await client.models.generateContentStream({
        model: "gemini-2.0-flash-001",
        contents: contents,
      });

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of response) {
              const text = chunk.text;
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  } catch (error) {
    console.error("Error generating content:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
