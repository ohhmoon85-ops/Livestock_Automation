"use client";

import { useState, useEffect } from "react";
import FileUploader from "@/components/FileUploader";
import ResultSummary from "@/components/ResultSummary";
import PlantCodeManager from "@/components/PlantCodeManager";

const STEP = { UPLOAD: 0, PROCESSING: 1, DONE: 2 };
const TAB = { MAIN: "main", PLANT: "plant", DEBUG: "debug" };

export default function Home() {
  const [shipmentFile, setShipmentFile] = useState(null);
  const [onepassFile, setOnepassFile] = useState(null);
  const [step, setStep] = useState(STEP.UPLOAD);
  const [stats, setStats] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [resultBlob, setResultBlob] = useState(null);
  const [error, setError] = useState("");
  const [resultFilename, setResultFilename] = useState("출고리스트_완성.xlsx");

  // 활성 탭
  const [tab, setTab] = useState(TAB.MAIN);

  // 디버그 탭
  const [debugFile, setDebugFile] = useState(null);
  const [debugSheets, setDebugSheets] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState("");

  const handleDebug = async () => {
    if (!debugFile) return;
    setDebugLoading(true);
    setDebugError("");
    setDebugSheets(null);
    try {
      const form = new FormData();
      form.append("onepass", debugFile);
      const res = await fetch("/api/debug", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "오류");
      setDebugSheets(body.sheets);
    } catch (e) {
      setDebugError(e.message);
    } finally {
      setDebugLoading(false);
    }
  };

  // 도축장 코드 맵 (localStorage 저장)
  const [customCodeMap, setCustomCodeMap] = useState({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem("plantCodeMap");
      if (saved) setCustomCodeMap(JSON.parse(saved));
    } catch {}
  }, []);

  const handleCodeMapChange = (newMap) => {
    setCustomCodeMap(newMap);
    try { localStorage.setItem("plantCodeMap", JSON.stringify(newMap)); } catch {}
  };

  const handleProcess = async () => {
    if (!shipmentFile || !onepassFile) {
      setError("두 파일을 모두 업로드해주세요.");
      return;
    }
    setError("");
    setStep(STEP.PROCESSING);

    try {
      const form = new FormData();
      form.append("shipment", shipmentFile);
      form.append("onepass", onepassFile);
      form.append("codeMap", JSON.stringify(customCodeMap));

      const res = await fetch("/api/process", { method: "POST", body: form });
      const body = await res.json();

      if (!res.ok || !body.ok) {
        throw new Error(body.error || "서버 오류");
      }

      setResultFilename(body.filename || "출고리스트_완성.xlsx");
      setStats(body.stats ?? {});
      setWarnings(
        (body.warnings ?? []).map((w) => ({
          품목명: w.item,
          수량: w.qty,
          reason: w.reason,
        }))
      );

      // base64 → Blob 변환
      const binary = atob(body.file);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      setResultBlob(blob);
      setStep(STEP.DONE);
    } catch (e) {
      setError(e.message);
      setStep(STEP.UPLOAD);
    }
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setShipmentFile(null);
    setOnepassFile(null);
    setStep(STEP.UPLOAD);
    setStats(null);
    setWarnings([]);
    setResultBlob(null);
    setError("");
    setResultFilename("출고리스트_완성.xlsx");
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-blue-900 text-white px-6 py-4 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase text-blue-300 mb-0.5">
            육가공 행정 시스템
          </p>
          <h1 className="text-xl font-bold">출고리스트 ↔ 원패스 자동 연동</h1>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => setTab(TAB.MAIN)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === TAB.MAIN
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            자동 연동
          </button>
          <button
            onClick={() => setTab(TAB.PLANT)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === TAB.PLANT
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            도축장 관리
          </button>
          <button
            onClick={() => setTab(TAB.DEBUG)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === TAB.DEBUG
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            파싱 확인
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

        {/* ── 도축장 관리 탭 ── */}
        {tab === TAB.PLANT && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-800">도축장 코드 관리</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                발급번호 앞 4자리 코드 → 도축장 명칭 매핑표
              </p>
            </div>
            <PlantCodeManager
              customMap={customCodeMap}
              onChange={handleCodeMapChange}
            />
          </div>
        )}

        {/* ── 파싱 확인 탭 ── */}
        {tab === TAB.DEBUG && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-800">원패스 파싱 확인</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                원패스 파일을 올리면 각 행의 분류(일반/무항), 발급일시, 부위 등이 어떻게 인식되는지 확인합니다.
              </p>
            </div>
            <FileUploader
              label="원패스 파일 (.xls/.xlsx)"
              accept=".xls,.xlsx"
              file={debugFile}
              onFile={setDebugFile}
            />
            <button
              onClick={handleDebug}
              disabled={!debugFile || debugLoading}
              className="w-full py-2 rounded-xl font-semibold text-white transition-colors
                bg-blue-700 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              {debugLoading ? "분석 중…" : "파싱 결과 확인"}
            </button>
            {debugError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {debugError}
              </div>
            )}
            {debugSheets && debugSheets.map((sheet, si) => (
              <div key={si} className="space-y-3">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-gray-700">시트: {sheet.sheetName}</p>
                  {sheet.error ? (
                    <p className="text-xs text-red-500 mt-1">{sheet.error}</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mt-1">
                        헤더 행: {sheet.headerRowIndex}번째 행 /
                        감지된 헤더: [{sheet.headers.filter(Boolean).join(", ")}]
                      </p>
                      <p className="text-xs text-gray-500">
                        컬럼 위치 — 부위:{sheet.컬럼감지.부위} / 발급번호:{sheet.컬럼감지.발급번호} /
                        발급일시:{sheet.컬럼감지.발급일시} / 일반:{sheet.컬럼감지.일반} /
                        무항:{sheet.컬럼감지.무항} / 단일:{sheet.컬럼감지.일반무항단일}
                      </p>
                      {sheet.sampleRawRows.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-blue-600 cursor-pointer">원시 데이터 샘플 (첫 5행)</summary>
                          <div className="overflow-x-auto mt-1">
                            <table className="text-xs border-collapse">
                              <thead>
                                <tr className="bg-blue-50">
                                  <th className="border px-1 py-0.5">행</th>
                                  <th className="border px-1 py-0.5">발급번호</th>
                                  <th className="border px-1 py-0.5">발급일시</th>
                                  <th className="border px-1 py-0.5">부위</th>
                                  <th className="border px-1 py-0.5 bg-green-100">일반컬럼값</th>
                                  <th className="border px-1 py-0.5 bg-yellow-100">무항컬럼값</th>
                                  <th className="border px-1 py-0.5">단일컬럼값</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sheet.sampleRawRows.map((r, i) => (
                                  <tr key={i}>
                                    <td className="border px-1 py-0.5">{r.rowIdx}</td>
                                    <td className="border px-1 py-0.5 font-mono">{r.발급번호_raw}</td>
                                    <td className="border px-1 py-0.5">{r.발급일시_raw}</td>
                                    <td className="border px-1 py-0.5">{r.부위_raw}</td>
                                    <td className="border px-1 py-0.5 bg-green-50">[{r.일반_raw}]</td>
                                    <td className="border px-1 py-0.5 bg-yellow-50">[{r.무항_raw}]</td>
                                    <td className="border px-1 py-0.5">[{r.단일분류_raw}]</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>

                {sheet.rows && sheet.rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <p className="text-xs text-gray-500 mb-1">파싱 결과: 총 {sheet.rows.length}개 행</p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-gray-700">
                          <th className="border border-gray-200 px-2 py-1 text-left">발급번호</th>
                          <th className="border border-gray-200 px-2 py-1 text-left">날짜</th>
                          <th className="border border-gray-200 px-2 py-1 text-left">부위</th>
                          <th className="border border-gray-200 px-2 py-1 text-center font-bold">분류</th>
                          <th className="border border-gray-200 px-2 py-1 bg-green-50">일반값</th>
                          <th className="border border-gray-200 px-2 py-1 bg-yellow-50">무항값</th>
                          <th className="border border-gray-200 px-2 py-1 text-right">가능량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.map((r, i) => (
                          <tr key={i} className={r.분류 === "무항" ? "bg-yellow-50" : r.분류 === "일반" ? "bg-green-50" : "bg-red-50"}>
                            <td className="border border-gray-200 px-2 py-1 font-mono">{r.발급번호}</td>
                            <td className="border border-gray-200 px-2 py-1">{r.발급일시}</td>
                            <td className="border border-gray-200 px-2 py-1">{r.부위}</td>
                            <td className={`border border-gray-200 px-2 py-1 text-center font-bold ${
                              r.분류 === "무항" ? "text-yellow-700" : r.분류 === "일반" ? "text-green-700" : "text-red-500"
                            }`}>{r.분류 || "❌미감지"}</td>
                            <td className="border border-gray-200 px-2 py-1 bg-green-50 text-center">[{r.일반컬럼값}]</td>
                            <td className="border border-gray-200 px-2 py-1 bg-yellow-50 text-center">[{r.무항컬럼값}]</td>
                            <td className="border border-gray-200 px-2 py-1 text-right">{r.발급가능량}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 자동 연동 탭 ── */}
        {tab === TAB.MAIN && (
          <>
            {/* Step 인디케이터 */}
            <StepIndicator current={step} />

            {/* 오류 메시지 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* ── STEP 0: 파일 업로드 ── */}
            {step === STEP.UPLOAD && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FileUploader
                    label="출고리스트 (.xlsx)"
                    accept=".xlsx,.xls"
                    file={shipmentFile}
                    onFile={setShipmentFile}
                  />
                  <FileUploader
                    label="원패스 (.xls/.xlsx)"
                    accept=".xls,.xlsx"
                    file={onepassFile}
                    onFile={setOnepassFile}
                  />
                </div>

                {/* 안내 */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">파일 준비 안내</p>
                  <p>• 원패스 파일: <strong>일반 / 무항</strong> 컬럼과 <strong>묶음번호</strong> 컬럼이 추가된 파일을 사용하세요.</p>
                  <p>• 원패스 파일의 시트 이름에 <strong>"도축"</strong> 또는 <strong>"냉장"</strong>이 포함되어야 합니다.</p>
                  <p>• 처리 대상: <code className="bg-blue-100 px-1 rounded">돈육(돼지고기)</code>, <code className="bg-blue-100 px-1 rounded">무항생제 돈육</code> 포함 항목</p>
                </div>

                <button
                  onClick={handleProcess}
                  disabled={!shipmentFile || !onepassFile}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-colors
                    bg-orange-600 hover:bg-orange-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  자동 연동 시작
                </button>
              </div>
            )}

            {/* ── STEP 1: 처리 중 ── */}
            {step === STEP.PROCESSING && (
              <div className="text-center py-16 space-y-4">
                <div className="inline-block w-12 h-12 border-4 border-blue-200 border-t-blue-900 rounded-full animate-spin" />
                <p className="text-gray-600 font-medium">원패스 데이터와 매칭 중입니다…</p>
                <p className="text-xs text-gray-400">파일 크기에 따라 수 초~수십 초 소요될 수 있습니다.</p>
              </div>
            )}

            {/* ── STEP 2: 완료 ── */}
            {step === STEP.DONE && stats && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                  <h2 className="text-base font-bold text-gray-800 mb-4">처리 결과</h2>
                  <ResultSummary
                    stats={stats}
                    warnings={warnings}
                    onDownload={handleDownload}
                    onReset={handleReset}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        출고리스트-원패스 자동 연동 시스템 v1.2
      </footer>
    </div>
  );
}

function StepIndicator({ current }) {
  const steps = ["파일 업로드", "처리 중", "결과 확인"];
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < current
                  ? "bg-green-500 text-white"
                  : i === current
                  ? "bg-blue-900 text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`text-xs mt-1 ${i === current ? "text-blue-900 font-semibold" : "text-gray-400"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-16 h-0.5 mx-1 mb-4 ${i < current ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
