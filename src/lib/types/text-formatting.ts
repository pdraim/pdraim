// Font and styling configuration for chat messages

// Retro Windows fonts
// Primary font is Pixelated MS Sans Serif from xp.css which works for all users
// Secondary fonts use local system fonts with proper fallbacks
export const RETRO_FONTS = {
  pixelated: { name: 'Pixelated MS Sans Serif', stack: '"Pixelated MS Sans Serif", "Tahoma", Geneva, sans-serif' },
  tahoma: { name: 'Tahoma', stack: 'Tahoma, "Pixelated MS Sans Serif", Geneva, sans-serif' },
  verdana: { name: 'Verdana', stack: 'Verdana, "Pixelated MS Sans Serif", Geneva, sans-serif' },
  comicSans: { name: 'Comic Sans MS', stack: '"Comic Sans MS", "Pixelated MS Sans Serif", cursive, sans-serif' },
  timesNewRoman: { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  arial: { name: 'Arial', stack: 'Arial, "Pixelated MS Sans Serif", Helvetica, sans-serif' },
  courierNew: { name: 'Courier New', stack: '"Courier New", "Perfect DOS VGA 437 Win", Courier, monospace' },
  dos: { name: 'Perfect DOS VGA 437', stack: '"Perfect DOS VGA 437 Win", "Courier New", Courier, monospace' }
} as const;

export type FontFamily = keyof typeof RETRO_FONTS;

// Generate 256-color web-safe palette ordered by hue
export function generate256Colors(): string[] {
  const colors: string[] = [];
  
  // Start with grayscale colors
  colors.push('#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF');
  
  // Then add colors in a more logical order by hue
  // Red hues
  colors.push('#330000', '#660000', '#990000', '#CC0000', '#FF0000');
  colors.push('#FF3333', '#FF6666', '#FF9999', '#FFCCCC');
  
  // Orange hues
  colors.push('#663300', '#993300', '#CC3300', '#FF3300');
  colors.push('#FF6600', '#FF9900', '#FFCC00', '#FFCC33', '#FFCC66', '#FFCC99');
  
  // Yellow hues
  colors.push('#666600', '#999900', '#CCCC00', '#FFFF00');
  colors.push('#FFFF33', '#FFFF66', '#FFFF99', '#FFFFCC');
  
  // Green hues
  colors.push('#003300', '#006600', '#009900', '#00CC00', '#00FF00');
  colors.push('#33FF33', '#66FF66', '#99FF99', '#CCFFCC');
  colors.push('#336633', '#669966', '#99CC99', '#CCFFCC');
  
  // Cyan hues
  colors.push('#006666', '#009999', '#00CCCC', '#00FFFF');
  colors.push('#33FFFF', '#66FFFF', '#99FFFF', '#CCFFFF');
  colors.push('#336666', '#669999', '#99CCCC');
  
  // Blue hues
  colors.push('#000033', '#000066', '#000099', '#0000CC', '#0000FF');
  colors.push('#3333FF', '#6666FF', '#9999FF', '#CCCCFF');
  colors.push('#003366', '#006699', '#0099CC', '#3399FF', '#66CCFF');
  
  // Purple hues
  colors.push('#330033', '#660066', '#990099', '#CC00CC', '#FF00FF');
  colors.push('#FF33FF', '#FF66FF', '#FF99FF', '#FFCCFF');
  colors.push('#663366', '#996699', '#CC99CC');
  
  // Pink hues
  colors.push('#660033', '#990066', '#CC0099', '#FF0099');
  colors.push('#FF3399', '#FF66CC', '#FF99CC');
  
  // Browns
  colors.push('#663333', '#996633', '#CC9966', '#996666');
  
  // Now fill in any missing combinations to get full 216 web-safe colors
  const webSafeValues = ['00', '33', '66', '99', 'CC', 'FF'];
  const existingColors = new Set(colors);
  
  for (const r of webSafeValues) {
    for (const g of webSafeValues) {
      for (const b of webSafeValues) {
        const color = `#${r}${g}${b}`.toUpperCase();
        if (!existingColors.has(color)) {
          colors.push(color);
        }
      }
    }
  }
  
  return colors;
}

// Classic retro colors for backward compatibility
export const CLASSIC_COLORS = {
  black: '#000000',
  darkBlue: '#000080',
  green: '#008000',
  teal: '#008080',
  darkRed: '#800000',
  purple: '#800080',
  brown: '#808000',
  silver: '#C0C0C0',
  gray: '#808080',
  blue: '#0000FF',
  lime: '#00FF00',
  aqua: '#00FFFF',
  red: '#FF0000',
  fuchsia: '#FF00FF',
  yellow: '#FFFF00',
  white: '#FFFFFF'
} as const;

export type ClassicColor = keyof typeof CLASSIC_COLORS;

// Gradient presets inspired by AOL faders
export const GRADIENT_PRESETS = {
  rainbow: ['#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00', '#00FF80', '#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF', '#FF0080'],
  fire: ['#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00'],
  ocean: ['#000080', '#0040FF', '#0080FF', '#00BFFF', '#00FFFF'],
  sunset: ['#FF4500', '#FF6347', '#FFD700', '#FFFF00'],
  neon: ['#FF00FF', '#8000FF', '#0080FF', '#00FFFF'],
  forest: ['#006400', '#228B22', '#32CD32', '#90EE90'],
  royal: ['#4B0082', '#6A5ACD', '#9370DB', '#DDA0DD']
} as const;

export type GradientPreset = keyof typeof GRADIENT_PRESETS;

// Text styling options
export interface TextStyle {
  fontFamily: FontFamily;
  fontSize: number; // in pixels
  color?: string; // hex color string
  gradient?: string[]; // array of 1-3 hex colors for gradients
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
}

// Default text style
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'pixelated',
  fontSize: 14,
  color: '#000000',
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false
};

// User preferences for text formatting
export interface UserTextPreferences {
  defaultStyle: TextStyle;
  allowFormatting: boolean;
  maxMessageLength: number;
}

// Default user preferences
export const DEFAULT_USER_PREFERENCES: UserTextPreferences = {
  defaultStyle: DEFAULT_TEXT_STYLE,
  allowFormatting: true,
  maxMessageLength: 500
};

// Hex color validation
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Formatting validation
export function validateTextStyle(style: Partial<TextStyle>): TextStyle {
  return {
    fontFamily: style.fontFamily && style.fontFamily in RETRO_FONTS ? style.fontFamily : DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: Math.max(8, Math.min(18, style.fontSize || DEFAULT_TEXT_STYLE.fontSize)),
    color: style.color && isValidHexColor(style.color) ? style.color : DEFAULT_TEXT_STYLE.color,
    gradient: style.gradient && Array.isArray(style.gradient) && style.gradient.length <= 3 && style.gradient.every(isValidHexColor) ? style.gradient : undefined,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    underline: Boolean(style.underline),
    strikethrough: Boolean(style.strikethrough)
  };
}

// Generate CSS style string from TextStyle
export function generateCSSStyle(style: TextStyle): string {
  const styles: string[] = [];
  
  // Font family
  styles.push(`font-family: ${RETRO_FONTS[style.fontFamily].stack}`);
  
  // Font size
  styles.push(`font-size: ${style.fontSize}px`);
  
  // Color or gradient
  if (style.gradient && style.gradient.length > 1) {
    const gradientStops = style.gradient.join(', ');
    styles.push(`background: linear-gradient(45deg, ${gradientStops})`);
    styles.push(`-webkit-background-clip: text`);
    styles.push(`-webkit-text-fill-color: transparent`);
    styles.push(`background-clip: text`);
  } else if (style.color) {
    styles.push(`color: ${style.color}`);
  }
  
  // Font weight
  if (style.bold) {
    // Use correct weight for Tahoma (200) vs standard bold (700)
    if (style.fontFamily === 'tahoma') {
      styles.push(`font-weight: 200`);
    } else {
      styles.push(`font-weight: 700`);
    }
  }
  
  // Font style
  if (style.italic) {
    styles.push(`font-style: italic`);
  }
  
  // Text decoration
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikethrough) decorations.push('line-through');
  if (decorations.length > 0) {
    styles.push(`text-decoration: ${decorations.join(' ')}`);
  }
  
  return styles.join('; ');
}

// Generate CSS style string for input fields (without font-family which should be handled by classes)
export function generateInputCSSStyle(style: TextStyle): string {
  const styles: string[] = [];
  
  // Font size
  styles.push(`font-size: ${style.fontSize}px`);
  
  // Color handling for inputs
  if (style.gradient && style.gradient.length > 1) {
    // Apply gradient background with text clipping for gradient effect
    const gradientStops = style.gradient.join(', ');
    styles.push(`background: linear-gradient(to right, ${gradientStops})`);
    styles.push(`-webkit-background-clip: text`);
    styles.push(`-webkit-text-fill-color: transparent`);
    styles.push(`background-clip: text`);
    styles.push(`letter-spacing: 0`);
    styles.push(`word-spacing: 0`);
  } else if (style.gradient && style.gradient.length === 1) {
    // Single color from gradient array
    styles.push(`color: ${style.gradient[0]}`);
  } else if (style.color) {
    styles.push(`color: ${style.color}`);
  } else {
    // Fallback to black if no color is set
    styles.push(`color: #000000`);
  }
  
  // Font weight
  if (style.bold) {
    // Use correct weight for Tahoma (200) vs standard bold (700)
    if (style.fontFamily === 'tahoma') {
      styles.push(`font-weight: 200`);
    } else {
      styles.push(`font-weight: 700`);
    }
  }
  
  // Font style
  if (style.italic) {
    styles.push(`font-style: italic`);
  }
  
  // Text decoration
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikethrough) decorations.push('line-through');
  if (decorations.length > 0) {
    styles.push(`text-decoration: ${decorations.join(' ')}`);
  }
  
  return styles.join('; ');
}