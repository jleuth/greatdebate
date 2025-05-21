'use client';

import AIChat from "@/components/ux/aichat";
import Status from "@/components/ux/status";
import UserChat from "@/components/ux/userchat";
import GlobalAlertBanner from "@/components/ux/globalalertbanner";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {

  useEffect(() => {
    // 1. Get current flags
    supabase.from('flags').select('*').single().then(({ data }) => {
      if (data) setFlags(data);
    });
  
    // 2. Subscribe for updates
    const channel = supabase
      .channel('global-flags')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flags' },
        (payload) => {
          if (payload.new) setFlags(payload.new);
        }
      )
      .subscribe();
  
    return () => { supabase.removeChannel(channel); };
  }, []);
  


  const [flags, setFlags] = useState<{ [key: string]: any }>({});

  const currentUsername = "";
  
  useEffect(() => {
    if (flags.global_alerts) {  

    }
  }, [flags.global_alerts]);

  return (
    <div>
      <div className='p-5'>
          <GlobalAlertBanner alert={flags.global_alerts} />
      </div>
      <main className="p-5 flex space-x-5">
        <div className="w-1/2">
          <AIChat/>
        </div>
        <div className="w-1/2 flex flex-col gap-4">
          <Status />
          <UserChat roomName="great-debate-room" username={currentUsername} />
        </div>
      </main>
    </div>
  );
}
