/**
 * parseOnepass.js
 * 원패스.xls 파싱 모듈
 *
 * 실제 파일 구조:
 *   헤더 행: [비어있음] [비어있음] [비어있음] [비어있음] 부위▲ 생산량(kg) 발급가능량(kg) 일반 무항 (묶음번호)
 *   데이터행: [번호]    [도출장명]  [발급일시]  [발급번호] 뒷다리  173.5      173.5          일반   ...
 *
 * → 발급번호/발급일시는 헤더에 이름이 없는 왼쪽 컬럼에 있으므로
 *   첫 데이터 행을 스캔해 패턴으로 컬럼 위치를 자동 감지.
 */

// 발급번호 패턴: 4자리-8자리 (예: 0502-03180008)
const CERT_NO_RE = /^\d{4}-\d{6,10}$/;
// 날짜 패턴: YYYY-MM-DD
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * @param {Array}  rows      - sheet_to_json({header:1}) 결과 (2D 배열)
 * @param {string} sheetName - 시트 이름 (오류 메시지용)
 * @returns {Array} 원패스 행 배열
 */
export function parseOnepass(rows, sheetName = "") {
  if (!rows || rows.length < 2) return [];

  // ── 1. 헤더 행 탐색 ("부위" 계열 셀 포함 행) ──────────────
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = (rows[i] || []).map((c) => String(c ?? "").trim());
    if (cells.some((c) => c === "부위" || c === "부위▲" || c === "부위명")) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    const firstCells = (rows[0] || [])
      .map((c) => String(c ?? ""))
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `원패스 시트 "${sheetName}"에서 '부위' 컬럼을 찾을 수 없습니다.\n` +
        `(파일 첫 행: ${firstCells || "(비어 있음)"})`
    );
  }

  const headerRow = rows[headerRowIndex] || [];
  const headers = headerRow.map((h) => String(h ?? "").trim());

  // ── 2. 이름 있는 컬럼 인덱스 ────────────────────────────────
  const namedIdx = {};
  headers.forEach((h, i) => { if (h) namedIdx[h] = i; });

  const col부위 =
    namedIdx["부위"] ?? namedIdx["부위▲"] ?? namedIdx["부위명"] ?? -1;
  const col발급가능량 = namedIdx["발급가능량(kg)"] ?? -1;

  // 일반/무항: 단일 컬럼 또는 분리 컬럼 양쪽 지원
  const col일반무항단일 =
    namedIdx["일반 / 무항"] ?? namedIdx["일반/무항"] ?? -1;
  const col일반 = namedIdx["일반"] ?? -1;
  const col무항 = namedIdx["무항"] ?? namedIdx["무항생제"] ?? -1;
  const col묶음번호Named = namedIdx["묶음번호"] ?? -1;
  let col도출장명 = namedIdx["도출장명"] ?? -1;

  if (col부위 === -1) {
    throw new Error(
      `원패스 시트 "${sheetName}"에 '부위' 컬럼이 없습니다.\n현재 헤더: ${headers.filter(Boolean).join(", ")}`
    );
  }
  if (col발급가능량 === -1) {
    throw new Error(
      `원패스 시트 "${sheetName}"에 '발급가능량(kg)' 컬럼이 없습니다.\n현재 헤더: ${headers.filter(Boolean).join(", ")}`
    );
  }

  // ── 3. 발급번호/발급일시 컬럼 자동 감지 ─────────────────────
  //   헤더에 이름이 없더라도 데이터 행에서 패턴으로 찾음
  let col발급번호 = namedIdx["발급번호"] ?? -1;
  let col발급일시 = namedIdx["발급일시"] ?? -1;
  let col묶음번호Auto = col묶음번호Named; // 헤더에 없으면 패턴 탐색

  if (col발급번호 === -1 || col발급일시 === -1 || col묶음번호Auto === -1 || col도출장명 === -1) {
    // 첫 5개 데이터 행을 스캔
    for (
      let i = headerRowIndex + 1;
      i < Math.min(headerRowIndex + 6, rows.length);
      i++
    ) {
      const row = rows[i] || [];
      for (let j = 0; j < row.length; j++) {
        const val = String(row[j] ?? "").trim();
        if (!val) continue;
        if (col발급번호 === -1 && CERT_NO_RE.test(val)) col발급번호 = j;
        if (col발급일시 === -1 && DATE_RE.test(val) && !CERT_NO_RE.test(val))
          col발급일시 = j;
        // 묶음번호: L 로 시작하는 긴 번호 또는 순수 숫자 12자리+
        if (
          col묶음번호Auto === -1 &&
          j !== col발급번호 &&
          j !== col발급일시 &&
          (/^L\d{10,}$/.test(val) || /^\d{10,}$/.test(val))
        ) {
          col묶음번호Auto = j;
        }
      }
      if (col발급번호 !== -1 && col발급일시 !== -1) break;
    }

    // 도출장명: 부위 컬럼 앞에서 텍스트(한글 업체명) 컬럼 탐색
    if (col도출장명 === -1 && col발급번호 !== -1) {
      for (
        let i = headerRowIndex + 1;
        i < Math.min(headerRowIndex + 6, rows.length);
        i++
      ) {
        const row = rows[i] || [];
        for (let j = 0; j < col부위; j++) {
          if (j === col발급번호 || j === col발급일시) continue;
          const val = String(row[j] ?? "").trim();
          if (!val) continue;
          if (CERT_NO_RE.test(val)) continue;
          if (DATE_RE.test(val)) continue;
          if (!isNaN(parseFloat(val)) && isFinite(val)) continue;
          if (val.length >= 2) { col도출장명 = j; break; }
        }
        if (col도출장명 !== -1) break;
      }
    }
  }

  const col묶음번호 = col묶음번호Auto !== -1 ? col묶음번호Auto : col묶음번호Named;

  // ── 4. 데이터 행 파싱 ────────────────────────────────────────
  const result = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.length) continue;

    const 발급가능량 = parseFloat(get(row, col발급가능량));
    if (isNaN(발급가능량)) continue; // 합계·빈 행 건너뜀

    const 부위 = get(row, col부위);
    const 발급번호 = get(row, col발급번호);

    // 부위 또는 발급번호가 없으면 스킵
    if (!부위 || !발급번호) continue;

    // 일반/무항 분류
    let 분류 = "";
    if (col일반무항단일 !== -1) {
      분류 = get(row, col일반무항단일);
    } else {
      const 무항val = get(row, col무항);
      const 일반val = get(row, col일반);
      // "0", "false", 공백은 falsy로 처리 (Excel에서 0이 문자열로 저장될 수 있음)
      const 무항active = isTruthyClass(무항val);
      const 일반active = isTruthyClass(일반val);
      분류 = 무항active ? "무항" : 일반active ? "일반" : "";
    }

    const 발급일시Raw = get(row, col발급일시);

    result.push({
      _rowIndex: i,
      _sheetName: sheetName,
      발급일시: parseDate(발급일시Raw),
      발급일시Raw,
      발급번호,
      부위,
      "발급가능량(kg)": 발급가능량,
      분류,
      묶음번호: get(row, col묶음번호 !== -1 ? col묶음번호 : -1),
      도출장코드: 발급번호.substring(0, 4),
      도출장명: get(row, col도출장명),
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────

/** "0", "false", 공백 등을 falsy로 처리 — Excel의 숫자 0이 문자열로 저장될 때 대비 */
function isTruthyClass(val) {
  if (!val) return false;
  const v = val.trim();
  if (!v) return false;
  if (v === "0" || v.toLowerCase() === "false") return false;
  if (v === "　") return false; // 전각 공백
  return true;
}

function get(row, colIdx) {
  if (colIdx == null || colIdx === -1) return "";
  const v = row[colIdx];
  if (v == null) return "";
  return String(v).trim();
}

function parseDate(raw) {
  if (!raw) return null;
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 10000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
