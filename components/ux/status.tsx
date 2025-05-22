import React from 'react';
import { Card, CardContent, CardTitle, CardFooter, CardHeader } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'; 
const Status: React.FC = () => {

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [debates, setDebate] = useState<{ [key: string]: any }>({});

      useEffect(() => {
        // 1. Get current flags
        supabase
          .from('debates')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .single()
          .then(({ data }) => {
          if (data) setDebate(data);
        });
      
        // 2. Subscribe for updates
        const channel = supabase
          .channel('db-status')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'debates' },
            (payload) => {
              if (payload.new) setDebate(payload.new);
            }
          )
          .subscribe();
      
        return () => { supabase.removeChannel(channel); };
      }, []);

    return (
        <Card>
            <CardHeader className='font-mono text-gray-400'>STATUS</CardHeader>
            
            <CardContent>
                {Object.entries(debates).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                        <span className="text-sm font-medium text-gray-400">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-sm">{String(value)}</span>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};

export default Status;