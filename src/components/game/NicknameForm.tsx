"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError, joinSession, setNickname } from "@/lib/api/client";

type NicknameFormProps = {
  onReady: () => void;
};

/// İlk ziyarette gösterilen tek alanlı form. Nickname kaydedilir kaydedilmez
/// oyuncu doğrudan katılıma açık oyuna alınır; ayrı bir lobi adımı yoktur.
export function NicknameForm({ onReady }: NicknameFormProps) {
  const [nickname, setNicknameValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = nickname.trim();

    if (trimmed.length < 2 || trimmed.length > 30) {
      setError("Nickname 2 ile 30 karakter arasında olmalı.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await setNickname(trimmed);
      await joinSession();
      onReady();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bir şeyler ters gitti.");
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2 className="card-heading">Oyuna başla</h2>
      <p className="card-subtext">
        Bir nickname seç. Kelimeni yazar yazmaz tahmin ekranına düşeceksin.
      </p>
      <form className="field" onSubmit={handleSubmit}>
        <label htmlFor="nickname">Nickname</label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(event) => setNicknameValue(event.target.value)}
          placeholder="ör. bayram"
          maxLength={30}
          autoFocus
          disabled={submitting}
        />
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Giriliyor…" : "Oyuna gir"}
        </button>
      </form>
    </div>
  );
}
