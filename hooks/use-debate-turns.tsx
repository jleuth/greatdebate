'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

interface UseRealtimeChatProps {
  roomName: string
}

export interface ChatMessage {
  id: string
  content: string
  user: {
    name: string
  }
  createdAt: string
}

const EVENT_MESSAGE_TYPE = 'message'

export function useRealtimeChat({ roomName }: UseRealtimeChatProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!roomName) return // Do not proceed if roomName is not set
    const newChannel = supabase.channel(roomName)

    newChannel
      .on('broadcast', { event: EVENT_MESSAGE_TYPE }, (payload) => {
        const receivedMessage = payload.payload as ChatMessage
        setMessages((current) => [...current, receivedMessage])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
        }
      })

    setChannel(newChannel)

    return () => {
      supabase.removeChannel(newChannel)
    }
  }, [roomName, supabase])

  return { messages, isConnected }
}
