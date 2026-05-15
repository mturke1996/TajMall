'use client';

import React, { createContext, useContext } from 'react';

type PdfLogoCtx = { logoDataUri: string | null };

const PdfLogoContext = createContext<PdfLogoCtx>({ logoDataUri: null });

export function PdfLogoProvider({
  uri,
  children,
}: {
  uri: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <PdfLogoContext.Provider value={{ logoDataUri: uri ?? null }}>
      {children}
    </PdfLogoContext.Provider>
  );
}

export function usePdfLogoDataUri(): string | null {
  return useContext(PdfLogoContext).logoDataUri;
}
