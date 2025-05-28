'use client';

import React, { useState, useEffect } from 'react';
import MobileLayout from './mobile-layout';
import StatusChatTabs from './status-chat-tabs';
import AIChat from './aichat';

interface ResponsiveLayoutProps {
  enableUserChat: boolean;
  roomName: string;
  username: string;
}

// Hook to detect mobile screen size
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    // Check on mount
    checkIsMobile();

    // Add event listener
    window.addEventListener('resize', checkIsMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({ 
  enableUserChat, 
  roomName, 
  username 
}) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileLayout 
        enableUserChat={enableUserChat}
        roomName={roomName}
        username={username}
      />
    );
  }

  // Desktop layout (existing)
  return (
    <main className="flex-1 px-4 pb-4 flex space-x-4 min-h-0">
      <div className="w-1/2 flex flex-col min-h-0">
        <AIChat />
      </div>
      <div className="w-1/2 flex flex-col min-h-0">
        <StatusChatTabs 
          enableUserChat={enableUserChat}
          roomName={roomName}
          username={username}
        />
      </div>
    </main>
  );
};

export default ResponsiveLayout;