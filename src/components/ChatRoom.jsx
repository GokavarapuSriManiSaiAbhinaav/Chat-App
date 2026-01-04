import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from "framer-motion";
import Message from "./Message";
import MoodHint from './MoodHint';
import { detectMood } from '../utils/moodDetector';
import UserSearch from "./UserSearch";
import EmptyState from "./EmptyState";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc, updateDoc, writeBatch, limit, getDocs, where, increment, arrayUnion, arrayRemove, deleteField, Timestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { uploadToCloudinary } from "../utils/cloudinary";
import { IoSend, IoMic, IoStop, IoTrash, IoAttach, IoArrowBack, IoClose, IoPeople, IoPersonAdd, IoPencil, IoSearch, IoChevronUp, IoChevronDown, IoStar, IoTimer } from "react-icons/io5";
import { MdEmojiEmotions, MdDelete } from 'react-icons/md';
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));
import AddMemberModal from './AddMemberModal';
import { BsEmojiSmileFill } from "react-icons/bs";
import "./ChatRoom.css";

const ChatRoom = (props) => {
    const { selectedUser, setSelectedUser } = props;
    // Mobile Layout Logic: If standard viewport width < 768px (common breakpoint), 
    // AND a chat is NOT selected, we should not render this component at all to avoid overlap.
    // However, CSS media queries usually handle display:none. 
    // The user asked for NO CSS changes. So we must force it here.
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    const isChatActive = !!selectedUser;
    const dummy = useRef();
    const [messages, setMessages] = useState([]);
    const [formValue, setFormValue] = useState("");
    const [currentMood, setCurrentMood] = useState(null);
    const [chatId, setChatId] = useState(null);
    const [chatClearedAt, setChatClearedAt] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [selectedMessageForAction, setSelectedMessageForAction] = useState(null); // { message, isSender }
    const [editingMessage, setEditingMessage] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [messageSearchTerm, setMessageSearchTerm] = useState("");
    const [matchedMessageIds, setMatchedMessageIds] = useState([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [viewingStarredMessages, setViewingStarredMessages] = useState(false);
    const [starredMessages, setStarredMessages] = useState([]);
    const [disappearingMode, setDisappearingMode] = useState("off"); // off, 24h, 7d
    const [isTimerMenuOpen, setIsTimerMenuOpen] = useState(false);
    const [messagesLimit, setMessagesLimit] = useState(20);
    const typingTimeoutRef = useRef(null);

    // Custom Confirm Dialog state
    // We strictly use this for ALL alerts now to be "consistent on laptop and mobile"
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false,
        title: '',
        message: '',
        isDanger: false,
        onConfirm: null,
        showCancel: true, // New prop to toggle Cancel button (false for simple alerts)
        confirmText: 'Confirm',
        cancelText: 'Cancel'
    });

    // Helper to show generic alert modal
    const showAlert = (title, message) => {
        setConfirmDialog({
            isOpen: true,
            title,
            message,
            isDanger: false,
            showCancel: false,
            confirmText: "OK",
            onConfirm: () => { }
        });
    };

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [recordingDuration, setRecordingDuration] = useState(0); // Timer state
    const [pendingVoiceMessage, setPendingVoiceMessage] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const shouldScrollBottomRef = useRef(false); // Flag for smart auto-scroll
    const isInitialLoadRef = useRef(true); // Flag for instant initial scroll
    const shouldSendRef = useRef(true); // Ref to check if we should send or discard
    const fileInputRef = useRef(null);

    // Preload Audio to prevent lag
    const notificationAudioRef = useRef(new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3"));
    useEffect(() => {
        notificationAudioRef.current.preload = 'auto'; // Preload on mount
        notificationAudioRef.current.volume = 0.5;
    }, []);

    // Helper: Generate deterministic chat ID
    const getChatId = useCallback((uid1, uid2) => {
        return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
    }, []);

    // Effect: Listen to Chat Document for Typing Status and Disappearing Mode
    useEffect(() => {
        if (!chatId) {
            setPartnerTyping(false);
            setDisappearingMode("off"); // Reset disappearing mode when no chat is selected
            return;
        }

        const chatDocRef = doc(db, "chats", chatId);
        const unsubscribeChatDoc = onSnapshot(chatDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                // Check if the OTHER user is typing
                const otherUid = selectedUser?.uid;
                if (data.typing && data.typing[otherUid]) {
                    setPartnerTyping(true);
                } else {
                    setPartnerTyping(false);
                }

                // Track Cleared At
                if (data.clearedAt && data.clearedAt[auth.currentUser.uid]) {
                    setChatClearedAt(data.clearedAt[auth.currentUser.uid]);
                } else {
                    setChatClearedAt(null);
                }

                // Sync Disappearing Mode
                if (data.disappearingMode) {
                    setDisappearingMode(data.disappearingMode);
                } else {
                    setDisappearingMode("off");
                }
            }
        });

        return () => unsubscribeChatDoc();
    }, [chatId, selectedUser]);

    // Effect: Listen to private messages AND mark as read
    useEffect(() => {
        if (!chatId) {
            setMessages([]);
            return;
        }

        const collectionRef = collection(db, "chats", chatId, "messages");
        // Use desc order to get LAST N messages, then reverse them for display
        const q = query(collectionRef, orderBy("createdAt", "desc"), limit(messagesLimit));

        const unsubscribeMessages = onSnapshot(q, (querySnapshot) => {
            let msgs = [];
            let unreadIds = [];
            const currentUser = auth.currentUser;
            const now = Date.now();

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // Disappearing Messages Filter
                if (data.expiresAt && data.expiresAt.toMillis() < now) {
                    // Opportunistic Delete if I am the sender (to clean up DB)
                    if (data.uid === auth.currentUser.uid) {
                        deleteDoc(doc.ref).catch(err => console.error("Auto-delete error", err));
                    }
                    return;
                }

                // Filter out cleared messages
                let isCleared = false;
                if (chatClearedAt && data.createdAt && data.createdAt.toMillis() <= chatClearedAt.toMillis()) {
                    isCleared = true;
                }

                if (data.deletedFor && data.deletedFor.includes(auth.currentUser.uid)) {
                    isCleared = true;
                }

                if (!isCleared) {
                    msgs.push({ ...data, id: doc.id });
                    if (!data.read && data.uid !== currentUser.uid) {
                        unreadIds.push(doc.id);
                    }
                }
            });

            // Reverse to show oldest first (since we queried desc)
            setMessages(msgs.reverse());

            // Mark unread messages as read in batch
            if (unreadIds.length > 0 && isChatActive && document.visibilityState === 'visible') {
                // Read Receipts Privacy Check
                if (userSettings?.privacy?.readReceipts !== false) {
                    const batch = writeBatch(db);
                    unreadIds.forEach(id => {
                        const docRef = doc(db, "chats", chatId, "messages", id);
                        batch.update(docRef, { read: true });
                    });
                    batch.commit().catch(console.error);
                }
            }

            // Notification Sounds & Vibrations (New Message from Partner)
            if (msgs.length > 0 && messages.length > 0) {
                const latestMsg = msgs[msgs.length - 1];
                const isNew = latestMsg.id !== messages[messages.length - 1]?.id;
                const isFromPartner = latestMsg.uid !== auth.currentUser.uid;

                if (isNew && isFromPartner) {
                    // Sound removed as per user request
                    /*
                    if (userSettings?.notifications?.sound !== false) {
                        const audio = notificationAudioRef.current;
                        if (audio) {
                            audio.currentTime = 0;
                            audio.play().catch(e => console.log("Audio play failed", e));
                        }
                    }
                    */
                    if (userSettings?.notifications?.vibration !== false && navigator.vibrate) {
                        navigator.vibrate(200);
                    }
                }
            }

            // Scroll ONLY on initial load of this chat
            // For subsequent updates, we let user scroll manually or handle via separate logic (e.g. only if they sent it)
            // setTimeout(() => {
            //    dummy.current?.scrollIntoView({ behavior: "smooth" });
            // }, 100);
        });

        return () => unsubscribeMessages();
    }, [chatId, chatClearedAt, messagesLimit, isChatActive]);

    // AI Mood Detector (Fixed Trigger & Auto-run)
    useEffect(() => {
        // Re-enable AI for groups as well
        if (!messages.length || !selectedUser) {
            setCurrentMood(null);
            return;
        }

        const timer = setTimeout(() => {
            const detectedValue = detectMood(messages);
            // Only update if mood actually changed to prevent re-renders (optional but good)
            setCurrentMood(prev => {
                if (!detectedValue) return null;
                if (prev && prev.id === detectedValue.id && prev.score === detectedValue.score) return prev;
                return detectedValue;
            });
        }, 100);

        return () => clearTimeout(timer);
    }, [messages]);

    // Effect: Smart Scroll on New Sent Message & Initial Load
    useEffect(() => {
        if (isInitialLoadRef.current) {
            dummy.current?.scrollIntoView({ behavior: "auto" });
            isInitialLoadRef.current = false;
        } else if (shouldScrollBottomRef.current) {
            dummy.current?.scrollIntoView({ behavior: "smooth" });
            shouldScrollBottomRef.current = false;
        }
    }, [messages]);

    // Effect: Recording Timer
    useEffect(() => {
        let interval;
        if (isRecording) {
            setRecordingDuration(0);
            interval = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } else {
            setRecordingDuration(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };


    const [selectedUserData, setSelectedUserData] = useState(null);
    const [userSettings, setUserSettings] = useState(null);

    // Listen for Current User Settings
    useEffect(() => {
        if (!auth.currentUser) return;
        const unsub = onSnapshot(doc(db, "users", auth.currentUser.uid), (doc) => {
            if (doc.exists()) setUserSettings(doc.data());
        });
        return () => unsub();
    }, []);

    // 1. Listen for partner's real-time status
    useEffect(() => {
        if (!selectedUser || selectedUser.isGroup) { // Don't track status for groups
            setSelectedUserData(null);
            return;
        }

        const userRef = doc(db, "users", selectedUser.uid);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                setSelectedUserData(docSnap.data());
            }
        });

        return () => unsubscribe();
    }, [selectedUser]);

    // Effect: Reset unread count when chat changes
    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!chatId || !currentUser) return;

        const chatDocRef = doc(db, "chats", chatId);
        updateDoc(chatDocRef, {
            [`unreadCount.${currentUser.uid}`]: 0
        });

    }, [chatId, auth.currentUser?.uid]);



    const formatLastSeen = (timestamp) => {
        if (!timestamp) return "Unknown";
        const date = timestamp.toDate();
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "Just now";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    // Privacy Logic for Status (HMR Force)
    const canSeeStatus = useMemo(() => {
        if (!selectedUserData) return false;
        const privacy = selectedUserData.privacy?.lastSeen || 'everyone';
        if (privacy === 'nobody') return false;
        if (privacy === 'contacts') return true; // Implement strict contact check if needed later
        return true;
    }, [selectedUserData]);

    const handleSelectUser = useCallback(async (user) => {
        if (!user) return;

        setSelectedUser(user);
        const currentUser = auth.currentUser;
        const newChatId = user.isGroup ? user.id : getChatId(currentUser.uid, user.uid);

        // Ensure chat document exists
        const chatDocRef = doc(db, "chats", newChatId);
        const chatSnap = await getDoc(chatDocRef);

        // Initialize unread counts if new, or reset if existing
        if (!chatSnap.exists()) {
            const initialData = {
                members: user.isGroup ? user.members : [currentUser.uid, user.uid],
                createdAt: serverTimestamp(),
                lastInteraction: serverTimestamp(),
                type: user.isGroup ? 'group' : 'private',
                groupName: user.isGroup ? user.displayName : null,
                groupPhotoURL: user.isGroup ? user.photoURL : null,
                unreadCount: {}
            };
            initialData.members.forEach(memberUid => {
                initialData.unreadCount[memberUid] = 0;
            });
            await setDoc(chatDocRef, initialData);
        } else {
            // Immediately reset unread count for current user to avoid badge lag
            await updateDoc(chatDocRef, {
                [`unreadCount.${currentUser.uid}`]: 0
            });
        }

        setChatId(newChatId);
        setChatId(newChatId);
        setShowEmojiPicker(false);
        // Reset Search & Pagination
        setIsSearching(false);
        setMessageSearchTerm("");
        setMatchedMessageIds([]);
        setCurrentMatchIndex(-1);
        setMessagesLimit(20);
        setMatchedMessageIds([]);
        setCurrentMatchIndex(-1);
        setMessagesLimit(20);

        // Mark as initial load for this new chat to trigger instant scroll
        isInitialLoadRef.current = true;
        // setTimeout(() => dummy.current?.scrollIntoView({ behavior: "auto" }), 100);
    }, [getChatId, setSelectedUser]);

    const handleDeleteGroup = async () => {
        setConfirmDialog({
            isOpen: true,
            title: "Delete Group",
            message: "Are you sure you want to delete this group? This will remove all messages for everyone.",
            isDanger: true,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, "chats", chatId));
                    setSelectedUser(null);
                    setChatId(null);
                } catch (error) {
                    if (isGroupAdmin(selectedUser)) {
                        // Delete Group Code...
                    } else {
                        showAlert("Error", "Failed to delete group.");
                    }
                }
            }
        });
    };

    const handleClearChat = async () => {
        setConfirmDialog({
            isOpen: true,
            title: "Clear Chat",
            message: "Clear this chat? Messages will be removed for you only.",
            isDanger: true,
            onConfirm: async () => {
                try {
                    const currentUser = auth.currentUser;
                    const chatDocRef = doc(db, "chats", chatId);
                    await updateDoc(chatDocRef, {
                        [`clearedAt.${currentUser.uid}`]: serverTimestamp(),
                    });
                    setMessages([]); // Instant local clear
                } catch (error) {
                    console.error("Error clearing chat:", error);
                    showAlert("Error", "Failed to clear chat");
                }
            }
        });
    };


    const toggleSearch = () => {
        if (isSearching) {
            setIsSearching(false);
            setMessageSearchTerm("");
            setMatchedMessageIds([]);
            setCurrentMatchIndex(-1);
        } else {
            setIsSearching(true);
            setTimeout(() => document.getElementById("message-search-input")?.focus(), 100);
        }
    };

    const performMessageSearch = (term) => {
        setMessageSearchTerm(term);
        if (term.length < 2) {
            setMatchedMessageIds([]);
            setCurrentMatchIndex(-1);
            return;
        }

        // Search in loaded messages (Reverse to start from newest)
        const matches = messages
            .filter(msg => msg.type === 'text' && msg.text && msg.text.toLowerCase().includes(term.toLowerCase()))
            .map(msg => msg.id)
            .reverse(); // Newest first

        setMatchedMessageIds(matches);
        if (matches.length > 0) {
            setCurrentMatchIndex(0);
            scrollToMessage(matches[0]);
        } else {
            setCurrentMatchIndex(-1);
        }
    };

    const scrollToMessage = (msgId) => {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add momentary flash highlight? handled by Message.jsx highlightText likely
        }
    };

    const nextMatch = () => {
        if (matchedMessageIds.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % matchedMessageIds.length;
        setCurrentMatchIndex(nextIndex);
        scrollToMessage(matchedMessageIds[nextIndex]);
    };



    const prevMatch = () => {
        if (matchedMessageIds.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + matchedMessageIds.length) % matchedMessageIds.length;
        setCurrentMatchIndex(prevIndex);
        scrollToMessage(matchedMessageIds[prevIndex]);
    };

    const toggleStarMessage = async (message) => {
        if (!chatId || !message) return;
        const msgRef = doc(db, "chats", chatId, "messages", message.id);
        const isStarred = message.starredBy && message.starredBy.includes(auth.currentUser.uid);

        try {
            await updateDoc(msgRef, {
                starredBy: isStarred ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
            });
        } catch (error) {
            console.error("Error toggling star:", error);
        }
    };

    const toggleStarredView = async () => {
        if (viewingStarredMessages) {
            setViewingStarredMessages(false);
            setStarredMessages([]);
        } else {
            setViewingStarredMessages(true);
            try {
                const q = query(
                    collection(db, "chats", chatId, "messages"),
                    where("starredBy", "array-contains", auth.currentUser.uid)
                );
                const querySnapshot = await getDocs(q);
                const starred = [];
                querySnapshot.forEach((doc) => {
                    starred.push({ id: doc.id, ...doc.data() });
                });
                // Sort client-side to avoid index requirement
                starred.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });
                setStarredMessages(starred);
            } catch (error) {
                console.error("Error fetching starred messages:", error);
            }
        }
    };

    const jumpToStarredMessage = (msgId) => {
        setViewingStarredMessages(false);
        // Wait for UI to switch back
        setTimeout(() => {
            scrollToMessage(msgId);
        }, 300);
    };

    const updateDisappearingMode = async (mode) => {
        setIsTimerMenuOpen(false);
        if (!chatId) return;
        try {
            await updateDoc(doc(db, "chats", chatId), {
                disappearingMode: mode
            });
        } catch (error) {
            console.error("Error setting disappearing mode:", error);
        }
    };

    const loadMoreMessages = () => {
        setMessagesLimit(prev => prev + 20);
    };

    // Auto-refresh to hide expired messages every minute
    useEffect(() => {
        const interval = setInterval(() => {
            if (messages.length > 0) {
                const now = Date.now();
                const hasExpired = messages.some(msg => msg.expiresAt && msg.expiresAt.toMillis() < now);
                if (hasExpired) {
                    console.log("🧹 removing expired messages client-side");
                    setMessages(current => current.filter(msg => !msg.expiresAt || msg.expiresAt.toMillis() > now));
                }
            }
        }, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [messages]);

    // Ensure typing indicator is reset when message deleted (optional safety)
    useEffect(() => {
        if (!chatId || !auth.currentUser) return;
        return () => {
            // Cleanup typing on unmount/chat change
            const chatDocRef = doc(db, "chats", chatId);
            updateDoc(chatDocRef, {
                [`typing.${auth.currentUser.uid}`]: false
            }).catch(() => { });
        };
    }, [chatId]);

    // Helper Style for Action Sheet Buttons
    const actionSheetBtnStyle = {
        padding: '15px',
        borderRadius: '12px',
        border: 'none',
        background: 'rgba(255,255,255,0.05)',
        color: 'var(--text-main)',
        fontSize: '1rem',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    };

    const deleteMessage = useCallback(async (messageId, isSender) => {
        // Redundant with new system but keeping for safety if called elsewhere
        if (!chatId || !messageId) return;
        setSelectedMessageForAction({ id: messageId, isSender, showDeleteConfirm: true });
    }, [chatId]);

    const handleReaction = useCallback(async (message, emoji) => {
        if (!chatId || !message) return;
        const messageRef = doc(db, "chats", chatId, "messages", message.id);
        const currentUser = auth.currentUser;

        // Optimistic UI update or just wait for listener? Listener is fast enough usually.
        // Toggle logic:
        const currentReaction = message.reactions && message.reactions[currentUser.uid];
        const newReaction = currentReaction === emoji ? deleteField() : emoji;

        try {
            await setDoc(messageRef, {
                reactions: {
                    [currentUser.uid]: newReaction
                }
            }, { merge: true });
        } catch (error) {
            console.error("Error reacting:", error);
        }
        setSelectedMessageForAction(null);
    }, [chatId, auth.currentUser]);

    const startEditing = useCallback((msg) => {
        setEditingMessage(msg);
        setFormValue(msg.text);
        if (dummy.current) dummy.current.scrollIntoView({ behavior: "smooth" });
    }, []);

    const cancelEditing = useCallback(() => {
        setEditingMessage(null);
        setFormValue("");
    }, []);

    const handleUpdateMessage = async () => {
        if (!editingMessage || !formValue.trim()) return;
        try {
            const msgRef = doc(db, "chats", chatId, "messages", editingMessage.id);
            await updateDoc(msgRef, {
                text: formValue,
                isEdited: true
            });
            setEditingMessage(null);
            setFormValue("");
        } catch (error) {
            console.error("Error updating message:", error);
        }
    };

    const handleOpenActionSheet = useCallback((msg) => {
        if (!msg) return;
        setSelectedMessageForAction({ ...msg, isSender: msg.uid === auth.currentUser.uid });
    }, [auth.currentUser.uid]);

    const handleReply = useCallback((msg) => {
        setReplyingTo(msg);
        dummy.current?.scrollIntoView({ behavior: "smooth" });


    }, []);

    const handleMessageAction = (action, message) => {
        if (!message) return;
        const isSender = message.uid === auth.currentUser.uid;

        switch (action) {
            case 'edit':
                startEditing(message);
                setSelectedMessageForAction(null);
                break;
            case 'reply':
                handleReply(message);
                setSelectedMessageForAction(null);
                break;
            case 'copy':
                navigator.clipboard.writeText(message.text || "");
                setSelectedMessageForAction(null);
                // Optional: Show toast
                break;
            case 'delete':
                if (!chatId) return;
                // Reuse mostly existing confirmDelete
                setSelectedMessageForAction({ ...message, showDeleteConfirm: true });
                return;
            case 'star':
                toggleStarMessage(message);
                setSelectedMessageForAction(null);
                return;
            case 'delete-confirm-me':
                confirmDelete('me', message);
                break;
            case 'delete-confirm-everyone':
                confirmDelete('everyone', message);
                break;
            default:
                break;
        }
    };

    const confirmDelete = async (action, msgOverride) => {
        // If passed msgOverride or use selectedMessageForAction
        const targetMsg = msgOverride || selectedMessageForAction;
        if (!targetMsg || !chatId) return;

        const { id, isSender } = targetMsg;
        let deleteAction = action;

        // Safety: If not sender, force 'me'
        if (!isSender && action === 'everyone') {
            deleteAction = 'me';
        }

        try {
            const collectionRef = collection(db, "chats", chatId, "messages");
            const msgRef = doc(collectionRef, id);

            if (deleteAction === 'everyone' && isSender) {
                await updateDoc(msgRef, {
                    type: 'deleted',
                    text: 'This message was deleted',
                    isDeleted: true,
                    audioUrl: null,
                    imageUrl: null,
                    mediaUrl: null,
                    replyTo: null
                });
            } else {
                // Delete for me
                const currentUser = auth.currentUser;
                await updateDoc(msgRef, {
                    deletedFor: arrayUnion(currentUser.uid)
                });
            }
        } catch (error) {
            console.error(error);
            showAlert("Error", "Failed to delete message.");
        } finally {
            setSelectedMessageForAction(null);
        }
    };

    const handleEmptyStateSearch = async (username) => {
        const q = query(collection(db, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            if (userData.uid !== auth.currentUser.uid) {
                handleSelectUser({ id: userDoc.id, ...userData });
            }
        } else {
            showAlert("Result", "No user found with that username.");
        }
    };

    const isTypingLocalRef = useRef(false);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setFormValue(val);

        // Typing Privacy Check
        if (userSettings?.privacy?.typing === false) return;

        if (!chatId || !selectedUser) return;

        const currentUser = auth.currentUser;
        const chatDocRef = doc(db, "chats", chatId);

        // If starting to type
        if (val.length > 0) {
            if (!isTypingLocalRef.current) {
                isTypingLocalRef.current = true;
                updateDoc(chatDocRef, {
                    [`typing.${currentUser.uid}`]: true
                }).catch(() => { });
            }

            // Clear existing timeout
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

            // Set timeout to stop typing after 2 seconds of inactivity
            typingTimeoutRef.current = setTimeout(() => {
                isTypingLocalRef.current = false;
                updateDoc(chatDocRef, {
                    [`typing.${currentUser.uid}`]: false
                }).catch(() => { });
            }, 2000);
        } else {
            // Stopped typing (empty input) immediately
            if (isTypingLocalRef.current) {
                isTypingLocalRef.current = false;
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                updateDoc(chatDocRef, {
                    [`typing.${currentUser.uid}`]: false
                }).catch(() => { });
            }
        }
    };

    const startRecording = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setConfirmDialog({
                isOpen: true,
                title: "Not Supported",
                message: "Voice recording is not supported in this browser or requires a secure (HTTPS) connection.",
                isDanger: false,
                showCancel: false,
                confirmText: "OK",
                onConfirm: () => { }
            });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const recordedType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });

                if (shouldSendRef.current && audioBlob.size > 0) {
                    await sendVoiceMessage(audioBlob);
                }

                // Stop all tracks 
                stream.getTracks().forEach(track => track.stop());
            };

            // Specify timeslice to ensure dataavailable fires regularly
            mediaRecorder.start(1000);
            setIsRecording(true);
            shouldSendRef.current = true; // Default to send
        } catch (err) {
            console.error("Error accessing microphone:", err);
            setConfirmDialog({
                isOpen: true,
                title: "Microphone Access Denied",
                message: "Could not access microphone. Please ensure specific permissions are granted in your browser settings.",
                isDanger: false,
                showCancel: false,
                confirmText: "OK",
                onConfirm: () => { }
            });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            shouldSendRef.current = true;
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            shouldSendRef.current = false;
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const sendVoiceMessage = async (audioBlob) => {
        if (!chatId) return;
        const { uid, photoURL, displayName } = auth.currentUser;

        // Optimistic UI: Create temporary Blob URL
        const tempAudioUrl = URL.createObjectURL(audioBlob);
        setPendingVoiceMessage({
            id: `temp-${Date.now()}`,
            text: "",
            audioUrl: tempAudioUrl,
            type: "audio",
            createdAt: Timestamp.now(), // Use Firestore Timestamp for consistency
            uid,
            photoURL,
            displayName,
            read: false,
            isPending: true
        });

        setIsUploading(true);
        setUploadError(null);
        setTimeout(() => dummy.current?.scrollIntoView({ behavior: "smooth" }), 10);

        try {
            // Start Cloudinary Upload
            const audioUrl = await uploadToCloudinary(audioBlob, 'video');

            // Add to Firestore
            const collectionRef = collection(db, "chats", chatId, "messages");
            const chatDocRef = doc(db, "chats", chatId);

            const messageData = {
                text: "",
                audioUrl: audioUrl,
                type: "audio",
                createdAt: serverTimestamp(),
                uid,
                photoURL,
                displayName,
                read: false,
                ...(disappearingMode !== 'off' && {
                    expiresAt: Timestamp.fromDate(new Date(Date.now() + (disappearingMode === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)))
                }),
                reactions: {}
            };

            await addDoc(collectionRef, messageData);

            const updates = {
                [`typing.${uid}`]: false,
                lastInteraction: serverTimestamp(),
                lastMessage: "Voice message" // Sync lastMessage
            };

            if (selectedUser.isGroup) {
                selectedUser.members?.forEach(mUid => {
                    if (mUid !== uid) {
                        updates[`unreadCount.${mUid}`] = increment(1);
                    }
                });
            } else {
                const otherUid = selectedUser?.uid;
                updates[`unreadCount.${otherUid}`] = increment(1);
            }

            // Flag to scroll after render
            shouldScrollBottomRef.current = true;
            await updateDoc(chatDocRef, updates);

        } catch (error) {
            setUploadError(`Failed to send: ${error.message}`);
            console.error("Voice Msg Error:", error);
            showAlert("Error", `Failed to send voice message: ${error.message}`);
        } finally {
            setIsUploading(false);
            setPendingVoiceMessage(null); // Remove temp message (real one will be in snapshot)
            // Revoke blob URL to free memory
            // URL.revokeObjectURL(tempAudioUrl); // Actually better to keep it a bit until unmount or let garbage collector handle if component unmounts? 
            // Revoking immediately might break playback if we switch to Real URL abruptly? 
            // The browser handles ObjectURL lifecycle fairly well, but good practice to revoke.
            // I'll skip revocation for now to avoid complexity with race conditions on playback.
        }
    };

    const handleMediaUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !chatId) return;

        const { uid, photoURL, displayName } = auth.currentUser;
        setIsUploading(true);
        setUploadError(null);

        try {
            const messageId = `${Date.now()}_${uid}`;
            const fileType = 'image'; // Enforce image only as per req (or check if user selects video but we only support image in UI)
            if (!file.type.startsWith('image/')) {
                throw new Error("Only images are supported.");
            }

            // Removed 'file' type check block as we check above


            // Cloudinary Upload
            // console.log(`Uploading ${file.size} bytes (${fileType})...`);

            const imageUrl = await uploadToCloudinary(file, 'image');

            const collectionRef = collection(db, "chats", chatId, "messages");
            const chatDocRef = doc(db, "chats", chatId);

            const messageData = {
                text: "",
                imageUrl: imageUrl, // Changed from mediaUrl to imageUrl as per req
                type: fileType,
                fileName: file.name,
                createdAt: serverTimestamp(),
                uid,
                photoURL,
                displayName,
                read: false,
                ...(disappearingMode !== 'off' && {
                    expiresAt: Timestamp.fromDate(new Date(Date.now() + (disappearingMode === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)))
                }),
                reactions: {}
            };

            await addDoc(collectionRef, messageData);

            const updates = {
                [`typing.${uid}`]: false,
                lastInteraction: serverTimestamp(),
                lastMessage: `${fileType === 'image' ? 'Image' : 'Video'} sent`, // Sync lastMessage
                hiddenFor: [] // Ensure chat is visible to all members
            };

            if (selectedUser.isGroup) {
                selectedUser.members?.forEach(mUid => {
                    if (mUid !== uid) {
                        updates[`unreadCount.${mUid}`] = increment(1);
                    }
                });
            } else {
                const otherUid = selectedUser?.uid;
                updates[`unreadCount.${otherUid}`] = increment(1);
            }

            // Flag to scroll after render
            shouldScrollBottomRef.current = true;
            await updateDoc(chatDocRef, updates);

            // Removing the old immediate scroll to rely on the effect
            // dummy.current?.scrollIntoView({ behavior: "smooth" });

        } catch (error) {
            console.error(error);
            showAlert("Upload Error", `Failed to upload media: ${error.message}`);
        } finally {
            setIsUploading(false);
            e.target.value = null; // Reset input
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        const { uid, photoURL, displayName } = auth.currentUser;

        if (editingMessage) {
            await handleUpdateMessage();
            return;
        }

        const textToSend = formValue;
        const replyContext = replyingTo;

        if (!textToSend.trim() || !chatId) return;

        // Optimistic UI: Clear Input Immediately
        setFormValue("");
        setShowEmojiPicker(false);
        setReplyingTo(null);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        // Flag to scroll after render
        shouldScrollBottomRef.current = true;
        // Removed optimistic timeout scroll to prevent "fighting"
        // setTimeout(() => dummy.current?.scrollIntoView({ behavior: "smooth" }), 10);

        try {
            const collectionRef = collection(db, "chats", chatId, "messages");
            const chatDocRef = doc(db, "chats", chatId);

            const messageData = {
                text: textToSend,
                createdAt: serverTimestamp(),
                uid: auth.currentUser.uid,
                photoURL: auth.currentUser.photoURL,
                type: 'text',
                replyTo: replyContext ? {
                    id: replyContext.id,
                    text: replyContext.text || "Media",
                    displayName: replyContext.displayName || "User",
                    type: replyContext.type
                } : null,
                ...(disappearingMode !== 'off' && {
                    expiresAt: Timestamp.fromDate(new Date(Date.now() + (disappearingMode === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)))
                }),
                reactions: {}
            };

            await addDoc(collectionRef, messageData);

            // Reset typing status and increment unread for members
            const updates = {
                [`typing.${uid}`]: false,
                lastInteraction: serverTimestamp(),
                lastMessage: textToSend, // Sync lastMessage
                hiddenFor: [] // Ensure chat is visible to all members (un-delete/un-clear)
            };

            if (selectedUser.isGroup) {
                // Increment unread for all members EXCEPT current user
                selectedUser.members?.forEach(mUid => {
                    if (mUid !== uid) {
                        updates[`unreadCount.${mUid}`] = increment(1);
                    }
                });
            } else {
                const otherUid = selectedUser?.uid;
                updates[`unreadCount.${otherUid}`] = increment(1);
            }

            await updateDoc(chatDocRef, updates);



        } catch (error) {
            // Error handling
        }
    };





    const onEmojiClick = useCallback((emojiObject) => {
        setFormValue(prev => prev + emojiObject.emoji);
    }, []);

    const handleKeyDown = () => { };

    // if (isMobile && !selectedUser) return null; // REMOVED: This killed the sidebar too!

    return (
        <div className={`chat-room ${selectedUser ? 'is-chat-selected' : ''}`}>
            <UserSearch
                onSelectUser={handleSelectUser}
                selectedUser={selectedUser}
                isChatActive={!!selectedUser}
                isOpen={props.isMenuOpen}
                onClose={props.closeMenu}
            />
            {/* Logic: On Mobile, if no user selected, Hide ChatBox so Sidebar (UserSearch) is full screen.
                On Desktop, always show ChatBox (EmptyState or Chat).
            */}
            <div className="chat-box" style={{ display: (isMobile && !selectedUser) ? 'none' : undefined }}>
                {/* Animated Background Layer */}
                <div className="chat-bg-mesh"></div>
                <div className="chat-bg-ambient">
                    <div className="orb orb-1"></div>
                    <div className="orb orb-2"></div>
                    <div className="orb orb-3"></div>
                    <div className="star star-1"></div>
                    <div className="star star-2"></div>
                    <div className="star star-3"></div>
                    <div className="star star-4"></div>
                </div>

                {selectedUser ? (
                    <motion.div
                        key={chatId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.3 }}
                        className="chat-content-container"
                    >
                        <div className="chat-header">
                            <button className="back-btn" onClick={() => setSelectedUser(null)}>
                                <IoArrowBack />
                            </button>
                            {!isSearching && (
                                <div className="header-user-info">
                                    <div className="avatar-wrapper">
                                        <img
                                            src={selectedUser.photoURL || selectedUser.avatarUrl || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"}
                                            alt="avatar"
                                            className="header-avatar"
                                        />
                                        <span className={`status-dot ${selectedUser.isGroup ? 'hidden' : (canSeeStatus && selectedUserData?.isOnline ? 'online' : 'offline')}`}></span>
                                    </div>
                                    <div className="user-details">
                                        <h3>
                                            {selectedUser.isGroup
                                                ? selectedUser.displayName
                                                : (`@${selectedUser.username?.replace(/^@/, '') || 'user'}` || selectedUser.displayName)}
                                        </h3>
                                        <span className="user-status">
                                            {selectedUser.isGroup
                                                ? `${selectedUser.members?.length || 0} members`
                                                : (canSeeStatus
                                                    ? (selectedUserData?.isOnline ? 'Online' : `Last seen ${formatLastSeen(selectedUserData?.lastSeen)}`)
                                                    : ''
                                                )}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {isSearching ? (
                                <div className="search-overlay-header" style={{
                                    position: 'absolute',
                                    left: '50px',
                                    right: '60px',
                                    top: '10px',
                                    bottom: '10px',
                                    background: 'var(--bg-secondary)', // or similar header bg
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 10px',
                                    borderRadius: '8px',
                                    gap: '10px',
                                    zIndex: 10
                                }}>
                                    <input
                                        id="message-search-input"
                                        value={messageSearchTerm}
                                        onChange={(e) => performMessageSearch(e.target.value)}
                                        placeholder="Find in chat..."
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'var(--text-main)',
                                            outline: 'none',
                                            flex: 1,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                    {matchedMessageIds.length > 0 && (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {currentMatchIndex + 1} of {matchedMessageIds.length}
                                        </span>
                                    )}
                                    <div style={{ display: 'flex' }}>
                                        <button onClick={nextMatch} disabled={matchedMessageIds.length === 0} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '5px' }}>
                                            <IoChevronUp />
                                        </button>
                                        <button onClick={prevMatch} disabled={matchedMessageIds.length === 0} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '5px' }}>
                                            <IoChevronDown />
                                        </button>
                                    </div>
                                    <button onClick={toggleSearch} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '5px' }}>
                                        <IoClose />
                                    </button>
                                </div>
                            ) : null}
                            {!isSearching && (
                                <div className="header-actions">
                                    {selectedUser.isGroup && (
                                        <>
                                            <button className="header-action-btn" onClick={() => setIsAddMemberModalOpen(true)} title="Add Members">
                                                <IoPersonAdd />
                                            </button>
                                            <button className="header-delete-btn" onClick={handleDeleteGroup} title="Delete Group">
                                                <MdDelete />
                                            </button>
                                        </>
                                    )}
                                    <button className="header-action-btn" onClick={toggleStarredView} title="Starred Messages" style={{ color: viewingStarredMessages ? '#f1c40f' : 'inherit' }}>
                                        <IoStar />
                                    </button>
                                    <div style={{ position: 'relative' }}>
                                        <button className="header-action-btn" onClick={() => setIsTimerMenuOpen(!isTimerMenuOpen)} title="Disappearing Messages" style={{ color: disappearingMode !== 'off' ? 'var(--primary-color)' : 'inherit' }}>
                                            <IoTimer />
                                        </button>
                                        {isTimerMenuOpen && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                right: 0,
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                padding: '5px',
                                                zIndex: 20,
                                                width: '120px',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                            }}>
                                                {['off', '24h', '7d'].map(mode => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => updateDisappearingMode(mode)}
                                                        style={{
                                                            display: 'block',
                                                            width: '100%',
                                                            padding: '8px',
                                                            textAlign: 'left',
                                                            background: disappearingMode === mode ? 'var(--primary-color)' : 'transparent',
                                                            color: disappearingMode === mode ? '#fff' : 'var(--text-main)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        {mode === 'off' ? 'Off' : (mode === '24h' ? '24 Hours' : '7 Days')}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button className="header-action-btn" onClick={toggleSearch} title="Search Messages">
                                        <IoSearch />
                                    </button>
                                    <button className="header-action-btn" onClick={handleClearChat} title="Clear Chat">
                                        <IoTrash />
                                    </button>
                                </div>
                            )}
                        </div>

                        <AddMemberModal
                            isOpen={isAddMemberModalOpen}
                            onClose={() => setIsAddMemberModalOpen(false)}
                            chatId={chatId}
                            currentMembers={selectedUser.members || []}
                        />

                        {/* Starred Messages Overlay */}
                        {viewingStarredMessages ? (
                            <div className="messages-area" style={{ background: 'var(--bg-secondary)', zIndex: 5 }}>
                                <div style={{ padding: '15px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold' }}>Starred Messages</span>
                                    <button onClick={toggleStarredView} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}><IoClose size={20} /></button>
                                </div>
                                <div className="messages-container" style={{ padding: '10px' }}>
                                    {starredMessages.length === 0 ? (
                                        <div style={{ textAlign: 'center', marginTop: '50px', color: 'var(--text-secondary)' }}>No starred messages yet.</div>
                                    ) : (
                                        starredMessages.map(msg => (
                                            <div key={msg.id} onClick={() => jumpToStarredMessage(msg.id)} style={{ cursor: 'pointer', opacity: 0.9 }}>
                                                <Message message={msg} />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="messages-area" onClick={() => setShowEmojiPicker(false)}>
                                <div className="messages-container">
                                    {messages.length >= messagesLimit && (
                                        <button onClick={loadMoreMessages} style={{
                                            width: '100%',
                                            padding: '10px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--primary-color)',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            opacity: 0.7
                                        }}>
                                            Load Older Messages
                                        </button>
                                    )}
                                    <AnimatePresence initial={false}>
                                        {messages && messages.map((msg) => (
                                            <Message
                                                key={msg.id}
                                                id={`msg-${msg.id}`} // Add ID for anchor support
                                                message={msg}
                                                highlightText={messageSearchTerm} // Pass search term
                                                // Pass handler that opens Action Sheet
                                                onAction={handleOpenActionSheet}
                                                onReply={handleReply}
                                            />
                                        ))}
                                        {pendingVoiceMessage && (
                                            <Message
                                                key={pendingVoiceMessage.id}
                                                message={pendingVoiceMessage}
                                                onAction={() => { }} // No actions on pending
                                                onReply={() => { }} // No reply on pending
                                            />
                                        )}
                                    </AnimatePresence>
                                    {partnerTyping && (
                                        <div className="typing-indicator-wrapper">
                                            <div className="typing-indicator">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={dummy}></div>
                                </div>
                            </div>
                        )}

                        <div className="input-container">
                            {showEmojiPicker && (
                                <div className="emoji-picker-wrapper">
                                    <React.Suspense fallback={<div className="emoji-loader">Loading Emojis...</div>}>
                                        <EmojiPicker
                                            onEmojiClick={onEmojiClick}
                                            width="100%"
                                            height={350}
                                            theme="auto"
                                        />
                                    </React.Suspense>
                                </div>
                            )}

                            <MoodHint mood={currentMood} />

                            {replyingTo && (
                                <div style={{
                                    padding: '8px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--glass-bg)',
                                    backdropFilter: 'blur(10px)',
                                    borderTop: '1px solid var(--glass-border)',
                                    borderBottom: '1px solid var(--glass-border)',
                                    marginBottom: '-1px', // Merge with input
                                    borderTopLeftRadius: '20px', // Match input rounded corners approx
                                    borderTopRightRadius: '20px',
                                    maxWidth: '900px', // Match chat-form
                                    margin: '0 auto -1px auto' // Center and overlap
                                }}>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <span style={{ display: 'block', fontSize: '12px', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                                            Replying to {replyingTo.displayName || 'User'}
                                        </span>
                                        <span style={{
                                            fontSize: '12px',
                                            opacity: 0.7,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: 'block',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {replyingTo.text || (replyingTo.type === 'audio' ? '🎵 Voice Message' : (replyingTo.type === 'image' ? '📷 Image' : 'Media'))}
                                        </span>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer', padding: '4px', marginLeft: '10px' }}>
                                        <IoClose />
                                    </button>
                                </div>
                            )}

                            <form onSubmit={sendMessage} className="chat-form">
                                {editingMessage && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: 0,
                                        right: 0,
                                        background: 'var(--bg-secondary)',
                                        padding: '10px 15px',
                                        borderTop: '1px solid var(--border-color)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        zIndex: 10
                                    }}>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>Editing Message</span>
                                        <button type="button" onClick={cancelEditing} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                            <IoClose size={20} />
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="emoji-btn"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    disabled={isRecording}
                                >
                                    <BsEmojiSmileFill />
                                </button>

                                <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp"
                                    style={{ display: 'none' }}
                                    ref={fileInputRef}
                                    onChange={handleMediaUpload}
                                />

                                <button
                                    type="button"
                                    className="attach-btn"
                                    onClick={() => fileInputRef.current.click()}
                                    disabled={isRecording || isUploading}
                                >
                                    <IoAttach />
                                </button>

                                {isRecording ? (
                                    <div className="recording-status">
                                        <span className="recording-dot"></span>
                                        <span className="recording-timer">{formatDuration(recordingDuration)}</span>
                                        <button type="button" className="discard-btn" onClick={cancelRecording} title="Discard Recording">
                                            <IoTrash />
                                        </button>
                                        <span className="recording-label">Recording...</span>
                                    </div>
                                ) : (
                                    <input
                                        className="chat-input"
                                        value={formValue}
                                        onChange={handleInputChange}
                                        onFocus={() => setShowEmojiPicker(false)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                // If setting is strictly "Off", prevent send. Default is allow (undefined/true)
                                                if (userSettings?.chatSettings?.enterToSend === false) {
                                                    e.preventDefault();
                                                }
                                            }
                                        }}
                                        placeholder={selectedUser.isDeletedUser ? "Can't send message to deleted user" : `Message ${selectedUser.username ? '@' + selectedUser.username.replace(/^@/, '') : selectedUser.displayName}...`}
                                        disabled={selectedUser.isDeletedUser}
                                    />
                                )}

                                {formValue.trim() ? (
                                    <button type="submit" className="send-btn">
                                        <IoSend />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className={`mic-btn ${isRecording ? 'recording' : ''} ${isUploading ? 'uploading' : ''}`}
                                        onClick={() => {
                                            if (userSettings?.mediaSettings?.allowVoice === false) {
                                                setConfirmDialog({
                                                    isOpen: true,
                                                    title: "Voice Disabled",
                                                    message: "Voice messages are disabled in your Settings.",
                                                    isDanger: false,
                                                    showCancel: false,
                                                    confirmText: "OK",
                                                    onConfirm: () => { }
                                                });
                                                return;
                                            }
                                            isRecording ? stopRecording() : startRecording();
                                        }}
                                        disabled={isUploading || selectedUser.isDeletedUser}
                                        style={{ opacity: (userSettings?.mediaSettings?.allowVoice === false || selectedUser.isDeletedUser) ? 0.5 : 1 }}
                                    >
                                        {isUploading ? (
                                            <div className="mic-loader"></div>
                                        ) : isRecording ? (
                                            <IoSend />
                                        ) : (
                                            <IoMic />
                                        )}
                                    </button>
                                )}
                            </form>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="empty-state-wrapper"
                    >
                        <EmptyState onSearch={handleEmptyStateSearch} />
                    </motion.div>
                )}

                {/* Custom Confirm Dialog Overlay */}
                {/* Custom Confirmation Modal (Portal) */}
                {confirmDialog.isOpen && createPortal(
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)', // Darker overlay
                        zIndex: 2200,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(3px)'
                    }} onClick={(e) => { e.stopPropagation(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}>
                        <div style={{
                            background: '#09090b', // Hardcoded Dark BG
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
                                {confirmDialog.showCancel !== false && (
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
                                        {confirmDialog.cancelText || "Cancel"}
                                    </button>
                                )}
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
                                    {confirmDialog.confirmText || "Confirm"}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Unified Action Sheet Modal */}
                {/* Unified Action Sheet Modal (Portal) */}
                {selectedMessageForAction && createPortal(
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        zIndex: 9999, // High Z-Index to stay on top
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        backdropFilter: 'blur(3px)'
                    }} onClick={() => setSelectedMessageForAction(null)}>
                        {/* If showing Delete Confirmation Sub-modal */}
                        {selectedMessageForAction.showDeleteConfirm ? (
                            <div style={{
                                backgroundColor: '#09090b', // Hardcoded Dark
                                padding: '30px',
                                borderRadius: '16px',
                                width: '90%',
                                maxWidth: '350px',
                                marginBottom: 'auto',
                                marginTop: 'auto', // Centered
                                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
                                textAlign: 'center',
                                border: '1px solid #27272a'
                            }} onClick={(e) => e.stopPropagation()}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#ffffff' }}>Delete Message?</h3>
                                <p style={{ margin: '0 0 24px 0', color: '#a1a1aa', fontSize: '0.9rem' }}>
                                    {selectedMessageForAction.uid === auth.currentUser.uid
                                        ? "Delete for everyone or just for yourself?"
                                        : "This will delete the message from your device only."}
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {selectedMessageForAction.uid === auth.currentUser.uid && (
                                        <button
                                            onClick={() => handleMessageAction('delete-confirm-everyone', selectedMessageForAction)}
                                            style={{
                                                padding: '12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: '#ef4444',
                                                color: 'white',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Delete for everyone
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleMessageAction('delete-confirm-me', selectedMessageForAction)}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid #3f3f46',
                                            background: 'transparent',
                                            color: '#ffffff',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Delete for me
                                    </button>
                                    <button
                                        onClick={() => setSelectedMessageForAction(null)}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#a1a1aa',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                backgroundColor: 'var(--glass-bg)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid var(--glass-border)',
                                width: '100%',
                                maxWidth: '500px',
                                borderTopLeftRadius: '24px',
                                borderTopRightRadius: '24px',
                                padding: '20px 20px 40px 20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '15px',
                                boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.3)',
                                animation: 'slideUp 0.3s ease-out'
                            }} onClick={(e) => e.stopPropagation()}>
                                {/* Drag Handle */}
                                <div style={{ width: '40px', height: '4px', background: 'var(--text-secondary)', borderRadius: '2px', opacity: 0.3, margin: '0 auto 10px auto' }}></div>

                                {/* Reaction Bar */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '0 10px' }}>
                                    {['❤️', '😂', '😮', '😢', '😡', '👍'].map(emoji => (
                                        <button
                                            key={emoji}
                                            onClick={() => handleReaction(selectedMessageForAction, emoji)}
                                            style={{
                                                background: selectedMessageForAction.reactions?.[auth.currentUser.uid] === emoji ? 'rgba(255,255,255,0.2)' : 'transparent',
                                                border: 'none',
                                                fontSize: '1.8rem',
                                                cursor: 'pointer',
                                                padding: '8px',
                                                borderRadius: '50%',
                                                transition: 'transform 0.1s'
                                            }}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>

                                <button onClick={() => handleMessageAction('reply', selectedMessageForAction)} style={actionSheetBtnStyle}>
                                    Reply
                                </button>

                                <button onClick={() => handleMessageAction('star', selectedMessageForAction)} style={actionSheetBtnStyle}>
                                    {selectedMessageForAction.starredBy?.includes(auth.currentUser.uid) ? 'Unstar Message' : 'Star Message'}
                                </button>

                                {selectedMessageForAction.uid === auth.currentUser.uid &&
                                    selectedMessageForAction.type === 'text' &&
                                    (!selectedMessageForAction.createdAt || Date.now() - selectedMessageForAction.createdAt.toMillis() < 5 * 60 * 1000) && (
                                        <button onClick={() => handleMessageAction('edit', selectedMessageForAction)} style={actionSheetBtnStyle}>
                                            Edit Message
                                        </button>
                                    )}

                                <button onClick={() => handleMessageAction('copy', selectedMessageForAction)} style={actionSheetBtnStyle}>
                                    Copy Text
                                </button>
                                <button onClick={() => handleMessageAction('delete', selectedMessageForAction)} style={{ ...actionSheetBtnStyle, color: '#ff4757' }}>
                                    Delete
                                </button>
                                <button onClick={() => setSelectedMessageForAction(null)} style={{ ...actionSheetBtnStyle, marginTop: '10px', color: 'var(--text-secondary)' }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
            </div>
        </div >
    );
};

export default ChatRoom;
