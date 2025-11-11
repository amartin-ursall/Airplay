import { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface ImagePreviewProps {
  src: string;
  alt: string;
  onClose: () => void;
  onDownload?: () => void;
}

export function ImagePreview({ src, alt, onClose, onDownload }: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          disabled={zoom <= 0.5}
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          disabled={zoom >= 3}
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
        {onDownload && (
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="w-5 h-5" />
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div
        className="overflow-auto max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            "transition-transform duration-200 max-w-none",
            zoom !== 1 && "cursor-zoom-out"
          )}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center'
          }}
          onClick={() => {
            if (zoom > 1) {
              setZoom(1);
            }
          }}
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm">
        {alt} • {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
