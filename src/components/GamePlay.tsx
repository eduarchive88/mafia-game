/**
 * 게임 플레이 컴포넌트
 */
'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import ChatBox from './ChatBox';

interface GamePlayProps {
  roomCode: string;
  playerId: string;
  socket: Socket;
  roomState: any;
}

export default function GamePlay({ roomCode, playerId, socket, roomState }: GamePlayProps) {
  const [players, setPlayers] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string>('?');
  const [gameState, setGameState] = useState<string>('waiting');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [nightStatus, setNightStatus] = useState<{ mafia: boolean; doctor: boolean; police: boolean }>(
    { mafia: false, doctor: false, police: false }
  );
  const [policeResult, setPoliceResult] = useState<{ isMafia: boolean } | null>(null);
  const [teammates, setTeammates] = useState<{ id: string; nickname: string }[]>([]);
  const [connectionToast, setConnectionToast] = useState<{ message: string; type: 'dc' | 'rc' } | null>(null);
  const [nightResult, setNightResult] = useState<{ type: 'killed'; victimName: string } | { type: 'saved' } | { type: 'nobody' } | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    voteCounts: { playerId: string; nickname: string; votes: number }[];
    executedNickname: string | null;
    executedRole: string | null;
  } | null>(null);

  // 역할 완료 사운드 (Web Audio API)
  const playRoleSound = (role: string) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      };
      if (role === 'mafia') {
        tone(200, 0, 0.35, 'sawtooth');
        tone(160, 0.4, 0.5, 'sawtooth');
      } else if (role === 'doctor') {
        tone(523, 0, 0.15);
        tone(659, 0.2, 0.3);
      } else if (role === 'police') {
        tone(440, 0, 0.1);
        tone(440, 0.18, 0.1);
        tone(550, 0.38, 0.3);
      }
      setTimeout(() => ctx.close(), 2500);
    } catch (_) {}
  };

  useEffect(() => {
    if (roomState) {
      setPlayers(Object.values(roomState.players || {}));
      setGameState(roomState.state);
      if (roomState.victoryTeam) {
        setWinner(roomState.victoryTeam);
      }
      // 재연결: roomState에서 내 역할 복원
      const me = roomState.players?.[playerId];
      if (roomState.state === 'waiting') {
        setMyRole('?');
        setTeammates([]);
      } else if (me?.role && me.role !== '?') {
        setMyRole(me.role);
      }
    }
  }, [roomState]);

  // 역할 할당 이벤트
  useEffect(() => {
    socket?.on('role-assigned', (data) => {
      setMyRole(data.role);
      setTeammates(data.teammates || []);
    });

    return () => {
      socket?.off('role-assigned');
    };
  }, [socket]);

  // 게임 시작 이벤트
  useEffect(() => {
    socket?.on('game-started', (data: any) => {
      setPlayers(Object.values(data.players || {}));
      setGameState(data.state);
    });

    return () => {
      socket?.off('game-started');
    };
  }, [socket]);

  // 상태 변경 이벤트
  useEffect(() => {
    socket?.on('state-changed', (data: any) => {
      setGameState(data.state);
      setPlayers(Object.values(data.roomState?.players || {}));
      setSelectedTarget(null);
      setHasVoted(false);
      // 밤/낮 전환 시 밤 상태 초기화
      setNightStatus({ mafia: false, doctor: false, police: false });
      setPoliceResult(null);
      // 낮→밤: 밤 결과 배너 초기화 (처형 결과는 밤 시작 시 보여야 하므로 유지)
      if (data.state === 'night') {
        setNightResult(null);
      }
      // 밤→낮: 처형 결과 초기화 (새 낮이 시작되므로)
      if (data.state === 'day') {
        setExecutionResult(null);
      }
    });

    return () => {
      socket?.off('state-changed');
    };
  }, [socket]);

  // 역할 완료 이벤트 (밤 단계)
  useEffect(() => {
    socket?.on('role-completed', (data: { role: string; targetNickname?: string }) => {
      setNightStatus(prev => ({ ...prev, [data.role]: true }));
      playRoleSound(data.role);
    });
    return () => {
      socket?.off('role-completed');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // 밤 결과 공지 이벤트
  useEffect(() => {
    socket?.on('night-result', (data: { type: string; victimName?: string }) => {
      setNightResult(data as any);
    });
    // 밤 시작 시 처형 결과 재수신 (재연결 플레이어 포함)
    socket?.on('execution-result-night', (data: any) => {
      setExecutionResult(data);
    });
    return () => {
      socket?.off('night-result');
      socket?.off('execution-result-night');
    };
  }, [socket]);

  // 단절/재연결 알림
  useEffect(() => {
    const showToast = (msg: string, type: 'dc' | 'rc') => {
      setConnectionToast({ message: msg, type });
      setTimeout(() => setConnectionToast(null), 4000);
    };

    socket?.on('player-disconnected', (data: any) => {
      setPlayers(Object.values(data.roomState?.players || {}));
      showToast(`⚡ ${data.nickname} 님의 연결이 끊겼습니다`, 'dc');
    });
    socket?.on('player-reconnected', (data: any) => {
      setPlayers(Object.values(data.roomState?.players || {}));
      showToast(`✅ ${data.nickname} 님이 재연결됐습니다`, 'rc');
    });
    return () => {
      socket?.off('player-disconnected');
      socket?.off('player-reconnected');
    };
  }, [socket]);

  // 처형 완료 이벤트
  useEffect(() => {
    socket?.on('execution-completed', (data: any) => {
      setPlayers(Object.values(data.roomState?.players || {}));
      if (data.victoryTeam) {
        setWinner(data.victoryTeam === 'mafia' ? '마피아' : '시민');
      }
      if (data.executionResult) {
        setExecutionResult(data.executionResult);
      }
    });

    return () => {
      socket?.off('execution-completed');
    };
  }, [socket]);

  const handleNightVote = (targetId: string) => {
    if (gameState !== 'night' || myRole !== 'mafia') return;
    setSelectedTarget(targetId);
    socket?.emit('night-vote', { targetId }, (response: any) => {
      if (response.success) {
        setHasVoted(true);
      }
    });
  };

  const handleDoctorSave = (targetId: string) => {
    if (gameState !== 'night' || myRole !== 'doctor') return;
    setSelectedTarget(targetId);
    socket?.emit('doctor-save', { targetId }, (response: any) => {
      if (response.success) {
        setHasVoted(true);
      }
    });
  };

  const handlePoliceCheck = (targetId: string) => {
    if (gameState !== 'night' || myRole !== 'police') return;
    setSelectedTarget(targetId);
    socket?.emit('police-check', { targetId }, (response: any) => {
      if (response.success) {
        setHasVoted(true);
        setPoliceResult({ isMafia: response.isMafia });
      }
    });
  };

  const handleDayVote = (targetId: string | null) => {
    if (gameState !== 'vote') return;
    setSelectedTarget(targetId);
    socket?.emit('day-vote', { targetId }, (response: any) => {
      if (response.success) {
        setHasVoted(true);
      }
    });
  };

  const isHost = roomState?.hostId === playerId;
  const myPlayer = players.find((p) => p.id === playerId);
  const isAlive = myPlayer?.alive;

  // 인원수별 역할 배분 계산 (서버 assignRoles 로직과 동일)
  const getRoleDistribution = (count: number) => {
    if (count < 4) return null;
    let mafia, police, doctor;
    if (count <= 5)       { mafia = 1; police = 1; doctor = 1; }
    else if (count <= 8)  { mafia = 2; police = 1; doctor = 1; }
    else if (count <= 11) { mafia = 3; police = 1; doctor = 1; }
    else if (count <= 14) { mafia = 4; police = 2; doctor = 1; }
    else                  { mafia = 5; police = 2; doctor = 2; }
    return { mafia, police, doctor, citizen: count - mafia - police - doctor };
  };

  const aliveCount = players.filter(p => p.alive).length;
  const waitingCount = players.length;
  const rolePreview = gameState === 'waiting' ? getRoleDistribution(waitingCount) : null;

  // 낮/밤 테마 클래스
  const isNight = gameState === 'night';
  const isDay = gameState === 'day' || gameState === 'vote' || gameState === 'execution';

  // 채팅 없는 간단한 레이아웃
  return (
    <div className={`min-h-screen text-white p-4 transition-colors duration-700 ${
      isNight ? 'bg-gradient-to-b from-slate-950 via-[#0a0a2e] to-slate-950' :
      isDay   ? 'bg-gradient-to-b from-gray-900 via-amber-950 to-gray-900' :
      'bg-gray-950'
    }`}>
      <div className="max-w-6xl mx-auto">
        {/* 연결 상태 토스트 */}
        {connectionToast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-semibold transition-all ${
            connectionToast.type === 'dc'
              ? 'bg-orange-900 border border-orange-600 text-orange-200'
              : 'bg-green-900 border border-green-600 text-green-200'
          }`}>
            {connectionToast.message}
          </div>
        )}

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className={`text-3xl font-bold transition-colors duration-700 ${
              isNight ? 'text-indigo-200' : isDay ? 'text-amber-200' : 'text-white'
            }`}>
              {isNight ? '🌙 마피아' : isDay ? '☀️ 마피아' : '마피아'}
            </h1>
            <p className={`transition-colors duration-700 ${
              isNight ? 'text-indigo-400' : isDay ? 'text-amber-400' : 'text-gray-400'
            }`}>방 코드: {roomCode}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{myRole === '?' ? '역할: ?' : `역할: ${myRole}`}</p>
            <p className={`${isAlive ? 'text-green-400' : 'text-red-400'}`}>
              {isAlive ? '생존' : '사망'}
            </p>
            {teammates.length > 0 && (
              <p className={`text-xs mt-1 ${
                myRole === 'mafia' ? 'text-red-400' :
                myRole === 'doctor' ? 'text-cyan-400' :
                myRole === 'police' ? 'text-yellow-400' : 'text-gray-400'
              }`}>
                팀원: {teammates.map(t => t.nickname).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* 게임 상태 표시 */}
        <div className={`border rounded-lg p-4 mb-6 transition-colors duration-700 ${
          isNight ? 'bg-indigo-950/70 border-indigo-700 shadow-lg shadow-indigo-950' :
          isDay   ? 'bg-amber-950/70 border-amber-700 shadow-lg shadow-amber-950' :
          'bg-gray-900 border-gray-800'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <p className={`text-sm transition-colors duration-700 ${
                isNight ? 'text-indigo-400' : isDay ? 'text-amber-400' : 'text-gray-400'
              }`}>라운드 {roomState?.round}</p>
              <p className={`text-2xl font-bold transition-colors duration-700 ${
                isNight ? 'text-indigo-100' : isDay ? 'text-amber-100' : ''
              }`}>
                {gameState === 'waiting' && '게임 대기 중'}
                {gameState === 'day' && '☀️ 낮'}
                {gameState === 'night' && '🌙 밤'}
                {gameState === 'vote' && '⚖️ 투표'}
                {gameState === 'execution' && '💀 처형'}
                {gameState === 'ended' && '게임 종료'}
              </p>
            </div>
            {isHost && gameState !== 'ended' && (
              <div className="flex flex-wrap gap-2">
                {/* 낮: 투표 시작 버튼 */}
                {gameState === 'day' && (
                  <button
                    onClick={() => socket?.emit('transition-state', { targetState: 'vote' }, () => {})}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded transition font-semibold"
                  >
                    🗳️ 투표 시작
                  </button>
                )}
                {/* 투표 중 & 처형 전: 처형 실행만 */}
                {gameState === 'vote' && !executionResult && (
                  <button
                    onClick={() => socket?.emit('execute-vote', (r: any) => { if (!r?.success) {} })}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded transition font-semibold"
                  >
                    ⚖️ 처형 실행
                  </button>
                )}
                {/* 처형 완료 후: 밤으로 */}
                {gameState === 'vote' && executionResult && (
                  <button
                    onClick={() => socket?.emit('transition-state', { targetState: 'night' }, () => {})}
                    className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded transition font-semibold"
                  >
                    🌙 밤으로
                  </button>
                )}
                {/* 밤: 낮으로 */}
                {gameState === 'night' && (
                  <button
                    onClick={() => socket?.emit('transition-state', { targetState: 'day' }, () => {})}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded transition font-semibold"
                  >
                    ☀️ 낮으로
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {winner && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4 mb-6 text-center">
            <p className="text-2xl font-bold">{winner} 승리!</p>
          </div>
        )}

        {/* 낮 처형 결과 공지 배너 (처형 후 ~ 다음 낮 전까지 표시: vote 상태 + 밤 시작 시) */}
        {executionResult && gameState !== 'waiting' && (
          <div className={`rounded-lg p-5 mb-6 border ${
            executionResult.executedRole === 'mafia'
              ? 'bg-green-950 border-green-700'
              : executionResult.executedNickname
                ? 'bg-red-950 border-red-700'
                : 'bg-gray-900 border-gray-700'
          }`}>
            {/* 처형 결과 메시지 */}
            <p className="text-center text-xl font-bold mb-4">
              {executionResult.executedRole === 'mafia' ? (
                <span className="text-green-300">
                  ⚖️ 마피아 <span className="underline">{executionResult.executedNickname}</span>이(가) 처형됐습니다!<br/>
                  <span className="text-base font-normal text-green-400">시민팀의 승리가 다가옵니다!</span>
                </span>
              ) : executionResult.executedNickname ? (
                <span className="text-red-300">
                  ⚖️ 무고한 시민 <span className="underline">{executionResult.executedNickname}</span>이(가) 처형됐습니다.<br/>
                  <span className="text-base font-normal text-red-400">마피아의 음모가 계속됩니다...</span>
                </span>
              ) : (
                <span className="text-gray-400">⚖️ 동점으로 아무도 처형되지 않았습니다.</span>
              )}
            </p>

            {/* 정체 공개 */}
            {executionResult.executedNickname && executionResult.executedRole && (
              <p className="text-center text-sm mb-4">
                <span className="bg-gray-800 rounded px-3 py-1">
                  {executionResult.executedNickname}의 정체:{' '}
                  <span className={`font-bold ${
                    executionResult.executedRole === 'mafia' ? 'text-red-400' :
                    executionResult.executedRole === 'doctor' ? 'text-cyan-400' :
                    executionResult.executedRole === 'police' ? 'text-yellow-400' :
                    'text-blue-300'
                  }`}>
                    {executionResult.executedRole === 'mafia' ? '🔴 마피아' :
                     executionResult.executedRole === 'doctor' ? '💊 의사' :
                     executionResult.executedRole === 'police' ? '🔍 경찰' :
                     '👤 시민'}
                  </span>
                </span>
              </p>
            )}

            {/* 투표 현황 */}
            {executionResult.voteCounts.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 text-center mb-2">투표 결과</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {executionResult.voteCounts.map((v) => (
                    <span
                      key={v.playerId}
                      className={`px-3 py-1 rounded-full text-sm font-semibold border ${
                        v.playerId === executionResult.voteCounts[0]?.playerId
                          ? 'bg-red-900 border-red-600 text-red-200'
                          : 'bg-gray-800 border-gray-600 text-gray-300'
                      }`}
                    >
                      {v.nickname} {v.votes}표
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 밤 결과 공지 배너 (낮 + 투표 단계에서 표시) */}
        {nightResult && (gameState === 'day' || gameState === 'vote') && (
          <div className={`rounded-lg p-4 mb-6 text-center font-bold text-lg border transition-all ${
            nightResult.type === 'killed'
              ? 'bg-red-950 border-red-700 text-red-200'
              : nightResult.type === 'saved'
                ? 'bg-cyan-950 border-cyan-700 text-cyan-200'
                : 'bg-gray-900 border-gray-700 text-gray-400'
          }`}>
            {nightResult.type === 'killed' && (
              <>☠️ 무고한 시민 <span className="underline">{(nightResult as any).victimName}</span>이(가) 죽었습니다.</>
            )}
            {nightResult.type === 'saved' && '💊 의사가 시민을 살렸습니다!'}
            {nightResult.type === 'nobody' && '🌅 조용한 밤이었습니다. 아무도 죽지 않았습니다.'}
          </div>
        )}

        {/* 낮 토론 / 투표 안내 패널 */}
        {(gameState === 'day' || gameState === 'vote') && !winner && (
          <div className="bg-amber-950/60 border border-amber-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{gameState === 'vote' ? '🗳️' : '☀️'}</span>
              <h3 className="text-lg font-bold text-amber-300">
                {gameState === 'day' ? '낮 — 토론 시간' : '낮 — 투표 시간'}
              </h3>
            </div>
            {gameState === 'day' && (
              <p className="text-gray-300 text-sm">마피아를 찾아 토론하세요. 방장이 <span className="text-amber-300 font-semibold">🗳️ 투표 시작</span>을 누르면 투표가 시작됩니다.</p>
            )}
            {gameState === 'vote' && (
              <div>
                {isAlive && !hasVoted && (
                  <p className="text-gray-300 text-sm">아래 생존 플레이어 목록에서 <span className="text-red-300 font-semibold">처형할 대상</span>을 선택하세요.</p>
                )}
                {isAlive && hasVoted && (
                  <p className="text-green-400 text-sm">✅ 투표 완료! 다른 플레이어의 투표를 기다리는 중...</p>
                )}
                {!isAlive && (
                  <p className="text-gray-500 text-sm">☠️ 사망한 상태입니다. 결과를 기다리세요.</p>
                )}
                {isHost && (
                  <p className="text-amber-400 text-sm mt-2">📢 방장: 투표가 완료되면 <span className="font-semibold">⚖️ 처형 실행</span>을 눌러 결과를 공개하세요.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 밤 단계 역할 안내 패널 */}
        {gameState === 'night' && (
          <div className="bg-indigo-950 border border-indigo-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🌙</span>
              <h3 className="text-lg font-bold text-indigo-300">밤 단계 — 모든 시민은 눈을 감으세요</h3>
            </div>

            {isAlive ? (
              <div>
                {myRole === 'mafia' && (
                  <div className="space-y-1">
                    <p className="text-red-400 font-semibold">🔪 당신은 마피아입니다.</p>
                    {teammates.length > 0 && (
                      <p className="text-red-300 text-xs bg-red-950/50 border border-red-800 rounded px-2 py-1">
                        👥 같은 마피아: {teammates.map(t => t.nickname).join(', ')}
                      </p>
                    )}
                    {!hasVoted
                      ? <p className="text-gray-300 text-sm">아래 생존 플레이어 목록에서 제거할 대상을 선택하세요. 마피아가 여럿이면 가장 많은 표를 받은 대상이 처치됩니다.</p>
                      : <p className="text-green-400 text-sm">✅ 투표 완료! 다른 마피아의 투표를 기다리는 중...</p>
                    }
                  </div>
                )}
                {myRole === 'doctor' && (
                  <div className="space-y-1">
                    <p className="text-cyan-400 font-semibold">💊 당신은 의사입니다.</p>
                    {teammates.length > 0 && (
                      <p className="text-cyan-300 text-xs bg-cyan-950/50 border border-cyan-800 rounded px-2 py-1">
                        👥 같은 의사: {teammates.map(t => t.nickname).join(', ')}
                      </p>
                    )}
                    {!hasVoted
                      ? <p className="text-gray-300 text-sm">아래 생존 플레이어 목록에서 오늘 밤 치료할 대상을 선택하세요. 마피아의 타겟과 일치하면 사망을 막을 수 있습니다.</p>
                      : <p className="text-green-400 text-sm">✅ 치료 완료! 결과를 기다리는 중...</p>
                    }
                  </div>
                )}
                {myRole === 'police' && (
                  <div className="space-y-1">
                    <p className="text-yellow-400 font-semibold">🔍 당신은 경찰입니다.</p>
                    {teammates.length > 0 && (
                      <p className="text-yellow-300 text-xs bg-yellow-950/50 border border-yellow-800 rounded px-2 py-1">
                        👥 같은 경찰: {teammates.map(t => t.nickname).join(', ')}
                      </p>
                    )}
                    {!hasVoted
                      ? <p className="text-gray-300 text-sm">아래 생존 플레이어 목록에서 마피아 여부를 조사할 대상을 선택하세요.</p>
                      : (
                        <div>
                          <p className="text-green-400 text-sm">✅ 수사 완료!</p>
                          {policeResult !== null && (
                            <p className={`mt-1 font-semibold text-sm ${policeResult.isMafia ? 'text-red-400' : 'text-blue-400'}`}>
                              조사 결과: {policeResult.isMafia ? '🔴 마피아입니다!' : '🔵 마피아가 아닙니다'}
                            </p>
                          )}
                        </div>
                      )
                    }
                  </div>
                )}
                {myRole === 'citizen' && (
                  <div>
                    <p className="text-gray-400">👤 당신은 시민입니다.</p>
                    <p className="text-gray-500 text-sm mt-1">눈을 감고 밤이 끝날 때까지 기다리세요.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">☠️ 사망한 상태입니다. 결과를 기다리세요.</p>
            )}

            {/* 방장 전용: 역할 완료 현황 */}
            {isHost && (
              <div className="mt-4 pt-4 border-t border-indigo-800">
                <p className="text-sm font-semibold text-indigo-300 mb-2">🎮 역할 행동 완료 현황</p>
                <div className="flex gap-6 text-sm">
                  <span className={nightStatus.mafia ? 'text-green-400' : 'text-gray-500'}>
                    {nightStatus.mafia ? '✅' : '⏳'} 마피아
                  </span>
                  <span className={nightStatus.doctor ? 'text-green-400' : 'text-gray-500'}>
                    {nightStatus.doctor ? '✅' : '⏳'} 의사
                  </span>
                  <span className={nightStatus.police ? 'text-green-400' : 'text-gray-500'}>
                    {nightStatus.police ? '✅' : '⏳'} 경찰
                  </span>
                </div>
                {nightStatus.mafia && nightStatus.doctor && nightStatus.police && (
                  <p className="text-green-400 text-sm mt-3 font-semibold animate-pulse">
                    🌅 모든 역할이 행동을 마쳤습니다! 낮으로 전환하세요.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 플레이어 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h2 className={`text-xl font-bold mb-4 transition-colors duration-700 ${
              isNight ? 'text-indigo-300' : isDay ? 'text-amber-300' : ''
            }`}>생존 플레이어</h2>
            <div className="space-y-2">
              {players
                .filter((p) => p.alive)
                .map((player) => (
                  <div
                    key={player.id}
                    className={`p-3 border rounded cursor-pointer transition duration-300 ${
                      selectedTarget === player.id
                        ? 'border-purple-500 bg-purple-900/40'
                        : isNight
                          ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700'
                          : isDay
                            ? 'bg-stone-800/80 border-stone-600 hover:bg-stone-700'
                            : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                    }`}
                    onClick={() => {
                      if (gameState === 'night' && myRole === 'mafia' && isAlive && !hasVoted) {
                        handleNightVote(player.id);
                      } else if (gameState === 'night' && myRole === 'doctor' && isAlive && !hasVoted) {
                        handleDoctorSave(player.id);
                      } else if (gameState === 'night' && myRole === 'police' && isAlive && !hasVoted) {
                        handlePoliceCheck(player.id);
                      } else if (gameState === 'vote' && isAlive && !hasVoted) {
                        handleDayVote(player.id);
                      }
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`font-semibold ${player.disconnected ? 'text-gray-400' : ''}`}>
                        {player.nickname}
                        {player.disconnected && <span className="ml-2 text-xs text-orange-400">(연결 끊김)</span>}
                      </span>
                      <span className="text-sm text-gray-400">{player.id === playerId ? '(나)' : player.role}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* 죽은 플레이어 */}
          <div>
            <h2 className="text-xl font-bold mb-4">사망 플레이어</h2>
            <div className="space-y-2">
              {players
                .filter((p) => !p.alive)
                .map((player) => (
                  <div key={player.id} className="p-3 bg-red-900 border border-red-700 rounded opacity-60">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold line-through">{player.nickname}</span>
                      <span className="text-sm text-red-300">{player.role}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* 행동 버튼 */}
        {gameState === 'waiting' && isHost && (
          <button
            onClick={() => socket?.emit('start-game', () => {})}
            disabled={players.length < 4}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded transition"
          >
            {players.length < 4 ? `게임 시작 (${players.length}/4명 — 최소 4명 필요)` : `게임 시작 (${players.length}명)`}
          </button>
        )}

        {gameState === 'vote' && isHost && (
          <button
            onClick={() => socket?.emit('execute-vote', () => {})}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition"
          >
            투표 종료 및 처형
          </button>
        )}

        {/* 대기실 — 역할 배분 미리보기 + 게임 규칙 */}
        {gameState === 'waiting' && (
          <div className="mt-6 space-y-4">
            {/* 역할 배분 미리보기 */}
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white">현재 인원으로 게임 시작 시 역할 배분</h3>
                <span className="text-xs text-gray-400">최대 16명</span>
              </div>
              {rolePreview ? (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-red-950 border border-red-800 rounded p-2">
                    <p className="text-red-400 font-bold text-xl">{rolePreview.mafia}</p>
                    <p className="text-red-300 text-xs mt-1">🔪 마피아</p>
                  </div>
                  <div className="bg-yellow-950 border border-yellow-800 rounded p-2">
                    <p className="text-yellow-400 font-bold text-xl">{rolePreview.police}</p>
                    <p className="text-yellow-300 text-xs mt-1">🔍 경찰</p>
                  </div>
                  <div className="bg-cyan-950 border border-cyan-800 rounded p-2">
                    <p className="text-cyan-400 font-bold text-xl">{rolePreview.doctor}</p>
                    <p className="text-cyan-300 text-xs mt-1">💊 의사</p>
                  </div>
                  <div className="bg-gray-800 border border-gray-600 rounded p-2">
                    <p className="text-gray-300 font-bold text-xl">{rolePreview.citizen}</p>
                    <p className="text-gray-400 text-xs mt-1">👤 시민</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-2">
                  4명 이상이 모여야 게임을 시작할 수 있습니다 ({players.length}/4명)
                </p>
              )}
              {/* 인원별 역할 배분 표 */}
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition">인원별 역할 배분 보기 ▾</summary>
                <table className="w-full mt-2 text-xs text-center border-collapse">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="py-1">인원</th>
                      <th className="py-1 text-red-400">🔪 마피아</th>
                      <th className="py-1 text-yellow-400">🔍 경찰</th>
                      <th className="py-1 text-cyan-400">💊 의사</th>
                      <th className="py-1 text-gray-400">👤 시민</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {[4,5,6,7,8,9,10,11,12,13,14,15,16].map(n => {
                      const d = getRoleDistribution(n)!;
                      const isCurrent = n === waitingCount;
                      return (
                        <tr key={n} className={`border-b border-gray-800 ${isCurrent ? 'bg-indigo-900/40 font-semibold' : ''}`}>
                          <td className="py-1">{n}명{isCurrent ? ' ◀' : ''}</td>
                          <td className="py-1 text-red-300">{d.mafia}</td>
                          <td className="py-1 text-yellow-300">{d.police}</td>
                          <td className="py-1 text-cyan-300">{d.doctor}</td>
                          <td className="py-1">{d.citizen}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            </div>

            {/* 게임 규칙 */}
            <div className="p-4 bg-gray-900 border border-gray-800 rounded">
              <h3 className="font-bold mb-2">게임 규칙</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• 4인 이상, 최대 16명 시작 가능</li>
                <li>• 마피아: 밤에 시민 지목</li>
                <li>• 의사: 밤에 플레이어 치료</li>
                <li>• 경찰: 밤에 플레이어 조회</li>
                <li>• 낮: 전원 투표로 누군가 처형</li>
                <li>• 마피아 수 ≥ 시민 수 = 마피아 승리</li>
                <li>• 마피아 전멸 = 시민 승리</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
