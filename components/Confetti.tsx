"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#2383e6", "#2ea08c", "#7c5cd6", "#e68600", "#e5486c", "#46a758"];
const COUNT = 48;

/** Dependency-free confetti burst. Fires once per burstKey change. */
export default function Confetti({ burstKey }: { burstKey: number }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (burstKey === 0) return;
    const layer = layerRef.current;
    if (!layer) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.35;
    const parts: HTMLElement[] = [];
    for (let i = 0; i < COUNT; i++) {
      const el = document.createElement("span");
      const size = 5 + Math.random() * 7;
      el.style.cssText = [
        "position:fixed",
        `left:${cx}px`,
        `top:${cy}px`,
        `width:${size}px`,
        `height:${size * (Math.random() < 0.5 ? 1 : 0.5)}px`,
        `background:${COLORS[i % COLORS.length]}`,
        "border-radius:2px",
        "pointer-events:none",
        "z-index:2000",
      ].join(";");
      document.body.appendChild(el);
      parts.push(el);
      const ang = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 260;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist + 160; // gravity bias
      el.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720 - 360}deg)`,
            opacity: 0,
          },
        ],
        { duration: 900 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => el.remove();
    }
    const timer = setTimeout(() => parts.forEach((p) => p.remove()), 2000);
    return () => {
      clearTimeout(timer);
      parts.forEach((p) => p.remove());
    };
  }, [burstKey]);

  return <div ref={layerRef} aria-hidden="true" />;
}
