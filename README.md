# Whiteboard

A standalone, Miro-style infinite whiteboard. It runs in the browser and as a macOS desktop app
(Electron). Boards are saved locally in IndexedDB; nothing leaves the machine.

## Run

```bash
npm install
npm run dev          # browser at http://localhost:5173
npm run app:build    # builds release/mac-arm64/Whiteboard.app (ad-hoc signed)
npm run app:open     # opens the installed app in /Applications
npm run verify       # tsc, oxlint, prettier, vitest, vite build
```

The app is installed at `/Applications/Whiteboard.app`. After changing the code, run
`npm run app:build` and replace the installed app with `release/mac-arm64/Whiteboard.app`.
`npm run app:dev` opens the Electron shell against a running `npm run dev` server.

## Features

- Infinite dot-grid canvas: pan with trackpad scroll, Space+drag, middle mouse, or the Hand tool.
  Zoom with pinch, Cmd+scroll, the zoom controls, Cmd+0, Shift+1 (fit), Shift+2 (selection).
- Sticky notes (auto-fitting text), text, shapes, connectors (straight, elbow, curved, with
  arrowheads), pen, highlighter, eraser, frames, and images (upload, drag and drop, paste).
- Hover a sticky, shape, or text box and click a blue dot to add a matching copy on that side,
  linked by an arrow. The camera glides to the copy and you can type into it right away; click
  the same dot again and the next copy fans out beside the first. Hovering a dot previews where
  the copy lands. Or drag the dot to draw the connection yourself: drop it on another item to
  attach it, or on empty canvas to create the copy at that spot. Images get a plain arrow.
- Connectors that end up facing away from each other after a move switch to the facing sides,
  and elbow and curved lines route around the items they connect.
- Select, Shift+click, marquee, move, resize, Alt+drag to duplicate, group, lock, layer order,
  and a floating toolbar for colors, text, and line styles.
- Undo and redo for every change, copy/cut/paste, a minimap, and board templates (Kanban,
  Retrospective, Brainstorm).
- Dashboard with thumbnails, search, rename, duplicate, delete, and JSON export and import.

## Shortcuts

Tool keys are editable: click the keyboard button in the top bar, pick a tool, press a key.
The defaults:

| Key                   | Action                                                           |
| --------------------- | ---------------------------------------------------------------- |
| V H N T S L P E F     | Select, Hand, Sticky, Text, Shape, Connector, Pen, Eraser, Frame |
| R / O                 | Rectangle / ellipse                                              |
| Cmd+Z / Shift+Cmd+Z   | Undo / redo                                                      |
| Cmd+C / Cmd+X / Cmd+V | Copy / cut / paste                                               |
| Cmd+D                 | Duplicate                                                        |
| Cmd+G / Shift+Cmd+G   | Group / ungroup                                                  |
| Cmd+] / Cmd+[         | Bring to front / send to back                                    |
| Shift+Cmd+L           | Lock / unlock                                                    |
| Enter                 | Edit the selected item's text                                    |
| Arrows (+Shift)       | Nudge by 1 (10)                                                  |
| Delete / Backspace    | Delete                                                           |

## Notes

- The desktop app stores boards in `~/Library/Application Support/Whiteboard`. The browser
  version stores them per origin, so the two do not share boards. Use JSON export and import to
  move a board between them.
- The app is ad-hoc signed for this Mac. Sharing it with other Macs needs a Developer ID
  signature and notarization.
- Single-user and local by design: there is no real-time collaboration.
