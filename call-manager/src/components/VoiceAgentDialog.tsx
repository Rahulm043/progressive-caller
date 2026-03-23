'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    BarVisualizer,
    useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { X, MessageSquare, Power, Radio, RefreshCw } from 'lucide-react';
import { AgentRuntimeConfig } from '@/lib/agent-presets';
import styles from './VoiceAgentDialog.module.css';

interface VoiceAgentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    agentConfig: AgentRuntimeConfig;
}

export const VoiceAgentDialog = ({ isOpen, onClose, agentConfig }: VoiceAgentDialogProps) => {
    const [token, setToken] = useState<string | null>(null);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const fetchToken = async () => {
                setIsConnecting(true);
                try {
                    const resp = await fetch('/api/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            agentConfig,
                            displayName: 'Frontend Tester',
                        }),
                    });
                    const data = await resp.json();
                    if (data.token) {
                        setToken(data.token);
                        setRoomName(data.roomName || null);
                    } else {
                        throw new Error(data.error || 'Failed to get token');
                    }
                } catch (error) {
                    console.error('Failed to fetch token:', error);
                } finally {
                    setIsConnecting(false);
                }
            };
            fetchToken();
        } else {
            setToken(null);
            setRoomName(null);
        }
    }, [agentConfig, isOpen]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
                <header className={styles.header}>
                    <div className={styles.titleGroup}>
                        <div className={styles.liveIndicator} />
                        <div>
                            <h2>Real-time Simulation</h2>
                            <p style={{ margin: '0.25rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
                                {agentConfig.presetId} {roomName ? `· ${roomName}` : ''}
                            </p>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Terminate session">
                        <X size={20} />
                    </button>
                </header>

                <div className={styles.content}>
                    {token ? (
                        <LiveKitRoom
                            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
                            token={token}
                            connect={true}
                            video={false}
                            audio={true}
                            className={styles.roomContainer}
                        >
                            <div className={styles.visualizerSection}>
                                <div className={styles.agentAvatar}>
                                    <BarVisualizer className={styles.bars} />
                                </div>
                                <p className={styles.statusText}>Active & Listening</p>
                            </div>

                            <div className={styles.transcriptSection}>
                                <div className={styles.sectionHeader}>
                                    <Radio size={14} className={styles.liveIndicator} />
                                    <span>Intelligence Stream</span>
                                </div>
                                <TranscriptView />
                            </div>

                            <div className={styles.controls}>
                                <button className={styles.endCallBtn} onClick={onClose}>
                                    <Power size={18} />
                                    End Interaction
                                </button>
                            </div>

                            <RoomAudioRenderer />
                        </LiveKitRoom>
                    ) : (
                        <div className={styles.loading}>
                            <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                            <p>{isConnecting ? 'Establishing secure relay...' : 'Awaiting handshake...'}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TranscriptView = () => {
    const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
    const [connectionState, setConnectionState] = useState<ConnectionState | 'unknown'>('unknown');
    const scrollRef = useRef<HTMLDivElement>(null);
    const room = useRoomContext();

    useEffect(() => {
        if (!room) return;

        const handleConnectionStateChanged = (state: ConnectionState) => {
            setConnectionState(state);
        };

        const handleData = (payload: Uint8Array | string | ArrayBuffer) => {
            const decoder = new TextDecoder();
            const str =
                typeof payload === 'string'
                    ? payload
                    : payload instanceof ArrayBuffer
                        ? decoder.decode(new Uint8Array(payload))
                        : decoder.decode(payload);
            try {
                const data = JSON.parse(str);
                if (data.type === 'user_transcript') {
                    setMessages(prev => [...prev, { sender: 'User', text: data.text }]);
                } else if (data.type === 'agent_transcript') {
                    setMessages(prev => [...prev, { sender: 'Agent', text: data.text }]);
                }
            } catch {
                console.error('Failed to parse data:', str);
            }
        };

        room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
        room.on(RoomEvent.DataReceived, handleData);
        return () => {
            room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className={styles.transcriptList} ref={scrollRef}>
            {messages.length === 0 ? (
                <div className={styles.emptyTranscript}>
                    The transcript stream will appear once the conversation begins.
                </div>
            ) : (
                messages.map((m, i) => (
                    <div key={i} className={`${styles.bubble} ${styles[m.sender.toLowerCase()]}`}>
                        <div className={styles.senderLabel}>{m.sender === 'User' ? 'You' : 'Agent'}</div>
                        <div className={styles.text}>{m.text}</div>
                    </div>
                ))
            )}
        </div>
    );
};
