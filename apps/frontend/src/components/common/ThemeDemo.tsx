/**
 * Theme Demo Component
 *
 * Demonstrates the theme system functionality including smooth transitions,
 * WCAG compliance, and accessibility features.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5
 */

import React from 'react';
import {
  useTheme,
  useThemeStyles,
  ThemeToggle,
  _wcagUtils as wcagUtils,
} from '../../contexts/ThemeContext';

/**
 * Theme demo component
 */
export function ThemeDemo(): React.JSX.Element {
  const theme = useTheme();
  const styles = useThemeStyles();

  return (
    <div
      className="theme-demo"
      style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}
    >
      <h2>Theme System Demo</h2>

      {/* Theme Controls */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Theme Controls</h3>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <ThemeToggle showLabel={true} />
          <ThemeToggle variant="dropdown" />
          <ThemeToggle variant="button" showLabel={true} />
        </div>
      </section>

      {/* Theme Information */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Current Theme Information</h3>
        <div
          style={{
            background: 'var(--color-background-secondary)',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
          }}
        >
          <p>
            <strong>Theme Mode:</strong> {theme.themeMode}
          </p>
          <p>
            <strong>Resolved Theme:</strong> {theme.resolvedTheme}
          </p>
          <p>
            <strong>System Prefers Dark:</strong>{' '}
            {theme.systemPrefersDark ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Is Auto Mode:</strong> {theme.isAutoMode ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Contrast Ratio:</strong>{' '}
            {styles.accessibility.contrastRatio}:1 (AAA Compliant)
          </p>
          <p>
            <strong>High Contrast:</strong>{' '}
            {styles.accessibility.isHighContrast ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Reduced Motion:</strong>{' '}
            {styles.accessibility.prefersReducedMotion ? 'Yes' : 'No'}
          </p>
        </div>
      </section>

      {/* Color Palette */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>WCAG AAA Compliant Color Palette</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          {Object.entries(styles.colors).map(([name, color]) => (
            <div
              key={name}
              style={{
                background: color,
                color:
                  name === 'background'
                    ? styles.colors.foreground
                    : styles.colors.background,
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                {name}
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>{color}</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                Contrast:{' '}
                {wcagUtils
                  .getContrastRatio(color, styles.colors.background)
                  .toFixed(1)}
                :1
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Elements */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Interactive Elements</h3>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'var(--theme-transition)',
            }}
          >
            Primary Button
          </button>

          <button
            style={{
              background: 'none',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'var(--theme-transition)',
            }}
          >
            Secondary Button
          </button>

          <input
            type="text"
            placeholder="Text input with theme colors"
            style={{
              background: 'var(--color-background)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
              padding: '0.5rem',
              borderRadius: '4px',
              transition: 'var(--theme-transition)',
            }}
          />
        </div>
      </section>

      {/* Code Block Example */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Code Syntax Highlighting</h3>
        <pre
          style={{
            background: 'var(--color-code-background)',
            border: '1px solid var(--color-code-border)',
            color: 'var(--color-code-text)',
            padding: '1rem',
            borderRadius: '6px',
            overflow: 'auto',
          }}
        >
          <code>{`// Theme-aware code block
function useTheme() {
  const [theme, setTheme] = useState('auto');
  
  useEffect(() => {
    // Apply theme with smooth transitions
    document.documentElement.classList.add('theme-transitioning');
  }, [theme]);
  
  return { theme, setTheme };
}`}</code>
        </pre>
      </section>

      {/* Accessibility Features */}
      <section>
        <h3>Accessibility Features</h3>
        <ul style={{ lineHeight: 1.6 }}>
          <li>✅ WCAG 2.2 AAA contrast ratios (7:1 minimum)</li>
          <li>✅ Smooth theme transitions with reduced motion support</li>
          <li>✅ System preference detection (prefers-color-scheme)</li>
          <li>✅ High contrast mode support</li>
          <li>✅ Keyboard navigation friendly</li>
          <li>✅ Screen reader compatible</li>
          <li>✅ Focus indicators with proper visibility</li>
          <li>✅ Color-scheme meta tag for browser integration</li>
        </ul>
      </section>
    </div>
  );
}

export default ThemeDemo;
