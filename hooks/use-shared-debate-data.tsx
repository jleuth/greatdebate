'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// Types for debate data
interface DebateData {
  id: string;
  topic: string;
  status: 'running' | 'voting' | 'ended' | 'error' | 'aborted';
  started_at: string;
  ended_at?: string;
  current_turn_idx: number;
  current_model: string;
  model_a: string;
  model_b: string;
  model_c: string;
  model_d: string;
  category: string;
  winner?: string;
  last_activity_at: string;
}

interface DebateTurn {
  id: string;
  debate_id: string;
  model: string;
  turn_index: number;
  content: string;
  started_at: string;
  finished_at?: string;
}

interface SharedDebateContextType {
  currentDebate: DebateData | null;
  recentTurns: DebateTurn[];
  isConnected: boolean;
  loading: boolean;
}

const SharedDebateContext = createContext<SharedDebateContextType>({
  currentDebate: null,
  recentTurns: [],
  isConnected: false,
  loading: true,
});

export function SharedDebateProvider({ children }: { children: ReactNode }) {
  const [currentDebate, setCurrentDebate] = useState<DebateData | null>(null);
  const [recentTurns, setRecentTurns] = useState<DebateTurn[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Initial data fetch
    const fetchInitialData = async () => {
      try {
        // Get current debate
        const { data: debates } = await supabase
          .from('debates')
          .select('*')
          .in('status', ['running', 'voting'])
          .order('started_at', { ascending: false })
          .limit(1);

        if (mounted && debates && debates.length > 0) {
          setCurrentDebate(debates[0]);

          // Get recent turns for this debate
          const { data: turns } = await supabase
            .from('debate_turns')
            .select('*')
            .eq('debate_id', debates[0].id)
            .order('turn_index', { ascending: false })
            .limit(10);

          if (mounted && turns) {
            setRecentTurns(turns);
          }
        }
      } catch (error) {
        console.error('Error fetching initial debate data:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialData();

    // Set up shared realtime channel for all debate-related data
    const channel = supabase
      .channel('shared-debate-data')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'debates' 
        },
        (payload) => {
          if (!mounted) return;

          console.log('[SHARED_DEBATE] Debate change received:', payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newDebate = payload.new as DebateData;
            
            // Only show running/voting debates
            if (['running', 'voting'].includes(newDebate.status)) {
              setCurrentDebate(newDebate);
            } else if (currentDebate && newDebate.id === currentDebate.id) {
              // Current debate ended
              setCurrentDebate(newDebate);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'debate_turns'
        },
        (payload) => {
          if (!mounted) return;

          const newTurn = payload.new as DebateTurn;
          console.log('[SHARED_DEBATE] New turn received:', newTurn);

          // Only add turns for current debate
          if (currentDebate && newTurn.debate_id === currentDebate.id) {
            setRecentTurns(prev => {
              // Add new turn and keep only latest 10
              const updated = [newTurn, ...prev.filter(t => t.id !== newTurn.id)];
              return updated.slice(0, 10);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'debate_turns'
        },
        (payload) => {
          if (!mounted) return;

          const updatedTurn = payload.new as DebateTurn;
          
          // Update existing turn (e.g., content was filled in)
          if (currentDebate && updatedTurn.debate_id === currentDebate.id) {
            setRecentTurns(prev => 
              prev.map(turn => 
                turn.id === updatedTurn.id ? updatedTurn : turn
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (mounted) {
          setIsConnected(status === 'SUBSCRIBED');
          console.log('[SHARED_DEBATE] Connection status:', status);
        }
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [currentDebate?.id]); // Re-run when debate changes

  return (
    <SharedDebateContext.Provider value={{
      currentDebate,
      recentTurns,
      isConnected,
      loading
    }}>
      {children}
    </SharedDebateContext.Provider>
  );
}

// Hook to use the shared debate data
export function useSharedDebateData() {
  const context = useContext(SharedDebateContext);
  if (!context) {
    throw new Error('useSharedDebateData must be used within a SharedDebateProvider');
  }
  return context;
}

// Specific hooks for components that need specific data
export function useCurrentDebate() {
  const { currentDebate, loading } = useSharedDebateData();
  return { currentDebate, loading };
}

export function useDebateTurns() {
  const { recentTurns, currentDebate, isConnected } = useSharedDebateData();
  return { turns: recentTurns, currentDebate, isConnected };
}

export function useDebateStatus() {
  const { currentDebate, isConnected, loading } = useSharedDebateData();
  return { 
    debate: currentDebate, 
    isConnected, 
    loading,
    // Computed values for easy access
    isRunning: currentDebate?.status === 'running',
    isVoting: currentDebate?.status === 'voting',
    isEnded: currentDebate?.status === 'ended',
    currentModel: currentDebate?.current_model,
    currentTurn: currentDebate?.current_turn_idx
  };
}