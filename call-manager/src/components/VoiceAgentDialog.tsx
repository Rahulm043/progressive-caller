'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    BarVisualizer,
    useTracks,
    TrackReferenceOrPlaceholder,
    useTrackTranscription,
    useRoomContext,
} from '@livekit/components-react';
import { Track, RoomEvent } from 'livekit-client';
import { X, Mic, MicOff, MessageSquare, Power } from 'lucide-react';
import styles from './VoiceAgentDialog.module.css';

interface VoiceAgentDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const VoiceAgentDialog = ({ isOpen, onClose }: VoiceAgentDialogProps) => {
    const [token, setToken] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const roomName = 'web_testing_room';

    useEffect(() => {
        if (isOpen) {
            const fetchToken = async () => {
                setIsConnecting(true);
                try {
                    // Unique room per user session to avoid crosstalk
                    const roomName = `web-test-${Math.floor(Math.random() * 10000)}`;
                    const resp = await fetch(`/api/token?room=${roomName}&publish=true&dispatch=true`);
                    const data = await resp.json();
                    if (data.token) {
                        setToken(data.token);
                    } else {
                        throw new Error(data.error || 'Failed to get token');
                    }
                } catch (e) {
                    console.error('Failed to fetch token:', e);
                } finally {
                    setIsConnecting(false);
                }
            };
            fetchToken();
        } else {
            setToken(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.dialog}>
                <header className={styles.header}>
                    <div className={styles.titleGroup}>
                        <div className={styles.liveIndicator} />
                        <h2>Talk to the Agent</h2>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
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
                                <p className={styles.statusText}>Agent is listening...</p>
                            </div>

                            <div className={styles.transcriptSection}>
                                <div className={styles.sectionHeader}>
                                    <MessageSquare size={16} />
                                    <span>Real-time Transcript</span>
                                </div>
                                <TranscriptView />
                            </div>

                            <div className={styles.controls}>
                                <button className={styles.endCallBtn} onClick={onClose}>
                                    <Power size={20} /> End Interaction
                                </button>
                            </div>

                            <RoomAudioRenderer />
                        </LiveKitRoom>
                    ) : (
                        <div className={styles.loading}>
                            {isConnecting ? 'Initializing secure session...' : 'Waiting for connection...'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TranscriptView = () => {
    const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const room = useRoomContext();

    useEffect(() => {
        if (!room) return;
        const handleData = (payload: Uint8Array) => {
            const decoder = new TextDecoder();
            const str = decoder.decode(payload);
            try {
                const data = JSON.parse(str);
                if (data.type === 'user_transcript') {
                    setMessages(prev => [...prev, { sender: 'User', text: data.text }]);
                } else if (data.type === 'agent_transcript') {
                    setMessages(prev => [...prev, { sender: 'Agent', text: data.text }]);
                }
            } catch (e) {
                console.error('Failed to parse data:', str);
            }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => {
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
                    Speak to start the conversation.
                </div>
            ) : (
                messages.map((m, i) => (
                    <div key={i} className={`${styles.bubble} ${styles[m.sender.toLowerCase()]}`}>
                        <div className={styles.senderLabel}>{m.sender}</div>
                        <div className={styles.text}>{m.text}</div>
                    </div>
                ))
            )}
        </div>
    );
};
