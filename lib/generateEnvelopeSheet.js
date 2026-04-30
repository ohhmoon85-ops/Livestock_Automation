/**
 * generateEnvelopeSheet.js
 * [봉투] 시트 자동 생성 — 사양서 v4 최종
 * 소스: workbook의 [검수서] 시트 (값만 복사된 것)
 */

export function cleanSchoolName(name) {
  let s = name;
  s = s.replace(/\(\(올본\)조식\)/g, '');
  s = s.replace(/\(\(올본\)중식\)/g, '');
  s = s.replace(/\(\(올본\)석식\)/g, '');
  s = s.replace(/\(올본\)/g, '');
  s = s.replace(/[-－]\s*조식/g, '');
  s = s.replace(/[-－]\s*중식/g, '');
  s = s.replace(/[-－]\s*석식/g, '');
  s = s.replace(/\(조식\)/g, '');
  s = s.replace(/\(중식\)/g, '');
  s = s.replace(/\(석식\)/g, '');
  return s.trim();
}

export function extractMealCode(name) {
  if (name.includes('조식')) return '조';
  if (name.includes('중식')) return '중';
  if (name.includes('석식')) return '석';
  return '';
}

export function convertBrackets(itemName) {
  return itemName.replace(/\[/g, '(').replace(/\]/g, ')');
}

export function joinMealCodes(set) {
  const order = ['조', '중', '석'];
  return order.filter(c => set.has(c)).join('/');
}

export function calcWidth(str) {
  return [...str].reduce((acc, ch) =>
    acc + (/[ㄱ-ㆎ가-힣]/.test(ch) ? 2 : 1), 0);
}

export function pickFontSize(str, maxSize = 48) {
  const w = calcWidth(str);
  let candidate;
  if (w <= 14) candidate = 48;
  else if (w <= 18) candidate = 40;
  else if (w <= 24) candidate = 32;
  else candidate = 24;
  return Math.min(candidate, maxSize);
}

export function getAdaptiveSize(totalLines) {
  if (totalLines <= 4) return { rowHeight: 70, schoolFont: 48, itemFontMax: 48 };
  if (totalLines === 5) return { rowHeight: 52, schoolFont: 40, itemFontMax: 36 };
  if (totalLines === 6) return { rowHeight: 44, schoolFont: 36, itemFontMax: 32 };
  if (totalLines === 7) return { rowHeight: 38, schoolFont: 32, itemFontMax: 28 };
  return { rowHeight: 33, schoolFont: 28, itemFontMax: 24 };
}

/**
 * [검수서] 시트 데이터를 학교별 그룹화·식사구분 통합·괄호 변환하여
 * [봉투] 시트를 워크북 마지막에 추가한다.
 * @param {import('exceljs').Workbook} workbook
 */
export function generateEnvelopeSheet(workbook) {
  const srcSheet = workbook.getWorksheet('검수서');

  const sheet = workbook.addWorksheet('봉투');

  sheet.getColumn('A').width = 2.0;
  sheet.getColumn('B').width = 83.5;
  sheet.getColumn('C').width = 19.75;
  sheet.getColumn('D').width = 19.875;

  sheet.pageSetup = {
    paperSize: 139,
    orientation: 'landscape',
    horizontalCentered: true,
    verticalCentered: true,
    margins: {
      top: 0.354, bottom: 0.354,
      left: 0.709, right: 0.315,
      header: 0.0, footer: 0.0,
    },
    printArea: 'B2:D2',
  };

  sheet.views = [{
    state: 'normal',
    showGridLines: false,
    view: 'pageBreakPreview',
  }];

  if (!srcSheet || srcSheet.rowCount === 0) {
    return;
  }

  // ── 헤더 행 탐색: 매출처(고객)명 / 품목명 / 수량 컬럼 위치 찾기
  let headerRowNum = null;
  let colCustomer = null;
  let colItem = null;
  let colQty = null;

  srcSheet.eachRow((row, rowNum) => {
    if (headerRowNum !== null) return;
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      vals[colNum - 1] = cell.value == null ? '' : String(cell.value);
    });
    for (let i = 0; i < vals.length; i++) {
      if (vals[i].includes('매출처') || vals[i].includes('고객')) colCustomer = i + 1;
      if (vals[i] === '품목명') colItem = i + 1;
      if (vals[i] === '수량') colQty = i + 1;
    }
    if (colCustomer && colItem && colQty) headerRowNum = rowNum;
  });

  if (!headerRowNum) return;

  // ── 그룹화
  const groups = {};

  srcSheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const customerCell = row.getCell(colCustomer);
    const itemCell     = row.getCell(colItem);
    const qtyCell      = row.getCell(colQty);

    const rawQty = qtyCell.value;
    if (typeof rawQty !== 'number' || isNaN(rawQty)) return;

    const customerRaw = customerCell.value == null ? '' : String(customerCell.value);
    const itemRaw     = itemCell.value     == null ? '' : String(itemCell.value);

    const schoolKey = cleanSchoolName(customerRaw);
    const mealCode  = extractMealCode(customerRaw);

    if (!groups[schoolKey]) groups[schoolKey] = { items: {} };
    if (!groups[schoolKey].items[itemRaw]) {
      groups[schoolKey].items[itemRaw] = { qty: 0, mealCodes: new Set() };
    }
    groups[schoolKey].items[itemRaw].qty += rawQty;
    if (mealCode) groups[schoolKey].items[itemRaw].mealCodes.add(mealCode);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ko'));

  // ── 행 작성 (1행은 비워둠 → 2행부터 시작)
  const CELL_STYLE_BASE = {
    font: { name: '맑은 고딕', size: 48, bold: true },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };

  let currentRow = 2;
  let lastDataRow = 2;

  for (const schoolKey of sortedKeys) {
    const group = groups[schoolKey];
    const totalLines = 1 + Object.keys(group.items).length;
    const sizing = getAdaptiveSize(totalLines);

    // 학교명 행
    const nameRow = sheet.getRow(currentRow);
    nameRow.height = sizing.rowHeight;
    const nameCell = nameRow.getCell('B');
    nameCell.value = schoolKey;
    nameCell.font = { name: '맑은 고딕', size: pickFontSize(schoolKey, sizing.schoolFont), bold: true };
    nameCell.alignment = CELL_STYLE_BASE.alignment;
    nameRow.getCell('C').value = '';
    nameRow.getCell('D').value = '';
    currentRow++;

    // 품목 행들
    for (const [itemRaw, data] of Object.entries(group.items)) {
      const displayName = convertBrackets(itemRaw);
      const mealStr     = joinMealCodes(data.mealCodes);

      const itemRow = sheet.getRow(currentRow);
      itemRow.height = sizing.rowHeight;

      const itemCell = itemRow.getCell('B');
      itemCell.value = displayName;
      itemCell.font = { name: '맑은 고딕', size: pickFontSize(displayName, sizing.itemFontMax), bold: true };
      itemCell.alignment = CELL_STYLE_BASE.alignment;

      const qtyCell2 = itemRow.getCell('C');
      qtyCell2.value = data.qty;
      qtyCell2.font = { name: '맑은 고딕', size: sizing.itemFontMax, bold: true };
      qtyCell2.alignment = CELL_STYLE_BASE.alignment;

      const mealCell = itemRow.getCell('D');
      mealCell.value = mealStr;
      mealCell.font = { name: '맑은 고딕', size: sizing.itemFontMax, bold: true };
      mealCell.alignment = CELL_STYLE_BASE.alignment;

      currentRow++;
    }

    // 그룹 마지막 행에 페이지 분리 (마지막 그룹 포함, 예외 없음)
    lastDataRow = currentRow - 1;
    sheet.getRow(lastDataRow).addPageBreak();
  }

  // printArea 최종 확정
  sheet.pageSetup.printArea = `B2:D${lastDataRow}`;
}
