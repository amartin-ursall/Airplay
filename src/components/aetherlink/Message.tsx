import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import type { Message as MessageType, User } from "@shared/types";
import { format } from "date-fns";
import { FileText, Download, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
interface MessageProps {
  message: MessageType;
  sender: User | undefined;
}
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
export function Message({ message, sender }: MessageProps) {
  const currentUser = useAppStore((state) => state.currentUser);
  const isSender = message.senderId === currentUser?.id;
  if (!sender) return null;
  const handleDownload = () => {
    // The content of a file message is the file ID
    window.open(`/api/files/${message.content}`, '_blank');
  };
  const renderContent = () => {
    if (message.type === 'file' && message.file) {
      const isUploading = typeof message.progress === 'number' && message.progress >= 0 && message.progress < 100;
      const isComplete = typeof message.progress === 'number' && message.progress >= 100;
      const hasFailed = message.progress === -1;
      return (
        <div className="w-64">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-200/50 dark:bg-slate-700/50">
            <FileText className="w-8 h-8 text-indigo-500 flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="font-medium text-sm truncate">{message.file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(message.file.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              disabled={!isComplete}
              onClick={handleDownload}
            >
              <Download className="w-5 h-5" />
            </Button>
          </div>
          {isUploading && <Progress value={message.progress} className="h-1 mt-2" />}
          {hasFailed && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="w-4 h-4" />
              <span>Upload Failed</span>
            </div>
          )}
        </div>
      );
    }
    return <p className="text-base break-words">{message.content}</p>;
  };
  return (
    <div className={cn("flex items-start gap-3 my-4", isSender ? "flex-row-reverse" : "flex-row")}>
      <UserAvatar user={sender} />
      <div className={cn("flex flex-col max-w-xs md:max-w-md", isSender ? "items-end" : "items-start")}>
        <div
          className={cn(
            "p-3 rounded-2xl",
            isSender
              ? "bg-indigo-600 text-white rounded-br-none"
              : "bg-slate-100 dark:bg-slate-800 text-foreground rounded-bl-none"
          )}
        >
          {renderContent()}
        </div>
        <span className="text-xs text-muted-foreground mt-1">
          {format(new Date(message.timestamp), "h:mm a")}
        </span>
      </div>
    </div>
  );
}