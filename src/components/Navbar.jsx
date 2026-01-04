import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import "./Navbar.css";
import { motion, AnimatePresence } from 'framer-motion';
import { FaSun, FaMoon, FaSignOutAlt, FaTrashAlt } from 'react-icons/fa';
import { MdGroupAdd, MdSettings } from 'react-icons/md';
import { IoInformationCircle } from 'react-icons/io5';
import { db } from '../firebase';
import SettingsModal from "./SettingsModal";
import { doc, deleteDoc } from 'firebase/firestore';

const Navbar = ({ onToggleMenu, onToggleTheme, onToggleGroupModal, onLogoClick, isDarkMode, user }) => {
    const { currentUser, logout, deleteAccount } = useAuth();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState('account');

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showProfileMenu && !event.target.closest('.profile-container')) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showProfileMenu]);

    return (
        <div className='navbar'>
            <div className="navbar-left">
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className='logo animate-text'
                    onClick={onLogoClick}
                    style={{ cursor: 'pointer' }}
                >
                    U & ME
                </motion.div>
            </div>

            <div className='user'>
                {currentUser && (
                    <>
                        <button className="theme-toggle-btn" onClick={() => { setSettingsTab('about'); setIsSettingsOpen(true); }} title="About">
                            <IoInformationCircle />
                        </button>
                        <button className="theme-toggle-btn" onClick={onToggleTheme}>
                            {isDarkMode ? <FaSun /> : <FaMoon />}
                        </button>
                        <button className="group-add-btn" onClick={onToggleGroupModal} title="Create Group">
                            <MdGroupAdd />
                        </button>

                        <div className="profile-container">
                            <div className="profile-trigger" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                                <img src={currentUser.photoURL} alt="user" />
                                <span className="user-name">@{user?.username?.replace(/^@/, '') || currentUser.displayName}</span>
                            </div>

                            <AnimatePresence>
                                {showProfileMenu && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="profile-dropdown"
                                    >
                                        <button className="dropdown-item" onClick={() => { setShowProfileMenu(false); setSettingsTab('account'); setIsSettingsOpen(true); }}>
                                            <MdSettings /> Settings
                                        </button>
                                        <button className="dropdown-item" onClick={() => logout()}>
                                            <FaSignOutAlt /> Log out
                                        </button>

                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                )}
            </div>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onToggleTheme={onToggleTheme}
                isDarkMode={isDarkMode}
                initialTab={settingsTab}
            />
        </div>
    );
};

export default Navbar;
