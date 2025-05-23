"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AiChatDisplay } from "@/components/ui/ai-chat";
import { usePastAiMessages } from "@/hooks/use-past-ai-messages";

interface AIChatProps {}

const AIChat: React.FC<AIChatProps> = () => {
  const { messages, isLoading, error } = usePastAiMessages();

  if (isLoading) {
    return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Loading debate messages...</CardContent></Card>;
  }
  if (error) {
    return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Error loading debate messages.</CardContent></Card>;
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="font-mono text-gray-400 pb-2">
        DEBATE
      </CardHeader>

      <CardContent className="flex-1 p-4">
        <div className="overflow-y-auto max-h-[100vh] h-[80vh]">
          <AiChatDisplay messages={messages} />
        </div>
      </CardContent>
    </Card>
  );
};

export default AIChat;