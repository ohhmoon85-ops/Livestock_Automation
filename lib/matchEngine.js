/**
 * matchEngine.js
 * 출고리스트 ↔ 원패스 연동 핵심 로직 (R1~R9)
 *
 * 처리 대상: 계육(닭), 돈육(돼지) — 무항생제 여부로 원패스 행 필터링
 */

import { parsePitemName, parseStorageType } from "./parseShipment.js";

// ──────────────────────────────────────────────────────────────
// 도출장 코드 → 업체명 매핑 (발급번호 앞 4자리)
// ──────────────────────────────────────────────────────────────
export const DEFAULT_CODE_MAP = {
  "1301": "삼성",
  "0324": "경기LPC",
  "0616": "대전충남",
  "0317": "우경축산",
  "0307": "우진산업",
  "0304": "평농",
  "0502": "대성실업",
  "0308": "포천농축",
  "0611": "사조산업",
  "0812": "중앙축산",
  "0809": "나주축산",
  "0614": "백제나루",
};

// ──────────────────────────────────────────────────────────────
// 계육 전용 부위 — 이 부위들은 돈육 출고와 매칭하지 않음
// ──────────────────────────────────────────────────────────────
const 계육전용부위 = new Set([
  "가슴살", "닭가슴살",
  "넓적다리살", "닭다리살",
  "날개", "닭날개",
  "닭봉",
  "잔골",
  "닭발",
  "닭목",
]);

// ──────────────────────────────────────────────────────────────
// 메인 매칭 함수
// ──────────────────────────────────────────────────────────────
/**
 * @param {Array}  shipmentRows  - parseShipment() 결과
 * @param {Array}  onepassRows   - parseOnepass() 결과 (모든 시트 합산)
 * @returns {{ results: Array, warnings: Array }}
 */
export function matchAll(shipmentRows, onepassRows, customCodeMap = {}) {
  const codeMap = { ...DEFAULT_CODE_MAP, ...customCodeMap };
  // 등록된 돈육 도출장 코드 집합 (이 코드 외의 "안심" cert는 계육으로 추정)
  const known돈육코드 = new Set(Object.keys(codeMap));

  // 원패스 풀 복사 + FIFO: 발급일시 오름차순 정렬 (오래된 인증서 먼저 소비)
  // 같은 날짜 내에서는 파일 원본 순서 유지 (stable sort)
  const pool = onepassRows
    .map((r) => ({ ...r }))
    .sort((a, b) => {
      if (!a.발급일시) return 1;
      if (!b.발급일시) return -1;
      const dateDiff = a.발급일시 - b.발급일시;
      if (dateDiff !== 0) return dateDiff;
      // 수정2: 같은 날짜 내에서는 원패스 하단 행(행 번호 큰 것)을 먼저 소진
      return (b._globalIdx ?? b._rowIndex ?? 0) - (a._globalIdx ?? a._rowIndex ?? 0);
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

    // R3: 냉장/냉동 구분 (규격 컬럼에서 추출)
    const storageType = parseStorageType(row.규격); // "냉장" | "냉동" | null

    // R4: 부위 매칭 키
    const need부위 = parsed.부위;

    // 조건에 맞는 원패스 후보 필터 (발급가능량 > 0 인 것만)
    const candidates = pool.filter((op) => {
      // ── 지방 부위 제외 ──────────────────────────────────────
      if (op.부위 === "지방" || op.부위.endsWith("지방")) return false;

      // ── 냉장/냉동 시트 구분 (R3) ───────────────────────────
      // 원패스 시트명에 냉장/냉동이 명시된 경우에만 필터 적용
      if (storageType) {
        const sn = (op._sheetName || "").trim();
        const isFrozenOnly = sn.includes("냉동") && !sn.includes("냉장");
        const isRefrigOnly = sn.includes("냉장") && !sn.includes("냉동");
        if (storageType === "냉동" && isRefrigOnly) return false;
        if (storageType === "냉장" && isFrozenOnly) return false;
      }

      // ── 품종 필터: 계육 전용 부위는 돈육 출고에 사용 불가 ──
      if (parsed.product === "돈육" && 계육전용부위.has(op.부위)) return false;

      // ── 안심 부위 품종 구분 ─────────────────────────────────
      // 돈육 출고 시, 등록된 돈육 도출장이 아닌 곳의 "안심" cert는
      // 계육 안심으로 추정하여 제외
      if (
        parsed.product === "돈육" &&
        (op.부위 === "안심" || op.부위 === "닭안심") &&
        !known돈육코드.has(op.도출장코드)
      ) return false;

      // ── 부위 일치 (R4): 유사 매칭 허용 ────────────────────
      // 버그1 수정: [사골,잡뼈] 처럼 쉼표 구분 복수 부위는 어느 하나라도 일치하면 통과
      if (need부위) {
        const parts = need부위.split(",").map((s) => s.trim()).filter(Boolean);
        if (!parts.some((p) => match부위(p, op.부위))) return false;
      }

      // ── 무항생제/일반 구분 (R2) ────────────────────────────
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
        `(부위: ${need부위 || "?"}, ${needAntibiotic ? "무항" : "일반"}` +
        `${storageType ? ", " + storageType : ""})`;
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
        도축장: codeMap[op.도출장코드] || op.도출장코드,
        producerName: op.producerName || "",  // 수정1: 생산자 이름 → 매입처 컬럼
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
// 부위 정규화 (동의어·표기 통일)
//   - LA갈비 → 갈비 (LA 접두어 제거)
//   - 미박사태살 → 사태살 (미박: 껍질 제거 처리 방식, 부위명 아님)
//   - 목심 ↔ 목살 (동의어 통일)
// ──────────────────────────────────────────────
function normalizeBuui(val) {
  let v = (val || "").trim();
  v = v.replace(/^LA/i, "");   // LA갈비 → 갈비
  v = v.replace(/^미박/, "");  // 미박사태살 → 사태살
  if (v === "목심") v = "목살"; // 목심 ↔ 목살 통일
  return v;
}

// ──────────────────────────────────────────────
// 부위 유사 매칭
//   출고리스트 품목명 부위와 원패스 부위 컬럼이 다를 수 있음:
//   - 슬래시 이후 생략: "가슴살/껍질무" vs "가슴살"
//   - '살' 접미사 생략: "등심살" vs "등심", "사태살" vs "사태"
//   - LA 접두어: "LA갈비" vs "갈비"
//   - 목심/목살 동의어
// ──────────────────────────────────────────────
function match부위(need, op) {
  if (!need) return true;
  if (!op) return false;

  // 슬래시 앞부분만 추출 ("가슴살/껍질무" → "가슴살")
  const needBase = need.includes("/") ? need.split("/")[0].trim() : need;

  // 양쪽 모두 정규화
  const needNorm = normalizeBuui(needBase);
  const opNorm   = normalizeBuui(op);

  if (needNorm === opNorm) return true;

  // op(정규화)가 need(정규화)의 prefix인 경우 ("등심살" ← "등심")
  if (opNorm.length >= 2 && needNorm.startsWith(opNorm)) return true;

  return false;
}
