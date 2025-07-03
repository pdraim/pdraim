import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { TextStyle } from '../types/text-formatting';
import { generateCSSStyle, validateTextStyle } from '../types/text-formatting';

// Define allowed HTML tags and attributes for security
const ALLOWED_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'span',
    'strong',
    'em',
    'u',
    's',
    'mark'
  ],
  attributes: {
    ...defaultSchema.attributes,
    span: ['style', 'class', 'data-gradient'],
    strong: ['style', 'class'],
    em: ['style', 'class'],
    u: ['style', 'class'],
    s: ['style', 'class'],
    mark: ['style', 'class']
  },
  protocols: {
    ...defaultSchema.protocols,
    style: []
  }
};

// Custom rehype plugin to apply text styles
function rehypeApplyStyles(userStyle: TextStyle) {
  return function(tree: any) {
    // We don't need to apply styles here anymore
    // The formatted-message component handles all styling
    return tree;
  };
}

// BBCode-style formatting patterns
const BB_CODE_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Bold
  { pattern: /\[b\](.*?)\[\/b\]/gi, replacement: '<strong>$1</strong>' },
  
  // Italic
  { pattern: /\[i\](.*?)\[\/i\]/gi, replacement: '<em>$1</em>' },
  
  // Underline
  { pattern: /\[u\](.*?)\[\/u\]/gi, replacement: '<u>$1</u>' },
  
  // Strikethrough
  { pattern: /\[s\](.*?)\[\/s\]/gi, replacement: '<s>$1</s>' },
  
  // Color
  { pattern: /\[color=([#\w]+)\](.*?)\[\/color\]/gi, replacement: '<span style="color: $1">$2</span>' },
  
  // Size
  { pattern: /\[size=(\d+)\](.*?)\[\/size\]/gi, replacement: '<span style="font-size: $1px">$2</span>' },
  
  // Font
  { pattern: /\[font=([^[\]]+)\](.*?)\[\/font\]/gi, replacement: '<span style="font-family: $1">$2</span>' }
];

// Markdown-style formatting patterns  
const MARKDOWN_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Bold (double asterisk or double underscore)
  { pattern: /\*\*(.*?)\*\*/g, replacement: '<strong>$1</strong>' },
  { pattern: /__(.*?)__/g, replacement: '<strong>$1</strong>' },
  
  // Italic (single asterisk or single underscore)
  { pattern: /\*(.*?)\*/g, replacement: '<em>$1</em>' },
  { pattern: /_(.*?)_/g, replacement: '<em>$1</em>' },
  
  // Strikethrough
  { pattern: /~~(.*?)~~/g, replacement: '<s>$1</s>' },
  
  // Inline code
  { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' }
];

// Preprocess text to convert BBCode and Markdown to HTML
function preprocessFormatting(text: string): string {
  let processedText = text;
  
  // Apply BBCode patterns first
  BB_CODE_PATTERNS.forEach(({ pattern, replacement }) => {
    processedText = processedText.replace(pattern, replacement);
  });
  
  // Apply Markdown patterns (but avoid conflicts with already processed BBCode)
  MARKDOWN_PATTERNS.forEach(({ pattern, replacement }) => {
    // Only apply if not already inside HTML tags
    processedText = processedText.replace(pattern, (match, content) => {
      // Simple check to avoid replacing inside existing HTML tags
      const beforeMatch = processedText.substring(0, processedText.indexOf(match));
      const openTags = (beforeMatch.match(/<[^/][^>]*>/g) || []).length;
      const closeTags = (beforeMatch.match(/<\/[^>]*>/g) || []).length;
      
      // If we're inside an unclosed tag, don't apply markdown
      if (openTags > closeTags) {
        return match;
      }
      
      return replacement.replace('$1', content);
    });
  });
  
  return processedText;
}

// Main text formatting function
export async function formatText(
  text: string, 
  userStyle?: Partial<TextStyle>,
  allowRichFormatting: boolean = true
): Promise<string> {
  try {
    // If text is empty, return empty string
    if (!text) return '';
    
    // Validate and apply user style
    const validatedStyle = validateTextStyle(userStyle || {});
    
    // Preprocess the text for formatting if allowed
    let processedText = text;
    if (allowRichFormatting) {
      processedText = preprocessFormatting(text);
    }
    
    // If no rich formatting, just return escaped text
    if (!allowRichFormatting && !processedText.includes('<')) {
      return escapeHtml(text);
    }
    
    // Create the unified processor
    const processor = unified()
      .use(remarkParse, { 
        fragment: true // Parse as fragment, not full document
      })
      .use(remarkRehype, {
        allowDangerousHtml: true // Allow preprocessed HTML to pass through
      })
      .use(rehypeSanitize, ALLOWED_SCHEMA) // Sanitize HTML
      .use(rehypeStringify);
    
    // Process the text
    const result = await processor.process(processedText);
    let formattedHtml = String(result).trim();
    
    // If we got an empty result, return the escaped text
    if (!formattedHtml || formattedHtml === '<p></p>' || formattedHtml === '') {
      return escapeHtml(text);
    }
    
    // Remove wrapping <p> tags if it's just a single paragraph
    if (formattedHtml.startsWith('<p>') && formattedHtml.endsWith('</p>')) {
      const pCount = (formattedHtml.match(/<p>/g) || []).length;
      if (pCount === 1) {
        formattedHtml = formattedHtml.slice(3, -4).trim();
      }
    }
    
    // Final check - if we ended up with empty content, return escaped text
    if (!formattedHtml) {
      return escapeHtml(text);
    }
    
    return formattedHtml;
    
  } catch (error) {
    console.error('Text formatting error:', error);
    // Return escaped plain text as fallback
    return escapeHtml(text);
  }
}

// Utility function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Generate CSS style string excluding font-family (which should be handled by classes)
function generateCSSStyleWithoutFont(style: TextStyle): string {
  const styles: string[] = [];
  
  // Font size
  styles.push(`font-size: ${style.fontSize}px`);
  
  // Color (not for gradients)
  if (style.color && !style.gradient) {
    styles.push(`color: ${style.color}`);
  }
  
  // Font weight
  if (style.bold) {
    styles.push(`font-weight: bold`);
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

// Create gradient text effect
export function createGradientText(
  text: string, 
  colors: string[], 
  className: string = 'gradient-text',
  style?: TextStyle
): string {
  console.debug('createGradientText called with:', { text, colors, className, style });
  
  if (colors.length < 2) {
    const fontClass = style?.fontFamily ? ` retro-font-${style.fontFamily}` : '';
    const inlineStyle = style ? generateCSSStyleWithoutFont({...style, gradient: undefined}) : '';
    const result = `<span class="${className}${fontClass}" style="${inlineStyle}">${escapeHtml(text)}</span>`;
    console.debug('Single color result:', result);
    return result;
  }
  
  const chars = Array.from(text);
  const totalChars = chars.length;
  
  if (totalChars === 0) return '';
  
  // Create spans for each character with interpolated colors
  const gradientSpans = chars.map((char, index) => {
    if (char === ' ') {
      return '&nbsp;'; // Use non-breaking space to preserve spacing
    }
    
    // Calculate color position (0 to 1)
    const position = totalChars === 1 ? 0 : index / (totalChars - 1);
    
    // Find the two colors to interpolate between
    const colorIndex = position * (colors.length - 1);
    const lowerIndex = Math.floor(colorIndex);
    const upperIndex = Math.min(lowerIndex + 1, colors.length - 1);
    const t = colorIndex - lowerIndex;
    
    // Interpolate between colors
    const color1 = hexToRgb(colors[lowerIndex]);
    const color2 = hexToRgb(colors[upperIndex]);
    
    if (!color1 || !color2) {
      const fallbackStyle = style ? generateCSSStyleWithoutFont({...style, gradient: undefined}) : '';
      return `<span class="${className}" style="${fallbackStyle}">${escapeHtml(char)}</span>`;
    }
    
    const r = Math.round(color1.r + t * (color2.r - color1.r));
    const g = Math.round(color1.g + t * (color2.g - color1.g));
    const b = Math.round(color1.b + t * (color2.b - color1.b));
    
    const interpolatedColor = `rgb(${r}, ${g}, ${b})`;
    
    // Combine interpolated color with other styles
    let inlineStyle = `color: ${interpolatedColor}`;
    if (style) {
      // Get styles without font-family and color
      if (style.fontSize !== 14) inlineStyle += `; font-size: ${style.fontSize}px`;
      if (style.bold) inlineStyle += `; font-weight: bold`;
      if (style.italic) inlineStyle += `; font-style: italic`;
      const decorations: string[] = [];
      if (style.underline) decorations.push('underline');
      if (style.strikethrough) decorations.push('line-through');
      if (decorations.length > 0) {
        inlineStyle += `; text-decoration: ${decorations.join(' ')}`;
      }
    }
    
    return `<span class="gradient-char" style="${inlineStyle}">${escapeHtml(char)}</span>`;
  });
  
  // Wrap all spans in a container that uses flexbox to eliminate spacing
  const fontClass = style?.fontFamily ? ` retro-font-${style.fontFamily}` : '';
  const containerStyle = style ? generateCSSStyleWithoutFont({...style, gradient: undefined, color: undefined}) : '';
  const result = `<span class="${className}${fontClass}" style="display: inline-flex; flex-wrap: wrap; ${containerStyle}">${gradientSpans.join('')}</span>`;
  console.debug('Final gradient HTML:', result);
  return result;
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Validate message content for security
export function validateMessageContent(content: string): {
  isValid: boolean;
  sanitizedContent: string;
  errors: string[];
} {
  const errors: string[] = [];
  let sanitizedContent = content;
  
  // Check length
  if (content.length > 2000) {
    errors.push('Message too long (max 2000 characters)');
    sanitizedContent = content.substring(0, 2000);
  }
  
  // Check for potential XSS patterns
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi
  ];
  
  dangerousPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      errors.push('Potentially dangerous content detected');
      sanitizedContent = sanitizedContent.replace(pattern, '');
    }
  });
  
  return {
    isValid: errors.length === 0,
    sanitizedContent,
    errors
  };
}