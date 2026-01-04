import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { IoSearch, IoExitOutline, IoTrashBinOutline } from "react-icons/io5";
import { collection, query, where, onSnapshot, getDocs, getDoc, doc, writeBatch, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import "./UserList.css";

const UserSearch = ({ onSelectUser, selectedUser, isChatActive, isOpen, onClose }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [recentChats, setRecentChats] = useState([]);
    const [loadingRecent, setLoadingRecent] = useState(true);
    const { currentUser, logout } = useAuth();

    // Modal State
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, chat: null });
    const [errorModal, setErrorModal] = useState({ isOpen: false, message: '' });

    // Long Press Refs
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);

    const handleLongPressStart = (chat) => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            // Vibrate if mobile
            if (navigator.vibrate) navigator.vibrate(50);
            setDeleteModal({ isOpen: true, chat });
        }, 600); // 600ms hold
    };

    const handleLongPressEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleContextMenu = (e, chat) => {
        e.preventDefault();
        setDeleteModal({ isOpen: true, chat });
    };

    const confirmDeleteChat = async () => {
        const { chat } = deleteModal;
        if (!chat || !currentUser) return;

        try {
            await updateDoc(doc(db, "chats", chat.id), {
                hiddenFor: arrayUnion(currentUser.uid)
            });
            // Update local state is handled by Snapshot listener filtering
        } catch (error) {
            console.error("Failed to delete chat", error);
        } finally {
            setDeleteModal({ isOpen: false, chat: null });
        }
    };

    // 1. Listen for Active Conversations
    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "chats"),
            where("members", "array-contains", currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const chatDetails = await Promise.all(
                snapshot.docs.map(async (chatDoc) => {
                    const data = chatDoc.data();

                    // Filter: Hide if user has 'deleted' this chat
                    if (data.hiddenFor && data.hiddenFor.includes(currentUser.uid)) {
                        return null;
                    }

                    if (data.type === 'group') {
                        // Group Chat
                        return {
                            id: chatDoc.id,
                            chatId: chatDoc.id,
                            displayName: data.groupName,
                            photoURL: data.groupPhotoURL || "https://cdn-icons-png.flaticon.com/512/612/612051.png",
                            type: 'group',
                            isGroup: true,
                            unreadCount: data.unreadCount?.[currentUser.uid] || 0,
                            lastInteraction: data.lastInteraction,
                            lastMessage: data.lastMessage,
                            lastMessageSender: data.lastMessageSender
                        };
                    } else {
                        // 1-on-1 Chat
                        const otherUid = data.members.find(uid => uid !== currentUser.uid);
                        // If no other member found, they deleted their account (orphaned chat) - Only show if I have not hidden it
                        // but strict "WhatsApp behavior" implies if *I* delete the chat, it's gone regardless of their status.

                        if (!otherUid) return null;

                        try {
                            const userRef = doc(db, "users", otherUid);
                            const userSnap = await getDoc(userRef);

                            if (userSnap.exists()) {
                                const userData = userSnap.data();
                                return {
                                    id: chatDoc.id,
                                    chatId: chatDoc.id,
                                    ...userData,
                                    unreadCount: data.unreadCount?.[currentUser.uid] || 0,
                                    lastInteraction: data.lastInteraction,
                                    lastMessage: data.lastMessage,
                                    lastMessageSender: data.lastMessageSender
                                };
                            }
                            return null;
                        } catch (e) {
                            return null;
                        }
                    }
                    return null;
                })
            );

            // Filter out nulls and sort by last interaction
            const sortedChats = chatDetails
                .filter(chat => chat !== null)
                .sort((a, b) => {
                    const timeA = a.lastInteraction?.seconds || 0;
                    const timeB = b.lastInteraction?.seconds || 0;
                    return timeB - timeA;
                });

            setRecentChats(sortedChats);
            setLoadingRecent(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Live Search with Debounce
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchTerm.length < 1) {
                setSearchResults([]);
                setSearching(false);
                return;
            }

            setSearching(true);
            try {
                // Determine if searching for group or user
                // For now, simpler user search
                const q = query(
                    collection(db, "users"),
                    where("username", ">=", searchTerm.toLowerCase()),
                    where("username", "<=", searchTerm.toLowerCase() + '\uf8ff')
                );

                const querySnapshot = await getDocs(q);
                let results = [];
                querySnapshot.forEach((doc) => {
                    const userData = doc.data();
                    if (userData.uid !== currentUser.uid) {
                        results.push({ id: doc.id, ...userData });
                    }
                });

                // Client-side strict match filter if needed, but firestore range query is okay for "starts with"
                setSearchResults(results);
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setSearching(false);
            }
        }, 500); // 500ms Delay

        return () => clearTimeout(timer);
    }, [searchTerm, currentUser]);


    const handleSearchInput = (e) => {
        setSearchTerm(e.target.value.toLowerCase().replace(/\s/g, ''));
    };

    const [clearAllModal, setClearAllModal] = useState(false);

    const handleClearConversations = () => {
        setClearAllModal(true);
    };

    const confirmClearAll = async () => {
        try {
            const q = query(
                collection(db, "chats"),
                where("members", "array-contains", currentUser.uid)
            );
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);

            snapshot.docs.forEach((chatDoc) => {
                const data = chatDoc.data();
                if (data.type !== 'group') {
                    // Fix: Hide specifically for current user instead of deleting the document
                    batch.update(chatDoc.ref, {
                        hiddenFor: arrayUnion(currentUser.uid)
                    });
                }
            });

            await batch.commit();
            onSelectUser(null);
        } catch (error) {
            console.error("Failed to clear conversations", error);
        } finally {
            setClearAllModal(false);
        }
    };

    const handleSelect = async (user) => {
        // Prevent click if it was a long press
        if (isLongPress.current) return;

        // If selecting from search results, check if we have a hidden chat with this user
        // user.uid exists for search results. user.chatId exists for recent chats.
        if (user.uid && !user.chatId) {
            try {
                const q = query(
                    collection(db, "chats"),
                    where("members", "array-contains", currentUser.uid)
                );
                const snapshot = await getDocs(q);
                // Filter client-side for the specific 1-on-1 chat
                const existingChat = snapshot.docs.find(doc => {
                    const data = doc.data();
                    return data.type !== 'group' && data.members.includes(user.uid);
                });

                if (existingChat) {
                    const data = existingChat.data();
                    // If it was hidden, unhide it immediately so it appears in the sidebar
                    if (data.hiddenFor && data.hiddenFor.includes(currentUser.uid)) {
                        await updateDoc(existingChat.ref, {
                            hiddenFor: arrayRemove(currentUser.uid)
                        });
                    }
                }
            } catch (e) {
                console.error("Error restoring chat:", e);
            }
        }

        onSelectUser(user);
        if (searchResults.length > 0) {
            setSearchTerm("");
            setSearchResults([]);
        }
        if (onClose) onClose();
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error("Failed to log out:", error);
            console.error("Failed to log out:", error);
            setErrorModal({ isOpen: true, message: "Failed to log out. Please check your connection." });
        }
    };

    return (
        <motion.div
            initial={false}
            animate={{
                x: 0,
                opacity: 1
            }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`user-list ${isOpen ? 'active' : ''} ${isChatActive ? 'is-chat-active' : ''}`}
        >
            <div className="sidebar-header">
                <div className="user-profile">
                    <img src={currentUser?.photoURL || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"} alt="Profile" className="profile-img" />
                </div>
                <div className="sidebar-actions">
                    <button onClick={handleLogout} className="logout-btn" title="Logout">
                        <IoExitOutline />
                    </button>
                </div>
            </div>

            <div className="search-bar-container">
                <div className="search-form" style={{ display: 'flex', width: '100%', alignItems: 'center', background: 'var(--glass-input)', borderRadius: '12px', padding: '0 10px' }}>
                    <input
                        type="text"
                        placeholder="Search username..."
                        value={searchTerm}
                        onChange={handleSearchInput}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', flex: 1, padding: '12px 5px', outline: 'none' }}
                    />
                    <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', display: 'flex' }}>
                        {searching ? <div className="spinner-small"></div> : <IoSearch />}
                    </div>
                </div>
            </div>

            <div className="chats-header" style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', marginBottom: '5px' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Chats</h4>
                <button
                    className="delete-chats-trigger"
                    onClick={handleClearConversations}
                    title="Clear all 1-to-1 conversations"
                >
                    <IoTrashBinOutline />
                </button>
            </div>

            <ul className="chats-list">
                {searchTerm ? (
                    <>
                        {searchResults.length > 0 && <li className="list-header" style={{ padding: '10px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Search Results</li>}

                        {searchResults.map((user) => (
                            <li
                                key={user.id}
                                className={`user-item ${selectedUser?.uid === user.uid ? 'active' : ''}`}
                                onClick={() => handleSelect(user)}
                            >
                                <img className="user-avatar" src={user.photoURL} alt={user.displayName} />
                                <div className="user-info">
                                    <span className="user-name-list">{user.displayName}</span>
                                    <span className="user-username">@{user?.username?.replace(/^@/, '') || 'user'}</span>
                                </div>
                            </li>
                        ))}

                        {searching && <li className="list-status">Searching...</li>}
                        {!searching && searchResults.length === 0 && <li className="list-status">No user found.</li>}
                    </>
                ) : (
                    <>
                        {recentChats.length === 0 && !loadingRecent && (
                            <li className="list-status">No conversations yet. Search to start one!</li>
                        )}
                        <div className="chats-scroll-area">
                            <AnimatePresence>
                                {recentChats.map((chat, i) => (
                                    <motion.li
                                        key={chat.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        whileHover={{ backgroundColor: "var(--glass-input)" }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`user-item ${selectedUser?.chatId === chat.chatId ? 'active' : ''}`}
                                        onClick={() => handleSelect(chat)}
                                        onContextMenu={(e) => handleContextMenu(e, chat)}
                                        onTouchStart={() => handleLongPressStart(chat)}
                                        onTouchEnd={handleLongPressEnd}
                                        onMouseDown={() => handleLongPressStart(chat)}
                                        onMouseUp={handleLongPressEnd}
                                        onMouseLeave={handleLongPressEnd}
                                    >
                                        <img className="user-avatar" src={chat.photoURL} alt={chat.displayName} />
                                        <div className="user-info">
                                            <div className="user-info-top">
                                                <span className="user-name-list">
                                                    {chat.isGroup ? chat.displayName : `@${chat?.username?.replace(/^@/, '') || 'user'}`}
                                                </span>
                                            </div>
                                            <div className="user-info-bottom">
                                                <span className="last-message">
                                                    {chat.unreadCount > 0 ? "New message" : ""}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Hover Delete Button for Desktop */}
                                        <button
                                            className="hover-delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteModal({ isOpen: true, chat });
                                            }}
                                            title="Delete Chat"
                                        >
                                            <IoTrashBinOutline />
                                        </button>

                                        {chat.unreadCount > 0 && selectedUser?.chatId !== chat.chatId && (
                                            <div className="unread-badge">{chat.unreadCount}</div>
                                        )}
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </div>
                    </>
                )}
            </ul>

            {/* Custom Delete Modal - Portaled */}
            {createPortal(
                <AnimatePresence>
                    {deleteModal.isOpen && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                                background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(3px)'
                            }}
                            onClick={() => setDeleteModal({ isOpen: false, chat: null })}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{
                                    background: '#09090b', padding: '30px', borderRadius: '16px', width: '350px', maxWidth: '85%',
                                    textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                    border: '1px solid #27272a'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.2rem', color: '#ffffff' }}>Delete chat?</h3>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                                    <button
                                        onClick={() => setDeleteModal({ isOpen: false, chat: null })}
                                        style={{
                                            padding: '10px 20px', borderRadius: '8px', border: '1px solid #3f3f46',
                                            background: 'transparent', color: '#ffffff', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDeleteChat}
                                        style={{
                                            padding: '10px 20px', borderRadius: '8px', border: 'none',
                                            background: '#ef4444', color: 'white', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        Delete chat
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Error Modal */}
            {errorModal.isOpen && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }} onClick={() => setErrorModal({ isOpen: false, message: '' })}>
                    <div style={{
                        background: '#18181b', padding: '25px', borderRadius: '16px',
                        maxWidth: '90%', width: '300px', textAlign: 'center',
                        border: '1px solid #27272a', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                        <h3 style={{ color: '#ef4444', marginBottom: '10px' }}>Error</h3>
                        <p style={{ color: '#d4d4d8', marginBottom: '20px' }}>{errorModal.message}</p>
                        <button onClick={() => setErrorModal({ isOpen: false, message: '' })}
                            style={{
                                padding: '8px 20px', background: '#3f3f46',
                                color: 'white', border: 'none', borderRadius: '8px',
                                cursor: 'pointer', fontWeight: '500'
                            }}>
                            Close
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Clear All Modal - Portaled */}
            {createPortal(
                <AnimatePresence>
                    {clearAllModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                                background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(3px)'
                            }}
                            onClick={() => setClearAllModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{
                                    background: '#09090b', padding: '30px', borderRadius: '16px', width: '350px', maxWidth: '85%',
                                    textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                    border: '1px solid #27272a'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: '#ffffff' }}>Clear all chats?</h3>
                                <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#a1a1aa' }}>Groups will not be deleted.</p>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                                    <button
                                        onClick={() => setClearAllModal(false)}
                                        style={{
                                            padding: '10px 20px', borderRadius: '8px', border: '1px solid #3f3f46',
                                            background: 'transparent', color: '#ffffff', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmClearAll}
                                        style={{
                                            padding: '10px 20px', borderRadius: '8px', border: 'none',
                                            background: '#ef4444', color: 'white', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        Clear all
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </motion.div>
    );
};

export default UserSearch;
