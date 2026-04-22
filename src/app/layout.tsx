import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "마피아 게임",
  description: "실시간 웹 기반 마피아 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="mt-auto py-4 text-center text-sm text-gray-400 border-t border-gray-700 bg-gray-900">
          만든 사람: 경기도 지구과학 교사 뀨짱&nbsp;&nbsp;|&nbsp;&nbsp;
          문의:{" "}
          <a
            href="https://open.kakao.com/o/s7hVU65h"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-200"
          >
            카카오톡 오픈채팅
          </a>
          &nbsp;&nbsp;|&nbsp;&nbsp;블로그:{" "}
          <a
            href="https://eduarchive.tistory.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-200"
          >
            뀨짱쌤의 교육자료 아카이브
          </a>
        </footer>
      </body>
    </html>
  );
}
