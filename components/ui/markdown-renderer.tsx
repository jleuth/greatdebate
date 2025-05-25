'use client';

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  // Simple markdown parsing for common elements
  const parseMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={currentIndex++} className="text-xl font-bold text-red-400 mb-3 mt-4 first:mt-0">
            {line.substring(2)}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={currentIndex++} className="text-lg font-bold text-red-300 mb-2 mt-3 first:mt-0">
            {line.substring(3)}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={currentIndex++} className="text-md font-semibold text-gray-200 mb-2 mt-3 first:mt-0">
            {line.substring(4)}
          </h3>
        );
      }
      // Code blocks
      else if (line.startsWith('```')) {
        const codeLines = [];
        i++; // Skip the opening ```
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre key={currentIndex++} className="bg-black/50 border border-gray-700 rounded-lg p-3 my-3 overflow-x-auto">
            <code className="text-gray-300 text-sm font-mono whitespace-pre">
              {codeLines.join('\n')}
            </code>
          </pre>
        );
      }
      // Lists
      else if (line.match(/^[\-\*]\s/)) {
        const listItems = [line];
        // Collect consecutive list items
        while (i + 1 < lines.length && lines[i + 1].match(/^[\-\*]\s/)) {
          i++;
          listItems.push(lines[i]);
        }
        elements.push(
          <ul key={currentIndex++} className="list-disc list-inside my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-gray-200">
                {parseInlineMarkdown(item.substring(2))}
              </li>
            ))}
          </ul>
        );
      }
      // Numbered lists
      else if (line.match(/^\d+\.\s/)) {
        const listItems = [line];
        // Collect consecutive numbered list items
        while (i + 1 < lines.length && lines[i + 1].match(/^\d+\.\s/)) {
          i++;
          listItems.push(lines[i]);
        }
        elements.push(
          <ol key={currentIndex++} className="list-decimal list-inside my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-gray-200">
                {parseInlineMarkdown(item.replace(/^\d+\.\s/, ''))}
              </li>
            ))}
          </ol>
        );
      }
      // Blockquotes
      else if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={currentIndex++} className="border-l-4 border-red-500/50 pl-4 my-3 italic text-gray-300 bg-black/20 py-2">
            {parseInlineMarkdown(line.substring(2))}
          </blockquote>
        );
      }
      // Horizontal rule
      else if (line.match(/^---+$/)) {
        elements.push(
          <hr key={currentIndex++} className="border-gray-700 my-4" />
        );
      }
      // Regular paragraphs
      else if (line.trim()) {
        elements.push(
          <p key={currentIndex++} className="mb-2 text-gray-200 leading-relaxed">
            {parseInlineMarkdown(line)}
          </p>
        );
      }
      // Empty lines
      else {
        elements.push(<br key={currentIndex++} />);
      }
    }

    return elements;
  };

  // Parse inline markdown (bold, italic, code, links)
  const parseInlineMarkdown = (text: string): React.ReactNode => {
    // Bold and italic
    let processed = text
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');

    // Links
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Convert back to React elements
    const parts = processed.split(/(<[^>]+>[^<]*<\/[^>]+>|<[^>]+\/>)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('<strong><em>') && part.endsWith('</em></strong>')) {
        const content = part.replace(/<\/?strong>|<\/?em>/g, '');
        return <strong key={index}><em className="text-red-300">{content}</em></strong>;
      } else if (part.startsWith('<strong>') && part.endsWith('</strong>')) {
        const content = part.replace(/<\/?strong>/g, '');
        return <strong key={index} className="text-red-400 font-bold">{content}</strong>;
      } else if (part.startsWith('<em>') && part.endsWith('</em>')) {
        const content = part.replace(/<\/?em>/g, '');
        return <em key={index} className="text-gray-300 italic">{content}</em>;
      } else if (part.startsWith('<code>') && part.endsWith('</code>')) {
        const content = part.replace(/<\/?code>/g, '');
        return (
          <code key={index} className="bg-black/50 text-red-300 px-1.5 py-0.5 rounded font-mono text-sm border border-gray-700">
            {content}
          </code>
        );
      } else if (part.startsWith('<a href="') && part.endsWith('</a>')) {
        const match = part.match(/<a href="([^"]+)">([^<]+)<\/a>/);
        if (match) {
          return (
            <a
              key={index}
              href={match[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
            >
              {match[2]}
            </a>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`markdown-content ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
};