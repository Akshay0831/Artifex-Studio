import { createContext, useContext } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any;
  login: (user: any) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);
