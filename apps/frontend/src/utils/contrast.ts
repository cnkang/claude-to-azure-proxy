/**
 * Contrast Ratio Utilities
 *
 * Utilities for calculating and validating color contrast ratios according to WCAG 2.2 AAA standards.
 *
 * @see https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */

/**
 * RGB color value (0-255)
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): RGBColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate relative luminance of a color
 *
 * Uses WCAG formula for perceived brightness
 * @see https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(rgb: RGBColor): number {
  // Convert RGB to 0-1 range
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  // Linearize RGB values
  const linearize = (val: number): number => {
    return val <= 0.03928 ? val / 12.92 : ((val + 0.055) / 1.055) ** 2.4;
  };

  const rLinear = linearize(r);
  const gLinear = linearize(g);
  const bLinear = linearize(b);

  // Calculate relative luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate contrast ratio between two colors
 *
 * @param color1 - First color (RGB)
 * @param color2 - Second color (RGB)
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(color1: RGBColor, color2: RGBColor): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);

  // Lighter color should be L1
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AAA standards
 *
 * @param ratio - Contrast ratio
 * @param isLargeText - Whether text is large (18pt+ or 14pt+ bold)
 * @returns Whether contrast meets WCAG AAA
 */
export function meetsWCAGAAA(ratio: number, isLargeText = false): boolean {
  const threshold = isLargeText ? 4.5 : 7.0;
  return ratio >= threshold;
}

/**
 * Calculate required opacity to meet WCAG AAA contrast
 *
 * @param foreground - Foreground color (text)
 * @param background - Background color
 * @param glassColor - Glass overlay color
 * @param targetRatio - Target contrast ratio (default: 7.0 for WCAG AAA)
 * @returns Required opacity (0-1) or null if impossible
 */
export function calculateRequiredOpacity(
  foreground: RGBColor,
  background: RGBColor,
  glassColor: RGBColor,
  targetRatio = 7.0
): number | null {
  // Try opacity values from 0.1 to 1.0
  for (let opacity = 0.1; opacity <= 1.0; opacity += 0.05) {
    // Mix glass color with background based on opacity
    const mixed: RGBColor = {
      r: Math.round(glassColor.r * opacity + background.r * (1 - opacity)),
      g: Math.round(glassColor.g * opacity + background.g * (1 - opacity)),
      b: Math.round(glassColor.b * opacity + background.b * (1 - opacity)),
    };

    const ratio = getContrastRatio(foreground, mixed);
    if (ratio >= targetRatio) {
      return opacity;
    }
  }

  // If we can't achieve target ratio even at full opacity, return null
  return null;
}

/**
 * Get perceived brightness of a color (0-255)
 *
 * Uses simplified formula for quick brightness estimation
 */
export function getPerceivedBrightness(rgb: RGBColor): number {
  // Simplified brightness formula
  return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
}

/**
 * Determine if a color is light or dark
 */
export function isLightColor(rgb: RGBColor): boolean {
  return getPerceivedBrightness(rgb) > 127;
}

/**
 * Get optimal Glass opacity for a given background
 *
 * @param background - Background color
 * @param theme - Current theme ('light' | 'dark')
 * @returns Optimal opacity (0.1-0.7)
 */
export function getOptimalGlassOpacity(
  background: RGBColor,
  theme: 'light' | 'dark'
): number {
  const brightness = getPerceivedBrightness(background);

  if (theme === 'light') {
    // For light theme, use more opacity on darker backgrounds
    // Brightness 0-255 -> Opacity 0.7-0.1
    return 0.7 - (brightness / 255) * 0.6;
  } else {
    // For dark theme, use more opacity on lighter backgrounds
    // Brightness 0-255 -> Opacity 0.1-0.7
    return 0.1 + (brightness / 255) * 0.6;
  }
}

/**
 * Validate contrast and get adjusted opacity if needed
 *
 * @param foreground - Foreground color (text)
 * @param background - Background color
 * @param glassColor - Glass overlay color
 * @param desiredOpacity - Desired glass opacity
 * @returns Object with validated opacity and whether it meets WCAG AAA
 */
export function validateAndAdjustOpacity(
  foreground: RGBColor,
  background: RGBColor,
  glassColor: RGBColor,
  desiredOpacity: number
): { opacity: number; meetsWCAGAAA: boolean; ratio: number } {
  // Mix glass color with background
  const mixed: RGBColor = {
    r: Math.round(
      glassColor.r * desiredOpacity + background.r * (1 - desiredOpacity)
    ),
    g: Math.round(
      glassColor.g * desiredOpacity + background.g * (1 - desiredOpacity)
    ),
    b: Math.round(
      glassColor.b * desiredOpacity + background.b * (1 - desiredOpacity)
    ),
  };

  const ratio = getContrastRatio(foreground, mixed);
  const meetsAAA = meetsWCAGAAA(ratio);

  if (meetsAAA) {
    return { opacity: desiredOpacity, meetsWCAGAAA: true, ratio };
  }

  // Try to find opacity that meets WCAG AAA
  const requiredOpacity = calculateRequiredOpacity(
    foreground,
    background,
    glassColor
  );

  if (requiredOpacity !== null) {
    return { opacity: requiredOpacity, meetsWCAGAAA: true, ratio: 7.0 };
  }

  // Fallback to solid background
  return { opacity: 1.0, meetsWCAGAAA: false, ratio };
}
