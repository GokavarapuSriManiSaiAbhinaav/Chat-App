import React from 'react';
import './Loader.css';

const Loader = ({ message = "Syncing..." }) => {
    return (
        <div className="loader-container">
            <div className="loader-content">
                <div className="loader-rings">
                    <div className="ring"></div>
                    <div className="ring"></div>
                    <div className="ring"></div>
                </div>
                <h2 className="loader-text">{message}</h2>
            </div>
            <div className="loader-bg-glow"></div>
        </div>
    );
};

export default Loader;
