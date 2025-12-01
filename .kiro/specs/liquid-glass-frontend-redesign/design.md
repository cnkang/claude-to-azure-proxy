# Design Document

## Overview

This design document outlines the architecture and implementation strategy for migrating the frontend application to a modern "liquid glass" design style inspired by Apple's latest design language. The migration focuses on fixing critical layout issues, implementing advanced optical effects using shadcn/ui components, creating fluid animations, maintaining WCAG 2.2 AAA accessibility standards, and ensuring comprehensive test coverage with zero errors and warnings.

The design leverages cutting-edge technologies:

**React 19.2 Features:**
- **Concurrent Rendering**: Improved performance with automatic batching and transitions
- **Server Components**: Enhanced code splitting and reduced bundle size
- **use() Hook**: Simplified data fetching and resource management
- **Enhanced Suspense**: Better loading state management
- **Automatic Batching**: Optimized re-renders across async boundaries

**shadcn/ui Component Library:**
- **Accessible by Default**: All components built with Radix UI primitives meeting WCAG standards
- **Customizable**: Full control over styling with Tailwind CSS
- **Composable**: Build complex UIs from simple, reusable components
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Key Components**: Card, Sheet, Dialog, Button, Input, Select, Dropdown Menu, Tabs, Accordion, and more

**Tailwind CSS 4.1 Features:**
- **Native CSS Cascade Layers**: Better style organization with @layer directives
- **Container Queries**: Responsive components based on parent container size (@container)
- **Enhanced JIT Compilation**: Faster build times and smaller CSS bundles
- **Native CSS Nesting**: Cleaner, more maintainable styles
- **Improved Dark Mode**: Better theme switching with CSS variables
- **Modern CSS Functions**: Support for clamp(), min(), max(), color-mix()
- **New Viewport Units**: Support for dvh, lvh, svh
- **Logical Properties**: Support for padding-inline, margin-block, etc.

**Modern CSS Features (Mandatory):**
- **clamp(), min(), max()**: For responsive typography and spacing
- **Container Queries**: For component-level responsive design
- **CSS Logical Properties**: For better internationalization (padding-inline, margin-block)
- **Subgrid**: For nested grid layouts
- **:has() Selector**: For parent-based styling
- **color-mix()**: For dynamic color generation
- **New Viewport Units**: dvh, lvh, svh for better mobile support
- **aspect-ratio**: For maintaining aspect ratios
- **flex gap**: For cleaner flex layouts

**Animation & Motion:**
- **framer-motion**: Spring physics-based animations for organic, fluid motion
- **React Spring**: Alternative for complex physics simulations
- **CSS Transitions**: GPU-accelerated transforms for performance

**Development Tools:**
- **shadcn MCP**: Component discovery, search, and installation commands
- **Playwright MCP**: Automated browser testing and E2E verification
- **Chrome DevTools MCP**: Real-time debugging, contrast checking, and performance profiling
- **Sequential Thinking MCP**: Problem-solving and architectural planning
- **Serena MCP**: Code analysis, refactoring, and symbol management

The liquid glass aesthetic is achieved through shadcn/ui components enhanced with advanced backdrop blur effects, dynamic optical adaptation, semi-transparent backgrounds with real-time contrast validation, subtle borders, layered depth perception, and fluid spring-based animations.

## Modern CSS Principles (Mandatory)

All styling in this project MUST follow these modern CSS principles:

### 1. Responsive Typography and Spacing with clamp()

```css
/* ✅ GOOD: Fluid typography */
font-size: clamp(1rem, 2vw + 0.5rem, 2rem);
padding: clamp(1rem, 3vw, 3rem);

/* ❌ BAD: Fixed breakpoints */
@media (min-width: 768px) {
  font-size: 1.5rem;
}
```

### 2. Container Queries for Component-Level Responsiveness

```css
/* ✅ GOOD: Container queries */
@container (min-width: 400px) {
  .card-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

/* ❌ BAD: Media queries for component styling */
@media (min-width: 768px) {
  .card-content {
    display: grid;
  }
}
```

### 3. CSS Logical Properties for Internationalization

```css
/* ✅ GOOD: Logical properties */
padding-inline: 1rem;
margin-block: 2rem;
border-inline-start: 1px solid;

/* ❌ BAD: Physical properties */
padding-left: 1rem;
padding-right: 1rem;
margin-top: 2rem;
margin-bottom: 2rem;
```

### 4. Modern Selectors (:has, :is, :where)

```css
/* ✅ GOOD: :has() for parent styling */
.card:has(img) {
  padding: 0;
}

.form:has(:invalid) {
  border-color: red;
}

/* ✅ GOOD: :is() for grouping */
:is(h1, h2, h3) {
  font-weight: bold;
}
```

### 5. Modern Color Functions

```css
/* ✅ GOOD: color-mix() for dynamic colors */
background: color-mix(in srgb, var(--primary) 80%, white);

/* ✅ GOOD: lch() for perceptually uniform colors */
color: lch(50% 50 200);
```

### 6. New Viewport Units

```css
/* ✅ GOOD: Dynamic viewport units */
height: 100dvh; /* Dynamic viewport height */
min-height: 100lvh; /* Large viewport height */
max-height: 100svh; /* Small viewport height */

/* ❌ BAD: Fixed viewport units */
height: 100vh; /* Doesn't account for mobile browser UI */
```

### 7. Subgrid for Nested Layouts

```css
/* ✅ GOOD: Subgrid */
.parent {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.child {
  display: grid;
  grid-template-columns: subgrid;
}
```

### 8. aspect-ratio for Maintaining Proportions

```css
/* ✅ GOOD: aspect-ratio */
.image-container {
  aspect-ratio: 16 / 9;
}

/* ❌ BAD: Padding hack */
.image-container {
  padding-bottom: 56.25%;
}
```

### 9. flex gap for Cleaner Layouts

```css
/* ✅ GOOD: flex gap */
.actions {
  display: flex;
  gap: 0.5rem;
}

/* ❌ BAD: Margin on children */
.actions > * {
  margin-right: 0.5rem;
}
```

### 10. Cascade Layers for Style Organization

```css
/* ✅ GOOD: Cascade layers */
@layer reset, base, components, utilities;

@layer components {
  .button {
    /* Component styles */
  }
}

@layer utilities {
  .text-center {
    text-align: center;
  }
}
```

## Architecture

### Component Hierarchy

```
App (Root)
├── ErrorBoundary
├── SessionProvider
├── AppProvider
├── ThemeProvider
├── I18nProvider
├── NotificationProvider
└── AccessibilityProvider
    └── AppLayout
        ├── SkipLink (Accessibility)
        ├── Header (Glass)
        │   ├── MenuButton (Mobile/Tablet)
        │   ├── AppTitle
        │   ├── LanguageSelector
        │   ├── ThemeToggle
        │   └── SettingsButton
        ├── Sidebar (Glass)
        │   ├── NewConversationButton
        │   ├── ConversationSearch
        │   ├── ConversationList (Virtualized)
        │   │   └── ConversationItem[]
        │   │       ├── TitleDisplay/Input
        │   │       ├── MetadataDisplay
        │   │       └── DropdownMenu
        │   └── SidebarFooter
        ├── SidebarOverlay (Mobile)
        └── MainContent
            └── ChatInterface / WelcomeMessage
```

### Layout System

The layout uses a flexbox-based structure with the following key characteristics:

1. **Fixed Header**: Sticky positioned at top with z-index 30
2. **Flexible Sidebar**: Fixed position on mobile (z-index 40), static on desktop
3. **Scrollable Main Content**: Flex-1 with overflow-y-auto
4. **Responsive Breakpoints**:
   - Mobile: < 768px (overlay sidebar)
   - Tablet: 768px - 1024px (toggleable sidebar)
   - Desktop: > 1024px (persistent sidebar)

### Glass Effect Implementation

The Glass component provides three intensity levels:

- **Low**: `bg-white/10 dark:bg-black/10 backdrop-blur-md` (subtle transparency)
- **Medium**: `bg-white/40 dark:bg-black/40 backdrop-blur-xl` (balanced visibility)
- **High**: `bg-white/70 dark:bg-black/70 backdrop-blur-2xl` (strong frosted effect)

All Glass components include:
- Semi-transparent borders: `border-white/20 dark:border-white/10`
- Shadow effects: `shadow-lg`
- Rounded corners: `rounded-2xl`
- Smooth transitions: `transition-all duration-300`

### Animation System Architecture

The application uses a sophisticated animation system based on spring physics to achieve fluid, organic motion:

```
AnimationSystem
├── SpringPhysics Engine (framer-motion)
│   ├── Default Spring Config: { damping: 0.7, stiffness: 100 }
│   ├── Gentle Spring: { damping: 0.8, stiffness: 80 }
│   └── Bouncy Spring: { damping: 0.6, stiffness: 120 }
├── Gesture Recognition
│   ├── Tap/Click
│   ├── Drag
│   └── Scroll
└── Animation Orchestration
    ├── Sequence Animations
    ├── Parallel Animations
    └── Stagger Animations
```

**Key Animation Principles:**
1. **Spring Physics**: All animations use spring-based easing for natural motion
2. **Gesture-Driven**: Animations respond to user input velocity and direction
3. **Interruptible**: Animations can be interrupted and redirected smoothly
4. **Performance**: Use transform and opacity for GPU acceleration

### Scroll Behavior Management

Dynamic scroll behavior is managed through a centralized system:

```typescript
interface ScrollBehavior {
  direction: 'up' | 'down' | 'none';
  position: number;
  velocity: number;
  isAtTop: boolean;
  isAtBottom: boolean;
  isNearEdge: boolean;
}

interface ScrollEffects {
  headerHeight: number;
  showScrollEdge: boolean;
  edgeOpacity: number;
}
```

**Scroll Detection Strategy:**
1. Use Intersection Observer for edge detection (performance-optimized)
2. Use scroll event with throttling (16ms) for position tracking
3. Calculate velocity using requestAnimationFrame
4. Apply effects using CSS custom properties for smooth transitions

### Optical Effects System

Advanced optical effects are achieved through layered CSS filters and dynamic adjustments:

```typescript
interface OpticalEffects {
  blur: number;           // backdrop-blur intensity (0-40px)
  brightness: number;     // brightness adjustment (0.8-1.2)
  contrast: number;       // contrast adjustment (0.9-1.1)
  saturation: number;     // saturation adjustment (0.9-1.1)
  refraction: number;     // simulated refraction (0-1)
}

interface AdaptiveGlass {
  backgroundBrightness: number;  // Detected from content behind
  opacity: number;               // Dynamically adjusted (0.1-0.7)
  blurIntensity: number;        // Dynamically adjusted (10-40px)
}
```

**Optical Effect Implementation:**
1. Detect background brightness using canvas sampling
2. Adjust Glass opacity inversely to background brightness
3. Apply layered filters for depth perception
4. Use CSS mix-blend-mode for realistic light interaction
5. **Continuously validate WCAG AAA contrast ratios** during optical adjustments
6. **Provide fallback solid backgrounds** when contrast cannot be maintained

### Accessibility Preservation System

All advanced Liquid Glass features must maintain WCAG 2.2 AAA compliance:

```typescript
interface AccessibilityGuards {
  contrastValidation: {
    minimumNormalText: 7.0;      // WCAG AAA for normal text
    minimumLargeText: 4.5;       // WCAG AAA for large text
    minimumFocusIndicator: 3.0;  // WCAG AAA for focus indicators
    continuousMonitoring: boolean;
  };
  
  motionPreferences: {
    respectReducedMotion: boolean;
    fallbackToInstant: boolean;
    maxAnimationDuration: number;  // 300ms when reduced motion
  };
  
  keyboardAccessibility: {
    maintainFocusOrder: boolean;
    visibleFocusIndicators: boolean;
    noKeyboardTraps: boolean;
    skipLinks: boolean;
  };
  
  screenReaderSupport: {
    ariaLiveRegions: boolean;
    properLabeling: boolean;
    stateAnnouncements: boolean;
    roleAttributes: boolean;
  };
}
```

**Accessibility Implementation Strategy:**

1. **Contrast Monitoring**: Real-time contrast ratio calculation during optical effects
2. **Motion Reduction**: Detect `prefers-reduced-motion` and disable/reduce animations
3. **Focus Management**: Maintain visible focus indicators throughout all animations
4. **Screen Reader Announcements**: Use ARIA live regions for dynamic content changes
5. **Keyboard Navigation**: Ensure all interactive elements remain keyboard accessible
6. **Touch Target Size**: Maintain minimum 44x44px touch targets on mobile
7. **Fallback Mechanisms**: Provide accessible alternatives when advanced features fail

**Contrast Validation Algorithm:**

```typescript
function validateAndAdjustContrast(
  foreground: Color,
  background: Color,
  minimumRatio: number
): { isValid: boolean; adjustedBackground?: Color } {
  const currentRatio = calculateContrastRatio(foreground, background);
  
  if (currentRatio >= minimumRatio) {
    return { isValid: true };
  }
  
  // Adjust background opacity/brightness to meet minimum ratio
  const adjustedBackground = adjustBackgroundForContrast(
    foreground,
    background,
    minimumRatio
  );
  
  return {
    isValid: false,
    adjustedBackground
  };
}
```

## Components and Interfaces

### shadcn/ui Component Mapping

The following shadcn/ui components will be used throughout the application:

| UI Element | shadcn/ui Component | Purpose |
|------------|---------------------|---------|
| Sidebar Panel | Sheet, SheetContent | Sliding sidebar with overlay |
| Header Actions | Button | Icon buttons for menu, settings, theme |
| Dropdown Menus | DropdownMenu, DropdownMenuItem | Settings, language selection |
| Navigation | Breadcrumb, BreadcrumbItem | Page navigation |
| Search Input | Input | Conversation search |
| Conversation List | ScrollArea | Scrollable list container |
| Conversation Items | Card | Individual conversation cards |
| Dialogs | Dialog, DialogContent | Modal dialogs |
| Alerts | Alert, AlertDescription | Error and info messages |
| Loading States | Skeleton | Loading placeholders |
| Tabs | Tabs, TabsList, TabsTrigger | Tab navigation |
| Tooltips | Tooltip, TooltipContent | Hover information |
| Switches | Switch | Toggle controls |
| Select Dropdowns | Select, SelectContent, SelectItem | Dropdown selections |

**Installation Strategy:**
1. Use shadcn MCP to search for required components
2. Use shadcn MCP to get installation commands
3. Install components using `npx shadcn@latest add <component>`
4. Customize components with glass effect styling
5. Ensure all components maintain WCAG AAA compliance

### Glass Component (React 19.2 + shadcn/ui + Tailwind CSS 4.1)

```typescript
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/sheet';

type GlassIntensity = 'low' | 'medium' | 'high';

type GlassProps<T extends React.ElementType> = {
  as?: T;
  intensity?: GlassIntensity;
  border?: boolean;
  children?: React.ReactNode;
  adaptive?: boolean;  // Enable dynamic optical adaptation
  variant?: 'card' | 'sheet' | 'custom';  // shadcn/ui component variant
} & React.ComponentPropsWithoutRef<T>;

export const Glass: React.ForwardRefExoticComponent<GlassProps<React.ElementType>>;
export function cn(...inputs: ClassValue[]): string;
```

**Implementation Strategy:**
- Use shadcn/ui Card component as base for static glass panels
- Use shadcn/ui Sheet component as base for sliding glass panels (Sidebar)
- Extend shadcn/ui components with glass effect styling
- Maintain shadcn/ui's accessibility features (ARIA attributes, keyboard navigation)

**React 19.2 Features Used:**
- `use()` hook for background brightness detection
- Automatic batching for smooth opacity transitions
- Concurrent rendering for non-blocking optical calculations

**shadcn/ui Integration:**
```typescript
// Glass component wrapping shadcn/ui Card
export const GlassCard = React.forwardRef<HTMLDivElement, GlassProps<'div'>>(
  ({ intensity = 'medium', children, className, ...props }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn(
          'backdrop-blur-xl border-white/20 dark:border-white/10',
          intensity === 'low' && 'bg-white/10 dark:bg-black/10',
          intensity === 'medium' && 'bg-white/40 dark:bg-black/40',
          intensity === 'high' && 'bg-white/70 dark:bg-black/70',
          className
        )}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

// Glass component wrapping shadcn/ui Sheet
export const GlassSheet = React.forwardRef<HTMLDivElement, GlassProps<'div'>>(
  ({ intensity = 'high', children, className, ...props }, ref) => {
    return (
      <Sheet>
        <SheetContent
          ref={ref}
          className={cn(
            'backdrop-blur-2xl border-white/20 dark:border-white/10',
            intensity === 'low' && 'bg-white/10 dark:bg-black/10',
            intensity === 'medium' && 'bg-white/40 dark:bg-black/40',
            intensity === 'high' && 'bg-white/70 dark:bg-black/70',
            className
          )}
          {...props}
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }
);
```

**Modern CSS Features Used:**
```css
/* Using native CSS cascade layers */
@layer components {
  .glass-low {
    @apply bg-white/10 dark:bg-black/10 backdrop-blur-md;
  }
  
  .glass-medium {
    @apply bg-white/40 dark:bg-black/40 backdrop-blur-xl;
  }
  
  .glass-high {
    @apply bg-white/70 dark:bg-black/70 backdrop-blur-2xl;
  }
}

/* Using container queries for responsive glass effects */
@container (min-width: 768px) {
  .glass-adaptive {
    backdrop-filter: blur(20px);
  }
}

/* Using native CSS nesting */
.glass-component {
  &:hover {
    @apply bg-white/50 dark:bg-black/50;
  }
  
  &:focus-visible {
    @apply ring-2 ring-blue-500;
  }
}

/* Using clamp() for responsive sizing */
.glass-header {
  height: clamp(3rem, 5vw, 4rem);
  padding-inline: clamp(1rem, 3vw, 2rem);
}

/* Using :has() selector for conditional styling */
.glass-card:has(img) {
  padding-block: 0;
}

/* Using color-mix() for dynamic colors */
.glass-overlay {
  background: color-mix(in srgb, var(--glass-base) 80%, transparent);
}

/* Using new viewport units */
.glass-sidebar {
  height: 100dvh; /* Dynamic viewport height */
}

/* Using logical properties for better i18n */
.glass-content {
  padding-inline: 1rem;
  margin-block: 2rem;
}

/* Using aspect-ratio */
.glass-image-container {
  aspect-ratio: 16 / 9;
}

/* Using flex gap */
.glass-actions {
  display: flex;
  gap: 0.5rem;
}
```

### AppLayout Component

```typescript
export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps): React.JSX.Element;

export interface LayoutContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function LayoutContainer(props: LayoutContainerProps): React.JSX.Element;

export interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
}

export function ResponsiveGrid(props: ResponsiveGridProps): React.JSX.Element;
```

### Header Component (with shadcn/ui)

```typescript
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export interface HeaderProps {
  isMobile: boolean;
  isTablet: boolean;
}

export function Header(props: HeaderProps): React.JSX.Element;

export interface BreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
    active?: boolean;
  }>;
}

// Use shadcn/ui Breadcrumb component
export function AppBreadcrumb(props: BreadcrumbProps): React.JSX.Element;

export interface HeaderActionProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

// Use shadcn/ui Button component
export function HeaderAction(props: HeaderActionProps): React.JSX.Element;
```

**shadcn/ui Components Used:**
- `Button`: For all header actions (menu, settings, theme toggle)
- `DropdownMenu`: For settings and language selection menus
- `Breadcrumb`: For navigation breadcrumbs

### Sidebar Component (with shadcn/ui)

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}

export function Sidebar(props: SidebarProps): React.JSX.Element;
```

**shadcn/ui Components Used:**
- `Sheet`: For the sliding sidebar panel with overlay
- `SheetContent`: For the sidebar content container
- `Button`: For new conversation and action buttons
- `Input`: For the conversation search input
- `ScrollArea`: For the scrollable conversation list

### Floating Action Button Component (with shadcn/ui)

```typescript
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

export interface FloatingActionButtonProps {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
}

export function FloatingActionButton(props: FloatingActionButtonProps): React.JSX.Element;
```

**Implementation Details:**
- Position: `fixed bottom-6 right-6 z-50`
- Size: `w-14 h-14` (56px, exceeds 44px minimum)
- Shape: `rounded-full`
- Colors: `bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600`
- Shadow: `shadow-lg hover:shadow-xl`
- Animation: Spring physics with framer-motion
- Visibility: Only shown on mobile/tablet when Sidebar is closed

**shadcn/ui Components Used:**
- `Button`: For the floating action button
- `Tooltip`: For hover/focus tooltip
- `TooltipProvider`, `TooltipTrigger`, `TooltipContent`: For tooltip functionality

### Onboarding Message Component (with shadcn/ui)

```typescript
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export interface OnboardingMessageProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  description: string;
  dismissLabel: string;
}

export function OnboardingMessage(props: OnboardingMessageProps): React.JSX.Element;
```

**Implementation Details:**
- Position: `fixed inset-0 z-[60]` (above floating button)
- Backdrop: `bg-black/50 backdrop-blur-sm`
- Card: `bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm`
- Animation: Scale and fade with framer-motion
- Persistence: Uses localStorage key `sidebar-onboarding-seen`
- Delay: Shows 1 second after Sidebar closes for first time

**shadcn/ui Components Used:**
- `Button`: For the dismiss button

## Data Models

### Theme Configuration

```typescript
type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContext {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

interface ThemeColors {
  light: {
    background: string;      // #FFFFFF
    text: string;            // #000000 (21:1 contrast)
    textSecondary: string;   // #333333 (12.6:1 contrast)
    primary: string;         // #0066CC (7.5:1 contrast)
    border: string;          // #CCCCCC (3:1 contrast)
    glassBase: string;       // white with 10-70% opacity
  };
  dark: {
    background: string;      // #000000
    text: string;            // #FFFFFF (21:1 contrast)
    textSecondary: string;   // #CCCCCC (12.6:1 contrast)
    primary: string;         // #66B3FF (7.5:1 contrast)
    border: string;          // #333333 (3:1 contrast)
    glassBase: string;       // black with 10-70% opacity
  };
}
```

**WCAG AAA Contrast Requirements:**
- Normal text: 7:1 minimum contrast ratio
- Large text (18pt+ or 14pt+ bold): 4.5:1 minimum contrast ratio
- Focus indicators: 3:1 minimum contrast ratio
- UI components: 3:1 minimum contrast ratio

**Theme Implementation Strategy:**
1. Use Tailwind CSS dark mode with class strategy
2. Validate all color combinations with Chrome DevTools MCP
3. Test both modes with automated contrast checking
4. Provide high contrast mode as additional option
5. Persist theme preference to localStorage

### Responsive State

```typescript
interface ResponsiveState {
  isMobile: boolean;      // < 768px
  isTablet: boolean;      // 768px - 1024px
  isDesktop: boolean;     // > 1024px
  windowWidth: number;
  windowHeight: number;
}
```

### UI State

```typescript
interface UIState {
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;
  notifications: Notification[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sidebar Width Consistency
*For any* Glass component used as a Sidebar, when the sidebar is open, the component SHALL have a width of 320px (20rem) and apply the correct glass effect styling based on its intensity prop.
**Validates: Requirements 1.2**

### Property 2: Content Non-Overlap
*For any* layout state, the main content area SHALL not overlap with Header or Sidebar components, verified by checking that bounding rectangles do not intersect and z-index values are properly ordered.
**Validates: Requirements 1.3**

### Property 3: Responsive Breakpoint Behavior
*For any* window width, the layout SHALL apply the correct responsive behavior: overlay sidebar for mobile (< 768px), toggleable sidebar for tablet (768px-1024px), and persistent sidebar for desktop (> 1024px).
**Validates: Requirements 1.4**

### Property 4: Main Content Expansion
*For any* sidebar state change from open to closed on desktop, the main content area SHALL expand to fill the available horizontal space.
**Validates: Requirements 1.5**

### Property 5: Glass Intensity Styling
*For any* Glass component with a specified intensity level (low/medium/high), the component SHALL apply the corresponding backdrop-blur and background opacity CSS classes.
**Validates: Requirements 2.1**

### Property 6: Glass Component Z-Index Ordering
*For any* set of stacked Glass components, the z-index values SHALL be properly ordered such that components rendered later in the DOM tree appear above earlier components when overlapping.
**Validates: Requirements 2.2**

### Property 7: Theme-Dependent Glass Styling
*For any* Glass component, when the theme changes between light and dark mode, the component SHALL update its opacity and border color classes to match the current theme.
**Validates: Requirements 2.3**

### Property 8: Interactive Element Hover States
*For any* Glass component containing interactive elements (buttons, links, inputs), hovering over the interactive element SHALL apply visual feedback through background color changes.
**Validates: Requirements 2.4**

### Property 9: Glass Border Color Consistency
*For any* Glass component with border enabled, the border SHALL use semi-transparent white with opacity 0.2 in light mode and 0.1 in dark mode.
**Validates: Requirements 2.5**

### Property 10: Light Mode Contrast Compliance
*For any* text element in light mode, the contrast ratio between text color and background color SHALL meet or exceed 7:1 for normal text and 4.5:1 for large text (WCAG AAA).
**Validates: Requirements 3.3**

### Property 11: Dark Mode Contrast Compliance
*For any* text element in dark mode, the contrast ratio between text color and background color SHALL meet or exceed 7:1 for normal text and 4.5:1 for large text (WCAG AAA).
**Validates: Requirements 3.4**

### Property 12: Light Mode Glass Opacity
*For any* Glass component in light mode, the background opacity SHALL be within the range of 10% to 70% (bg-white/10 to bg-white/70) while maintaining text readability.
**Validates: Requirements 3.5**

### Property 13: Dark Mode Glass Opacity
*For any* Glass component in dark mode, the background opacity SHALL be within the range of 10% to 70% (bg-black/10 to bg-black/70) while maintaining text readability.
**Validates: Requirements 3.6**

### Property 14: Theme Persistence
*For any* theme change, the system SHALL persist the user's preference to localStorage and restore it on subsequent sessions.
**Validates: Requirements 3.9**

### Property 15: Mobile Scroll Lock
*For any* mobile viewport (< 768px), when the Sidebar is open, the main content area SHALL have overflow hidden to prevent scrolling.
**Validates: Requirements 3.4**

### Property 16: Orientation Change Adaptation
*For any* device orientation change, the layout SHALL re-evaluate responsive breakpoints and apply appropriate styling without breaking the visual structure.
**Validates: Requirements 3.5**

### Property 17: Text Contrast Ratio Compliance
*For any* text element in the interface, the contrast ratio between text color and background color SHALL meet or exceed 7:1 for normal text and 4.5:1 for large text (WCAG AAA).
**Validates: Requirements 4.1**

### Property 18: Keyboard Navigation Completeness
*For any* interactive element in the interface, the element SHALL be reachable via Tab key navigation and SHALL display a visible focus indicator with minimum 3:1 contrast ratio.
**Validates: Requirements 4.2, 4.4**

### Property 19: ARIA Attribute Completeness
*For any* component in the interface, the component SHALL have appropriate ARIA labels, roles, and live regions as required by its semantic purpose.
**Validates: Requirements 4.3**

### Property 20: Language Switch Completeness
*For any* UI text element with a translation key, when the language is switched, the element SHALL update to display the text in the new language without page reload.
**Validates: Requirements 5.2**

### Property 21: Locale-Specific Date Formatting
*For any* date or time value displayed in the interface, the formatting SHALL match the selected locale's conventions (date order, time format, separators).
**Validates: Requirements 5.3**

### Property 22: Text Direction Layout Adaptation
*For any* language with RTL text direction, the layout SHALL apply dir="rtl" attribute and mirror the horizontal layout appropriately.
**Validates: Requirements 5.4**

### Property 23: Large List Virtualization
*For any* conversation list or message list exceeding 50 items, the rendering SHALL use virtualization to render only visible items plus a buffer.
**Validates: Requirements 6.5**

### Property 24: Search Result Keyword Highlighting
*For any* search query, all matching results SHALL display with the search keywords highlighted using appropriate HTML markup and styling.
**Validates: Requirements 8.1**

### Property 25: Search Pagination Navigation
*For any* search result set exceeding the page size (20 items), pagination controls SHALL be displayed and allow navigation to previous/next pages.
**Validates: Requirements 8.2**

### Property 26: Search Result Navigation
*For any* search result item, clicking the item SHALL navigate to the corresponding conversation and close the search interface.
**Validates: Requirements 8.3**

### Property 27: Search Result ARIA Announcements
*For any* search result update, the change SHALL be announced to screen readers via ARIA live regions with appropriate politeness level.
**Validates: Requirements 8.4**

### Property 28: Search Keyboard Navigation
*For any* search result set, arrow keys SHALL move focus between results, Home/End SHALL jump to first/last result, and Enter SHALL select the focused result.
**Validates: Requirements 8.5**

### Property 29: ClassName Utility Consistency
*For any* component requiring className merging, the cn() utility SHALL be used to properly merge Tailwind classes with conflict resolution.
**Validates: Requirements 9.5**

### Property 30: Dynamic Toolbar Scroll Behavior
*For any* scroll event in the main content area, when scrolling down beyond 50px, the Header SHALL reduce its height smoothly, and when scrolling up, the Header SHALL expand to full height.
**Validates: Requirements 15.1, 15.2**

### Property 31: Fluid Animation Spring Physics
*For any* interactive element (button, switch, slider), when interacted with, the element SHALL animate with spring physics (elastic easing with damping ratio between 0.6-0.8) rather than linear transitions.
**Validates: Requirements 14.1, 14.2**

### Property 32: In-Place Dialog Expansion
*For any* dialog or alert triggered by a button, the dialog SHALL expand from the button's position using transform-origin set to the button's bounding rectangle center coordinates.
**Validates: Requirements 16.1, 16.2, 16.4**

### Property 33: Mobile Bottom Search Positioning
*For any* mobile viewport (< 768px), the search input SHALL be positioned within the bottom 20% of the viewport height to ensure thumb reachability.
**Validates: Requirements 17.1, 17.2**

### Property 34: Dynamic Glass Optical Adaptation
*For any* Glass component, when the computed brightness of content behind it changes by more than 20%, the Glass component SHALL adjust its opacity by at least 10% to maintain legibility.
**Validates: Requirements 13.2**

### Property 35: Scroll Edge Visual Feedback
*For any* scrollable container, when scrolled within 10px of the top or bottom edge, a visual indicator SHALL appear with opacity proportional to the distance from the edge.
**Validates: Requirements 19.1, 19.2**

### Property 36: Responsive Typography Uses clamp()
*For any* text element with responsive sizing, the font-size SHALL use clamp() function with minimum, preferred, and maximum values instead of fixed breakpoints.
**Validates: Requirements 20.1**

### Property 37: Component Responsiveness Uses Container Queries
*For any* component with responsive layout changes, the component SHALL use @container queries instead of @media queries for component-level responsiveness.
**Validates: Requirements 20.2**

### Property 38: Spacing Uses Logical Properties
*For any* element with padding or margin, the styles SHALL use logical properties (padding-inline, margin-block) instead of physical properties (padding-left, margin-top) for better internationalization.
**Validates: Requirements 20.3**

### Property 39: Full-Height Layouts Use Dynamic Viewport Units
*For any* full-height layout element, the height SHALL use dvh (dynamic viewport height) instead of vh to account for mobile browser UI.
**Validates: Requirements 20.6**

### Property 40: Flex Layouts Use Gap Property
*For any* flex container with spacing between children, the container SHALL use gap property instead of margins on children elements.
**Validates: Requirements 20.9**

### Property 41: Desktop Sidebar Default Open State
*For any* desktop viewport (> 1024px), when the application loads for the first time, the Sidebar SHALL be in the open state by default.
**Validates: Requirements 21.1**

### Property 42: Floating Button Visibility
*For any* mobile or tablet viewport (≤ 1024px), when the Sidebar is closed, a floating action button SHALL be visible in the bottom-right corner with minimum 44x44px dimensions.
**Validates: Requirements 21.2**

### Property 43: Button Tooltip Presence
*For any* hamburger menu button or floating action button, when hovered or focused, a tooltip SHALL appear with descriptive text that meets WCAG AAA contrast requirements (7:1 for normal text).
**Validates: Requirements 21.3**

### Property 44: Enhanced Button Visual Prominence
*For any* hamburger menu button, when rendered, the button SHALL have enhanced styling including hover effects (color change, ring effect) and maintain minimum 3:1 contrast ratio for focus indicators.
**Validates: Requirements 21.4**

### Property 45: First-Time Onboarding Display
*For any* user who closes the Sidebar for the first time on mobile or tablet, an onboarding message SHALL appear after 1 second delay explaining how to reopen the Sidebar.
**Validates: Requirements 21.5**

### Property 46: Onboarding Persistence
*For any* user who dismisses the onboarding message, the system SHALL store a flag in localStorage and SHALL NOT display the onboarding message again in future sessions.
**Validates: Requirements 21.6**

### Property 47: Floating Button Sidebar Opening
*For any* floating action button click event, the Sidebar SHALL transition to the open state with smooth animation that respects the user's prefers-reduced-motion preference.
**Validates: Requirements 21.7**

### Property 48: Floating Button Icon Clarity
*For any* floating action button, the button SHALL display a clear icon (chat bubbles or menu) and maintain WCAG AAA contrast ratios (minimum 7:1 for icon against background).
**Validates: Requirements 21.8**

### Property 49: Sidebar Button Keyboard Accessibility
*For any* hamburger menu button or floating action button, the button SHALL be reachable via Tab key navigation and SHALL display a visible focus indicator with minimum 3:1 contrast ratio.
**Validates: Requirements 21.9**

### Property 50: Sidebar Button Screen Reader Support
*For any* hamburger menu button or floating action button, the button SHALL have an aria-label attribute that clearly describes its purpose to screen reader users.
**Validates: Requirements 21.10**

## Error Handling

### Layout Error Recovery

1. **Sidebar State Errors**: If sidebar state becomes inconsistent, reset to closed state on mobile, open state on desktop
2. **Responsive Detection Errors**: If window dimensions cannot be determined, default to desktop layout
3. **Theme Resolution Errors**: If theme cannot be determined, default to light mode
4. **Glass Component Errors**: If intensity prop is invalid, default to 'medium' intensity

### Accessibility Error Handling

1. **Missing ARIA Labels**: Log warnings in development mode for components missing required ARIA attributes
2. **Contrast Ratio Failures**: Log warnings for text elements failing WCAG AAA contrast requirements
3. **Focus Management Errors**: Ensure focus is never lost; return to last valid focusable element on error

### i18n Error Handling

1. **Missing Translation Keys**: Display the key itself as fallback text and log warning
2. **Locale Detection Errors**: Default to English (en) if browser language cannot be detected
3. **Date Formatting Errors**: Fall back to ISO 8601 format if locale-specific formatting fails

## Development Tools and Best Practices

### MCP Tools for Development

**shadcn MCP**: Use for component discovery and installation
- `mcp_shadcn_search_items_in_registries`: Search for shadcn/ui components by name or description
- `mcp_shadcn_view_items_in_registries`: View detailed component information and code
- `mcp_shadcn_get_item_examples_from_registries`: Find usage examples and demos
- `mcp_shadcn_get_add_command_for_items`: Get CLI commands to install components
- `mcp_shadcn_get_project_registries`: List configured component registries

**Chrome DevTools MCP**: Use for real-time debugging and verification
- `mcp_chrome_devtools_take_snapshot`: Capture accessibility tree snapshots to verify ARIA structure
- `mcp_chrome_devtools_click`: Test interactive elements and verify behavior
- `mcp_chrome_devtools_evaluate_script`: Inspect computed styles, measure contrast ratios, check z-index values
- `mcp_chrome_devtools_list_console_messages`: Monitor console for errors and warnings
- `mcp_chrome_devtools_take_screenshot`: Capture visual state for comparison

**Playwright MCP**: Use for automated browser testing
- `mcp_microsoft_playwright_mcp_browser_snapshot`: Verify layout structure and accessibility
- `mcp_microsoft_playwright_mcp_browser_click`: Test user interactions
- `mcp_microsoft_playwright_mcp_browser_navigate`: Test navigation flows
- `mcp_microsoft_playwright_mcp_browser_evaluate`: Measure performance metrics, check DOM state

**Serena MCP**: Use for code analysis and refactoring
- `mcp_serena_find_symbol`: Locate components and functions for modification
- `mcp_serena_get_symbols_overview`: Understand file structure before changes
- `mcp_serena_search_for_pattern`: Find all usages of patterns (e.g., Glass component, className utilities)
- `mcp_serena_replace_symbol_body`: Refactor component implementations
- `mcp_serena_find_referencing_symbols`: Identify all components using a specific utility or component

**Sequential Thinking MCP**: Use for complex problem-solving
- Before implementing complex changes, use `mcp_sequential_thinking_sequentialthinking` to:
  - Break down the problem into steps
  - Consider multiple approaches
  - Identify potential issues and edge cases
  - Plan the optimal solution
  - Verify the approach before coding

### Development Workflow

1. **Analyze**: Use Serena MCP to understand current code structure
2. **Think**: Use Sequential Thinking MCP to plan the optimal approach
3. **Implement**: Make code changes following the plan
4. **Verify**: Use Chrome DevTools MCP to inspect the result in browser
5. **Test**: Use Playwright MCP to run automated tests
6. **Iterate**: Refine based on findings

### Example Workflow for Layout Fix

```typescript
// 1. Analyze current implementation
mcp_serena_get_symbols_overview({ relative_path: "apps/frontend/src/components/layout/Sidebar.tsx" })

// 2. Think through the solution
mcp_sequential_thinking_sequentialthinking({
  thought: "Need to fix Sidebar width. Current issue: width not consistent. Options: 1) Use fixed w-80 class, 2) Use custom width. Considering responsive behavior and Glass component constraints...",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

// 3. Find all usages of Sidebar
mcp_serena_find_referencing_symbols({
  name_path: "Sidebar",
  relative_path: "apps/frontend/src/components/layout/Sidebar.tsx"
})

// 4. Implement the fix
// ... make code changes ...

// 5. Verify in browser
mcp_chrome_devtools_navigate({ url: "http://localhost:5173" })
mcp_chrome_devtools_take_snapshot({ verbose: true })
mcp_chrome_devtools_evaluate_script({
  function: "() => { const sidebar = document.querySelector('[data-testid=\"sidebar\"]'); return { width: sidebar?.offsetWidth, classes: sidebar?.className }; }"
})

// 6. Test with Playwright
mcp_microsoft_playwright_mcp_browser_navigate({ url: "http://localhost:5173" })
mcp_microsoft_playwright_mcp_browser_snapshot()
```

## Testing Strategy

### Unit Testing Approach

Unit tests will use Vitest with happy-dom environment and focus on:

1. **Component Rendering**: Verify components render without errors with various prop combinations
2. **Glass Component**: Test intensity levels, border toggling, className merging
3. **Responsive Hooks**: Test useEffect hooks for window resize handling
4. **Theme Context**: Test theme switching and resolved theme calculation
5. **i18n Context**: Test language switching and translation key resolution
6. **Accessibility Utilities**: Test ARIA attribute generation and focus management

### Property-Based Testing

Property-based tests will use fast-check library (JavaScript PBT framework) with minimum 100 iterations per property:

**PBT Library**: fast-check (https://github.com/dubzzz/fast-check)

**Configuration**: Each property test SHALL run with at least 100 iterations to ensure adequate coverage of the input space.

**Tagging Convention**: Each property-based test MUST include a comment tag in the format:
```typescript
// Feature: liquid-glass-frontend-redesign, Property N: [property description]
```

**Property Test Examples**:

```typescript
// Feature: liquid-glass-frontend-redesign, Property 5: Glass Intensity Styling
test('Glass component applies correct styling for any intensity level', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('low', 'medium', 'high'),
      (intensity) => {
        const { container } = render(<Glass intensity={intensity}>Content</Glass>);
        const element = container.firstChild as HTMLElement;
        
        const expectedClasses = {
          low: ['bg-white/10', 'backdrop-blur-md'],
          medium: ['bg-white/40', 'backdrop-blur-xl'],
          high: ['bg-white/70', 'backdrop-blur-2xl'],
        };
        
        return expectedClasses[intensity].every(cls => 
          element.className.includes(cls)
        );
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: liquid-glass-frontend-redesign, Property 12: Text Contrast Ratio Compliance
test('All text elements meet WCAG AAA contrast requirements', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('light', 'dark'),
      fc.string({ minLength: 1, maxLength: 100 }),
      (theme, textContent) => {
        const { container } = render(
          <ThemeProvider initialTheme={theme}>
            <div className="text-gray-900 dark:text-gray-100">{textContent}</div>
          </ThemeProvider>
        );
        
        const element = container.querySelector('div');
        const computedStyle = window.getComputedStyle(element!);
        const textColor = computedStyle.color;
        const bgColor = computedStyle.backgroundColor;
        
        const contrastRatio = calculateContrastRatio(textColor, bgColor);
        return contrastRatio >= 7.0; // WCAG AAA for normal text
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: liquid-glass-frontend-redesign, Property 15: Language Switch Completeness
test('All UI text updates when language is switched', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('en', 'zh'),
      fc.constantFrom('en', 'zh'),
      (initialLang, targetLang) => {
        const { container, rerender } = render(
          <I18nProvider initialLanguage={initialLang}>
            <Header isMobile={false} isTablet={false} />
          </I18nProvider>
        );
        
        const initialText = container.textContent;
        
        rerender(
          <I18nProvider initialLanguage={targetLang}>
            <Header isMobile={false} isTablet={false} />
          </I18nProvider>
        );
        
        const updatedText = container.textContent;
        
        // If languages are different, text should change
        return initialLang === targetLang || initialText !== updatedText;
      }
    ),
    { numRuns: 100 }
  );
});
```

### E2E Testing Approach

E2E tests will use Playwright and cover:

1. **Layout Rendering**: Verify Header, Sidebar, and main content render correctly
2. **Responsive Behavior**: Test layout at mobile, tablet, and desktop breakpoints
3. **Sidebar Interactions**: Test open/close, conversation selection, rename, delete
4. **Search Functionality**: Test search input, results display, pagination, keyboard navigation
5. **Theme Switching**: Test light/dark mode transitions
6. **Language Switching**: Test English/Chinese language switching
7. **Keyboard Navigation**: Test Tab navigation, arrow keys, Enter, Escape
8. **Screen Reader**: Test ARIA labels and live regions with axe-core

### Test Coverage Requirements

- **Overall Coverage**: Minimum 80% line coverage for all frontend modules
- **Critical Paths**: 100% coverage for layout components, Glass component, accessibility utilities
- **Property Tests**: All 24 correctness properties must have corresponding property-based tests
- **E2E Tests**: All critical user flows must pass on Chromium, Firefox, and WebKit

### Quality Gates

All tests must pass with:
- **Zero errors**: No test failures, no TypeScript errors, no ESLint errors
- **Zero warnings**: No test warnings, no TypeScript warnings, no ESLint warnings
- **No rule bypasses**: No eslint-disable comments, no @ts-ignore, no type assertions
- **Meaningful tests**: Tests must verify actual behavior, not implementation details

## Performance Considerations

### Rendering Optimization

1. **React.memo**: Wrap expensive components (ConversationList, MessageList) in React.memo
2. **Virtualization**: Use react-window for lists exceeding 50 items
3. **Code Splitting**: Lazy load non-critical components (PerformanceDashboard, ModelDemo)
4. **Debouncing**: Debounce search input and window resize handlers (300ms)

### Memory Management

1. **Cleanup**: Ensure all useEffect hooks return cleanup functions
2. **Event Listeners**: Remove event listeners in cleanup functions
3. **Timers**: Clear all timers (setTimeout, setInterval) in cleanup functions
4. **Memory Monitoring**: Log warnings when memory usage exceeds 90%

### CSS Optimization

1. **Tailwind Purging**: Configure Tailwind to purge unused classes in production
2. **Critical CSS**: Inline critical CSS for above-the-fold content
3. **Backdrop Filter**: Provide fallbacks for browsers without backdrop-filter support
4. **Transitions**: Use GPU-accelerated properties (transform, opacity) for animations

## Browser Compatibility

### Supported Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

### Fallback Strategies

1. **Backdrop Filter**: Use solid backgrounds with reduced opacity if backdrop-filter unsupported
2. **CSS Grid**: Provide flexbox fallback for older browsers
3. **CSS Variables**: Provide static color values as fallback
4. **Intersection Observer**: Provide scroll-based fallback for virtualization

### Feature Detection

```typescript
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)') ||
                                CSS.supports('-webkit-backdrop-filter', 'blur(10px)');

const supportsContainerQueries = CSS.supports('container-type', 'inline-size');

const supportsHasSelector = CSS.supports('selector(:has(*))');
```

## Deployment Considerations

### Build Configuration

1. **Production Build**: Use Vite production mode with minification
2. **Source Maps**: Generate source maps for debugging but exclude from production bundle
3. **Asset Optimization**: Compress images, inline small SVGs, lazy load large assets
4. **Environment Variables**: Validate all required environment variables at build time

### CDN Strategy

1. **Static Assets**: Serve CSS, JS, images from CDN with long cache headers
2. **Cache Busting**: Use content hashes in filenames for cache invalidation
3. **Preloading**: Preload critical fonts and CSS
4. **Compression**: Enable gzip/brotli compression for text assets

### Monitoring

1. **Error Tracking**: Log all errors to monitoring service with context
2. **Performance Metrics**: Track Core Web Vitals (LCP, FID, CLS)
3. **User Analytics**: Track feature usage, language preferences, theme preferences
4. **Accessibility Metrics**: Monitor keyboard navigation usage, screen reader usage

## Functional Preservation Requirements

### Critical: All Existing Functionality Must Be Preserved

The migration to Tailwind CSS and liquid glass design is a **visual and structural refactoring only**. All existing functionality must continue to work correctly:

1. **Conversation Management**: Create, read, update, delete conversations
2. **Message Handling**: Send messages, receive streaming responses, display message history
3. **Search Functionality**: Search conversations, display results, navigate to conversations
4. **Session Management**: Maintain session state, persist across page reloads
5. **Storage Operations**: IndexedDB operations, localStorage fallbacks, data integrity checks
6. **Theme Switching**: Light/dark mode toggle with persistence
7. **Language Switching**: English/Chinese toggle with persistence
8. **Model Selection**: Switch between AI models, persist preferences
9. **File Upload**: Upload files, preview files, include in messages
10. **Context Management**: Track context usage, show warnings, handle compression
11. **Error Handling**: Display errors, retry failed operations, recover gracefully
12. **Accessibility Features**: Keyboard navigation, screen reader support, focus management
13. **Performance Monitoring**: Track metrics, display dashboard (dev mode)
14. **Cross-Tab Sync**: Synchronize state across browser tabs
15. **Notifications**: Display success/error/info notifications

### Verification Strategy

After each phase of migration:

1. **Manual Testing**: Test all critical user flows in the browser
2. **Unit Tests**: Ensure all existing unit tests still pass
3. **E2E Tests**: Ensure all existing E2E tests still pass
4. **Regression Testing**: Compare behavior before and after changes
5. **Storage Testing**: Verify data persistence and retrieval
6. **Integration Testing**: Verify API communication still works

### Bug Fixing During Migration

The migration process may reveal existing bugs in the codebase. When bugs are discovered:

**Allowed Bug Fixes**:
1. **Layout Bugs**: Incorrect positioning, overlapping elements, broken responsive behavior
2. **Styling Bugs**: Inconsistent colors, missing hover states, broken transitions
3. **Accessibility Bugs**: Missing ARIA labels, incorrect focus order, insufficient contrast
4. **Functional Bugs**: Broken event handlers, incorrect state updates, memory leaks
5. **Performance Bugs**: Unnecessary re-renders, missing memoization, inefficient algorithms
6. **Type Safety Bugs**: Incorrect types, missing null checks, unsafe type assertions

**Bug Fix Process**:
1. **Document**: Record the bug with reproduction steps and expected behavior
2. **Analyze**: Determine root cause and impact on other components
3. **Fix**: Implement the fix following best practices
4. **Test**: Add or update tests to prevent regression
5. **Verify**: Ensure the fix doesn't break other functionality
6. **Commit**: Create a separate commit with clear description of the bug and fix

**Bug Fix Commit Format**:
```
fix(component): brief description of bug fix

- Describe the bug that was found
- Explain the root cause
- Describe the solution implemented
- Reference any related issues or requirements

Fixes: [bug description]
```

### Rollback Plan

If any functionality breaks during migration:

1. **Identify**: Determine which change caused the regression
2. **Isolate**: Revert the specific change while keeping other improvements
3. **Fix**: Correct the issue while preserving the visual improvements
4. **Verify**: Re-test to ensure functionality is restored
5. **Document**: Record the issue and solution for future reference

## Migration Strategy

### Phase 1: Fix Critical Layout Issues (P0)

1. Fix Header positioning and alignment
2. Fix Sidebar width and glass effect styling
3. Fix main content area overlap issues
4. Fix responsive breakpoint behavior
5. Verify all layout tests pass

### Phase 2: Implement Consistent Glass Styling (P0)

1. Audit all Glass component usage
2. Standardize intensity levels across components
3. Fix border and shadow inconsistencies
4. Verify theme switching works correctly
5. Update Glass component tests

### Phase 3: Ensure Accessibility Compliance (P0)

1. Audit color contrast ratios with automated tools
2. Fix focus indicators to meet 3:1 contrast requirement
3. Add missing ARIA labels and roles
4. Test keyboard navigation completeness
5. Test with screen readers (NVDA, JAWS, VoiceOver)

### Phase 4: Fix Search Functionality (P1)

1. Fix search result highlighting
2. Implement pagination controls
3. Fix keyboard navigation in search results
4. Add ARIA live regions for result updates
5. Update search E2E tests

### Phase 5: Optimize Performance (P2)

1. Add React.memo to expensive components
2. Implement virtualization for large lists
3. Add debouncing to search and resize handlers
4. Optimize bundle size with code splitting
5. Verify performance metrics meet targets

### Phase 6: Code Cleanup and Quality (P3)

1. Remove commented-out code and debug statements
2. Consolidate duplicate utilities
3. Update documentation and comments
4. Run all quality checks (lint, type-check, test)
5. Verify zero errors and zero warnings

### Phase 7: Commit and Deploy

1. Review all changes and group logically
2. Create conventional commits (feat/fix/refactor/docs/test)
3. Write clear commit messages
4. Push to feature branch
5. Create pull request with comprehensive description

## Success Criteria

The migration is considered successful when:

1. ✅ All layout issues are resolved and UI displays correctly
2. ✅ All Glass components have consistent styling and theming
3. ✅ All accessibility requirements meet WCAG AAA standards
4. ✅ All search functionality works with pagination and keyboard navigation
5. ✅ All unit tests pass with >80% coverage
6. ✅ All E2E tests pass on Chromium, Firefox, and WebKit
7. ✅ TypeScript type-check reports zero errors
8. ✅ ESLint reports zero errors and zero warnings
9. ✅ All 50 correctness properties have passing property-based tests (including Sidebar UX properties)
10. ✅ Code is clean with no commented-out code or debug statements
11. ✅ Commit history follows conventional commit format
12. ✅ i18n support works for English and Chinese
13. ✅ Sidebar UX improvements are complete with floating button, tooltips, and onboarding
14. ✅ Desktop Sidebar opens by default, mobile/tablet Sidebar has clear reopen mechanisms
