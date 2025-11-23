# TrackTheLeader

[Live Demo](https://track-the-leader.benhalverson.workers.dev)

Track-The-Leader is a motorsport broadcast-style HUD application built with Angular 20. It allows users to analyze race footage with overlay controls and leaderboards.

Currently in active development, the application features:
- **Local Video Playback**: Drag and drop `.mp4` or `.mov` files to play them locally without uploading.
- **Broadcast HUD**: A dedicated sidebar for leaderboards and tracking controls.
- **Overlay System**: A canvas overlay aligned with the video for computer vision visualizations.
- **Track Line Mapping**: Interactive track definition with polyline drawing and start/finish selection.
- **Camera Stabilization**: Homography-based motion compensation using OpenCV.js for track line stabilization.
- **RC Car Segmentation**: Interactive car marking using SAM3 (Segment Anything Model 3) with motion-based proposals (Milestone 3 - In Progress).

## Setup

### Prerequisites
- Node.js 18+ and pnpm

### Installation

```bash
pnpm install
```

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Usage

### 1. Load Video
Drag and drop an `.mp4` or `.mov` file onto the application.

### 2. Define Track Line (Milestone 2)
1. Click **"Select Track Line"** button
2. Click along the track centerline in the direction of racing (minimum 5 points)
3. Click **"Finish"** when done
4. Click on the track to select the start/finish point
5. Click **"Confirm Start/Finish"**

### 3. Enable Stabilization (Milestone 2.5)
Toggle **"Stabilized Track Line"** to see the track line compensate for camera movement using homography transformations.

### 4. Mark RC Cars (Milestone 3 - In Progress)
After defining the track line:
1. Click **"Mark Cars"** button to enter car marking mode
2. Video pauses and shows motion-based proposal boxes
3. Click on proposals to select which ones are RC cars
4. Click **"Confirm Cars"** to run SAM3 segmentation
5. System generates pixel-accurate masks and centroids for each car

**Features:**
- Motion-based proposal generation using frame differencing
- Interactive car selection
- SAM3 (Segment Anything Model 3) segmentation with WebGPU
- Pixel-accurate masks and center points
- Car seeds stored for future tracking milestones

## Features by Milestone

### Milestone 1: UI Foundation
- Angular 20 standalone components
- Drag-and-drop video loading
- Broadcast-style HUD sidebar
- Canvas overlay system

### Milestone 2: Track Line Mapping
- Interactive polyline drawing on video frame
- Start/finish point selection
- Undo/reset functionality
- Track line persistence during playback

### Milestone 2.5: Camera Stabilization
- OpenCV.js integration for feature detection
- ORB keypoint extraction and matching
- Homography computation with RANSAC
- Track line transformation to maintain alignment

### Milestone 3: RC Car Segmentation (In Progress)
- SAM3 model integration with WebGPU
- Motion-based proposal generation (frame differencing)
- Interactive "Mark Cars" UI flow
- Pixel-accurate segmentation masks
- Car seed initialization for tracking
- Hybrid proposal approach (automatic + user confirmation)

## Architecture

### Services
- **HomographyService**: Camera motion stabilization using OpenCV.js
- **Sam3SegmentationService**: Interactive segmentation using SAM3 (In Progress)
- **ProposalGeneratorService**: Motion-based car detection proposals (In Progress)

### Components
- **RaceViewer**: Main video player with overlay canvas and sidebar controls

### Technologies
- Angular 20 with standalone components and signals
- OpenCV.js (WASM) for computer vision
- SAM3 with WebGPU for segmentation
- Cloudflare Pages for deployment

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
