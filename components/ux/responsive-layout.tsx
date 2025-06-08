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

  // Scroll to bottom on page load for debate chat
  useEffect(() => {
    const scrollToBottom = () => {
      // Find the debate chat container and scroll it to bottom
      const debateChatContainer = document.querySelector('[data-scrollable="true"]');
      if (debateChatContainer) {
        debateChatContainer.scrollTo({
          top: debateChatContainer.scrollHeight,
          behavior: 'smooth',
        });
      }
    };

    // Small delay to ensure content is loaded
    const timer = setTimeout(scrollToBottom, 500);
    return () => clearTimeout(timer);
  }, []);

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
      <div className="flex flex-col min-h-0 w-full md:w-2/3 lg:w-1/2">
        <AIChat />
      </div>
      <div className="flex flex-col min-h-0 w-full md:w-1/3 lg:w-1/2">
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