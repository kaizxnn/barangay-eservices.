import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Barangay E-Services",
  description: "Request barangay documents and follow up community concerns online.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
