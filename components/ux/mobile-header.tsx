'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Trophy, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/mobile-utils';

interface MobileHeaderProps {
  alert?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ alert }) => {
  const supabase = useMemo(() => createClient(), []);

  const [debateInfo, setDebateInfo] = useState<{
    topic: string;
    category: string;
    status: string;
    started_at: string;
  } | null>(null);
  
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchDebateInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('debates')
          .select('topic, category, status, started_at')
          .order('started_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          console.error('Error fetching debate info:', error);
          return;
        }

        if (data) {
          setDebateInfo(data);
        }
      } catch (error) {
        console.error('Unexpected error:', error);
      }
    };

    fetchDebateInfo();

    const channel = supabase
      .channel('mobile-debate-banner')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debates' },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as any;
            setDebateInfo({
              topic: newData.topic,
              category: newData.category,
              status: newData.status,
              started_at: newData.started_at,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Removed supabase from deps as it's now stable

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running': return 'text-red-400';
      case 'voting': return 'text-blue-400';
      case 'ended': return 'text-gray-400';
      default: return 'text-red-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running': return <Sparkles className="w-4 h-4 animate-pulse" />;
      case 'voting': return <Trophy className="w-4 h-4" />;
      case 'ended': return <Clock className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4 animate-pulse" />;
    }
  };

  return (
    <div className="space-y-2 safe-area-px">
      {/* Global Alert */}
      {alert && (
        <Card className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-600/30 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
              <p className="text-yellow-200 text-sm font-medium truncate">{alert}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debate Banner */}
      <Card className="bg-gradient-to-r from-black/80 to-gray-900/80 border-gray-700/50 backdrop-blur-sm">
        <CardContent className="p-3">
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsExpanded(!isExpanded);
            }}
            className="w-full touch-comfortable tap-highlight-red active:scale-98 transition-transform"
            aria-label={isExpanded ? 'Collapse debate info' : 'Expand debate info'}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {debateInfo?.status && getStatusIcon(debateInfo.status)}
                
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">LIVE DEBATE</span>
                    {debateInfo?.status && (
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full bg-black/30',
                        getStatusColor(debateInfo.status)
                      )}>
                        {debateInfo.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  {!isExpanded ? (
                    <p className="text-sm font-semibold text-white truncate">
                      {debateInfo?.topic || 'Loading debate topic...'}
                    </p>
                  ) : null}
                </div>
              </div>
              
              <div className="flex-shrink-0 ml-2">
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
          </button>

          {/* Expanded Content */}
          {isExpanded && debateInfo && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
              <div>
                <span className="text-xs font-mono text-gray-400 block mb-1">TOPIC</span>
                <p className="text-sm font-semibold text-white leading-relaxed">
                  {debateInfo.topic}
                </p>
              </div>
              
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono text-gray-400 block">CATEGORY</span>
                  <span className="text-sm font-medium text-red-300">
                    {debateInfo.category}
                  </span>
                </div>
                
                <div className="text-right">
                  <span className="text-xs font-mono text-gray-400 block">STARTED</span>
                  <span className="text-sm font-medium text-gray-300">
                    {new Date(debateInfo.started_at).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MobileHeader;