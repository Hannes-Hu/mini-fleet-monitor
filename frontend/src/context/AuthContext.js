import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => {
    // Try to get token from localStorage on initial load
    return localStorage.getItem('fleet_token') || null;
  });
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if token exists and decode user info
    if (token) {
      try {
        // Simple token validation (in production I would verify with backend)
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          email: payload.email,
          userId: payload.userId
        });
      } catch (error) {
        console.error('Error decoding token:', error);
        logout();
      }
    }
    setIsLoading(false);
  }, [token]);

  const login = (newToken) => {
    setToken(newToken);
    localStorage.setItem('fleet_token', newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('fleet_token');
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        login,
        logout,
        isAuthenticated
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};