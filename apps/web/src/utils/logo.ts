/** A project logo is stored as a small PNG data URL on the project (under 300 KB, the API's limit). */
export const LOGO_SIZE = 128
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml'
export const LOGO_MAX_BYTES = 5 * 1024 * 1024

/**
 * Draws the picked image into a 128px square, whole and centred (contain), so
 * a wide wordmark is not cut. What is stored is a PNG data URL, which is what
 * the project's `avatar` has always held for a logo.
 */
export function toLogoDataUrl(file: Blob, size = LOGO_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('This browser cannot read the picture'))
        return
      }
      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight) || 1
      const w = image.naturalWidth * scale
      const h = image.naturalHeight * scale
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The picture could not be read'))
    }
    image.src = url
  })
}

/** Whether a project's `avatar` is a logo (an image) rather than an emoji or initials. */
export function isLogo(avatar: string | null | undefined): avatar is string {
  return Boolean(avatar?.startsWith('data:image/'))
}
