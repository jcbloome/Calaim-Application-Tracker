// Shared token storage for password reset functionality
// In production, this should be replaced with Redis or a database

interface ResetTokenData {
  email: string;
  expires: number;
}

class ResetTokenStore {
  private tokens = new Map<string, ResetTokenData>();

  set(token: string, data: ResetTokenData): void {
    this.tokens.set(token, data);
  }

  get(token: string): ResetTokenData | undefined {
    return this.tokens.get(token);
  }

  delete(token: string): boolean {
    return this.tokens.delete(token);
  }

  // Clean up expired tokens
  cleanup(): void {
    const now = Date.now();
    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expires) {
        this.tokens.delete(token);
      }
    }
  }
}

// Export a singleton instance
export const resetTokenStore = new ResetTokenStore();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  resetTokenStore.cleanup();
}, 5 * 60 * 1000);