'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Trophy, Clock } from 'lucide-react';

interface DebateBannerProps {}

const DebateBanner: React.FC<DebateBannerProps> = () => {
  // Memoize the supabase client to prevent recreation on every render
  const supabase = useMemo(() => createClient(), []);

  const [debateInfo, setDebateInfo] = useState<{
    topic: string;
    category: string;
    status: string;
    started_at: string;
  } | null>(null);

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
        console.error('Error in fetchDebateInfo:', error);
      }
    };

    fetchDebateInfo();

    // Subscribe to debate changes
    const channel = supabase
      .channel('debate-banner')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debates' },
        (payload) => {
          console.log('Debate change received:', payload);
          if (payload.new) {
            setDebateInfo(payload.new as any);
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, []); // Remove supabase from dependency array

  if (!debateInfo) {
    return (
      <Card className="w-full bg-gradient-to-r from-black to-gray-900 border-gray-700 shadow-2xl">
        <CardContent className="py-4">
          <div className="text-center text-gray-400">
            Loading debate information...
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Sparkles className="w-5 h-5 text-red-400 animate-pulse" />;
      case 'voting':
        return <Trophy className="w-5 h-5 text-red-300" />;
      case 'ended':
        return <Trophy className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-red-400';
      case 'voting':
        return 'text-red-300';
      case 'ended':
        return 'text-gray-400';
      default:
        return 'text-red-400';
    }
  };

  const getCategoryGradient = (category: string) => {
    switch (category) {
      case 'American v. Chinese':
        return 'from-red-900 to-red-700';
      case 'Reasoning Round':
        return 'from-red-800 to-gray-800';
      case 'SLM Smackdown':
        return 'from-gray-800 to-red-800';
      case 'Open Source Showdown':
        return 'from-red-700 to-black';
      case 'Popularity Contest':
        return 'from-black to-red-900';
      case 'Comedy Hour':
        return 'from-red-900 to-gray-900';
      default:
        return 'from-gray-800 to-black';
    }
  };

  return (
    <Card className={`w-full bg-gradient-to-r ${getCategoryGradient(debateInfo.category)} border border-gray-700 shadow-2xl ring-1 ring-red-900/20`}>
      <CardContent className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              {getStatusIcon(debateInfo.status)}
              <span className={`text-sm font-mono uppercase tracking-wider font-bold ${getStatusColor(debateInfo.status)}`}>
                {debateInfo.status}
              </span>
              <span className="text-gray-400 text-sm">•</span>
              <span className="text-gray-300 text-sm font-semibold bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm">
                {debateInfo.category}
              </span>
            </div>
            <h1 className="text-white text-2xl font-bold leading-tight drop-shadow-lg">
              {debateInfo.topic}
            </h1>
          </div>
          
          <div className="hidden md:flex flex-col items-end text-right bg-black/40 p-3 rounded-lg backdrop-blur-sm border border-gray-700">
            <div className="text-red-400 text-xs font-mono uppercase tracking-wider mb-1 font-bold">
              Live Debate
            </div>
            <div className="text-gray-200 text-sm">
              {new Date(debateInfo.started_at).toLocaleDateString()} at{' '}
              {new Date(debateInfo.started_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DebateBanner;