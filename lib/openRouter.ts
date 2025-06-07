import Log from "./logger";

// No flag check here, this can't run without turnHandler, which is protected by runDebate's flag checking

export async function* openrouterStream({
    model,
    messages,
  }: {
    model: string;
    messages: any[];
  }): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout for the entire request

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Log the response status and error if not ok
      if (!response.ok) {
        let errorMsg = '';
        try {
          errorMsg = await response.text();
        } catch {}
        
        // Check if we got a 429 (rate limit) on a free model and retry with paid version
        if (response.status === 429 && model.includes(':free')) {
          const paidModel = model.replace(':free', '');
          await Log({
            level: "warn",
            event_type: "openrouter_free_rate_limit",
            model,
            message: `Free model hit rate limit, retrying with paid model: ${paidModel}`,
          });
          
          // Recursively call with the paid model
          yield* openrouterStream({ model: paidModel, messages });
          return;
        }
        
        await Log({
          level: "error",
          event_type: "openrouter_api_error",
          model,
          message: `OpenRouter API call failed (status ${response.status})`,
          detail: errorMsg,
        });
        throw new Error(`OpenRouter API call failed: ${response.status} ${errorMsg}`);
      } else {
        await Log({
          level: "info",
          event_type: "openrouter_api_success",
          model,
          message: `OpenRouter API call succeeded (status ${response.status})`,
        });
      }
    
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
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        await Log({
          level: "error",
          event_type: "openrouter_timeout",
          model,
          message: `OpenRouter API request timed out after 60s`,
        });
        throw new Error('OpenRouter API request timed out');
      }
      
      await Log({
        level: "error",
        event_type: "openrouter_stream_error",
        model,
        message: `Error in OpenRouter stream`,
        detail: error.message,
      });
      throw error;
    }
  }
