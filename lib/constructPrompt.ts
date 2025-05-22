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

// No flag check here, this can't run without turnHandler, which is protected by runDebate's flag checking

export function constructPrompt({
    topic,
    turns,
    systemPrompt,
    nextModelName,
  }: ConstructPromptParams): { role: string; content: string }[] {
    // Compose the system prompt (single, first message)
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt || "You are a helpful debate AI." },
      { role: "user", content: `Debate Topic: ${topic}` }
    ];
  
    // Add up to 10 previous turns as assistant/user pairs
    turns.slice(-10).forEach(turn => {
      // Optionally: alternate role by model, or just use 'assistant' for all AI
      messages.push({
        role: "assistant",
        content: `${turn.model_name}: ${turn.message}`
      });
    });
  
    // Add the current user turn request
    messages.push({
      role: "user",
      content: `It is now your turn, ${nextModelName}. Please provide your response.`
    });

    console.log("Constructed messages:", messages);
  
    return messages;
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
