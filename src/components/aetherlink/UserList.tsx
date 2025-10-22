import { useAppStore } from "@/store/app-store";
import { useShallow } from 'zustand/react/shallow';
import { UserAvatar } from "./UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { Button } from "../ui/button";
interface UserListProps {
  onUserSelect?: () => void;
}
export function UserList({ onUserSelect }: UserListProps) {
  const { currentUser, users, activeConversationId, setActiveConversationId, logout } = useAppStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      users: state.users,
      activeConversationId: state.activeConversationId,
      setActiveConversationId: state.setActiveConversationId,
      logout: state.logout,
    }))
  );
  const otherUsers = users.filter(u => u.id !== currentUser?.id);
  const handleSelectUser = (userId: string) => {
    setActiveConversationId(userId);
    onUserSelect?.();
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
          <h3 className="text-sm font-medium text-muted-foreground px-2">Online Users ({otherUsers.length})</h3>
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
    </div>
  );
}