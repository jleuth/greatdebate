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
      return (
        <Card className="flex flex-col h-full items-center justify-center bg-gradient-to-br from-black to-gray-900 border-gray-700">
          <CardContent className="text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-300">Loading chat messages...</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    if (error) {
      return (
        <Card className="flex flex-col h-full items-center justify-center bg-gradient-to-br from-black to-gray-900 border-gray-700">
          <CardContent className="text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <p className="text-red-400">Error loading chat messages.</p>
            </div>
          </CardContent>
        </Card>
      );
    }

  const handleMessage = async (messages: ChatMessage[]) => {
    if (messages.length > 0) {
      // Call storeMessages with the messages and the current roomName
      await storeMessages(messages, roomName); 
    }
  }

  return (
    <Card className="flex flex-col h-full bg-gradient-to-br from-black to-gray-900 border-gray-700 shadow-2xl">
      <CardHeader className='font-mono text-gray-400 pb-3 border-b border-gray-700 bg-gradient-to-r from-gray-900/50 to-black/50 backdrop-blur-sm flex-shrink-0'>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
          <span className="text-red-400 font-bold tracking-wider">USER CHAT</span>
        </div>
        <div className="mt-3">
          <label htmlFor="username-input" className="text-sm font-bold text-gray-300 mb-2 block">Username</label>
          <Input
            id="username-input"
            placeholder="Enter your username"
            value={inputUsername}
            onChange={(e) => setInputUsername(e.target.value)}
            className="bg-black/50 text-white border-gray-600 placeholder-gray-500 focus:border-red-400 focus:ring-red-400/30"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 min-h-0">
        <RealtimeChat roomName={roomName} username={inputUsername} onMessage={handleMessage} messages={messages}/>
      </CardContent>
    </Card>
  );
};

export default UserChat;