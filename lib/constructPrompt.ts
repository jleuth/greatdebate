interface Turn {
    model_name: string;
    message: string;
    turn_index: number;
}

interface ConstructPromptParams {
    topic: string;
    turns: Turn[];
    systemPrompt: string;
    nextModelName: string;
}

export function constructPrompt({ topic, turns, systemPrompt, nextModelName }: ConstructPromptParams): string {
    const debateHistory = turns
        .slice(-10) // Get the last 10 turns
        .map(turn => `${turn.model_name}: ${turn.message}`)
        .join("\n");

    const prompt = `
System Prompt: ${systemPrompt}

Debate Topic: ${topic}

Debate History (last 10 turns):
${debateHistory}

It is now your turn, ${nextModelName}. Please provide your response.
`;
    return prompt.trim();
}

export function constructVotingPrompt({ topic, turns, models }: { topic: string; turns: any[], models: string[] }) {

    // Get the debate transcript
    const transcript = turns
        .map(turn => `${turn.model_name}: ${turn.message}`)
        .join("\n");

    // System prompt: list models, ask for a vote of just one name.
    const sys = "You are an unbiased judge. Based on the debate transcript, you must pick the single best-performing model (no ties or explanations). Reply ONLY with the name: " + models.join(", ") + ".";

    const prompt = [
        { role: "system", content: sys },
        { role: "user", content: `Debate Topic: ${topic}\n\nDebate Transcript:\n${transcript}\n\nWho performed best in this debate? Reply ONLY with the winner's name.` },
    ]

    return prompt;
}
