import Image from 'next/image'
import { TESTIMONIALS } from '@/lib/marketing'

export default function Testimonials({
  heading = 'Quem usa no dia a dia',
  sub = 'Relatos de gente que vive de anúncio usado — não de pitch de startup.',
}: {
  heading?: string
  sub?: string
}) {
  return (
    <section className="border-y border-zinc-200 bg-white py-16 sm:py-20 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
            Na prática
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
            {heading}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{sub}</p>
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <li
              key={item.name}
              className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-5 sm:p-6 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <div className="flex items-center gap-3">
                <Image
                  src={item.photo}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{item.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.role}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                “{item.quote}”
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function TestimonialStrip() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TESTIMONIALS.map((item) => (
        <figure
          key={item.name}
          className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-2.5">
            <Image
              src={item.photo}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
            />
            <figcaption>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">{item.name}</p>
              <p className="text-[11px] text-zinc-500">{item.role}</p>
            </figcaption>
          </div>
          <blockquote className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            “{item.quote}”
          </blockquote>
        </figure>
      ))}
    </div>
  )
}

export function FaqList({
  items,
}: {
  items: readonly { q: string; a: string }[]
}) {
  return (
    <dl className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
      {items.map((item) => (
        <div key={item.q} className="py-5">
          <dt className="text-sm font-semibold text-zinc-900 dark:text-white">{item.q}</dt>
          <dd className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.a}</dd>
        </div>
      ))}
    </dl>
  )
}
