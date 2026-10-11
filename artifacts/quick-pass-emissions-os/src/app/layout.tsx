import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Quick Pass Emissions", template: "%s | Quick Pass Emissions" },
  description: "Quick Pass Emissions management workspace",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
