/**
 * matchEngine.js
 * 출고리스트 ↔ 원패스 연동 핵심 로직 (R1~R9)
 *
 * 처리 대상: 계육(닭), 돈육(돼지) — 무항생제 여부로 원패스 행 필터링
 */

import { parsePitemName } from "./parseShipment.js";

// ──────────────────────────────────────────────────────────────
// 도출장 코드 → 업체명 매핑 (발급번호 앞 4자리)
// ──────────────────────────────────────────────────────────────
const PLANT_CODE_MAP = {
  "0324": "(주)우리미트넷",
  "0304": "(주)영민글로벌미트",
  "0308": "(주)영민글로벌미트",
  "1301": "(주)농우촌웰푸드",
  "0502": "농업회사법인(주) 티엔에스푸드",
  "0317": "서울경기양돈축산업협동조합",
  "0307": "서울경기양돈축산업협동조합",
  "0616": "농업회사법인(주)고가네 제2공장",
};

export function getPlantName(code) {
  return PLANT_CODE_MAP[code] || code;
}

// ──────────────────────────────────────────────────────────────
// 메인 매칭 함수
// ──────────────────────────────────────────────────────────────
/**
 * @param {Array}  shipmentRows  - parseShipment() 결과
 * @param {Array}  onepassRows   - parseOnepass() 결과 (모든 시트 합산)
 * @returns {{ results: Array, warnings: Array }}
 */
export function matchAll(shipmentRows, onepassRows) {
  // 원패스 풀 복사 (발급가능량 차감 반영)
  const pool = onepassRows.map((r) => ({ ...r }));

  // R5: FIFO — 발급일시 오름차순 정렬
  pool.sort((a, b) => {
    if (!a.발급일시) return 1;
    if (!b.발급일시) return -1;
    return a.발급일시 - b.발급일시;
  });

  const results = [];
  const warnings = [];

  for (const row of shipmentRows) {
    const parsed = parsePitemName(row.품목명);

    // R1: 처리 대상이 아닌 행 (계육·돈육 외 품목) → 그대로 통과
    if (!parsed.isTarget) {
      results.push({ ...row, _matched: false, _skipped: true });
      continue;
    }

    // R2: 무항생제 여부
    const needAntibiotic = parsed.isAntibiotic; // true = 무항, false = 일반

    // R4: 부위 매칭 키
    const need부위 = parsed.부위;

    // 조건에 맞는 원패스 후보 필터 (발급가능량 > 0 인 것만)
    const candidates = pool.filter((op) => {
      // 부위 일치 (R4)
      if (need부위 && op.부위 !== need부위) return false;

      // 무항생제/일반 구분 (R2)
      const opType = (op.분류 || "").trim();
      if (needAntibiotic) {
        if (opType !== "무항") return false;
      } else {
        if (opType !== "일반") return false;
      }

      // R5: 발급가능량 > 0
      if (op["발급가능량(kg)"] <= 0) return false;

      return true;
    });

    const needed = row.수량;

    if (candidates.length === 0) {
      const reason =
        `조건에 맞는 원패스 항목 없음 ` +
        `(부위: ${need부위 || "?"}, ${needAntibiotic ? "무항" : "일반"})`;
      warnings.push({ row, reason });
      results.push({ ...row, _matched: false, _skipped: false, _warning: reason });
      continue;
    }

    // R6 / R7: FIFO 순서로 수량 채움
    const matchedEntries = [];
    let remaining = needed;

    for (const op of candidates) {
      if (remaining <= 0.001) break;
      if (op["발급가능량(kg)"] <= 0) continue;

      const take = Math.min(remaining, op["발급가능량(kg)"]);
      op["발급가능량(kg)"] = Math.max(0, op["발급가능량(kg)"] - take);
      remaining -= take;

      matchedEntries.push({
        발급일자: op.발급일시Raw,   // 출고리스트 컬럼명은 "발급일자"
        발급번호: op.발급번호,
        묶음번호: op.묶음번호,
        도축장: op.도출장코드,      // R8: 발급번호 앞 4자리
        usedKg: take,
      });
    }

    // R9: 잔량 부족 경고
    if (remaining > 0.001) {
      const msg =
        `⚠ 발급가능량 부족 (필요 ${needed}kg, 부족 ${remaining.toFixed(2)}kg)`;
      warnings.push({ row, reason: msg });
      results.push({
        ...row,
        _matched: matchedEntries.length > 0,
        _matchedEntries: matchedEntries,
        _warning: msg,
      });
    } else {
      results.push({
        ...row,
        _matched: true,
        _matchedEntries: matchedEntries,
        _warning: null,
      });
    }
  }

  return { results, warnings };
}
