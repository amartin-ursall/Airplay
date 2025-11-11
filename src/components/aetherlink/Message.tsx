import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { ImagePreview } from "./ImagePreview";
import type { Message as MessageType, RoomMessage, User } from "@shared/types";
import { format } from "date-fns";
import { FileText, Download, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { useState, useEffect } from "react";
interface MessageProps {
  message: MessageType | RoomMessage;
  sender?: User;
  context: { type: 'direct'; otherUserId: string } | { type: 'room'; roomId: string };
}
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isImageFile(filename: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) {
    return true;
  }
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return imageExtensions.includes(ext);
}
export function Message({ message, sender, context }: MessageProps) {
  const currentUser = useAppStore((state) => state.currentUser);
  const isSender = message.senderId === currentUser?.id;
  const displaySender = sender ?? { name: 'Participante' };
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageThumbnailUrl, setImageThumbnailUrl] = useState<string | null>(null);

  const isImage = message.type === 'file' && message.file && isImageFile(message.file.name, message.file.type);

  const handleDownload = async () => {
    if (!currentUser || (context.type === 'direct' && !context.otherUserId)) return;

    try {
      const downloadUrl = context.type === 'room'
        ? `/api/files/${message.content}?roomId=${context.roomId}`
        : `/api/files/${message.content}?otherUserId=${context.otherUserId}`;

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

  const handleImagePreview = async () => {
    if (!currentUser || (context.type === 'direct' && !context.otherUserId)) return;

    try {
      const previewUrl = context.type === 'room'
        ? `/api/files/${message.content}?roomId=${context.roomId}`
        : `/api/files/${message.content}?otherUserId=${context.otherUserId}`;

      const response = await fetch(previewUrl, {
        method: 'GET',
        headers: {
          'X-User-Id': currentUser.id,
        },
      });

      if (!response.ok) {
        throw new Error(`Preview failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      setImagePreviewUrl(blobUrl);
      setShowImagePreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
      alert('Failed to load image preview. Please try again.');
    }
  };

  const handleClosePreview = () => {
    setShowImagePreview(false);
    if (imagePreviewUrl) {
      window.URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
  };

  // Load image thumbnail when the message is an image
  useEffect(() => {
    if (!isImage || !currentUser) return;

    const loadThumbnail = async () => {
      try {
        const thumbnailUrl = context.type === 'room'
          ? `/api/files/${message.content}?roomId=${context.roomId}`
          : `/api/files/${message.content}?otherUserId=${context.otherUserId}`;

        const response = await fetch(thumbnailUrl, {
          method: 'GET',
          headers: {
            'X-User-Id': currentUser.id,
          },
        });

        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          setImageThumbnailUrl(blobUrl);
        }
      } catch (error) {
        console.error('Failed to load thumbnail:', error);
      }
    };

    loadThumbnail();

    // Cleanup
    return () => {
      if (imageThumbnailUrl) {
        window.URL.revokeObjectURL(imageThumbnailUrl);
      }
    };
  }, [isImage, message.content, currentUser, context]);

  // Render text message
  if (message.type === 'text') {
    return (
      <div className={cn("flex items-start gap-3 my-4", isSender ? "flex-row-reverse" : "flex-row")}>
        <UserAvatar user={displaySender} />
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
      <>
        {showImagePreview && imagePreviewUrl && (
          <ImagePreview
            src={imagePreviewUrl}
            alt={message.file.name}
            onClose={handleClosePreview}
            onDownload={handleDownload}
          />
        )}
        <div className={cn("flex items-start gap-3 my-4", isSender ? "flex-row-reverse" : "flex-row")}>
          <UserAvatar user={displaySender} />
          <div className={cn("flex flex-col", isSender ? "items-end" : "items-start")}>
            <div
              className={cn(
                "p-3 rounded-2xl transition-all duration-300",
                isSender
                  ? "bg-indigo-600 text-white rounded-br-none"
                  : "bg-slate-100 dark:bg-slate-800 text-foreground rounded-bl-none",
                isComplete && "shadow-lg"
              )}
            >
              {/* Image Preview Thumbnail */}
              {isImage && isComplete && imageThumbnailUrl && (
                <div
                  className="mb-2 cursor-pointer group relative overflow-hidden rounded-lg"
                  onClick={handleImagePreview}
                >
                  <img
                    src={imageThumbnailUrl}
                    alt={message.file.name}
                    className="max-w-xs max-h-64 object-contain rounded-lg transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              )}

              <div className={cn("w-64", isImage && isComplete && "w-auto max-w-xs")}>
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
                    isImage ? (
                      <ImageIcon className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0 animate-in zoom-in duration-300" />
                    )
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
                <span>{isImage ? 'Click en la imagen para ampliar' : 'Click para Descargar'}</span>
              </div>
            )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {format(new Date(message.timestamp), "h:mm a")}
            </span>
          </div>
        </div>
      </>
    );
  }

  return null;
}
