import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Verba',
  description: 'Open-source, self-hostable i18n collaboration engine.',

  base: '/verba/',

  head: [
    ['link', { rel: 'icon', href: '/verba/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/verba/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/verba/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/verba/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/verba/site.webmanifest' }],
    ['meta', { name: 'theme-color', content: '#4f7df0' }],
    [
      'meta',
      {
        name: 'keywords',
        content: 'i18n, localization, translation, collaboration, self-hosted',
      },
    ],
    ...(process.env.DOCS_ANALYTICS_URL
      ? [['script', { defer: '', src: process.env.DOCS_ANALYTICS_URL }] as const]
      : []),
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Verba — i18n Collaboration Engine' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Open-source, self-hostable i18n collaboration engine.',
      },
    ],
  ],

  sitemap: {
    hostname: 'https://docs.nubisco.io/verba/',
  },

  lastUpdated: true,

  ignoreDeadLinks: [/^http:\/\/localhost/],

  themeConfig: {
    siteTitle: 'Verba',
    logo: { src: '/logo-mini.svg', width: 80, height: 24 },

    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'Architecture', link: '/architecture' },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/nubisco/verba' },
          {
            text: 'Docker Hub',
            link: 'https://hub.docker.com/r/nubisco/verba',
          },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quick Start', link: '/getting-started' },
          { text: 'Self-Hosting', link: '/self-hosting' },
        ],
      },
      {
        text: 'User Guide',
        items: [
          { text: 'Core Concepts', link: '/concepts' },
          { text: 'Workflow Guide', link: '/workflow' },
          { text: 'Import & Export', link: '/import-export' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/nubisco/verba' }],

    editLink: {
      pattern: 'https://github.com/nubisco/verba/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    lastUpdated: {
      text: 'Last updated',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Nubisco',
    },
  },
})
