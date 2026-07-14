/** @type {import('next').NextConfig} */
const nextConfig = {
  // ExcelJS는 서버(/api/process, /api/debug 폴백)와 클라이언트(handleProcess) 양쪽에서 사용.
  // 서버 측에서는 번들링을 건너뛰고 런타임에 require — API route가 남아있는 동안 유지.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
