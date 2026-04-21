/**
 * Socket.io 클라이언트 훅
 */
import { useEffect, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const useSocket = () => {
  useEffect(() => {
    if (!socket) {
      socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });
    }

    return () => {
      // 필요시 정리
    };
  }, []);

  return socket;
};

export const useGameRoom = (roomCode: string, playerId: string) => {
  const [roomState, setRoomState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    // 방 상태 업데이트
    const handleRoomUpdated = (data: any) => {
      setRoomState(data);
    };

    const handleStateChanged = (data: any) => {
      setRoomState(data.roomState);
    };

    const handleGameStarted = (data: any) => {
      setRoomState(data);
    };

    socket.on('room-updated', handleRoomUpdated);
    socket.on('state-changed', handleStateChanged);
    socket.on('game-started', handleGameStarted);

    setLoading(false);

    return () => {
      socket?.off('room-updated', handleRoomUpdated);
      socket?.off('state-changed', handleStateChanged);
      socket?.off('game-started', handleGameStarted);
    };
  }, [socket]);

  return { roomState, loading, socket };
};
