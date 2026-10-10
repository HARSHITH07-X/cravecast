import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut } from './firebase';
import type { RestaurantSettings } from './types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  restaurant: (RestaurantSettings & { id: string }) | null;
  idToken: string | null;
  refreshRestaurant: () => Promise<void>;
  signIn: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<(RestaurantSettings & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRestaurantForUser = async (currentUser: User) => {
    try {
      const token = await currentUser.getIdToken();
      setIdToken(token);

      // Query restaurants collection where ownerUid == currentUser.uid
      const q = query(collection(db, 'restaurants'), where('ownerUid', '==', currentUser.uid));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        const firstDoc = querySnap.docs[0];
        setRestaurant({
          id: firstDoc.id,
          ...(firstDoc.data() as RestaurantSettings),
        });
      } else {
        setRestaurant(null);
      }
    } catch (err) {
      console.error('Error fetching restaurant for user:', err);
      setRestaurant(null);
    }
  };

  const refreshRestaurant = async () => {
    if (user) {
      await fetchRestaurantForUser(user);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchRestaurantForUser(currentUser);
      } else {
        setIdToken(null);
        setRestaurant(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const loggedUser = await signInWithGoogle();
    await fetchRestaurantForUser(loggedUser);
    return loggedUser;
  };

  const handleSignOut = async () => {
    await logOut();
    setUser(null);
    setIdToken(null);
    setRestaurant(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        restaurant,
        idToken,
        refreshRestaurant,
        signIn: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
