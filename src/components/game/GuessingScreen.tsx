"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError, submitGuess } from "@/lib/api/client";
import type { RoundInfo } from "@/lib/api/client";
import { Countdown } from "@/components/game/Countdown";

type GuessingScreenProps = {
  round: RoundInfo;
  participantCount: number;
  joinOpen: boolean;
  onSubmitted: () => void;
};

/// Oyuncunun tahminini henüz göndermediği aktif tur ekranı.
export function GuessingScreen({
  round,
  participantCount,
  joinOpen,
  onSubmitted,
}: GuessingScreenProps) {
  const [word, setWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitGuess(word);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tahmin gönderilemedi.");
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="meta-row">
        <span className="badge">
          Tur {round.number}/{round.total}
        </span>
        <span className="badge">
          {participantCount} kişi {joinOpen ? "(katılım açık)" : "oyunda"}
        </span>
      </div>
      <Countdown endsAt={round.endsAt} />
      <h2 className="card-heading center-text">Aklındaki kelimeyi yaz</h2>
      <p className="card-subtext center-text">
        Aynı kelimeyi yazanlar bir sonraki tura birlikte geçer. Süre dolduğunda
        tahminler karşılaştırılır.
      </p>
      <form className="field" onSubmit={handleSubmit}>
        <input
          type="text"
          value={word}
          onChange={(event) => setWord(event.target.value)}
          placeholder="kelimeni yaz"
          maxLength={100}
          autoFocus
          disabled={submitting}
        />
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={submitting || word.trim().length === 0}>
          {submitting ? "Gönderiliyor…" : "Gönder"}
        </button>
      </form>
    </div>
  );
}
