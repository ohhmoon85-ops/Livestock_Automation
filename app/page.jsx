"use client";

import { useState, useRef } from "react";
import FileUploader from "@/components/FileUploader";
import ResultSummary from "@/components/ResultSummary";

const STEP = { UPLOAD: 0, PROCESSING: 1, DONE: 2 };

export default function Home() {
  const [shipmentFile, setShipmentFile] = useState(null);
  const [onepassFile, setOnepassFile] = useState(null);
  const [step, setStep] = useState(STEP.UPLOAD);
  const [stats, setStats] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [resultBlob, setResultBlob] = useState(null);
  const [error, setError] = useState("");

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

      const res = await fetch("/api/process", { method: "POST", body: form });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "서버 오류");
      }

      const statsRaw = res.headers.get("X-Process-Stats");
      const warnRaw = res.headers.get("X-Warnings");

      setStats(statsRaw ? JSON.parse(statsRaw) : {});
      setWarnings(warnRaw ? JSON.parse(warnRaw) : []);

      const blob = await res.blob();
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
    a.download = "출고리스트_완성.xlsx";
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

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
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
              <p className="font-semibold">✅ 파일 준비 안내</p>
              <p>• 원패스 파일: <strong>일반 / 무항</strong> 컬럼과 <strong>묶음번호</strong> 컬럼이 추가된 파일을 사용하세요.</p>
              <p>• 원패스 파일의 시트 이름에 <strong>"도축"</strong> 또는 <strong>"냉장"</strong>이 포함되어야 합니다.</p>
              <p>• 처리 대상: <code className="bg-blue-100 px-1 rounded">닭고기</code>, <code className="bg-blue-100 px-1 rounded">무항생제 닭고기</code> 포함 항목</p>
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
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        출고리스트-원패스 자동 연동 시스템 v1.1
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
