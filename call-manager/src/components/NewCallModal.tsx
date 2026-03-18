'use client';

import React, { useState } from 'react';
import { Phone, X, Rocket } from 'lucide-react';
import styles from './NewCallModal.module.css';

interface NewCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLaunch: (phoneNumber: string) => void;
}

export const NewCallModal: React.FC<NewCallModalProps> = ({ isOpen, onClose, onLaunch }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLaunching, setIsLaunching] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLaunching(true);
        await onLaunch(phoneNumber);
        setIsLaunching(false);
        onClose();
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button className={styles.closeBtn} onClick={onClose}>
                    <X size={20} />
                </button>

                <div className={styles.header}>
                    <h2>Launch Outbound Call</h2>
                    <p>The agent will call this number as soon as you hit launch.</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label><Phone size={16} /> Recipient Number</label>
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

                    <div className={styles.actions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.launchBtn} disabled={isLaunching}>
                            {isLaunching ? 'Launching...' : (
                                <>
                                    <Rocket size={18} />
                                    Launch Call
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
