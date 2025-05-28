import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limiting (for production, consider Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function rateLimit(config: RateLimitConfig) {
  return async (req: NextRequest): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> => {
    const key = getClientKey(req);
    const now = Date.now();
    const { windowMs, maxRequests } = config;

    // Clean up expired entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      cleanupExpiredEntries(now);
    }

    let entry = rateLimitStore.get(key);

    if (!entry || now >= entry.resetTime) {
      // Create new window
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
      
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: entry.resetTime,
      };
    }

    // Increment counter
    entry.count++;

    if (entry.count > maxRequests) {
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: entry.resetTime,
      };
    }

    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - entry.count,
      reset: entry.resetTime,
    };
  };
}

function getClientKey(req: NextRequest): string {
  // For server-to-server communication, use Authorization header
  const auth = req.headers.get('authorization');
  if (auth) {
    return `auth:${auth.slice(0, 20)}`; // Use first 20 chars of auth token
  }

  // Fallback to IP for any public endpoints
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Predefined rate limit configurations
export const API_RATE_LIMITS = {
  // Very restrictive for scheduler (should only be called by cron)
  scheduler: { windowMs: 60 * 1000, maxRequests: 5 }, // 5 requests per minute
  
  // Moderate for debate start (internal API)
  debateStart: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute
  
  // More lenient for any public endpoints
  general: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 requests per minute
} as const;