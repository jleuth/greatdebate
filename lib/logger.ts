import { supabaseAdmin } from "./supabaseAdmin";

interface Info {
    level?: string;
    event_type?: string;
    debate_id?: string;
    turn_id?: string;
    vote_id?: string;
    model?: string;
    message?: string;
    detail?: any;
    latency_ms?: number;
    tokens?: number;
    error?: string;
}

export default async function Log({ level, event_type, debate_id, turn_id, vote_id, model, message, detail, latency_ms, tokens, error }: Info) {

    //Check if logging is enabled in flags 
    const { data: flags, error: flagerror } = await supabaseAdmin
    .from('flags')
    .select('enable_logging')
    .single();

    if (flagerror) {
        console.error("Error fetching flags:", flagerror);
        return "Error fetching flags";
    }

    if (flags?.enable_logging === false) {
        console.log("Logging is disabled in flags.");
        return "Logging is disabled in flags";
    }

    const { data, error: supabaseError } = await supabaseAdmin
        .from("logs")
        .insert({
            level: level,
            event_type: event_type,
            debate_id: debate_id,
            turn_id: turn_id,
            vote_id: vote_id,
            model: model,
            message: message,
            detail: detail,
            latency_ms: latency_ms,
            tokens: tokens,
            error: error,
        })
        .select()
        .single();
    if (supabaseError) {
        console.error("Error logging to Supabase:", supabaseError);
        return "Error logging to Supabase";
    }
    return ` Successfully logged ${data}`;


}