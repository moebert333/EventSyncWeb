export type NewsArticle = {
  title: string
  summary: string
  href: string
  imageUrl: string
}

export const newsArticles: NewsArticle[] = [
  {
    title: 'Motocross Action',
    summary: 'Bike tests, weekend race notes, and pit bits from the magazine.',
    href: 'https://motocrossactionmag.com',
    imageUrl: '/news-1.png',
  },
  {
    title: 'Racer X',
    summary: 'Supercross and motocross coverage from the national series.',
    href: 'https://racerxonline.com',
    imageUrl: '/news-2.png',
  },
  {
    title: 'Vital MX',
    summary: 'Trackside video and race recaps from the amateur and pro scene.',
    href: 'https://www.vitalmx.com',
    imageUrl: '/news-3.png',
  },
  {
    title: 'AMA Supercross',
    summary: 'Stadium schedule, broadcast times, and series notes.',
    href: 'https://www.supercrosslive.com',
    imageUrl: '/news-4.png',
  },
  {
    title: 'Pro Motocross',
    summary: 'Outdoor national rounds, tracks, and posted results.',
    href: 'https://promotocross.com',
    imageUrl: '/news-5.png',
  },
  {
    title: 'Cycle News',
    summary: 'Race reports and industry notes from the weekly paper.',
    href: 'https://www.cyclenews.com',
    imageUrl: '/news-6.png',
  },
]
