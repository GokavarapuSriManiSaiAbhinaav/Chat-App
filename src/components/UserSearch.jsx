import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoSearch, IoTrashBinOutline } from 'react-icons/io5';
import { collection, query, where, onSnapshot, getDocs, getDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import "./UserList.css";

const UserSearch = ({ onSelectUser, selectedUser, isChatActive, isOpen, onClose }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [activeChats, setActiveChats] = useState([]);
    const [loadingChats, setLoadingChats] = useState(true);
    const { currentUser } = useAuth();

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
                        if (!otherUid) return null;

                        const userCache = JSON.parse(localStorage.getItem(`user_${otherUid}`));
                        if (userCache) {
                            return {
                                id: chatDoc.id,
                                chatId: chatDoc.id,
                                ...userCache,
                                unreadCount: data.unreadCount?.[currentUser.uid] || 0,
                                lastInteraction: data.lastInteraction,
                                lastMessage: data.lastMessage,
                                lastMessageSender: data.lastMessageSender
                            };
                        }

                        const userRef = doc(db, "users", otherUid);
                        const userSnap = await getDoc(userRef);
                        const userData = userSnap.exists() ? userSnap.data() : null;

                        if (userData) {
                            localStorage.setItem(`user_${otherUid}`, JSON.stringify(userData));
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

            setActiveChats(sortedChats);
            setLoadingChats(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (searchTerm.length < 3) return;

        setSearching(true);
        try {
            const q = query(collection(db, "users"), where("username", "==", searchTerm.toLowerCase()));
            const querySnapshot = await getDocs(q);

            let results = [];
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData.uid !== currentUser.uid) {
                    results.push({ id: doc.id, ...userData });
                }
            });
            setSearchResults(results);
        } catch (err) {
            // Search error
        } finally {
            setSearching(false);
        }
    };

    const handleClearConversations = async () => {
        if (!window.confirm("Clear all 1-to-1 conversations? Groups will not be deleted.")) return;

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
                    batch.delete(chatDoc.ref);
                }
            });

            await batch.commit();
            onSelectUser(null);
        } catch (error) {
            alert("Failed to clear conversations.");
        }
    };

    const handleSelect = (user) => {
        onSelectUser(user);
        // Clear search if we selected someone from search results
        if (searchResults.length > 0) {
            setSearchTerm("");
            setSearchResults([]);
        }
        if (onClose) onClose();
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
            {/* Sidebar Ambient Layer */}
            <div className="sidebar-ambient">
                <div className="sidebar-pulse"></div>
            </div>

            <div className="sidebar-header">
                <h3>Chats</h3>
                <button
                    className="clear-convos-btn"
                    onClick={handleClearConversations}
                    title="Clear all 1-to-1 conversations"
                >
                    <IoTrashBinOutline />
                    <span>Clear</span>
                </button>
            </div>

            <form onSubmit={handleSearch} className="search-form">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search username..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    />
                    <button type="submit">
                        <IoSearch />
                    </button>
                </div>
            </form>

            <ul className="chats-list">
                {searchTerm ? (
                    <>
                        {searchResults.length > 0 && <li className="list-header">Search Results</li>}

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
                        <li className="list-header">Conversations</li>
                        {activeChats.length === 0 && !loadingChats && (
                            <li className="list-status">No conversations yet. Search to start one!</li>
                        )}
                        <div className="chats-scroll-area">
                            <AnimatePresence>
                                {activeChats.map((chat, i) => (
                                    <motion.li
                                        key={chat.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        whileHover={{ backgroundColor: "var(--glass-input)" }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`user-item ${selectedUser?.chatId === chat.chatId ? 'active' : ''}`}
                                        onClick={() => onSelectUser(chat)}
                                    >
                                        <img className="user-avatar" src={chat.photoURL} alt={chat.displayName} />
                                        <div className="user-info">
                                            <div className="user-info-top">
                                                <span className="user-name-list">
                                                    {chat.isGroup ? chat.displayName : `@${chat?.username?.replace(/^@/, '') || 'user'}`}
                                                </span>
                                            </div>
                                            <div className="user-info-bottom">
                                                <span className={`last-message ${chat.unreadCount > 0 ? 'unread' : ''}`}>
                                                    {chat.unreadCount > 0 ? "New message" : (chat.lastMessage || (chat.isGroup ? "Group Chat" : "Private Chat"))}
                                                </span>
                                            </div>
                                        </div>
                                        {chat.unreadCount > 0 && (
                                            <div className="unread-badge">{chat.unreadCount}</div>
                                        )}
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </div>
                    </>
                )}
            </ul>
        </motion.div >
    );
};

export default UserSearch;
