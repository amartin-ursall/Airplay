import { useState, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { api } from "@/lib/api-client";
import { useShallow } from 'zustand/react/shallow';
import { UserAvatar } from "./UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "@/components/ui/sonner";
import type { Room } from "@shared/types";
interface UserListProps {
  onUserSelect?: () => void;
}
export function UserList({ onUserSelect }: UserListProps) {
  const {
    currentUser,
    users,
    activeConversationId,
    setActiveConversationId,
    logout,
    rooms,
    activeRoomId,
    setActiveRoomId,
    setRoom
  } = useAppStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      users: state.users,
      activeConversationId: state.activeConversationId,
      setActiveConversationId: state.setActiveConversationId,
      logout: state.logout,
      rooms: state.rooms,
      activeRoomId: state.activeRoomId,
      setActiveRoomId: state.setActiveRoomId,
      setRoom: state.setRoom,
    }))
  );
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreatingRoom, setCreatingRoom] = useState(false);
  const [isJoiningRoom, setJoiningRoom] = useState(false);
  const otherUsers = users.filter(u => u.id !== currentUser?.id && u.online);
  const handleSelectUser = (userId: string) => {
    setActiveConversationId(userId);
    onUserSelect?.();
  };
  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    onUserSelect?.();
  };

  const sortedRooms = useMemo(() => {
    return Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt);
  }, [rooms]);

  const formatTimeLeft = (room: Room) => {
    const diff = room.expiresAt - Date.now();
    if (diff <= 0) return 'Expirada';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m restantes`;
    return `${minutes}m restantes`;
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast.error('El nombre de la sala es obligatorio');
      return;
    }
    setCreatingRoom(true);
    try {
      const room = await api<Room>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: newRoomName.trim() })
      });
      setRoom(room);
      setActiveRoomId(room.id);
      setNewRoomName('');
      toast.success(`Sala creada. Código: ${room.code}`);
    } catch (error: any) {
      console.error('Failed to create room:', error);
      toast.error(error?.message || 'No se pudo crear la sala');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      toast.error('Introduce un código de sala');
      return;
    }
    setJoiningRoom(true);
    try {
      const room = await api<Room>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim() })
      });
      setRoom(room);
      setActiveRoomId(room.id);
      setJoinCode('');
      toast.success(`Te uniste a la sala ${room.name}`);
    } catch (error: any) {
      console.error('Failed to join room:', error);
      toast.error(error?.message || 'No se pudo unir a la sala');
    } finally {
      setJoiningRoom(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentUser && <UserAvatar user={currentUser} isOnline />}
          <h2 className="text-lg font-semibold text-foreground">{currentUser?.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={() => {
          logout();
          localStorage.removeItem('aetherlink-user');
        }} className="text-muted-foreground hover:text-foreground">
          <LogOut size={20} />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-2">Usuarios Online ({otherUsers.length})</h3>
          {otherUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user.id)}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors duration-200",
                activeConversationId === user.id
                  ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                  : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
              )}
            >
              <UserAvatar user={user} isOnline={user.online} />
              <span className="font-medium text-foreground">{user.name}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Crear sala temporal (24h)</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre de la sala"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="text-sm"
            />
            <Button size="sm" onClick={handleCreateRoom} disabled={isCreatingRoom}>
              {isCreatingRoom ? 'Creando...' : 'Crear'}
            </Button>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Unirte con código</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Ej: 123456"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleJoinRoom} disabled={isJoiningRoom}>
              {isJoiningRoom ? 'Uniendo...' : 'Unirse'}
            </Button>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Salas temporales ({sortedRooms.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {sortedRooms.length === 0 && (
              <p className="text-xs text-muted-foreground">Crea una sala o introduce un código para unirte.</p>
            )}
            {sortedRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleSelectRoom(room.id)}
                className={cn(
                  "w-full p-3 rounded-lg border text-left transition-colors",
                  activeRoomId === room.id
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{room.name}</p>
                  <span className="text-xs font-mono text-muted-foreground">#{room.code}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{room.participants?.length || 1} participantes</span>
                  <span>{formatTimeLeft(room)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
