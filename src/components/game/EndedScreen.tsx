"use client";

import { useState } from "react";

import { ApiError, joinSession } from "@/lib/api/client";

type EndedScreenProps = {
  kind: "ELIMINATED" | "CANCELLED";
  eliminatedRound?: number | null;
  onRetry: () => void;
};

const COPY: Record<EndedScreenProps["kind"], { icon: string; heading: string; body: string }> = {
  ELIMINATED: {
    icon: "🙁",
    heading: "Kimse seninle aynı kelimeyi yazmadı",
    body: "Bu turda eşleşme olmadı ve elendin. Yeni bir oyunda tekrar deneyebilirsin.",
  },
  CANCELLED: {
    icon: "⏳",
    heading: "Yeterli oyuncu yoktu",
    body: "Katılım penceresi kapandığında oyunda yeterince oyuncu yoktu, oyun iptal edildi.",
  },
};

/// ELIMINATED ve CANCELLED durumları aynı ekran düzenini paylaşır; oyuncu
/// otomatik olarak yeni oyuna aktarılmaz, kendisi harekete geçmelidir.
export function EndedScreen({ kind, eliminatedRound, onRetry }: EndedScreenProps) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];

  async function handleRetry() {
    setRetrying(true);
    setError(null);

    try {
      await joinSession();
      onRetry();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yeni oyuna girilemedi.");
      setRetrying(false);
    }
  }

  return (
    <div className="card">
      <div className="status-icon">{copy.icon}</div>
      <h2 className="card-heading center-text">{copy.heading}</h2>
      <p className="card-subtext center-text">
        {copy.body}
        {kind === "ELIMINATED" && eliminatedRound ? ` (Tur ${eliminatedRound})` : null}
      </p>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="btn-primary" onClick={handleRetry} disabled={retrying}>
        {retrying ? "Giriliyor…" : "Tekrar dene"}
      </button>
    </div>
  );
}
