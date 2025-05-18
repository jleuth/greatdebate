import { supabaseAdmin } from "./supabaseAdmin";
import { openrouterStream } from "./openRouter";

type RunDebateParams = {
  debateId: string;
  topic: string;
  models: any[];
  maxTurns: number;
};
export function startDebate() {
    // This function sets up debate and calls runDebate to sustain the debate
}

export default function runDebate({ debateId, topic, models, maxTurns }: RunDebateParams) {
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

