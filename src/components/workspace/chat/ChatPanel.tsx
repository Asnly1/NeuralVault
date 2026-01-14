import { useEffect, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAIConfig, useChatMessage } from "@/contexts/AIContext";
import {
  AI_PROVIDER_INFO,
  type ChatSession,
  type ModelOption,
  type ThinkingEffort,
  type RagScope,
} from "@/types";
import { Send, Loader2, Settings } from "lucide-react";
import { quickCapture, linkNodes } from "@/api";
import { useLocalStorageString, useChatSessionManagement } from "@/hooks";
import { SessionItem } from "./SessionItem";
import { MessageBubble } from "./MessageBubble";

interface ChatPanelProps {
  width: number;
  tempWidth: number | null;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onNavigateToSettings?: () => void;
  taskId?: number;
  resourceId?: number;
  contextResourceIds: number[];
  onContextRefresh?: () => void;
}

export function ChatPanel({
  width,
  tempWidth,
  isResizing,
  onMouseDown,
  onNavigateToSettings,
  taskId,
  resourceId,
  contextResourceIds,
  onContextRefresh,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const { configuredProviders, selectedModel, setSelectedModel } = useAIConfig();
  const { messages, isChatLoading, chatError: error, sendMessage } = useChatMessage();

  const [chatInput, setChatInput] = useState("");
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>("low");
  const [isAllSessionsOpen, setIsAllSessionsOpen] = useState(false);
  const [ragScopeValue, setRagScopeValue] = useLocalStorageString(
    "neuralvault_rag_scope",
    "local"
  );
  const [pinningIndex, setPinningIndex] = useState<number | null>(null);

  // Use the session management hook
  const sessionManager = useChatSessionManagement({
    taskId,
    resourceId,
    contextResourceIds,
    getConfirmMessage: () => t("workspace", "deleteChatSessionConfirm"),
  });

  const anchorNodeId = taskId || resourceId;
  const currentWidth = tempWidth !== null ? tempWidth : width;
  const ragScope: RagScope = ragScopeValue === "global" ? "global" : "local";
  const ragScopeLabel =
    ragScope === "local"
      ? t("workspace", "ragScopeLocal")
      : t("workspace", "ragScopeGlobal");

  // Build available models list
  const availableModels: ModelOption[] = configuredProviders.flatMap(
    (provider) =>
      AI_PROVIDER_INFO[provider].models.map((m) => ({
        provider,
        model_id: m.id,
        display_name: m.name,
      }))
  );

  // Calculate available thinking efforts based on selected model
  const availableThinkingEfforts = useMemo((): ThinkingEffort[] => {
    if (!selectedModel) return ["none", "low", "high"];
    const providerInfo = AI_PROVIDER_INFO[selectedModel.provider];
    const modelInfo = providerInfo.models.find((m) => m.id === selectedModel.model_id);
    return modelInfo?.thinkingConfig?.supported
      ? [...modelInfo.thinkingConfig.supported]
      : ["none", "low", "high"];
  }, [selectedModel]);

  // Reset thinking effort when model changes
  useEffect(() => {
    if (selectedModel) {
      const providerInfo = AI_PROVIDER_INFO[selectedModel.provider];
      const modelInfo = providerInfo.models.find((m) => m.id === selectedModel.model_id);
      const defaultEffort = modelInfo?.thinkingConfig?.default ?? "low";
      if (!availableThinkingEfforts.includes(thinkingEffort)) {
        setThinkingEffort(defaultEffort);
      }
    }
  }, [selectedModel, availableThinkingEfforts, thinkingEffort]);

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedModel || isChatLoading) return;
    if (!sessionManager.hasSessionContext) return;
    const content = chatInput;
    setChatInput("");
    try {
      await sendMessage(content, {
        task_id: taskId,
        resource_id: resourceId,
        thinking_effort: thinkingEffort,
        context_resource_ids: contextResourceIds,
        rag_scope: ragScope,
      });
      await sessionManager.loadSessions();
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && selectedModel) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Pin conversation to context
  const handlePinToContext = async (assistantMsgIndex: number) => {
    const assistantMsg = messages[assistantMsgIndex];
    const userMsg = messages[assistantMsgIndex - 1];

    if (!userMsg || userMsg.role !== "user" || !assistantMsg) return;
    if (!anchorNodeId) return;

    setPinningIndex(assistantMsgIndex);
    try {
      const content = `## 提问\n${userMsg.content}\n\n## 回答\n${assistantMsg.content}`;
      const response = await quickCapture({ content, file_type: "text" });

      if (response.node_id) {
        await linkNodes(anchorNodeId, response.node_id, "contains");
      }
      onContextRefresh?.();
    } catch (e) {
      console.error("Failed to pin conversation:", e);
    } finally {
      setPinningIndex(null);
    }
  };

  // Reload sessions when dialog opens
  useEffect(() => {
    if (!isAllSessionsOpen) return;
    void sessionManager.loadSessions();
  }, [isAllSessionsOpen, sessionManager.loadSessions]);

  // Reload sessions when active session changes
  useEffect(() => {
    if (!sessionManager.hasSessionContext || !sessionManager.activeSessionId) return;
    void sessionManager.loadSessions();
  }, [sessionManager.activeSessionId, sessionManager.hasSessionContext, sessionManager.loadSessions]);

  const formatSessionTitle = useCallback(
    (session: ChatSession): string => {
      const title = session.title?.trim();
      if (title) return title;
      const summary = session.summary?.trim();
      if (summary) {
        return summary.length > 20 ? `${summary.slice(0, 20)}...` : summary;
      }
      return t("common", "untitled");
    },
    [t]
  );

  const formatSessionSubtitle = useCallback((session: ChatSession): string => {
    const summary = session.summary?.trim();
    if (summary && session.title?.trim()) {
      return summary.length > 40 ? `${summary.slice(0, 40)}...` : summary;
    }
    if (session.created_at) {
      const date = new Date(session.created_at);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString();
      }
    }
    return "";
  }, []);

  return (
    <aside
      style={{ width: `${currentWidth}px` }}
      className={cn(
        "border-l flex flex-col shrink-0 relative",
        !isResizing && "transition-all duration-300"
      )}
    >
      {/* All Sessions Dialog */}
      <Dialog open={isAllSessionsOpen} onOpenChange={setIsAllSessionsOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("workspace", "chatSessions")}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[360px]">
            <div className="space-y-2 pr-2">
              {sessionManager.isSessionsLoading ? (
                <p className="text-sm text-muted-foreground">{t("common", "loading")}</p>
              ) : sessionManager.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("workspace", "noChatSessions")}
                </p>
              ) : (
                sessionManager.sessions.map((session) => (
                  <SessionItem
                    key={session.session_id}
                    session={session}
                    isActive={session.session_id === sessionManager.activeSessionId}
                    isLoading={isChatLoading}
                    deleteLabel={t("workspace", "deleteChatSession")}
                    onSelect={async () => {
                      await sessionManager.selectSession(session.session_id);
                      setIsAllSessionsOpen(false);
                    }}
                    onDelete={() => void sessionManager.deleteSession(session.session_id)}
                    formatTitle={formatSessionTitle}
                    formatSubtitle={formatSessionSubtitle}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Resize Handle */}
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent transition-colors",
          isResizing && "bg-accent"
        )}
        onMouseDown={onMouseDown}
      >
        <div className="absolute top-0 left-0 w-4 h-full -ml-1.5" />
      </div>

      {/* Header - session management, hide when conversation started */}
      {sessionManager.hasSessionContext && messages.length === 0 && (
        <div className="px-4 py-3 border-b shrink-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t("workspace", "chatSessions")}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setIsAllSessionsOpen(true)}
                  disabled={isChatLoading}
                >
                  {t("workspace", "seeAllSessions")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={sessionManager.createNewSession}
                  disabled={isChatLoading}
                >
                  {t("workspace", "newChatSession")}
                </Button>
              </div>
            </div>
            {sessionManager.isSessionsLoading ? (
              <p className="text-xs text-muted-foreground">{t("common", "loading")}</p>
            ) : sessionManager.sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("workspace", "noChatSessions")}
              </p>
            ) : (
              <div className="space-y-1">
                {sessionManager.visibleSessions.map((session) => (
                  <SessionItem
                    key={session.session_id}
                    session={session}
                    isActive={session.session_id === sessionManager.activeSessionId}
                    isLoading={isChatLoading}
                    deleteLabel={t("workspace", "deleteChatSession")}
                    onSelect={() => void sessionManager.selectSession(session.session_id)}
                    onDelete={() => void sessionManager.deleteSession(session.session_id)}
                    formatTitle={formatSessionTitle}
                    formatSubtitle={formatSessionSubtitle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isChatLoading ? (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                ◆
              </div>
              <div className="bg-muted rounded-lg p-3 text-sm">
                {configuredProviders.length > 0
                  ? t("workspace", "aiGreeting")
                  : t("workspace", "configureApiFirst")}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                message={msg}
                isLastMessage={idx === messages.length - 1}
                isStreaming={isChatLoading}
                showPinButton={
                  msg.role === "assistant" &&
                  idx > 0 &&
                  messages[idx - 1]?.role === "user" &&
                  !!anchorNodeId
                }
                isPinning={pinningIndex === idx}
                onPin={() => void handlePinToContext(idx)}
              />
            ))
          )}
          {isChatLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                ◆
              </div>
              <div className="bg-muted rounded-lg p-3 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("workspace", "thinking")}</span>
              </div>
            </div>
          )}
          {error && (
            <div className="text-destructive text-sm p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area with model selector */}
      <div className="p-4 border-t shrink-0 space-y-2">
        {configuredProviders.length === 0 ? (
          <Button variant="outline" className="w-full" onClick={onNavigateToSettings}>
            <Settings className="h-4 w-4 mr-2" />
            {t("workspace", "goToSettings")}
          </Button>
        ) : (
          <>
            {/* Model, Thinking, RAG controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={
                  selectedModel
                    ? `${selectedModel.provider}:${selectedModel.model_id}`
                    : ""
                }
                onValueChange={(value) => {
                  const [provider, model_id] = value.split(":");
                  const model = availableModels.find(
                    (m) => m.provider === provider && m.model_id === model_id
                  );
                  if (model) setSelectedModel(model);
                }}
              >
                <SelectTrigger className="w-[140px] h-7 text-xs">
                  <SelectValue placeholder={t("workspace", "selectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {t("workspace", "noModelsConfigured")}
                    </SelectItem>
                  ) : (
                    availableModels.map((model) => (
                      <SelectItem
                        key={`${model.provider}:${model.model_id}`}
                        value={`${model.provider}:${model.model_id}`}
                      >
                        {model.display_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Select
                value={thinkingEffort}
                onValueChange={(value) => setThinkingEffort(value as ThinkingEffort)}
              >
                <SelectTrigger className="w-[80px] h-7 text-xs">
                  <SelectValue placeholder={t("workspace", "thinkingEffort")} />
                </SelectTrigger>
                <SelectContent>
                  {availableThinkingEfforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t(
                        "workspace",
                        `effort${effort.charAt(0).toUpperCase() + effort.slice(1)}`
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] rounded-full"
                onClick={() =>
                  setRagScopeValue(ragScope === "local" ? "global" : "local")
                }
                title={t("workspace", "ragScope")}
              >
                {ragScopeLabel}
              </Button>
            </div>
            {/* Input field */}
            <div className="flex gap-2">
              <Input
                placeholder={t("workspace", "inputPlaceholder")}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!selectedModel || isChatLoading}
                className="flex-1"
              />
              <Button
                size="icon"
                disabled={
                  !chatInput.trim() ||
                  !selectedModel ||
                  isChatLoading ||
                  !sessionManager.hasSessionContext
                }
                onClick={() => void handleSend()}
              >
                {isChatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
        {!selectedModel && configuredProviders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("workspace", "selectModelFirst")}
          </p>
        )}
      </div>
    </aside>
  );
}
