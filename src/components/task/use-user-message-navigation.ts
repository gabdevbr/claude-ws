import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to navigate between user-sent messages in the conversation.
 * Returns visibility state and scroll-to-previous/next functions.
 * Buttons appear when user scrolls away from the bottom.
 *
 * Always uses the ScrollArea viewport as the scroll container (the
 * floating-chat wrapper uses h-full to ensure the viewport scrolls).
 *
 * @param isReady - pass true when the ScrollArea is mounted (e.g. !isLoading)
 */
export function useUserMessageNavigation(
  scrollAreaRef: React.RefObject<HTMLDivElement | null>,
  isReady: boolean
) {
  const [showNav, setShowNav] = useState(false);

  const getViewport = useCallback((): HTMLElement | null => {
    return scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
  }, [scrollAreaRef]);

  const getUserTurnElements = useCallback((): HTMLElement[] => {
    if (!scrollAreaRef.current) return [];
    return Array.from(scrollAreaRef.current.querySelectorAll('[data-user-turn]'));
  }, [scrollAreaRef]);

  // Attach scroll listener — re-runs when isReady flips so DOM exists
  useEffect(() => {
    if (!isReady) return;
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
      setShowNav(!atBottom);
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [getViewport, isReady]);

  const findCurrentIndex = useCallback(() => {
    const viewport = getViewport();
    const turns = getUserTurnElements();
    if (!viewport || turns.length === 0) return -1;

    const viewportTop = viewport.getBoundingClientRect().top;
    let closest = -1;

    for (let i = 0; i < turns.length; i++) {
      const rect = turns[i].getBoundingClientRect();
      if (rect.top <= viewportTop + viewport.clientHeight / 2) {
        closest = i;
      }
    }
    return closest;
  }, [getViewport, getUserTurnElements]);

  const scrollToUserTurn = useCallback((index: number) => {
    const viewport = getViewport();
    const turns = getUserTurnElements();
    if (!viewport || index < 0 || index >= turns.length) return;

    const turn = turns[index];
    const viewportRect = viewport.getBoundingClientRect();
    const turnRect = turn.getBoundingClientRect();
    const offset = turnRect.top - viewportRect.top - 16;
    viewport.scrollTop += offset;
  }, [getViewport, getUserTurnElements]);

  const goToPrev = useCallback(() => {
    const current = findCurrentIndex();
    const target = current > 0 ? current - 1 : 0;
    scrollToUserTurn(target);
  }, [findCurrentIndex, scrollToUserTurn]);

  const goToNext = useCallback(() => {
    const turns = getUserTurnElements();
    const current = findCurrentIndex();
    if (current < turns.length - 1) {
      scrollToUserTurn(current + 1);
    } else {
      const viewport = getViewport();
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [findCurrentIndex, getUserTurnElements, scrollToUserTurn, getViewport]);

  return { showNav, goToPrev, goToNext };
}
