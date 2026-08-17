"use client";

import { useEffect, useState } from "react";

/// Verilen bitiş zamanına kalan saniyeyi döndürür; sunucudan gelen `endsAt`
/// değeri sabit kalsa bile ekranda her saniye yenilenir. Süre dolunca 0'da
/// kalır, negatif olmaz.
export function useCountdown(endsAt: string | undefined): number {
  const [remaining, setRemaining] = useState(() => computeRemaining(endsAt));

  useEffect(() => {
    setRemaining(computeRemaining(endsAt));

    if (!endsAt) {
      return;
    }

    const interval = setInterval(() => {
      setRemaining(computeRemaining(endsAt));
    }, 250);

    return () => clearInterval(interval);
  }, [endsAt]);

  return remaining;
}

function computeRemaining(endsAt: string | undefined): number {
  if (!endsAt) {
    return 0;
  }

  const diffMs = new Date(endsAt).getTime() - Date.now();

  return Math.max(0, Math.round(diffMs / 1000));
}
