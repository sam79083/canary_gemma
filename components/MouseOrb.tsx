"use client";

import { useEffect, useRef } from "react";

/**
 * Two soft gradient orbs that drift toward the mouse (empty-chat only).
 * rAF + lerp, pointer-events none, off when reduced motion is preferred.
 */
export default function MouseOrb({ active }: { active: boolean }) {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.3;
    let ax = tx;
    let ay = ty;
    let bx = tx;
    let by = ty;
    let raf = 0;
    let alive = true;
    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      if (!alive) return;
      ax += (tx - ax) * 0.06;
      ay += (ty - ay) * 0.06;
      bx += (tx - bx) * 0.025;
      by += (ty - by) * 0.025;
      if (aRef.current)
        aRef.current.style.transform = `translate3d(${ax - 150}px,${ay - 150}px,0)`;
      if (bRef.current)
        bRef.current.style.transform = `translate3d(${bx - 200}px,${by - 200}px,0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, [active ]);

  if (!active) return null;
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div
        ref={aRef}
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(35,131,230,0.14), transparent 70%)",
        }}
      />
      <div
        ref={bRef}
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,92,214,0.12), transparent 70%)",
        }}
      />
    </div>
  );
}
