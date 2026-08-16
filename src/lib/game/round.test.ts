import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock fabrikasi hoist edildigi icin disaridaki degiskenlere
// dogrudan erisemez; bu yuzden depo da vi.hoisted ile olusturulur.
const db = vi.hoisted(() => {
  return {
    rounds: [] as any[],
    guesses: [] as any[],
    participants: [] as any[],
    gameSessions: [] as any[],
    conversations: [] as any[],
    conversationMembers: [] as any[],
    nextId: 1,
  };
});

function genId(prefix: string): string {
  return `${prefix}_${db.nextId++}`;
}

// round.ts'nin kullandigi prisma yontemlerinin bellek-ici sahte
// karsiliklari. Gercek Prisma'nin transaction/where davranisini birebir
// taklit etmez; yalnizca resolveRound'un ihtiyac duydugu alt kumeyi kapsar.
vi.mock("@/lib/prisma", () => {
  const tx = {
    round: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const round of db.rounds) {
          const matchesId = round.id === where.id;
          const matchesStatus = round.status === where.status;
          const matchesEndsAt = where.endsAt?.lte
            ? round.endsAt.getTime() <= where.endsAt.lte.getTime()
            : true;
          if (matchesId && matchesStatus && matchesEndsAt) {
            Object.assign(round, data);
            count++;
          }
        }
        return { count };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const round = db.rounds.find((r) => r.id === where.id);
        if (!round) throw new Error(`Round bulunamadi: ${where.id}`);
        return round;
      },
      update: async ({ where, data }: any) => {
        const round = db.rounds.find((r) => r.id === where.id);
        if (!round) throw new Error(`Round bulunamadi: ${where.id}`);
        Object.assign(round, data);
        return round;
      },
      create: async ({ data }: any) => {
        const round = { id: genId("round"), ...data };
        db.rounds.push(round);
        return round;
      },
    },
    guess: {
      findMany: async ({ where }: any) => {
        return db.guesses.filter((g) => g.roundId === where.roundId);
      },
    },
    sessionParticipant: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const participant of db.participants) {
          const matchesSession = where.sessionId
            ? participant.sessionId === where.sessionId
            : true;
          const matchesStatus = where.status
            ? participant.status === where.status
            : true;
          const matchesNotIn = where.id?.notIn
            ? !where.id.notIn.includes(participant.id)
            : true;
          const matchesIn = where.id?.in
            ? where.id.in.includes(participant.id)
            : true;

          if (matchesSession && matchesStatus && matchesNotIn && matchesIn) {
            Object.assign(participant, data);
            count++;
          }
        }
        return { count };
      },
    },
    gameSession: {
      update: async ({ where, data }: any) => {
        const session = db.gameSessions.find((s) => s.id === where.id);
        if (!session) throw new Error(`GameSession bulunamadi: ${where.id}`);
        Object.assign(session, data);
        return session;
      },
    },
    conversation: {
      create: async ({ data }: any) => {
        const { members, ...rest } = data;
        const conversation = { id: genId("conv"), ...rest };
        db.conversations.push(conversation);
        for (const member of members.create) {
          db.conversationMembers.push({
            conversationId: conversation.id,
            ...member,
          });
        }
        return conversation;
      },
    },
  };

  return {
    prisma: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
    },
  };
});

const { resolveRound } = await import("./round");
const { TOTAL_ROUNDS, MIN_PLAYERS } = await import("./config");

function resetDb() {
  db.rounds = [];
  db.guesses = [];
  db.participants = [];
  db.gameSessions = [];
  db.conversations = [];
  db.conversationMembers = [];
  db.nextId = 1;
}

function seedSession(status = "ACTIVE") {
  const session = { id: genId("session"), status, finishedAt: null };
  db.gameSessions.push(session);
  return session;
}

function seedRound(sessionId: string, roundNumber: number, endsAt: Date) {
  const round = {
    id: genId("round"),
    sessionId,
    roundNumber,
    startsAt: new Date(endsAt.getTime() - 60_000),
    endsAt,
    status: "ACTIVE",
  };
  db.rounds.push(round);
  return round;
}

function seedParticipant(sessionId: string) {
  const participant = {
    id: genId("participant"),
    sessionId,
    status: "ACTIVE",
    eliminatedRound: null,
    finalRound: null,
  };
  db.participants.push(participant);
  return participant;
}

function seedGuess(roundId: string, sessionParticipantId: string, word: string) {
  db.guesses.push({ roundId, sessionParticipantId, normalizedWord: word });
}

const PAST = new Date("2026-01-01T00:00:10.000Z");
const NOW = new Date("2026-01-01T00:00:10.000Z");
const FUTURE = new Date("2026-01-01T00:01:00.000Z");

beforeEach(() => {
  resetDb();
});

describe("resolveRound", () => {
  it("suresi henuz dolmamis bir turu sonuclandirmaz", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, FUTURE);
    seedParticipant(session.id);

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({ resolved: false });
    expect(round.status).toBe("ACTIVE");
  });

  it("zaten PROCESSING/FINISHED olan bir turu tekrar islemez", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    round.status = "FINISHED";

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({ resolved: false });
  });

  it("hic kimse eslesmezse NO_MATCH doner ve herkesi eler", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    const p1 = seedParticipant(session.id);
    const p2 = seedParticipant(session.id);
    seedGuess(round.id, p1.id, "elma");
    seedGuess(round.id, p2.id, "armut");

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({ resolved: true, outcome: "NO_MATCH" });
    expect(p1.status).toBe("ELIMINATED");
    expect(p2.status).toBe("ELIMINATED");
    expect(p1.eliminatedRound).toBe(1);
    expect(round.status).toBe("FINISHED");
    expect(session.status).toBe("FINISHED");
  });

  it("hic tahmin gondermeyen oyuncu da elenir", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    const guesser = seedParticipant(session.id);
    const silent = seedParticipant(session.id);
    seedGuess(round.id, guesser.id, "elma");
    // silent oyuncu hic tahmin gondermedi.

    await resolveRound(round.id, NOW);

    expect(silent.status).toBe("ELIMINATED");
  });

  it(`MIN_PLAYERS (${MIN_PLAYERS}) altinda kalan gruplari eskiler`, async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    const solo = seedParticipant(session.id);
    seedGuess(round.id, solo.id, "elma");
    // "elma" yazan tek kisi var; MIN_PLAYERS = 2 oldugundan grup olusmaz.

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({ resolved: true, outcome: "NO_MATCH" });
    expect(solo.status).toBe("ELIMINATED");
  });

  it("eslesen grup varsa ve son tur degilse NEXT_ROUND ile yeni tur acar", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    const p1 = seedParticipant(session.id);
    const p2 = seedParticipant(session.id);
    const p3 = seedParticipant(session.id);
    seedGuess(round.id, p1.id, "elma");
    seedGuess(round.id, p2.id, "elma");
    seedGuess(round.id, p3.id, "armut");

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({
      resolved: true,
      outcome: "NEXT_ROUND",
      survivorCount: 2,
    });
    expect(p1.status).toBe("ACTIVE");
    expect(p2.status).toBe("ACTIVE");
    expect(p3.status).toBe("ELIMINATED");

    const nextRound = db.rounds.find((r) => r.roundNumber === 2);
    expect(nextRound).toBeDefined();
    expect(nextRound.status).toBe("ACTIVE");
    expect(nextRound.sessionId).toBe(session.id);
    // Round suresi ROUND_SECONDS kadar ileri atilmis olmali.
    expect(nextRound.endsAt.getTime() - NOW.getTime()).toBe(60_000);

    // Son tur olmadigindan oturum hala FINISHED olmamali.
    expect(session.status).toBe("ACTIVE");
  });

  it(`son turda (${TOTAL_ROUNDS}) eslesenler finalist olur ve sohbet acilir`, async () => {
    const session = seedSession();
    const round = seedRound(session.id, TOTAL_ROUNDS, PAST);
    const p1 = seedParticipant(session.id);
    const p2 = seedParticipant(session.id);
    seedGuess(round.id, p1.id, "elma");
    seedGuess(round.id, p2.id, "elma");

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({
      resolved: true,
      outcome: "FINISHED",
      conversationCount: 1,
    });
    expect(p1.status).toBe("FINALIST");
    expect(p2.status).toBe("FINALIST");
    expect(p1.finalRound).toBe(TOTAL_ROUNDS);
    expect(session.status).toBe("FINISHED");
    expect(session.finishedAt).toEqual(NOW);

    expect(db.conversations).toHaveLength(1);
    const conversation = db.conversations[0];
    expect(conversation.normalizedWord).toBe("elma");
    expect(conversation.sessionId).toBe(session.id);

    const members = db.conversationMembers.filter(
      (m) => m.conversationId === conversation.id,
    );
    expect(members.map((m) => m.sessionParticipantId).sort()).toEqual(
      [p1.id, p2.id].sort(),
    );
  });

  it("son turda farkli kelimelerle eslesen gruplar icin ayri sohbetler acar", async () => {
    const session = seedSession();
    const round = seedRound(session.id, TOTAL_ROUNDS, PAST);
    const elma1 = seedParticipant(session.id);
    const elma2 = seedParticipant(session.id);
    const armut1 = seedParticipant(session.id);
    const armut2 = seedParticipant(session.id);
    seedGuess(round.id, elma1.id, "elma");
    seedGuess(round.id, elma2.id, "elma");
    seedGuess(round.id, armut1.id, "armut");
    seedGuess(round.id, armut2.id, "armut");

    const outcome = await resolveRound(round.id, NOW);

    expect(outcome).toEqual({
      resolved: true,
      outcome: "FINISHED",
      conversationCount: 2,
    });
    expect(db.conversations).toHaveLength(2);
    expect(db.conversations.map((c) => c.normalizedWord).sort()).toEqual([
      "armut",
      "elma",
    ]);
  });

  it("ayni turu ayni anda iki kez sonuclandirmaya calismak ikinci seferde hicbir sey yapmaz", async () => {
    const session = seedSession();
    const round = seedRound(session.id, 1, PAST);
    const p1 = seedParticipant(session.id);
    const p2 = seedParticipant(session.id);
    seedGuess(round.id, p1.id, "elma");
    seedGuess(round.id, p2.id, "elma");

    const [first, second] = await Promise.all([
      resolveRound(round.id, NOW),
      resolveRound(round.id, NOW),
    ]);

    const resolvedCount = [first, second].filter(
      (o) => o.resolved,
    ).length;

    expect(resolvedCount).toBe(1);
  });
});
