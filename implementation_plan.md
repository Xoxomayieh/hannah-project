# Implementation Plan: Viewport-Locked Scrollytelling Experience

This plan details the restructuring of the HAULR frontend into a viewport-locked, immersive scrollytelling experience. Instead of standard vertical scrolling sections, the entire website will feature a single, absolute-positioned canvas background video with overlay sections that transition based on scroll position and actions.

## User Review Required

Please review the proposed navigation, scroll behavior, and results page layout.

> [!IMPORTANT]
> **Key Experience Changes:**
> - **Only Background Video:** The website will lock scroll-height to the viewport, making the canvas video the permanent background of the page.
> - **Scroll to Plan Form:** Scrolling down from the Hero section scrubs the video from frame 0 to frame 90 (first half of the sequence) and transitions the text overlay from the Hero welcome to the Dispatch Form. No new pages scroll in vertically.
> - **Submit to Results:** Clicking "Plan My Haul" loads the results. Upon success, the form fades out, the Results Dashboard fades in, and the background video smoothly plays forward from frame 90 to frame 180 (second half of the sequence).
> - **Scroll Up to Edit:** Scrolling up (wheel or swipe) or clicking "Edit Plan" on the Results Dashboard fades out results, fades in the Plan Form, and plays the background video back to frame 90.

## Proposed Changes

### [Frontend Components]

We will modify the core React components to support the viewport-locked state machine and scroll gestures.

#### [MODIFY] [App.tsx](file:///c:/Users/Hp/Desktop/projects/hannah-project/frontend/src/App.tsx)
- Reorganize the app layout into a single viewport-locked container: `h-svh w-screen overflow-hidden relative bg-black`.
- Implement `AppState` state machine: `"hero" | "plan" | "results"`.
- Implement page-level scroll tracking (using scroll heights or a virtual overlay scroll progress wrapper).
- Handle the scroll interpolation:
  - Scroll progress 0.0 to 1.0 (from `scrollTop = 0` to `100vh`) maps to the transition between Hero and Plan.
  - Controls video scrubbing from frame `0` to `90` via scroll trigger or direct canvas frame update.
  - Fades out the Hero overlay and fades in the Plan Form.
- Lock scroll position at `100vh` when in the Plan or Results state so normal document scroll does not bleed.
- Integrate the form submission:
  - Show loading state in-place.
  - Upon successful planning, transition `state` to `"results"`.
  - Trigger a GSAP animation to play the background video from frame `90` to `180`.
  - Fade out the Plan Form and fade in the Results overlay.
- Handle scroll-up and Back gestures in Results view to go back to Plan Form.

#### [MODIFY] [FrameScrubHero.tsx](file:///c:/Users/Hp/Desktop/projects/hannah-project/frontend/src/features/hero/FrameScrubHero.tsx)
- Restructure the canvas wrapper to occupy the absolute background (`absolute inset-0 w-full h-full z-0`).
- Remove standard page pinning and adapt ScrollTrigger to scrub specifically from frame `0` to `90` for the first half of the scroll container.
- Export manual triggers or a callback to animate the second half (frame `90` to `180`) on command.
- Adapt accessibility fallback for prefers-reduced-motion to display static assets.

#### [MODIFY] [ResultsStage.tsx](file:///c:/Users/Hp/Desktop/projects/hannah-project/frontend/src/features/results/ResultsStage.tsx)
- Redesign the Results view as a responsive full-screen dashboard overlay.
- Add an "Edit Plan / Back" button in the dashboard header.
- Add internal scroll areas for the Event Log and ELD Log sheet columns, ensuring page-level scroll gestures are reserved for navigation.
- Implement an `onWheel` and swipe listener to detect scroll-up gestures and trigger the transition back to the Plan state.

## Verification Plan

### Automated Verification
- Verify Vite compilation and TypeScript safety: `npm run build` inside `frontend/`.

### Manual Verification
- Verify scroll down from Hero fades out Hero copy and fades in Dispatch Panel.
- Verify background video scrubs forward with scroll down, and scrubs backward with scroll up.
- Verify clicking "Plan My Haul" performs API request while maintaining Dispatch Panel with loading spinner.
- Verify once loaded, results fade in, and background video plays forward smoothly.
- Verify scroll up or click back from Results returns to Dispatch Panel and reverses background video.
