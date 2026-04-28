/**
 * generateOutput.js
 * 매칭 결과를 Excel(.xlsx)로 출력
 *
 * 컬럼별 표시 규칙
 *   발급번호 · 묶음번호 · 매입처 : 행 수만큼 항상 전부 표시
 *   발급일자 · 도축장            : 모든 값이 같으면 1개만, 하나라도 다르면 전부 표시
 */

import ExcelJS from "exceljs";
import { generateOutputSheet } from "./generateOutputSheet";

/**
 * @param {Array}  originalRows   - 원본 2D 배열 (전체, 타이틀 행 포함)
 * @param {Array}  matchResults   - matchAll() 결과의 results
 * @param {number} headerRowIndex - 실제 헤더 행의 인덱스 (parseShipment 반환값)
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
    도축장:   hIdx("도축장"),
    매입처:   hIdx("매입처"),
  };

  // ── 타이틀 행 (헤더 앞 행들) ──────────────────────────────────
  for (let i = 0; i < headerRowIndex; i++) {
    const excelRow = ws.addRow((originalRows[i] || []).map((v) => (v == null ? "" : v)));
    if (i === 0) {
      const rowNum = excelRow.number;
      if (totalCols > 1) ws.mergeCells(rowNum, 1, rowNum, totalCols);
      const cell = excelRow.getCell(1);
      cell.font      = { bold: true, size: 26 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      excelRow.height = 48;
    }
  }

  // ── 헤더 행 ───────────────────────────────────────────────────
  styleHeader(ws.addRow(headers));

  // ── 결과 맵: _rowIndex → result ───────────────────────────────
  const resultMap = new Map();
  for (const r of matchResults) {
    resultMap.set(r._rowIndex, r);
  }

  // ── 데이터 행 ─────────────────────────────────────────────────
  for (let i = headerRowIndex + 1; i < originalRows.length; i++) {
    const rawRow = originalRows[i];
    if (!rawRow || rawRow.length === 0) {
      ws.addRow([]);
      continue;
    }

    const rowData = rawRow.map((v) => (v == null ? "" : v));
    const res = resultMap.get(i);

    if (res && res._matchedEntries && res._matchedEntries.length > 0) {
      const entries = res._matchedEntries;

      // 항상 전부 표시 (행 수만큼)
      const joinAll = (key) =>
        entries.map((e) => e[key] ?? "").join("\n");

      // 모두 같으면 1개, 하나라도 다르면 전부 표시
      const smartJoin = (key) => {
        const arr    = entries.map((e) => e[key] ?? "");
        const unique = [...new Set(arr)];
        return unique.length === 1 ? unique[0] : arr.join("\n");
      };

      if (COL.발급일자) rowData[COL.발급일자 - 1] = smartJoin("발급일자");
      if (COL.발급번호) rowData[COL.발급번호 - 1] = joinAll("발급번호");
      if (COL.묶음번호) rowData[COL.묶음번호 - 1] = joinAll("묶음번호");
      if (COL.도축장)   rowData[COL.도축장   - 1] = smartJoin("도축장");
      if (COL.매입처)   rowData[COL.매입처   - 1] = joinAll("producerName");
    }

    const excelRow = ws.addRow(rowData);

    // 복수 매칭 행은 줄바꿈 허용
    if (res && res._matchedEntries && res._matchedEntries.length > 1) {
      excelRow.alignment = { wrapText: true, vertical: "top" };
    }
  }

  // ── 열 너비 고정 ──────────────────────────────────────────────
  // A:매출일자 B:매출처 C:품목명 D:규격 E:수량 F:상품별메모
  // G:발급일자 H:발급번호 I:묶음번호 J:도축장 K:매입처 L:인증서
  const FIXED_WIDTHS = [14, 28, 30, 18, 8, 20, 14, 28, 22, 12, 10, 10];
  ws.columns.forEach((col, i) => {
    col.width = FIXED_WIDTHS[i] ?? 10;
  });

  generateOutputSheet(workbook);
  return workbook.xlsx.writeBuffer();
}

// ── 헤더 행 서식 (A~L 열, 네이비 배경) ──────────────────────────
function styleHeader(row) {
  row.height = 22;
  for (let c = 1; c <= 12; c++) {
    const cell = row.getCell(c);
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border    = { bottom: { style: "thin", color: { argb: "FFAAAAAA" } } };
  }
}
