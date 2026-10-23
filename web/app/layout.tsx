import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title: 'DDA Analysis — EEG workspace', description: 'Prepare EEG recordings and explore pooled delay differential analysis in one workspace.'};
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
