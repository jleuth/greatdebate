'use client'

import { cn } from '@/lib/utils'
import { ChatMessageItem } from '@/components/ui/chat-message'
import { useChatScroll } from '@/hooks/use-chat-scroll'
import {
  type ChatMessage,
  useRealtimeChat,
} from '@/hooks/use-realtime-chat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface RealtimeChatProps {
  roomName: string
  username: string
  onMessage?: (messages: ChatMessage[]) => void
  messages?: ChatMessage[]
}

/**
 * Realtime chat component
 * @param roomName - The name of the room to join. Each room is a unique chat.
 * @param username - The username of the user
 * @param onMessage - The callback function to handle the messages. Useful if you want to store the messages in a database.
 * @param messages - The messages to display in the chat. Useful if you want to display messages from a database.
 * @returns The chat component
 */
export const RealtimeChat = ({
  roomName,
  username,
  onMessage,
  messages: initialMessages = [],
}: RealtimeChatProps) => {
  const { containerRef, scrollToBottom } = useChatScroll();

  const {
    messages: realtimeMessages,
    sendMessage: hookSendMessage, // Renamed to avoid conflict with any local function if needed
    isConnected,
  } = useRealtimeChat({
    roomName,
    username,
  });
  
  const [newMessage, setNewMessage] = useState(''); // Manage newMessage state locally

  // Merge realtime messages with initial messages
  const allMessages = useMemo(() => {
    const mergedMessages = [...initialMessages, ...realtimeMessages]
    // Remove duplicates based on message id
    const uniqueMessages = mergedMessages.filter(
      (message, index, self) => index === self.findIndex((m) => m.id === message.id)
    )
    // Sort by creation date
    const sortedMessages = uniqueMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return sortedMessages
  }, [initialMessages, realtimeMessages])

  useEffect(() => {
    if (onMessage) {
      onMessage(allMessages)
    }
  }, [allMessages, onMessage])

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom()
  }, [allMessages, scrollToBottom])

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!username || username.trim() === "") {
        alert("Please enter a username to send messages.");
        return;
      }
      if (!newMessage.trim() || !isConnected) return;

      hookSendMessage(newMessage); // Use the sendMessage from the hook
      setNewMessage(''); // Clear the input field
    },
    [newMessage, isConnected, hookSendMessage, username, setNewMessage] // Added hookSendMessage, username, setNewMessage
  );

  const isUsernameMissing = !username || username.trim() === '';

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-b from-black to-gray-900 text-gray-100 antialiased">
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {allMessages.length === 0 ? (
          <div className="text-center py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-red-800 to-black rounded-full flex items-center justify-center shadow-lg ring-2 ring-red-900/30">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-gray-400 text-sm">No messages yet. Start the conversation!</p>
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
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
                  isOwnMessage={message.user.name === username}
                  showHeader={showHeader}
                  isAiMessage={false}
                />
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSendMessage} className="flex w-full gap-3 border-t border-gray-700 p-4 bg-gradient-to-r from-gray-900/50 to-black/50 backdrop-blur-sm flex-shrink-0">
        <Input
          className={cn(
            'rounded-xl bg-black/50 text-sm transition-all duration-300 border-gray-600 text-white placeholder-gray-500 focus:border-red-400 focus:ring-red-400/30',
            isConnected && newMessage.trim() && !isUsernameMissing ? 'w-[calc(100%-48px)]' : 'w-full'
          )}
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={isUsernameMissing ? 'Enter a username above to type...' : 'Type a message...'}
          disabled={isUsernameMissing}
        />
        <Button
          className="aspect-square rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 border border-red-500/30 transition-all duration-200"
          type="submit"
          disabled={isUsernameMissing || !newMessage.trim() || !isConnected}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
};
