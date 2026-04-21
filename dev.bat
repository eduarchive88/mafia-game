@echo off
REM 마피아 게임 개발 시작 스크립트 (Windows)

echo.
echo 🎮 마피아 게임 개발 환경 시작
echo ================================

REM Node.js 확인
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js가 설치되지 않았습니다
    exit /b 1
)

echo ✅ Node.js 버전: 
node --version

echo ✅ npm 버전:
npm --version

REM 의존성 설치 여부 확인
if not exist "node_modules" (
    echo.
    echo 📦 의존성 설치 중...
    call npm install
)

echo.
echo 🚀 개발 서버 시작...
echo ================================
echo Next.js App: http://localhost:3000
echo Socket.io Server: http://localhost:3001
echo.
echo Ctrl+C로 종료
echo ================================
echo.

call npm run dev:all

pause
