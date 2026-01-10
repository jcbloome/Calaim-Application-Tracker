'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  id: string;
  type: 'note' | 'task' | 'urgent' | 'success' | 'warning';
  title: string;
  message: string;
  author?: string;
  memberName?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  duration?: number;
  sound?: boolean;
  soundType?: 'arrow-target' | 'bell' | 'chime' | 'pop';
  animation?: 'bounce' | 'slide' | 'fade' | 'pulse';
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
  priority,
  duration = 5000,
  sound = true,
  soundType = 'arrow-target',
  animation = 'slide',
  onClose,
  onClick
}: WindowsNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const config = TYPE_CONFIGS[type];
  const IconComponent = config.icon;

  // Play notification sound
  const playSound = async () => {
    if (!sound) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      let audioBuffer: AudioBuffer;

      switch (soundType) {
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
        default:
          audioBuffer = generateArrowTargetSound(audioContext);
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
    onClick?.();
    handleClose();
  };

  // Animation classes
  const getAnimationClasses = () => {
    const base = 'transition-all duration-300 ease-out';
    
    if (isClosing) {
      switch (animation) {
        case 'slide':
          return `${base} transform translate-x-full opacity-0`;
        case 'bounce':
          return `${base} transform scale-75 opacity-0`;
        case 'fade':
          return `${base} opacity-0`;
        case 'pulse':
          return `${base} transform scale-90 opacity-0`;
        default:
          return `${base} transform translate-x-full opacity-0`;
      }
    }

    if (!isVisible) {
      switch (animation) {
        case 'slide':
          return `${base} transform translate-x-full opacity-0`;
        case 'bounce':
          return `${base} transform scale-75 opacity-0`;
        case 'fade':
          return `${base} opacity-0`;
        case 'pulse':
          return `${base} transform scale-110 opacity-0`;
        default:
          return `${base} transform translate-x-full opacity-0`;
      }
    }

    switch (animation) {
      case 'bounce':
        return `${base} transform scale-100 opacity-100 animate-bounce`;
      case 'pulse':
        return `${base} transform scale-100 opacity-100 animate-pulse`;
      default:
        return `${base} transform translate-x-0 opacity-100`;
    }
  };

  useEffect(() => {
    // Show notification
    setTimeout(() => setIsVisible(true), 100);
    
    // Play sound
    if (sound) {
      setTimeout(() => playSound(), 200);
    }

    // Auto close
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <Card 
      className={cn(
        'fixed top-4 right-4 z-50 w-80 cursor-pointer shadow-lg border-2',
        config.bgColor,
        getAnimationClasses()
      )}
      onClick={handleClick}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-full', config.color)}>
              <IconComponent className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('font-semibold text-sm', config.textColor)}>
                {title}
              </span>
              {priority && (
                <Badge className={cn('text-xs', PRIORITY_COLORS[priority])}>
                  {priority}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-gray-200"
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
          <p className={cn('text-sm', config.textColor)}>{message}</p>
          
          {/* Author and Member info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
          </div>
        </div>

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

    setNotifications(prev => [...prev, newNotification]);

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