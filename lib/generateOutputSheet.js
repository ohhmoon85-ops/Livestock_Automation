import ExcelJS from "exceljs";

/**
 * [매출 시트] 데이터를 기반으로 납품서 인쇄용 [출력] 시트를 생성한다.
 * 워크북에 시트를 추가하므로 반드시 writeBuffer() 직전에 호출할 것.
 * @param {ExcelJS.Workbook} workbook
 */
export function generateOutputSheet(workbook) {
  const srcSheet = workbook.getWorksheet("매출 시트");
  if (!srcSheet) return;

  // ── 헤더 행 탐색 (매출처(고객)명 · 품목명 · 수량 컬럼 위치 확인) ──────
  let headerRowNum = -1;
  let custCol = -1, itemCol = -1, qtyCol = -1;

  srcSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (headerRowNum !== -1) return;

    let c1 = -1, c2 = -1, c3 = -1;
    const vals = row.values; // 1-indexed sparse array
    for (let c = 1; c <= 20; c++) {
      const v = String(vals[c] ?? "").trim();
      if (v.includes("매출처") && v.includes("고객")) c1 = c;
      else if (v === "품목명") c2 = c;
      else if (v === "수량") c3 = c;
    }
    if (c1 !== -1 && c2 !== -1 && c3 !== -1) {
      headerRowNum = rowNum;
      custCol = c1;
      itemCol = c2;
      qtyCol  = c3;
    }
  });

  if (headerRowNum === -1) return;

  // ── 데이터 로드 + 그룹핑 ──────────────────────────────────────────────
  // Map<매출처명, Map<품목명, 수량합>>  — 삽입 순서 유지
  const groups = new Map();

  srcSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const vals = row.values;
    const cust = String(vals[custCol] ?? "").trim();
    const item = String(vals[itemCol] ?? "").trim();
    const raw  = vals[qtyCol];
    const qty  = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));

    // 빈 행 · 합계 행 · 소제목 행 스킵 (수량이 양수가 아닌 행)
    if (!cust || !item || !isFinite(qty) || qty <= 0) return;

    if (!groups.has(cust)) groups.set(cust, new Map());
    const itemMap = groups.get(cust);
    itemMap.set(item, (itemMap.get(item) ?? 0) + qty);
  });

  // ── [출력] 시트 생성 ──────────────────────────────────────────────────
  const out = workbook.addWorksheet("출력");

  out.pageSetup = {
    paperSize:         9,          // A4
    orientation:       "landscape",
    fitToPage:         true,
    fitToWidth:        1,
    fitToHeight:       1,
    horizontalCentered: true,
    verticalCentered:  true,
    margins: {
      top: 0.3, bottom: 0.3,
      left: 0.3, right: 0.3,
      header: 0.0, footer: 0.0,
    },
  };

  // 격자선 OFF (인쇄 시 격자 미출력)
  out.views = [{ state: "normal", showGridLines: false }];

  // 컬럼 구성: A·B → 텍스트 병합 영역, C → 수량
  out.getColumn(1).width = 46;
  out.getColumn(2).width = 14;
  out.getColumn(3).width = 10;

  // ── 납품서 페이지 작성 ────────────────────────────────────────────────
  const entries = [...groups.entries()];
  let cur = 1; // 현재 행 번호

  for (let g = 0; g < entries.length; g++) {
    const [custName, itemMap] = entries[g];

    // 납품처명 행 (A:C 병합, 굵게, 가운데)
    out.mergeCells(cur, 1, cur, 3);
    const nameCell = out.getRow(cur).getCell(1);
    const nameFontSz = calcFontSize(custName);
    nameCell.value     = custName;
    nameCell.font      = { name: "맑은 고딕", size: nameFontSz, bold: true };
    nameCell.alignment = { horizontal: "center", vertical: "middle" };
    out.getRow(cur).height = fontToHeight(nameFontSz);
    cur++;

    // 품목명 행 (A:B 병합 + C = 수량)
    for (const [itemName, qty] of itemMap.entries()) {
      out.mergeCells(cur, 1, cur, 2);
      const itemRow  = out.getRow(cur);
      const itemFontSz = calcFontSize(itemName);

      const itemCell     = itemRow.getCell(1);
      itemCell.value     = itemName;
      itemCell.font      = { name: "맑은 고딕", size: itemFontSz };
      itemCell.alignment = { horizontal: "center", vertical: "middle" };

      const qtyCell      = itemRow.getCell(3);
      qtyCell.value      = qty;
      qtyCell.font       = { name: "맑은 고딕", size: itemFontSz };
      qtyCell.alignment  = { horizontal: "right", vertical: "middle" };

      itemRow.height = fontToHeight(itemFontSz);
      cur++;
    }

    // 납품처 간 페이지 강제 분리 (마지막 그룹 제외)
    if (g < entries.length - 1) {
      out.getRow(cur - 1).addPageBreak();
    }
  }
}

// 한글(2) + ASCII(1) 환산 너비로 폰트 크기 결정 (48→40→32→24pt)
function calcFontSize(text) {
  const w = [...text].reduce((s, ch) => s + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
  if (w <= 16) return 48;
  if (w <= 20) return 40;
  if (w <= 26) return 32;
  return 24;
}

// 폰트 크기 → 행 높이 (pt)
function fontToHeight(size) {
  return { 48: 72, 40: 60, 32: 48, 24: 36 }[size] ?? 72;
}
