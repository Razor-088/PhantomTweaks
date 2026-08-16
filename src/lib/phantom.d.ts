export interface PhantomApi {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, cb: (...args: any[]) => void): () => void;
}

declare global {
  interface Window {
    phantom: PhantomApi;
  }
}
