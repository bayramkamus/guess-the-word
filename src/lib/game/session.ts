/// Oturum yaşam döngüsü: katılıma açık oyunu bulmak, oluşturmak ve
/// katılım penceresini kapatmak.
///
/// Buradaki fonksiyonlar tetikleyiciden bağımsızdır; ister bir istek
/// sırasında, ister arka planda çalışan bir süreçten çağrılabilirler.

import { prisma } from "@/lib/prisma";

import {
  JOIN_CUTOFF_SECONDS,
  LOBBY_KEY_OPEN,
  MIN_PLAYERS,
  ROUND_SECONDS,
} from "./config";

/// Prisma'nın benzersizlik ihlali hata kodu.
/// Hata sınıfını doğrudan import etmek yerine kod alanına bakılır; böylece
/// üretilen istemcinin dışa aktarım biçmine bağımlılık oluşmaz.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function secondsFrom(base: Date, seconds: number): Date {
  return new Date(base.getTime() + seconds * 1000);
}

/// Katılıma açık ve penceresi henüz kapanmamış oturumu döndürür.
function findOpenSession(now: Date) {
  return prisma.gameSession.findFirst({
    where: {
      lobbyKey: LOBBY_KEY_OPEN,
      joinClosesAt: { gt: now },
    },
    include: {
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
}

/// Yeni bir oturumu birinci turuyla birlikte oluşturur.
/// Birinci tur aynı zamanda katılım penceresidir: tur `ROUND_SECONDS` sonra
/// biter, katılım ise bundan `JOIN_CUTOFF_SECONDS` önce kapanır.
function createSession(now: Date) {
  return prisma.gameSession.create({
    data: {
      startsAt: now,
      joinClosesAt: secondsFrom(now, ROUND_SECONDS - JOIN_CUTOFF_SECONDS),
      status: "WAITING",
      lobbyKey: LOBBY_KEY_OPEN,
      rounds: {
        create: {
          roundNumber: 1,
          startsAt: now,
          endsAt: secondsFrom(now, ROUND_SECONDS),
          status: "ACTIVE",
        },
      },
    },
    include: {
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
}

/// Katılım penceresi dolmuş bir oturumu kapatır.
///
/// Oyuncu sayısı yeterliyse oturum `ACTIVE` olur ve turlar devam eder;
/// yeterli değilse `CANCELLED` olur, çünkü eşleşme matematiksel olarak
/// imkânsızdır. Her iki durumda da `lobbyKey` boşaltılır ve böylece yeni
/// bir oturumun açılmasının önü açılır.
async function closeJoinWindow(sessionId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const participantCount = await tx.sessionParticipant.count({
      where: { sessionId, status: "ACTIVE" },
    });

    const hasEnoughPlayers = participantCount >= MIN_PLAYERS;

    // Koşullu güncelleme, aynı oturumu iki isteğin birden kapatmasını önler.
    // İkinci istek sıfır satır etkiler ve sessizce çıkar.
    const claimed = await tx.gameSession.updateMany({
      where: { id: sessionId, status: "WAITING" },
      data: {
        status: hasEnoughPlayers ? "ACTIVE" : "CANCELLED",
        lobbyKey: null,
        finishedAt: hasEnoughPlayers ? null : now,
      },
    });

    if (claimed.count === 0) {
      return;
    }

    if (!hasEnoughPlayers) {
      await tx.round.updateMany({
        where: { sessionId },
        data: { status: "FINISHED" },
      });
    }
  });
}

/// Penceresi dolmuş bütün oturumların katılımını kapatır.
export async function closeExpiredJoinWindows(
  now: Date = new Date(),
): Promise<void> {
  const expired = await prisma.gameSession.findMany({
    where: {
      status: "WAITING",
      joinClosesAt: { lte: now },
    },
    select: { id: true },
  });

  for (const session of expired) {
    await closeJoinWindow(session.id, now);
  }
}

/// Kullanıcıyı katılıma açık oyuna alır; açık oyun yoksa yenisini oluşturur.
///
/// Aynı kullanıcı aynı oturuma iki kez katılamaz; tekrar çağrıldığında
/// mevcut katılım kaydı döndürülür.
export async function joinOpenSession(
  userId: string,
  nickname: string,
  now: Date = new Date(),
) {
  // Süresi dolmuş bir pencere açık kalmışsa önce onu kapat; aksi hâlde
  // oyuncu artık katılamayacağı bir oyuna yazılır.
  await closeExpiredJoinWindows(now);

  let session = await findOpenSession(now);

  if (!session) {
    try {
      session = await createSession(now);
    } catch (error) {
      // lobbyKey üzerindeki benzersiz indeks, aynı anda ikinci bir oturumun
      // açılmasını engeller. Yarışı kaybeden istek rakibinin oluşturduğu
      // oturumu okur.
      if (!isUniqueViolation(error)) {
        throw error;
      }

      session = await findOpenSession(now);

      if (!session) {
        throw new Error("Katılıma açık oturum oluşturulamadı.");
      }
    }
  }

  const participant = await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: { sessionId: session.id, userId },
    },
    update: {},
    create: {
      sessionId: session.id,
      userId,
      nicknameSnapshot: nickname,
    },
  });

  return { session, participant };
}
