'use client';

import React, { useState } from 'react';
import { Phone, X, Rocket, Cpu, ChevronDown, ChevronUp, UserCircle } from 'lucide-react';
import { AgentSettingsPanel } from './AgentSettingsPanel';
import { AgentRuntimeConfig, resolveAgentRuntimeConfig, getAgentPreset } from '@/lib/agent-presets';
import styles from './NewCallModal.module.css';

interface NewCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLaunch: (phoneNumber: string, mode: 'now' | 'queue', config: AgentRuntimeConfig) => Promise<boolean>;
    queuedCount: number;
    availablePresetIds: string[];
    defaultAgentConfig: AgentRuntimeConfig;
}

export const NewCallModal: React.FC<NewCallModalProps> = ({
    isOpen,
    onClose,
    onLaunch,
    queuedCount,
    availablePresetIds,
    defaultAgentConfig
}) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLaunching, setIsLaunching] = useState(false);
    const [mode, setMode] = useState<'now' | 'queue'>(queuedCount > 0 ? 'now' : 'queue');
    const [localConfig, setLocalConfig] = useState<AgentRuntimeConfig>(defaultAgentConfig);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handlePresetChange = (presetId: string) => {
        const newConfig = resolveAgentRuntimeConfig(presetId, {
            recipientProfile: localConfig.recipientProfile
        });
        setLocalConfig(newConfig);
    };

    const updateConfig = (updates: Partial<AgentRuntimeConfig>) => {
        setLocalConfig(prev => ({ ...prev, ...updates }));
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsLaunching(true);
        const success = await onLaunch(phoneNumber, queuedCount > 0 ? mode : 'queue', localConfig);
        setIsLaunching(false);
        if (success) {
            onClose();
            setPhoneNumber('');
        } else {
            setSubmitError('Failed to launch call. Please check the number and try again.');
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
                    <X size={20} />
                </button>

                <header className={styles.header}>
                    <p className={styles.kicker}>Outbound Dispatch</p>
                    <h2>Initialize Session</h2>
                    <p>
                        {queuedCount > 0
                            ? 'The engine is currently busy. Choose whether to prioritize this call or add it to the sequence.'
                            : 'Enter the recipient number below. This session will be dispatched immediately by the background runner.'}
                    </p>
                </header>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label>
                            <Phone size={14} />
                            Recipient Number
                        </label>
                        <div className={styles.inputGroup}>
                            <span className={styles.prefix}>+91</span>
                            <input
                                type="tel"
                                placeholder="7044311109"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label>
                            <Cpu size={14} />
                            Base Agent Preset
                        </label>
                        <select
                            className={styles.select}
                            value={localConfig.presetId}
                            onChange={(e) => handlePresetChange(e.target.value)}
                        >
                            {availablePresetIds.map(id => (
                                <option key={id} value={id}>
                                    {id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label>
                            <UserCircle size={14} />
                            Recipient Context (Specific to this person)
                        </label>
                        <textarea
                            className={styles.textarea}
                            placeholder="e.g. This is Rahul, he is interested in AI but has low budget. Be very polite."
                            value={localConfig.recipientProfile}
                            onChange={(e) => updateConfig({ recipientProfile: e.target.value })}
                            rows={3}
                        />
                    </div>

                    <div className={styles.advancedToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
                        <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Agent Overrides</span>
                        {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {showAdvanced && (
                        <div className={styles.advancedPanel}>
                            <AgentSettingsPanel
                                value={localConfig}
                                onChange={setLocalConfig}
                                onSavePrompt={() => Promise.resolve()} // No saving presets from single call modal
                                promptOverrides={{}}
                            />
                        </div>
                    )}

                    {queuedCount > 0 && (
                        <div className={styles.toggleRow}>
                            <label className={styles.toggleLabel}>Dispatch Strategy</label>
                            <div className={styles.toggleGroup}>
                                <button
                                    type="button"
                                    className={`${styles.toggleBtn} ${mode === 'now' ? styles.toggleActive : ''}`}
                                    onClick={() => setMode('now')}
                                >
                                    Instant (Priority)
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.toggleBtn} ${mode === 'queue' ? styles.toggleActive : ''}`}
                                    onClick={() => setMode('queue')}
                                >
                                    Queue (Sequence)
                                </button>
                            </div>
                        </div>
                    )}

                    {submitError && <p className={styles.errorText}>{submitError}</p>}

                    <div className={styles.actions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>
                            Abort
                        </button>
                        <button type="submit" className={styles.launchBtn} disabled={isLaunching || !phoneNumber}>
                            {isLaunching ? (
                                'Dispatching...'
                            ) : (
                                <>
                                    <Rocket size={18} />
                                    Launch Session
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
