/**
 * generateOutput.js
 * 매칭 결과를 Excel(.xlsx)로 출력
 *
 * - 원본 시트 구조 완전 유지
 * - 4개 자동 기입 컬럼: 발급일자 · 발급번호 · 묶음번호 · 도축장
 * - 복수 원패스 행 합산 시 줄바꿈(\n)으로 구분
 * - 경고 행: 노란 배경 + 마지막 열 다음에 경고 메시지
 */

import ExcelJS from "exceljs";

/**
 * @param {Array}  originalRows    - 원본 2D 배열 (전체, 타이틀 행 포함)
 * @param {Array}  matchResults    - matchAll() 결과의 results
 * @param {number} headerRowIndex  - 실제 헤더 행의 인덱스 (parseShipment 반환값)
 * @returns {Buffer} xlsx Buffer
 */
export async function generateOutput(originalRows, matchResults, headerRowIndex = 0) {
  if (!originalRows || originalRows.length === 0) {
    throw new Error("원본 데이터가 없습니다.");
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("매출 시트");

  const headers = originalRows[headerRowIndex].map((h) => (h == null ? "" : String(h)));
  const totalCols = headers.length || 12;

  // 컬럼 인덱스 (1-based, ExcelJS)
  const hIdx = (name) => {
    const i = headers.indexOf(name);
    return i === -1 ? null : i + 1;
  };

  const COL = {
    발급일자: hIdx("발급일자"),
    발급번호: hIdx("발급번호"),
    묶음번호: hIdx("묶음번호"),
    도축장: hIdx("도축장"),
  };

  // ── 타이틀 행 (헤더 앞의 행들) 그대로 출력 ─────
  for (let i = 0; i < headerRowIndex; i++) {
    const excelRow = ws.addRow((originalRows[i] || []).map((v) => (v == null ? "" : v)));

    // 첫 번째 행: 병합 + 가운데 정렬 + 26pt 굵게 (원본 타이틀 행)
    if (i === 0) {
      const rowNum = excelRow.number;
      if (totalCols > 1) {
        ws.mergeCells(rowNum, 1, rowNum, totalCols);
      }
      const cell = excelRow.getCell(1);
      cell.font = { bold: true, size: 26 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      excelRow.height = 48;
    }
  }

  // ── 헤더 행 ────────────────────────────────────
  const headerRow = ws.addRow(headers);
  styleHeader(headerRow);

  // ── 결과 맵: _rowIndex → result ────────────────
  const resultMap = new Map();
  for (const r of matchResults) {
    resultMap.set(r._rowIndex, r);
  }

  // ── 데이터 행: 헤더 다음 행부터 ────────────────
  for (let i = headerRowIndex + 1; i < originalRows.length; i++) {
    const rawRow = originalRows[i];
    if (!rawRow || rawRow.length === 0) {
      ws.addRow([]);
      continue;
    }

    // 원본 값 복사
    const rowData = rawRow.map((v) => (v == null ? "" : v));

    const res = resultMap.get(i);

    if (res && res._matchedEntries && res._matchedEntries.length > 0) {
      const entries = res._matchedEntries;
      const join = (key) => entries.map((e) => e[key] ?? "").join("\n");

      if (COL.발급일자) rowData[COL.발급일자 - 1] = join("발급일자");
      if (COL.발급번호) rowData[COL.발급번호 - 1] = join("발급번호");
      if (COL.묶음번호) rowData[COL.묶음번호 - 1] = join("묶음번호");
      if (COL.도축장)   rowData[COL.도축장   - 1] = join("도축장");
    }

    const excelRow = ws.addRow(rowData);

    // 복수 항목 줄바꿈 허용
    if (res && res._matchedEntries && res._matchedEntries.length > 1) {
      excelRow.alignment = { wrapText: true, vertical: "top" };
    }
  }

  // ── 열 너비 자동 조정 ────────────────────────────
  ws.columns.forEach((col, i) => {
    let maxLen = (headers[i] || "").length || 6;
    ws.eachRow((row) => {
      const val = row.getCell(i + 1).value;
      if (val != null) {
        const lineMax = Math.max(
          ...String(val).split("\n").map((l) => l.length)
        );
        if (lineMax > maxLen) maxLen = lineMax;
      }
    });
    col.width = Math.min(maxLen + 2, 45);
  });

  return workbook.xlsx.writeBuffer();
}

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A3A5C" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFAAAAAA" } } };
  });
}
