'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Status from './status';
import UserChat from './userchat';
import { BarChart3, MessageCircle, Users, Zap } from 'lucide-react';

interface StatusChatTabsProps {
  enableUserChat: boolean;
  roomName: string;
  username: string;
}

type TabType = 'status' | 'chat';

const StatusChatTabs: React.FC<StatusChatTabsProps> = ({ 
  enableUserChat, 
  roomName, 
  username 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('status');

  const tabs = [
    {
      id: 'status' as TabType,
      label: 'Status',
      icon: BarChart3,
      description: 'Debate progress & model info'
    },
    {
      id: 'chat' as TabType,
      label: 'Chat',
      icon: MessageCircle,
      description: 'Community discussion',
      disabled: !enableUserChat
    }
  ];

  return (
    <Card className="flex flex-col h-full bg-gradient-to-br from-black to-gray-900 border-gray-700 shadow-2xl">
      {/* Tab Headers */}
      <CardHeader className="font-mono text-gray-400 pb-0 border-b border-gray-700 bg-gradient-to-r from-gray-900/50 to-black/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
            <span className="text-red-400 font-bold tracking-wider">SIDEBAR</span>
          </div>
        </div>
        
        <div className="flex space-x-1 p-1 bg-black/30 rounded-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled = tab.disabled;
            
            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id)}
                disabled={isDisabled}
                className={cn(
                  'flex-1 flex items-center gap-2 px-4 py-3 rounded-md font-medium text-sm transition-all duration-200',
                  isActive && !isDisabled && 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg',
                  !isActive && !isDisabled && 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
                  isDisabled && 'text-gray-600 cursor-not-allowed opacity-50'
                )}
              >
                <Icon className="w-4 h-4" />
                <div className="flex flex-col items-start">
                  <span className="font-bold">{tab.label}</span>
                  <span className="text-xs opacity-75 hidden md:block">
                    {isDisabled ? 'Disabled' : tab.description}
                  </span>
                </div>
                {isActive && !isDisabled && (
                  <div className="ml-auto">
                    <Zap className="w-3 h-3 animate-pulse" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardHeader>

      {/* Tab Content */}
      <CardContent className="flex-1 p-0 min-h-0">
        <div className="h-full relative overflow-hidden">
          {/* Status Tab */}
          <div 
            className={cn(
              "h-full flex flex-col p-4 transition-all duration-300",
              activeTab === 'status' 
                ? "opacity-100 translate-x-0" 
                : "opacity-0 translate-x-full absolute inset-0 pointer-events-none"
            )}
          >
            <div className="flex-1">
              <Status />
            </div>
          </div>
          
          {/* Chat Tab - Enabled */}
          {enableUserChat && (
            <div 
              className={cn(
                "h-full transition-all duration-300",
                activeTab === 'chat' 
                  ? "opacity-100 translate-x-0" 
                  : "opacity-0 -translate-x-full absolute inset-0 pointer-events-none"
              )}
            >
              <UserChat roomName={roomName} username={username} />
            </div>
          )}
          
          {/* Chat Tab - Disabled */}
          {!enableUserChat && (
            <div 
              className={cn(
                "h-full flex items-center justify-center p-8 transition-all duration-300",
                activeTab === 'chat' 
                  ? "opacity-100 translate-x-0" 
                  : "opacity-0 -translate-x-full absolute inset-0 pointer-events-none"
              )}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <MessageCircle className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-gray-300 font-semibold mb-2">Chat Disabled</h3>
                <p className="text-gray-500 text-sm mb-4">
                  User chat is currently disabled by the system administrator.
                </p>
                <button
                  onClick={() => setActiveTab('status')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-medium rounded-lg transition-all duration-200"
                >
                  <BarChart3 className="w-4 h-4" />
                  View Status Instead
                </button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatusChatTabs;