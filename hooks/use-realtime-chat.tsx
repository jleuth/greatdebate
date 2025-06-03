'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState } from 'react'

interface UseRealtimeChatProps {
  roomName: string
  username: string
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

// Helper function to check for banned words (case-insensitive)
// Now takes the list as an argument
function containsBannedWords(content: string, list: string[]): boolean {
  if (!content || !list || list.length === 0) return false
  const lowerContent = content.toLowerCase()
  // Ensure words in the list are lowercase for comparison if not already handled during fetch
  return list.some((bannedWord) => lowerContent.includes(bannedWord))
}

// Helper function to sanitize content by replacing banned words with asterisks
// Now takes the list as an argument
function sanitizeContent(content: string, list: string[]): string {
  if (!content || !list || list.length === 0) return content
  let sanitized = content
  list.forEach((bannedWord) => {
    // Ensure bannedWord is treated as a literal string in the regex
    const escapedBannedWord = bannedWord.replace(/[.*+?^${}()|[\\\]\\]/g, '\\\\$&')
    const regex = new RegExp(escapedBannedWord, 'gi')
    sanitized = sanitized.replace(regex, '*'.repeat(bannedWord.length))
  })
  return sanitized
}

// Function to generate a UUID or a fallback
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  } else {
    // Basic fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}

export function useRealtimeChat({ roomName, username }: UseRealtimeChatProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [bannedWordsList, setBannedWordsList] = useState<string[]>([])

  useEffect(() => {
    const fetchBannedWords = async () => {
      try {
        const response = await fetch('/bannedwords.csv') // Fetches from the public folder
        if (!response.ok) {
          throw new Error(`Failed to fetch banned_words.csv: ${response.statusText}`)
        }
        const text = await response.text()
        const words = text
          .split(/\r?\n/) // Split by new line, handling Windows and Unix line endings
          .map((word) => word.trim().toLowerCase()) // Trim and convert to lowercase
          .filter((word) => word.length > 0) // Remove empty lines
        setBannedWordsList(words)
        // console.log("Banned words loaded:", words);
      } catch (error) {
        console.error('Error loading banned words list:', error)
        // Optionally, set a default small list or handle the error appropriately
        // setBannedWordsList(['defaultbadword']);
      }
    }
    fetchBannedWords()
  }, []) // Runs once on component mount

  useEffect(() => {
    if (!roomName) return // Do not proceed if roomName is not set
    const newChannel = supabase.channel(roomName)

    newChannel
      .on('broadcast', { event: EVENT_MESSAGE_TYPE }, (payload) => {
        const receivedMessage = payload.payload as ChatMessage
        // Sanitize incoming messages using the fetched list
        const finalMessage = { ...receivedMessage, content: sanitizeContent(receivedMessage.content, bannedWordsList) }
        setMessages((current) => [...current, finalMessage])
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
  }, [roomName, bannedWordsList]) // Removed supabase from deps as it's now stable

  const sendMessage = useCallback(
    async (content: string) => {
      if (!channel || !isConnected) return

      // Prevent sending if content is offensive, using the fetched list
      if (containsBannedWords(content, bannedWordsList)) {
        alert('Your message contains inappropriate content and cannot be sent.')
        return
      }

      const message: ChatMessage = {
        id: generateUUID(), // Use the new UUID generator function
        content, // Content is already checked
        user: {
          name: username,
        },
        createdAt: new Date().toISOString(),
      }

      setMessages((current) => [...current, message])

      await channel.send({
        type: 'broadcast',
        event: EVENT_MESSAGE_TYPE,
        payload: message,
      })
    },
    [channel, isConnected, username, bannedWordsList] // Added bannedWordsList to dependencies
  )

  return { messages, sendMessage, isConnected }
}
