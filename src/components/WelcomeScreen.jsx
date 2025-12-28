import React from 'react';
import './WelcomeScreen.css';

const WelcomeScreen = ({ user }) => {
    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="welcome-avatar"
                />
                <div className="welcome-text-container">
                    <h2 className="welcome-label">WELCOME</h2>
                    <h1 className="welcome-name">
                        @{user.username || user.displayName}
                    </h1>
                </div>
            </div>
        </div>
    );
};

export default WelcomeScreen;
