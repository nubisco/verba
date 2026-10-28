import { defineNubiscoDocs } from '@nubisco/docs-sdk'

export default defineNubiscoDocs({
  title: 'Verba',
  description: 'Open-source, self-hostable i18n collaboration engine.',
  base: '/verba/',
  hostname: 'https://docs.nubisco.io/verba/',
  repo: 'nubisco/verba',
  nav: [
    { text: 'Guide', link: '/introduction' },
    { text: 'Architecture', link: '/architecture' },
    {
      text: 'Links',
      items: [
        { text: 'GitHub', link: 'https://github.com/nubisco/verba' },
        { text: 'Docker Hub', link: 'https://hub.docker.com/r/nubisco/verba' },
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
  footer: {
    message: 'Community Edition released under the AGPL-3.0 License.',
    copyright: 'Copyright © 2026 Nubisco',
  },
  vitepress: {
    head: [
      [
        'meta',
        {
          name: 'keywords',
          content: 'i18n, localization, translation, collaboration, self-hosted',
        },
      ],
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
    ignoreDeadLinks: [/^http:\/\/localhost/],
  },
})
