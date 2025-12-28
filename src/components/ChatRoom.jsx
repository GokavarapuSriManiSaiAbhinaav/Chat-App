import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Message from "./Message";
import MoodHint from './MoodHint';
import { detectMood } from '../utils/moodDetector';
import UserSearch from "./UserSearch";
import EmptyState from "./EmptyState";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc, updateDoc, writeBatch, limit, getDocs, where, increment } from "firebase/firestore";
import { db, auth } from "../firebase";
import { uploadToCloudinary } from "../utils/cloudinary";
import { IoSend, IoMic, IoStop, IoTrash, IoAttach, IoArrowBack, IoClose, IoPeople, IoPersonAdd } from "react-icons/io5";
import { MdEmojiEmotions, MdDelete } from 'react-icons/md';
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));
import AddMemberModal from './AddMemberModal';
import { BsEmojiSmileFill } from "react-icons/bs";
import "./ChatRoom.css";

const ChatRoom = (props) => {
    const { selectedUser, setSelectedUser } = props;
    const dummy = useRef();
    const [messages, setMessages] = useState([]);
    const [formValue, setFormValue] = useState("");
    const [currentMood, setCurrentMood] = useState(null);
    const [chatId, setChatId] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
    const [partnerTyping, setPartnerTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [recordingDuration, setRecordingDuration] = useState(0); // Timer state
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const shouldSendRef = useRef(true); // Ref to check if we should send or discard
    const fileInputRef = useRef(null);

    // Helper: Generate deterministic chat ID
    const getChatId = useCallback((uid1, uid2) => {
        return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
    }, []);

    // Effect: Listen to Chat Document for Typing Status
    useEffect(() => {
        if (!chatId) {
            setPartnerTyping(false);
            return;
        }

        const chatDocRef = doc(db, "chats", chatId);
        const unsubscribe = onSnapshot(chatDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                // Check if the OTHER user is typing
                // We stored typing as { userId: boolean }
                const otherUid = selectedUser?.uid;
                if (data.typing && data.typing[otherUid]) {
                    setPartnerTyping(true);
                } else {
                    setPartnerTyping(false);
                }
            }
        });

        return () => unsubscribe();
    }, [chatId, selectedUser]);

    // Effect: Listen to private messages AND mark as read
    useEffect(() => {
        setMessages([]);

        if (!chatId) return;

        const collectionRef = collection(db, "chats", chatId, "messages");
        const q = query(collectionRef, orderBy("createdAt"));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            let msgs = [];
            let unreadIds = [];
            const currentUser = auth.currentUser;

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                msgs.push({ ...data, id: doc.id });

                // Collect unread messages sent by the OTHER user
                if (!data.read && data.uid !== currentUser.uid) {
                    unreadIds.push(doc.id);
                }
            });
            setMessages(msgs);

            // Mark unread messages as read in batch
            if (unreadIds.length > 0) {
                const batch = writeBatch(db);
                unreadIds.forEach(id => {
                    const docRef = doc(db, "chats", chatId, "messages", id);
                    batch.update(docRef, { read: true });
                });
                batch.commit();
            }

            setTimeout(() => {
                dummy.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        });

        return () => unsubscribe();
    }, [chatId]);

    // AI Mood Detector (Fixed Trigger & Auto-run)
    useEffect(() => {
        // Re-enable AI for groups as well
        if (!messages.length || !selectedUser) {
            setCurrentMood(null);
            return;
        }

        const timer = setTimeout(() => {
            const detectedValue = detectMood(messages);
            setCurrentMood(detectedValue);
        }, 600); // 600ms debounce for stability

        return () => clearTimeout(timer);
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

    const handleSelectUser = useCallback(async (user) => {
        if (!user) return;

        setSelectedUser(user);
        const currentUser = auth.currentUser;
        const newChatId = user.isGroup ? user.id : getChatId(currentUser.uid, user.uid);

        // Ensure chat document exists
        const chatDocRef = doc(db, "chats", newChatId);
        const chatSnap = await getDoc(chatDocRef);

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
            // Initialize unread counts for all members to 0
            initialData.members.forEach(memberUid => {
                initialData.unreadCount[memberUid] = 0;
            });
            await setDoc(chatDocRef, initialData);
        }

        setChatId(newChatId);
        setShowEmojiPicker(false);
    }, [getChatId, setSelectedUser]);

    const handleDeleteGroup = async () => {
        if (!window.confirm("Are you sure you want to delete this group? This will remove all messages for everyone.")) return;

        try {
            await deleteDoc(doc(db, "chats", chatId));
            setSelectedUser(null);
            setChatId(null);
        } catch (error) {
            alert("Failed to delete group.");
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
            alert("No user found with that username.");
        }
    };

    const isTypingLocalRef = useRef(false);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setFormValue(val);

        if (!chatId) return;

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
            alert("Could not access microphone. Please allow permissions.");
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

        setIsUploading(true);
        setUploadError(null);

        try {
            // 1. Prepare Storage Reference - REMOVED for Cloudinary
            // const messageId = `${Date.now()}_${uid}`;
            // const ext = audioBlob.type.includes('ogg') ? 'ogg' :
            //     audioBlob.type.includes('mp4') ? 'mp4' : 'webm';

            // const storageRef = ref(storage, `voiceMessages/${chatId}/${messageId}.${ext}`);


            // 2. Upload using Cloudinary
            // We removed uploadBytesResumable
            // const metadata = {
            //     contentType: audioBlob.type,
            // };

            // const uploadTask = uploadBytesResumable(storageRef, audioBlob, metadata);
            // We do direct upload now




            // Start Cloudinary Upload
            const audioUrl = await uploadToCloudinary(audioBlob, 'video'); // Cloudinary handles audio as video or raw usually, 'video' is safer for audio playback


            // 3. Add to Firestore
            const collectionRef = collection(db, "chats", chatId, "messages");
            const chatDocRef = doc(db, "chats", chatId);

            await addDoc(collectionRef, {
                text: "", // Empty text for audio message
                audioUrl: audioUrl,
                type: "audio",
                createdAt: serverTimestamp(),
                uid,
                photoURL,
                displayName,
                read: false
            });

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

            await updateDoc(chatDocRef, updates);

            dummy.current?.scrollIntoView({ behavior: "smooth" });

        } catch (error) {
            setUploadError(`Failed to send: ${error.message}`);
            alert(`Failed to send voice message: ${error.message}`);
        } finally {
            setIsUploading(false);
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

            await addDoc(collectionRef, {
                text: "",
                imageUrl: imageUrl, // Changed from mediaUrl to imageUrl as per req
                type: fileType,
                fileName: file.name,
                createdAt: serverTimestamp(),
                uid,
                photoURL,
                displayName,
                read: false
            });

            const updates = {
                [`typing.${uid}`]: false,
                lastInteraction: serverTimestamp(),
                lastMessage: `${fileType === 'image' ? 'Image' : 'Video'} sent` // Sync lastMessage
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

            await updateDoc(chatDocRef, updates);

            dummy.current?.scrollIntoView({ behavior: "smooth" });

        } catch (error) {
            alert(`Failed to upload media: ${error.message}`);
        } finally {
            setIsUploading(false);
            e.target.value = null; // Reset input
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        const { uid, photoURL, displayName } = auth.currentUser;

        if (!formValue.trim() || !chatId) return;

        try {
            const collectionRef = collection(db, "chats", chatId, "messages");
            const chatDocRef = doc(db, "chats", chatId);

            await addDoc(collectionRef, {
                text: formValue,
                type: "text", // Explicit type
                createdAt: serverTimestamp(),
                uid,
                photoURL,
                displayName,
                read: false
            });

            // Reset typing status and increment unread for members
            const updates = {
                [`typing.${uid}`]: false,
                lastInteraction: serverTimestamp(),
                lastMessage: formValue // Sync lastMessage
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
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

            setFormValue("");
            setShowEmojiPicker(false);
            dummy.current.scrollIntoView({ behavior: "smooth" });
        } catch (error) {
            // Error handling
        }
    };

    const deleteMessage = async (messageId) => {
        if (!chatId || !messageId) return;

        if (window.confirm("Are you sure you want to delete this message?")) {
            try {
                await deleteDoc(doc(db, "chats", chatId, "messages", messageId));
            } catch (error) {
                alert("Failed to delete message.");
            }
        }
    };

    const onEmojiClick = useCallback((emojiObject) => {
        setFormValue(prev => prev + emojiObject.emoji);
    }, []);

    const handleKeyDown = () => { };

    return (
        <div className={`chat-room ${selectedUser ? 'is-chat-selected' : ''}`}>
            <UserSearch
                onSelectUser={handleSelectUser}
                selectedUser={selectedUser}
                isChatActive={!!selectedUser}
                isOpen={props.isMenuOpen}
                onClose={props.closeMenu}
            />
            <div className="chat-box">
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
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.3 }}
                        className="chat-content-container"
                    >
                        <div className="chat-header">
                            <button className="back-btn" onClick={() => setSelectedUser(null)}>
                                <IoArrowBack />
                            </button>
                            <div className="header-user-info">
                                <div className="avatar-wrapper">
                                    <img
                                        src={selectedUser.photoURL || selectedUser.avatarUrl || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"}
                                        alt="avatar"
                                        className="header-avatar"
                                    />
                                    <span className={`status-dot ${selectedUser.isGroup ? 'hidden' : (selectedUserData?.isOnline ? 'online' : 'offline')}`}></span>
                                </div>
                                <div className="user-details">
                                    <h3>
                                        {selectedUser.isGroup
                                            ? selectedUser.displayName
                                            : (selectedUser.displayName || selectedUser.name || `@${selectedUser.username?.replace(/^@/, '') || 'user'}`)}
                                    </h3>
                                    <span className="user-status">
                                        {selectedUser.isGroup
                                            ? `${selectedUser.members?.length || 0} members`
                                            : (selectedUserData?.isOnline ? 'Online' : `Last seen ${formatLastSeen(selectedUserData?.lastSeen)}`)}
                                    </span>
                                </div>
                            </div>
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
                            </div>
                        </div>

                        <AddMemberModal
                            isOpen={isAddMemberModalOpen}
                            onClose={() => setIsAddMemberModalOpen(false)}
                            chatId={chatId}
                            currentMembers={selectedUser.members || []}
                        />

                        <div className="messages-area" onClick={() => setShowEmojiPicker(false)}>
                            <div className="messages-container">
                                <AnimatePresence initial={false}>
                                    {messages && messages.map((msg) => (
                                        <Message
                                            key={msg.id}
                                            message={msg}
                                            onDelete={() => deleteMessage(msg.id)}
                                        />
                                    ))}
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

                            <form onSubmit={sendMessage} className="chat-form">
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
                                        placeholder={`Message ${selectedUser.displayName}...`}
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
                                        onClick={isRecording ? stopRecording : startRecording}
                                        disabled={isUploading}
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
            </div>
        </div>
    );
};

export default ChatRoom;
