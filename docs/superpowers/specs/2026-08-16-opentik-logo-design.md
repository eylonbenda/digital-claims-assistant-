# OpenTik Logo — Design Spec (2026-08-16)

## Context

OpenTik (the digital claims assistant) currently has a text-only wordmark on the
landing page (`web/src/app/page.tsx`): "Open" in zinc-900 + "Tik" in blue-600
(#2563eb), bold sans, tight tracking, on stone-50. This spec adds a proper icon
and a full brand asset kit. "Tik" = Hebrew תיק (case/file); the icon carries
that meaning visually so the Latin wordmark stays clean.

## Icon

- Side-view file folder with its flap tilted open (~20°), a white document edge
  peeking out of the opening.
- Flat geometric style, rounded corners consistent with the app's `rounded-xl` UI.
- Colors: folder front blue-600 (#2563eb), folder back panel darker blue
  (~#1d4ed8) for depth, document white with 2–3 light-gray text lines.
- Square canvas (viewBox 0 0 512 512) so it scales 16px → 512px.
- Simplified favicon variant: at 16/32px the document text lines are dropped.

## Lockup

- Horizontal: icon left of wordmark (Latin text, LTR lockup even in RTL contexts).
- Wordmark: "Open" zinc-900 (#18181b), "Tik" blue-600 (#2563eb), bold
  geometric sans (Geist-like), tight tracking. Text converted to outlines in the
  SVG so rendering doesn't depend on installed fonts.

## Deliverables

All brand files under `web/public/brand/`; favicons wired into the Next app.

| Use | Files |
|---|---|
| Master vectors | `icon.svg`, `logo.svg` (lockup), `logo-mono-black.svg`, `logo-mono-white.svg` |
| Favicons | `favicon.ico` (16+32+48 multi-size, replaces `web/src/app/favicon.ico`), `icon-16.png`, `icon-32.png` |
| Apple/PWA | `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png` |
| Email/docs | `logo-email.png` (600w, white bg), `logo-400.png`, `logo-1200.png` (transparent) |
| Social | `og-image.png` (1200×630, logo on stone-50 #fafaf9 with the Hebrew tagline) |
| Print/PDF | `logo-print-bw.svg`, `logo-print-bw.png` (pure black #000 monochrome) |

## Integration

- PNGs are rendered from the SVG masters (single source of truth).
- Wire icons into Next metadata in `web/src/app/layout.tsx`: `icons.icon`
  (16/32/ico), `icons.apple` (180), and `openGraph.images` (og-image) on the
  landing page metadata.
- Replace the header text-only wordmark on the landing page with the lockup
  (icon + text) — optional, only if it drops in cleanly; not required for this
  spec's completion.

## Out of scope

- Hebrew-script wordmark variants.
- Animated logo, dark-mode-specific color variants (mono-white covers dark
  backgrounds).
- Rebranding in-app dashboard chrome beyond favicon/metadata.

## Success criteria

- Favicon legible and recognizable at 16px.
- All files listed above exist, PNGs pixel-match their SVG source.
- `npm run build` (web) passes with metadata changes; favicon served on `/`.
