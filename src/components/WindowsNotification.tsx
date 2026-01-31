'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { 
  Bell, 
  X, 
  Target, 
  MessageSquare, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  User,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WindowsNotificationProps {
  keyId?: string;
  id: string;
  type: 'note' | 'task' | 'urgent' | 'success' | 'warning';
  title: string;
  message: string;
  author?: string;
  memberName?: string;
  timestamp?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  duration?: number;
  minimizeAfter?: number;
  pendingLabel?: string;
  sound?: boolean;
  soundType?: 'mellow-note' | 'arrow-target' | 'bell' | 'chime' | 'pop' | 'windows-default' | 'success-ding' | 'message-swoosh' | 'alert-beep' | 'coin-drop' | 'bubble-pop' | 'typewriter-ding' | 'glass-ping' | 'wooden-knock' | 'digital-blip' | 'water-drop' | 'silent';
  animation?: 'bounce' | 'slide' | 'fade' | 'pulse';
  followUpDate?: string;
  replyUrl?: string;
  requiresSecondClick?: boolean;
  disableCardClick?: boolean;
  startMinimized?: boolean;
  lockToTray?: boolean;
  tagLabel?: string;
  links?: Array<{ label: string; url: string }>;
  onFollowUpSave?: (date: string) => void;
  onClose?: () => void;
  onClick?: () => void;
}

const TYPE_CONFIGS = {
  note: {
    icon: MessageSquare,
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-900'
  },
  task: {
    icon: Clock,
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50 border-orange-200',
    textColor: 'text-orange-900'
  },
  urgent: {
    icon: AlertTriangle,
    color: 'bg-red-500',
    bgColor: 'bg-red-50 border-red-200',
    textColor: 'text-red-900'
  },
  success: {
    icon: CheckCircle2,
    color: 'bg-green-500',
    bgColor: 'bg-green-50 border-green-200',
    textColor: 'text-green-900'
  },
  warning: {
    icon: AlertTriangle,
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-50 border-yellow-200',
    textColor: 'text-yellow-900'
  }
};

const PRIORITY_COLORS = {
  'Low': 'bg-gray-100 text-gray-800',
  'Medium': 'bg-blue-100 text-blue-800',
  'High': 'bg-orange-100 text-orange-800',
  'Urgent': 'bg-red-100 text-red-800'
};

export default function WindowsNotification({
  id,
  type,
  title,
  message,
  author,
  memberName,
  timestamp,
  priority,
  duration = 5000,
  minimizeAfter = 7000,
  pendingLabel = 'Pending note',
  sound = true,
  soundType = 'mellow-note',
  animation = 'slide',
  followUpDate,
  replyUrl,
  requiresSecondClick = false,
  disableCardClick = false,
  startMinimized = false,
  onFollowUpSave,
  onClose,
  onClick
}: WindowsNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(startMinimized);
  const [hasClickedOnce, setHasClickedOnce] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpSaved, setFollowUpSaved] = useState(false);
  const isUrgent = priority === 'Urgent';
  const urgentAccentClass = 'bg-orange-500';
  const formattedFollowUpDate = followUpDate
    ? new Date(followUpDate).toLocaleDateString()
    : '';
  const formattedTimestamp = timestamp
    ? new Date(timestamp).toLocaleString()
    : '';

  const config = TYPE_CONFIGS[type];
  const IconComponent = config.icon;

  // Play notification sound
  const playSound = async () => {
    if (!sound) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      let audioBuffer: AudioBuffer;

      switch (soundType) {
        case 'mellow-note':
          audioBuffer = generateMellowNoteSound(audioContext);
          break;
        case 'arrow-target':
          audioBuffer = generateArrowTargetSound(audioContext);
          break;
        case 'bell':
          audioBuffer = generateBellSound(audioContext);
          break;
        case 'chime':
          audioBuffer = generateChimeSound(audioContext);
          break;
        case 'pop':
          audioBuffer = generatePopSound(audioContext);
          break;
        case 'windows-default':
          audioBuffer = generateWindowsDefaultSound(audioContext);
          break;
        case 'success-ding':
          audioBuffer = generateSuccessDingSound(audioContext);
          break;
        case 'message-swoosh':
          audioBuffer = generateMessageSwooshSound(audioContext);
          break;
        case 'alert-beep':
          audioBuffer = generateAlertBeepSound(audioContext);
          break;
        case 'coin-drop':
          audioBuffer = generateCoinDropSound(audioContext);
          break;
        case 'bubble-pop':
          audioBuffer = generateBubblePopSound(audioContext);
          break;
        case 'typewriter-ding':
          audioBuffer = generateTypewriterDingSound(audioContext);
          break;
        case 'glass-ping':
          audioBuffer = generateGlassPingSound(audioContext);
          break;
        case 'wooden-knock':
          audioBuffer = generateWoodenKnockSound(audioContext);
          break;
        case 'digital-blip':
          audioBuffer = generateDigitalBlipSound(audioContext);
          break;
        case 'water-drop':
          audioBuffer = generateWaterDropSound(audioContext);
          break;
        case 'silent':
          return; // No sound for silent mode
        default:
          audioBuffer = generateMellowNoteSound(audioContext);
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  // Generate arrow hit target sound (satisfying thunk)
  const generateArrowTargetSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.4;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 6);
      const frequency = 180 * (1 + envelope * 3);
      // Add some noise for the "thunk" effect
      const noise = (Math.random() - 0.5) * 0.1 * envelope;
      data[i] = envelope * (Math.sin(2 * Math.PI * frequency * t) * 0.4 + noise);
    }

    return buffer;
  };

  // Generate other sounds (simplified versions)
  const generateMellowNoteSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.7;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const base = 440;
    const harmonic = 660;

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 2.8);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * base * t) * 0.18 +
        Math.sin(2 * Math.PI * harmonic * t) * 0.12
      );
    }

    return buffer;
  };
  const generateBellSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 2.5);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * 800 * t) * 0.3 +
        Math.sin(2 * Math.PI * 1200 * t) * 0.2 +
        Math.sin(2 * Math.PI * 1600 * t) * 0.1
      );
    }

    return buffer;
  };

  const generateChimeSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.5;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 3);
      data[i] = envelope * Math.sin(2 * Math.PI * 600 * t) * 0.3;
    }

    return buffer;
  };

  const generatePopSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.15;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 15);
      data[i] = envelope * Math.sin(2 * Math.PI * 1200 * t) * 0.5;
    }

    return buffer;
  };

  // Additional sound generation functions
  const generateWindowsDefaultSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.5;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 2);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * 800 * t) * 0.3 +
        Math.sin(2 * Math.PI * 1000 * t) * 0.2 +
        Math.sin(2 * Math.PI * 1200 * t) * 0.1
      );
    }
    return buffer;
  };

  const generateSuccessDingSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 1.5);
      const frequency = 600 + (t * 400);
      data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.3;
    }
    return buffer;
  };

  const generateMessageSwooshSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.4;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 5);
      const frequency = 1200 - (t * 800);
      const noise = (Math.random() - 0.5) * 0.1 * envelope;
      data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.2 + noise;
    }
    return buffer;
  };

  const generateAlertBeepSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 8);
      data[i] = envelope * Math.sin(2 * Math.PI * 1500 * t) * 0.4;
    }
    return buffer;
  };

  const generateCoinDropSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.8;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 3);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * 1000 * t) * 0.4 +
        Math.sin(2 * Math.PI * 2000 * t) * 0.2 +
        Math.sin(2 * Math.PI * 3000 * t) * 0.1
      );
    }
    return buffer;
  };

  const generateBubblePopSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.2;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 15);
      data[i] = envelope * Math.sin(2 * Math.PI * 2000 * t) * 0.3;
    }
    return buffer;
  };

  const generateTypewriterDingSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.7;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 2);
      data[i] = envelope * (
        Math.sin(2 * Math.PI * 1200 * t) * 0.4 +
        Math.sin(2 * Math.PI * 2400 * t) * 0.2
      );
    }
    return buffer;
  };

  const generateGlassPingSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.5;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 4);
      data[i] = envelope * Math.sin(2 * Math.PI * 2500 * t) * 0.25;
    }
    return buffer;
  };

  const generateWoodenKnockSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 10);
      const noise = (Math.random() - 0.5) * 0.2 * envelope;
      data[i] = envelope * Math.sin(2 * Math.PI * 300 * t) * 0.4 + noise;
    }
    return buffer;
  };

  const generateDigitalBlipSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.15;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 12);
      const square = Math.sign(Math.sin(2 * Math.PI * 1000 * t));
      data[i] = envelope * square * 0.3;
    }
    return buffer;
  };

  const generateWaterDropSound = (audioContext: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 3);
      const frequency = 800 - (t * 200);
      data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.2;
    }
    return buffer;
  };

  // Handle close
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  // Handle click
  const handleClick = () => {
    if (requiresSecondClick && !hasClickedOnce) {
      setHasClickedOnce(true);
      return;
    }
    onClick?.();
    handleClose();
  };

  // Animation classes
  const getAnimationClasses = () => {
    const base = 'transition-all duration-500 ease-in-out';
    
    if (isClosing) {
      switch (animation) {
        case 'slide':
          return `${base} transform translate-y-full opacity-0`;
        case 'bounce':
          return `${base} transform scale-75 opacity-0`;
        case 'fade':
          return `${base} opacity-0`;
        case 'pulse':
          return `${base} transform scale-90 opacity-0`;
        default:
          return `${base} transform translate-y-full opacity-0`;
      }
    }

    if (!isVisible) {
      switch (animation) {
        case 'slide':
          return `${base} transform translate-y-full opacity-0`;
        case 'bounce':
          return `${base} transform scale-75 opacity-0`;
        case 'fade':
          return `${base} opacity-0`;
        case 'pulse':
          return `${base} transform scale-110 opacity-0`;
        default:
          return `${base} transform translate-y-full opacity-0`;
      }
    }

    switch (animation) {
      case 'bounce':
        return `${base} transform scale-100 opacity-100 animate-bounce`;
      case 'pulse':
        return `${base} transform scale-100 opacity-100 animate-pulse`;
      default:
        return `${base} transform translate-y-0 opacity-100`;
    }
  };

  useEffect(() => {
    // Show notification
    setTimeout(() => setIsVisible(true), 100);
    
    // Play sound
    if (sound) {
      setTimeout(() => playSound(), 200);
    }

    let closeTimer: NodeJS.Timeout | undefined;
    let minimizeTimer: NodeJS.Timeout | undefined;

    if (minimizeAfter > 0) {
      minimizeTimer = setTimeout(() => {
        setIsMinimized(true);
      }, minimizeAfter);
    }

    // Auto close (optional)
    if (duration > 0) {
      closeTimer = setTimeout(() => {
        handleClose();
      }, duration);
    }

    return () => {
      if (closeTimer) clearTimeout(closeTimer);
      if (minimizeTimer) clearTimeout(minimizeTimer);
    };
  }, []);

  if (isMinimized) {
    return (
      <Card
        className={cn(
          'fixed bottom-4 right-4 z-50 cursor-pointer shadow-lg border bg-white text-slate-900',
          isUrgent ? 'border-orange-500' : 'border-slate-200',
          getAnimationClasses()
        )}
        onClick={() => {
          setIsMinimized(false);
          if (requiresSecondClick) {
            setHasClickedOnce(true);
          }
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className={cn('p-1 rounded-full', isUrgent ? `${urgentAccentClass} animate-pulse` : 'bg-blue-500')}>
            <Bell className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs text-slate-700">{pendingLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        'fixed bottom-4 right-4 z-50 w-80 cursor-pointer shadow-lg border bg-white text-slate-900',
        isUrgent ? 'border-orange-500' : 'border-slate-200',
        getAnimationClasses()
      )}
      onClick={disableCardClick ? undefined : handleClick}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-full', isUrgent ? `${urgentAccentClass} animate-pulse` : 'bg-blue-500')}>
              <IconComponent className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                Connections Note
              </span>
            </div>
            <div className="flex items-center gap-2">
              {priority && (
                <Badge className={cn(
                  'text-xs text-white',
                  isUrgent ? 'bg-orange-500 border-orange-400 animate-pulse' : 'bg-orange-500 border-orange-400'
                )}>
                  {priority}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 leading-snug">
            {message}
          </p>
          
          {/* Author and Member info */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {author && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{author}</span>
              </div>
            )}
            {memberName && (
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                <span>{memberName}</span>
              </div>
            )}
            {formattedTimestamp && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Sent: {formattedTimestamp}</span>
              </div>
            )}
            {formattedFollowUpDate && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Follow-up: {formattedFollowUpDate}</span>
              </div>
            )}
          </div>

          {formattedFollowUpDate && (
            <div className="pt-1">
              <Badge variant="outline" className="text-xs">
                Follow-up scheduled
              </Badge>
            </div>
          )}

          {(replyUrl || onClick || onFollowUpSave) && (
            <div className="pt-1 flex flex-wrap gap-2">
              {replyUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (typeof window !== 'undefined') {
                      window.location.href = replyUrl;
                    }
                    handleClose();
                  }}
                >
                  Reply
                </Button>
              )}
              {onFollowUpSave && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFollowUpDraft(followUpDate ? followUpDate.split('T')[0] : '');
                    setIsFollowUpOpen(true);
                  }}
                >
                  Set Follow-up
                </Button>
              )}
              {onClick && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClick();
                    handleClose();
                  }}
                >
                  Go to Notes
                </Button>
              )}
            </div>
          )}
        </div>

        <Dialog open={isFollowUpOpen} onOpenChange={setIsFollowUpOpen}>
          <DialogContent className="max-w-sm" onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Follow-up Date</DialogTitle>
              <DialogDescription>Pick a follow-up date to add this task.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                type="date"
                value={followUpDraft}
                onChange={(event) => setFollowUpDraft(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFollowUpOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!followUpDraft) return;
                  onFollowUpSave?.(followUpDraft);
                  setIsFollowUpOpen(false);
                  setFollowUpSaved(true);
                  setTimeout(() => setFollowUpSaved(false), 3000);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {followUpSaved && (
          <div className="pt-2">
            <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
              Follow-up saved
            </Badge>
          </div>
        )}

        {/* Visual effect for arrow hitting target */}
        {soundType === 'arrow-target' && isVisible && (
          <div className="absolute top-2 right-2">
            <div className="relative">
              <Target className="h-6 w-6 text-red-500 animate-pulse" />
              <div className="absolute inset-0 animate-ping">
                <Target className="h-6 w-6 text-red-300" />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Notification Manager Hook
export function useWindowsNotifications() {
  const [notifications, setNotifications] = useState<WindowsNotificationProps[]>([]);

  const showNotification = (notification: Omit<WindowsNotificationProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: WindowsNotificationProps = {
      ...notification,
      id,
      onClose: () => removeNotification(id)
    };

    setNotifications((prev) => {
      if (!notification.keyId) {
        return [...prev, newNotification];
      }
      const withoutKey = prev.filter((item) => item.keyId !== notification.keyId);
      return [...withoutKey, newNotification];
    });

    // Auto-remove after duration
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.duration + 500); // Add buffer for animation
    }

    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return {
    notifications,
    showNotification,
    removeNotification,
    clearAll
  };
}

// Notification Container Component
export function WindowsNotificationContainer() {
  const { notifications } = useWindowsNotifications();

  return (
    <div className="fixed top-0 right-0 z-50 pointer-events-none">
      <div className="space-y-2 p-4">
        {notifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <WindowsNotification {...notification} />
          </div>
        ))}
      </div>
    </div>
  );
}