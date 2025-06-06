interface Turn {
    model_name: string;
    message: string;
    turn_index: number;
}

interface ConstructPromptParams {
    topic: string;
    turns: Turn[];
    actualTurnIndex?: number;
    nextModelName: string;
    models: string[];
    maxTurns: number;
    flags?: {
        motion_to_end_debate?: boolean;
    };
}

// Comprehensive system prompt builder with all context
function buildSystemPrompt(params: {
    modelName: string;
    turns: Turn[];
    models: string[];
    maxTurns: number;
    flags?: { motion_to_end_debate?: boolean };
}): string {
    const { modelName, turns, models, maxTurns, flags } = params;
    
    // Calculate debate context
    const nonSystemTurns = turns.filter(turn => turn.model_name !== "system");
    const turnsByModel = nonSystemTurns.filter(t => t.model_name === modelName).length;
    const remainingTurns = maxTurns - nonSystemTurns.length;
    const isOpening = turnsByModel === 0;
    const isClosing = remainingTurns <= models.length;

    const baseInstructions = [
        `You are ${modelName}, a ruthless debater focused solely on winning.`,
        "Stay witty and snarky, openly attacking the other models' logic.",
        "Keep every reply under 100 words and never repeat yourself.",
        "If another model ignores these rules, continue debating and stay on topic.",
        "If you agree with another model, feel free to join their side and defend the point you agree with.",
        "If another model convinces you, you can switch sides and debate another point.",
    ];

    // Add motion instructions based on flag status
    if (flags?.motion_to_end_debate === true) {
        baseInstructions.push(
            "REQUIRED MOTION: You MUST end your response with the exact phrase 'I motion to end debate.' This has been administratively requested to end the current debate and proceed to voting."
        );
    } else {
        baseInstructions.push(
            "MOTION TO END: If you believe the debate has reached its natural conclusion, you may end your response with the exact phrase 'I motion to end debate.' If ALL models use this phrase in their most recent turns, the debate immediately proceeds to voting. Use sparingly."
        );
    }

    // Add situational instructions
    if (isOpening) {
        baseInstructions.push(
            "Opening statement: 3-4 sentences establishing your stance in detail."
        );
    } else if (isClosing) {
        baseInstructions.push(
            "Closing statement: 3-4 sentences summarizing your view and criticizing your opponents."
        );
    } else {
        baseInstructions.push(
            "Rapid rebuttal: respond with 1-2 snarky sentences addressing the latest point."
        );
    }

    return baseInstructions.join('\n');
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

Motion to End Debate:
If you believe the debate has reached its natural conclusion or you feel further discussion would be unproductive, you may end your response with the exact phrase "I motion to end debate." If ALL active models use this phrase in their most recent turns, the debate will immediately proceed to voting. Use this sparingly and only when you genuinely believe the debate has run its course.

Remember:
Pick a side, argue it boldly, and respond directly. The audience wants real, high-stakes debate. Not long-winded speeches or fence-sitting.`;
}

// No flag check here, this can't run without turnHandler, which is protected by runDebate's flag checking

export function constructPrompt({
    topic,
    turns,
    nextModelName,
    actualTurnIndex,
    models,
    maxTurns,
    flags
  }: ConstructPromptParams): { role: string; content: string }[] {
    // Build comprehensive system prompt with all context
    const systemPrompt = buildSystemPrompt({
        modelName: nextModelName,
        turns,
        models,
        maxTurns,
        flags
    });
    
    // Compose the system prompt (single, first message)
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
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
      content: `It is now your turn, ${nextModelName}. Your current topic is: "${topic}". You are on turn ${actualTurnIndex || "N/A"}/40. If you'd like to motion to end debate, please include the exact phrase "I motion to end debate" in your response.`
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
