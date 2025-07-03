import type { TextStyle } from '$lib/types/text-formatting';
import { RETRO_FONTS } from '$lib/types/text-formatting';

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 18;
const MAX_GRADIENT_COLORS = 3;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function validateHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function validateFontFamily(fontFamily: string): boolean {
  return fontFamily in RETRO_FONTS;
}

export function validateFontSize(size: number): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
}

export function validateGradient(gradient: unknown): string[] | undefined {
  if (!Array.isArray(gradient)) return undefined;
  if (gradient.length === 0 || gradient.length > MAX_GRADIENT_COLORS) return undefined;
  
  const validColors = gradient.filter(color => 
    typeof color === 'string' && validateHexColor(color)
  );
  
  return validColors.length === gradient.length ? validColors : undefined;
}

export function validateTextStyle(style: unknown): TextStyle | null {
  if (!style || typeof style !== 'object') return null;
  
  const rawStyle = style as Record<string, unknown>;
  
  const validated: TextStyle = {
    fontFamily: 'pixelated',
    fontSize: 14,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false
  };
  
  // Validate font family
  if (typeof rawStyle.fontFamily === 'string' && validateFontFamily(rawStyle.fontFamily)) {
    validated.fontFamily = rawStyle.fontFamily as keyof typeof RETRO_FONTS;
  }
  
  // Validate font size
  if (typeof rawStyle.fontSize === 'number') {
    validated.fontSize = validateFontSize(rawStyle.fontSize);
  }
  
  // Validate color
  if (typeof rawStyle.color === 'string' && validateHexColor(rawStyle.color)) {
    validated.color = rawStyle.color;
  }
  
  // Validate gradient
  const validatedGradient = validateGradient(rawStyle.gradient);
  if (validatedGradient) {
    validated.gradient = validatedGradient;
  }
  
  // Validate boolean properties
  validated.bold = Boolean(rawStyle.bold);
  validated.italic = Boolean(rawStyle.italic);
  validated.underline = Boolean(rawStyle.underline);
  validated.strikethrough = Boolean(rawStyle.strikethrough);
  
  return validated;
}

export function sanitizeStyleData(styleData: unknown): TextStyle | undefined {
  if (!styleData) return undefined;
  
  const validated = validateTextStyle(styleData);
  return validated || undefined;
}