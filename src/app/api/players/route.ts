import { NextResponse } from "next/server";

import { readClientToken, setClientTokenCookie } from "@/lib/auth/currentUser";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || !("nickname" in body)) {
      return NextResponse.json(
        {
          error: "Nickname alanı zorunludur.",
        },
        {
          status: 400,
        },
      );
    }

    const nicknameValue = body.nickname;

    if (typeof nicknameValue !== "string") {
      return NextResponse.json(
        {
          error: "Nickname metin olmalıdır.",
        },
        {
          status: 400,
        },
      );
    }

    const nickname = nicknameValue.trim();

    if (nickname.length < 2 || nickname.length > 30) {
      return NextResponse.json(
        {
          error: "Nickname 2 ile 30 karakter arasında olmalıdır.",
        },
        {
          status: 400,
        },
      );
    }

    const clientToken = await readClientToken();

    const existingUser = clientToken
      ? await prisma.user.findUnique({
          where: {
            clientToken,
          },
        })
      : null;

    const user = existingUser
      ? await prisma.user.update({
          where: {
            id: existingUser.id,
          },
          data: {
            nickname,
          },
          select: {
            id: true,
            nickname: true,
            clientToken: true,
            createdAt: true,
            lastSeenAt: true,
          },
        })
      : await prisma.user.create({
          data: {
            nickname,
          },
          select: {
            id: true,
            nickname: true,
            clientToken: true,
            createdAt: true,
            lastSeenAt: true,
          },
        });

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          nickname: user.nickname,
          createdAt: user.createdAt,
          lastSeenAt: user.lastSeenAt,
        },
      },
      {
        status: existingUser ? 200 : 201,
      },
    );

    // Çerez yalnızca yeni kullanıcıda değil her istekte tazelenir; aksi hâlde
    // bir yıl sonra düşer ve oyuncu geçmişiyle birlikte kaybolur.
    setClientTokenCookie(response, user.clientToken);

    return response;
  } catch (error) {
    console.error("Oyuncu oluşturulamadı:", error);

    return NextResponse.json(
      {
        error: "Oyuncu oluşturulurken bir hata oluştu.",
      },
      {
        status: 500,
      },
    );
  }
}
