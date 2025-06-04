import { NextRequest, NextResponse } from 'next/server';
import { openrouterStream } from '@/lib/openRouter';
import { rateLimit, API_RATE_LIMITS } from '@/lib/rateLimit';

const SERVER_TOKEN = process.env.SERVER_TOKEN;

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

    // Verify authorization
    const auth = req.headers.get('authorization');
    if (!auth || auth !== `Bearer ${SERVER_TOKEN}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { model, messages } = await req.json();
        
        if (!model || !messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Create a ReadableStream that will stream the AI response
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Use the existing openrouterStream function
                    for await (const chunk of openrouterStream({ model, messages })) {
                        // Send each chunk as Server-Sent Events format
                        const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
                        controller.enqueue(new TextEncoder().encode(data));
                    }
                    
                    // Send completion signal
                    const doneData = `data: [DONE]\n\n`;
                    controller.enqueue(new TextEncoder().encode(doneData));
                    controller.close();
                } catch (error) {
                    console.error('Streaming error:', error);
                    const errorData = `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(errorData));
                    controller.close();
                }
            }
        });

        // Return the streaming response
        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });

    } catch (error) {
        console.error('Stream API error:', error);
        return NextResponse.json({ 
            error: 'Failed to start stream',
            detail: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}