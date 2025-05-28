'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import MobileNav, { MobileTab } from './mobile-nav';
import MobileStatus from './mobile-status';
import MobilePullRefresh from './mobile-pull-refresh';
import AIChat from './aichat';
import UserChat from './userchat';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

interface MobileLayoutProps {
  enableUserChat: boolean;
  roomName: string;
  username: string;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({ 
  enableUserChat, 
  roomName, 
  username 
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('debate');

  const handleRefresh = async () => {
    // Add a small delay to feel natural
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Force re-render by reloading the page data
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'debate':
        return (
          <MobilePullRefresh onRefresh={handleRefresh}>
            <div className="h-full flex flex-col">
              <AIChat />
            </div>
          </MobilePullRefresh>
        );
        
      case 'status':
        return (
          <MobilePullRefresh onRefresh={handleRefresh}>
            <div className="h-full overflow-y-auto mobile-scroll">
              <MobileStatus />
            </div>
          </MobilePullRefresh>
        );
        
      case 'chat':
        if (!enableUserChat) {
          return (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="w-full max-w-sm bg-gradient-to-br from-black/80 to-gray-900/80 border-gray-700/50">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <MessageCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <h3 className="text-gray-300 font-semibold mb-2">Chat Disabled</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    User chat is currently disabled by the system administrator.
                  </p>
                  <button
                    onClick={() => setActiveTab('debate')}
                    className="w-full px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-medium rounded-lg transition-all duration-200"
                  >
                    View Debate Instead
                  </button>
                </CardContent>
              </Card>
            </div>
          );
        }
        
        return (
          <MobilePullRefresh onRefresh={handleRefresh}>
            <div className="h-full flex flex-col">
              <UserChat roomName={roomName} username={username} />
            </div>
          </MobilePullRefresh>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-black via-gray-900 to-gray-800 overflow-hidden">
      {/* Tab Content */}
      <main className="flex-1 min-h-0 relative">
        <div className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300",
          "opacity-100 translate-x-0"
        )}>
          {renderTabContent()}
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        enableUserChat={enableUserChat}
      />
    </div>
  );
};

export default MobileLayout;