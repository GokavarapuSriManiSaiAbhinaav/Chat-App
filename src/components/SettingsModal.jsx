import React, { useState, useEffect, useRef } from 'react';
import { IoClose, IoPerson, IoLockClosed, IoChatbubbles, IoNotifications, IoColorPalette, IoServer, IoInformationCircle, IoLogOut, IoTrash, IoArrowBack, IoCloudUpload, IoCheckmarkDone, IoMoon, IoKey, IoVolumeMedium } from 'react-icons/io5';
import { doc, updateDoc, onSnapshot, getDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../utils/cloudinary';
import './SettingsModal.css';

const SettingsModal = ({ isOpen, onClose, onToggleTheme, isDarkMode }) => {
    const { logout, deleteAccount } = useAuth();
    const [activeTab, setActiveTab] = useState('account');
    const [mobileView, setMobileView] = useState('sidebar'); // sidebar or content
    const [loading, setLoading] = useState(true);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Custom Confirm Dialog State
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false,
        title: '',
        message: '',
        isDanger: false,
        onConfirm: null
    });

    // Initial Settings State
    const [settings, setSettings] = useState({
        username: '',
        photoURL: '',
        privacy: {
            lastSeen: 'everyone',
            readReceipts: true,
            typing: true,
            messagesFrom: 'everyone'
        },
        chatSettings: {
            enterToSend: false,
            autoDownload: 'wifi',
            defaultDisappear: 'off'
        },
        notifications: {
            enabled: true,
            preview: true,
            sound: true,
            vibration: true
        },
        appearance: {
            fontSize: 'normal',
            bubbleSize: 'medium'
        },
        mediaSettings: {
            uploadQuality: 'high',
            allowVoice: true
        }
    });

    // Load Settings
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

        // Resize Listener
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setMobileView('sidebar'); // Reset to sidebar/desktop view
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            unsubscribe();
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen]);

    // Apply Font Size Effect
    useEffect(() => {
        const sizeMap = {
            'small': '14px',
            'normal': '16px',
            'large': '18px'
        };
        const currentSize = settings.appearance?.fontSize || 'normal';
        document.documentElement.style.setProperty('--app-font-size', sizeMap[currentSize]);
        document.documentElement.style.fontSize = sizeMap[currentSize];
    }, [settings.appearance]);

    // Update Handler (Auto-save)
    const updateSetting = async (category, key, value) => {
        // Optimistic Update
        setSettings(prev => {
            if (category === 'root') {
                return { ...prev, [key]: value };
            }
            return {
                ...prev,
                [category]: { ...prev[category], [key]: value }
            };
        });

        // Firestore Update
        if (!auth.currentUser) return;
        const userRef = doc(db, "users", auth.currentUser.uid);
        try {
            const updatePath = category === 'root' ? key : `${category}.${key}`;
            await updateDoc(userRef, {
                [updatePath]: value
            });
        } catch (error) {
            console.error("Failed to save setting:", error);
        }
    };

    // Avatar Upload
    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingAvatar(true);
        try {
            const url = await uploadToCloudinary(file, 'image');
            await updateSetting('root', 'photoURL', url);
        } catch (error) {
            alert("Failed to upload image.");
        } finally {
            setUploadingAvatar(false);
        }
    };

    // Logout / Delete
    const handleLogout = async () => {
        try { await logout(); onClose(); } catch (e) { alert("Error logging out"); }
    };

    const handleDelete = async () => {
        setConfirmDialog({
            isOpen: true,
            title: "Delete Account",
            message: "Are you sure? This is permanent and cannot be undone.",
            isDanger: true,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, "users", auth.currentUser.uid));
                    await deleteAccount();
                    onClose();
                } catch (e) {
                    console.error(e);
                    alert("Error deleting account");
                }
            }
        });
    };

    const handleClearCache = () => {
        // Clear local storage cache related to user data
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('user_')) localStorage.removeItem(key);
        });
        alert("Cache cleared successfully.");
    };

    const handleClearAllChats = async () => {
        setConfirmDialog({
            isOpen: true,
            title: "Clear All Chats",
            message: "Are you sure you want to clear ALL chats? This will hide all messages for you.",
            isDanger: true,
            onConfirm: async () => {
                setLoading(true);
                try {
                    const chatsRef = collection(db, "chats");
                    // Query chats where user is a member
                    const q = query(chatsRef, where("members", "array-contains", auth.currentUser.uid));
                    const querySnapshot = await getDocs(q);

                    const batch = writeBatch(db);
                    querySnapshot.forEach((docSnap) => {
                        const chatRef = doc(db, "chats", docSnap.id);
                        // Set clearedAt timestamp for this user in the chat doc
                        batch.update(chatRef, {
                            [`clearedAt.${auth.currentUser.uid}`]: serverTimestamp()
                        });
                    });
                    await batch.commit();
                    alert("All chats cleared successfully.");
                } catch (error) {
                    console.error("Error clearing chats:", error);
                    alert("Failed to clear chats.");
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    if (!isOpen) return null;

    const categories = [
        { id: 'account', label: 'Account', icon: <IoPerson /> },
        { id: 'privacy', label: 'Privacy', icon: <IoLockClosed /> },
        { id: 'chat', label: 'Chat', icon: <IoChatbubbles /> },
        { id: 'notifications', label: 'Notifications', icon: <IoNotifications /> },
        { id: 'appearance', label: 'Appearance', icon: <IoColorPalette /> },
        { id: 'storage', label: 'Storage & Data', icon: <IoServer /> },
        { id: 'about', label: 'About', icon: <IoInformationCircle /> },
    ];

    const renderContent = () => {
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
                                <input type="file" accept="image/*" onChange={handleAvatarChange} className="file-input" />
                            </label>
                        </div>
                        <div className="setting-group">
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Username</label>
                                    <input
                                        className="setting-input"
                                        value={settings.username}
                                        onChange={(e) => updateSetting('root', 'username', e.target.value)}
                                        placeholder="@username"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="setting-group">
                            <button className="primary-btn" onClick={handleLogout} style={{ width: '100%', marginBottom: '10px' }}>
                                <IoLogOut style={{ marginRight: '8px' }} /> Log Out
                            </button>
                            <button className="danger-btn" onClick={handleDelete} style={{ width: '100%' }}>
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
                                onChange={(val) => updateSetting('privacy', 'lastSeen', val)}
                            />
                            <SettingToggle
                                label="Read Receipts"
                                desc="Show blue ticks when you view messages"
                                checked={settings.privacy.readReceipts}
                                onChange={(val) => updateSetting('privacy', 'readReceipts', val)}
                            />
                            <SettingToggle
                                label="Typing Indicator"
                                desc="Show when you are typing"
                                checked={settings.privacy.typing}
                                onChange={(val) => updateSetting('privacy', 'typing', val)}
                            />
                            <SettingDropdown
                                label="Who can message me"
                                value={settings.privacy.messagesFrom}
                                options={[['everyone', 'Everyone'], ['contacts', 'Contacts Only']]}
                                onChange={(val) => updateSetting('privacy', 'messagesFrom', val)}
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
                                onChange={(val) => updateSetting('chatSettings', 'enterToSend', val)}
                            />
                            <SettingDropdown
                                label="Media Auto-Download"
                                value={settings.chatSettings.autoDownload}
                                options={[['always', 'Always'], ['wifi', 'Wi-Fi Only'], ['never', 'Never']]}
                                onChange={(val) => updateSetting('chatSettings', 'autoDownload', val)}
                            />
                            <SettingDropdown
                                label="Default Disappearing Timer"
                                value={settings.chatSettings.defaultDisappear}
                                options={[['off', 'Off'], ['24h', '24 Hours'], ['7d', '7 Days']]}
                                onChange={(val) => updateSetting('chatSettings', 'defaultDisappear', val)}
                            />
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Clear All Chats</label>
                                    <span className="setting-desc">Delete all messages for you</span>
                                </div>
                                <button className="danger-btn" onClick={handleClearAllChats} style={{ padding: '5px 10px', fontSize: '0.8rem' }}>Clear</button>
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
                                onChange={(val) => updateSetting('notifications', 'enabled', val)}
                            />
                            <SettingToggle
                                label="Message Preview"
                                desc="Show message content in notifications"
                                checked={settings.notifications.preview}
                                onChange={(val) => updateSetting('notifications', 'preview', val)}
                            />
                            <SettingToggle
                                label="Sound"
                                checked={settings.notifications.sound}
                                onChange={(val) => updateSetting('notifications', 'sound', val)}
                            />
                            <SettingToggle
                                label="Vibration"
                                checked={settings.notifications.vibration}
                                onChange={(val) => updateSetting('notifications', 'vibration', val)}
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
                                onChange={(val) => updateSetting('appearance', 'fontSize', val)}
                            />
                            <SettingDropdown
                                label="Bubble Size"
                                value={settings.appearance?.bubbleSize || 'medium'}
                                options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]}
                                onChange={(val) => updateSetting('appearance', 'bubbleSize', val)}
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
                                onChange={(val) => updateSetting('mediaSettings', 'uploadQuality', val)}
                            />
                            <SettingToggle
                                label="Voice Messages"
                                checked={settings.mediaSettings.allowVoice}
                                onChange={(val) => updateSetting('mediaSettings', 'allowVoice', val)}
                            />
                            <div className="setting-item">
                                <div className="setting-info">
                                    <label className="setting-label">Clear Cached Data</label>
                                    <span className="setting-desc">Free up space by clearing local cache</span>
                                </div>
                                <button className="cache-btn" onClick={handleClearCache}>Clear Cache</button>
                            </div>
                        </div>
                    </div>
                );
            case 'about':
                return (
                    <div className="settings-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: 'var(--primary-color)' }}>U & ME</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Version 3.5.0</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                            <div style={{ padding: '15px', background: 'var(--bg-secondary)', borderRadius: '10px', width: '100%' }}>
                                <h3 style={{ fontSize: '1rem', color: 'var(--text-main)', marginBottom: '5px' }}>Privacy & Security</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Your chats are secured with end-to-end encryption. Only you and the person you're communicating with can read or listen to them.
                                </p>
                            </div>

                            <a href="#" onClick={(e) => { e.preventDefault(); alert("Call: 8885322599"); }} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 'bold' }}>
                                Contact Support: 8885322599
                            </a>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'underline', fontSize: '0.85rem' }}>Privacy Policy</a>
                                <a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'underline', fontSize: '0.85rem' }}>Terms & Conditions</a>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="settings-overlay" onClick={onClose}>
            {/* Custom Confirm Dialog Overlay */}
            {confirmDialog.isOpen && (
                <div
                    className="settings-overlay"
                    style={{ zIndex: 2100 }}
                    onClick={(e) => { e.stopPropagation(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}
                >
                    <div style={{
                        background: 'var(--bg-secondary)',
                        padding: '20px',
                        borderRadius: '15px',
                        maxWidth: '350px',
                        textAlign: 'center',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                        border: '1px solid var(--border-color)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 10px 0', color: confirmDialog.isDanger ? '#ff4757' : 'var(--text-main)' }}>{confirmDialog.title}</h3>
                        <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)' }}>{confirmDialog.message}</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: confirmDialog.isDanger ? '#ff4757' : 'var(--primary-color)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                {/* Sidebar */}
                <div className={`settings-sidebar ${mobileView === 'sidebar' ? 'mobile-visible' : ''}`}>
                    <div className="sidebar-title">Settings</div>
                    {categories.map(cat => (
                        <div
                            key={cat.id}
                            className={`sidebar-item ${activeTab === cat.id ? 'active' : ''}`}
                            onClick={() => { setActiveTab(cat.id); setMobileView('content'); }}
                        >
                            {cat.icon} {cat.label}
                        </div>
                    ))}
                </div>

                {/* Content Area */}
                <div className={`settings-content ${window.innerWidth <= 768 && mobileView === 'sidebar' ? 'mobile-hidden' : ''}`}>
                    <div className="settings-content-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {window.innerWidth <= 768 && (
                                <button className="close-btn" onClick={() => setMobileView('sidebar')}>
                                    <IoArrowBack />
                                </button>
                            )}
                            <h2>{categories.find(c => c.id === activeTab)?.label}</h2>
                        </div>
                        <button className="close-btn" onClick={onClose}><IoClose /></button>
                    </div>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

// Helper Components
const SettingToggle = ({ label, desc, checked, onChange }) => (
    <div className="setting-item">
        <div className="setting-info">
            <label className="setting-label">{label}</label>
            {desc && <span className="setting-desc">{desc}</span>}
        </div>
        <div className={`setting-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}></div>
    </div>
);

const SettingDropdown = ({ label, value, options, onChange }) => (
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
);

export default SettingsModal;
