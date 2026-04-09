"use client";

import { useState } from "react";

export const DEFAULT_MAP = {
  "1301": "삼성",
  "0324": "경기LPC",
  "0616": "대전충남",
  "0317": "우경축산",
  "0307": "우진산업",
  "0304": "평농",
  "0502": "대성실업",
};

/**
 * 도축장 코드(발급번호 앞 4자리) ↔ 명칭 관리 컴포넌트
 *
 * Props:
 *   customMap  : 사용자 정의 맵 { "코드": "명칭" }
 *   onChange   : (newCustomMap) => void
 */
export default function PlantCodeManager({ customMap, onChange }) {
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [editingCode, setEditingCode] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");

  // 기본 맵 + 사용자 맵 병합 표시
  const merged = { ...DEFAULT_MAP, ...customMap };
  const entries = Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));

  const isCustom = (code) => code in customMap;

  const handleAdd = () => {
    const code = newCode.trim();
    const name = newName.trim();
    setError("");
    if (!code || !name) { setError("코드와 명칭을 모두 입력해주세요."); return; }
    if (!/^\d{4}$/.test(code)) { setError("코드는 4자리 숫자여야 합니다."); return; }
    onChange({ ...customMap, [code]: name });
    setNewCode("");
    setNewName("");
  };

  const handleEdit = (code) => {
    setEditingCode(code);
    setEditingName(merged[code]);
    setError("");
  };

  const handleSaveEdit = () => {
    if (!editingName.trim()) return;
    onChange({ ...customMap, [editingCode]: editingName.trim() });
    setEditingCode(null);
  };

  const handleCancelEdit = () => setEditingCode(null);

  const handleDelete = (code) => {
    const next = { ...customMap };
    delete next[code];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        발급번호 앞 4자리 코드로 도축장 명칭을 자동 매칭합니다.
        기본 제공 항목은 수정할 수 있으며, 새 업체를 추가할 수 있습니다.
      </p>

      {/* 코드 목록 테이블 */}
      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-semibold text-gray-700 w-24">4자리 코드</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">도축장 명칭</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-700 w-16">구분</th>
              <th className="text-center px-3 py-2 font-semibold text-gray-700 w-24">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map(([code, name]) => (
              <tr key={code} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-gray-800">{code}</td>
                <td className="px-3 py-2">
                  {editingCode === code ? (
                    <input
                      className="border border-blue-400 rounded px-2 py-1 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="text-gray-800">{name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isCustom(code)
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {isCustom(code) ? "사용자" : "기본"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center space-x-2">
                  {editingCode === code ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        className="text-xs text-green-600 hover:underline font-medium"
                      >저장</button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-xs text-gray-400 hover:underline"
                      >취소</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(code)}
                        className="text-xs text-blue-600 hover:underline"
                      >수정</button>
                      {isCustom(code) && (
                        <button
                          onClick={() => handleDelete(code)}
                          className="text-xs text-red-500 hover:underline"
                        >삭제</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 새 항목 추가 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">새 도축장 추가</p>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">4자리 코드</label>
            <input
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={newCode}
              maxLength={4}
              onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ""))}
              placeholder="0000"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">도축장 명칭</label>
            <input
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예) 경기LPC"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-1.5 bg-blue-900 text-white text-sm rounded hover:bg-blue-800 whitespace-nowrap"
          >
            추가
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
