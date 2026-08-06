import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const CLIENT_TOKEN_COOKIE = "client_token";

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

    const cookieStore = await cookies();
    const clientToken = cookieStore.get(CLIENT_TOKEN_COOKIE)?.value;

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

    if (!existingUser) {
      response.cookies.set({
        name: CLIENT_TOKEN_COOKIE,
        value: user.clientToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

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
