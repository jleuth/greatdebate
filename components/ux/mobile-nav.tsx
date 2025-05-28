'use client';

import React from 'react';
import { MessageCircle, BarChart3, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/mobile-utils';

export type MobileTab = 'debate' | 'status' | 'chat';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  enableUserChat: boolean;
}

const MobileNav: React.FC<MobileNavProps> = ({ 
  activeTab, 
  onTabChange, 
  enableUserChat 
}) => {
  const tabs = [
    {
      id: 'debate' as MobileTab,
      label: 'Debate',
      icon: MessageCircle,
      description: 'AI Discussion'
    },
    {
      id: 'status' as MobileTab,
      label: 'Status',
      icon: BarChart3,
      description: 'Progress & Models'
    },
    {
      id: 'chat' as MobileTab,
      label: 'Chat',
      icon: Users,
      description: 'Community',
      disabled: !enableUserChat
    }
  ];

  return (
    <nav className="flex justify-around items-center bg-black/30 backdrop-blur-sm border-t border-gray-700/50 px-2 py-2 safe-area-pb">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDisabled = tab.disabled;
        
        return (
          <button
            key={tab.id}
            onClick={() => {
              if (!isDisabled) {
                triggerHaptic('light');
                onTabChange(tab.id);
              }
            }}
            disabled={isDisabled}
            className={cn(
              'flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 min-w-0 flex-1 mx-1 touch-comfortable tap-highlight-red',
              isActive && !isDisabled && 'bg-gradient-to-t from-red-600/20 to-red-500/10 border border-red-500/30',
              !isActive && !isDisabled && 'hover:bg-gray-800/50 active:bg-gray-700/50 active:scale-95',
              isDisabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={`${tab.label} tab${isDisabled ? ' (disabled)' : ''}`}
          >
            <div className={cn(
              'relative mb-1',
              isActive && !isDisabled && 'animate-pulse'
            )}>
              <Icon className={cn(
                'w-6 h-6 transition-colors',
                isActive && !isDisabled && 'text-red-400',
                !isActive && !isDisabled && 'text-gray-400',
                isDisabled && 'text-gray-600'
              )} />
              {isActive && !isDisabled && (
                <Zap className="w-3 h-3 text-red-400 absolute -top-1 -right-1 animate-pulse" />
              )}
            </div>
            
            <span className={cn(
              'text-xs font-medium truncate',
              isActive && !isDisabled && 'text-red-400',
              !isActive && !isDisabled && 'text-gray-400',
              isDisabled && 'text-gray-600'
            )}>
              {tab.label}
            </span>
            
            <span className={cn(
              'text-xs opacity-75 truncate leading-tight',
              isActive && !isDisabled && 'text-red-300',
              !isActive && !isDisabled && 'text-gray-500',
              isDisabled && 'text-gray-600'
            )}>
              {isDisabled ? 'Disabled' : tab.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileNav;