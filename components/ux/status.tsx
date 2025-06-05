import React from 'react';
import { Card, CardContent, CardTitle, CardFooter, CardHeader } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useMemo } from 'react';
import { getModelTheme, getModelDisplayName, getModelCompany } from '@/lib/model-colors';
import { Clock, Users, Zap } from 'lucide-react';
import { getStatusLabel } from '@/lib/status-label';

// Helper function to format time (you might want to move this to a utils file)
const formatTimeElapsed = (startTime: string | undefined): string => {
  if (!startTime) return '0 mins, 0 secs';
  const start = new Date(startTime).getTime();
  const now = new Date().getTime();
  let diff = Math.max(0, now - start); // Ensure no negative time

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes} mins, ${seconds} secs`;
};

const Status: React.FC = () => {

    const supabase = useMemo(() => createClient(), []);

    const [debates, setDebate] = useState<{ [key: string]: any }>({});
    const [timeElapsed, setTimeElapsed] = useState<string>('0 mins, 0 secs');

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
          .channel('db-status')
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
      
        // Update time elapsed every second
        const intervalId = setInterval(() => {
          if (debates.started_at && debates.status === 'running') { // Assuming 'Running' is the status for active debates
            setTimeElapsed(formatTimeElapsed(debates.started_at));
          }
        }, 1000);

        return () => { 
          supabase.removeChannel(channel); 
          clearInterval(intervalId);
        };
      }, [debates.started_at, debates.status]); // Add dependencies

    // Dynamic models with theme-based colors
    const modelsInPlay = [
        { id: debates.model_a, name: debates.model_a, theme: getModelTheme(debates.model_a) },
        { id: debates.model_b, name: debates.model_b, theme: getModelTheme(debates.model_b) },
        { id: debates.model_c, name: debates.model_c, theme: getModelTheme(debates.model_c) },
        { id: debates.model_d, name: debates.model_d, theme: getModelTheme(debates.model_d) },
    ].filter(model => model.id); // Filter out undefined models

    const currentModelId = debates.current_model || modelsInPlay[0]?.id; // Default to first if not set
    const turnsTaken = debates.current_turn_idx || 0; // Default to 0 if not set
    const maxTurns = 40;
    const turnProgress = (turnsTaken / maxTurns) * 100;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running':
                return 'text-red-400';
            case 'voting':
                return 'text-red-300';
            case 'ended':
                return 'text-gray-400';
            case 'error':
                return 'text-red-500';
            default:
                return 'text-red-400';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running':
                return <Zap className="w-4 h-4 animate-pulse text-red-400" />;
            case 'voting':
                return <Users className="w-4 h-4 text-red-300" />;
            default:
                return <Clock className="w-4 h-4 text-red-400" />;
        }
    };

    return (
        <Card className="text-white w-full mx-auto bg-gradient-to-br from-black to-gray-900 border-gray-700 shadow-2xl">
            <CardHeader className='font-mono text-gray-400 border-b border-gray-700 pb-3 bg-gradient-to-r from-gray-900/50 to-black/50 backdrop-blur-sm'>
                <div className="flex items-center gap-3">
                    {getStatusIcon(debates.status)}
                    <span className="font-bold">STATUS:</span>
                    <span className={`font-bold ${getStatusColor(debates.status)} bg-black/30 px-2 py-1 rounded-md`}>
                        {getStatusLabel(debates.status)}
                    </span>
                </div>
            </CardHeader>
            
            <CardContent className="pt-6 pb-6 space-y-6">
              <div className='flex flex-row justify-between'>
                <div className="flex-1">
                    <h3 className="font-mono text-gray-400 mb-4 text-sm flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        MODELS IN PLAY:
                    </h3>
                    <div className="space-y-3 w-full pr-10">
                        {modelsInPlay.map(model => {
                            const isCurrentModel = model.id === currentModelId;
                            const displayName = getModelDisplayName(model.id);
                            const company = getModelCompany(model.id);
                            
                            return (
                                <div 
                                    key={model.id} 
                                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                                        isCurrentModel 
                                            ? `${model.theme.bg} ${model.theme.border} border-2 ring-2 ${model.theme.ring}/30` 
                                            : 'hover:bg-gray-800/50 border border-gray-700/50'
                                    }`}
                                >
                                    <div 
                                        className={`w-5 h-5 rounded-full ${model.theme.primary} shadow-lg ${
                                            isCurrentModel ? `ring-2 ${model.theme.ring}/60 ring-offset-2 ring-offset-black animate-pulse` : ''
                                        }`}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className={`text-sm font-bold truncate ${
                                            isCurrentModel ? model.theme.text : 'text-gray-200'
                                        }`}>
                                            {displayName}
                                        </span>
                                        <span className="text-xs text-gray-500 truncate font-medium">
                                            {company}
                                        </span>
                                    </div>
                                    {isCurrentModel && (
                                        <div className={`flex items-center gap-1 text-xs font-bold ${model.theme.text}`}>
                                            <Zap className="w-3 h-3 animate-pulse" />
                                            <span>LIVE</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                
                <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="relative w-40 h-32">
                        <svg className="w-full h-full" viewBox="0 0 100 50">
                            <path d="M10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#475569" strokeWidth="10"/>
                            <path 
                                d="M10 50 A 40 40 0 0 1 90 50" 
                                fill="none" 
                                stroke="#EF4444"
                                strokeWidth="10"
                                strokeDasharray={`${(turnProgress / 100) * (Math.PI * 40)} ${Math.PI * 40}`}
                                strokeLinecap="round"
                                className="transition-all duration-500 drop-shadow-lg"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                          <span className="text-3xl font-bold text-white">{turnsTaken}</span>
                          <span className="text-sm text-gray-400 font-mono">/ {maxTurns}</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-red-400 font-mono font-bold">TURN PROGRESS</p>
                        <p className="text-lg text-white font-bold">{Math.round(turnProgress)}%</p>
                    </div>
                

                        <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

                        <div className="flex items-center justify-center gap-2">
                                <Clock className="w-4 h-4 text-red-400" />
                                <p className="font-mono text-gray-300 text-sm">
                                    Time elapsed: <span className="text-red-400 font-bold">{timeElapsed}</span>
                                </p>
                        </div>

                        {debates.status === 'voting' && (
                            <div className="mt-4 text-center">
                                <p className="text-sm text-blue-400 font-mono font-bold">Voting in progress...</p>
                            </div>
                        )}

                        {debates.status === 'ended' && (
                            <div className="mt-4 text-center space-y-1">
                                {debates.winner ? (
                                    <p className="text-green-400 font-bold text-sm font-mono">Winner: {debates.winner}</p>
                                ) : (
                                    <p className="text-gray-400 font-mono text-sm">Debate ended with no winner</p>
                                )}
                                {debates.total_votes !== undefined && debates.winning_votes !== undefined && (
                                    <p className="text-xs text-gray-500">Votes: {debates.winning_votes} / {debates.total_votes}</p>
                                )}
                            </div>
                        )}
                </div>
            </div>
            </CardContent>
        </Card>
    );
};

export default Status;