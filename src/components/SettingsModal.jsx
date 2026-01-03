import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { IoClose, IoPerson, IoLockClosed, IoChatbubbles, IoNotifications, IoColorPalette, IoServer, IoInformationCircle, IoLogOut, IoTrash, IoArrowBack, IoCamera } from 'react-icons/io5';
import { reauthenticateWithPopup } from "firebase/auth";
import { doc, updateDoc, onSnapshot, deleteDoc, collection, query, where, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth, googleProvider } from "../firebase";
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../utils/cloudinary';
import { performAccountDeletion } from '../utils/accountCleanup';
import './SettingsModal.css';

// --- CONSTANTS ---
const CATEGORIES = [
    { id: 'account', label: 'Account', icon: <IoPerson /> },
    { id: 'privacy', label: 'Privacy', icon: <IoLockClosed /> },
    { id: 'chat', label: 'Chat', icon: <IoChatbubbles /> },
    { id: 'notifications', label: 'Notifications', icon: <IoNotifications /> },
    { id: 'appearance', label: 'Appearance', icon: <IoColorPalette /> },
    { id: 'storage', label: 'Storage & Data', icon: <IoServer /> },
    { id: 'about', label: 'About', icon: <IoInformationCircle /> },
];

const FONT_SIZES = { 'small': '14px', 'normal': '16px', 'large': '18px' };

// --- HELPER COMPONENTS (MEMOIZED) ---
const SettingToggle = memo(({ label, desc, checked, onChange }) => (
    <div className="setting-item">
        <div className="setting-info">
            <label className="setting-label">{label}</label>
            {desc && <span className="setting-desc">{desc}</span>}
        </div>
        <div className={`setting-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}></div>
    </div>
));

const SettingDropdown = memo(({ label, value, options, onChange }) => (
    <div className="setting-item">
        <div className="setting-info">
            <label className="setting-label">{label}</label>
        </div>
        <select className="setting-select" value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map(([val, text]) => (
                <option key={val} value={val}>{text}</option>
            ))}
        </select>
    </div>
));

// --- SIDEBAR COMPONENT (MEMOIZED) ---
const SettingsSidebar = memo(({ activeTab, onTabChange, mobileView }) => (
    <div className={`settings-sidebar ${mobileView === 'sidebar' ? 'mobile-visible' : ''}`}>
        <div className="sidebar-title">Settings</div>
        {CATEGORIES.map(cat => (
            <div
                key={cat.id}
                className={`sidebar-item ${activeTab === cat.id ? 'active' : ''}`}
                onClick={() => onTabChange(cat.id)}
            >
                {cat.icon} {cat.label}
            </div>
        ))}
    </div>
));

// --- CONTENT COMPONENT ---
// Separated to keep the main modal clean and potentially memoize chunks if needed
const SettingsContent = ({
    activeTab,
    settings,
    onUpdate,
    onClose,
    mobileView,
    setMobileView,
    onToggleTheme,
    isDarkMode,
    onLogout,
    onDelete,
    uploadingAvatar,
    onAvatarChange,
    onClearCache,
    onClearChats
}) => {

    // Helper for easier updates
    const handleUpdate = useCallback((category, key, value) => {
        onUpdate(category, key, value);
    }, [onUpdate]);

    const renderHeader = () => (
        <div className="settings-content-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {window.innerWidth <= 768 && (
                    <button className="close-btn" onClick={() => setMobileView('sidebar')}>
                        <IoArrowBack />
                    </button>
                )}
                <h2>{CATEGORIES.find(c => c.id === activeTab)?.label}</h2>
            </div>
            <button className="close-btn" onClick={onClose}><IoClose /></button>
        </div>
    );

    const renderBody = () => {
        switch (activeTab) {
            case 'account':
                return (
                    <div className="settings-body">
                        <div className="profile-edit-section">
                            <div className="settings-avatar-wrapper" style={{ position: 'relative' }}>
                                <img src={settings.photoURL || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"} alt="Avatar" className="profile-avatar-large" />
                                {uploadingAvatar && <div className="loading-overlay">...</div>}
                            </div>
                            <label className="change-avatar-btn">
                                Change Photo
                                <input type="file" accept="image/*" onChange={onAvatarChange} className="file-input" style={{ display: 'none' }} />
                            </label>
                        </div>
                        <div className="setting-group account-group">
                            <label className="setting-label" style={{ textAlign: 'center' }}>Username</label>
                            <input
                                className="setting-input"
                                value={settings.username}
                                onChange={(e) => handleUpdate('root', 'username', e.target.value)}
                                placeholder="@username"
                                style={{ textAlign: 'center' }}
                            />
                        </div>
                        <div className="setting-group">
                            <button className="primary-btn" onClick={onLogout} style={{ width: '100%', marginBottom: '10px' }}>
                                <IoLogOut style={{ marginRight: '8px' }} /> Log Out
                            </button>
                            <button className="danger-btn" onClick={onDelete} style={{ width: '100%' }}>
                                <IoTrash style={{ marginRight: '8px' }} /> Delete Account
                            </button>
                        </div>
                    </div>
                );
            case 'privacy':
                return (
                    <div className="settings-body">
                        <div className="setting-group">
                            <div className="setting-group-title">Visibility</div>
                            <SettingDropdown
                                label="Last Seen & Online"
                                value={settings.privacy.lastSeen}
                                options={[['everyone', 'Everyone'], ['contacts', 'Contacts Only'], ['nobody', 'Nobody']]}
                                onChange={(val) => handleUpdate('privacy', 'lastSeen', val)}
                            />
                            <SettingToggle
                                label="Read Receipts"
                                desc="Show blue ticks when you view messages"
                                checked={settings.privacy.readReceipts}
                                onChange={(val) => handleUpdate('privacy', 'readReceipts', val)}
                            />
                            <SettingToggle
                                label="Typing Indicator"
                                desc="Show when you are typing"
                                checked={settings.privacy.typing}
                                onChange={(val) => handleUpdate('privacy', 'typing', val)}
                            />
                            <SettingDropdown
                                label="Who can message me"
                                value={settings.privacy.messagesFrom}
                                options={[['everyone', 'Everyone'], ['contacts', 'Contacts Only']]}
                                onChange={(val) => handleUpdate('privacy', 'messagesFrom', val)}
                            />
                        </div>
                    </div>
                );
            case 'chat':
                return (
                    <div className="settings-body">
                        <div className="setting-group">
                            <SettingToggle
                                label="Enter to Send"
                                desc="Press Enter key to send message"
                                checked={settings.chatSettings.enterToSend}
                                onChange={(val) => handleUpdate('chatSettings', 'enterToSend', val)}
                            />
                            <SettingDropdown
                                label="Media Auto-Download"
                                value={settings.chatSettings.autoDownload}
                                options={[['always', 'Always'], ['wifi', 'Wi-Fi Only'], ['never', 'Never']]}
                                onChange={(val) => handleUpdate('chatSettings', 'autoDownload', val)}
                            />
                            <SettingDropdown
                                label="Default Disappearing Timer"
                                value={settings.chatSettings.defaultDisappear}
                                options={[['off', 'Off'], ['24h', '24 Hours'], ['7d', '7 Days']]}
                                onChange={(val) => handleUpdate('chatSettings', 'defaultDisappear', val)}
                            />
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Clear All Chats</label>
                                    <span className="setting-desc">Delete all messages for you</span>
                                </div>
                                <button className="danger-btn" onClick={onClearChats} style={{ padding: '5px 10px', fontSize: '0.8rem' }}>Clear</button>
                            </div>
                        </div>
                    </div>
                );
            case 'notifications':
                return (
                    <div className="settings-body">
                        <div className="setting-group">
                            <SettingToggle
                                label="Enable Notifications"
                                checked={settings.notifications.enabled}
                                onChange={(val) => handleUpdate('notifications', 'enabled', val)}
                            />
                            <SettingToggle
                                label="Message Preview"
                                desc="Show message content in notifications"
                                checked={settings.notifications.preview}
                                onChange={(val) => handleUpdate('notifications', 'preview', val)}
                            />
                            <SettingToggle
                                label="Sound"
                                checked={settings.notifications.sound}
                                onChange={(val) => handleUpdate('notifications', 'sound', val)}
                            />
                            <SettingToggle
                                label="Vibration"
                                checked={settings.notifications.vibration}
                                onChange={(val) => handleUpdate('notifications', 'vibration', val)}
                            />
                        </div>
                    </div>
                );
            case 'appearance':
                return (
                    <div className="settings-body">
                        <div className="setting-group">
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Dark Mode</label>
                                    <span className="setting-desc">Adjust the appearance of the app</span>
                                </div>
                                <div className={`setting-toggle ${isDarkMode ? 'on' : ''}`} onClick={onToggleTheme}></div>
                            </div>
                            <SettingDropdown
                                label="Font Size"
                                value={settings.appearance?.fontSize || 'normal'}
                                options={[['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']]}
                                onChange={(val) => handleUpdate('appearance', 'fontSize', val)}
                            />
                            <SettingDropdown
                                label="Bubble Size"
                                value={settings.appearance?.bubbleSize || 'medium'}
                                options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]}
                                onChange={(val) => handleUpdate('appearance', 'bubbleSize', val)}
                            />
                        </div>
                    </div>
                );
            case 'storage':
                return (
                    <div className="settings-body">
                        <div className="setting-group">
                            <SettingDropdown
                                label="Media Upload Quality"
                                value={settings.mediaSettings.uploadQuality}
                                options={[['high', 'High (Original)'], ['medium', 'Medium (Faster)']]}
                                onChange={(val) => handleUpdate('mediaSettings', 'uploadQuality', val)}
                            />
                            <SettingToggle
                                label="Voice Messages"
                                checked={settings.mediaSettings.allowVoice}
                                onChange={(val) => handleUpdate('mediaSettings', 'allowVoice', val)}
                            />
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Clear Cached Data</label>
                                    <span className="setting-desc">Free up space by clearing local cache</span>
                                </div>
                                <button className="cache-btn" onClick={onClearCache}>Clear Cache</button>
                            </div>
                        </div>
                    </div>
                );
            case 'about':
                return (
                    <div className="settings-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: 'var(--accent)' }}>U & ME</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Version 3.5.0</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                            <div style={{ padding: '15px', background: 'var(--bg-secondary)', borderRadius: '10px', width: '100%' }}>
                                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '5px' }}>Privacy & Security</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Your chats are secured with end-to-end encryption. Only you and the person you're communicating with can read or listen to them.
                                </p>
                            </div>
                            <a href="#" onClick={(e) => { e.preventDefault(); alert("Call: 8885322599"); }} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 'bold' }}>
                                Contact Support: 8885322599
                            </a>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className={`settings-content ${window.innerWidth <= 768 && mobileView === 'sidebar' ? 'mobile-hidden' : ''}`}>
            {renderHeader()}
            {renderBody()}
        </div>
    );
};

// --- MAIN COMPONENT ---
const SettingsModal = ({ isOpen, onClose, onToggleTheme, isDarkMode }) => {
    const { logout, deleteAccount } = useAuth();
    const [activeTab, setActiveTab] = useState('account');
    const [mobileView, setMobileView] = useState('sidebar');
    const [loading, setLoading] = useState(true);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Custom Confirm Dialog State
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', isDanger: false, onConfirm: null });

    // Initial Settings State
    const [settings, setSettings] = useState({
        username: '',
        photoURL: '',
        privacy: { lastSeen: 'everyone', readReceipts: true, typing: true, messagesFrom: 'everyone' },
        chatSettings: { enterToSend: false, autoDownload: 'wifi', defaultDisappear: 'off' },
        notifications: { enabled: true, preview: true, sound: true, vibration: true },
        appearance: { fontSize: 'normal', bubbleSize: 'medium' },
        mediaSettings: { uploadQuality: 'high', allowVoice: true }
    });

    const debounceTimeout = useRef(null);

    // Initialize & Listen to Firestore
    useEffect(() => {
        if (!isOpen || !auth.currentUser) return;
        setLoading(true);
        const userRef = doc(db, "users", auth.currentUser.uid);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings(prev => ({
                    ...prev,
                    username: data.username || '',
                    photoURL: data.photoURL || '',
                    privacy: { ...prev.privacy, ...(data.privacy || {}) },
                    chatSettings: { ...prev.chatSettings, ...(data.chatSettings || {}) },
                    notifications: { ...prev.notifications, ...(data.notifications || {}) },
                    appearance: { ...prev.appearance, ...(data.appearance || {}) },
                    mediaSettings: { ...prev.mediaSettings, ...(data.mediaSettings || {}) }
                }));
            }
            setLoading(false);
        });

        const handleResize = () => { if (window.innerWidth > 768) setMobileView('sidebar'); };
        window.addEventListener('resize', handleResize);
        return () => { unsubscribe(); window.removeEventListener('resize', handleResize); };
    }, [isOpen]);

    // Appearance Effect
    useEffect(() => {
        const currentSize = settings.appearance?.fontSize || 'normal';
        document.documentElement.style.setProperty('--app-font-size', FONT_SIZES[currentSize]);
        document.documentElement.style.fontSize = FONT_SIZES[currentSize];
    }, [settings.appearance]);

    // --- OPTIMIZED UPDATE HANDLER ---
    const updateSetting = useCallback((category, key, value) => {
        // 1. Optimistic Local Update
        setSettings(prev => {
            if (category === 'root') return { ...prev, [key]: value };
            return { ...prev, [category]: { ...prev[category], [key]: value } };
        });

        // 2. Debounced Firestore Write
        if (!auth.currentUser) return;

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        debounceTimeout.current = setTimeout(async () => {
            const userRef = doc(db, "users", auth.currentUser.uid);
            try {
                const updatePath = category === 'root' ? key : `${category}.${key}`;
                await updateDoc(userRef, { [updatePath]: value });
            } catch (error) {
                console.error("Failed to save setting:", error);
            }
        }, 500); // 500ms debounce
    }, []);

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingAvatar(true);
        try {
            const url = await uploadToCloudinary(file, 'image');
            updateSetting('root', 'photoURL', url);
        } catch (error) {
            console.error(error);
            // Silent or minor toast
        } finally { setUploadingAvatar(false); }
    };

    const handleLogout = useCallback(async () => {
        try { await logout(); onClose(); } catch (e) { console.error("Error logging out", e); }
    }, [logout, onClose]);

    const handleDelete = useCallback(() => {
        setConfirmDialog({
            isOpen: true,
            title: "Delete account permanently?",
            message: "This action cannot be undone.",
            isDanger: true,
            onConfirm: async () => {
                try {
                    // Silent Re-auth
                    await reauthenticateWithPopup(auth.currentUser, googleProvider);

                    // 2. If successful, proceed with cleanup
                    setLoading(true);

                    // 3. Perform atomic cleanup (Firestore)
                    await performAccountDeletion(auth.currentUser.uid);

                    // 4. Delete Auth Account
                    await deleteAccount();

                    onClose();
                    // Redirection to login happens automatically via AuthContext listener
                } catch (e) {
                    console.error("Delete Account Error:", e);
                    setLoading(false);

                    if (e.code === 'auth/popup-closed-by-user') {
                        console.log("Re-auth cancelled");
                    } else {
                        // Silent technical error as requested
                        console.error("Deletion failed", e);
                    }
                }
            }
        });
    }, [deleteAccount, onClose]);

    const handleClearCache = useCallback(() => {
        Object.keys(localStorage).forEach(key => { if (key.startsWith('user_')) localStorage.removeItem(key); });
        setConfirmDialog({
            isOpen: true,
            title: "Cache Cleared",
            message: "Local cache has been cleared successfully.",
            isDanger: false,
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        });
    }, []);

    const handleClearAllChats = useCallback(() => {
        setConfirmDialog({
            isOpen: true,
            title: "Clear All Chats",
            message: "Are you sure? This will delete all messages for you.",
            isDanger: true,
            onConfirm: async () => {
                setLoading(true);
                try {
                    const chatsRef = collection(db, "chats");
                    const q = query(chatsRef, where("members", "array-contains", auth.currentUser.uid));
                    const querySnapshot = await getDocs(q);
                    const batch = writeBatch(db);
                    querySnapshot.forEach((docSnap) => {
                        const chatRef = doc(db, "chats", docSnap.id);
                        batch.update(chatRef, { [`clearedAt.${auth.currentUser.uid}`]: serverTimestamp() });
                    });
                    await batch.commit();
                    setConfirmDialog(prev => ({
                        isOpen: true,
                        title: "Success",
                        message: "All chats cleared.",
                        isDanger: false,
                        onConfirm: () => setConfirmDialog(p => ({ ...p, isOpen: false }))
                    }));
                } catch (error) { console.error("Failed to clear chats", error); }
                finally { setLoading(false); }
            }
        });
    }, []);

    const handleTabChange = useCallback((id) => {
        setActiveTab(id);
        setMobileView('content');
    }, []);

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" onClick={onClose}>
            {confirmDialog.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(3px)'
                }} onClick={(e) => { e.stopPropagation(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}>
                    <div style={{
                        background: '#09090b',
                        padding: '30px',
                        borderRadius: '16px',
                        maxWidth: '400px',
                        width: '90%',
                        textAlign: 'center',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                        border: '1px solid #27272a',
                        animation: 'fadeIn 0.2s ease-out'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.3rem', color: confirmDialog.isDanger ? '#ef4444' : '#ffffff' }}>{confirmDialog.title}</h3>
                        <p style={{ margin: '0 0 32px 0', color: '#a1a1aa', lineHeight: '1.6', fontSize: '0.95rem' }}>{confirmDialog.message}</p>
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                                style={{
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    border: '1px solid #3f3f46',
                                    background: 'transparent',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    fontSize: '0.95rem',
                                    fontWeight: '500'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}
                                style={{
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: confirmDialog.isDanger ? '#ef4444' : '#22c55e',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.95rem'
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <SettingsSidebar
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    mobileView={mobileView}
                />

                <SettingsContent
                    activeTab={activeTab}
                    settings={settings}
                    onUpdate={updateSetting}
                    onClose={onClose}
                    mobileView={mobileView}
                    setMobileView={setMobileView}
                    onToggleTheme={onToggleTheme}
                    isDarkMode={isDarkMode}
                    onLogout={handleLogout}
                    onDelete={handleDelete}
                    uploadingAvatar={uploadingAvatar}
                    onAvatarChange={handleAvatarChange}
                    onClearCache={handleClearCache}
                    onClearChats={handleClearAllChats}
                />
            </div>
        </div>
    );
};

export default SettingsModal;
