import { NextRequest, NextResponse } from 'next/server';
import { startDebate } from '@/lib/orchestrator';

const SERVER_TOKEN = process.env.SERVER_TOKEN; // VERY VERY SECRET, THIS ENSURES ONLY THE SERVER CAN START A DEBATE

export async function POST(req: NextRequest) {
    const auth = req.headers.get('authorization');
    if (!auth || auth !== `Bearer ${SERVER_TOKEN}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { topic, models, category } = await req.json();
    if (!topic || !models || !category || models.length !== 4 || !Array.isArray(models)) {
        return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

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