/// Arayüzün /api altındaki uç noktalarla konuştuğu tek yer.
///
/// Her fonksiyon backend route'unun döndürdüğü JSON şeklini birebir
/// yansıtan bir tip döndürür; route'lardaki response şekli değişirse bu
/// dosya da güncellenmelidir.

/// GET /api/state ve POST /api/sessions/join tarafından paylaşılan tur bilgisi.
export type RoundInfo = {
  number: number;
  total: number;
  endsAt: string;
};

/// GET /api/state uç noktasının döndürebileceği bütün ekran durumları.
export type StateResponse =
  | { screen: "NEEDS_NICKNAME" }
  | { screen: "NO_GAME"; nickname: string }
  | { screen: "CANCELLED"; nickname: string }
  | { screen: "ELIMINATED"; nickname: string; eliminatedRound: number | null }
  | {
      screen: "FINALIST";
      nickname: string;
      yourParticipantId: string;
      conversation: { id: string; word: string; members: string[] } | null;
    }
  // Tur PROCESSING aşamasındayken round/guess alanları hiç gönderilmez;
  // tahmin gönderilmişse hepsi dolu gelir.
  | {
      screen: "WAITING";
      nickname: string;
      round?: RoundInfo;
      guess?: string | null;
      participantCount?: number;
      joinOpen?: boolean;
    }
  | {
      screen: "GUESSING";
      nickname: string;
      round: RoundInfo;
      guess: string | null;
      participantCount: number;
      joinOpen: boolean;
    };

/// GET /api/messages öğe şekli. senderNickname yalnızca GET yanıtında vardır;
/// POST /api/messages bu alanı döndürmez (sendMessage bunu ayrıca bilir).
export type Message = {
  id: string;
  body: string;
  createdAt: string;
  senderParticipantId: string;
  senderNickname?: string;
};

/// API'nin döndürdüğü hata gövdesini (error, reason) taşıyan özel hata sınıfı.
export class ApiError extends Error {
  readonly status: number;
  readonly reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.reason = reason;
  }
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Beklenmeyen bir hata oluştu.";
    const reason =
      data && typeof data === "object" && "reason" in data && typeof data.reason === "string"
        ? data.reason
        : undefined;

    throw new ApiError(errorMessage, response.status, reason);
  }

  return data as T;
}

/// Oyuncunun hangi ekranı görmesi gerektiğini döndürür; arayüz bunu
/// saniyede bir yoklar.
export function fetchState(): Promise<StateResponse> {
  return fetch("/api/state", { cache: "no-store" }).then((response) =>
    parseJsonOrThrow<StateResponse>(response),
  );
}

/// Nickname belirler veya günceller; clientToken çerezi yanıtla birlikte
/// tazelenir.
export function setNickname(
  nickname: string,
): Promise<{ user: { id: string; nickname: string } }> {
  return fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  }).then((response) => parseJsonOrThrow(response));
}

/// Katılıma açık oyuna girer; açık oyun yoksa sunucu yenisini açar.
export function joinSession(): Promise<{
  session: { id: string; status: string; joinClosesAt: string };
  round: { number: number; endsAt: string } | null;
  participantId: string;
}> {
  return fetch("/api/sessions/join", { method: "POST" }).then((response) =>
    parseJsonOrThrow(response),
  );
}

/// İçinde bulunulan turdaki kelime tahminini gönderir.
export function submitGuess(
  word: string,
): Promise<{ round: { number: number; endsAt: string } }> {
  return fetch("/api/guesses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  }).then((response) => parseJsonOrThrow(response));
}

/// Bir finalist sohbetindeki mesajları getirir. `since` verilirse yalnızca
/// o zamandan sonraki mesajlar döner; polling sırasında gereksiz veri
/// taşınmasını önler.
export function fetchMessages(
  conversationId: string,
  since?: string,
): Promise<{ conversationStatus: string; messages: Message[] }> {
  const params = new URLSearchParams({ conversationId });

  if (since) {
    params.set("since", since);
  }

  return fetch(`/api/messages?${params.toString()}`, {
    cache: "no-store",
  }).then((response) => parseJsonOrThrow(response));
}

/// Bir finalist sohbetine mesaj gönderir.
export function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ message: Message }> {
  return fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, body }),
  }).then((response) => parseJsonOrThrow(response));
}
