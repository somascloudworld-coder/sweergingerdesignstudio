import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { CartLink } from '@/components/CartLink';
import { StoreHydrator } from '@/components/StoreHydrator';

export const metadata: Metadata = {
  title: 'Sweet Ginger Design Studio',
  description:
    'Design a T-shirt on the real garment colour, in the browser, for a single order or a bulk run.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#b4462a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreHydrator />
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong>Sweet Ginger</strong>
              <span>Design Studio</span>
            </Link>
            <nav className="nav">
              <Link href="/">Design</Link>
              <CartLink />
              <Link href="/admin/orders">Staff</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <p className="footer-note">
          Sweet Ginger Fashions, Jaipur · Sweet Ginger Basics / The T-Shirt Shop / Ginger Prints
        </p>
      </body>
    </html>
  );
}
