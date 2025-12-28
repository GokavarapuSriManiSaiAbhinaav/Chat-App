import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './MoodHint.css';

const MoodHint = ({ mood }) => {
    return (
        <AnimatePresence>
            {mood && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="mood-hint-container"
                >
                    <motion.div
                        animate={{
                            boxShadow: [
                                "0 0 0px rgba(var(--primary-color-rgb), 0)",
                                "0 0 15px rgba(var(--primary-color-rgb), 0.2)",
                                "0 0 0px rgba(var(--primary-color-rgb), 0)"
                            ]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="mood-hint-card"
                    >
                        <span className="mood-emoji">{mood.emoji}</span>
                        <span className="mood-text">{mood.text}</span>
                        <div className="mood-pulse"></div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default MoodHint;
