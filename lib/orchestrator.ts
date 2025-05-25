import { supabaseAdmin } from "./supabaseAdmin";
import Log from "./logger";
import { openrouterStream } from "./openRouter";
import { constructPrompt, constructVotingPrompt } from "./constructPrompt";

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

    // 2. Call runDebate to start the debate
    try {
        await runDebate({
            debateId: debate.id,
            topic,
            models,
            maxTurns,
        });
    } catch (error) {
        await Log({
            level: "error",
            event_type: "debate_run_error",
            debate_id: debate.id,
            message: "Debate failed at runDebate",
            detail: error instanceof Error ? error.message : String(error),
        });
        console.error("Debate failed at runDebate:", error);
    }

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
    const PAUSE_DELAY_MS = 10000; // 10s between pause checks
    let totalSkippedTurns = 0; // Counter for model timeouts
    const MAX_SKIPPED_TURNS = 3; // Max allowed timeouts before aborting debate

    while (true) {
        console.log("Starting new debate loop...");
        // --- 1. CHECK FLAGS ---
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
                await supabaseAdmin.from("debates").update({ status: "aborted", ended_at: new Date().toISOString() }).eq("id", debateId);
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

        // --- 4. CHECK MAX TURNS ---
        if (nonSystemTurns.length >= maxTurns) {
            await Log({
                level: "info",
                event_type: "debate_max_turns_reached",
                debate_id: debateId,
                message: `Max turns (${maxTurns}) reached. Ending debate.`,
            });
            await supabaseAdmin
                .from("debates")
                .update({ status: "ended", ended_at: new Date().toISOString(), detail: "Max turns reached." })
                .eq("id", debateId);
            return { error: false, type: "max_turns_reached", message: "Max turns reached." };
        }

        // --- 5. PREPARE TURN ---
        const turnIndexForModelSelection = nonSystemTurns.length; // 0-indexed count of model turns so far
        const actualTurnIndex = turnIndexForModelSelection + 1; // 1-indexed actual turn number for the model
        
        const modelIndex = turnIndexForModelSelection % models.length;
        const modelName = models[modelIndex];

        const modelRole = `You are ${modelName}, arguing from a specific perspective.`;

        const adaptedTurns = turns.map(turn => ({
            model_name: turn.model,
            message: turn.content,
            turn_index: turn.turn_index
        }));

        const prompt = constructPrompt({
            topic,
            turns: adaptedTurns,
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
            await supabaseAdmin.from("debates").update({ status: "error", ended_at: new Date().toISOString(), detail: `Turn handler critical error: ${turnResult.message}` }).eq("id", debateId);
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

            if (totalSkippedTurns >= MAX_SKIPPED_TURNS) {
                await Log({
                    level: "error",
                    event_type: "debate_aborted_max_skips",
                    debate_id: debateId,
                    message: `Debate ${debateId} aborted after ${totalSkippedTurns} model timeouts.`,
                });
                await supabaseAdmin
                    .from("debates")
                    .update({ status: "error", ended_at: new Date().toISOString(), detail: `Aborted after ${totalSkippedTurns} model timeouts.` })
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
    }
}


export async function turnHandler({ debateId, modelName, turnIndex, topic, turns, messages }: TurnHandlerParams): Promise<TurnHandlerResult> {
    await Log({
        level: "info",
        event_type: "turn_handler_invoked",
        debate_id: debateId,
        model: modelName,
        // turn_index: turnIndex, // Keep for sequential understanding if needed, but turn_id is primary key
        message: `Turn handler invoked for model ${modelName}, turn sequence ${turnIndex}.`,
    });

    // Use transaction to ensure atomicity of turn creation and updates
    const { data: newTurnData, error: newTurnError } = await supabaseAdmin
        .from("debate_turns")
        .insert({
            debate_id: debateId,
            model: modelName,
            turn_index: turnIndex, // Store the sequential turn index
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
            // turn_index: turnIndex,
            message: "Error creating new turn record in database",
            detail: newTurnError.message,
        });
        return { status: "error", turnId: null, message: `Failed to create turn record: ${newTurnError.message}` };
    }
    const newTurn = newTurnData;

    const FIRST_TOKEN_TIMEOUT_MS = 5 * 60 * 1000; 
    let ttft_ms: number | null = null;
    const turnStartTime = Date.now();
    let streamedContent = ""; 
    let tokensCount = 0; 
    let firstTokenReceived = false;

    try {
        const generator = openrouterStream({ model: modelName, messages });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => {
                if (!firstTokenReceived) {
                    reject(new Error("First token timeout")); 
                }
            }, FIRST_TOKEN_TIMEOUT_MS)
        );

        const streamProcessor = async () => {
            for await (const chunk of generator) {
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

        await Promise.race([streamProcessor(), timeoutPromise]);

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
        console.error("Error fetching debate:", debateError);
        throw new Error("Failed to fetch debate");
    }
    if (debate.status !== "running") {
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

    // Update the debate with the winner
    await supabaseAdmin
        .from("debates")
        .update({
            winner,
            status: "ended",
            ended_at: new Date().toISOString(),
            winning_votes: maxVotes,
            total_votes: Object.values(votes).filter(v => models.includes(v)).length,
            is_tie: winners.length > 1
        })
        .eq("id", debateId);


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

