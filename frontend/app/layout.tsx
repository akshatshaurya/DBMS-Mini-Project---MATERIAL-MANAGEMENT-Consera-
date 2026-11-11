
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consera | Material Management System",
  description:
    "Consera - Integrated construction material inventory, reservations, inspections and transfer management platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
