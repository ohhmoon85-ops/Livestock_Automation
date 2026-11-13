import { matchAll, normalizeBuui } from "../lib/matchEngine.js";

// 2026-11 품목명 변경: '사골잡뼈' → '사골' — 신·구 명칭이 섞여 있어도 매칭되어야 함
const op = (부위) => ({
  부위,
  분류: "무항",
  도출장코드: "0616",
  발급번호: "0616-03100514",
  발급일시: new Date("2026-11-01"),
  발급일시Raw: "2026-11-01",
  "발급가능량(kg)": 100,
  _sheetName: "",
});
const ship = (품목명) => ({ 품목명, 규격: "", 수량: 10 });

test("normalizeBuui: 사골잡뼈 → 사골", () => {
  expect(normalizeBuui("사골잡뼈")).toBe("사골");
  expect(normalizeBuui("사골")).toBe("사골");
  expect(normalizeBuui("잡뼈")).toBe("잡뼈");
});

test.each([
  ["무항생제돈육[사골]", "사골잡뼈"],
  ["무항생제돈육[사골]", "사골"],
  ["무항생제돈육[사골잡뼈]", "사골"],
  ["무항생제돈육[사골잡뼈]", "사골잡뼈"],
  ["무항생제돈육[사골,잡뼈]", "사골잡뼈"],
])("출고 %s ↔ 원패스 부위 %s 매칭", (품목명, 부위) => {
  const { results, warnings } = matchAll([ship(품목명)], [op(부위)]);
  expect(warnings).toHaveLength(0);
  expect(results[0]._matched).toBe(true);
});

test("사골은 다른 부위(등뼈)와 매칭되지 않음", () => {
  const { warnings } = matchAll([ship("무항생제돈육[사골]")], [op("등뼈")]);
  expect(warnings).toHaveLength(1);
});
