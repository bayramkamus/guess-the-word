"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchState, joinSession } from "@/lib/api/client";
import type { StateResponse } from "@/lib/api/client";
import { NicknameForm } from "@/components/game/NicknameForm";
import { GuessingScreen } from "@/components/game/GuessingScreen";
import { WaitingScreen } from "@/components/game/WaitingScreen";
import { EndedScreen } from "@/components/game/EndedScreen";
import { FinalistScreen } from "@/components/game/FinalistScreen";

/// Arayüzün GET /api/state'i yokladığı aralık. Bu uç nokta aynı zamanda
/// süresi dolmuş katılım pencerelerini ve turları ilerlettiği için oyunun
/// zamanla akışı da dolaylı olarak bu yoklamaya bağlıdır.
const POLL_INTERVAL_MS = 1000;

/// Tek ekranlı oyun arayüzü. Ayrı bir lobi veya oda seçim ekranı yoktur;
/// gösterilen bileşen tamamen sunucudan gelen `screen` alanına göre seçilir.
export function GameApp() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const joiningRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchState();
      setState(next);
      setLoadError(null);
    } catch {
      setLoadError("Sunucuya ulaşılamıyor, tekrar deneniyor…");
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // NO_GAME yalnızca nickname var ama hiç oyuna girilmemişken görülür;
  // arayüzde ayrı bir "katıl" adımı olmadığından bu geçiş otomatiktir.
  useEffect(() => {
    if (state?.screen !== "NO_GAME" || joiningRef.current) {
      return;
    }

    joiningRef.current = true;
    joinSession()
      .then(refresh)
      .finally(() => {
        joiningRef.current = false;
      });
  }, [state, refresh]);

  return (
    <main>
      <h1 className="page-title">Kelime Tahmin Oyunu</h1>
      {loadError ? <p className="error-text">{loadError}</p> : null}
      {renderScreen(state, refresh)}
    </main>
  );
}

function renderScreen(state: StateResponse | null, refresh: () => Promise<void>) {
  if (!state) {
    return (
      <div className="card">
        <div className="spinner" />
      </div>
    );
  }

  switch (state.screen) {
    case "NEEDS_NICKNAME":
      return <NicknameForm onReady={refresh} />;

    case "NO_GAME":
      return (
        <div className="card">
          <div className="spinner" />
          <p className="card-subtext center-text">Oyuna giriliyor…</p>
        </div>
      );

    case "GUESSING":
      return (
        <GuessingScreen
          round={state.round}
          participantCount={state.participantCount}
          joinOpen={state.joinOpen}
          onSubmitted={refresh}
        />
      );

    case "WAITING":
      return (
        <WaitingScreen
          round={state.round}
          guess={state.guess}
          participantCount={state.participantCount}
        />
      );

    case "ELIMINATED":
      return (
        <EndedScreen
          kind="ELIMINATED"
          eliminatedRound={state.eliminatedRound}
          onRetry={refresh}
        />
      );

    case "CANCELLED":
      return <EndedScreen kind="CANCELLED" onRetry={refresh} />;

    case "FINALIST":
      return (
        <FinalistScreen
          conversation={state.conversation}
          nickname={state.nickname}
          participantId={state.yourParticipantId}
        />
      );

    default:
      return null;
  }
}
