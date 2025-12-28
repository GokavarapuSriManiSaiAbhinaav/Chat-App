import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { IoTrash, IoPlay, IoPause, IoCheckmarkDone, IoCheckmark } from 'react-icons/io5';
import { auth } from '../firebase';
import './Message.css';

const Message = React.memo(({ message, onDelete }) => {
    const { text, uid, photoURL, createdAt, type, audioUrl, mediaUrl, imageUrl, fileName, read } = message;
    const isSent = uid === auth.currentUser.uid;
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = React.useRef(null);

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
        >
            {!isSent && <img className="message-avatar" src={photoURL} alt="avatar" loading="lazy" />}

            <div className="message-content-wrapper">
                <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`message-bubble ${type || 'text'}`}
                >
                    {type === 'text' && <p className="message-text">{text}</p>}

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
                        <span className="message-time">{formatTime(createdAt)}</span>
                        {isSent && (
                            <span className={`read-status ${read ? 'read' : ''}`}>
                                {read ? <IoCheckmarkDone /> : <IoCheckmark />}
                            </span>
                        )}
                    </div>
                </motion.div>

                {isSent && (
                    <button className="message-delete-btn" onClick={onDelete}>
                        <IoTrash />
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
        prevProps.message.text === nextProps.message.text;
});

export default Message;
