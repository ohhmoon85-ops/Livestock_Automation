/**
 * parseShipment.js
 * 출고리스트.xlsx 파싱 모듈
 *
 * 실제 파일 컬럼 기준:
 *   매출일자 | 매출처(고객)명 | 품목명 | 규격 | 수량 | 상품별메모
 *   발급일자 | 발급번호 | 묶음번호 | 도축장 | 농장경영자 | 인증서
 */

/**
 * sheet_to_json({header:1}) 결과(2D 배열)를 구조화된 배열로 변환
 * @param {Array} rows - 헤더 포함 2D 배열
 * @returns {Array} 출고리스트 행 배열
 */
export function parseShipment(rows) {
  if (!rows || rows.length < 2) {
    throw new Error("출고리스트 파일에 데이터가 없습니다.");
  }

  // 첫 번째 행 = 헤더
  const headers = rows[0].map((h) => (h == null ? "" : String(h).trim()));

  const idx = buildIdx(headers);

  // 필수 컬럼 존재 확인
  const mustExist = ["품목명", "규격", "수량"];
  for (const col of mustExist) {
    if (idx[col] === -1) {
      throw new Error(
        `출고리스트에 '${col}' 컬럼이 없습니다. 헤더를 확인해주세요.\n현재 헤더: ${headers.filter(Boolean).join(", ")}`
      );
    }
  }

  const result = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const 품목명 = get(row, idx["품목명"]);
    const 수량 = parseFloat(get(row, idx["수량"]));

    // 빈 행·합계 행·소계 행 건너뜀
    if (!품목명 || isNaN(수량) || 수량 === 0) continue;

    result.push({
      _rowIndex: i,
      _headers: headers,
      _rawRow: row,
      매출일자: get(row, idx["매출일자"]),
      "매출처(고객)명": get(row, idx["매출처(고객)명"]),
      품목명,
      규격: get(row, idx["규격"]),
      수량,
      상품별메모: get(row, idx["상품별메모"]),
      // 아래 4개 = 자동 기입 대상 (원본이 비어 있어도 키는 유지)
      발급일자: get(row, idx["발급일자"]),
      발급번호: get(row, idx["발급번호"]),
      묶음번호: get(row, idx["묶음번호"]),
      도축장: get(row, idx["도축장"]),
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────
function buildIdx(headers) {
  const map = {};
  const cols = [
    "매출일자", "매출처(고객)명", "품목명", "규격", "수량",
    "상품별메모", "발급일자", "발급번호", "묶음번호", "도축장",
    "농장경영자", "인증서",
  ];
  for (const col of cols) {
    map[col] = headers.indexOf(col);
  }
  return map;
}

function get(row, colIdx) {
  if (colIdx === -1 || colIdx == null) return "";
  const v = row[colIdx];
  if (v == null) return "";
  return String(v).trim();
}

// ──────────────────────────────────────────────
// 품목명 파싱
// ──────────────────────────────────────────────

/**
 * 품목명에서 처리 대상 여부·무항생제 여부·품종·부위 추출
 *
 * 처리 대상 품종: 계육(닭), 돈육(돼지)
 * 무항생제 판별: 품목명 맨 앞 "무항생제" 포함 여부
 * 부위: 품목명의 [ ] 안 값
 *
 * 예)
 *   "무항생제계육[넓적다리살/껍질무]" → { isTarget:true, isAntibiotic:true, product:"계육", 부위:"넓적다리살/껍질무" }
 *   "돈육[뒷다리]"                    → { isTarget:true, isAntibiotic:false, product:"돈육", 부위:"뒷다리" }
 *   "한우[설도]"                      → { isTarget:false, ... }
 */
export function parsePitemName(품목명) {
  const trimmed = (품목명 || "").trim();

  // 무항생제 여부 (앞에 붙는 prefix)
  const isAntibiotic = trimmed.startsWith("무항생제");
  const base = isAntibiotic ? trimmed.replace(/^무항생제/, "") : trimmed;

  // 품종 감지
  let product = null;
  if (base.startsWith("계육") || base.startsWith("계란")) product = "계육";
  else if (base.startsWith("돈육")) product = "돈육";

  const isTarget = product !== null;

  // 부위: [ ] 안의 값
  const match = trimmed.match(/\[([^\]]+)\]/);
  const 부위 = match ? match[1].trim() : null;

  return { isTarget, isAntibiotic, product, 부위 };
}

/**
 * 규격 컬럼에서 냉장/냉동 여부 추출
 * 원패스 시트 선택에 사용 (기획서 R3)
 */
export function parseStorageType(규격) {
  if (!규격) return null;
  if (규격.includes("냉동")) return "냉동";
  if (규격.includes("냉장")) return "냉장";
  return null;
}
