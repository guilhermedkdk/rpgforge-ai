'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@rpgforce-ai/shared';
import { authApi } from '@/lib/api/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Carrega usuário ao montar (verifica se tem sessão válida)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { user } = await authApi.me();
        setUser(user);
      } catch {
        // Sem sessão válida, usuário permanece null
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Verifica sessão apenas quando a aba ganha foco (detecta logout em outra aba/dispositivo)
  // A expiração de token é tratada automaticamente pelo interceptor do axios (reativo)
  useEffect(() => {
    if (!user) return;

    const checkSession = async () => {
      try {
        const { user: currentUser } = await authApi.me();
        setUser(currentUser);
      } catch {
        // Sessão inválida (logout em outra aba ou cookies removidos)
        setUser(null);
      }
    };

    // Verifica apenas quando a aba ganha foco (detecta logout em outra aba)
    const handleFocus = () => {
      checkSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const login = async (email: string, password: string) => {
    const { user } = await authApi.login({ email, password });
    setUser(user);

    // Redireciona para a página que o usuário tentou acessar ou para /sheets (evita passar pela home)
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/sheets';
    router.push(redirect);
  };

  const register = async (email: string, password: string) => {
    const { user } = await authApi.register({ email, password });
    setUser(user);

    // Após registro, redireciona para a página que tentou acessar ou para /sheets
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/sheets';
    router.push(redirect);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
