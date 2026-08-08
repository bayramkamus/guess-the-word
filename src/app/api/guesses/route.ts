import { NextResponse } from "next/server";

import { readClientToken } from "@/lib/auth/currentUser";
import { prisma } from "@/lib/prisma";
import {
  GUESS_REJECTION_MESSAGES,
  validateGuess,
} from "@/lib/words/normalize";

/// Oyuncunun içinde bulunduğu turdaki tahminini kaydeder.
///
/// Bir oyuncu bir turda yalnızca bir tahmin gönderebilir; bu kural
/// Guess üzerindeki @@unique([roundId, sessionParticipantId]) kısıtıyla
/// veritabanı seviyesinde uygulanır.
export async function POST(request: Request) {
  try {
    const clientToken = await readClientToken();

    if (!clientToken) {
      return NextResponse.json(
        { error: "Önce bir nickname belirlemelisin." },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || !("word" in body)) {
      return NextResponse.json(
        { error: "Kelime alanı zorunludur." },
        { status: 400 },
      );
    }

    const wordValue = body.word;

    if (typeof wordValue !== "string") {
      return NextResponse.json(
        { error: "Kelime metin olmalıdır." },
        { status: 400 },
      );
    }

    const validation = validateGuess(wordValue);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: GUESS_REJECTION_MESSAGES[validation.reason],
          reason: validation.reason,
        },
        { status: 400 },
      );
    }

    // Oyuncunun hâlâ oyunda olduğu ve turun açık olduğu tek sorguda doğrulanır.
    const participant = await prisma.sessionParticipant.findFirst({
      where: {
        user: { clientToken },
        status: "ACTIVE",
        session: { status: { in: ["WAITING", "ACTIVE"] } },
      },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        sessionId: true,
      },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Devam eden bir oyunun yok." },
        { status: 409 },
      );
    }

    const now = new Date();

    const round = await prisma.round.findFirst({
      where: {
        sessionId: participant.sessionId,
        status: "ACTIVE",
        endsAt: { gt: now },
      },
      select: { id: true, roundNumber: true, endsAt: true },
    });

    if (!round) {
      return NextResponse.json(
        { error: "Tahmin süresi doldu." },
        { status: 409 },
      );
    }

    try {
      await prisma.guess.create({
        data: {
          roundId: round.id,
          sessionParticipantId: participant.id,
          originalWord: wordValue.trim(),
          normalizedWord: validation.normalized,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Bu turda zaten bir tahmin gönderdin." },
          { status: 409 },
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        round: { number: round.roundNumber, endsAt: round.endsAt },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Tahmin kaydedilemedi:", error);

    return NextResponse.json(
      { error: "Tahmin gönderilirken bir hata oluştu." },
      { status: 500 },
    );
  }
}
