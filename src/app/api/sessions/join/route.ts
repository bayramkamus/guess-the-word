import { NextResponse } from "next/server";

import { readClientToken, setClientTokenCookie } from "@/lib/auth/currentUser";
import { joinOpenSession } from "@/lib/game/session";
import { prisma } from "@/lib/prisma";

/// Oyuncuyu katılıma açık oyuna alır; açık oyun yoksa yenisini başlatır.
///
/// Oyuncu bu çağrıdan sonra doğrudan tahmin ekranına düşer; arada bir lobi
/// aşaması yoktur.
export async function POST() {
  try {
    const clientToken = await readClientToken();

    if (!clientToken) {
      return NextResponse.json(
        { error: "Önce bir nickname belirlemelisin." },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { clientToken },
      select: { id: true, nickname: true, clientToken: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Oyuncu bulunamadı. Nickname'ini yeniden belirle." },
        { status: 401 },
      );
    }

    const { session, participant } = await joinOpenSession(
      user.id,
      user.nickname,
    );

    const currentRound = session.rounds.find(
      (round) => round.status === "ACTIVE",
    );

    const response = NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        joinClosesAt: session.joinClosesAt,
      },
      round: currentRound
        ? { number: currentRound.roundNumber, endsAt: currentRound.endsAt }
        : null,
      participantId: participant.id,
    });

    // Çerezi her tanınan istekte tazele.
    setClientTokenCookie(response, user.clientToken);

    return response;
  } catch (error) {
    console.error("Oyuna katılınamadı:", error);

    return NextResponse.json(
      { error: "Oyuna katılırken bir hata oluştu." },
      { status: 500 },
    );
  }
}
