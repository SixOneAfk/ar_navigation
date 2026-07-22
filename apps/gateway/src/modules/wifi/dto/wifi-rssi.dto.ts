export type WifiRssiReadingDto = {
  bssid: string;
  ssid?: string;
  rssi: number;
};

export class WifiRssiDto {
  deviceId!: string;
  readings!: WifiRssiReadingDto[];
  timestamp!: string;
}
