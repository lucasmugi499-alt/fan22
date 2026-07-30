import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';

type DemoEntity = {
  id?: string;
  updatedAt?: string;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://goalplace256.com';
const DEMO_DATABASE_FILE = path.join(process.cwd(), 'data/investor-demo/database.json');

const staticRoutes = [
  '/',
  '/home',
  '/discover',
  '/leagues',
  '/teams',
  '/athletes',
  '/matches',
  '/verification',
  '/sponsors',
  '/pilot',
  '/fantasy',
  '/fantasy/how-it-works',
  '/support',
  '/awards',
  '/map',
  '/how-it-works',
  '/apply/league-admin',
  '/privacy',
  '/terms',
];

function entry(route: string, lastModified?: string): MetadataRoute.Sitemap[number] {
  return {
    url: new URL(route, SITE_URL).toString(),
    lastModified: lastModified ? new Date(lastModified) : new Date(),
  };
}

function readDemoDatabase() {
  if (!existsSync(DEMO_DATABASE_FILE)) return null;
  return JSON.parse(readFileSync(DEMO_DATABASE_FILE, 'utf8')) as Record<string, DemoEntity[]>;
}

function entityEntries(collection: string, baseRoute: string) {
  const database = readDemoDatabase();
  if (!database) return [];
  return (database[collection] ?? [])
    .filter((item) => item.id)
    .map((item) => entry(`${baseRoute}/${item.id}`, item.updatedAt));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticRoutes.map((route) => entry(route)),
    ...entityEntries('leagues', '/leagues'),
    ...entityEntries('teams', '/teams'),
    ...entityEntries('athletes', '/athletes'),
    ...entityEntries('matches', '/matches'),
  ];
}
