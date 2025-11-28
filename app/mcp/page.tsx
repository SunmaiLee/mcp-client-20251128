"use client";

import { useState, useEffect, useCallback } from "react";
import { useMCP } from "@/lib/mcp/context";
import {
  MCPServerConfig,
  TransportType,
  MCPTool,
  MCPPrompt,
  MCPResource,
  StdioConfig,
  HttpConfig,
} from "@/lib/mcp/types";
import {
  Server,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Wrench,
  MessageSquare,
  FileText,
  Play,
  Download,
  Upload,
  ArrowLeft,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Copy,
  Terminal,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type TabType = "tools" | "prompts" | "resources";

interface SelectedItem {
  type: "tool" | "prompt" | "resource";
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  promptArgs?: Array<{ name: string; description?: string; required?: boolean }>;
}

export default function MCPPage() {
  const {
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
    syncStatus,
  } = useMCP();

  // UI 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("tools");
  const [isLoading, setIsLoading] = useState(false);

  // 폼 상태
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<TransportType>("stdio");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnv, setFormEnv] = useState("");
  const [formUrl, setFormUrl] = useState("");

  // 기능 목록
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [prompts, setPrompts] = useState<MCPPrompt[]>([]);
  const [resources, setResources] = useState<MCPResource[]>([]);

  // 선택된 항목 및 실행 상태
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [executeInputs, setExecuteInputs] = useState<Record<string, string>>({});
  const [executeResult, setExecuteResult] = useState<unknown>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Import 모달
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  // Edit 모달
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);

  // 선택된 서버의 기능 로드
  const loadCapabilities = useCallback(async (serverId: string) => {
    setIsLoading(true);
    setSelectedItem(null);
    setExecuteInputs({});
    setExecuteResult(null);
    setExecuteError(null);
    try {
      const [toolsResult, promptsResult, resourcesResult] = await Promise.all([
        listTools(serverId),
        listPrompts(serverId),
        listResources(serverId),
      ]);
      setTools(toolsResult);
      setPrompts(promptsResult);
      setResources(resourcesResult);
    } catch (error) {
      console.error("Failed to load capabilities:", error);
    } finally {
      setIsLoading(false);
    }
  }, [listTools, listPrompts, listResources]);

  // 서버 선택 시 기능 로드
  useEffect(() => {
    if (selectedServerId) {
      const server = servers.find((s) => s.config.id === selectedServerId);
      if (server?.status === "connected") {
        loadCapabilities(selectedServerId);
      } else {
        setTools([]);
        setPrompts([]);
        setResources([]);
        setSelectedItem(null);
      }
    }
  }, [selectedServerId, servers, loadCapabilities]);

  // 탭 변경 시 선택 초기화
  useEffect(() => {
    setSelectedItem(null);
    setExecuteInputs({});
    setExecuteResult(null);
    setExecuteError(null);
  }, [activeTab]);

  // 서버 추가
  const handleAddServer = () => {
    if (!formName) return;

    const id = `server-${Date.now()}`;
    let config: MCPServerConfig;

    if (formTransport === "stdio") {
      const stdioConfig: StdioConfig = {
        command: formCommand,
        args: formArgs ? formArgs.split(" ") : undefined,
        env: formEnv ? JSON.parse(formEnv) : undefined,
      };
      config = { id, name: formName, transport: "stdio", config: stdioConfig };
    } else {
      const httpConfig: HttpConfig = { url: formUrl };
      config = { id, name: formName, transport: formTransport, config: httpConfig };
    }

    addServer(config);
    resetForm();
    setShowAddForm(false);
  };

  // 서버 수정 모달 열기
  const handleOpenEditModal = (server: MCPServerConfig) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormTransport(server.transport);
    
    if (server.transport === "stdio") {
      const stdioConfig = server.config as StdioConfig;
      setFormCommand(stdioConfig.command);
      setFormArgs(stdioConfig.args?.join(" ") || "");
      setFormEnv(stdioConfig.env ? JSON.stringify(stdioConfig.env, null, 2) : "");
      setFormUrl("");
    } else {
      const httpConfig = server.config as HttpConfig;
      setFormUrl(httpConfig.url);
      setFormCommand("");
      setFormArgs("");
      setFormEnv("");
    }
    
    setShowEditModal(true);
  };

  // 서버 수정
  const handleEditServer = () => {
    if (!editingServer || !formName) return;

    let config: MCPServerConfig;

    if (formTransport === "stdio") {
      const stdioConfig: StdioConfig = {
        command: formCommand,
        args: formArgs ? formArgs.split(" ") : undefined,
        env: formEnv ? JSON.parse(formEnv) : undefined,
      };
      config = { id: editingServer.id, name: formName, transport: "stdio", config: stdioConfig };
    } else {
      const httpConfig: HttpConfig = { url: formUrl };
      config = { id: editingServer.id, name: formName, transport: formTransport, config: httpConfig };
    }

    updateServer(config);
    resetForm();
    setShowEditModal(false);
    setEditingServer(null);
  };

  // 폼 리셋
  const resetForm = () => {
    setFormName("");
    setFormTransport("stdio");
    setFormCommand("");
    setFormArgs("");
    setFormEnv("");
    setFormUrl("");
  };

  // 연결 토글
  const handleToggleConnection = async (serverId: string) => {
    const server = servers.find((s) => s.config.id === serverId);
    if (!server) return;

    if (server.status === "connected") {
      await disconnectServer(serverId);
    } else {
      await connectServer(serverId);
    }
  };

  // 항목 선택
  const handleSelectItem = (item: SelectedItem) => {
    setSelectedItem(item);
    setExecuteInputs({});
    setExecuteResult(null);
    setExecuteError(null);
  };

  // 입력값 변환
  const parseInputValue = (value: string, type?: string): unknown => {
    if (!value.trim()) return undefined;
    
    if (type === "number" || type === "integer") {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }
    if (type === "boolean") {
      return value.toLowerCase() === "true";
    }
    if (type === "array" || type === "object") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  // 스키마에서 입력 필드 정보 추출
  const getSchemaFields = (schema?: Record<string, unknown>) => {
    if (!schema) return [];
    const properties = schema.properties as Record<string, { type?: string; description?: string }> | undefined;
    const required = (schema.required as string[]) || [];
    
    if (!properties) return [];
    
    return Object.entries(properties).map(([name, prop]) => ({
      name,
      type: prop?.type || "string",
      description: prop?.description || "",
      required: required.includes(name),
    }));
  };

  // 실행
  const handleExecute = async () => {
    if (!selectedItem || !selectedServerId) return;

    setExecuteError(null);
    setExecuteResult(null);
    setIsExecuting(true);

    try {
      let args: Record<string, unknown> | undefined;
      
      if (Object.keys(executeInputs).length > 0) {
        const fields = selectedItem.type === "tool" 
          ? getSchemaFields(selectedItem.schema)
          : selectedItem.promptArgs?.map(a => ({ name: a.name, type: "string", description: a.description, required: a.required })) || [];
        
        args = {};
        for (const [key, value] of Object.entries(executeInputs)) {
          if (value.trim()) {
            const field = fields.find(f => f.name === key);
            args[key] = parseInputValue(value, field?.type);
          }
        }
        
        if (Object.keys(args).length === 0) {
          args = undefined;
        }
      }

      let result;
      switch (selectedItem.type) {
        case "tool":
          result = await executeTool(selectedServerId, selectedItem.name, args);
          break;
        case "prompt":
          result = await getPrompt(
            selectedServerId,
            selectedItem.name,
            args as Record<string, string> | undefined
          );
          break;
        case "resource":
          result = await readResource(selectedServerId, selectedItem.name);
          break;
      }

      setExecuteResult(result);
    } catch (error) {
      setExecuteError(error instanceof Error ? error.message : "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  // Export
  const handleExport = () => {
    const json = exportConfig();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mcp-servers.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = () => {
    if (importConfig(importText)) {
      setShowImportModal(false);
      setImportText("");
    }
  };

  // 상태 아이콘
  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case "connected":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "connecting":
        return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <PowerOff className="w-4 h-4 text-gray-400" />;
    }
  };

  // 입력 필드 계산
  const inputFields = selectedItem?.type === "tool"
    ? getSchemaFields(selectedItem.schema)
    : selectedItem?.type === "prompt" && selectedItem.promptArgs
    ? selectedItem.promptArgs.map(a => ({
        name: a.name,
        type: "string",
        description: a.description || "",
        required: a.required || false,
      }))
    : [];

  const selectedServer = servers.find((s) => s.config.id === selectedServerId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/20">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">MCP 서버 관리</h1>
                  <p className="text-sm text-slate-400">
                    연결된 서버: {servers.filter((s) => s.status === "connected").length} / {servers.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => syncStatus()}
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                title="상태 동기화"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                가져오기
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                내보내기
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20"
              >
                <Plus className="w-4 h-4" />
                서버 추가
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 서버 목록 */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden sticky top-24">
              <div className="p-4 border-b border-slate-700/50">
                <h2 className="font-semibold text-lg">등록된 서버</h2>
              </div>
              <div className="divide-y divide-slate-700/50 max-h-[calc(100vh-200px)] overflow-y-auto">
                {servers.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>등록된 서버가 없습니다</p>
                    <p className="text-sm mt-1">서버를 추가해보세요</p>
                  </div>
                ) : (
                  servers.map((server) => (
                    <div
                      key={server.config.id}
                      onClick={() => setSelectedServerId(server.config.id)}
                      className={cn(
                        "p-4 cursor-pointer transition-all hover:bg-slate-700/30",
                        selectedServerId === server.config.id && "bg-slate-700/50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusIcon status={server.status} />
                          <div className="min-w-0">
                            <h3 className="font-medium truncate">{server.config.name}</h3>
                            <p className="text-xs text-slate-400 truncate">
                              {server.config.transport.toUpperCase()}
                              {server.error && (
                                <span className="text-red-400 ml-2">
                                  {server.error}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleConnection(server.config.id);
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              server.status === "connected"
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-slate-400 hover:bg-slate-600"
                            )}
                            title={server.status === "connected" ? "연결 해제" : "연결"}
                          >
                            {server.status === "connected" ? (
                              <Power className="w-4 h-4" />
                            ) : (
                              <PowerOff className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(server.config);
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeServer(server.config.id);
                              if (selectedServerId === server.config.id) {
                                setSelectedServerId(null);
                              }
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 서버 상세 - 기능 목록 */}
          <div className="lg:col-span-4">
            {selectedServer ? (
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
                {/* 탭 */}
                <div className="flex border-b border-slate-700/50">
                  {[
                    { id: "tools", label: "Tools", icon: Wrench, count: tools.length },
                    { id: "prompts", label: "Prompts", icon: MessageSquare, count: prompts.length },
                    { id: "resources", label: "Resources", icon: FileText, count: resources.length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-2 py-3 transition-colors relative text-sm",
                        activeTab === tab.id
                          ? "text-violet-400 bg-violet-500/10"
                          : "text-slate-400 hover:text-white hover:bg-slate-700/30"
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full",
                          activeTab === tab.id
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-slate-700 text-slate-400"
                        )}
                      >
                        {tab.count}
                      </span>
                      {activeTab === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
                      )}
                    </button>
                  ))}
                </div>

                {/* 콘텐츠 */}
                <div className="p-3 max-h-[calc(100vh-250px)] overflow-y-auto">
                  {selectedServer.status !== "connected" ? (
                    <div className="text-center py-12 text-slate-400">
                      <PowerOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>서버에 연결되지 않았습니다</p>
                      <button
                        onClick={() => connectServer(selectedServer.config.id)}
                        className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
                      >
                        연결하기
                      </button>
                    </div>
                  ) : isLoading ? (
                    <div className="text-center py-12">
                      <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-violet-400" />
                      <p className="text-slate-400">기능 로딩 중...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeTab === "tools" &&
                        (tools.length === 0 ? (
                          <EmptyState icon={Wrench} text="등록된 도구가 없습니다" />
                        ) : (
                          tools.map((tool) => (
                            <ItemButton
                              key={tool.name}
                              title={tool.name}
                              description={tool.description}
                              isSelected={selectedItem?.name === tool.name && selectedItem?.type === "tool"}
                              onClick={() =>
                                handleSelectItem({
                                  type: "tool",
                                  name: tool.name,
                                  description: tool.description,
                                  schema: tool.inputSchema,
                                })
                              }
                            />
                          ))
                        ))}

                      {activeTab === "prompts" &&
                        (prompts.length === 0 ? (
                          <EmptyState icon={MessageSquare} text="등록된 프롬프트가 없습니다" />
                        ) : (
                          prompts.map((prompt) => (
                            <ItemButton
                              key={prompt.name}
                              title={prompt.name}
                              description={prompt.description}
                              isSelected={selectedItem?.name === prompt.name && selectedItem?.type === "prompt"}
                              onClick={() =>
                                handleSelectItem({
                                  type: "prompt",
                                  name: prompt.name,
                                  description: prompt.description,
                                  promptArgs: prompt.arguments,
                                })
                              }
                            />
                          ))
                        ))}

                      {activeTab === "resources" &&
                        (resources.length === 0 ? (
                          <EmptyState icon={FileText} text="등록된 리소스가 없습니다" />
                        ) : (
                          resources.map((resource) => (
                            <ItemButton
                              key={resource.uri}
                              title={resource.name || resource.uri}
                              description={resource.description || resource.uri}
                              isSelected={selectedItem?.name === resource.uri && selectedItem?.type === "resource"}
                              onClick={() =>
                                handleSelectItem({
                                  type: "resource",
                                  name: resource.uri,
                                  description: resource.description,
                                })
                              }
                            />
                          ))
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-12 text-center text-slate-400">
                <Server className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">서버를 선택하세요</p>
                <p className="text-sm mt-1">좌측 목록에서 서버를 선택하세요</p>
              </div>
            )}
          </div>

          {/* 실행 패널 */}
          <div className="lg:col-span-5">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden sticky top-24">
              <div className="p-4 border-b border-slate-700/50 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-semibold">실행 터미널</h2>
                  {selectedItem && (
                    <p className="text-xs text-slate-400">{selectedItem.name}</p>
                  )}
                </div>
              </div>

              <div className="p-4 max-h-[calc(100vh-250px)] overflow-y-auto">
                {selectedItem ? (
                  <div className="space-y-4">
                    {/* 선택된 항목 정보 */}
                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {selectedItem.type === "tool" && <Wrench className="w-4 h-4 text-violet-400" />}
                        {selectedItem.type === "prompt" && <MessageSquare className="w-4 h-4 text-violet-400" />}
                        {selectedItem.type === "resource" && <FileText className="w-4 h-4 text-violet-400" />}
                        <span className="text-sm font-medium text-violet-300">{selectedItem.name}</span>
                      </div>
                      {selectedItem.description && (
                        <p className="text-sm text-slate-400">{selectedItem.description}</p>
                      )}
                    </div>

                    {/* 입력 필드 */}
                    {inputFields.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-slate-300">입력 파라미터</h4>
                        {inputFields.map((field) => (
                          <div key={field.name} className="space-y-1">
                            <label className="flex items-center gap-2 text-sm">
                              <span className="text-slate-200">{field.name}</span>
                              {field.required && (
                                <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                                  필수
                                </span>
                              )}
                              <span className="text-xs text-slate-500">({field.type})</span>
                            </label>
                            {field.description && (
                              <p className="text-xs text-slate-400">{field.description}</p>
                            )}
                            {field.type === "object" || field.type === "array" ? (
                              <textarea
                                value={executeInputs[field.name] || ""}
                                onChange={(e) => setExecuteInputs({ ...executeInputs, [field.name]: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none font-mono text-sm resize-none"
                                rows={2}
                                placeholder={field.type === "object" ? '{"key": "value"}' : '["item"]'}
                              />
                            ) : field.type === "boolean" ? (
                              <select
                                value={executeInputs[field.name] || ""}
                                onChange={(e) => setExecuteInputs({ ...executeInputs, [field.name]: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none text-sm"
                              >
                                <option value="">선택...</option>
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                            ) : (
                              <input
                                type={field.type === "number" || field.type === "integer" ? "number" : "text"}
                                value={executeInputs[field.name] || ""}
                                onChange={(e) => setExecuteInputs({ ...executeInputs, [field.name]: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none text-sm"
                                placeholder={`${field.name} 입력...`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 실행 버튼 */}
                    <button
                      onClick={handleExecute}
                      disabled={isExecuting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          실행 중...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          실행
                        </>
                      )}
                    </button>

                    {/* 실행 결과 */}
                    {executeResult !== null && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            실행 결과
                          </h4>
                          <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(executeResult, null, 2))}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            복사
                          </button>
                        </div>
                        <ResultDisplay result={executeResult} />
                      </div>
                    )}

                    {/* 에러 */}
                    {executeError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-400 mb-2">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">실행 오류</span>
                        </div>
                        <p className="text-sm text-red-300">{executeError}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400">
                    <Terminal className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>실행할 항목을 선택하세요</p>
                    <p className="text-sm mt-1 text-slate-500">Tools, Prompts, Resources 중 선택</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 서버 추가 모달 */}
      {showAddForm && (
        <Modal onClose={() => setShowAddForm(false)} title="MCP 서버 추가">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">서버 이름</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                placeholder="My MCP Server"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Transport 타입</label>
              <select
                value={formTransport}
                onChange={(e) => setFormTransport(e.target.value as TransportType)}
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
              >
                <option value="stdio">STDIO</option>
                <option value="http">Streamable HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>

            {formTransport === "stdio" ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Command</label>
                  <input
                    type="text"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                    placeholder="node, python, npx 등"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Arguments (공백으로 구분)
                  </label>
                  <input
                    type="text"
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                    placeholder="server.js --port 3000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Environment Variables (JSON)
                  </label>
                  <textarea
                    value={formEnv}
                    onChange={(e) => setFormEnv(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none resize-none"
                    rows={3}
                    placeholder='{"API_KEY": "xxx"}'
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">Server URL</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                  placeholder="http://localhost:3000/mcp"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddServer}
                disabled={!formName || (formTransport === "stdio" ? !formCommand : !formUrl)}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                추가
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import 모달 */}
      {showImportModal && (
        <Modal onClose={() => setShowImportModal(false)} title="서버 설정 가져오기">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                JSON 설정 붙여넣기
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none resize-none font-mono text-sm"
                rows={10}
                placeholder='[{"id": "...", "name": "...", "transport": "...", "config": {...}}]'
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                가져오기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit 모달 */}
      {showEditModal && editingServer && (
        <Modal onClose={() => { setShowEditModal(false); setEditingServer(null); resetForm(); }} title="MCP 서버 수정">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">서버 이름</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                placeholder="My MCP Server"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Transport 타입</label>
              <select
                value={formTransport}
                onChange={(e) => setFormTransport(e.target.value as TransportType)}
                className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
              >
                <option value="stdio">STDIO</option>
                <option value="http">Streamable HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>

            {formTransport === "stdio" ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Command</label>
                  <input
                    type="text"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                    placeholder="node, python, npx 등"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Arguments (공백으로 구분)
                  </label>
                  <input
                    type="text"
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                    placeholder="server.js --port 3000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Environment Variables (JSON)
                  </label>
                  <textarea
                    value={formEnv}
                    onChange={(e) => setFormEnv(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none resize-none"
                    rows={3}
                    placeholder='{"API_KEY": "xxx"}'
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">Server URL</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none"
                  placeholder="http://localhost:3000/mcp"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => { setShowEditModal(false); setEditingServer(null); resetForm(); }}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleEditServer}
                disabled={!formName || (formTransport === "stdio" ? !formCommand : !formUrl)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                저장
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// 모달 컴포넌트
function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// 아이템 버튼 컴포넌트
function ItemButton({
  title,
  description,
  isSelected,
  onClick,
}: {
  title: string;
  description?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all",
        isSelected
          ? "bg-violet-500/20 border-violet-500/50 text-white"
          : "bg-slate-700/30 border-slate-700/50 hover:bg-slate-700/50 text-slate-300"
      )}
    >
      <div className="flex items-center gap-2">
        <ChevronRight className={cn("w-4 h-4 transition-transform", isSelected && "rotate-90 text-violet-400")} />
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-sm truncate">{title}</h4>
          {description && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// 결과 표시 컴포넌트
function ResultDisplay({ result }: { result: unknown }) {
  if (result === null || result === undefined) return null;

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    
    // content 배열 (MCP Tool 응답)
    if (Array.isArray(obj.content)) {
      return (
        <div className="space-y-2">
          {obj.content.map((item: { type?: string; text?: string }, index: number) => {
            if (item.type === "text" && item.text) {
              return (
                <div key={index} className="bg-slate-900/50 rounded-lg p-3">
                  <pre className="whitespace-pre-wrap text-sm text-emerald-300 font-mono">
                    {item.text}
                  </pre>
                </div>
              );
            }
            return (
              <div key={index} className="bg-slate-900/50 rounded-lg p-3">
                <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                  {JSON.stringify(item, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      );
    }

    // contents 배열 (Resource 응답)
    if (Array.isArray(obj.contents)) {
      return (
        <div className="space-y-2">
          {obj.contents.map((item: { uri?: string; text?: string; mimeType?: string }, index: number) => (
            <div key={index} className="bg-slate-900/50 rounded-lg p-3">
              {item.uri && (
                <div className="text-xs text-slate-400 mb-1 font-mono">{item.uri}</div>
              )}
              {item.mimeType && (
                <span className="inline-block text-xs bg-slate-700 px-2 py-0.5 rounded mb-2">
                  {item.mimeType}
                </span>
              )}
              {item.text && (
                <pre className="whitespace-pre-wrap text-sm text-emerald-300 font-mono">
                  {item.text}
                </pre>
              )}
            </div>
          ))}
        </div>
      );
    }

    // messages 배열 (Prompt 응답)
    if (Array.isArray(obj.messages)) {
      return (
        <div className="space-y-2">
          {obj.messages.map((msg: { role?: string; content?: { type?: string; text?: string } }, index: number) => (
            <div key={index} className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-xs text-violet-400 mb-1 font-medium uppercase">
                {msg.role || "message"}
              </div>
              {msg.content?.text && (
                <pre className="whitespace-pre-wrap text-sm text-slate-200">
                  {msg.content.text}
                </pre>
              )}
            </div>
          ))}
        </div>
      );
    }
  }

  // 일반 결과
  return (
    <div className="bg-slate-900/50 rounded-lg p-3">
      <pre className="whitespace-pre-wrap text-sm text-emerald-300 font-mono overflow-auto max-h-60">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

// 빈 상태 컴포넌트
function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="text-center py-8 text-slate-400">
      <Icon className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
