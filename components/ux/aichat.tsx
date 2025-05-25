"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AiChatDisplay } from "@/components/ui/ai-chat";
import { usePastAiMessages } from "@/hooks/use-past-ai-messages";

interface AIChatProps {}

const AIChat: React.FC<AIChatProps> = () => {
  const { messages, isLoading, error } = usePastAiMessages();

  if (isLoading) {
    return (
      <Card className="flex flex-col h-full items-center justify-center bg-gradient-to-br from-black to-gray-900 border-gray-700">
        <CardContent className="text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-300">Loading debate messages...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="flex flex-col h-full items-center justify-center bg-gradient-to-br from-black to-gray-900 border-gray-700">
        <CardContent className="text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center">
              <span className="text-red-400 text-xl">⚠️</span>
            </div>
            <p className="text-red-400">Error loading debate messages.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full bg-gradient-to-br from-black to-gray-900 border-gray-700 shadow-2xl">
      <CardHeader className="font-mono text-gray-400 pb-3 border-b border-gray-700 bg-gradient-to-r from-gray-900/50 to-black/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
          <span className="text-red-400 font-bold tracking-wider">LIVE DEBATE</span>
          <div className="flex-1"></div>
          <div className="text-xs text-gray-500 font-mono">REAL-TIME</div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 min-h-0">
        <AiChatDisplay 
          messages={messages}
        />
      </CardContent>
    </Card>
  );
};

export default AIChat;