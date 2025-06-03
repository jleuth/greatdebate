import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { type ChatMessage } from './use-debate-turns'; // Or define your own

interface DebateTurnFromDb {
  id: string;
  content: string;
  model: string;       // Name of the model (e.g., 'gpt-4o')
  turn_index: number;  // Debate turn number
  created_at?: string; // (Optional: Use started_at or finished_at if available)
  started_at?: string;
  finished_at?: string;
}

// Helper for consistent sorting, handling potentially empty createdAt strings
const sortByCreatedAt = (a: ChatMessage, b: ChatMessage) => {
  const dateA = a.createdAt || '1970-01-01T00:00:00Z'; // Fallback for empty/null createdAt
  const dateB = b.createdAt || '1970-01-01T00:00:00Z'; // Fallback for empty/null createdAt
  return dateA.localeCompare(dateB);
};

export function usePastAiMessages() {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTurns = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get all turns ordered by turn_index ascending (chronological order)
      const { data, error: dbError } = await supabase
        .from('debate_turns')
        .select('*')
        .order('turn_index', { ascending: true });

      if (dbError) {
        throw dbError;
      }

      if (data) {
        // For now, let's simplify and not filter by ended debates
        const formattedMessages: ChatMessage[] = data.map((turn: DebateTurnFromDb) => ({
          id: turn.id,
          content: turn.content,
          user: { name: turn.model }, // model name in place of username
          createdAt: turn.started_at || turn.finished_at || new Date().toISOString(),
        }));

        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }

    } catch (e: any) {
      console.error('Error fetching past AI turns:', e);
      setError(e);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed supabase from deps as it's now stable

  useEffect(() => {
    fetchTurns();
  }, [fetchTurns]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-debate-turns')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'debate_turns' },
        (payload) => {
          const turn = payload.new as DebateTurnFromDb;
          const newMessage: ChatMessage = {
            id: turn.id,
            content: turn.content,
            user: { name: turn.model },
            createdAt: turn.started_at || turn.finished_at || '',
          };
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMessage.id)) return prev; // Avoid duplicates
            return [...prev, newMessage].sort(sortByCreatedAt);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'debate_turns' },
        (payload) => {
          const turn = payload.new as DebateTurnFromDb;
          const updatedMessage: ChatMessage = {
            id: turn.id,
            content: turn.content,
            user: { name: turn.model },
            createdAt: turn.started_at || turn.finished_at || '',
          };
          setMessages((prevMessages) => {
            const existingMsgIndex = prevMessages.findIndex(msg => msg.id === updatedMessage.id);

            if (existingMsgIndex !== -1) {
              // Message exists, update it immutably
              const newMessages = [...prevMessages]; // Create a new array
              newMessages[existingMsgIndex] = updatedMessage; // Replace with the new object
              return newMessages.sort(sortByCreatedAt);
            } else {
              // Message doesn't exist in local state yet, add it
              // This handles cases where an UPDATE might arrive before the message is fetched/inserted locally
              return [...prevMessages, updatedMessage].sort(sortByCreatedAt);
            }
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Removed supabase from deps as it's now stable

  return { messages, isLoading, error, refetchTurns: fetchTurns };
}
