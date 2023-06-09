import { showToast } from './toast'

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => showToast('Copiado com sucesso!'))
}

export const durationRoundUpByHalfHour = (duration: number) => {
  if (!duration) {
    return 0
  }
  const minutes = Math.floor((duration - Math.floor(duration / 3600) * 3600) / 60)
  const minutesRounded = Math.ceil(minutes / 30) * 30
  return Math.floor(duration / 3600) * 3600 + minutesRounded * 60
}

export const daysToMilis = (days: number) => {
  // days * 24 h * 60 m * 60 s * 1000 ms
  return days * 86400000
}

/**
 * gets white or black color to contrast with the given color
 * @param colorInHexFormat color in the following format: #00ffdd
 * @returns {string|string}
 */
export const getContrastColorHex = (colorInHexFormat) => {
  if (!colorInHexFormat) {
    return 'black'
  }

  const hex = colorInHexFormat.replace('#', '')
  const bigint = parseInt(hex, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255

  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 125 ? 'black' : 'white'
}

export const chunkArray = (array, chunkSize) => {
  const chunkedArray = []
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize)
    chunkedArray.push(chunk)
  }
  return chunkedArray
}
