import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        db: {
            schema: 'public',
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                'x-client-info': 'greatdebate-server'
            }
        }
    }
);

// NEVER IMPORT THIS FILE INTO THE CLIENT SIDE