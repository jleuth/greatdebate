import { useCallback, useRef } from 'react'

export function useChatScroll() {
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    })
  }, [])

  const scrollToBottomInstant = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    
    // Instant scroll without animation - better for initial load
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [])

  const scrollToBottomIfNearBottom = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const { scrollTop, scrollHeight, clientHeight } = container
    
    // Only auto-scroll if user is within 100px of the bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    
    if (isNearBottom) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        })
      })
    }
  }, [])

  return { containerRef, scrollToBottom, scrollToBottomInstant, scrollToBottomIfNearBottom }
}
