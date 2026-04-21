#!/bin/bash
# 마피아 게임 개발 시작 스크립트

echo "🎮 마피아 게임 개발 환경 시작"
echo "================================"

# 시스템 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다"
    exit 1
fi

echo "✅ Node.js 버전: $(node --version)"
echo "✅ npm 버전: $(npm --version)"

# 의존성 설치 여부 확인
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 의존성 설치 중..."
    npm install
fi

echo ""
echo "🚀 개발 서버 시작..."
echo "================================"
echo "Next.js App: http://localhost:3000"
echo "Socket.io Server: http://localhost:3001"
echo ""
echo "Ctrl+C로 종료"
echo "================================"

npm run dev:all
