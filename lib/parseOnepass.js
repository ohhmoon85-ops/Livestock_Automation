/**
 * parseOnepass.js
 * 원패스.xls 파싱 모듈
 *
 * 실제 파일 컬럼 기준:
 *   번호 | 도출장명 | 발급일시 | 발급번호 | 부위 | 생산량(kg) | 발급가능량(kg) | 일반 | 무항 | 묶음번호
 *
 * 비고:
 *   - "일반" / "무항" 컬럼이 별도로 존재할 수 있고,
 *     담당자가 합쳐 "일반 / 무항" 단일 컬럼으로 관리할 수도 있음 → 양쪽 모두 지원
 *   - "묶음번호" 컬럼은 담당자가 직접 추가한 컬럼
 */

/**
 * @param {Array} rows       - sheet_to_json({header:1}) 결과 (2D 배열)
 * @param {string} sheetName - 시트 이름 (로그·디버그용)
 * @returns {Array} 원패스 행 배열
 */
export function parseOnepass(rows, sheetName = "") {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((h) => (h == null ? "" : String(h).trim()));

  // ── 컬럼 인덱스 탐색 ──────────────────────────────────
  const idx = {};
  for (const col of headers) idx[col] = headers.indexOf(col);

  // 필수 컬럼 (없으면 오류)
  const required = ["발급일시", "발급번호", "발급가능량(kg)"];
  const missing = required.filter((c) => !(c in idx) || idx[c] === -1);
  if (missing.length > 0) {
    throw new Error(
      `원패스 시트 "${sheetName}"에 '${missing.join(", ")}' 컬럼이 없습니다.\n` +
        `현재 헤더: ${headers.filter(Boolean).join(", ")}`
    );
  }

  // 부위 컬럼: "부위" 또는 "부위명"
  const col부위 = "부위" in idx ? "부위" : "부위명" in idx ? "부위명" : null;
  if (!col부위) {
    throw new Error(
      `원패스 시트 "${sheetName}"에 '부위' 또는 '부위명' 컬럼이 없습니다.`
    );
  }

  // 일반/무항 판별: 단일 컬럼 "일반 / 무항" 또는 별도 "일반" + "무항" 컬럼
  const 단일컬럼 = "일반 / 무항" in idx || "일반/무항" in idx;
  const 단일키 = "일반 / 무항" in idx ? "일반 / 무항" : "일반/무항";

  // ── 행 파싱 ──────────────────────────────────────────
  const result = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const 발급가능량 = parseFloat(get(row, idx["발급가능량(kg)"]));
    if (isNaN(발급가능량)) continue; // 합계·빈 행 건너뜀

    const 발급번호 = get(row, idx["발급번호"]);
    const 부위 = get(row, idx[col부위]);
    if (!발급번호 || !부위) continue;

    // 일반/무항 판별
    let 분류 = "";
    if (단일컬럼) {
      분류 = get(row, idx[단일키]); // "일반" 또는 "무항"
    } else {
      const 일반값 = get(row, idx["일반"] ?? -1);
      const 무항값 = get(row, idx["무항"] ?? -1);
      if (무항값) 분류 = "무항";
      else if (일반값) 분류 = "일반";
    }

    const 발급일시Raw = get(row, idx["발급일시"]);
    const 도출장코드 = 발급번호.substring(0, 4); // 앞 4자리

    result.push({
      _rowIndex: i,
      _sheetName: sheetName,
      발급일시: parseDate(발급일시Raw),
      발급일시Raw,
      발급번호,
      부위,
      "발급가능량(kg)": 발급가능량,
      분류, // "일반" | "무항" | ""
      묶음번호: get(row, idx["묶음번호"] ?? -1),
      도출장코드,
      도출장명: get(row, idx["도출장명"] ?? -1),
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────
function get(row, colIdx) {
  if (colIdx === -1 || colIdx == null) return "";
  const v = row[colIdx];
  if (v == null) return "";
  return String(v).trim();
}

/**
 * 날짜 문자열 → Date (FIFO 정렬용)
 * 지원 형식: "2026-03-18", "2026-03-18 08:00:00", Excel 시리얼 숫자
 */
function parseDate(raw) {
  if (!raw) return null;

  // Excel 날짜 시리얼
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 10000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
