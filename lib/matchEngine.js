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
  // 원패스 파일의 행 순서가 곧 배정 순서 — 날짜 재정렬 없이 파일 원본 순서 유지
  const pool = onepassRows.map((r) => ({ ...r }));

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
      // 부위 일치 (R4): 유사 매칭 허용
      if (need부위 && !match부위(need부위, op.부위)) return false;

      // 무항생제/일반 구분 (R2): "무항생제" 값도 "무항"으로 인정
      const opType = (op.분류 || "").trim();
      if (needAntibiotic) {
        if (!opType.includes("무항")) return false;
      } else {
        if (!opType.includes("일반")) return false;
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

      const available = op["발급가능량(kg)"];
      // 부동소수점 오류 방지: 소수점 2자리로 반올림
      const take = round2(Math.min(remaining, available));
      op["발급가능량(kg)"] = round2(Math.max(0, available - take));
      remaining = round2(remaining - take);

      matchedEntries.push({
        발급일자: op.발급일시Raw,
        발급번호: op.발급번호,
        묶음번호: op.묶음번호,
        도축장: op.도출장명 || op.도출장코드,
        usedKg: take,
      });
    }

    // 복수 항목일 때 발급번호에 [사용량kg] 표기
    if (matchedEntries.length > 1) {
      for (const entry of matchedEntries) {
        entry.발급번호 = `${entry.발급번호}[${fmtKg(entry.usedKg)}]`;
      }
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

// ──────────────────────────────────────────────
// 수치 헬퍼
// ──────────────────────────────────────────────
/** 부동소수점 오류 방지: 소수점 2자리 반올림 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** kg 표기: 불필요한 소수점 제거 ("28.40" → "28.4", "32.00" → "32") */
function fmtKg(kg) {
  return Number(kg.toFixed(2)).toString();
}

// ──────────────────────────────────────────────
// 부위 유사 매칭
//   출고리스트 품목명 부위와 원패스 부위 컬럼이 다를 수 있음:
//   - 슬래시 이후 생략: "가슴살/껍질무" vs "가슴살"
//   - '살' 접미사 생략: "등심살" vs "등심", "사태살" vs "사태"
// ──────────────────────────────────────────────
function match부위(need, op) {
  if (!need) return true;
  if (need === op) return true;

  // 슬래시 앞부분만 추출 ("가슴살/껍질무" → "가슴살")
  const needBase = need.includes("/") ? need.split("/")[0].trim() : need;
  if (needBase === op) return true;

  // op가 need(또는 needBase)의 prefix인 경우 ("등심살".startsWith("등심"))
  if (op.length >= 2 && needBase.startsWith(op)) return true;

  return false;
}
