import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Log from '@/lib/logger';

const SERVER_TOKEN = process.env.SERVER_TOKEN; // VERY VERY SECRET, THIS ENSURES ONLY THE SERVER CAN SCHEDULE A DEBATE

export async function POST(req: NextRequest) {
    const data = await req.json();

        const auth = req.headers.get('authorization');
        if (!auth || auth !== `Bearer ${SERVER_TOKEN}`) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // CHECK FLAGS
        const { data: flags, error: flagerror } = await supabaseAdmin
            .from('flags')
            .select('kill_switch_active, debate_paused, enable_new_debates')
            .single();

        if (flagerror) {
            return NextResponse.json({ error: flagerror.message }, { status: 500 });
        }

        if (
            (flags?.kill_switch_active === true) ||
            (flags?.debate_paused === true) ||
            (flags?.enable_new_debates === false)
        ) {
            return NextResponse.json({ message: 'A flag is preventing a new debate from starting.' }, { status: 403 });
        }
        // END CHECK FLAGS
    const { data: debates, error } = await supabaseAdmin
        .from('debates')
        .select('status');

    if (error) {
        console.error('Error fetching debates:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const hasNonEnded = debates?.some((debate: { status: string }) => debate.status === 'running');

    if (hasNonEnded) {
        return NextResponse.json({ message: 'There are debates that have not ended.' }, { status: 204 });
    }

    // Define pools of categories, each with their own models and topics

    const pools = {
        'American v. Chinese': {
            models: ['openai/gpt-4.1', 'google/gemini-2.5-pro-preview', 'google/gemini-2.5-flash-preview', 'openai/chatgpt-4o-latest', 'anthropic/claude-3.7-sonnet', 'meta-llama/llama-4-maverick:free', 'qwen/qwen2.5-vl-32b-instruct:free', 'qwen/qwq-32b:free', 'deepseek/deepseek-chat:free', '01-ai/yi-large', 'deepseek/deepseek-prover-v2:free', 'qwen/qwen3-30b-a3b:free'],
            topics: [
                'Who will reach AGI first, America or China?',
                'Which country leads in AI safety research, America or China?',
                'Is American or Chinese AI policy more effective?',
            ],
        },
        'Reasoning Round': {
            models: [ 'openai/o3', 'google/gemini-2.5-pro-preview', 'deepseek/deepseek-r1:free', 'perplexity/r1-1776', 'anthropic/claude-3.7-sonnet:thinking', 'x-ai/grok-3-beta', 'openai/o1', 'qwen/qwq-32b:free', 'microsoft/phi-4-reasoning-plus:free', 'openai/o4-mini-high'],
            topics: [
                'Will open source or closed source AI dominate the future?',
                'Are open source models safer than closed source models?',
            ],
        },
        'SLM Smackdown': {
            models: ['openai/gpt-4.1-nano', 'google/gemma-3-4b-it:free', 'google/gemini-2.0-flash-lite-001', 'mistralai/ministral-3b', 'meta-llama/llama-3.2-3b-instruct', 'amazon/nova-lite-v1', 'qwen/qwen3-4b:free'],
            topics: [
                'Which model is the best for reasoning tasks?',
                'Which model is the best for creative writing?',
            ],
        },
        'Open Source Showdown': {
            models: ['meta-llama/llama-4-maverick:free', 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free', 'google/gemma-3-27b-it:free', 'microsoft/phi-4-multimodal-instruct', 'qwen/qwen3-235b-a22b:free', 'deepseek/deepseek-chat:free', 'mistralai/mistral-medium-3', ],
            topics: [
                'Which open source model is the best for reasoning tasks?',
                'Which open source model is the best for creative writing?',
            ],
        },
        'Popularity Contest': {
            models: ['meta-llama/llama-4-maverick:free', 'openai/gpt-4.1', 'openai/chatgpt-4o-latest', 'google/gemini-2.5-flash-preview', 'anthropic/claude-3.7-sonnet', 'qwen/qwen3-235b-a22b:free'],
            topics: [
                'Which model is the most popular among users?',
                'Which model has the best community support?',
            ],
        },
        'Comedy Hour': {
            models: ['meta-llama/llama-4-maverick:free', 'openai/gpt-4.1', 'openai/chatgpt-4o-latest', 'google/gemini-2.5-flash-preview', 'anthropic/claude-3.7-sonnet', 'qwen/qwen3-235b-a22b:free'],
            topics: [
                'Which model can generate the funniest jokes?',
                'Which model can create the best memes?',
            ],
        },
    };

    function getRandomFromArray(arr: any[]) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function pickDebateFromPools() {
        const categories = Object.keys(pools) as (keyof typeof pools)[];
        const category = getRandomFromArray(categories) as keyof typeof pools;
        const models = pools[category].models;
        const topic = getRandomFromArray(pools[category].topics);

        let selectedModels: string[] = [];
        if (category === 'American v. Chinese') {
            // Pick 2 from first 6, 2 from last 6 (if enough models)
            const firstHalf = models.slice(0, 6);
            const lastHalf = models.slice(-6);
            const shuffledFirst = firstHalf.sort(() => 0.5 - Math.random());
            const shuffledLast = lastHalf.sort(() => 0.5 - Math.random());
            selectedModels = [
                ...shuffledFirst.slice(0, 2),
                ...shuffledLast.slice(0, 2)
            ];
        } else {
            // Pick 4 random models
            const shuffledModels = models.sort(() => 0.5 - Math.random());
            selectedModels = shuffledModels.slice(0, 4);
        }
        return { category, topic, models: selectedModels };
    }

    const debateSelection = pickDebateFromPools();


    // Log the selected debate configuration
    await Log({
        level: "info",
        event_type: "debate_scheduler_selection",
        message: `Selected debate`,
        detail: JSON.stringify(debateSelection),
    });

    fetch('http://localhost:3000/api/debate/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SERVER_TOKEN}`,
        },
        body: JSON.stringify({
            topic: debateSelection.topic,
            models: debateSelection.models,
            category: debateSelection.category,
        }),
    })
    .then((response) => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    });

    return NextResponse.json({ message: 'POST request received', data });
}