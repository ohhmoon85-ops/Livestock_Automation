import "./globals.css";

export const metadata = {
  title: "출고리스트-원패스 자동 연동",
  description: "Excel 파일 업로드만으로 발급일자·발급번호·묶음번호·도축장 자동 기입",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-stone-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
