'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Layers,
    PhoneCall,
    FilePlus,
    Settings,
    X
} from 'lucide-react';
import styles from '../app/page.module.css';

interface DashboardShellProps {
    children: React.ReactNode;
    onNewCall?: () => void;
    error?: string | null;
    onErrorClose?: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
    children,
    onNewCall,
    error,
    onErrorClose
}) => {
    const pathname = usePathname();

    return (
        <div className={styles.shell}>
            {error && (
                <div className={styles.toast} role="alert" aria-live="polite">
                    <div>
                        <span className={styles.topBarKicker}>System Notification</span>
                        <p><strong>{error}</strong></p>
                    </div>
                    <button type="button" onClick={onErrorClose} className={styles.toastClose}>
                        <X size={16} />
                    </button>
                </div>
            )}

            <aside className={styles.sidebar}>
                <div className={styles.brandBlock}>
                    <div className={styles.brandMark}>K</div>
                </div>

                <nav className={styles.sidebarNav} aria-label="Primary">
                    <Link
                        href="/"
                        className={`${styles.sidebarNavItem} ${pathname === '/' ? styles.sidebarNavItemActive : ''}`}
                        title="Dashboard"
                    >
                        <LayoutDashboard size={20} />
                    </Link>
                    <Link
                        href="/campaigns"
                        className={`${styles.sidebarNavItem} ${pathname.startsWith('/campaigns') && pathname !== '/campaigns/new' ? styles.sidebarNavItemActive : ''}`}
                        title="Campaigns"
                    >
                        <Layers size={20} />
                    </Link>
                </nav>

                <div className={styles.sidebarActions}>
                    <button
                        type="button"
                        className={styles.sidebarButton}
                        onClick={onNewCall}
                        title="New Single Call"
                    >
                        <PhoneCall size={20} />
                    </button>
                    <Link
                        href="/campaigns/new"
                        className={`${styles.sidebarLinkButton} ${pathname === '/campaigns/new' ? styles.sidebarNavItemActive : ''}`}
                        title="New Campaign"
                    >
                        <FilePlus size={20} />
                    </Link>
                </div>

                <div className={styles.sidebarFooter}>
                    <button type="button" className={styles.sidebarNavItem} title="Settings">
                        <Settings size={20} />
                    </button>
                </div>
            </aside>

            <main className={styles.main}>
                {children}
            </main>
        </div>
    );
};
