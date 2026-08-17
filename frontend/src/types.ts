export interface ConsoleLine {
  sequence: number;
  timestamp: string;
  text: string;
}

export interface SettingsData {
  rcon: {
    address: string;
    configured: boolean;
    source: string;
    credentialUpdatesEnabled: boolean;
  };
  deployment: {
    minecraftContainer: string;
    worldName: string;
    cookieSecure: boolean;
    trustedProxyCount: number;
    maxUploadBytes: number;
  };
}
