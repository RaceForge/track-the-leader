# Milestone 1 — UI Foundation (Angular 20)  
track-the-leader

## Objective
Implement the UI base for the RC race playback tool. This includes local video drag-and-drop loading, fixed right-side broadcast-style sidebar, and pixel-perfect overlay canvas aligned with the video. No tracking or AI yet.

---

## Requirements

### Video Player + Overlay
- Create a Race Viewer component (Angular 20 standalone)
- Support drag-and-drop of local video files: .mp4, .mov
- Use `URL.createObjectURL()` to load the video
- Add a canvas overlay that always matches the displayed video resolution
- Ensure video maintains aspect ratio on window resize

### Layout & Design
- Fixed sidebar on **right side**, video on **left**
- Sidebar width: ~25% of viewport; Video ~75%
- Motorsports broadcast inspiration:
  - Dark background
  - Clean white text
  - Green leader highlight (future)
  - No overlay elements from sidebar covering video

### Controls (UI only)
- Sidebar must include disabled button placeholders:
  - “Select Track Line”
  - “Start Tracking”
- Toggle placeholders (no functionality yet):
  - `[ ] Boxes`
  - `[ ] IDs`
  - `[ ] Track Line`
- All buttons/toggles disabled until future milestones

### Drag + Drop UX
- Highlight drop area when dragging files over app
- Swap to playback UI once video loads
- Provide visible error if file type not supported

---

## Deliverables
- Working Angular component with above UI
- Layout responsive to browser resizing
- Video playback with no overlays initially beyond empty aligned canvas
- Sidebar UI shell styled with placeholder leaderboard section
- No backend, no AI, no model logic yet

---

## Definition of Done
- Drag in a video → it plays in the viewer with overlay canvas aligned
- Sidebar visible and correctly sized
- Controls present but disabled
- Everything built in Angular 20 using standalone components
