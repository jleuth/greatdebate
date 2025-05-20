'use client'

import { cn } from '@/lib/utils'
import { ChatMessageItem } from '@/components/ui/chat-message'
import { useChatScroll } from '@/hooks/use-chat-scroll'
import {
  type ChatMessage,
} from '@/hooks/use-debate-turns'
import { useEffect, useMemo } from 'react'

interface AiChatDisplayProps {
  messages?: ChatMessage[]
}

/**
 * Component to display chat messages.
 * @param messages - The messages to display.
 * @returns The chat display component
 */
export const AiChatDisplay = ({
  messages = [],
}: AiChatDisplayProps) => {
  const { containerRef, scrollToBottom } = useChatScroll();

  const allMessages = useMemo(() => {
    // Remove duplicates based on message id
    const uniqueMessages = messages.filter(
      (message, index, self) => index === self.findIndex((m) => m.id === message.id)
    )
    // Sort by creation date
    const sortedMessages = uniqueMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return sortedMessages
  }, [messages])

  useEffect(() => {
    scrollToBottom()
  }, [allMessages, scrollToBottom])

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground antialiased">
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            No AI messages yet.
          </div>
        ) : null}
        <div className="space-y-1">
          {allMessages.map((message, index) => {
            const prevMessage = index > 0 ? allMessages[index - 1] : null
            const showHeader = !prevMessage || prevMessage.user.name !== message.user.name

            return (
              <div
                key={message.id}
                className="animate-in fade-in slide-in-from-bottom-4 duration-300"
              >
                <ChatMessageItem
                  message={message}
                  isOwnMessage={false} // AI messages are never "own" messages
                  showHeader={showHeader}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};
