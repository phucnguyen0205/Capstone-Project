"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

const questions = [
  {
    id: 1,
    question: "Bạn thường làm gì khi rảnh?",
    options: [
      { label: "Đọc sách / Xem phim", icon: "eye" as const },
      { label: "Gặp gỡ bạn bè", icon: "users2" as const },
      { label: "Tập thể dục / Thể thao", icon: "heart" as const },
      { label: "Chơi game / Lướt mạng", icon: "playCircle" as const },
    ],
    category: "lifestyle",
  },
  {
    id: 2,
    question: "Điều gì khiến bạn cảm thấy hạnh phúc nhất?",
    options: [
      { label: "Được ở bên người thân", icon: "heart" as const },
      { label: "Hoàn thành mục tiêu", icon: "zap" as const },
      { label: "Khám phá điều mới", icon: "globe" as const },
      { label: "Khoảnh khắc yên bình", icon: "lockSmall" as const },
    ],
    category: "values",
  },
  {
    id: 3,
    question: "Bạn thuộc tuýp người nào?",
    options: [
      { label: "Nội tâm, thích suy nghĩ", icon: "eye" as const },
      { label: "Hướng ngoại, thích giao tiếp", icon: "users2" as const },
      { label: "Cân bằng giữa hai", icon: "globe" as const },
      { label: "Phụ thuộc vào tình huống", icon: "clock" as const },
    ],
    category: "personality",
  },
  {
    id: 4,
    question: "Loại mối quan hệ nào phù hợp với bạn?",
    options: [
      { label: "Một người bạn thân", icon: "heart" as const },
      { label: "Nhóm bạn nhỏ", icon: "users2" as const },
      { label: "Nhiều mối quan hệ xã hội", icon: "globe" as const },
      { label: "Cần thời gian riêng tư", icon: "lockSmall" as const },
    ],
    category: "relationships",
  },
  {
    id: 5,
    question: "Bạn xử lý stress bằng cách nào?",
    options: [
      { label: "Nói chuyện với người thân", icon: "users2" as const },
      { label: "Nghe nhạc / Làm việc sáng tạo", icon: "playCircle" as const },
      { label: "Tập thể dục / Thiền", icon: "heart" as const },
      { label: "Ở một mình và suy nghĩ", icon: "eye" as const },
    ],
    category: "stress",
  },
];

const categories = ["Tất cả", "Lối sống", "Giá trị", "Tính cách", "Mối quan hệ", "Cách xử lý stress"];
const categoryMap: Record<string, string> = {
  "Tất cả": "",
  "Lối sống": "lifestyle",
  "Giá trị": "values",
  "Tính cách": "personality",
  "Mối quan hệ": "relationships",
  "Cách xử lý stress": "stress",
};

const quizResults = [
  { label: "Độ intro/extro", value: 62, color: "bg-blue-500" },
  { label: "Mức độ lãng mạn", value: 78, color: "bg-pink-500" },
  { label: "Tính phiêu lưu", value: 45, color: "bg-amber-500" },
  { label: "Sự đồng cảm", value: 85, color: "bg-violet-500" },
];

export function QuizMainPanel() {
  const [step, setStep] = useState<"quiz" | "result">("quiz");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");

  const filteredQuestions =
    selectedCategory === "Tất cả"
      ? questions
      : questions.filter((q) => q.category === categoryMap[selectedCategory]);

  function handleSelect(optionIdx: number) {
    const qId = filteredQuestions[currentQ].id;
    setAnswers((prev) => ({ ...prev, [qId]: optionIdx }));

    if (currentQ < filteredQuestions.length - 1) {
      setTimeout(() => setCurrentQ((p) => p + 1), 300);
    } else {
      setTimeout(() => setStep("result"), 300);
    }
  }

  function handleReset() {
    setStep("quiz");
    setCurrentQ(0);
    setAnswers({});
  }

  if (step === "result") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-lg text-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-[#ff2e93]/10 mx-auto">
            <Icon name="zap" size={40} className="text-[#ff2e93]" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Kết quả Trắc nghiệm</h2>
          <p className="mt-2 text-sm text-[#626775]">
            Dựa trên {Object.keys(answers).length} câu trả lời của bạn
          </p>

          <div className="mt-8 space-y-4">
            {quizResults.map((r) => (
              <div key={r.label} className="text-left">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-[#94a3b8]">{r.label}</span>
                  <span className="font-semibold text-white">{r.value}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#1e1e30]">
                  <div
                    className={`h-full rounded-full ${r.color}`}
                    style={{ width: `${r.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-[#1e1e30] bg-[#111317] p-5 text-left">
            <h3 className="mb-2 font-semibold text-white">Phân tích nhanh</h3>
            <p className="text-sm leading-relaxed text-[#94a3b8]">
              Bạn là người cân bằng giữa nội tâm và ngoại hướng. Bạn đánh giá cao sự
              đồng cảm và thích những mối quan hệ có chiều sâu. Đôi khi bạn cần thời
              gian riêng tư để tái tạo năng lượng.
            </p>
          </div>

          <button
            onClick={handleReset}
            className="mt-6 rounded-xl bg-[#ff2e93] px-8 py-3 text-sm font-bold text-white hover:bg-[#ff2e93]/80"
          >
            Làm lại bài trắc nghiệm
          </button>
        </div>
      </div>
    );
  }

  const q = filteredQuestions[currentQ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#16162a] px-6 py-4">
        <h2 className="mb-1 text-lg font-bold text-white">Trắc nghiệm tính cách</h2>
        <p className="text-sm text-[#626775]">
          Khám phá bản thân qua những câu hỏi thú vị
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto border-b border-[#16162a] px-6 py-3 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setCurrentQ(0);
            }}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-[#ff2e93]/10 text-[#ff2e93]"
                : "bg-white/5 text-[#94a3b8] hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Progress */}
      <div className="border-b border-[#16162a] px-6 py-3">
        <div className="flex justify-between text-xs text-[#626775]">
          <span>
            Câu {currentQ + 1} / {filteredQuestions.length}
          </span>
          <span>{Math.round(((currentQ + 1) / filteredQuestions.length) * 100)}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-[#1e1e30]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-400 transition-all"
            style={{ width: `${((currentQ + 1) / filteredQuestions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-8">
        <h3 className="mb-8 text-center text-xl font-bold text-white">{q.question}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className="flex items-center gap-3 rounded-2xl border border-[#1e1e30] bg-[#111317] p-4 text-left transition-all hover:border-[#ff2e93]/40 hover:bg-[#161629]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                <Icon name={opt.icon} size={18} className="text-[#ff2e93]" />
              </div>
              <span className="text-sm font-medium text-white">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
