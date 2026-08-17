"use client";

import { useCountdown } from "@/lib/hooks/useCountdown";

type CountdownProps = {
  endsAt: string;
};

/// Kalan saniyeyi büyük punto ile gösterir; son 10 saniyede kırmızıya döner.
export function Countdown({ endsAt }: CountdownProps) {
  const remaining = useCountdown(endsAt);
  const urgent = remaining <= 10;

  return (
    <div className="countdown">
      <span className={`countdown-value${urgent ? " countdown-urgent" : ""}`}>
        {remaining}
      </span>
      <span className="countdown-unit">saniye</span>
    </div>
  );
}
