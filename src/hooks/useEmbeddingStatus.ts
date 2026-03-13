import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

type EmbeddingStatus = "processing" | "idle";

interface EmbeddingStatusPayload {
  status: EmbeddingStatus;
}

export function useEmbeddingStatus() {
  const [status, setStatus] = useState<EmbeddingStatus>("idle");

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const fn = await listen<EmbeddingStatusPayload>("embedding-status", (event) => {
          if (!isMounted) return;
          setStatus(event.payload.status);
        });

        if (!isMounted) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch (error) {
        console.error("[EmbeddingStatus] Failed to setup listener:", error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return {
    status,
    isProcessing: status === "processing",
  };
}
