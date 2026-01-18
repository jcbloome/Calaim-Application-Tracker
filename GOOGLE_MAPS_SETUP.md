# Google Maps API Setup

## Environment Variable Required

To enable Google Maps functionality in the CalAIM Application Tracker, you need to set up a Google Maps API key.

### Steps:

1. **Get a Google Maps API Key:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the "Maps JavaScript API"
   - Create credentials (API Key)
   - Restrict the API key to your domain for security

2. **Set Environment Variable:**
   Create a `.env.local` file in the project root with:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

3. **Restart Development Server:**
   ```bash
   npm run dev
   ```

## Current Status

- **Map Intelligence Page**: Will show "Google Maps API key not configured" until the key is set
- **SimpleMapTest Component**: Handles missing API key gracefully with fallback message
- **All map functionality**: Requires the API key to display interactive maps

## Fallback Behavior

When the API key is not configured:
- Maps show an error message instead of crashing
- Resource counts still load from Caspio APIs
- All other functionality remains available

## Security Note

- Use `NEXT_PUBLIC_` prefix for client-side access
- Restrict API key to your domain in Google Cloud Console
- Never commit API keys to version control