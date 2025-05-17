import { createClient } from './client'; // Your browser Supabase client
import { type ChatMessage } from '@/hooks/use-realtime-chat';

/**
 * @param messages - An array of ChatMessage objects to store.
 * @param roomName - The name of the room these messages belong to.
 */
export async function storeMessages(messages: ChatMessage[], roomName: string): Promise<void> {
  if (!messages || messages.length === 0) {
    return;
  }
  const supabase = createClient();

  const messagesToUpsert = messages.map(msg => ({
    id: msg.id, // Unique message ID
    room_name: roomName,
    user_name: msg.user.name,
    content: msg.content,
    created_at: msg.createdAt, // ISO string timestamp
  }));

  // Upsert messages to avoid duplicates if onMessage is called with overlapping message sets.
  const { error } = await supabase
    .from('messages') 
    .upsert(messagesToUpsert, { onConflict: 'id' });

  if (error) {
    console.error('Error storing messages:', error.message);

  } else {
    // console.log(`Successfully stored/updated ${messagesToUpsert.length} messages for room ${roomName}.`);
  }
}
