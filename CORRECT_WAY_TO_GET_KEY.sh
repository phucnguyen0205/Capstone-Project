#!/bin/bash

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  QUAN TRỌNG: Đang tạo sai chỗ!                               ║
╚══════════════════════════════════════════════════════════════════╝

❌ ĐANG LÀM: Tạo key tại Google Cloud Console
   → console.cloud.google.com/apis/credentials
   → Key format: AQ.xxx
   → ❌ KHÔNG hoạt động với Gemini API

✅ CẦN LÀM: Tạo key tại Google AI Studio
   → https://aistudio.google.com/app/apikey
   → Key format: AIzaSyXXXXXXXXX...
   → ✅ Hoạt động với Gemini API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 HƯỚNG DẪN CHI TIẾT:

Bước 1: ĐÓNG tab Google Cloud Console hiện tại

Bước 2: MỞ tab mới và vào:
   🔗 https://aistudio.google.com/app/apikey
   (KHÔNG phải console.cloud.google.com!)

Bước 3: Đăng nhập cùng Google Account

Bước 4: Tại trang AI Studio, click "Get API key" hoặc "Create API key"

Bước 5: Chọn project:
   • "Create API key in new project" (tạo project mới)
   • HOẶC chọn project có sẵn từ dropdown

Bước 6: Copy key được tạo (format: AIzaSyXXXXXXXXX...)

Bước 7: Paste vào .env.local:
   GEMINI_API_KEY=AIzaSy_YOUR_NEW_KEY_HERE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 Screenshot so sánh:

Cloud Console (SAI):
   URL: console.cloud.google.com/apis/credentials
   Trang: "Credentials" → "Create Credentials" → "API key"
   Key:   AQ.xxxxxxxxxxxxxxxxxxxxxxxxx
   Dùng:  ❌ Vertex AI, Maps, Cloud APIs khác
   
AI Studio (ĐÚNG):
   URL: aistudio.google.com/app/apikey
   Trang: "Get API key" button (nút to ở giữa)
   Key:   AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Dùng:  ✅ Gemini API, Generative Language API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 TẠI SAO LẠI KHÁC?

Google có 2 hệ thống API riêng biệt:

1. Google Cloud Platform APIs
   - Dùng Cloud Console (console.cloud.google.com)
   - Key format: AQ.xxx
   - Dành cho: Maps, Compute Engine, Cloud Storage, etc.

2. Google AI/ML APIs (Gemini, PaLM, etc.)
   - Dùng AI Studio (aistudio.google.com)
   - Key format: AIzaSy...
   - Dành cho: Gemini, Generative AI, ML models

→ Gemini CHỈ chấp nhận key từ AI Studio!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 SAU KHI LẤY KEY ĐÚNG:

1. Paste vào .env.local
2. Restart server: npm run dev
3. Test: node test-moderation.js
4. Xem kết quả: ✅ PASS với Gemini AI!

EOF
