import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, setDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import "./ProfileSetup.css";

// Specific Adventurer avatars as requested
// Diverse Adventurer avatars
const AVATAR_OPTIONS = [
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Felix",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Aneka",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Scooter",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Liza",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Alexander",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Jessica",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Destiny",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Willow",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Bailey",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Midnight",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Annie",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Shadow"
];

const ProfileSetup = ({ onComplete }) => {
    const { currentUser } = useAuth();
    const [username, setUsername] = useState("");
    const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const checkUsernameUnique = async (username) => {
        const q = query(collection(db, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        return querySnapshot.empty;
    };

    const [usernameError, setUsernameError] = useState("");
    const [isChecking, setIsChecking] = useState(false);

    // Debounce check
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (username.length >= 3) {
                setIsChecking(true);
                const isUnique = await checkUsernameUnique(username);
                if (!isUnique) {
                    setUsernameError("Username is already taken");
                } else {
                    setUsernameError("");
                }
                setIsChecking(false);
            } else if (username.length > 0) {
                setUsernameError("Must be at least 3 chars");
            } else {
                setUsernameError("");
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (usernameError || username.length < 3) {
            return; // Block submit if invalid
        }

        setLoading(true);

        try {
            // Saving photoURL for app consistency (this is the chosen avatar)
            await setDoc(doc(db, "users", currentUser.uid), {
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                email: currentUser.email,
                username: username.replace(/^@/, ''),
                photoURL: selectedAvatar,
                avatarUrl: selectedAvatar, // Saving as avatarUrl as requested too
                createdAt: serverTimestamp(),
                searchKeywords: [username.toLowerCase()]
            }, { merge: true });
            onComplete();
        } catch (err) {
            setError("Error saving profile: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="setup-container">
            <div className="setup-card">
                <h1>Welcome!</h1>
                <p>Choose your avatar.</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Choose a Username</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, '').replace(/^@/, ''))}
                            required
                            style={usernameError ? { borderColor: '#e74c3c' } : {}}
                        />
                        {/* Inline Error Message */}
                        {usernameError && (
                            <div style={{ color: '#e74c3c', fontSize: '0.85rem', marginTop: '6px', textAlign: 'left', fontWeight: '500' }}>
                                {usernameError}
                            </div>
                        )}
                        {isChecking && !usernameError && (
                            <div style={{ color: '#7f8c8d', fontSize: '0.85rem', marginTop: '6px', textAlign: 'left' }}>
                                Checking availability...
                            </div>
                        )}
                    </div>

                    <div className="avatar-section">
                        <label>Pick Your Look</label>
                        <div className="avatar-grid">
                            {AVATAR_OPTIONS.map((avatar, index) => (
                                <div
                                    key={index}
                                    className={`avatar-card ${selectedAvatar === avatar ? "selected" : ""}`}
                                    onClick={() => setSelectedAvatar(avatar)}
                                >
                                    <img src={avatar} alt={`Avatar ${index}`} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="primary-btn" disabled={loading}>
                        {loading ? "Setting up..." : "Finish Setup"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ProfileSetup;
