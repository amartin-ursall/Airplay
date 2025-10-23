import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/lib/api-client';
import type { User } from '@shared/types';
import { UserList } from '@/components/aetherlink/UserList';
import { ChatPanel } from '@/components/aetherlink/ChatPanel';
import { usePolling } from '@/hooks/use-polling';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Toaster, toast } from '@/components/ui/sonner';
import { Loader2, Link, Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
function SetNameModal({ onNameSet }: { onNameSet: (user: User) => void }) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Por favor, introduce un nombre de usuario.");
      return;
    }

    if (name.trim().length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    if (name.trim().length > 50) {
      setError("El nombre no puede exceder 50 caracteres.");
      return;
    }

    setIsLoading(true);
    try {
      const user = await api<User>('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      localStorage.setItem('aetherlink-user', JSON.stringify(user));
      toast.success(`¡Bienvenido, ${user.name}!`);
      onNameSet(user);
    } catch (error: any) {
      console.error("Login failed:", error);

      // Check if it's a duplicate username error (409 Conflict)
      if (error?.status === 409) {
        setError(error.message || "Este nombre de usuario ya está en uso. Por favor, elige otro.");
      } else if (error?.message) {
        setError(error.message);
      } else {
        setError("No se pudo establecer el nombre. Por favor, inténtalo de nuevo.");
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Bienvenido a Airplay</DialogTitle>
          <DialogDescription className="text-center">
            Introduce tu nombre de usuario para comenzar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Input
              id="name"
              placeholder="Nombre de usuario"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null); // Clear error when user types
              }}
              className={`text-base ${error ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              autoFocus
              maxLength={50}
            />
            {error && (
              <p className="text-sm text-red-500 font-medium">{error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Entre 2 y 50 caracteres. El nombre debe ser único.
            </p>
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function HomePage() {
  const { currentUser, setCurrentUser, setUsers } = useAppStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      setCurrentUser: state.setCurrentUser,
      setUsers: state.setUsers,
    }))
  );
  const isMobile = useIsMobile();
  const [isSheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('aetherlink-user');
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse stored user:", error);
      localStorage.removeItem('aetherlink-user');
    }
  }, [setCurrentUser]);
  const fetchUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      const userList = await api<User[]>('/api/users');
      setUsers(userList);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }, [currentUser, setUsers]);
  useEffect(() => {
    fetchUsers();
  }, [currentUser, fetchUsers]);
  usePolling(fetchUsers, 5000);
  if (!currentUser) {
    return (
      <>
        <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <Link className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold">Airplay</h1>
            </div>
            <p className="text-muted-foreground">Entrando...</p>
          </div>
        </div>
        <SetNameModal onNameSet={setCurrentUser} />
        <Toaster richColors />
      </>
    );
  }
  const mobileNav = (
    <Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-full max-w-xs">
        <UserList onUserSelect={() => setSheetOpen(false)} />
      </SheetContent>
    </Sheet>
  );
  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden">
      {!isMobile && (
        <div className="w-full md:w-1/3 lg:w-1/4 max-w-sm">
          <UserList />
        </div>
      )}
      <div className="flex-1">
        <ChatPanel mobileNav={isMobile ? mobileNav : undefined} />
      </div>
    </div>
  );
}