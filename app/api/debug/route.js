/**
 * /api/debug
 * 원패스 파일 파싱 결과 디버깅용 엔드포인트
 * 각 행의 발급번호, 발급일시, 부위, 분류(일반/무항) 값을 반환
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseOnepass } from "@/lib/parseOnepass";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const onepassFile = formData.get("onepass");

    if (!onepassFile) {
      return NextResponse.json({ error: "원패스 파일을 업로드해주세요." }, { status: 400 });
    }

    const opBuf = Buffer.from(await onepassFile.arrayBuffer());
    const opWb  = XLSX.read(opBuf, { type: "buffer", cellDates: true });

    const allRows = [];
    const sheetErrors = [];

    for (const sheetName of opWb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json(
        opWb.Sheets[sheetName],
        { header: 1, defval: "" }
      );
      try {
        const rows = parseOnepass(raw, sheetName);
        for (const r of rows) {
          allRows.push({
            시트: sheetName,
            발급번호: r.발급번호,
            발급일시Raw: r.발급일시Raw,
            부위: r.부위,
            분류: r.분류,
            발급가능량: r["발급가능량(kg)"],
            도출장코드: r.도출장코드,
            도출장명: r.도출장명,
            묶음번호: r.묶음번호,
          });
        }
      } catch (e) {
        sheetErrors.push(`[${sheetName}] ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, rows: allRows, errors: sheetErrors });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
