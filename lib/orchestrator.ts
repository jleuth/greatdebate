import { supabaseAdmin } from "./supabaseAdmin";
import { openrouterStream } from "./openRouter";
import { start } from "repl";

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
}



export function turnHandler() {
    // Keep track of whos turn it is and calls the model to get a response

}

export function vote() {
    // Handle the voting process, this func calls the vote turn, not runDebate.

}

export function endDebate() {
    // Finishes up debate, calls vote to have the models vote, then logs the results and ends the debate
}

