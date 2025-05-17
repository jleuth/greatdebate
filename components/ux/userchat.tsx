'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { RealtimeChat } from '@/components/ui/realtime-chat';
import { Input } from '@/components/ui/input';
import { ChatMessage } from '@/hooks/use-realtime-chat';
import { storeMessages } from '@/lib/supabase/actions';
import { usePastMessages } from '@/hooks/use-past-messages'

interface UserChatProps {
  roomName: string;
  username: string; // This will be the initial/suggested username
}

const UserChat: React.FC<UserChatProps> = ({ roomName, username: initialUsername }) => {
  const [inputUsername, setInputUsername] = useState(initialUsername);

  useEffect(() => {
    setInputUsername(initialUsername);
  }, [initialUsername]);

  const { messages: messages } = usePastMessages({ roomName })

  const handleMessage = async (messages: ChatMessage[]) => {
    if (messages.length > 0) {
      // Call storeMessages with the messages and the current roomName
      await storeMessages(messages, roomName); 
    }
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className='font-mono text-gray-400 pb-2'>
        CHAT
        <div className="mt-2">
          {/* Use standard HTML label */}
          <label htmlFor="username-input" className="text-sm font-medium text-gray-300">Username</label>
          <Input
            id="username-input"
            placeholder="Enter your username"
            value={inputUsername}
            onChange={(e) => setInputUsername(e.target.value)}
            className="mt-1 bg-gray-700 text-white border-gray-600 placeholder-gray-500"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-grow overflow-y-auto">
        {/* Pass the potentially empty inputUsername here; RealtimeChat will handle disabling input */}
        <RealtimeChat roomName={roomName} username={inputUsername} onMessage={handleMessage} messages={messages}/>
      </CardContent>
    </Card>
  );
};

export default UserChat;