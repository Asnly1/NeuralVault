/**
 * AI Context 组合 Provider
 *
 * 按正确的嵌套顺序组合所有 AI 相关的 Provider
 */
import React from "react";
import { AIConfigProvider } from "./AIConfigContext";
import { ChatSessionProvider } from "./ChatSessionContext";
import { ChatMessageProvider } from "./ChatMessageContext";

export function AIContextProvider({ children }: { children: React.ReactNode }) {
  return (
    <AIConfigProvider>
      <ChatSessionProvider>
        <ChatMessageProvider>{children}</ChatMessageProvider>
      </ChatSessionProvider>
    </AIConfigProvider>
  );
}

// Re-export hooks for convenience
export { useAIConfig } from "./AIConfigContext";
export { useChatSession } from "./ChatSessionContext";
export { useChatMessage } from "./ChatMessageContext";
