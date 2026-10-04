// Network status hook using NetInfo + bridges to React Query's onlineManager.
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";

export function setupOnlineManager() {
  // Keep onlineManager in sync with device network state.
  return onlineManager.setEventListener((setOnline) => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    });
    return sub;
  });
}

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    });
    NetInfo.fetch().then((s) => setOnline(!!s.isConnected));
    return () => sub();
  }, []);
  return online;
}
