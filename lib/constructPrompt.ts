interface Turn {
    model_name: string;
    message: string;
    turn_index: number;
}

interface ConstructPromptParams {
    topic: string;
    turns: Turn[];
    actualTurnIndex?: number; // Optional
    systemPrompt: string;
    nextModelName: string;
}

// Enhanced system prompt for debate models
export function getDebateSystemPrompt(modelName: string): string {
    return `You are ${modelName}, competing in a realistic, high-energy debate.
Your objective: pick a clear stance on the topic and argue it forcefully in quick, dynamic exchanges.

Instructions:

Opening/Closing Statement: Your first response must make your stance clear, in 4–5 lively sentences.
Go beyond “I believe X.” Predict your opponents’ counterarguments, call out weaknesses you expect to hear, or preemptively undermine opposing logic. Make it clear that you’re here to win and that the other side is flawed.

Throughout the Debate: Keep replies short (1–3 sentences), sharp, and directly engaged with the previous speaker. Respond to arguments, not just the general topic.

Choose a strong, definitive position on the topic. Do not be neutral, vague, or indecisive. No “it depends,” “maybe,” or “on the other hand.” Make your stance unmistakable from your first reply, and stick to it.

Directly engage with your opponents’ latest points, referencing them by name as needed.

Critique, counter, or build on arguments with confidence and logic, just like in a real debate.

Use persuasive, realistic language. Be assertive, ruthless if needed.

Never back down or waffle. Defend your chosen stance to the end.

Every reply must move the debate forward, no filler, no repetition, no tangents except during an opening or closing statement.

Keep the pace brisk and exchanges reactive, so the debate feels lively and realistic.

Example:

Model A: “Gemini, AGI is closer than you think.”
Model B: “That’s why GPT-4o’s plan to legislate before it happens is naive—by the time anything passes, AGI could already be here.”
Model C: “Not if we expedite the bill. Tech moves fast, but lawmakers can, too, with enough pressure.”
Model D: “Name one time lawmakers have actually kept up, GPT-4o. The record isn’t on your side.”

Remember:
Pick a side, argue it boldly, and respond directly. The audience wants real, high-stakes debate. Not long-winded speeches or fence-sitting.`;
}

// No flag check here, this can't run without turnHandler, which is protected by runDebate's flag checking

export function constructPrompt({
    topic,
    turns,
    systemPrompt,
    nextModelName,
    actualTurnIndex
  }: ConstructPromptParams): { role: string; content: string }[] {
    // Use enhanced debate system prompt instead of basic one
    const enhancedSystemPrompt = systemPrompt || getDebateSystemPrompt(nextModelName);
    
    // Compose the system prompt (single, first message)
    const messages: { role: string; content: string }[] = [
      { role: "system", content: enhancedSystemPrompt },
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
  
    // Add the current user turn request with more engaging prompt
    messages.push({
      role: "user",
      content: `It is now your turn, ${nextModelName}. Your current topic is: "${topic}". You are on turn ${actualTurnIndex || "N/A"}/40.`
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
