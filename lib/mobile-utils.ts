/**
 * Mobile utility functions and constants for responsive design
 */

// Safe area constants
export const SAFE_AREA = {
  // Standard safe area insets for iOS/Android
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)', 
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
} as const;

// Touch-friendly minimum sizes (following Material Design guidelines)
export const TOUCH_TARGET = {
  min: 44, // Minimum touch target size in px
  comfortable: 48, // Comfortable touch target size in px
  spacing: 8, // Minimum spacing between touch targets
} as const;

// Breakpoints
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1200,
} as const;

// Mobile detection utility
export const isMobileUserAgent = () => {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

// Viewport utilities
export const getViewportHeight = () => {
  if (typeof window === 'undefined') return 0;
  
  // Use visualViewport if available (better for mobile)
  if (window.visualViewport) {
    return window.visualViewport.height;
  }
  
  return window.innerHeight;
};

// Touch event utilities
export const isTouch = () => {
  if (typeof window === 'undefined') return false;
  
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Haptic feedback (if available)
export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof window === 'undefined') return;
  
  // Check if vibration API is available
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [50],
    };
    
    navigator.vibrate(patterns[type]);
  }
  
  // iOS Haptic feedback (if available in PWA context)
  if ('DeviceMotionEvent' in window && 'requestPermission' in (DeviceMotionEvent as any)) {
    // This would be for iOS PWA with haptic feedback
    // Implementation depends on specific iOS haptic APIs
  }
};

// Safe area CSS custom properties
export const getSafeAreaCSS = () => ({
  '--safe-area-inset-top': SAFE_AREA.top,
  '--safe-area-inset-bottom': SAFE_AREA.bottom,
  '--safe-area-inset-left': SAFE_AREA.left,
  '--safe-area-inset-right': SAFE_AREA.right,
});

// Generate responsive Tailwind classes
export const mobileResponsive = {
  // Safe area padding
  safeAreaTop: 'pt-[env(safe-area-inset-top)]',
  safeAreaBottom: 'pb-[env(safe-area-inset-bottom)]',
  safeAreaLeft: 'pl-[env(safe-area-inset-left)]',
  safeAreaRight: 'pr-[env(safe-area-inset-right)]',
  safeAreaX: 'px-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
  safeAreaY: 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
  safeArea: 'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
  
  // Touch-friendly sizes
  touchTarget: 'min-h-[44px] min-w-[44px]',
  touchComfortable: 'min-h-[48px] min-w-[48px]',
  
  // Mobile-specific spacing
  mobileSpacing: 'p-4 md:p-6',
  mobileMargin: 'm-2 md:m-4',
  
  // Typography scaling
  mobileText: 'text-sm md:text-base',
  mobileHeading: 'text-base md:text-lg',
  
  // Container widths
  mobileContainer: 'w-full max-w-screen-sm mx-auto px-4',
} as const;