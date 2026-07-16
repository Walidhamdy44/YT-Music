# YTMusic Web — Design System

Extracted from Stitch Project ID: `1990584961839864874`

## Color Palette (Material Design 3 — Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#131315` | Page/app background |
| `surface` | `#131315` | Base surface |
| `surface-dim` | `#131315` | Dimmed surface |
| `surface-bright` | `#39393b` | Bright surface |
| `surface-container-lowest` | `#0e0e10` | Deepest container |
| `surface-container-low` | `#1c1b1d` | Sidebar background |
| `surface-container` | `#201f22` | Cards, inputs, search bar |
| `surface-container-high` | `#2a2a2c` | Hover states, mini-player bg |
| `surface-container-highest` | `#353437` | Active states, elevated elements |
| `on-surface` | `#e5e1e4` | Primary text |
| `on-surface-variant` | `#e4beba` | Secondary text (warm-tinted) |
| `on-background` | `#e5e1e4` | Body text on background |
| `primary` | `#ffb3ac` | Accent color (warm peach-red) |
| `on-primary` | `#680008` | Text on primary |
| `primary-container` | `#d32f2f` | Active nav indicator, play button emphasis |
| `on-primary-container` | `#fff2f0` | Text on primary container |
| `secondary` | `#c8c6c9` | Secondary text/borders |
| `tertiary` | `#7bd1f8` | Accent blue (gradient, highlights) |
| `outline` | `#ab8985` | Borders, dividers |
| `outline-variant` | `#5b403d` | Subtle borders (at 10-30% opacity) |
| `error` | `#ffb4ab` | Error text |

## Typography

**Font Family:** Inter (all weights)

| Style | Size | Line Height | Weight | Letter Spacing | Usage |
|-------|------|-------------|--------|----------------|-------|
| `display-lg` | 48px | 56px | 800 | -0.04em | Desktop page headings |
| `display-lg-mobile` | 32px | 40px | 800 | -0.02em | Mobile page headings |
| `headline-md` | 24px | 32px | 700 | -0.02em | Section titles |
| `body-lg` | 16px | 24px | 400 | 0 | Body text, track titles |
| `body-sm` | 14px | 20px | 400 | 0 | Subtitles, metadata |
| `label-caps` | 12px | 16px | 600 | 0.05em | Labels, chips (uppercase) |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `mobile-margin` | 1rem (16px) | Mobile horizontal padding |
| `container-margin` | 2rem (32px) | Desktop horizontal padding |
| `card-gap` | 1.5rem (24px) | Grid gaps |
| `gutter` | 1.5rem (24px) | Column gaps |
| `section-stack` | 3rem (48px) | Vertical section spacing |

## Border Radius

| Token | Value |
|-------|-------|
| `DEFAULT` | 0.25rem (4px) |
| `lg` | 0.5rem (8px) |
| `xl` | 0.75rem (12px) |
| `full` | 9999px (pills, circles) |

## Shadows & Elevation

- Cards on hover: `0 16px 32px -8px rgba(0,0,0,0.6)`
- Top result card hover: `0 32px 64px -12px rgba(0,0,0,0.5)`
- Play button glow: `0 0 16px -4px rgba(255,179,172,0.4)`
- Mini-player progress handle: `0 0 8px rgba(255,179,172,0.8)`

## Screen Inventory

| Screen ID | Title | Maps to |
|-----------|-------|---------|
| `e5097c4ae601...` | Library - YouTube Music | Library page |
| `14bd35dfdc...` | YouTube Music - Home | Home page (desktop) |
| `951d82f580...` | Library - YouTube Music | Library (alternate view) |
| `8636a6bf72...` | Home - Mobile | Home page (mobile) |
| `75961c9cab...` | Playlist Detail | Playlist detail page |
| `b6aa01e812...` | Playlist / Album Detail | Album detail page |
| `be9d0322a7...` | Search - YouTube Music | Search results page |
| `6fdd605938...` | YouTube Music - Search | Search (empty/initial) |

## Key Design Patterns

1. **Sidebar:** Fixed 240px, `surface-container-low` bg, active item has `border-l-2 border-primary-container` + `bg-surface-container-highest`
2. **Mini Player:** Fixed bottom, `surface-container-high/90` with `backdrop-blur-xl`, thin progress bar at top
3. **Cards:** `aspect-square rounded-xl` with gradient overlay (`from-background/90 via-background/20 to-transparent`), play FAB appears on hover
4. **Track Rows:** `p-3 rounded-lg`, thumbnail 48x48 with play overlay on hover, more button opacity-0 → opacity-100
5. **Filter Chips:** `rounded-full`, active = `bg-on-surface text-surface`, inactive = `bg-surface-container-high border-outline-variant/10`
6. **Gradient Text:** `linear-gradient(135deg, primary, tertiary)` with background-clip
