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
        .join("\\n");

    const prompt = `
System Prompt: ${systemPrompt}

Debate Topic: ${topic}

Debate History (last 10 turns):
${debateHistory}

It is now your turn, ${nextModelName}. Please provide your response.
`;
    return prompt.trim();
}
