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
    messages: string;
};

type VoteParams = {
    debateId: string;
    topic: string;
    models: string[];
};


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
    // Keep the debate going until maxTurns is reached, does most of the heavy lifting. This calls all the other functions
    let keepGoing = true;
    const systemPrompt = "You are a helpful AI assistant participating in a debate."; 

    while(keepGoing) {

        // Check if the debate has been told to abort, pause, or killswitched

                // CHECK FLAGS
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

            return "Could not check flags";
        }

        if (
            (flags?.kill_switch_active === true) ||
            (flags?.debate_paused === true) ||
            (flags?.should_abort === false)
        ) {
            await Log({
                level: "warn",
                event_type: "flag_preventing_debate",
                message: "A flag has stopped this debate.",
            });
            return "A flag has stopped this debate.";
        }
        // END CHECK FLAGS

        // Get all turns so far
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
            await supabaseAdmin
                .from("debates")
                .update({ status: "error" })
                .eq("id", debateId);
            break;
        }

        // Filter out system messages and get only the debate turns
        const nonSystemTurns = turns.filter(turn => turn.model !== "system");

        // Check if we've reached the max turns
        if (nonSystemTurns.length >= maxTurns) {
            keepGoing = false;
            await Log({
                level: "info",
                event_type: "debate_max_turns_reached",
                debate_id: debateId,
                message: `Max turns (${maxTurns}) reached. Starting voting.`,
            });
            try {
                await vote({ debateId, topic, models });
            } catch (voteError) {
                await Log({
                    level: "error",
                    event_type: "voting_error",
                    debate_id: debateId,
                    message: "Error during voting",
                    detail: voteError instanceof Error ? voteError.message : String(voteError),
                });
                await supabaseAdmin
                    .from("debates")
                    .update({ status: "error" })
                    .eq("id", debateId);
            }
            break;
        }

        // Get the current turn index
        const turnIndex = nonSystemTurns.length;
        const modelIndex = turnIndex % models.length;
        const modelName = models[modelIndex];

        // Assign a role/perspective to each model
        const modelRole = `You are ${modelName}, arguing from a specific perspective.`;

        // Construct next prompt with adapted turn data
        const adaptedTurns = turns.map(turn => ({
            model_name: turn.model,
            message: turn.content,
            turn_index: turn.turn_index
        }));

        const prompt = constructPrompt({
            topic,
            turns: adaptedTurns,
            systemPrompt: modelRole, // Use model-specific role
            nextModelName: modelName
        });

        // Log turn start
        await Log({
            level: "info",
            event_type: "turn_start",
            debate_id: debateId,
            model: modelName,
            message: `Turn ${turnIndex} started for model ${modelName}`,
            // turn_id will be available after turnHandler
        });

        // Execute this turn
        try {
            const turnResult = await turnHandler({
                debateId,
                modelName,
                turnIndex,
                topic,
                turns,
                messages: prompt,
            });
            // Log turn end with all details (remove previous duplicate log)
            await Log({
                level: "info",
                event_type: "turn_end",
                debate_id: debateId,
                turn_id: turnResult?.turnId,
                model: modelName,
                message: `Turn ${turnIndex} ended for model ${modelName}`,
                tokens: turnResult?.tokens,
                latency_ms: turnResult?.ttft_ms ?? undefined,
            });
        } catch (error) {
            await Log({
                level: "error",
                event_type: "turn_handler_error",
                debate_id: debateId,
                model: modelName,
                turn_id: undefined,
                message: `Error in turnHandler for turn ${turnIndex}`,
                detail: error instanceof Error ? error.message : String(error),
            });
            await supabaseAdmin
                .from("debates")
                .update({ status: "error" })
                .eq("id", debateId);
            break;
        }
    }
}


export async function turnHandler({ debateId, modelName, turnIndex, topic, turns, messages }: TurnHandlerParams) {
    // Keep track of whos turn it is and calls the model to get a response
    
    // No flag check here, this is called from runDebate which already checks flags

    // make a new turn in the database with empty content
    const { data: newTurn, error: newTurnError } = await supabaseAdmin
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
            event_type: "turn_create_error",
            debate_id: debateId,
            turn_id: undefined,
            model: modelName,
            message: `Error creating new turn for model ${modelName}`,
            detail: newTurnError.message,
        });
        throw new Error("Failed to create new turn");
    }

    // Call model and stream from openrouter
    let content = "";
    let tokens = 0;
    let ttft_ms: number | null = null;
    const startedAt = Date.now();

    try {
        let firstToken = true;
        for await (const token of openrouterStream({ model: modelName, messages: [messages] })) {
            if (firstToken) {
                ttft_ms = Date.now() - startedAt;
                firstToken = false;
            }
            content += token;
            tokens++;

            // Batch DB updates every 5 tokens to reduce load
            if (tokens === 1 || tokens % 5 === 0) {
                await supabaseAdmin
                    .from("debate_turns")
                    .update({
                        content,
                        tokens,
                        ttft_ms,
                    })
                    .eq("id", newTurn.id);
            }
        }
    } catch (error: any) {
        await Log({
            level: "error",
            event_type: "turn_stream_error",
            debate_id: debateId,
            turn_id: newTurn?.id,
            model: modelName,
            message: `Error streaming tokens for model ${modelName}`,
            detail: error instanceof Error ? error.message : String(error),
        });

        // Log error in the database, scoped to the specific turn
        if (newTurn && newTurn.id) {
            await supabaseAdmin
                .from("debate_turns")
                .update({
                    error: error.message,
                    finished_at: new Date().toISOString(),
                })
                .eq("id", newTurn.id);
        }
        
        // Propagate the error to allow runDebate to handle it
        throw error;
    }
    
    // Finish up turn, update statistics and set finished_at
    // Ensure newTurn is defined before trying to access its id
    if (newTurn && newTurn.id) {

        await supabaseAdmin
            .from("debate_turns")
            .update({
                content,
                tokens,
                ttft_ms,
                finished_at: new Date().toISOString(),
            })
            .eq("id", newTurn.id);

        // Update the debate's current turn index and model
        await supabaseAdmin
            .from("debates")
            .update({
                current_turn_idx: turnIndex,
                current_model: modelName,
            })
            .eq("id", debateId);

        // Final return
        return {
            turnId: newTurn.id,
            content,
            tokens,
            ttft_ms,
            finishedAt: new Date().toISOString(),
        };
    }
    
    throw new Error("Turn creation failed: newTurn is undefined");
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
    } else if (winners.length === 1) {
        await Log({
            level: "info",
            event_type: "voting_winner",
            debate_id: debateId,
            message: `Winner: ${winners[0]}`,
        });
        winner = winners[0];
    } else {
        await Log({
            level: "info",
            event_type: "voting_tie",
            debate_id: debateId,
            message: `Tie between models: ${winners.join(', ')}`,
        });
        winner = "tie";
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

