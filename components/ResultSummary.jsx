"use client";

export default function ResultSummary({ stats, warnings, onDownload, onReset }) {
  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="처리 대상" value={stats.total} color="blue" />
        <StatCard label="성공" value={stats.success} color="green" />
        <StatCard label="경고" value={stats.warn} color="amber" />
        <StatCard label="건너뜀" value={stats.skipped} color="gray" />
      </div>

      {/* 경고 목록 */}
      {warnings && warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-800 mb-3">
            ⚠ 경고 항목 ({warnings.length}건)
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs bg-white border border-amber-100 rounded-lg p-2">
                <span className="font-medium text-gray-700">{w.품목명}</span>
                {w.수량 && <span className="text-gray-400 ml-1">({w.수량}kg)</span>}
                <p className="text-amber-700 mt-0.5">{w.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={onDownload}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          완성 파일 다운로드
        </button>
        <button
          onClick={onReset}
          className="px-5 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors"
        >
          다시 처리
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-900 border-blue-200",
    green: "bg-green-50 text-green-900 border-green-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    gray: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <div className={`border rounded-xl p-4 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
