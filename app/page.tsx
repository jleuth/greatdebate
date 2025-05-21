'use client';

import AIChat from "@/components/ux/aichat";
import Status from "@/components/ux/status";
import UserChat from "@/components/ux/userchat";
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from "react";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);



export default function Home() {

  useEffect(() => {
    // Fetch current flags row(s) on mount
    supabase
      .from('flags')
      .select('*')
      .single() // or .maybeSingle() if only one row; .then(res => res.data)
      .then(({ data, error }) => {
        if (data) setFlags(data);
        else if (error) console.error(error);
      });
  
    const channel = supabase
      .channel('global-flags')
      .on(
        'postgres_changes',
        {
          event: '*', // 'UPDATE', 'INSERT', 'DELETE'
          schema: 'public',
          table: 'flags',
        },
        (payload) => {
        setFlags(payload.new);

        }
      )
      .subscribe();
  
    return () => { supabase.removeChannel(channel); };
  }, []);
  

  const [flags, setFlags] = useState<{ [key: string]: any }>({});

  console.log("Flags: ", flags);

  const currentUsername = "";

  return (
    <main className="p-5 flex space-x-5">
      <div className="w-1/2">
        <AIChat/>
      </div>
      <div className="w-1/2 flex flex-col gap-4">
        <Status />
        {flags.enable_user_chat === true ? (
          <UserChat roomName="great-debate-room" username={currentUsername} />
        ) : (
          <div>User chat is currently disabled.</div>
        )}
      </div>
    </main>
  );
}
