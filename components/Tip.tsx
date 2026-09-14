"use client";

import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

interface Props {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

/** Accessible tooltip. Falls back to nothing when there is no label. */
export default function Tip({ label, side = "top", children }: Props) {
  if (!label) return <>{children}</>;
  return (
    <Tooltip.Root delayDuration={400}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="tip-card">
          {label}
          <Tooltip.Arrow className="tip-arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
