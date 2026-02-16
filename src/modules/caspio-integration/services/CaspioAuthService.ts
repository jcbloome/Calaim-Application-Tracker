// Caspio Authentication Service
// Handles token management, caching, and refresh logic

import { CASPIO_CONFIG } from '../config/constants';
import type { CaspioAuthToken } from '../types';

export class CaspioAuthService {
  private token: CaspioAuthToken | null = null;
  private isConnected: boolean = false;
  private lastActivity: Date | null = null;

  constructor() {
    // Initialize with environment variables
    this.validateConfiguration();
  }

  /**
   * Validate that required environment variables are set
   */
  private validateConfiguration(): void {
    const clientId = process.env.CASPIO_CLIENT_ID;
    const clientSecret = process.env.CASPIO_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.warn('⚠️ Caspio credentials not configured. Some features may not work.');
    }
  }

  /**
   * Get a valid access token (handles refresh automatically)
   */
  async getValidToken(): Promise<string> {
    try {
      // Check if current token is still valid
      if (this.token && this.isTokenValid(this.token)) {
        this.updateLastActivity();
        return this.token.access_token;
      }

      // Get new token
      console.log('🔄 Requesting new Caspio access token...');
      this.token = await this.requestNewToken();
      this.isConnected = true;
      this.updateLastActivity();
      
      console.log('✅ Caspio access token obtained successfully');
      return this.token.access_token;
    } catch (error) {
      this.isConnected = false;
      console.error('❌ Failed to get Caspio access token:', error);
      throw new Error(`Caspio authentication failed: ${error.message}`);
    }
  }

  /**
   * Request a new access token from Caspio
   */
  private async requestNewToken(): Promise<CaspioAuthToken> {
    const clientId = process.env.CASPIO_CLIENT_ID;
    const clientSecret = process.env.CASPIO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Caspio credentials not configured');
    }

    // Caspio OAuth token endpoint does NOT live under /rest/v2.
    // Some parts of the codebase store BASE_URL as ".../rest/v2" for table calls,
    // so we must strip it here to avoid auth failures.
    const authBaseUrl = String(CASPIO_CONFIG.BASE_URL || '')
      .replace(/\/rest\/v2\/?$/i, '')
      .replace(/\/rest\/v2\/?/i, '');
    const tokenUrl = `${authBaseUrl}${CASPIO_CONFIG.AUTH.TOKEN_ENDPOINT}`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: CASPIO_CONFIG.AUTH.GRANT_TYPE,
        scope: CASPIO_CONFIG.AUTH.SCOPE
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const tokenData = await response.json();
    
    // Calculate expiration time with buffer
    const expiresAt = Date.now() + (tokenData.expires_in * 1000) - CASPIO_CONFIG.AUTH.TOKEN_BUFFER_TIME;

    return {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      expires_at: expiresAt,
      scope: tokenData.scope
    };
  }

  /**
   * Check if token is still valid (not expired)
   */
  private isTokenValid(token: CaspioAuthToken): boolean {
    return Date.now() < token.expires_at;
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    this.lastActivity = new Date();
  }

  /**
   * Clear cached token (force refresh on next request)
   */
  clearCache(): void {
    this.token = null;
    this.isConnected = false;
    console.log('🗑️ Caspio auth cache cleared');
  }

  /**
   * Check if service is currently connected
   */
  isConnected(): boolean {
    return this.isConnected && this.token !== null && this.isTokenValid(this.token);
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): Date | null {
    return this.lastActivity;
  }

  /**
   * Get current token info (for debugging)
   */
  getTokenInfo(): {
    hasToken: boolean;
    isValid: boolean;
    expiresAt: Date | null;
    tokenType: string | null;
  } {
    return {
      hasToken: this.token !== null,
      isValid: this.token ? this.isTokenValid(this.token) : false,
      expiresAt: this.token ? new Date(this.token.expires_at) : null,
      tokenType: this.token?.token_type || null
    };
  }

  /**
   * Test connection to Caspio API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getValidToken();
      return true;
    } catch (error) {
      console.error('🔴 Caspio connection test failed:', error);
      return false;
    }
  }
}