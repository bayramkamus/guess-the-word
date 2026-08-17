"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, fetchMessages, sendMessage } from "@/lib/api/client";
import type { Message } from "@/lib/api/client";

type FinalistScreenProps = {
  conversation: { id: string; word: string; members: string[] } | null;
  nickname: string;
  /// Giriş yapmış oyuncunun SessionParticipant kimliği. "Kendi mesajım mı"
  /// kontrolü nickname yerine bununla yapılır; nickname'ler benzersiz
  /// olmadığından aynı isimli iki finalist varsa nickname karşılaştırması
  /// mesajları yanlış tarafa hizalayabilirdi.
  participantId: string;
};

const POLL_INTERVAL_MS = 1500;

/// Son tura kalan grup için sohbet ekranı. Mesajlar `since` parametresiyle
/// yalnızca yeni gelenler için yoklanır ve id'ye göre tekilleştirilerek
/// mevcut listeye eklenir.
export function FinalistScreen({ conversation, nickname, participantId }: FinalistScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const lastCreatedAtRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversation) {
      return;
    }

    let cancelled = false;

    async function poll() {
      if (!conversation) return;

      try {
        const result = await fetchMessages(conversation.id, lastCreatedAtRef.current);

        if (cancelled || result.messages.length === 0) {
          return;
        }

        lastCreatedAtRef.current =
          result.messages[result.messages.length - 1].createdAt;

        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...result.messages.filter((m) => !seen.has(m.id))];
          return merged;
        });
      } catch {
        // Sohbet yoklaması sessizce yeniden dener; tek bir hata kullanıcıyı
        // rahatsız etmemeli.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversation]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  if (!conversation) {
    return (
      <div className="card">
        <div className="spinner" />
        <p className="card-subtext center-text">Sohbet hazırlanıyor…</p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = draft.trim();

    if (!trimmed || sending || !conversation) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const { message } = await sendMessage(conversation.id, trimmed);
      lastCreatedAtRef.current = message.createdAt;
      setMessages((prev) => [...prev, { ...message, senderNickname: nickname }]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card card-wide">
      <h2 className="card-heading center-text">Finalistsin! Kelime: “{conversation.word}”</h2>
      <div className="member-list">
        {conversation.members.map((member) => (
          <span key={member} className="member-chip">
            {member}
          </span>
        ))}
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">Henüz mesaj yok. İlk mesajı sen yaz.</p>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderParticipantId === participantId;
            return (
              <div
                key={message.id}
                className={`chat-message${isOwn ? " chat-message-own" : ""}`}
              >
                <p className="chat-message-sender">
                  {message.senderNickname ?? "…"}
                </p>
                <p className="chat-message-body">{message.body}</p>
              </div>
            );
          })
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Bir mesaj yaz…"
          maxLength={1000}
          disabled={sending}
        />
        <button className="btn-primary" type="submit" disabled={sending || draft.trim().length === 0}>
          Gönder
        </button>
      </form>
    </div>
  );
}
