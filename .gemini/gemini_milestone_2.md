
---

## 📌 `GEMINI_MILESTONE_2.md`

```md
# Milestone 2 — Interactive Track Mapping

Purpose: Implement interactive track-line definition in the Track-The-Leader Angular application.

The feature enables race-accurate geometry for ranking real leader position later.

---

## Feature Summary

User workflow:
1️⃣ Play video → pause on good view  
2️⃣ Click **Select Track Line**  
3️⃣ Left-click along track in direction of racing  
4️⃣ Click **Finish** → pause again  
5️⃣ Choose **Start/Finish** point  
6️⃣ Confirm Track → unlock “Start Tracking”

UI rules:
- Keep interface clean — **no track point labels**
- Sidebar buttons reflect correct enabled/disabled logic

---

## Implementation Guidance

### Component Integration
- Add logic to existing Race Viewer Component
- Maintain:
videoElement
overlayCanvas
trackLine[] (Point2D[])
startIndex: number | null
mappingMode: boolean
startFinishMode: boolean

- Use Angular Signals or component state for UI updates

---

### Rendering Rules
- Clear and redraw polyline every frame during mapping
- Render polyline on overlay canvas only
- Polyline color: high-visibility (cyan or green)
- Maintain alignment on window resize

---

### Sidebar Interaction States

| Button | Idle | Mapping Mode | Start/Finish Mode | Track Locked |
|---|---:|---:|---:|---:|
| Select Track Line | enabled | disabled | disabled | enabled |
| Undo | hidden | enabled | disabled | hidden |
| Reset | hidden | enabled | disabled | hidden |
| Confirm Track | hidden | disabled | enabled if >4 points | hidden |
| Start Tracking | disabled | disabled | disabled | enabled |

---

## Validation + Tests

**Must Be True:**
- Polyline follows click sequence exactly
- Confirm only works if polyline length > threshold
- Start/Finish selection is from existing polyline points
- Track persists visually during playback post-confirm
- No bounding boxes, IDs, or detection yet

Manual testing checklist:
✔ Try undo, reset flows  
✔ Try mapping in different paused frames  
✔ Try resizing window while track displayed  
✔ Confirm correct state transitions

---

## Deliverable

Track mapping interaction fully implemented and visually correct in the browser:
- Live on Cloudflare Pages and local dev server
- Ready for camera motion stabilization milestone next

_End of Document_
