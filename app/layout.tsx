import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "אנגלית מההתחלה",
  description: "לומדים את האותיות באנגלית ואת המקלדת — משחק תרגול לכיתות א׳–ו׳",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Kids rest palms on tablets; pinch-zoom mid-lesson breaks the keyboard layout.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f7f7fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
