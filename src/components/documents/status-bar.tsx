"use client";

import { Cloud, Loader2, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SyncStatus } from "@/types/document";

type StatusBarProps = {
  isOnline: boolean;
  syncStatus: SyncStatus;
};

function syncVariant(status: SyncStatus) {
  if (status === "synced") return "success";
  if (status === "error" || status === "offline") return "warning";
  return "secondary";
}

export function StatusBar({ isOnline, syncStatus }: StatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={isOnline ? "success" : "warning"}>
        {isOnline ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
        {isOnline ? "Online" : "Offline"}
      </Badge>
      <Badge variant={syncVariant(syncStatus)}>
        {syncStatus === "syncing" ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Cloud className="mr-1 h-3 w-3" />
        )}
        {syncStatus}
      </Badge>
    </div>
  );
}
