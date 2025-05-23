import React from 'react';
import { Card, CardContent, CardTitle, CardFooter, CardHeader } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react';

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

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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

    // Mocked models for now, ideally this would come from config or API
    const modelsInPlay = [
        { id: debates.model_a, name: debates.model_a, color: 'bg-red-500' },
        { id: debates.model_b, name: debates.model_b, color: 'bg-blue-500' },
        { id: debates.model_c, name: debates.model_c, color: 'bg-green-500' },
        { id: debates.model_d, name: debates.model_d, color: 'bg-yellow-500' },
    ];

    const currentModelId = debates.current_model_name || modelsInPlay[0].id; // Default to first if not set
    const turnsTaken = debates.current_turn_idx || 0; // Default to 0 if not set
    const maxTurns = 40;
    const turnProgress = (turnsTaken / maxTurns) * 100;

    return (
        <Card className="text-white w-full mx-auto">
            <CardHeader className='font-mono text-gray-400 border-b pb-2'>
                STATUS: <span className="text-green-400">{debates.status || 'Loading...'}</span>
            </CardHeader>
            
            <CardContent className="pt-6 pb-6 space-y-8">
              <div className='flex flex-row justify-between items-center'>
                <div>
                    <h3 className="font-mono text-gray-400 mb-3 text-sm">IN PLAY:</h3>
                    <ul className="space-y-2">
                        {modelsInPlay.map(model => (
                            <li key={model.id} className={`flex items-center text-sm ${model.id === currentModelId ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                <span className={`w-3 h-3 rounded-full mr-3 ${model.color} ${model.id === currentModelId ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : ''}`}></span>
                                {model.name}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="relative w-32 h-16">
                        <svg className="w-full h-full" viewBox="0 0 100 50">
                            <path d="M10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#4A5568" strokeWidth="10"/>
                            <path 
                                d="M10 50 A 40 40 0 0 1 90 50" 
                                fill="none" 
                                stroke="#E2E8F0" // Whiteish color for progress
                                strokeWidth="10"
                                strokeDasharray={`${(turnProgress / 100) * (Math.PI * 40)} ${Math.PI * 40}`} // Circumference of semi-circle
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                          <span className="text-3xl font-bold text-white">{turnsTaken}</span>
                          <span className="text-xs text-gray-400 font-mono">Turn</span>
                        </div>
                    </div>
                </div>
              </div>

                <div>
                    <p className="font-mono text-center text-gray-300 text-lg">
                        Time elapsed: {timeElapsed}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

export default Status;