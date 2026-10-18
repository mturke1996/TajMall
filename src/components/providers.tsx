"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { DirectionProvider } from "@radix-ui/react-direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,       // 5 min — بيانات جاهزة عند التنقل
            gcTime: 30 * 60 * 1000,     // 30 min في الذاكرة
            placeholderData: keepPreviousData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          // Writes are never retried automatically: if the first request reached the server and
          // only the response was lost, a retry would record the same payment twice.
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange={false}
    >
      <QueryClientProvider client={client}>
        {/* Radix menus, tabs and selects read this for keyboard arrows and submenu sides. */}
        <DirectionProvider dir="rtl">
          <TooltipProvider delayDuration={80}>
            <ConfirmProvider>{children}</ConfirmProvider>
          </TooltipProvider>
        </DirectionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
