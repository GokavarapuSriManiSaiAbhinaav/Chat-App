import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IoSearch, IoChatbubblesOutline, IoRocketOutline, IoSparklesOutline } from 'react-icons/io5';
import './EmptyState.css';

const EmptyState = ({ onSearch }) => {
    const [searchTerm, setSearchTerm] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (searchTerm.trim().length >= 3 && onSearch) {
            onSearch(searchTerm.trim().toLowerCase());
        }
    };

    return (
        <div className="empty-state">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="empty-state-content"
            >
                <motion.div
                    animate={{
                        y: [0, -15, 0],
                        rotate: [0, 5, 0, -5, 0]
                    }}
                    transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="empty-icon-wrapper"
                >
                    <IoChatbubblesOutline />
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="icon-glow"
                    />
                </motion.div>

                <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    Your next conversation starts here
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    Search for a friend or create a group to begin the magic.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="empty-search-container"
                >
                    <form onSubmit={handleSubmit}>
                        <div className="empty-search-box">
                            <IoSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Enter username..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <button type="submit" disabled={!searchTerm.trim()}>
                                Start Chat
                            </button>
                        </div>
                    </form>
                </motion.div>


            </motion.div>


        </div>
    );
};

export default EmptyState;
