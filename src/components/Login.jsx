
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { FcGoogle } from "react-icons/fc";
import "./Login.css";

const Login = () => {
    const { signInWithGoogle } = useAuth();
    const [signingIn, setSigningIn] = useState(false);
    const [error, setError] = useState("");

    // Lamp & Drag State
    const [isLampOn, setIsLampOn] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragY, setDragY] = useState(0);
    const [startY, setStartY] = useState(0);

    const MAX_DRAG = 150; // Max pixels the wire can stretch
    const TOGGLE_THRESHOLD = 100; // Pull distance to trigger toggle

    // Start Dragging
    const handleStart = (y) => {
        setIsDragging(true);
        setStartY(y);
    };

    // While Dragging
    const handleMove = (y) => {
        if (!isDragging) return;
        const diff = y - startY;
        // Only allow pulling down (positive diff), cap at MAX_DRAG
        const newDragY = Math.max(0, Math.min(diff, MAX_DRAG));
        setDragY(newDragY);
    };

    // End Dragging
    const handleEnd = () => {
        if (!isDragging) return;

        if (dragY > TOGGLE_THRESHOLD) {
            setIsLampOn(prev => !prev);
        }

        // Reset
        setIsDragging(false);
        setDragY(0);
    };

    // Mouse Events
    const onMouseDown = (e) => handleStart(e.clientY);
    const onMouseMove = (e) => handleMove(e.clientY);
    const onMouseUp = () => handleEnd();

    // Touch Events
    const onTouchStart = (e) => handleStart(e.touches[0].clientY);
    const onTouchMove = (e) => handleMove(e.touches[0].clientY);
    const onTouchEnd = () => handleEnd();

    // Make sure we stop dragging if mouse leaves window or goes up anywhere
    React.useEffect(() => {
        const globalMouseUp = () => {
            if (isDragging) handleEnd();
        };
        const globalMouseMove = (e) => {
            if (isDragging) handleMove(e.clientY);
        };

        if (isDragging) {
            window.addEventListener('mouseup', globalMouseUp);
            window.addEventListener('mousemove', globalMouseMove);
        }
        return () => {
            window.removeEventListener('mouseup', globalMouseUp);
            window.removeEventListener('mousemove', globalMouseMove);
        };
    }, [isDragging, dragY, startY]);


    const handleGoogleSignIn = async () => {
        setSigningIn(true);
        setError("");
        try {
            await signInWithGoogle();
        } catch (error) {
            setError("Failed to log in: " + error.message);
            setSigningIn(false);
        }
    };

    return (
        <div
            className={`login-room ${isLampOn ? 'light-on' : 'light-off'}`}
        >
            {/* Lamp Container */}
            <div className="lamp-container">
                <div className="wire" style={{ height: '60px' }}></div>
                <div className="lamp-shade"></div>

                {/* The Pull Cord */}
                <div
                    className="pull-cord"
                    style={{
                        height: `${100 + dragY}px`, // Base length + drag
                        transition: isDragging ? 'none' : 'height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}
                    onMouseDown={onMouseDown}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div className="pull-handle"></div>
                </div>

                {/* Instruction Text Moved Inside for Perfect Alignment */}
                <div className="pull-instruction">
                    Pull to LogIn
                </div>
            </div>

            {/* Floor Spotlight */}
            <div className="floor-spotlight"></div>

            {/* Ambient Glow & Beam (New) */}
            <div className={`light-beam ${isLampOn ? 'on' : ''}`}></div>
            <div className={`ambient-glow ${isLampOn ? 'on' : ''}`}></div>

            {/* Login Form */}
            <div className="login-form-container">
                <div className="login-card">
                    <h1>U & ME</h1>

                    <p>Connect instantly. Chat privately.</p>
                    {error && <div className="error-message">{error}</div>}

                    <button
                        onClick={handleGoogleSignIn}
                        className={`google-btn ${signingIn ? 'loading' : ''}`}
                        disabled={signingIn}
                    >
                        {signingIn ? (
                            <div className="login-loader"></div>
                        ) : (
                            <>
                                <FcGoogle className="google-icon" />
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
