import { db } from "../firebase";
import {
    collection,
    query,
    where,
    getDocs,
    writeBatch,
    doc,
    arrayRemove,
    deleteField,
    serverTimestamp
} from "firebase/firestore";

/**
 * Performs full, secure account deletion.
 * 
 * Order of Operations:
 * 1. Mark user as deleted (transient flag).
 * 2. Delete ALL Private Chats (Hide completely).
 * 3. Remove user from ALL Group Chats (Keep group, remove user).
 * 4. Anonymize user's messages in Groups.
 * 5. Delete User Document (Final cleanup).
 * 
 * @param {string} userId - The UID of the user to delete.
 */
export const performAccountDeletion = async (userId) => {
    if (!userId) throw new Error("No user ID provided");

    // 0. Transient: Mark as deleted (Helps UI/Listeners react instantly)
    // Note: We use a small batch here to ensure it commits before the heavy lift
    const userRef = doc(db, "users", userId);
    await writeBatch(db).update(userRef, {
        deleted: true,
        deletedAt: serverTimestamp()
    }).commit().catch(() => { }); // Ignore error if doc missing

    // 1. Get all chats where user is a member
    const chatsRef = collection(db, "chats");
    const chatsQuery = query(chatsRef, where("members", "array-contains", userId));
    const chatsSnapshot = await getDocs(chatsQuery);

    let currentBatch = writeBatch(db);
    let operationCount = 0;

    const commitBatchIfNeeded = async () => {
        if (operationCount >= 400) { // Safe limit
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            operationCount = 0;
        }
    };

    // 2. Iterate Chats
    for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        const chatId = chatDoc.id;

        if (chatData.type === 'private' || !chatData.type) {
            // Rule: "Private chat -> hide completely"
            // Action: Delete the chat document.
            currentBatch.delete(doc(db, "chats", chatId));
            operationCount++;
        } else {
            // Rule: "Group chat -> keep group but remove user"
            const chatRef = doc(db, "chats", chatId);
            currentBatch.update(chatRef, {
                members: arrayRemove(userId),
                [`unreadCount.${userId}`]: deleteField(),
                [`typing.${userId}`]: deleteField()
            });
            operationCount++;

            // Rule: "Messages sent by the deleted user: Keep messages... Replace sender info"
            const messagesRef = collection(db, "chats", chatId, "messages");
            const messagesQuery = query(messagesRef, where("uid", "==", userId));
            // This might be large, but we must process it
            const messagesSnapshot = await getDocs(messagesQuery);

            for (const msgDoc of messagesSnapshot.docs) {
                const msgRef = doc(db, "chats", chatId, "messages", msgDoc.id);
                currentBatch.update(msgRef, {
                    senderName: "Deleted User",
                    displayName: "Deleted User",
                    uid: "deleted_user",
                    senderId: null,
                    photoURL: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
                    isDeletedUser: true
                });
                operationCount++;
                await commitBatchIfNeeded();
            }
        }
        await commitBatchIfNeeded();
    }

    // 3. Delete User Document Completely
    // Action: Delete users/{uid}
    currentBatch.delete(userRef);
    operationCount++;

    // Commit final batch (Cleanup + User Delete)
    await currentBatch.commit();
};
