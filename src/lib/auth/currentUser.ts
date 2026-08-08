/// Üyeliksiz kimlik: kullanıcı bir çerezde taşınan clientToken ile tanınır.
/// Bütün uç noktalar oyuncuyu bu modül üzerinden çözer.

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const CLIENT_TOKEN_COOKIE = "client_token";

/// Çerezin ömrü: bir yıl.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/// Çerezi yanıta yazar.
///
/// Yalnızca yeni kullanıcı oluşturulurken değil, tanınan her kullanıcı için
/// çağrılmalıdır; aksi hâlde çerez bir yıl sonra düşer ve oyuncu geçmişiyle
/// birlikte kaybolur.
export function setClientTokenCookie(
  response: NextResponse,
  clientToken: string,
): void {
  response.cookies.set({
    name: CLIENT_TOKEN_COOKIE,
    value: clientToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/// İstekteki çerezden clientToken değerini okur.
export async function readClientToken(): Promise<string | null> {
  const cookieStore = await cookies();

  return cookieStore.get(CLIENT_TOKEN_COOKIE)?.value ?? null;
}
