import AsyncStorage from '@react-native-async-storage/async-storage';

class ServerConfig {
  private static instance: ServerConfig;
  private ipAddress: string = '192.168.1.67';
  private baseURL: string = `http://${this.ipAddress}:3001`;

  private constructor() {}

  static getInstance(): ServerConfig {
    if (!ServerConfig.instance) {
      ServerConfig.instance = new ServerConfig();
    }
    return ServerConfig.instance;
  }

  async initialize(): Promise<void> {
    try {
      const savedIP = await AsyncStorage.getItem('server_ip');
      if (savedIP) {
        this.setIPAddress(savedIP);
      }
      console.log('✅ ServerConfig inizializzato');
    } catch (error) {
      console.error('❌ Errore inizializzazione ServerConfig:', error);
    }
  }

  setIPAddress(ip: string): void {
    this.ipAddress = ip;
    this.baseURL = `http://${ip}:3001`;
    console.log(`🔄 IP server configurato: ${ip}`);
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  getIPAddress(): string {
    return this.ipAddress;
  }

  async saveIPAddress(ip: string): Promise<void> {
    try {
      this.setIPAddress(ip);
      await AsyncStorage.setItem('server_ip', ip);
      console.log('💾 IP server salvato:', ip);
    } catch (error) {
      console.error('❌ Errore salvataggio IP:', error);
      throw error;
    }
  }
}

export const serverConfig = ServerConfig.getInstance();