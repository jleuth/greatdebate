import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/hooks/use-realtime-chat'
import { getModelDisplayName, getModelTheme } from '@/lib/model-colors'
import ReactMarkdown from 'react-markdown'
import { Activity, Zap } from 'lucide-react'

interface ChatMessageItemProps {
  message: ChatMessage
  isOwnMessage: boolean
  showHeader: boolean
  isAiMessage?: boolean
  isCurrentModel?: boolean
}

export const ChatMessageItem = ({ 
  message, 
  isOwnMessage, 
  showHeader, 
  isAiMessage = false,
  isCurrentModel = false 
}: ChatMessageItemProps) => {
  const modelTheme = isAiMessage ? getModelTheme(message.user.name) : null;

  const displayName = getModelDisplayName(message.user.name);
  
  return (
    <div className={`flex mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={cn('max-w-[85%] w-fit flex flex-col gap-2', {
          'items-end': isOwnMessage,
        })}
      >
        {showHeader && (
          <div
            className={cn('flex items-center gap-3 text-xs px-3', {
              'justify-end flex-row-reverse': isOwnMessage,
            })}
          >
            <div className="flex items-center gap-2">
              {isAiMessage && modelTheme && (
                <div 
                  className="w-3 h-3 rounded-full shadow-lg"
                  style={{ 
                    backgroundColor: modelTheme.primary,
                    boxShadow: `0 0 8px ${modelTheme.primary}40`
                  }}
                />
              )}
              <span 
                className={cn('font-semibold tracking-wide', {
                  'text-gray-100': !isAiMessage,
                })}
                style={isAiMessage && modelTheme ? { 
                  color: modelTheme.primary,
                  textShadow: `0 0 10px ${modelTheme.primary}30`
                } : {}}
              >
                {displayName}
              </span>
              {isCurrentModel && (
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-red-400 animate-pulse" />
                  <span className="text-red-400 text-xs font-bold tracking-wider">ACTIVE</span>
                </div>
              )}
            </div>
            <span className="text-gray-400 text-xs font-mono">
              {new Date(message.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
          </div>
        )}
        <div
          className={cn(
            'py-4 px-5 rounded-2xl text-sm shadow-xl relative overflow-hidden',
            {
              'bg-gradient-to-br from-gray-800 to-gray-900 text-gray-100 border border-gray-700': !isOwnMessage && !isAiMessage,
              'text-gray-100 border-2 shadow-2xl': isAiMessage,
              'ring-2 ring-red-400/50 ring-offset-2 ring-offset-black': isCurrentModel,
            }
          )}
          style={isAiMessage && modelTheme ? {
            background: `linear-gradient(135deg, ${modelTheme.secondary}20, ${modelTheme.primary}10)`,
            borderColor: modelTheme.primary,
            boxShadow: `0 8px 32px ${modelTheme.primary}20, inset 0 1px 0 ${modelTheme.primary}30`
          } : isOwnMessage ? {
            background: 'linear-gradient(135deg, #7C2D12, #991B1B)',
            color: '#FEF2F2'
          } : {}}
        >
          {isAiMessage && modelTheme && (
            <div 
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{ 
                background: `radial-gradient(circle at top right, ${modelTheme.primary}, transparent 70%)`
              }}
            />
          )}
          <div className="relative z-10">
            {isAiMessage ? (
              <ReactMarkdown
                components={{
                  // Apply Tailwind classes through components prop instead of className
                  p: ({ children }) => <p className="text-gray-100 leading-relaxed mb-2 last:mb-0">{children}</p>,
                  h1: ({ children }) => <h1 className="text-gray-100 font-bold text-lg mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-gray-100 font-bold text-base mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-gray-100 font-bold text-sm mb-2">{children}</h3>,
                  strong: ({ children }) => <strong className="text-gray-100 font-bold">{children}</strong>,
                  em: ({ children }) => <em className="text-gray-300 italic">{children}</em>,
                  code: ({ children }) => <code className="text-gray-200 bg-gray-800 px-1 rounded text-xs">{children}</code>,
                  pre: ({ children }) => <pre className="bg-gray-800 border border-gray-700 p-2 rounded text-xs overflow-x-auto">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-600 text-gray-300 pl-4 italic">{children}</blockquote>,
                  ul: ({ children }) => <ul className="text-gray-100 list-disc list-inside mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="text-gray-100 list-decimal list-inside mb-2">{children}</ol>,
                  li: ({ children }) => <li className="text-gray-100 mb-1">{children}</li>
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <span className="whitespace-pre-wrap leading-relaxed">
                {message.content}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
