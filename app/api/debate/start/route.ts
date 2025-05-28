import { NextRequest, NextResponse } from 'next/server';
import { startDebate } from '@/lib/orchestrator';
import { rateLimit, API_RATE_LIMITS } from '@/lib/rateLimit';

const SERVER_TOKEN = process.env.SERVER_TOKEN; // VERY VERY SECRET, THIS ENSURES ONLY THE SERVER CAN START A DEBATE

export async function POST(req: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(API_RATE_LIMITS.debateStart)(req);
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: 'Rate limit exceeded' },
            { 
                status: 429,
                headers: {
                    'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                    'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                    'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
                }
            }
        );
    }

    const auth = req.headers.get('authorization');
    if (!auth || auth !== `Bearer ${SERVER_TOKEN}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { topic, models, category } = await req.json();
    if (!topic || !models || !category || models.length !== 4 || !Array.isArray(models)) {
        return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    // No flag check here, this can't run without scheduler, which is protected by flags

    // Start the debate

    try {
       const debate = await startDebate({
            topic,
            models,
            category,
        });
        
        return NextResponse.json( debate, { status: 201 });
    } catch (error: any) {
        console.error("Error starting debate:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}