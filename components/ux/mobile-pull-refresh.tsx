'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/mobile-utils';

interface MobilePullRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

const MobilePullRefresh: React.FC<MobilePullRefreshProps> = ({
  onRefresh,
  children,
  className
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === null || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;

    // Check if any child element is scrolled
    const scrollableChild = container.querySelector('.mobile-scroll, [data-scrollable]');
    if (scrollableChild && scrollableChild.scrollTop > 0) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Only prevent default if we're actually pulling
      if (diff > 10) {
        e.preventDefault();
      }
      const distance = Math.min(diff * 0.4, MAX_PULL);
      setPullDistance(distance);

      // Haptic feedback when reaching threshold
      if (distance >= PULL_THRESHOLD && pullDistance < PULL_THRESHOLD) {
        triggerHaptic('medium');
      }
    }
  };

  const handleTouchEnd = async () => {
    if (startY === null) return;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      triggerHaptic('heavy');
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
      }
    }

    setStartY(null);
    setPullDistance(0);
  };

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const shouldTrigger = pullDistance >= PULL_THRESHOLD;

  return (
    <div 
      ref={containerRef}
      className={cn('relative h-full flex flex-col', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex items-center justify-center bg-gradient-to-b from-gray-800/80 to-transparent transition-all duration-300 z-10"
        style={{
          height: `${pullDistance}px`,
          transform: `translateY(-${Math.max(0, pullDistance - 60)}px)`,
        }}
      >
        {pullDistance > 20 && (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className={cn(
              'transition-all duration-200',
              isRefreshing && 'animate-spin',
              shouldTrigger && !isRefreshing && 'text-red-400 scale-110',
              !shouldTrigger && 'text-gray-400'
            )}>
              <RefreshCw className="w-6 h-6" />
            </div>
            
            <div className="text-xs font-medium">
              {isRefreshing ? (
                <span className="text-red-400">Refreshing...</span>
              ) : shouldTrigger ? (
                <span className="text-red-400">Release to refresh</span>
              ) : (
                <span className="text-gray-400">Pull to refresh</span>
              )}
            </div>

            {/* Progress indicator */}
            <div className="w-8 h-1 bg-gray-600 rounded-full overflow-hidden">
              <div 
                className={cn(
                  'h-full transition-all duration-200 rounded-full',
                  shouldTrigger ? 'bg-red-400' : 'bg-gray-400'
                )}
                style={{ width: `${Math.min(pullProgress * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div 
        className="flex-1 min-h-0 transition-transform duration-200 overflow-hidden"
        style={{
          transform: `translateY(${pullDistance > 0 ? Math.min(pullDistance, 60) : 0}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default MobilePullRefresh;