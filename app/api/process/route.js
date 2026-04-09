/**
 * /api/process
 * 출고리스트 + 원패스 → JSON 응답 (xlsx는 base64로 포함)
 *
 * HTTP 헤더에 한글을 넣으면 ByteString 오류가 발생하므로
 * 통계·경고·파일 모두 JSON body로 반환합니다.
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
    const onepassFile  = formData.get("onepass");

    if (!shipmentFile || !onepassFile) {
      return NextResponse.json(
        { error: "출고리스트와 원패스 파일을 모두 업로드해주세요." },
        { status: 400 }
      );
    }

    // ── 출고리스트 파싱 ───────────────────────────────────────
    const shipBuf = Buffer.from(await shipmentFile.arrayBuffer());
    const shipWb  = XLSX.read(shipBuf, { type: "buffer", cellDates: true });

    const shipSheetName =
      shipWb.SheetNames.find((n) => n.includes("매출")) ??
      shipWb.SheetNames[0];

    const shipRaw = XLSX.utils.sheet_to_json(
      shipWb.Sheets[shipSheetName],
      { header: 1, defval: "" }
    );

    let shipmentRows, headerRowIndex;
    try {
      ({ rows: shipmentRows, headerRowIndex } = parseShipment(shipRaw));
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // ── 원패스 파싱 (모든 시트 합산) ────────────────────────
    const opBuf = Buffer.from(await onepassFile.arrayBuffer());
    const opWb  = XLSX.read(opBuf, { type: "buffer", cellDates: true });

    let allOnepassRows = [];
    const sheetErrors  = [];

    for (const sheetName of opWb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json(
        opWb.Sheets[sheetName],
        { header: 1, defval: "" }
      );
      try {
        const rows = parseOnepass(raw, sheetName);
        allOnepassRows = allOnepassRows.concat(rows);
      } catch (e) {
        sheetErrors.push(`[${sheetName}] ${e.message}`);
      }
    }

    if (allOnepassRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "원패스 파일에서 유효한 데이터를 찾을 수 없습니다." +
            (sheetErrors.length ? "\n" + sheetErrors.join("\n") : ""),
        },
        { status: 400 }
      );
    }

    // ── 사용자 정의 도축장 코드 맵 ───────────────────────────
    let customCodeMap = {};
    const codeMapStr = formData.get("codeMap");
    if (codeMapStr) {
      try { customCodeMap = JSON.parse(codeMapStr); } catch {}
    }

    // ── 매칭 ─────────────────────────────────────────────────
    const { results, warnings } = matchAll(shipmentRows, allOnepassRows, customCodeMap);

    // ── 출력 파일 생성 ────────────────────────────────────────
    const outputBuffer = await generateOutput(shipRaw, results, headerRowIndex);

    // ── 통계 ─────────────────────────────────────────────────
    const total   = results.filter((r) => !r._skipped).length;
    const success = results.filter((r) => r._matched).length;
    const warn    = warnings.length;
    const skipped = results.filter((r) => r._skipped).length;

    // 경고 목록 (한글 포함 → JSON body로)
    const warnList = warnings.slice(0, 100).map((w) => ({
      item:   w.row?.품목명 ?? "",
      qty:    w.row?.수량   ?? "",
      reason: w.reason,
    }));

    // xlsx를 base64로 인코딩해 JSON에 포함
    const fileBase64 = Buffer.from(outputBuffer).toString("base64");

    return NextResponse.json({
      ok: true,
      stats: { total, success, warn, skipped },
      warnings: warnList,
      file: fileBase64,         // 클라이언트에서 Blob으로 복원
      filename: "출고리스트_완성.xlsx",
    });
  } catch (err) {
    console.error("[/api/process]", err);
    return NextResponse.json(
      { error: err.message ?? "서버 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
