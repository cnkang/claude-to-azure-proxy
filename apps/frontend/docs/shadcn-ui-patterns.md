# shadcn/ui Component Patterns

This document provides reference patterns for using shadcn/ui components in the liquid glass frontend redesign.

## Core Components

### Button

The Button component provides various variants and sizes:

```tsx
import { Button } from "@/components/ui/button"

// Variants: default, outline, ghost, link, destructive
<Button variant="outline">Click me</Button>

// Sizes: default, sm, lg, icon
<Button size="icon" aria-label="Submit">
  <ArrowUpIcon />
</Button>
```

**Key Features:**
- Accessible by default with proper ARIA attributes
- Supports icon-only buttons with aria-label
- Multiple variants for different contexts
- Composable with other components

### Card

The Card component provides a container with header, content, and footer sections:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

<Card className="w-full max-w-sm">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content */}
  </CardContent>
  <CardFooter>
    {/* Footer actions */}
  </CardFooter>
</Card>
```

**Key Features:**
- Semantic structure with header, content, footer
- Flexible layout with className customization
- Perfect base for Glass wrapper components

### Sheet

The Sheet component provides a sliding panel (perfect for Sidebar):

```tsx
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Open</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
      <SheetDescription>Description</SheetDescription>
    </SheetHeader>
    {/* Content */}
    <SheetFooter>
      <SheetClose asChild>
        <Button variant="outline">Close</Button>
      </SheetClose>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**Key Features:**
- Built-in overlay and animations
- Accessible with proper focus management
- Supports different sides (left, right, top, bottom)
- Perfect for mobile-responsive sidebars

### Input

The Input component provides accessible form inputs:

```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

<div className="grid gap-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="m@example.com"
    required
  />
</div>
```

**Key Features:**
- Accessible with proper label association
- Supports all HTML input types
- Consistent styling across the application

### Dropdown Menu

The Dropdown Menu component provides accessible dropdown menus:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Open Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Key Features:**
- Keyboard navigation built-in
- Accessible with proper ARIA attributes
- Supports nested menus and separators

## Glass Wrapper Pattern

All shadcn/ui components can be wrapped with Glass effects:

```tsx
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Glass wrapper pattern
<Card className={cn(
  "backdrop-blur-xl border-white/20 dark:border-white/10",
  "bg-white/40 dark:bg-black/40",
  "transition-all duration-300"
)}>
  {/* Content */}
</Card>
```

## Accessibility Best Practices

1. **Always use semantic HTML**: shadcn/ui components use proper semantic elements
2. **Provide ARIA labels**: Use aria-label for icon-only buttons
3. **Maintain focus management**: Components handle focus automatically
4. **Test keyboard navigation**: All components are keyboard accessible
5. **Verify contrast ratios**: Use Chrome DevTools to verify WCAG AAA compliance

## Modern CSS Integration

shadcn/ui components work seamlessly with modern CSS features:

```tsx
// Using clamp() for responsive sizing
<Card className="p-[clamp(1rem,3vw,2rem)]">

// Using container queries
<Card className="@container">
  <div className="@md:grid-cols-2">

// Using logical properties
<Card className="px-4 py-6"> {/* Uses padding-inline and padding-block */}

// Using gap for flex layouts
<div className="flex gap-4">
```

## Component Composition

shadcn/ui components are designed to be composed:

```tsx
// Composing Sheet with ScrollArea for scrollable sidebar
<Sheet>
  <SheetContent>
    <ScrollArea className="h-full">
      {/* Scrollable content */}
    </ScrollArea>
  </SheetContent>
</Sheet>

// Composing Card with Dialog for modal cards
<Dialog>
  <DialogContent>
    <Card>
      {/* Card content in dialog */}
    </Card>
  </DialogContent>
</Dialog>
```

## Testing Patterns

When testing shadcn/ui components:

```tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

test('Button renders with correct variant', () => {
  render(<Button variant="outline">Click me</Button>)
  const button = screen.getByRole('button', { name: /click me/i })
  expect(button).toHaveClass('variant-outline')
})
```

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix UI Primitives](https://www.radix-ui.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
