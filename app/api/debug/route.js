/**
 * /api/debug
 * 원패스 파일 파싱 결과 디버깅용 엔드포인트
 * 각 행의 발급번호, 발급일시, 부위, 분류(일반/무항) 값을 반환
 * + 헤더 구조 및 감지된 컬럼 정보
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const CERT_NO_RE = /^\d{4}-\d{6,10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const onepassFile = formData.get("onepass");

    if (!onepassFile) {
      return NextResponse.json({ error: "원패스 파일을 업로드해주세요." }, { status: 400 });
    }

    const opBuf = Buffer.from(await onepassFile.arrayBuffer());
    const opWb  = XLSX.read(opBuf, { type: "buffer", cellDates: true });

    const sheetInfos = [];

    for (const sheetName of opWb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json(
        opWb.Sheets[sheetName],
        { header: 1, defval: "" }
      );

      // ── 헤더 행 탐색 ──
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(15, raw.length); i++) {
        const cells = (raw[i] || []).map((c) => String(c ?? "").trim());
        if (cells.some((c) => c === "부위" || c === "부위▲" || c === "부위명")) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        sheetInfos.push({ sheetName, error: "'부위' 컬럼 없음", headers: [], rows: [] });
        continue;
      }

      const headerRow = raw[headerRowIndex] || [];
      const headers = headerRow.map((h) => String(h ?? "").trim());
      const namedIdx = {};
      headers.forEach((h, i) => { if (h) namedIdx[h] = i; });

      // 컬럼 감지
      const col부위 = namedIdx["부위"] ?? namedIdx["부위▲"] ?? namedIdx["부위명"] ?? -1;
      const col발급가능량 = namedIdx["발급가능량(kg)"] ?? -1;
      const col일반무항단일 = namedIdx["일반 / 무항"] ?? namedIdx["일반/무항"] ?? -1;
      const col일반 = namedIdx["일반"] ?? -1;
      const col무항 = namedIdx["무항"] ?? namedIdx["무항생제"] ?? -1;
      let col발급번호 = namedIdx["발급번호"] ?? -1;
      let col발급일시 = namedIdx["발급일시"] ?? -1;

      // 패턴으로 감지
      if (col발급번호 === -1 || col발급일시 === -1) {
        for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 6, raw.length); i++) {
          const row = raw[i] || [];
          for (let j = 0; j < row.length; j++) {
            const rawJ = row[j];
            const val = String(rawJ ?? "").trim();
            const isDateObj = rawJ instanceof Date && !isNaN(rawJ.getTime());
            if (!val && !isDateObj) continue;
            if (col발급번호 === -1 && CERT_NO_RE.test(val)) col발급번호 = j;
            if (col발급일시 === -1) {
              if (isDateObj) col발급일시 = j;
              else if (DATE_RE.test(val) && !CERT_NO_RE.test(val)) col발급일시 = j;
            }
          }
          if (col발급번호 !== -1 && col발급일시 !== -1) break;
        }
      }

      // 샘플 원시 값 (헤더 다음 5행)
      const sampleRawRows = [];
      for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 6, raw.length); i++) {
        const row = raw[i] || [];
        sampleRawRows.push({
          rowIdx: i,
          발급번호_raw: col발급번호 !== -1 ? String(row[col발급번호] ?? "") : "(없음)",
          발급일시_raw: col발급일시 !== -1 ? String(row[col발급일시] ?? "") : "(없음)",
          부위_raw:    col부위 !== -1     ? String(row[col부위] ?? "")     : "(없음)",
          일반_raw:    col일반 !== -1     ? String(row[col일반] ?? "")     : "(없음)",
          무항_raw:    col무항 !== -1     ? String(row[col무항] ?? "")     : "(없음)",
          단일분류_raw: col일반무항단일 !== -1 ? String(row[col일반무항단일] ?? "") : "(없음)",
        });
      }

      // 모든 데이터 행 파싱
      const rows = [];
      for (let i = headerRowIndex + 1; i < raw.length; i++) {
        const row = raw[i] || [];
        const 발급가능량 = parseFloat(String(row[col발급가능량] ?? ""));
        if (isNaN(발급가능량)) continue;
        const 부위 = String(row[col부위] ?? "").trim();
        const 발급번호 = String(row[col발급번호] ?? "").trim();
        if (!부위 || !발급번호) continue;

        let 분류 = "";
        let 일반raw = "(컬럼없음)";
        let 무항raw = "(컬럼없음)";
        let 단일raw = "(컬럼없음)";

        if (col일반무항단일 !== -1) {
          단일raw = String(row[col일반무항단일] ?? "").trim();
          분류 = 단일raw;
        } else {
          일반raw = col일반 !== -1 ? String(row[col일반] ?? "").trim() : "(컬럼없음)";
          무항raw = col무항 !== -1 ? String(row[col무항] ?? "").trim() : "(컬럼없음)";
          const 무항active = isTruthyClass(무항raw);
          const 일반active = isTruthyClass(일반raw);
          분류 = 무항active ? "무항" : 일반active ? "일반" : "";
        }

        rows.push({
          발급번호,
          발급일시: col발급일시 !== -1 ? String(row[col발급일시] ?? "").trim() : "",
          부위,
          분류,
          발급가능량,
          일반컬럼값: 일반raw,
          무항컬럼값: 무항raw,
          단일컬럼값: 단일raw,
        });
      }

      sheetInfos.push({
        sheetName,
        headerRowIndex,
        headers,
        컬럼감지: {
          부위: col부위,
          발급가능량: col발급가능량,
          발급번호: col발급번호,
          발급일시: col발급일시,
          일반: col일반,
          무항: col무항,
          일반무항단일: col일반무항단일,
        },
        sampleRawRows,
        rows,
      });
    }

    return NextResponse.json({ ok: true, sheets: sheetInfos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function isTruthyClass(val) {
  if (!val) return false;
  const v = String(val).trim();
  if (!v) return false;
  if (v === "0" || v.toLowerCase() === "false") return false;
  if (v === "　") return false;
  return true;
}
