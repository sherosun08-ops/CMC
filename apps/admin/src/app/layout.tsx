import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/providers';
import { AdminLayout } from '@/components/admin-layout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CMC — Content, Media & Commerce Platform',
  description: 'Unified CMS and E-commerce platform combining the best of Directus, Payload, Strapi, Medusa, Saleor, Bagisto, Filament, Refine, NocoBase, and GrapesJS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <AdminLayout>{children}</AdminLayout>
        </Providers>
      </body>
    </html>
  );
}