'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import RoomEntry from '@/components/RoomEntry';
import GamePlay from '@/components/GamePlay';

export default function Home() {
  const [joined, setJoined] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomState, setRoomState] = useState<any>(null);

  const handleJoinSuccess = (code: string, id: string, s: Socket, initialRoomState: any, isReconnect?: boolean) => {
    setRoomCode(code);
    setPlayerId(id);
    setSocket(s);
    if (initialRoomState) setRoomState(initialRoomState);

    // 방 상태 업데이트 리스너
    s.on('room-updated', (data) => {
      setRoomState(data);
    });

    s.on('state-changed', (data) => {
      setRoomState(data.roomState);
    });

    s.on('game-started', (data) => {
      setRoomState(data);
    });

    s.on('execution-completed', (data) => {
      setRoomState(data.roomState);
    });

    s.on('player-disconnected', (data) => {
      setRoomState(data.roomState);
    });

    s.on('player-reconnected', (data) => {
      setRoomState(data.roomState);
    });

    setJoined(true);
  };

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  if (!joined) {
    return <RoomEntry onJoinSuccess={handleJoinSuccess} />;
  }

  return (
    <GamePlay
      roomCode={roomCode}
      playerId={playerId}
      socket={socket!}
      roomState={roomState}
    />
  );
}
