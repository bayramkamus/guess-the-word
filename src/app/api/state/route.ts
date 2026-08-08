import { NextResponse } from "next/server";

import { readClientToken } from "@/lib/auth/currentUser";
import { TOTAL_ROUNDS } from "@/lib/game/config";
import { resolveDueRounds } from "@/lib/game/round";
import { closeExpiredJoinWindows } from "@/lib/game/session";
import { prisma } from "@/lib/prisma";

/// Arayüzün saniyede bir yokladığı uç nokta.
///
/// Oyuncunun hangi ekranı görmesi gerektiğini ve o ekranın ihtiyaç duyduğu
/// veriyi döndürür. Aynı zamanda oyunun zamanla ilerlemesini tetikler:
/// süresi dolmuş katılım pencereleri kapatılır ve biten turlar sonuçlandırılır.
export async function GET() {
  try {
    const now = new Date();

    // Tembel ilerletme: oyunu zamanda ileri taşıyan tek yer burasıdır.
    // Arka planda çalışan bir süreç kullanılırsa aynı iki fonksiyon oradan
    // da çağrılabilir; ikisi birlikte çalıştığında koşullu güncellemeler
    // çifte işlemeyi engeller.
    await closeExpiredJoinWindows(now);
    await resolveDueRounds(now);

    const clientToken = await readClientToken();

    if (!clientToken) {
      return NextResponse.json({ screen: "NEEDS_NICKNAME" });
    }

    const user = await prisma.user.findUnique({
      where: { clientToken },
      select: { id: true, nickname: true },
    });

    if (!user) {
      return NextResponse.json({ screen: "NEEDS_NICKNAME" });
    }

    const participant = await prisma.sessionParticipant.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "desc" },
      include: {
        session: {
          include: {
            rounds: { orderBy: { roundNumber: "asc" } },
          },
        },
      },
    });

    const base = { nickname: user.nickname };

    // Hiç oyuna girmemiş ya da son oyunu bitmiş oyuncu yeni oyuna girebilir.
    if (!participant) {
      return NextResponse.json({ ...base, screen: "NO_GAME" });
    }

    const { session } = participant;

    if (session.status === "CANCELLED") {
      return NextResponse.json({ ...base, screen: "CANCELLED" });
    }

    if (participant.status === "ELIMINATED" || participant.status === "LEFT") {
      return NextResponse.json({
        ...base,
        screen: "ELIMINATED",
        eliminatedRound: participant.eliminatedRound,
      });
    }

    if (participant.status === "FINALIST") {
      const membership = await prisma.conversationMember.findFirst({
        where: { sessionParticipantId: participant.id },
        include: {
          conversation: {
            include: {
              members: {
                include: {
                  participant: { select: { nicknameSnapshot: true } },
                },
              },
            },
          },
        },
      });

      return NextResponse.json({
        ...base,
        screen: "FINALIST",
        conversation: membership
          ? {
              id: membership.conversation.id,
              word: membership.conversation.normalizedWord,
              members: membership.conversation.members.map(
                (member) => member.participant.nicknameSnapshot,
              ),
            }
          : null,
      });
    }

    // Buradan sonrası hâlâ oyunda olan oyuncu.
    const currentRound = session.rounds.find(
      (round) => round.status === "ACTIVE",
    );

    if (!currentRound) {
      // Tur sonuçlandırılıyor; oyuncu birkaç yüz milisaniye bekleyecek.
      return NextResponse.json({ ...base, screen: "WAITING" });
    }

    const existingGuess = await prisma.guess.findUnique({
      where: {
        roundId_sessionParticipantId: {
          roundId: currentRound.id,
          sessionParticipantId: participant.id,
        },
      },
      select: { originalWord: true },
    });

    const participantCount = await prisma.sessionParticipant.count({
      where: { sessionId: session.id, status: "ACTIVE" },
    });

    return NextResponse.json({
      ...base,
      screen: existingGuess ? "WAITING" : "GUESSING",
      round: {
        number: currentRound.roundNumber,
        total: TOTAL_ROUNDS,
        endsAt: currentRound.endsAt,
      },
      guess: existingGuess?.originalWord ?? null,
      participantCount,
      joinOpen: session.status === "WAITING",
    });
  } catch (error) {
    console.error("Durum okunamadı:", error);

    return NextResponse.json(
      { error: "Durum alınırken bir hata oluştu." },
      { status: 500 },
    );
  }
}
