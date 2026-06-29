import type { Product } from '@/lib/product'
import Image from 'next/image'

interface Props {
  product: Product
}

export default function ProductCard({ product }: Props) {
  return (
    <a
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition hover:shadow-md hover:border-yellow-400/60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-yellow-400/40"
    >
      {/* Image */}
      <div className="relative flex h-48 items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-800">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-contain p-4 transition group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center text-zinc-300">
            <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {product.discount && (
            <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-bold text-white">
              {product.discount}
            </span>
          )}
          {product.condition && (
            <span className="rounded-full bg-zinc-700/80 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {product.condition}
            </span>
          )}
        </div>

        {product.freeShipping && (
          <div className="absolute bottom-2 right-2">
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 border border-green-200">
              Frete grátis
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-800 group-hover:text-yellow-600 dark:text-zinc-100 dark:group-hover:text-yellow-400">
          {product.title}
        </p>

        {/* Price */}
        <div className="mt-auto pt-2">
          {product.originalPrice && product.originalPrice !== product.price && (
            <p className="text-xs text-zinc-400 line-through">{product.originalPrice}</p>
          )}
          <p className="text-xl font-bold text-zinc-900 dark:text-white">{product.price}</p>
          {product.installments && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{product.installments}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 min-w-0">
            {product.seller && (
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{product.seller}</span>
            )}
          </div>
          {product.rating && (
            <div className="flex shrink-0 items-center gap-1">
              <svg className="h-3 w-3 fill-yellow-400 text-yellow-400" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{product.rating}</span>
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
