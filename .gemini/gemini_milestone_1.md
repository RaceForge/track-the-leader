# Milestone 1 — Angular UI Shell (Track-The-Leader)

This document provides instructions for Gemini to deliver Milestone 1 of the Track-The-Leader application: building the base UI structure in Angular 20 with support for drag-and-drop local video playback and a motorsport broadcast-style HUD. No visual tracking, detection, or leader logic is included in this milestone.

---

## 🎯 Objective

Create the user interface foundation:

- Standalone Angular component for video playback
- Right-side fixed-width sidebar for broadcast HUD and controls
- Drag-and-drop local video loader
- Overlay canvas aligned with video frame

This milestone sets the stage for computer vision features in future milestones.

---

## 🧱 Implementation Details

### Component Structure

Create a `race-viewer` feature:

src/app/race-viewer/
race-viewer.component.ts
race-viewer.component.html
race-viewer.component.scss

csharp
Copy code

Register the component under a route such as:

/viewer

yaml
Copy code

This component will become the main UI for the app.

---

### UI Layout

Use a flex layout:

+-----------------------------------------------------+-------------+
| | |
| Video + Overlay Canvas | Sidebar |
| | |
+-----------------------------------------------------+-------------+

yaml
Copy code

Sizing:
- 75% width — Video area
- 25% width — Sidebar

The sidebar must never cover the video.

---

### Sidebar Requirements

Include:

- Header: **Leaderboard**
  - Blank placeholder list (no logic yet)
- Section: **Controls**
  - Disabled button: “Select Track Line”
  - Disabled button: “Start Tracking”
  - Disabled checkboxes (no behavior yet):
    - Boxes
    - IDs
    - Track Line

Sidebar visual style:
- Dark translucent panels
- White text (motorsport telemetry aesthetic)

---

### Video + Overlay

- `<video>` element to show the local file
- `<canvas>` overlay absolutely positioned on top of video
- Canvas must always match the video’s rendered dimensions
- Maintain proper alignment on browser resize

---

### Drag-and-Drop UX

- Initial state shows a visible dropzone
- Highlight dropzone while dragging files over
- Accept only `.mp4` and `.mov`
- On drop:
  - Hide dropzone
  - Display the full UI (video + sidebar)
  - Load the file directly using `URL.createObjectURL()`
  - Auto-play the video

No uploads — video stays fully local.

---

## 🔒 Constraints

- Angular 20 standalone components only
- No backend
- No tracking or model inference yet
- WebGPU not needed in this milestone
- Buttons/toggles must be visible but disabled

---

## ✔️ Acceptance Criteria

- User can drag and drop a local video
- Video plays inside the Angular application
- Overlay canvas is visually aligned with the video
- Sidebar is correctly sized and positioned
- Controls visible in sidebar, disabled
- Works in dev server (`npm run dev`)
- Works in Cloudflare Pages static deployment

---

## 🔍 Verification Checklist

- Try different local video files → all must work
- Resize browser window:
  - Video scales ✔️
  - Overlay canvas stays aligned ✔️
  - Sidebar remains fixed position ✔️
- No console errors
- UI visually matches motorsport broadcast style baseline

---

## 🧩 Deliverable

A working Angular UI that matches all items above and is ready for Milestone 2: Track Line Definition.

---

_End of Milestone 1 Document_
