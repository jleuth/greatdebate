'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useCallback } from 'react';
import { type ChatMessage } from './use-realtime-chat'; // Reusing the ChatMessage type

interface UsePastMessagesProps {
  roomName: string;
}

interface PastMessageFromDb {
  id: string;
  content: string;
  user_name: string; // As stored in the DB
  created_at: string;
  room_name: string;
}

export function usePastMessages({ roomName }: UsePastMessagesProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!roomName) {
      setIsLoading(false);
      setMessages([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: dbError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_name', roomName)
        .order('created_at', { ascending: true });

      if (dbError) {
        throw dbError;
      }

      if (data) {
        const formattedMessages: ChatMessage[] = data.map((msg: PastMessageFromDb) => ({
          id: msg.id,
          content: msg.content,
          user: { name: msg.user_name },
          createdAt: msg.created_at,
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    } catch (e: any) {
      console.error('Error fetching past messages:', e);
      setError(e);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [roomName]); // Removed supabase from deps as it's now stable

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return { messages, isLoading, error, refetchMessages: fetchMessages };
}
