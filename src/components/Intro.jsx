import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import './Intro.css';

const Intro = ({ onFinish }) => {
    const [isFadingOut, setIsFadingOut] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsFadingOut(true);
            setTimeout(onFinish, 800); // Wait for fade out animation
        }, 2500);

        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <div className={`intro-container ${isFadingOut ? 'fade-out' : ''}`}>
            <div className="vignette"></div>
            <div className="film-grain"></div>
            <div className="particles-bg">
                {[...Array(20)].map((_, i) => (
                    <span key={i} className="particle"></span>
                ))}
            </div>
            <div className="intro-content">
                <h1 className="intro-title" data-text="YOU & ME">
                    YOU <span className="ampersand">&</span> ME
                </h1>

                <p className="intro-subtitle">created by ABHI</p>
                <div className="sweep-line"></div>
            </div>
        </div>
    );
};

export default Intro;
