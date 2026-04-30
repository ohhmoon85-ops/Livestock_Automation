import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import path from "path";
import {
  cleanSchoolName,
  extractMealCode,
  convertBrackets,
  joinMealCodes,
  calcWidth,
  pickFontSize,
  getAdaptiveSize,
  generateEnvelopeSheet,
} from "../lib/generateEnvelopeSheet.js";

// ── T1: cleanSchoolName ────────────────────────────────────────────────────
test("T1: cleanSchoolName 9개 케이스", () => {
  expect(cleanSchoolName("구룡초등학교(올본)")).toBe("구룡초등학교");
  expect(cleanSchoolName("선화예술고등학교((올본)조식)")).toBe("선화예술고등학교");
  expect(cleanSchoolName("선화예술고등학교((올본)중식)")).toBe("선화예술고등학교");
  expect(cleanSchoolName("해성여자고등학교(올본)-석식")).toBe("해성여자고등학교");
  expect(cleanSchoolName("해성여자고등학교(올본)-중식")).toBe("해성여자고등학교");
  expect(cleanSchoolName("동백유치원")).toBe("동백유치원");
  expect(cleanSchoolName("별빛누리유치원")).toBe("별빛누리유치원");
  expect(cleanSchoolName("마들유치원(든든)")).toBe("마들유치원(든든)");
  expect(cleanSchoolName("영천유치원")).toBe("영천유치원");
});

// ── T2: extractMealCode ────────────────────────────────────────────────────
test("T2: extractMealCode 4개 케이스", () => {
  expect(extractMealCode("선화예술고등학교((올본)조식)")).toBe("조");
  expect(extractMealCode("선화예술고등학교((올본)중식)")).toBe("중");
  expect(extractMealCode("해성여자고등학교(올본)-석식")).toBe("석");
  expect(extractMealCode("동백유치원")).toBe("");
});

// ── T3: convertBrackets ────────────────────────────────────────────────────
test("T3: convertBrackets 4개 케이스", () => {
  expect(convertBrackets("돈육[등뼈]")).toBe("돈육(등뼈)");
  expect(convertBrackets("한우[등심]")).toBe("한우(등심)");
  expect(convertBrackets("무항생제돈육[앞다리살]")).toBe("무항생제돈육(앞다리살)");
  expect(convertBrackets("무항생제계육[넓적다리살/껍질무]")).toBe("무항생제계육(넓적다리살/껍질무)");
});

// ── T4: joinMealCodes ─────────────────────────────────────────────────────
test("T4: joinMealCodes 정렬 순서", () => {
  expect(joinMealCodes(new Set(["조", "석"]))).toBe("조/석");
  expect(joinMealCodes(new Set(["조", "중", "석"]))).toBe("조/중/석");
  expect(joinMealCodes(new Set(["중"]))).toBe("중");
  expect(joinMealCodes(new Set([]))).toBe("");
});

// ── T5: 그룹화 + 수량 합산 + mealCode union ───────────────────────────────
test("T5: 동일 학교·동일 품목 수량 합산 및 식사코드 union", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);
  ws.addRow(["", "선화예술고등학교((올본)조식)", "무항생제돈육[앞다리살]", "", 3]);
  ws.addRow(["", "선화예술고등학교((올본)중식)", "무항생제돈육[앞다리살]", "", 4]);

  generateEnvelopeSheet(wb);

  const envSheet = wb.getWorksheet("봉투");
  expect(envSheet).toBeTruthy();

  // 학교명 행: 2행
  expect(envSheet.getRow(2).getCell("B").value).toBe("선화예술고등학교");
  // 품목 행: 3행 — 수량 3+4=7, 식사코드 조/중
  expect(envSheet.getRow(3).getCell("B").value).toBe("무항생제돈육(앞다리살)");
  expect(envSheet.getRow(3).getCell("C").value).toBe(7);
  expect(envSheet.getRow(3).getCell("D").value).toBe("조/중");
});

// ── T6: 가나다순 정렬 ─────────────────────────────────────────────────────
test("T6: 학교명 가나다순 정렬", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);
  ws.addRow(["", "해성여자고등학교(올본)-중식", "돈육[목살]", "", 10]);
  ws.addRow(["", "구룡초등학교(올본)", "돈육[갈비]", "", 5]);
  ws.addRow(["", "동백유치원", "계육[닭다리]", "", 8]);

  generateEnvelopeSheet(wb);
  const envSheet = wb.getWorksheet("봉투");

  // 1행 빈칸, 2행부터 구룡, 동백, 해성 순
  expect(envSheet.getRow(2).getCell("B").value).toBe("구룡초등학교");
  // 구룡 품목 후 동백 시작
  const dongRow = envSheet.getRow(4).getCell("B").value;
  expect(dongRow).toBe("동백유치원");
});

// ── T7: [봉투]가 워크북 마지막 시트 ─────────────────────────────────────
test("T7: [봉투]가 워크북 마지막 시트", () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("매출 시트");
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);
  ws.addRow(["", "동백유치원", "돈육[목살]", "", 5]);

  generateEnvelopeSheet(wb);

  const names = wb.worksheets.map((s) => s.name);
  expect(names[names.length - 1]).toBe("봉투");
});

// ── T8: 페이지 분리 수 == 그룹 수 (마지막 그룹 포함) ─────────────────────
test("T8: rowBreaks.length === 그룹 수 (마지막 포함)", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);
  ws.addRow(["", "구룡초등학교(올본)", "돈육[갈비]", "", 5]);
  ws.addRow(["", "동백유치원", "계육[닭다리]", "", 8]);
  ws.addRow(["", "해성여자고등학교(올본)-중식", "돈육[목살]", "", 10]);

  generateEnvelopeSheet(wb);
  const envSheet = wb.getWorksheet("봉투");

  expect(envSheet.rowBreaks.length).toBe(3);
});

// ── T9: 페이지 설정 ──────────────────────────────────────────────────────
test("T9: pageSetup 및 views 설정", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);

  generateEnvelopeSheet(wb);
  const envSheet = wb.getWorksheet("봉투");

  expect(envSheet.pageSetup.paperSize).toBe(139);
  expect(envSheet.pageSetup.orientation).toBe("landscape");
  expect(envSheet.views[0].view).toBe("pageBreakPreview");
  expect(envSheet.views[0].showGridLines).toBe(false);
});

// ── T10: 폰트 — 맑은 고딕, B열 자동 축소, C/D 48pt ──────────────────────
test("T10: 폰트 맑은 고딕, B열 자동 축소, C/D 48pt 고정", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검수서");
  ws.addRow(["날짜"]);
  ws.addRow(["담당자", "매출처(고객)명", "품목명", "규격", "수량"]);
  // 긴 이름(w>14) → 폰트 축소 대상
  ws.addRow(["", "무항생제계육넓적다리초등학교(올본)", "무항생제계육[넓적다리살/껍질무]", "", 10]);

  generateEnvelopeSheet(wb);
  const envSheet = wb.getWorksheet("봉투");

  // 학교명 행 B 폰트
  const nameCellFont = envSheet.getRow(2).getCell("B").font;
  expect(nameCellFont.name).toBe("맑은 고딕");
  expect(nameCellFont.size).toBeLessThan(48); // 긴 이름이므로 축소됨

  // 품목 행 C, D 는 48pt 고정
  const cFont = envSheet.getRow(3).getCell("C").font;
  const dFont = envSheet.getRow(3).getCell("D").font;
  expect(cFont.size).toBe(48);
  expect(dFont.size).toBe(48);
});

// ── T11: 통합 시나리오 — 5월 4일 완성본 ──────────────────────────────────
test("T11: 5월_4일 완성본 통합 시나리오", async () => {
  const filePath = path.resolve(
    __dirname,
    "../../복사본 5월 4일(월) 출고리스트 완성본.xlsx"
  );

  const xlsxWb = XLSX.read(require("fs").readFileSync(filePath), {
    type: "buffer",
    cellDates: true,
  });

  // 출력 ExcelJS workbook 구성: [검수서] 복사 + [매출 시트] 더미
  const wb = new ExcelJS.Workbook();

  // [검수서] 복사 (값만)
  if (xlsxWb.Sheets["검수서"]) {
    const inspSheet = wb.addWorksheet("검수서");
    const rows = XLSX.utils.sheet_to_json(xlsxWb.Sheets["검수서"], {
      header: 1,
      defval: null,
    });
    for (const row of rows) {
      inspSheet.addRow(row);
    }
  }

  wb.addWorksheet("매출 시트");

  generateEnvelopeSheet(wb);

  const envSheet = wb.getWorksheet("봉투");
  expect(envSheet).toBeTruthy();

  // a. 그룹 수 == 7
  const schoolNames = [];
  envSheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const b = row.getCell("B").value;
    const c = row.getCell("C").value;
    if (b && (c === "" || c === null || c === undefined || c === 0)) {
      if (typeof b === "string" && b.trim() !== "") schoolNames.push(b);
    }
  });
  // 학교명 행은 C가 빈칸 — 그룹 헤더 추출
  // 더 정확하게: 수량(C)이 숫자가 아닌 비어있는 행이 학교명 행
  const groupRows = [];
  envSheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const b = row.getCell("B").value;
    const c = row.getCell("C").value;
    if (b && typeof b === "string" && b.trim() !== "" &&
        (c === null || c === "" || c === undefined)) {
      groupRows.push(b);
    }
  });
  expect(groupRows.length).toBe(7);

  // b. 가나다순
  const expected = [
    "구룡초등학교",
    "동백유치원",
    "마들유치원(든든)",
    "별빛누리유치원",
    "선화예술고등학교",
    "영천유치원",
    "해성여자고등학교",
  ];
  expect(groupRows).toEqual(expected);

  // c. 선화예술고등학교 봉투
  const sunhwaIdx = groupRows.indexOf("선화예술고등학교");
  let sunhwaStartRow = 2;
  let count = 0;
  let sunhwaItems = [];
  envSheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const b = row.getCell("B").value;
    const c = row.getCell("C").value;
    const d = row.getCell("D").value;
    if (b && typeof b === "string" && b.trim() !== "" &&
        (c === null || c === "" || c === undefined)) {
      count++;
      if (count === sunhwaIdx + 1) sunhwaStartRow = rowNum;
    } else if (count === sunhwaIdx + 1 && b) {
      sunhwaItems.push({ b, c, d });
    }
  });

  const sunhwaItemNames = sunhwaItems.map((i) => i.b);
  expect(sunhwaItemNames).toContain("무항생제돈육(앞다리살)");
  expect(sunhwaItemNames).toContain("무항생제계육(넓적다리살/껍질무)");

  const donuk = sunhwaItems.find((i) => i.b === "무항생제돈육(앞다리살)");
  const gyeuk = sunhwaItems.find((i) => i.b === "무항생제계육(넓적다리살/껍질무)");
  expect(donuk.c).toBe(7);
  expect(donuk.d).toBe("조");
  expect(gyeuk.c).toBe(70);
  expect(gyeuk.d).toBe("중");

  // d. 해성여자고등학교 봉투
  const haesungIdx = groupRows.indexOf("해성여자고등학교");
  let haesungItems = [];
  let hCount = 0;
  envSheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const b = row.getCell("B").value;
    const c = row.getCell("C").value;
    const d = row.getCell("D").value;
    if (b && typeof b === "string" && b.trim() !== "" &&
        (c === null || c === "" || c === undefined)) {
      hCount++;
    } else if (hCount === haesungIdx + 1 && b) {
      haesungItems.push({ b, c, d });
    }
  });
  const haesungItemNames = haesungItems.map((i) => i.b);
  expect(haesungItemNames).toContain("돈육(목살)");
  expect(haesungItemNames).toContain("돈육(갈비)");
  expect(haesungItemNames).toContain("돈육(앞다리살)");

  const moksal = haesungItems.find((i) => i.b === "돈육(목살)");
  const galbi  = haesungItems.find((i) => i.b === "돈육(갈비)");
  const front  = haesungItems.find((i) => i.b === "돈육(앞다리살)");
  expect(moksal.c).toBe(18);
  expect(moksal.d).toBe("석");
  expect(galbi.c).toBe(85);
  expect(galbi.d).toBe("중");
  expect(front.c).toBe(45);
  expect(front.d).toBe("중");

  // e. rowBreaks.length === 7
  expect(envSheet.rowBreaks.length).toBe(7);

  // f. 출력 시트 수 === 3
  expect(wb.worksheets.length).toBe(3);

  // g. 시트 이름 순서
  expect(wb.worksheets.map((s) => s.name)).toEqual([
    "검수서",
    "매출 시트",
    "봉투",
  ]);

  // h. [검수서] 데이터 행 수 === 입력 [검수서] 데이터 행 수
  const inputRows = XLSX.utils.sheet_to_json(xlsxWb.Sheets["검수서"], {
    header: 1,
    defval: null,
  });
  const outputInspSheet = wb.getWorksheet("검수서");
  expect(outputInspSheet.rowCount).toBe(inputRows.length);
});

// ── T12: getAdaptiveSize 테이블 검증 ─────────────────────────────────────────
test("T12: getAdaptiveSize 반환값 테이블", () => {
  expect(getAdaptiveSize(4)).toEqual({ rowHeight: 70, schoolFont: 48, itemFontMax: 48 });
  expect(getAdaptiveSize(5)).toEqual({ rowHeight: 52, schoolFont: 40, itemFontMax: 36 });
  expect(getAdaptiveSize(6)).toEqual({ rowHeight: 44, schoolFont: 36, itemFontMax: 32 });
  expect(getAdaptiveSize(7)).toEqual({ rowHeight: 38, schoolFont: 32, itemFontMax: 28 });
  expect(getAdaptiveSize(8)).toEqual({ rowHeight: 33, schoolFont: 28, itemFontMax: 24 });
  // 4줄 이하는 동일 반환
  expect(getAdaptiveSize(1)).toEqual({ rowHeight: 70, schoolFont: 48, itemFontMax: 48 });
  expect(getAdaptiveSize(3)).toEqual({ rowHeight: 70, schoolFont: 48, itemFontMax: 48 });
});

// ── T13: 5월 6일 테스트 파일 — 적응형 축소 통합 검증 ─────────────────────────
test("T13: 5월 6일 테스트 파일 적응형 축소", async () => {
  const filePath = path.resolve(
    __dirname,
    "../../5월 6일(수) 출고리스트_봉투 테스트.xlsx"
  );

  const xlsxWb = XLSX.read(require("fs").readFileSync(filePath), {
    type: "buffer",
    cellDates: true,
  });

  const wb = new ExcelJS.Workbook();
  if (xlsxWb.Sheets["검수서"]) {
    const inspSheet = wb.addWorksheet("검수서");
    const rows = XLSX.utils.sheet_to_json(xlsxWb.Sheets["검수서"], {
      header: 1,
      defval: null,
    });
    for (const row of rows) inspSheet.addRow(row);
  }
  wb.addWorksheet("매출 시트");
  generateEnvelopeSheet(wb);

  const envSheet = wb.getWorksheet("봉투");
  expect(envSheet).toBeTruthy();

  // 그룹별 행 번호 수집 { schoolName -> [rowNums] }
  const groupMap = {};
  let currentSchool = null;
  envSheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const b = row.getCell("B").value;
    const c = row.getCell("C").value;
    const isSchoolRow =
      b && typeof b === "string" && b.trim() !== "" &&
      (c === null || c === "" || c === undefined);
    if (isSchoolRow) {
      currentSchool = b.trim();
      groupMap[currentSchool] = [rowNum];
    } else if (currentSchool && b) {
      groupMap[currentSchool].push(rowNum);
    }
  });

  // ── 안성고등학교: 총 5줄 (학교명 + 4품목) → rowHeight=52, schoolFont=40, items≤36 ──
  const anseong = groupMap["안성고등학교"];
  expect(anseong).toBeDefined();
  expect(anseong.length).toBe(5);
  for (const rowNum of anseong) {
    expect(envSheet.getRow(rowNum).height).toBe(52);
  }
  expect(envSheet.getRow(anseong[0]).getCell("B").font.size).toBe(40);
  for (const rowNum of anseong.slice(1)) {
    expect(envSheet.getRow(rowNum).getCell("B").font.size).toBeLessThanOrEqual(36);
    expect(envSheet.getRow(rowNum).getCell("C").font.size).toBe(36);
    expect(envSheet.getRow(rowNum).getCell("D").font.size).toBe(36);
  }

  // ── 자곡초등학교: 총 6줄 (학교명 + 5품목) → rowHeight=44, schoolFont=36, items≤32 ──
  const jagok = groupMap["자곡초등학교"];
  expect(jagok).toBeDefined();
  expect(jagok.length).toBe(6);
  for (const rowNum of jagok) {
    expect(envSheet.getRow(rowNum).height).toBe(44);
  }
  expect(envSheet.getRow(jagok[0]).getCell("B").font.size).toBe(36);
  for (const rowNum of jagok.slice(1)) {
    expect(envSheet.getRow(rowNum).getCell("B").font.size).toBeLessThanOrEqual(32);
    expect(envSheet.getRow(rowNum).getCell("C").font.size).toBe(32);
    expect(envSheet.getRow(rowNum).getCell("D").font.size).toBe(32);
  }

  // ── 4줄 이하 그룹 샘플: rowHeight=70, C/D itemFontMax=48 변경 없음 ──
  const smallGroups = Object.entries(groupMap).filter(([, rows]) => rows.length <= 4);
  expect(smallGroups.length).toBeGreaterThan(0);
  const [, sampleRows] = smallGroups[0];
  for (const rowNum of sampleRows) {
    expect(envSheet.getRow(rowNum).height).toBe(70);
  }
  for (const rowNum of sampleRows.slice(1)) {
    expect(envSheet.getRow(rowNum).getCell("C").font.size).toBe(48);
    expect(envSheet.getRow(rowNum).getCell("D").font.size).toBe(48);
  }
});
