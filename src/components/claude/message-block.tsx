'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RunningDots } from '@/components/ui/running-dots';
import { cn } from '@/lib/utils';
import { MarkdownContent } from './message-block-markdown-content-renderer';

interface MessageBlockProps {
  content: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  className?: string;
}

// Main MessageBlock component - memoized to prevent unnecessary re-renders
export const MessageBlock = memo(function MessageBlock({
  content,
  isThinking = false,
  isStreaming = false,
  className
}: MessageBlockProps) {
  const [isExpanded, setIsExpanded] = useState(!isThinking);
  const [displayContent, setDisplayContent] = useState(content);
  const prevContentRef = useRef(content);
  const animatingRef = useRef(false);

  // Typewriter effect for streaming content - only for non-thinking blocks
  useEffect(() => {
    // Skip animation for thinking blocks or non-streaming
    if (isThinking || !isStreaming) {
      setDisplayContent(content);
      prevContentRef.current = content;
      return;
    }

    // If content shortened or same, show immediately
    if (content.length <= prevContentRef.current.length) {
      setDisplayContent(content);
      prevContentRef.current = content;
      return;
    }

    // New content added - animate typing
    const startFrom = displayContent.length;
    const targetLength = content.length;

    if (startFrom >= targetLength) {
      prevContentRef.current = content;
      return;
    }

    // Prevent overlapping animations
    if (animatingRef.current) return;
    animatingRef.current = true;

    let currentLength = startFrom;
    const charsPerFrame = 24; // Increased for better performance
    const frameInterval = 32; // Reduced frequency (30fps instead of 60fps)

    const timer = setInterval(() => {
      currentLength = Math.min(currentLength + charsPerFrame, targetLength);
      setDisplayContent(content.slice(0, currentLength));

      if (currentLength >= targetLength) {
        clearInterval(timer);
        animatingRef.current = false;
        prevContentRef.current = content;
      }
    }, frameInterval);

    return () => {
      clearInterval(timer);
      animatingRef.current = false;
    };
  }, [content, isThinking, isStreaming]);

  if (isThinking) {
    return (
      <div className={cn('', className)}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          {isStreaming && <RunningDots />}
          <span className="font-mono text-[14px]" style={{ color: '#b9664a' }}>
            {isStreaming ? 'Thinking...' : 'Thought'}
          </span>
        </button>

        {isExpanded && (
          <div className="ml-5 mt-1 pl-4 border-l border-border/50 text-sm text-muted-foreground">
            <MarkdownContent content={content} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('text-[15px] leading-7 max-w-full w-full overflow-hidden', className)}>
      <MarkdownContent content={displayContent} />
    </div>
  );
});
