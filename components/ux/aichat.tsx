"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AiChatDisplay } from "@/components/ui/ai-chat";
import { usePastAiMessages } from "@/hooks/use-past-ai-messages";

interface AIChatProps {}

const AIChat: React.FC<AIChatProps> = () => {
  const { messages, isLoading, error } = usePastAiMessages();

  // Optional: Display loading and error states
  if (isLoading) {
    // return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Loading AI messages...</CardContent></Card>;
  }
  if (error) {
    // return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Error loading AI messages.</CardContent></Card>;
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="font-mono text-gray-400 pb-2">
        DEBATE
      </CardHeader>

      <CardContent className="flex-grow overflow-y-auto">
        <AiChatDisplay messages={messages} />
      </CardContent>
    </Card>
  );
};

export default AIChat;