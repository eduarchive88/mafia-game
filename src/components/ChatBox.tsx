/**
 * 채팅 박스 컴포넌트
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  message: string;
  timestamp: number;
  isSystem: boolean;
}

interface ChatBoxProps {
  socket: Socket;
  roomCode: string;
  playerId: string;
}

export default function ChatBox({ socket, roomCode, playerId }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 수신
  useEffect(() => {
    socket?.on('message-received', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket?.off('message-received');
    };
  }, [socket]);

  const handleSendMessage = () => {
    if (inputValue.trim() === '') return;

    socket?.emit('send-message', { message: inputValue }, (response: any) => {
      if (response.success) {
        setInputValue('');
      }
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-sm">채팅 메시지가 없습니다</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${msg.isSystem ? 'text-gray-500 text-sm text-center' : ''}`}>
              {!msg.isSystem && (
                <div className="flex gap-2">
                  <span className="font-semibold text-purple-400">
                    {msg.playerId === playerId ? '나' : msg.nickname}
                  </span>
                  <span className="text-gray-300">{msg.message}</span>
                  <span className="text-gray-600 text-xs ml-auto">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {msg.isSystem && <p>{msg.message}</p>}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-gray-800 p-3">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요..."
            rows={2}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
          />
          <button
            onClick={handleSendMessage}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
