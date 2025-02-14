/**
 * Format a date to French style (e.g., "22/02/2023 à 23h17")
 * @param date - The date to format
 * @returns The formatted date string
 */
export function formatFrenchDateTime(date: Date): string {
  console.debug('Formatting date to French style:', date);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(' à ', ' à '); // Ensure proper spacing around 'à'
}

/**
 * Format a date to French style with only time (e.g., "23h17")
 * @param date - The date to format
 * @returns The formatted time string
 */
export function formatFrenchTime(date: Date): string {
  console.debug('Formatting time to French style:', date);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(':', 'h');
}

/**
 * Format a date to French style with only date (e.g., "22/02/2023")
 * @param date - The date to format
 * @returns The formatted date string
 */
export function formatFrenchDate(date: Date): string {
  console.debug('Formatting date to French style:', date);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format a relative time in French (e.g., "il y a 5 minutes", "il y a 2 heures")
 * @param date - The date to format relative to now
 * @returns The formatted relative time string
 */
export function formatFrenchRelativeTime(date: Date): string {
  console.debug('Formatting relative time to French style:', date);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return "à l'instant";
  }

  if (minutes < 60) {
    return `il y a ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (hours < 24) {
    return `il y a ${hours} ${hours === 1 ? 'heure' : 'heures'}`;
  }

  if (days < 30) {
    return `il y a ${days} ${days === 1 ? 'jour' : 'jours'}`;
  }

  if (months < 12) {
    return `il y a ${months} ${months === 1 ? 'mois' : 'mois'}`;
  }

  return `il y a ${years} ${years === 1 ? 'an' : 'ans'}`;
}

/**
 * Format a relative time in French with more precision (e.g., "il y a 5 minutes et 30 secondes")
 * @param date - The date to format relative to now
 * @param withSeconds - Whether to include seconds in the output
 * @returns The formatted relative time string with more detail
 */
export function formatFrenchRelativeTimeDetailed(date: Date, withSeconds = false): string {
  console.debug('Formatting detailed relative time to French style:', date);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return withSeconds ? `il y a ${seconds} ${seconds === 1 ? 'seconde' : 'secondes'}` : "à l'instant";
  }

  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    if (withSeconds && remainingSeconds > 0) {
      return `il y a ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${remainingSeconds} ${remainingSeconds === 1 ? 'seconde' : 'secondes'}`;
    }
    return `il y a ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `il y a ${hours} ${hours === 1 ? 'heure' : 'heures'} et ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
    return `il y a ${hours} ${hours === 1 ? 'heure' : 'heures'}`;
  }

  // For anything longer than 24 hours, use the simple format
  return formatFrenchRelativeTime(date);
}

/**
 * Safely format a timestamp (number), Date, or null/undefined value to a relative time string in French
 * @param timestamp - The timestamp (in ms), Date object, or null/undefined
 * @returns The formatted relative time string or a fallback message
 */
export function formatFrenchRelativeTimeSafe(timestamp: number | Date | null | undefined): string {
  console.debug('Formatting safe relative time to French style:', timestamp);
  if (!timestamp) {
    return "jamais";
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return "date invalide";
  }

  return formatFrenchRelativeTime(date);
} 