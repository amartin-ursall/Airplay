import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
interface UserAvatarProps {
  user: { name: string };
  isOnline?: boolean;
  className?: string;
}
export function UserAvatar({ user, isOnline, className }: UserAvatarProps) {
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  return (
    <div className="relative">
      <Avatar className={cn("transition-transform duration-200 ease-in-out hover:scale-105", className)}>
        <AvatarImage src={`https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${user.name}`} alt={user.name} />
        <AvatarFallback className="font-bold">{initials}</AvatarFallback>
      </Avatar>
      {isOnline && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
      )}
    </div>
  );
}