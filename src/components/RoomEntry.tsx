/**
 * 방 입장 컴포넌트
 */
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface RoomEntryProps {
  onJoinSuccess: (roomCode: string, playerId: string, socket: Socket, roomState: any, reconnected?: boolean) => void;
}

export default function RoomEntry({ onJoinSuccess }: RoomEntryProps) {
  const [nickname, setNickname] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reconnectInfo, setReconnectInfo] = useState<{ nickname: string; code: string } | null>(null);

  // 이전 세션 정보 복원 (클라이언트 전용)
  useEffect(() => {
    const saved = sessionStorage.getItem('mafia_session');
    if (saved) {
      try {
        const { nickname: n, code } = JSON.parse(saved);
        if (n && code) setReconnectInfo({ nickname: n, code });
      } catch (_) {}
    }
  }, []);

  const doJoin = (nick: string, code: string) => {
    setLoading(true);
    setError('');

    try {
      const socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        socket.emit(
          'join-room',
          { sessionCode: code.trim(), nickname: nick.trim() },
          (response: any) => {
            if (response.success) {
              // 세션 정보 저장
              sessionStorage.setItem('mafia_session', JSON.stringify({ nickname: nick.trim(), code: code.trim().toUpperCase() }));
              onJoinSuccess(response.roomCode, response.playerId, socket, response.roomState, response.reconnected);
            } else {
              setError(response.error || '입장 실패');
              socket.disconnect();
              setLoading(false);
            }
          }
        );
      });

      socket.on('connect_error', () => {
        setError('서버 연결 실패');
        setLoading(false);
      });
    } catch (err) {
      setError('오류가 발생했습니다');
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nickname.trim() || !sessionCode.trim()) {
      setError('닉네임과 세션 코드를 입력해주세요');
      return;
    }

    if (nickname.trim().length > 20) {
      setError('닉네임은 20자 이하여야 합니다');
      return;
    }

    doJoin(nickname.trim(), sessionCode.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">마피아</h1>
          <p className="text-gray-400 text-center mb-8">실시간 웹 기반 마피아 게임</p>

          {/* 이전 세션 재연결 배너 */}
          {reconnectInfo && (
            <div className="mb-6 p-3 bg-indigo-900 border border-indigo-600 rounded-lg">
              <p className="text-indigo-200 text-sm mb-2">
                ⚡ 이전 게임 세션이 감지됐습니다.
              </p>
              <p className="text-indigo-300 text-xs mb-3">
                닉네임 <span className="font-bold text-white">{reconnectInfo.nickname}</span> · 방 코드 <span className="font-bold text-white">{reconnectInfo.code}</span>
              </p>
              <button
                onClick={() => doJoin(reconnectInfo.nickname, reconnectInfo.code)}
                disabled={loading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded transition disabled:opacity-50"
              >
                {loading ? '재연결 중...' : '🔄 이어서 참가하기'}
              </button>
              <button
                onClick={() => { sessionStorage.removeItem('mafia_session'); setReconnectInfo(null); }}
                className="w-full mt-1 py-1 text-indigo-400 hover:text-indigo-200 text-xs transition"
              >
                무시하고 새로 입장
              </button>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">닉네임</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="최대 20자"
                maxLength={20}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">세션 코드</label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                placeholder="예: ABC123"
                maxLength={10}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            {error && <div className="p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '입장 중...' : '입장하기'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-800 rounded border border-gray-700">
            <p className="text-xs text-gray-400">
              <span className="font-semibold">최소 인원:</span> 4명<br />
              <span className="font-semibold">역할 배정:</span> 자동<br />
              <span className="font-semibold">게임 시간:</span> 약 30-60분
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
