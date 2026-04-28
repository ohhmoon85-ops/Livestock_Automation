import ExcelJS from "exceljs";
import { generateOutputSheet } from "../lib/generateOutputSheet";

// ── 헬퍼: [매출 시트] 워크북 빌더 ──────────────────────────────────
function buildWorkbook(dataRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("매출 시트");
  ws.addRow([
    "매출일자", "매출처(고객)명", "품목명", "규격", "수량",
    "상품별메모", "발급일자", "발급번호", "묶음번호", "도축장", "농장경영자", "인증서",
  ]);
  for (const row of dataRows) ws.addRow(row);
  return wb;
}

function makeRow(cust, item, qty) {
  return ["03-25-26", cust, item, "국내산 냉장 1등급", qty, "", "", "", "", "", "", ""];
}

// ── T1: 매출처 그룹핑 + 중복 품목 수량 합산 ──────────────────────────
test("T1 매출처 그룹핑 + 중복 품목 수량 합산", () => {
  const wb = buildWorkbook([
    makeRow("학교A", "닭고기[가슴살]", 10),
    makeRow("학교A", "닭고기[가슴살]", 5),   // 동일 품목 → 15로 합산
    makeRow("학교B", "돈육[앞다리]", 20),
    ["", "", "", "", "", "", "", "", "", "", "", ""], // 빈 행 → 스킵
    makeRow("학교A", "한우[우둔]", 8),
  ]);

  generateOutputSheet(wb);
  const out = wb.getWorksheet("출력");
  expect(out).toBeDefined();

  // 레이아웃:
  //   Row 1: 학교A (납품처명)
  //   Row 2: 닭고기[가슴살] | qty=15
  //   Row 3: 한우[우둔]     | qty=8
  //   Row 4: 학교B (납품처명)
  //   Row 5: 돈육[앞다리]   | qty=20
  expect(out.getRow(2).getCell(3).value).toBe(15); // 합산 검증
  expect(out.getRow(3).getCell(3).value).toBe(8);
  expect(out.getRow(5).getCell(3).value).toBe(20);

  // 전체 행 수 = (1+2) + (1+1) = 5
  let rowCount = 0;
  out.eachRow(() => rowCount++);
  expect(rowCount).toBe(5);
});

// ── T2: 시트 순서 ─────────────────────────────────────────────────
test("T2 시트 순서: worksheets[0]=매출 시트, worksheets[1]=출력", () => {
  const wb = buildWorkbook([makeRow("학교A", "닭고기[가슴살]", 10)]);
  generateOutputSheet(wb);

  expect(wb.worksheets[0].name).toBe("매출 시트");
  expect(wb.worksheets[1].name).toBe("출력");
});

// ── T3: pageBreak 수 = 매출처 수 - 1 ─────────────────────────────
test("T3 pageBreak 수 = 매출처 수 - 1", () => {
  const customers = ["학교A", "학교B", "학교C"];
  const wb = buildWorkbook(customers.map(c => makeRow(c, "닭고기[가슴살]", 10)));
  generateOutputSheet(wb);

  const out = wb.getWorksheet("출력");
  expect(out.rowBreaks.length).toBe(customers.length - 1); // 2
});

// ── T4: pageSetup.fitToPage + showGridLines ───────────────────────
test("T4 pageSetup.fitToPage===true && showGridLines===false", () => {
  const wb = buildWorkbook([makeRow("학교A", "닭고기[가슴살]", 10)]);
  generateOutputSheet(wb);

  const out = wb.getWorksheet("출력");
  expect(out.pageSetup.fitToPage).toBe(true);
  expect(out.views[0].showGridLines).toBe(false);
});

// ── T5: [매출 시트] 없을 때 예외 없이 종료 ──────────────────────────
test("T5 [매출 시트] 부재 시 예외 없이 no-op", () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("다른 시트");
  expect(() => generateOutputSheet(wb)).not.toThrow();
  expect(wb.getWorksheet("출력")).toBeUndefined();
});
