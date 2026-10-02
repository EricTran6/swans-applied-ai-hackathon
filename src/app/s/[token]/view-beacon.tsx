"use client";
import { useEffect } from "react";
import { postView } from "@/components/share/provider/logic";

export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    void postView(token);
  }, [token]);
  return null;
}
