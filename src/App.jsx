import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import Navbar from './components/Navbar';
import ProfileSetup from './components/ProfileSetup';
import WelcomeScreen from './components/WelcomeScreen';
import Intro from './components/Intro';
import Loader from './components/Loader';
import NotificationManager from './components/NotificationManager';
import CreateGroupModal from './components/CreateGroupModal';
import Maintenance from './components/Maintenance';
import { useAuth } from './context/AuthContext';
import './index.css';

const App = () => {
  const { currentUser } = useAuth();
  /* Optimistic Initialization from Cache */
  const cachedProfile = JSON.parse(localStorage.getItem('user_profile_cache') || 'null');
  const cachedSetup = localStorage.getItem('is_profile_setup') === 'true';

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Start with cached values if available -> Instant Load!
  const [isProfileSetup, setIsProfileSetup] = useState(!!currentUser && cachedSetup);
  const [userProfile, setUserProfile] = useState(currentUser ? cachedProfile : null);
  const [checkingProfile, setCheckingProfile] = useState(!cachedProfile || !cachedSetup);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false); // Disable welcome on simple refresh to speed up? Users usually hate it every time.
  // Actually, user didn't ask to remove welcome, but "loading...".
  // Let's keep welcome logic separate but maybe skip it if we have cache? 
  // User said "taking time to open main page". Welcome screen ADDS time.
  // I will only show Welcome if !cachedSetup (first time this session/device).

  const [showIntro, setShowIntro] = useState(!sessionStorage.getItem('introShown'));
  const [selectedUser, setSelectedUser] = useState(null);

  /* Maintenance Mode Logic */
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  // Admin bypass: Maintenance is ON but user is Admin
  const isBypassed = currentUser?.email && currentUser?.email === adminEmail;
  const shouldShowMaintenance = isMaintenanceMode && !isBypassed;


  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleGroupModal = () => setIsGroupModalOpen(!isGroupModalOpen);
  const handleUserSelect = () => setIsMenuOpen(false);

  const handleIntroFinish = () => {
    sessionStorage.setItem('introShown', 'true');
    setShowIntro(false);
  };

  useEffect(() => {
    if (shouldShowMaintenance) return;

    const checkProfile = async () => {
      if (currentUser) {
        setCheckingProfile(true);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);
          setIsProfileSetup(true);

          // Update Cache
          localStorage.setItem('user_profile_cache', JSON.stringify(data));
          localStorage.setItem('is_profile_setup', 'true');

          if (!cachedProfile) {
            setShowWelcome(true);
            setTimeout(() => setShowWelcome(false), 2000); // reduced from 2500
          }

          // Mark user as online (Background)
          updateDoc(docRef, {
            isOnline: true,
            lastSeen: serverTimestamp()
          }).catch(e => console.error("Online status update failed", e));
        } else {
          setIsProfileSetup(false);
          setUserProfile(null);
          localStorage.removeItem('user_profile_cache');
          localStorage.removeItem('is_profile_setup');
        }
        setCheckingProfile(false);
      } else {
        setCheckingProfile(false);
        setShowWelcome(false);
      }
    };

    checkProfile();

    // Handle Unload/Sign-out
    const handleStatusChange = async (online) => {
      if (currentUser && isProfileSetup) {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
          isOnline: online,
          lastSeen: serverTimestamp()
        });
      }
    };

    // Event listener for tab close/visibility
    const onVisibilityChange = () => {
      handleStatusChange(document.visibilityState === 'visible');
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      handleStatusChange(false);
    };
  }, [currentUser, isProfileSetup, shouldShowMaintenance]);

  if (shouldShowMaintenance) {
    return <Maintenance />;
  }

  if (showIntro) {
    return <Intro onFinish={handleIntroFinish} />;
  }

  if (checkingProfile) {
    return <div className="loading-screen">Loading...</div>; // Simple loader
  }

  if (currentUser && isProfileSetup && showWelcome) {
    return <WelcomeScreen user={userProfile || currentUser} />;
  }

  const handleLogoClick = () => {
    setSelectedUser(null);
    setIsMenuOpen(false);
  };

  return (
    <div className={`app-container ${showIntro ? 'intro-active' : ''} ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      {currentUser && isProfileSetup && (
        <Navbar
          onToggleMenu={toggleMenu}
          onToggleTheme={toggleTheme}
          onToggleGroupModal={toggleGroupModal}
          onLogoClick={handleLogoClick}
          isDarkMode={isDarkMode}
          user={userProfile}
        />
      )}

      {currentUser && isProfileSetup && <NotificationManager />}

      <div className={`main-content ${isMenuOpen ? 'menu-open' : ''}`}>
        {!currentUser ? (
          <Login />
        ) : !isProfileSetup ? (
          <ProfileSetup onComplete={() => setIsProfileSetup(true)} />
        ) : (
          <ChatRoom
            isMenuOpen={isMenuOpen}
            closeMenu={handleUserSelect}
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
          />
        )}

        <CreateGroupModal
          isOpen={isGroupModalOpen}
          onClose={() => setIsGroupModalOpen(false)}
        />
      </div>
    </div>
  );
};

export default App;
