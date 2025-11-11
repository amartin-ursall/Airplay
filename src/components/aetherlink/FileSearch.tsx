import { useState, useMemo } from 'react';
import { Search, X, File, Image as ImageIcon, Video, Music, FileText, Archive } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Message, RoomMessage } from '@shared/types';
import { format } from 'date-fns';

interface FileSearchProps {
  messages: (Message | RoomMessage)[];
  onFileClick?: (message: Message | RoomMessage) => void;
  onClose?: () => void;
}

function getFileIcon(filename: string, mimeType?: string) {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  if (mimeType?.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-blue-500" />;
  }

  if (mimeType?.startsWith('video/') || ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
    return <Video className="w-5 h-5 text-purple-500" />;
  }

  if (mimeType?.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
    return <Music className="w-5 h-5 text-green-500" />;
  }

  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return <Archive className="w-5 h-5 text-orange-500" />;
  }

  if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) {
    return <FileText className="w-5 h-5 text-red-500" />;
  }

  return <File className="w-5 h-5 text-gray-500" />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function FileSearch({ messages, onFileClick, onClose }: FileSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Filter only file messages
  const fileMessages = useMemo(() => {
    return messages.filter(msg => msg.type === 'file' && msg.file);
  }, [messages]);

  // Apply search and type filters
  const filteredFiles = useMemo(() => {
    let filtered = fileMessages;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(msg =>
        msg.file?.name.toLowerCase().includes(query)
      );
    }

    // Filter by file type
    if (selectedType) {
      filtered = filtered.filter(msg => {
        const ext = msg.file?.name.toLowerCase().substring(msg.file.name.lastIndexOf('.'));
        const mimeType = msg.file?.type;

        switch (selectedType) {
          case 'images':
            return mimeType?.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext || '');
          case 'videos':
            return mimeType?.startsWith('video/') || ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext || '');
          case 'audio':
            return mimeType?.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext || '');
          case 'documents':
            return ['.pdf', '.doc', '.docx', '.txt', '.md', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext || '');
          case 'archives':
            return ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext || '');
          default:
            return true;
        }
      });
    }

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }, [fileMessages, searchQuery, selectedType]);

  const fileTypes = [
    { id: 'images', label: 'Imágenes', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'documents', label: 'Documentos', icon: FileText },
    { id: 'archives', label: 'Archivos', icon: Archive },
  ];

  const totalSize = filteredFiles.reduce((sum, msg) => sum + (msg.file?.size || 0), 0);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold">Buscar Archivos</h2>
          <p className="text-sm text-muted-foreground">
            {filteredFiles.length} archivo{filteredFiles.length !== 1 ? 's' : ''}
            {totalSize > 0 && ` • ${formatFileSize(totalSize)}`}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre de archivo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* File Type Filters */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedType === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType(null)}
          >
            Todos
          </Button>
          {fileTypes.map(type => (
            <Button
              key={type.id}
              variant={selectedType === type.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(type.id)}
              className="gap-2"
            >
              <type.icon className="w-4 h-4" />
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* File List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-12">
              <File className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {searchQuery || selectedType
                  ? 'No se encontraron archivos'
                  : 'No hay archivos compartidos'}
              </p>
            </div>
          ) : (
            filteredFiles.map((msg) => (
              <button
                key={msg.id}
                onClick={() => onFileClick?.(msg)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700",
                  "hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                )}
              >
                <div className="flex-shrink-0">
                  {getFileIcon(msg.file!.name, msg.file!.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{msg.file!.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(msg.file!.size)}</span>
                    <span>•</span>
                    <span>{format(new Date(msg.timestamp), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
