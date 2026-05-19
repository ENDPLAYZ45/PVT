"use client";

import { useCallback, useRef } from "react";

/**
 * Returns a `playPop()` function that synthesises a short notification
 * sound using the Web Audio API — no audio file required.
 */
export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const playPop = useCallback(() => {
    try {
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;

      // Short sine-wave ping: 880 Hz → 440 Hz over 120 ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext blocked or unsupported — silently skip
    }
  }, []);

  return { playPop };
}
