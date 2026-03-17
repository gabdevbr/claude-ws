'use client';

import { useRef, useState } from 'react';
import { TaskStatus } from '@/types';

interface UseBoardMobileSwipeGestureProps {
  visibleColumnIds: TaskStatus[];
  mobileActiveColumn: TaskStatus;
  onColumnChange: (column: TaskStatus) => void;
}

interface UseBoardMobileSwipeGestureReturn {
  swipeOffset: number;
  isDragging: boolean;
  isResetting: boolean;
  animatingColumn: TaskStatus | null;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Hook encapsulating mobile swipe gesture logic for the kanban board.
 * Handles touch start/move/end events, calculates swipe offset with resistance,
 * and triggers column transitions when the swipe threshold is exceeded.
 */
export function useBoardMobileSwipeGesture({
  visibleColumnIds,
  mobileActiveColumn,
  onColumnChange,
}: UseBoardMobileSwipeGestureProps): UseBoardMobileSwipeGestureReturn {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Axis lock: null = undecided, 'horizontal' = swiping columns, 'vertical' = scrolling tasks
  const axisLockRef = useRef<'horizontal' | 'vertical' | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [animatingColumn, setAnimatingColumn] = useState<TaskStatus | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Check if touch started on a drag handle - if so, don't handle swipe
    const target = e.target as HTMLElement;
    const dragHandle = target.closest('[aria-label="Drag to reorder"]');
    if (dragHandle) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axisLockRef.current = null;
    setSwipeOffset(0);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Skip if touch started on drag handle (touchStartRef would be null)
    if (!touchStartRef.current || !isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartRef.current.x;
    const dy = currentY - touchStartRef.current.y;

    // Determine axis lock after a small movement threshold (8px)
    if (axisLockRef.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    // Vertical scroll locked — let browser handle native scroll, skip horizontal swipe
    if (axisLockRef.current === 'vertical') return;

    // Horizontal swipe locked — calculate offset with resistance
    const maxOffset = window.innerWidth * 0.4;
    let newOffset = dx;

    // Apply resistance beyond maxOffset
    if (Math.abs(newOffset) > maxOffset) {
      newOffset = maxOffset * Math.sign(newOffset) + (newOffset - maxOffset * Math.sign(newOffset)) * 0.3;
    }

    setSwipeOffset(newOffset);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Skip if touch started on drag handle
    if (!touchStartRef.current) {
      setIsDragging(false);
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const lockedAxis = axisLockRef.current;
    touchStartRef.current = null;
    axisLockRef.current = null;
    setIsDragging(false);

    // If gesture was vertical or undecided, just reset — no column transition
    if (lockedAxis !== 'horizontal') {
      setSwipeOffset(0);
      return;
    }

    const currentIndex = visibleColumnIds.indexOf(mobileActiveColumn);
    const threshold = window.innerWidth * 0.2; // 20% of screen width to trigger column change

    if (Math.abs(dx) < threshold) {
      // Didn't swipe far enough — animate back
      setSwipeOffset(0);
      return;
    }

    // Determine next column
    let nextColumn: TaskStatus | null = null;
    if (dx < 0 && currentIndex < visibleColumnIds.length - 1) {
      nextColumn = visibleColumnIds[currentIndex + 1];
    } else if (dx > 0 && currentIndex > 0) {
      nextColumn = visibleColumnIds[currentIndex - 1];
    }

    if (nextColumn) {
      // Set animating column to show transition
      setAnimatingColumn(nextColumn);

      // Animate fully to next column
      const screenWidth = window.innerWidth;
      const targetOffset = dx < 0 ? -screenWidth : screenWidth;
      setSwipeOffset(targetOffset);

      // After animation completes, switch column and reset offset
      setTimeout(() => {
        // Disable transition during reset to prevent flash
        setIsResetting(true);
        onColumnChange(nextColumn!);
        setSwipeOffset(0);
        setAnimatingColumn(null);

        // Re-enable transition after reset
        requestAnimationFrame(() => {
          setIsResetting(false);
        });
      }, 300);
    } else {
      // At edge, animate back
      setSwipeOffset(0);
    }
  };

  return {
    swipeOffset,
    isDragging,
    isResetting,
    animatingColumn,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
