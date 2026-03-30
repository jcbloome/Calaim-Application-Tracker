// Global Google Maps loader to prevent multiple script loads

interface GoogleMapsLoaderState {
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  callbacks: (() => void)[];
}

// Global state to track Google Maps loading
const state: GoogleMapsLoaderState = {
  isLoading: false,
  isLoaded: false,
  error: null,
  callbacks: []
};

export function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    // If already loaded, resolve immediately
    if (state.isLoaded && window.google && window.google.maps) {
      resolve();
      return;
    }

    // If there's an error, reject immediately
    if (state.error) {
      reject(new Error(state.error));
      return;
    }

    // Add callback to queue
    state.callbacks.push(() => {
      if (state.error) {
        reject(new Error(state.error));
      } else {
        resolve();
      }
    });

    // If already loading, just wait for callbacks
    if (state.isLoading) {
      return;
    }

    // Start loading
    state.isLoading = true;

    const startLoad = async () => {
      let apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

      // Fallback for environments where only server-side GOOGLE_MAPS_API_KEY is set.
      if (!apiKey) {
        try {
          const response = await fetch('/api/config/google-maps-key', { cache: 'no-store' });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload?.apiKey) {
            apiKey = String(payload.apiKey);
          }
        } catch {
          // Keep behavior deterministic below.
        }
      }

      if (!apiKey) {
        const error = 'Google Maps API key not configured';
        state.error = error;
        state.isLoading = false;
        executeCallbacks();
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        console.log('🔄 Google Maps script already exists, waiting for load...');
        // Wait for existing script to load
        const checkLoaded = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(checkLoaded);
            state.isLoaded = true;
            state.isLoading = false;
            executeCallbacks();
          }
        }, 100);
        return;
      }

      // Create global callback
      const callbackName = 'initGlobalGoogleMaps';
      (window as any)[callbackName] = () => {
        console.log('✅ Google Maps loaded via global callback');
        state.isLoaded = true;
        state.isLoading = false;
        executeCallbacks();
        // Cleanup callback
        delete (window as any)[callbackName];
      };

      // Load script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}`;
      script.async = true;
      script.defer = true;

      script.onerror = () => {
        state.error = 'Failed to load Google Maps script';
        state.isLoading = false;
        executeCallbacks();
        delete (window as any)[callbackName];
      };

      document.head.appendChild(script);
    };

    startLoad().catch((error: any) => {
      state.error = error?.message || 'Failed to initialize Google Maps';
      state.isLoading = false;
      executeCallbacks();
    });
  });
}

function executeCallbacks() {
  const callbacks = [...state.callbacks];
  state.callbacks = [];
  callbacks.forEach(callback => callback());
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    google: any;
    initGlobalGoogleMaps: () => void;
  }
}