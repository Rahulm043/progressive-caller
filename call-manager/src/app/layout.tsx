import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vobiz AI | Outbound Call Manager",
  description: "Autonomous outbound calling and campaign monitoring platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
