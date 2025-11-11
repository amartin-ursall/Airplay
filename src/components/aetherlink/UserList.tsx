import { useState, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { api } from "@/lib/api-client";
import { useShallow } from 'zustand/react/shallow';
import { UserAvatar } from "./UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LogOut, Copy, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
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
  const [roomDescription, setRoomDescription] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
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
    if (room.isPermanent) return 'Permanente';
    if (!room.expiresAt) return 'Sin expiración';
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
    if (!currentUser) return;

    setCreatingRoom(true);
    try {
      const room = await api<Room>('/api/rooms/create', {
        method: 'POST',
        body: JSON.stringify({
          userId: currentUser.id,
          roomName: newRoomName.trim(),
          description: roomDescription.trim() || undefined,
          isPermanent
        })
      });
      setRoom(room);
      setActiveRoomId(room.id);
      setNewRoomName('');
      setRoomDescription('');
      setIsPermanent(false);
      toast.success(`Sala ${isPermanent ? 'permanente' : 'temporal'} creada. Código: ${room.code}`, {
        description: isPermanent ? 'Puedes compartir el código con otros' : 'Expira en 24 horas',
        duration: 5000
      });
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
    if (!currentUser) return;

    setJoiningRoom(true);
    try {
      const room = await api<Room>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, code: joinCode.trim() })
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
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Crear sala</h3>
          <div className="space-y-3">
            <Input
              placeholder="Nombre de la sala"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="text-sm"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateRoom();
                }
              }}
            />
            <Textarea
              placeholder="Descripción (opcional)"
              value={roomDescription}
              onChange={(e) => setRoomDescription(e.target.value)}
              className="text-sm resize-none"
              rows={2}
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                id="permanent"
                checked={isPermanent}
                onCheckedChange={(checked) => setIsPermanent(checked as boolean)}
              />
              <Label htmlFor="permanent" className="text-sm cursor-pointer">
                Sala permanente (no expira)
              </Label>
            </div>
            <Button
              size="sm"
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="w-full"
            >
              {isCreatingRoom ? 'Creando...' : 'Crear Sala'}
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
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Mis Salas ({sortedRooms.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {sortedRooms.length === 0 && (
              <p className="text-xs text-muted-foreground">Crea una sala o introduce un código para unirte.</p>
            )}
            {sortedRooms.map((room) => {
              const [copied, setCopied] = useState(false);

              const handleCopyCode = (e: React.MouseEvent) => {
                e.stopPropagation();
                navigator.clipboard.writeText(room.code);
                setCopied(true);
                toast.success('Código copiado');
                setTimeout(() => setCopied(false), 2000);
              };

              return (
                <div
                  key={room.id}
                  className={cn(
                    "w-full p-3 rounded-lg border transition-colors",
                    activeRoomId === room.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-200 dark:border-slate-700"
                  )}
                >
                  <button
                    onClick={() => handleSelectRoom(room.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{room.name}</p>
                        {room.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{room.description}</p>
                        )}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Copiar código"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {room.code}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                      <span>{room.participants?.length || 1} participantes</span>
                      <span className={cn(
                        "font-medium",
                        room.isPermanent && "text-green-600 dark:text-green-400"
                      )}>
                        {formatTimeLeft(room)}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
