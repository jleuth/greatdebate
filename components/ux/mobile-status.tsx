import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react';
import { getModelTheme, getModelDisplayName, getModelCompany } from '@/lib/model-colors';
import { Clock, Users, Zap, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '@/lib/mobile-utils';

// Helper function to format time
const formatTimeElapsed = (startTime: string | undefined): string => {
  if (!startTime) return '0m 0s';
  const start = new Date(startTime).getTime();
  const now = new Date().getTime();
  let diff = Math.max(0, now - start);

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds}s`;
};

const MobileStatus: React.FC = () => {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [debates, setDebate] = useState<{ [key: string]: any }>({});
    const [timeElapsed, setTimeElapsed] = useState<string>('0m 0s');

    useEffect(() => {
        const fetchInitialData = async () => {
          const { data } = await supabase
            .from('debates')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(1)
            .single();
          if (data) {
            setDebate(data);
            setTimeElapsed(formatTimeElapsed(data.started_at));
          }
        };
        fetchInitialData();
      
        const channel = supabase
          .channel('mobile-status')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'debates' },
            (payload) => {
              if (payload.new) {
                setDebate(payload.new as { [key: string]: any });
                setTimeElapsed(formatTimeElapsed((payload.new as { [key: string]: any }).started_at));
              }
            }
          )
          .subscribe();
      
        const intervalId = setInterval(() => {
          if (debates.started_at && debates.status === 'running') {
            setTimeElapsed(formatTimeElapsed(debates.started_at));
          }
        }, 1000);

        return () => { 
          supabase.removeChannel(channel); 
          clearInterval(intervalId);
        };
    }, [debates.started_at, debates.status]);

    const modelsInPlay = [
        { id: debates.model_a, name: debates.model_a, theme: getModelTheme(debates.model_a) },
        { id: debates.model_b, name: debates.model_b, theme: getModelTheme(debates.model_b) },
        { id: debates.model_c, name: debates.model_c, theme: getModelTheme(debates.model_c) },
        { id: debates.model_d, name: debates.model_d, theme: getModelTheme(debates.model_d) },
    ].filter(model => model.id);

    const currentModelId = debates.current_model || modelsInPlay[0]?.id;
    const turnsTaken = debates.current_turn_idx || 0;
    const maxTurns = 40;
    const turnProgress = (turnsTaken / maxTurns) * 100;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return 'text-red-400';
            case 'voting': return 'text-blue-400';
            case 'ended': return 'text-gray-400';
            case 'error': return 'text-red-500';
            default: return 'text-red-400';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running': return <Zap className="w-4 h-4 animate-pulse text-red-400" />;
            case 'voting': return <Users className="w-4 h-4 text-blue-400" />;
            default: return <Clock className="w-4 h-4 text-red-400" />;
        }
    };

    return (
        <div className="flex flex-col space-y-3 p-4 safe-area-px min-h-full">
            {/* Status Header - Compact */}
            <Card className="bg-gradient-to-r from-black/80 to-gray-900/80 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {getStatusIcon(debates.status)}
                            <div>
                                <span className="text-xs font-mono text-gray-400">STATUS</span>
                                <p className={`font-bold text-sm ${getStatusColor(debates.status)}`}>
                                    {debates.status?.toUpperCase() || 'LOADING...'}
                                </p>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <div className="flex items-center gap-2 text-red-400">
                                <Clock className="w-3 h-3" />
                                <span className="text-xs font-mono font-bold">{timeElapsed}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Turn Progress - Horizontal */}
            <Card className="bg-gradient-to-r from-black/80 to-gray-900/80 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono text-gray-400">TURN PROGRESS</span>
                        <span className="text-sm font-bold text-white">{turnsTaken} / {maxTurns}</span>
                    </div>
                    
                    <div className="relative">
                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500 ease-out"
                                style={{ width: `${turnProgress}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0</span>
                            <span className="text-red-400 font-bold">{Math.round(turnProgress)}%</span>
                            <span>{maxTurns}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Models - Compact Grid */}
            <Card className="bg-gradient-to-br from-black/80 to-gray-900/80 border-gray-700/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-mono font-bold text-gray-400">MODELS IN PLAY</span>
                    </div>
                </CardHeader>
                
                <CardContent className="pt-0 space-y-2">
                    {modelsInPlay.map(model => {
                        const isCurrentModel = model.id === currentModelId;
                        const displayName = getModelDisplayName(model.id);
                        const company = getModelCompany(model.id);
                        
                        return (
                            <button 
                                key={model.id}
                                onClick={() => triggerHaptic('light')}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 touch-target tap-highlight-red ${
                                    isCurrentModel 
                                        ? `${model.theme.bg} ${model.theme.border} border ring-1 ${model.theme.ring}/40` 
                                        : 'hover:bg-gray-800/30 active:bg-gray-700/40 border border-gray-700/30'
                                }`}
                            >
                                <div 
                                    className={`w-3 h-3 rounded-full ${model.theme.primary} shadow-sm ${
                                        isCurrentModel ? `ring-1 ${model.theme.ring}/60 ring-offset-1 ring-offset-black animate-pulse` : ''
                                    }`}
                                />
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-bold truncate ${
                                            isCurrentModel ? model.theme.text : 'text-gray-200'
                                        }`}>
                                            {displayName}
                                        </span>
                                        {isCurrentModel && (
                                            <div className={`flex items-center gap-1 ${model.theme.text}`}>
                                                <Zap className="w-3 h-3 animate-pulse" />
                                                <span className="text-xs font-bold">LIVE</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-500 truncate block">
                                        {company}
                                    </span>
                                </div>
                                
                                {isCurrentModel && (
                                    <ChevronRight className={`w-4 h-4 ${model.theme.text} animate-pulse`} />
                                )}
                            </button>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
};

export default MobileStatus;