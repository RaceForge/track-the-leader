# Milestone 2 — Track Line Definition (Angular 20)
track-the-leader

## Objective
Enable the user to interactively define the track centerline in a paused video frame using left-clicks only. The user will also explicitly select the start/finish point. No labels on points. Track mapping must unlock “Start Tracking” control in sidebar once confirmed.

This milestone builds the geometric base needed for world-space tracking and real race position logic.

---

## Requirements

### UI Interaction
- User clicks **Select Track Line** → automatically pause the video
- Cursor changes to indicate mapping mode
- Every left-click adds a point to the polyline
- Render a continuous polyline between points
- **No point number labels**, clean broadcast UI
- Provide the following controls while mapping:
  - Undo (remove last point)
  - Reset (clear all points)
  - Confirm Track (only enabled once > 4 points exist)

### Start/Finish Selection
- After polyline is complete:
  - Prompt user: **“Click Start/Finish line on the track”**
- User chooses an **existing** polyline point OR
  - Snaps to nearest point on polyline
- Store `startIndex` to define race direction + lap boundary

### State Rules
- Normal Mode → Mapping Mode (video paused)
- Mapping Mode → Start/Finish Mode
- On Confirm → Track Locked Mode
  - Sidebar: “Start Tracking” button enabled
  - Mapping tools disabled

### Data Structures
Polyline stored in component state:

```ts
type Point2D = { x: number; y: number };
let trackLine: Point2D[] = [];
let startIndex: number | null = null;

Track coordinates use video pixel coordinate system.

Visual Rendering

Polyline drawn on overlay canvas

Style:

Stroke: solid green or cyan

Medium thickness

Slight glow optional (later)

Deliverables

Fully functional mapping UI flow

Overlay polyline rendering during and after mapping

Start/Finish click selection

“Start Tracking” enabled only when track is locked

UX polished enough for human testing

Definition of Done

All must pass:

User can mark track with 8+ clicks in < 20 seconds

Polyline visibly overlays and stays aligned during playback

Video resumes normal behavior once mapping finishes

Restarting track mapping resets Start Tracking state

No console errors or UI lockups
