# Web-Based Video Player with Skip Rules

This is a self-contained video player application that allows you to play videos with customizable skip rules. It runs locally on your computer and requires only a single script execution to start.

## Features

- Local web-based video player using HTML5
- Playlist support with next/previous navigation
- Custom skip rules for each video (defined time ranges to skip)
- Visual markers on the timeline showing skip regions
- Support for both JSON and text playlist formats
- Works entirely offline after initial setup

## How to Use

1. **Run the Application**: Double-click the `start_player.bat` file to launch the application
2. **Upload a Playlist**: Click "Choose Playlist File" and select either:
   - A JSON file with video paths and skip ranges
   - A text file with video paths (one per line)
3. **Control Playback**: Use the player controls to navigate between videos and control playback

## Playlist Formats

### JSON Format
```json
[
  {
    "videoPath": "path/to/video.mp4",
    "skipRanges": [
      [0, 15],      // Skip from 0:00 to 0:15
      [150, 165]    // Skip from 2:30 to 2:45
    ]
  }
]
```

### Text Format
```
path/to/video1.mp4
path/to/video2.mp4
path/to/video3.mp4
```

## Requirements

- Windows 11
- Python (should be pre-installed on most systems)
- Modern web browser (Chrome, Firefox, Edge, etc.)

## Included Files

- `start_player.bat` - Launch script to start the server and open the player
- `player.html` - Main video player interface
- `sample_playlist.json` - Example JSON playlist with skip rules
- `sample_playlist.txt` - Example text playlist
- `README.md` - This file

## How It Works

1. The batch file starts a simple Python HTTP server on port 8000
2. It automatically opens the video player in your default browser at `http://localhost:8000/player.html`
3. The player allows you to upload playlists and defines skip rules
4. During playback, the player automatically skips over the defined time ranges
5. Skip regions are visually indicated on the timeline with red markers

## Troubleshooting

- If the application doesn't start, ensure Python is installed and accessible from the command line
- If videos don't load, make sure the file paths in your playlist are correct
- For local files, use relative paths from the application directory