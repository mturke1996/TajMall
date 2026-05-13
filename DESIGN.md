# Fluxen Design System

## Color Strategy: Sage & Sand (Restrained Premium)

### Primary Palette
- **Sage 50**: `#f6f7f6` - Background canvas
- **Sage 100**: `#e3e7e3` - Hover states
- **Sage 200**: `#c7d0c7` - Borders subtle
- **Sage 600**: `#5a6b5a` - Primary text
- **Sage 700**: `#4a5d4a` - Primary actions
- **Sage 800**: `#3e4d3e` - Emphasis
- **Sage 900**: `#2f3b2f` - Headings

### Semantic Colors
- **Success**: `#4a7c59` - Revenue, positive
- **Danger**: `#9b4b4b` - Expenses, negative
- **Warning**: `#b8860b` - Alerts, pending
- **Info**: `#4b6b9b` - Neutral info

### Pastel Accents (for cards/status)
- **Pastel Green**: `#e8f5e9` / Ink: `#2e7d32`
- **Pastel Red**: `#ffebee` / Ink: `#c62828`
- **Pastel Blue**: `#e3f2fd` / Ink: `#1565c0`
- **Pastel Yellow**: `#fffde7` / Ink: `#f57f17`

### Neutral Scale
- **Canvas**: `#fafbf9` - Main background
- **Canvas Sunken**: `#f5f6f4` - Card backgrounds
- **Card**: `#ffffff` - Elevated surfaces
- **Ink**: `#1a1c19` - Primary text
- **Ink Mute**: `#6b6f69` - Secondary text
- **Border**: `#d9ddd8` - Subtle borders

## Typography

### Font Stack
- **Arabic**: `IBM Plex Sans Arabic`, system-ui
- **English**: `Inter`, system-ui
- **Mono**: `JetBrains Mono`, monospace

### Scale
- **Hero**: 2.5rem (40px) - Dashboard big numbers
- **H1**: 1.75rem (28px) - Page titles
- **H2**: 1.375rem (22px) - Section headers
- **H3**: 1.125rem (18px) - Card titles
- **Body**: 1rem (16px) - Main text
- **Small**: 0.875rem (14px) - Labels
- **Tiny**: 0.75rem (12px) - Metadata

## Spacing System

### Section Spacing
- **Small**: 1rem (16px)
- **Medium**: 1.5rem (24px)
- **Large**: 2rem (32px)
- **XLarge**: 3rem (48px)

### Component Spacing
- **Tight**: 0.5rem (8px)
- **Default**: 1rem (16px)
- **Loose**: 1.5rem (24px)

## Elevation

### Shadows
- **Level 0**: none - Flat elements
- **Level 1**: `0 1px 2px rgba(0,0,0,0.05)` - Cards
- **Level 2**: `0 4px 8px rgba(0,0,0,0.08)` - Dropdowns
- **Level 3**: `0 8px 16px rgba(0,0,0,0.12)` - Modals

### Border Radius
- **Small**: 0.375rem (6px) - Buttons, inputs
- **Medium**: 0.5rem (8px) - Cards
- **Large**: 0.75rem (12px) - Dialogs
- **XL**: 1rem (16px) - Large cards
- **Full**: 9999px - Pills, avatars

## Components

### Buttons
- **Primary**: Sage-700 bg, white text, rounded-md
- **Secondary**: White bg, sage-700 border, sage-700 text
- **Ghost**: Transparent, hover sage-100
- **Danger**: Red-600 bg, white text

### Cards
- Background: white
- Border: 1px solid border-color
- Radius: medium
- Shadow: level-1
- Padding: default (16px)

### Forms
- Input height: 2.5rem (40px)
- Border radius: small
- Focus ring: 2px sage-500

## Motion

### Durations
- **Fast**: 100ms - Hover states
- **Normal**: 200ms - Transitions
- **Slow**: 300ms - Page transitions

### Easing
- **Default**: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Enter**: `cubic-bezier(0, 0, 0.2, 1)`
- **Exit**: `cubic-bezier(0.4, 0, 1, 1)`

## Layout Principles

### Mobile First
- Single column by default
- Breakpoints: sm(640), md(768), lg(1024), xl(1280)
- Safe area insets for mobile

### Grid System
- 12-column grid
- Gutter: 24px
- Max width: 1400px
- Padding: 16px mobile, 24px tablet, 32px desktop

## RTL Considerations
- All icons must support mirroring
- Text alignment: right by default
- Flex direction: row-reverse where needed
- Navigation: right-aligned
