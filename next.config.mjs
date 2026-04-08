/** @type {import('next').NextConfig} */
const nextConfig = {
  // ExcelJS는 Node.js 전용 패키지 → API Route에서만 사용 (서버 사이드)
  // 클라이언트 번들에 포함되지 않도록 serverComponentsExternalPackages 설정
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
