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

  const { messages: messages, isLoading, error } = usePastMessages({ roomName })

    if (isLoading) {
      return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Loading debate messages...</CardContent></Card>;
    }
    if (error) {
      return <Card className="flex flex-col h-full items-center justify-center"><CardContent>Error loading debate messages.</CardContent></Card>;
    }

  const handleMessage = async (messages: ChatMessage[]) => {
    if (messages.length > 0) {
      // Call storeMessages with the messages and the current roomName
      await storeMessages(messages, roomName); 
    }
  }

  return (
    <Card className="flex flex-col h-full max-h-full">
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

      <CardContent className="flex-1 p-4">
        <div className="overflow-y-auto max-h-[400px] h-[400px]">
          <RealtimeChat roomName={roomName} username={inputUsername} onMessage={handleMessage} messages={messages}/>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserChat;