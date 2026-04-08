/**
 * /api/process
 * 출고리스트 + 원패스 → 완성 xlsx 반환
 *
 * 원패스 파일 내 모든 시트를 읽어 하나의 풀(pool)로 합산 처리.
 * 시트 이름에 제한 없음 (도축장·냉장·기타 모두 허용).
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseShipment } from "@/lib/parseShipment";
import { parseOnepass } from "@/lib/parseOnepass";
import { matchAll } from "@/lib/matchEngine";
import { generateOutput } from "@/lib/generateOutput";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const shipmentFile = formData.get("shipment");
    const onepassFile = formData.get("onepass");

    if (!shipmentFile || !onepassFile) {
      return NextResponse.json(
        { error: "출고리스트와 원패스 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    // ── 출고리스트 파싱 ───────────────────────────────────────
    const shipBuf = Buffer.from(await shipmentFile.arrayBuffer());
    const shipWb = XLSX.read(shipBuf, { type: "buffer", cellDates: true });

    // "매출" 포함 시트 우선, 없으면 첫 번째 시트
    const shipSheetName =
      shipWb.SheetNames.find((n) => n.includes("매출")) ??
      shipWb.SheetNames[0];

    const shipRaw = XLSX.utils.sheet_to_json(
      shipWb.Sheets[shipSheetName],
      { header: 1, defval: "" }
    );

    let shipmentRows;
    try {
      shipmentRows = parseShipment(shipRaw);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // ── 원패스 파싱 (모든 시트 합산) ────────────────────────
    const opBuf = Buffer.from(await onepassFile.arrayBuffer());
    const opWb = XLSX.read(opBuf, { type: "buffer", cellDates: true });

    let allOnepassRows = [];
    const sheetErrors = [];

    for (const sheetName of opWb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json(
        opWb.Sheets[sheetName],
        { header: 1, defval: "" }
      );
      try {
        const rows = parseOnepass(raw, sheetName);
        allOnepassRows = allOnepassRows.concat(rows);
      } catch (e) {
        sheetErrors.push(`시트 "${sheetName}": ${e.message}`);
      }
    }

    if (allOnepassRows.length === 0) {
      const detail = sheetErrors.length
        ? "\n" + sheetErrors.join("\n")
        : "";
      return NextResponse.json(
        { error: "원패스 파일에서 유효한 데이터를 찾을 수 없습니다." + detail },
        { status: 400 }
      );
    }

    // ── 매칭 ──────────────────────────────────────────────────
    const { results, warnings } = matchAll(shipmentRows, allOnepassRows);

    // ── 출력 파일 생성 ────────────────────────────────────────
    const outputBuffer = await generateOutput(shipRaw, results);

    // ── 통계 ──────────────────────────────────────────────────
    const total   = results.filter((r) => !r._skipped).length;
    const success = results.filter((r) => r._matched).length;
    const warn    = warnings.length;
    const skipped = results.filter((r) => r._skipped).length;

    const statsHeader = JSON.stringify({ total, success, warn, skipped });
    const warnHeader  = JSON.stringify(
      warnings.slice(0, 100).map((w) => ({
        품목명: w.row?.품목명 ?? "",
        수량:   w.row?.수량   ?? "",
        reason: w.reason,
      }))
    );

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename*=UTF-8\'\'%EC%B6%9C%EA%B3%A0%EB%A6%AC%EC%8A%A4%ED%8A%B8_%EC%99%84%EC%84%B1.xlsx',
        "X-Process-Stats": statsHeader,
        "X-Warnings": warnHeader,
      },
    });
  } catch (err) {
    console.error("[/api/process]", err);
    return NextResponse.json(
      { error: err.message ?? "서버 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
