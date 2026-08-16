import { NextResponse } from "next/server";

import { readClientToken } from "@/lib/auth/currentUser";
import { prisma } from "@/lib/prisma";

/// Message.body için üst sınır; prisma/schema.prisma'daki
/// @db.VarChar(1000) ile aynı tutulmalıdır.
const MAX_BODY_LENGTH = 1000;

/// İstek sahibinin belirtilen sohbetin üyesi olup olmadığını doğrular.
/// Hem GET hem POST aynı üyelik kontrolüne ihtiyaç duyar.
function findMembership(conversationId: string, clientToken: string) {
  return prisma.conversationMember.findFirst({
    where: {
      conversationId,
      participant: { user: { clientToken } },
    },
    select: {
      sessionParticipantId: true,
      conversation: { select: { status: true } },
    },
  });
}

/// Bir sohbetteki mesajları kronolojik sırayla döndürür.
///
/// `conversationId` zorunludur; istek sahibi bu sohbetin üyesi değilse
/// mesajlar döndürülmez. Silinen mesajlar (`deletedAt` dolu) listeden
/// çıkarılır. İsteğe bağlı `since` (ISO tarih) parametresiyle yalnızca o
/// zamandan sonraki mesajlar istenebilir; arayüzün saniyede bir yokladığı
/// senaryoda gereksiz veri taşınmasını önler.
export async function GET(request: Request) {
  try {
    const clientToken = await readClientToken();

    if (!clientToken) {
      return NextResponse.json(
        { error: "Önce bir nickname belirlemelisin." },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    const since = url.searchParams.get("since");

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId parametresi zorunludur." },
        { status: 400 },
      );
    }

    let sinceDate: Date | undefined;

    if (since) {
      sinceDate = new Date(since);

      if (Number.isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: "since geçerli bir tarih olmalıdır." },
          { status: 400 },
        );
      }
    }

    const membership = await findMembership(conversationId, clientToken);

    if (!membership) {
      return NextResponse.json(
        { error: "Bu sohbetin üyesi değilsin." },
        { status: 403 },
      );
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderParticipantId: true,
        sender: {
          select: {
            participant: { select: { nicknameSnapshot: true } },
          },
        },
      },
    });

    return NextResponse.json({
      conversationStatus: membership.conversation.status,
      messages: messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        senderParticipantId: message.senderParticipantId,
        senderNickname: message.sender.participant.nicknameSnapshot,
      })),
    });
  } catch (error) {
    console.error("Mesajlar okunamadı:", error);

    return NextResponse.json(
      { error: "Mesajlar alınırken bir hata oluştu." },
      { status: 500 },
    );
  }
}

/// Bir finalist sohbetine mesaj gönderir.
///
/// Gönderenin gerçekten bu sohbetin üyesi olduğu ConversationMember
/// üzerinden doğrulanır; Message.sender ilişkisi bunu DB seviyesinde de
/// zorunlu kılar. Sohbet CLOSED ise yeni mesaj kabul edilmez.
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

    if (
      typeof body !== "object" ||
      body === null ||
      !("conversationId" in body) ||
      !("body" in body)
    ) {
      return NextResponse.json(
        { error: "conversationId ve body alanları zorunludur." },
        { status: 400 },
      );
    }

    const { conversationId, body: messageBody } = body as {
      conversationId: unknown;
      body: unknown;
    };

    if (typeof conversationId !== "string" || conversationId.length === 0) {
      return NextResponse.json(
        { error: "conversationId metin olmalıdır." },
        { status: 400 },
      );
    }

    if (typeof messageBody !== "string") {
      return NextResponse.json(
        { error: "Mesaj metin olmalıdır." },
        { status: 400 },
      );
    }

    const trimmed = messageBody.trim();

    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Boş mesaj gönderilemez." },
        { status: 400 },
      );
    }

    if (trimmed.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: `Mesaj en fazla ${MAX_BODY_LENGTH} karakter olabilir.` },
        { status: 400 },
      );
    }

    // Gönderenin bu sohbetin üyesi olup olmadığı ve sohbetin durumu tek
    // sorguda okunur.
    const membership = await findMembership(conversationId, clientToken);

    if (!membership) {
      return NextResponse.json(
        { error: "Bu sohbetin üyesi değilsin." },
        { status: 403 },
      );
    }

    if (membership.conversation.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Bu sohbet artık mesaj kabul etmiyor." },
        { status: 409 },
      );
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderParticipantId: membership.sessionParticipantId,
        body: trimmed,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderParticipantId: true,
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Mesaj gönderilemedi:", error);

    return NextResponse.json(
      { error: "Mesaj gönderilirken bir hata oluştu." },
      { status: 500 },
    );
  }
}
