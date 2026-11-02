/** デスクトップ版(Electron)が渡す口。ブラウザで開いたときは undefined */
export interface DesktopBridge {
  setHosting(on: boolean): Promise<HostingStatus>;
  hostingStatus(): Promise<HostingStatus & { remote: boolean }>;
  connect(address: string): Promise<{ ok: boolean; error?: string }>;
  goHome(): Promise<void>;
}

export interface HostingStatus {
  hosting: boolean;
  /** 自分の PC のアドレス(IPv4) */
  addresses: string[];
  /** ほかの PC から入ってもらう番号 */
  port: number;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { desktop?: DesktopBridge }).desktop;
