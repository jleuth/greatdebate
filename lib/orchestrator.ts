import { supabaseAdmin } from "./supabaseAdmin";
import Log from "./logger";
import { openrouterStream } from "./openRouter";
import { constructPrompt, constructVotingPrompt, getDebateSystemPrompt } from "./constructPrompt";

type StartDebateParams = {
    topic: string;
    models: string[];
    maxTurns?: number;
    category: string;
};

type RunDebateParams = {
  debateId: string;
  topic: string;
  models: any[];
  maxTurns: number;
};

type TurnHandlerParams = {
    debateId: string;
    modelName: string;
    turnIndex: number;
    topic: string;
    turns: any[];
    messages: any[];
};

type VoteParams = {
    debateId: string;
    topic: string;
    models: string[];
};

// New type for the result of turnHandler
type TurnHandlerResult =
    | { status: "success"; turnId: string; content: string }
    | { status: "timeout"; turnId: string; message: string } // Timeout occurred
    | { status: "error"; turnId: string | null; message: string }; // Other errors (turnId null if DB insert failed)

// Function to check if all active models have motioned to end the debate
async function checkMotionToEndDebate(debateId: string, models: string[]): Promise<{ shouldEnd: boolean; motionCount: number }> {
    try {
        // Get the most recent turn for each model (excluding system turns and errors)
        const { data: recentTurns, error } = await supabaseAdmin
            .from("debate_turns")
            .select("model, content, turn_index")
            .eq("debate_id", debateId)
            .neq("model", "system")
            .neq("content", "[Model returned empty response]")
            .order("turn_index", { ascending: false });

        if (error) {
            await Log({
                level: "error",
                event_type: "motion_check_error",
                debate_id: debateId,
                message: "Error checking for motion to end debate",
                detail: error.message,
            });
            return { shouldEnd: false, motionCount: 0 };
        }

        if (!recentTurns || recentTurns.length === 0) {
            return { shouldEnd: false, motionCount: 0 };
        }

        // Group turns by model to get the most recent turn for each model
        const mostRecentByModel: { [model: string]: string } = {};
        for (const turn of recentTurns) {
            if (!mostRecentByModel[turn.model]) {
                mostRecentByModel[turn.model] = turn.content;
            }
        }

        // Check how many models have the exact motion phrase in their most recent turn
        const motionPhrase = "I motion to end debate.";
        let motionCount = 0;
        let modelsWithTurns = 0;

        for (const model of models) {
            if (mostRecentByModel[model]) {
                modelsWithTurns++;
                if (mostRecentByModel[model].includes(motionPhrase)) {
                    motionCount++;
                }
            }
        }

        await Log({
            level: "info",
            event_type: "motion_check_result",
            debate_id: debateId,
            message: `Motion check: ${motionCount}/${modelsWithTurns} models have motioned`,
            detail: JSON.stringify({
                motionCount,
                modelsWithTurns,
                totalModels: models.length,
                motionsNeeded: modelsWithTurns,
                modelStatuses: models.map(model => ({
                    model,
                    hasTurn: !!mostRecentByModel[model],
                    hasMotion: mostRecentByModel[model]?.includes(motionPhrase) || false,
                    content: mostRecentByModel[model]?.substring(0, 100) + (mostRecentByModel[model]?.length > 100 ? '...' : '')
                }))
            })
        });

        // All models that have made turns must have motioned
        const shouldEnd = modelsWithTurns > 0 && motionCount === modelsWithTurns;
        
        return { shouldEnd, motionCount };

    } catch (error) {
        await Log({
            level: "error",
            event_type: "motion_check_exception",
            debate_id: debateId,
            message: "Exception while checking motion to end debate",
            detail: error instanceof Error ? error.message : String(error),
        });
        return { shouldEnd: false, motionCount: 0 };
    }
}


export async function startDebate({ topic, models, category, maxTurns = 40 }: StartDebateParams) {
    // This function sets up debate and calls runDebate to sustain the debate

            // CHECK FLAGS
            const { data: flags, error: flagerror } = await supabaseAdmin
                .from('flags')
                .select('kill_switch_active, debate_paused, enable_new_debates')
                .single();
    
            if (flagerror) {
                await Log({
                    level: "error",
                    event_type: "flag_error",
                    message: "Error fetching flags",
                    detail: flagerror.message,
                });

                return "Could not check flags";
            }
    
            if (
                (flags?.kill_switch_active === true) ||
                (flags?.debate_paused === true) ||
                (flags?.enable_new_debates === false)
            ) {
                await Log({
                    level: "warn",
                    event_type: "flag_preventing_debate",
                    message: "A flag is preventing a new debate from starting.",
                });
                // Send system message to chat
                // We don't have a debateId yet, so this message is general
                // Consider if a global system message channel is needed or if this is fine if it doesn't appear in a specific debate
                return "A flag is preventing a new debate from starting.";
            }
            // END CHECK FLAGS

    // 1. Create a new debate in the database
    const { data: debate, error: debateError } = await supabaseAdmin
        .from("debates")
        .insert({
            topic,
            model_a: models[0],
            model_b: models[1],
            model_c: models[2],
            model_d: models[3],
            current_turn_idx: 0,
            current_model: models[0],
            status: "running",
            started_at: new Date().toISOString(),
            category,
        })
        .select()
        .single();

        if (debateError) {
            await Log({
                level: "error",
                event_type: "debate_create_error",
                message: "Error creating debate",
                detail: debateError.message,
            });
            throw new Error("Failed to create debate");
        }
    await Log({
        level: "info",
        event_type: "debate_started",
        debate_id: debate.id,
        message: `Debate started on topic: ${topic}`,
        detail: `Models: ${models.join(", ")}, Category: ${category}`,
    });

    // Send a message to the live chat from system saying a new debate has started
    const { error: messageError } = await supabaseAdmin
        .from("debate_turns")
        .insert({
            debate_id: debate.id,
            model: "system",
            turn_index: 0,
            content: `A new debate has started on the topic: "${topic}" with models: ${models.join(", ")}. The category of models in play is ${category}.`,
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: null,
        });
    if (messageError) {
        await Log({
            level: "error",
            event_type: "system_message_error",
            debate_id: debate.id,
            message: "Error sending system message",
            detail: messageError.message,
        });
        throw new Error("Failed to send system message");
    }

    // 2. Start runDebate in the background (fire-and-forget)
    runDebate({
        debateId: debate.id,
        topic,
        models,
        maxTurns,
    }).catch(error => {
        // Handle errors in background
        Log({
            level: "error",
            event_type: "debate_run_error",
            debate_id: debate.id,
            message: "Debate failed at runDebate",
            detail: error instanceof Error ? error.message : String(error),
        });
        console.error("Debate failed at runDebate:", error);
    });

    // 3. Return the debate info so the client can display it
    return {
        debateId: debate.id,
        topic,
        models,
        status: debate.status,
        startedAt: debate.started_at,
    }
}

export default async function runDebate({ debateId, topic, models, maxTurns }: RunDebateParams) {
    await Log({
        level: "info",
        event_type: "run_debate_started",
        debate_id: debateId,
        message: `runDebate function called for debate ${debateId}`,
        detail: `Topic: ${topic}, Models: ${models.join(", ")}, MaxTurns: ${maxTurns}`,
    });

    console.log(`[RUN_DEBATE] Starting runDebate for debate ${debateId}`, {
        topic,
        models,
        maxTurns,
        timestamp: new Date().toISOString()
    });

    const PAUSE_DELAY_MS = 10000; // 10s between pause checks
    const TURN_DELAY_MS = 5000; // 5s seconds between turns for better pacing
    const FIRST_TURN_DELAY_MS = 3000; // 3 seconds before first turn starts
    let totalSkippedTurns = 0; // Counter for model timeouts
    const MAX_SKIPPED_TURNS = 3; // Max allowed timeouts before aborting debate
    let loopIterations = 0;
    const MAX_LOOP_ITERATIONS = maxTurns * 3; // Safety valve to prevent infinite loops

    // Small delay before starting the first turn to let users see the debate has begun
    console.log(`[DEBATE_PACING] Starting debate with ${FIRST_TURN_DELAY_MS}ms initial delay`, {
        debateId,
        timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, FIRST_TURN_DELAY_MS));

    while (true) {
        loopIterations++;
        if (loopIterations > MAX_LOOP_ITERATIONS) {
            await Log({
                level: "error",
                event_type: "debate_loop_safety_exit",
                debate_id: debateId,
                message: `Debate loop exceeded ${MAX_LOOP_ITERATIONS} iterations, safety exit triggered`,
            });
            await supabaseAdmin.from("debates").update({ 
                status: "error", 
                detail: "Safety exit: too many loop iterations"
            }).eq("id", debateId);
            return { error: true, type: "safety_exit", message: "Loop safety limit exceeded" };
        }
        // Add Log for debug tracking of debate loop iterations (optional)
        console.log(`[DEBATE_LOOP] Starting debate loop iteration ${loopIterations} for debate ${debateId}`, {
            debateId,
            iteration: loopIterations,
            timestamp: new Date().toISOString()
        });
        
        // --- 1. CHECK FLAGS ---
        console.log(`[DEBATE_LOOP] Checking flags for debate ${debateId}, iteration ${loopIterations}`, {
            debateId,
            iteration: loopIterations,
            timestamp: new Date().toISOString()
        });
        
        const { data: flags, error: flagerror } = await supabaseAdmin
            .from('flags')
            .select('kill_switch_active, debate_paused, should_abort')
            .single();

        if (flagerror) {
            await Log({
                level: "error",
                event_type: "flag_error",
                message: "Error fetching flags",
                detail: flagerror.message,
            });
            try {
                await supabaseAdmin.from("debates").update({ status: "error" }).eq("id", debateId);
            } catch (dbErr) {
                await Log({
                    level: "error",
                    event_type: "db_update_error",
                    debate_id: debateId,
                    message: "Failed to update debate status to error after flag fetch failure",
                    detail: dbErr instanceof Error ? dbErr.message : String(dbErr),
                });
            }
            return { error: true, type: "flag_error", message: "Could not check flags" };
        }

        if (flags?.kill_switch_active === true || flags?.should_abort === true) {
            await Log({
                level: "warn",
                event_type: "flag_preventing_debate",
                message: "A kill/abort flag has stopped this debate.",
            });
            try {
                await supabaseAdmin.from("debates").update({ status: "aborted" }).eq("id", debateId);
            } catch (dbErr) {
                await Log({
                    level: "error",
                    event_type: "db_update_error",
                    debate_id: debateId,
                    message: "Failed to update debate status to aborted after kill/abort flag",
                    detail: dbErr instanceof Error ? dbErr.message : String(dbErr),
                });
            }
            return { error: true, type: "debate_aborted", message: "A flag has stopped this debate." };
        }

        // --- 2. HANDLE PAUSE ---
        if (flags?.debate_paused === true) {
            await Log({
                level: "info",
                event_type: "debate_paused",
                debate_id: debateId,
                message: "Debate is paused, waiting to resume...",
            });
            // Send system message to chat
            await supabaseAdmin.from("debate_turns").insert({
                debate_id: debateId,
                model: "system",
                turn_index: -1, // Or a specific turn_index for system messages
                content: "The debate is currently paused. Waiting to resume...",
                tokens: 0,
                ttft_ms: null,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(), // System messages are instant
            });
            // Sleep, then re-check flags in a loop
            let stillPaused = true;
            while (stillPaused) {
                await new Promise(resolve => setTimeout(resolve, PAUSE_DELAY_MS));
                try {
                    const { data: pauseFlags, error: pauseFlagError } = await supabaseAdmin
                        .from('flags')
                        .select('debate_paused')
                        .single();
                    if (pauseFlagError) {
                        await Log({
                            level: "error",
                            event_type: "flag_error",
                            debate_id: debateId,
                            message: "Error re-fetching flags during pause",
                            detail: pauseFlagError.message,
                        });
                        break; // break out of pause if we can't check
                    }
                    stillPaused = pauseFlags?.debate_paused === true;
                } catch (err) {
                    await Log({
                        level: "error",
                        event_type: "pause_loop_error",
                        debate_id: debateId,
                        message: "Exception in pause re-check loop",
                        detail: err instanceof Error ? err.message : String(err),
                    });
                    break;
                }
            }
            await Log({
                level: "info",
                event_type: "debate_resumed",
                debate_id: debateId,
                message: "Debate has resumed.",
            });
            // Send system message to chat
            await supabaseAdmin.from("debate_turns").insert({
                debate_id: debateId,
                model: "system",
                turn_index: -1, 
                content: "The debate has resumed.",
                tokens: 0,
                ttft_ms: null,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            });
            continue;
        }

        // --- 3. FETCH CURRENT TURNS ---
        console.log(`[DEBATE_LOOP] Fetching turns for debate ${debateId}, iteration ${loopIterations}`, {
            debateId,
            iteration: loopIterations,
            timestamp: new Date().toISOString()
        });
        
        const { data: turns, error: turnsError } = await supabaseAdmin
            .from("debate_turns")
            .select("*")
            .eq("debate_id", debateId)
            .order("turn_index", { ascending: true });

        if (turnsError) {
            await Log({
                level: "error",
                event_type: "turns_fetch_error",
                debate_id: debateId,
                message: "Error fetching turns",
                detail: turnsError.message,
            });
            await supabaseAdmin.from("debates").update({ status: "error" }).eq("id", debateId);
            return "Failed to fetch turns";
        }

        const nonSystemTurns = turns.filter(turn => turn.model !== "system");

        console.log(`[DEBATE_LOOP] Turn count check for debate ${debateId}, iteration ${loopIterations}`, {
            debateId,
            iteration: loopIterations,
            totalTurns: turns.length,
            nonSystemTurns: nonSystemTurns.length,
            maxTurns,
            willStartVoting: nonSystemTurns.length >= maxTurns,
            timestamp: new Date().toISOString()
        });

        // --- 4. CHECK MAX TURNS ---
        if (nonSystemTurns.length >= maxTurns) {
            await Log({
                level: "info",
                event_type: "debate_max_turns_reached",
                debate_id: debateId,
                message: `Max turns (${maxTurns}) reached. Starting voting phase.`,
            });
            
            console.log(`[VOTING] Max turns reached for debate ${debateId}, starting voting phase`, {
                debateId,
                maxTurns,
                actualTurns: nonSystemTurns.length,
                timestamp: new Date().toISOString()
            });

            // Fire-and-forget voting - let vote() handle its own errors
            vote({
                debateId,
                topic,
                models,
            }).catch(async (votingError) => {
                // Log the error but don't propagate it
                await Log({
                    level: "error",
                    event_type: "voting_error_background",
                    debate_id: debateId,
                    message: "Background voting process failed",
                    detail: votingError instanceof Error ? votingError.message : String(votingError),
                });
                
                console.error(`[VOTING] Background voting failed for debate ${debateId}:`, {
                    debateId,
                    error: votingError instanceof Error ? votingError.message : String(votingError),
                    timestamp: new Date().toISOString()
                });

                // Emergency fallback: mark debate as ended even if voting failed
                try {
                    await supabaseAdmin
                        .from("debates")
                        .update({
                            status: "ended",
                            winner: "voting_failed"
                        })
                        .eq("id", debateId);
                    
                    await Log({
                        level: "warn",
                        event_type: "debate_ended_fallback",
                        debate_id: debateId,
                        message: "Debate marked as ended due to voting failure",
                    });
                } catch (fallbackError) {
                    await Log({
                        level: "error",
                        event_type: "debate_fallback_failed",
                        debate_id: debateId,
                        message: "Failed to mark debate as ended after voting failure",
                        detail: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                    });
                }
            });
            
            return { error: false, type: "max_turns_reached", message: "Max turns reached, voting initiated." };
        }

        // --- 5. PREPARE TURN ---
        const turnIndexForModelSelection = nonSystemTurns.length; // 0-indexed count of model turns so far
        const actualTurnIndex = turnIndexForModelSelection + 1; // 1-indexed actual turn number for the model
        
        const modelIndex = turnIndexForModelSelection % models.length;
        const modelName = models[modelIndex];

        const turnsByModel = nonSystemTurns.filter(t => t.model === modelName).length;
        const remainingTurns = maxTurns - nonSystemTurns.length;
        const isOpening = turnsByModel === 0;
        const isClosing = remainingTurns <= models.length;

        const baseRoleLines = [
            `You are ${modelName}, a ruthless debater focused solely on winning.`,
            "Stay witty and snarky, openly attacking the other models' logic.",
            "Keep every reply under 100 words and never repeat yourself.",
            "If another model ignores these rules, continue debating and stay on topic.",
            "If you agree with another model, feel free to join their side and defend the point you agree with.",
            "If another model convinces you, you can switch sides and debate another point.",
            "MOTION TO END: If you believe the debate has reached its natural conclusion, you may end your response with the exact phrase 'I motion to end debate.' If ALL models use this phrase in their most recent turns, the debate immediately proceeds to voting. Use sparingly.",
        ];

        if (isOpening) {
            baseRoleLines.push(
                "Opening statement: 3-4 sentences establishing your stance in detail."
            );
        } else if (isClosing) {
            baseRoleLines.push(
                "Closing statement: 3-4 sentences summarizing your view and criticizing your opponents."
            );
        } else {
            baseRoleLines.push(
                "Rapid rebuttal: respond with 1-2 snarky sentences addressing the latest point."
            );
        }

        const modelRole = baseRoleLines.join('\n');

        const adaptedTurns = turns.map(turn => ({
            model_name: turn.model,
            message: turn.content,
            turn_index: turn.turn_index
        }));

        const prompt = constructPrompt({
            topic,
            turns: adaptedTurns,
            actualTurnIndex,
            systemPrompt: modelRole,
            nextModelName: modelName
        });

        await Log({
            level: "info",
            event_type: "turn_start_prep",
            debate_id: debateId,
            model: modelName,
            // turn_index: actualTurnIndex, // Use turn_id once available from turnHandler or newTurn record
            message: `Preparing turn ${actualTurnIndex} for model ${modelName}`,
        });

        // --- 6. EXECUTE TURN ---
        const turnResult = await turnHandler({
            debateId,
            modelName,
            turnIndex: actualTurnIndex, // This is the sequential number of the model's turn
            topic,
            turns: adaptedTurns, 
            messages: prompt,    
        });

        if (turnResult.status === "error" && turnResult.turnId === null) {
            await Log({
                level: "error", 
                event_type: "turn_handler_critical_failure",
                debate_id: debateId,
                message: `Critical failure in turnHandler for debate ${debateId}: ${turnResult.message}. Ending debate.`,
                detail: turnResult.message,
            });
            await supabaseAdmin.from("debates").update({ status: "error", detail: `Turn handler critical error: ${turnResult.message}` }).eq("id", debateId);
            return { error: true, type: "turn_handler_critical", message: `Critical failure: ${turnResult.message}` };
        }

        if (turnResult.status === "timeout") {
            totalSkippedTurns++;
            await Log({
                level: "warn",
                event_type: "model_turn_timeout",
                debate_id: debateId,
                model: modelName,
                turn_id: turnResult.turnId ?? undefined, // Log with the actual turn ID
                message: `Model ${modelName} timed out on turn ${actualTurnIndex} (ID: ${turnResult.turnId}). Total skipped turns: ${totalSkippedTurns}.`,
            });

            // Send system message to chat about the timeout
            await supabaseAdmin.from("debate_turns").insert({
                debate_id: debateId,
                model: "system",
                turn_index: -1,
                content: `${modelName} timed out (45 seconds) and was skipped.`,
                tokens: 0,
                ttft_ms: null,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            });

            if (totalSkippedTurns >= MAX_SKIPPED_TURNS) {
                await Log({
                    level: "error",
                    event_type: "debate_aborted_max_skips",
                    debate_id: debateId,
                    message: `Debate ${debateId} aborted after ${totalSkippedTurns} model timeouts.`,
                });
                await supabaseAdmin
                    .from("debates")
                    .update({ status: "error", detail: `Aborted after ${totalSkippedTurns} model timeouts.` })
                    .eq("id", debateId);
                // Send system message to chat
                await supabaseAdmin.from("debate_turns").insert({
                    debate_id: debateId,
                    model: "system",
                    turn_index: -1,
                    content: `Debate aborted after ${totalSkippedTurns} model timeouts.`,
                    tokens: 0,
                    ttft_ms: null,
                    started_at: new Date().toISOString(),
                    finished_at: new Date().toISOString(),
                });
                return { error: true, type: "debate_aborted_max_skips", message: `Debate aborted after ${totalSkippedTurns} model timeouts.` };
            }
        } else if (turnResult.status === "error") { 
            await Log({
                level: "warn",
                event_type: "turn_processing_issue",
                debate_id: debateId,
                model: modelName,
                turn_id: turnResult.turnId ?? undefined, // Log with the actual turn ID
                message: `Issue processing turn ${actualTurnIndex} (ID: ${turnResult.turnId}) for ${modelName}. Status: ${turnResult.status}, Detail: ${turnResult.message}`,
            });
        }

        // --- 7. CHECK FOR MOTION TO END DEBATE ---
        // Only check if the turn was successful (we have new content)
        if (turnResult.status === "success") {
            const motionResult = await checkMotionToEndDebate(debateId, models);
            
            if (motionResult.shouldEnd) {
                await Log({
                    level: "info",
                    event_type: "motion_to_end_passed",
                    debate_id: debateId,
                    message: `All active models (${motionResult.motionCount}) have motioned to end debate, starting voting`,
                });

                // Send system message announcing the motion passed
                await supabaseAdmin.from("debate_turns").insert({
                    debate_id: debateId,
                    model: "system",
                    turn_index: -1,
                    content: `All models have motioned to end the debate. Proceeding to voting.`,
                    tokens: 0,
                    ttft_ms: null,
                    started_at: new Date().toISOString(),
                    finished_at: new Date().toISOString(),
                });

                // Update debate status to voting
                await supabaseAdmin
                    .from("debates")
                    .update({
                        status: "voting",
                        last_activity_at: new Date().toISOString(),
                    })
                    .eq("id", debateId);

                // Fire-and-forget voting - let vote() handle its own errors
                vote({
                    debateId,
                    topic,
                    models,
                }).catch(async (votingError) => {
                    // Log the error but don't propagate it
                    await Log({
                        level: "error",
                        event_type: "voting_error_motion",
                        debate_id: debateId,
                        message: "Background voting process failed after motion to end",
                        detail: votingError instanceof Error ? votingError.message : String(votingError),
                    });
                    
                    console.error(`[VOTING] Motion-triggered voting failed for debate ${debateId}:`, {
                        debateId,
                        error: votingError instanceof Error ? votingError.message : String(votingError),
                        timestamp: new Date().toISOString()
                    });

                    // Emergency fallback: mark debate as ended even if voting failed
                    try {
                        await supabaseAdmin
                            .from("debates")
                            .update({
                                status: "ended",
                                winner: "voting_failed"
                            })
                            .eq("id", debateId);
                        
                        await Log({
                            level: "warn",
                            event_type: "debate_ended_motion_fallback",
                            debate_id: debateId,
                            message: "Debate marked as ended due to voting failure after motion",
                        });
                    } catch (fallbackError) {
                        await Log({
                            level: "error",
                            event_type: "debate_motion_fallback_failed",
                            debate_id: debateId,
                            message: "Failed to mark debate as ended after motion voting failure",
                            detail: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                        });
                    }
                });
                
                return { error: false, type: "motion_to_end", message: "All models motioned to end debate, voting initiated." };
            }
        }

        const nextTurnNumberInDebate = actualTurnIndex + 1; 
        const indexOfCurrentModel = models.indexOf(modelName);
        const indexOfNextModel = (indexOfCurrentModel + 1) % models.length;
        const nextModelToPlay = models[indexOfNextModel];

        await supabaseAdmin
            .from("debates")
            .update({
                current_turn_idx: nextTurnNumberInDebate,
                current_model: nextModelToPlay,
                last_activity_at: new Date().toISOString(),
            })
            .eq("id", debateId);

        // --- 7. TURN PACING ---
        // Delay before the next turn to control debate pacing
        console.log(`[DEBATE_PACING] Delaying for ${TURN_DELAY_MS}ms before next turn`, {
            debateId,
            currentTurn: actualTurnIndex,
            nextModel: nextModelToPlay,
            timestamp: new Date().toISOString()
        });
        await new Promise(resolve => setTimeout(resolve, TURN_DELAY_MS));
    }
}


export async function turnHandler({ debateId, modelName, turnIndex, topic, turns, messages }: TurnHandlerParams): Promise<TurnHandlerResult> {
    await Log({
        level: "info",
        event_type: "turn_handler_invoked",
        debate_id: debateId,
        model: modelName,
        message: `Turn handler invoked for model ${modelName}, turn sequence ${turnIndex}.`,
    });

    // Use transaction to ensure atomicity of turn creation and updates
    const { data: newTurnData, error: newTurnError } = await supabaseAdmin
        .from("debate_turns")
        .insert({
            debate_id: debateId,
            model: modelName,
            turn_index: turnIndex,
            content: "", 
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: null, 
        })
        .select()
        .single();

    if (newTurnError) {
        await Log({
            level: "error",
            event_type: "db_turn_create_error",
            debate_id: debateId,
            model: modelName,
            message: "Error creating new turn record in database",
            detail: newTurnError.message,
        });
        return { status: "error", turnId: null, message: `Failed to create turn record: ${newTurnError.message}` };
    }
    const newTurn = newTurnData;

    const FIRST_TOKEN_TIMEOUT_MS = 45 * 1000; // 45 seconds 
    let ttft_ms: number | null = null;
    const turnStartTime = Date.now();
    let streamedContent = ""; 
    let tokensCount = 0; 
    let firstTokenReceived = false;

    try {
        // Try streaming first, fallback to direct if it fails
        let streamingSuccess = false;
        
        try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const response = await fetch(`${baseUrl}/api/debate/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SERVER_TOKEN}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages
                }),
            });

            if (!response.ok) {
                throw new Error(`Stream API responded with status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body reader available');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => {
                    if (!firstTokenReceived) {
                        reject(new Error("First token timeout")); 
                    }
                }, FIRST_TOKEN_TIMEOUT_MS)
            );

            const streamProcessor = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        
                        // Process complete lines
                        while (true) {
                            const lineEnd = buffer.indexOf('\n\n');
                            if (lineEnd === -1) break;

                            const line = buffer.slice(0, lineEnd).trim();
                            buffer = buffer.slice(lineEnd + 2);

                            if (!line || !line.startsWith('data: ')) continue;
                            
                            const data = line.slice(6);
                            if (data === '[DONE]') return;

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.error) {
                                    throw new Error(parsed.error);
                                }
                                
                                const content = parsed.content;
                                if (content) {
                                    if (!firstTokenReceived) {
                                        firstTokenReceived = true;
                                        ttft_ms = Date.now() - turnStartTime;
                                        await supabaseAdmin
                                            .from("debate_turns")
                                            .update({ 
                                                ttft_ms,
                                                content: content // Start updating content immediately
                                            })
                                            .eq("id", newTurn.id);
                                    }
                                    streamedContent += content;
                                    
                                    // Update content in real-time for streaming display
                                    await supabaseAdmin
                                        .from("debate_turns")
                                        .update({ content: streamedContent })
                                        .eq("id", newTurn.id);
                                }
                            } catch (parseError) {
                                // Ignore JSON parse errors for malformed chunks
                                console.warn('Failed to parse streaming chunk:', line);
                            }
                        }
                    }
                } finally {
                    reader.cancel();
                }
            };

            await Promise.race([streamProcessor(), timeoutPromise]);
            streamingSuccess = true;
            
        } catch (streamError) {
            await Log({
                level: "warn",
                event_type: "streaming_fallback_triggered",
                debate_id: debateId,
                model: modelName,
                turn_id: newTurn.id,
                message: `Streaming failed, falling back to direct API: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
            });
            
            // Reset state for fallback
            streamedContent = "";
            firstTokenReceived = false;
            ttft_ms = null;
            
            // Fallback to direct openrouterStream
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => {
                    if (!firstTokenReceived) {
                        reject(new Error("First token timeout")); 
                    }
                }, FIRST_TOKEN_TIMEOUT_MS)
            );

            const directStreamProcessor = async () => {
                for await (const chunk of openrouterStream({ model: modelName, messages })) {
                    if (!firstTokenReceived) {
                        firstTokenReceived = true;
                        ttft_ms = Date.now() - turnStartTime;
                        await supabaseAdmin
                            .from("debate_turns")
                            .update({ ttft_ms })
                            .eq("id", newTurn.id);
                    }
                    streamedContent += chunk;
                }
            };

            await Promise.race([directStreamProcessor(), timeoutPromise]);
        }

        if (!firstTokenReceived && streamedContent === "") {
            await Log({
                level: "warn",
                event_type: "model_empty_response",
                debate_id: debateId,
                model: modelName,
                turn_id: newTurn.id,
                message: `Model ${modelName} returned an empty stream for turn ${turnIndex} (ID: ${newTurn.id}).`,
            });
            await supabaseAdmin
                .from("debate_turns")
                .update({
                    content: "[Model returned empty response]",
                    finished_at: new Date().toISOString(),
                    ttft_ms, 
                })
                .eq("id", newTurn.id);
            return { status: "error", turnId: newTurn.id, message: "Model returned an empty stream." };
        }

        const finishedAt = new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
            .from("debate_turns")
            .update({
                content: streamedContent,
                tokens: tokensCount, 
                finished_at: finishedAt,
            })
            .eq("id", newTurn.id);

        if (updateError) {
            await Log({
                level: "error",
                event_type: "db_turn_update_error",
                debate_id: debateId,
                model: modelName,
                turn_id: newTurn.id,
                message: "Error updating turn with final content",
                detail: updateError.message,
            });
            return { status: "error", turnId: newTurn.id, message: `Failed to update turn: ${updateError.message}` };
        }

        await Log({
            level: "info",
            event_type: "turn_completed",
            debate_id: debateId,
            model: modelName,
            turn_id: newTurn.id,
            message: `Turn ${turnIndex} (ID: ${newTurn.id}) for model ${modelName} completed successfully.`,
        });
        return { status: "success", turnId: newTurn.id, content: streamedContent };

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage === "First token timeout";

        await Log({
            level: "error",
            event_type: isTimeout ? "model_turn_timeout_detail" : "turn_handler_execution_error",
            debate_id: debateId,
            model: modelName,
            turn_id: newTurn.id,
            message: `Error during turn ${turnIndex} (ID: ${newTurn.id}) for model ${modelName}: ${errorMessage}`,
            detail: errorMessage,
        });

        const { error: errorUpdateError } = await supabaseAdmin
            .from("debate_turns")
            .update({
                content: `Error: ${errorMessage}`,
                finished_at: new Date().toISOString(),
                ttft_ms, 
            })
            .eq("id", newTurn.id);

        if (errorUpdateError) {
            await Log({
                level: "error",
                event_type: "db_turn_error_update_failed",
                debate_id: debateId,
                model: modelName,
                turn_id: newTurn.id,
                message: "Failed to update turn with error message",
                detail: errorUpdateError.message,
            });
        }

        if (isTimeout) {
            return { status: "timeout", turnId: newTurn.id, message: errorMessage };
        }
        return { status: "error", turnId: newTurn.id, message: errorMessage };
    }
}

export async function vote({ debateId, topic, models }: VoteParams) {
    // Handle the voting process, this func calls the vote turn, not runDebate.

        // CHECK FLAGS
        const { data: flags, error: flagerror } = await supabaseAdmin
        .from('flags')
        .select('kill_switch_active, enable_voting')
        .single();

    if (flagerror) {
        await Log({
            level: "error",
            event_type: "flag_error",
            message: "Error fetching flags",
            detail: flagerror.message,
        });
        // No debateId to send system message to a specific chat here
        return "Could not check flags";
    }

    if (
        (flags?.kill_switch_active === true) ||
        (flags?.enable_voting === false)
    ) {
        await Log({
            level: "warn",
            event_type: "flag_preventing_debate",
            message: "A flag is preventing voting",
        });
        // Send system message to chat
        await supabaseAdmin.from("debate_turns").insert({
            debate_id: debateId,
            model: "system",
            turn_index: -1,
            content: "A system flag is currently preventing voting.",
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
        });
        return "A flag is preventing voting";
    }
    // END CHECK FLAGS

    // Check if the debate is still running, if not, return, if it is, update the status to voting
    const { data: debate, error: debateError } = await supabaseAdmin
        .from("debates")
        .select("*")
        .eq("id", debateId)
        .single();
    if (debateError) {
        await Log({
            level: "error",
            event_type: "voting_debate_fetch_error",
            debate_id: debateId,
            message: "Error fetching debate for voting",
            detail: debateError.message,
        });

        console.error("Error fetching debate:", debateError);
        throw new Error("Failed to fetch debate");
    }
    if (debate.status !== "running") {
        await Log({
            level: "error",
            event_type: "voting_invalid_status",
            debate_id: debateId,
            message: "Attempted to vote on non-running debate",
            detail: `Status: ${debate.status}`,
        });

        console.error("Debate is not running, cannot vote");
        throw new Error("Debate is not running");
    }
    // Update the debate status to voting
    await supabaseAdmin
        .from("debates")
        .update({
            status: "voting",
        })
        .eq("id", debateId);

    await Log({
        level: "info",
        event_type: "voting_started",
        debate_id: debateId,
        message: `Voting started for debate ${debateId}`,
    });
    // Send system message to chat
    await supabaseAdmin.from("debate_turns").insert({
        debate_id: debateId,
        model: "system",
        turn_index: -1,
        content: "The voting phase has begun! Models will now cast their votes.",
        tokens: 0,
        ttft_ms: null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
    });

    // Get all turns and create transcript - exclude system messages for voting
    const { data: turns, error: turnsError } = await supabaseAdmin
        .from("debate_turns")
        .select("*")
        .eq("debate_id", debateId)
        .neq("model", "system") // Filter out system messages
        .order("turn_index", { ascending: true });
    if (turnsError) {
        await Log({
            level: "error",
            event_type: "voting_turns_fetch_error",
            debate_id: debateId,
            message: "Error fetching turns for voting",
            detail: turnsError.message,
        });

        console.error("Error fetching turns:", turnsError);
        throw new Error("Failed to fetch turns");
    }

    // Adapt turns for the voting prompt format
    const adaptedTurns = turns.map(turn => ({
        model_name: turn.model,
        message: turn.content,
        turn_index: turn.turn_index
    }));

    const votes: Record<string, string> = {};

    // For each model, have them vote
    for (const model of models) {
        const prompt = constructVotingPrompt({
            topic,
            turns: adaptedTurns,
            models,
        });

        let votesFor = null;

        try {
            let output = "";
            for await (const chunk of openrouterStream({ model, messages: prompt })) { // Use the complete prompt object
                output += chunk;
            }

            // Parse the output to get the vote - validate against model list
            votesFor = models.find(m => 
                output.trim().toLowerCase().includes(m.toLowerCase())
            );

            // If we couldn't parse a valid model name, store the raw output for debugging
            if (!votesFor) {
                await Log({
                    level: "warn",
                    event_type: "model_invalid_vote",
                    debate_id: debateId,
                    model,
                    message: `Model voted with invalid output: ${output.trim()}`,
                });

                console.warn(`Model ${model} voted with an invalid output: "${output.trim()}""`);
                votesFor = "invalid_vote";
            }

            // Store the vote
            await supabaseAdmin
                .from("debate_votes")
                .insert({
                    debate_id: debateId,
                    voter_model: model,
                    vote_for: votesFor,
                    created_at: new Date().toISOString()
                });

            votes[model] = votesFor;
            await Log({
                level: "info",
                event_type: "model_vote",
                debate_id: debateId,
                model,
                message: `Model ${model} voted for ${votesFor}`,
            });
            // Send system message to chat about the vote
            await supabaseAdmin.from("debate_turns").insert({
                debate_id: debateId,
                model: "system",
                turn_index: -1,
                content: `Model ${model} has voted for ${votesFor}.`,
                tokens: 0,
                ttft_ms: null,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
            });
        } catch (error) {
            await Log({
                level: "error",
                event_type: "model_vote_error",
                debate_id: debateId,
                model,
                message: `Error in voting process for model ${model}`,
                detail: error instanceof Error ? error.message : String(error),
            });
            votes[model] = "Error";
        }
    }

    // Tally the votes and find winner
    const tally: Record<string, number> = {};
    for (const [voter, votedFor] of Object.entries(votes)) {
        if (models.includes(votedFor)) {
            tally[votedFor] = (tally[votedFor] || 0) + 1;
        }
    }

    // Find the model(s) with the most votes
    let maxVotes = 0;
    let winners: string[] = [];
    
    for (const [model, count] of Object.entries(tally)) {
        if (count > maxVotes) {
            maxVotes = count;
            winners = [model];
        } else if (count === maxVotes) {
            winners.push(model);
        }
    }

    // Log the voting results
    await Log({
        level: "info",
        event_type: "winner",
        debate_id: debateId,
        message: `Voting results: ${JSON.stringify(tally)}`,
    });
    // Send system message for overall voting results (raw tally)
    await supabaseAdmin.from("debate_turns").insert({
        debate_id: debateId,
        model: "system",
        turn_index: -1,
        content: `Voting results: ${JSON.stringify(tally)}.`,
        tokens: 0,
        ttft_ms: null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
    });

    // Handle tie or no votes
    let winner = null;
    if (winners.length === 0) {
        await Log({
            level: "warn",
            event_type: "voting_no_valid_votes",
            debate_id: debateId,
            message: "No valid votes were cast",
        });
        winner = "no_valid_votes";
        // Send system message to chat
        await supabaseAdmin.from("debate_turns").insert({
            debate_id: debateId,
            model: "system",
            turn_index: -1,
            content: "No valid votes were cast in this debate.",
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
        });
    } else if (winners.length === 1) {
        await Log({
            level: "info",
            event_type: "voting_winner",
            debate_id: debateId,
            message: `Winner: ${winners[0]}`,
        });
        winner = winners[0];
        // Send system message to chat
        await supabaseAdmin.from("debate_turns").insert({
            debate_id: debateId,
            model: "system",
            turn_index: -1,
            content: `The winner of the debate is: ${winner}!`,
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
        });
    } else {
        await Log({
            level: "info",
            event_type: "voting_tie",
            debate_id: debateId,
            message: `Tie between models: ${winners.join(', ')}`,
        });
        winner = "tie";
        // Send system message to chat
        await supabaseAdmin.from("debate_turns").insert({
            debate_id: debateId,
            model: "system",
            turn_index: -1,
            content: `The debate resulted in a tie between: ${winners.join(', ')}.`,
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
        });
    }

    // Update the debate with the winner - with extensive logging
    await Log({
        level: "info",
        event_type: "debate_status_update_attempt",
        debate_id: debateId,
        message: `Attempting to update debate status to ended`,
        detail: JSON.stringify({
            winner,
            maxVotes,
            totalVotes: Object.values(votes).filter(v => models.includes(v)).length,
            isTie: winners.length > 1,
            votes: votes
        })
    });

    const updateData = {
        winner,
        status: "ended" as const,
        winning_votes: maxVotes,
        total_votes: Object.values(votes).filter(v => models.includes(v)).length,
        is_tie: winners.length > 1
    };

    console.log(`[VOTING] About to update debate ${debateId} with:`, updateData);

    const { data: updateResult, error: statusUpdateError } = await supabaseAdmin
        .from("debates")
        .update(updateData)
        .eq("id", debateId)
        .select(); // Add select to see what was actually updated

    console.log(`[VOTING] Update result for debate ${debateId}:`, { updateResult, error: statusUpdateError });

    if (statusUpdateError) {
        await Log({
            level: "error",
            event_type: "debate_status_update_error",
            debate_id: debateId,
            message: "Failed to update debate status to ended",
            detail: statusUpdateError.message,
        });
        
        // Try again with just the essential fields
        console.log(`[VOTING] Retrying with minimal fields for debate ${debateId}`);
        const { data: retryResult, error: retryError } = await supabaseAdmin
            .from("debates")
            .update({
                status: "ended",
                winner
            })
            .eq("id", debateId)
            .select();

        console.log(`[VOTING] Retry result for debate ${debateId}:`, { retryResult, error: retryError });

        if (retryError) {
            await Log({
                level: "error",
                event_type: "debate_status_retry_failed",
                debate_id: debateId,
                message: "Failed to update debate status even with minimal fields",
                detail: retryError.message,
            });
        } else {
            await Log({
                level: "info",
                event_type: "debate_status_retry_success",
                debate_id: debateId,
                message: "Successfully updated debate status on retry",
            });
        }
    } else {
        await Log({
            level: "info",
            event_type: "debate_status_update_success",
            debate_id: debateId,
            message: "Successfully updated debate status to ended",
            detail: `Updated ${updateResult?.length || 0} rows`
        });
    }


        await Log({
            level: "info",
            event_type: "debate_ended",
            debate_id: debateId,
            message: `The debate ended successfully with votes: ${JSON.stringify(votes)}`,
        });

    // Return the winner
    return {
        winner,
        votes,
        tally,
        tie: winners.length > 1 ? winners : null
    };
}

export async function checkForStaleDebates() {
    const STALE_TIMEOUT_MINUTES = 1; // Consider debates stale after 1 minutes of inactivity
    const staleThreshold = new Date(Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    await Log({
        level: "info",
        event_type: "stale_debate_check_start",
        message: "Checking for stale debates on server startup",
    });

    console.log('[STALE CHECK] Checking for stale debates on server startup', {
        staleTimeoutMinutes: STALE_TIMEOUT_MINUTES,
        staleThreshold,
        currentTime: new Date().toISOString()
    });

    // Find debates that are still "running" or "voting" but haven't had activity recently
    const { data: staleDebates, error: debateError } = await supabaseAdmin
        .from("debates")
        .select("*")
        .in("status", ["running", "voting"])
        .lt("last_activity_at", staleThreshold);

    if (debateError) {
        await Log({
            level: "error",
            event_type: "stale_debate_check_error",
            message: "Error checking for stale debates",
            detail: debateError.message,
        });

        console.error('[STALE CHECK ERROR] Error checking for stale debates:', {
            error: debateError.message,
            code: debateError.code,
            staleThreshold,
            timestamp: new Date().toISOString()
        });
        return { error: true, message: "Failed to check for stale debates" };
    }

    console.log(`[STALE CHECK] Stale debate query completed, found ${staleDebates?.length || 0} potential stale debates`, {
        debatesFound: staleDebates?.length || 0,
        staleThreshold,
        timestamp: new Date().toISOString()
    });

    if (!staleDebates || staleDebates.length === 0) {
        await Log({
            level: "info",
            event_type: "no_stale_debates",
            message: "No stale debates found",
        });

        console.log('[STALE CHECK] No stale debates found', {
            staleThreshold,
            timestamp: new Date().toISOString()
        });
        return { error: false, message: "No stale debates found" };
    }

    await Log({
        level: "warn",
        event_type: "stale_debates_found",
        message: `Found ${staleDebates.length} stale debate(s): ${staleDebates.map(d => d.id).join(", ")}`,
    });

    console.warn(`[STALE DEBATES FOUND] Found ${staleDebates.length} stale debate(s): ${staleDebates.map(d => d.id).join(", ")}`, {
        staleDebates: staleDebates.map(d => ({
            id: d.id,
            topic: d.topic,
            status: d.status,
            lastActivity: d.last_activity_at,
            currentModel: d.current_model,
            currentTurn: d.current_turn_idx
        })),
        staleThreshold,
        timestamp: new Date().toISOString()
    });

    // Attempt to resume each stale debate
    const resumedDebates = [];
    const failedResumes = [];

    for (const debate of staleDebates) {
        console.log(`[PROCESSING STALE] Processing stale debate ${debate.id}`, {
            debateId: debate.id,
            topic: debate.topic,
            status: debate.status,
            lastActivity: debate.last_activity_at,
            currentModel: debate.current_model,
            currentTurn: debate.current_turn_idx,
            timeSinceLastActivity: new Date().getTime() - new Date(debate.last_activity_at).getTime()
        });

        try {
            const resumeResult = await resumeStaleDebate(debate);
            if (resumeResult.error) {
                await Log({
                    level: "error",
                    event_type: "resume_stale_debate_failed",
                    debate_id: debate.id,
                    message: `Failed to resume stale debate ${debate.id}`,
                    detail: resumeResult.message,
                });

                console.error(`[RESUME FAILED] Failed to resume stale debate ${debate.id}:`, {
                    debateId: debate.id,
                    error: resumeResult.message,
                    status: debate.status,
                    timestamp: new Date().toISOString()
                });
                failedResumes.push({ debateId: debate.id, error: resumeResult.message });
            } else {
                await Log({
                    level: "info",
                    event_type: "resume_stale_debate_success",
                    debate_id: debate.id,
                    message: `Successfully initiated resume for stale debate ${debate.id}`,
                });

                console.log(`[RESUME SUCCESS] Successfully initiated resume for stale debate ${debate.id}`, {
                    debateId: debate.id,
                    status: debate.status,
                    timestamp: new Date().toISOString()
                });
                resumedDebates.push(debate.id);
            }
        } catch (error) {
            console.error(`[RESUME EXCEPTION] Exception while resuming stale debate ${debate.id}:`, {
                debateId: debate.id,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                status: debate.status,
                timestamp: new Date().toISOString()
            });
            failedResumes.push({ debateId: debate.id, error: "Exception during resume" });
        }
    }

    console.log(`[STALE CHECK COMPLETE] Stale debate check complete. Resumed: ${resumedDebates.length}, Failed: ${failedResumes.length}`, {
        totalProcessed: staleDebates.length,
        resumed: resumedDebates,
        failed: failedResumes,
        resumedCount: resumedDebates.length,
        failedCount: failedResumes.length,
        timestamp: new Date().toISOString()
    });

    return {
        error: false,
        message: `Processed ${staleDebates.length} stale debates`,
        resumed: resumedDebates,
        failed: failedResumes
    };
}

async function resumeStaleDebate(debate: any) {
    await Log({
        level: "info",
        event_type: "resume_stale_debate_attempt",
        debate_id: debate.id,
        message: `Attempting to resume stale debate: ${debate.id}`,
        detail: `Topic: ${debate.topic}, Last activity: ${debate.last_activity_at}`,
    });

    console.log(`[RESUME ATTEMPT] Attempting to resume stale debate: ${debate.id}`, {
        debateId: debate.id,
        topic: debate.topic,
        status: debate.status,
        lastActivity: debate.last_activity_at,
        currentModel: debate.current_model,
        currentTurn: debate.current_turn_idx,
        models: [debate.model_a, debate.model_b, debate.model_c, debate.model_d],
        startedAt: debate.started_at,
        timeSinceLastActivity: new Date().getTime() - new Date(debate.last_activity_at).getTime(),
        timestamp: new Date().toISOString()
    });

    try {
        // Send system message indicating the debate is being resumed
        const { error: systemMessageError } = await supabaseAdmin.from("debate_turns").insert({
            debate_id: debate.id,
            model: "system",
            turn_index: -1,
            content: "This debate was resumed after a server interruption. Continuing from where it left off...",
            tokens: 0,
            ttft_ms: null,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
        });

        if (systemMessageError) {
            console.warn(`[RESUME WARNING] Failed to insert system message for debate resume ${debate.id}:`, {
                error: systemMessageError.message,
                debateId: debate.id,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`[RESUME] System resume message sent successfully for debate ${debate.id}`, {
                debateId: debate.id,
                timestamp: new Date().toISOString()
            });
        }

        // Update last_activity_at to current time
        const { error: updateError } = await supabaseAdmin
            .from("debates")
            .update({ last_activity_at: new Date().toISOString() })
            .eq("id", debate.id);

        if (updateError) {
            console.error(`[RESUME ERROR] Failed to update last_activity_at during resume for debate ${debate.id}:`, {
                error: updateError.message,
                debateId: debate.id,
                timestamp: new Date().toISOString()
            });
            return { error: true, message: "Failed to update debate activity timestamp" };
        }

        console.log(`[RESUME] Updated last_activity_at timestamp for resumed debate ${debate.id}`, {
            debateId: debate.id,
            newTimestamp: new Date().toISOString()
        });

        const models = [debate.model_a, debate.model_b, debate.model_c, debate.model_d];

        console.log(`[RESUME] Resume process proceeding for debate status: ${debate.status}`, {
            debateId: debate.id,
            status: debate.status,
            models: models,
            resumeAction: debate.status === "running" ? "resume_debate_loop" : "resume_voting_process",
            timestamp: new Date().toISOString()
        });

        if (debate.status === "running") {
            // Resume the debate loop
            console.log(`[RESUME RUNNING] Starting resume process for running debate ${debate.id}`, {
                debateId: debate.id,
                topic: debate.topic,
                models: models,
                currentTurn: debate.current_turn_idx,
                currentModel: debate.current_model,
                timestamp: new Date().toISOString()
            });

            try {
                // Start runDebate in the background (fire-and-forget, same as startDebate)
                runDebate({
                    debateId: debate.id,
                    topic: debate.topic,
                    models,
                    maxTurns: 40, // Default max turns - could be made configurable
                }).catch(error => {
                    // Handle errors in background
                    Log({
                        level: "error",
                        event_type: "resumed_debate_run_error",
                        debate_id: debate.id,
                        message: "Resumed debate failed at runDebate",
                        detail: error instanceof Error ? error.message : String(error),
                    });
                    console.error(`[RESUMED DEBATE ERROR] Resumed debate failed at runDebate for ${debate.id}:`, error);
                });

                await Log({
                    level: "info",
                    event_type: "stale_debate_resumed_success",
                    debate_id: debate.id,
                    message: `Successfully resumed running debate: ${debate.id}`,
                });

                console.log(`[RESUME SUCCESS] Successfully resumed running debate: ${debate.id}`, {
                    debateId: debate.id,
                    resumeType: "running_debate",
                    timestamp: new Date().toISOString()
                });

                return { error: false, message: "Debate resumed successfully" };
            } catch (error) {
                await Log({
                    level: "error",
                    event_type: "stale_debate_resume_failed",
                    debate_id: debate.id,
                    message: "Failed to resume running debate",
                    detail: error instanceof Error ? error.message : String(error),
                });

                console.error(`[RESUME FAILED] Failed to resume running debate ${debate.id}:`, {
                    debateId: debate.id,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    resumeType: "running_debate",
                    timestamp: new Date().toISOString()
                });

                // Mark debate as error if resume fails
                const { error: markErrorError } = await supabaseAdmin
                    .from("debates")
                    .update({ 
                        status: "error", 
                        detail: "Failed to resume after server restart"
                    })
                    .eq("id", debate.id);

                if (markErrorError) {
                    console.error(`[RESUME ERROR] Failed to mark debate as error after resume failure ${debate.id}:`, {
                        originalError: error instanceof Error ? error.message : String(error),
                        updateError: markErrorError.message,
                        debateId: debate.id,
                        timestamp: new Date().toISOString()
                    });
                }

                return { error: true, message: "Failed to resume running debate" };
            }
        } else if (debate.status === "voting") {
            // Resume the voting process
            console.log(`[RESUME VOTING] Starting resume process for voting debate ${debate.id}`, {
                debateId: debate.id,
                topic: debate.topic,
                models: models,
                timestamp: new Date().toISOString()
            });

            try {
                await vote({
                    debateId: debate.id,
                    topic: debate.topic,
                    models,
                });

                await Log({
                    level: "info",
                    event_type: "stale_voting_resumed_success",
                    debate_id: debate.id,
                    message: `Successfully resumed voting for debate: ${debate.id}`,
                });

                console.log(`[RESUME SUCCESS] Successfully resumed voting for debate: ${debate.id}`, {
                    debateId: debate.id,
                    resumeType: "voting_process",
                    timestamp: new Date().toISOString()
                });

                return { error: false, message: "Voting resumed successfully" };
            } catch (error) {
                await Log({
                    level: "error",
                    event_type: "stale_voting_resume_failed",
                    debate_id: debate.id,
                    message: "Failed to resume voting",
                    detail: error instanceof Error ? error.message : String(error),
                });

                console.error(`[RESUME FAILED] Failed to resume voting for debate ${debate.id}:`, {
                    debateId: debate.id,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    resumeType: "voting_process",
                    timestamp: new Date().toISOString()
                });

                // Mark debate as error if voting resume fails
                const { error: markErrorError } = await supabaseAdmin
                    .from("debates")
                    .update({ 
                        status: "error", 
                        detail: "Failed to resume voting after server restart"
                    })
                    .eq("id", debate.id);

                if (markErrorError) {
                    console.error(`[RESUME ERROR] Failed to mark debate as error after voting resume failure ${debate.id}:`, {
                        originalError: error instanceof Error ? error.message : String(error),
                        updateError: markErrorError.message,
                        debateId: debate.id,
                        timestamp: new Date().toISOString()
                    });
                }

                return { error: true, message: "Failed to resume voting" };
            }
        } else {
            await Log({
                level: "error",
                event_type: "resume_unknown_status",
                debate_id: debate.id,
                message: "Cannot resume debate with unknown status",
                detail: `Status: ${debate.status}`,
            });

            console.error(`[RESUME ERROR] Cannot resume debate with unknown status: ${debate.status}`, {
                debateId: debate.id,
                status: debate.status,
                validStatuses: ["running", "voting"],
                timestamp: new Date().toISOString()
            });
            return { error: true, message: "Unknown debate status for resume" };
        }
    } catch (error) {
        console.error(`[RESUME EXCEPTION] Unexpected exception during stale debate resume ${debate.id}:`, {
            debateId: debate.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });
        return { error: true, message: "Unexpected error during resume" };
    }
}

