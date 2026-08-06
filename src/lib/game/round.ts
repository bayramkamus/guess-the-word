/// Tur sonuçlandırma: tahminleri gruplayıp eşleşenleri sonraki tura taşımak,
/// eşleşmeyenleri elemek ve son turda finalist sohbetlerini açmak.
///
/// Bu modül tetikleyiciden bağımsızdır. `resolveDueRounds` bir istek
/// sırasında da, arka planda çalışan bir süreçten de çağrılabilir.

import { prisma } from "@/lib/prisma";

import { MIN_PLAYERS, ROUND_SECONDS, TOTAL_ROUNDS } from "./config";

/// Bir turun sonuçlanma biçimi.
export type RoundOutcome =
  /// Tur zaten sonuçlandırılmış veya süresi dolmamıştı; işlem yapılmadı.
  | { resolved: false }
  /// Hiçbir grup oluşmadı; oyun finalist üretmeden sona erdi.
  | { resolved: true; outcome: "NO_MATCH" }
  /// Eşleşenler bir sonraki tura taşındı.
  | { resolved: true; outcome: "NEXT_ROUND"; survivorCount: number }
  /// Son tur tamamlandı; finalistler ve sohbetleri oluşturuldu.
  | { resolved: true; outcome: "FINISHED"; conversationCount: number };

/// Tahminleri normalize edilmiş kelimeye göre gruplar.
function groupByWord(
  guesses: Array<{ sessionParticipantId: string; normalizedWord: string }>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const guess of guesses) {
    const members = groups.get(guess.normalizedWord);

    if (members) {
      members.push(guess.sessionParticipantId);
    } else {
      groups.set(guess.normalizedWord, [guess.sessionParticipantId]);
    }
  }

  return groups;
}

/// Süresi dolmuş tek bir turu sonuçlandırır.
///
/// Bütün işlem tek bir transaction içinde yürür. Turu `PROCESSING` durumuna
/// alan koşullu güncelleme aynı zamanda kilit görevi görür: aynı turu aynı
/// anda sonuçlandırmaya çalışan ikinci istek sıfır satır etkiler ve hiçbir
/// şey yapmadan döner.
export async function resolveRound(
  roundId: string,
  now: Date = new Date(),
): Promise<RoundOutcome> {
  return prisma.$transaction(async (tx): Promise<RoundOutcome> => {
    const claimed = await tx.round.updateMany({
      where: {
        id: roundId,
        status: "ACTIVE",
        endsAt: { lte: now },
      },
      data: { status: "PROCESSING" },
    });

    if (claimed.count === 0) {
      return { resolved: false };
    }

    const round = await tx.round.findUniqueOrThrow({ where: { id: roundId } });

    const guesses = await tx.guess.findMany({
      where: { roundId },
      select: { sessionParticipantId: true, normalizedWord: true },
    });

    const groups = groupByWord(guesses);

    // Yalnızca en az iki kişinin yazdığı kelimeler eşleşme sayılır.
    const survivingGroups = [...groups.entries()].filter(
      ([, members]) => members.length >= MIN_PLAYERS,
    );
    const survivorIds = survivingGroups.flatMap(([, members]) => members);

    // Eşleşemeyenler ve hiç tahmin göndermemiş olanlar birlikte elenir.
    // notIn boş dizi ile çağrılmadığından emin olunur; boş dizi bazı
    // sürücülerde geçersiz SQL üretir.
    await tx.sessionParticipant.updateMany({
      where:
        survivorIds.length > 0
          ? {
              sessionId: round.sessionId,
              status: "ACTIVE",
              id: { notIn: survivorIds },
            }
          : {
              sessionId: round.sessionId,
              status: "ACTIVE",
            },
      data: {
        status: "ELIMINATED",
        eliminatedRound: round.roundNumber,
      },
    });

    await tx.round.update({
      where: { id: roundId },
      data: { status: "FINISHED" },
    });

    // Hiç grup oluşmadıysa oyun finalist üretmeden biter.
    if (survivingGroups.length === 0) {
      await tx.gameSession.update({
        where: { id: round.sessionId },
        data: { status: "FINISHED", finishedAt: now },
      });

      return { resolved: true, outcome: "NO_MATCH" };
    }

    // Son tur değilse yeni tur açılır; bu tura yalnızca hayatta kalanlar
    // tahmin gönderebilir.
    if (round.roundNumber < TOTAL_ROUNDS) {
      await tx.round.create({
        data: {
          sessionId: round.sessionId,
          roundNumber: round.roundNumber + 1,
          startsAt: now,
          endsAt: new Date(now.getTime() + ROUND_SECONDS * 1000),
          status: "ACTIVE",
        },
      });

      return {
        resolved: true,
        outcome: "NEXT_ROUND",
        survivorCount: survivorIds.length,
      };
    }

    // Son tur: hayatta kalanlar finalist olur ve her grup kendi sohbetini alır.
    await tx.sessionParticipant.updateMany({
      where: { id: { in: survivorIds } },
      data: { status: "FINALIST", finalRound: round.roundNumber },
    });

    for (const [normalizedWord, memberIds] of survivingGroups) {
      await tx.conversation.create({
        data: {
          sessionId: round.sessionId,
          finalRound: round.roundNumber,
          normalizedWord,
          members: {
            create: memberIds.map((sessionParticipantId) => ({
              sessionParticipantId,
            })),
          },
        },
      });
    }

    await tx.gameSession.update({
      where: { id: round.sessionId },
      data: { status: "FINISHED", finishedAt: now },
    });

    return {
      resolved: true,
      outcome: "FINISHED",
      conversationCount: survivingGroups.length,
    };
  });
}

/// Süresi dolmuş bütün turları sonuçlandırır.
///
/// Yalnızca katılımı kapanmış (`ACTIVE`) oyunların turları işlenir; katılım
/// penceresi hâlâ açıkken veya oyun iptal edilmişken tur sonuçlandırılmaz.
export async function resolveDueRounds(now: Date = new Date()): Promise<void> {
  const dueRounds = await prisma.round.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { lte: now },
      session: { status: "ACTIVE" },
    },
    select: { id: true },
  });

  for (const round of dueRounds) {
    await resolveRound(round.id, now);
  }
}
