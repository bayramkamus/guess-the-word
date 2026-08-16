import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const db = vi.hoisted(() => {
  return {
    gameSessions: [] as any[],
    rounds: [] as any[],
    participants: [] as any[],
    nextId: 1,
    controls: { forceOpenSessionMissOnce: false },
  };
});

function genId(prefix: string): string {
  return `${prefix}_${db.nextId++}`;
}

function attachRounds(session: any) {
  return {
    ...session,
    rounds: db.rounds
      .filter((r) => r.sessionId === session.id)
      .sort((a, b) => a.roundNumber - b.roundNumber),
  };
}

// session.ts hem dogrudan prisma uzerinden (findOpenSession, createSession,
// sessionParticipant.upsert) hem de $transaction icindeki tx uzerinden
// (closeJoinWindow) sorgu yapar. Ikisi de ayni bellek-ici depoyu paylasan
// tek bir `client` nesnesi uzerinden yurutulur.
vi.mock("@/lib/prisma", () => {
  const client = {
    gameSession: {
      findFirst: async ({ where }: any) => {
        if (db.controls.forceOpenSessionMissOnce) {
          db.controls.forceOpenSessionMissOnce = false;
          return null;
        }

        const session = db.gameSessions.find((s) => {
          if (
            where.lobbyKey !== undefined &&
            s.lobbyKey !== where.lobbyKey
          ) {
            return false;
          }
          if (
            where.joinClosesAt?.gt &&
            !(s.joinClosesAt.getTime() > where.joinClosesAt.gt.getTime())
          ) {
            return false;
          }
          return true;
        });

        return session ? attachRounds(session) : null;
      },
      create: async ({ data }: any) => {
        if (
          data.lobbyKey &&
          db.gameSessions.some((s) => s.lobbyKey === data.lobbyKey)
        ) {
          // MySQL'deki @unique(lobbyKey) kisitinin taklidi: ayni anda
          // ikinci bir "OPEN" oturum olusturulamaz.
          const error: any = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }

        const { rounds, ...rest } = data;
        const session = { id: genId("session"), ...rest };
        db.gameSessions.push(session);

        if (rounds?.create) {
          db.rounds.push({
            id: genId("round"),
            sessionId: session.id,
            ...rounds.create,
          });
        }

        return attachRounds(session);
      },
      findMany: async ({ where }: any) => {
        return db.gameSessions
          .filter((s) => {
            if (where.status !== undefined && s.status !== where.status) {
              return false;
            }
            if (
              where.joinClosesAt?.lte &&
              !(s.joinClosesAt.getTime() <= where.joinClosesAt.lte.getTime())
            ) {
              return false;
            }
            return true;
          })
          .map((s) => ({ id: s.id }));
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const session of db.gameSessions) {
          if (where.id !== undefined && session.id !== where.id) continue;
          if (
            where.status !== undefined &&
            session.status !== where.status
          ) {
            continue;
          }
          Object.assign(session, data);
          count++;
        }
        return { count };
      },
    },
    round: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const round of db.rounds) {
          if (where.sessionId !== undefined && round.sessionId !== where.sessionId) {
            continue;
          }
          Object.assign(round, data);
          count++;
        }
        return { count };
      },
    },
    sessionParticipant: {
      count: async ({ where }: any) => {
        return db.participants.filter((p) => {
          if (where.sessionId !== undefined && p.sessionId !== where.sessionId) {
            return false;
          }
          if (where.status !== undefined && p.status !== where.status) {
            return false;
          }
          return true;
        }).length;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.sessionId_userId;
        let participant = db.participants.find(
          (p) => p.sessionId === key.sessionId && p.userId === key.userId,
        );

        if (participant) {
          Object.assign(participant, update);
          return participant;
        }

        participant = { id: genId("participant"), status: "ACTIVE", ...create };
        db.participants.push(participant);
        return participant;
      },
    },
  };

  return {
    prisma: {
      ...client,
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
    },
  };
});

const { closeExpiredJoinWindows, joinOpenSession } = await import(
  "./session"
);
const { JOIN_CUTOFF_SECONDS, LOBBY_KEY_OPEN, MIN_PLAYERS, ROUND_SECONDS } =
  await import("./config");

function resetDb() {
  db.gameSessions = [];
  db.rounds = [];
  db.participants = [];
  db.nextId = 1;
  db.controls = { forceOpenSessionMissOnce: false };
}

beforeEach(() => {
  resetDb();
});

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("joinOpenSession", () => {
  it("acik oturum yoksa yeni oturumu 1. turuyla birlikte olusturur", async () => {
    const { session, participant } = await joinOpenSession(
      "user_1",
      "bayram",
      NOW,
    );

    expect(session.lobbyKey).toBe(LOBBY_KEY_OPEN);
    expect(session.status).toBe("WAITING");
    expect(session.rounds).toHaveLength(1);
    expect(session.rounds[0].roundNumber).toBe(1);
    expect(session.rounds[0].status).toBe("ACTIVE");
    expect(session.rounds[0].endsAt.getTime() - NOW.getTime()).toBe(
      ROUND_SECONDS * 1000,
    );
    expect(session.joinClosesAt.getTime() - NOW.getTime()).toBe(
      (ROUND_SECONDS - JOIN_CUTOFF_SECONDS) * 1000,
    );
    expect(participant.sessionId).toBe(session.id);
    expect(participant.userId).toBe("user_1");
    expect(participant.nicknameSnapshot).toBe("bayram");
  });

  it("acik oturum varsa ikinci oyuncuyu ayni oturuma ekler", async () => {
    const first = await joinOpenSession("user_1", "bayram", NOW);
    const second = await joinOpenSession("user_2", "ahmet", NOW);

    expect(second.session.id).toBe(first.session.id);
    expect(db.gameSessions).toHaveLength(1);
  });

  it("ayni kullanici ayni oturuma iki kez katilinca ayni katilim kaydini dondurur", async () => {
    const first = await joinOpenSession("user_1", "bayram", NOW);
    const second = await joinOpenSession("user_1", "bayram", NOW);

    expect(second.participant.id).toBe(first.participant.id);
    expect(db.participants).toHaveLength(1);
  });

  it("lobbyKey yaris durumunda rakibin actigi oturumu okuyup ona katilir", async () => {
    // Bir baska istek zaten bir oturum acmis ("OPEN"), ama bu cagrinin
    // findOpenSession okumasi (TOCTOU) onu kacirmis gibi simule edilir.
    // create() gercek DB'deki unique index gibi P2002 firlatir; kod bunu
    // yakalayip mevcut oturumu yeniden okumali.
    const existing = await joinOpenSession("user_1", "bayram", NOW);
    db.controls.forceOpenSessionMissOnce = true;

    const second = await joinOpenSession("user_2", "ahmet", NOW);

    expect(second.session.id).toBe(existing.session.id);
    expect(db.gameSessions).toHaveLength(1);
  });
});

describe("closeExpiredJoinWindows", () => {
  it(`MIN_PLAYERS (${MIN_PLAYERS}) ve uzeri katilimda oturumu ACTIVE yapar`, async () => {
    const { session } = await joinOpenSession("user_1", "bayram", NOW);
    await joinOpenSession("user_2", "ahmet", NOW);

    const closeTime = new Date(session.joinClosesAt.getTime() + 1);
    await closeExpiredJoinWindows(closeTime);

    const updated = db.gameSessions.find((s) => s.id === session.id);
    expect(updated.status).toBe("ACTIVE");
    expect(updated.lobbyKey).toBeNull();
  });

  it(`MIN_PLAYERS altinda katilimda oturumu CANCELLED yapar ve turlari kapatir`, async () => {
    const { session, round } = await (async () => {
      const result = await joinOpenSession("user_1", "bayram", NOW);
      return { ...result, round: result.session.rounds[0] };
    })();

    const closeTime = new Date(session.joinClosesAt.getTime() + 1);
    await closeExpiredJoinWindows(closeTime);

    const updatedSession = db.gameSessions.find((s) => s.id === session.id);
    expect(updatedSession.status).toBe("CANCELLED");
    expect(updatedSession.lobbyKey).toBeNull();
    expect(updatedSession.finishedAt).toEqual(closeTime);

    const updatedRound = db.rounds.find((r) => r.id === round.id);
    expect(updatedRound.status).toBe("FINISHED");
  });

  it("penceresi henuz dolmamis oturuma dokunmaz", async () => {
    const { session } = await joinOpenSession("user_1", "bayram", NOW);

    await closeExpiredJoinWindows(NOW);

    const untouched = db.gameSessions.find((s) => s.id === session.id);
    expect(untouched.status).toBe("WAITING");
    expect(untouched.lobbyKey).toBe(LOBBY_KEY_OPEN);
  });

  it("kapanan pencereden sonra yeni oyuncu icin ayri bir oturum acilir", async () => {
    const { session: firstSession } = await joinOpenSession(
      "user_1",
      "bayram",
      NOW,
    );

    const afterClose = new Date(firstSession.joinClosesAt.getTime() + 1);
    const { session: secondSession } = await joinOpenSession(
      "user_2",
      "ahmet",
      afterClose,
    );

    expect(secondSession.id).not.toBe(firstSession.id);
    expect(db.gameSessions).toHaveLength(2);

    const updatedFirst = db.gameSessions.find((s) => s.id === firstSession.id);
    // Tek kisilik ilk oturum MIN_PLAYERS altinda kaldigi icin iptal olur.
    expect(updatedFirst.status).toBe("CANCELLED");
  });
});
