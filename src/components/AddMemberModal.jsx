import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { IoClose, IoPersonAdd } from 'react-icons/io5';
import './AddMemberModal.css';

const AddMemberModal = ({ isOpen, onClose, chatId, currentMembers }) => {
    const { currentUser } = useAuth();
    const [friends, setFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (isOpen && currentUser && chatId) {
            fetchFriends();
        }
    }, [isOpen, currentUser, chatId]);

    const fetchFriends = async () => {
        setLoading(true);
        try {
            // Find all 1-to-1 chats where user is a member
            const chatsQuery = query(
                collection(db, "chats"),
                where("members", "array-contains", currentUser.uid)
            );
            const chatSnaps = await getDocs(chatsQuery);

            const friendUids = [];
            chatSnaps.docs.forEach(snap => {
                const data = snap.data();
                if (data.members.length === 2 && !data.type === 'group') {
                    const otherUid = data.members.find(uid => uid !== currentUser.uid);
                    // Only add if they are NOT already in the group
                    if (otherUid && !currentMembers.includes(otherUid)) {
                        friendUids.push(otherUid);
                    }
                }
            });

            if (friendUids.length === 0) {
                setFriends([]);
                return;
            }

            // Fetch user details for these UIDs
            const usersQuery = query(
                collection(db, "users"),
                where("uid", "in", friendUids.slice(0, 30))
            );
            const userSnaps = await getDocs(usersQuery);
            setFriends(userSnaps.docs.map(snap => snap.data()));

        } catch (error) {
            console.error("Error fetching friends to add:", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleFriend = (uid) => {
        if (selectedFriends.includes(uid)) {
            setSelectedFriends(selectedFriends.filter(id => id !== uid));
        } else {
            setSelectedFriends([...selectedFriends, uid]);
        }
    };

    const handleAddMembers = async (e) => {
        e.preventDefault();
        if (selectedFriends.length === 0) return;

        setAdding(true);
        try {
            const chatRef = doc(db, "chats", chatId);
            const updates = {
                members: arrayUnion(...selectedFriends)
            };

            // Initialize unread counts for new members
            selectedFriends.forEach(uid => {
                updates[`unreadCount.${uid}`] = 0;
            });

            await updateDoc(chatRef, updates);

            setSelectedFriends([]);
            onClose();
        } catch (error) {
            console.error("Error adding members:", error);
            alert("Failed to add members. Please try again.");
        } finally {
            setAdding(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="header-title">
                        <IoPersonAdd className="group-add-icon" />
                        <h3>Add to Group</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <IoClose />
                    </button>
                </div>

                <form onSubmit={handleAddMembers}>
                    <div className="friends-selection">
                        <label>Select Friends ({selectedFriends.length})</label>
                        <p className="selection-hint">Only friends not already in this group are shown.</p>

                        {loading ? (
                            <div className="loading-friends">Loading contacts...</div>
                        ) : friends.length === 0 ? (
                            <div className="no-friends">No new friends to add.</div>
                        ) : (
                            <div className="friends-list">
                                {friends.map(friend => (
                                    <div
                                        key={friend.uid}
                                        className={`friend-item ${selectedFriends.includes(friend.uid) ? 'selected' : ''}`}
                                        onClick={() => toggleFriend(friend.uid)}
                                    >
                                        <img src={friend.photoURL} alt={friend.displayName} />
                                        <div className="friend-info">
                                            <span className="name">{friend.displayName}</span>
                                            <span className="username">@{friend.username}</span>
                                        </div>
                                        <div className="checkbox">
                                            {selectedFriends.includes(friend.uid) && <div className="check-mark"></div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="create-btn"
                        disabled={adding || selectedFriends.length === 0}
                    >
                        {adding ? "Adding..." : "Add to Group"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AddMemberModal;
