'use client'

import { cn } from '@/lib/utils'
import { ChatMessageItem } from '@/components/ui/chat-message'
import { useChatScroll } from '@/hooks/use-chat-scroll'
import {
  type ChatMessage,
} from '@/hooks/use-debate-turns'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

interface AiChatDisplayProps {
  messages?: ChatMessage[]
}

/**
 * Component to display chat messages.
 * @param messages - The messages to display.
 * @returns The chat display component
 */
export const AiChatDisplay = ({
  messages = []
}: AiChatDisplayProps) => {
  const { containerRef, scrollToBottom } = useChatScroll();
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Track current model
  useEffect(() => {
    const fetchCurrentModel = async () => {
      const { data } = await supabase
        .from('debates')
        .select('current_model')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setCurrentModel(data.current_model);
      }
    };

    fetchCurrentModel();

    // Subscribe to debate changes
    const channel = supabase
      .channel('current-model-tracker')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'debates' },
        (payload) => {
          if (payload.new) {
            setCurrentModel((payload.new as any).current_model);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

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
    <div className="flex flex-col w-full h-full bg-gradient-to-b from-black to-gray-900 text-gray-100 antialiased">
      {/* Messages */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto p-6 space-y-3 min-h-0 mobile-scroll"
        data-scrollable="true"
      >

        {allMessages.length === 0 ? (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-red-800 to-black rounded-full flex items-center justify-center shadow-2xl ring-4 ring-red-900/30">
                <span className="text-3xl">🤖</span>
              </div>
              <div>
                <p className="text-gray-300 font-semibold mb-1">No AI messages yet.</p>
                <p className="text-sm text-gray-500">The debate will appear here when it starts.</p>
              </div>
              <div className="w-full max-w-xs h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        ) : null}
        
        <div className="space-y-4">
          {allMessages.map((message, index) => {
            const prevMessage = index > 0 ? allMessages[index - 1] : null
            const showHeader = !prevMessage || prevMessage.user.name !== message.user.name
            const isCurrentModel = currentModel === message.user.name

            return (
              <div
                key={message.id}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500"
              >
                <ChatMessageItem
                  message={message}
                  isOwnMessage={false} // AI messages are never "own" messages
                  showHeader={showHeader}
                  isAiMessage={true}
                  isCurrentModel={isCurrentModel}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};
