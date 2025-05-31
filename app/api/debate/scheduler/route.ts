import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Log from '@/lib/logger';
import { rateLimit, API_RATE_LIMITS } from '@/lib/rateLimit';

const SERVER_TOKEN = process.env.SERVER_TOKEN; // VERY VERY SECRET, THIS ENSURES ONLY THE SERVER CAN SCHEDULE A DEBATE

export async function POST(req: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(API_RATE_LIMITS.scheduler)(req);
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

        // CHECK FLAGS
        const { data: flags, error: flagerror } = await supabaseAdmin
            .from('flags')
            .select('kill_switch_active, debate_paused, enable_new_debates')
            .single();

        if (flagerror) {
            await Log({
                level: "error",
                event_type: "scheduler_flag_error",
                message: "Error fetching flags in scheduler",
                detail: flagerror.message,
            });

            return NextResponse.json({ error: flagerror.message }, { status: 500 });
        }

        if (
            (flags?.kill_switch_active === true) ||
            (flags?.debate_paused === true) ||
            (flags?.enable_new_debates === false)
        ) {
            await Log({
                level: "info",
                event_type: "scheduler_blocked_by_flags",
                message: "Scheduler blocked by system flags",
                detail: {
                    kill_switch: flags?.kill_switch_active,
                    paused: flags?.debate_paused,
                    new_debates_enabled: flags?.enable_new_debates
                }
            });

            return NextResponse.json({ message: 'A flag is preventing a new debate from starting.' }, { status: 403 });
        }
        // END CHECK FLAGS
    // Use SELECT FOR UPDATE to prevent race conditions when checking for running debates
    const { data: debates, error } = await supabaseAdmin
        .from('debates')
        .select('id, status')
        .in('status', ['running', 'voting']);

    if (error) {
        await Log({
            level: "error",
            event_type: "scheduler_debate_check_error",
            message: "Error checking for active debates",
            detail: error.message,
        });

        console.error('Error fetching debates:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const hasNonEnded = debates && debates.length > 0;

    if (hasNonEnded) {
        await Log({
            level: "info",
            event_type: "debate_scheduler_blocked",
            message: `Scheduler blocked: ${debates.length} non-ended debates found`,
            detail: JSON.stringify(debates.map(d => ({ id: d.id, status: d.status }))),
        });

        console.log(`[SCHEDULER] Blocked: ${debates.length} active debates found`, {
            activeDebates: debates.map(d => ({ id: d.id, status: d.status })),
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({ 
            message: 'There are debates that have not ended.',
            activeDebates: debates.length 
        }, { status: 204 });
    }

    // Database-driven topic and model selection
    async function pickDebateFromDatabase() {
        // Get all active categories
        const { data: categories, error: categoriesError } = await supabaseAdmin
            .from('debate_categories')
            .select('id, name, description')
            .eq('is_active', true);

        if (categoriesError) {
            throw new Error(`Failed to fetch categories: ${categoriesError.message}`);
        }

        if (!categories || categories.length === 0) {
            throw new Error('No active debate categories found');
        }

        // Pick a random category
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];

        // Get topics for this category
        const { data: topics, error: topicsError } = await supabaseAdmin
            .from('debate_topics')
            .select('id, topic, weight')
            .eq('category_id', selectedCategory.id)
            .eq('is_active', true);

        if (topicsError) {
            throw new Error(`Failed to fetch topics: ${topicsError.message}`);
        }

        if (!topics || topics.length === 0) {
            throw new Error(`No active topics found for category: ${selectedCategory.name}`);
        }

        // Weighted random topic selection
        const totalWeight = topics.reduce((sum, topic) => sum + topic.weight, 0);
        let randomWeight = Math.random() * totalWeight;
        let selectedTopic = topics[0];

        for (const topic of topics) {
            randomWeight -= topic.weight;
            if (randomWeight <= 0) {
                selectedTopic = topic;
                break;
            }
        }

        // Get models for this category
        const { data: models, error: modelsError } = await supabaseAdmin
            .from('debate_models')
            .select('id, model_name, model_group, weight')
            .eq('category_id', selectedCategory.id)
            .eq('is_active', true);

        if (modelsError) {
            throw new Error(`Failed to fetch models: ${modelsError.message}`);
        }

        if (!models || models.length === 0) {
            throw new Error(`No active models found for category: ${selectedCategory.name}`);
        }

        // Model selection logic based on category
        let selectedModels: string[] = [];

        if (selectedCategory.name === 'American v. Chinese') {
            // Special logic: pick 2 from american group, 2 from chinese group
            const americanModels = models.filter(m => m.model_group === 'american');
            const chineseModels = models.filter(m => m.model_group === 'chinese');

            if (americanModels.length < 2 || chineseModels.length < 2) {
                throw new Error('Insufficient American or Chinese models for balanced selection');
            }

            const shuffledAmerican = americanModels.sort(() => 0.5 - Math.random());
            const shuffledChinese = chineseModels.sort(() => 0.5 - Math.random());

            selectedModels = [
                ...shuffledAmerican.slice(0, 2).map(m => m.model_name),
                ...shuffledChinese.slice(0, 2).map(m => m.model_name)
            ];
        } else {
            // Regular logic: pick 4 random models with weighted selection
            const availableModels = [...models];
            
            for (let i = 0; i < 4 && availableModels.length > 0; i++) {
                const totalWeight = availableModels.reduce((sum, model) => sum + model.weight, 0);
                let randomWeight = Math.random() * totalWeight;
                let selectedIndex = 0;

                for (let j = 0; j < availableModels.length; j++) {
                    randomWeight -= availableModels[j].weight;
                    if (randomWeight <= 0) {
                        selectedIndex = j;
                        break;
                    }
                }

                selectedModels.push(availableModels[selectedIndex].model_name);
                availableModels.splice(selectedIndex, 1); // Remove to avoid duplicates
            }

            // If we need more models and ran out, fall back to simple random selection
            while (selectedModels.length < 4 && models.length >= 4) {
                const shuffledModels = models.sort(() => 0.5 - Math.random());
                selectedModels = shuffledModels.slice(0, 4).map(m => m.model_name);
                break;
            }
        }

        if (selectedModels.length < 4) {
            throw new Error(`Insufficient models selected: ${selectedModels.length}/4`);
        }

        return {
            category: selectedCategory.name,
            topic: selectedTopic.topic,
            models: selectedModels,
            categoryId: selectedCategory.id,
            topicId: selectedTopic.id
        };
    }

    try {
        const debateSelection = await pickDebateFromDatabase();

        // Log the selected debate configuration
        await Log({
            level: "info",
            event_type: "debate_scheduler_selection",
            message: `Selected debate from database`,
            detail: JSON.stringify(debateSelection),
        });

        console.log('[SCHEDULER] Selected debate configuration:', {
            category: debateSelection.category,
            topic: debateSelection.topic,
            models: debateSelection.models,
            categoryId: debateSelection.categoryId,
            topicId: debateSelection.topicId,
            timestamp: new Date().toISOString()
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const startDebateResponse = await fetch(`${baseUrl}/api/debate/start`, {
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
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!startDebateResponse.ok) {
                const errorText = await startDebateResponse.text();
                await Log({
                    level: "error",
                    event_type: "debate_start_failed",
                    message: `Failed to start debate: ${startDebateResponse.status}`,
                    detail: errorText,
                });

                console.error('[SCHEDULER] Failed to start debate:', {
                    status: startDebateResponse.status,
                    error: errorText,
                    debateSelection,
                    timestamp: new Date().toISOString()
                });

                return NextResponse.json({ 
                    error: 'Failed to start debate', 
                    status: startDebateResponse.status 
                }, { status: 500 });
            }

            const debateResult = await startDebateResponse.json();
            await Log({
                level: "info",
                event_type: "debate_start_success",
                message: `Successfully started debate ${debateResult.debateId}`,
                detail: JSON.stringify(debateSelection),
            });

            console.log('[SCHEDULER] Successfully started debate:', {
                debateId: debateResult.debateId,
                category: debateSelection.category,
                topic: debateSelection.topic,
                models: debateSelection.models,
                timestamp: new Date().toISOString()
            });

            return NextResponse.json({ 
                message: 'Debate started successfully', 
                debate: debateResult 
            });

        } catch (error: any) {
            await Log({
                level: "error",
                event_type: "debate_start_error",
                message: "Error starting debate from scheduler",
                detail: error.message,
            });

            console.error('[SCHEDULER] Error starting debate:', {
                error: error.message,
                stack: error.stack,
                debateSelection,
                timestamp: new Date().toISOString()
            });

            if (error.name === 'AbortError') {
                return NextResponse.json({ 
                    error: 'Debate start request timed out' 
                }, { status: 408 });
            }

            return NextResponse.json({ 
                error: 'Failed to start debate',
                detail: error.message 
            }, { status: 500 });
        }

    } catch (selectionError: any) {
        await Log({
            level: "error",
            event_type: "debate_selection_error",
            message: "Error selecting debate configuration from database",
            detail: selectionError.message,
        });

        console.error('[SCHEDULER] Error selecting debate from database:', {
            error: selectionError.message,
            stack: selectionError.stack,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({ 
            error: 'Failed to select debate configuration',
            detail: selectionError.message 
        }, { status: 500 });
    }
}