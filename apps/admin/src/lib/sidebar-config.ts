import {
  LayoutDashboard, FileText, ShoppingCart, Image, Users, Settings,
  Megaphone, Code, Activity, BarChart3, MessageSquare, Palette,
  Globe, Shield, Bell, Truck, CreditCard, Tag, Package,
  Building2, Blocks, Workflow, Plug,
} from 'lucide-react';

export interface SidebarItem {
  title: string;
  href: string;
  icon: any;
  badge?: string;
  children?: SidebarItem[];
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export const sidebarConfig: SidebarSection[] = [
  {
    title: 'Overview',
    items: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Activity Log', href: '/activity', icon: Activity },
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Content',
    items: [
      { title: 'Content Types', href: '/cms/content-types', icon: Blocks },
      { title: 'Content Items', href: '/cms/content', icon: FileText },
      { title: 'Pages', href: '/cms/pages', icon: FileText, badge: 'Builder' },
      { title: 'Page Builder', href: '/cms/page-builder', icon: Palette, badge: 'Drag & Drop' },
      { title: 'Media Library', href: '/media', icon: Image },
      { title: 'Comments', href: '/cms/comments', icon: MessageSquare },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { title: 'Products', href: '/commerce/products', icon: Package },
      { title: 'Categories', href: '/commerce/categories', icon: Tag },
      { title: 'Orders', href: '/commerce/orders', icon: ShoppingCart },
      { title: 'Customers', href: '/commerce/customers', icon: Users },
      { title: 'Inventory', href: '/commerce/inventory', icon: Building2 },
      { title: 'Discounts', href: '/commerce/discounts', icon: Megaphone },
      { title: 'Shipping', href: '/commerce/shipping', icon: Truck },
      { title: 'Payments', href: '/commerce/payments', icon: CreditCard },
      { title: 'Reviews', href: '/commerce/reviews', icon: MessageSquare },
    ],
  },
  {
    title: 'System',
    items: [
      { title: 'Users & Roles', href: '/users', icon: Users },
      { title: 'Permissions', href: '/system/permissions', icon: Shield },
      { title: 'Notifications', href: '/system/notifications', icon: Bell },
      { title: 'Workflows', href: '/system/workflows', icon: Workflow },
      { title: 'Webhooks', href: '/system/webhooks', icon: Globe },
      { title: 'Plugins', href: '/system/plugins', icon: Plug },
      { title: 'API Keys', href: '/system/api-keys', icon: Code },
      { title: 'Settings', href: '/system/settings', icon: Settings },
    ],
  },
];