'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

const SPINNER_FRAMES = ['·', '✻', '✽', '✶', '✢', '❅', '❆', '✧', '✦'];
const FRAME_INTERVAL = 200; // Slower animation

// 15 creative verbs for status text
const STATUS_VERBS = [
  'Thinking',
  'Tinkering',
  'Shipping',
  'Cooking',
  'Brewing',
  'Crafting',
  'Weaving',
  'Forging',
  'Building',
  'Conjuring',
  'Spinning',
  'Crunching',
  'Pondering',
  'Dreaming',
  'Plotting',
];

interface RunningDotsProps {
    className?: string;
}

/**
 * Get a random status verb for display
 */
export function getRandomStatusVerb(): string {
    return STATUS_VERBS[Math.floor(Math.random() * STATUS_VERBS.length)];
}

/**
 * Hook to get a stable random verb for a component's lifecycle
 */
export function useRandomStatusVerb(): string {
    return useMemo(() => getRandomStatusVerb(), []);
}

/**
 * Hook that rotates through random status verbs at a set interval.
 * Use this for idle indicators that need to feel "alive".
 * Only rotates when `active` is true; pauses and resets when inactive.
 */
export function useRotatingStatusVerb(active: boolean, intervalMs: number = 3000): string {
    const [verb, setVerb] = useState(() => getRandomStatusVerb());

    useEffect(() => {
        if (!active) return;
        // Pick a fresh verb immediately when becoming active
        setVerb(getRandomStatusVerb());
        const timer = setInterval(() => {
            setVerb((prev) => {
                let next = getRandomStatusVerb();
                // Avoid showing the same verb twice in a row
                while (next === prev) next = getRandomStatusVerb();
                return next;
            });
        }, intervalMs);
        return () => clearInterval(timer);
    }, [active, intervalMs]);

    return verb;
}

// Default spinner color
const SPINNER_COLOR = '#b9664a';

export function RunningDots({ className }: RunningDotsProps) {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
        }, FRAME_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    return (
        <span
            className={cn('font-mono inline-block w-[1ch] text-center', className)}
            style={{ color: SPINNER_COLOR }}
        >
            {SPINNER_FRAMES[frameIndex]}
        </span>
    );
}
