import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import type { Message as MessageType, User } from "@shared/types";
import { format } from "date-fns";
import { FileText, Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const isSender = message.senderId === currentUser?.id;

  if (!sender) return null;

  const handleDownload = async () => {
    if (!currentUser || !activeConversationId) return;

    try {
      // The content of a file message is the file ID
      const downloadUrl = `/api/files/${message.content}?otherUserId=${activeConversationId}`;

      // Fetch the file as a blob
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'X-User-Id': currentUser.id,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a temporary URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = message.file.name;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  // Render text message
  if (message.type === 'text') {
    return (
      <div className={cn("flex items-start gap-3 my-4", isSender ? "flex-row-reverse" : "flex-row")}>
        <UserAvatar user={sender} />
        <div className={cn("flex flex-col max-w-xs md:max-w-md", isSender ? "items-end" : "items-start")}>
          <div
            className={cn(
              "px-4 py-2 rounded-2xl",
              isSender
                ? "bg-indigo-600 text-white rounded-br-none"
                : "bg-slate-100 dark:bg-slate-800 text-foreground rounded-bl-none"
            )}
          >
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          <span className="text-xs text-muted-foreground mt-1">
            {format(new Date(message.timestamp), "h:mm a")}
          </span>
        </div>
      </div>
    );
  }

  // Render file message
  if (message.type === 'file' && message.file) {
    const isUploading = typeof message.progress === 'number' && message.progress >= 0 && message.progress < 100;
    const isComplete = typeof message.progress === 'number' && message.progress === 100 || message.progress === undefined;
    const hasFailed = message.progress === -1;

    return (
      <div className={cn("flex items-start gap-3 my-4", isSender ? "flex-row-reverse" : "flex-row")}>
        <UserAvatar user={sender} />
        <div className={cn("flex flex-col max-w-xs md:max-w-md", isSender ? "items-end" : "items-start")}>
          <div
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              isSender
                ? "bg-indigo-600 text-white rounded-br-none"
                : "bg-slate-100 dark:bg-slate-800 text-foreground rounded-bl-none",
              isComplete && "shadow-lg"
            )}
          >
          <div className="w-64">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
              isUploading && "bg-blue-100 dark:bg-blue-900/30",
              isComplete && "bg-green-100 dark:bg-green-900/30",
              hasFailed && "bg-red-100 dark:bg-red-900/30",
              !isUploading && !isComplete && !hasFailed && "bg-slate-200/50 dark:bg-slate-700/50"
            )}>
              {isUploading ? (
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-spin" />
              ) : isComplete ? (
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0 animate-in zoom-in duration-300" />
              ) : hasFailed ? (
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 flex-shrink-0" />
              ) : (
                <FileText className="w-8 h-8 text-indigo-500 flex-shrink-0" />
              )}
              <div className="flex-1 overflow-hidden">
                <p className="font-medium text-sm truncate text-foreground">{message.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(message.file.size)}
                  {isUploading && ` • Uploading...`}
                  {isComplete && ` • Ready`}
                  {hasFailed && ` • Failed`}
                </p>
              </div>
              {isComplete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50"
                  onClick={handleDownload}
                >
                  <Download className="w-5 h-5" />
                </Button>
              )}
            </div>
            {isUploading && (
              <div className="mt-2 space-y-1">
                <Progress value={message.progress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">{message.progress}%</p>
              </div>
            )}
            {hasFailed && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>intentelo de nuevo....</span>
              </div>
            )}
            {isComplete && !isUploading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Click para Desacargar</span>
              </div>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-1">
          {format(new Date(message.timestamp), "h:mm a")}
        </span>
      </div>
    </div>
    );
  }

  return null;
}