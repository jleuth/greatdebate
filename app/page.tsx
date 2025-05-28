'use client';

import GlobalAlertBanner from "@/components/ux/globalalertbanner";
import DebateBanner from "@/components/ux/debate-banner";
import MobileHeader from "@/components/ux/mobile-header";
import ResponsiveLayout from "@/components/ux/responsive-layout";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  
  const [flags, setFlags] = useState<{ [key: string]: any }>({});
  
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
  


  const currentUsername = "";


  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-gray-800 flex flex-col">
      {/* Desktop Header */}
      <div className='hidden md:block p-4 space-y-3 flex-shrink-0'>
          <GlobalAlertBanner alert={flags.global_alerts} />
          <DebateBanner />
      </div>

      {/* Mobile Header */}
      <div className='md:hidden p-3 flex-shrink-0'>
          <MobileHeader alert={flags.global_alerts} />
      </div>

      {/* Responsive Layout */}
      <ResponsiveLayout 
        enableUserChat={flags.enable_user_chat === true}
        roomName="great-debate-room"
        username={currentUsername}
      />
    </div>
  );
}
