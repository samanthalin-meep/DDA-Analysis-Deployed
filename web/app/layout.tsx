import type { Metadata } from 'next';
import './desktop.css';
export const metadata: Metadata = {title: 'DDALAB Pooled', description: 'DDALAB Pooled. EEG preparation and DDA analysis.'};
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
