'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationViewUserMessageNavButtonsProps {
  showNav: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Sticky up/down buttons at the bottom-right of the chat scroll area.
 * Navigate between user-sent messages in the conversation.
 * Uses sticky positioning so it works in both regular and floating windows
 * (where the scroll container may be a parent detached-scroll-container).
 */
export function ConversationViewUserMessageNavButtons({
  showNav,
  onPrev,
  onNext,
}: ConversationViewUserMessageNavButtonsProps) {
  return (
    <div className="sticky bottom-4 pointer-events-none flex justify-end pr-4 -mt-12 z-10">
      <div
        className={cn(
          'flex flex-col gap-1 pointer-events-auto',
          'transition-all duration-200',
          showNav ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <button
          type="button"
          onClick={onPrev}
          className={cn(
            'flex items-center justify-center size-7 rounded-full',
            'bg-background/80 backdrop-blur-sm border border-border shadow-sm',
            'text-muted-foreground hover:text-foreground hover:bg-background',
            'transition-colors cursor-pointer'
          )}
          aria-label="Previous user message"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className={cn(
            'flex items-center justify-center size-7 rounded-full',
            'bg-background/80 backdrop-blur-sm border border-border shadow-sm',
            'text-muted-foreground hover:text-foreground hover:bg-background',
            'transition-colors cursor-pointer'
          )}
          aria-label="Next user message"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
    </div>
  );
}
