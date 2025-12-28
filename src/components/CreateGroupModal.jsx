import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadToCloudinary } from '../utils/cloudinary';
import { useAuth } from '../context/AuthContext';
import { IoClose, IoPeople, IoCamera } from 'react-icons/io5';
import './CreateGroupModal.css';

const CreateGroupModal = ({ isOpen, onClose }) => {
    const { currentUser } = useAuth();
    const [groupName, setGroupName] = useState('');
    const [friends, setFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (isOpen && currentUser) {
            fetchFriends();
        }
    }, [isOpen, currentUser]);

    const fetchFriends = async () => {
        setLoading(true);
        try {
            // Find all chats where user is a member and it's a 1-to-1 chat
            const chatsQuery = query(
                collection(db, "chats"),
                where("members", "array-contains", currentUser.uid)
            );
            const chatSnaps = await getDocs(chatsQuery);

            const friendUids = [];
            chatSnaps.docs.forEach(doc => {
                const data = doc.data();
                // If it has exactly 2 members and doesn't have a groupName
                if (data.members.length === 2 && !data.groupName) {
                    const otherUid = data.members.find(uid => uid !== currentUser.uid);
                    if (otherUid) friendUids.push(otherUid);
                }
            });

            if (friendUids.length === 0) {
                setFriends([]);
                return;
            }

            // Fetch user details for these UIDs
            const usersQuery = query(
                collection(db, "users"),
                where("uid", "in", friendUids.slice(0, 30)) // Firebase limit
            );
            const userSnaps = await getDocs(usersQuery);
            setFriends(userSnaps.docs.map(doc => doc.data()));

        } catch (error) {
            console.error("Error fetching friends for group:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAvatarFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const toggleFriend = (uid) => {
        if (selectedFriends.includes(uid)) {
            setSelectedFriends(selectedFriends.filter(id => id !== uid));
        } else {
            setSelectedFriends([...selectedFriends, uid]);
        }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        if (!groupName.trim() || selectedFriends.length === 0) return;

        setCreating(true);
        try {
            let photoURL = "https://cdn-icons-png.flaticon.com/512/612/612051.png";

            if (avatarFile) {
                photoURL = await uploadToCloudinary(avatarFile, 'image');
            }

            const groupData = {
                groupName: groupName.trim(),
                members: [currentUser.uid, ...selectedFriends],
                createdAt: serverTimestamp(),
                lastInteraction: serverTimestamp(),
                createdBy: currentUser.uid,
                type: 'group',
                groupPhotoURL: photoURL,
                unreadCount: {}
            };

            // Initialize unread counts
            groupData.members.forEach(uid => {
                groupData.unreadCount[uid] = 0;
            });

            await addDoc(collection(db, "chats"), groupData);

            // Reset and close
            setGroupName('');
            setSelectedFriends([]);
            setAvatarFile(null);
            setAvatarPreview(null);
            onClose();
        } catch (error) {
            console.error("Error creating group:", error);
            alert("Failed to create group. Please try again.");
        } finally {
            setCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="header-title">
                        <IoPeople className="group-icon" />
                        <h3>Create New Group</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <IoClose />
                    </button>
                </div>

                <form onSubmit={handleCreateGroup}>
                    <div className="avatar-selection">
                        <div className="avatar-preview-wrapper" onClick={() => document.getElementById('group-avatar-input').click()}>
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="Group Avatar" className="group-avatar-preview" />
                            ) : (
                                <div className="avatar-placeholder">
                                    <IoCamera />
                                </div>
                            )}
                            <div className="edit-overlay">
                                <span>Change</span>
                            </div>
                        </div>
                        <input
                            type="file"
                            id="group-avatar-input"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleAvatarChange}
                        />
                        <p className="avatar-label">Group Avatar</p>
                    </div>

                    <div className="input-group">
                        <label>Group Name</label>
                        <input
                            type="text"
                            placeholder="Enter group name..."
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="friends-selection">
                        <label>Select Friends ({selectedFriends.length})</label>
                        <p className="selection-hint">Only friends you've chatted with previously appear here.</p>

                        {loading ? (
                            <div className="loading-friends">Loading contacts...</div>
                        ) : friends.length === 0 ? (
                            <div className="no-friends">No friends found. Start a private chat first!</div>
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
                        disabled={creating || !groupName.trim() || selectedFriends.length === 0}
                    >
                        {creating ? "Creating..." : "Create Group"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CreateGroupModal;
