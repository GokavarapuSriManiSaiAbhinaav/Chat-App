import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, setDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import "./ProfileSetup.css";

// Specific Adventurer avatars as requested
const AVATAR_OPTIONS = [
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Emery",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Aidan",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Brian",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Brooklynn",
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Sophia" // Added a couple more for variety
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (username.length < 3) {
            setError("Username must be at least 3 characters long.");
            setLoading(false);
            return;
        }

        const isUnique = await checkUsernameUnique(username);
        if (!isUnique) {
            setError("Username is already taken. Please choose another.");
            setLoading(false);
            return;
        }

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
            });
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
                        />
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
