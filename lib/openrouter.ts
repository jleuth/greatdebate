export async function* openrouterStream({
    model,
    messages,
  }: {
    model: string;
    messages: any[];
  }): AsyncGenerator<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });
  
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }
  
    const decoder = new TextDecoder();
    let buffer = '';
  
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
  
        buffer += decoder.decode(value, { stream: true });
  
        // Parse complete lines
        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd === -1) break;
  
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);
  
          if (!line) continue;
          if (!line.startsWith('data: ')) continue;
  
          const data = line.slice(6);
          if (data === '[DONE]') return;
  
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content; // <--- stream each chunk out!
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }
  