export type NotificationSoundType =
  | 'mellow-note'
  | 'arrow-target'
  | 'bell'
  | 'chime'
  | 'pop'
  | 'windows-default'
  | 'success-ding'
  | 'message-swoosh'
  | 'alert-beep'
  | 'coin-drop'
  | 'bubble-pop'
  | 'typewriter-ding'
  | 'glass-ping'
  | 'wooden-knock'
  | 'digital-blip'
  | 'water-drop'
  | 'silent';

export const playNotificationSound = async (soundType: NotificationSoundType) => {
  if (soundType === 'silent') return;

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

const generateArrowTargetSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.4;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 6);
    const frequency = 180 * (1 + envelope * 3);
    const noise = (Math.random() - 0.5) * 0.1 * envelope;
    data[i] = envelope * (Math.sin(2 * Math.PI * frequency * t) * 0.4 + noise);
  }

  return buffer;
};

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
    const frequency = 400 + (Math.random() - 0.5) * 100;
    data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.3;
  }

  return buffer;
};

const generateWindowsDefaultSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.4;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 4);
    data[i] = envelope * (
      Math.sin(2 * Math.PI * 523 * t) * 0.3 +
      Math.sin(2 * Math.PI * 784 * t) * 0.2
    );
  }

  return buffer;
};

const generateSuccessDingSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.5;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 3.5);
    data[i] = envelope * (
      Math.sin(2 * Math.PI * 600 * t) * 0.25 +
      Math.sin(2 * Math.PI * 800 * t) * 0.2
    );
  }

  return buffer;
};

const generateMessageSwooshSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.35;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 5);
    const frequency = 1200 - (t * 600);
    data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.25;
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
    const envelope = Math.exp(-t * 8);
    data[i] = envelope * Math.sin(2 * Math.PI * 1000 * t) * 0.35;
  }

  return buffer;
};

const generateCoinDropSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.5;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 4);
    data[i] = envelope * (
      Math.sin(2 * Math.PI * 700 * t) * 0.25 +
      Math.sin(2 * Math.PI * 900 * t) * 0.15
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
    const envelope = Math.exp(-t * 12);
    const frequency = 600 + (Math.random() - 0.5) * 200;
    data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.25;
  }

  return buffer;
};

const generateTypewriterDingSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.45;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 4);
    data[i] = envelope * (
      Math.sin(2 * Math.PI * 900 * t) * 0.25 +
      Math.sin(2 * Math.PI * 1200 * t) * 0.2
    );
  }

  return buffer;
};

const generateGlassPingSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.6;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 3);
    data[i] = envelope * (
      Math.sin(2 * Math.PI * 1300 * t) * 0.2 +
      Math.sin(2 * Math.PI * 1700 * t) * 0.15
    );
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
    const envelope = Math.exp(-t * 6);
    data[i] = envelope * Math.sin(2 * Math.PI * 250 * t) * 0.4;
  }

  return buffer;
};

const generateDigitalBlipSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.2;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 10);
    data[i] = envelope * Math.sin(2 * Math.PI * 1100 * t) * 0.25;
  }

  return buffer;
};

const generateWaterDropSound = (audioContext: AudioContext): AudioBuffer => {
  const duration = 0.35;
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 4);
    const frequency = 800 - (t * 200);
    data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.2;
  }

  return buffer;
};
