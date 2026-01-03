import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { IoTrash, IoPlay, IoPause, IoCheckmarkDone, IoCheckmark, IoStar, IoTime } from 'react-icons/io5';
import { auth } from '../firebase';
import './Message.css';

const Message = React.memo(({ message, onAction, onReply, highlightText }) => {
    // Destructure username as well
    const { text, uid, photoURL, createdAt, type, audioUrl, mediaUrl, imageUrl, fileName, read, username, displayName, isPending } = message;
    const isSent = uid === auth.currentUser.uid;
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = React.useRef(null);
    const longPressTimerRef = React.useRef(null);

    const toggleAudio = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            return format(timestamp.toDate(), 'HH:mm');
        } catch (e) {
            return '';
        }
    };

    const renderHighlightedText = () => {
        if (!text) return null;
        if (!highlightText || highlightText.length < 2) return text;

        // Escape regex special characters
        const escapedSearch = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedSearch})`, 'gi'));

        return parts.map((part, i) =>
            part.toLowerCase() === highlightText.toLowerCase() ?
                <mark key={i} style={{ backgroundColor: 'yellow', color: 'black', borderRadius: '2px', padding: '0 2px' }}>{part}</mark> : part
        );
    };

    const reactions = message.reactions || {};
    const reactionCounts = Object.values(reactions).reduce((acc, emoji) => {
        acc[emoji] = (acc[emoji] || 0) + 1;
        return acc;
    }, {});
    const sortedReactions = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]);

    console.log("Render message", message.id);
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                duration: 0.3
            }}
            className={`message-wrapper ${isSent ? 'sent' : 'received'}`}
            // Swipe to Reply Props
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, { offset }) => {
                if (offset.x > 50) {
                    if (onReply) onReply(message);
                }
            }}
        >
            {!isSent && <img className="message-avatar" src={photoURL} alt="avatar" loading="lazy" />}

            <div className="message-content-wrapper">
                {/* Show Username for received messages (Hide Google Name) */}
                {!isSent && type !== 'deleted' && (
                    <span style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '2px',
                        marginLeft: '4px',
                        display: 'block'
                    }}>
                        @{username ? username.replace(/^@/, '') : (displayName || 'user')}
                    </span>
                )}

                <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`message-bubble ${type || 'text'}`}
                    style={type === 'deleted' ? { fontStyle: 'italic', opacity: 0.8, background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)' } : { userSelect: 'none', WebkitUserSelect: 'none' }}
                    // Long Press for Mobile Action Sheet
                    onTouchStart={() => {
                        if (type !== 'deleted') {
                            longPressTimerRef.current = setTimeout(() => {
                                if (onAction) onAction();
                            }, 500);
                        }
                    }}
                    onTouchMove={() => {
                        if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                        }
                    }}
                    onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                        }
                    }}
                    // Desktop Right-Click
                    onContextMenu={(e) => {
                        e.preventDefault();
                        if (type !== 'deleted' && onAction) onAction();
                    }}
                >
                    {/* Quoted Reply */}
                    {message.replyTo && (
                        <div style={{
                            borderLeft: '4px solid var(--primary-color)',
                            background: 'rgba(0,0,0,0.05)',
                            padding: '4px 8px',
                            marginBottom: '4px',
                            borderRadius: '4px',
                            fontSize: '0.85rem'
                        }}>
                            <span style={{ fontWeight: 'bold', display: 'block', fontSize: '0.75rem' }}>
                                {message.replyTo.displayName || 'User'}
                            </span>
                            <span style={{
                                display: 'block',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                opacity: 0.8
                            }}>
                                {message.replyTo.text || (message.replyTo.type === 'audio' ? '🎵 Voice Message' : '📷 Image')}
                            </span>
                        </div>
                    )}

                    {type === 'deleted' && (
                        <p className="message-text">Is message ko delete kar diya gaya hai</p>
                    )}

                    {type === 'text' && <p className="message-text">{renderHighlightedText()}</p>}

                    {type === 'audio' && (
                        <div className="audio-message">
                            <button className="audio-play-btn" onClick={toggleAudio}>
                                {isPlaying ? <IoPause /> : <IoPlay />}
                            </button>
                            <div className="audio-wave">
                                <div className={`wave-bar ${isPlaying ? 'animating' : ''}`}></div>
                                <div className={`wave-bar ${isPlaying ? 'animating' : ''}`}></div>
                                <div className={`wave-bar ${isPlaying ? 'animating' : ''}`}></div>
                            </div>
                            <audio
                                ref={audioRef}
                                src={audioUrl}
                                onEnded={() => setIsPlaying(false)}
                                style={{ display: 'none' }}
                                preload="none"
                            />
                        </div>
                    )}

                    {type === 'image' && (
                        <div className="media-message">
                            <img
                                src={imageUrl || mediaUrl}
                                alt="media"
                                className="message-image"
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                    )}

                    {type === 'video' && (
                        <div className="media-message">
                            <video src={mediaUrl} controls className="message-video" preload="metadata" />
                        </div>
                    )}

                    <div className="message-meta">
                        {message.edited && <span style={{ marginRight: '4px', fontStyle: 'italic', opacity: 0.7, fontSize: '0.7em' }}>(edited)</span>}
                        {message.starredBy && message.starredBy.includes(auth.currentUser.uid) && (
                            <span style={{ marginRight: '4px', color: '#f1c40f', fontSize: '0.8em' }}><IoStar /></span>
                        )}
                        <span className="message-time">{formatTime(createdAt)}</span>
                        {isSent && type !== 'deleted' && (
                            <span className={`read-status ${read ? 'read' : ''}`} style={{ color: read ? '#53bdeb' : 'inherit' }}>
                                {isPending ? <IoTime /> : (read ? <IoCheckmarkDone /> : <IoCheckmark />)}
                            </span>
                        )}
                    </div>

                    {/* Reactions Display */}
                    {sortedReactions.length > 0 && (
                        <div className="message-reactions" style={{
                            display: 'flex',
                            gap: '4px',
                            marginTop: '2px', // Tighter spacing
                            paddingTop: '2px',
                            flexWrap: 'wrap',
                            justifyContent: isSent ? 'flex-end' : 'flex-start'
                        }}>
                            {sortedReactions.map(([emoji, count]) => (
                                <span key={emoji} style={{
                                    background: 'rgba(0,0,0,0.1)', // Light overlay
                                    borderRadius: '10px',
                                    padding: '2px 5px',
                                    fontSize: '0.8rem',
                                    lineHeight: '1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    cursor: 'default'
                                }}>
                                    {emoji} {count > 1 && <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>{count}</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Desktop Hover Icon (Hidden on touch devices by nature of hover, or explicit CSS if needed) */}
                {/* Desktop Hover Action Icon */}
                {type !== 'deleted' && (
                    <button className="message-delete-btn desktop-only" onClick={onAction} style={{ opacity: 0.5 }} title="Message Options">
                        <IoTrash />
                        {/* We use Trash icon as base but it triggers the menu now. 
                            Ideally switch to IoEllipsisVertical but IoTrash is what we have imported for now. 
                            User asked for "right click / hover", so this button acts as the hover trigger. 
                        */}
                    </button>
                )}
            </div>
        </motion.div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison to avoid re-renders if only 'read' status changes for old messages deep in the list (optional, but good for performance)
    // For now, strict equality on 'message' object ID and content fields is safer.
    // If message object is mutated in parent, this might fail, but Firestore returns new objects.
    return prevProps.message.id === nextProps.message.id &&
        prevProps.message.read === nextProps.message.read &&
        JSON.stringify(prevProps.message.starredBy || []) === JSON.stringify(nextProps.message.starredBy || []) &&
        prevProps.message.text === nextProps.message.text &&
        prevProps.message.edited === nextProps.message.edited &&
        prevProps.message.type === nextProps.message.type &&
        prevProps.highlightText === nextProps.highlightText &&
        JSON.stringify(prevProps.message.reactions || {}) === JSON.stringify(nextProps.message.reactions || {});
});

export default Message;
