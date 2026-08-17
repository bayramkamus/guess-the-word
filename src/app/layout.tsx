import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kelime Tahmin Oyunu",
  description:
    "Aynı kelimeyi tahmin eden oyuncuları art arda turlarda eşleştiren çevrim içi kelime oyunu.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
