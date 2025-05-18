import { supabaseAdmin } from "./supabaseAdmin";
import { openrouterStream } from "./openRouter";
import { constructPrompt, constructVotingPrompt } from "./constructPrompt";

type StartDebateParams = {
    topic: string;
    models: string[];
    maxTurns: number;
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

export async function startDebate({ topic, models, maxTurns = 40 }: StartDebateParams) {
    // This function sets up debate and calls runDebate to sustain the debate

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
        })
        .select()
        .single();

        if (debateError) {
            console.error("Error creating debate:", debateError);
            throw new Error("Failed to create debate");
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
        // Get all turns so far
        const { data: turns, error: turnsError } = await supabaseAdmin
            .from("debate_turns")
            .select("*")
            .eq("debate_id", debateId)
            .order("turn_index", { ascending: true });

        if (turnsError) {
            console.error("Error fetching turns:", turnsError);
            break;
        }

        // Check if we've reached the max turns
        if (turns.length >= maxTurns) {
            keepGoing = false;
            await endDebate({ debateId });
            break;
        }

        // Get the current turn index
        const turnIndex = turns.length;
        const modelName = models[turnIndex % models.length];

        // Construct next prompt
        const prompt = constructPrompt({
            topic,
            turns,
            systemPrompt,
            nextModelName: modelName
        });

        // Execute this turn
        try {
            await turnHandler({
                debateId,
                modelName,
                turnIndex,
                topic,
                turns,
                messages: prompt,
            });
        } catch (error) {
            console.error("Error in turnHandler:", error);
            break;
        }


    }
}


export async function turnHandler({ debateId, modelName, turnIndex, topic, turns, messages }: TurnHandlerParams) {
    // Keep track of whos turn it is and calls the model to get a response
    
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
        console.error("Error creating new turn:", newTurnError);
        throw new Error("Failed to create new turn");
    }

    // Call model and stream fron openrouter
    let content = "";
    let tokens = 0;
    let ttft_ms: number | null = null;
    const startedAt = Date.now();

        try{
            let firstToken = true;
            for await (const token of openrouterStream({ model: modelName, messages: [messages] })) {
                if (firstToken) {
                    ttft_ms = Date.now() - startedAt;
                    firstToken = false;
                }
                content += token;
                tokens ++;

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
    } catch (error:any) {
        console.error("Error streaming tokens:", error);

        // Log error in the database
        await supabaseAdmin
            .from("debate_turns")
            .update({
                error: error.message,
                finished_at: new Date().toISOString(),
            })

    }
    
    // Finish up turn, update statistics and set finished_at
    await supabaseAdmin
        .from("debate_turns")
        .update({
            content,
            tokens,
            ttft_ms,
            finished_at: new Date().toISOString(),
        })
        .eq("id", newTurn.id);

        // Final return
        return {
            turnId: newTurn.id,
            content,
            tokens,
            ttft_ms,
            finishedAt: new Date().toISOString(),
        };
}

export async function vote({ debateId, topic, models }: VoteParams) {
    // Handle the voting process, this func calls the vote turn, not runDebate.

    // Get all turns and create transcript
    const { data: turns, error: turnsError } = await supabaseAdmin
        .from("debate_turns")
        .select("*")
        .eq("debate_id", debateId)
        .order("turn_index", { ascending: true });
    if (turnsError) {
        console.error("Error fetching turns:", turnsError);
        throw new Error("Failed to fetch turns");
    }

    const votes: Record<string, string> = {};

        // For each model, have them vote
        for (const model of models) {
            const prompt = constructVotingPrompt({
                topic,
                turns,
                models,
            });

            let votesFor = null;

            try {
                let output = "";
                for await (const chunk of openrouterStream({ model, messages: [prompt] })) {
                    output += chunk;
                }

                // Parse the output to get the vote
                votesFor = models.find(m => 
                    output.trim().toLowerCase().includes(m.toLowerCase())
                ) || output.trim();

                // Store the vote
                await supabaseAdmin
                    .from("debate_votes")
                    .insert({
                        debate_id: debateId,
                        voter_model: models,
                        vote_for: votesFor,
                        created_at: new Date().toISOString()
                    });

                votes[model] = votesFor;
                
            } catch (error) {
                console.error(`Error in voting process for model ${models}:`, error);
                votes[model] = "Error";
        }
    }

    // Tally the votes and find winner
    const tally: Record<string, number> = {};
    for (const v of Object.values(votes)) {
        if (!models.includes(v)) {
            console.error(`Invalid vote for model ${v}`);
            continue;
        }

        tally[v] = (tally[v] || 0) + 1;
    }

    // Find the model with the most votes
    let winner = null;
    let maxVotes = 0;
    for (const [model, count] of Object.entries(tally)) {
        if (count > maxVotes) {
            maxVotes = count;
            winner = model;
        }
    }
    if (!winner) {
        console.error("No winner found in voting process");
        throw new Error("No winner found");
    }

    // Update the debate with the winner
    await supabaseAdmin
        .from("debates")
        .update({
            winner,
            status: "ended",
            ended_at: new Date().toISOString(),
        })
        .eq("id", debateId);

        // Return the winner
        return {
            winner,
            votes,
            tally,
        };
}

export function endDebate({ debateId }: { debateId: string }) {
    // Finishes up debate, calls vote to have the models vote, then logs the results and ends the debate
}
