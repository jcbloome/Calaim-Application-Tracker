// Shared token storage for password reset functionality
// In production, this should be replaced with Redis or a database

import fs from 'fs';
import path from 'path';

interface ResetTokenData {
  email: string;
  expires: number;
}

class ResetTokenStore {
  private tokens = new Map<string, ResetTokenData>();
  private tokenFilePath = path.join(process.cwd(), '.tmp-reset-tokens.json');

  constructor() {
    // Load existing tokens from file in development
    if (process.env.NODE_ENV === 'development') {
      this.loadTokensFromFile();
    }
  }

  private loadTokensFromFile(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = fs.readFileSync(this.tokenFilePath, 'utf8');
        const tokenData = JSON.parse(data);
        
        // Load non-expired tokens
        const now = Date.now();
        for (const [token, data] of Object.entries(tokenData)) {
          const tokenInfo = data as ResetTokenData;
          if (now <= tokenInfo.expires) {
            this.tokens.set(token, tokenInfo);
          }
        }
        
        console.log(`🔄 Loaded ${this.tokens.size} valid reset tokens from file`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load reset tokens from file:', error);
    }
  }

  private saveTokensToFile(): void {
    if (process.env.NODE_ENV === 'development') {
      try {
        const tokenData: Record<string, ResetTokenData> = {};
        for (const [token, data] of this.tokens.entries()) {
          tokenData[token] = data;
        }
        
        fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokenData, null, 2));
      } catch (error) {
        console.warn('⚠️ Could not save reset tokens to file:', error);
      }
    }
  }

  set(token: string, data: ResetTokenData): void {
    this.tokens.set(token, data);
    this.saveTokensToFile();
    console.log(`💾 Stored reset token for: ${data.email} (expires: ${new Date(data.expires).toLocaleString()})`);
  }

  get(token: string): ResetTokenData | undefined {
    const data = this.tokens.get(token);
    if (data) {
      console.log(`🔍 Found reset token for: ${data.email}`);
    } else {
      console.log(`❌ Reset token not found: ${token.substring(0, 8)}...`);
    }
    return data;
  }

  delete(token: string): boolean {
    const result = this.tokens.delete(token);
    if (result) {
      this.saveTokensToFile();
      console.log(`🗑️ Deleted reset token: ${token.substring(0, 8)}...`);
    }
    return result;
  }

  // Clean up expired tokens
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expires) {
        this.tokens.delete(token);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.saveTokensToFile();
      console.log(`🧹 Cleaned up ${deletedCount} expired reset tokens`);
    }
  }
}

// Export a singleton instance
export const resetTokenStore = new ResetTokenStore();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  resetTokenStore.cleanup();
}, 5 * 60 * 1000);