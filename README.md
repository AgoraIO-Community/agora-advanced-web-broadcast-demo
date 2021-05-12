# agora-advanced-web-viewer
A demo project using the Agora Web SDK, leveraging advance features like dual stream with stream fallback, multi-host broadcasting.

## Usage
Upload the proejct to a remote server or run locally. This project works across all of the latest browsers that support WebRTC, and runs on both mobile and desktop. For best results use Chromium based browser on desktop, and native browser on mobile. 

### Host/Streamer
```
broadcast.thml
```
Input AppId, temporary token, Channel name, and UID to join stream as broadcaster. Use unique UID's for each broadcast user to avoid issues.


### Audience
```
index.thml
```
Input AppId, temporary token, and Channel name to join stream as audience.