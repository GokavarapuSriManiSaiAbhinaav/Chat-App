import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import "./UserList.css";

const UserList = ({ onSelectUser, selectedUser, isOpen, onClose }) => {
    const [users, setUsers] = useState([]);
    const { currentUser } = useAuth();

    // Pass onClose to selection handler
    const handleSelect = (user) => {
        onSelectUser(user);
        if (onClose) onClose();
    }

    useEffect(() => {
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersList = [];
            snapshot.forEach((doc) => {
                usersList.push({ id: doc.id, ...doc.data() });
            });
            setUsers(usersList);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className={`user-list ${isOpen ? 'active' : ''}`}>
            <h3>Conversations</h3>
            <p className="subtitle">Select a user to chat</p>

            <ul>
                <li
                    className={`user-item global-chat ${!selectedUser ? 'active' : ''}`}
                    onClick={() => handleSelect(null)}
                >
                    <span className="user-name-list">Global Chat</span>
                </li>
                {users.filter(u => u.uid !== currentUser?.uid).map((user) => (
                    <li
                        key={user.id}
                        className={`user-item ${selectedUser?.uid === user.uid ? 'active' : ''}`}
                        onClick={() => handleSelect(user)}
                    >
                        <img className="user-avatar" src={user.photoURL} alt={user.displayName} />
                        <span className="user-name-list">{user.displayName}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default UserList;
