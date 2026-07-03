# Design System

## Color Palette

### Strategy

**Restrained** — warm-tinted neutrals carry the surface; one warm accent under 10% of total area. The palette is built on OKLCH for perceptual consistency.

### Core Tokens

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--bg-primary` | `oklch(0.985 0.005 70)` | `oklch(0.145 0.01 70)` | Page background |
| `--bg-secondary` | `oklch(0.965 0.008 70)` | `oklch(0.185 0.012 70)` | Card / surface background |
| `--bg-elevated` | `oklch(1 0 0)` | `oklch(0.22 0.01 70)` | Popover / dropdown |
| `--text-primary` | `oklch(0.2 0.01 70)` | `oklch(0.92 0.008 70)` | Headings, primary text |
| `--text-secondary` | `oklch(0.45 0.01 70)` | `oklch(0.6 0.01 70)` | Descriptions, hints |
| `--text-tertiary` | `oklch(0.62 0.008 70)` | `oklch(0.45 0.01 70)` | Placeholders, disabled |
| `--accent` | `oklch(0.65 0.18 25)` | `oklch(0.72 0.16 25)` | Primary action, links, focus |
| `--accent-soft` | `oklch(0.65 0.18 25 / 0.1)` | `oklch(0.72 0.16 25 / 0.15)` | Hover states, subtle highlights |
| `--border` | `oklch(0.9 0.008 70)` | `oklch(0.28 0.01 70)` | Default borders |
| `--border-hover` | `oklch(0.82 0.01 70)` | `oklch(0.35 0.01 70)` | Hover borders |
| `--danger` | `oklch(0.6 0.2 25)` | `oklch(0.68 0.18 25)` | Destructive actions |
| `--success` | `oklch(0.6 0.15 145)` | `oklch(0.7 0.14 145)` | Success states |

### Accent Color

The primary accent is a **warm terracotta/coral** (`oklch(0.65 0.18 25)`), roughly `#c4603a` in sRGB. This carries the brand warmth without screaming. It appears only on interactive elements: buttons, links, focus rings, active states. Never used as a background fill for large areas.

### Gradient

One gradient, used sparingly — the top bar and primary CTA button:

```
linear-gradient(135deg, var(--accent), oklch(0.65 0.14 40))
```

This is a subtle warm shift (terracotta → amber), not a multi-color rainbow. The gradient should never span more than ~300px of visual width.

### Semantic Colors

- **Danger**: warm red, not neon. Used for delete buttons and error states.
- **Success**: muted green, not electric. Used for confirmations and mount status.
- **Info**: the accent color at 10% opacity. Used for tips and help callouts.

## Typography

### Font Stack

```
Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

Inter is the primary face. No secondary display font — the product is too small for a type pairing to earn its weight.

### Scale

| Role | Size | Weight | Letter-spacing | Line-height |
|------|------|--------|----------------|-------------|
| Page title | 18px | 700 | -0.01em | 1.3 |
| Section label | 14px | 600 | 0 | 1.4 |
| Body | 13px | 500 | 0 | 1.5 |
| Caption / hint | 12px | 400 | 0.01em | 1.5 |
| Code / mono | 12px | 500 | 0.02em | 1.4 |

Mono stack for code and paths: `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace`

### Principles

- Body text at 13px, not 14px — this is a compact desktop tool, not a reading app.
- Weight 500 as the default, not 400. The warm palette needs slightly heavier strokes to maintain contrast.
- Negative letter-spacing on headings only (−0.01em). Body and captions stay at 0 or slightly positive.

## Spacing

A 4px base unit with a linear scale:

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 12px |
| `--space-lg` | 16px |
| `--space-xl` | 24px |
| `--space-2xl` | 32px |

Content pages use 24px padding. Cards use 16–20px padding. Gaps between cards: 12–16px.

## Border Radius

| Element | Radius |
|---------|--------|
| Buttons | 8px |
| Cards / panels | 12px |
| Input fields | 8px |
| Tags / badges | 6px |
| Notification toast | 20px (pill) |
| Window | 12px |

The notification pill (20px) is the only exaggerated radius. Everything else stays between 6–12px for a grounded feel.

## Shadows

Warm-tinted shadows, not neutral gray:

```css
--shadow-sm: 0 1px 3px oklch(0.5 0.01 70 / 0.06);
--shadow-md: 0 4px 12px oklch(0.5 0.01 70 / 0.08);
--shadow-lg: 0 8px 24px oklch(0.5 0.01 70 / 0.12);
```

Dark mode doubles the opacity. No colored shadows (no blue or pink glow).

## Motion

### Timing

| Token | Value | Use |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | All entrances |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | All exits |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Notification pop-in only |

### Duration

- Micro (hover, focus): 150ms
- Standard (page transition, card reveal): 250ms
- Large (window show/hide): 350ms

### Principles

- Entrance: scale(0.96) → scale(1) + opacity fade. Not scale(0.2) — that's too dramatic for a utility tool.
- Exit: opacity fade only, no scale. The element just disappears.
- Page transitions: vertical slide + fade (8px offset), 200ms.
- Reduced motion: all transforms and transitions disabled, instant show/hide.

## Components

### Buttons

Three variants, consistent across the app:

- **Primary**: accent background, white text, warm shadow on hover. Scale(0.97) on press.
- **Secondary**: bg-secondary background, text-secondary border. Hover darkens slightly.
- **Ghost**: transparent, text-secondary. Hover shows bg-secondary.

All buttons: 36px height, 8px radius, 13px/500 font. Pill variant (20px radius) for notification actions only.

### Cards

Flat surfaces with 1px border, no shadow by default. Hover adds a subtle border color shift. No gradient backgrounds on cards — that's the notification territory.

### Input Fields

38px height, 8px radius, 1px border. Focus: accent border + 3px ring at 10% opacity. Placeholder text at text-tertiary.

### Toggle Switch

44×24px, pill shape. Off: border-color background. On: accent gradient (subtle warm shift). Knob: white circle with 1px shadow.

### Navigation (Sidebar)

Width: 140px expanded, 60px collapsed. Items: 13px/500, 8px radius. Active state: accent-soft background + accent text color. No icons-only mode for collapsed state — always show emoji + label, or always hide label.

### Notification Toast

Pill shape (20px radius), 48px height. Animated gradient border (conic-gradient rotating). White card inside. Text at 14px/500. Action buttons: 28px circles.

### Search Box

Centered overlay, 560px max width. Clean input with bottom border accent on focus. Results list with 10px radius items. Active item: accent-soft background.

## Layout

- Window: 800×600 default, 600×450 minimum
- Sidebar + content area layout
- Content pages: scrollable, 24px padding
- Settings cards: stacked vertically, 16px gap
- No full-bleed layouts — everything sits within the window frame

## Dark Mode

Dark mode is not a simple inversion. Surfaces get warmer (hue 70, not neutral gray), and the accent color lightens slightly for contrast. Borders become semi-transparent white at low opacity. Shadows increase opacity but stay warm-tinted.

The dark background should feel like a warm charcoal, not a cold void.
