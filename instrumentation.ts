export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on the server side
    const { checkForStaleDebates } = await import('./lib/orchestrator');
    
    console.log('[STARTUP] Server startup initiated - checking for stale debates', {
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      runtime: process.env.NEXT_RUNTIME
    });

    try {
      console.log('[STARTUP] Beginning stale debate detection and resumption process');

      const result = await checkForStaleDebates();
      
      if (result.error) {
        console.error('[STARTUP ERROR] Server startup stale debate check failed:', {
          error: result.message,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('[STARTUP SUCCESS] Server startup stale debate check completed successfully:', {
          resumed: result.resumed || [],
          failed: result.failed || [],
          message: result.message,
          resumedCount: result.resumed?.length || 0,
          failedCount: result.failed?.length || 0,
          timestamp: new Date().toISOString()
        });

        // Log individual resume results
        if (result.resumed && result.resumed.length > 0) {
          console.log(`[DEBATES RESUMED] Successfully resumed ${result.resumed.length} debate(s):`, {
            debateIds: result.resumed,
            timestamp: new Date().toISOString()
          });
        }

        if (result.failed && result.failed.length > 0) {
          console.warn(`[DEBATES FAILED] Failed to resume ${result.failed.length} debate(s):`, {
            failures: result.failed,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('[STARTUP CRITICAL ERROR] Critical error during server startup stale debate check:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }

    console.log('[STARTUP COMPLETE] Server startup process completed', {
      timestamp: new Date().toISOString()
    });
  }
}